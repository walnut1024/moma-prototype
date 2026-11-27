import { dump } from 'js-yaml';
import { validateDeploymentSchedule } from './deployment-schedule.js';
import { deploymentConfigKeys, deployableModels } from './deployments.js';
import { labelMap } from './ops-resources.js';
import { pdEffectiveEnvironment } from './deployment-pd-recipes.js';

const sourceNames = { huggingface: 'Hugging Face', model_scope: 'ModelScope', local_path: '本地路径' };
const sourceCodes = Object.fromEntries(Object.entries(sourceNames).map(([code, name]) => [name, code]));
const algorithms = { eagle3: 'Eagle3', mtp: 'MTP', ngram: 'N-gram' };
const roleNames = ['prefill', 'decode', 'router'];
const deviceTypes = {
  nvidia: 'cuda', amd: 'rocm', ascend: 'cann', huawei: 'cann', hygon: 'dtk', 'moore threads': 'musa',
  iluvatar: 'corex', cambricon: 'neuware', metax: 'maca', 't-head': 'hggc', thead: 'hggc', cpu: 'cpu',
};
const typeCategories = { text: 'llm', multimodal: 'llm', embedding: 'embedding', rerank: 'reranker' };
const distributedBackends = new Set(['vLLM', 'SGLang', 'MindIE']);
const secretKey = /(?:secret|token|password|api_?key|access_?key|authorization)/i;
const portableFields = new Set(`name cluster_name source huggingface_repo_id huggingface_filename model_scope_model_id
  model_scope_file_path local_path description replicas categories placement_strategy cpu_offloading
  distributed_inference_across_workers worker_selector gpu_selector gpu_type_selector backend backend_version backend_parameters
  image_name run_command native_anthropic_api env restart_on_error distributable extended_kv_cache speculative_config
  scaling_schedule generic_proxy lora_list roles disaggregation gather enable_model_route`.split(/\s+/));
const localAliases = new Set([...deploymentConfigKeys, 'deploymentId', 'cluster', 'model']);
const managedFields = new Set(['id', 'created_at', 'updated_at', 'deleted_at', 'ready_replicas', 'meta', 'cluster_id', 'owner_principal_id', 'access_policy', 'revision_history_limit']);
const parameterFlags = {
  tensorParallel: ['tensor-parallel-size', 'tp-size', 'tp'],
  pipelineParallel: ['pipeline-parallel-size', 'pp-size', 'pp'],
  maxModelLen: ['max-model-len', 'context-length', 'ctx-size'],
  gpuMemoryUtilization: ['gpu-memory-utilization', 'mem-fraction-static'],
};

const isObject = value => value !== null && typeof value === 'object' && !Array.isArray(value);
const own = (value, key) => Object.hasOwn(value, key);
const lines = value => String(value || '').split(/\r?\n/).map(line => line.trim()).filter(Boolean);
const compact = value => Object.fromEntries(Object.entries(value).filter(([, field]) => field != null));
const unique = values => [...new Set(values)];

function objectField(value, allowed, field) {
  if (!isObject(value)) throw Error(`${field} 须为键值对象`);
  const unknown = allowed && Object.keys(value).filter(key => !allowed.includes(key));
  if (unknown?.length) throw Error(`${field} 不支持字段 ${unknown.join('、')}`);
  return value;
}

function stringMap(value, field) {
  const map = objectField(value, null, field);
  if (Object.entries(map).some(([key, item]) => !key || typeof item !== 'string' || /[\r\n]/.test(item))) throw Error(`${field} 的键和值须为单行字符串`);
  return map;
}

function stringList(value, field) {
  if (!Array.isArray(value) || value.some(item => typeof item !== 'string' || !item.trim() || /[\r\n]/.test(item))) {
    throw Error(`${field} 须为非空字符串组成的列表`);
  }
  return value;
}

function environment(value) {
  const table = stringMap(value, 'env');
  if (Object.keys(table).some(name => !/^[a-z_][a-z0-9_]*$/i.test(name) || secretKey.test(name))) throw Error('env 含无效变量名或凭证字段');
  return Object.entries(table).map(([name, content]) => `${name}=${content}`).join('\n');
}

function exportEnvironment(value) {
  const entries = lines(value).map(line => {
    const split = line.indexOf('=');
    return [line.slice(0, split), line.slice(split + 1)];
  });
  const result = Object.fromEntries(entries);
  if (entries.length !== Object.keys(result).length) throw Error('环境变量有重复名称');
  if (entries.length) environment(result);
  return entries.length ? result : undefined;
}

const workerLabels = worker => new Map([...labelMap(worker.labels), ['worker-name', worker.name]]);
const clusterNodes = (infra, clusterId) => (infra['ops-nodes'] ?? []).filter(row => row.clusterId === clusterId);
const gpuId = (row, nodes) => {
  const worker = nodes.find(item => item.id === row.nodeId);
  const runtime = row.type || deviceTypes[String(row.vendor || '').toLowerCase()];
  return row.gpustackId || (worker?.name && runtime && Number.isInteger(row.index) ? `${worker.name}:${runtime}:${row.index}` : undefined);
};

function exportPlacement(row, infra) {
  const nodes = clusterNodes(infra, row.clusterId);
  const count = row.gpuPerReplica;
  const targets = row.placementTargets || [];
  if (row.placement === '指定节点') {
    const chosen = nodes.filter(node => targets.includes(node.id));
    if (!chosen.length || chosen.length !== targets.length) throw Error('指定节点在所属集群中不可用，无法导出选择器');
    const common = [...workerLabels(chosen[0])].filter(([key, value]) => chosen.every(node => workerLabels(node).get(key) === value));
    const matchCount = selector => nodes.filter(node => selector.every(([key, value]) => workerLabels(node).get(key) === value)).length;
    const rule = chosen.length === 1 ? [['worker-name', chosen[0].name]] : common;
    if (!rule.length || matchCount(rule) !== chosen.length) throw Error('所选节点无法用唯一一组 GPUStack 标签表示');
    return { worker_selector: Object.fromEntries(rule), gpu_selector: count ? { gpus_per_replica: count } : undefined };
  }
  if (row.placement === '指定 GPU') {
    const ids = targets.map(id => {
      const device = (infra['ops-gpus'] ?? []).find(item => item.id === id && item.clusterId === row.clusterId);
      if (!device) return undefined;
      return gpuId(device, nodes);
    });
    if (!ids.length || ids.some(id => !id) || unique(ids).length !== ids.length) throw Error('指定设备无法转换为唯一的 GPUStack GPU 标识');
    return { gpu_selector: compact({ gpu_ids: ids, gpus_per_replica: count }) };
  }
  return { gpu_selector: count ? { gpus_per_replica: count } : undefined };
}

function importPlacement(entry, current, clusterId, infra) {
  const gpu = entry.gpu_selector == null ? {} : objectField(entry.gpu_selector, ['gpu_ids', 'gpus_per_replica'], 'gpu_selector');
  const worker = entry.worker_selector == null ? {} : stringMap(entry.worker_selector, 'worker_selector');
  const ids = gpu.gpu_ids == null ? [] : stringList(gpu.gpu_ids, 'gpu_selector.gpu_ids');
  if (gpu.gpus_per_replica != null && (!Number.isInteger(gpu.gpus_per_replica) || gpu.gpus_per_replica < 1 || gpu.gpus_per_replica > 64)) {
    throw Error('gpu_selector.gpus_per_replica 须为 1–64 的整数');
  }
  if (unique(ids).length !== ids.length) throw Error('gpu_selector.gpu_ids 设备不得重复');
  if (entry.placement != null && !own(entry, 'gpu_selector') && !own(entry, 'worker_selector')) {
    return { placement: entry.placement, placementTargets: entry.placementTargets ?? [] };
  }
  const nodes = clusterNodes(infra, clusterId);
  const selected = nodes.filter(node => Object.entries(worker).every(([key, value]) => workerLabels(node).get(key) === value));
  const settings = { gpuPerReplica: gpu.gpus_per_replica ?? (ids.length || undefined) };
  if (ids.length) {
    const devices = (infra['ops-gpus'] ?? []).filter(row => row.clusterId === clusterId);
    const targets = ids.map(id => {
      const matching = devices.filter(row => gpuId(row, nodes) === id);
      if (matching.length !== 1 || !selected.some(node => node.id === matching[0].nodeId)) throw Error(`GPU ${id} 在目标集群中不可用或与节点标签冲突`);
      return matching[0].id;
    });
    return { ...settings, placement: '指定 GPU', placementTargets: targets };
  }
  if (Object.keys(worker).length) {
    if (!selected.length) throw Error('节点标签在目标集群中没有匹配项');
    return { ...settings, placement: '指定节点', placementTargets: selected.map(node => node.id) };
  }
  if (!own(entry, 'gpu_selector') && !own(entry, 'worker_selector') && current?.clusterId === clusterId && !entry.source) {
    return { ...settings, placement: current.placement, placementTargets: current.placementTargets ?? [] };
  }
  return { ...settings, placement: '自动调度', placementTargets: [] };
}

function exportParameters(row) {
  const parameters = lines(row.parameters);
  const reads = parseParameters(parameters);
  if (!row.roles && ['vLLM', 'SGLang'].includes(row.backend)) {
    const primary = row.backend === 'vLLM' ? 0 : 1;
    for (const [key, flags] of Object.entries(parameterFlags)) {
      if (row[key] != null && reads.values[key] != null && reads.values[key] !== row[key]) {
        throw Error(`部署字段 ${key} 与后端参数 ${flags[primary]} 不一致`);
      }
      if (row[key] != null && !reads.seen.has(key)) {
        parameters.push(`--${flags[primary]}=${row[key]}`);
      }
    }
  }
  return parameters.length ? parameters : undefined;
}

function parseParameters(parameters, current) {
  const values = {}, seen = new Set(), preserved = [];
  for (let index = 0; index < parameters.length; index++) {
    const line = parameters[index];
    const match = line.match(/^--([\w-]+)(?:[=\s]+(\S+))?$/);
    const key = match && Object.keys(parameterFlags).find(field => parameterFlags[field].includes(match[1]));
    if (!key) { preserved.push(line); continue; }
    const separate = match[2] == null && /^[\d.]+$/.test(parameters[index + 1] ?? '');
    const value = Number(match[2] ?? (separate ? parameters[index + 1] : undefined));
    if (!Number.isFinite(value) || seen.has(key)) throw Error(`backend_parameters: ${match[1]} 须填写且不得重复`);
    values[key] = value;
    seen.add(key);
    const synthetic = current && !lines(current.parameters).includes(line) && current[key] === value;
    if (!synthetic) preserved.push(line);
    if (separate) {
      index += 1;
      if (!synthetic) preserved.push(parameters[index]);
    }
  }
  return { values, seen, parameters: preserved.join('\n') };
}

function readRoles(entry, clusterId, infrastructure, current) {
  if (entry.roles == null) {
    if (entry.disaggregation != null) throw Error('配置 disaggregation 时须提供角色');
    return { roles: null };
  }
  if (isObject(entry.roles) && [...localAliases].some(key => key !== 'roles' && own(entry, key))) {
    return { roles: entry.roles, pdMode: entry.pdMode, roleConfigs:entry.roleConfigs, pdSettings:entry.pdSettings };
  }
  if (!Array.isArray(entry.roles)) throw Error('roles 须为角色列表');
  if (!entry.roles.length && !entry.disaggregation) return { roles: null };
  const roles = {};
  const roleConfigs = {};
  for (const role of entry.roles) {
    objectField(role, ['name', 'replicas', 'dependencies','backend','backend_version','image_name','run_command','backend_parameters',
      'env','gpu_selector','worker_selector','resources','speculative_config','extended_kv_cache'], 'roles');
    if (!roleNames.includes(role.name) || own(roles, role.name) || !Number.isInteger(role.replicas) || role.replicas < 1) throw Error('roles 包含未知、重复或副本数无效的角色');
    if (role.dependencies != null && stringList(role.dependencies, 'roles.dependencies').some(dep => role.name !== 'router' || !['prefill', 'decode'].includes(dep))) {
      throw Error('当前原型仅支持路由角色依赖预填充和解码角色');
    }
    roles[role.name] = role.replicas;
    const hasPlacement = own(role,'gpu_selector') || own(role,'worker_selector');
    const place = hasPlacement ? importPlacement(role,null,clusterId,infrastructure) : {};
    const roleEnv = role.env==null ? undefined : environment(role.env);
    const previous = current?.roleConfigs?.[role.name];
    const parentEnv = entry.env==null ? entry.environment || '' : environment(entry.env);
    const expectedEnv = previous?.environmentMode==='merge' && pdEffectiveEnvironment(parentEnv,previous);
    const preserveMerge = expectedEnv && roleEnv!==undefined && Object.keys(role.env).length===Object.keys(expectedEnv).length &&
      Object.entries(role.env).every(([name,value])=>own(expectedEnv,name) && expectedEnv[name]===value);
    const config = compact({
      backend:role.backend,backendVersion:role.backend_version,containerImage:role.image_name,containerCommand:role.run_command,
      parameters:role.backend_parameters==null ? undefined : joinParameterJson(stringList(role.backend_parameters,'roles.backend_parameters')).join('\n'),
      environment:preserveMerge ? previous.environment : roleEnv,environmentMode:preserveMerge ? 'merge' : undefined,
      resources:role.resources==null ? undefined : objectField(role.resources,['cpu','memory'],'roles.resources'),
      dependencies:role.dependencies,
      speculative:role.speculative_config==null ? undefined : readSpeculation(role.speculative_config) ?? { enabled:false },
      kvCache:importKvCache(role.extended_kv_cache,clusterId,infrastructure),
      placement:place.placement,placementTargets:place.placementTargets,
      gpuPerReplica:role.gpu_selector?.gpus_per_replica ?? (role.gpu_selector?.gpu_ids?.length ? place.gpuPerReplica/role.replicas : undefined),
    });
    if (Object.keys(config).length) roleConfigs[role.name]=config;
  }
  if (roleNames.some(name => !own(roles, name))) throw Error('当前原型需要 prefill、decode 和 router 三个角色');
  const mode = objectField(entry.disaggregation, ['mode','vendor','readiness','kv_load_failure_policy'], 'disaggregation');
  if (typeof mode.mode !== 'string') throw Error('请选择 PD 分离传输模式');
  return { roles, pdMode: mode.mode, roleConfigs, pdSettings:compact({
    vendor:mode.vendor, readiness:mode.readiness, kvLoadFailure:mode.kv_load_failure_policy,
    gather:entry.gather==null ? undefined : objectField(entry.gather,['layer','strategy'],'gather'),
  }) };
}

function exportRole(row, name, infrastructure) {
  const config = row.roleConfigs?.[name] || {};
  const effectiveEnv = config.environmentMode==='merge' && config.environment!=null ? pdEffectiveEnvironment(row.environment,config) : undefined;
  if (effectiveEnv) environment(effectiveEnv);
  return compact({
    name,replicas:row.roles[name],dependencies:config.dependencies,backend:config.backend,backend_version:config.backendVersion,
    image_name:config.containerImage,run_command:config.containerCommand,resources:config.resources,
    backend_parameters:config.parameters==null ? undefined : lines(config.parameters).flatMap(splitParameterJson),
    env:config.environment==null ? undefined : effectiveEnv ?? exportEnvironment(config.environment) ?? {},
    speculative_config:exportSpeculation(config.speculative),
    extended_kv_cache:exportKvCache(config.kvCache),
    ...exportPlacement({...config,clusterId:row.clusterId},infrastructure),
  });
}

function splitParameterJson(line) {
  const match = /^(--[\w.-]+)[=\s]+([[{].*[\]}])$/.exec(line);
  if (!match) return [line];
  try { JSON.parse(match[2]); }
  catch { return [line]; }
  return [match[1],match[2]];
}

function joinParameterJson(parameters) {
  const joined = [];
  for (const line of parameters) {
    const previous = joined.at(-1);
    const combined = previous+' '+line;
    if (/^--[\w.-]+$/.test(previous || '') && splitParameterJson(combined).length===2) joined[joined.length-1]=combined;
    else joined.push(line);
  }
  return joined;
}

function readSpeculation(value) {
  const rule = objectField(value, ['enabled', 'algorithm', 'draft_model', 'num_draft_tokens', 'ngram_min_match_length', 'ngram_max_match_length'], 'speculative_config');
  if (rule.enabled!=null && typeof rule.enabled!=='boolean') throw Error('speculative_config.enabled 须为 true 或 false');
  if (rule.enabled !== true) return null;
  if (!own(algorithms, rule.algorithm)) throw Error('speculative_config.algorithm 不受支持');
  return compact({ algorithm: algorithms[rule.algorithm], draftModel: rule.draft_model, tokens: rule.num_draft_tokens,
    min: rule.ngram_min_match_length, max: rule.ngram_max_match_length });
}

function exportSpeculation(draft) {
  if (!draft) return undefined;
  if (draft.enabled===false) return { enabled:false };
  return compact({ enabled:true,algorithm:Object.keys(algorithms).find(key=>algorithms[key]===draft.algorithm),
    draft_model:draft.draftModel,num_draft_tokens:draft.tokens,ngram_min_match_length:draft.min,ngram_max_match_length:draft.max });
}

function importKvCache(value, clusterId, infrastructure) {
  if (value==null) return undefined;
  const {enabled=false,mode='local',cache_service_id:externalId,ram_ratio,ram_size,chunk_size} =
    objectField(value,['enabled','mode','cache_service_id','ram_ratio','ram_size','chunk_size'],'extended_kv_cache');
  if (typeof enabled!=='boolean' || !['local','shared'].includes(mode ?? 'local')) throw Error('extended_kv_cache 开关或方式无效');
  if (!enabled) return {enabled:false};
  if (mode==='shared') {
    if (!Number.isSafeInteger(externalId) || externalId<1) throw Error('共享缓存须指定有效的 cache_service_id');
    const matching = (infrastructure['ops-cache-acceleration'] || []).filter(row=>row.gpustackId===externalId && row.clusterId===clusterId);
    if (matching.length!==1) throw Error('cache_service_id 在目标集群中没有唯一的对应缓存服务');
    const {id,name,provider} = matching[0];
    return {enabled:true,mode,service:{id,name,provider,clusterId,gpustackId:externalId}};
  }
  if (externalId!=null) throw Error('仅共享缓存可以设置 cache_service_id');
  return compact({enabled:true,mode:'local',ram_ratio,ram_size,chunk_size});
}

function exportKvCache(value) {
  if (!value) return undefined;
  if (!value.enabled) return {enabled:false};
  if (value.mode==='shared') {
    if (!Number.isSafeInteger(value.service?.gpustackId) || value.service.gpustackId<1) throw Error('共享 KV 缓存服务缺少对应的 GPUStack ID');
    return {enabled:true,mode:'shared',cache_service_id:value.service.gpustackId};
  }
  return compact({enabled:true,mode:'local',ram_ratio:value.ram_ratio,ram_size:value.ram_size,chunk_size:value.chunk_size});
}

function readAdapters(value) {
  if (!Array.isArray(value)) throw Error('lora_list 须为列表');
  return value.map(adapter => {
    objectField(adapter, ['lora_name', 'lora_repo_name', 'source', 'local_path'], 'lora_list');
    if (adapter.source !== 'local_path') throw Error('当前原型只支持已挂载的本地 LoRA 适配器');
    return { name: adapter.lora_name, path: adapter.local_path || adapter.lora_repo_name };
  });
}

function importSchedule(entry, current, roles, nativeSource) {
  const fromDocument = own(entry, 'scaling_schedule');
  const value = fromDocument ? entry.scaling_schedule : own(entry, 'scalingSchedule')
    ? entry.scalingSchedule : nativeSource ? null : current?.scalingSchedule;
  if (value == null) return undefined;
  objectField(value, ['enabled', 'paused', 'baseline_replicas', 'rules'], 'scaling_schedule');
  if (Array.isArray(value.rules)) for (const rule of value.rules) {
    objectField(rule, ['start_cron', 'duration_seconds', 'replicas', 'name'], 'scaling_schedule.rules');
  }
  const schedule = validateDeploymentSchedule(value, { roles });
  if (fromDocument && current && schedule.enabled) {
    return { ...schedule, paused: Boolean(current.scalingSchedule?.enabled && current.scalingSchedule?.paused) };
  }
  return schedule;
}

function exportSchedule(schedule) {
  if (!schedule) return undefined;
  return compact({ enabled: schedule.enabled, baseline_replicas: schedule.baseline_replicas,
    rules: schedule.rules.map(rule => compact(rule)) });
}

function sourceFrom(row, state) {
  const weight = state.artifacts?.find(item => item.id === row.weightId);
  const type = sourceCodes[row.source] || 'local_path';
  if (type === 'huggingface') return { source: type, huggingface_repo_id: row.repository, huggingface_filename: row.filename || undefined };
  if (type === 'model_scope') return { source: type, model_scope_model_id: row.repository, model_scope_file_path: row.filename || undefined };
  return { source: type, local_path: row.weightPath || weight?.path || weight?.localPath };
}

const sameRuntime = (item, image) => [item.image, item.imageName, item.registryPath].includes(image);

export function yamlDeploymentDocument(row, state, infrastructure = {}) {
  const model = deployableModels(state).find(item => item.id === row.modelId);
  const runtime = state.artifacts?.find(item => item.id === row.runtimeId);
  const image = row.containerImage || runtime?.image || runtime?.imageName || runtime?.registryPath;
  const draft = row.speculative;
  const source = sourceFrom(row, state);
  const replicaTarget = row.scalingSchedule?.enabled ? row.scalingSchedule.baseline_replicas
    : row.status === '停止' ? 0 : row.roles ? 1 : row.replicas;
  if (!source.local_path && !source.huggingface_repo_id && !source.model_scope_model_id) throw Error('缺少可导出的模型仓库或挂载路径');
  return compact({
    name: row.name, cluster_name: state.clusters.find(cluster => cluster.id === row.clusterId)?.name, ...source,
    description: row.description, replicas: replicaTarget,
    categories: typeCategories[model?.type] ? [typeCategories[model.type]] : undefined,
    placement_strategy: row.placementStrategy || 'spread',
    cpu_offloading: row.offloading, distributed_inference_across_workers: row.distributedInference,
    ...exportPlacement(row, infrastructure),
    backend: row.backend || (image ? 'Custom' : undefined), backend_version: row.backendVersion || undefined,
    backend_parameters: exportParameters(row), image_name: image, run_command: row.containerCommand || undefined,
    native_anthropic_api: row.nativeAnthropic, env: exportEnvironment(row.environment), restart_on_error: row.restartOnError,
    extended_kv_cache:exportKvCache(row.kvCache),
    speculative_config: exportSpeculation(draft),
    generic_proxy: row.genericProxy, lora_list: row.loraAdapters?.length ? row.loraAdapters.map(adapter => ({ lora_name: adapter.name, source: 'local_path', local_path: adapter.path })) : undefined,
    scaling_schedule: exportSchedule(row.scalingSchedule),
    roles: row.roles ? roleNames.map(name => exportRole(row,name,infrastructure)) : undefined,
    disaggregation: row.roles && row.pdMode ? compact({ mode: row.pdMode,vendor:row.pdSettings?.vendor,
      readiness:row.pdSettings?.readiness,kv_load_failure_policy:row.pdSettings?.kvLoadFailure }) : undefined,
    gather:row.roles ? row.pdSettings?.gather : undefined,
    enable_model_route: row.enableInternalRoute !== false,
  });
}

export function deploymentYamlText(rows, state, infrastructure = {}) {
  return rows.map(row => {
    const omitted = [!row.scalingSchedule && row.scalingRules?.length && '旧版定时扩缩容规则', row.cacheAcceleration && '缓存加速'].filter(Boolean);
    const note = omitted.length ? `# MoMA 配置未写入 GPUStack 文件：${omitted.join('、')}\n` : '';
    return note + dump(yamlDeploymentDocument(row, state, infrastructure), { lineWidth: -1, noRefs: true });
  }).join('---\n');
}

function readEntry(entry, state, selectedCluster, infrastructure) {
  if (!isObject(entry) || typeof entry.name !== 'string' || !entry.name.trim()) throw Error('缺少部署名称');
  for (const key of Object.keys(entry)) {
    if (managedFields.has(key)) throw Error(`不允许导入服务端管理字段 ${key}`);
    if (!portableFields.has(key) && !localAliases.has(key)) throw Error(`不支持字段 ${key}`);
  }
  const unsupported = ['gpu_type_selector', ...(!entry.roles ? ['gather'] : [])].find(key => entry[key] != null);
  if (unsupported) throw Error(`${unsupported} 在当前原型中不可用`);
  if (entry.cluster_name != null && (typeof entry.cluster_name !== 'string' || !entry.cluster_name.trim())) throw Error('cluster_name 须为集群名称');
  const existing = state.deployments.filter(row => !row.retiredAt && (entry.deploymentId ? row.deploymentId === entry.deploymentId : row.name === entry.name));
  if (existing.length > 1) throw Error('同名部署无法唯一确定，请提供有效的 MoMA 部署编码');
  const current = existing[0];
  const exactCluster = selectedCluster || entry.clusterId;
  const clusters = state.clusters.filter(row => exactCluster ? row.id === exactCluster : entry.cluster_name ? row.name === entry.cluster_name :
    entry.cluster ? [row.id, row.clusterId, row.name].includes(entry.cluster) : row.id === current?.clusterId);
  if (clusters.length !== 1) throw Error('目标集群无法唯一确定');
  const clusterId = clusters[0].id;
  const nativeSource = own(sourceNames, entry.source);
  const source = nativeSource ? sourceNames[entry.source]
    : own(sourceCodes, entry.source) || entry.source === '模型库' ? entry.source : undefined;
  if (entry.source != null && !source) throw Error('不支持的模型来源');
  const repository = (source === 'Hugging Face' ? entry.huggingface_repo_id : entry.model_scope_model_id) ?? entry.repository;
  const filename = (source === 'Hugging Face' ? entry.huggingface_filename : entry.model_scope_file_path) ?? entry.filename;
  if (source === 'Hugging Face' || source === 'ModelScope') {
    if (typeof repository !== 'string' || !repository.trim()) throw Error('请填写有效的模型仓库');
  } else if (entry.source === 'local_path' && (typeof entry.local_path !== 'string' || !entry.local_path.trim())) {
    throw Error('本地模型来源须填写 local_path');
  }
  if (filename != null && typeof filename !== 'string') throw Error('模型文件名须为字符串');
  const short = value => typeof value === 'string' ? value.replace(/\/$/, '').split('/').at(-1)?.toLowerCase() : '';
  const reference = short(repository || entry.local_path || entry.weightPath);
  const models = deployableModels(state);
  const exact = models.filter(model => entry.modelId ? model.id === entry.modelId : entry.model ? model.modelId === entry.model :
    reference && (model.modelId?.toLowerCase() === reference || (repository && (model.repository || model.profile?.repository) === repository)));
  const sameSource = current && (!entry.source || ((!repository || current.repository === repository) &&
    (!entry.local_path || current.weightPath === entry.local_path || sourceFrom(current, state).local_path === entry.local_path)));
  const model = exact.length === 1 ? exact[0] : exact.length === 0 && !entry.modelId && !entry.model && sameSource
    ? models.find(item => item.id === current.modelId) : undefined;
  if (!model) throw Error('已登记模型无法唯一确定');
  const categories = entry.categories == null ? [] : stringList(entry.categories, 'categories');
  const expectedCategory = typeCategories[model.type];
  if (categories.length && (!expectedCategory || !categories.includes(expectedCategory))) throw Error('YAML 模型类别和已登记模型不一致');

  const aliases = Object.fromEntries(deploymentConfigKeys.filter(key => own(entry, key)).map(key => [key, entry[key]]));
  const retained = current ? Object.fromEntries(deploymentConfigKeys.filter(key => current[key] !== undefined).map(key => [key, current[key]])) : {};
  const roleSettings = own(entry, 'roles') || own(entry, 'disaggregation') ? readRoles(entry,clusterId,infrastructure,current)
    : nativeSource ? { roles: null, pdMode: undefined, roleConfigs:undefined, pdSettings:undefined } : {};
  const scalingSchedule = importSchedule(entry, current, roleSettings.roles || (!nativeSource && current?.roles), nativeSource);
  const replicas = entry.replicas;
  if (replicas != null && (!Number.isInteger(replicas) || replicas < 0 || replicas > 100)) throw Error('replicas 须为 0–100 的整数');
  const roleCounts = roleSettings.roles ? Object.values(roleSettings.roles).reduce((sum, n) => sum + n, 0) : undefined;
  if (roleCounts && !isObject(entry.roles) && replicas != null && replicas > 1) throw Error('使用 roles 时，GPUStack replicas 须为 0 或 1');
  const importStopped = scalingSchedule?.enabled ? scalingSchedule.paused : replicas == null ? undefined : replicas === 0;
  const replicaTarget = scalingSchedule?.enabled ? scalingSchedule.baseline_replicas
    : roleCounts ?? (replicas === 0 ? current?.replicas || 1 : replicas ?? 1);
  const nativeBackend = entry.backend || (/\.gguf$/i.test(filename || entry.local_path || '') ? 'Custom' : 'vLLM');
  const explicitlyCustom = entry.backend === 'Custom';
  const backend = explicitlyCustom ? undefined : entry.backend ?? (nativeSource && nativeBackend !== 'Custom' ? nativeBackend : undefined);
  const image = entry.image_name ?? entry.containerImage;
  if (nativeSource && image && entry.backend_version) throw Error('image_name 与 backend_version 不能同时设置');
  const runtime = image && !backend && state.artifacts?.find(item => item.id === current?.runtimeId && sameRuntime(item, image));
  const inferredVersion = (infrastructure['ops-inference-backends'] ?? []).find(row => row.name === backend && row.status !== '已停用')?.version;
  const runtimeMode = entry.runtimeMode || (runtime ? '已登记运行时镜像' : image ? '自定义镜像' : backend ? '推理后端版本' : current?.runtimeMode || '已登记运行时镜像');
  if (nativeSource && nativeBackend === 'Custom' && !image && current?.runtimeMode !== '自定义镜像') throw Error('自定义推理后端须提供 image_name');
  if (runtimeMode === '推理后端版本' && !(entry.backend_version || entry.backendVersion || inferredVersion || (current?.backend === backend && current.backendVersion))) {
    throw Error('请指定已登记推理后端的版本');
  }
  const parameterData = entry.backend_parameters != null ? parseParameters(stringList(entry.backend_parameters, 'backend_parameters'), current) : {};
  const place = importPlacement(entry, current, clusterId, infrastructure);
  const gpuPerReplica = place.gpuPerReplica ?? entry.gpuPerReplica ??
    (parameterData.values?.tensorParallel || 1) * (parameterData.values?.pipelineParallel || 1);
  const localPath = entry.local_path ?? entry.weightPath;
  const weightId = entry.weightId ?? (sameSource && current?.weightId && (!localPath || sourceFrom(current, state).local_path === localPath) ? current.weightId : '');
  const weightPath = weightId ? '' : localPath || (sameSource ? current?.weightPath : '') || (repository ? `/models/${model.modelId}` : '');
  const deploymentId = entry.deploymentId || current?.deploymentId || entry.name.trim().toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 63).replace(/-+$/g, '');
  if (!deploymentId) throw Error('无法生成部署编码，请填写 deploymentId');

  for (const key of ['cpu_offloading', 'distributed_inference_across_workers', 'restart_on_error', 'native_anthropic_api', 'enable_model_route', 'generic_proxy']) {
    if (entry[key] != null && typeof entry[key] !== 'boolean') throw Error(`${key} 须为 true 或 false`);
  }
  const strategy = entry.placement_strategy ?? entry.placementStrategy ?? (nativeSource ? 'spread' : current?.placementStrategy);
  if (strategy != null && !['spread', 'binpack'].includes(strategy)) throw Error('placement_strategy 须为 spread 或 binpack');
  const restartDefault = nativeSource ? entry.restart_on_error !== null : current?.restartOnError;
  return {
    ...retained, ...aliases, ...place, ...roleSettings, ...parameterData.values, name: entry.name.trim(), deploymentId, clusterId, modelId: model.id,
    runtimeMode, runtimeId: runtimeMode === '已登记运行时镜像' ? entry.runtimeId ?? runtime?.id ?? current?.runtimeId : undefined,
    backend: runtimeMode === '推理后端版本' ? backend ?? current?.backend : runtimeMode === '自定义镜像' ? backend : undefined,
    backendVersion: runtimeMode === '推理后端版本' ? entry.backend_version ?? entry.backendVersion ?? (current?.backend === backend ? current?.backendVersion : undefined) ?? inferredVersion : undefined,
    containerImage: runtimeMode === '自定义镜像' ? image || current?.containerImage : undefined,
    containerCommand: runtimeMode === '自定义镜像' ? entry.run_command ?? entry.containerCommand : undefined,
    source: sameSource && current?.source === '模型库' ? '模型库' : source ?? current?.source ?? '本地路径', repository, filename,
    weightPath, weightId, modelFileId: entry.modelFileId ?? (sameSource && current?.clusterId === clusterId && place.placementTargets.includes(current?.placementTargets?.[0]) ? current?.modelFileId : undefined),
    replicas: replicaTarget, scalingSchedule, ...(importStopped != null && { importStopped }),
    namespace: entry.namespace || current?.namespace || 'inference', gpuPerReplica,
    tensorParallel: entry.tensorParallel ?? parameterData.values?.tensorParallel ?? (current?.gpuPerReplica === gpuPerReplica ? current?.tensorParallel : undefined) ?? gpuPerReplica,
    pipelineParallel: entry.pipelineParallel ?? parameterData.values?.pipelineParallel ?? (current?.gpuPerReplica === gpuPerReplica ? current?.pipelineParallel : undefined) ?? 1,
    gpuMemoryUtilization: entry.gpuMemoryUtilization ?? parameterData.values?.gpuMemoryUtilization ?? current?.gpuMemoryUtilization ?? .9,
    startupTimeout: entry.startupTimeout ?? current?.startupTimeout ?? 600,
    placementStrategy: strategy === 'binpack' ? strategy : undefined,
    parameters: parameterData.parameters ?? entry.parameters ?? '', environment: entry.env == null ? entry.environment || '' : environment(entry.env),
    kvCache:entry.extended_kv_cache==null ? entry.kvCache ?? (!nativeSource ? current?.kvCache : undefined)
      : importKvCache(entry.extended_kv_cache,clusterId,infrastructure),
    loraAdapters: entry.lora_list == null ? entry.loraAdapters ?? [] : readAdapters(entry.lora_list),
    speculative: entry.speculative_config == null ? entry.speculative ?? null : readSpeculation(entry.speculative_config),
    offloading: entry.cpu_offloading ?? entry.offloading,
    distributedInference: entry.distributed_inference_across_workers ?? entry.distributedInference ??
      (nativeSource ? distributedBackends.has(nativeBackend) : current?.distributedInference),
    restartOnError: entry.restart_on_error ?? entry.restartOnError ?? restartDefault,
    nativeAnthropic: entry.native_anthropic_api ?? entry.nativeAnthropic,
    genericProxy: entry.generic_proxy ?? entry.genericProxy,
    enableInternalRoute: entry.enable_model_route ?? entry.enableInternalRoute ?? (nativeSource ? false : current?.enableInternalRoute),
  };
}

export function readDeploymentYaml(entries, state, chosenCluster, infrastructure = {}) {
  const names = new Set();
  return entries.map((entry, index) => {
    try {
      const data = readEntry(entry, state, chosenCluster, infrastructure);
      if (names.has(data.name)) throw Error('部署名称重复');
      names.add(data.name);
      return data;
    } catch (issue) {
      throw Error(`第 ${index + 1} 项${typeof entry?.name === 'string' ? `「${entry.name}」` : ''}：${issue.message}`);
    }
  });
}
