const invalidHeader = '请填写有效、唯一且不含凭证的请求头。';
const headerName = /^[!#$%&'*+\-.^_`|~\w]+$/;
const reservedName = /^(?:content[-_]type|(?:set[-_])?cookie)$|(?:^|[-_])(?:authorization|credentials?|api[-_]?key|access[-_]?key|token|password|secret)$/i;

export function gatewayRouteHeaderIssue(entries) {
  if (!Array.isArray(entries) || !entries.length) return invalidHeader;
  const names = new Set();
  for (const entry of entries) {
    const { name, value } = entry ?? {};
    if (typeof name !== 'string' || typeof value !== 'string' || Object.keys(entry).length !== 2 ||
      !headerName.test(name) || reservedName.test(name) || !value.trim() || /[\r\n]/u.test(name + value)) {
      return invalidHeader;
    }
    const normalized = name.toLowerCase();
    if (names.has(normalized)) return invalidHeader;
    names.add(normalized);
  }
}
