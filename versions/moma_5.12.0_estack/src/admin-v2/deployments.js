import { resourceId } from '../resource-id.mjs';
import { PD_NODE_LAYER, validateDeploymentOptions } from './deployment-options.js';
import { evaluateDeploymentSchedule } from './deployment-schedule.js';
export const DEPLOYABLE_TYPES = ['text', 'multimodal', 'embedding', 'rerank'];
export const deployableModels=state=>[...state.models,...(state.modelTemplates || []).filter(material=>!state.models.some(service=>service.id===material.id))]
  .filter(row=>DEPLOYABLE_TYPES.includes(row.type) && !row.archivedAt && !row.deletedAt);
export const deploymentConfigKeys = ['modelId', 'modelFileId', 'runtimeId', 'weightId', 'weightPath', 'clusterId', 'namespace', 'replicas', 'gpuPerReplica', 'tensorParallel', 'pipelineParallel', 'maxModelLen', 'gpuMemoryUtilization', 'startupTimeout',
  'runtimeMode', 'backend', 'backendVersion', 'containerImage', 'containerCommand', 'source', 'repository', 'filename', 'placement', 'placementTargets', 'placementStrategy', 'description', 'environment', 'parameters',
  'roles', 'pdMode', 'pdSettings', 'roleConfigs', 'scalingRules', 'scalingSchedule', 'cacheAcceleration', 'kvCache', 'loraAdapters', 'speculative', 'offloading', 'distributedInference', 'restartOnError', 'nativeAnthropic', 'enableInternalRoute', 'genericProxy'];
export const deploymentConfig = item => Object.fromEntries(deploymentConfigKeys.map(key => [key, item[key]]));
export const requestedDeploymentGpu = ({roles, roleConfigs, replicas, gpuPerReplica}) => roles && roleConfigs
  ? ['prefill','decode'].reduce((sum,role)=>sum+roles[role]*(roleConfigs[role]?.gpuPerReplica ?? gpuPerReplica),0)
  : replicas * gpuPerReplica;
export const deploymentGpu = item => ['停止', '失败'].includes(item.status) ? 0 : requestedDeploymentGpu(item);
const liveFields = new Set(['replicas','description','nativeAnthropic','scalingRules','scalingSchedule','genericProxy']);
export const deploymentRequiresRecreation = (before,after) => deploymentConfigKeys.some(key=>!liveFields.has(key) &&
  JSON.stringify(before[key])!==JSON.stringify(after[key]));
export const runnableArtifact = (item, type) => item?.type === type && item.validation === '通过' && item.status === '可运行';
const integer = (value, label, max = 1000000) => { const number = Number(value); if (!Number.isInteger(number) || number < 1 || number > max) throw new Error(`${label}必须为 1–${max} 的整数`); return number; };

function replicaCount(value, roles) {
  const minimum = roles ? 1 : 0;
  const count = typeof value==='number' || typeof value==='string' && /^\d+$/.test(value) ? Number(value) : NaN;
  if (!Number.isInteger(count) || count<minimum || count>100) throw Error(`副本数必须为 ${minimum}–100 的整数`);
  return count;
}

export const instanceFilterStates = [
  ['running', '运行中'], ['error', '错误'], ['pending', '待调度'], ['starting', '启动中'],
];

export function deploymentTablePage(rows, columns, sort, pagination) {
  const compare = columns.find(column=>column.dataIndex===sort?.dataIndex)?.sorter;
  const order = sort?.sortOrder;
  const sorted = typeof compare==='function' && (order==='ascend' || order==='descend')
    ? [...rows].sort((a,b)=>compare(a,b)*(order==='ascend' ? 1 : -1)) : rows;
  return sorted.slice((pagination.currentPage-1)*pagination.pageSize,pagination.currentPage*pagination.pageSize);
}

const rebuildingOrdinals = item => item.rebuildingInstances || (item.rebuildingInstance ? [item.rebuildingInstance] : []);
const instanceIdentitySuffix = (deployment, replacement) =>
  `${deployment.instanceGeneration ? `:g${deployment.instanceGeneration}` : ''}${replacement ? `:r${replacement.sequence}` : ''}`;

function scaleInstanceIdentities(item, replicas, timestamp) {
  if (replicas <= item.replicas) return item.instanceReplacements;
  const identities = { ...item.instanceReplacements };
  for (let ordinal = item.replicas + 1; ordinal <= replicas; ordinal += 1) {
    identities[ordinal] = { sequence:(identities[ordinal]?.sequence || 0)+1,createdAt:timestamp };
  }
  return identities;
}

export function deploymentPlacementForRole(deployment, role) {
  const override = deployment.roleConfigs?.[role];
  const placement = override?.placement ?? (role === 'router' && deployment.roleConfigs ? '自动调度' : deployment.placement);
  const targets = (override?.placement ? override.placementTargets : deployment.placementTargets) || [];
  return { placement, targets };
}

export function gatherLayerAvailable(layers, id) {
  const declared = layers?.find(layer => layer.id === id);
  return declared ? !declared.disabled : [PD_NODE_LAYER, 'zone', 'rack'].includes(id);
}

export function deploymentInstances(deployments, infrastructure = {}) {
  const nodes = infrastructure['ops-nodes'] || [];
  const gpus = infrastructure['ops-gpus'] || [];
  return deployments.flatMap(deployment => {
    if (deployment.retiredAt || deployment.status === '停止' || !Number.isInteger(deployment.readyReplicas) ||
      !Number.isInteger(deployment.replicas)) return [];
    const rebuilding = rebuildingOrdinals(deployment);
    const roles = ['prefill', 'decode', 'router'].flatMap(role =>
      Array.from({ length: deployment.roles?.[role] || 0 }, () => role));
    const pendingSet = new Set(rebuilding);
    let ready = deployment.readyReplicas;
    return Array.from({ length: deployment.replicas }, (_, index) => {
      const ordinal = index + 1;
      const replacement = deployment.instanceReplacements?.[ordinal];
      const suffix = instanceIdentitySuffix(deployment,replacement);
      const sample = suffix ? undefined : deployment.demoInstances?.[index];
      const state = pendingSet.has(ordinal) ? 'starting' : deployment.status === '失败' ? 'error'
        : ready > 0 ? 'running' : sample?.starting && deployment.status === '部署中' ? 'starting' : 'pending';
      if (state === 'running') ready -= 1;
      const role = roles[index];
      const override = deployment.roleConfigs?.[role];
      const { placement, targets } = deploymentPlacementForRole(deployment, role);
      const requestedDevices = placement==='指定 GPU' ? targets.map(id=>gpus.find(gpu=>
        gpu.clusterId===deployment.clusterId && gpu.id===id)).filter(Boolean) : [];
      const nodeIds = placement==='指定节点' ? targets : [...new Set(requestedDevices.map(gpu=>gpu.nodeId))];
      const nodeId = sample?.workerId ?? (nodeIds.length === 1 ? nodeIds[0] : undefined);
      const targetNode = nodes.find(node=>node.id===nodeId && node.clusterId===deployment.clusterId);
      const solo = role ? override?.placement && deployment.roles[role]===1 : deployment.replicas===1;
      const devices = sample ? gpus.filter(gpu=>targetNode && gpu.nodeId===targetNode.id && gpu.clusterId===deployment.clusterId &&
        sample.gpuIds?.includes(gpu.id)) : solo && requestedDevices.length===targets.length ? requestedDevices : [];
      const allocatedVram = devices.length && devices.every(gpu=>Number.isFinite(gpu.vramAllocated))
        ? devices.reduce((total,gpu)=>total + gpu.vramAllocated,0) : undefined;
      return {
        id: `${deployment.id}:${ordinal}${suffix}`,
        ordinal, name: `${deployment.deploymentId}-${sample?.nameSuffix || ordinal}${suffix.replaceAll(':','-')}`,
        deployment, state, role, backend:override?.backend ?? deployment.backend,
        backendVersion:override?.backendVersion ?? (override?.containerImage || override?.backend ? undefined : deployment.backendVersion),
        workerId: targetNode?.id, workerName: targetNode?.name, devices, allocatedVram,
        createdAt: replacement?.createdAt || deployment.instanceGenerationAt || deployment.createdAt, restartCount: replacement?.sequence,
        statusMessage: state === 'error' ? deployment.failureReason : state === 'starting' ? sample?.message : undefined,
        draining: pendingSet.has(ordinal),
      };
    });
  });
}

export function canRecreateInstance(row) {
  return !row.draining && !rebuildingOrdinals(row.deployment).length &&
    ['运行中', '失败', '部署中', '扩缩容中'].includes(row.deployment.status);
}

export function deploymentCanServe(item) {
  if (!item.readyReplicas || item.status!=='运行中') return false;
  if (!item.roles) return true;
  if (item.pdSettings?.readiness==='all') return item.readyReplicas===item.replicas;
  const readyRoles = new Set(deploymentInstances([item]).filter(row=>row.state==='running').map(row=>row.role));
  return ['prefill','decode','router'].every(role=>readyRoles.has(role));
}

export function validateDeploymentIdentity(state, { name, deploymentId }) {
  if (typeof name !== 'string' || !name.trim() || !deploymentId) throw Error('请填写部署名称和编码');
  if (name.trim().length > 80) throw Error('请填写不超过80字的服务名称');
  if (typeof deploymentId !== 'string' || !/^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/.test(deploymentId)) {
    throw Error('部署编码须使用小写字母、数字或连字符，长度不超过63');
  }
  if (state.deployments.some(row => row.deploymentId === deploymentId)) throw Error('部署编码已存在');
}

export function deploymentPreflight(state, values, existing, { checkCapacity = true, enforceUniqueScheduleStarts = false, evaluatedAt } = {}) {
  const options = validateDeploymentOptions(values,{originalSchedule:existing?.scalingSchedule,enforceUniqueScheduleStarts});
  const model=deployableModels(state).find(item=>item.id===values.modelId);
  if(!model) throw new Error('请选择语言模型、多模态理解、向量模型或重排序模型；当前运行环境不支持图像、视频或语音生成');
  const runtime = state.artifacts.find(item => item.id === values.runtimeId);
  if (options.runtimeMode === '已登记运行时镜像' && !runnableArtifact(runtime, '运行时镜像')) throw new Error('请选择验证通过且可运行的运行时镜像');
  if (values.weightId) {
    const weight = state.artifacts.find(item => item.id === values.weightId);
    if (!runnableArtifact(weight, '模型制品')) throw new Error('模型权重必须是验证通过且可运行的模型制品');
    if (weight.modelId && weight.modelId !== model.id) throw new Error('模型权重与所选模型不匹配');
  } else if (!/^\/[\w./-]+$/.test(values.weightPath || '') || values.weightPath.split('/').includes('..')) throw new Error('请填写集群已挂载的绝对权重路径，不允许上级目录或命令参数');
  const cluster = state.clusters.find(item => item.id === values.clusterId);
  if (!cluster || cluster.status !== '运行中') throw new Error('目标集群必须处于运行中');
  const gatherLayer = options.pdSettings?.gather?.layer;
  if (gatherLayer && !gatherLayerAvailable(cluster.topologyLayers, gatherLayer)) throw Error('所选聚集层级在目标集群中不可用');
  const requested = (evaluatedAt ? evaluateDeploymentSchedule(options.scalingSchedule,{now:evaluatedAt})?.replicas : undefined) ?? values.replicas;
  const replicas = replicaCount(requested,options.roles);
  const gpuPerReplica = integer(values.gpuPerReplica, '每副本 GPU', 64);
  const tensorParallel = integer(values.tensorParallel, '张量并行', 64), pipelineParallel = integer(values.pipelineParallel, '流水线并行', 64);
  if (tensorParallel * pipelineParallel !== gpuPerReplica) throw new Error('每副本 GPU 必须等于张量并行 × 流水线并行');
  if (!/^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/.test(values.namespace || '')) throw new Error('命名空间须使用小写字母、数字或连字符，长度不超过63');
  const maxModelLen = values.maxModelLen === '' || values.maxModelLen == null ? null : integer(values.maxModelLen, '上下文上限', 10485760);
  if (maxModelLen && model.capabilities?.context && maxModelLen > model.capabilities.context) throw new Error('上下文上限不能超过已登记的模型规格');
  const gpuMemoryUtilization = Number(values.gpuMemoryUtilization);
  if (!(gpuMemoryUtilization > 0 && gpuMemoryUtilization <= 1)) throw new Error('显存利用比例须大于0且不超过1');
  const startupTimeout = integer(values.startupTimeout, '启动超时', 7200);
  const available = cluster.totalGpu - cluster.allocatedGpu + (existing?.clusterId === cluster.id ? deploymentGpu(existing) : 0);
  const required = requestedDeploymentGpu({ ...options,replicas,gpuPerReplica });
  if (checkCapacity && required > available) throw new Error(`GPU 容量不足：需要 ${required} 张，可用 ${available} 张`);
  if (values.modelFileId) {
    const bound = options.placement === '指定节点' && options.placementTargets.length === 1 ||
      options.placement === '指定 GPU' && options.placementTargets.length > 0;
    if (typeof values.modelFileId !== 'string' || !/^[\w.:-]{1,127}$/.test(values.modelFileId) || values.weightId || !bound) {
      throw Error('模型文件须关联所在节点或该节点的 GPU，并使用文件权重路径');
    }
  }
  return { modelId: model.id, modelFileId: values.modelFileId || undefined, runtimeId: options.runtimeMode === '已登记运行时镜像' ? runtime.id : '',
    weightId: values.weightId || '', weightPath: values.weightId ? '' : values.weightPath.trim(), clusterId: cluster.id, namespace: values.namespace, replicas, gpuPerReplica, tensorParallel, pipelineParallel, maxModelLen, gpuMemoryUtilization, startupTimeout, available, required, ...options };
}

export function deploymentHistory(item) {
  const records = item.configHistory ?? (item.previousConfig ? [
    { revision: (item.configRevision || 2) - 1, config: item.previousConfig },
  ] : []);
  return item.configRevision ? [...records, { revision: item.configRevision, config: deploymentConfig(item), at: item.configChangedAt ?? item.createdAt }] : records;
}

function applyDeploymentBatch(state, actions, label, importing = false) {
  const working = { ...state, deployments: [...state.deployments], clusters: [...state.clusters], endpoints: [...state.endpoints] };
  const changes = [];
  let objectId;
  for (const action of actions) {
    const result = deploymentTransaction(working, action, importing);
    objectId ||= result.objectId;
    for (const change of result.changes) {
      const rows = working[change.collection];
      if (change.type === 'add') rows.unshift(change.record);
      else {
        const index = rows.findIndex(row => row.id === change.id);
        rows[index] = { ...rows[index], ...change.changes };
      }
      changes.push(change);
    }
  }
  return { type: 'batch', objectId, changes, label };
}

function batchDeployments(state, { operation, ids }) {
  const labels = { stop:'停止', start:'启动', delete:'删除' };
  if (!Array.isArray(ids) || !ids.length || ids.length > 100 || new Set(ids).size !== ids.length ||
      !Object.hasOwn(labels, operation)) throw Error('批量部署操作无效');
  return applyDeploymentBatch(state, ids.map(deploymentId => ({ operation, deploymentId })), `批量${labels[operation]}模型部署`);
}

function recreateInstanceBatch(state, { instances }) {
  if (!Array.isArray(instances) || !instances.length || instances.length > 100 ||
      new Set(instances.map(row => row?.id)).size !== instances.length) throw Error('请选择 1–100 个不同实例');
  const groups = new Map();
  for (const instance of instances) {
    if (!instance?.deploymentId || !instance.id || !Number.isInteger(instance.ordinal)) throw Error('实例标识无效');
    if (!groups.has(instance.deploymentId)) groups.set(instance.deploymentId, []);
    groups.get(instance.deploymentId).push(instance);
  }
  return applyDeploymentBatch(state, [...groups].map(([deploymentId, rows]) => ({
    operation: 'restartInstance', deploymentId, data: { instances: rows },
  })), '批量删除并重建实例');
}

export function deploymentImportPlan(state, items) {
  if (!Array.isArray(items) || !items.length || items.length > 20 ||
      new Set(items.map(row => row?.deploymentId)).size !== items.length) throw Error('导入须包含 1–20 个部署且部署编码须唯一');
  return items.map(data => {
    const existing = state.deployments.find(item => item.deploymentId === data.deploymentId && !item.retiredAt);
    if (!existing) return { operation:'create', data };
    const current = deploymentConfig(existing);
    const desired = deploymentConfig(deploymentPreflight(state,{...existing,...data},existing,{checkCapacity:data.importStopped!==true,
      evaluatedAt:data.importStopped ? undefined : new Date()}));
    const fields = deploymentConfigKeys.filter(key=>JSON.stringify(current[key])!==JSON.stringify(desired[key]));
    const changedLifecycle = data.importStopped===false && existing.status==='停止' || data.importStopped===true && existing.status!=='停止';
    if (!fields.length && !changedLifecycle) return { operation:'unchanged', deploymentId:existing.id, current, desired, fields, data };
    const issue = existing.status !== '停止' || existing.readyReplicas > 0 ? '请先停止现有部署并等待实例退出，再覆盖配置' : '';
    return { operation:'update', deploymentId:existing.id, current, desired, fields, issue, data };
  });
}

function importDeployments(state, { items, overwrite = [] }) {
  const actions = deploymentImportPlan(state, items).filter(row=>row.operation !== 'unchanged');
  if (!actions.length) throw Error('导入文件与当前部署配置一致');
  if (!Array.isArray(overwrite)) throw Error('待覆盖部署列表无效');
  for (const row of actions.filter(item=>item.operation==='update')) {
    if (row.issue) throw Error(`${row.data.name}：${row.issue}`);
    if (!overwrite.includes(row.data.deploymentId)) throw Error(`${row.data.name}：请确认覆盖后再导入`);
  }
  return applyDeploymentBatch(state, actions, '导入部署 YAML', true);
}

// shortcut: lifecycle reconciliation is local; replace with controller observations when a cluster API is connected.
export function deploymentTransaction(state, action, importing = false) {
  const { operation, data = {}, deploymentId } = action;
  if (operation === 'batch') return batchDeployments(state, data);
  if (operation === 'batchRestartInstances') return recreateInstanceBatch(state, data);
  if (operation === 'import') return importDeployments(state, data);
  const timestamp = new Date().toISOString(), item = state.deployments.find(row => row.id === deploymentId);
  const changes = [], event = (message, level = '正常') => ({ at: timestamp, message, level });
  let target = item, patch, label;
  const importStopped = importing && data.importStopped===true;
  if (operation === 'create') {
    validateDeploymentIdentity(state, data);
    const checked = deploymentPreflight(state, data, undefined, {checkCapacity:!importStopped,evaluatedAt:importStopped ? undefined : new Date(timestamp)});
    const zeroWithoutSchedule = !checked.replicas && !checked.scalingSchedule?.enabled;
    target = { id: resourceId('deployment'), deploymentId: data.deploymentId, name: data.name.trim(), ...deploymentConfig(checked),
      status:importStopped || zeroWithoutSchedule ? '停止' : checked.replicas ? '部署中' : '等待定时计划',readyReplicas:0,endpointId:null,configRevision:1,configChangedAt:timestamp,
      events:[event(importStopped ? '部署配置已导入，状态为已停止' : zeroWithoutSchedule ? '已保存 0 副本的部署，状态为已停止'
        : checked.replicas ? '部署已提交，GPU 资源已预留；等待启动检查' : '部署已提交，正在等待定时计划')] };
    changes.push({ type: 'add', collection: 'deployments', record: target });
    const cluster = state.clusters.find(row => row.id === checked.clusterId);
    if (!importStopped && checked.required) changes.push({ type: 'update', collection: 'clusters', id: cluster.id, changes: { allocatedGpu: cluster.allocatedGpu + checked.required } });
    label = '创建模型部署';
  } else {
    if (!item || item.retiredAt) throw new Error('部署不存在，请返回列表刷新');
    const cluster = state.clusters.find(row => row.id === item.clusterId);
    const endpoint = state.endpoints.find(row => row.id === item.endpointId);
    const updateEndpoint = status => { if (endpoint) changes.push({ type: 'update', collection: 'endpoints', id: endpoint.id, changes: { status } }); };
    const release = () => {
      const used = deploymentGpu(item);
      if (used) { if (!cluster || cluster.allocatedGpu < used) throw new Error('集群资源记录不一致，请核对后重试'); changes.push({ type: 'update', collection: 'clusters', id: cluster.id, changes: { allocatedGpu: cluster.allocatedGpu - used } }); }
    };
    if (operation === 'delete') {
      if (endpoint && state.modelSupplies?.some(supply => supply.endpointId === endpoint.id && supply.status !== '已移除')) {
        throw Error('部署端点仍被模型供给引用，请先解除关联');
      }
      release(); updateEndpoint('停用');
      patch = { retiredAt: timestamp, status: '停止', readyReplicas: 0,
        events: [...(item.events || []), event('部署已删除，GPU 资源释放，历史记录保留')] };
      label = '删除模型部署';
    } else if (operation === 'restartInstance') {
      const targets = data.instances || [{ ordinal: data.instance, id: data.instanceId }];
      if (!Array.isArray(targets) || targets.length > 100) throw Error('请选择 1–100 个实例');
      const rows = deploymentInstances([item]);
      const selected = targets.map(target => rows.find(row => row.ordinal === target?.ordinal && (!target.id || row.id === target.id)));
      if (!selected.length || selected.some(row => !row || !canRecreateInstance(row)) ||
        new Set(selected.map(row => row.id)).size !== selected.length) throw Error('实例状态已变化，请刷新后重试');
      if (item.status === '失败') {
        const { required } = deploymentPreflight(state, item);
        changes.push({ type: 'update', collection: 'clusters', id: cluster.id, changes: { allocatedGpu: cluster.allocatedGpu + required } });
      }
      const readyReplicas = item.readyReplicas - selected.filter(row => row.state === 'running').length;
      if (!readyReplicas) updateEndpoint('停用');
      const instanceReplacements = { ...item.instanceReplacements };
      for (const row of selected) {
        instanceReplacements[row.ordinal] = { sequence: (instanceReplacements[row.ordinal]?.sequence || 0) + 1, createdAt: timestamp };
      }
      patch = { status: '更新中', readyReplicas, rebuildingInstance: null,
        rebuildingInstances: selected.map(row => row.ordinal), instanceReplacements,
        events: [...(item.events || []), ...selected.map(row => ({ ...event(`实例 ${row.ordinal} 已提交重建`), instanceOrdinal: row.ordinal,
          instanceId:`${item.id}:${row.ordinal}${instanceIdentitySuffix(item,instanceReplacements[row.ordinal])}` }))] };
      label = '重建部署实例';
    } else if (operation === 'stop') {
      if (item.status === '停止') throw new Error('部署已经停止');
      release(); updateEndpoint('停用');
      patch = { status: '停止', readyReplicas: 0, failureReason: '', rebuildingInstance: null, rebuildingInstances: [],
        ...(item.scalingSchedule?.enabled ? {scalingSchedule:{...item.scalingSchedule,paused:true}} : {}),
        events: [...(item.events || []), event('部署已停止，GPU 资源已释放；端点已停用')] };
      label = '停止模型部署';
    } else if (operation === 'reconcileSchedule') {
      const scheduled = evaluateDeploymentSchedule(item.scalingSchedule,{now:new Date(timestamp)});
      if (!scheduled || !['运行中','等待定时计划'].includes(item.status) || scheduled.replicas===item.replicas) throw Error('暂无定时伸缩变更');
      const next = deploymentPreflight(state,{...item,replicas:scheduled.replicas},item);
      const delta = next.required-deploymentGpu(item);
      if (cluster.allocatedGpu+delta<0) throw Error('集群资源记录不一致');
      if (delta) changes.push({type:'update',collection:'clusters',id:cluster.id,changes:{allocatedGpu:cluster.allocatedGpu+delta}});
      if (!next.replicas) updateEndpoint('停用');
      patch = {replicas:next.replicas,readyReplicas:Math.min(item.readyReplicas ?? 0,next.replicas),
        status:next.replicas ? '扩缩容中' : '等待定时计划',instanceReplacements:scaleInstanceIdentities(item,next.replicas,timestamp),
        events:[...(item.events || []),event(`定时伸缩目标调整为 ${next.replicas} 个副本`)]};
      label = '应用部署伸缩计划';
    } else if (operation === 'scale') {
      if (item.scalingSchedule?.enabled) throw Error('请先关闭定时伸缩再手工调整副本数');
      if (item.status !== '运行中') throw new Error('仅运行中的部署可扩缩容');
      const roles = item.roles ? validateDeploymentOptions({ ...item, replicas: data.replicas, roles: data.roles }).roles : null;
      const replicas = replicaCount(data.replicas,roles);
      if (replicas === item.replicas && JSON.stringify(item.roles || null) === JSON.stringify(roles)) throw new Error('副本数未变化');
      const delta = requestedDeploymentGpu({...item,roles,replicas}) - deploymentGpu(item);
      if (!cluster || (delta > 0 && cluster.status !== '运行中')) throw new Error('目标集群不可用于扩容');
      if (delta > cluster.totalGpu - cluster.allocatedGpu || cluster.allocatedGpu + delta < 0) throw new Error('GPU 容量不足或资源记录不一致');
      if (delta) changes.push({ type: 'update', collection: 'clusters', id: cluster.id, changes: { allocatedGpu: cluster.allocatedGpu + delta } });
      if (!replicas) updateEndpoint('停用');
      patch = { replicas, ...(roles ? { roles } : {}), instanceReplacements:scaleInstanceIdentities(item,replicas,timestamp),
        readyReplicas: replicas && item.readyReplicas == null ? null : Math.min(item.readyReplicas ?? 0,replicas),
        status: replicas ? '扩缩容中' : '停止',
        ...(!replicas ? {failureReason:'',rebuildingInstance:null,rebuildingInstances:[]} : {}),
        events: [...(item.events || []), event(replicas ? `目标副本由 ${item.replicas} 调整为 ${replicas}；等待就绪检查` :
          '副本数已设为 0，部署已停止')] };
      label = '调整部署副本';
    } else if (['update', 'rollback', 'start', 'restart'].includes(operation)) {
      if (operation === 'start' && !['停止', '失败'].includes(item.status)) throw new Error('当前部署不能重新启动');
      if (operation === 'rollback' && item.status !== '运行中') throw new Error('仅运行中的部署可回滚');
      if (operation === 'update' && !['运行中', '停止', '失败', '等待定时计划'].includes(item.status)) throw new Error('部署任务进行中，不能更新配置');
      if (operation === 'rollback' && !item.previousConfig) throw new Error('没有可回滚的配置版本');
      if (operation === 'restart' && item.status !== '运行中') throw Error('仅运行中的部署可重新启动');
      const rollback = data.revision ? deploymentHistory(item).find(row => row.revision === Number(data.revision) && row.revision !== item.configRevision)?.config : item.previousConfig;
      if (operation === 'rollback' && !rollback) throw Error('所选配置版本不存在');
      const values = operation==='rollback' ? rollback : operation==='start'
        ? item.scalingSchedule?.enabled ? {...item,scalingSchedule:{...item.scalingSchedule,paused:false}}
          : {...item,replicas:item.replicas===0 ? 1 : item.replicas}
        : operation==='restart' ? item : {...item,...data};
      if (values.modelId !== item.modelId || values.clusterId !== item.clusterId && !importing) throw new Error('更换模型或集群请新建部署');
      const checked = deploymentPreflight(state, values, item,{checkCapacity:!importStopped,evaluatedAt:importStopped ? undefined : new Date(timestamp)}), config = deploymentConfig(checked);
      const targetCluster = state.clusters.find(row=>row.id===config.clusterId);
      const zeroWithoutSchedule = !checked.replicas && !checked.scalingSchedule?.enabled;
      if (checked.enableInternalRoute===false && endpoint && state.modelSupplies?.some(supply=>supply.endpointId===endpoint.id && supply.status!=='已移除')) {
        throw Error('部署端点仍被模型供给引用，请先解除关联');
      }
      const startImported = importing && item.status==='停止' && data.importStopped===false;
      if (operation === 'update' && !startImported && JSON.stringify(config) === JSON.stringify(deploymentConfig(item))) throw new Error('配置未变化');
      const configUpdate = operation === 'update' || operation === 'rollback';
      const applyLive = operation === 'update' && !startImported && !deploymentRequiresRecreation(item,config);
      const scaleLive = applyLive && ['运行中','等待定时计划'].includes(item.status) && item.replicas!==config.replicas;
      const editStoppedZero = operation === 'update' && !startImported && item.status === '停止' &&
        item.replicas === 0 && !item.scalingSchedule?.enabled;
      const delta = importStopped || editStoppedZero || applyLive && !scaleLive && item.status!=='运行中' ? 0 : checked.required - deploymentGpu(item);
      if (targetCluster.allocatedGpu + delta < 0) throw new Error('集群资源记录不一致');
      if (delta) changes.push({ type:'update',collection:'clusters',id:targetCluster.id,changes:{ allocatedGpu:targetCluster.allocatedGpu + delta } });
      if (!applyLive || scaleLive && !config.replicas || zeroWithoutSchedule && item.status!=='停止') updateEndpoint('停用');
      const lifecycle = zeroWithoutSchedule ? {status:'停止',readyReplicas:0,failureReason:'',rebuildingInstance:null,rebuildingInstances:[]}
        : importStopped || editStoppedZero ? {status:'停止',readyReplicas:0}
        : applyLive ? scaleLive ? { status:config.replicas ? '扩缩容中' : '等待定时计划',readyReplicas:Math.min(item.readyReplicas ?? 0,config.replicas),
        instanceReplacements:scaleInstanceIdentities(item,config.replicas,timestamp) } : {} : {
        status:!config.replicas ? '等待定时计划' : operation==='start' ? '部署中' : '更新中',readyReplicas:0,failureReason:'',
        instanceGeneration:(item.instanceGeneration || 0)+1,instanceGenerationAt:timestamp,instanceReplacements:{},
      };
      patch = { ...config, ...lifecycle,
        configRevision: (item.configRevision || 1) + (configUpdate ? 1 : 0),
        ...(configUpdate ? { configHistory: deploymentHistory(item), configChangedAt: timestamp,
          previousConfig: (item.runtimeId || item.runtimeMode) && (item.weightId || item.weightPath) && item.tensorParallel ? deploymentConfig(item) : null } : {}),
        events: [...(item.events || []), event(importStopped ? '部署配置已覆盖，状态为已停止' : zeroWithoutSchedule ? '副本数已设为 0，部署已停止'
          : editStoppedZero || applyLive ? '部署配置已更新' : !configUpdate ? '重新启动已提交，GPU 资源已预留'
          : operation === 'rollback' ? '已提交所选版本配置，等待重新启动' : '重建更新已提交，端点暂时停用；等待重新启动')] };
      label = operation === 'start' ? '重新启动部署' : operation === 'rollback' ? '回滚部署配置' : '更新部署配置';
    } else if (operation === 'check') {
      if (!['部署中', '扩缩容中', '更新中'].includes(item.status)) throw new Error('当前部署没有待检查的任务');
      let failure = '';
      try { deploymentPreflight(state, item, item); } catch (error) { failure = error.message; }
      if (failure) {
        release(); updateEndpoint('停用');
        patch = { status: '失败', readyReplicas: 0, rebuildingInstance: null, rebuildingInstances: [], failureReason: failure, events: [...(item.events || []), event(`${failure}；已释放GPU预留`, '异常')] };
        label = '部署检查失败';
      } else {
        let endpointId = endpoint?.id ?? null;
        if (item.enableInternalRoute===false) updateEndpoint('停用');
        else if (endpoint) updateEndpoint('运行中');
        else {
          if (!state.providers.some(row => row.id === 'provider-self')) throw new Error('自有模型推理服务的服务商未登记，不能生成服务端点');
          endpointId = resourceId('connection');
          changes.push({ type: 'add', collection: 'endpoints', record: { id: endpointId, endpointId: `ep-${item.deploymentId}`, name: item.name, providerId: 'provider-self', protocol: 'OpenAI', baseUrl: `https://inference.demo.invalid/${item.deploymentId}/v1`, credentialRef: 'managed-by-platform', modelIds: [item.modelId], capacity: null, health: null, status: '运行中' } });
        }
        const message = item.enableInternalRoute===false ? '启动检查完成，目标副本就绪' : '启动检查完成，目标副本就绪；内部 OpenAI 端点已启用';
        patch = { status: '运行中', readyReplicas: item.replicas, rebuildingInstance: null, rebuildingInstances: [], endpointId, failureReason: '', events: [...(item.events || []), event(message)] };
        label = '检查部署状态';
      }
    } else throw new Error('未知部署操作');
    changes.unshift({ type: 'update', collection: 'deployments', id: item.id, changes: patch });
  }
  return { type: 'batch', objectId: target.id, changes, label };
}
