import { callObservations, observationBuckets, observationTime } from './call-observations.mjs';
import { percentile } from './observability.js';
import { resourceMetricHistory, resourceObservations } from './ops-resources.js';

export const deploymentLatencyStatistics = [['avg', 'Avg'], ['p50', 'P50'], ['p95', 'P95'], ['p99', 'P99']];

export function deploymentEndpointCalls(item, state) {
  if (!item.endpointId || !state?.requests?.length) return [];
  return callObservations(state).requests.filter(call => call.endpoint === item.endpointId && !call.cacheHit);
}

const measured = (rows, key) => rows.map(row => row[key]).filter(Number.isFinite);
const total = (rows, key) => {
  const values = measured(rows, key);
  return values.length ? values.reduce((sum, value) => sum + value, 0) : null;
};
const latencyStatistic = (values, statistic) => {
  if (!values.length) return null;
  return statistic === 'avg' ? values.reduce((sum, value) => sum + value, 0) / values.length
    : percentile(values, Number(statistic.slice(1)) / 100);
};

export function deploymentCallTimeline(calls, start, end, statistics) {
  const rows = calls.filter(call => Number.isFinite(call.at) && start <= call.at && call.at <= end);
  const latest = rows.reduce((time, row) => Math.max(time ?? row.at, row.at), null);
  if (!rows.length) return { latest, labels: [], charts: [] };
  const stepMinutes = end - start <= 7200000 ? 1 : 60;
  const buckets = observationBuckets(rows, { start, end: end + 1 }, stepMinutes === 1 ? 'minute' : 'hour');
  const series = (label, value) => ({ label, values: buckets.map(bucket => value(bucket.rows, bucket)) });
  const latency = (key, label) => ({
    key, label, unit: 'ms', series: deploymentLatencyStatistics.filter(([name]) => statistics.includes(name))
      .map(([name, title]) => series(title, entries => latencyStatistic(measured(entries, key), name))),
  });
  const charts = [
    latency('ttft', '首 Token 时延'),
    latency('duration', '端到端时延'),
    { key: 'requests', label: '请求吞吐', unit: 'req/s', series: [series('请求速率', (entries, bucket) =>
      entries.length && bucket.end - bucket.start >= 1000 ? entries.length * 1000 / (bucket.end - bucket.start) : null)] },
    { key: 'tokens', label: 'Token 用量', unit: 'Token', series: ['input', 'output'].map(key =>
      series(key === 'input' ? '输入 Token' : '输出 Token', entries => total(entries, key))) },
  ];
  const sourceLabels = [...new Set(rows.map(row => row.source).filter(Boolean))];
  return { latest, stepMinutes, sourceLabels, labels: buckets.map(bucket => observationTime(bucket.start)), charts };
}

export function deploymentHardwareTimeline(instances, infrastructure = {}, start, end) {
  const gpuIds = new Set(instances.flatMap(instance => instance.devices.map(device => device.id)));
  const workerIds = new Set(instances.flatMap(instance => [instance.workerId, ...instance.devices.map(device => device.nodeId)].filter(Boolean)));
  const workers = new Map((infrastructure['ops-nodes'] ?? []).filter(worker => workerIds.has(worker.id)).map(worker => [worker.id, worker]));
  const devices = (infrastructure['ops-gpus'] ?? []).filter(device => gpuIds.has(device.id));
  const nodes = [...workers.values()];
  const makeGroup = (rows, gpu, metrics) => {
    const sources = rows.map(row => ({
      label: gpu ? `${workers.get(row.nodeId)?.name || row.nodeId} · GPU ${row.index}` : row.name,
      samples: resourceMetricHistory(row, gpu),
    }));
    const { sources: scoped, latest } = resourceObservations(sources, start, end);
    const times = [...new Set(scoped.flatMap(row => [...row.samples.keys()]))].sort((left, right) => left - right);
    const charts = metrics.map(([key, label, unit, totalKey]) => {
      const readings = scoped.flatMap(({ label, samples }) => [
        { label, values: times.map(at => samples.get(at)?.[key] ?? null) },
        ...(totalKey ? [{ label: `${label}总量`, values: times.map(at => samples.get(at)?.[totalKey] ?? null) }] : []),
      ]);
      return { key, label, unit, series: readings.filter(row => row.values.some(Number.isFinite)) };
    });
    return { labels: times.map(observationTime), charts, latest };
  };
  return {
    gpu: makeGroup(devices, true, [
      ['utilization', 'GPU 核心使用率', '%'], ['vramUsed', '显存使用量', 'GiB', 'vram'],
      ['power', '功耗', 'W'], ['temperature', '温度', '°C'],
    ]),
    host: makeGroup(nodes, false, [['cpu', 'CPU 使用率', '%'], ['memoryUsedGiB', '主机内存', 'GiB', 'memoryGiB']]),
    deviceCount: devices.length,
    workerCount: nodes.length,
  };
}
