import { useId, useState } from 'react';
import { Banner, Button, Checkbox, Descriptions, Input, Popover, Select, Space, Steps, Table, Tabs, Toast, Tree, Typography } from '@douyinfe/semi-ui';
import { AdminModal, AdminSideSheet } from './AdminOverlay';
import { TimeSeriesChart } from '../components/AnalyticsCharts';
import { changeInfrastructure } from './infrastructure-state';
import { GPU_VENDORS, ipv4, labelList, labelMap, labelText } from './ops-resources';
import AdminStatus from './AdminStatus';

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

export function ClusterRegistration({ cluster, clusters, onClose, onFinish, busy, error }) {
  const [choice, setChoice] = useState(cluster?.id || clusters.find(item => item.isDefault)?.id || clusters[0]?.id || '');
  const target = clusters.find(item => item.id === choice);
  const isKubernetes = target?.provider === 'Kubernetes';
  const steps = [...(cluster ? [] : ['选择集群']), isKubernetes ? '选择硬件类型' : '选择 GPU 厂商', '检查环境',
    ...(isKubernetes ? [] : ['指定参数']), '运行指令'];
  const [step, setStep] = useState(0);
  const [vendors, setVendors] = useState([]);
  const [checked, setChecked] = useState(false);
  const [args, setArgs] = useState({ ip: '', externalIp: '', kvTransferNic: '', modelPath: '', cachePath: '' });
  const [validation, setValidation] = useState('');
  const active = steps[step];
  const argsIssue = [args.ip, args.externalIp].some(value => value && !ipv4(value)) ? '节点地址须为 IPv4 地址。'
    : [args.modelPath, args.cachePath].some(value => value && (!/^\/[\w./-]+$/.test(value) || value.split('/').includes('..')))
      ? '模型目录和缓存目录须为有效的绝对路径。' : args.kvTransferNic && !/^[\w.-]+$/.test(args.kvTransferNic) ? '请输入有效的网卡名称。' : '';
  const validArgs = argsIssue ? [] : [
    args.ip && `--advertise-address ${args.ip}`, args.externalIp && `--worker-external-address ${args.externalIp}`,
    args.modelPath && `--model-dir ${args.modelPath}`, args.cachePath && `--cache-dir ${args.cachePath}`,
    args.kvTransferNic && `--kv-transfer-ifname ${args.kvTransferNic}`,
  ].filter(Boolean);
  const command = isKubernetes
    ? `# 演示注册清单 · 硬件 ${vendors.join(' / ')}\nkubectl apply -f https://gpustack.demo.invalid/manifests/${encodeURIComponent(target?.clusterId || 'cluster')}.yaml`
    : ['# 演示 · 硬件 ' + vendors.join(' / '),
        ['docker run --name gpustack-worker gpustack/gpustack:v2.3.1', "--server-url https://gpustack.demo.invalid --token '<注册令牌>'", ...validArgs].join(' \\\n  ')].join('\n');
  const advance = () => {
    if (active === '运行指令') return onFinish(target, { ...args, hardware: vendors[0] });
    if (active === '指定参数' && argsIssue) { setValidation(argsIssue); return; }
    setValidation('');
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
          optionList={options(GPU_VENDORS)} onChange={value => { setVendors(Array.isArray(value) ? value : [value]); setChecked(false); }}/>}</ResourceField>}
      {active === '检查环境' && <>
        <Paragraph>复制命令可查看所选环境的检查内容。</Paragraph>
        <CodePreview text={isKubernetes ? 'kubectl get nodes -o wide' : 'docker version\n' + (vendors.includes('NVIDIA') ? 'nvidia-smi' : 'uname -m')}/>
        <Space><Button onClick={() => setChecked(true)}>{checked ? '重新检查' : '模拟检查通过'}</Button>{checked && <Text type="success">检查通过</Text>}</Space>
      </>}
      {active === '指定参数' && [['ip', '节点 IP'], ['externalIp', '节点外部地址'], ['modelPath', '模型目录'], ['cachePath', '缓存目录'], ['kvTransferNic', 'KV 传输网卡']]
        .map(([key, label]) => <ResourceField key={key} label={label}>{id => <Input aria-labelledby={id} value={args[key]}
          onChange={value => { setValidation(''); setArgs(current => ({ ...current, [key]: value.trim() })); }}/>}</ResourceField>)}
      {active === '运行指令' && <>
        <Banner type="info" closeIcon={null} description="演示命令使用占位地址和注册令牌。完成后填写模拟节点的信息。"/>
        <CodePreview text={command}/>
      </>}
      {(validation || error) && <Banner type="danger" closeIcon={null} description={validation || error}/>}
    </div>
  </AdminSideSheet>;
}

export function ResourceMetrics({ rows, title, groupName, onClose }) {
  const observed = rows.filter(row => row.cpu != null);
  const averages = [['CPU 使用率', 'cpu'], ['内存使用率', 'ram']].map(([label, key]) => ({
    label, values: observed.map(row => row[key]),
  }));
  return <div className="admin-page-stack">
    {groupName && <Descriptions data={[{ key: '范围', value: groupName }, { key: '已采集节点', value: observed.length }]}/>}
    {observed.length ? <TimeSeriesChart labels={observed.map(row => row.name)} series={averages} label={title} unit="%" height={260}/>
      : <Paragraph type="secondary">暂无资源采样</Paragraph>}
    {onClose && <Space><Button onClick={onClose}>关闭</Button></Space>}
  </div>;
}

export function ClusterResourceTable({ kind, rows, onDetail, onRefresh }) {
  const [query, setQuery] = useState('');
  const [labels, setLabels] = useState([]);
  const devices = kind === 'gpus';
  const normalized = query.trim().toLowerCase();
  const data = rows.filter(row => [row.name, row.ip, row.nodeId].some(value => value?.toLowerCase().includes(normalized)) &&
    labels.every(label => labelList(row.labels).includes(label)));
  const columns = [
    { title: devices ? '设备' : '节点', dataIndex: 'name', sorter: (left, right) => left.name.localeCompare(right.name),
      render: (name, row) => <Button theme="borderless" size="small" onClick={() => onDetail(row)}>{name}</Button> },
    ...(devices ? [{ title: '编号', dataIndex: 'index' }, { title: '节点 ID', dataIndex: 'nodeId' },
      { title: '显存 (GiB)', dataIndex: 'vram' }, { title: '核心使用率', dataIndex: 'utilization', render: value => value == null ? '—' : `${value}%` }]
      : [{ title: 'IP', dataIndex: 'ip' }, { title: '节点标签', dataIndex: 'labels', render: value => labelList(value).join('、') || '—' },
        { title: 'GPU 数量', dataIndex: 'gpuCount' }]),
    { title: '状态', dataIndex: 'status', render: value => <AdminStatus value={value}/> },
  ];
  return <div className="admin-page-stack">
    <Space wrap><Input value={query} onChange={setQuery} aria-label={devices ? '搜索集群 GPU' : '搜索集群节点'}
      placeholder={devices ? '搜索设备或节点编号' : '搜索节点名称或 IP'} showClear/>
      {!devices && <Select multiple showClear aria-label="节点标签" placeholder="按标签筛选" value={labels}
        onChange={value => setLabels(value || [])} optionList={options([...new Set(rows.flatMap(row => labelList(row.labels)))].sort())}/>}
      <Button onClick={onRefresh}>刷新</Button></Space>
    <Table rowKey="id" dataSource={data} empty={devices ? '暂无 GPU' : '暂无节点'} columns={columns}
      pagination={{ pageSize: 10, showSizeChanger: true, showTotal: true }} scroll={{ x: devices ? 570 : 680 }}/>
  </div>;
}

const baseLayers = [
  { id: 'zone', name: '可用区', labelKey: 'topology.kubernetes.io/zone' },
  { id: 'rack', name: '机架', labelKey: 'topology.moma.io/rack' },
];

function topologyColumnPrefs(key) {
  try {
    const columns = JSON.parse(localStorage.getItem(key) || '{}');
    return Object.fromEntries(Object.entries(columns || {}).filter(([, visible]) => typeof visible === 'boolean'));
  } catch { return {}; }
}

function layerTree(rows, layers, prefix = '') {
  if (!layers.length) return rows.map(row => ({ key: `${prefix}${row.id}`, label: row.name }));
  const [layer, ...children] = layers;
  const grouped = Map.groupBy(rows, row => labelMap(row.labels).get(layer.labelKey) || '未填写');
  return [...grouped].map(([name, items]) => ({ key: `${prefix}${name}/`, label: `${layer.name} ${name}`,
    children: layerTree(items, children, `${prefix}${name}/`) }));
}

export function ClusterTopology({ cluster, nodes, onClose, onRowsChange, onSaveLayers, dirtyRef }) {
  const [view, setView] = useState('table');
  const [search, setSearch] = useState('');
  const [editing, setEditing] = useState(null);
  const [selected, setSelected] = useState([]);
  const [mapping, setMapping] = useState(null);
  const prefsKey = `moma-5.12.0-estack:cluster-topology-columns:${cluster.id}`;
  const [columnPrefs, setColumnPrefs] = useState(() => topologyColumnPrefs(prefsKey));
  const [preview, setPreview] = useState(false);
  const [settling, setSettling] = useState(false);
  const [error, setError] = useState('');
  const layers = cluster.topologyLayers || baseLayers;
  const activeLayers = preview ? mapping ?? layers : layers;
  const filtered = nodes.filter(row => row.name.toLowerCase().includes(search.trim().toLowerCase()));
  const edit = (ids, labelKey, value = '') => {
    setError('');
    setEditing({ ids, labelKey, value });
  };
  const update = async () => {
    if (settling) return;
    const key = editing.labelKey;
    const value = editing.value.trim();
    if (value && !/^[\w.-]+$/.test(value)) { setError('位置值须使用字母、数字、下划线、点或连字符。'); return; }
    setSettling(true);
    try {
      const next = await changeInfrastructure('ops-nodes', latest => {
        if (latest.filter(row => row.clusterId === cluster.id && editing.ids.includes(row.id)).length !== editing.ids.length) throw Error('节点已变化，请关闭弹窗后重试。');
        return latest.map(row => {
          if (!editing.ids.includes(row.id)) return row;
          const values = labelMap(row.labels);
          if (value) values.set(key, value);
          else values.delete(key);
          return { ...row, labels: labelText(values) };
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
    setMapping(null);
    setPreview(false);
    setError('');
  };
  const configure = value => {
    if (dirtyRef) dirtyRef.current = true;
    setMapping(value);
  };
  const saveLayers = async () => {
    const invalid = mapping.some(row => !row.name.trim() || !/^[\w./-]+$/.test(row.labelKey.trim()));
    if (invalid || new Set(mapping.map(row => row.labelKey.trim())).size !== mapping.length) { setError('请输入有效且不重复的标签键。'); return; }
    setSettling(true);
    try {
      if (await onSaveLayers(mapping.map(row => ({ ...row, name: row.name.trim(), labelKey: row.labelKey.trim() })))) closeMapping();
      else setError('保存未确认，请重试。');
    } finally { setSettling(false); }
  };
  const saveColumnPrefs = next => {
    try {
      localStorage.setItem(prefsKey, JSON.stringify(next));
      setColumnPrefs(next);
    } catch { Toast.error('未能保存拓扑列设置。'); }
  };
  const columns = [{ title: '节点', dataIndex: 'name', width: 170 }, ...activeLayers.filter(layer => columnPrefs[layer.id] !== false).map(layer => ({
    title: layer.name, key: layer.id, width: 150, render: (_, row) => {
      const value = labelMap(row.labels).get(layer.labelKey);
      return preview ? value || '—' : <Button theme="borderless" size="small" onClick={() => edit([row.id], layer.labelKey, value)}>{value || '填写'}</Button>;
    },
  }))];
  return <AdminSideSheet visible title={`集群拓扑 · ${cluster.name}`} width="min(980px, calc(100vw - 24px))"
    onCancel={() => { if (dirtyRef) dirtyRef.current = false; onClose(); }}>
    <div className="admin-page-stack">
      <Space wrap>
        <Input value={search} onChange={setSearch} aria-label="搜索节点" placeholder="搜索节点" showClear/>
        <Tabs activeKey={view} onChange={setView} type="button"><Tabs.TabPane tab="表格" itemKey="table"/><Tabs.TabPane tab="树形" itemKey="tree"/></Tabs>
        <Button disabled={!selected.length || !layers.length || preview} onClick={() => edit(selected, layers.at(-1).labelKey)}>批量设置位置</Button>
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
    {editing && <AdminModal visible title="设置节点位置" confirmLoading={settling} onOk={update} onCancel={() => !settling && setEditing(null)}>
      <div className="admin-page-stack">
        <ResourceField label="位置字段">{id => <Select aria-labelledby={id} value={editing.labelKey} disabled={settling}
          optionList={layers.map(layer => ({ value: layer.labelKey, label: layer.name }))} onChange={value => setEditing({ ...editing, labelKey: value })}/>}</ResourceField>
        <ResourceField label="位置值">{id => <Input aria-labelledby={id} value={editing.value} disabled={settling} onChange={value => setEditing({ ...editing, value })}/>}</ResourceField>
        {error && <Banner type="danger" closeIcon={null} description={error}/>}
      </div>
    </AdminModal>}
    {mapping && <AdminModal visible title="拓扑层级映射" width="min(660px, calc(100vw - 32px))" confirmLoading={settling}
      onOk={saveLayers} onCancel={() => !settling && closeMapping()}>
      <div className="admin-page-stack">
        {mapping.map((layer, index) => <Space key={layer.id} wrap>
          <Input aria-label={`层级 ${index + 1} 名称`} value={layer.name} onChange={name => configure(mapping.map(row => row.id === layer.id ? { ...row, name } : row))}/>
          <Input aria-label={`层级 ${index + 1} 标签键`} value={layer.labelKey} onChange={labelKey => configure(mapping.map(row => row.id === layer.id ? { ...row, labelKey } : row))}/>
          <Button type="danger" theme="borderless" onClick={() => configure(mapping.filter(row => row.id !== layer.id))}>移除</Button>
        </Space>)}
        <Space wrap><Button onClick={() => configure([...mapping, { id: crypto.randomUUID(), name: '', labelKey: '' }])}>添加自定义层级</Button>
          <Button onClick={() => { setPreview(!preview); setView('tree'); }}>{preview ? '退出预览' : '预览树形'}</Button></Space>
        {preview && <Tree treeData={layerTree(filtered, mapping)} expandAll/>}
        {error && <Banner type="danger" closeIcon={null} description={error}/>}
      </div>
    </AdminModal>}
  </AdminSideSheet>;
}
