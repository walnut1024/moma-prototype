import { useState } from 'react';
import { Banner, Button, Descriptions, Input, Popover, Select, Space, Table, Tabs, Toast } from '@douyinfe/semi-ui';
import { IconPlus } from '@douyinfe/semi-icons';
import AdminStatus from './AdminStatus';
import { AdminModal } from './AdminOverlay';
import { ClusterRegistration, CodePreview, ResourceField, ResourceMetrics } from './ClusterResourcePanels';
import { labelIssue, labelList, labelMap, labelText, workerDeploymentRefs } from './ops-resources';

export function NodeRegistrationHeader({ records, openEditor, navigate, params }) {
  const [active, setActive] = useState(false);
  const [metrics, setMetrics] = useState(false);
  const clusters = records.clusters?.filter(row => row.status !== '待注册' && (!row.provider || row.provider === 'Docker')) ?? [];
  const fixed = clusters.find(row => row.id === params.get('clusterId'));
  return <>
    <Space><Button onClick={() => setMetrics(true)}>监控</Button>
      <Button theme="solid" icon={<IconPlus aria-hidden="true"/>} onClick={() => clusters.length ? setActive(true) : navigate?.('clusters')}>添加节点</Button></Space>
    {active && <ClusterRegistration cluster={fixed} clusters={clusters} onClose={() => setActive(false)}
      onFinish={(cluster, values) => { setActive(false); openEditor({ preset: { ...values, clusterId: cluster.id }, title: '登记演示节点' }); }}/>}
    {metrics && <AdminModal visible title="节点监控" width="min(850px, calc(100vw - 24px))" footer={null} closeOnEsc onCancel={() => setMetrics(false)}>
      <ResourceMetrics rows={records['ops-nodes']} title="节点资源使用率" onClose={() => setMetrics(false)}/>
    </AdminModal>}
  </>;
}

function NodeBatchLabels({ selectedRows, commit }) {
  const [visible, setVisible] = useState(false);
  const [draft, setDraft] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [targetIds, setTargetIds] = useState([]);
  const save = async () => {
    if (busy) return;
    const issue = !draft.trim() ? '请填写至少一项标签。' : labelIssue(draft);
    if (issue) { setError(issue); return; }
    setBusy(true);
    try {
      await commit(latest => {
        if (latest.filter(row => targetIds.includes(row.id)).length !== targetIds.length) throw Error('所选节点已变化，请重新选择。');
        return latest.map(row => targetIds.includes(row.id)
          ? { ...row, labels: labelText(new Map([...labelMap(row.labels), ...labelMap(draft)])) }
          : row);
      }, '节点标签已更新');
      setVisible(false);
    } catch (issue) { setError(issue.message); }
    finally { setBusy(false); }
  };
  return <>
    {selectedRows.length > 0 && <Button onClick={() => { setDraft(''); setError(''); setTargetIds(selectedRows.map(row => row.id)); setVisible(true); }}>批量更新标签</Button>}
    {visible && <AdminModal visible title={`批量更新 ${targetIds.length} 个节点的标签`} onOk={save} confirmLoading={busy}
      onCancel={() => !busy && setVisible(false)}>
      <div className="admin-page-stack">
        <ResourceField label="标签">{id => <Input aria-labelledby={id} value={draft} disabled={busy} onChange={setDraft} placeholder="例如 pool=inference, env=prod"/>}</ResourceField>
        {error && <Banner type="danger" closeIcon={null} description={error}/>}
      </div>
    </AdminModal>}
  </>;
}

function WorkerDeploymentList({ row, records, navigate }) {
  const [query, setQuery] = useState('');
  const [state, setState] = useState('');
  const refs = workerDeploymentRefs[row.id] ?? [];
  const all = records.deployments.filter(item => !item.retiredAt && refs.includes(item.id) && item.clusterId === row.clusterId);
  const rows = all.filter(item => (!state || item.status === state) && item.name.toLowerCase().includes(query.trim().toLowerCase()));
  return <div className="admin-page-stack">
    <Space wrap><Input aria-label="搜索模型实例" placeholder="搜索模型实例" value={query} onChange={setQuery} showClear/>
      <Select aria-label="实例状态" placeholder="全部状态" value={state || undefined} showClear onChange={value => setState(value || '')}
        optionList={[...new Set(all.map(item => item.status))].map(value => ({ value, label: value }))}/></Space>
    <Table rowKey="id" dataSource={rows} pagination={rows.length > 10 ? { pageSize: 10 } : false} empty="暂无关联模型实例" columns={[
      { title: '部署名称', dataIndex: 'name', render: (value, item) => <Button theme="borderless" size="small" onClick={() => navigate(`deployments?deployment=${encodeURIComponent(item.id)}`)}>{value}</Button> },
      { title: '状态', dataIndex: 'status', render: value => <AdminStatus value={value}/> },
      { title: 'GPU / 副本', dataIndex: 'gpuPerReplica' },
    ]}/>
  </div>;
}

function WorkerSSH({ row }) {
  const endpoint = row.sshEndpoint;
  const download = () => {
    const blob = new Blob(['GPUStack 模拟 SSH 下载\n此文件是流程演示，不包含私钥。\n'], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `${row.name}-ssh-demo.txt`;
    link.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    Toast.success('已下载演示文件');
  };
  return <div className="admin-page-stack">
    <Descriptions data={[
      { key: '主机', value: endpoint?.host || '待分配' }, { key: '端口', value: endpoint?.port || '待分配' },
      { key: '登录用户', value: endpoint?.user || '待分配' }, { key: '私钥', value: <Button onClick={download}>下载演示文件</Button> },
    ]}/>
    {endpoint && <CodePreview text={`ssh -i '<本地私钥文件>' -p ${endpoint.port} ${endpoint.user}@${endpoint.host}`}/>}
  </div>;
}

function NodeDetails({ row, records, navigate, detail, panel }) {
  const selectedPanel = panel ?? detail?.panel;
  if (selectedPanel === 'metrics') return <ResourceMetrics rows={[row]} title="节点资源使用率" groupName={row.name}/>;
  if (selectedPanel === 'ssh') return <WorkerSSH row={row}/>;
  const cluster = records.clusters?.find(item => item.id === row.clusterId);
  const gpus = records['ops-gpus'].filter(item => item.nodeId === row.id);
  const fields = [
    { key: '所属集群', value: cluster ? <Button theme="borderless" size="small" onClick={() => navigate(`clusters?view=detail&record=${encodeURIComponent(cluster.id)}`)}>{cluster.name}</Button> : '—' },
    { key: '状态', value: <AdminStatus value={row.status} label={row.status}/> }, { key: '节点 IP', value: row.ip },
    { key: '标签', value: row.labels }, { key: '节点版本', value: row.version || '—' },
    { key: '操作系统', value: row.os || '—' }, { key: 'CPU 核数', value: row.cpuCores ?? '—' },
    { key: '内存', value: row.memoryGiB == null ? '—' : `${row.memoryGiB} GiB` },
    { key: 'KV 传输网卡', value: row.kvTransferNic || '—' }, { key: '维护说明', value: row.maintenanceRemark || '—' },
  ];
  return <Tabs defaultActiveKey="models">
    <Tabs.TabPane tab="模型实例" itemKey="models"><WorkerDeploymentList row={row} records={records} navigate={navigate}/></Tabs.TabPane>
    <Tabs.TabPane tab="基本信息" itemKey="basic"><Descriptions data={fields}/></Tabs.TabPane>
    <Tabs.TabPane tab="GPU" itemKey="gpu"><div className="admin-page-stack">
      <Table rowKey="id" dataSource={gpus} pagination={false} empty="暂无 GPU 设备" columns={[
        { title: '设备', dataIndex: 'name' }, { title: '编号', dataIndex: 'index' }, { title: '显存 (GiB)', dataIndex: 'vram' },
      ]}/>
      <Space><Button onClick={() => navigate(`ops-gpus?nodeId=${encodeURIComponent(row.id)}`)}>查看 GPU 列表</Button></Space>
    </div></Tabs.TabPane>
  </Tabs>;
}

function GPUDetails({ row, records, navigate }) {
  const worker = records['ops-nodes'].find(item => item.id === row.nodeId);
  const cluster = records.clusters?.find(item => item.id === row.clusterId);
  const specs = [
    ['设备 ID', row.id], ['编号', row.index], ['供应商', row.vendor],
    ['节点', worker && <Button theme="borderless" size="small" onClick={() => navigate(`ops-nodes?view=detail&record=${encodeURIComponent(worker.id)}`)}>{worker.name}</Button>],
    ['集群', cluster && <Button theme="borderless" size="small" onClick={() => navigate(`clusters?view=detail&record=${encodeURIComponent(cluster.id)}`)}>{cluster.name}</Button>],
    ['驱动', row.driver], ['运行时', row.runtime], ['总显存 (GiB)', row.vram], ['已用显存 (GiB)', row.vramUsed],
    ['已分配显存 (GiB)', row.vramAllocated], ['核心使用率', row.utilization != null ? `${row.utilization}%` : null],
    ['温度', row.temperature != null ? `${row.temperature} °C` : null], ['功耗', row.power != null ? `${row.power} / ${row.powerLimit} W` : null],
  ];
  return <Descriptions data={specs.map(([key, value]) => ({ key, value: value ?? '—' }))}/>;
}

function LabelFilterCell({ row, setFilter }) {
  const labels = labelList(row.labels);
  const choose = label => setFilter('labels', previous => [...new Set([...(Array.isArray(previous) ? previous : previous ? [previous] : []), label])]);
  if (!labels.length) return '—';
  return <Space wrap spacing={4}>
    <Button size="small" theme="light" onClick={() => choose(labels[0])} aria-label={`按 ${labels[0]} 筛选`}>{labels[0]}</Button>
    {labels.length > 1 && <Popover trigger="click" position="bottomLeft" content={<div style={{ padding: 12 }}>
      <Space vertical align="start">{labels.slice(1).map(label => <Button key={label} size="small" theme="light" onClick={() => choose(label)}>{label}</Button>)}</Space>
    </div>}><Button size="small" theme="borderless" aria-label="更多节点标签">+{labels.length - 1}</Button></Popover>}
  </Space>;
}

const gib = value => value == null ? '—' : `${value} GiB`;

function VramDetailCell({ row }) {
  return <Popover trigger="click" position="bottomLeft" content={<div style={{ padding: 12 }}>
    <Descriptions data={[
      { key: '总显存', value: gib(row.vram) }, { key: '已用显存', value: gib(row.vramUsed) }, { key: '已分配显存', value: gib(row.vramAllocated) },
    ]}/>
  </div>}><Button theme="borderless" size="small" aria-label={`查看设备 ${row.index} 显存明细`}>
    {gib(row.vramUsed)} / {gib(row.vram)}
  </Button></Popover>;
}

export const RESOURCE_VIEWS = {
  'ops-nodes': { Header: NodeRegistrationHeader, Detail: NodeDetails, Extra: NodeBatchLabels, Cells: { labels: LabelFilterCell } },
  'ops-gpus': { Detail: GPUDetails, Cells: { vramUsed: VramDetailCell } },
};
