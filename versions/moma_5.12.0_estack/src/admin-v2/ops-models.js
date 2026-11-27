import { dump } from 'js-yaml';
import { callLogWorkbook } from './call-log-xlsx.mjs';
import { alignedBenchmarkExportFields, alignBenchmarkPage, cloneAlignedBenchmark, completeAlignedBenchmark, isBenchmarkTargetReady } from './benchmark-alignment.js';
import { INFERENCE_BACKEND_PAGE } from './inference-backend.js';
import { gpuStackCatalogue } from './model-catalogue-data.js';
import { browseCatalogue, catalogueCategoryLabels } from './model-catalogue.js';
import { activeCacheProvider, cacheDeclaredValues, cacheFieldState, cacheL2Issue, cacheL2Values, cacheProviderCatalogue, cacheProviderFields, cacheRequestedMemory, cacheVersionsForProvider, configuredCacheProviders } from './cache-provider-fields.js';
import { labelIssue, labelList, labelMap, normalizedLabelPairs } from './ops-resources.js';
import { deploymentInstances } from './deployments.js';

const benchmarksPage = 'ops-benchmarks';
const backendsPage = 'ops-inference-backends';
const cachePage = 'ops-cache-acceleration';
const nodesPage = 'ops-nodes';
const filesPage = 'ops-model-files';
export const catalogueCategories = { llm: '语言模型', embedding: '向量模型', reranker: '重排序', image: '图像生成',
  text_to_speech: '语音合成', speech_to_text: '语音识别', decision: '决策', vision: '多模态理解', audio: '语音' };
const sources = ['Hugging Face', 'ModelScope', '本地路径'];
const list = (records, page) => records[page] || [];
const find = (records, page, id) => list(records, page).find(row => row.id === id);
const labelOf = page => (id, _row, records) => find(records, page, id)?.name || (id ? '记录不可用' : undefined);
const optionsOf = (records, page, match = () => true) => list(records, page).filter(match).map(row => ({ value: row.id, label: row.name }));
const field = (key, label, config) => ({ key, label, ...config });
const name = label => field('name', label, { required: true });
const select = (key, label, options, config) => field(key, label, { type: 'select', options, ...config });
const description = field('description', '描述', { type: 'textarea' });
const created = field('createdAt', '创建时间', { width: 165, sorter: true });
const status = field('status', '状态', { status: true, width: 100 });
const suffix = unit => value => value == null || value === '' ? undefined : `${value} ${unit}`;
const clusterOptions = records => optionsOf(records, 'clusters', row => row.status === '运行中');
const nodeOptions = (records, draft) => optionsOf(records, nodesPage, row => row.status === '就绪' && (!draft.clusterId || row.clusterId === draft.clusterId));
const benchmarkActive = row => ['排队中', '运行中'].includes(row.status);
export const benchmarkLog = row => (row.runEvents || [{ at: row.createdAt, message: `模拟测试已登记，状态为${row.status}。` }]);
const targetName = (value, row, records) => row.targetName || labelOf('deployments')(value, row, records);
const benchmarkTargetReady = isBenchmarkTargetReady;
const urlValid = value => {
  try {
    const url = new URL(value);
    return ['http:', 'https:'].includes(url.protocol) && !url.username && !url.password && !url.search && !url.hash;
  } catch {
    return false;
  }
};

const jsonData = object => JSON.stringify(object, null, 2);
const yamlData = object => dump(object, { noRefs: true, lineWidth: 100 });
const artifact = (name, content, type = 'text/plain;charset=utf-8') => ({ name, content, type });

export function linkedDeploymentModel(row, models) {
  if (row.modelId) return models.find(model => model.id === row.modelId);
  if (!row.modelCode) return undefined;
  const matches = models.filter(model => model.modelId === row.modelCode);
  return matches.length === 1 ? matches[0] : undefined;
}

const modelCatalog = {
  title: '模型库',
  searchPlaceholder: '名称搜索',
  searchRows: browseCatalogue,
  views: ['cards'], initialPageSize: 24, loadMore: true, loadOnScroll: true,
  actionsInToolbar: true, hideResetFilter: true,
  columns: [field('name', '模型')],
  filters: [field('category', '类别', { options: Object.entries(catalogueCategoryLabels).map(([value, label]) => ({ value, label })),
    match: (value, row) => row.categories?.includes(value) || row.category === catalogueCategories[value] })],
  editable: false,
  deletable: false,
  seed: [
    { id: 'catalog-glm52', name: 'GLM-5.2', modelCode: 'glm-5.2', category: '语言模型', maker: '智谱 AI', source: 'Hugging Face', repository: 'zai-org/GLM-5.2-FP8', spec: '高吞吐 · FP8', backend: 'SGLang', license: 'MIT', description: '长上下文推理、复杂代码工程与多步任务。' },
    { id: 'catalog-glm53', name: 'GLM-5.3', modelCode: 'glm-5.3', category: '语言模型', maker: '智谱 AI', source: 'Hugging Face', repository: 'zai-org/GLM-5.3', spec: '标准 · FP8', backend: 'vLLM', license: 'GLM-5.3', description: '支持长上下文推理、编程和多步工具调用。' },
    { id: 'catalog-bge-m3', name: 'BGE-M3', modelCode: 'bge-m3', category: '向量模型', maker: 'BAAI', source: 'Hugging Face', repository: 'BAAI/bge-m3', spec: '标准 · BF16', backend: 'vLLM', license: 'MIT', description: '面向多语言检索的文本向量模型。' },
    { id: 'catalog-bge-large-zh', name: 'BGE Large ZH v1.5', modelCode: 'bge-large-zh-v1.5', category: '向量模型', maker: 'BAAI', source: 'Hugging Face', repository: 'BAAI/bge-large-zh-v1.5', spec: '标准 · BF16', backend: 'vLLM', license: 'MIT', description: '将中文句子和段落转换为语义向量，支持相似度检索。' },
    { id: 'catalog-bge-rerank', name: 'BGE Reranker v2 M3', modelCode: 'bge-reranker-v2-m3', category: '重排序', maker: 'BAAI', source: 'Hugging Face', repository: 'BAAI/bge-reranker-v2-m3', spec: '标准 · BF16', backend: 'vLLM', license: 'Apache-2.0', description: '为查询和候选文档打分，提升检索结果相关性。' },
    { id: 'catalog-qwen35-9b', name: 'Qwen3.5-9B', category: '多模态理解', maker: 'Qwen', source: 'Hugging Face', repository: 'Qwen/Qwen3.5-9B', spec: '低延迟 · BF16', backend: 'vLLM', license: 'Apache-2.0', description: '支持文本与图像输入，可用于视觉问答与文档理解。' },
    { id: 'catalog-deepseek-r1', name: 'DeepSeek-R1-0528', category: '语言模型', maker: 'DeepSeek', source: 'Hugging Face', repository: 'deepseek-ai/DeepSeek-R1-0528', spec: '高吞吐 · FP8', backend: 'SGLang', license: 'MIT', description: '用于数学、逻辑推理与代码生成。' },
  ],
};

const linkedCatalogueRows = modelCatalog.seed;
const officialCatalogueNames = new Set(gpuStackCatalogue.map(item => item.name.toLowerCase()));
modelCatalog.seed = [
  ...gpuStackCatalogue.map(row => {
    const existing = linkedCatalogueRows.find(item => item.name.toLowerCase() === row.name.toLowerCase());
    const top = row.specs[0];
    return {
      id: 'catalog-upstream-' + encodeURIComponent(row.name.toLowerCase()).replaceAll('%', '_'),
      ...existing, ...row, name: existing?.name || row.name,
      source: top.source === 'model_scope' ? 'ModelScope' : 'Hugging Face',
      repository: top.repository, backend: top.backend, spec: top.mode,
      license: row.licenses?.join('、') || existing?.license, category: catalogueCategories[row.categories?.[0]],
    };
  }),
  ...linkedCatalogueRows.filter(row => !officialCatalogueNames.has(row.name.toLowerCase())),
];

export function benchmarkExport(rows) {
  if (!rows.length || rows.length > 20) throw Error('每次可导出 1–20 条测试记录。');
  const results = rows.map(row => ({
    name: row.name, description: row.description || undefined, profile: row.profile,
    model_instance_name: row.targetMode === '模型实例' ? row.targetName : undefined,
    model_name: row.targetMode === '路由' ? row.targetName : undefined,
    target_mode: row.targetMode === '路由' ? 'route' : 'model_instance',
    dataset_name: row.dataset, dataset_input_tokens: row.inputTokens, dataset_output_tokens: row.outputTokens,
    dataset_seed: row.randomSeed, load_type: row.loadType === '并发数' ? 'concurrency' : 'fixed_rate', request_rate: row.load,
    total_requests: row.requests, max_seconds: row.duration, slo_p95_ttft_ms: row.latencySlo,
    stages: row.stages?.map(stage => ({ rate: stage.load, max_requests: stage.requests, max_seconds: stage.duration })),
    ...alignedBenchmarkExportFields(row),
    result: row.status === '已完成' ? { source: 'simulated', completed_requests: row.completed, success_rate: row.resultRate,
      output_tokens_per_second: row.throughput, time_to_first_token_p95: row.ttft, inter_token_latency_p95: row.tpot, request_latency_p95_ms: row.totalLatency } : undefined,
  }));
  return artifact(rows.length === 1 ? `benchmark-${rows[0].id}.yml` : 'benchmark-results.yml', yamlData({ benchmarks: results }), 'application/yaml');
}

function benchmarkWorkbook(rows, records, columns) {
  const headers = columns.map(column => column.label);
  const data = rows.map(row => columns.map(column => column.key === 'targetId' ? targetName(row.targetId, row, records) :
    typeof row[column.key] === 'number' ? row[column.key] : column.format?.(row[column.key], row, records) ?? row[column.key]));
  return artifact('benchmark.xlsx', callLogWorkbook([headers, ...data], 'benchmark_data'),
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
}
function benchmarkResults(row) {
  const requests = Number(row.requests) || 500;
  const load = Number(row.load) || 1;
  const completed = Math.max(1, Math.round(requests * (load > 32 ? 0.976 : 0.998)));
  const tps = Math.round(load * (Number(row.outputTokens) || 128) * (row.loadType === '并发数' ? 0.59 : 0.83));
  const ttft = 190 + load * 12;
  const tpot = Number((12.6 + load * 0.24).toFixed(2));
  const resultRate = completed / requests * 100;
  const stages = row.loadPattern === '手工分阶段' && row.stages?.length ? row.stages :
    row.loadPattern === '自动调优' && Number(row.minLoad) < load
      ? [...new Set([Number(row.minLoad),Math.round((Number(row.minLoad) + load) / 2), load])].map(load=>({load}))
      : [{ load,requests }];
  const stageResults = stages.map((stage,index)=>{
    const stageLoad = Number(stage.load);
    const firstToken = 190 + stageLoad * 12;
    const perToken = Number((12.6 + stageLoad * .24).toFixed(2));
    return { id:index + 1, load:stageLoad, requests:stage.requests ?? null,
      throughput:Math.round(tps * stageLoad / load), ttft:firstToken, tpot:perToken,
      totalLatency:Math.round(firstToken + perToken * (Number(row.outputTokens) || 128)) };
  });
  return { status: '已完成', requests, completed, resultRate, throughput: tps, ttft, tpot, totalLatency: Math.round(ttft + tpot * (Number(row.outputTokens) || 128)), stageResults,
    resultSource: '模拟结果', runEvents: addRunEvent(row, `已生成模拟结果，成功 ${completed}/${requests} 个请求。`) };
}

const addRunEvent = (row, message) => [...(row.runEvents || []), { at: new Date().toISOString(), message }];
export const benchmarkClone = cloneAlignedBenchmark;

function completedBenchmarkSeed(row) {
  const submittedAt = new Date(row.createdAt);
  const result = completeAlignedBenchmark(row, submittedAt);
  const duration = result.stageResults.reduce((total, stage) => total + stage.duration, 0);
  const finishedAt = new Date(submittedAt.getTime() + Math.ceil(duration * 1000)).toISOString();
  return { ...row, ...result, duration, finishedAt,
    environment: { ...row.environment, deployment: row.modelName, capturedAt: row.createdAt, targetInstanceId: row.targetSelection },
    runEvents: [
      { at: row.createdAt, message: `开始模拟测试，目标实例 ${row.modelInstanceName}。` },
      ...result.runEvents.map(event => ({ ...event, at: finishedAt })),
    ],
  };
}

const benchmarks = {
  title: '基准测试',
  description: '对运行中的模型实例执行测试，比较吞吐量和时延。',
  createLabel: '添加基准测试',
  searchPlaceholder: '搜索测试名称或测试对象',
  searchKeys: ['name', 'targetName'],
  editable: true,
  deletable: true,
  detailRoute: true,
  columnSettings: true,
  rowSelection: true,
  actionMenu: true,
  actionWidth: 128,
  columns: [field('name', '测试名称', { width: 170 }), field('targetId', '测试对象', { format: targetName, width: 195 }), field('profile', '测试方案'), status, field('throughput', '输出吞吐量', { format: suffix('Token/s') }), field('ttft', 'P95 TTFT', { format: suffix('ms') }), created],
  filters: [field('status', '测试状态', { options: ['排队中', '运行中', '已完成', '已停止', '失败'] }), field('clusterId', '集群', { options: records => optionsOf(records, 'clusters') })],
  fields: [name('测试名称'), description],
  detail: [field('name', '测试名称'), field('clusterId', '执行集群', { format: labelOf('clusters') }), field('targetMode', '目标类型'), field('targetId', '测试对象', { format: targetName }), field('profile', '测试方案'), field('dataset', '数据集'), field('loadType', '负载类型'), field('load', '负载值'), field('requests', '请求数'), field('completed', '成功请求数'), field('resultRate', '成功率', { format: value => value == null ? undefined : `${value.toFixed(2)}%` }), field('throughput', '输出吞吐量', { format: suffix('Token/s') }), field('ttft', 'P95 TTFT', { format: suffix('ms') }), field('tpot', 'P95 TPOT', { format: suffix('ms') }), field('latencySlo', 'P95 TTFT 目标', { format: suffix('ms') }), field('resultSource', '结果来源'), status, description, created],
  actions: [
    { label: '克隆', editor: { create: true, title: '克隆基准测试', prefill: benchmarkClone,
    } },
    { label: '查看日志', panel: 'logs', sheet: true },
    { label: '停止', when: benchmarkActive, confirm: '停止本次测试？已提交的测试参数将保留。', apply: row => ({ status: '已停止', operationStartedAt: null, runEvents: addRunEvent(row, '已停止模拟执行。') }) },
    { label: '导出结果', when: row => row.status === '已完成', download: row => benchmarkExport([row]) },
  ],
  batchActions: [
    { label: '导出选中结果', when: rows => rows.length > 0, download: benchmarkWorkbook },
    { label: '批量删除', when: rows => rows.length > 0 && rows.every(row => !benchmarkActive(row)), confirm: '删除所选基准测试和模拟报告？', apply: () => [] },
  ],
  seed: [
    { id: 'bench-glm-throughput', name: 'GLM-5.2 吞吐基线', profile: '吞吐量', clusterId: 'cluster-sz-a', targetMode: '模型实例', targetId: 'deployment-glm', replica: 1, targetName: 'GLM-5.2 生产服务 · 副本 1', dataset: 'ShareGPT', loadType: '并发数', load: 16, requests: 600, completed: 597, duration: 180, throughput: 1217, ttft: 342, tpot: 18.2, resultRate: 99.5, resultSource: '模拟结果', status: '已完成', createdAt: '2026-11-24 10:12:00' },
    { id: 'bench-glm-regression', name: 'GLM-5.2 固定速率回归', profile: '自定义', clusterId: 'cluster-sz-a', targetMode: '模型实例', targetId: 'deployment-glm', replica: 2, targetName: 'GLM-5.2 生产服务 · 副本 2', dataset: 'Random', inputTokens: 1024, outputTokens: 128, loadType: '固定请求速率', load: 8, requests: 500, duration: 120, status: '已停止', createdAt: '2026-11-25 15:30:00' },
    completedBenchmarkSeed({
      id: 'bench-ds-throughput-nj', name: 'DeepSeek-V4-Pro 南京吞吐摸底', profile: '最大吞吐量',
      clusterId: 'cluster-nj-a', targetMode: '模型实例', targetId: 'deployment-ds', targetSelection: 'deployment-ds:1',
      modelName: 'DeepSeek-V4-Pro 生产服务', modelInstanceName: 'deploy-deepseek-v4-1',
      targetName: 'DeepSeek-V4-Pro 生产服务 / deploy-deepseek-v4-h7m2k', replica: 1,
      dataset: 'Random', inputTokens: 2048, outputTokens: 128, loadType: '固定请求速率', loadPattern: '自动调优',
      minLoad: 2, maxLoad: 12, maxPoints: 6, maxTotalSeconds: 1200, pinSeed: true, randomSeed: 113,
      createdAt: '2026-11-26T15:10:00+08:00',
      environment: { cluster: '南京智算一池', node: 'worker-nj-a-01', gpu: 'H20',
        cacheServices: [{ id: 'cache-nanjing', name: 'nj-inference-kv' }] },
    }),
    completedBenchmarkSeed({
      id: 'bench-glm-latency-sz', name: 'GLM-5.2 苏州延迟巡检', profile: '满足延迟 SLO',
      clusterId: 'cluster-sz-a', targetMode: '模型实例', targetId: 'deployment-glm', targetSelection: 'deployment-glm:1',
      modelName: 'GLM-5.2 生产服务', modelInstanceName: 'deploy-glm-52-1',
      targetName: 'GLM-5.2 生产服务 / deploy-glm-52-a9k3m', replica: 1,
      dataset: 'Random', inputTokens: 512, outputTokens: 128, loadType: '并发数', loadPattern: '自动调优',
      minLoad: 4, maxLoad: 32, maxPoints: 8, maxTotalSeconds: 1200, pinSeed: true, randomSeed: 214,
      sloTargets: { p95Ttft: 260, p95Tpot: 16 }, latencySlo: 260, tpotSlo: 16,
      createdAt: '2026-11-27T09:40:00+08:00',
      environment: { cluster: '苏州智算一池', node: 'worker-sz-a-01', gpu: 'L40S',
        cacheServices: [{ id: 'cache-suzhou-glm', name: 'sz-glm-lmcache' }] },
    }),
  ],
};

const plainEnv = value => !value || String(value).split('\n').filter(line => line.trim()).every(line => /^[A-Za-z_][A-Za-z0-9_]*=[^\n]*$/.test(line) && !/(?:TOKEN|SECRET|PASSWORD|API_KEY|CREDENTIAL)/i.test(line.split('=')[0]));

const externalCache = draft => draft.provider === 'Mooncake';
export function cacheParameterGroups(draft, framework) {
  const provider = activeCacheProvider(draft.provider);
  if (!provider?.components?.length) return [{ key:'main',label:'启动参数' }];
  const fieldMap = new Map(cacheFieldState(provider,draft.providerValues,framework,draft).map(item=>[item.field.key,item.effective]));
  return provider.components.filter(role=>!role.enabledBy ||
    (fieldMap.get(role.enabledBy) ?? draft[role.enabledBy]) === role.enabledWhen);
}
const pairKeysUnique = entries => new Set(entries.map(entry => entry.split('=')[0])).size === entries.length;
const cacheNodes = (records, draft) => nodeOptions(records, draft).filter(option => {
  const labels = labelMap(find(records, nodesPage, option.value)?.labels);
  return normalizedLabelPairs(draft.selector).every(([key,value]) => labels.get(key) === value);
});
const acceleratorFramework = new Map([['nvidia','cuda'],['amd','rocm'],['ascend','cann'],['huawei','cann'],
  ['hygon','dcu'],['cambricon','neuware'],['iluvatar','corex'],['metax','maca'],['moore threads','musa']]);
function cacheWorkerFrameworks(worker, devices) {
  const hardware = devices.filter(device=>device.nodeId===worker.id);
  if (!hardware.length && worker.gpuCount === 0) return ['cpu'];
  return hardware.map(device=>acceleratorFramework.get(String(device.vendor || '').toLowerCase()));
}
export function cacheClusterFrameworks(records, clusterId) {
  const workers = list(records,nodesPage).filter(item=>item.clusterId===clusterId && item.status==='就绪');
  const devices = list(records,'ops-gpus');
  return [...new Set(workers.flatMap(worker=>cacheWorkerFrameworks(worker,devices)).filter(Boolean))];
}
export const singleCacheFramework = (records,clusterId) => {
  const options = cacheClusterFrameworks(records,clusterId).filter(framework=>framework!=='cpu');
  return options.length===1 ? options[0] : undefined;
};
const configurationUsesCache = (config, row) => config?.enabled !== false && config?.service?.id === row.id;
const legacyUsesCache = (config, row) => config?.cacheAcceleration && config.cacheAcceleration.name === row.name &&
  config.cacheAcceleration.provider === row.provider && config.cacheAcceleration.clusterId === row.clusterId;

export const cacheAttachments = (row, records) => list(records, 'deployments').filter(deployment =>
  [deployment, deployment.previousConfig, ...(deployment.configHistory || []).map(revision=>revision.config)].some(config =>
    legacyUsesCache(config, row) || [config?.kvCache, ...Object.values(config?.roleConfigs || {}).map(role=>role.kvCache)]
      .some(cache => configurationUsesCache(cache, row))));

export function cacheAttachedInstances(row, records) {
  const linked = cacheAttachments(row, records);
  return deploymentInstances(linked, records).filter(({ state, role, deployment }) => {
    if (state !== 'running' || role === 'router') return false;
    const roleCache = deployment.roleConfigs?.[role]?.kvCache;
    if (roleCache) return configurationUsesCache(roleCache, row);
    return configurationUsesCache(deployment.kvCache, row) || legacyUsesCache(deployment, row);
  });
}
export const cacheLogAvailable = state => ['启动中', '运行中', '异常', '不可达'].includes(state);
export const cacheServiceLogAvailable = row => Boolean(row.workerId && activeCacheProvider(row.provider)?.topology !== 'per_node' && cacheLogAvailable(row.status));
export const cacheInstances = (row, records) => {
  if (externalCache(row)) return row.serviceUrl ? [{ id: 'external', name: '外部服务', address: row.serviceUrl, state: row.status }] : [];
  const effective = row.runningConfiguration || row;
  const candidates = cacheNodes(records, effective).filter(node => !effective.workerId || node.value === effective.workerId);
  const { state } = row.instanceStatus || {};
  const ready = Number.parseInt(row.ready, 10) || 0;
  return candidates.map((option, index) => ({ id: option.value, name: option.label,
    address: find(records, nodesPage, option.value)?.ip, state: state?.[option.value] ?? (row.status === '运行中' && index < ready ? '运行中' : row.status),
    observedAt: row.instanceStatus?.events?.[option.value]?.at || '',
    memoryGiB: row.instanceStatus?.revisions?.[option.value] === row.configRevision ? row.memoryGiB : effective.memoryGiB,
    configPending: Boolean(row.runningConfiguration && row.instanceStatus?.revisions?.[option.value] !== row.configRevision),
  }));
};
export const cacheL2Entries = row => (Array.isArray(row?.l2Entries) ? row.l2Entries : row?.l2Storage && row.l2Storage !== '无' ? [{ type: row.l2Storage, location: row.l2Location || '' }] : []).map(cacheL2Values);
const cacheL2Config = (draft, current) => Array.isArray(draft.l2Entries) ? draft.l2Entries : cacheL2Entries(current);
const cacheProviderOptions = records => Array.from(new Set([...(configuredCacheProviders() || cacheProviderCatalogue).map(item => item.name), ...list(records, cachePage).map(row => row.provider)]));
const cacheVersionOptions = (records, draft, row) => cacheVersionsForProvider(activeCacheProvider(draft.provider),
  records ? cacheClusterFrameworks(records,draft.clusterId) : [], row?.version);
const cacheVersion = draft => {
  const versions = cacheVersionOptions(null, draft);
  return versions.length === 1 && versions[0] === '自定义' ? '自定义' : draft.version;
};
const cacheLog = (row, message) => [...(row.cacheEvents || []), { at: new Date().toISOString(), message }];

const cacheWorkerPicker = draft => {
  const provider = activeCacheProvider(draft.provider);
  return !externalCache(draft) && provider?.topology !== 'per_node' && !provider?.components?.length;
};
const defaultCacheCluster = records => records.clusters?.find(row=>row.isDefault && row.status==='运行中')?.id ??
  records.clusters?.find(row=>row.status==='运行中')?.id;
const freeMemory = node => node.memoryGiB > 0 && Number.isFinite(node.ram) && node.ram >= 0 && node.ram <= 100
  ? node.memoryGiB * (100 - node.ram) / 100 : undefined;
const defaultCacheWorker = (draft, records) => cacheWorkerPicker(draft) ? cacheNodes(records,draft).map(option=>find(records,nodesPage,option.value))
  .sort((left,right)=>(freeMemory(right) ?? -1) - (freeMemory(left) ?? -1))[0]?.id : undefined;

export function cacheCreateDefaults(provider, records) {
  const clusterId = defaultCacheCluster(records);
  const draft = { provider, clusterId };
  return { ...draft, version:cacheVersionOptions(records,draft)[0], workerId:defaultCacheWorker(draft,records) };
}

function unsupportedCacheFamily(release, node, devices) {
  if (!release?.frameworks?.length) return undefined;
  const [family] = cacheWorkerFrameworks(node,devices);
  return family && !release.frameworks.includes(family) && !(family==='cpu' && release.plainImage) ? family : undefined;
}

export function cachePlacement(draft, records, onlyWorkerId) {
  if (externalCache(draft)) return { workers: [] };
  const options = cacheNodes(records, draft).filter(node => (!(onlyWorkerId || draft.workerId) || (onlyWorkerId || draft.workerId) === node.value));
  if (!options.length) return { workers: [], blocking: nodeOptions(records,draft).length
    ? '所选节点和标签下没有可调度的就绪节点，请调整选择或检查节点状态。'
    : '当前集群没有可调度的就绪节点，请选择其他集群或检查节点状态。' };
  if (cacheWorkerPicker(draft) && !(onlyWorkerId || draft.workerId)) return { workers: options };
  const targets = options.map(option=>find(records,nodesPage,option.value));
  const release = activeCacheProvider(draft.provider)?.releases?.[draft.version];
  if (release?.frameworks?.length) {
    const devices = list(records,'ops-gpus');
    const unsupported = targets.map(node=>unsupportedCacheFamily(release,node,devices)).filter(Boolean);
    const accelerators = unsupported.filter(family=>family!=='cpu');
    if (accelerators.length) return { workers: options, warning:`${accelerators.length}/${targets.length} 个目标节点的加速器（${[...new Set(accelerators)].join('、')}）不受该版本支持，这些实例将无法启动。` };
    if (unsupported.length) return { workers: options, warning:`${unsupported.length}/${targets.length} 个目标节点没有加速卡，该版本无可在此类节点上运行的镜像。` };
  }
  const request = cacheRequestedMemory(draft,singleCacheFramework(records,draft.clusterId));
  if (!Number.isFinite(request) || request <= 0) return { workers: options };
  const tightest = targets.filter(node=>node.memoryGiB > 0).sort((left,right)=>left.memoryGiB-right.memoryGiB)[0];
  if (tightest && request >= tightest.memoryGiB) return { workers: options,
    warning:`超过节点 ${tightest.name} 的物理内存上限（${Math.floor(tightest.memoryGiB)} GiB）。` };
  const leastFree = targets.map(node=>({ node, free:freeMemory(node) })).filter(({free})=>free!==undefined).sort((left,right)=>left.free-right.free)[0];
  if (leastFree && request > leastFree.free) {
    return { workers: options, warning:`节点 ${leastFree.node.name} 的可用内存不足（剩余 ${Math.floor(leastFree.free)} GiB），缓存服务可能因内存不足而终止。` };
  }
  if (targets.every(node=>freeMemory(node)!==undefined)) {
    if (activeCacheProvider(draft.provider)?.topology==='per_node' && !draft.workerId && !onlyWorkerId) {
      return { workers:options, success:`资源满足，将在 ${targets.length} 个节点上各部署一个实例。` };
    }
    if (targets.length===1) return { workers:options, success:`资源满足，实例将部署在节点 ${targets[0].name}。` };
  }
  return { workers: options };
}

const runtimeCacheKeys = ['provider', 'version', 'clusterId', 'workerId', 'selector', 'memoryGiB', 'image', 'l2Entries', 'managementUrl',
  'parameters', 'env', 'restartOnError', 'providerValues', ...cacheProviderFields.map(field => field.key)];
const cacheRuntime = row => Object.fromEntries(runtimeCacheKeys.map(key => [key, key==='l2Entries' ? cacheL2Entries(row) :
  key==='selector' ? Object.fromEntries(normalizedLabelPairs(row[key]).sort(([left],[right])=>left.localeCompare(right))) : row[key]]));
export function cacheConfigurationChanged(current,draft) {
  if (!current || externalCache(draft)) return false;
  const original = cacheRuntime(current);
  const proposed = cacheRuntime({ ...current,...draft });
  return Object.entries(proposed).some(([key,value])=>jsonData(original[key] ?? '')!==jsonData(value ?? ''));
}
function cachePlacementSettings(draft, records) {
  return { clusterId:draft.clusterId, workerId:draft.workerId || '', provider:draft.provider, version:draft.version,
    selector:normalizedLabelPairs(draft.selector).sort(([left],[right])=>left.localeCompare(right)),
    memory:cacheRequestedMemory(draft,singleCacheFramework(records,draft.clusterId)) };
}
export const cachePlacementChanged = (current,draft,records) => Boolean(current && !externalCache(draft) &&
  jsonData(cachePlacementSettings(current,records)) !== jsonData(cachePlacementSettings({ ...current,...draft },records)));
const cacheAcceleration = {
  title: 'KV缓存',
  createLabel: '添加缓存服务',
  hideCreate: true,
  batchInToolbar: true,
  collapsibleGroups: ['高级配置'],
  submitLabel(draft,records,row) {
    if (!cachePlacementChanged(row,draft,records)) return '确定';
    const placement=cachePlacement(draft,records);
    return placement.blocking || placement.warning ? '仍然提交' : '确定';
  },
  actionsInToolbar: true,
  hideResetFilter: true,
  searchPlaceholder: '名称搜索',
  searchMatches: (row, query) => row.name.toLowerCase().includes(query),
  editable: true,
  deletable: true,
  rowSelection: true,
  detailRoute: true,
  actionMenu: true,
  actionWidth: 128,
  columns: [field('name', '名称', { width: 205, sorter: true }), field('provider', '提供方'), field('clusterId', '集群', { format: labelOf('clusters'), width: 160 }), status, created],
  fields: [name('名称'), select('provider', '提供方', cacheProviderOptions, { required: true, disabled: true, defaultValue: 'LMCache' }),
    select('version', '版本', cacheVersionOptions, { defaultValue: (_records, params) => cacheVersionOptions(null, { provider: params?.get?.('provider') || params?.provider || 'LMCache' })[0],
      required: true, visible: (draft, records) => cacheVersionOptions(records, draft).some(version => version !== '自定义') }),
    field('image', '容器镜像', { required: true, visible: draft => cacheVersion(draft) === '自定义' && !externalCache(draft) }),
    select('clusterId', '集群', clusterOptions, { required: true, editable: false, defaultValue: defaultCacheCluster }),
    select('workerId', '节点', cacheNodes, { visible: cacheWorkerPicker, help:'可选，留空时由调度器自动放置实例。' }),
    field('serviceUrl', '外部服务地址', { required: true, visible: externalCache, placeholder: 'https://cache.example.com' }),
    field('selector', '节点标签选择器', { type: 'cachePairs', fullWidth: true, visible: draft => !externalCache(draft) }),
    ...cacheProviderFields.map(config => ({ ...config, visible: draft => !activeCacheProvider(draft.provider)?.declaredFields &&
      activeCacheProvider(draft.provider)?.fields?.some(item => item.key === config.key) })),
    field('providerValues', '提供方配置', { type: 'cacheDeclared', fullWidth: true, visible: draft => Boolean(activeCacheProvider(draft.provider)?.declaredFields?.length) }),
    field('l2Entries', 'L2 存储后端', { type: 'cacheL2', fullWidth: true, visible: draft => Boolean(activeCacheProvider(draft.provider)?.l2) }),
    field('managementUrl', '管理地址', { placeholder: 'https://cache-console.example.com', group: '高级配置',
      visible: (draft, _records, row) => activeCacheProvider(draft.provider)?.management || Boolean(row?.managementUrl) }),
    field('parameters', '启动参数', { type: 'cacheParameters', fullWidth: true, group: '高级配置' }),
    field('env', '环境变量', { type: 'cachePairs', fullWidth: true, group: '高级配置' }),
    field('restartOnError', '异常时自动重启', { type: 'checkbox', defaultValue: true, group: '高级配置' })],
  detail: [field('provider', '缓存提供方'), field('version', '版本'), field('image', '容器镜像'), field('clusterId', '集群', { format: labelOf('clusters') }), field('workerId', '固定节点', { format: labelOf(nodesPage) }), field('ready', '就绪实例'), field('memoryGiB', '内存容量', { format: suffix('GiB') }), field('l2Storage', 'L2 存储'), field('l2Location', 'L2 存储地址'), field('serviceUrl', '外部服务地址'), field('managementUrl', '管理界面地址'), field('selector', '节点标签选择器', { format:labelList }), field('parameters', '启动参数', {
    format: value => typeof value === 'string' ? value : Object.entries(value || {}).map(([component, args]) =>
      [component, ...args].join(' ')).join('\n') }), status, field('checkResult', '状态信息'), description, created],
  onFieldChange(draft, key, value, records) {
    if (key === 'provider') return { version: cacheVersionOptions(records, { provider: value })[0], workerId: '' };
    if (key === 'clusterId') {
      const versions = cacheVersionOptions(records,{ ...draft,clusterId:value,version:undefined });
      return { workerId:defaultCacheWorker({ ...draft,clusterId:value },records) || '',version:draft.version==='自定义' && versions.includes(draft.version) ? draft.version : versions[0] };
    }
    if (key === 'selector' && draft.workerId && !cacheNodes(records, { ...draft, selector: value }).some(node => node.value === draft.workerId)) return { workerId: '' };
  },
  validate(draft, records, current) {
    if (!current && activeCacheProvider(draft.provider)?.unavailable) return activeCacheProvider(draft.provider).detail || '所选提供方暂不可用。';
    if (current && draft.provider !== current.provider) return '创建后不能更改缓存提供方。';
    const versions = cacheVersionOptions(records, draft, current);
    if (versions.length > 0 && !versions.includes(cacheVersion(draft))) return '请选择缓存提供方支持的版本。';
    if (find(records, 'clusters', draft.clusterId)?.status !== '运行中') return '请选择运行中的集群。';
    const selectorIssue = labelIssue(draft.selector);
    if (selectorIssue) return selectorIssue;
    if (draft.workerId && !externalCache(draft) && !cacheNodes(records, draft).some(option => option.value === draft.workerId)) return '固定节点须符合所选集群、节点标签和就绪条件。';
    if (externalCache(draft) && !urlValid(draft.serviceUrl.trim())) return '请输入不含凭证的 HTTP(S) 服务地址。';
    if (draft.managementUrl && !urlValid(draft.managementUrl.trim())) return '请输入不含凭证的 HTTP(S) 管理地址。';
    const l2Issue = cacheL2Issue(draft.provider, externalCache(draft) ? [] : cacheL2Config(draft, current));
    if (l2Issue) return l2Issue;
    if (!current && cachePlacement(draft, records).blocking) return cachePlacement(draft, records).blocking;
    if (!plainEnv(draft.env) || !pairKeysUnique(String(draft.env || '').split('\n').filter(line => line.trim()))) {
      return '请填写有效且唯一的环境变量名称。访问密钥须通过凭证配置。';
    }
    if (current && cacheAttachments(current, records).length && ['name', 'provider', 'clusterId'].some(key => draft[key] !== current[key])) return '请先解除模型部署关联，再修改缓存服务的标识。';
  },
  save(draft, records, current) {
    const external = externalCache(draft);
    const version = cacheVersion(draft);
    const l2Entries = external ? [] : cacheL2Config(draft, current).map(entry => {
      const { type } = entry;
      const fields = activeCacheProvider(draft.provider)?.l2?.[type] || [];
      return { type,...(typeof entry.adapterEnabled==='boolean' && { adapterEnabled:entry.adapterEnabled }),
        ...Object.fromEntries(fields.filter(field => !field.credential && entry[field.key] !== undefined)
        .map(field => [field.key, entry[field.key]])) };
    });
    const primary = l2Entries[0];
    const framework = singleCacheFramework(records,draft.clusterId);
    const configuration = { version, serviceUrl: external ? draft.serviceUrl : '', workerId: external ? '' : draft.workerId ?? current?.workerId ?? '',
      image: version === '自定义' ? draft.image : '',
      l2Storage: primary?.type || '无', selector: external ? {} : Object.fromEntries(normalizedLabelPairs(draft.selector)),
      l2Location: primary?.basePath || primary?.endpoint || [primary?.host, primary?.port].filter(Boolean).join(':'), l2Entries };
    if (activeCacheProvider(draft.provider)?.declaredFields?.length) {
      configuration.providerValues = cacheDeclaredValues(draft.provider, draft.providerValues || {},framework,current);
    }
    configuration.memoryGiB = external ? null : cacheRequestedMemory({ ...current,...draft,...configuration },framework);
    if (!current) return { ...configuration, status: '待检查', ready: '', checkResult: '', operationStartedAt: Date.now(), configRevision: 1 };
    if (!cacheConfigurationChanged(current,{ ...draft,...configuration })) return configuration;
    return { ...configuration, configRevision: (current.configRevision || 1) + 1, runningConfiguration: current.runningConfiguration || cacheRuntime(current),
      cacheEvents: cacheLog(current, '配置已更新。重建缓存实例后生效。') };
  },
  canDelete: (row, records) => cacheAttachments(row, records).length ? '缓存服务仍由模型部署或回滚配置使用。' : undefined,
  actions: [{ label: '查看日志', panel: 'logs', sheet: true, when: cacheServiceLogAvailable },
    { label: '指标详情', panel: 'monitor' }],
  batchActions: [{ label: '批量删除', toolbarLabel: '删除', danger: true, when: rows => rows.length > 0, confirm: rows => `删除选中的 ${rows.length} 个缓存服务？`,
    apply(rows, records) {
      if (rows.some(row => cacheAttachments(row, records).length)) throw Error('所选缓存服务仍被模型部署或回滚配置使用。');
      return [];
    } }],
  seed: [
    { id: 'cache-nanjing', name: 'nj-inference-kv', provider: 'LMCache', version: '0.4.2', clusterId: 'cluster-nj-a', memoryGiB: 128, l2Storage: '本地文件系统', l2Location: '/mnt/nvme/kv-cache', ready: '6 / 6', status: '运行中', checkResult: '模拟健康检查通过。', createdAt: '2026-11-21 11:00:00' },
    { id: 'cache-suzhou', name: 'sz-shared-kv', provider: 'Mooncake', version: '外部服务', clusterId: 'cluster-sz-a', serviceUrl: 'https://cache-sz.example.com', ready: '1 / 1', status: '运行中', checkResult: '模拟健康检查通过。', createdAt: '2026-11-22 09:15:00' },
    { id: 'cache-suzhou-test', name: 'sz-cache-validation', provider: 'LMCache', version: '0.4.1', clusterId: 'cluster-sz-a', workerId: 'worker-sz-a-02', memoryGiB: 48, l2Storage: 'Redis / Valkey', l2Location: 'redis://cache-sz.example.com:6379', ready: '0 / 1', status: '异常', checkResult: '模拟状态：L2 存储连接超时。', createdAt: '2026-11-25 14:05:00' },
    {
      id: 'cache-suzhou-glm', name: 'sz-glm-lmcache', provider: 'LMCache', version: '0.5.6',
      clusterId: 'cluster-sz-a', selector: { pool: 'sz-a' }, memoryGiB: 64, providerValues: { ram_size: 64 },
      l2Storage: '本地文件系统', l2Location: '/mnt/nvme/kv-cache/glm-5.2',
      l2Entries: [{ type: '本地文件系统', basePath: '/mnt/nvme/kv-cache/glm-5.2' }],
      status: '运行中', ready: '3 / 3', checkResult: '模拟健康检查通过。3 个节点的缓存实例已就绪。',
      createdAt: '2026-11-26T16:40:00+08:00',
      cacheEvents: [
        { at: '2026-11-26T16:40:00+08:00', message: '模拟配置校验通过，准备启动 LMCache 0.5.6。' },
        { at: '2026-11-26T16:42:00+08:00', message: 'worker-sz-a-01 缓存实例就绪，L2 目录可写。' },
        { at: '2026-11-26T16:42:05+08:00', message: 'worker-sz-a-02 缓存实例就绪，L2 目录可写。' },
        { at: '2026-11-26T16:42:08+08:00', message: 'worker-sz-a-03 缓存实例就绪，L2 目录可写。' },
      ],
      metrics: [
        { at: '2026-11-27T09:25:00+08:00', worker: 'worker-sz-a-01', hit: 59.8, lookups: 326, occupancy: 41.3, l1Usage: 26.4, l2Usage: 83.2, reads: 126.8, writes: 98.7 },
        { at: '2026-11-27T09:35:00+08:00', worker: 'worker-sz-a-01', hit: 64.2, lookups: 348, occupancy: 49.5, l1Usage: 31.7, l2Usage: 101.2, reads: 146.5, writes: 109.4 },
        { at: '2026-11-27T09:45:00+08:00', worker: 'worker-sz-a-01', hit: 69.1, lookups: 391, occupancy: 58.4, l1Usage: 37.4, l2Usage: 112.2, reads: 168.3, writes: 123.9 },
        { at: '2026-11-27T09:55:00+08:00', worker: 'worker-sz-a-01', hit: 66.7, lookups: 372, occupancy: 55.9, l1Usage: 35.8, l2Usage: 109.5, reads: 153.2, writes: 114.6 },
      ],
      attachedMetrics: {
        30: { 'deployment-glm:1': { hitTokens: 214080, queriedTokens: 320000, hitRate: 0.669 },
          'deployment-glm:2': { hitTokens: 205840, queriedTokens: 310000, hitRate: 0.664 } },
        60: { 'deployment-glm:1': { hitTokens: 413600, queriedTokens: 640000, hitRate: 0.64625 },
          'deployment-glm:2': { hitTokens: 390600, queriedTokens: 620000, hitRate: 0.63 } },
        360: { 'deployment-glm:1': { hitTokens: 1944000, queriedTokens: 3200000, hitRate: 0.6075 },
          'deployment-glm:2': { hitTokens: 1740000, queriedTokens: 3000000, hitRate: 0.58 } },
        1440: { 'deployment-glm:1': { hitTokens: 4884000, queriedTokens: 8800000, hitRate: 0.555 },
          'deployment-glm:2': { hitTokens: 4400000, queriedTokens: 8000000, hitRate: 0.55 } },
      },
    },
  ],
};

const localFile = draft => draft.source === '本地路径';
const filePath = value => String(value || '').trim().replaceAll('\\', '/').replace(/\/+$/, '');
const validFilePath = value => /^(?:\/|[a-z]:\/).+/i.test(value) && !value.split('/').includes('..') &&
  !Array.from(value).some(char => char.charCodeAt(0) < 32 || char.charCodeAt(0) === 127);
const selectedFilename = value => String(value || '').trim();
const relativeArtifact = value => Boolean(value && !value.startsWith('/') && !value.includes('\\') &&
  !value.split('/').includes('..') && !Array.from(value).some(char => char.charCodeAt(0) < 32 || char.charCodeAt(0) === 127));
const globPrefix = filename => filename.endsWith('-*.gguf') ? filename.slice(0, -6).toLowerCase() : '';
const artifactMatches = (left, right) => {
  const a = selectedFilename(left), b = selectedFilename(right);
  if (a === b) return true;
  const one = globPrefix(a), two = globPrefix(b);
  if (one) return b.toLowerCase().startsWith(one) && /-\d{5}-of-\d{5}\.gguf$/i.test(b);
  return Boolean(two && a.toLowerCase().startsWith(two) && /-\d{5}-of-\d{5}\.gguf$/i.test(a));
};
const defaultDownloadDirectory = repository => `/var/lib/gpustack/cache/${repository}`;
const remoteDirectory = row => {
  if (Object.hasOwn(row, 'localDir')) return row.localDir || '';
  if (!row.repository || [defaultDownloadDirectory(row.repository), `/mnt/models/${row.repository.split('/').at(-1).toLowerCase()}`]
    .includes(row.mountPath)) return '';
  return row.mountPath;
};

function fileReferences(row, records) {
  const nodeId = row.workerId;
  const gpuIds = new Set(list(records, 'ops-gpus').filter(device => device.nodeId === nodeId).map(device => device.id));
  return list(records, 'deployments').filter(deployment =>
    [deployment, deployment.previousConfig, ...(deployment.configHistory || []).map(revision => revision.config)].some(config => {
      if (!config) return false;
      if (config.modelFileId) return config.modelFileId === row.id;
      if ((config.clusterId || deployment.clusterId) !== row.clusterId) return false;
      const targets = config.placementTargets || [];
      if (config.placement === '指定节点' && targets.length && !targets.includes(nodeId)) return false;
      if (config.placement === '指定 GPU' && targets.length && !targets.some(id => gpuIds.has(id))) return false;
      const weightPath = filePath(config.weightPath);
      if (weightPath && [row.mountPath, ...(row.resolvedPaths || [])].some(path => filePath(path) === weightPath)) return true;
      return !localFile(row) && config.source === row.source && config.repository === row.repository &&
        artifactMatches(config.filename, row.filename);
    }));
}

export function modelFileNodeIssue(draft, records) {
  const nodeFiles = list(records, filesPage).filter(row => row.workerId === draft.workerId);
  if (localFile(draft)) {
    const path = filePath(draft.mountPath);
    if (path && nodeFiles.some(row => localFile(row) && filePath(row.mountPath) === path)) {
      return '该节点上已登记此文件路径。';
    }
    return undefined;
  }
  const repository = String(draft.repository || '').trim();
  if (!repository) return undefined;
  const directory = filePath(draft.localDir);
  if (nodeFiles.some(row => !localFile(row) && row.source === draft.source && row.repository === repository &&
    artifactMatches(row.filename, draft.filename) && filePath(remoteDirectory(row)) === directory)) {
    return '该节点上已有相同来源和本地目录的模型文件。';
  }
  if (directory && nodeFiles.some(row => !localFile(row) && !row.filename && filePath(remoteDirectory(row)) === directory)) {
    return '该节点的本地目录已被另一个下载任务占用。';
  }
}

export function modelFileDeploymentName(row) {
  const path = row.repository || row.mountPath || row.resolvedPaths?.[0] || row.filename || '';
  return path.split(/[\\/]/).filter(Boolean).at(-1)?.toLowerCase().replace(/-\d+-of-\d+(?:\.gguf)?$|\.gguf$/, '') || '';
}

export function modelFileCreation(draft, records) {
  const local = localFile(draft);
  if (!sources.includes(draft.source)) throw Error('请选择有效的模型来源。');
  const worker = find(records, nodesPage, draft.workerId);
  if (!worker || worker.status !== '就绪') throw Error('请选择处于就绪状态的节点。');
  const repository = String(draft.repository || '').trim();
  const filename = selectedFilename(draft.filename);
  if (!local && !/^[\w.-]+\/[\w.-]+$/.test(repository)) throw Error('请先选择模型仓库。');
  if (!local && filename && (!relativeArtifact(filename) || filename.includes('*') && !/^[\w.()/-]+-\*\.gguf$/i.test(filename))) {
    throw Error('请选择仓库内的有效文件。');
  }
  const parts = !local && Array.isArray(draft.downloadParts) ? draft.downloadParts : [];
  if (parts.some(part => !relativeArtifact(part) || !artifactMatches(filename, part))) throw Error('所选分片和模型文件不匹配。');
  const localPath = filePath(draft.mountPath);
  const localDir = filePath(draft.localDir);
  if (local && !validFilePath(localPath)) throw Error('请填写节点上的绝对文件路径。');
  if (!local && localDir && !validFilePath(localDir)) throw Error('本地目录须为节点上的绝对路径。');
  const conflict = modelFileNodeIssue(draft, records);
  if (conflict) throw Error(conflict);
  const matched = !local && list(records, 'ops-model-library').filter(model => model.repository === repository ||
    model.specs?.some(spec => spec.repository === repository));
  const model = matched?.length === 1 ? matched[0] : null;
  return { source: draft.source, workerId: worker.id, clusterId: worker.clusterId,
    name: (local ? localPath : filename || repository).split('/').at(-1),
    repository: local ? '' : repository, filename: local ? '' : filename,
    mountPath: local ? localPath : (localDir || defaultDownloadDirectory(repository)),
    downloadParts: local ? undefined : parts,
    sizeGiB: !local && Number.isFinite(draft.sizeBytes) && draft.sizeBytes > 0 ? draft.sizeBytes / (1024 ** 3) : undefined,
    localDir: local ? null : localDir || null, modelId: model?.modelId, modelCode: model?.modelCode,
    lora: Boolean(!local && draft.lora), status: '下载中', progress: local ? null : 0,
    operationStartedAt: Date.now(), message: local ? '等待核验本地文件。' : '等待节点下载。' };
}
function cacheCheck(row, records) {
  const pool = cacheNodes(records,row).filter(node=>!row.workerId || node.value===row.workerId);
  const release = activeCacheProvider(row.provider)?.releases?.[row.version];
  const devices = list(records,'ops-gpus');
  const runningCluster = find(records,'clusters',row.clusterId)?.status==='运行中';
  const state = Object.fromEntries(pool.map(({value})=>[value,runningCluster && !unsupportedCacheFamily(release,find(records,nodesPage,value),devices) ? '运行中' : '异常']));
  const expected = externalCache(row) ? 1 : pool.length;
  const ready = externalCache(row) ? Number(runningCluster) : Object.values(state).filter(value=>value==='运行中').length;
  const checkResult = !runningCluster || !expected ? '没有符合条件的就绪资源。' : ready < expected
    ? '模拟健康检查发现部分实例的运行环境不受所选版本支持。' : '模拟健康检查通过。';
  return { status:ready ? '运行中' : '异常', ready:`${ready} / ${expected || 1}`, checkResult,
    operationStartedAt:null, instanceStatus:{ ...row.instanceStatus, state }, cacheEvents:cacheLog(row,checkResult) };
}

function fileCheck(row, records) {
  const ready = find(records, nodesPage, row.workerId)?.status === '就绪';
  const at = filePath(row.mountPath);
  const parts = row.downloadParts?.length ? row.downloadParts : row.filename && !row.filename.includes('*') ? [row.filename] : [];
  const resolvedPaths = parts.length ? parts.map(part => `${at}/${part}`) : at ? [at] : [];
  return ready ? { status: '可用', progress: row.source === '本地路径' ? null : 100, resolvedPaths, message: '', operationStartedAt: null }
    : { status: '失败', message: '节点未就绪，无法读取模型文件。', operationStartedAt: null };
}
const fileSources = {
  title: '模型文件',
  createLabel: '添加模型文件',
  hideCreate: true,
  actionsInToolbar: true,
  hideResetFilter: true,
  searchPlaceholder: '路径查询',
  searchMatches: (row, query) => [row.repository, row.filename, row.mountPath, ...(row.resolvedPaths || [])].some(value => String(value || '').toLowerCase().includes(query)),
  rowSelection: true,
  hideSelectionSummary: true,
  actionMenu: true,
  actionWidth: 128,
  showDetailsAction: false,
  detailModal: '删除模型文件',
  columns: [field('source', '来源', { sorter: true, sortValue: row=>[row.source, row.repository || row.mountPath].filter(Boolean).join('/') }), field('workerId', '节点', { format: labelOf(nodesPage), sortValue: (row, records) => find(records, nodesPage, row.workerId)?.name, width: 160, sorter: true }),
    { ...status, width: 150 }, field('mountPath', '存储路径', { width: 235, sorter: true, sortValue:row=>row.resolvedPaths?.[0] || row.mountPath }),
    field('sizeGiB', '文件大小', { width: 110, align: 'right', format: value => Number.isFinite(value) ? `${value.toFixed(1)} GiB` : undefined }), created],
  filters: [field('workerId', '按节点筛选', { searchable: true, options: records => optionsOf(records, nodesPage) })],
  editable: false,
  canDelete(row, records) {
    const usedBy = fileReferences(row, records);
    if (usedBy.length) return `模型文件仍由 ${usedBy.map(item => item.displayName || item.name).join('、')} 使用。`;
  },
  actions: [
    { label: '部署', when: row => row.status === '可用' && !row.lora, deployModelFile: true },
    { label: '重新下载', confirm: false, apply: row => ({ status: '下载中', progress: localFile(row) ? null : 0, operationStartedAt: Date.now(), message: '' }) },
    { label: '删除', panel: 'delete', danger: true },
  ],
  seed: [
    { id: 'file-bge-m3-nj', name: 'BGE-M3 权重', source: 'Hugging Face', repository: 'BAAI/bge-m3', modelCode: 'bge-m3', workerId: 'worker-nj-a-01', clusterId: 'cluster-nj-a', mountPath: '/mnt/models/bge-m3', sizeGiB: 2.27, progress: 100, status: '可用', createdAt: '2026-11-20 10:30:00' },
    { id: 'file-glm52-sz', name: 'GLM-5.2 权重', source: '本地路径', modelCode: 'glm-5.2', workerId: 'worker-sz-a-01', clusterId: 'cluster-sz-a', mountPath: '/mnt/models/glm-5.2', sizeGiB: 236.8, status: '可用', createdAt: '2026-11-21 09:30:00' },
    { id: 'file-qwen35-nj', name: 'Qwen3.5-9B 权重', source: 'ModelScope', repository: 'Qwen/Qwen3.5-9B', workerId: 'worker-nj-a-02', clusterId: 'cluster-nj-a', mountPath: '/mnt/models/qwen3.5-9b', progress: 65, status: '下载中', createdAt: '2026-11-26 16:12:00' },
    { id: 'file-rerank-sz', name: 'BGE Reranker 权重', source: 'Hugging Face', repository: 'BAAI/bge-reranker-v2-m3', modelCode: 'bge-reranker-v2-m3', workerId: 'worker-sz-a-02', clusterId: 'cluster-sz-a', mountPath: '/mnt/models/bge-reranker-v2-m3', progress: 22, status: '失败', message: '模拟下载记录：模型仓库连接超时。', createdAt: '2026-11-25 16:10:00' },
    { id: 'file-dsv4-pro-nj', name: 'DeepSeek-V4-Pro 权重', source: '本地路径', modelId: 'model-1',
      modelCode: 'deepseek-v4-pro', workerId: 'worker-nj-a-01', clusterId: 'cluster-nj-a',
      mountPath: '/mnt/models/deepseek-v4-pro', resolvedPaths: ['/mnt/models/deepseek-v4-pro'],
      sizeGiB: 314, status: '可用', message: '模拟核验通过，节点可读取模型目录。', createdAt: '2026-11-25T10:20:00+08:00' },
    { id: 'file-glm52-fp8-sz', name: 'GLM-5.2 FP8 权重', source: 'ModelScope', repository: 'ZhipuAI/GLM-5.2-FP8',
      modelId: 'model-2', modelCode: 'glm-5.2', workerId: 'worker-sz-a-01', clusterId: 'cluster-sz-a',
      mountPath: '/mnt/models/glm-5.2-fp8', resolvedPaths: ['/mnt/models/glm-5.2-fp8'], localDir: '/mnt/models/glm-5.2-fp8',
      sizeGiB: 146, progress: 100, status: '可用', createdAt: '2026-11-26T14:10:00+08:00' },
    { id: 'file-bge-m3-nj-03', name: 'BGE-M3 权重', source: 'Hugging Face', repository: 'BAAI/bge-m3', modelId: 'catalog-demo-embedding',
      modelCode: 'bge-m3', workerId: 'worker-nj-a-03', clusterId: 'cluster-nj-a',
      mountPath: '/mnt/models/bge-m3', resolvedPaths: ['/mnt/models/bge-m3'], localDir: '/mnt/models/bge-m3',
      sizeGiB: 2.27, progress: 100, status: '可用', createdAt: '2026-11-26T10:15:00+08:00' },
    { id: 'file-qwen3-06b-nj', name: 'Qwen3-0.6B-Base 权重', source: 'ModelScope', repository: 'Qwen/Qwen3-0.6B-Base',
      modelCode: 'qwen3-0.6b-base', workerId: 'worker-nj-a-04', clusterId: 'cluster-nj-a',
      mountPath: '/mnt/models/qwen3-0.6b-base', localDir: '/mnt/models/qwen3-0.6b-base', sizeGiB: 1.15, progress: 47,
      status: '下载中', message: '模拟下载中，已取得配置文件和分词器，正在下载权重。', createdAt: new Date(Date.now() - 50 * 60_000).toISOString() },
  ],
};

export function modelOperationDeadline(pageId, row) {
  if (!row.operationStartedAt) return null;
  if (pageId === benchmarksPage && row.status === '排队中') return row.operationStartedAt + 900;
  if (pageId === benchmarksPage && row.status === '运行中') return row.operationStartedAt + 4500;
  if (pageId === cachePage && row.status === '待检查') return row.operationStartedAt + 1500;
  if (pageId === filesPage && row.status === '下载中') {
    if (row.source === '本地路径') return row.operationStartedAt + 1200;
    return row.operationStartedAt + (row.progress >= 75 ? 3500 : row.progress >= 35 ? 2400 : 950);
  }
  return null;
}

export function reconcileModelOperation(pageId, row, records, now) {
  const deadline = modelOperationDeadline(pageId, row);
  if (!deadline || deadline > now) return row;
  let patch;
  if (pageId === benchmarksPage) {
    if (!benchmarkTargetReady(row, records)) patch = { status: '失败', operationStartedAt: null, runEvents: addRunEvent(row, '测试目标已不可用。') };
    else if (row.status === '排队中') patch = { status: '运行中', runEvents: addRunEvent(row, '模拟执行开始。') };
    else if (row.targetSelection) patch = completeAlignedBenchmark(row, new Date(now));
    else patch = { ...benchmarkResults(row), operationStartedAt: null };
  }
  if (pageId === cachePage) patch = cacheCheck(row, records);
  if (pageId === filesPage) {
    patch = row.source === '本地路径' || now >= row.operationStartedAt + 3500 ? fileCheck(row, records)
      : { progress: now >= row.operationStartedAt + 2400 ? 75 : 35, message: '正在模拟下载模型权重。' };
  }
  return patch ? { ...row, ...patch, updatedAt: new Date(now).toISOString() } : row;
}

export const MODEL_SERVICE_PAGES = {
  'ops-model-library': modelCatalog,
  [benchmarksPage]: alignBenchmarkPage(benchmarks),
  [backendsPage]: INFERENCE_BACKEND_PAGE,
  [cachePage]: cacheAcceleration,
  [filesPage]: fileSources,
};

export function inferenceDemoOpsModels(base, now = Date.now()) {
  const cache = cacheAcceleration.seed.find(row => row.id === 'cache-suzhou-glm');
  const startingFile = fileSources.seed.find(row => row.id === 'file-qwen3-06b-nj');
  const rowsByPage = {
    [benchmarksPage]: benchmarks.seed.filter(row => ['bench-ds-throughput-nj', 'bench-glm-latency-sz'].includes(row.id)),
    [cachePage]: [{ ...cache, metrics: cache.metrics.map((sample, index) => ({
      ...sample, at: new Date(now - (35 - index * 10) * 60_000).toISOString(),
    })) }],
    [filesPage]: [
      ...fileSources.seed.filter(row => ['file-dsv4-pro-nj', 'file-glm52-fp8-sz', 'file-bge-m3-nj-03'].includes(row.id)),
      { ...startingFile, modelId: 'model-inference-demo-qwen3-0.6b-base', createdAt: new Date(now - 50 * 60_000).toISOString() },
    ],
  };
  const merged = Object.entries(rowsByPage).map(([page, examples]) => [
    page, [...new Map([...list(base, page), ...examples].map(row => [row.id, row])).values()],
  ]);
  return { ...base, ...Object.fromEntries(merged) };
}
