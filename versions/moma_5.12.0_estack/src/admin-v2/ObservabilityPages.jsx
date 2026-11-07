import { useEffect, useState } from 'react';
import { Button, Card, Descriptions, Input, Modal, Space, Table, Tag, Timeline, Toast, Typography } from '@douyinfe/semi-ui';
import { IconDownload, IconSearch } from '@douyinfe/semi-icons';
import { observedUsageTotal } from '../business-facts.mjs';
import { TimeSeriesChart } from '../components/AnalyticsCharts';
import { DEFAULT_PAGE_SIZE, PAGE_SIZES, FilterToolbar, FilterPresets, FilterReset } from '../components/FilterControls';
import OperationInputDialog from '../components/OperationInputDialog';
import { SelectedConditions } from '../components/SavedFilterViews';
import AdminPageHeading from './AdminPageHeading';
import AnalysisMetric from './AnalysisMetric';
import { DateRange, MultiPick } from './AnalyticsFilters';
import { Choice } from './ServiceUI';
import { filterAnalytics, matchesSelection, tokens } from './analytics';
import { groupRequests, percentile, beijingTime, monitoringWindow } from './observability';
import { usagePreset } from './usage-analysis';
import './semi-observability.css';

const { Paragraph, Text, Title } = Typography;
const stamp = beijingTime;
const typeNames = { text: '语言模型', multimodal: '多模态理解', image: '图片生成', video: '视频生成', audio: '语音模型', embedding: '向量模型', rerank: '排序模型' };
const dimensionLabels = { modelId: 'Model ID', keyId: 'API 密钥 ID', endpointId: 'Endpoint ID' };
const dimensionCollections = { modelId: 'models', keyId: 'apiKeys', endpointId: 'endpoints' };
const labelOf = (state, field, id) => state[dimensionCollections[field]].find(row => row.id === id)?.[field];
const metricValue = (metric, rows) => metric === '请求数' ? rows.length
  : metric === '失败率' ? (rows.length ? rows.filter(row => row.httpStatus >= 400).length / rows.length * 100 : 0)
    : metric === 'P95 延迟' ? (percentile(rows.map(row => row.durationMs), .95) || 0)
      : rows.reduce((sum, row) => sum + (metric === '生成任务数' ? row.usage.tasks || 0 : metric === '生成秒数' ? row.usage.seconds || 0 : metric === '向量数' ? row.usage.vectors || 0 : tokens(row)), 0);
const metricsFor = types => ['请求数',
  ...(types.some(type => ['text', 'multimodal'].includes(type)) ? ['Token 数'] : []),
  ...(types.includes('video') || types.includes('image') ? ['生成任务数'] : []),
  ...(types.includes('video') || types.includes('audio') ? ['生成秒数'] : []),
  ...(types.includes('embedding') ? ['向量数'] : []), 'P95 延迟', '失败率'];

function Status({ value }) {
  return <Tag color={['待确认', '处理中', '高', '未达标'].includes(value) || Number(value) >= 400 ? 'orange' : 'grey'}>{value}</Tag>;
}

function MetricChart({ state, requests, buckets, groupBy, selected, metric }) {
  const series = groupRequests(requests, groupBy, selected).map(group => ({
    label: labelOf(state, groupBy, group.key) || group.key,
    values: buckets.map(bucket => {
      const rows = group.requests.filter(row => Date.parse(row.createdAt) >= bucket.start && Date.parse(row.createdAt) < bucket.end);
      return rows.length ? Number(metricValue(metric, rows).toFixed(2)) : null;
    }),
  }));
  const unit = { '失败率': '%', 'P95 延迟': 'ms', 'Token 数': 'Token', '生成秒数': '秒', '向量数': '个' }[metric] || '次';
  return <TimeSeriesChart labels={buckets.map(bucket => stamp(new Date(bucket.start).toISOString()).slice(5))}
    series={series} height={420} label={metric} unit={unit}/>;
}

export function Monitoring({ state }) {
  const [groupBy, setGroupBy] = useState('modelId');
  const [selected, setSelected] = useState(null);
  const [metric, setMetric] = useState('Token 数');
  const [days, setDays] = useState('1');
  const items = state[dimensionCollections[groupBy]].map(row => ({ id: row.id, name: row[groupBy] }));
  const modelTypes = state.models.filter(row => groupBy !== 'modelId' || matchesSelection(selected, row.id)).map(row => row.type);
  const metrics = metricsFor(modelTypes);
  const activeMetric = metrics.includes(metric) ? metric : metrics[0];
  useEffect(() => {
    if (metric !== activeMetric) setMetric(activeMetric);
  }, [metric, activeMetric]);

  const { rows, buckets } = monitoringWindow(state.requests, Number(days));
  const requests = rows.filter(row => matchesSelection(selected, row[groupBy]));
  const ranked = groupRequests(requests, groupBy)
    .map(group => ({ id: group.key, name: labelOf(state, groupBy, group.key) || group.key, value: metricValue(activeMetric, group.requests) }))
    .sort((a, b) => b.value - a.value).slice(0, 10);
  const reset = () => { setDays('1'); setGroupBy('modelId'); setSelected(null); setMetric('Token 数'); };

  return <div className="admin-page-stack">
    <AdminPageHeading title="服务监控" description="按模型、API 密钥或端点对比调用质量，趋势与排行使用相同的时间和对象范围。"/>
    <Card>
      <FilterToolbar>
        <FilterPresets value={days} onChange={setDays} items={[[ '1', '近 24 小时' ], [ '7', '近 7 天' ]]}/>
        <Choice label="统计维度" value={groupBy} options={Object.entries(dimensionLabels).map(([id, name]) => [id, `按 ${name}`])}
          onChange={value => { setGroupBy(value); setSelected(null); }}/>
        <MultiPick label={dimensionLabels[groupBy]} items={items} value={selected} onChange={setSelected}/>
        <Choice label="监控指标" value={activeMetric} options={metrics.map(value => [value, value])} onChange={setMetric}/>
        <Text type="secondary">1 小时 · 北京时间</Text>
        <FilterReset onClick={reset}/>
      </FilterToolbar>
    </Card>
    <div className="admin-observe-monitor">
      <Card title={<Title heading={5} component="h2">{activeMetric} Top 10</Title>}>
        <Table size="small" rowKey="id" pagination={false} dataSource={ranked} empty="暂无符合条件的数据" columns={[
          { title: dimensionLabels[groupBy], dataIndex: 'name', render: (name, item, index) =>
            <Button theme="borderless" size="small" title={name} aria-pressed={selected?.includes(item.id) ?? false}
              onClick={() => setSelected([item.id])}>{index + 1}. {name}</Button> },
          { title: activeMetric, dataIndex: 'value', align: 'right', render: value => value.toLocaleString('zh-CN', { maximumFractionDigits: 2 }) },
        ]}/>
      </Card>
      <Card title={<Title heading={5} component="h2">{activeMetric}趋势</Title>}
        headerExtraContent={<Text type="secondary">{selected === null ? '全部对象' : `已选 ${selected.length} 项`}</Text>}>
        <MetricChart state={state} requests={requests} buckets={buckets} groupBy={groupBy} selected={selected} metric={activeMetric}/>
      </Card>
    </div>
  </div>;
}

function Detail({ request, state, close }) {
  const key = state.apiKeys.find(row => row.id === request.keyId);
  const endpoint = state.endpoints.find(row => row.id === request.endpointId);
  const total = observedUsageTotal(request.usage);
  const steps = request.resultSource === 'mock-ui' ? [
    ['结果来源', '本地 Mock 体验'], ['对外服务', request.serviceId], ['计量', '待确认；未产生真实扣费'],
  ] : [
    ['鉴权', key?.status === '有效' ? '通过' : '拒绝'], ['限流', '通过'], ['路由', request.releaseId],
    ['上游尝试', `${endpoint?.endpointId || '未采集'} · ${request.attempts?.[0]?.error || '成功'}`],
    ['计量', total == null ? '待确认' : `${total.toLocaleString()} 单位`],
  ];
  return <Modal visible title="请求链路详情" width="min(720px, calc(100vw - 32px))" closeOnEsc maskClosable={false} footer={null} onCancel={close}>
    <div className="admin-analytics-fields admin-observe-detail">
      <Text code>{request.requestId}</Text>
      <Descriptions data={[
        { key: '创建时间', value: stamp(request.createdAt) },
        { key: 'HTTP 状态', value: <Status value={String(request.httpStatus)}/> },
        { key: 'Model ID', value: request.publicModelId || labelOf(state, 'modelId', request.modelId) },
        { key: 'API 密钥 ID', value: key?.keyId },
      ]}/>
      <Timeline>
        {steps.map(([name, result]) => <Timeline.Item key={name}>
          <Text strong>{name}</Text>
          <Paragraph type="secondary">{result}</Paragraph>
        </Timeline.Item>)}
      </Timeline>
      <Title heading={6} component="h3">用量明细</Title>
      <pre>{JSON.stringify(request.usage, null, 2)}</pre>
    </div>
  </Modal>;
}

const defaultLogs = () => ({ ...usagePreset('today'), preset: 'today', model: null, tenant: null, provider: null,
  keys: null, type: '', source: '', status: '', failed: false, query: '' });
function initialLogs() {
  const scope = new URLSearchParams(location.hash.split('?')[1] || '');
  const values = defaultLogs();
  for (const field of ['model', 'tenant', 'provider']) {
    if (!scope.has(field)) continue;
    const value = scope.get(field);
    values[field] = value === '__none__' ? [] : value ? value.split(',').filter(Boolean) : null;
  }
  for (const field of ['start', 'end', 'type']) if (scope.get(field)) values[field] = scope.get(field);
  if (scope.has('start') || scope.has('end')) values.preset = 'custom';
  values.failed = scope.get('failed') === '1';
  return values;
}

export function Logs({ state }) {
  const [filters, setFilters] = useState(initialLogs);
  const [detail, setDetail] = useState(null);
  const [page, setPage] = useState(1);
  const [size, setSize] = useState(DEFAULT_PAGE_SIZE);
  const update = changes => { setFilters(current => ({ ...current, ...changes })); setPage(1); };
  const rows = filterAnalytics(state, { ...filters, source: '' }).filter(row =>
    matchesSelection(filters.keys, row.keyId)
    && (!filters.failed || row.httpStatus >= 400)
    && (!filters.source || row.source === filters.source)
    && (!filters.status || String(row.httpStatus) === filters.status)
    && row.requestId.toLowerCase().includes(filters.query.trim().toLowerCase()));
  const currentPage = Math.min(page, Math.max(1, Math.ceil(rows.length / size)));
  const dimensions = [
    ['model', '模型', state.models.map(row => ({ id: row.id, name: row.modelId }))],
    ['tenant', '客户', state.tenants], ['provider', '服务商', state.providers],
    ['keys', 'API 密钥 ID', state.apiKeys.map(row => ({ id: row.id, name: row.keyId }))],
  ];
  const groupItems = dimensions.filter(([field]) => filters[field] !== null).map(([field, label, items]) =>
    ({ label, items: filters[field].map(id => items.find(row => row.id === id)?.name || id) }));
  const groups = [
    ...(filters.preset === 'custom' ? [{ label: '日期范围', text: `${filters.start} — ${filters.end}` }] : []),
    ...groupItems,
  ];
  const exportCsv = () => {
    try {
      const body = [['Request ID', '创建时间（北京时间）', 'Model ID', 'API 密钥 ID', '来源', '用量', '状态'],
        ...rows.map(row => [row.requestId, stamp(row.createdAt), row.publicModelId || labelOf(state, 'modelId', row.modelId),
          labelOf(state, 'keyId', row.keyId), row.source, observedUsageTotal(row.usage), row.httpStatus])]
        .map(row => row.join(',')).join('\n');
      const link = document.createElement('a');
      link.href = URL.createObjectURL(new Blob([`\ufeff${body}`], { type: 'text/csv' }));
      link.download = '调用日志.csv';
      link.click();
      URL.revokeObjectURL(link.href);
      Toast.success('已开始下载调用日志');
    } catch {
      Toast.error('导出失败，请重试');
    }
  };
  return <div className="admin-page-stack">
    <AdminPageHeading title="调用日志与链路" description="查询当前筛选范围内的调用记录，时间均为北京时间。">
      <Button theme="solid" icon={<IconDownload aria-hidden="true"/>} onClick={exportCsv}>导出</Button>
    </AdminPageHeading>
    <Card>
      <div className="admin-analytics-fields">
        <FilterToolbar>
          <FilterPresets value={filters.preset} onChange={preset => update({ ...usagePreset(preset), preset })}>
            <DateRange start={filters.start} end={filters.end} allowLongRange onChange={range => update({ ...range, preset: 'custom' })}/>
          </FilterPresets>
          <Input className="admin-observe-search" prefix={<IconSearch aria-hidden="true"/>} aria-label="搜索 Request ID"
            value={filters.query} onChange={query => update({ query })} placeholder="搜索 Request ID" showClear/>
          {dimensions.map(([field, label, items]) =>
            <MultiPick key={field} label={label} items={items} value={filters[field]} onChange={value => update({ [field]: value })}/>)}
          <Choice label="模型类型" value={filters.type}
            options={[[ '', '全部模型类型' ], ...[...new Set(state.models.map(row => row.type))].map(type => [type, typeNames[type] || type])]}
            onChange={type => update({ type })}/>
          <Choice label="请求来源" value={filters.source}
            options={[[ '', '全部来源' ], ...[...new Set(state.requests.map(row => row.source))].map(source => [source, source])]}
            onChange={source => update({ source })}/>
          <Choice label="请求状态" value={filters.failed ? 'failed' : filters.status}
            options={[[ '', '全部状态' ], [ 'failed', '仅失败请求' ], ...[...new Set(state.requests.map(row => String(row.httpStatus)))].sort().map(status => [status, status])]}
            onChange={value => update({ failed: value === 'failed', status: value === 'failed' ? '' : value })}/>
          <FilterReset onClick={() => { setFilters(defaultLogs()); setPage(1); location.hash = '/admin-2/logs'; }}/>
        </FilterToolbar>
        {groups.length > 0 && <SelectedConditions groups={groups}/>}
      </div>
    </Card>
    <Card>
      <Table size="small" rowKey="id" dataSource={rows.slice((currentPage - 1) * size, currentPage * size)}
        scroll={{ x: 'max(100%, 1100px)' }} empty="没有符合条件的调用记录"
        pagination={{ currentPage, total: rows.length, pageSize: size, showTotal: true, showSizeChanger: true, pageSizeOpts: PAGE_SIZES,
          onPageChange: setPage, onPageSizeChange: value => { setSize(value); setPage(1); } }} columns={[
          { title: 'Request ID', dataIndex: 'requestId', width: 178, render: value => <Text code>{value}</Text> },
          { title: '创建时间（北京时间）', dataIndex: 'createdAt', width: 169, render: stamp },
          { title: 'Model ID', width: 135, render: (_, row) => row.publicModelId || labelOf(state, 'modelId', row.modelId) },
          { title: '请求来源', dataIndex: 'source', width: 90 },
          { title: 'API 密钥 ID', width: 174, render: (_, row) => labelOf(state, 'keyId', row.keyId) },
          { title: '用量', width: 70, align: 'right', render: (_, row) => observedUsageTotal(row.usage)?.toLocaleString() ?? '—' },
          { title: '首包延迟', dataIndex: 'ttftMs', width: 86, align: 'right', render: value => value ? `${value} ms` : '—' },
          { title: '延迟', dataIndex: 'durationMs', width: 74, align: 'right', render: value => `${value} ms` },
          { title: '状态', dataIndex: 'httpStatus', width: 60, render: value => <Status value={String(value)}/> },
          { title: '操作', width: 64, render: (_, row) => <Button size="small" theme="borderless" onClick={() => setDetail(row)}>详情</Button> },
        ]}/>
    </Card>
    {detail && <Detail request={detail} state={state} close={() => setDetail(null)}/>}
  </div>;
}

const actionTime = () => new Date().toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' });

export function Alerts({ state, dispatch, navigate }) {
  const update = (item, status) => dispatch({ type: 'update', collection: 'alerts', id: item.id,
    changes: { status, timeline: [...item.timeline, `${actionTime()} ${status}`] } });
  const incident = item => {
    if (state.incidents.some(row => row.alertIds.includes(item.id))) return navigate('incidents');
    const now = Date.now();
    const changes = [
      { type: 'update', collection: 'alerts', id: item.id, changes: { status: '已转事件' } },
      { type: 'add', collection: 'incidents', record: { id: `incident-${now}`, incidentId: `INC-${now}`, title: item.title,
        alertIds: [item.id], impact: '待评估', assignee: item.assignee, resolution: '', status: '处理中', timeline: ['由告警转入事件'] } },
    ];
    if (dispatch({ type: 'batch', objectId: item.id, changes })) navigate('incidents');
  };
  return <div className="admin-page-stack">
    <AdminPageHeading title="告警管理" description="确认、指派、恢复告警，并把需要协同的问题转入事件处理。"/>
    <div className="admin-observe-metrics">
      <AnalysisMetric title="活跃告警" value={state.alerts.filter(row => !['已恢复', '已转事件'].includes(row.status)).length}/>
      <AnalysisMetric title="高等级" value={state.alerts.filter(row => row.severity === '高').length}/>
      <AnalysisMetric title="告警规则" value={6}><Text type="secondary">4 条已启用</Text></AnalysisMetric>
    </div>
    <Card>
      <Table size="small" rowKey="id" pagination={false} dataSource={state.alerts} scroll={{ x: 'max(100%, 880px)' }} columns={[
        { title: '告警', dataIndex: 'title' },
        { title: '级别', dataIndex: 'severity', render: value => <Status value={value}/> },
        { title: '对象', dataIndex: 'objectId' },
        { title: '负责人', dataIndex: 'assignee', render: (value, row) =>
          <Choice size="small" label={`告警 ${row.id} 的处理人`} value={value}
            options={['运维人员', '平台管理员', '安全管理员'].map(name => [name, name])}
            onChange={assignee => dispatch({ type: 'update', collection: 'alerts', id: row.id, changes: { assignee } })}/> },
        { title: '状态', dataIndex: 'status', render: value => <Status value={value}/> },
        { title: '触发时间', dataIndex: 'startedAt', render: stamp },
        { title: '操作', render: (_, row) => <Space spacing={4}>
          {row.status === '待确认' && <Button theme="borderless" size="small" onClick={() => update(row, '处理中')}>确认</Button>}
          <Button theme="borderless" size="small" onClick={() => incident(row)}>转事件</Button>
          {row.status !== '已恢复' && <Button theme="borderless" size="small" onClick={() => update(row, '已恢复')}>恢复</Button>}
        </Space> },
      ]}/>
    </Card>
  </div>;
}

export function Incidents({ state, dispatch }) {
  const [closing, setClosing] = useState(null);
  const act = (item, status, resolution = item.resolution) => dispatch({ type: 'update', collection: 'incidents', id: item.id,
    changes: { status, resolution, timeline: [...(item.timeline ?? []), `${actionTime()} ${status}`] } });
  const closeIncident = resolution => {
    const item = state.incidents.find(row => row.id === closing.id);
    if (!item || item.status !== '已恢复') throw new Error('事件状态已变化，请重新打开操作');
    return act(item, '已关闭', resolution);
  };
  return <div className="admin-page-stack">
    <AdminPageHeading title="事件处理" description="协同处理服务故障；恢复服务与复盘关闭是两个独立阶段。"/>
    <div className="admin-analysis-plot-grid">
      {state.incidents.map(row => <Card key={row.id} title={<Title heading={5} component="h2">{row.title}</Title>}
        headerExtraContent={<Status value={row.status}/>}>
        <div className="admin-analytics-fields">
          <Text code>{row.incidentId}</Text>
          <Descriptions data={[
            { key: '影响', value: row.impact },
            { key: '负责人', value: row.assignee },
            { key: '关联告警', value: row.alertIds.length },
            ...(row.resolution ? [{ key: '复盘结论', value: row.resolution }] : []),
          ]}/>
          <Timeline>
            {row.timeline.map((line, index) => <Timeline.Item key={index}>{line}</Timeline.Item>)}
          </Timeline>
        </div>
        {row.status === '处理中' && <div className="admin-form-actions"><Button onClick={() => act(row, '已恢复')}>标记恢复</Button></div>}
        {row.status === '已恢复' && <div className="admin-form-actions"><Button theme="solid" onClick={() => setClosing(row)}>填写结论并关闭</Button></div>}
      </Card>)}
    </div>
    {closing && <OperationInputDialog title="关闭事件" description={closing.title} label="复盘结论"
      onSubmit={closeIncident} onClose={() => setClosing(null)}/>}
  </div>;
}

export function Sla({ state }) {
  const rows = groupRequests(state.requests, 'modelId').map(group => {
    const count = group.requests.length;
    const available = group.requests.filter(row => row.httpStatus < 400).length / count * 100;
    const durations = group.requests.map(row => row.durationMs);
    return {
      id: group.key, model: labelOf(state, 'modelId', group.key), count, available,
      p50: percentile(durations, .5), p95: percentile(durations, .95),
      incidents: state.incidents.filter(row => row.title.includes(state.models.find(model => model.id === group.key)?.name.split('-')[0])).length,
    };
  });
  return <div className="admin-page-stack">
    <AdminPageHeading title="服务质量报告" description="基于请求样本计算可用率和延迟分位数，并关联故障事件。"/>
    <Card>
      <Table size="small" rowKey="id" pagination={false} dataSource={rows} scroll={{ x: 'max(100%, 840px)' }} columns={[
        { title: 'Model ID', dataIndex: 'model' },
        { title: '样本数', dataIndex: 'count', align: 'right' },
        { title: '可用率', dataIndex: 'available', align: 'right', render: value => `${value.toFixed(2)}%` },
        { title: 'P50 延迟', dataIndex: 'p50', align: 'right', render: value => `${value} ms` },
        { title: 'P95 延迟', dataIndex: 'p95', align: 'right', render: value => `${value} ms` },
        { title: '故障事件', dataIndex: 'incidents', align: 'right' },
        { title: 'SLA 目标', align: 'right', render: () => '≥ 99.00%' },
        { title: '结果', render: (_, row) => <Status value={row.available >= 99 ? '达标' : '未达标'}/> },
      ]}/>
    </Card>
  </div>;
}

const pages = { monitoring: Monitoring, logs: Logs, alerts: Alerts, incidents: Incidents, sla: Sla };
export default function ObservabilityPage({ pageId, ...props }) {
  const Page = pages[pageId];
  return <Page {...props}/>;
}
