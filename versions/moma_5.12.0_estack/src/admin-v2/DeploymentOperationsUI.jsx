import { useMemo, useRef, useState } from 'react';
import { Banner, Button, Card, Input, InputNumber, Radio, RadioGroup, Space, TextArea, Tooltip, Typography } from './xa24/HaloUI.jsx';
import { Collapse } from './xa24/HaloUI.jsx';
import { dump, loadAll } from 'js-yaml';
import AdminActionMenu from './AdminActionMenu';
import AdminCollapsePanel from './AdminCollapsePanel';
import { AdminModal, AdminSideSheet } from './AdminOverlay';
import AdminDescriptions from './AdminDescriptions';
import AdminStatus from './AdminStatus';
import AdminTable from './AdminTable';
import { Choice } from './ServiceUI';
import { useChannelText } from './channel-language';
import { formatMonitoringTime, MonitoringRangeSummary, MonitoringTimeRange, useMonitoringScope } from './MonitoringTimeRange';
import { TimeSeriesChart } from '../components/AnalyticsCharts';
import { canRecreateInstance, deploymentConfig, deploymentHistory, deploymentImportPlan, deploymentInstances, deploymentTablePage, instanceFilterStates } from './deployments';
import { deploymentYamlText, readDeploymentYaml } from './deployment-gpustack-yaml';
import { deploymentCallTimeline, deploymentEndpointCalls, deploymentHardwareTimeline, deploymentLatencyStatistics } from './deployment-monitoring';

export function downloadText(name, text, type = 'text/plain;charset=utf-8') {
  const url = URL.createObjectURL(new Blob([text], { type }));
  const link = document.createElement('a');
  link.href = url;
  link.download = name;
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export function exportDeploymentYaml(rows, state, infrastructure) {
  downloadText(rows.length === 1 ? `${rows[0].deploymentId}.yaml` : 'deployments.yaml', deploymentYamlText(rows,state,infrastructure), 'application/x-yaml');
}

export function DeploymentYamlDialog({ item, state, infrastructure, close }) {
  const [copied,setCopied] = useState(false);
  const [error,setError] = useState('');
  let yaml;
  let unavailable;
  try { yaml = deploymentYamlText([item],state,infrastructure); }
  catch (issue) { unavailable = issue.message; }
  return <AdminModal visible title="部署 YAML" width="min(820px, calc(100vw - 28px))" onCancel={close} closeOnEsc footer={<Space>
    <Button disabled={!yaml} onClick={async()=>{
      try { await navigator.clipboard.writeText(yaml); setCopied(true); setError(''); }
      catch { setError('复制失败，请选中文本后复制'); }
    }}>{copied ? '已复制' : '复制'}</Button>
    <Button theme="solid" disabled={!yaml} onClick={()=>downloadText(`${item.deploymentId}.yaml`,yaml,'application/x-yaml')}>下载 YAML</Button>
  </Space>}>
    {(error || unavailable) && <Banner type="danger" closeIcon={null} description={error || unavailable}/>}
    {yaml && <TextArea className="deployment-yaml-text" aria-label="部署 YAML 配置" value={yaml} readOnly rows={20}/>}
  </AdminModal>;
}

function splitDeploymentYaml(text) {
  if (!text.trim() || text.length > 1024 * 1024) throw Error('请选择不超过 1 MiB 的 YAML 文件或粘贴内容');
  let documents;
  try { documents = loadAll(text).filter(entry=>entry!=null); }
  catch (issue) { throw Error(`YAML 格式有误${issue.mark?.line == null ? '' : `，请核对第 ${issue.mark.line + 1} 行`}`); }
  const [first] = documents;
  const entries = documents.length === 1 && (Array.isArray(first) || first?.deployments || first?.models)
    ? (Array.isArray(first) ? first : first.deployments ?? first.models) : documents;
  if (!Array.isArray(entries) || !entries.length || entries.length > 20) throw Error('每次导入 1–20 项部署');
  return entries;
}

export function DeploymentImportDialog({ state, infrastructure, validate, apply, close, busy, errorMessage }) {
  const [text, setText] = useState('');
  const [cluster, setCluster] = useState(undefined);
  const [plan, setPlan] = useState(null);
  const [error, setError] = useState('');
  const [fileName, setFileName] = useState('');
  const [overrides,setOverrides] = useState({});
  const [validated,setValidated] = useState(false);
  const [selected,setSelected] = useState('all');
  const [confirmOverwrite,setConfirmOverwrite] = useState(false);
  const [draftEntries,setDraftEntries] = useState([]);
  const [reading,setReading] = useState(false);
  const [wholeDraftEdited,setWholeDraftEdited] = useState(false);
  const readSequence = useRef(0);
  const edit = value => { setText(value); setError(''); setOverrides({}); setValidated(false); };
  const editWhole = value => { edit(value); setWholeDraftEdited(true); };
  const resetFile = value => { editWhole(value); setPlan(null); setDraftEntries([]); setSelected('all'); };
  const changes = (plan || []).filter(row=>row.operation!=='unchanged');
  const overwritten = changes.filter(row=>row.operation==='update');
  const listForCompare = selected==='all' ? plan || [] : (plan || []).filter(row=>row.data.deploymentId===selected);
  const activeDoc = plan?.findIndex(row=>row.data.deploymentId===selected) ?? -1;
  const existingYaml = listForCompare.flatMap(row=>{
    const current = state.deployments.find(item=>item.id===row.deploymentId && !item.retiredAt);
    if (!current) return [];
    try { return [deploymentYamlText([current],state,infrastructure)]; }
    catch (issue) { return [`# ${issue.message}\n`]; }
  }).join('---\n');
  const updateEntry = value => {
    const next = draftEntries.map((entry,index)=>index===activeDoc ? value : entry);
    setDraftEntries(next);
    edit(next.map(entry=>entry.endsWith('\n') ? entry : `${entry}\n`).join('---\n'));
  };
  const write = async () => {
    if (await apply(changes.map(row=>row.data),overwritten.map(row=>row.data.deploymentId))) close();
    else setConfirmOverwrite(false);
  };
  const preview = () => {
    let parsed;
    try {
      const documents = splitDeploymentYaml(text);
      const items = readDeploymentYaml(documents,state,cluster,infrastructure).map(row=>{
        if (!Object.hasOwn(overrides,row.deploymentId)) return row;
        const replicas = overrides[row.deploymentId];
        if (row.scalingSchedule?.enabled) return {...row,replicas,scalingSchedule:{...row.scalingSchedule,baseline_replicas:replicas}};
        return { ...row, replicas:replicas===0 ? row.replicas : replicas, importStopped:replicas===0 };
      });
      parsed = deploymentImportPlan(state,items);
      const changes = parsed.filter(row=>row.operation!=='unchanged').map(row=>row.data);
      setPlan(parsed);
      setDraftEntries(documents.map(document=>dump(document,{noRefs:true})));
      setWholeDraftEdited(false);
      if (!parsed.some(row=>row.data.deploymentId===selected)) setSelected('all');
      const blocked = parsed.filter(row=>row.issue).map(row=>`${row.data.name}：${row.issue}`);
      if (blocked.length) { setError(blocked.join('；')); setValidated(false); return; }
      if (changes.length) validate(changes,parsed.filter(row=>row.operation==='update').map(row=>row.data.deploymentId));
      setValidated(true); setError('');
    } catch (issue) { setError(issue.message); setValidated(false); }
  };
  return <><AdminModal visible width="min(1120px, calc(100vw - 28px))" title="导入部署 YAML"
    closeOnEsc={!busy && !confirmOverwrite} onCancel={() => { if (!busy && !confirmOverwrite) close(); }} footer={<Space wrap>
      <Button disabled={busy || confirmOverwrite} onClick={close}>取消</Button>
      <Button disabled={busy || reading || confirmOverwrite || !text.trim()} onClick={preview}>预览变更</Button>
      <Button disabled={!validated || !changes.length || reading || confirmOverwrite} loading={busy} theme="solid"
        onClick={()=>overwritten.length ? setConfirmOverwrite(true) : write()}>导入</Button>
    </Space>}>
    <div className="admin-analytics-fields">
      <Space wrap>
        <input type="file" aria-label="上传 YAML" accept=".yaml,.yml" disabled={busy || confirmOverwrite} onChange={async event => {
          const file = event.target.files?.[0];
          if (!file) return;
          const sequence = ++readSequence.current;
          setValidated(false);
          setReading(false);
          if (!/\.ya?ml$/i.test(file.name)) { setError('请选择 .yaml 或 .yml 文件'); return; }
          if (file.size > 1024 * 1024) { setError('文件超过 1 MiB'); return; }
          setReading(true);
          try {
            const content = await file.text();
            if (sequence===readSequence.current) { resetFile(content); setFileName(file.name); }
          } catch { if (sequence===readSequence.current) setError('无法读取 YAML 文件'); }
          finally { if (sequence===readSequence.current) setReading(false); }
        }}/>
        <Choice label="覆盖目标集群" value={cluster} showClear placeholder="沿用 YAML 中的集群" disabled={busy || confirmOverwrite}
          options={state.clusters.filter(row => row.status === '运行中').map(row => [row.id, row.name])}
          onChange={value => { setCluster(value); setValidated(false); }}/>
      </Space>
      {!plan && <TextArea rows={8} aria-label="部署 YAML 内容" value={text} disabled={busy || reading} onChange={editWhole} placeholder="选择文件或粘贴 YAML"/>}
      {fileName && <Typography.Text type="secondary">{fileName}</Typography.Text>}
      {(error || errorMessage) && <Banner type="danger" description={error || errorMessage} closeIcon={null}/>}
      {plan && <><AdminTable dataSource={plan.map(row=>({...row.data,operation:row.operation,issue:row.issue}))} rowKey="deploymentId" pagination={false} columns={[
        {title:'部署',dataIndex:'name'},
        {title:'结果',render:(_,row)=>row.issue || ({create:'新建部署',update:'更新现有部署',unchanged:'配置一致'})[row.operation]},
        {title:'目标集群',render:(_,row)=>state.clusters.find(cluster=>cluster.id===row.clusterId)?.name},
        {title:'目标副本',dataIndex:'replicas',render:(value,row)=><InputNumber min={0} max={100} disabled={busy || confirmOverwrite || Boolean(row.roles)}
          aria-label={row.name + ' 目标副本'} value={overrides[row.deploymentId] ?? (row.scalingSchedule?.enabled
            ? row.scalingSchedule.baseline_replicas : row.importStopped ? 0 : value)} onChange={replicas=>{
            setOverrides(previous=>({...previous,[row.deploymentId]:replicas}));setValidated(false);
          }}/>}
      ]}/><Choice label="对比范围" value={selected} disabled={wholeDraftEdited || reading || busy || confirmOverwrite}
        options={[[ 'all','整篇文档' ],...plan.map(row=>[row.data.deploymentId,row.data.name])]}
        onChange={setSelected}/>
        {selected!=='all' && <Typography.Text type="secondary">{`${listForCompare[0]?.fields?.length ?? 0} 项变更`}</Typography.Text>}
        <div className="deployment-yaml-compare">
          <label>集群现状 · 只读<TextArea aria-label="集群现状" rows={14} readOnly value={existingYaml || '集群里没有匹配的部署'}/></label>
          <label>待导入内容 · 可编辑<TextArea aria-label="待导入内容" rows={14} disabled={busy || confirmOverwrite} value={activeDoc<0 ? text : draftEntries[activeDoc] || ''}
            onChange={activeDoc<0 ? editWhole : updateEntry}/></label>
        </div>
      </>}
    </div>
  </AdminModal>{confirmOverwrite && <AdminModal visible title="确认覆盖部署" onCancel={()=>setConfirmOverwrite(false)}
    okText="导入" onOk={write} okButtonProps={{ loading:busy }} cancelButtonProps={{ disabled:busy }} closeOnEsc={!busy}>
    <Typography.Paragraph>下列部署的配置将以待导入内容更新。</Typography.Paragraph>
    <ul>{overwritten.map(row=><li key={row.data.deploymentId}>{row.data.name}</li>)}</ul>
  </AdminModal>}</>;
}

const instanceStatusLabels = new Map([...instanceFilterStates, ['initializing','初始化中'], ['downloading','下载中']]);
const instanceStatusColors = { running:'green', error:'red', starting:'orange', initializing:'orange', downloading:'blue' };
const logStates = new Set(['initializing','running','error','starting','downloading']);

export function DeploymentInstancesTable({ rows, state, can, onDetail, onLogs, onRestart, onBenchmark, canBenchmark,
  onDevice, detail = false, rowSelection, pagination, empty = '暂无模型实例' }) {
  const t = useChannelText();
  const [sort,setSort] = useState(null);
  const actions = row => {
    const hasLogs = logStates.has(row.state);
    const entries = [
      {node:'item',name:'查看日志',disabled:!detail && !hasLogs,onClick:()=>onLogs(row)},
      {node:'item',name:'下载日志',disabled:!hasLogs,onClick:()=>downloadText(`${row.name}.log`, instanceLog(row))},
      {node:'item',name:'基准测试',disabled:detail || row.state!=='running' || Boolean(row.role && row.role!=='router') || !canBenchmark(row.deployment),
        onClick:()=>onBenchmark(row.deployment,row)},
      {node:'item',name:'删除并重建',type:'danger',disabled:detail || !can || !canRecreateInstance(row),onClick:()=>onRestart(row)},
    ];
    return <AdminActionMenu label={`${row.name} ${t('操作')}`} items={entries}>{t('操作')}</AdminActionMenu>;
  };
  const columns = [
      {title:'名称',dataIndex:'name',width:218,sorter:(a,b)=>a.name.localeCompare(b.name),render:(name,row)=><div className="admin-table-record">
        {onDetail ? <Button theme="borderless" size="small" onClick={()=>onDetail(row.deployment)}>{name}</Button> : <Typography.Text>{name}</Typography.Text>}
        {row.backend && <Typography.Text type="tertiary" size="small">{row.backend}{row.backendVersion && ` (${row.backendVersion})`}</Typography.Text>}
      </div>},
      ...(!detail ? [{title:'集群',width:130,render:(_,row)=>state.clusters.find(cluster=>cluster.id===row.deployment.clusterId)?.name || '—'}] : [
        {title:'角色',width:105,render:(_,row)=>({ prefill:'预填充',decode:'解码',router:'路由' })[row.role] || '推理'},
      ]),
      {title:'节点',dataIndex:'workerName',width:130,render:name=>name || '—'},
      ...(detail ? [
        {title:'GPU 设备',width:165,render:(_,row)=>row.devices.length ? <Space wrap>{row.devices.map(device=>
          <Button key={device.id} theme="borderless" size="small" onClick={()=>onDevice(device.id)}>{device.name} · {device.index}</Button>)}</Space> : '—'},
        {title:'重启次数',dataIndex:'restartCount',width:90,render:value=>value ?? '—'},
      ] : [{title:'分配显存',dataIndex:'allocatedVram',width:115,sorter:(a,b)=>(a.allocatedVram ?? -1)-(b.allocatedVram ?? -1),
        render:(_,row)=>row.allocatedVram == null ? '—' : `${row.allocatedVram} GiB`}]),
      {title:'状态',width:110,render:(_,row)=>{
        const status = <AdminStatus value={row.state} label={instanceStatusLabels.get(row.state) || '未知'} color={instanceStatusColors[row.state] || 'grey'}/>;
        return row.statusMessage ? <Tooltip content={row.statusMessage}><span tabIndex={0}>{status}</span></Tooltip> : status;
      }},
      ...(!detail ? [{title:'创建时间',dataIndex:'createdAt',width:175,sorter:(a,b)=>String(a.createdAt || '').localeCompare(String(b.createdAt || '')),
        render:value=>value ? new Date(value).toLocaleString('zh-CN',{hour12:false}) : '—'}] : []),
      {title:'操作',key:'actions',width:90,fixed:'right',render:(_,row)=>actions(row)},
  ];
  return <AdminTable rowKey="id" dataSource={pagination ? deploymentTablePage(rows,columns,sort,pagination) : rows} empty={empty} rowSelection={rowSelection}
    pagination={pagination || { pageSize:10, showTotal:true, showSizeChanger:true }} scroll={{ x:'max(100%, 990px)' }}
    onChange={pagination ? ({ sorter })=>setSort(sorter) : undefined}
    columns={pagination ? columns.map(column=>column.sorter ? { ...column,sorter:true,sortOrder:sort?.dataIndex===column.dataIndex ? sort.sortOrder : false } : column) : columns}/>;
}

function instanceLog(row) {
  const entries = (row.deployment.events ?? []).filter(event => event.instanceId===row.id || !event.instanceId && event.instanceOrdinal===row.ordinal)
    .map(event => `${event.at} [${event.level}] ${event.message}`);
  return entries.length ? ['实例演示日志', ...entries].join('\n') : '暂无已采集日志';
}

export function DeploymentLogPanel({ row, close }) {
  const [query, setQuery] = useState('');
  const log = instanceLog(row);
  return <AdminSideSheet title={`${row.name} · 日志`} visible width="min(760px, 100vw)" onCancel={close} closeOnEsc footer={
    <Button onClick={()=>downloadText(`${row.name}.log`,log)}>下载日志</Button>}>
    <div className="admin-analytics-fields">
      <Input aria-label="搜索日志" showClear placeholder="搜索日志" value={query} onChange={setQuery}/>
      <pre className="infra-detail-value">{log.split('\n').filter(line=>line.toLowerCase().includes(query.toLowerCase())).join('\n') || '没有匹配日志'}</pre>
    </div>
  </AdminSideSheet>;
}

function MonitoringCharts({ report, noData }) {
  if (report.latest == null) return <Typography.Text type="secondary">{noData}</Typography.Text>;
  return <div className="admin-analysis-plot-grid">
    {report.charts.map(({ key, label, unit, series }) => {
      const visible = series.filter(row => row.values.some(Number.isFinite));
      return <Card key={key} title={label}>
        {visible.length ? <TimeSeriesChart height={200} label={label} unit={unit} labels={report.labels} series={visible}
          type={report.labels.length === 1 ? 'bar' : 'line'}/>
          : <Typography.Text type="secondary">未采集</Typography.Text>}
      </Card>;
    })}
  </div>;
}

export function DeploymentMonitorPanel({ item, infrastructure, requestState, refresh, instanceId }) {
  const scope = useMonitoringScope(refresh);
  const { start, end, range, refreshState, reload } = scope;
  const [view, setView] = useState('aggregate');
  const [statistics, setStatistics] = useState(['p95']);
  const instances = useMemo(() => deploymentInstances([item], infrastructure)
    .filter(row => !instanceId || row.id === instanceId), [item, infrastructure, instanceId]);
  const endpointCalls = useMemo(() => instanceId ? [] : deploymentEndpointCalls(item, requestState), [item, requestState, instanceId]);
  const service = useMemo(() => deploymentCallTimeline(endpointCalls, start, end, statistics), [endpointCalls, start, end, statistics]);
  const hardware = useMemo(() => deploymentHardwareTimeline(instances, infrastructure, start, end), [instances, infrastructure, start, end]);
  const refreshTime = refreshState.lastSuccess;
  return <div className="admin-page-stack" aria-busy={refreshState.loading}>
    <Space wrap>
      <MonitoringTimeRange scope={scope}/>
      {!instanceId && <RadioGroup type="button" value={view} aria-label="视图模式" onChange={event => setView(event.target.value)}>
        <Radio value="aggregate">聚合</Radio><Radio value="instances">按实例</Radio>
      </RadioGroup>}
      {!instanceId && view === 'aggregate' && <div role="group" aria-label="时延统计"><Space wrap>
        <Typography.Text type="secondary">时延统计</Typography.Text>
        {deploymentLatencyStatistics.map(([key, label]) => {
          const selected = statistics.includes(key);
          return <Button key={key} size="small" theme={selected ? 'solid' : 'light'} aria-pressed={selected} onClick={() => setStatistics(current =>
            selected ? (current.length > 1 ? current.filter(value => value !== key) : current) : [...current, key])}>{label}</Button>;
        })}
      </Space></div>}
      <Button onClick={reload} loading={refreshState.loading} disabled={!refresh}>刷新</Button>
    </Space>
    <MonitoringRangeSummary range={range}/>
    {refreshTime != null && <Typography.Text type="secondary" role="status">
      {refreshState.error ? '上次成功刷新' : '上次刷新'} {formatMonitoringTime(refreshTime)}
    </Typography.Text>}
    {refreshState.error && <Banner type="danger" closeIcon={null} description="刷新失败，已保留上次读取的监控数据。"/>}
    <Collapse keepDOM={false} defaultActiveKey={['service', 'instances', 'gpu', 'host']}>
      {!instanceId && view === 'aggregate' && <AdminCollapsePanel itemKey="service" header="服务体验">
        <div className="admin-page-stack">
          {service.latest != null && <Typography.Text type="secondary">
            网关调用记录{service.sourceLabels.length ? ` · ${service.sourceLabels.join('、')}` : ''}
            {' · 最近记录 '}{formatMonitoringTime(service.latest)} · 统计区间 {service.stepMinutes} 分钟
          </Typography.Text>}
          <MonitoringCharts report={service} noData="所选时间范围内暂无该部署端点的调用记录。"/>
        </div>
      </AdminCollapsePanel>}
      {(instanceId || view === 'instances') && <AdminCollapsePanel itemKey="instances" header="实例运行指标">
        <Typography.Text type="secondary">
          {instances.length ? '未采集逐实例运行指标。' : '暂无可确认的模型实例。'}
        </Typography.Text>
      </AdminCollapsePanel>}
      <AdminCollapsePanel itemKey="gpu" header="GPU 监控">
        <div className="admin-page-stack">
          {hardware.gpu.latest != null && <Typography.Text type="secondary">当前已知 GPU 的历史演示采样 · {formatMonitoringTime(hardware.gpu.latest)}</Typography.Text>}
          <MonitoringCharts report={hardware.gpu} noData={hardware.deviceCount ? '所选时间范围内暂无 GPU 采样。' : '暂无可确认归属的 GPU 设备。'}/>
        </div>
      </AdminCollapsePanel>
      <AdminCollapsePanel itemKey="host" header="主机监控">
        <div className="admin-page-stack">
          {hardware.host.latest != null && <Typography.Text type="secondary">当前已知节点的历史演示采样 · {formatMonitoringTime(hardware.host.latest)}</Typography.Text>}
          <MonitoringCharts report={hardware.host} noData={hardware.workerCount ? '所选时间范围内暂无主机采样。' : '暂无可确认归属的节点。'}/>
        </div>
      </AdminCollapsePanel>
    </Collapse>
  </div>;
}

export function DeploymentHistoryPanel({ item, can, rollback, close }) {
  const history = [...deploymentHistory(item)].reverse();
  const [selected, setSelected] = useState(history[0]?.revision);
  const record = history.find(row=>row.revision===selected);
  const current = deploymentConfig(item);
  const labels = { runtimeId:'运行时镜像', backend:'推理后端', backendVersion:'后端版本', weightPath:'权重路径', namespace:'命名空间', replicas:'副本数', gpuPerReplica:'每副本 GPU', maxModelLen:'最大上下文', roles:'PD 分离', scalingRules:'历史定时规则', scalingSchedule:'定时伸缩' };
  const differences = Object.entries(labels).filter(([field])=>JSON.stringify(record?.config[field])!==JSON.stringify(current[field]));
  return <AdminSideSheet title="配置版本历史" width="min(720px, 100vw)" visible onCancel={close} closeOnEsc footer={
    <Button theme="solid" disabled={!can || item.status!=='运行中' || !record || record.revision===item.configRevision} onClick={()=>rollback(record.revision)}>预览回滚</Button>}>
    <div className="admin-analytics-fields">
      <Choice label="配置版本" value={selected}
        options={history.map(row => [row.revision, `v${row.revision}${row.revision === item.configRevision ? '（当前）' : ''}`])}
        onChange={setSelected}/>
      {record ? <Card title="与当前配置比较">
        <AdminDescriptions data={differences.map(([field,label])=>({key:label,value:`${JSON.stringify(current[field]??'—')} → ${JSON.stringify(record.config[field]??'—')}`}))}/>
        {!differences.length && <Typography.Text type="secondary">没有配置差异</Typography.Text>}
      </Card> : <Typography.Text type="secondary">暂无可对比的配置版本</Typography.Text>}
    </div>
  </AdminSideSheet>;
}
