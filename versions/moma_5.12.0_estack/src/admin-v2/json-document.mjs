export function jsonDocument(value) {
  const containerKeys = [];
  const build = (value, path = [], name = null, comma = false) => {
    const key = JSON.stringify(path), prefix = name === null ? '' : `${JSON.stringify(name)}: `;
    const entries = value !== null && typeof value === 'object' ? Object.entries(value) : [];
    const node = { key, depth: path.length, comma, prefix,
      location: path.reduce((label, part) => `${label}[${JSON.stringify(part)}]`, '$') };
    if (!entries.length) return { ...node, text: `${prefix}${JSON.stringify(value)}${comma ? ',' : ''}` };
    const array = Array.isArray(value);
    containerKeys.push(key);
    return { ...node, open: array ? '[' : '{', close: array ? ']' : '}',
      children: entries.map(([name, item], index) => build(item, [...path, array ? Number(name) : name], array ? null : name, index < entries.length - 1)) };
  };
  return { root: build(value), containerKeys };
}
