import { useEffect, useId, useRef, useState } from 'react';
import { Banner, Button, Card, Descriptions, Input, Popover, Select, Space, Table, Tabs, Tag, Toast, Typography } from '@douyinfe/semi-ui';
import { IconChevronDown, IconChevronRight, IconDelete, IconPlus } from '@douyinfe/semi-icons';
import AdminStatus from './AdminStatus';
import { AdminModal } from './AdminOverlay';
import { ClusterRegistration, CodePreview, ResourceField, ResourceMetrics, VramDetailCell, WorkerLabelFilterCell } from './ClusterResourcePanels';
import { DeploymentLogPanel } from './DeploymentOperationsUI';
import { formatMonitoringTime, MonitoringRangeSummary, MonitoringTimeRange, useMonitoringScope } from './MonitoringTimeRange';
import { deviceDeployments, gpuMemoryUtilization, groupResourceModels, hostMemoryUsed, labelIssue, labelList, labelMap, labelPairIssues, labelPairs, normalizedLabelPairs,
  resourceLoad, resourceMetricHistory, resourceObservations, resourceScopeFromParams, workerDeployments, workerGpuInventory } from './ops-resources';
import { finishClusterRegistration } from './ops-cluster-domain';
import { deploymentInstances, instanceFilterStates } from './deployments';
import { TimeSeriesChart } from '../components/AnalyticsCharts';
import './semi-inference.css';

export function NodeRegistrationHeader({ records, openEditor, navigate, params, dispatch, inferenceDemo }) {
  const [active, setActive] = useState(false);
  const [metrics, setMetrics] = useState(false);
  const [retrying, setRetrying] = useState('');
  const clusters = records.clusters?.filter(row => row.status === '运行中' && (!row.provider || row.provider === 'Docker')) ?? [];
  const fixed = clusters.find(row => row.id === params.get('clusterId'));
  const recovery = (records.clusters ?? []).flatMap(cluster => {
    if (cluster.status !== '待注册') return [];
    const row = records['ops-nodes'].find(item => item.clusterId === cluster.id);
    return row ? [{ cluster, row }] : [];
  });
  const retry = async row => {
    if (retrying) return;
    setRetrying(row.id);
    try {
      if (await finishClusterRegistration({ row, records, dispatch })) Toast.success('集群已完成注册');
    } catch (issue) { Toast.error(issue.message || '节点已保存，集群状态仍待确认。'); }
    finally { setRetrying(''); }
  };
  return <>
    <Space wrap><Button onClick={() => setMetrics(true)}>监控</Button>
      {!inferenceDemo && <Button theme="solid" icon={<IconPlus aria-hidden="true"/>} onClick={() => clusters.length ? setActive(true) : navigate?.('clusters')}>添加节点</Button>}
      {dispatch && recovery.map(({ cluster, row }) => <Button key={cluster.id} loading={retrying === row.id} disabled={Boolean(retrying) && retrying !== row.id}
        onClick={() => retry(row)}>完成 {cluster.name} 的注册</Button>)}</Space>
    {active && <ClusterRegistration cluster={fixed} clusters={clusters} onClose={() => setActive(false)}
      onFinish={(cluster, values) => { setActive(false); openEditor({ preset: { ...values, clusterId: cluster.id }, title: '登记演示节点' }); }}/>}
    {metrics && <AdminModal visible title="节点监控" width="min(850px, calc(100vw - 24px))" footer={null} closeOnEsc onCancel={() => setMetrics(false)}>
      <ResourceMetrics rows={records['ops-nodes']} devices={records['ops-gpus']} title="节点资源使用率" onClose={() => setMetrics(false)}/>
    </AdminModal>}
  </>;
}

export function LabelPairsEditor({ id, value, onChange, disabled, submitted = false, validatePairs = labelPairIssues, 'aria-labelledby': labelledBy }) {
  const fallbackId = useId();
  const groupId = id || fallbackId;
  const [rows, setRows] = useState(() => labelPairs(value).map(([key, text], index) => ({ id: index, key, text })));
  const nextId = useRef(rows.length);
  const [touched, setTouched] = useState({});
  const [newRow, setNewRow] = useState(null);
  const issues = validatePairs(rows.map(({ key, text }) => [key, text]));
  const change = next => {
    setRows(next);
    onChange(next.map(({ key, text }) => [key, text]));
  };
  const add = () => {
    const rowId = nextId.current++;
    setNewRow(rowId);
    change([...rows, { id: rowId, key: '', text: '' }]);
  };
  return <div id={groupId} role="group" aria-labelledby={labelledBy} className="admin-node-label-editor">
    {rows.map((row, index) => <div key={row.id} className="admin-node-label-pair">
      {[['key', '标签键'], ['text', '标签值']].map(([field, name]) => {
        const inputId = `${groupId}-${row.id}-${field}`;
        const issue = (submitted || touched[inputId]) && issues[index][field];
        return <div key={field} className="admin-node-label-field">
          <Input id={inputId} aria-label={`第 ${index + 1} 项${name}`} aria-invalid={issue ? true : undefined}
            aria-describedby={issue ? `${inputId}-error` : undefined} validateStatus={issue ? 'error' : 'default'}
            placeholder={name} value={row[field]} disabled={disabled} spellCheck={false} autoComplete="off"
            autoFocus={field === 'key' && row.id === newRow}
            onBlur={() => setTouched(current => ({ ...current, [inputId]: true }))}
            onChange={next => change(rows.map(item => item.id === row.id ? { ...item, [field]: next } : item))}/>
          {issue && <Typography.Text id={`${inputId}-error`} type="danger" size="small" aria-live="polite">{issue}</Typography.Text>}
        </div>;
      })}
      <Button htmlType="button" theme="borderless" type="danger" icon={<IconDelete aria-hidden="true"/>}
        aria-label={`删除第 ${index + 1} 项标签`} disabled={disabled} onClick={() => change(rows.filter(item => item.id !== row.id))}/>
    </div>)}
    <Button htmlType="button" theme="light" icon={<IconPlus aria-hidden="true"/>} disabled={disabled} onClick={add}>添加标签</Button>
  </div>;
}

function NodeBatchLabels({ selectedRows, commit, clearSelection }) {
  const [visible, setVisible] = useState(false);
  const [draft, setDraft] = useState([]);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [targetIds, setTargetIds] = useState([]);
  const [submitted, setSubmitted] = useState(false);
  const save = async () => {
    if (busy) return;
    setSubmitted(true);
    const issue = !draft.length ? '请填写至少一项标签。' : labelIssue(draft);
    if (issue) { setError(issue); return; }
    setBusy(true);
    try {
      const changes = normalizedLabelPairs(draft);
      await commit(latest => {
        if (latest.filter(row => targetIds.includes(row.id)).length !== targetIds.length) throw Error('所选节点已变化，请重新选择。');
        return latest.map(row => targetIds.includes(row.id)
          ? { ...row, labels: Object.fromEntries([...labelMap(row.labels), ...changes]) }
          : row);
      }, '节点标签已更新');
      setVisible(false);
      clearSelection();
    } catch (issue) { setError(issue.message); }
    finally { setBusy(false); }
  };
  return <>
    {selectedRows.length > 0 && <Button onClick={() => {
      setDraft([]); setError(''); setSubmitted(false); setTargetIds(selectedRows.map(row => row.id)); setVisible(true);
    }}>批量更新标签</Button>}
    {visible && <AdminModal visible title={`批量更新 ${targetIds.length} 个节点的标签`} onOk={save} confirmLoading={busy}
      okText="更新标签" okButtonProps={{ disabled: !draft.length }} onCancel={() => !busy && setVisible(false)}>
      <div className="admin-page-stack">
        <ResourceField label="标签">{id => <LabelPairsEditor aria-labelledby={id} value={draft} disabled={busy} submitted={submitted}
          onChange={next => { setDraft(next); setError(''); }}/>}</ResourceField>
        <Typography.Text type="secondary" size="small">已存在的同名标签将更新，其余标签保留。</Typography.Text>
        {error && <Banner type="danger" closeIcon={null} description={error}/>}
      </div>
    </AdminModal>}
  </>;
}

const instanceLabels = Object.fromEntries(instanceFilterStates);
const instanceColors = { running: 'green', error: 'red', starting: 'orange' };
const instanceRoles = { prefill: '预填充 (Prefill)', decode: '解码 (Decode)', router: '路由 (Router)' };

function resourceInstances(all, records, row, device = false) {
  return deploymentInstances(all, records).filter(instance => device
    ? instance.devices?.some(entry => entry.id === row.id) : instance.workerId === row.id);
}

function ResourceInstances({ instances, records, navigate, scope, device = false, compact = false }) {
  const statusId = useId();
  const [query, setQuery] = useState('');
  const [state, setState] = useState('');
  const [collapsed, setCollapsed] = useState([]);
  const [logId, setLogId] = useState(null);
  const groups = groupResourceModels(instances, records, { query, state });
  const rows = groups.flatMap(group => [
    ...(compact ? [] : [{ id: group.id, group }]),
    ...(collapsed.includes(group.id) ? [] : group.instances.map(instance => ({ id: `instance:${instance.id}`, instance, modelName: group.name }))),
  ]).slice(0, compact ? 5 : undefined);
  const log = instances.find(instance => instance.id === logId);
  const openDeployment = id => navigate(`deployments?deployment=${encodeURIComponent(id)}&tab=instances`);
  const columns = [
    { title: '模型 / 实例', key: 'name', width: 280, render: (_, { group, instance, modelName }) => {
      if (group) {
        const expanded = !collapsed.includes(group.id);
        const deployment = group.instances[0].deployment;
        const oneDeployment = group.instances.every(item => item.deployment.id === deployment.id);
        return <Space wrap>
          <Button size="small" type="tertiary" theme="borderless" aria-label={`${expanded ? '折叠' : '展开'} ${group.name}`}
            aria-expanded={expanded} icon={expanded ? <IconChevronDown aria-hidden="true"/> : <IconChevronRight aria-hidden="true"/>}
            onClick={() => setCollapsed(ids => expanded ? [...ids, group.id] : ids.filter(id => id !== group.id))}/>
          {oneDeployment ? <Button theme="borderless" size="small" onClick={() => openDeployment(deployment.id)}>{group.name}</Button>
            : <Typography.Text strong>{group.name}</Typography.Text>}
          <Typography.Text type="secondary" size="small">{group.instances.length} 个实例</Typography.Text>
        </Space>;
      }
      const backend = [instance.backend, instance.backendVersion].filter(Boolean).join(' · ');
      return <div className={compact ? 'admin-resource-instance-meta' : 'admin-resource-instance-name'}>
        <Typography.Text>{instance.name}</Typography.Text>
        {compact && <Typography.Text type="secondary" size="small">{modelName}</Typography.Text>}
        {backend && <Typography.Text type="tertiary" size="small">{backend}</Typography.Text>}
      </div>;
    } },
    { title: '部署', key: 'deployment', width: 132, render: (_, { instance }) => instance &&
      <Button theme="borderless" size="small" onClick={() => openDeployment(instance.deployment.id)}>{instance.deployment.name}</Button> },
    { title: '状态', key: 'state', width: 134, render: (_, { instance }) => instance &&
      <div className="admin-resource-instance-meta">
        <AdminStatus value={instance.state} label={instanceLabels[instance.state] || '未知'} color={instanceColors[instance.state] || 'grey'}/>
        {instance.statusMessage && <Typography.Text type="secondary" size="small">{instance.statusMessage}</Typography.Text>}
      </div> },
    { title: '角色', key: 'role', width: 128, render: (_, { instance }) => instance && (instanceRoles[instance.role] || '推理') },
    ...(!device ? [{ title: 'GPU 设备', key: 'devices', width: 150, render: (_, { instance }) => instance &&
      (instance.devices.length ? <Space wrap>{instance.devices.map(gpu => <Button key={gpu.id} theme="borderless" size="small"
        onClick={() => navigate(deviceRoute(gpu, undefined, scope))}>{gpu.name} · {gpu.index}</Button>)}</Space> : '—') }] : []),
    { title: '操作', key: 'actions', width: 96, render: (_, { instance }) => instance &&
      <Button theme="borderless" size="small" aria-label={`查看 ${instance.name} 的日志`} onClick={() => setLogId(instance.id)}>查看日志</Button> },
  ];
  return <div className="admin-page-stack">
    {!compact && <Space wrap><Input aria-label="搜索模型实例" placeholder="搜索模型实例" value={query} onChange={value => { setQuery(value); setCollapsed([]); }} showClear/>
      <Select insetLabel="实例状态" insetLabelId={statusId} aria-labelledby={statusId} placeholder="全部状态" value={state || undefined} showClear onChange={value => setState(value || '')}
        optionList={instanceFilterStates.map(([value, label]) => ({ value, label }))}/>
      <Typography.Text type="secondary" aria-live="polite">{groups.length} 个模型，{groups.reduce((count, group) => count + group.instances.length, 0)} 个实例</Typography.Text>
    </Space>}
    <div className="admin-resource-instance-table" role="region" aria-label="关联模型与实例表" tabIndex={0}>
      <Table style={{ minWidth: device ? 770 : 920 }} rowKey="id" dataSource={rows} pagination={false}
        empty={query.trim() || state ? '暂无匹配模型实例' : '暂无关联模型实例'} columns={columns}
        onRow={row => row.group ? { className: 'admin-resource-model-group' } : {}}/>
    </div>
    {log && <DeploymentLogPanel key={log.id} row={log} close={() => setLogId(null)}/>}
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

const gib = value => value == null ? '—' : `${value} GiB`;
const pct = value => value == null ? '—' : `${value}%`;
const quantity = (value, unit) => value == null ? '—' : `${value} ${unit}`;
const capacity = (used, total) => used == null && total == null ? '—' : `${gib(used)} / ${gib(total)}`;
const dateFormat = new Intl.DateTimeFormat('zh-CN', { timeZone: 'Asia/Shanghai', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hour12: false });
const sampleDate = value => value && Number.isFinite(Date.parse(value)) ? dateFormat.format(new Date(value)) : '—';
const resourceRoute = (page, row, tab, scope) => `${page}?${new URLSearchParams({
  view: 'detail', record: row.id, ...(tab && { tab }),
  ...(scope?.range ? { monitorStart: scope.start, monitorEnd: scope.end }
    : scope ? { monitorPeriod: scope.period } : {}),
})}`;
const deviceRoute = (row, tab, scope) => resourceRoute('ops-gpus', row, tab, scope);
const detailTab = (params, fallback = 'overview') => {
  const tab = params?.get('tab');
  return ['overview', 'monitoring', 'instances', 'configuration'].includes(tab) ? tab : fallback;
};

function useResourceDetailScope(params, refresh) {
  const scope = useMonitoringScope(refresh);
  const initialized = useRef(false);
  useEffect(() => {
    if (initialized.current) return;
    initialized.current = true;
    const { range, period } = resourceScopeFromParams(params);
    if (range) scope.setRange(range);
    else if (period) scope.choosePeriod(period);
  }, [params, scope]);
  return scope;
}

const gpuCharts = [['核心使用率', '%', 'utilization'], ['显存实际使用', 'GiB', 'vramUsed', 'vram'], ['功耗', 'W', 'power'], ['温度', '°C', 'temperature']];
const hostCharts = [['CPU 使用率', '%', 'cpu'], ['主机内存', 'GiB', 'memoryUsedGiB', 'memoryGiB']];
const storageCharts = [['文件系统使用量', 'GiB', 'diskUsedGiB', 'diskGiB']];

function scopedResourceMetrics(row, isGpu, devices, { start, end }) {
  const gpuSources = (isGpu ? [row] : devices).map(item => ({
    label: isGpu ? item.name : `GPU ${item.index}`, samples: resourceMetricHistory(item, true),
  }));
  const workerSource = isGpu ? [] : [{ label: '节点', samples: resourceMetricHistory(row) }];
  const scoped = resourceObservations([...workerSource, ...gpuSources], start, end);
  return { ...scoped, worker: scoped.sources.slice(0, workerSource.length), gpus: scoped.sources.slice(workerSource.length) };
}

function ResourceMetricCards({ entries }) {
  return <div className="infra-card-grid">{entries.map(([sources, [title, unit, key, totalKey]]) => {
    const times = [...new Set(sources.flatMap(item => [...item.samples.keys()]))].sort((left, right) => left - right);
    const series = sources.flatMap(({ label, samples }) => [
      { label, values: times.map(at => samples.get(at)?.[key] ?? null) },
      ...(totalKey ? [{ label: `${label}总量`, values: times.map(at => samples.get(at)?.[totalKey] ?? null) }] : []),
    ]).filter(item => item.values.some(Number.isFinite));
    return <Card key={key} title={title}>
      {series.length ? <TimeSeriesChart labels={times.map(formatMonitoringTime)} series={series}
        label={title} unit={unit} type={times.length === 1 ? 'bar' : 'line'} height={175}/>
        : <Typography.Text type="secondary">未采集</Typography.Text>}
    </Card>;
  })}</div>;
}

function ResourceOverviewTrends({ row, device, devices = [], scope, openMonitoring }) {
  const { worker, gpus, latest } = scopedResourceMetrics(row, device, devices, scope);
  const entries = device ? gpuCharts.slice(0, 2).map(chart => [gpus, chart])
    : [[worker, hostCharts[0]], gpus.length ? [gpus, gpuCharts[0]] : [worker, hostCharts[1]]];
  return <section className="admin-page-stack" aria-label="资源趋势">
    <div className="admin-resource-section-heading">
      <Typography.Title heading={5}>资源趋势</Typography.Title>
      <Button theme="borderless" onClick={openMonitoring}>查看监控</Button>
    </div>
    <MonitoringRangeSummary range={scope.range}/>
    <Typography.Text type="secondary">{latest == null ? '所选时间范围内暂无采样数据' : `历史演示采样 · ${formatMonitoringTime(latest)}`}</Typography.Text>
    <ResourceMetricCards entries={entries}/>
  </section>;
}

function DeviceMetrics({ row, device, devices = [], scope }) {
  const controlId = useId();
  const { range, refreshState, reload } = scope;
  const [selectedDevice, setSelectedDevice] = useState('');
  const showDevice = devices.some(item => item.id === selectedDevice) ? selectedDevice : '';
  const selectedGpus = devices.filter(item => !showDevice || item.id === showDevice);
  const { latest, sampleStep, irregular, worker, gpus } = scopedResourceMetrics(row, device, selectedGpus, scope);
  const groups = [
    ...(!device ? [{ title: '主机监控', sources: worker, charts: hostCharts }] : []),
    ...(gpus.length ? [{ title: 'GPU 监控', sources: gpus, charts: gpuCharts }] : []),
    ...(!device ? [{ title: '存储监控', sources: worker, charts: storageCharts }] : []),
  ];
  return <div className="admin-page-stack">
    <Space wrap>
      <MonitoringTimeRange scope={scope}/>
      {!device && devices.length > 0 && <Select insetLabel="GPU 设备" insetLabelId={`${controlId}-device`} aria-labelledby={`${controlId}-device`} value={showDevice} onChange={setSelectedDevice}
        optionList={[{ value: '', label: '全部 GPU' }, ...devices.map(item => ({ value: item.id, label: `GPU ${item.index} · ${item.name}` }))]}/>}
      <Button onClick={reload} loading={refreshState.loading}>刷新</Button>
    </Space>
    <MonitoringRangeSummary range={range}/>
    <div aria-live="polite"><Space wrap>
      <Typography.Text type="secondary">{latest == null ? '所选时间范围内暂无采样数据' : `演示采样更新于 ${formatMonitoringTime(latest)}`}</Typography.Text>
      {latest != null && <Typography.Text type="secondary">采样步长 {sampleStep == null ? (irregular ? '不固定' : '未采集') : `${sampleStep / 1000} 秒`}</Typography.Text>}
      {refreshState.lastSuccess != null && <Typography.Text type="secondary">上次刷新 {formatMonitoringTime(refreshState.lastSuccess)}</Typography.Text>}
    </Space></div>
    {refreshState.error && <Banner type="danger" closeIcon={null} description="刷新失败，已保留上次读取的采样。"/>}
    {groups.map(group => <section key={group.title} aria-label={group.title} className="admin-page-stack">
      <Typography.Title heading={5}>{group.title}</Typography.Title>
      <ResourceMetricCards entries={group.charts.map(chart => [group.sources, chart])}/>
    </section>)}
  </div>;
}

function NodeDetails({ row, records, navigate, detail, panel, params, refresh, openEditor, busy, inferenceDemo }) {
  const selectedPanel = panel ?? detail?.panel;
  const scope = useResourceDetailScope(params, refresh);
  const [tab, setTab] = useState(() => detailTab(params, selectedPanel === 'metrics' ? 'monitoring' : 'overview'));
  const [showSsh, setShowSsh] = useState(false);
  if (selectedPanel === 'ssh') return <WorkerSSH row={row}/>;
  const cluster = records.clusters?.find(item => item.id === row.clusterId);
  const gpus = workerGpuInventory(row, records['ops-gpus']);
  const instances = resourceInstances(workerDeployments(row, records), records, row);
  const labels = labelList(row.labels);
  const gpuCount = row.gpuCount ?? (gpus.length || '—');
  const canEdit = ['平台管理员', '运维人员'].includes(records.actorRole);
  const status = <div className="admin-resource-instance-meta">
    <AdminStatus value={row.status}/>{row.statusMessage && <Typography.Text type="secondary">{row.statusMessage}</Typography.Text>}
  </div>;
  const basic = [
    { key: '节点名称', value: row.name },
    { key: '所属集群', value: cluster ? <Button theme="borderless" size="small" onClick={() => navigate(`clusters?view=detail&record=${encodeURIComponent(cluster.id)}`)}>{cluster.name}</Button> : '—' },
    { key: '状态', value: status }, { key: '节点 IP', value: row.ip || '—' },
    ...(row.externalIp ? [{ key: '外部地址', value: row.externalIp }] : []),
    { key: '节点版本', value: row.version || '—' }, { key: '操作系统', value: row.os || '—' },
    { key: '内核版本', value: row.kernelRelease || '—' }, { key: '架构', value: row.architecture || '—' },
    { key: '运行时长', value: row.uptimeSeconds == null ? '—' : `${Math.floor(row.uptimeSeconds / 3600)} 小时` },
  ];
  const hardware = [
    { key: 'CPU 核数', value: row.cpuCores ?? '—' }, { key: '内存', value: gib(row.memoryGiB) },
    { key: 'GPU 数量', value: gpuCount }, { key: '系统保留内存', value: gib(row.reservedRamGiB) },
    { key: '系统保留显存', value: gib(row.reservedVramGiB) }, { key: '维护模式', value: row.status === '维护中' ? '已开启' : '已关闭' },
    { key: 'KV 传输网卡', value: row.kvTransferNic || '—' }, { key: '维护说明', value: row.maintenanceRemark || '—' },
  ];
  return <div className="admin-page-stack">
    {canEdit && !inferenceDemo && <Space wrap>
      <Button disabled={busy} onClick={() => openEditor({ row })}>编辑节点</Button>
      {row.sshConfigured && <Button onClick={() => setShowSsh(true)}>查看 SSH 访问</Button>}
    </Space>}
    <Tabs activeKey={tab} onChange={setTab}>
    <Tabs.TabPane tab="概览" itemKey="overview"><div className="admin-page-stack">
      <Space><Typography.Text type="secondary">当前资源</Typography.Text><Button size="small" onClick={refresh}>刷新</Button></Space>
      <Descriptions data={[
        { key: '状态', value: status }, { key: 'CPU 使用率', value: pct(row.cpu) },
        { key: '主机内存已用 / 总量', value: capacity(hostMemoryUsed(row), row.memoryGiB) },
        { key: '磁盘已用 / 总量', value: capacity(row.diskUsedGiB, row.diskGiB) },
        { key: 'GPU 数量', value: gpuCount }, { key: '最近心跳', value: sampleDate(row.heartbeat) },
        { key: '关联实例', value: <Button theme="borderless" size="small"
          onClick={() => setTab('instances')}>{instances.length}</Button> },
      ]}/>
      <Typography.Title heading={5}>GPU 资源</Typography.Title>
      <Table rowKey="id" dataSource={gpus} pagination={false}
        empty={row.gpuCount === 0 ? '节点报告无 GPU 设备' : '暂无可识别的 GPU 设备'} scroll={{ x: 870 }} columns={[
        { title: '设备', dataIndex: 'name', render: (value, device) => <Button theme="borderless" size="small" onClick={() => navigate(deviceRoute(device, undefined, scope))}>{value}</Button> },
        { title: '编号', dataIndex: 'index' },
        { title: '关联实例', key: 'related', render: (_, device) => <Button theme="borderless" size="small"
          aria-label={`查看 GPU ${device.index} 的模型与实例`} onClick={() => navigate(deviceRoute(device, 'instances', scope))}>
          {resourceInstances(deviceDeployments(device, records), records, device, true).length} 个实例
        </Button> },
        { title: '核心使用率', dataIndex: 'utilization', render: pct },
        { title: '显存已用 / 总量', key: 'vram', render: (_, device) => capacity(device.vramUsed, device.vram) },
        { title: '已分配显存', dataIndex: 'vramAllocated', render: gib },
        { title: '功耗', dataIndex: 'power', render: value => quantity(value, 'W') },
        { title: '温度', dataIndex: 'temperature', render: value => quantity(value, '°C') },
        { title: '操作', key: 'actions', render: (_, device) =>
          <Button theme="borderless" size="small" onClick={() => navigate(deviceRoute(device, 'monitoring', scope))}>监控</Button> },
      ]}/>
      <Space><Button onClick={() => navigate(`ops-gpus?nodeId=${encodeURIComponent(row.id)}`)}>查看 GPU 列表</Button></Space>
      <ResourceOverviewTrends row={row} devices={gpus} scope={scope} openMonitoring={() => setTab('monitoring')}/>
    </div></Tabs.TabPane>
    <Tabs.TabPane tab="监控" itemKey="monitoring"><DeviceMetrics row={row} devices={gpus} scope={scope}/></Tabs.TabPane>
    <Tabs.TabPane tab="模型与实例" itemKey="instances"><ResourceInstances instances={instances} records={records} navigate={navigate} scope={scope}/></Tabs.TabPane>
    <Tabs.TabPane tab="配置" itemKey="configuration"><div className="admin-cluster-grid">
      <Card title="基本信息"><Descriptions data={basic}/></Card><Card title="硬件"><Descriptions data={hardware}/></Card>
    <Card title="标签"><Space wrap>{labels.length ? [...new Set(labels)].map(label => <Tag key={label}>{label}</Tag>) : '—'}</Space></Card>
    </div></Tabs.TabPane>
    </Tabs>
    {showSsh && <AdminModal visible title="查看 SSH 访问" footer={null} closeOnEsc onCancel={() => setShowSsh(false)}><WorkerSSH row={row}/></AdminModal>}
  </div>;
}

function GPUDetails({ row, records, navigate, params, refresh }) {
  const switchId = useId();
  const worker = records['ops-nodes'].find(item => item.id === row.nodeId && item.clusterId === row.clusterId);
  const cluster = records.clusters?.find(item => item.id === row.clusterId);
  const instances = resourceInstances(deviceDeployments(row, records), records, row, true);
  const scope = useResourceDetailScope(params, refresh);
  const [tab, setTab] = useState(() => detailTab(params));
  const siblings = worker ? workerGpuInventory(worker, records['ops-gpus']) : [];
  const openWorker = () => navigate(resourceRoute('ops-nodes', worker, undefined, scope));
  const workerLink = worker && <Button theme="borderless" size="small" onClick={openWorker}>{worker.name}</Button>;
  const clusterLink = cluster && <Button theme="borderless" size="small" onClick={() => navigate(resourceRoute('clusters', cluster))}>{cluster.name}</Button>;
  const runtimeMatch = row.runtime?.match(/^(.+?)\s+(v?\d[^\s]*)$/);
  const specs = [
    ['设备名称', row.name], ['设备 ID', row.id], ['编号', row.index], ['供应商', row.vendor], ['UUID', row.uuid],
    ['节点', workerLink], ['集群', clusterLink], ['驱动版本', row.driver],
    ['运行时', row.type || runtimeMatch?.[1] || row.runtime], ['运行时版本', row.runtimeVersion || runtimeMatch?.[2]], ['物理显存', gib(row.vram)],
  ];
  const summary = [
    ['状态', <AdminStatus value={row.status}/>], ['核心使用率', pct(row.utilization)], ['显存利用率', pct(resourceLoad([], [row]).vram)],
    ['显存已用 / 总量', capacity(row.vramUsed, row.vram)], ['功耗', quantity(row.power, 'W')],
    ['温度', quantity(row.temperature, '°C')], ['节点', workerLink], ['GPU UUID', row.uuid], ['已分配显存', gib(row.vramAllocated)],
    ['关联实例', <Button theme="borderless" size="small" onClick={() => setTab('instances')}>{instances.length}</Button>],
    ['最近采样', sampleDate(row.sampledAt)],
  ];
  const descriptions = values => <Descriptions data={values.map(([key, value]) => ({ key, value: value == null || value === '' ? '—' : value }))}/>;
  return <div className="admin-page-stack">
    {(worker || siblings.length > 1) && <Space wrap>
      {siblings.length > 1 && <Select insetLabel="切换 GPU" insetLabelId={switchId} aria-labelledby={switchId} value={row.id} filter
        optionList={siblings.map(gpu => ({ value: gpu.id, label: `GPU ${gpu.index} · ${gpu.name}` }))}
        onChange={id => {
          const selected = siblings.find(gpu => gpu.id === id);
          if (selected && selected.id !== row.id) navigate(deviceRoute(selected, tab, scope));
        }}/>}
      {worker && <Button onClick={openWorker}>查看节点</Button>}
    </Space>}
    <Tabs activeKey={tab} onChange={setTab}>
    <Tabs.TabPane tab="概览" itemKey="overview"><div className="admin-page-stack">
      <Space><Typography.Text type="secondary">当前资源</Typography.Text><Button size="small" onClick={refresh}>刷新</Button></Space>
      {descriptions(summary)}
      <ResourceOverviewTrends row={row} device scope={scope} openMonitoring={() => setTab('monitoring')}/>
      <section className="admin-page-stack" aria-label="关联实例预览">
        <div className="admin-resource-section-heading">
          <Typography.Title heading={5}>关联实例</Typography.Title>
          <Button theme="borderless" onClick={() => setTab('instances')}>查看全部实例</Button>
        </div>
        <ResourceInstances instances={instances} records={records} navigate={navigate} scope={scope} device compact/>
      </section>
    </div></Tabs.TabPane>
    <Tabs.TabPane tab="监控" itemKey="monitoring"><DeviceMetrics row={row} device scope={scope}/></Tabs.TabPane>
    <Tabs.TabPane tab="模型与实例" itemKey="instances"><ResourceInstances instances={instances} records={records} navigate={navigate} scope={scope} device/></Tabs.TabPane>
    <Tabs.TabPane tab="硬件" itemKey="configuration">{descriptions(specs)}</Tabs.TabPane>
    </Tabs>
  </div>;
}

function LabelFilterCell({ row, setFilter }) {
  const choose = label => setFilter('labels', previous => [...new Set([...(Array.isArray(previous) ? previous : previous ? [previous] : []), label])]);
  return <WorkerLabelFilterCell labels={row.labels} onChoose={choose}/>;
}

function WorkerDeviceCell({ row, records, openDetail }) {
  const devices = records['ops-gpus'].filter(device => device.clusterId === row.clusterId && device.nodeId === row.id);
  if (!devices.length) return row.gpuCount == null ? '—' : `${row.gpuCount} 张`;
  const labels = [...new Set(devices.map(device => device.name))].join(' / ');
  return <Popover trigger="click" position="bottomLeft" content={<div style={{ padding: 12 }}>
    <Descriptions data={devices.map(device => ({ key: `GPU ${device.index}`, value: `${device.name} · ${pct(device.utilization)}` }))}/>
    <Button theme="borderless" size="small" onClick={() => openDetail(row)}>节点详情</Button>
  </div>}><Button theme="borderless" size="small">{devices.length} 张 · {labels}</Button></Popover>;
}

function WorkerIPCell({ row }) {
  if (!row.ip || !row.externalIp || row.ip === row.externalIp) return row.ip || row.externalIp || '—';
  return <Space vertical align="start" spacing={4}>
    <span>{row.ip} <Typography.Text type="secondary" size="small">（内网）</Typography.Text></span>
    <span>{row.externalIp} <Typography.Text type="secondary" size="small">（外网）</Typography.Text></span>
  </Space>;
}

function WorkerCapacityCell({ row, column }) {
  const memory = column.key === 'ram';
  const total = memory ? row.memoryGiB : row.diskGiB;
  const used = memory ? hostMemoryUsed(row) : row.diskUsedGiB;
  const ratio = memory ? row.ram : used != null && total > 0 ? Math.round(100 * used / total) : null;
  const name = memory ? '内存' : '磁盘';
  if (used == null && total == null) return pct(ratio);
  return <Popover trigger="click" position="bottomLeft" content={<div style={{ padding: 12 }}>
    <Descriptions data={[{ key: '总量', value: gib(total) }, { key: '已用', value: gib(used) }]}/>
  </div>}><Button theme="borderless" size="small" aria-label={`查看 ${row.name} 的${name}明细`}>{pct(ratio)}</Button></Popover>;
}

function WorkerVramCell({ row, records }) {
  const devices = records['ops-gpus'].filter(device => device.clusterId === row.clusterId && device.nodeId === row.id)
    .sort((left, right) => left.index - right.index);
  if (!devices.length) return '—';
  return <Popover trigger="click" position="bottomLeft" content={<div style={{ padding: 12 }}>
    <Table size="small" rowKey="id" dataSource={devices} pagination={false} columns={[
      { title: '设备编号', dataIndex: 'index' }, { title: '总显存', dataIndex: 'vram', render: gib },
      { title: '已用显存', dataIndex: 'vramUsed', render: gib }, { title: '已分配显存', dataIndex: 'vramAllocated', render: gib },
      { title: '显存利用率', dataIndex: 'memoryUtilization', render: (_, device) => pct(gpuMemoryUtilization(device)) },
    ]}/>
  </div>}><Button theme="borderless" size="small" aria-label={`查看 ${row.name} 的显存明细`}>{pct(resourceLoad([], devices).vram)}</Button></Popover>;
}

export const RESOURCE_VIEWS = {
  'ops-nodes': { Header: NodeRegistrationHeader, Detail: NodeDetails, Extra: NodeBatchLabels, Fields: { nodeLabelPairs: LabelPairsEditor },
    Cells: { labels: LabelFilterCell, ip: WorkerIPCell, ram: WorkerCapacityCell, diskUsedGiB: WorkerCapacityCell, gpuCount: WorkerDeviceCell, vram: WorkerVramCell },
    async afterCreate(options) {
      try { await finishClusterRegistration(options); }
      catch { throw Error('节点已保存。请在节点页重试完成集群注册。'); }
    } },
  'ops-gpus': { Detail: GPUDetails, Cells: { vramUsed: VramDetailCell } },
};
