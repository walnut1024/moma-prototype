import { availableSupplies, modelTransaction } from './model-management.js';
import { connectionFingerprint, connectionTestCurrent, connectionTestPassed } from './connection-state.js';
export { connectionFingerprint, connectionTestCurrent } from './connection-state.js';

export const PROVIDER_TYPES = { thirdParty: '第三方供应商', selfHosted: '自有推理服务' };
export const PROVIDER_TEMPLATES = ['云厂商模型服务', '模型厂商直连', 'Token 聚合服务', '自有推理服务', '其他兼容服务'];
export const PROTOCOLS = ['OpenAI', 'Anthropic', '自定义 REST'];
const uid = prefix => `${prefix}-${crypto.randomUUID()}`;
const add = (collection, record) => ({ type: 'add', collection, record });
const update = (collection, id, changes) => ({ type: 'update', collection, id, changes });

export function providerFacts(state, provider) {
  const endpoints = state.endpoints.filter(endpoint => endpoint.providerId === provider.id);
  const ids = new Set(endpoints.map(endpoint => endpoint.id));
  const supplies = state.modelSupplies.filter(supply => ids.has(supply.endpointId) && supply.status !== '已移除');
  const models = state.models.filter(model => supplies.some(supply => supply.modelId === model.id));
  const available = models.filter(model => availableSupplies(state, model.id).some(supply => ids.has(supply.endpointId)));
  const attention = endpoints.filter(endpoint => endpoint.status === '需关注' || (connectionTestCurrent(endpoint) && endpoint.connectionTest.result !== '通过'));
  return { endpoints, supplies, models, available, attention, running: endpoints.filter(endpoint => ['运行中', '需关注'].includes(endpoint.status)) };
}

export function providerImpact(state, providerId, endpointId) {
  const endpoints = state.endpoints.filter(endpoint => endpoint.providerId === providerId && (!endpointId || endpoint.id === endpointId));
  const ids = new Set(endpoints.map(endpoint => endpoint.id));
  const supplies = state.modelSupplies.filter(supply => ids.has(supply.endpointId) && supply.status !== '已移除');
  const affectedIds = new Set(supplies.map(supply => supply.modelId));
  const projected = { ...state, endpoints: state.endpoints.map(endpoint => ids.has(endpoint.id) ? { ...endpoint, status: '停用' } : endpoint) };
  const exposed = state.models.filter(model => affectedIds.has(model.id) && model.listingStatus === '已上架' && availableSupplies(state, model.id).length > 0 && !availableSupplies(projected, model.id).length);
  const routes = state.routes.filter(route => (route.targets || []).some(target => ids.has(typeof target === 'string' ? target : target.endpointId)));
  const fallbacks = state.fallbacks.filter(fallback => fallback.chain?.some(id => ids.has(id)));
  return { endpoints, supplies, exposed, routes, fallbacks };
}

export function providerTransaction(state, action) {
  const { operation, objectId, data = {} } = action;
  const changes = [];
  const provider = state.providers.find(item => item.id === (data.providerId || objectId));
  if (['supply', 'verify', 'enableSupply', 'disableSupply'].includes(operation)) {
    const supply = state.modelSupplies.find(item => item.id === data.id);
    const endpoint = state.endpoints.find(item => item.id === (operation === 'supply' ? data.endpointId : supply?.endpointId));
    if (!provider || endpoint?.providerId !== provider.id) throw new Error('模型映射不属于该供应商');
    if (operation === 'supply' && data.id && supply?.endpointId !== endpoint.id) throw new Error('现有模型映射不能更换接入，请在目标接入新增映射');
    const transaction = modelTransaction(state, { type: 'modelOperation', operation, modelId: operation === 'supply' ? data.modelId : supply.modelId, data });
    return { ...transaction, objectId: provider.id };
  }
  if (['create', 'profile'].includes(operation)) {
    if (operation === 'profile' && !provider) throw new Error('供应商不存在');
    const name = data.name?.trim();
    if (!name) throw new Error('请填写供应商名称');
    if (state.providers.some(item => item.id !== provider?.id && item.name.trim().toLowerCase() === name.toLowerCase())) throw new Error('供应商名称已存在');
    if (!PROVIDER_TYPES[data.sourceType] || !PROVIDER_TEMPLATES.includes(data.integrationType)) throw new Error('请选择有效的供应商类型和接入方式');
    const fields = { name, sourceType: data.sourceType, integrationType: data.integrationType, contact: data.contact?.trim() || '', description: data.description?.trim() || '' };
    if (operation === 'create') changes.push(add('providers', { id: data.id || uid('provider'), ...fields, status: '已启用', contractEnd: null }));
    else {
      if (provider.sourceType !== fields.sourceType && state.endpoints.some(endpoint => endpoint.providerId === provider.id)) throw new Error('已有接入配置，不能变更供给类型');
      changes.push(update('providers', provider.id, fields));
    }
  } else if (['enableProvider', 'disableProvider'].includes(operation)) {
    if (!provider) throw new Error('供应商不存在');
    if (operation === 'disableProvider' && !data.confirmed) throw new Error('请先确认停用影响');
    changes.push(update('providers', provider.id, { status: operation === 'enableProvider' ? '已启用' : '停用' }));
  } else {
    const endpoint = state.endpoints.find(item => item.id === objectId);
    if (operation === 'connection') {
      if (!provider) throw new Error('供应商不存在');
      if (objectId && (!endpoint || endpoint.providerId !== provider.id)) throw new Error('接入配置不存在或不属于该供应商');
      if (!data.name?.trim()) throw new Error('请填写接入名称');
      if (!PROTOCOLS.includes(data.protocol)) throw new Error('请选择有效的接入协议');
      let url;
      try { url = new URL(data.baseUrl); } catch { throw new Error('请填写有效的服务地址'); }
      if (url.protocol !== 'https:' && !(provider.sourceType === 'selfHosted' && url.protocol === 'http:')) throw new Error('第三方服务地址须使用 HTTPS；自有推理服务可使用 HTTP');
      if (url.username || url.password || url.search || url.hash) throw new Error('服务地址不能包含账号、密码、查询参数或片段');
      const credentialRef = data.credentialRef?.trim();
      if (!/^(env:[A-Z_][A-Z0-9_]*|secret:[a-zA-Z0-9_./-]+)$/.test(credentialRef || '') && !(endpoint?.credentialRef && endpoint.credentialRef === credentialRef)) throw new Error('填写 env:变量名 或 secret:凭证引用；不要输入真实密钥');
      const capacity = data.capacity == null || String(data.capacity).trim() === '' ? null : Number(data.capacity), timeoutSeconds = Number(data.timeoutSeconds);
      if ((capacity != null && (!Number.isSafeInteger(capacity) || capacity < 1)) || !Number.isSafeInteger(timeoutSeconds) || timeoutSeconds < 1 || timeoutSeconds > 600) throw new Error('RPM 如填写必须为正整数；超时须为 1–600 秒');
      const fields = { name: data.name.trim(), providerId: provider.id, protocol: data.protocol, baseUrl: url.toString().replace(/\/$/, ''), credentialRef, capacity, timeoutSeconds };
      const changed = !endpoint || connectionFingerprint(endpoint) !== connectionFingerprint(fields);
      if (!endpoint) {
        const id = uid('endpoint');
        changes.push(add('endpoints', { id, endpointId: id, ...fields, modelIds: [], status: '草稿', health: null, connectionTest: null }));
      } else {
        changes.push(update('endpoints', endpoint.id, { ...fields, ...(changed ? { status: '停用', connectionTest: null } : {}) }));
        if (changed) state.modelSupplies.filter(supply => supply.endpointId === endpoint.id && supply.status !== '已移除').forEach(supply => changes.push(update('modelSupplies', supply.id, { status: '已停用', validationStatus: '待验证', verifiedAt: null, validationCases: [] })));
      }
    } else {
      if (!endpoint) throw new Error('接入配置不存在');
      const owner = state.providers.find(item => item.id === endpoint.providerId);
      if (operation === 'testConnection') {
        const scenarios = { 成功: ['通过', '服务地址、凭证和协议检查通过'], 超时: ['失败', '上游连接超时，请检查服务地址与网络'], 鉴权失败: ['失败', '鉴权失败，请检查凭证引用与权限'], 协议错误: ['失败', '协议不兼容，请核对接入协议'] };
        const result = scenarios[data.scenario];
        if (!result) throw new Error('请选择测试场景');
        changes.push(update('endpoints', endpoint.id, { connectionTest: { result: result[0], message: result[1], simulated: true, testedAt: new Date().toISOString(), fingerprint: connectionFingerprint(endpoint) }, ...(result[0] !== '通过' && ['运行中', '需关注'].includes(endpoint.status) ? { status: '需关注' } : {}) }));
      } else if (operation === 'enableConnection') {
        if (owner?.status !== '已启用') throw new Error('请先启用供应商');
        if (!connectionTestPassed(endpoint)) throw new Error('当前接入配置须先通过连接测试');
        changes.push(update('endpoints', endpoint.id, { status: '运行中' }));
      } else if (operation === 'disableConnection') {
        if (!data.confirmed) throw new Error('请先确认停用影响');
        changes.push(update('endpoints', endpoint.id, { status: '停用' }));
      } else throw new Error('未知供应商操作');
    }
  }
  return { type: 'batch', label: ({ create: '新增模型供应商', profile: '更新供应商资料', connection: '保存供应商接入配置', testConnection: '连接测试', enableProvider: '启用供应商', disableProvider: '停用供应商', enableConnection: '启用接入', disableConnection: '停用接入' })[operation], objectId: objectId || changes[0]?.record?.id, changes };
}
