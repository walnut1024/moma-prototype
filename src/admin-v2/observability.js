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

export const beijingTime = value => new Date(Date.parse(value) + 8 * 3600000).toISOString().slice(0, 16).replace('T', ' ');

export function monitoringWindow(requests, days, now = Date.now()) {
  const start = now - days * 86400000;
  return {
    rows: requests.filter(row => Date.parse(row.createdAt) >= start && Date.parse(row.createdAt) < now),
    buckets: Array.from({ length: days * 24 }, (_, index) => ({ start: start + index * 3600000, end: start + (index + 1) * 3600000 })),
  };
}

// Local deployment demo samples; IDs keep each deployment stable when its peers are filtered.
export function deploymentSeries(deployment, metric) {
  const phase = [...deployment.id].reduce((sum, character) => sum + character.charCodeAt(0), 0) % 5;
  return Array.from({ length: 13 }, (_, index) => Math.round((Math.sin(index * .8 + phase) + 1.4) * (metric === 'GPU 利用率' ? 26 : metric === 'P95 延迟' ? 180 : 42) + phase * 9));
}

export function deploymentSummary(deployments) {
  const mean = values => values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : null;
  return {
    gpu: mean(deployments.flatMap(item => deploymentSeries(item, 'GPU 利用率'))),
    throughput: deployments.length ? deployments.reduce((sum, item) => sum + mean(deploymentSeries(item, '请求吞吐')), 0) : null,
    p95: percentile(deployments.flatMap(item => deploymentSeries(item, 'P95 延迟')), .95),
  };
}
