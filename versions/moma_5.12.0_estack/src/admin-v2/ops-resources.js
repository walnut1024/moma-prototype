import { deploymentInstances, deploymentPlacementForRole } from './deployments.js';

export const GPU_VENDORS = ['NVIDIA', 'AMD', 'Ascend', 'Hygon', 'Moore Threads', 'Iluvatar', 'Cambricon', 'MetaX', 'T-Head', 'CPU'];

function splitLabel(label) {
  const divider = label.indexOf('=');
  return divider < 0 ? [label, ''] : [label.slice(0, divider), label.slice(divider + 1)];
}

export function labelPairs(value) {
  if (Array.isArray(value)) return value;
  if (value && typeof value === 'object') return Object.entries(value);
  return (value || '').split(',').map(label => label.trim()).filter(Boolean).map(splitLabel);
}
export const labelList = value => labelPairs(value).map(([key, text]) => `${key}=${text}`);
export const labelMap = value => new Map(labelPairs(value));
export const normalizedLabelPairs = value => labelPairs(value).map(([key, text]) => [key.trim(), text]);
export function labelPairIssues(value) {
  const keys = new Set();
  return normalizedLabelPairs(value).map(([key, text]) => {
    const keyIssue = !key ? '请填写标签键。' : /[=\r\n]/.test(key) ? '标签键不可包含等号或换行。'
      : keys.has(key) ? '标签键不可重复。' : '';
    const valueIssue = !text.trim() ? '请填写标签值。' : '';
    keys.add(key);
    return { key: keyIssue, text: valueIssue };
  });
}
export const labelIssue = value => labelPairIssues(value).flatMap(({ key, text }) => [key, text]).find(Boolean);
export function workerLabelsMatch(labels, selected = []) {
  const row = labelMap(labels);
  const matched = new Map();
  for (const pair of Array.isArray(selected) ? selected : [selected]) {
    const [key, value] = splitLabel(pair);
    matched.set(key, matched.get(key) || row.get(key) === value);
  }
  return [...matched.values()].every(Boolean);
}

export function workerLabelOptions(rows) {
  const pairs = rows.flatMap(row => labelPairs(row.labels).flatMap(([key, value]) =>
    key && !key.includes('=') ? [`${key}=${value}`] : []));
  return [...new Set(pairs)].sort().map(value => {
    const [key, text] = splitLabel(value);
    return { value, label: `${key}: ${text}` };
  });
}

export const defaultTopologyLayers = [
  { id: 'zone', name: '可用区', labelKey: 'topology.gpustack.ai/zone', fallbackLabelKeys: ['topology.kubernetes.io/zone'] },
  { id: 'rack', name: '机架', labelKey: 'topology.gpustack.ai/rack', fallbackLabelKeys: ['topology.kubernetes.io/rack', 'topology.moma.io/rack'] },
];

const builtinTopologyLayer = id => defaultTopologyLayers.find(layer => layer.id === id);

export function topologyLabelKeys(layer) {
  const primary = builtinTopologyLayer(layer.id)?.labelKey;
  return [...new Set([primary, layer.labelKey, ...(layer.fallbackLabelKeys ?? [])].filter(Boolean))];
}

export function topologyLocation(worker, layer) {
  const labels = labelMap(worker.labels);
  const keys = topologyLabelKeys(layer);
  for (const key of keys) {
    if (labels.get(key)) return { value: labels.get(key), key, discovered: key !== keys[0] };
    if (worker.topologyFacts?.[key]) return { value: worker.topologyFacts[key], key, discovered: true };
  }
  return {};
}

export function validateTopologyLayers(layers) {
  const names = new Set(), keys = new Set();
  const normalized = layers.map(layer => {
    const enteredKeys = [layer.labelKey, ...(layer.fallbackLabelKeys ?? [])].map(key => key?.trim()).filter(Boolean);
    const layerKeys = topologyLabelKeys(layer).map(key => key.trim()).filter(Boolean);
    const name = layer.name.trim();
    if (!name || name.length > 80 || names.has(name)) throw Error('拓扑层级名称须填写且不得重复。');
    names.add(name);
    if (layerKeys.some(key => !/^[\w./-]+$/.test(key) || keys.has(key)) || new Set(enteredKeys).size !== enteredKeys.length) {
      throw Error('拓扑标签键须有效且不能重复映射。');
    }
    layerKeys.forEach(key => keys.add(key));
    const [labelKey, ...fallbackLabelKeys] = layerKeys;
    return { ...layer, name, labelKey: labelKey ?? '', fallbackLabelKeys };
  });
  const zone = normalized.findIndex(layer => layer.id === 'zone'), rack = normalized.findIndex(layer => layer.id === 'rack');
  if (zone >= 0 && rack >= 0 && zone > rack) throw Error('可用区须位于机架层级之上。');
  return normalized;
}
const sampleWorkerDeployments = {
  'worker-nj-a-01': ['deployment-ds'], 'worker-nj-a-02': ['deployment-bge'], 'worker-sz-a-01': ['deployment-glm'],
};
const clusterDeployments = (row, records) => (records.deployments ?? []).filter(item => !item.retiredAt && item.clusterId === row.clusterId);

export function groupResourceModels(instances, records, { query = '', state = '' } = {}) {
  const names = new Map([...(records.modelTemplates ?? []), ...(records.models ?? []), ...(records.deployableModels ?? [])]
    .map(model => [model.id, model.name]));
  const groups = new Map();
  const search = query.trim().toLocaleLowerCase();
  for (const instance of instances) {
    const { deployment } = instance;
    const id = deployment.modelId ? `model:${deployment.modelId}` : `deployment:${deployment.id}`;
    const name = names.get(deployment.modelId) || deployment.modelId || deployment.name;
    if (state && instance.state !== state || !`${name} ${deployment.name} ${instance.name}`.toLocaleLowerCase().includes(search)) continue;
    if (!groups.has(id)) groups.set(id, { id, name, instances: [] });
    groups.get(id).instances.push(instance);
  }
  return [...groups.values()].sort((a, b) => a.name.localeCompare(b.name, 'zh-CN', { numeric: true }) || a.id.localeCompare(b.id));
}

const targetPlacements = deployment => {
  const roles = ['prefill', 'decode', 'router'].filter(role => deployment.roles?.[role] > 0);
  return (roles.length ? roles : [undefined]).map(role => deploymentPlacementForRole(deployment, role));
};
export const deviceDeployments = (device, records) => clusterDeployments(device, records).filter(item =>
  deploymentInstances([item], records).some(instance => instance.devices.some(bound => bound.id === device.id)) ||
  targetPlacements(item).some(({ placement, targets }) => placement === '指定 GPU' && targets.includes(device.id)));

export function workerDeployments(worker, records) {
  const deviceIds = new Set((records['ops-gpus'] ?? [])
    .filter(device => device.nodeId === worker.id && device.clusterId === worker.clusterId).map(device => device.id));
  return clusterDeployments(worker, records).filter(item =>
    deploymentInstances([item], records).some(instance => instance.workerId === worker.id ||
      instance.devices.some(device => device.nodeId === worker.id)) ||
    targetPlacements(item).some(({ placement, targets }) => {
      if (placement === '指定节点') return targets.includes(worker.id);
      if (placement === '指定 GPU') return targets.some(id => deviceIds.has(id));
      return !item.demoInstances && sampleWorkerDeployments[worker.id]?.includes(item.id);
    }));
}
export function ipv4(value) {
  const parts = String(value ?? '').split('.');
  return parts.length === 4 && parts.every(part => /^(0|[1-9]\d{0,2})$/.test(part) && Number(part) <= 255);
}

export const dockerWorkerRegistrationDefaults = {
  values: { ip: '', externalIp: '', kvTransferNic: '', modelPath: '', cachePath: '',
    dataVolume: 'gpustack-data', containerName: 'gpustack-worker', dtkVersion: '25.04' },
  overrides: { dataVolume: true, containerName: true },
};

export function dockerWorkerRegistrationArgs(values, overrides, vendors) {
  const active = Object.fromEntries(Object.keys(dockerWorkerRegistrationDefaults.values)
    .filter(key => overrides[key] && (key !== 'kvTransferNic' || vendors.includes('NVIDIA')))
    .map(key => [key, values[key].trim()]));
  const { ip, externalIp, kvTransferNic, modelPath, cachePath, dataVolume, containerName } = active;
  const modelPaths = modelPath?.split(',').map(path => path.trim()) ?? [];
  const absolute = value => /^\/[\w./-]+$/.test(value) && !value.split('/').includes('..');
  const name = value => /^[\w][\w.-]*$/.test(value);
  const errors = {
    ip: ip !== undefined && !ipv4(ip) ? '请输入有效的节点 IPv4 地址。' : '',
    externalIp: externalIp !== undefined && !ipv4(externalIp) ? '请输入有效的外部 IPv4 地址。' : '',
    cachePath: cachePath !== undefined && !absolute(cachePath) ? '请输入有效的绝对缓存路径。' : '',
    modelPath: modelPaths.some(path => !absolute(path)) ? '请输入有效的绝对模型路径，多条以英文逗号分隔。' : '',
    kvTransferNic: kvTransferNic !== undefined && !/^[\w.-]+$/.test(kvTransferNic) ? '请输入有效的 KV 传输网卡名称。' : '',
    dataVolume: dataVolume !== undefined && !absolute(dataVolume) && !name(dataVolume) ? '请输入有效的数据卷名称或绝对路径。' : '',
    containerName: containerName !== undefined && !name(containerName) ? '请输入有效的容器名称。' : '',
  };
  return { active, modelPaths, errors };
}

const clusters = records => (records.clusters || []).map(row => ({ value: row.id, label: row.name }));
const clusterName = (value, _row, records) => records.clusters?.find(row => row.id === value)?.name;
const registrationOnly = (_draft, _records, row) => !row;
const nodeName = (value, row, records) => records['ops-nodes']?.find(node =>
  node.id === value && (row.clusterId == null || node.clusterId === row.clusterId))?.name;
const percent = value => value == null ? '—' : `${value}%`;
const gib = value => value == null ? '—' : `${value} GiB`;
export const gpuMemoryUtilization = row => row.vram > 0 && (row.vramUsed != null || row.vramAllocated != null)
  ? Math.round(100 * (row.vramUsed ?? row.vramAllocated) / row.vram) : null;
const oneDecimal = value => Math.round(value * 10) / 10;
const average = values => {
  const measured = values.filter(Number.isFinite);
  return measured.length ? oneDecimal(measured.reduce((sum, value) => sum + value, 0) / measured.length) : null;
};
export function resourceLoad(nodes, devices) {
  return {
    cpu: average(nodes.map(node => node.cpu)),
    ram: average(nodes.map(node => node.ram)),
    gpu: average(devices.map(device => device.utilization)),
    vram: average(devices.map(device => Number.isFinite(device.vramUsed) && device.vram > 0 ? device.vramUsed / device.vram * 100 : null)),
  };
}
export function hostMemoryUsed(row) {
  if (Number.isFinite(row.memoryUsedGiB)) return row.memoryUsedGiB;
  if (!Number.isFinite(row.ram) || !Number.isFinite(row.memoryGiB)) return null;
  return oneDecimal(row.memoryGiB * row.ram / 100);
}

export const RESOURCE_MONITOR_PRESETS = [
  [5, '最近 5 分钟'], [15, '最近 15 分钟'], [30, '最近 30 分钟'], [60, '最近 1 小时'], [180, '最近 3 小时'],
  [360, '最近 6 小时'], [720, '最近 12 小时'], [1440, '最近 24 小时'], [2880, '最近 2 天'], [10080, '最近 7 天'],
].map(([minutes, label]) => ({ value: minutes * 60000, label }));

export function resourceTimeRangeIssue(start, end, now = Date.now()) {
  if (start == null || end == null) return '请选择开始和结束时间。';
  if (!Number.isSafeInteger(start) || !Number.isSafeInteger(end) || start < 0 || start >= end) return '结束时间须晚于开始时间。';
  if (end > now) return '结束时间不能晚于当前时间。';
  if (end - start < RESOURCE_MONITOR_PRESETS[0].value) return '时间范围至少为 5 分钟。';
  if (end - start > RESOURCE_MONITOR_PRESETS.at(-1).value) return '时间范围最长为 7 天。';
  return '';
}

export function resourceMetricHistory(resource, device = false) {
  const keys = device ? ['utilization', 'vramUsed', 'power', 'temperature'] : ['cpu', 'memoryUsedGiB', 'diskUsedGiB'];
  const raw = resource.samples ?? [{ ...resource, at: resource[device ? 'sampledAt' : 'heartbeat'] }];
  const samples = new Map();
  for (const reading of raw) {
    const at = typeof reading.at === 'string' ? Date.parse(reading.at) : reading.at;
    const sample = device ? reading : { ...reading, memoryUsedGiB: hostMemoryUsed(reading) };
    if (Number.isSafeInteger(at) && at >= 0 && keys.some(key => Number.isFinite(sample[key]))) samples.set(at, sample);
  }
  return samples;
}

export function resourceObservations(sources, start, end) {
  let latest = null;
  const steps = new Set();
  const scoped = sources.map(source => {
    const times = [...source.samples.keys()].filter(at => start <= at && at <= end).sort((left, right) => left - right);
    for (let index = 0; index < times.length; index += 1) {
      const at = times[index];
      latest = Math.max(latest ?? at, at);
      if (index > 0) steps.add(at - times[index - 1]);
    }
    return { ...source, samples: new Map(times.map(at => [at, source.samples.get(at)])) };
  });
  return { sources: scoped, latest, sampleStep: steps.size === 1 ? [...steps][0] : null, irregular: steps.size > 1 };
}

export function resourceScopeFromParams(params) {
  const start = params?.get('monitorStart'), end = params?.get('monitorEnd');
  if (start && end && !resourceTimeRangeIssue(Number(start), Number(end))) return { range: [Number(start), Number(end)] };
  const period = Number(params?.get('monitorPeriod'));
  return RESOURCE_MONITOR_PRESETS.some(option => option.value === period) ? { period } : {};
}

export function workerGpuInventory(worker, devices) {
  return devices.filter(device => worker.id && worker.clusterId && device.nodeId === worker.id && device.clusterId === worker.clusterId)
    .sort((left, right) => (left.index ?? Infinity) - (right.index ?? Infinity) || left.id.localeCompare(right.id));
}
const dateTime = new Intl.DateTimeFormat('sv-SE', { dateStyle: 'short', timeStyle: 'medium', timeZone: 'Asia/Shanghai' });
const timestamp = value => !value ? '—' : value.includes('T') ? dateTime.format(new Date(value)) : value;

const latestSampleTime = Math.floor(Date.now() / 60000) * 60000;
const SAMPLE_TIME = new Date(latestSampleTime).toISOString();
const sampleOffsets = [-6, -3, -5, -2, 2, 4, 1, 5, 3, -1, 2, 0];
const percentReading = value => Math.min(100, Math.max(0, value));
const simulatedSamples = reading => sampleOffsets.map((offset, index) => ({
  at: new Date(latestSampleTime - (sampleOffsets.length - 1 - index) * 5 * 60000).toISOString(),
  ...reading(offset),
}));
const nodeGroups = [
  { clusterId: 'cluster-nj-a', suffix: 'nj-a', ip: '10.18.10', model: 'NVIDIA H20', computeCapability: '9.0', vram: 96, reserved: [8, 8, 6, 6, 4, 4, 0, 0] },
  { clusterId: 'cluster-sz-a', suffix: 'sz-a', ip: '10.21.12', model: 'NVIDIA L40S', computeCapability: '8.9', vram: 48, reserved: [8, 8, 4, 4] },
  { clusterId: 'cluster-nj-test', suffix: 'nj-test', ip: '10.18.18', model: 'NVIDIA A800', computeCapability: '8.0', vram: 80, reserved: [4, 0] },
];
const workerName = (group, index) => `worker-${group.suffix}-${String(index + 1).padStart(2, '0')}`;

const sampleNodes = nodeGroups.flatMap(group => group.reserved.map((allocated, index) => {
  const id = workerName(group, index);
  const unreachable = group.suffix === 'sz-a' && index === 3;
  const maintenance = group.suffix === 'nj-test' && index === 1;
  const row = {
    id, name: id, clusterId: group.clusterId, ip: `${group.ip}.${index + 21}`, hardware: 'NVIDIA',
    labels: `pool=${group.suffix}, topology.kubernetes.io/zone=${group.suffix}, topology.moma.io/rack=rack-${Math.floor(index / 4) + 1}`,
    status: unreachable ? '不可达' : maintenance ? '维护中' : '就绪',
    ...(maintenance && { statusBeforeMaintenance: '就绪', maintenanceRemark: '维护窗口内升级 GPU 驱动' }),
    cpu: unreachable ? null : 8 + allocated * 4 + index, cpuCores: 96, memoryGiB: 768,
    ram: unreachable ? null : 16 + allocated * 5 + index,
    diskGiB: 2048, diskUsedGiB: unreachable ? null : 300 + allocated * 83 + index * 13,
    os: 'Ubuntu 24.04 LTS', version: 'v2.3.1', gpuCount: 8, heartbeat: SAMPLE_TIME,
  };
  return { ...row, samples: unreachable ? [] : simulatedSamples(offset => ({
    cpu: percentReading(row.cpu + offset),
    ram: percentReading(row.ram + offset),
    memoryGiB: row.memoryGiB,
    diskUsedGiB: row.diskUsedGiB - Math.abs(offset),
    diskGiB: row.diskGiB,
  })) };
}));

const sampleGpus = nodeGroups.flatMap(group => group.reserved.flatMap((reserved, index) => {
  const node = sampleNodes.find(row => row.id === workerName(group, index));
  const missing = node.status === '不可达';
  return Array.from({ length: node.gpuCount }, (_, deviceIndex) => {
    const allocated = deviceIndex < reserved;
    const load = allocated ? 54 + (index * 11 + deviceIndex * 7) % 42 : (index + deviceIndex) % 6;
    const used = allocated ? Math.round(group.vram * (0.63 + 0.025 * deviceIndex)) : 1;
    const row = {
      id: `${node.id}-gpu-${deviceIndex}`, name: group.model, index: deviceIndex, nodeId: node.id,
      clusterId: group.clusterId, vendor: 'NVIDIA', computeCapability: group.computeCapability, vram: group.vram, status: missing ? '不可达' : '正常',
      vramUsed: missing ? null : used, vramAllocated: allocated ? Math.round(group.vram * 0.85) : 0,
      utilization: missing ? null : load, temperature: missing ? null : 35 + Math.round(load * 0.36),
      driver: '580.105.08', runtime: 'CUDA 13.0', sampledAt: SAMPLE_TIME,
      power: missing ? null : 58 + Math.round(load * 2), powerLimit: group.vram === 48 ? 350 : 400,
    };
    return { ...row, samples: missing ? [] : simulatedSamples(offset => ({
      utilization: percentReading(row.utilization + offset),
      vramUsed: Math.min(row.vram, Math.max(0, row.vramUsed + Math.round(offset / 2))),
      vram: row.vram,
      temperature: row.temperature + Math.round(offset / 3),
      power: row.power + offset * 2,
    })) };
  });
}));

export function inferenceDemoOpsResources(base, now = Date.now()) {
  const latest = Math.floor(now / 60_000) * 60_000;
  const timestamp = new Date(latest).toISOString();
  const refresh = (rows, timeKey) => rows.map(row => row.samples?.length ? {
    ...row, [timeKey]: timestamp,
    samples: row.samples.map((sample, index) => ({
      ...sample, at: new Date(latest - (row.samples.length - 1 - index) * 5 * 60_000).toISOString(),
    })),
  } : row);
  return {
    ...base,
    'ops-nodes': refresh(base['ops-nodes'] ?? sampleNodes, 'heartbeat'),
    'ops-gpus': refresh(base['ops-gpus'] ?? sampleGpus, 'sampledAt'),
  };
}

const clusterField = { key: 'clusterId', label: '集群', format: clusterName, sorter: true,
  sortValue: (row, records) => clusterName(row.clusterId, row, records) };
const nodeField = { key: 'nodeId', label: '节点', format: nodeName, sorter: true,
  sortValue: (row, records) => nodeName(row.nodeId, row, records) };
const statusField = { key: 'status', label: '状态', status: true,
  color: value => ({ 就绪: 'green', 正常: 'green', 未就绪: 'orange', 不可达: 'red', 维护中: 'orange' })[value] };
const nodeVramField = { key: 'vram', label: '显存使用率', format: (_value, row, records) => {
  const devices = records['ops-gpus'].filter(gpu => gpu.nodeId === row.id && gpu.clusterId === row.clusterId);
  return percent(resourceLoad([], devices).vram);
} };

function removeWorkerDevices(rows, records) {
  const ids = new Set(rows.map(row => row.id));
  return { 'ops-gpus': records['ops-gpus'].filter(gpu => !ids.has(gpu.nodeId)) };
}

export const RESOURCE_PAGES = {
  'ops-nodes': {
    title: '节点',
    detailRoute: true,
    rowSelection: true,
    columnSettings: true,
    actionMenu: true,
    searchPlaceholder: '搜索节点名称、IP 或标签',
    searchMatches: (row, query) => [row.id, row.name, row.ip, row.externalIp, ...labelList(row.labels)]
      .some(value => String(value ?? '').toLocaleLowerCase().includes(query)),
    columns: [
      { key: 'name', label: '节点名称', width: 175, sorter: true, secondaryKey: 'version' },
      { key: 'labels', label: '标签', width: 175, format: labelList }, clusterField, { ...statusField, sorter: true },
      { key: 'ip', label: 'IP 地址', sorter: true },
      { key: 'cpu', label: 'CPU 使用率', format: percent, sorter: true },
      { key: 'ram', label: '内存使用率', format: percent, sorter: true },
      { key: 'gpuCount', label: 'GPU', width: 176 }, nodeVramField,
      { key: 'diskUsedGiB', label: '磁盘', width: 145, sorter: true,
        format: (value, row) => row.diskGiB ? `${gib(value)} / ${gib(row.diskGiB)}` : '—' },
    ],
    filters: [
      { key: 'clusterId', label: '集群', options: clusters },
      { key: 'labels', label: '节点标签', multiple: true,
        options: (records, filters) => workerLabelOptions(records['ops-nodes'].filter(row => !filters?.clusterId || row.clusterId === filters.clusterId)),
        match: (values, row) => workerLabelsMatch(row.labels, values) },
      { key: 'status', label: '状态', options: ['就绪', '未就绪', '不可达', '维护中'] },
    ],
    detail: [
      { key: 'name', label: '节点名称' }, clusterField, statusField,
      { key: 'ip', label: 'IP 地址' }, { key: 'labels', label: '标签', format: labelList }, { key: 'maintenanceRemark', label: '维护说明' },
      { key: 'os', label: '操作系统' }, { key: 'version', label: '节点版本' },
      { key: 'gpuCount', label: 'GPU 数量' },
      { key: 'heartbeat', label: '最近心跳', format: timestamp },
      { key: 'cpu', label: 'CPU 使用率', format: percent },
      { key: 'ram', label: '内存使用率', format: percent },
      nodeVramField,
    ],
    createLabel: '添加节点',
    hideCreate: true,
    editable: true,
    uniqueBy: ['clusterId', 'name'],
    fields: [
      { key: 'name', label: '节点名称', required: true, editable: false, placeholder: '例如 worker-nj-a-09' },
      { key: 'clusterId', label: '所属集群', type: 'select', options: clusters, required: true, visible: registrationOnly },
      { key: 'ip', label: '节点 IP', required: true, visible: registrationOnly, placeholder: '例如 10.18.10.29' },
      { key: 'hardware', label: '硬件类型', type: 'select', options: GPU_VENDORS, visible: registrationOnly, defaultValue: 'NVIDIA' },
      { key: 'externalIp', label: '节点外部地址', visible: registrationOnly },
      { key: 'kvTransferNic', label: 'KV 传输网卡', placeholder: '例如 eth1', help: '留空时沿用默认网卡配置。',
        visible: (draft, records, row) => {
          const devices = row && records['ops-gpus'].filter(device => device.nodeId === row.id);
          return devices?.length ? !devices.every(device => device.vendor?.trim().toLowerCase() === 'ascend') : draft.hardware !== 'Ascend';
        } },
      { key: 'labels', label: '标签', type: 'nodeLabelPairs', fullWidth: true },
    ],
    validate: (draft, records, current) => {
      if (draft.kvTransferNic && !/^[\w.-]+$/.test(draft.kvTransferNic)) return '请输入有效的 KV 传输网卡名称';
      if (current) return Array.isArray(draft.labels) ? labelIssue(draft.labels) : undefined;
      if (!records.clusters?.some(row => row.id === draft.clusterId)) return '请选择已纳管的集群';
      if (!/^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/.test(draft.name)) return '节点名称须使用小写字母、数字或连字符，长度不超过 63 个字符';
      if (!ipv4(draft.ip) || (draft.externalIp && !ipv4(draft.externalIp))) return '请输入有效的 IPv4 地址';
      const otherNodes = records['ops-nodes'].filter(row => row.id !== current?.id && row.clusterId === draft.clusterId);
      if (otherNodes.some(row => row.name === draft.name)) return '集群内的节点名称已存在';
      if (otherNodes.some(row => row.ip === draft.ip)) return '集群内的节点 IP 已存在';
      return labelIssue(draft.labels);
    },
    save: (draft, _records, current) => ({
      ...((Array.isArray(draft.labels) || !current) && { labels: Object.fromEntries(normalizedLabelPairs(draft.labels)) }),
      ...(!current && { status: '未就绪' }),
    }),
    deletable: true,
    canDelete: (row, records) => {
      if (workerDeployments(row, records).some(deployment => !['停止', '失败'].includes(deployment.status))) return '请先停止此节点上的模型任务';
      if (['ops-cache-acceleration', 'ops-model-files'].some(page => records[page]?.some(record => record.workerId === row.id))) return '节点仍被运维记录引用';
    },
    deleteRelated: (row, records) => removeWorkerDevices([row], records),
    batchActions: [{ label: '批量删除', confirm: rows => `确认删除所选 ${rows.length} 个节点及其设备记录？`, related: removeWorkerDevices, apply: (rows, records) => {
      for (const row of rows) {
        const issue = RESOURCE_PAGES['ops-nodes'].canDelete(row, records);
        if (issue) throw new Error(`${row.name}：${issue}`);
      }
      return [];
    } }],
    actions: [
      { label: '查看 GPU', when: row => row.gpuCount > 0, target: { page: 'ops-gpus', field: 'nodeId' } },
      { label: '指标详情', panel: 'metrics' },
      { label: '查看 SSH 访问', panel: 'ssh', when: row => Boolean(row.sshConfigured) },
      { label: '进入维护', when: row => row.status !== '维护中', editor: {
        title: '进入维护', fields: [{ key: 'name', label: '节点名称', editable: false },
          { key: 'maintenanceRemark', label: '维护说明', type: 'textarea', help: '维护期间暂停分配新任务。' }],
        save: (draft, _records, row) => ({ status: '维护中', statusBeforeMaintenance: row.status, maintenanceRemark: draft.maintenanceRemark }),
      } },
      { label: '退出维护', when: row => row.status === '维护中', confirm: false, apply: row => ({ status: row.statusBeforeMaintenance || '未就绪', statusBeforeMaintenance: '', maintenanceRemark: '' }) },
      { label: '模拟注册检查', when: (row, records) => row.status === '未就绪' && records.clusters?.some(cluster => cluster.id === row.clusterId && cluster.status === '运行中'),
        apply: () => ({ status: '就绪', heartbeat: new Date().toISOString() }) },
    ],
    seed: sampleNodes,
  },
  'ops-gpus': {
    title: 'GPU',
    detailRoute: true,
    columnSettings: true,
    actionMenu: true,
    searchPlaceholder: '搜索设备名称、编号或节点',
    searchMatches: (row, query, records = {}) => [row.id, row.name, row.index, row.nodeId, nodeName(row.nodeId, row, records)]
      .some(value => String(value ?? '').toLocaleLowerCase().includes(query)),
    filters: [
      { key: 'clusterId', label: '集群', options: clusters },
      { key: 'nodeId', label: '节点', options: (records, filters) => records['ops-nodes']
        .filter(row => !filters?.clusterId || row.clusterId === filters.clusterId).map(row => ({ value: row.id, label: row.name })) },
    ],
    columns: [
      { key: 'name', label: '设备名称', width: 135, sorter: true }, { key: 'index', label: '设备编号', sorter: true },
      clusterField, nodeField, { key: 'vendor', label: '供应商', sorter: true }, statusField,
      { key: 'temperature', label: '温度', format: value => value == null ? '—' : `${value} °C`, sorter: true },
      { key: 'utilization', label: '核心使用率', format: percent, sorter: true },
      { key: 'vramUsed', label: '显存利用率', width: 175, sorter: true, sortValue: gpuMemoryUtilization,
        tip: '有已用显存采样时按已用量计算，缺少采样时用已分配量。', format: (_, row) => percent(gpuMemoryUtilization(row)) },
    ],
    detail: [
      { key: 'id', label: '设备 ID' }, { key: 'name', label: '设备名称' }, { key: 'index', label: '设备编号' },
      clusterField, nodeField, statusField, { key: 'driver', label: '驱动版本' }, { key: 'runtime', label: '运行时' },
      { key: 'vram', label: '总显存', format: gib }, { key: 'vramUsed', label: '已用显存', format: gib },
      { key: 'vramAllocated', label: '已分配显存', format: gib }, { key: 'utilization', label: '核心使用率', format: percent },
      { key: 'sampledAt', label: '采样时间', format: timestamp },
    ],
    actions: [
      { label: '详情', panel: 'overview' },
      { label: '指标详情', panel: 'metrics' },
    ],
    seed: sampleGpus,
  },
};
