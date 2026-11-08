import { useMemo, useState } from 'react';
import { Banner, Button, Card, Descriptions, Input, Space, Tabs, Timeline, Toast, Typography } from '@douyinfe/semi-ui';
import { IconCopy, IconDownload, IconSearch } from '@douyinfe/semi-icons';
import Table from './AdminTable';
import AdminStatus from './AdminStatus';
import AdminPageHeading from './AdminPageHeading';
import { AdminModal as Modal } from './AdminOverlay';
import { Choice } from './ServiceUI';
import { DEFAULT_PAGE_SIZE, FilterReset, FilterToolbar, PAGE_SIZES } from '../components/FilterControls';
import { SelectedConditions } from '../components/SavedFilterViews';
import { ObservationPick, ObservationSupplyPick, ObservationTimeRange, useObservationSupply } from './CallObservationControls';
import {
  callObservations, errorSignals, filterObservations, httpLabel, logCsv, observationFilters, observationHash, observationNumber as fmt,
  observationOptions, observationTime, observationWindow, outcomes,
} from './call-observations.mjs';

const { Text, Title } = Typography;
const unknown = value => value ?? '未采集';
const statusColumn = value => <AdminStatus value={httpLabel(value)}
  color={value == null ? 'grey' : value >= 200 && value < 300 ? 'green' : 'red'}/>;
const selectors = [['model', '模型'], ['callId', '对外调用标识'], ['user', '用户'], ['tenant', '租户'],
  ['source', '请求来源'], ['key', 'API 密钥名称'], ['endpoint', '端点']];
const outcomeOptions = [['all', '全部结果'], ...Object.entries(outcomes), ['other', '其他状态']];
const requestWidths = { requestId: 166, at: 174, modelIdentifier: 156, outcome: 92, status: 102, duration: 116,
  firstPacket: 130, providerName: 124, channelName: 130, provider: 136, channel: 144, total: 96, input: 104, output: 104,
  source: 104, userName: 100, user: 144, keyName: 128, keyDisplayId: 160, keyMasked: 140 };
const requestSections = [
  ['请求与结果', [
    ['请求 ID', 'requestId'], ['开始时间', 'at', observationTime], ['模型标识', 'modelIdentifier'],
    ['请求状态', 'outcome', value => outcomes[value]], ['状态码', 'status'],
    ['总耗时（ms）', 'duration'], ['首包延迟（ms）', 'firstPacket'],
  ]],
  ['路由归属', [
    ['供应商名称', 'providerName'], ['渠道名称', 'channelName'], ['供应商 ID', 'provider'], ['渠道 ID', 'channel'],
  ]],
  ['Token 用量', [['总 Token', 'total'], ['输入 Token', 'input'], ['输出 Token', 'output']]],
  ['调用方', [
    ['请求来源', 'source'], ['用户名称', 'userName'], ['用户 ID', 'user'],
    ['API 密钥名称', 'keyName'], ['API 密钥 ID', 'keyDisplayId'], ['API 密钥（脱敏）', 'keyMasked'],
  ]],
];
const requestColumns = requestSections.flatMap(([, fields]) => fields);
const attemptColumns = [
  ['尝试开始时间', 'at', observationTime], ['父 Request ID', 'requestId'], ['尝试序号', 'index'], ['上游 Request ID', 'upstreamRequestId'],
  ['实际服务商', 'providerName'], ['渠道', 'channelName'], ['端点', 'endpointName'], ['上游模型标识', 'upstreamModelId'],
  ['尝试结果', 'outcome', value => outcomes[value]], ['上游状态码', 'status'], ['耗时（ms）', 'duration'],
  ['错误来源', 'errorSource'], ['错误类型', 'code'], ['失败原因', 'errorReason'], ['回退原因', 'fallbackReason'],
];
const numericFields = new Set(['total', 'input', 'output', 'firstPacket', 'duration', 'index']);

async function copyRequestId(requestId) {
  try { await navigator.clipboard.writeText(requestId); Toast.success('Request ID 已复制'); }
  catch { Toast.error('复制失败，请选中 Request ID 后复制'); }
}

function RequestDetail({ row, attemptId, close }) {
  const blockedStage = /auth|scope/.test(row.blocked || '') ? '鉴权' : /limit|quota/.test(row.blocked || '') ? '限流' : '网关处理';
  return <Modal visible title="请求详情" width="min(760px, calc(100vw - 32px))" closeOnEsc maskClosable={false} footer={null} onCancel={close}>
    <div className="admin-analytics-fields admin-observe-detail">
      {requestSections.map(([title, fields]) => <section key={title} className="admin-analytics-fields">
        <Title heading={6} component="h3">{title}</Title>
        <Descriptions data={fields.map(([key, field, format]) => {
          const value = row[field];
          if (field === 'requestId' && value) return { key, value: <Space wrap>
            <Text code>{value}</Text>
            <Button size="small" icon={<IconCopy aria-hidden="true"/>} onClick={() => copyRequestId(value)}>复制 Request ID</Button>
          </Space> };
          if (field === 'outcome') return { key, value: <AdminStatus value={outcomes[value]}/> };
          if (field === 'status') return { key, value: httpLabel(value) };
          return { key, value: format ? format(value) : numericFields.has(field) ? fmt(value) : unknown(value) };
        })}/>
      </section>)}
      <Title heading={6} component="h3">补充信息</Title>
      <Descriptions data={[
        ['模型名称', row.modelName], ['租户', row.tenantName], ['首 Token 时延（ms）', fmt(row.ttft)],
        ['错误类型', row.code], ['错误来源', row.errorSource], ['失败原因', row.errorReason],
        ...(row.taskStatus == null ? [] : [['任务终态', row.taskStatus]]),
      ].map(([key, value]) => ({ key, value: unknown(value) }))}/>
      <Title heading={6} component="h3">请求链路</Title>
      {row.routeVersion == null && !row.blocked && !row.attempts.length ? <Text type="secondary">未采集链路记录</Text> : <Timeline>
        {row.routeVersion != null && <Timeline.Item><Text strong>路由版本</Text> {row.routeVersion}</Timeline.Item>}
        {row.attempts.map(attempt => <Timeline.Item key={attempt.id} type={attempt.outcome === 'failed' ? 'error' : 'default'}>
          <Space wrap>
            <Text strong>{attempt.id === attemptId ? '所选尝试 ' : '上游尝试 '}{attempt.index}</Text>
            <AdminStatus value={outcomes[attempt.outcome]}/>
          </Space>
          <Descriptions data={[
            ['尝试开始时间', observationTime(attempt.at)], ['服务商', attempt.providerName], ['渠道', attempt.channelName],
            ['端点', attempt.endpointName], ['上游模型标识', attempt.upstreamModelId], ['上游 Request ID', attempt.upstreamRequestId],
            ['上游状态码', httpLabel(attempt.status)], ['耗时（ms）', fmt(attempt.duration)],
            ...(attempt.code ? [['错误类型', attempt.code]] : []),
            ...(attempt.errorReason ? [['失败原因', attempt.errorReason]] : []),
            ...(attempt.fallback ? [['回退原因', attempt.fallbackReason]] : []),
          ].map(([key, value]) => ({ key, value: unknown(value) }))}/>
        </Timeline.Item>)}
        {row.blocked && <Timeline.Item type="error"><Text strong>{blockedStage}</Text> {row.blocked}</Timeline.Item>}
      </Timeline>}
    </div>
  </Modal>;
}

export default function CallLogsPage({ state, params }) {
  const [view, setView] = useState(() => params.get('view') === 'attempts' ? 'attempts' : 'requests');
  const [filters, setFilters] = useState(() => observationFilters(params));
  const [detail, setDetail] = useState(null);
  const [page, setPage] = useState(1);
  const [size, setSize] = useState(DEFAULT_PAGE_SIZE);
  const { requests, attempts } = useMemo(() => callObservations(state), [state]);
  const attemptView = view === 'attempts';
  const pool = attemptView ? attempts : requests;
  const supply = useObservationSupply(pool, filters.supply);
  const window = observationWindow(filters);
  const rows = filterObservations(pool, filters, window, { allowUntimed: attemptView })
    .sort((a, b) => (Number.isFinite(b.at) ? b.at : -Infinity) - (Number.isFinite(a.at) ? a.at : -Infinity) || a.id.localeCompare(b.id));
  const currentPage = Math.min(page, Math.max(1, Math.ceil(rows.length / size)));
  const change = patch => { setFilters(current => ({ ...current, ...patch })); setPage(1); };
  const chooseView = next => {
    setView(next);
    change({ outcome: '', http: '', errorSource: '', signal: '', upstreamQuery: '' });
  };
  const reset = () => {
    setFilters(observationFilters());
    setPage(1);
    history.replaceState(history.state, '', observationHash('logs', {}, { view: attemptView ? 'attempts' : null }));
  };
  const lookup = useMemo(() => new Map(requests.map(row => [row.id, row])), [requests]);
  const request = detail && lookup.get(detail.id);
  const displayed = selectors.filter(([key]) => key !== 'endpoint' || attemptView || filters.endpoint != null);
  const codes = [...new Set([...pool.map(row => String(row.status ?? 'unreported')), filters.http].filter(Boolean))]
    .sort((a, b) => a.localeCompare(b, 'zh-CN', { numeric: true }));
  const sources = [...new Set([...pool.map(row => row.errorSource), filters.errorSource].filter(Boolean))].sort();
  const selectedGroups = displayed.filter(([dimension]) => filters[dimension] != null).map(([dimension, label]) => {
    const names = new Map(observationOptions(pool, dimension).map(item => [item.id, item.name]));
    return { label, items: filters[dimension].map(id => names.get(id) || id) };
  });
  if (supply.group.items !== null) selectedGroups.push(supply.group);
  const showDetail = row => setDetail({ id: row.parentId || row.id, attemptId: row.parentId ? row.id : null });
  const requestIdCell = (value, row) => <Button className="admin-log-request-id" size="small" theme="borderless" onClick={() => showDetail(row)}
    title={value || undefined} aria-label={'查看请求详情 ' + (value || '')}>{value || '查看详情'}</Button>;
  const fields = attemptView ? attemptColumns : requestColumns;
  const columns = fields.map(([title, dataIndex, format]) => {
    const width = attemptView ? ['requestId', 'upstreamRequestId'].includes(dataIndex) ? 240 : dataIndex === 'at' ? 170 : 122
      : requestWidths[dataIndex];
    const column = { title, dataIndex, width };
    if (dataIndex === 'requestId') return { ...column, render: requestIdCell, ...(!attemptView && { fixed: 'left' }) };
    if (dataIndex === 'status') return { ...column, render: statusColumn };
    if (dataIndex === 'outcome') return { ...column, render: value => <AdminStatus value={outcomes[value]}/> };
    if (numericFields.has(dataIndex)) return { ...column, render: fmt, align: 'right' };
    return { ...column, render: format || unknown, ellipsis: { showTitle: true } };
  });
  const exportCsv = () => {
    const data = [fields.map(([title]) => title), ...rows.map(row => fields.map(([, key, format]) => format ? format(row[key]) : row[key]))];
    try {
      const href = URL.createObjectURL(new Blob([logCsv(data)], { type: 'text/csv;charset=utf-8' }));
      const link = document.createElement('a');
      link.href = href;
      link.download = attemptView ? '上游尝试.csv' : '调用日志.csv';
      document.body.append(link);
      link.click();
      link.remove();
      setTimeout(() => URL.revokeObjectURL(href), 0);
      Toast.success('已开始下载');
    } catch { Toast.error('导出失败，请重试'); }
  };
  return <div className="admin-page-stack">
    <AdminPageHeading title="调用日志">
      <Button theme="solid" icon={<IconDownload aria-hidden="true"/>} onClick={exportCsv} disabled={!rows.length}>导出筛选结果</Button>
    </AdminPageHeading>
    <Tabs activeKey={view} onChange={chooseView} aria-label="调用日志视图">
      <Tabs.TabPane itemKey="requests" tab="客户请求"/>
      <Tabs.TabPane itemKey="attempts" tab="上游尝试"/>
    </Tabs>
    <Card>
      <div className="admin-analytics-fields">
        <FilterToolbar>
          <ObservationTimeRange filters={filters} window={window} onChange={change}/>
          <FilterReset onClick={reset}/>
        </FilterToolbar>
        <FilterToolbar>
          <Input className="admin-observe-search" aria-label="搜索 Request ID" placeholder="搜索 Request ID"
            prefix={<IconSearch aria-hidden="true"/>} value={filters.query} onChange={value => change({ query: value })} showClear/>
          {attemptView && <Input className="admin-observe-search" aria-label="搜索上游 Request ID" placeholder="搜索上游 Request ID"
            prefix={<IconSearch aria-hidden="true"/>} value={filters.upstreamQuery} onChange={value => change({ upstreamQuery: value })} showClear/>}
          {displayed.map(([dimension, label]) => <ObservationPick key={dimension} dimension={dimension} label={label}
            rows={pool} filters={filters} onChange={change}/>)}
          <ObservationSupplyPick {...supply} onChange={change}/>
          {filters.type && <Button theme="light" onClick={() => change({ type: '' })}>清除模型类型条件</Button>}
        </FilterToolbar>
        <FilterToolbar>
          <Choice label={attemptView ? '尝试结果' : '最终结果'} value={filters.outcome || 'all'} options={outcomeOptions}
            onChange={value => change({ outcome: value === 'all' ? '' : value })}/>
          <Choice label={attemptView ? '上游状态码' : 'HTTP 状态码'} value={filters.http || 'all'}
            options={[[ 'all', '全部状态码' ], ...codes.map(code => [code, httpLabel(code === 'unreported' ? null : Number(code))])]}
            onChange={value => change({ http: value === 'all' ? '' : value })}/>
          {attemptView && <>
            <Choice label="错误来源" value={filters.errorSource || 'all'} options={[[ 'all', '全部错误来源' ], ...sources.map(value => [value, value])]}
              onChange={value => change({ errorSource: value === 'all' ? '' : value })}/>
            <Choice label="异常类型" value={filters.signal || 'all'} options={[[ 'all', '全部异常类型' ], ...errorSignals]}
              onChange={value => change({ signal: value === 'all' ? '' : value })}/>
          </>}
        </FilterToolbar>
        {selectedGroups.length > 0 && <SelectedConditions groups={selectedGroups}/>}
      </div>
    </Card>
    {!window && <Banner type="danger" closeIcon={null} description="请选择不超过 365 天的有效时间范围。"/>}
    <Card>
      <Table size="small" rowKey="id" columns={columns} dataSource={rows.slice((currentPage - 1) * size, currentPage * size)}
        scroll={{ x: 'max(100%, ' + columns.reduce((width, column) => width + column.width, 0) + 'px)' }} empty="没有符合条件的记录"
        pagination={{ currentPage, total: rows.length, pageSize: size, showTotal: true, showSizeChanger: true, pageSizeOpts: PAGE_SIZES,
          onPageChange: setPage, onPageSizeChange: value => { setSize(value); setPage(1); } }}/>
    </Card>
    {request && <RequestDetail row={request} attemptId={detail.attemptId} close={() => setDetail(null)}/>}
  </div>;
}
