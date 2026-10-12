export const DEPLOYABLE_TYPES = ['text', 'multimodal', 'embedding', 'rerank'];
const configKeys = ['modelId', 'runtimeId', 'weightId', 'weightPath', 'clusterId', 'namespace', 'replicas', 'gpuPerReplica', 'tensorParallel', 'pipelineParallel', 'maxModelLen', 'gpuMemoryUtilization', 'startupTimeout'];
export const deploymentConfig = item => Object.fromEntries(configKeys.map(key => [key, item[key]]));
export const deploymentGpu = item => ['停止', '失败'].includes(item.status) ? 0 : item.replicas * item.gpuPerReplica;
export const deploymentUsesArtifact = (item, id) => [item.artifactId, item.runtimeId, item.weightId, item.previousConfig?.runtimeId, item.previousConfig?.weightId].includes(id);
export const runnableArtifact = (item, type) => item?.type === type && item.validation === '通过' && item.status === '可运行';
const integer = (value, label, max = 1000000) => { const number = Number(value); if (!Number.isInteger(number) || number < 1 || number > max) throw new Error(`${label}必须为 1–${max} 的整数`); return number; };

export function deploymentPreflight(state, values, existing) {
  const model = state.models.find(item => item.id === values.modelId);
  if (!model || !DEPLOYABLE_TYPES.includes(model.type)) throw new Error('请选择语言、多模态理解、向量或重排模型；当前运行环境不支持图像、视频或语音生成');
  const runtime = state.artifacts.find(item => item.id === values.runtimeId);
  if (!runnableArtifact(runtime, '运行时镜像')) throw new Error('请选择验证通过且可运行的运行时镜像');
  if (values.weightId) {
    const weight = state.artifacts.find(item => item.id === values.weightId);
    if (!runnableArtifact(weight, '模型制品')) throw new Error('模型权重必须是验证通过且可运行的模型制品');
    if (weight.modelId && weight.modelId !== model.id) throw new Error('模型权重与所选模型不匹配');
  } else if (!/^\/[\w./-]+$/.test(values.weightPath || '') || values.weightPath.split('/').includes('..')) throw new Error('请填写集群已挂载的绝对权重路径，不允许上级目录或命令参数');
  const cluster = state.clusters.find(item => item.id === values.clusterId);
  if (!cluster || cluster.status !== '运行中') throw new Error('目标集群必须处于运行中');
  const replicas = integer(values.replicas, '副本数', 100), gpuPerReplica = integer(values.gpuPerReplica, '每副本 GPU', 64);
  const tensorParallel = integer(values.tensorParallel, '张量并行', 64), pipelineParallel = integer(values.pipelineParallel, '流水线并行', 64);
  if (tensorParallel * pipelineParallel !== gpuPerReplica) throw new Error('每副本 GPU 必须等于张量并行 × 流水线并行');
  if (!/^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/.test(values.namespace || '')) throw new Error('命名空间须使用小写字母、数字或连字符，长度不超过63');
  const maxModelLen = values.maxModelLen === '' || values.maxModelLen == null ? null : integer(values.maxModelLen, '上下文上限', 10485760);
  if (maxModelLen && model.capabilities?.context && maxModelLen > model.capabilities.context) throw new Error('上下文上限不能超过已登记的模型规格');
  const gpuMemoryUtilization = Number(values.gpuMemoryUtilization);
  if (!(gpuMemoryUtilization > 0 && gpuMemoryUtilization <= 1)) throw new Error('显存利用比例须大于0且不超过1');
  const startupTimeout = integer(values.startupTimeout, '启动超时', 7200);
  const available = cluster.totalGpu - cluster.allocatedGpu + (existing?.clusterId === cluster.id ? deploymentGpu(existing) : 0), required = replicas * gpuPerReplica;
  if (required > available) throw new Error(`GPU 容量不足：需要 ${required} 张，可用 ${available} 张`);
  return { modelId: model.id, runtimeId: runtime.id, weightId: values.weightId || '', weightPath: values.weightId ? '' : values.weightPath.trim(), clusterId: cluster.id, namespace: values.namespace, replicas, gpuPerReplica, tensorParallel, pipelineParallel, maxModelLen, gpuMemoryUtilization, startupTimeout, available, required };
}

// shortcut: lifecycle reconciliation is local; replace with controller observations when a cluster API is connected.
export function deploymentTransaction(state, action) {
  const { operation, data = {}, deploymentId } = action;
  const timestamp = new Date().toISOString(), item = state.deployments.find(row => row.id === deploymentId);
  const changes = [], event = (message, level = '正常') => ({ at: timestamp, message, level });
  let target = item, patch, label;
  if (operation === 'create') {
    if (!/^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/.test(data.deploymentId || '')) throw new Error('部署编码须使用小写字母、数字或连字符，长度不超过63');
    if (!data.name?.trim() || data.name.trim().length > 80) throw new Error('请填写不超过80字的服务名称');
    if (state.deployments.some(row => row.deploymentId === data.deploymentId)) throw new Error('部署编码已存在');
    const checked = deploymentPreflight(state, data);
    target = { id: `deployment-${crypto.randomUUID()}`, deploymentId: data.deploymentId, name: data.name.trim(), ...deploymentConfig(checked), status: '部署中', readyReplicas: 0, endpointId: null, configRevision: 1, events: [event('部署已提交，GPU 资源已预留；等待启动检查')] };
    changes.push({ type: 'add', collection: 'deployments', record: target });
    const cluster = state.clusters.find(row => row.id === checked.clusterId);
    changes.push({ type: 'update', collection: 'clusters', id: cluster.id, changes: { allocatedGpu: cluster.allocatedGpu + checked.required } });
    label = '创建模型部署';
  } else {
    if (!item) throw new Error('部署不存在，请返回列表刷新');
    const cluster = state.clusters.find(row => row.id === item.clusterId);
    const endpoint = state.endpoints.find(row => row.id === item.endpointId);
    const updateEndpoint = status => { if (endpoint) changes.push({ type: 'update', collection: 'endpoints', id: endpoint.id, changes: { status } }); };
    const release = () => {
      const used = deploymentGpu(item);
      if (used) { if (!cluster || cluster.allocatedGpu < used) throw new Error('集群资源记录不一致，请核对后重试'); changes.push({ type: 'update', collection: 'clusters', id: cluster.id, changes: { allocatedGpu: cluster.allocatedGpu - used } }); }
    };
    if (operation === 'stop') {
      if (item.status === '停止') throw new Error('部署已经停止');
      release(); updateEndpoint('停用');
      patch = { status: '停止', readyReplicas: 0, failureReason: '', events: [...(item.events || []), event('部署已停止，GPU 资源已释放；端点已停用')] };
      label = '停止模型部署';
    } else if (operation === 'scale') {
      if (item.status !== '运行中') throw new Error('仅运行中的部署可扩缩容');
      const replicas = integer(data.replicas, '副本数', 100);
      if (replicas === item.replicas) throw new Error('副本数未变化');
      const delta = (replicas - item.replicas) * item.gpuPerReplica;
      if (!cluster || (delta > 0 && cluster.status !== '运行中')) throw new Error('目标集群不可用于扩容');
      if (delta > cluster.totalGpu - cluster.allocatedGpu || cluster.allocatedGpu + delta < 0) throw new Error('GPU 容量不足或资源记录不一致');
      changes.push({ type: 'update', collection: 'clusters', id: cluster.id, changes: { allocatedGpu: cluster.allocatedGpu + delta } });
      patch = { replicas, readyReplicas: item.readyReplicas == null ? null : Math.min(item.readyReplicas, replicas), status: '扩缩容中', events: [...(item.events || []), event(`目标副本由 ${item.replicas} 调整为 ${replicas}；等待就绪检查`)] };
      label = '调整部署副本';
    } else if (['update', 'rollback', 'start'].includes(operation)) {
      if (operation === 'start' && !['停止', '失败'].includes(item.status)) throw new Error('当前部署不能重新启动');
      if (operation === 'rollback' && item.status !== '运行中') throw new Error('仅运行中的部署可回滚');
      if (operation === 'update' && !['运行中', '停止', '失败'].includes(item.status)) throw new Error('部署任务进行中，不能更新配置');
      if (operation === 'rollback' && !item.previousConfig) throw new Error('没有可回滚的配置版本');
      const values = operation === 'rollback' ? item.previousConfig : operation === 'start' ? item : { ...item, ...data };
      if (values.clusterId !== item.clusterId || values.modelId !== item.modelId) throw new Error('更换模型或集群请新建部署');
      const checked = deploymentPreflight(state, values, item), config = deploymentConfig(checked);
      if (operation === 'update' && JSON.stringify(config) === JSON.stringify(deploymentConfig(item))) throw new Error('配置未变化');
      const delta = checked.required - deploymentGpu(item);
      if (cluster.allocatedGpu + delta < 0) throw new Error('集群资源记录不一致');
      changes.push({ type: 'update', collection: 'clusters', id: cluster.id, changes: { allocatedGpu: cluster.allocatedGpu + delta } });
      updateEndpoint('停用');
      patch = { ...config, status: operation === 'start' ? '部署中' : '更新中', readyReplicas: 0, failureReason: '', configRevision: (item.configRevision || 1) + (operation === 'start' ? 0 : 1), previousConfig: operation === 'start' ? item.previousConfig : item.runtimeId && (item.weightId || item.weightPath) && item.tensorParallel ? deploymentConfig(item) : null, events: [...(item.events || []), event(operation === 'start' ? '重新启动已提交，GPU 资源已预留' : operation === 'rollback' ? '已提交上一版配置，等待重新启动' : '重建更新已提交，端点暂时停用；等待重新启动')] };
      label = operation === 'start' ? '重新启动部署' : operation === 'rollback' ? '回滚部署配置' : '更新部署配置';
    } else if (operation === 'check') {
      if (!['部署中', '扩缩容中', '更新中'].includes(item.status)) throw new Error('当前部署没有待检查的任务');
      let failure = '';
      try { deploymentPreflight(state, item, item); } catch (error) { failure = error.message; }
      if (failure) {
        release(); updateEndpoint('停用');
        patch = { status: '失败', readyReplicas: 0, failureReason: failure, events: [...(item.events || []), event(`${failure}；已释放GPU预留`, '异常')] };
        label = '部署检查失败';
      } else {
        let endpointId = endpoint?.id;
        if (endpoint) updateEndpoint('运行中');
        else {
          if (!state.providers.some(row => row.id === 'provider-self')) throw new Error('自有推理供应商未登记，不能生成服务端点');
          endpointId = `endpoint-${crypto.randomUUID()}`;
          changes.push({ type: 'add', collection: 'endpoints', record: { id: endpointId, endpointId: `ep-${item.deploymentId}`, name: item.name, providerId: 'provider-self', protocol: 'OpenAI', baseUrl: `https://inference.demo.invalid/${item.deploymentId}/v1`, credentialRef: 'managed-by-platform', modelIds: [item.modelId], capacity: null, health: null, status: '运行中' } });
        }
        patch = { status: '运行中', readyReplicas: item.replicas, endpointId, failureReason: '', events: [...(item.events || []), event('启动检查完成，目标副本就绪；内部OpenAI端点已启用')] };
        label = '检查部署状态';
      }
    } else throw new Error('未知部署操作');
    changes.unshift({ type: 'update', collection: 'deployments', id: item.id, changes: patch });
  }
  return { type: 'batch', objectId: target.id, changes, label };
}
