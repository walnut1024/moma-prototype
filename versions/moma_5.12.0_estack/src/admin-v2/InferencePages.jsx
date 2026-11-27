import { resourceId } from '../resource-id.mjs';
import AdminStatus from './AdminStatus';
import { useEffect, useRef, useState } from 'react';
import { Banner, Button, Card, Descriptions, Dropdown, Input, Space, Table, Tabs, Tag, Toast, Typography } from '@douyinfe/semi-ui';
import { AdminModal } from './AdminOverlay';
import { IconPlus, IconSearch } from '@douyinfe/semi-icons';
import { FilterReset } from '../components/FilterControls';
import AdminPageHeading from './AdminPageHeading';
import AdminActionMenu from './AdminActionMenu';
import AnalysisMetric from './AnalysisMetric';
import { Choice } from './ServiceUI';
import { ClusterResourceEditor, NodePoolEditor } from './ClusterResourceEditor';
import { ClusterRegistration, ClusterResourceTable, ClusterTopology, ResourceMetrics } from './ClusterResourcePanels';
import { readInferenceDemoInfrastructure } from './inference-demo-infrastructure.js';
import { CLUSTER_PROVIDERS, clusterGatherIssue, clusterRemovalIssue, isCloudCluster } from './ops-cluster-domain';
import { changeInfrastructure, INFRASTRUCTURE_STORAGE, readInfrastructure } from './infrastructure-state';
import { labelMap, RESOURCE_PAGES } from './ops-resources';
import './semi-inference.css';

export { default as ModelDeployments } from './DeploymentManagement';

const { Text, Paragraph } = Typography;

const clusterStatus = ['运行中', '维护中', '待注册'];
const clusterTimestamp = value => value ? new Date(value).toLocaleString('zh-CN', { timeZone: 'Asia/Shanghai', hour12: false }) : '—';

export function ClusterManagement({ state, dispatch, onNavigate, dirtyRef, refreshShared, params = new URLSearchParams(), inferenceDemo = false }) {
  const formDirty = useRef(false), writing = useRef(false);
  const [pending, setPending] = useState(false);
  const [editor, setEditor] = useState(null);
  const [registered, setRegistered] = useState(null);
  const [registrationTarget, setRegistrationTarget] = useState(null);
  const [action, setAction] = useState(null);
  const [poolEditor, setPoolEditor] = useState(null);
  const [topologyId, setTopologyId] = useState('');
  const [monitoringId, setMonitoringId] = useState('');
  const [discard, setDiscard] = useState(false);
  const [error, setError] = useState('');
  const [query, setQuery] = useState('');
  const [provider, setProvider] = useState('all');
  const [status, setStatus] = useState('all');
  const [selected, setSelected] = useState([]);
  const [expanded, setExpanded] = useState([]);
  const [infrastructure, setInfrastructure] = useState(() => {
    try { return inferenceDemo ? readInferenceDemoInfrastructure() : readInfrastructure(); } catch { return null; }
  });
  const refreshLocal = () => {
    try { setInfrastructure(inferenceDemo ? readInferenceDemoInfrastructure() : readInfrastructure()); }
    catch { Toast.error('无法读取运维演示数据。'); }
  };
  const refresh = async () => {
    refreshLocal();
    if (inferenceDemo) return;
    try { await refreshShared?.(); setError(''); }
    catch (issue) { Toast.error(issue.message || '刷新工作区失败'); }
  };
  const demoNodes = infrastructure?.['ops-nodes'] ?? [];
  const lookup = id => state.clusters.find(item => item.id === id);
  const detail = params.get('view') === 'detail' ? lookup(params.get('record')) : null;
  const topology = inferenceDemo ? null : lookup(topologyId || params.get('topology'));
  const clusterNodes = id => demoNodes.filter(node => node.clusterId === id);
  const gpuChildren = id => infrastructure?.['ops-gpus']?.filter(gpu => gpu.clusterId === id) ?? [];
  const resourceRecords = { clusters: state.clusters, 'ops-nodes': demoNodes, 'ops-gpus': infrastructure?.['ops-gpus'] ?? [] };
  const rows = state.clusters.filter(item =>
    `${item.name} ${item.clusterId} ${item.zone}`.toLowerCase().includes(query.trim().toLowerCase()) &&
    (provider === 'all' || item.provider === provider) && (status === 'all' || item.status === status)).map(item => {
    const nodes = clusterNodes(item.id);
    return { ...item, nodeCount: Math.max(item.nodes ?? 0, nodes.length),
      readyNodeCount: nodes.filter(node => node.status === '就绪').length,
      deploymentCount: state.deployments.filter(deployment => !deployment.retiredAt && deployment.clusterId === item.id).length };
  });
  const rowSelection = selected.filter(id => rows.some(row => row.id === id));
  const poolCluster = lookup(poolEditor?.clusterId);
  const livePoolNodes = poolId => demoNodes.filter(node => node.nodePoolId === poolId);
  const monitorTitle = monitoringId === 'all' ? '集群监控' : lookup(monitoringId)?.name;
  const showResources = (page, item) => onNavigate(`${page}?clusterId=${encodeURIComponent(item.id)}`);
  const showDetail = (item, tab = 'nodes') => onNavigate(`clusters?view=detail&record=${encodeURIComponent(item.id)}&tab=${tab}`);
  useEffect(() => {
    const sync = event => { if (event.key === INFRASTRUCTURE_STORAGE) refreshLocal(); };
    if (!inferenceDemo) window.addEventListener('storage', sync);
    return () => { window.removeEventListener('storage', sync); if (dirtyRef) dirtyRef.current = false; };
  }, [dirtyRef, inferenceDemo]);
  const dirty = () => {
    formDirty.current = true;
    if (dirtyRef) dirtyRef.current = true;
  };
  const closeEditor = () => {
    setDiscard(false);
    setEditor(null);
    formDirty.current = false;
    if (dirtyRef) dirtyRef.current = false;
  };
  const requestCloseEditor = () => {
    if (writing.current) return;
    if (formDirty.current) setDiscard(true);
    else closeEditor();
  };
  const writeCluster = async nextAction => {
    if (inferenceDemo) return null;
    if (writing.current) return null;
    writing.current = true;
    setPending(true);
    setError('');
    if (dirtyRef) dirtyRef.current = true;
    try {
      const result = await dispatch({ ...nextAction, collection: 'clusters' });
      if (!result) setError('保存未确认，请核对当前集群状态后重试。');
      return result;
    } catch (issue) {
      setError(issue.message || '保存失败，请重试。');
      return null;
    } finally {
      writing.current = false;
      setPending(false);
      if (dirtyRef) dirtyRef.current = formDirty.current;
    }
  };
  const edit = item => {
    setError('');
    formDirty.current = false;
    setEditor(item || {});
  };
  const save = async values => {
    const existing = lookup(editor.id);
    if (editor.id && !existing) { setError('集群已不存在。'); return; }
    if (existing && values.totalGpu < existing.allocatedGpu) { setError('GPU 总量须覆盖当前已分配数量。'); return; }
    const id = existing?.id || resourceId('cluster');
    const value = existing ? { type: 'update', id, changes: values } : {
      type: 'add', record: {
        ...values, id, allocatedGpu: 0,
        status: isCloudCluster(values.provider) ? '运行中' : '待注册',
      },
    };
    const result = await writeCluster(value);
    if (!result) return;
    closeEditor();
    if (!existing && !isCloudCluster(values.provider)) setRegistered(result.clusters?.find(row => row.id === id) || value.record);
  };
  const openPool = (cluster, row, resize = false) => {
    setPoolEditor({ clusterId: cluster.id, row, resize });
    setError('');
  };
  const updatePool = async value => {
    const all = poolCluster.nodePools ?? [];
    const before = all.find(row => row.id === value.id);
    if (poolEditor.row && JSON.stringify(before) !== JSON.stringify(poolEditor.row)) throw Error('节点池已更新，请关闭后重新打开。');
    if (before && value.replicas < before.replicas) {
      const records = { ...readInfrastructure(), deployments: state.deployments };
      for (const row of records['ops-nodes']) {
        if (row.clusterId !== poolCluster.id || row.nodePoolId !== value.id || row.poolIndex < value.replicas) continue;
        const issue = RESOURCE_PAGES['ops-nodes'].canDelete(row, records);
        if (issue) throw Error(`${row.name}：${issue}`);
      }
    }
    const pools = before ? all.map(row => row.id === value.id ? value : row) : [...all, value];
    const result = await writeCluster({ type: 'update', id: poolCluster.id, changes: { nodePools: pools } });
    if (result) { setPoolEditor(null); setExpanded([...new Set([...expanded, poolCluster.id])]); }
    return Boolean(result);
  };
  const syncNodePool = async (cluster, pool) => {
    if (inferenceDemo || writing.current) return;
    writing.current = true;
    setPending(true);
    try {
      const next = await changeInfrastructure('ops-nodes', (nodes, records) => {
        const related = { ...records, deployments: state.deployments };
        const current = nodes.filter(node => node.clusterId === cluster.id && node.nodePoolId === pool.id);
        const removed = current.filter(node => node.poolIndex >= pool.replicas);
        const blocked = removed.map(node => RESOURCE_PAGES['ops-nodes'].canDelete(node, related)).find(Boolean);
        if (blocked) throw Error(blocked);
        const [flavor, count, memory] = pool.instanceType.match(/([a-z0-9]+)x(\d+)-(\d+)gb$/)?.slice(1) || [];
        const gpuCount = Number(count || 0), vram = Number(memory || 0) / (gpuCount || 1);
        const created = Array.from({ length: pool.replicas }, (_, poolIndex) => {
          if (current.some(node => node.poolIndex === poolIndex)) return null;
          const id = `worker-${pool.id}-${poolIndex + 1}`;
          return { id, name: `${pool.name}-${poolIndex + 1}`, clusterId: cluster.id, nodePoolId: pool.id, poolIndex,
            labels: Object.fromEntries(labelMap(pool.labels)), status: '就绪', ip: `198.51.100.${poolIndex + 10}`, os: pool.osImage, version: 'v2.3.1',
            heartbeat: new Date().toISOString(), gpuCount, hardware: 'NVIDIA', sshConfigured: true,
            sshEndpoint: { host: `${id}.demo.invalid`, port: 22, user: 'root' },
          };
        }).filter(Boolean);
        const gpus = records['ops-gpus'].filter(gpu => !removed.some(node => node.id === gpu.nodeId));
        for (const node of created) {
          for (let index = 0; index < gpuCount; index++) {
            gpus.push({ id: `${node.id}-gpu-${index}`, name: `NVIDIA ${flavor?.toUpperCase()}`, index,
              nodeId: node.id, clusterId: cluster.id, vendor: 'NVIDIA', vram, status: '正常' });
          }
        }
        return { rows: [...nodes.filter(node => !removed.includes(node)), ...created], related: { 'ops-gpus': gpus } };
      });
      setInfrastructure(next);
      Toast.success('节点池演示状态已同步');
    } catch (issue) { Toast.error(issue.message); }
    finally { writing.current = false; setPending(false); }
  };
  const queueAction = data => { setError(''); setAction(data); };
  const removalIssue = item => {
    if (!infrastructure) return '无法核对集群关联的演示资源，请刷新后重试。';
    if (clusterNodes(item.id).length || gpuChildren(item.id).length || infrastructure['ops-cache-acceleration'].some(row => row.clusterId === item.id)) {
      return `${item.name} 仍有关联节点或运维资源。`;
    }
    return clusterRemovalIssue(state, item);
  };
  const runAction = async () => {
    const target = action.id && lookup(action.id);
    if (action.kind === 'delete') {
      const targets = action.ids.map(lookup);
      const missing = targets.some(row => !row);
      const blocked = !missing && targets.map(removalIssue).find(Boolean);
      if (missing || blocked) { setError(blocked || '集群已变化，请刷新列表。'); return; }
      if (await writeCluster({ type: 'batch', label: '删除集群', changes: targets.map(row => ({ type: 'remove', collection: 'clusters', id: row.id })) })) {
        setSelected(previous => previous.filter(id => !action.ids.includes(id)));
        setAction(null);
        if (detail && action.ids.includes(detail.id)) onNavigate('clusters');
      }
      return;
    }
    if (!target) { setError('集群已不存在。'); return; }
    if (action.kind === 'pool-delete' && livePoolNodes(action.pool.id).length) { setError('请将节点池副本调整为 0 并同步后删除。'); return; }
    const result = action.kind === 'default' ? await writeCluster({ type: 'batch', label: '设置默认集群', changes: state.clusters
      .filter(row => row.isDefault || row.id === target.id).map(row => ({ type: 'update', collection: 'clusters', id: row.id, changes: { isDefault: row.id === target.id } })) })
      : await writeCluster({ type: 'update', id: target.id, changes: action.kind === 'pool-delete'
        ? { nodePools: (target.nodePools || []).filter(row => row.id !== action.pool.id) }
        : { status: target.status === '维护中' ? '运行中' : '维护中' } });
    if (result) setAction(null);
  };
  const completeRegistration = (target, values) => {
    const latest = lookup(target.id);
    if (!latest) { Toast.error('集群已不存在。'); return; }
    setRegistrationTarget(null);
    const settings = new URLSearchParams({ view: 'create', clusterId: latest.id });
    if (values.hardware) settings.set('hardware', values.hardware);
    if (values.ip) settings.set('ip', values.ip);
    if (values.externalIp) settings.set('externalIp', values.externalIp);
    if (values.kvTransferNic) settings.set('kvTransferNic', values.kvTransferNic);
    onNavigate(`ops-nodes?${settings}`);
  };
  const poolRows = item => <Table size="small" rowKey="id" dataSource={item.nodePools || []} pagination={false} empty="暂无节点池" columns={[
    { title: '名称', dataIndex: 'name' }, { title: '实例类型', dataIndex: 'instanceType' },
    { title: '操作系统镜像', dataIndex: 'osImage' }, { title: '节点', dataIndex: 'replicas',
      render: (value, pool) => <Space spacing={8}>
        {`${livePoolNodes(pool.id).filter(node => node.status === '就绪').length} / ${value}`}
        {!inferenceDemo && <Button size="small" theme="borderless" disabled={pending} aria-label={`调整 ${pool.name} 的副本数`}
          onClick={() => openPool(item, pool, true)}>调整副本</Button>}
      </Space> },
    { title: '创建时间', dataIndex: 'createdAt', render: clusterTimestamp },
    ...(!inferenceDemo ? [{ title: '操作', key: 'actions', render: (_, pool) => <AdminActionMenu label={`${pool.name} 操作`} disabled={pending} items={[
      { node: 'item', name: '编辑', onClick: () => openPool(item, pool) },
      { node: 'item', name: '模拟同步节点', onClick: () => syncNodePool(item, pool) },
      { node: 'item', name: '删除', type: 'danger', onClick: () => queueAction({ kind: 'pool-delete', id: item.id, pool }) },
    ]}/> }] : []),
  ]}/>;
  const columns = [
    { title: '集群名称', dataIndex: 'name', width: 210, sorter: (left, right) => left.name.localeCompare(right.name, 'zh-CN'),
      render: (name, item) => <Space><Button theme="borderless" onClick={() => showDetail(item)}>{name}</Button>
        {item.isDefault && <Tag size="small" color="blue">默认</Tag>}</Space> },
    { title: '提供商', dataIndex: 'provider', width: 119, sorter: (left, right) => String(left.provider ?? '').localeCompare(String(right.provider ?? '')), render: value => value || '—' },
    { title: '可用区', dataIndex: 'zone', width: 86 },
    { title: 'GPU', dataIndex: 'totalGpu', width: 94, sorter: (left, right) => left.totalGpu - right.totalGpu,
      render: (_, item) => <Button theme="borderless" size="small" onClick={() => showDetail(item, 'gpus')} aria-label={`查看 ${item.name} 的 GPU`}>{item.allocatedGpu} / {item.totalGpu}</Button> },
    { title: '部署', dataIndex: 'deploymentCount', width: 88, sorter: (left, right) => left.deploymentCount - right.deploymentCount },
    { title: '节点', dataIndex: 'nodeCount', width: 92, sorter: (left, right) => left.nodeCount - right.nodeCount,
      render: (count, item) => <Button theme="borderless" size="small" onClick={() => showDetail(item)} aria-label={`查看 ${item.name} 的节点`}>{item.readyNodeCount} / {count}</Button> },
    { title: '状态', dataIndex: 'status', width: 95, render: value => <AdminStatus value={value}/> },
    { title: '创建时间', dataIndex: 'createdAt', width: 164, render: clusterTimestamp, sorter: (left, right) => Date.parse(left.createdAt) - Date.parse(right.createdAt) },
    { title: '操作', key: 'actions', width: 158, render: (_, item) => <Space>
      {inferenceDemo ? <Button size="small" theme="borderless" onClick={() => setMonitoringId(item.id)}>指标详情</Button> : <>
      <Button size="small" theme="borderless" onClick={() => edit(item)}>编辑</Button>
      <Dropdown trigger="click" clickToHide render={<Dropdown.Menu>
        <Dropdown.Item onClick={() => setMonitoringId(item.id)}>指标详情</Dropdown.Item>
        {isCloudCluster(item.provider) ? <Dropdown.Item onClick={() => openPool(item)}>添加节点池</Dropdown.Item>
          : <Dropdown.Item onClick={() => setRegistrationTarget(item)}>{item.provider === 'Kubernetes' ? '注册集群' : '添加节点'}</Dropdown.Item>}
        <Dropdown.Item onClick={() => setTopologyId(item.id)}>集群拓扑</Dropdown.Item>
        {!item.isDefault && <Dropdown.Item onClick={() => queueAction({ kind: 'default', id: item.id })}>设为默认</Dropdown.Item>}
        {item.status !== '待注册' && <Dropdown.Item onClick={() => queueAction({ kind: 'maintenance', id: item.id })}>{item.status === '维护中' ? '恢复服务' : '进入维护'}</Dropdown.Item>}
        <Dropdown.Item type="danger" onClick={() => queueAction({ kind: 'delete', ids: [item.id] })}>删除</Dropdown.Item>
      </Dropdown.Menu>}><Button size="small" theme="borderless" aria-label={`${item.name} 的更多操作`}>更多</Button></Dropdown></>}
    </Space> },
  ];
  const actionTarget = lookup(action?.id);
  const actionTitle = action?.kind === 'delete' ? '删除集群' : action?.kind === 'default' ? '设为默认集群'
    : action?.kind === 'pool-delete' ? '删除节点池' : actionTarget?.status === '维护中' ? '恢复集群服务' : '将集群置于维护状态';
  const actionObject = action?.kind === 'delete' ? action.ids.map(id => lookup(id)?.name).filter(Boolean).join('、') : action?.pool?.name || actionTarget?.name;
  return <div className="admin-page-stack">
    <AdminPageHeading title={detail ? detail.name : '集群'}>
      {detail ? <Space><Button onClick={() => onNavigate('clusters')}>返回列表</Button>{!inferenceDemo && <>
        <Button onClick={() => edit(detail)}>编辑集群</Button>
        <Button onClick={() => setTopologyId(detail.id)}>集群拓扑</Button></>}</Space>
        : <Space><Button onClick={() => setMonitoringId('all')}>监控</Button>{!inferenceDemo &&
          <Button theme="solid" icon={<IconPlus aria-hidden="true"/>} onClick={() => edit()}>添加集群</Button>}</Space>}
    </AdminPageHeading>
    {detail ? <>
      <Card><Space wrap><Choice label="切换集群" options={state.clusters.map(item => [item.id, item.name])} value={detail.id}
        onChange={id => {
          const row = lookup(id);
          if (row) showDetail(row, params.get('tab') === 'pools' && !isCloudCluster(row.provider) ? 'nodes' : params.get('tab') || 'nodes');
        }}/>
        <AdminStatus value={detail.status}/><Text type="secondary">{detail.provider || '提供商未登记'}</Text></Space>
        <Descriptions layout="horizontal" column={2} size="small" data={[
          { key: 'Cluster ID', value: detail.clusterId }, { key: '可用区', value: detail.zone || '—' },
          { key: 'GPU 型号', value: detail.gpuType || '—' }, { key: 'GPU 占用', value: `${detail.allocatedGpu} / ${detail.totalGpu} 张` },
          { key: '描述', value: detail.description || '—' }, { key: '创建时间', value: clusterTimestamp(detail.createdAt) },
        ]}/>
      </Card>
      <Card title="系统负载" headerExtraContent={<Button size="small" onClick={() => setMonitoringId(detail.id)}>查看监控</Button>}>
        <ResourceMetrics rows={clusterNodes(detail.id)} devices={gpuChildren(detail.id)} summaryOnly/>
      </Card>
      <Tabs keepDOM lazyRender activeKey={params.get('tab') === 'gpus' ? 'gpus' : params.get('tab') === 'pools' && isCloudCluster(detail.provider) ? 'pools' : 'nodes'}
        onChange={tab => showDetail(detail, tab)}>
        <Tabs.TabPane tab="节点" itemKey="nodes"><Card>
          <ClusterResourceTable key={detail.id} kind="nodes" rows={clusterNodes(detail.id)} records={resourceRecords} onRefresh={refresh}
            onDetail={row => onNavigate(`ops-nodes?view=detail&record=${encodeURIComponent(row.id)}&clusterId=${encodeURIComponent(detail.id)}`)}/>
          <Space><Button onClick={() => showResources('ops-nodes', detail)}>节点列表</Button>{!inferenceDemo && !isCloudCluster(detail.provider) &&
            <Button theme="solid" onClick={() => setRegistrationTarget(detail)}>{detail.provider === 'Kubernetes' ? '注册集群' : '添加节点'}</Button>}</Space>
        </Card></Tabs.TabPane>
        <Tabs.TabPane tab="GPU" itemKey="gpus"><Card>
          <ClusterResourceTable key={detail.id} kind="gpus" rows={gpuChildren(detail.id)} records={resourceRecords} onRefresh={refresh}
            onDetail={row => onNavigate(`ops-gpus?view=detail&record=${encodeURIComponent(row.id)}&clusterId=${encodeURIComponent(detail.id)}`)}/>
          <Space><Button onClick={() => showResources('ops-gpus', detail)}>GPU 列表</Button></Space>
        </Card></Tabs.TabPane>
        {isCloudCluster(detail.provider) && <Tabs.TabPane tab="节点池" itemKey="pools"><Card>{poolRows(detail)}{!inferenceDemo &&
          <Button theme="solid" onClick={() => openPool(detail)}>添加节点池</Button>}</Card></Tabs.TabPane>}
      </Tabs>
    </> : <>
      {params.get('view') === 'detail' && <Banner type="warning" closeIcon={null} description="集群不存在，请返回列表核对。"/>}
      <div className="admin-analysis-metrics admin-analysis-metrics-three">
        <AnalysisMetric title="GPU 总量" value={state.clusters.reduce((sum, item) => sum + item.totalGpu, 0)}/>
        <AnalysisMetric title="已分配 GPU" value={state.clusters.reduce((sum, item) => sum + item.allocatedGpu, 0)}/>
        <AnalysisMetric title="运行集群" value={state.clusters.filter(item => item.status === '运行中').length}/>
      </div>
      <Card>
        <div className="admin-list-toolbar" role="group" aria-label="集群筛选">
          <Input className="admin-list-search" prefix={<IconSearch aria-hidden="true"/>} showClear aria-label="搜索集群" value={query} onChange={setQuery} placeholder="搜索 Cluster ID、名称或可用区"/>
          <Choice label="集群提供商" options={[[ 'all', '全部提供商' ], ...CLUSTER_PROVIDERS.map(value => [value, value])]} value={provider} onChange={setProvider}/>
          <Choice label="集群状态" options={[[ 'all', '全部状态' ], ...clusterStatus.map(value => [value, value])]} value={status} onChange={setStatus}/>
          <FilterReset onClick={() => { setQuery(''); setProvider('all'); setStatus('all'); setSelected([]); }}/>
          <Button onClick={refresh}>刷新</Button>
          {rows.some(item => item.nodePools?.length > 0) && <Button onClick={() => setExpanded(expanded.length ? [] : rows.filter(item => item.nodePools?.length).map(item => item.id))}>{expanded.length ? '收起全部' : '展开全部'}</Button>}
          {!inferenceDemo && <Button type="danger" disabled={rowSelection.length === 0} onClick={() => queueAction({ kind: 'delete', ids: rowSelection })}>
            批量删除{rowSelection.length > 0 ? ` (${rowSelection.length})` : ''}
          </Button>}
        </div>
        <Table columns={columns} dataSource={rows} rowKey="id" scroll={{ x: 1050 }} expandedRowRender={poolRows}
          rowExpandable={item => Boolean(item.nodePools?.length)} expandedRowKeys={expanded} onExpandedRowsChange={setExpanded}
          rowSelection={inferenceDemo ? undefined : { selectedRowKeys: rowSelection, onChange: setSelected }}
          pagination={{ pageSize: 10, size: 'small', showTotal: true, showSizeChanger: true }} empty="没有符合条件的集群"/>
      </Card>
    </>}
    {editor && <ClusterResourceEditor existing={editor.id ? lookup(editor.id) || editor : null} clusters={state.clusters}
      busy={pending} error={error} onRefresh={refresh}
      onSave={save} onClose={requestCloseEditor} onDirty={dirty}/>}
    {discard && <AdminModal visible title="放弃未保存的修改？" okText="放弃修改" cancelText="继续编辑" closeOnEsc
      onOk={closeEditor} onCancel={() => setDiscard(false)}/>}
    {registered && <AdminModal visible title="集群已创建" okText={registered.provider === 'Kubernetes' ? '注册集群' : '添加节点'} cancelText="暂时跳过"
      onOk={() => { setRegistrationTarget(registered); setRegistered(null); }} onCancel={() => setRegistered(null)}>
      <Paragraph>{registered.name}</Paragraph>
    </AdminModal>}
    {registrationTarget && <ClusterRegistration cluster={registrationTarget} clusters={state.clusters} onFinish={completeRegistration}
      onClose={() => !pending && setRegistrationTarget(null)} busy={pending} error={error}/>}
    {action && <AdminModal visible title={actionTitle} confirmLoading={pending} closeOnEsc={!pending} closable={!pending} onOk={runAction}
      okButtonProps={{ type: action.kind.includes('delete') ? 'danger' : 'primary', disabled: pending }}
      cancelButtonProps={{ disabled: pending }} onCancel={() => !writing.current && setAction(null)}>
      <Paragraph>{actionObject}</Paragraph>
      {error && <Banner type="danger" closeIcon={null} description={<Space wrap>{error}
        {refreshShared && <Button size="small" theme="borderless" onClick={refresh}>刷新工作区</Button>}</Space>}/>}
    </AdminModal>}
    {poolEditor && poolCluster && <NodePoolEditor cluster={poolCluster} pool={poolEditor.row} resize={poolEditor.resize} busy={pending}
      onSave={updatePool} onClose={() => !writing.current && setPoolEditor(null)}/>}
    {topology && <ClusterTopology key={topology.id} cluster={topology} nodes={clusterNodes(topology.id)} onRowsChange={setInfrastructure} dirtyRef={dirtyRef}
      onSaveLayers={async topologyLayers => {
        const issue = clusterGatherIssue(state.deployments, topology.id, topologyLayers);
        if (issue) throw Error(issue);
        return Boolean(await writeCluster({ type: 'update', id: topology.id, changes: { topologyLayers } }));
      }}
      onClose={() => { setTopologyId(''); if (params.has('topology')) onNavigate('clusters'); }}/>}
    {monitoringId && <AdminModal visible title={monitorTitle || '集群监控'} width="min(880px, calc(100vw - 32px))" footer={null} onCancel={() => setMonitoringId('')}>
      <ResourceMetrics rows={monitoringId === 'all' ? demoNodes : clusterNodes(monitoringId)}
        devices={monitoringId === 'all' ? infrastructure?.['ops-gpus'] : gpuChildren(monitoringId)}
        title="集群资源使用率" onClose={() => setMonitoringId('')}/>
    </AdminModal>}
  </div>;
}
