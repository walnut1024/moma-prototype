
import { flash, glm, idb } from './customer-analysis-demo.js';

export const refreshMs = 5000;
export const observationMinutes = 5;

const clusterSpecs = [
  { id: 'jinan', name: '济南 B300 集群', gateway: 'VIP', model: glm, registered: true, capacity: 390000000,
    instances: [
      { id: 'b300-01', name: '智算-济南-B300-01', gpu: 'nvidia-b300', cards: 72, capacity: 135000000 },
      { id: 'b300-02', name: '智算-济南-B300-02', gpu: 'nvidia-b300', cards: 72, capacity: 135000000 },
      { id: 'b300-03', name: '智算-济南-B300-03', gpu: 'nvidia-b300', cards: 64, capacity: 120000000 },
    ] },
  { id: 'shanghai', name: '上海 H100 / H200 集群', gateway: 'VIP', model: flash, registered: true, capacity: 616000000,
    instances: [
      { id: 'h100-01', name: '智算-上海-H100-01', gpu: 'nvidia-h100', cards: 64, capacity: 280000000 },
      { id: 'h200-01', name: '智算-上海-H200-01', gpu: 'nvidia-h200', cards: 64, capacity: 336000000 },
    ] },
  { id: 'ali-flash', name: '阿里云', model: idb, tag: '服务商' },
  { id: 'ali-glm', name: '阿里云', model: glm, tag: '服务商' },
  { id: 'unknown', name: '未知集群', model: '', tag: '未归属' },
];
const frames = [
  [346150000, 42872400, 41200, .3434, .3722, .58],
  [352630100, 49613500, 42480, .3512, .3821, .61],
  [387268400, 46314900, 44810, .3443, .3911, .54],
  [394820900, 37844600, 43920, .3486, .3642, .56],
  [338860400, 54103300, 40910, .3572, .3678, .57],
];

export const ratio = (value, total) => total ? value / total : 0;
export const flowPercent = (value, total) => (ratio(value, total) * 100).toFixed(2) + '%';
export function flowAmount(value) {
  if (value == null) return '—';
  if (value < 1e4) return value.toLocaleString('zh-CN');
  const divisor = value >= 1e8 ? 1e8 : 1e4;
  return (value / divisor).toFixed(2) + (divisor === 1e8 ? '亿' : '万');
}

export function customerFlowSnapshot(index, model = '') {
  const [jinan, shanghai, requests, first, second, other] = frames[index % frames.length];
  const primaryCalls = Math.round(requests * ratio(jinan, jinan + shanghai));
  const counts = { jinan: primaryCalls, shanghai: requests - primaryCalls };
  const rates = { jinan, shanghai };
  const clusters = clusterSpecs.filter(spec => !model || spec.model === model).map(spec => {
    const tpm = rates[spec.id] ?? 0;
    const a = Math.round(tpm * (spec.id === 'jinan' ? first : other));
    const b = Math.round(tpm * second);
    const instanceRates = spec.id === 'jinan' ? [a, b, tpm - a - b] : [a, tpm - a];
    const instances = (spec.instances || []).map((instance, position) => ({
      ...instance, model: spec.model, tpm: instanceRates[position],
    }));
    return { ...spec, tpm, requests: counts[spec.id] ?? 0, instances };
  });
  const gateways = ['MoMA', 'VIP'].map(id => {
    const targets = clusters.filter(cluster => cluster.gateway === id);
    return {
      id, tpm: targets.reduce((sum, target) => sum + target.tpm, 0),
      requests: targets.reduce((sum, target) => sum + target.requests, 0),
    };
  });
  const tpm = gateways.reduce((sum, gateway) => sum + gateway.tpm, 0);
  const calls = gateways.reduce((sum, gateway) => sum + gateway.requests, 0);
  const edges = clusters.filter(cluster => cluster.tpm > 0).flatMap(cluster => [
    { from: cluster.gateway, to: cluster.id, fromName: cluster.gateway, toName: cluster.name,
      tpm: cluster.tpm, total: gateways.find(gateway => gateway.id === cluster.gateway).tpm, model: cluster.model },
    ...cluster.instances.map(instance => ({
      from: cluster.id, to: instance.id, fromName: cluster.name, toName: instance.name,
      tpm: instance.tpm, total: cluster.tpm, model: cluster.model,
    })),
  ]);
  return { gateways, clusters, tpm, calls, edges };
}

