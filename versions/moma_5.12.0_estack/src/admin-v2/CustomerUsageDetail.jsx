import Table from './AdminTable';
import AdminPageHeading from './AdminPageHeading';
import { Banner, Card, Typography } from '@douyinfe/semi-ui';
import AnalysisMetric from './AnalysisMetric';
import { useEffect, useState } from 'react';
import { SemiDateRange as DateRange } from './SemiAnalyticsFilters';
import { FilterPresets, FilterReset, FilterToolbar } from '../components/FilterControls';
import { customerModelDetails, filterAnalytics } from './analytics';
import { formatUsageNumber, usageMeter, operationsPeriod, operationsPeriodFromQuery, usagePresets, usageValue } from './usage-analysis';
import { internalEnterprise } from './enterprise';
import { enterpriseProjectDepartment } from './enterprise-members';
import { Choice } from './ServiceUI';
import { chargeTotals, formatRequestCharge, requestCharge } from '../project-call.mjs';

const amount = value => value == null ? '—' : formatUsageNumber(value);

export default function CustomerUsageDetail({ state, internal }) {
  const [clock, setClock] = useState(Date.now);
  useEffect(() => { const sync = () => setClock(Date.now()); addEventListener('hashchange', sync); return () => removeEventListener('hashchange', sync); }, []);
  const params = new URLSearchParams(location.hash.split('?')[1] || '');
  const tenant = state.tenants.find(item => item.id === params.get('customer') && (!internal || internalEnterprise(state)?.id === item.id));
  const projects = state.projects.filter(project => project.tenantId === tenant?.id);
  const projectId = params.get('project');
  const project = projects.find(item => item.id === projectId);
  const { period, range: { start, end } } = operationsPeriodFromQuery(params, clock);
  const selectPeriod = (value, range) => {
    const now = Date.now(), selected = operationsPeriod(value, range, now), next = new URLSearchParams(params);
    next.set('period', selected.period); next.set('start', selected.range.start); next.set('end', selected.range.end);
    setClock(now); location.hash = '#/admin-2/customer-usage-detail?' + next;
  };
  const rows = tenant && (!projectId || project) ? filterAnalytics(state, { start, end, tenant: [tenant.id] })
    .filter(row => !projectId || row.projectId === projectId) : [];
  const modelsById = new Map(state.models.map(model => [model.id, model]));
  const chargeFor = row => (internal ? row.settlement === 'internal' : row.settlement !== 'internal')
    ? requestCharge(state, row, modelsById.get(row.modelId) || { type:row.modelType }) : null;
  const charged = chargeTotals(rows.map(chargeFor));
  const departments = new Map();
  if (internal) for (const row of rows.filter(request => request.settlement === 'internal')) {
    const id = row.departmentId || '';
    if (!departments.has(id)) departments.set(id, []);
    departments.get(id).push(row);
  }
  const departmentRows = [...departments].map(([id, requests]) => ({
    id, department:enterpriseProjectDepartment(state, { tenantId:tenant.id, organizationId:id }),
    calls:requests.length, cost:chargeTotals(requests.map(chargeFor)) || '待核算',
  }));
  const models = customerModelDetails(state, rows, start, end);
  const tokenModels = models.filter(model => model.unit === 'Token' && model.total != null);
  const tokenTotal = tokenModels.length ? tokenModels.reduce((sum, model) => sum + model.total, 0) : null;
  const requestUsage = row => {
    const meter = usageMeter(state.models.find(model => model.id === row.modelId), row);
    const value = usageValue(row, meter.fields);
    return value.complete ? `${amount(value.total)} ${meter.unit}` : '待确认';
  };
  const recent = [...rows].sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt)).slice(0, 10);
  if (!tenant) return <Banner type="warning" title="客户不存在" closeIcon={null}
    description={<Typography.Text link={{ href: '#/admin-2/user-analysis' }}>返回用户数据重新选择</Typography.Text>}/>;
  const modelColumns = [
    { title: '模型', dataIndex: 'model' },
    { title: '调用次数', dataIndex: 'calls', align: 'right', render: amount },
    { title: '计量用量', dataIndex: 'total', align: 'right', render: (total, model) => total == null ? '待确认'
      : `${amount(total)} ${model.unit}${model.pending > 0 ? ` · ${model.pending} 条待确认` : ''}` },
    { title: 'HTTP 请求成功率', dataIndex: 'success', align: 'right', render: value => value == null ? '—' : `${value.toFixed(2)}%` },
    { title: '区间峰值 TPM', dataIndex: 'peakTpm', align: 'right', render: amount },
    { title: '区间平均 TPM', dataIndex: 'avgTpm', align: 'right', render: amount },
  ];
  const callColumns = [
    { title: 'Request ID', dataIndex: 'requestId' },
    { title: '调用时间（北京时间）', dataIndex: 'createdAt', render: value => new Date(value).toLocaleString('zh-CN', { timeZone: 'Asia/Shanghai', hour12: false }) },
    { title: '模型', dataIndex: 'modelId', render: id => state.models.find(model => model.id === id)?.name || id },
    { title: '项目', dataIndex: 'projectId', render: id => projects.find(item => item.id === id)?.name || '未归属' },
    { title: 'API 密钥 ID', dataIndex: 'keyId', render: id => state.apiKeys.find(key => key.id === id)?.keyId || '—' },
    { title: '计量用量', key: 'usage', align: 'right', render: (_, row) => requestUsage(row) },
    { title: '状态码', dataIndex: 'httpStatus', align: 'right', render: value => value ?? '—' },
    { title: internal ? '内部成本' : '调用费用', key:'charge', align:'right', render: (_, row) => {
      const charge = chargeFor(row);
      return charge ? formatRequestCharge(charge) : row.httpStatus >= 200 && row.httpStatus < 300 ? '待核算' : '—';
    }},
  ];
  return <div className="admin-page-stack">
    <AdminPageHeading title={internal ? '企业用量与成本' : '客户用量账单'}
      description={[tenant.name, project?.name].filter(Boolean).join(' · ')}/>
    {projectId && !project && <Banner type="warning" closeIcon={null} description="所选项目不属于当前客户，请重新选择。"/>}
    <Card>
      <FilterToolbar>
        <FilterPresets label="时间筛选" value={period} onChange={value => selectPeriod(value)} items={usagePresets}/>
        <DateRange presets={usagePresets} start={start} end={end} allowLongRange rangeHint="最多 365 天" onChange={range => selectPeriod('custom', range)}/>
        <Choice label="项目" value={project?.id || (projectId ? 'invalid' : 'all')}
          options={[[ 'all', '全部项目' ], ...projects.map(item => [item.id,item.name]), ...(projectId && !project ? [[ 'invalid', '项目不可访问' ]] : [])]}
          onChange={value => {
            const next = new URLSearchParams(params);
            if (value === 'all') next.delete('project');
            else if (value !== 'invalid') next.set('project',value);
            location.hash = '#/admin-2/customer-usage-detail?' + next;
          }}/>
        <FilterReset onClick={() => selectPeriod('yesterday')}/>
      </FilterToolbar>
    </Card>
    <div className="admin-analysis-metrics admin-analysis-metrics-four">
      <AnalysisMetric title="Token 调用量" value={amount(tokenTotal)}/>
      <AnalysisMetric title="模型调用次数" value={amount(rows.length)}/>
      <AnalysisMetric title="调用模型数" value={new Set(rows.map(row => row.modelId)).size}/>
      <AnalysisMetric title={internal ? '已核算内部成本' : '已核算调用费用'} value={charged || '—'}/>
    </div>
    {internal && <Card title={<Typography.Title heading={5} component="h2">按主责部门归集</Typography.Title>}>
      <Table size="small" rowKey="id" pagination={false} dataSource={departmentRows}
        columns={[{ title:'主责部门', dataIndex:'department' }, { title:'调用次数', dataIndex:'calls', align:'right' },
          { title:'内部成本', dataIndex:'cost', align:'right' }]} empty="所选范围暂无内部调用"/>
    </Card>}
    <Card title={<Typography.Title heading={5} component="h2">模型用量明细</Typography.Title>}
      headerExtraContent={<Typography.Text type="secondary">{start} — {end} · 共 {rows.length} 次调用</Typography.Text>}>
      <Table size="small" rowKey="id" pagination={false} dataSource={models} columns={modelColumns}
        scroll={{ x: 'max(100%, 740px)' }} empty="所选时间范围暂无调用记录"/>
    </Card>
    <Card title={<Typography.Title heading={5} component="h2">最近调用</Typography.Title>}>
      <Table size="small" rowKey="id" pagination={false} dataSource={recent} columns={callColumns}
        scroll={{ x: 'max(100%, 740px)' }} empty="所选时间范围暂无调用记录"/>
    </Card>
  </div>;
}
