import { useId, useState } from 'react';
import { infrastructureStoragePrefix } from '../workspace-storage.mjs';
import { Banner, Button, Checkbox, Input, Popover, Select, Space, Switch, Table, Tabs, Tag, TextArea, Toast, Typography } from './xa24/HaloUI.jsx';
import { Descriptions, Steps, Tree } from './xa24/HaloUI.jsx';
import { AdminModal, AdminSideSheet } from './AdminOverlay';
import { TimeSeriesChart } from '../components/AnalyticsCharts';
import TableFieldHelp from '../components/TableFieldHelp';
import { defaultTopologyLayers, dockerWorkerRegistrationArgs, dockerWorkerRegistrationDefaults, gpuMemoryUtilization, GPU_VENDORS, labelMap, labelPairs, resourceLoad, RESOURCE_PAGES, topologyLabelKeys, topologyLocation, validateTopologyLayers, workerLabelOptions, workerLabelsMatch } from './ops-resources';
import AdminStatus from './AdminStatus';
import AdminActionMenu from './AdminActionMenu';

const { Paragraph, Text } = Typography;
const options = values => values.map(value => ({ value, label: value }));

export function ResourceField({ label, children }) {
  const id = useId();
  return <div className="admin-page-stack" style={{ gap: 4 }}><Text id={id} strong>{label}</Text>{children(id)}</div>;
}

export function CodePreview({ text }) {
  const copy = async () => {
    try { await navigator.clipboard.writeText(text); Toast.success('已复制'); }
    catch { Toast.error('复制失败，请选择文本后复制'); }
  };
  return <div className="admin-page-stack" style={{ gap: 6 }}>
    <Space><Button size="small" onClick={copy}>复制</Button></Space>
    <pre style={{ margin: 0, overflow: 'auto', whiteSpace: 'pre-wrap', overflowWrap: 'anywhere' }}>{text}</pre>
  </div>;
}

const dockerOptions = [
  ['ip', '指定节点 IP'], ['externalIp', '指定节点外部地址'], ['cachePath', '指定缓存目录'],
  ['modelPath', '指定模型目录'], ['kvTransferNic', '指定 KV 传输网卡'],
  ['dataVolume', '指定数据卷'], ['containerName', '指定容器名称'],
];
export function ClusterRegistration({ cluster, clusters, onClose, onFinish, busy, error }) {
  const formId = useId();
  const [choice, setChoice] = useState(cluster?.id || clusters.find(item => item.isDefault)?.id || clusters[0]?.id || '');
  const target = clusters.find(item => item.id === choice);
  const isKubernetes = target?.provider === 'Kubernetes';
  const steps = [...(cluster ? [] : ['选择集群']), isKubernetes ? '选择硬件类型' : '选择 GPU 厂商', '检查环境',
    ...(isKubernetes ? [] : ['指定参数']), '运行指令'];
  const [step, setStep] = useState(0);
  const [vendors, setVendors] = useState([]);
  const [checked, setChecked] = useState(false);
  const [args, setArgs] = useState(dockerWorkerRegistrationDefaults.values);
  const [overrides, setOverrides] = useState(dockerWorkerRegistrationDefaults.overrides);
  const [validation, setValidation] = useState('');
  const [fieldErrors, setFieldErrors] = useState({});
  const active = steps[step];
  const shownOptions = dockerOptions.filter(([key]) => key !== 'kvTransferNic' || vendors.includes('NVIDIA'));
  const { active: argumentsInUse, modelPaths, errors: argumentErrors } = dockerWorkerRegistrationArgs(args, overrides, vendors);
  const { ip, externalIp, cachePath, kvTransferNic, dataVolume, containerName } = isKubernetes ? {} : argumentsInUse;
  const firstArgumentError = Object.keys(argumentErrors).find(key => argumentErrors[key]);
  const validArgs = firstArgumentError ? [] : [
    'docker run', containerName && `--name ${containerName}`, dataVolume && `--volume ${dataVolume}:/var/lib/gpustack`,
    ...modelPaths.map(path => `--volume ${path}:${path}`), cachePath && `--volume ${cachePath}:/var/lib/gpustack/cache`,
    kvTransferNic && `--env 'GPUSTACK_KV_TRANSFER_IFNAME=${kvTransferNic}'`, 'gpustack/gpustack:v2.3.1',
    "--server-url https://gpustack.demo.invalid --token '<注册令牌>'",
    ip && `--worker-ip ${ip}`, externalIp && `--advertise-address ${externalIp}`,
  ].filter(Boolean);
  const clearFieldError = key => setFieldErrors(current => ({ ...current, [key]: '' }));
  const setArg = (key, value) => { clearFieldError(key); setArgs(current => ({ ...current, [key]: value })); };
  const command = isKubernetes
    ? `# 演示注册清单 · 硬件 ${vendors.join(' / ')}\nkubectl apply -f https://gpustack.demo.invalid/manifests/${encodeURIComponent(target?.clusterId || 'cluster')}.yaml`
    : ['# 演示 · 硬件 ' + vendors.join(' / ') + (vendors.includes('Hygon') ? ` · DTK ${args.dtkVersion}` : ''),
        validArgs.join(' \\\n  ')].join('\n');
  const advance = () => {
    if (!target) { setValidation('请选择仍可用的集群。'); return; }
    if (active === '运行指令') return onFinish(target, { ip, externalIp, kvTransferNic, hardware: vendors[0] });
    if (active === '指定参数' && firstArgumentError) {
      setFieldErrors(argumentErrors);
      document.getElementById(`${formId}-${firstArgumentError}`)?.focus();
      return;
    }
    setValidation('');
    setFieldErrors({});
    setStep(value => value + 1);
  };
  const disabled = busy || active === '选择集群' && !target || active.startsWith('选择') && active !== '选择集群' && !vendors.length || active === '检查环境' && !checked;
  return <AdminSideSheet visible title={isKubernetes ? '注册集群' : '添加节点'} width="min(690px, calc(100vw - 24px))" onCancel={onClose}
    closeOnEsc={!busy}
    footer={<Space><Button disabled={busy} onClick={onClose}>取消</Button><Button disabled={!step || busy} onClick={() => setStep(value => value - 1)}>上一步</Button>
      <Button theme="solid" disabled={disabled} loading={busy} onClick={advance}>{active === '运行指令' ? '完成' : '下一步'}</Button></Space>}>
    <div className="admin-page-stack">
      <Steps current={step} type="basic" size="small">{steps.map(title => <Steps.Step key={title} title={title}/>)}</Steps>
      {active === '选择集群' && <ResourceField label="集群">{id => <Select aria-labelledby={id} value={choice}
        optionList={clusters.map(item => ({ value: item.id, label: item.name }))} onChange={value => { setChoice(value); setVendors([]); setChecked(false); }}/>}</ResourceField>}
      {(active === '选择 GPU 厂商' || active === '选择硬件类型') && <ResourceField label={active}>{id =>
        <Select aria-labelledby={id} multiple={isKubernetes} value={isKubernetes ? vendors : vendors[0]}
          optionList={options(GPU_VENDORS)} onChange={value => { setVendors((Array.isArray(value) ? value : [value]).filter(Boolean)); setChecked(false); }}/>}</ResourceField>}
      {active === '检查环境' && <>
        <Paragraph>复制命令可查看所选环境的检查内容。</Paragraph>
        <CodePreview text={isKubernetes ? 'kubectl get nodes -o wide' : 'docker version\n' + (vendors.includes('NVIDIA') ? 'nvidia-smi' : 'uname -m')}/>
        <Space><Button onClick={() => setChecked(true)}>{checked ? '重新检查' : '模拟检查通过'}</Button>{checked && <Text type="success">检查通过</Text>}</Space>
      </>}
      {active === '指定参数' && <>
        {vendors.includes('Hygon') && <ResourceField label="DTK 版本">{id => <Select aria-labelledby={id} value={args.dtkVersion}
          optionList={options(['25.04', '26.04'])} onChange={value => setArg('dtkVersion', value)}/>}</ResourceField>}
        {shownOptions.map(([key, label]) => <ResourceField key={key} label={label}>{id => <Space wrap>
          <Switch aria-labelledby={id} checked={Boolean(overrides[key])} onChange={value => {
            clearFieldError(key); setOverrides(current => ({ ...current, [key]: value }));
          }}/>
          {overrides[key] && <Input id={`${formId}-${key}`} aria-labelledby={id} value={args[key]}
            aria-required="true" aria-invalid={Boolean(fieldErrors[key])} validateStatus={fieldErrors[key] ? 'error' : 'default'}
            aria-describedby={fieldErrors[key] ? `${formId}-${key}-error` : undefined}
            placeholder={key === 'modelPath' ? '多条路径以英文逗号分隔' : undefined} onChange={value => setArg(key, value)}/>}
          {overrides[key] && fieldErrors[key] && <Text type="danger" id={`${formId}-${key}-error`}>{fieldErrors[key]}</Text>}
        </Space>}</ResourceField>)}
      </>}
      {active === '运行指令' && <>
        <Banner type="info" closeIcon={null} description="演示命令使用占位地址和注册令牌。完成后填写模拟节点的信息。"/>
        <CodePreview text={command}/>
      </>}
      {(validation || error) && <Banner type="danger" closeIcon={null} description={validation || error}/>}
    </div>
  </AdminSideSheet>;
}

export function ResourceMetrics({ rows, devices = [], title, groupName, onClose, summaryOnly = false }) {
  const totals = resourceLoad(rows, devices);
  const metrics = [['GPU 使用率', 'gpu'], ['显存使用率', 'vram'], ['CPU 使用率', 'cpu'], ['内存使用率', 'ram']];
  const summary = metrics.map(([label, key]) => ({ key: label, value: totals[key] == null ? '—' : `${totals[key]}%` }));
  if (summaryOnly) return <dl className="admin-resource-load-summary">
    {summary.map(({ key, value }) => <div key={key}><dt><Text type="secondary">{key}</Text></dt><dd><Text strong>{value}</Text></dd></div>)}
  </dl>;
  const observed = rows.filter(row => Number.isFinite(row.cpu) || Number.isFinite(row.ram));
  const samples = metrics.slice(2).map(([label, key]) => ({
    label, values: observed.map(row => row[key]),
  }));
  return <div className="admin-page-stack">
    <Descriptions data={[
      ...(groupName ? [{ key: '范围', value: groupName }] : []),
      ...summary,
    ]}/>
    {observed.length ? <TimeSeriesChart labels={observed.map(row => row.name)} series={samples} type="bar" label={title} unit="%" height={260}/>
      : <Paragraph type="secondary">暂无资源采样</Paragraph>}
    {onClose && <Space><Button onClick={onClose}>关闭</Button></Space>}
  </div>;
}

export function WorkerLabelFilterCell({ labels, onChoose }) {
  const pairs = labelPairs(labels);
  const label = ([key, value]) => key && !key.includes('=') ? <Button size="small" theme="light"
    className="admin-worker-label-chip" title={`${key}: ${value}`}
    onClick={() => onChoose(`${key}=${value}`)} aria-label={`按 ${key}=${value} 筛选`}>{key}: {value}</Button>
    : <Text>{key}: {value}</Text>;
  if (!pairs.length) return '—';
  return <Space wrap spacing={4}>
    {label(pairs[0])}
    {pairs.length > 1 && <Popover trigger="click" position="bottomLeft" content={<div style={{ padding: 12 }}>
      <Space vertical align="start">{pairs.slice(1).map((pair, index) => <span key={index}>{label(pair)}</span>)}</Space>
    </div>}><Button size="small" theme="borderless" aria-label="更多节点标签">+{pairs.length - 1}</Button></Popover>}
  </Space>;
}

export function VramDetailCell({ row }) {
  const amount = value => value == null ? '—' : `${value} GiB`;
  const usage = gpuMemoryUtilization(row);
  return <Popover trigger="click" position="bottomLeft" content={<div style={{ padding: 12 }}>
    <Descriptions data={[
      { key: '总显存', value: amount(row.vram) }, { key: '已用显存', value: amount(row.vramUsed) }, { key: '已分配显存', value: amount(row.vramAllocated) },
    ]}/>
  </div>}><Button theme="borderless" size="small" aria-label={`查看设备 ${row.index} 显存明细`}>
    {usage == null ? '—' : `${usage}%`}
  </Button></Popover>;
}

const resourceSort = new Intl.Collator('zh-CN', { numeric: true });
export function ClusterResourceTable({ kind, rows, records, onDetail, onRefresh }) {
  const labelsId = useId();
  const [query, setQuery] = useState('');
  const [labels, setLabels] = useState([]);
  const [currentPage, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);
  const devices = kind === 'gpus';
  const schema = RESOURCE_PAGES[devices ? 'ops-gpus' : 'ops-nodes'];
  const normalized = query.trim().toLowerCase();
  const data = rows.filter(row => schema.searchMatches(row, normalized, records) &&
    (devices || workerLabelsMatch(row.labels, labels)));
  const columns = schema.columns.map(column => {
    const readSortValue = row => column.sortValue?.(row, records) ?? row[column.key];
    return {
      title: column.tip ? <TableFieldHelp name={column.label} description={column.tip}/> : column.label,
      dataIndex: column.key,
      width: column.width ?? 110,
      ...(column.sorter && { sorter: (left, right) => {
        const a = readSortValue(left), b = readSortValue(right);
        return typeof a === 'number' && typeof b === 'number' ? a - b : resourceSort.compare(String(a ?? ''), String(b ?? ''));
      } }),
      render: (value, row) => {
        if (column.status) return <AdminStatus value={value} color={column.color?.(value)}/>;
        if (column.key === 'name') return <div className="admin-table-record">
          <Button theme="borderless" size="small" onClick={() => onDetail(row)}>{value}</Button>
          {row[column.secondaryKey] && <Text type="tertiary" size="small">{row[column.secondaryKey]}</Text>}
        </div>;
        if (column.key === 'labels') return <WorkerLabelFilterCell labels={row.labels} onChoose={label => {
          setLabels(before => [...new Set([...before, label])]); setPage(1);
        }}/>;
        if (column.key === 'vramUsed') return <VramDetailCell row={row}/>;
        return (column.format ? column.format(value, row, records) : value) ?? '—';
      },
    };
  });
  columns.push({ title: '操作', key: 'actions', width: 88, fixed: 'right', render: (_, row) =>
    <AdminActionMenu label={`${row.name} 操作`} items={[
      { node: 'item', name: '详情', onClick: () => onDetail(row) },
      { node: 'item', name: '指标详情', onClick: () => onDetail(row, 'metrics') },
    ]}>操作</AdminActionMenu> });
  const tableWidth = columns.reduce((total, column) => total + column.width, 0);
  return <div className="admin-page-stack">
    <Space wrap><Input value={query} onChange={value => { setQuery(value); setPage(1); }} aria-label={devices ? '搜索集群 GPU' : '搜索集群节点'}
      placeholder={devices ? schema.searchPlaceholder : '搜索节点名称或 IP'} showClear/>
      {!devices && <Select multiple showClear filter insetLabel="节点标签" insetLabelId={labelsId} aria-labelledby={labelsId}
        placeholder="按标签筛选" value={labels} onChange={value => { setLabels(value || []); setPage(1); }} optionList={workerLabelOptions(rows)}/>}
      <Button onClick={onRefresh}>刷新</Button></Space>
    <Table rowKey="id" dataSource={data} empty={devices ? '暂无 GPU' : '暂无节点'} columns={columns}
      pagination={{ pageSize, currentPage, onPageChange: setPage, onPageSizeChange: size => { setPageSize(size); setPage(1); },
        showSizeChanger: true, showTotal: true }} scroll={{ x: `max(100%, ${tableWidth}px)` }}/>
  </div>;
}

function topologyColumnPrefs(key) {
  try {
    const columns = JSON.parse(localStorage.getItem(key) || '{}');
    return Object.fromEntries(Object.entries(columns || {}).filter(([, visible]) => typeof visible === 'boolean'));
  } catch { return {}; }
}

function layerTree(rows, layers, prefix = '') {
  if (!layers.length) return rows.map(row => ({ key: `${prefix}${row.id}`, label: row.name }));
  const [layer, ...children] = layers;
  const grouped = Map.groupBy(rows, row => topologyLocation(row, layer).value || '未归类');
  return [...grouped].map(([name, items]) => ({ key: `${prefix}${name}/`, label: `${layer.name} ${name}`,
    children: layerTree(items, children, `${prefix}${name}/`) }));
}

export function ClusterTopology({ cluster, nodes, onClose, onRowsChange, onSaveLayers, dirtyRef, changeResources, persistColumnPrefs }) {
  const [view, setView] = useState('table');
  const [search, setSearch] = useState('');
  const [editing, setEditing] = useState(null);
  const [selected, setSelected] = useState([]);
  const [mapping, setMapping] = useState(null);
  const [discard, setDiscard] = useState(false);
  const prefsKey = `${infrastructureStoragePrefix}cluster-topology-columns:${cluster.id}`;
  const [columnPrefs, setColumnPrefs] = useState(() => persistColumnPrefs ? topologyColumnPrefs(prefsKey) : {});
  const [preview, setPreview] = useState(false);
  const [settling, setSettling] = useState(false);
  const [error, setError] = useState('');
  const layers = cluster.topologyLayers || defaultTopologyLayers;
  const activeLayers = (preview ? mapping ?? layers : layers).filter(layer => !layer.disabled);
  const writableLayers = layers.filter(layer => !layer.disabled && topologyLabelKeys(layer).length);
  const filtered = nodes.filter(row => row.name.toLowerCase().includes(search.trim().toLowerCase()));
  const edit = (ids, layerId, value = '') => {
    setError('');
    setEditing({ ids, layerId, value, clear: false });
  };
  const editedLayer = editing && writableLayers.find(layer => layer.id === editing.layerId);
  const primaryKey = editedLayer && topologyLabelKeys(editedLayer)[0];
  const nextLocation = editing?.clear ? null : editing?.value.trim();
  const locationTargets = editedLayer ? nodes.filter(row => editing.ids.includes(row.id)).map(row => ({
    id: row.id, name: row.name, previous: labelMap(row.labels).get(primaryKey), ...topologyLocation(row, editedLayer),
  })) : [];
  const affectedLocations = locationTargets.filter(row => editing.clear ? Boolean(row.previous) : row.value && row.value !== nextLocation);
  const locationCounts = new Map();
  if (editedLayer) for (const row of nodes) {
    const { value } = topologyLocation(row, editedLayer);
    if (value) locationCounts.set(value, (locationCounts.get(value) || 0) + 1);
  }
  const existingLocations = [...locationCounts].sort(([a, countA], [b, countB]) => countB - countA || a.localeCompare(b));
  const update = async () => {
    if (settling || nextLocation === '' || !primaryKey) return;
    if (nextLocation && !/^[\w.-]+$/.test(nextLocation)) { setError('位置值须使用字母、数字、下划线、点或连字符。'); return; }
    setSettling(true);
    try {
      const next = await changeResources('ops-nodes', latest => {
        const current = latest.filter(row => row.clusterId === cluster.id && editing.ids.includes(row.id));
        if (current.length !== editing.ids.length || current.some(row => labelMap(row.labels).get(primaryKey) !== locationTargets.find(target => target.id === row.id)?.previous)) {
          throw Error('节点位置已变化，请关闭弹窗后重试。');
        }
        return latest.map(row => {
          if (!editing.ids.includes(row.id)) return row;
          const values = labelMap(row.labels);
          if (nextLocation) values.set(primaryKey, nextLocation);
          else values.delete(primaryKey);
          return { ...row, labels: Object.fromEntries(values) };
        });
      });
      onRowsChange(next);
      setEditing(null);
      Toast.success('位置已更新');
    } catch (issue) { setError(issue.message); }
    finally { setSettling(false); }
  };
  const closeMapping = () => {
    if (dirtyRef) dirtyRef.current = false;
    setDiscard(false);
    setMapping(null);
    setPreview(false);
    setError('');
  };
  const requestCloseMapping = () => {
    if (settling) return;
    if (JSON.stringify(mapping) === JSON.stringify(layers)) closeMapping();
    else setDiscard(true);
  };
  const configure = value => {
    if (dirtyRef) dirtyRef.current = true;
    setMapping(value);
    setPreview(true);
    setError('');
  };
  const changeLayer = (id, patch) => configure(mapping.map(row => row.id === id ? { ...row, ...patch } : row));
  const addLayer = index => configure([...mapping.slice(0, index), { id: crypto.randomUUID(), name: '', labelKey: '', fallbackLabelKeys: [] }, ...mapping.slice(index)]);
  const moveLayer = (index, offset) => {
    const next = [...mapping];
    const [layer] = next.splice(index, 1);
    next.splice(index + offset, 0, layer);
    configure(next);
  };
  const saveLayers = async () => {
    try {
      const valid = validateTopologyLayers(mapping);
      setSettling(true);
      if (await onSaveLayers(valid)) closeMapping();
      else setError('保存未确认，请重试。');
    } catch (issue) { setError(issue.message); }
    finally { setSettling(false); }
  };
  const saveColumnPrefs = next => {
    try {
      if (persistColumnPrefs) localStorage.setItem(prefsKey, JSON.stringify(next));
      setColumnPrefs(next);
    } catch { Toast.error('未能保存拓扑列设置。'); }
  };
  const columns = [{ title: '节点', dataIndex: 'name', width: 170 }, {
    title: '状态', dataIndex: 'status', width: 100, render: value => <AdminStatus value={value}/>,
  }, ...activeLayers.filter(layer => columnPrefs[layer.id] !== false).map(layer => ({
    title: layer.name, key: layer.id, width: 150, render: (_, row) => {
      const { value, key, discovered } = topologyLocation(row, layer);
      if (preview || !topologyLabelKeys(layer).length) return value || '—';
      return <Space wrap>
        <Button theme="borderless" size="small" onClick={() => edit([row.id], layer.id, value)}>{value || '填写'}</Button>
        {discovered && <Tag size="small" title={key}>发现</Tag>}
      </Space>;
    },
  }))];
  return <AdminSideSheet visible title={`集群拓扑 · ${cluster.name}`} width="min(980px, calc(100vw - 24px))"
    onCancel={() => { if (dirtyRef) dirtyRef.current = false; onClose(); }}>
    <div className="admin-page-stack">
      <Space wrap>
        <Input value={search} onChange={setSearch} aria-label="搜索节点" placeholder="搜索节点" showClear/>
        <Tabs activeKey={view} onChange={setView} type="button"><Tabs.TabPane tab="表格" itemKey="table"/><Tabs.TabPane tab="树形" itemKey="tree"/></Tabs>
        <Button disabled={!selected.length || !writableLayers.length || preview} onClick={() => edit(selected, writableLayers[0].id)}>批量设置位置</Button>
        <Popover trigger="click" position="bottomLeft" content={<div className="admin-page-stack" style={{ padding: 12, minWidth: 180 }}>
          <Space><Text strong>拓扑列</Text><Button size="small" theme="borderless" onClick={() => saveColumnPrefs({})}>恢复默认</Button></Space>
          {activeLayers.map(layer => <Checkbox key={layer.id} checked={columnPrefs[layer.id] !== false}
            onChange={event => saveColumnPrefs({ ...columnPrefs, [layer.id]: Boolean(event.target.checked) })}>{layer.name}</Checkbox>)}
        </div>}><Button>列设置</Button></Popover>
        <Button onClick={() => { setMapping(layers); setError(''); }}>高级设置</Button>
      </Space>
      {preview && <Banner type="info" closeIcon={null} description="正在预览拓扑映射"/>}
      {view === 'table' ? <Table columns={columns} rowKey="id" dataSource={filtered} empty="暂无节点" pagination={{ pageSize: 10 }}
        rowSelection={{ selectedRowKeys: selected, onChange: setSelected }}/>
        : <Tree treeData={layerTree(filtered, activeLayers)} expandAll/>}
    </div>
    {editing && <AdminModal visible title={`设置 ${editing.ids.length} 个节点的位置`} confirmLoading={settling} onOk={update} okText={editing.clear ? '确认清除' : '应用位置'}
      okButtonProps={{ disabled: !primaryKey || nextLocation === '' || (editing.clear && affectedLocations.length === 0) }} onCancel={() => !settling && setEditing(null)}>
      <div className="admin-page-stack">
        <ResourceField label="位置字段">{id => <Select aria-labelledby={id} value={editing.layerId} disabled={settling}
          optionList={layers.map(layer => ({ value: layer.id, label: layer.name, disabled: !writableLayers.includes(layer) }))}
          onChange={value => { setEditing({ ...editing, layerId: value, value: '', clear: false }); setError(''); }}/>}</ResourceField>
        <ResourceField label="位置值">{id => <Input aria-labelledby={id} value={editing.value} disabled={settling || editing.clear}
          onChange={value => { setEditing({ ...editing, value }); setError(''); }}/>}</ResourceField>
        {existingLocations.length > 0 && <ResourceField label="已有位置">{id => <Select aria-labelledby={id}
          value={locationCounts.has(editing.value) ? editing.value : undefined} placeholder="选择已有值" disabled={settling || editing.clear}
          optionList={existingLocations.map(([value, count]) => ({ value, label: `${value}（${count} 个节点）` }))}
          onChange={value => { setEditing({ ...editing, value }); setError(''); }}/>}</ResourceField>}
        <Checkbox checked={editing.clear} disabled={settling || !locationTargets.some(row => row.previous)} onChange={event => {
          setEditing({ ...editing, clear: Boolean(event.target.checked) }); setError('');
        }}>清除手工设置的位置</Checkbox>
        {affectedLocations.length > 0 && nextLocation !== '' && <Banner type="warning" closeIcon={null} description={
          `${editing.clear ? '将移除手工位置' : '将覆盖现有位置'}：${affectedLocations.slice(0, 5).map(row => `${row.name}（${row.value}）`).join('、')}${affectedLocations.length > 5 ? `等 ${affectedLocations.length} 个节点` : ''}`}/>}
        {editing.clear && <Text type="secondary">存在其他可用标签时，清除后会显示发现的位置。</Text>}
        {error && <Banner type="danger" closeIcon={null} description={error}/>}
      </div>
    </AdminModal>}
    {mapping && <AdminModal visible title="拓扑层级映射" width="min(660px, calc(100vw - 32px))" confirmLoading={settling}
      closeOnEsc={!discard && !settling} onOk={saveLayers} onCancel={requestCloseMapping}>
      <div className="admin-page-stack">
        {mapping.map((layer, index) => {
          const builtin = defaultTopologyLayers.find(item => item.id === layer.id);
          const fallbacks = builtin && layer.labelKey && layer.labelKey !== builtin.labelKey
            ? [layer.labelKey, ...(layer.fallbackLabelKeys ?? [])] : layer.fallbackLabelKeys ?? [];
          const coverage = nodes.filter(row => topologyLocation(row, layer).value).length;
          return <Space key={layer.id} vertical align="start" style={{ width: '100%' }}>
            <Space wrap><Text strong>{layer.name || '自定义层级'}</Text><Text type="secondary">{coverage} / {nodes.length} 个节点已归类</Text></Space>
            <Input aria-label={`层级 ${index + 1} 名称`} value={layer.name} onChange={name => changeLayer(layer.id, { name })}/>
            <Input aria-label={`层级 ${index + 1} 主标签键`} value={builtin?.labelKey || layer.labelKey} disabled={Boolean(builtin)}
              placeholder="主标签键" onChange={labelKey => changeLayer(layer.id, { labelKey })}/>
            <TextArea aria-label={`层级 ${index + 1} 发现标签键`} value={fallbacks.join('\n')} rows={2}
              placeholder="按优先顺序填写其他标签键，每行一个" onChange={value => changeLayer(layer.id, {
                ...(builtin && { labelKey: builtin.labelKey }), fallbackLabelKeys: value.split('\n'),
              })}/>
            <Space wrap>
              {builtin ? <Switch checked={!layer.disabled} aria-label={`启用${layer.name}`} onChange={enabled => changeLayer(layer.id, { disabled: !enabled })}/>
                : <><Button size="small" disabled={!index} onClick={() => moveLayer(index, -1)}>上移</Button>
                  <Button size="small" disabled={index === mapping.length - 1} onClick={() => moveLayer(index, 1)}>下移</Button>
                  <Button size="small" type="danger" theme="borderless" onClick={() => configure(mapping.filter(row => row.id !== layer.id))}>移除</Button></>}
              <Button size="small" theme="borderless" onClick={() => addLayer(index + 1)}>在此之后插入</Button>
            </Space>
          </Space>;
        })}
        <Space wrap><Button onClick={() => addLayer(mapping.length)}>添加自定义层级</Button>
          <Button onClick={() => configure(defaultTopologyLayers)}>恢复默认映射</Button>
          <Button onClick={() => setPreview(!preview)}>{preview ? '退出预览' : '预览树形'}</Button></Space>
        {preview && <Tree treeData={layerTree(filtered, mapping.filter(layer => !layer.disabled))} expandAll/>}
        {error && <Banner type="danger" closeIcon={null} description={error}/>}
      </div>
    </AdminModal>}
    {discard && <AdminModal visible title="放弃未保存的拓扑映射？" okText="放弃修改" cancelText="继续编辑"
      onOk={closeMapping} onCancel={() => setDiscard(false)} closeOnEsc/>}
  </AdminSideSheet>;
}
