import { useState } from 'react';
import { Banner, Button, Card, Input, InputNumber, Space, TextArea, Typography } from '@douyinfe/semi-ui';
import { dump, loadAll } from 'js-yaml';
import AdminActionMenu from './AdminActionMenu';
import { AdminModal, AdminSideSheet } from './AdminOverlay';
import AdminDescriptions from './AdminDescriptions';
import AdminStatus from './AdminStatus';
import AdminTable from './AdminTable';
import { Choice } from './ServiceUI';
import { TimeSeriesChart } from '../components/AnalyticsCharts';
import { deploymentConfig, deploymentHistory, deploymentImportPlan, deployableModels } from './deployments';
import { deploymentSeries } from './observability';

export function downloadText(name, text, type = 'text/plain;charset=utf-8') {
  const url = URL.createObjectURL(new Blob([text], { type }));
  const link = document.createElement('a');
  link.href = url;
  link.download = name;
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export function exportDeploymentYaml(rows, state) {
  const models = deployableModels(state);
  const documents = rows.map(row => ({
    name: row.name, deploymentId: row.deploymentId,
    cluster_name: state.clusters.find(cluster => cluster.id === row.clusterId)?.name,
    model: models.find(model => model.id === row.modelId)?.modelId,
    ...deploymentConfig(row),
  }));
  downloadText(rows.length === 1 ? `${rows[0].deploymentId}.yaml` : 'deployments.yaml',
    documents.map(row=>dump(row,{noRefs:true})).join('---\n'), 'application/x-yaml');
}

function readDeploymentYaml(text, state, chosenCluster) {
  if (!text.trim() || text.length > 1024 * 1024) throw Error('请选择不超过 1 MiB 的 YAML 文件或粘贴内容');
  let documents;
  try { documents = loadAll(text); }
  catch (issue) { throw Error(`YAML 格式有误${issue.mark?.line == null ? '' : `，请核对第 ${issue.mark.line + 1} 行`}`); }
  const [first] = documents;
  const entries = documents.length === 1 && (Array.isArray(first) || first?.deployments || first?.models)
    ? (Array.isArray(first) ? first : first.deployments ?? first.models) : documents;
  if (!Array.isArray(entries) || !entries.length || entries.length > 20) throw Error('每次导入 1–20 项部署');
  const deployable = deployableModels(state);
  return entries.map((entry, index) => {
    if (!entry || typeof entry.name !== 'string' || !entry.name.trim()) throw Error(`第 ${index + 1} 项缺少部署名称`);
    const config = deploymentConfig(entry);
    const clusterKey = entry.clusterId ?? entry.cluster_name ?? entry.cluster;
    const clusters = state.clusters.filter(row => chosenCluster ? row.id === chosenCluster :
      row.id === clusterKey || row.clusterId === clusterKey || row.name === clusterKey);
    const matches = deployable.filter(row => entry.modelId ? row.id === entry.modelId :
      [entry.model, entry.huggingface_repo_id?.split('/').at(-1), entry.model_scope_model_id?.split('/').at(-1)].includes(row.modelId));
    if (clusters.length !== 1 || matches.length !== 1) throw Error(`${entry.name} 的集群或已登记模型无法唯一确定`);
    const remoteSource = ({ huggingface:'Hugging Face', model_scope:'ModelScope', local_path:'本地路径' })[entry.source];
    return {
      ...Object.fromEntries(Object.entries(config).filter(([,value]) => value !== undefined)),
      name: entry.name, deploymentId: entry.deploymentId || entry.name, clusterId: clusters[0].id, modelId: matches[0].id,
      runtimeMode: config.runtimeMode || (entry.backend && entry.backend_version ? '推理后端版本' : '已登记运行时镜像'),
      backend: config.backend || entry.backend, backendVersion: config.backendVersion || entry.backend_version,
      source: remoteSource || config.source || '本地路径',
      repository: config.repository || entry.huggingface_repo_id || entry.model_scope_model_id,
      filename: config.filename || entry.huggingface_filename,
      namespace: config.namespace || 'inference', gpuPerReplica: config.gpuPerReplica || entry.gpu_selector?.gpu_ids?.length || 1,
      tensorParallel: config.tensorParallel || config.gpuPerReplica || entry.gpu_selector?.gpu_ids?.length || 1,
      pipelineParallel: config.pipelineParallel || 1, replicas: config.replicas ?? 1,
      weightPath: config.weightPath || entry.local_path || (remoteSource && matches.length === 1 ? `/models/${matches[0].modelId}` : ''),
      gpuMemoryUtilization: config.gpuMemoryUtilization ?? .9, startupTimeout:config.startupTimeout ?? 600,
    };
  });
}

export function DeploymentImportDialog({ state, validate, apply, close, busy, errorMessage }) {
  const [text, setText] = useState('');
  const [cluster, setCluster] = useState(undefined);
  const [plan, setPlan] = useState(null);
  const [error, setError] = useState('');
  const [fileName, setFileName] = useState('');
  const [overrides,setOverrides] = useState({});
  const [validated,setValidated] = useState(false);
  const edit = value => { setText(value); setPlan(null); setError(''); setOverrides({}); setValidated(false); };
  const preview = () => {
    try {
      const items = readDeploymentYaml(text,state,cluster).map(row=>({
        ...row, ...(Object.hasOwn(overrides,row.deploymentId) ? {replicas:overrides[row.deploymentId]} : {}),
      }));
      const preview = deploymentImportPlan(state,items);
      const changes = preview.filter(row=>row.operation!=='unchanged').map(row=>row.data);
      if (changes.length) validate(changes);
      setPlan(preview);
      setValidated(true);
      setError('');
    } catch (issue) { setError(issue.message); setPlan(null); }
  };
  return <AdminModal visible width="min(760px, calc(100vw - 28px))" title="导入部署 YAML"
    closeOnEsc={!busy} onCancel={() => { if (!busy) close(); }} footer={<Space wrap>
      <Button disabled={busy} onClick={close}>取消</Button>
      <Button disabled={busy || !text.trim()} onClick={preview}>预览变更</Button>
      <Button disabled={!validated || !plan?.some(row=>row.operation!=='unchanged')} loading={busy} theme="solid" onClick={async () => {
        if (await apply(plan.filter(row=>row.operation!=='unchanged').map(row=>row.data))) close();
      }}>确认导入</Button>
    </Space>}>
    <div className="admin-analytics-fields">
      <Space wrap>
        <input type="file" aria-label="上传 YAML" accept=".yaml,.yml" onChange={async event => {
          const file = event.target.files?.[0];
          if (!file) return;
          if (file.size > 1024 * 1024) { setError('文件超过 1 MiB'); return; }
          setFileName(file.name); edit(await file.text());
        }}/>
        <Choice label="覆盖目标集群" value={cluster} showClear placeholder="沿用 YAML 中的集群"
          options={state.clusters.filter(row => row.status === '运行中').map(row => [row.id, row.name])}
          onChange={value => { setCluster(value); setPlan(null); setValidated(false); }}/>
      </Space>
      <TextArea rows={8} aria-label="部署 YAML 内容" value={text} onChange={edit} placeholder="选择文件或粘贴 YAML"/>
      {fileName && <Typography.Text type="secondary">{fileName}</Typography.Text>}
      {(error || errorMessage) && <Banner type="danger" description={error || errorMessage} closeIcon={null}/>}
      {plan && <AdminTable dataSource={plan.map(row=>({...row.data,operation:row.operation}))} rowKey="deploymentId" pagination={false} columns={[
        {title:'部署',dataIndex:'name'},
        {title:'结果',render:(_,row)=>({create:'新建部署',update:'更新现有部署',unchanged:'配置一致'})[row.operation]},
        {title:'目标集群',render:(_,row)=>state.clusters.find(cluster=>cluster.id===row.clusterId)?.name},
        {title:'目标副本',dataIndex:'replicas',render:(value,row)=><InputNumber min={1} max={100}
          aria-label={row.name + ' 目标副本'} value={overrides[row.deploymentId] ?? value} onChange={replicas=>{
            setOverrides(previous=>({...previous,[row.deploymentId]:replicas}));setValidated(false);
          }}/>}
      ]}/>}
    </div>
  </AdminModal>;
}

export const deploymentInstances = deployments => deployments.flatMap(deployment =>
  Number.isInteger(deployment.readyReplicas) && deployment.status !== '停止' ?
    Array.from({length:deployment.replicas}, (_, index) => ({
      id:`${deployment.id}:${index + 1}`, ordinal:index + 1, name:`${deployment.deploymentId}-${index + 1}`, deployment,
      status:deployment.rebuildingInstance === index + 1 ? '重建中' : index < deployment.readyReplicas + Number(Boolean(deployment.rebuildingInstance)) ? '运行中' :
        deployment.status === '失败' ? '失败' : '等待就绪',
    })) : []);

export function DeploymentInstancesTable({ rows, state, can, onDetail, onLogs, onRestart, onBenchmark, canBenchmark }) {
  return <AdminTable rowKey="id" dataSource={rows} empty="暂无已登记的实例" pagination={{ pageSize:10, showTotal:true }}
    scroll={{ x:'max(100%, 760px)' }} columns={[
      {title:'实例名称',dataIndex:'name',width:190,render:(name,row)=><Button theme="borderless" onClick={()=>onLogs(row)}>{name}</Button>},
      {title:'部署',width:175,render:(_,row)=><Button theme="borderless" onClick={()=>onDetail(row.deployment)}>{row.deployment.name}</Button>},
      {title:'集群',width:135,render:(_,row)=>state.clusters.find(cluster=>cluster.id===row.deployment.clusterId)?.name || '—'},
      {title:'GPU 配额',width:100,render:(_,row)=>row.deployment.gpuPerReplica},
      {title:'状态',width:90,render:(_,row)=><AdminStatus value={row.status}/>},
      {title:'操作',width:105,render:(_,row)=><AdminActionMenu label={`${row.name} 操作`} items={[
        {node:'item',name:'查看日志',onClick:()=>onLogs(row)},
        {node:'item',name:'下载日志',onClick:()=>downloadText(`${row.name}.log`, instanceLog(row))},
        ...(row.status==='运行中' ? [
          ...(canBenchmark?.(row.deployment) ? [{node:'item',name:'基准测试',onClick:()=>onBenchmark(row.deployment,row.ordinal)}] : []),
          {node:'item',name:'删除并重建',type:'danger',disabled:!can,onClick:()=>onRestart(row)},
        ] : []),
      ]}/>},
    ]}/>;
}

function instanceLog(row) {
  const entries = (row.deployment.events ?? []).map(event => `${event.at} [${event.level}] ${event.message}`);
  return entries.length ? ['部署演示事件', ...entries].join('\n') : '暂无已采集日志';
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

export function DeploymentMonitorPanel({ item }) {
  const [metric, setMetric] = useState('请求吞吐');
  const [range, setRange] = useState(24);
  const metrics = ['请求吞吐','P95 延迟','GPU 利用率'];
  const count = range === 24 ? 13 : range === 6 ? 7 : 3;
  return <div className="admin-analytics-fields">
    <Space wrap>
      <Choice label="监控指标" value={metric} options={metrics.map(value => [value, value])} onChange={setMetric}/>
      <Choice label="监控时间范围" value={range} options={[1,6,24].map(value => [value, `近 ${value} 小时`])} onChange={setRange}/>
      <Typography.Text type="tertiary">模拟数据</Typography.Text>
    </Space>
    {item.status === '运行中' ? <TimeSeriesChart height={245} label={metric} unit={metric==='P95 延迟'?'ms':metric==='GPU 利用率'?'%':'req/s'}
      labels={Array.from({length:count},(_,index)=>index===count-1?'现在':`-${Math.round(range*(count-1-index)/(count-1)*60)} 分钟`)}
      series={[{label:item.name,values:deploymentSeries(item,metric).slice(-count).map(value=>metric==='GPU 利用率'?Math.min(value,100):value)}]}/>
      : <Typography.Text type="secondary">暂无运行中实例的监控数据</Typography.Text>}
  </div>;
}

export function DeploymentHistoryPanel({ item, can, rollback, close }) {
  const history = [...deploymentHistory(item)].reverse();
  const [selected, setSelected] = useState(history[0]?.revision);
  const record = history.find(row=>row.revision===selected);
  const current = deploymentConfig(item);
  const labels = { runtimeId:'运行时镜像', backend:'推理后端', backendVersion:'后端版本', weightPath:'权重路径', namespace:'命名空间', replicas:'副本数', gpuPerReplica:'每副本 GPU', maxModelLen:'最大上下文', roles:'PD 分离', scalingRules:'定时扩缩容' };
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

export function ScaleScheduleFields({ rules, change }) {
  const update = (index, patch) => change(rules.map((rule, i) => index === i ? { ...rule, ...patch } : rule));
  return <div className="admin-analytics-fields">
    {rules.map((rule,index)=><Space key={index} wrap>
      <Choice label={`第 ${index+1} 条的星期`} multiple value={rule.days}
        options={['一','二','三','四','五','六','日'].map((label, i) => [i+1, `周${label}`])}
        onChange={days=>update(index,{days})}/>
      <Input type="time" aria-label={`第 ${index+1} 条的时间`} value={rule.time} onChange={time=>update(index,{time})}/>
      <InputNumber aria-label={`第 ${index+1} 条目标副本`} min={0} max={100} value={rule.replicas} onChange={replicas=>update(index,{replicas})}/>
      <Button type="danger" theme="borderless" onClick={()=>change(rules.filter((_,i)=>i!==index))}>移除</Button>
    </Space>)}
    <Button theme="light" disabled={rules.length>=24} onClick={()=>change([...rules,{days:[1,2,3,4,5],time:'09:00',replicas:1}])}>添加调度规则</Button>
  </div>;
}
