import { APPLICATION_CONFIG } from '../mock/application-data.js';
import { systemModelData } from '../mock/model-data.js';

export const demoProviderId = 'provider-inference-demo';
export const demoConnectionDeploymentId = 'deployment-bge-nj-online';
const day = 86_400_000;
const instance = (nameSuffix, workerId, firstGpu, gpuCount) => ({
  nameSuffix, workerId,
  gpuIds: Array.from({ length: gpuCount }, (_, index) => `${workerId}-gpu-${firstGpu + index}`),
});

function demoModel(state, slug, type, fallback, createdAt, createModelId) {
  const match = [...state.models, ...state.modelTemplates].find(row => row.modelId === slug && row.type === type);
  if (match) return match.id;
  if (!fallback) throw Error(`模型推理演示缺少模型资料 ${slug}`);
  const id = createModelId(slug);
  state.modelTemplates.push({ id, modelId: slug, type, ...fallback, createdAt, updatedAt: createdAt, revision: 1 });
  return id;
}

export function createInferenceDemoFixtures({ models: sourceModels, modelTemplates }, deployments, now,
  createModelId = slug => `model-inference-demo-${slug}`) {
  const modelRecords = { models: sourceModels, modelTemplates: [...modelTemplates] };
  const when = offset => new Date(now - offset).toISOString();
  const stamp = { createdAt: when(5 * day), updatedAt: when(0), revision: 1 };
  const models = {
    deepseek: demoModel(modelRecords, 'deepseek-v4-pro', 'text'),
    glm: demoModel(modelRecords, 'glm-5.2', 'text'),
    bge: demoModel(modelRecords, 'bge-m3', 'embedding'),
    qwen: demoModel(modelRecords, 'qwen3-0.6b-base', 'text', {
      name: 'Qwen3-0.6B-Base', maker: 'Qwen', description: '小型基础模型，用于节点启动演示。', capabilities: { context: 32768 },
    }, stamp.createdAt, createModelId),
    distill: demoModel(modelRecords, 'deepseek-r1-distill-qwen-1.5b', 'text', {
      name: 'DeepSeek-R1-Distill-Qwen-1.5B', maker: '深度求索', description: '蒸馏语言模型，用于运行配置校验。', capabilities: { context: 32768 },
    }, stamp.createdAt, createModelId),
  };
  const nj = 'cluster-nj-a', sz = 'cluster-sz-a';
  const nj01 = 'worker-nj-a-01', nj02 = 'worker-nj-a-02', nj03 = 'worker-nj-a-03', sz01 = 'worker-sz-a-01';
  const config = (backend, backendVersion, repository, weightPath, gpuPerReplica) => ({
    source: 'ModelScope', repository, weightPath, runtimeMode: '推理后端版本',
    backend, backendVersion, namespace: 'inference-demo', gpuPerReplica,
    tensorParallel: gpuPerReplica, pipelineParallel: 1, maxModelLen: 8192,
    gpuMemoryUtilization: 0.87, startupTimeout: 600, placement: '自动调度',
    placementTargets: [], enableInternalRoute: true,
  });
  const cache = (id, name, clusterId) => ({ enabled: true, mode: 'shared', service: { id, name, clusterId, provider: 'LMCache' } });
  const deepseek = {
    ...config('SGLang', '0.5.10', 'deepseek-ai/DeepSeek-V4-Pro', '/mnt/models/deepseek-v4-pro', 4),
    modelId: models.deepseek, readyReplicas: 4, description: '量化演示权重，跨两台 H20 节点运行。',
    kvCache: cache('cache-nanjing', 'nj-inference-kv', nj),
    demoInstances: [
      instance('h7m2k', nj01, 0, 4), instance('p4r9s', nj01, 4, 4),
      instance('t6q1v', nj02, 0, 4), instance('w3f8n', nj02, 4, 4),
    ],
  };
  const glm = {
    ...config('vLLM', '0.23.0', 'ZhipuAI/GLM-5.2-FP8', '/mnt/models/glm-5.2-fp8', 4),
    modelId: models.glm, readyReplicas: 2, description: '两条量化推理副本共享苏州 KV 缓存。',
    modelFileId: 'file-glm52-fp8-sz', placement: '指定节点', placementTargets: [sz01],
    kvCache: cache('cache-suzhou-glm', 'sz-glm-lmcache', sz),
    demoInstances: [instance('a9k3m', sz01, 0, 4), instance('e2r7p', sz01, 4, 4)],
  };
  const runningBge = {
    ...stamp, ...config('vLLM', '0.23.0', 'BAAI/bge-m3', '/mnt/models/bge-m3', 1),
    id: demoConnectionDeploymentId, deploymentId: 'deploy-bge-m3-nj', name: 'BGE-M3 向量检索',
    modelId: models.bge, clusterId: nj, replicas: 1, readyReplicas: 1, status: '运行中',
    source: 'Hugging Face', modelFileId: 'file-bge-m3-nj-03', placement: '指定节点', placementTargets: [nj03],
    demoInstances: [instance('j8v2s', nj03, 0, 1)],
  };
  const qwen = {
    ...stamp, ...config('vLLM', '0.23.0', 'Qwen/Qwen3-0.6B-Base', '/mnt/models/qwen3-0.6b-base', 1),
    id: 'deployment-qwen-06b-smoke', deploymentId: 'qwen3-06b-smoke', name: 'Qwen3-0.6B 启动验证',
    modelId: models.qwen, clusterId: nj, replicas: 1, readyReplicas: 0, status: '部署中',
    createdAt: when(55 * 60_000),
    demoInstances: [{ ...instance('m3q8d', 'worker-nj-a-04', 0, 1), starting: true, message: '正在下载 ModelScope 权重，尚未开始健康检查。' }],
    events: [
      { at: when(50 * 60_000), level: '信息', instanceId: 'deployment-qwen-06b-smoke:1', message: '调度到 worker-nj-a-04，开始准备 ModelScope 权重。' },
      { at: when(5 * 60_000), level: '信息', instanceId: 'deployment-qwen-06b-smoke:1', message: '权重下载进度 47%，推理进程尚未启动。' },
    ],
  };
  const failed = {
    ...stamp, ...config('vLLM', '0.23.0', 'deepseek-ai/DeepSeek-R1-Distill-Qwen-1.5B', '/mnt/models/deepseek-r1-distill-qwen-1.5b', 1),
    id: 'deployment-r1-distill-smoke', deploymentId: 'r1-distill-15b-smoke', name: 'DeepSeek-R1 蒸馏模型显存校验',
    modelId: models.distill, clusterId: sz, replicas: 1, readyReplicas: 0, status: '失败',
    createdAt: when(2 * day), failureReason: '节点可用显存不足，无法载入权重并预留 KV 缓存。',
    demoInstances: [{ nameSuffix: 'd4n7w', workerId: 'worker-sz-a-03' }],
    events: [
      { at: when(2 * day - 90_000), level: '信息', instanceId: 'deployment-r1-distill-smoke:1', message: '调度到 worker-sz-a-03，开始加载模型。' },
      { at: when(2 * day - 180_000), level: '异常', instanceId: 'deployment-r1-distill-smoke:1', message: '可用显存不足，模型载入失败。已释放本次预留。' },
    ],
  };

  const providers = [{ ...stamp, id: demoProviderId, name: '模型推理演示', code: 'inference-demo',
    sourceType: 'selfHosted', status: '已启用', catalogueScope: 'managed', apiKeys: [] }];
  const patch = new Map([['deployment-ds', deepseek], ['deployment-glm', glm],
    ['deployment-bge', { modelId: models.bge, readyReplicas: 0, demoInstances: [], description: '第二组向量副本待调度。' }]]);
  const demoDeployments = [...structuredClone(deployments).map(row => ({ ...row, ...patch.get(row.id) })), runningBge, qwen, failed];
  const endpoints = [], routes = [];
  for (const deployment of demoDeployments.filter(row => ['deployment-ds', 'deployment-glm', runningBge.id].includes(row.id))) {
    const endpointId = `endpoint-${deployment.deploymentId}-demo`;
    const routeId = `demo-${deployment.deploymentId}`;
    deployment.endpointId = endpointId;
    endpoints.push({ ...stamp, id: endpointId, endpointId, providerId: demoProviderId, name: deployment.name,
      protocol: 'OpenAI', baseUrl: `https://inference.demo.invalid/${deployment.deploymentId}/v1`,
      authMode: 'none', modelIds: [deployment.modelId], status: '运行中',
    });
    routes.push({ ...stamp, id: routeId, routeId, name: deployment.name, modelId: deployment.modelId,
      status: '已启用', mode: '加权', targets: [{ endpointId, weight: 100 }],
    });
  }
  return { modelTemplates: modelRecords.modelTemplates, deployments: demoDeployments, providers, endpoints, routes };
}

export function createInferenceDemoState(now = Date.now()) {
  const { clusters, artifacts, deployments } = APPLICATION_CONFIG.initial;
  const { models } = systemModelData();
  const modelIds = new Set(['model-1', 'model-2', 'catalog-demo-embedding']);
  const sampleModels = models.filter(row => modelIds.has(row.id)).map(({ id, modelId, name, type, capabilities }) =>
    ({ id, modelId, name, type, capabilities }));
  const fixtures = createInferenceDemoFixtures({ models: sampleModels, modelTemplates: [] }, deployments, now);
  return {
    ...fixtures, clusters: structuredClone(clusters), artifacts: structuredClone(artifacts), models: sampleModels,
    admins: [], audits: [], modelSupplies: [], requests: [], revision: 1,
  };
}
