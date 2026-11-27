import { dump } from 'js-yaml';
import { gpuStackCatalogue } from './model-catalogue-data.js';
import { INFERENCE_BACKEND_PAGE } from './inference-backend.js';

const benchmarksPage = 'ops-benchmarks';
const backendsPage = 'ops-inference-backends';
const cachePage = 'ops-cache-acceleration';
const nodesPage = 'ops-nodes';
const filesPage = 'ops-model-files';
const categories = ['语言模型', '多模态理解', '向量模型', '重排序', '图像生成', '语音'];
const sources = ['Hugging Face', 'ModelScope', '本地路径'];
const benchmarkProfiles = ['自定义', '吞吐量', '延迟 SLO'];
const cacheVersions = { LMCache: ['0.4.2', '0.4.1', '自定义'], Mooncake: ['外部服务'], 'XSKY MeshFusion': ['自定义'] };
const cacheProviders = Object.keys(cacheVersions);
const list = (records, page) => records[page] || [];
const find = (records, page, id) => list(records, page).find(row => row.id === id);
const labelOf = page => (id, _row, records) => find(records, page, id)?.name || (id ? '记录不可用' : undefined);
const optionsOf = (records, page, match = () => true) => list(records, page).filter(match).map(row => ({ value: row.id, label: row.name }));
const names = value => String(value || '').split(/[\n,，]/).map(item => item.trim()).filter(Boolean);
const field = (key, label, config) => ({ key, label, ...config });
const name = label => field('name', label, { required: true });
const select = (key, label, options, config) => field(key, label, { type: 'select', options, ...config });
const quantity = (key, label, min, max, defaultValue, config) => field(key, label, { type: 'number', min, max, step: 1, defaultValue, ...config });
const description = field('description', '描述', { type: 'textarea' });
const created = field('createdAt', '创建时间', { width: 165, sorter: true });
const status = field('status', '状态', { status: true, width: 100 });
const suffix = unit => value => value == null || value === '' ? undefined : `${value} ${unit}`;
const yesNo = value => value == null ? undefined : value ? '是' : '否';
const lockedAfterCreate = (_draft, current) => Boolean(current);
const clusterOptions = records => optionsOf(records, 'clusters', row => row.status === '运行中');
const nodeOptions = (records, draft) => optionsOf(records, nodesPage, row => row.status === '就绪' && (!draft.clusterId || row.clusterId === draft.clusterId));
const benchmarkActive = row => ['排队中', '运行中'].includes(row.status);
const readyDeployment = row => row?.status === '运行中' && row.readyReplicas > 0;
const targetName = (value, row, records) => row.targetName || labelOf('deployments')(value, row, records);
const deploymentTargets = (records, draft) => optionsOf(records, 'deployments', row => readyDeployment(row) && row.clusterId === draft.clusterId);
const benchmarkTargetReady = (row, records) => deploymentTargets(records, row).some(option => option.value === row.targetId);
const absolutePath = value => /^\/[\w./-]+$/.test(value || '') && !value.split('/').includes('..');
const urlValid = value => {
  try {
    const url = new URL(value);
    return ['http:', 'https:'].includes(url.protocol) && !url.username && !url.password && !url.search && !url.hash;
  } catch {
    return false;
  }
};

const backendRegistry = records => list(records, backendsPage).map(row => row.name);
const jsonData = object => JSON.stringify(object, null, 2);
const yamlData = object => dump(object, { noRefs: true, lineWidth: 100 });
const artifact = (name, content, type = 'text/plain;charset=utf-8') => ({ name, content, type });

export function linkedDeploymentModel(row, models) {
  if (row.modelId) return models.find(model => model.id === row.modelId);
  if (!row.modelCode) return undefined;
  const matches = models.filter(model => model.modelId === row.modelCode);
  return matches.length === 1 ? matches[0] : undefined;
}

const catalogueCategoriesById = {
  llm:'语言模型', embedding:'向量模型', reranker:'重排序', image:'图像生成', audio:'语音',
  text_to_speech:'语音', speech_to_text:'语音', vision:'多模态理解',
};

const modelCatalog = {
  title: '模型库',
  description: '查找受支持的模型与部署配置。',
  searchPlaceholder: '搜索模型、作者或仓库',
  searchKeys: ['name', 'maker', 'repository'],
  views: ['cards', 'table'],
  loadMore: true,
  columns: [field('name', '模型', { width: 215 }), field('category', '类型'), field('spec', '部署配置'), field('backend', '推理后端'), field('source', '来源'), field('license', '许可证')],
  filters: [field('category', '类型', { options: categories }), field('backend', '推理后端', { options: backendRegistry })],
  detail: [field('name', '模型名称'), field('category', '类型'), field('maker', '作者'), field('source', '来源'), field('repository', '模型仓库'), field('backend', '推荐推理后端'), field('spec', '部署配置'), field('license', '许可证'), field('modelCode', '部署对象', { format: (_value, row, records) => linkedDeploymentModel(row, records.deployableModels)?.name || '待关联模型资料' }), description],
  editable: false,
  deletable: false,
  actions: [{ label: '部署', target: { page: 'deployments', mode: 'create', field: 'catalogModel' } }],
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

const legacyCatalogueNames = new Set(modelCatalog.seed.map(row=>row.name.toLowerCase()));
const officialCatalogueByName = new Map(gpuStackCatalogue.map(row=>[row.name.toLowerCase(),row]));
modelCatalog.seed = [
  ...modelCatalog.seed.map(row=>{
    const official = officialCatalogueByName.get(row.name.toLowerCase());
    return official ? { ...row, specs:official.specs } : row;
  }),
  ...gpuStackCatalogue.filter(row=>!legacyCatalogueNames.has(row.name.toLowerCase())).map(row=>{
    const spec = row.specs[0];
    const source = { huggingface:'Hugging Face', model_scope:'ModelScope', local_path:'本地路径' };
    return { ...row, id:'catalog-upstream-' + encodeURIComponent(row.name.toLowerCase()).replaceAll('%','_'),
      category:catalogueCategoriesById[row.categories?.[0]] || '语言模型', source:source[spec.source],
      repository:spec.repository, backend:spec.backend, spec:spec.mode, license:row.licenses?.join('、') };
  }),
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
    result: row.status === '已完成' ? { source: 'simulated', completed_requests: row.completed, success_rate: row.resultRate,
      output_tokens_per_second: row.throughput, time_to_first_token_p95: row.ttft, inter_token_latency_p95: row.tpot, request_latency_p95_ms: row.totalLatency } : undefined,
  }));
  return artifact(rows.length === 1 ? `benchmark-${rows[0].id}.yaml` : 'benchmark-results.yaml', yamlData({ benchmarks: results }), 'application/yaml');
}
function duplicateName(name, rows) {
  const names = new Set(rows.map(row => row.name.toLocaleLowerCase()));
  let next = `${name}-copy`;
  let sequence = 2;
  while (names.has(next.toLocaleLowerCase())) next = `${name}-copy-${sequence++}`;
  return next;
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
const stagedProfile = draft => draft.loadPattern === '手工分阶段';
const adaptiveProfile = draft => draft.loadPattern === '自动调优';
const randomDataset = draft => draft.dataset === 'Random';
const latencyProfile = draft => draft.profile === '延迟 SLO';
export function benchmarkClone(row, records) {
  const targetId = benchmarkTargetReady(row, records) ? row.targetId : '';
  return { ...row, name: duplicateName(row.name, list(records, benchmarksPage)), targetId, replica: targetId ? row.replica : 1 };
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
  fields: [name('测试名称'), description,
    select('clusterId', '执行集群', clusterOptions, { required: true, disabled: lockedAfterCreate }),
    select('targetId', '测试对象', deploymentTargets, { required: true, disabled: lockedAfterCreate }),
    quantity('replica', '模型副本序号', 1, 100, 1, { required: true, disabled: lockedAfterCreate }),
    select('profile', '测试方案', benchmarkProfiles, { required: true, defaultValue: '自定义', disabled: lockedAfterCreate, group: '数据集' }),
    select('dataset', '数据集', ['Random', 'ShareGPT'], { defaultValue: 'Random', required: true, disabled: lockedAfterCreate, group: '数据集' }),
    quantity('inputTokens', '输入长度（Token）', 1, 1048576, 512, { required: true, disabled: lockedAfterCreate, visible: randomDataset, group: '数据集' }),
    quantity('outputTokens', '输出长度（Token）', 1, 1048576, 128, { required: true, disabled: lockedAfterCreate, visible: randomDataset, group: '数据集' }),
    field('pinSeed', '固定随机种子', { type: 'switch', disabled: lockedAfterCreate, visible: randomDataset, group: '数据集' }),
    quantity('randomSeed', '随机种子', 1, 2147483647, 42, { required: true, disabled: lockedAfterCreate, visible: draft => randomDataset(draft) && draft.pinSeed, group: '数据集' }),
    field('incrementSeed', '每个阶段递增种子', { type: 'switch', defaultValue: true, disabled: lockedAfterCreate, visible: draft => randomDataset(draft) && draft.loadPattern !== '单次', group: '数据集' }),
    field('tokenDistribution', '使用 Token 长度分布', { type: 'switch', disabled: lockedAfterCreate, visible: randomDataset, group: '数据集' }),
    quantity('inputStdev', '输入长度标准差', 0, 1048576, 64, { disabled: lockedAfterCreate, visible: draft => randomDataset(draft) && draft.tokenDistribution, group: '数据集' }),
    quantity('outputStdev', '输出长度标准差', 0, 1048576, 16, { disabled: lockedAfterCreate, visible: draft => randomDataset(draft) && draft.tokenDistribution, group: '数据集' }),
    quantity('turns', '对话轮数', 1, 100, 1, { disabled: lockedAfterCreate, group: '数据集' }),
    select('loadType', '负载类型', ['固定请求速率', '并发数'], { defaultValue: '固定请求速率', required: true, disabled: lockedAfterCreate, group: '负载配置' }),
    select('loadPattern', '负载模式', ['单次', '手工分阶段', '自动调优'], { defaultValue: '单次', required: true, disabled: lockedAfterCreate, group: '负载配置' }),
    quantity('load', '负载值（请求/秒或并发数）', 1, 10000, 8, { required: true, disabled: lockedAfterCreate, visible: draft => !stagedProfile(draft) && !adaptiveProfile(draft), group: '负载配置' }),
    quantity('requests', '请求总数', 1, 1000000, 500, { required: true, disabled: lockedAfterCreate, visible: draft => !stagedProfile(draft), group: '负载配置' }),
    quantity('duration', '最长时长（秒）', 1, 86400, 120, { required: true, disabled: lockedAfterCreate, visible: draft => !stagedProfile(draft), group: '负载配置' }),
    field('stages', '阶段', { type: 'benchmarkStages', fullWidth: true, defaultValue: [{ load: 8, requests: 200, duration: 60 }], visible: stagedProfile, disabled: lockedAfterCreate, group: '负载配置' }),
    quantity('minLoad', '负载下限', 1, 10000, 1, { required: true, disabled: lockedAfterCreate, visible: adaptiveProfile, group: '负载配置' }),
    quantity('maxLoad', '负载上限', 1, 10000, 64, { required: true, disabled: lockedAfterCreate, visible: adaptiveProfile, group: '负载配置' }),
    quantity('maxPoints', '最大测量点数', 1, 100, 8, { required: true, disabled: lockedAfterCreate, visible: adaptiveProfile, group: '负载配置' }),
    quantity('latencySlo', 'P95 首 Token 时延目标（ms）', 1, 60000, 800, { required: true, disabled: lockedAfterCreate, visible: latencyProfile, group: 'SLO' }),
    quantity('tpotSlo', 'P95 输出 Token 时延目标（ms）', 1, 60000, '', { disabled: lockedAfterCreate, visible: latencyProfile, group: 'SLO' }),
    quantity('totalLatencySlo', 'P95 端到端时延目标（ms）', 1, 60000, '', { disabled: lockedAfterCreate, visible: latencyProfile, group: 'SLO' }),
    quantity('warmup', '预热请求数', 0, 1000000, 3, { disabled: lockedAfterCreate, group: '高级配置' }),
    quantity('cooldown', '冷却时长（秒）', 0, 3600, 0, { disabled: lockedAfterCreate, group: '高级配置' }),
    quantity('maxErrors', '错误数上限', 1, 1000000, '', { disabled: lockedAfterCreate, group: '高级配置' }),
    field('stopOnSaturation', '饱和时停止', { type: 'switch', disabled: lockedAfterCreate, group: '高级配置' }),
  ],
  onFieldChange(_draft, key, value) {
    if (key === 'clusterId') return { targetId: '', replica: 1 };
    if (key === 'targetId') return { replica: 1 };
    if (key === 'profile' && value === '吞吐量') return { dataset: 'ShareGPT', loadType: '固定请求速率', loadPattern: '自动调优' };
    if (key === 'profile' && value === '延迟 SLO') return { loadType: '并发数', loadPattern: '自动调优' };
  },
  detail: [field('name', '测试名称'), field('clusterId', '执行集群', { format: labelOf('clusters') }), field('targetMode', '目标类型'), field('targetId', '测试对象', { format: targetName }), field('profile', '测试方案'), field('dataset', '数据集'), field('loadType', '负载类型'), field('load', '负载值'), field('requests', '请求数'), field('completed', '成功请求数'), field('resultRate', '成功率', { format: value => value == null ? undefined : `${value.toFixed(2)}%` }), field('throughput', '输出吞吐量', { format: suffix('Token/s') }), field('ttft', 'P95 TTFT', { format: suffix('ms') }), field('tpot', 'P95 TPOT', { format: suffix('ms') }), field('latencySlo', 'P95 TTFT 目标', { format: suffix('ms') }), field('resultSource', '结果来源'), status, description, created],
  validate(draft, records, current) {
    if (current) return;
    if (stagedProfile(draft) && (!draft.stages?.length || draft.stages.some(stage => ![stage.load, stage.requests, stage.duration].every(value => Number.isInteger(value) && value > 0)))) return '至少配置一个阶段，负载、请求数和时长须为正整数。';
    if (adaptiveProfile(draft) && draft.maxLoad < draft.minLoad) return '负载上限不能小于下限。';
    const deployment = find(records, 'deployments', draft.targetId);
    if (!readyDeployment(deployment) || deployment.clusterId !== draft.clusterId) return '请选择所选集群中有就绪副本的模型部署。';
    if (!Number.isInteger(Number(draft.replica)) || Number(draft.replica) < 1 || Number(draft.replica) > deployment.readyReplicas) return '副本序号超出当前部署的就绪副本范围。';
  },
  save(draft, records, current) {
    if (current) return {};
    const row = find(records, 'deployments', draft.targetId);
    const requests = stagedProfile(draft) ? draft.stages.reduce((total, stage) => total + stage.requests, 0) : draft.requests;
    const load = stagedProfile(draft) ? draft.stages.at(-1).load : adaptiveProfile(draft) ? draft.maxLoad : draft.load;
    const node = list(records, nodesPage).find(node => node.clusterId === draft.clusterId && node.status === '就绪');
    return { status: '排队中', operationStartedAt: Date.now(), targetMode: '模型实例', targetName: `${row.name} · 副本 ${draft.replica}`,
      requests, load, randomSeed: randomDataset(draft) ? draft.pinSeed ? draft.randomSeed : Math.floor(Math.random() * 2147483646) + 1 : null,
      environment: { cluster: find(records, 'clusters', draft.clusterId)?.name, node: node?.name, gpu: find(records, 'clusters', draft.clusterId)?.gpuType },
      runEvents: addRunEvent({}, '基准测试已提交，等待模拟执行。'),
      latencySlo: draft.profile === '延迟 SLO' ? draft.latencySlo : null };
  },
  canDelete: row => benchmarkActive(row) ? '请先停止正在排队或运行的测试。' : undefined,
  actions: [
    { label: '克隆', editor: { create: true, title: '克隆基准测试', prefill: benchmarkClone,
      validate: (...args) => benchmarks.validate(...args), save: (...args) => benchmarks.save(...args),
    } },
    { label: '查看日志', panel: 'logs', sheet: true },
    { label: '模拟开始测试', when: (row, records) => row.status === '排队中' && !row.operationStartedAt && benchmarkTargetReady(row, records), apply: row => ({ status: '运行中', operationStartedAt: Date.now(), runEvents: addRunEvent(row, '模拟执行开始。') }) },
    { label: '生成模拟结果', when: (row, records) => row.status === '运行中' && !row.operationStartedAt && benchmarkTargetReady(row, records), apply: benchmarkResults },
    { label: '停止', when: benchmarkActive, confirm: '停止本次测试？已提交的测试参数将保留。', apply: row => ({ status: '已停止', operationStartedAt: null, runEvents: addRunEvent(row, '已停止模拟执行。') }) },
    { label: '导出结果', when: row => row.status === '已完成', download: row => benchmarkExport([row]) },
  ],
  batchActions: [
    { label: '导出选中结果', when: rows => rows.length > 0 && rows.length <= 20, download: benchmarkExport },
    { label: '批量删除', when: rows => rows.length > 0 && rows.every(row => !benchmarkActive(row)), confirm: '删除所选基准测试和模拟报告？', apply: () => [] },
  ],
  seed: [
    { id: 'bench-glm-throughput', name: 'GLM-5.2 吞吐基线', profile: '吞吐量', clusterId: 'cluster-sz-a', targetMode: '模型实例', targetId: 'deployment-glm', replica: 1, targetName: 'GLM-5.2 生产服务 · 副本 1', dataset: 'ShareGPT', loadType: '并发数', load: 16, requests: 600, completed: 597, duration: 180, throughput: 1217, ttft: 342, tpot: 18.2, resultRate: 99.5, resultSource: '模拟结果', status: '已完成', createdAt: '2026-11-24 10:12:00' },
    { id: 'bench-glm-regression', name: 'GLM-5.2 固定速率回归', profile: '自定义', clusterId: 'cluster-sz-a', targetMode: '模型实例', targetId: 'deployment-glm', replica: 2, targetName: 'GLM-5.2 生产服务 · 副本 2', dataset: 'Random', inputTokens: 1024, outputTokens: 128, loadType: '固定请求速率', load: 8, requests: 500, duration: 120, status: '已停止', createdAt: '2026-11-25 15:30:00' },
  ],
};

const plainEnv = value => !value || String(value).split('\n').filter(line => line.trim()).every(line => /^[A-Za-z_][A-Za-z0-9_]*=[^\n]*$/.test(line) && !/(?:TOKEN|SECRET|PASSWORD|API_KEY|CREDENTIAL)/i.test(line.split('=')[0]));
const externalCache = draft => draft.provider === 'Mooncake';
const l2Options = ['无', '本地文件系统', 'Redis / Valkey', 'S3'];
const cacheNodes = (records, draft) => nodeOptions(records, draft).filter(option => {
  const labels = names(find(records, nodesPage, option.value)?.labels);
  return names(draft.selector).every(label => labels.includes(label));
});
export const cacheAttachments = (row, records) => list(records, 'deployments').filter(deployment => [deployment, deployment.previousConfig].some(config => {
  const cache = config?.cacheAcceleration;
  return cache && cache.name === row.name && cache.provider === row.provider && cache.clusterId === row.clusterId;
}));
export const cacheInstances = (row, records) => {
  if (externalCache(row)) return row.serviceUrl ? [{ id: 'external', name: '外部服务', address: row.serviceUrl, state: row.status }] : [];
  const candidates = cacheNodes(records, row).filter(node => !row.workerId || node.value === row.workerId);
  const { state } = row.instanceStatus || {};
  const ready = Number.parseInt(row.ready, 10) || 0;
  return candidates.map((option, index) => ({ id: option.value, name: option.label,
    address: find(records, nodesPage, option.value)?.ip, state: state?.[option.value] ?? (row.status === '运行中' && index < ready ? '运行中' : row.status),
    observedAt: row.instanceStatus?.events?.[option.value]?.at || '', memoryGiB: row.memoryGiB,
  }));
};
export const cacheL2Entries = row => Array.isArray(row?.l2Entries) ? row.l2Entries : row?.l2Storage && row.l2Storage !== '无' ? [{ type: row.l2Storage, location: row.l2Location || '' }] : [];
const cacheL2Config = (draft, current) => Array.isArray(draft.l2Entries) ? draft.l2Entries : cacheL2Entries(current);
function configuredCacheProviders() {
  try {
    const settings = JSON.parse(globalThis.localStorage?.getItem('moma-5.12.0-estack:infrastructure:model-sources') || '{}');
    return settings?.['cache-provider']?.definitions;
  } catch { return undefined; }
}
const cacheProviderOptions = records => Array.from(new Set([...(configuredCacheProviders()?.map(item => item.name) || cacheProviders), ...list(records, cachePage).map(row => row.provider)]));
const cacheVersionOptions = (_records, draft) => configuredCacheProviders()?.find(item => item.name === draft.provider)?.versions || cacheVersions[draft.provider] || ['自定义'];
const cacheVersion = draft => {
  const options = cacheVersionOptions(null, draft);
  return options.length === 1 && options[0] === '自定义' ? '自定义' : draft.version;
};
const cacheLog = (row, message) => [...(row.cacheEvents || []), { at: new Date().toISOString(), message }];
export const cacheL2Kinds = l2Options.filter(option => option !== '无');
const cacheAcceleration = {
  title: '缓存加速',
  description: '为集群内的推理部署配置共享 KV 缓存。',
  createLabel: '添加缓存服务',
  hideCreate: true,
  searchPlaceholder: '搜索缓存服务或提供方',
  searchKeys: ['name', 'provider'],
  editable: true,
  deletable: true,
  detailRoute: true,
  actionMenu: true,
  actionWidth: 128,
  columns: [field('name', '服务名称', { width: 175 }), field('provider', '缓存提供方'), field('version', '版本'), field('clusterId', '集群', { format: labelOf('clusters'), width: 160 }), field('ready', '就绪实例'), status, created],
  filters: [field('clusterId', '集群', { options: records => optionsOf(records, 'clusters') }), field('status', '服务状态', { options: ['待检查', '运行中', '异常'] })],
  fields: [name('服务名称'), select('provider', '缓存提供方', cacheProviderOptions, { required: true, defaultValue: 'LMCache' }),
    select('version', '版本', cacheVersionOptions, { defaultValue: (_records, params) => cacheVersionOptions(null, { provider: params?.get?.('provider') || params?.provider || 'LMCache' })[0],
      required: true, visible: (draft, records) => cacheVersionOptions(records, draft).some(version => version !== '自定义') }),
    field('image', '容器镜像', { required: true, visible: draft => cacheVersion(draft) === '自定义' && !externalCache(draft) }),
    select('clusterId', '集群', clusterOptions, { required: true }),
    select('workerId', '固定节点', cacheNodes, { visible: draft => !externalCache(draft) }),
    field('serviceUrl', '外部服务地址', { required: true, visible: externalCache, placeholder: 'https://cache.example.com' }),
    quantity('memoryGiB', '内存容量（GiB）', 1, 2048, 64, { required: true, visible: draft => !externalCache(draft) }),
    field('l2Entries', 'L2 存储优先级', { type: 'cacheL2', fullWidth: true, visible: draft => !externalCache(draft), group: 'L2 存储' }),
    field('managementUrl', '管理界面地址', { placeholder: 'https://cache-console.example.com' }),
    field('selector', '节点标签选择器', { placeholder: 'pool=nj-a', visible: draft => !externalCache(draft) }),
    field('parameters', '组件启动参数', { type: 'textarea', placeholder: '每行填写组件名及启动参数', group: '高级配置' }),
    field('env', '环境变量', { type: 'textarea', placeholder: '变量名=值，每行一个', group: '高级配置' }), description],
  detail: [field('provider', '缓存提供方'), field('version', '版本'), field('image', '容器镜像'), field('clusterId', '集群', { format: labelOf('clusters') }), field('workerId', '固定节点', { format: labelOf(nodesPage) }), field('ready', '就绪实例'), field('memoryGiB', '内存容量', { format: suffix('GiB') }), field('l2Storage', 'L2 存储'), field('l2Location', 'L2 存储地址'), field('serviceUrl', '外部服务地址'), field('managementUrl', '管理界面地址'), field('selector', '节点标签选择器'), field('parameters', '组件启动参数'), status, field('checkResult', '状态信息'), description, created],
  onFieldChange(draft, key, value, records) {
    if (key === 'provider') return { version: cacheVersionOptions(records, { provider: value })[0], workerId: '' };
    if (key === 'clusterId' || key === 'selector' && draft.workerId && !cacheNodes(records, { ...draft, selector: value }).some(node => node.value === draft.workerId)) return { workerId: '' };
  },
  validate(draft, records, current) {
    if (!cacheVersionOptions(records, draft).includes(cacheVersion(draft))) return '请选择缓存提供方支持的版本。';
    if (find(records, 'clusters', draft.clusterId)?.status !== '运行中') return '请选择运行中的集群。';
    if (names(draft.selector).some(label => !/^[\w./-]+=[\w.-]+$/.test(label))) return '节点标签须使用 key=value 格式，多个标签用逗号分隔。';
    if (draft.workerId && !externalCache(draft) && !cacheNodes(records, draft).some(option => option.value === draft.workerId)) return '固定节点须符合所选集群、节点标签和就绪条件。';
    if (externalCache(draft) && !urlValid(draft.serviceUrl.trim())) return '请输入不含凭证的 HTTP(S) 服务地址。';
    if (draft.managementUrl && !urlValid(draft.managementUrl.trim())) return '请输入不含凭证的 HTTP(S) 管理地址。';
    for (const { type, location } of !externalCache(draft) ? cacheL2Config(draft, current) : []) {
      if (type === '本地文件系统' && !absolutePath(location?.trim())) return '本地 L2 存储需填写绝对路径。';
      if (type === 'Redis / Valkey' && !/^rediss?:\/\/[\w.-]+(?::\d+)?(?:\/\d+)?$/.test(location || '')) return '请填写不含凭证的 Redis 或 Valkey 地址。';
      if (type === 'S3' && !/^s3:\/\/[\w.-]+(?:\/[\w./-]*)?$/.test(location || '')) return '请输入 S3 存储路径，例如 s3://cache-bucket/kv。';
    }
    if (!plainEnv(draft.env)) return '环境变量须使用变量名=值格式。访问密钥请通过凭证入口管理。';
    if (current && cacheAttachments(current, records).length && ['name', 'provider', 'clusterId'].some(key => draft[key] !== current[key])) return '请先解除模型部署关联，再修改缓存服务的标识。';
  },
  save(draft, _records, current) {
    const external = externalCache(draft);
    const l2Entries = external ? [] : cacheL2Config(draft, current).map(entry => ({ type: entry.type, location: entry.location.trim() }));
    const version = cacheVersion(draft);
    const configuration = { version, serviceUrl: external ? draft.serviceUrl : '', workerId: external ? '' : draft.workerId || '',
      image: version === '自定义' ? draft.image : '',
      memoryGiB: external ? null : draft.memoryGiB, l2Storage: l2Entries[0]?.type || '无', selector: external ? '' : names(draft.selector).join(', '),
      l2Location: l2Entries[0]?.location || '', l2Entries };
    const compared = { ...configuration, provider: draft.provider, clusterId: draft.clusterId, parameters: draft.parameters, env: draft.env };
    const changed = !current || Object.entries(compared).some(([key, value]) => jsonData(current[key] ?? '') !== jsonData(value ?? ''));
    return { ...configuration, status: changed ? '待检查' : current.status, ready: changed ? '' : current.ready, checkResult: changed ? '' : current.checkResult,
      operationStartedAt: changed ? Date.now() : current.operationStartedAt,
      cacheEvents: changed ? cacheLog(current || {}, '配置已保存，等待实例就绪检查。') : current.cacheEvents };
  },
  canDelete: (row, records) => cacheAttachments(row, records).length ? '缓存服务仍由模型部署或回滚配置使用。' : undefined,
  actions: [{ label: '查看日志', panel: 'logs', sheet: true }, { label: '监控', panel: 'monitor' }, { label: '检查服务', apply: cacheCheck }],
  seed: [
    { id: 'cache-nanjing', name: 'nj-inference-kv', provider: 'LMCache', version: '0.4.2', clusterId: 'cluster-nj-a', memoryGiB: 128, l2Storage: '本地文件系统', l2Location: '/mnt/nvme/kv-cache', ready: '6 / 6', status: '运行中', checkResult: '模拟健康检查通过。', createdAt: '2026-11-21 11:00:00' },
    { id: 'cache-suzhou', name: 'sz-shared-kv', provider: 'Mooncake', version: '外部服务', clusterId: 'cluster-sz-a', serviceUrl: 'https://cache-sz.example.com', ready: '1 / 1', status: '运行中', checkResult: '模拟健康检查通过。', createdAt: '2026-11-22 09:15:00' },
    { id: 'cache-suzhou-test', name: 'sz-cache-validation', provider: 'LMCache', version: '0.4.1', clusterId: 'cluster-sz-a', workerId: 'worker-sz-a-02', memoryGiB: 48, l2Storage: 'Redis / Valkey', l2Location: 'redis://cache-sz.example.com:6379', ready: '0 / 1', status: '异常', checkResult: '模拟状态：L2 存储连接超时。', createdAt: '2026-11-25 14:05:00' },
  ],
};

const localFile = draft => draft.source === '本地路径';
const mountPath = draft => draft.mountPath || `/mnt/models/${draft.repository.split('/').at(-1)}`;
const fileInUse = (row, records) => list(records, 'deployments').some(deployment => row.mountPath && [deployment.weightPath, deployment.previousConfig?.weightPath].includes(row.mountPath));
const selectFileModels = records => records.deployableModels.map(model => ({
  value: model.id, label: `${model.name} · ${model.modelId}`,
}));
function cacheCheck(row, records) {
  const pool = cacheNodes(records, row);
  const instances = externalCache(row) ? 1 : row.workerId ? Number(pool.some(node => node.value === row.workerId)) : pool.length;
  const passed = find(records, 'clusters', row.clusterId)?.status === '运行中' && instances > 0;
  const checkResult = passed ? '模拟健康检查通过。' : '没有符合条件的就绪资源。';
  return { status: passed ? '运行中' : '异常', ready: passed ? `${instances} / ${instances}` : '0 / 1', checkResult,
    operationStartedAt: null, instanceStatus: { ...row.instanceStatus, state: {} }, cacheEvents: cacheLog(row, checkResult) };
}

function fileCheck(row, records) {
  const ready = find(records, nodesPage, row.workerId)?.status === '就绪';
  return ready ? { status: '可用', progress: row.source === '本地路径' ? null : 100, message: '模拟文件检查通过。', operationStartedAt: null }
    : { status: '失败', message: '节点未就绪，无法读取模型文件。', operationStartedAt: null };
}
export function modelFileDeploymentName(row) {
  const path = row.repository || row.mountPath || row.resolvedPaths?.[0] || row.filename || '';
  return path.split(/[\\/]/).filter(Boolean).at(-1)?.toLowerCase().replace(/-\d+-of-\d+(?:\.gguf)?$|\.gguf$/, '') || '';
}

const fileSources = {
  title: '模型文件',
  description: '下载模型或登记节点上的本地权重，查看文件状态并用于部署。',
  createLabel: '添加模型文件',
  hideCreate: true,
  searchPlaceholder: '搜索模型、仓库或本地路径',
  searchKeys: ['name', 'repository', 'mountPath'],
  rowSelection: true,
  actionMenu: true,
  actionWidth: 128,
  columns: [field('name', '模型文件', { width: 190 }), field('source', '来源'), field('workerId', '所在节点', { format: labelOf(nodesPage), width: 165 }), field('mountPath', '本地路径', { width: 205 }), field('sizeGiB', '大小', { format: suffix('GiB') }), field('progress', '下载进度', { format: value => value == null ? undefined : `${value}%` }), status],
  filters: [field('source', '来源', { options: sources }), field('workerId', '节点', { options: records => optionsOf(records, nodesPage) }), field('status', '文件状态', { options: ['可用', '下载中', '失败'] })],
  fields: [name('模型文件名称'), select('source', '来源', sources, { required: true, defaultValue: 'Hugging Face' }),
    field('repository', '模型仓库', { type: 'modelRepository', required: true, fullWidth: true, placeholder: '组织名/模型名', visible: draft => !localFile(draft) }),
    field('filename', '指定文件', { placeholder: '可填写 GGUF 量化文件名', visible: draft => !localFile(draft) }),
    select('workerId', '目标节点', nodeOptions, { required: true }),
    select('modelId', '关联可部署模型', selectFileModels),
    field('mountPath', '节点本地路径', { placeholder: '/mnt/models/模型目录', help: '本地路径来源须填写。仓库下载可留空，由节点分配目录。' }),
    field('lora', 'LoRA 适配器', { type: 'switch' }),
    field('baseModel', '基础模型', { required: true, visible: draft => Boolean(draft.lora) }), description],
  detail: [field('name', '文件名称'), field('source', '来源'), field('repository', '模型仓库'), field('filename', '指定文件'), field('workerId', '所在节点', { format: labelOf(nodesPage) }), field('clusterId', '集群', { format: labelOf('clusters') }), field('mountPath', '节点本地路径'), field('lora', 'LoRA 适配器', { format: yesNo }), field('baseModel', '基础模型'), field('sizeGiB', '文件大小', { format: suffix('GiB') }), field('progress', '下载进度', { format: value => value == null ? undefined : `${value}%` }), status, field('message', '状态信息'), description, created],
  editable: false,
  validate(draft, records) {
    if (!localFile(draft) && !/^[\w.-]+\/[\w.-]+$/.test(draft.repository.trim())) return '请填写组织名/模型名格式的仓库名称。';
    const path = localFile(draft) ? draft.mountPath : mountPath(draft);
    if (!absolutePath(path)) return '请填写有效的绝对路径，例如 /mnt/models/qwen。';
    if (!nodeOptions(records, {}).some(node => node.value === draft.workerId)) return '请选择就绪的目标节点。';
    if (list(records, filesPage).some(row => row.workerId === draft.workerId && row.mountPath === path)) return '所选节点上已登记相同的本地路径。';
  },
  save(draft, records) {
    return { clusterId: find(records, nodesPage, draft.workerId)?.clusterId, baseModel: draft.lora ? draft.baseModel : '', mountPath: localFile(draft) ? draft.mountPath : mountPath(draft),
      repository: localFile(draft) ? '' : draft.repository, filename: localFile(draft) ? '' : draft.filename,
      status: '下载中', progress: localFile(draft) ? null : 0, operationStartedAt: Date.now(), message: localFile(draft) ? '等待核验本地目录。' : '等待节点下载。' };
  },
  canDelete: (row, records) => fileInUse(row, records) ? '此路径仍由部署当前配置或回滚配置引用。' : undefined,
  actions: [
    { label: '部署', when: row => row.status === '可用' && !row.lora, deployModelFile: true },
    { label: '删除', panel: 'delete' },
    { label: '重试下载', when: row => row.status === '失败' && row.source !== '本地路径', apply: () => ({ status: '下载中', progress: 0, operationStartedAt: Date.now(), message: '重新提交模拟下载。' }) },
    { label: '检查文件', when: row => row.status === '下载中' && !row.operationStartedAt || row.status === '失败' && row.source === '本地路径', apply: fileCheck },
  ],
  seed: [
    { id: 'file-bge-m3-nj', name: 'BGE-M3 权重', source: 'Hugging Face', repository: 'BAAI/bge-m3', modelCode: 'bge-m3', workerId: 'worker-nj-a-01', clusterId: 'cluster-nj-a', mountPath: '/mnt/models/bge-m3', sizeGiB: 2.27, progress: 100, status: '可用', createdAt: '2026-11-20 10:30:00' },
    { id: 'file-glm52-sz', name: 'GLM-5.2 权重', source: '本地路径', modelCode: 'glm-5.2', workerId: 'worker-sz-a-01', clusterId: 'cluster-sz-a', mountPath: '/mnt/models/glm-5.2', sizeGiB: 236.8, status: '可用', createdAt: '2026-11-21 09:30:00' },
    { id: 'file-qwen35-nj', name: 'Qwen3.5-9B 权重', source: 'ModelScope', repository: 'Qwen/Qwen3.5-9B', workerId: 'worker-nj-a-02', clusterId: 'cluster-nj-a', mountPath: '/mnt/models/qwen3.5-9b', progress: 65, status: '下载中', createdAt: '2026-11-26 16:12:00' },
    { id: 'file-rerank-sz', name: 'BGE Reranker 权重', source: 'Hugging Face', repository: 'BAAI/bge-reranker-v2-m3', modelCode: 'bge-reranker-v2-m3', workerId: 'worker-sz-a-02', clusterId: 'cluster-sz-a', mountPath: '/mnt/models/bge-reranker-v2-m3', progress: 22, status: '失败', message: '模拟下载记录：模型仓库连接超时。', createdAt: '2026-11-25 16:10:00' },
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
  [benchmarksPage]: benchmarks,
  [backendsPage]: INFERENCE_BACKEND_PAGE,
  [cachePage]: cacheAcceleration,
  [filesPage]: fileSources,
};
