import { resourceId } from '../resource-id.mjs';
import { supplierChannelAssociations } from './supplier-resources.js';

const installedSamples = () => ['llama3.1:8b', 'llama3.2:3b'].map(id => ({ id, status: '已安装', size: id.endsWith('8b') ? '4.9 GB' : '2.0 GB' }));
export const ollamaCurrentRows = (saved, now = Date.now()) => (saved?.models || installedSamples()).map(row =>
  row.status === '正在拉取' && Date.parse(row.readyAt) <= now ? { ...row, status: '已安装' } : row);

export function channelSpecialtyTransaction(state, { data }) {
  const provider = state.providers.find(row => row.id === data.providerId && !row.deletedAt);
  const endpoint = provider && state.endpoints.find(row => row.id === data.endpointId && row.providerId === provider.id && !row.deletedAt);
  const kind = endpoint?.networkSettings?.runtimeKind;
  if (!kind || kind !== data.kind || endpoint.updatedAt !== data.expectedUpdatedAt) throw Error('连接或专项适配器已变化，请重新核对');
  if (data.confirmed !== true) throw Error('请明确确认操作');
  const current = endpoint.directorySpecialties?.[kind] || {};
  const now = Date.now(), checkedAt = new Date(now).toISOString();
  let copy = { ...current, checkedAt, source: 'mock' };
  const action = data.action;
  if (kind === 'ollama') {
    let models = ollamaCurrentRows(current, now);
    const model = models.find(row => row.id === data.model);
    if (action === 'pull') {
      if (typeof data.model !== 'string' || !/^[\w][\w./:-]{0,100}$/.test(data.model) || /^sk-/i.test(data.model) || model || models.length >= 50) throw Error('模型标识无效、已存在或超过 50 款');
      models = [...models, { id: data.model, status: '正在拉取', startedAt: checkedAt, readyAt: new Date(now + 5000).toISOString() }];
    } else if (action === 'cancel') {
      if (model?.status !== '正在拉取') throw Error('拉取已结束，请刷新列表');
      models = models.filter(row => row !== model);
    } else if (action === 'remove') {
      if (state.currentRole !== '平台管理员') throw Error('仅平台管理员可执行删除');
      if (model?.status !== '已安装') throw Error('找不到已安装的模型');
      if (supplierChannelAssociations(state, provider, endpoint.id).some(row => row.upstreamModelId === model.id)) throw Error('仍有 MoMA 上游模型引用，请先核对并移除引用');
      models = models.filter(row => row !== model);
    } else if (action !== 'refresh') throw Error('专项操作不适用于此连接');
    copy.models = models;
  } else if (['vllm', 'sglang'].includes(kind)) {
    if (action !== 'refresh') throw Error('实例状态入口仅支持查询');
    copy.status = endpoint.frozen ? '不可达' : '模拟在线';
    copy.activeRequests = endpoint.frozen ? null : 3;
    copy.waitingRequests = endpoint.frozen ? null : 0;
  } else if (kind === 'plugin') {
    if (action !== 'refresh' && state.currentRole !== '平台管理员') throw Error('仅平台管理员可维护插件授权与额度');
    if (action === 'start') copy.authorization = { id: resourceId('mock-authorization'), status: '等待授权', expiresAt: new Date(now + 600000).toISOString() };
    else if (action === 'complete') {
      if (current.authorization?.status !== '等待授权' || current.authorization?.id !== data.authorizationId || Date.parse(current.authorization.expiresAt) <= now) throw Error('授权任务已变化或过期');
      copy.authorization = { ...current.authorization, status: '模拟已授权', account: 'demo-••••-01', expiresAt: new Date(now + 86400000).toISOString() };
      copy.quota = current.quota || { remaining: 65, unit: '%', recoveryCredits: 2, windowHours: 5 };
    } else if (action === 'recover') {
      if (current.authorization?.status !== '模拟已授权' || Date.parse(current.authorization.expiresAt) <= now || !current.quota?.recoveryCredits || current.quota.remaining >= 100) throw Error('授权已过期或没有可用的额度恢复次数');
      copy.quota = { ...current.quota, remaining: 100, recoveryCredits: current.quota.recoveryCredits - 1 };
    } else if (action === 'refresh') {
      if (current.authorization && Date.parse(current.authorization.expiresAt) <= now) copy.authorization = { ...current.authorization, status: '授权过期' };
    } else throw Error('专项操作不适用于此连接');
  } else throw Error('专项适配器不受支持');
  return { type: 'batch', objectId: endpoint.id, label: { pull: '模拟拉取上游模型', cancel: '取消模拟模型拉取', remove: '模拟删除上游模型',
    refresh: '刷新模拟专项状态', start: '启动模拟插件授权', complete: '完成模拟插件授权', recover: '模拟恢复插件额度' }[action],
  changes: [{ type: 'update', collection: 'endpoints', id: endpoint.id, changes: { directorySpecialties: { ...endpoint.directorySpecialties, [kind]: copy } } }] };
}
