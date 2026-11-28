import TableFieldHelp from '../components/TableFieldHelp';
import { customerUsageFieldHelp } from './customer-usage-field-help';
import Table from './AdminTable';
import { internalSpace } from '../operating-space.mjs';
import { requestCharge } from '../project-call.mjs';
import AdminPageHeading from './AdminPageHeading';
import { XaBanner as Banner, XaCard as Card, XaChoice as Choice, XaTypography as Typography } from './xa24/HaloComponents.jsx';
import AnalysisMetric from './AnalysisMetric';
import { useEffect, useState } from 'react';
import { SemiDateRange as DateRange } from './SemiAnalyticsFilters';
import { FilterPresets, FilterReset, FilterToolbar } from '../components/FilterControls';
import { canAccessPage } from './navigation.mjs';
import { analysisProjects, unassignedProject } from './analysis-projects.mjs';
import { requestIdentity } from '../request-identity.mjs';
import { customerModelDetails, filterAnalytics } from './analytics';
import { formatUsageNumber, usageMeter, operationsPeriod, operationsPeriodFromQuery, usagePresets, usageValue } from './usage-analysis';

const amount = value => value == null ? '—' : formatUsageNumber(value);
const allProjects = '__all__';

export default function CustomerUsageDetail({ state }) {
  const [clock, setClock] = useState(Date.now);
  useEffect(() => { const sync = () => setClock(Date.now()); addEventListener('hashchange', sync); return () => removeEventListener('hashchange', sync); }, []);
  const params = new URLSearchParams(location.hash.split('?')[1] || '');
  const tenant = state.tenants.find(item => item.id === params.get('customer'));
  const internal=internalSpace(state.spacePolicy,tenant);
  const projectId = params.get('project') || '';
  const projects = tenant ? analysisProjects(state, tenant.id) : [];
  const project = projects.find(row => row.id === projectId);
  const { period, range: { start, end } } = operationsPeriodFromQuery(params, clock);
  const selectPeriod = (value, range) => {
    const now = Date.now(), selected = operationsPeriod(value, range, now), next = new URLSearchParams(params);
    next.set('period', selected.period); next.set('start', selected.range.start); next.set('end', selected.range.end);
    setClock(now); location.hash = '#/admin-2/customer-usage-detail?' + next;
  };
  const selectProject = value => {
    const next = new URLSearchParams(params);
    if (value) next.set('project', value);
    else next.delete('project');
    location.hash = '#/admin-2/customer-usage-detail?' + next;
  };
  const rows = tenant && (!projectId || project) ? filterAnalytics(state, {
    start, end, tenant: [tenant.id], project: projectId ? [projectId] : null,
  }) : [];
  const costOf=row=>internal ? row.internalCost : requestCharge(state,row,state.models.find(model=>model.id===row.modelId) || {type:row.modelType});
  const departmentName=id=>state.organizations.find(row=>row.tenantId===tenant?.id && row.id===id)?.name || (id || '未归属部门');
  const departments=new Map();
  if (internal) for (const row of rows.filter(item=>item.settlement==='internal' && item.httpStatus>=200 && item.httpStatus<300)) {
    const cost=costOf(row), key=JSON.stringify([row.departmentId || null,cost?.currency || null]);
    const entry=departments.get(key) || {id:key,department:departmentName(row.departmentId),currency:cost?.currency,micros:0,calls:0};
    entry.calls++;
    if (cost) entry.micros+=cost.micros;
    departments.set(key,entry);
  }
  const money=(micros,currency)=>currency && Number.isSafeInteger(micros)
    ? (currency==='CNY'?'¥ ':currency+' ')+(micros/1_000_000).toLocaleString('zh-CN',{maximumFractionDigits:6}) : '待核算';
  const models = customerModelDetails(state, rows, start, end);
  const tokenModels = models.filter(model => model.unit === 'Token' && model.total != null);
  const tokenTotal = tokenModels.length ? tokenModels.reduce((sum, model) => sum + model.total, 0) : null;
  const requestUsage = row => {
    const meter = usageMeter(state.models.find(model => model.id === row.modelId), row);
    const value = usageValue(row, meter.fields);
    return value.complete ? `${amount(value.total)} ${meter.unit}` : '待确认';
  };
  const recent = [...rows].sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt)).slice(0, 10);
  if (!tenant) return <Banner type="warning" title="租户不存在" closeIcon={null}
    description={<a href="#/admin-2/user-analysis">返回用户数据重新选择</a>}/>;
  const counts = new Map();
  if (!projectId) for (const row of rows) {
    const id = row.projectId || unassignedProject;
    counts.set(id, (counts.get(id) || 0) + 1);
  }
  const projectUsage = [...counts].map(([id,calls]) => ({ id,calls })).sort((a,b) => b.calls - a.calls || a.id.localeCompare(b.id));
  const modelColumns = [
    { title: '模型', dataIndex: 'model' },
    { title: '调用次数', dataIndex: 'calls', align: 'right', render: amount },
    { title: <TableFieldHelp name="计量用量" description={customerUsageFieldHelp.total}/>, dataIndex: 'total', align: 'right', render: (total, model) => total == null ? '待确认'
      : `${amount(total)} ${model.unit}${model.pending > 0 ? ` · ${model.pending} 条待确认` : ''}` },
    { title: <TableFieldHelp name="HTTP 请求成功率" description={customerUsageFieldHelp.success}/>, dataIndex: 'success', align: 'right', render: value => value == null ? '—' : `${value.toFixed(2)}%` },
    { title: <TableFieldHelp name="区间峰值 TPM" description={customerUsageFieldHelp.peakTpm}/>, dataIndex: 'peakTpm', align: 'right', render: amount },
    { title: <TableFieldHelp name="区间平均 TPM" description={customerUsageFieldHelp.avgTpm}/>, dataIndex: 'avgTpm', align: 'right', render: amount },
  ];
  const canViewLogs = canAccessPage(state.currentRole, 'logs');
  const logHref = (targetProject, query) => {
    const filters = new URLSearchParams({ tenant: tenant.id, start, end });
    if (targetProject) filters.set('project', targetProject);
    if (query) filters.set('request', query);
    return '#/admin-2/logs?' + filters;
  };
  const callColumns = [
    { title: 'Request ID', dataIndex: 'requestId', render: (value, row) => {
      if (!value) return '未采集';
      return canViewLogs ? <a href={logHref(row.projectId || unassignedProject, value)}>{value}</a> : value;
    } },
    { title: '项目', dataIndex: 'projectId', render: id => id ? projects.find(row => row.id === id)?.name || id : '未记录项目' },
    ...(internal ? [{title:'调用时所属部门',dataIndex:'departmentId',render:(id,row)=>row.settlement==='internal' ? departmentName(id) : '—'}] : []),
    {title:internal ? '内部成本' : '调用费用',render:(_,row)=>{const cost=costOf(row);return cost ? money(cost.micros,cost.currency) : '—';}},
    { title: '调用时间（北京时间）', dataIndex: 'createdAt', render: value => new Date(value).toLocaleString('zh-CN', { timeZone: 'Asia/Shanghai', hour12: false }) },
    { title: '模型', dataIndex: 'modelId', render: id => state.models.find(model => model.id === id)?.name || id },
    { title: 'API 密钥 ID', dataIndex: 'keyId', render: id => state.apiKeys.find(key => key.id === id)?.keyId || '—' },
    { title: '计量用量', key: 'usage', align: 'right', render: (_, row) => requestUsage(row) },
    { title: '状态码', dataIndex: 'httpStatus', align: 'right', render: value => value ?? '—' },
  ];
  return <div className="admin-page-stack xa24-page">
    <AdminPageHeading className="xa24-detail-header" title={internal ? '内部成本归集'+(project ? ' · '+project.name : '') : project && project.id!==unassignedProject ? '项目用量 · '+project.name : '租户用量'}>
      {tenant && <Typography.Text type="secondary">{tenant.name}</Typography.Text>}
      {canViewLogs && <a href={logHref(projectId)}>查看调用日志</a>}
    </AdminPageHeading>
    <Card className="xa24-page-card">
      <FilterToolbar>
        <FilterPresets label="时间筛选" value={period} onChange={value => selectPeriod(value)} items={usagePresets}/>
        <DateRange presets={usagePresets} start={start} end={end} allowLongRange rangeHint="最多 365 天" onChange={range => selectPeriod('custom', range)}/>
        <Choice label="项目" value={projectId || allProjects} options={[[allProjects, '全部项目'], ...projects.map(row => [row.id, row.name]),
          ...(projectId && !project ? [[projectId, '项目不可用']] : [])]} onChange={value => selectProject(value === allProjects ? '' : value)}/>
        <FilterReset onClick={() => selectPeriod('yesterday')}/>
      </FilterToolbar>
    </Card>
    {projectId && !project && <Banner type="warning" closeIcon={null} description="该项目不在当前租户的可查询范围。"/>}
    <div className="admin-analysis-metrics admin-analysis-metrics-four">
      <AnalysisMetric title="Token 调用量" value={amount(tokenTotal)}/>
      <AnalysisMetric title="模型调用次数" value={amount(rows.length)}/>
      <AnalysisMetric title="调用模型数" value={new Set(rows.map(row => row.modelId)).size}/>
      <AnalysisMetric title="调用 API 密钥数" value={new Set(rows.map(row => row.keyId).filter(Boolean)).size}/>
    </div>
    {internal && <Card title="部门成本明细" className="xa24-page-card">
      <Table size="small" rowKey="id" dataSource={[...departments.values()]} pagination={false} empty="所选范围暂无内部成本记录"
        columns={[
          {title:'调用时所属部门',dataIndex:'department'}, {title:'调用次数',dataIndex:'calls'},
          {title:'内部成本',render:(_,row)=>money(row.micros,row.currency)},
        ]}/>
    </Card>}
    {!projectId && <Card className="xa24-page-card" title={<Typography.Title heading={5} component="h2" className="xa24-card-title">项目调用明细</Typography.Title>}>
      <Table size="small" rowKey="id" dataSource={projectUsage} empty="所选时间范围暂无调用记录"
        pagination={{ pageSize: 10, hideOnSinglePage: true, showTotal: true }} columns={[
          { title: '项目', dataIndex: 'id', render: id => {
            const next = new URLSearchParams(params);
            next.set('project', id);
            return <a href={'#/admin-2/customer-usage-detail?' + next}>
              {projects.find(item => item.id === id)?.name || id}
            </a>;
          } },
          { title: '调用次数', dataIndex: 'calls', align: 'right', render: amount },
        ]}/>
    </Card>}
    <Card className="xa24-page-card" title={<Typography.Title heading={5} component="h2" className="xa24-card-title">模型用量明细</Typography.Title>}
      headerExtraContent={<Typography.Text type="secondary">{start} — {end} · 共 {rows.length} 次调用</Typography.Text>}>
      <Table size="small" rowKey="id" pagination={false} dataSource={models} columns={modelColumns}
        scroll={{ x: 'max(100%, 740px)' }} empty="所选时间范围暂无调用记录"/>
    </Card>
    <Card className="xa24-page-card" title={<Typography.Title heading={5} component="h2" className="xa24-card-title">最近调用</Typography.Title>}>
      <Table size="small" rowKey={requestIdentity} pagination={false} dataSource={recent} columns={callColumns}
        scroll={{ x: 'max(100%, 740px)' }} empty="所选时间范围暂无调用记录"/>
    </Card>
  </div>;
}
