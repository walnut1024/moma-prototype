export function parseIpAllowlist(text) {
  const entries = [...new Set(text.split(/[\s,，;；]+/).filter(Boolean))];
  const invalid = entries.find(entry => {
    const parts = entry.split('/');
    const octets = parts[0].split('.');
    return parts.length > 2 || octets.length !== 4 || octets.some(part => !/^(0|[1-9]\d{0,2})$/.test(part) || Number(part) > 255) || (parts.length === 2 && (!/^(0|[1-9]\d?)$/.test(parts[1]) || Number(parts[1]) > 32));
  });
  if (invalid) throw new Error(`无效的 IPv4 地址或 CIDR 网段：${invalid}`);
  return entries;
}
