export const customTasks = [['text', '文本生成'], ['multimodal', '多模态理解'], ['embedding', '向量'], ['rerank', '重排'],
  ['image', '图片'], ['video', '视频'], ['audio', '语音']];
export const emptyCustomAdapter = { routes: [], models: null, balance: null };
const fields = (value, allowed) => value && typeof value === 'object' && !Array.isArray(value) && Object.keys(value).every(key => allowed.includes(key));
const safePath = path => typeof path === 'string' && path.length <= 300 && /^\/[\w./-]+$/.test(path) && !path.includes('//') &&
  !path.split('/').some(part => part === '.' || part === '..');
const keys = path => path === '$' ? [] : path.slice(2).split('.');
const jsonPath = path => typeof path === 'string' && /^\$(?:\.[a-z][\w-]*){0,8}$/i.test(path) &&
  keys(path).every(key => !/^(?:__proto__|constructor|prototype|authorization|secret|api[-_]?key|password|token)$/i.test(key));
const readPath = (payload, path) => keys(path).reduce((value, key) => value && Object.hasOwn(value, key) ? value[key] : undefined, payload);

export const customAdapterCredentialIds = config => [...new Set((config?.routes || []).filter(rule => rule.auth === 'credential').map(rule => rule.credentialId))];

function normalizeAuth(item, route = false) {
  const auth = item.auth || 'connection';
  if (auth === 'credential' && route) {
    if (typeof item.credentialId !== 'string' || !/^[A-Za-z0-9_.:-]{1,120}$/.test(item.credentialId) || /^sk-/i.test(item.credentialId)) {
      throw Error('请选择当前服务商的独立凭证引用');
    }
    return { auth, credentialId: item.credentialId };
  }
  if (!['connection', 'header', 'none'].includes(auth) || auth === 'header' && (typeof item.header !== 'string' || !/^x-[\w-]{1,62}$/i.test(item.header))) throw Error('请选择连接认证、指定请求头或无认证');
  return auth === 'header' ? { auth, header: item.header.toLowerCase() } : { auth };
}

export function normalizeCustomAdapter(value) {
  if (value === null) return null;
  if (!fields(value, ['routes', 'models', 'balance']) || !Array.isArray(value.routes) || value.routes.length > 30) throw Error('自定义适配器最多支持 30 条转发规则');
  const routes = value.routes.map((row, index) => {
    if (!fields(row, ['task', 'match', 'method', 'path', 'conversion', 'idPath', 'statusPath', 'auth', 'header', 'credentialId']) ||
      !customTasks.some(([id]) => row.task === id) || !safePath(row.path) || !['GET', 'POST'].includes(row.method) ||
      typeof row.match !== 'string' || !/^[\w./:-]{0,200}\*?$/.test(row.match) || !['native', 'task'].includes(row.conversion)) throw Error('第 ' + (index + 1) + ' 条转发规则的模型、方法或路径有误');
    if ((!row.match || row.match === '*') && value.routes.slice(index + 1).some(next => next?.task === row.task)) throw Error('同一任务的兜底规则须放在最后');
    if (row.conversion === 'task' && (!jsonPath(row.idPath) || typeof row.statusPath !== 'string' ||
      !row.statusPath.includes('{id}') || !safePath(row.statusPath.replace('{id}', 'task')))) throw Error('异步任务须配置任务 ID 路径和包含 {id} 的查询路径');
    return { task: row.task, match: row.match, method: row.method, path: row.path, conversion: row.conversion, ...normalizeAuth(row, true),
      ...(row.conversion === 'task' ? { idPath: row.idPath, statusPath: row.statusPath } : {}) };
  });
  function management(input, fieldsForType) {
    if (input == null) return null;
    if (!fields(input, ['method', 'path', 'auth', 'header', ...fieldsForType]) || !safePath(input.path) || !['GET', 'POST'].includes(input.method) ||
      fieldsForType.some(key => ['completePath', 'usedPath'].includes(key) ? input[key] && !jsonPath(input[key]) : !jsonPath(input[key]))) {
      throw Error('管理接口须填写请求方法、同源路径和有效的响应字段路径');
    }
    return { method: input.method, path: input.path, ...normalizeAuth(input), ...Object.fromEntries(fieldsForType.filter(key => input[key]).map(key => [key, input[key]])) };
  }
  return { routes, models: management(value.models, ['listPath', 'idPath', 'completePath']), balance: management(value.balance, ['amountPath', 'unitPath', 'usedPath']) };
}

export function customForwarding(adapter, endpoint, task, model) {
  const match = adapter?.routes?.find(row => row.task === task && (!row.match || row.match === '*' ||
    (row.match.endsWith('*') ? model?.startsWith(row.match.slice(0, -1)) : model === row.match)));
  if (!match) return null;
  const url = new URL(match.path, endpoint.baseUrl);
  return { ...match, url: url.toString() };
}

export function parseCustomManagement(adapter, mode, payload) {
  const config = adapter[mode];
  if (!config) throw Error('此连接未配置此管理接口');
  if (mode === 'models') {
    const list = readPath(payload, config.listPath);
    if (!Array.isArray(list) || list.length > 2000) throw Error('模型列表路径未返回数组');
    const models = list.map(row => readPath(row, config.idPath));
    if (models.some(id => typeof id !== 'string' || !id || id.length > 200 || /\s/u.test(id))) throw Error('模型标识字段无效');
    return { models, complete: config.completePath ? readPath(payload, config.completePath) === true : false };
  }
  const amount = readPath(payload, config.amountPath), unit = readPath(payload, config.unitPath);
  const used = config.usedPath ? readPath(payload, config.usedPath) : null;
  if (typeof amount !== 'number' || !Number.isFinite(amount) || typeof unit !== 'string' || !/^[\p{L}\p{N} $€¥/._-]{1,30}$/u.test(unit) ||
    used != null && (typeof used !== 'number' || !Number.isFinite(used) || used < 0)) throw Error('余额、额度单位或已用额度解析失败');
  return { amount, unit, used: used ?? null };
}
