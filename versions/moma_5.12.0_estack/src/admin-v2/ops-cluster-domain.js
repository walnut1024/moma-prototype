import { JSON_SCHEMA, load } from 'js-yaml';
import { gatherLayerAvailable } from './deployments.js';
import { labelPairIssues, normalizedLabelPairs } from './ops-resources.js';

export const CLUSTER_PROVIDERS = ['Docker', 'Kubernetes', 'DigitalOcean', 'SHUIHUA FUTURE'];
export const isCloudCluster = provider => provider === 'DigitalOcean' || provider === 'SHUIHUA FUTURE';

const mapping = value => value !== null && typeof value === 'object' && !Array.isArray(value);
const inside = (key, value, options) => options.includes(value) || `${key} 须为 ${options.join('、')} 之一。`;
const stringType = value => typeof value === 'string';
const boolType = value => typeof value === 'boolean';
const portType = value => Number.isInteger(value) && value > 0 && value <= 65535;
const portRange = value => {
  if (typeof value !== 'string' || !/^\d+-\d+$/.test(value)) return false;
  const [first, last] = value.split('-').map(Number);
  return portType(first) && portType(last) && first <= last;
};
const workerKeys = {
  ...Object.fromEntries(['cache_dir', 'log_dir', 'image_name_override', 'image_repo', 'system_default_container_registry'].map(key => [key, stringType])),
  ...Object.fromEntries(['debug', 'disable_worker_metrics', 'enable_hf_transfer', 'enable_hf_xet', 'insecure_tls'].map(key => [key, boolType])),
  kv_transfer_ifname: value => value === null || typeof value === 'string' && /^[\w.-]+$/.test(value),
  worker_port: portType, worker_metrics_port: portType, ray_port_range: portRange, service_port_range: portRange,
  system_reserved: mapping, resources: mapping,
  proxy_mode: value => inside('proxy_mode', value, ['worker', 'system', 'disabled']),
};
const dockerWorkerKeys = {
  bin_dir: stringType, pipx_path: stringType, tools_download_base_url: stringType,
};
const kubernetesWorkerKeys = {
  gateway_mode: value => inside('gateway_mode', value, ['worker', 'gateway', 'disabled', 'auto']),
  gateway_kubeconfig: stringType, gateway_concurrency: value => Number.isInteger(value) && value >= 0,
  service_discovery_name: stringType,
};
const blockedKey = /(?:token|secret|password|api[-_]?key|credential(?:s)?)/i;
// GPUStack v2.3.1 derives these paths from the cluster registration.
const chartRegistrationPaths = [
  'appliedRevision', 'global.hub', 'gpustack-operator.fullnameOverride', 'gpustack-operator.global.imageNamespace',
  'gpustack-operator.global.imageRegistry', 'gpustack-operator.image.repository', 'gpustack-operator.image.tag',
  'gpustack-operator.nameOverride', 'gpustack-operator.namespaceOverride', 'gpustack-operator.worker.image',
  'higress-core.enabled', 'image.repository', 'image.tag', 'imagePullSecret.create', 'registrationTokenSecretName',
  'server.enabled', 'worker.enabled', 'worker.serverURL',
];

function occupiesChartPath(config, path) {
  let current = config;
  for (const key of path.split('.')) {
    if (!mapping(current)) return true;
    if (!Object.hasOwn(current, key)) return false;
    current = current[key];
  }
  return true;
}

const selectorPart = /^[A-Za-z0-9](?:[A-Za-z0-9_.-]{0,61}[A-Za-z0-9])?$/;
const dnsPart = /^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/;

export function nodeSelectorIssues(value) {
  const issues = labelPairIssues(value);
  return normalizedLabelPairs(value).map(([key, text], index) => {
    const parts = key.split('/');
    const prefix = parts.length === 2 ? parts[0] : null;
    const validKey = parts.length <= 2 && selectorPart.test(parts.at(-1)) &&
      (prefix == null || prefix.length <= 253 && prefix.split('.').every(part => dnsPart.test(part)));
    return {
      key: issues[index].key || (!validKey ? '请填写有效的 Kubernetes 标签键。' : ''),
      text: text && !selectorPart.test(text) ? '请填写有效的 Kubernetes 标签值。' : '',
    };
  });
}

export function clusterLabels(value, validate = labelPairIssues) {
  // Keep saved labels in place when this field was not edited.
  if (!Array.isArray(value)) return value;
  const issue = validate(value).flatMap(({ key, text }) => [key, text]).find(Boolean);
  if (issue) throw Error(issue);
  return Object.fromEntries(normalizedLabelPairs(value));
}

export function validateClusterYaml(text, provider, kind = 'worker') {
  if (!text.trim()) return;
  const label = kind === 'chart' ? 'Chart Values YAML' : '节点配置 YAML';
  if (text.length > 65536) throw Error(`${label} 不能超过 65,536 个字符。`);
  let config;
  try { config = load(text, { schema: JSON_SCHEMA }); }
  catch (error) { throw Error(`${label} 格式不正确${error.mark ? `，请核对第 ${error.mark.line + 1} 行` : ''}。`); }
  if (config === undefined) return;
  if (!mapping(config)) throw Error(`${label} 须填写键值结构。`);
  if (kind === 'chart') {
    const reserved = chartRegistrationPaths.filter(path => occupiesChartPath(config, path));
    if (reserved.length) throw Error(`${label} 的以下字段由集群注册设置：${reserved.join('、')}。`);
  }
  const checked = new Set();
  const inspectKeys = value => {
    if (!value || typeof value !== 'object' || checked.has(value)) return;
    checked.add(value);
    for (const [key, child] of Object.entries(value)) {
      if (blockedKey.test(key)) throw Error(`${label} 不接受凭证字段 ${key}。`);
      if (key === '__proto__' || key === 'constructor' || key === 'prototype') throw Error(`${label} 包含无效字段 ${key}。`);
      inspectKeys(child);
    }
  };
  inspectKeys(config);
  if (kind === 'chart') return;
  const rules = { ...workerKeys, ...(provider === 'Kubernetes' ? kubernetesWorkerKeys : dockerWorkerKeys) };
  for (const [key, value] of Object.entries(config)) {
    const valid = Object.hasOwn(rules, key) && rules[key](value);
    if (valid !== true) throw Error(typeof valid === 'string' ? valid : `${label} 不支持字段 ${key} 或其当前值。`);
  }
}

export function clusterRemovalIssue(state, row) {
  if (!row) return '集群不存在，请刷新列表';
  if (row.nodes !== 0 || row.allocatedGpu !== 0 || row.nodePools?.some(pool => pool.replicas > 0)) return `${row.name} 仍有节点或 GPU 分配记录`;
  if (state.deployments.some(item => !item.retiredAt && item.clusterId === row.id)) return `${row.name} 仍有关联模型部署`;
}

export function clusterGatherIssue(deployments, clusterId, layers) {
  const stranded = deployments.filter(item => {
    const layer = item.pdSettings?.gather?.layer;
    return item.clusterId === clusterId && !item.retiredAt && layer && !gatherLayerAvailable(layers, layer);
  });
  if (stranded.length) {
    return `无法移除或停用正在被模型部署引用的拓扑层级：${stranded.map(item => item.name || item.deploymentId || item.id).join('、')}。请先修改这些部署的聚集层级。`;
  }
}

export async function finishClusterRegistration({ row, records, dispatch }) {
  const cluster = records.clusters?.find(item => item.id === row.clusterId && item.status === '待注册');
  if (!cluster || !dispatch) return false;
  const result = await dispatch({ type: 'update', collection: 'clusters', id: cluster.id, feedback: false,
    changes: { status: '运行中', registeredAt: new Date().toISOString() } });
  if (!result?.clusters?.some(item => item.id === cluster.id && item.status === '运行中')) {
    throw Error('未能确认集群注册状态，请刷新后重试。');
  }
  return true;
}
