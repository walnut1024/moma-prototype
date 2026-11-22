const textInterfaces = new Map([
  ['/v1/chat/completions', 'OpenAI Chat'],
  ['/v1/messages', 'Anthropic Messages'],
  ['/v1/responses', 'OpenAI Responses'],
]);
const chatPath = '/v1/chat/completions';

export function publicRouteAddress(path, baseUrl = import.meta.env?.VITE_MOMA_API_BASE_URL ?? 'http://xxxx') {
  if (!baseUrl || !path.startsWith('/v1/')) return '';
  try {
    const url = new URL(baseUrl.trim());
    if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password || url.search || url.hash) return '';
    return url.href.replace(/\/+$/, '').replace(/\/v1$/, '') + path;
  } catch {
    return '';
  }
}

export function forwardingInterfaces(model, nativeRoutes) {
  return ['text', 'multimodal'].includes(model.type)
    ? [...textInterfaces].map(([path, label]) => ({path, label}))
    : nativeRoutes.map(({path, label}) => ({path, label}));
}

export function forwardingDirection(path, upstreamPath) {
  if (path === upstreamPath) return '原生转发';
  if (upstreamPath === chatPath && textInterfaces.has(path)) {
    return textInterfaces.get(path) + ' → ' + textInterfaces.get(upstreamPath);
  }
  return '';
}

export function forwardingChoices(path, targets) {
  return [path, ...(path !== chatPath && textInterfaces.has(path) ? [chatPath] : [])].map(upstreamPath => ({
    upstreamPath, label: forwardingDirection(path, upstreamPath),
    target: targets.find(row => row.path === upstreamPath),
  }));
}

export function normalizeForwarding(rows) {
  if (!Array.isArray(rows) || rows.length > textInterfaces.size) throw Error('接口路由配置无效');
  const paths = new Set();
  return rows.map(row => {
    const {path, upstreamPath} = row || {};
    if (typeof path !== 'string' || !/^\/v1\/[a-z/]+$/.test(path) || paths.has(path) || !forwardingDirection(path, upstreamPath)) {
      throw Error('对外接口重复或转换方向无效');
    }
    paths.add(path);
    return {path, upstreamPath};
  }).sort((a, b) => a.path.localeCompare(b.path));
}

export function validateForwarding(model, rows, targets) {
  const allowed = forwardingInterfaces(model, targets);
  for (const {path, upstreamPath} of rows) {
    if (!allowed.some(row => row.path === path) || !targets.some(row => row.path === upstreamPath)) {
      throw Error('主渠道没有匹配的上游接口，请重新选择转换方向和上游接口');
    }
  }
}

export function forwardingRows(model, nativeRoutes, overrides, targets) {
  const interfaces = forwardingInterfaces(model, nativeRoutes);
  const rows = new Map(nativeRoutes.map(row => [row.path, {...row, upstreamPath: row.path}]));
  for (const {path, upstreamPath} of overrides) {
    rows.set(path, {
      path, upstreamPath, label: interfaces.find(row => row.path === path)?.label || path,
      url: targets.find(row => row.path === upstreamPath)?.url || '',
      forwarding: forwardingDirection(path, upstreamPath),
    });
  }
  return [...rows.values()].map(row => ({...row, label: textInterfaces.get(row.path) || row.label}));
}

export function forwardingChanges(before, after) {
  return [...new Set([...before, ...after].map(row => row.path))].flatMap(path => {
    const previous = before.find(row => row.path === path);
    const next = after.find(row => row.path === path);
    return previous?.forwarding === next?.forwarding && previous?.url === next?.url
      ? [] : [{path, label: next?.label || previous?.label, previous, next}];
  });
}
