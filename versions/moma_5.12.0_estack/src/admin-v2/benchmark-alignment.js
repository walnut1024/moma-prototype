import { resourceId } from '../resource-id.mjs';
import { deploymentCanServe, deploymentInstances } from './deployments.js';
import { gzipSync, strToU8 } from 'fflate';

export const BENCHMARK_PAGE_ID = 'ops-benchmarks';
export const MAX_BENCHMARK_STAGES = 500;
export const BENCHMARK_TARGETS = ['模型实例', '路由'];
export const BENCHMARK_LOAD_TYPES = ['固定请求速率', '并发数'];
export const BENCHMARK_LOAD_PATTERNS = ['单次', '手工分阶段', '自动调优'];
export const BENCHMARK_SEED_MAX = 2147483647;
const benchmarkNamePattern = /^[A-Za-z0-9](?:[A-Za-z0-9._-]{0,61}[A-Za-z0-9])?$/;
const adaptiveBudget = { minLoad: 4, maxLoad: 8192, maxPoints: 18, maxTotalSeconds: 5400 };
export const BENCHMARK_PROFILES = {
  '最大吞吐量': { ...adaptiveBudget, maxPoints: 15, maxTotalSeconds: 3600, dataset: 'Random', inputTokens: 1024, outputTokens: 128,
    loadType: '固定请求速率', loadPattern: '自动调优', incrementSeed: true },
  '满足延迟 SLO': { ...adaptiveBudget, dataset: 'Random', inputTokens: 128, outputTokens: 128,
    loadType: '并发数', loadPattern: '自动调优', incrementSeed: true, sloTargets: { avgTtft: 500, avgTpot: 50 } },
  '自定义': { ...adaptiveBudget, dataset: 'Random', inputTokens: 1024, outputTokens: 128, loadType: '固定请求速率', loadPattern: '自动调优' },
};
export const BENCHMARK_SLO = [
  ['avgTtft', '平均 TTFT'], ['p95Ttft', 'P95 TTFT'], ['p99Ttft', 'P99 TTFT'],
  ['avgTpot', '平均 TPOT'], ['p95Tpot', 'P95 TPOT'], ['p99Tpot', 'P99 TPOT'],
  ['avgLatency', '平均端到端时延'], ['p95Latency', 'P95 端到端时延'], ['p99Latency', 'P99 端到端时延'],
];

const field = (key, label, options) => ({ key, label, ...options });
const numberLabel = (value, units) => value == null || value === '' ? undefined : `${value} ${units}`;
const text = value => typeof value === 'string' ? value.trim() : '';
const set = value => value != null && value !== '';
const number = value => set(value) ? Number(value) : null;
const officialProfile = profile => ({ 吞吐量: '最大吞吐量', '延迟 SLO': '满足延迟 SLO' }[profile] || profile);
const asPercent = value => set(value) && Number(value) <= 1 ? Math.round(Number(value) * 10000) / 100 : value;
const isReadyDeployment = row => row.status === '运行中' && row.readyReplicas > 0 && !row.retiredAt;
const isCount = value => Number.isSafeInteger(value) && value >= 0;
const failedRequests = point => [point.failures, point.request_errored].find(isCount);
const incompleteRequests = point => [point.incomplete, point.request_incomplete].find(isCount);

export function benchmarkDeploymentPreset(deployment, instance) {
  const preset = new URLSearchParams({
    view: 'create', clusterId: deployment.clusterId, targetId: deployment.id, targetMode: '模型实例',
  });
  if (instance && !deployment.roles) preset.set('targetSelection', instance.id);
  return preset;
}

function supportsBenchmarkModel(row, records) {
  const model = records.deployableModels?.find(item => item.id === row.modelId);
  const categories = model?.categories || model?.capabilities?.categories;
  if (Array.isArray(categories) && categories.length) return ['llm', '语言模型', '大语言模型'].includes(categories[0]);
  return !model?.type || ['text', 'llm'].includes(model.type);
}

export function benchmarkInstanceTree(records, clusterId) {
  const deployments = (records.deployments || []).filter(row => row.clusterId === clusterId && row.replicas > 0 && !row.retiredAt);
  return deployments.map(row => {
    const available = supportsBenchmarkModel(row, records);
    const ready = isReadyDeployment(row);
    const instances = available ? deploymentInstances([row], records) : [];
    if (row.roles && available) {
      const servable = deploymentCanServe(row) && instances.some(instance => instance.role === 'router' && instance.state === 'running');
      return { value: row.id, label: row.name, deployment: row, target: servable ? row.id : undefined, disabled: !servable,
        reason: servable ? 'PD' : '路由实例未就绪' };
    }
    return {
      value: row.id, label: row.name, deployment: row, disabled: !available || !instances.length,
      reason: !available ? '仅支持语言模型' : !instances.length ? row.status : '',
      children: instances.map(instance => ({
        value: instance.id, label: instance.name, disabled: !ready || instance.state !== 'running',
        reason: { starting: '启动中', pending: '未就绪', error: '失败' }[instance.state] || (!ready && row.status),
      })),
    };
  });
}

export function benchmarkTargets(records, clusterId, mode, routeDeploymentId) {
  const deployments = (records.deployments || []).filter(row => isReadyDeployment(row) && row.clusterId === clusterId);
  const supported = deployments.filter(row => supportsBenchmarkModel(row, records));
  if (mode === '路由') {
    const runningEndpoints = new Set((records.endpoints || []).filter(endpoint => endpoint.status === '运行中').map(endpoint => endpoint.id));
    const endpoints = new Map(supported.filter(item => (!routeDeploymentId || item.id === routeDeploymentId) &&
      runningEndpoints.has(item.endpointId) && deploymentCanServe(item))
      .map(item => [item.endpointId, item]));
    return (records.routes || []).filter(route => route.status === '已启用').flatMap(route => {
      const target = (route.targets || []).filter(item => item.weight > 0 && endpoints.has(item.endpointId))
        .sort((left, right) => right.weight - left.weight ||
          String(left.id ?? left.endpointId).localeCompare(String(right.id ?? right.endpointId), undefined, { numeric: true }))[0];
      const deployment = target && endpoints.get(target.endpointId);
      return deployment ? [{ value: route.id, label: route.name || route.routeId, deployment, route }] : [];
    });
  }
  const instances = deploymentInstances(supported.filter(item => !item.roles || deploymentCanServe(item)), records)
    .filter(item => item.state === 'running');
  return instances.filter(item => !item.deployment.roles || item.role === 'router').map(instance => ({
    value: instance.id,
    label: instance.deployment.roles ? instance.deployment.name : `${instance.deployment.name} / ${instance.name}`,
    deployment: instance.deployment,
    instance,
  }));
}

// A PD choice follows the deployment. Saved records still identify the router that was resolved at submission.
export const benchmarkTargetValue = target => target.instance && target.deployment.roles ? target.deployment.id : target.value;

export function isBenchmarkTargetReady(row, records) {
  const selection = row.targetSelection || (row.targetMode === '路由' ? row.routeId : '');
  if (selection) return benchmarkTargets(records, row.clusterId, row.targetMode || '模型实例', row.targetId).some(target =>
    target.value === selection && target.deployment.id === row.targetId);
  if (row.targetMode === '路由') return false;
  return (records.deployments || []).some(deployment => deployment.id === row.targetId && deployment.clusterId === row.clusterId && isReadyDeployment(deployment));
}

const profileNameSlugs = {'最大吞吐量':'max-throughput','满足延迟 SLO':'meet-latency-slo','自定义':'custom'};
const benchmarkSlug = (value,max) => text(value).toLowerCase().replace(/[^a-z\d.]+/g,'-').replace(/^[-.]+|[-.]+$/g,'').slice(0,max);
export const newBenchmarkSeed = () => crypto.getRandomValues(new Uint32Array(1))[0] % BENCHMARK_SEED_MAX + 1;
const benchmarkName = (deployment,profile,now,random) => {
  const model = benchmarkSlug(deployment?.name,24) || benchmarkSlug(deployment?.deploymentId,24) || 'benchmark';
  const preset = profileNameSlugs[profile] || benchmarkSlug(profile,20) || 'custom';
  const pad = value=>String(value).padStart(2,'0');
  const date = pad(now.getMonth()+1)+pad(now.getDate())+'-'+pad(now.getHours())+pad(now.getMinutes());
  return [model,preset,date,random.toString(36).slice(2,5).padEnd(3,'0')].join('-');
};

export function updateBenchmarkDraft(records,previous,patch,now=new Date(),random=Math.random()) {
  const next = {...previous,...patch};
  const changedLoad = next.loadType !== previous.loadType || next.loadPattern !== previous.loadPattern;
  if (next.profile === '自定义' && next.profile === previous.profile && changedLoad && next.loadPattern !== '单次') {
    const automatic = next.loadPattern === '自动调优';
    Object.assign(next, automatic ? adaptiveBudget : { minLoad: null, maxLoad: null, maxPoints: null, maxTotalSeconds: null }, {
      stagePlans: automatic ? [] : [{ load: '', requests: '', duration: '' }],
    });
  }
  const targetFields = ['profile','targetMode','clusterId','targetId','targetSelection'];
  if (!targetFields.some(key=>next[key]!==previous[key]) || previous.name && previous.name!==previous.automaticName || Object.hasOwn(patch,'name')) return next;
  const target = benchmarkTargets(records,next.clusterId,next.targetMode,next.targetId).find(item=>benchmarkTargetValue(item)===next.targetSelection);
  const parent = records.deployments?.find(item=>item.id===next.targetId && !item.retiredAt);
  const name = benchmarkName(target?.deployment ?? parent,next.profile,now,random);
  return {...next,name,automaticName:name};
}

export function initialBenchmarkDraft(records, row, preset, { clone = false, now = new Date(), random = Math.random() } = {}) {
  const imported = preset instanceof URLSearchParams ? Object.fromEntries(preset.entries()) : preset || {};
  const base = row || imported;
  const clusters = (records.clusters || []).filter(cluster => cluster.status === '运行中');
  const clusterId = base.clusterId || clusters.find(cluster => cluster.isDefault)?.id || clusters[0]?.id || '';
  const mode = base.targetMode || '模型实例';
  const targets = benchmarkTargets(records, clusterId, mode);
  const exactSelection = Object.hasOwn(base, 'targetSelection');
  const preselected = mode === '路由'
    ? targets.find(target => target.value === (base.targetSelection ?? base.routeId))
    : targets.find(target => {
      if (base.targetId && target.deployment.id !== base.targetId) return false;
      if (target.deployment.roles && base.targetId === target.deployment.id && (row || clone || !exactSelection)) return true;
      if (exactSelection) return benchmarkTargetValue(target) === base.targetSelection;
      if (!base.targetId) return false;
      return set(base.replica) ? target.instance.ordinal === Number(base.replica) : !row && !clone;
    });
  const requestedProfile = officialProfile(base.profile);
  const defaults = Object.hasOwn(BENCHMARK_PROFILES, requestedProfile) ? BENCHMARK_PROFILES[requestedProfile] : undefined;
  const presetChanged = clone && defaults && ['loadType','loadPattern'].some(key => set(base[key]) && base[key] !== defaults[key]);
  const selectedProfile = presetChanged ? '自定义' : defaults ? requestedProfile : '最大吞吐量';
  const selected = preselected || (!base.targetId && !exactSelection && !clone && (mode === '模型实例' || targets.length === 1)
    ? targets[0] : undefined);
  const name = base.name || benchmarkName(selected?.deployment ?? records.deployments?.find(item=>item.id===base.targetId),selectedProfile,now,random);
  const legacySlo = { p95Ttft: base.latencySlo, p95Tpot: base.tpotSlo, p95Latency: base.totalLatencySlo };
  const sourceSlo = Object.fromEntries(Object.entries(legacySlo).filter(([,value]) => set(value)));
  return {
    ...BENCHMARK_PROFILES[selectedProfile],
    description: '', labels: [], stages: [],
    ...base,
    clusterId, targetMode: mode, targetSelection: selected ? benchmarkTargetValue(selected) : '', profile: selectedProfile,
    targetId: mode === '路由' ? selected?.deployment.id : base.targetId,
    name,automaticName:(!row && !base.name || clone) ? name : undefined,
    stagePlans: Array.isArray(base.stagePlans) ? base.stagePlans : Array.isArray(base.stages) ? base.stages : [],
    prefixBuckets: Array.isArray(base.prefixBuckets) ? base.prefixBuckets : [],
    executionWarmup: base.executionWarmup ?? asPercent(base.warmup), executionCooldown: base.executionCooldown ?? asPercent(base.cooldown),
    maxErrorPercent: base.maxErrorPercent ?? asPercent(base.maxErrorRate),
    sloTargets: base.sloTargets || (Object.keys(sourceSlo).length ? sourceSlo : BENCHMARK_PROFILES[selectedProfile].sloTargets) || {},
    turnsEnabled: Number(base.turns) > 1,
    shareGptFilter: Boolean(base.shareGptFilter || base.dataset === 'ShareGPT' && (base.inputMin || base.inputMax)),
    tokenDistribution: Boolean(base.tokenDistribution || base.dataset === 'Random' && [base.inputMin,base.inputMax,base.outputMin,base.outputMax,base.inputStdev,base.outputStdev].some(set)),
  };
}

export function benchmarkProfilePatch(profile) {
  return {
    profile, pinSeed: false, randomSeed: undefined, tokenDistribution: false, inputStdev: undefined, outputStdev: undefined,
    inputMin: undefined, inputMax: undefined, outputMin: undefined, outputMax: undefined, prefixBuckets: [], turns: undefined,
    turnsEnabled: false, shareGptFilter: false, stages: [], stagePlans: [], load: undefined, requests: undefined, duration: undefined,
    sloTargets: {}, ...BENCHMARK_PROFILES[profile],
  };
}

function numeric(value, label, { min = 1, max = Infinity, integer = true, required = false } = {}) {
  if (!set(value)) {
    if (required) throw Error(`请填写${label}。`);
    return null;
  }
  const resolved = number(value);
  if (!Number.isFinite(resolved) || resolved < min || resolved > max || (integer && !Number.isSafeInteger(resolved))) {
    throw Error(`${label}超出允许范围${integer ? '，须填写整数' : ''}。`);
  }
  return resolved;
}

function boundedPair(draft, from, to, label) {
  const minimum = numeric(draft[from], `${label}下限`);
  const maximum = numeric(draft[to], `${label}上限`);
  if (minimum != null && maximum != null && minimum > maximum) throw Error(`${label}下限不能大于上限。`);
  return [minimum, maximum];
}

function budgetStop(draft) {
  return {
    maxErrors: numeric(draft.maxErrors, '错误数上限', { min: 0 }),
    maxErrorPercent: numeric(draft.maxErrorPercent, '错误率上限', { min: 1, max: 99, integer: false }),
    stopOnSaturation: Boolean(draft.stopOnSaturation),
  };
}

function readLabels(labels) {
  const values = Array.isArray(labels) ? labels : Object.entries(labels || {}).map(([key, value]) => ({ key, value }));
  const names = new Set();
  return values.filter(item => text(item.key) || text(item.value)).map(item => {
    const key = text(item.key), value = text(item.value);
    if (!key || !value || names.has(key)) throw Error('标签名称和值必填，名称不能重复。');
    names.add(key);
    return { key, value };
  });
}

function loadConfig(draft) {
  const fixed = draft.loadType === '固定请求速率';
  const load = (value, label, required = false) => numeric(value, label, { min: fixed ? 0.001 : 1, integer: !fixed, required });
  const stagePlans = draft.loadPattern === '手工分阶段' ? draft.stagePlans : [];
  if (draft.loadPattern === '手工分阶段' && (!Array.isArray(stagePlans) || !stagePlans.length || stagePlans.length > MAX_BENCHMARK_STAGES)) {
    throw Error(`请添加 1–${MAX_BENCHMARK_STAGES} 个测试阶段。`);
  }
  const stages = stagePlans.map((stage, index) => ({
    load: load(stage.load, `第 ${index + 1} 个阶段的负载`, true),
    requests: numeric(stage.requests, '阶段最大请求数'), duration: numeric(stage.duration, '阶段最大耗时'),
  }));
  const missingStop = stages.findIndex(stage => stage.requests == null && stage.duration == null);
  if (missingStop >= 0) throw Error(`第 ${missingStop + 1} 个阶段须填写最大请求数或最大耗时。`);
  if (draft.loadPattern === '自动调优') {
    const minLoad = numeric(draft.minLoad, '负载下限'), maxLoad = numeric(draft.maxLoad, '负载上限');
    if ((minLoad ?? adaptiveBudget.minLoad) >= (maxLoad ?? adaptiveBudget.maxLoad)) throw Error('负载下限必须小于负载上限。');
    return { minLoad, maxLoad, load: maxLoad || adaptiveBudget.maxLoad, stages,
      maxPoints: numeric(draft.maxPoints, '最大测量点数', { min: 2, max: MAX_BENCHMARK_STAGES }),
      maxTotalSeconds: numeric(draft.maxTotalSeconds, '最大总耗时'), requests: null, duration: null };
  }
  if (stages.length) return { load: stages.at(-1).load, stages, requests: stages.some(item => item.requests != null)
    ? stages.reduce((sum, item) => sum + (item.requests || 0), 0) : null, duration: null };
  return { load: load(draft.load, '负载值', true), stages, requests: numeric(draft.requests, '最大请求数'), duration: numeric(draft.duration, '最大耗时') };
}

function datasetConfig(draft) {
  const random = draft.dataset === 'Random';
  const [inputMin,inputMax] = random ? draft.tokenDistribution ? boundedPair(draft, 'inputMin', 'inputMax', '输入 Token 长度') : [null,null]
    : draft.shareGptFilter ? boundedPair(draft, 'inputMin', 'inputMax', '输入 Token 长度') : [null,null];
  const [outputMin,outputMax] = random && draft.tokenDistribution ? boundedPair(draft, 'outputMin', 'outputMax', '输出 Token 长度') : [null,null];
  const prefixBuckets = random ? (draft.prefixBuckets || []).map((bucket, index) => ({
    tokens: numeric(bucket.tokens, `前缀桶 ${index + 1} 的 Token 长度`, { required: true }),
    count: numeric(bucket.count, `前缀桶 ${index + 1} 的前缀数`, { required: true }),
    weight: numeric(bucket.weight, `前缀桶 ${index + 1} 的权重`, { required: true }),
  })) : [];
  return {
    dataset: draft.dataset, pinSeed: random && Boolean(draft.pinSeed),
    randomSeed: random ? draft.pinSeed ? numeric(draft.randomSeed, '随机种子', { required: true, max: BENCHMARK_SEED_MAX })
      : newBenchmarkSeed() : null,
    incrementSeed: random && (!draft.pinSeed || Boolean(draft.incrementSeed)),
    inputTokens: random ? numeric(draft.inputTokens, '输入 Token 长度', { required: true }) : null,
    outputTokens: random || draft.shareGptFilter ? numeric(draft.outputTokens, '输出 Token 长度', { required: random }) : null,
    inputMin, inputMax, outputMin, outputMax,
    inputStdev: random && draft.tokenDistribution ? numeric(draft.inputStdev, '输入标准差', { min: 0, integer: false }) : null,
    outputStdev: random && draft.tokenDistribution ? numeric(draft.outputStdev, '输出标准差', { min: 0, integer: false }) : null,
    prefixBuckets, turns: random && draft.turnsEnabled ? numeric(draft.turns, '对话轮数', { min: 2, max: 64, required: true }) : null,
  };
}

export function benchmarkEnvironmentSnapshot(records, cluster, target, now) {
  const { deployment, instance } = target;
  const candidates = deployment.roles ? deploymentInstances([deployment], records) : instance ? [instance] : [];
  const members = candidates.map(member => ({
    id: member.id, name: member.name, role: member.role, status: member.state,
    workerId: member.workerId, workerName: member.workerName, deviceIds: member.devices?.map(device => device.id) || [],
  }));
  const workers = new Map();
  const cacheRoles = deployment.roles ? ['prefill','decode'] : [null];
  const cacheServices = cacheRoles.flatMap(role => {
    const cache = deployment.roleConfigs?.[role]?.kvCache ?? deployment.kvCache;
    const service = cache ? cache.enabled && cache.mode==='shared' && cache.service : deployment.cacheAcceleration;
    return service?.name ? [{ id:service.id,name:service.name,role }] : [];
  });
  const inventory = (records['ops-nodes'] || []).filter(worker => worker.clusterId === cluster.id);
  for (const candidate of candidates) {
    const workerIds = new Set([candidate.workerId, ...(candidate.devices || []).map(device => device.nodeId)].filter(Boolean));
    for (const workerId of workerIds) {
      const worker = inventory.find(item => item.id === workerId);
      if (!worker) continue;
      const current = workers.get(workerId) ?? {
        id: worker.id, name: worker.name, os: worker.os, cpuCores: worker.cpuCores, memoryGiB: worker.memoryGiB,
        main: false, memberIds: [], devices: [],
      };
      current.main ||= candidate.id === instance?.id && candidate.workerId === workerId;
      current.memberIds.push(candidate.id);
      for (const device of candidate.devices || []) {
        if (device.nodeId !== workerId || current.devices.some(item => item.id === device.id)) continue;
        const { id, name, index, vendor, vram, driver, runtime, coreCount } = device;
        current.devices.push({ id, name, index, vendor, vram, driver, runtime, coreCount });
      }
      workers.set(workerId, current);
    }
  }
  return {
    cluster: cluster.name, node: instance?.workerName, gpu: cluster.gpuType, capturedAt: now.toISOString(),
    deployment: deployment.name, backend: deployment.backend, backendVersion: deployment.backendVersion,
    targetInstanceId: instance?.id, members, workers: [...workers.values()],...(cacheServices.length ? {cacheServices} : {}),
  };
}

function validateBenchmarkSection(section, validate) {
  try { return validate(); }
  catch (issue) { throw Object.assign(issue, { benchmarkSection: section }); }
}

export function benchmarkNameIssue(value, currentName) {
  const name = text(value);
  if (!name) return '请填写基准测试名称。';
  if (name !== currentName && !benchmarkNamePattern.test(name)) {
    return '基准测试名称最多 63 个字符，只能包含字母、数字、点、下划线和连字符，且首尾须为字母或数字。';
  }
  return '';
}

export function saveAlignedBenchmark(latest, records, draft, current, now = new Date()) {
  const previous = current && latest.find(row => row.id === current.id);
  if (current && (!previous || JSON.stringify(previous) !== JSON.stringify(current))) throw Error('基准测试已更新，请重新打开。');
  const name = text(draft.name);
  validateBenchmarkSection('basic', () => {
    const issue = benchmarkNameIssue(name, previous?.name);
    if (issue) throw Error(issue);
    if (latest.some(row => row.id !== previous?.id && row.name.toLowerCase() === name.toLowerCase())) {
      throw Error(`已存在同名基准测试 ${name}。`);
    }
  });
  const identity = { name, description: text(draft.description), updatedAt: now.toISOString() };
  if (previous) return latest.map(row => row.id === previous.id ? { ...row, ...identity } : row);

  const { cluster, target, labels } = validateBenchmarkSection('basic', () => {
    if (!BENCHMARK_TARGETS.includes(draft.targetMode)) throw Error('请选择测试目标类型。');
    const cluster = records.clusters?.find(row => row.id === draft.clusterId && row.status === '运行中');
    if (!cluster) throw Error('请选择运行中的集群。');
    const target = benchmarkTargets(records, cluster.id, draft.targetMode, draft.targetId)
      .find(option => benchmarkTargetValue(option) === draft.targetSelection && (!draft.targetId || option.deployment.id === draft.targetId));
    if (!target) throw Error(draft.targetMode === '路由' ? '请选择指向此集群就绪部署的可用路由。' : '请选择此集群中就绪的模型实例。');
    return { cluster, target, labels: readLabels(draft.labels) };
  });
  const dataset = validateBenchmarkSection('workload', () => {
    if (!Object.hasOwn(BENCHMARK_PROFILES, draft.profile)) throw Error('请选择测试模式。');
    if (!['Random', 'ShareGPT'].includes(draft.dataset)) throw Error('请选择数据集。');
    return datasetConfig(draft);
  });
  const sloTargets = draft.profile === '最大吞吐量' ? {} : validateBenchmarkSection('slo', () =>
    Object.fromEntries(BENCHMARK_SLO.flatMap(([key,label]) => {
      if (!Object.hasOwn(draft.sloTargets || {}, key)) return [];
      return [[key, numeric(draft.sloTargets[key], label, { min: 0, integer: false, required: true })]];
    })));
  const load = validateBenchmarkSection('load', () => {
    if (!BENCHMARK_LOAD_TYPES.includes(draft.loadType) || !BENCHMARK_LOAD_PATTERNS.includes(draft.loadPattern)) throw Error('请选择负载类型和负载模式。');
    if (draft.profile !== '自定义' && ['loadType','loadPattern'].some(key => draft[key] !== BENCHMARK_PROFILES[draft.profile][key])) {
      throw Error('当前模式已固定负载类型和负载模式。需要修改时请选择自定义。');
    }
    return {
      ...loadConfig(draft),
      executionWarmup: numeric(draft.executionWarmup, '预热比例', { min: 0, max: 99, integer: false }),
      executionCooldown: numeric(draft.executionCooldown, '冷却比例', { min: 0, max: 99, integer: false }),
    };
  });
  const stop = validateBenchmarkSection('execution', () => budgetStop(draft));
  return [{
    ...identity, labels, ...load, ...dataset, ...stop,
    id: resourceId('benchmark'), createdAt: now.toISOString(), status: '排队中', operationStartedAt: now.getTime(),
    targetMode: draft.targetMode, targetSelection: target.value, targetId: target.deployment.id, targetName: target.label,
    routeId: target.route?.id, routeName: target.route?.name || target.route?.routeId,
    replica: target.instance?.ordinal, modelName: target.deployment.name, modelInstanceName: target.instance?.name,
    clusterId: cluster.id, profile: draft.profile, loadType: draft.loadType, loadPattern: draft.loadPattern,
    sloTargets, latencySlo: sloTargets.p95Ttft, tpotSlo: sloTargets.p95Tpot, totalLatencySlo: sloTargets.p95Latency,
    warmup: load.executionWarmup == null ? null : load.executionWarmup / 100,
    cooldown: load.executionCooldown == null ? null : load.executionCooldown / 100,
    maxErrorRate: stop.maxErrorPercent == null ? null : stop.maxErrorPercent / 100,
    environment: benchmarkEnvironmentSnapshot(records, cluster, target, now),
    runEvents: [{ at: now.toISOString(), message: '基准测试已提交，等待模拟执行。' }],
  }, ...latest];
}

export function cloneAlignedBenchmark(row, records) {
  const current = initialBenchmarkDraft(records, row, undefined, { clone: true });
  const names = new Set((records[BENCHMARK_PAGE_ID] || []).map(item => item.name.toLowerCase()));
  const stem = benchmarkNamePattern.test(row.name) ? row.name : benchmarkSlug(row.name, 63) || 'benchmark';
  const copyName = suffix => `${stem.slice(0, 63 - suffix.length)}${suffix}`;
  let name = copyName('-copy');
  for (let index = 2; names.has(name.toLowerCase()); index += 1) name = copyName(`-copy-${index}`);
  return { ...current, name, automaticName:name,randomSeed: row.pinSeed ? row.randomSeed : undefined };
}

export function alignedBenchmarkExportFields(row) {
  const s = row.sloTargets || {};
  return {
    model_name: row.modelName || (row.targetMode === '路由' ? row.targetName : undefined),
    model_instance_name: row.targetMode === '模型实例' ? row.modelInstanceName || row.targetName : undefined,
    route_name: row.targetMode === '路由' ? row.routeName || row.targetName : undefined,
    auto_tune: row.loadPattern === '自动调优', lower_bound: row.minLoad, upper_bound: row.maxLoad,
    max_points: row.maxPoints, max_total_seconds: row.maxTotalSeconds,
    dataset_input_stdev: row.inputStdev, dataset_output_stdev: row.outputStdev,
    dataset_input_min: row.inputMin, dataset_input_max: row.inputMax, dataset_output_min: row.outputMin, dataset_output_max: row.outputMax,
    prefix_buckets: row.prefixBuckets?.map(item => ({ prefix_tokens: item.tokens, prefix_count: item.count, bucket_weight: item.weight })),
    dataset_seed_increment: row.incrementSeed, dataset_seed_random: row.dataset === 'Random' ? !row.pinSeed : undefined,
    turns: row.turns, warmup: row.warmup, cooldown: row.cooldown, max_errors: row.maxErrors, max_error_rate: row.maxErrorRate,
    stop_on_saturation: row.stopOnSaturation,
    labels: Array.isArray(row.labels) ? Object.fromEntries(row.labels.map(item => [item.key, item.value])) : row.labels,
    slo_avg_ttft_ms: s.avgTtft, slo_p95_ttft_ms: s.p95Ttft ?? row.latencySlo, slo_p99_ttft_ms: s.p99Ttft,
    slo_avg_tpot_ms: s.avgTpot, slo_p95_tpot_ms: s.p95Tpot ?? row.tpotSlo, slo_p99_tpot_ms: s.p99Tpot,
    slo_avg_latency_ms: s.avgLatency, slo_p95_latency_ms: s.p95Latency ?? row.totalLatencySlo, slo_p99_latency_ms: s.p99Latency,
  };
}

const gib = 1024 ** 3;
export const benchmarkArchiveStorageKey = 'moma-5.12.0-estack:infrastructure:model-sources';

export function benchmarkArchiveUsage(rows) {
  return rows.reduce((bytes, row) => bytes + (row.stageResults?.length && row.status === '已完成'
    ? gzipSync(strToU8(JSON.stringify(row.stageResults))).byteLength : 0), 0);
}

export function benchmarkArchiveCapacity(unlimited, limit) {
  if (unlimited) return null;
  const bytes = Math.round(Number(limit) * gib);
  if (!Number.isSafeInteger(bytes) || bytes <= 0) throw Error('请输入大于 0 的有效 GiB 容量。');
  return bytes;
}

export const benchmarkBytesToGiB = bytes => bytes / gib;

const round = (value, decimals = 2) => Number(value.toFixed(decimals));
const peak = (points, metric = 'totalThroughput') => points.reduce((best, point) => Number.isFinite(point[metric]) &&
  (!best || point[metric] > best[metric] || point[metric] === best[metric] && point.load < best.load) ? point : best, null);
const successFloor = 0.95;
const successOk = point => point.requests > 0 && isCount(point.completed) && point.completed / point.requests >= successFloor;
const recommended = points => points.reduce((best, point) => point.meetsSlo === true && successOk(point) &&
  (!best || point.load > best.load || (point.load === best.load &&
    (point.totalThroughput ?? 0) > (best.totalThroughput ?? 0))) ? point : best, null);

export const BENCHMARK_STOP_REASONS = {
  throughput_gain_converged: '吞吐收益收敛',
  throughput_decline: '总吞吐持续下降',
  capacity_plateau: '吞吐见顶',
  upper_bound: '范围上界',
  budget_points: '点数预算用尽',
  budget_seconds: '时长预算用尽',
  slo_failed: '延迟阈值被打破',
  converged: '搜索收敛',
  overloaded: '服务过载',
  point_failed: '测点未产出有效结果',
};

export function benchmarkStageInspection(row) {
  const targets = BENCHMARK_SLO.flatMap(([key, label]) => {
    const threshold = row.sloTargets?.[key];
    return Number.isFinite(threshold) && threshold >= 0 ? [{ key, label, threshold }] : [];
  });
  const byStage = (row.stageResults || []).map((point, index) => {
    const observed = { p95Ttft: point.ttft, p95Tpot: point.tpot, p95Latency: point.totalLatency, ...point.slo };
    const range = Number.isFinite(point.elapsed) && Number.isFinite(point.duration) && point.duration > 0
      ? { from: round(point.elapsed), to: round(point.elapsed + point.duration) } : null;
    const limits = targets.map(target => {
      const value = observed[target.key];
      return { ...target, value: Number.isFinite(value) ? value : null,
        pass: Number.isFinite(value) ? value <= target.threshold : null };
    });
    const meetsSlo = !targets.length || limits.every(limit => limit.pass === null) ? null
      : limits.some(limit => limit.pass === false) ? false
        : limits.some(limit => limit.pass === null) ? null : true;
    return {
      ...point, id: point.id ?? index + 1, sequence: index + 1, range, limits, meetsSlo,
      observed, lowSample: Number.isFinite(point.completed) && point.completed > 0 && point.completed < 1000,
      failureCount: failedRequests(point) ?? null, incompleteCount: incompleteRequests(point) ?? null,
      requestRate: Number.isFinite(point.duration) && point.duration > 0 && Number.isFinite(point.completed) ? round(point.completed / point.duration) : null,
    };
  });
  return { points: byStage, peak: peak(byStage), outputPeak: peak(byStage, 'throughput'), recommended: recommended(byStage), targets };
}

export function benchmarkComparisonPoint(points, point, basis, customId) {
  const comparable = benchmarkComparablePoints(points, point);
  if (basis === 'custom') return comparable.find(candidate => candidate.id === customId);
  if (basis === 'adjacent') return comparable.filter(candidate => candidate.load < point.load)
    .sort((left, right) => left.load - right.load || left.sequence - right.sequence).at(-1);
  return comparable.findLast(candidate => candidate.sequence < point.sequence);
}

export function benchmarkComparablePoints(points, point) {
  const workload = current => current.inputTokens ?? current.workload ?? 0;
  return points.filter(candidate => candidate.id !== point.id && workload(candidate) === workload(point));
}

const pointSloValues = (ttft, tpot, totalLatency) => ({
  avgTtft: round(ttft / 1.2), p95Ttft: ttft, p99Ttft: round(ttft * 1.17),
  avgTpot: round(tpot / 1.2), p95Tpot: tpot, p99Tpot: round(tpot * 1.17),
  avgLatency: round(totalLatency / 1.2), p95Latency: totalLatency, p99Latency: round(totalLatency * 1.17),
});

function simulatedPoint(plan, row, index, elapsed) {
  const outputTokens = row.outputTokens || 128;
  const saturation = row.loadType === '并发数' ? 96 : 64;
  const level = plan.load / saturation;
  const requests = plan.requests || 500;
  const requestWindow = Math.max(1, requests / plan.load);
  const seconds = Math.min(plan.duration, requestWindow);
  const progress = seconds >= requestWindow ? requests : Math.floor(seconds * plan.load);
  const lost = Math.floor(progress * Math.max(0, Math.min(0.7, (level - 0.8) * 0.15)));
  const completed = progress - lost;
  const tokenRate = Math.min(plan.load, saturation) * 0.8 / Math.max(1, level ** 0.3);
  const throughput = completed ? round(tokenRate * outputTokens) : null;
  const totalThroughput = completed && row.inputTokens > 0 ? round(tokenRate * (row.inputTokens + outputTokens)) : null;
  const ttft = round(160 + plan.load * 3.8 + Math.max(0, level - 1) * 330);
  const tpot = round(11.5 + plan.load * 0.14 + Math.max(0, level - 1) * 16);
  const totalLatency = round(ttft + tpot * outputTokens);
  const observedSlo = completed ? pointSloValues(ttft, tpot, totalLatency) : {};
  const thresholds = Object.entries(row.sloTargets || {});
  const meetsSlo = completed && thresholds.length ? thresholds.every(([key,target]) => observedSlo[key] <= target) : null;
  return { id: index + 1, load: plan.load, inputTokens: row.inputTokens, requests: progress, completed, failures: lost,
    resultRate: progress ? round(completed / progress * 100) : null, throughput, totalThroughput,
    ttft: completed ? ttft : null, tpot: completed ? tpot : null, totalLatency: completed ? totalLatency : null, slo: observedSlo,
    meetsSlo, elapsed, duration: seconds, saturated: level >= 1.25 };
}

const validThroughput = point => successOk(point) && Number.isFinite(point.totalThroughput) && point.totalThroughput > 0;

function throughputGain(stages) {
  const window = stages.slice(-3);
  const baseline = peak(stages.slice(0, -3));
  const best = peak(stages);
  if (window.length < 3 || !baseline || !best || !validThroughput(baseline) || !validThroughput(best) ||
    !window.every(point => point.searchPhase === 'refine' && validThroughput(point))) return null;
  const loads = stages.filter(validThroughput).map(point => point.load).sort((left,right) => left - right);
  const lower = loads.findLast(load => load < best.load);
  const upper = loads.find(load => load > best.load);
  const gain = round((best.totalThroughput / baseline.totalThroughput - 1) * 100, 6);
  if (lower == null || upper == null || gain >= 1) return null;
  return { gain, threshold: 1, baselineLoad: baseline.load, baselineThroughput: baseline.totalThroughput,
    bestLoad: best.load, bestThroughput: best.totalThroughput, lower, upper, pointIds: window.map(point => point.id) };
}

function adaptiveBenchmark(row, measure, stages) {
  const concurrency = row.loadType === '并发数';
  const upperBound = row.maxLoad ?? adaptiveBudget.maxLoad;
  const hasSlo = Object.keys(row.sloTargets || {}).length > 0;
  const grid = value => concurrency ? Math.floor(value) : round(value, 6);
  const hasInterior = (lo,hi) => hi - lo > (concurrency ? 1 : Math.max(0.000001,Math.min(1,lo / 100)));
  let load = row.minLoad ?? adaptiveBudget.minLoad;
  let passing, failing, lower, previous, best, bracketReason, decline = 0;
  const finish = (stopReason, evidence) => ({ stopReason, bracketReason: bracketReason || stopReason,
    ...(hasSlo ? { sloBracket: { passing: passing ?? null, failing: failing ?? null } } : {}),
    ...(evidence ? { throughputGain: evidence } : {}) });

  while (!bracketReason) {
    const sample = measure(load, 'expand');
    if (!sample.point) return finish(sample.stop);
    const point = sample.point;
    const usable = Number.isFinite(point.totalThroughput) && point.totalThroughput > 0;
    if (hasSlo ? point.meetsSlo === null : !usable) return finish(sample.stop || 'point_failed');
    if (hasSlo) {
      if (!point.meetsSlo || !successOk(point)) {
        failing = load;
        bracketReason = successOk(point) ? 'slo_failed' : 'overloaded';
        if (passing == null) return finish(sample.stop || bracketReason);
      } else {
        passing = load;
        decline = usable && best && point.totalThroughput <= best.totalThroughput * 0.85 ? decline + 1 : 0;
        if (decline === 2) return finish('throughput_decline');
      }
    } else if (!successOk(point) || best && point.totalThroughput <= best.totalThroughput) {
      bracketReason = successOk(point) ? 'capacity_plateau' : 'overloaded';
      if (!previous) return finish(bracketReason);
      lower = stages.at(-3)?.load ?? previous.load;
      failing = load;
    }
    if (sample.stop) return finish(sample.stop);
    if (!bracketReason && load >= upperBound) return finish('upper_bound');
    if (usable && (!best || point.totalThroughput > best.totalThroughput)) best = point;
    previous = point;
    load = Math.min(upperBound, load * 2);
  }

  if (hasSlo) {
    while (hasInterior(passing, failing)) {
      const mid = grid(passing + (failing - passing) / 2);
      const sample = measure(mid, 'refine');
      if (!sample.point) return finish(sample.stop);
      if (sample.point.meetsSlo === null) return finish(sample.stop || 'point_failed');
      if (sample.point.meetsSlo && successOk(sample.point)) passing = mid;
      else failing = mid;
      if (sample.stop) return finish(sample.stop);
    }
    return finish('converged');
  }

  let upper = failing;
  while (hasInterior(lower, upper)) {
    const gap = upper - lower;
    const left = Math.max(grid(lower + gap / 3), concurrency ? lower + 1 : lower);
    const right = Math.min(grid(upper - gap / 3), concurrency ? upper - 1 : upper);
    const measurements = [];
    for (const rate of new Set([left, right])) {
      const saved = stages.find(point => point.load === rate);
      const sample = saved ? { point: saved } : measure(rate, 'refine');
      if (!sample.point) return finish(sample.stop);
      if (sample.stop && sample.stop !== 'budget_seconds') return finish(sample.stop);
      const evidence = throughputGain(stages);
      if (evidence) return finish('throughput_gain_converged', evidence);
      if (sample.stop) return finish(sample.stop);
      measurements.push(validThroughput(sample.point) ? sample.point.totalThroughput : -Infinity);
    }
    if (left === right) break;
    if (measurements[0] < measurements[1]) lower = left;
    else upper = right;
  }
  return finish('converged');
}

export function completeAlignedBenchmark(row, now = new Date()) {
  const adaptive = row.loadPattern === '自动调优';
  const stages = [];
  let elapsed = 0, failures = 0, stopReason = '已完成配置的负载';
  const maxSeconds = row.maxTotalSeconds ?? (adaptive ? adaptiveBudget.maxTotalSeconds : Infinity);
  const maxPoints = row.maxPoints ?? adaptiveBudget.maxPoints;
  const measure = (plan, phase) => {
    const remaining = maxSeconds - elapsed;
    if (remaining <= 0) return { stop: 'budget_seconds' };
    if (phase && stages.length >= maxPoints) return { stop: 'budget_points' };
    const duration = phase ? remaining : Math.min(plan.duration || row.duration || 60, remaining);
    const point = simulatedPoint({ ...plan, duration }, row, stages.length, elapsed);
    if (phase) point.searchPhase = phase;
    stages.push(point);
    elapsed += point.duration;
    failures += point.failures;
    if (point.failures > 0 && row.maxErrors != null && failures >= row.maxErrors) return { point, stop: '达到错误数上限' };
    if (point.resultRate != null && row.maxErrorPercent != null && 100 - point.resultRate >= row.maxErrorPercent) return { point, stop: '达到错误率上限' };
    if (point.saturated && row.stopOnSaturation) return { point, stop: '检测到过饱和' };
    return { point, stop: elapsed >= maxSeconds ? 'budget_seconds' : undefined };
  };
  let benchmarkAdaptiveSearch;
  if (adaptive) {
    const requestsPerLoad = row.loadType === '并发数' ? 10 : 30;
    benchmarkAdaptiveSearch = adaptiveBenchmark(row, (load,phase) => measure({ load,
      requests: Math.max(500, Math.ceil(load * requestsPerLoad)) }, phase), stages);
    stopReason = BENCHMARK_STOP_REASONS[benchmarkAdaptiveSearch.stopReason] || benchmarkAdaptiveSearch.stopReason;
  } else {
    const plans = row.stages?.length ? row.stages : [{ load: row.load, requests: row.requests, duration: row.duration }];
    for (const plan of plans) {
      const sample = measure(plan);
      if (sample.stop) {
        stopReason = sample.stop === 'budget_seconds' ? '达到总耗时上限' : sample.stop;
        break;
      }
    }
  }
  const maxThroughput = peak(stages);
  const hasSlo = Object.keys(row.sloTargets || {}).length > 0;
  const sloPoint = hasSlo ? recommended(stages) : null;
  const main = hasSlo ? sloPoint : maxThroughput;
  const { throughput, totalThroughput, ttft, tpot, totalLatency } = main || {};
  const requests = stages.reduce((count, point) => count + point.requests, 0);
  const completed = stages.reduce((count, point) => count + point.completed, 0);
  return { status: '已完成', throughput, totalThroughput, ttft, tpot, totalLatency, requests, completed,
    resultRate: requests ? round(completed / requests * 100) : null, resultSource: '模拟结果', stageResults: stages,
    benchmarkAdaptiveSearch, benchmarkStopReason: stopReason, benchmarkRecommendedLoad: sloPoint?.load,
    benchmarkPeakThroughput: maxThroughput?.totalThroughput, benchmarkPrimaryLoad: main?.load,
    finishedAt: now.toISOString(), operationStartedAt: null,
    runEvents: [...(row.runEvents || []), { at: now.toISOString(), message: `模拟测试完成。${stopReason}，成功请求 ${completed}/${requests}。` }],
  };
}

function directLog(row) {
  return { name: `${row.name.replace(/[\\/]/g, '-')}.log`, content: (row.runEvents || []).map(event => `[${event.at}] ${event.message}`).join('\n'), type: 'text/plain;charset=utf-8' };
}

const dimension = (options, key, label) => field(key, label, {
  options, multiple: true, searchable: true,
  match: (selected, row) => [selected].flat().some(value => text(row[key] || (key === 'gpu' ? row.environment?.gpu : key === 'modelName' ? row.targetName : '')).toLowerCase().includes(value.toLowerCase())),
});
const choices = (rows, select) => [...new Set(rows.map(select).filter(Boolean))];

export function benchmarkListMeasurements(row) {
  if (row.status!=='已完成') return {};
  const stages = Array.isArray(row.stageResults) ? row.stageResults : [];
  const inspection = benchmarkStageInspection(row);
  const primary = inspection.targets.length ? inspection.recommended : inspection.peak;
  const aggregate = select => {
    const counts = stages.map(select);
    return counts.length && counts.every(isCount) ? counts.reduce((sum, count) => sum + count, 0) : undefined;
  };
  const rates = primary && Number.isFinite(primary.completed) && Number.isFinite(primary.duration) && primary.duration>0
    ? round(primary.completed/primary.duration) : undefined;
  const statistic = key => Number.isFinite(primary?.slo?.[key]) ? primary.slo[key] : undefined;
  return {
    recommendedLoad:primary?.load, totalThroughput:primary?.totalThroughput,
    failed:aggregate(failedRequests),incomplete:aggregate(incompleteRequests),successfulRequestRate:rates,
    avgTtft:statistic('avgTtft'),p99Ttft:statistic('p99Ttft'),avgTpot:statistic('avgTpot'),p99Tpot:statistic('p99Tpot'),
    avgLatency:statistic('avgLatency'),p99Latency:statistic('p99Latency'),
  };
}

export function alignBenchmarkPage(base) {
  const logStatuses = ['排队中', '运行中', '失败', '已完成'];
  const withLogs = row => logStatuses.includes(row.status);
  const records = collection => collection[BENCHMARK_PAGE_ID] || [];
  const measured = (key,label,units) => field(key,label,{
    sorter:true,sortValue:row=>benchmarkListMeasurements(row)[key],
    format:(_,row)=>{
      const value = benchmarkListMeasurements(row)[key];
      return units ? numberLabel(value,typeof units==='function' ? units(row) : units) : value;
    },
  });
  const columns = [base.columns[0],field('clusterId','集群',{
    format:(id,row,data)=>row.environment?.cluster || data.clusters?.find(cluster=>cluster.id===id)?.name,
  }),field('modelName','模型',{format:(value,row)=>value || row.targetName}),
  field('targetMode','测试目标类型'),field('profile','模式'),field('loadType','负载类型'),
  field('dataset','数据集'),field('gpu','GPU',{format:(value,row)=>value || row.environment?.gpu}),
  field('cacheService','缓存服务',{format:(_,row)=>choices(row.environment?.cacheServices || [],service=>service.name).join('、')}),
  ...base.columns.slice(3),field('load','速率 / 并发'),
  measured('recommendedLoad','推荐负载',row=>row.loadType==='并发数' ? '并发' : '请求/秒'),
  measured('totalThroughput','总吞吐量','Token/s'),
  measured('successfulRequestRate','成功请求速率','请求/秒'),
  measured('avgTtft','平均 TTFT','ms'),measured('p99Ttft','P99 TTFT','ms'),
  measured('avgTpot','平均 TPOT','ms'),measured('p99Tpot','P99 TPOT','ms'),
  measured('avgLatency','平均端到端时延','ms'),measured('p99Latency','P99 端到端时延','ms'),
  field('requests','请求总数'),field('completed','成功请求数'),measured('failed','出错请求数'),measured('incomplete','未完成请求数'),
  field('totalLatency','P95 端到端时延',{format:value=>numberLabel(value,'ms')}),
  field('tpot','P95 TPOT',{format:value=>numberLabel(value,'ms')}),
  field('resultRate','成功率',{format:value=>numberLabel(value==null ? undefined : value.toFixed(2),'%')})];
  const defaultVisible = new Set(['name','modelName','profile','loadType','gpu','status','throughput','avgTtft','avgTpot','recommendedLoad']);
  return {
    ...base,
    description: undefined,
    searchPlaceholder: '名称查询', searchKeys: ['name'],
    actionsInToolbar: true,
    searchMatches: (row, query) => query.split(/[,，]/).map(text).filter(Boolean).some(name => text(row.name).toLowerCase().includes(name)),
    columns,
    defaultHiddenColumns:columns.filter(column=>!defaultVisible.has(column.key)).map(column=>column.key),
    filters: [dimension(data => choices(records(data), row => row.modelName || row.targetName), 'modelName', '模型'),
      dimension(data => choices(records(data), row => row.profile), 'profile', '模式'),
      dimension(data => choices(records(data), row => row.environment?.gpu), 'gpu', 'GPU'),
      field('targetMode', '测试目标类型', { options: BENCHMARK_TARGETS }), field('loadType', '负载类型', { options: BENCHMARK_LOAD_TYPES })],
    canDelete: undefined,
    actions: base.actions.filter(action => !['模拟开始测试', '生成模拟结果'].includes(action.label)).map(action => {
      if (action.label === '查看日志') return { ...action, when: withLogs };
      if (action.label === '克隆') return { ...action, editor: { ...action.editor, prefill: cloneAlignedBenchmark } };
      return action;
    }).concat({ label: '下载日志', when: withLogs, download: directLog }),
    batchActions: base.batchActions.map(action => action.label === '批量删除' ? { ...action, when: rows => rows.length > 0 } : action),
  };
}
