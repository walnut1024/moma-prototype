export const GPU_VENDORS = ['NVIDIA', 'AMD', 'Ascend', 'Hygon', 'Moore Threads', 'Iluvatar', 'Cambricon', 'MetaX', 'CPU'];

export const labelList = value => (value || '').split(',').map(label => label.trim()).filter(Boolean);
export const labelMap = value => new Map(labelList(value).map(label => label.split('=')));
export const labelText = values => Array.from(values, ([key, value]) => `${key}=${value}`).join(', ');
export const labelIssue = value => {
  const labels = labelList(value);
  if (labels.some(label => !/^[\w./-]+=[\w.-]+$/.test(label))) return '标签使用 key=value 格式，多项以英文逗号分隔';
  if (labelMap(value).size !== labels.length) return '标签键不可重复';
};
export const workerDeploymentRefs = {
  'worker-nj-a-01': ['deployment-ds'], 'worker-nj-a-02': ['deployment-bge'], 'worker-sz-a-01': ['deployment-glm'],
};
export function ipv4(value) {
  const parts = String(value ?? '').split('.');
  return parts.length === 4 && parts.every(part => /^(0|[1-9]\d{0,2})$/.test(part) && Number(part) <= 255);
}

const clusters = records => (records.clusters || []).map(row => ({ value: row.id, label: row.name }));
const clusterName = (value, _row, records) => records.clusters?.find(row => row.id === value)?.name;
const nodeName = (value, _row, records) => records['ops-nodes'].find(row => row.id === value)?.name;
const percent = value => value == null ? '—' : `${value}%`;
const gib = value => value == null ? '—' : `${value} GiB`;
const dateTime = new Intl.DateTimeFormat('sv-SE', { dateStyle: 'short', timeStyle: 'medium', timeZone: 'Asia/Shanghai' });
const timestamp = value => !value ? '—' : value.includes('T') ? dateTime.format(new Date(value)) : value;

const SAMPLE_TIME = '2026-11-25T09:16:42+08:00';
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
  return {
    id, name: id, clusterId: group.clusterId, ip: `${group.ip}.${index + 21}`, hardware: 'NVIDIA',
    labels: `pool=${group.suffix}, topology.kubernetes.io/zone=${group.suffix}, topology.moma.io/rack=rack-${Math.floor(index / 4) + 1}`,
    status: unreachable ? '不可达' : maintenance ? '维护中' : '就绪',
    ...(maintenance && { statusBeforeMaintenance: '就绪', maintenanceRemark: '维护窗口内升级 GPU 驱动' }),
    cpu: unreachable ? null : 8 + allocated * 4 + index, cpuCores: 96, memoryGiB: 768,
    ram: unreachable ? null : 16 + allocated * 5 + index,
    os: 'Ubuntu 24.04 LTS', version: 'v2.3.1', gpuCount: 8, heartbeat: SAMPLE_TIME,
  };
}));

const sampleGpus = nodeGroups.flatMap(group => group.reserved.flatMap((reserved, index) => {
  const node = sampleNodes.find(row => row.id === workerName(group, index));
  const missing = node.status === '不可达';
  return Array.from({ length: node.gpuCount }, (_, deviceIndex) => {
    const allocated = deviceIndex < reserved;
    const load = allocated ? 54 + (index * 11 + deviceIndex * 7) % 42 : (index + deviceIndex) % 6;
    const used = allocated ? Math.round(group.vram * (0.63 + 0.025 * deviceIndex)) : 1;
    return {
      id: `${node.id}-gpu-${deviceIndex}`, name: group.model, index: deviceIndex, nodeId: node.id,
      clusterId: group.clusterId, vendor: 'NVIDIA', computeCapability: group.computeCapability, vram: group.vram, status: missing ? '不可达' : '正常',
      vramUsed: missing ? null : used, vramAllocated: allocated ? Math.round(group.vram * 0.85) : 0,
      utilization: missing ? null : load, temperature: missing ? null : 35 + Math.round(load * 0.36),
      driver: '580.105.08', runtime: 'CUDA 13.0', sampledAt: SAMPLE_TIME,
      power: missing ? null : 58 + Math.round(load * 2), powerLimit: group.vram === 48 ? 350 : 400,
    };
  });
}));

const clusterField = { key: 'clusterId', label: '集群', format: clusterName };
const nodeField = { key: 'nodeId', label: '节点', format: nodeName };
const statusField = { key: 'status', label: '状态', status: true,
  color: value => ({ 就绪: 'green', 正常: 'green', 未就绪: 'orange', 不可达: 'red', 维护中: 'orange' })[value] };
const nodeVramField = { key: 'vram', label: '显存使用率', format: (_value, row, records) => {
  const devices = records['ops-gpus'].filter(gpu => gpu.nodeId === row.id && gpu.vramUsed != null);
  const total = devices.reduce((sum, gpu) => sum + gpu.vram, 0);
  return percent(total ? Math.round(100 * devices.reduce((sum, gpu) => sum + gpu.vramUsed, 0) / total) : null);
} };

function removeWorkerDevices(rows, records) {
  const ids = new Set(rows.map(row => row.id));
  return { 'ops-gpus': records['ops-gpus'].filter(gpu => !ids.has(gpu.nodeId)) };
}

export const RESOURCE_PAGES = {
  'ops-nodes': {
    title: '节点',
    rowSelection: true,
    columnSettings: true,
    actionMenu: true,
    searchPlaceholder: '搜索节点名称、IP 或标签',
    searchKeys: ['name', 'ip', 'labels'],
    columns: [
      { key: 'name', label: '节点名称', width: 175, sorter: true }, clusterField,
      { key: 'labels', label: '标签', width: 175 }, statusField, { key: 'ip', label: 'IP 地址' },
      { key: 'cpu', label: 'CPU 使用率', format: percent, sorter: true },
      { key: 'ram', label: '内存使用率', format: percent, sorter: true },
      nodeVramField,
      { key: 'gpuCount', label: 'GPU 数量' },
    ],
    filters: [
      { key: 'clusterId', label: '集群', options: clusters },
      { key: 'labels', label: '节点标签', multiple: true,
        options: (records, filters) => [...new Set(records['ops-nodes'].filter(row => !filters?.clusterId || row.clusterId === filters.clusterId).flatMap(row => labelList(row.labels)))].sort(),
        match: (values, row) => (Array.isArray(values) ? values : [values]).every(value => labelList(row.labels).includes(value)) },
      { key: 'status', label: '状态', options: ['就绪', '未就绪', '不可达', '维护中'] },
    ],
    detail: [
      { key: 'name', label: '节点名称' }, clusterField, statusField,
      { key: 'ip', label: 'IP 地址' }, { key: 'labels', label: '标签' }, { key: 'maintenanceRemark', label: '维护说明' },
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
    fields: [
      { key: 'name', label: '节点名称', required: true, placeholder: '例如 worker-nj-a-09' },
      { key: 'clusterId', label: '所属集群', type: 'select', options: clusters, required: true, editable: false },
      { key: 'ip', label: '节点 IP', required: true, editable: false, placeholder: '例如 10.18.10.29' },
      { key: 'hardware', label: '硬件类型', type: 'select', options: GPU_VENDORS, editable: false, defaultValue: 'NVIDIA' },
      { key: 'externalIp', label: '节点外部地址', editable: false },
      { key: 'kvTransferNic', label: 'KV 传输网卡', placeholder: '例如 eth1' },
      { key: 'labels', label: '标签', placeholder: '例如 pool=nj-a, env=prod' },
    ],
    validate: (draft, records, current) => {
      if (!records.clusters?.some(row => row.id === draft.clusterId)) return '请选择已纳管的集群';
      if (!/^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/.test(draft.name)) return '节点名称须使用小写字母、数字或连字符，长度不超过 63 个字符';
      if (!ipv4(draft.ip) || (draft.externalIp && !ipv4(draft.externalIp))) return '请输入有效的 IPv4 地址';
      if (current && (draft.clusterId !== current.clusterId || draft.ip !== current.ip)) return '节点的集群及 IP 由注册信息确定';
      const otherNodes = records['ops-nodes'].filter(row => row.id !== current?.id);
      if (otherNodes.some(row => row.name === draft.name)) return '节点名称已存在';
      if (otherNodes.some(row => row.clusterId === draft.clusterId && row.ip === draft.ip)) return '集群内的节点 IP 已存在';
      return labelIssue(draft.labels);
    },
    save: (draft, _records, current) => current ? {} : { status: '未就绪' },
    deletable: true,
    canDelete: (row, records) => {
      if (records.deployments?.some(deployment => !deployment.retiredAt && deployment.clusterId === row.clusterId &&
        workerDeploymentRefs[row.id]?.includes(deployment.id) && !['停止', '失败'].includes(deployment.status))) return '请先停止此节点上的模型任务';
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
        title: '进入维护', fields: [{ key: 'maintenanceRemark', label: '维护说明', type: 'textarea', help: '维护期间暂停分配新任务。' }],
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
    columnSettings: true,
    searchPlaceholder: '搜索设备名称、编号或节点',
    searchKeys: ['name', 'index', 'nodeId'],
    filters: [
      { key: 'clusterId', label: '集群', options: clusters },
      { key: 'nodeId', label: '节点', options: records => records['ops-nodes'].map(row => ({ value: row.id, label: row.name })) },
    ],
    columns: [
      { key: 'name', label: '设备名称', width: 135, sorter: true }, { key: 'index', label: '设备编号', sorter: true },
      clusterField, nodeField, { key: 'vendor', label: '供应商' }, statusField,
      { key: 'temperature', label: '温度', format: value => value == null ? '—' : `${value} °C`, sorter: true },
      { key: 'utilization', label: '核心使用率', format: percent, sorter: true },
      { key: 'vramUsed', label: '显存已用 / 总量', width: 175, sorter: true, format: (value, row) => `${gib(value)} / ${gib(row.vram)}` },
    ],
    detail: [
      { key: 'id', label: '设备 ID' }, { key: 'name', label: '设备名称' }, { key: 'index', label: '设备编号' },
      clusterField, nodeField, statusField, { key: 'driver', label: '驱动版本' }, { key: 'runtime', label: '运行时' },
      { key: 'vram', label: '总显存', format: gib }, { key: 'vramUsed', label: '已用显存', format: gib },
      { key: 'vramAllocated', label: '已分配显存', format: gib }, { key: 'utilization', label: '核心使用率', format: percent },
      { key: 'sampledAt', label: '采样时间', format: timestamp },
    ],
    seed: sampleGpus,
  },
};
