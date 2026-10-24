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

export function maskApiKey(value) {
  if (typeof value !== 'string' || !value.trim()) return '—';
  const text = value.trim();
  const hidden = text.match(/[*•]+/);
  if (hidden) {
    const prefix = text.slice(0, hidden.index).slice(0, 8);
    const suffix = text.slice(hidden.index + hidden[0].length).replace(/[*•]/g, '').slice(-4);
    return `${prefix}*****${suffix}`;
  }
  if (text.length <= 12) return '*****';
  return `${text.slice(0, 8)}*****${text.slice(-4)}`;
}
