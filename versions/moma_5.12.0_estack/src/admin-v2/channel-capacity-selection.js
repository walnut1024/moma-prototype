import { CAPACITY_METRICS } from './channel-capacity.js';

export function appendCapacityMetrics(limits, selected) {
  return Object.fromEntries([...Object.entries(limits), ...CAPACITY_METRICS
    .filter(metric => selected.includes(metric.key) && !Object.hasOwn(limits, metric.key))
    .map(metric => [metric.key, ''])]);
}
