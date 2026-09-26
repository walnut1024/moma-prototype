export const usageTotal = usage => Object.values(usage || {}).reduce((sum, value) => sum + (Number(value) || 0), 0);

export function percentile(values, ratio) {
  if (!values.length) return null;
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.ceil(sorted.length * ratio) - 1];
}

export function groupRequests(requests, groupBy, selected = null) {
  const keys = selected === null ? [...new Set(requests.map(item => item[groupBy]))] : selected;
  return keys.map(key => ({ key, requests: requests.filter(item => item[groupBy] === key) }));
}
