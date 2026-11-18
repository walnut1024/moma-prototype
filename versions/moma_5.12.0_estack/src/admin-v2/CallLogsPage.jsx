import { workspaceStoragePrefix } from '../workspace-storage.mjs';
import { useEffect, useMemo, useState } from 'react';
import { Banner, Button, Card, CheckboxGroup, Empty, Input, Space, Switch, Tabs, Toast, Typography } from '@douyinfe/semi-ui';
import { IconArrowDown, IconArrowUp, IconDownload, IconSearch, IconSetting, IconSort } from '@douyinfe/semi-icons';
import Table from './AdminTable';
import AdminStatus from './AdminStatus';
import AdminPageHeading from './AdminPageHeading';
import { AdminModal as Modal } from './AdminOverlay';
import RequestLogDetail from './RequestLogDetail';
import { Choice } from './ServiceUI';
import { DEFAULT_PAGE_SIZE, FilterReset, FilterToolbar, PAGE_SIZES } from '../components/FilterControls';
import {
  ObservationConditions, ObservationFilterGroup, ObservationFilterLayout, ObservationIdentitySearch, ObservationPick,
  ObservationSupplyPick, ObservationTimeRange, observationConditions, useObservationSupply,
} from './CallObservationControls';
import {
  callObservations, changeObservationTenant, compareLogRows, errorSignals, filterObservations, httpLabel, logCsv, modelTypes,
  observationFilters, observationHash, observationKey, observationNumber as fmt, observationTime, observationWindow, outcomes, purposeLabels,
} from './call-observations.mjs';
import { createCallLogSimulation, simulateLogRequest, routingDemoRequestId } from './call-log-simulation.mjs';

const { Text } = Typography;
const unknown = value => value ?? '未采集';
const statusColumn = value => <AdminStatus value={httpLabel(value)}
  color={value == null ? 'grey' : value >= 200 && value < 300 ? 'green' : 'red'}/>;
const selectors = [['model', '模型'], ['callId', '模型调用标识'], ['user', '调用用户'], ['tenant', '客户'],
  ['project', '项目'], ['purpose', '调用类型'], ['source', '请求来源'], ['key', 'API 密钥'], ['endpoint', '端点']];
const outcomeOptions = [['all', '全部结果'], ...Object.entries(outcomes), ['other', '其他状态']];
const userRecordOptions = [['all', '全部调用用户'], ['recorded', '已采集'], ['uncollected', '未采集']];
const requestWidths = { requestId: 166, at: 174, modelName: 154, callId: 156, outcome: 92, status: 102, duration: 116,
  firstPacket: 130, providerName: 124, channelName: 130, provider: 136, channel: 144, total: 96, input: 104, output: 104,
  source: 104, purpose: 104, tenantName: 140, projectName: 148, project: 154, userName: 100, user: 144, keyName: 128, keyDisplayId: 160, keyMasked: 140 };
const requestSections = [
  ['请求与结果', [
    ['请求 ID', 'requestId'], ['开始时间', 'at', observationTime], ['模型名称', 'modelName'], ['模型调用标识', 'callId'],
    ['请求状态', 'outcome', value => outcomes[value]], ['状态码', 'status'],
    ['总耗时（ms）', 'duration'], ['首包延迟（ms）', 'firstPacket'],
  ]],
  ['路由归属', [
    ['供应商名称', 'providerName'], ['渠道名称', 'channelName'], ['供应商 ID', 'provider'], ['渠道 ID', 'channel'],
  ]],
  ['Token 用量', [['总 Token', 'total'], ['输入 Token', 'input'], ['输出 Token', 'output']]],
  ['调用方', [
    ['请求来源', 'source'], ['调用类型', 'purpose', value => purposeLabels[value]], ['客户', 'tenantName'], ['项目', 'projectName'], ['项目 ID', 'project'], ['调用用户', 'userName'], ['调用用户 ID', 'user'],
    ['API 密钥名称', 'keyName'], ['API 密钥 ID', 'keyDisplayId'], ['API 密钥（脱敏）', 'keyMasked'],
  ]],
];
const requestColumns = requestSections.flatMap(([, fields]) => fields);
const attemptWidths = { requestId: 240, upstreamRequestId: 240, at: 170, upstreamModelId: 156 };
const attemptColumns = [
  ['尝试开始时间', 'at', observationTime], ['父 Request ID', 'requestId'], ['尝试序号', 'index'], ['上游 Request ID', 'upstreamRequestId'],
  ['实际服务商', 'providerName'], ['渠道', 'channelName'], ['端点', 'endpointName'], ['调用类型', 'purpose', value => purposeLabels[value]], ['客户', 'tenantName'], ['项目', 'projectName'], ['项目 ID', 'project'], ['上游模型调用标识', 'upstreamModelId'],
  ['尝试结果', 'outcome', value => outcomes[value]], ['上游状态码', 'status'], ['耗时（ms）', 'duration'],
  ['错误来源', 'errorSource'], ['错误类型', 'code'], ['失败原因', 'errorReason'], ['回退原因', 'fallbackReason'],
];
const numericFields = new Set(['total', 'input', 'output', 'firstPacket', 'duration', 'index']);
const sortFields = new Set(['at', 'status', ...numericFields]);
const defaultSort = { field: 'at', direction: -1 };
const columnStorageKey = workspaceStoragePrefix + 'call-log-columns';
const simulationFilters = () => observationFilters(undefined, '24h');

function readHiddenColumns() {
  try {
    const saved = JSON.parse(localStorage.getItem(columnStorageKey));
    return {
      requests: Array.isArray(saved?.requests) ? saved.requests : [],
      attempts: Array.isArray(saved?.attempts) ? saved.attempts : [],
    };
  } catch { return { requests: [], attempts: [] }; }
}

export default function CallLogsPage({ state, params }) {
  const [view, setView] = useState(() => params.get('view') === 'attempts' ? 'attempts' : 'requests');
  const [filters, setFilters] = useState(() => observationFilters(params));
  const [detail, setDetail] = useState(null);
  const [hiddenColumns, setHiddenColumns] = useState(readHiddenColumns);
  const [columnDraft, setColumnDraft] = useState(null);
  const [viewSorts, setViewSorts] = useState({});
  const [page, setPage] = useState(1);
  const [size, setSize] = useState(DEFAULT_PAGE_SIZE);
  const [simulation, setSimulation] = useState(null);
  useEffect(() => {
    setView(params.get('view') === 'attempts' ? 'attempts' : 'requests');
    setFilters(observationFilters(params));
    setDetail(null);
    setSimulation(null);
    setPage(1);
  }, [params]);
  const source = simulation?.data ?? state;
  const { requests, attempts } = useMemo(() => callObservations(source), [source]);
  const attemptView = view === 'attempts';
  const fields = attemptView ? attemptColumns : requestColumns;
  const visibleFields = fields.filter(([, field]) => field === 'requestId' || !hiddenColumns[view].includes(field));
  const sort = viewSorts[view] || defaultSort;
  const pool = attemptView ? attempts : requests;
  const supply = useObservationSupply(pool, filters.supply);
  const window = observationWindow(filters);
  const rows = filterObservations(pool, filters, window, { allowUntimed: attemptView })
    .sort((a, b) => compareLogRows(a, b, sort.field, sort.direction));
  const currentPage = Math.min(page, Math.max(1, Math.ceil(rows.length / size)));
  const change = (patch, nextView = view) => {
    const next = { ...filters, ...patch };
    setFilters(next);
    setPage(1);
    if (!simulation) history.replaceState(history.state, '', observationHash('logs', next, { view: nextView }));
  };
  const changeTenant = ({ tenant }) => {
    const patch = changeObservationTenant(requests, filters, tenant);
    change(patch);
    if ('project' in patch || 'user' in patch || 'key' in patch) Toast.info('已移除新客户范围之外的调用方条件');
  };
  const chooseView = next => {
    setView(next);
    change({ outcome: '', http: '', errorSource: '', signal: '', upstreamQuery: '' }, next);
  };
  const reset = () => {
    setFilters(simulation ? simulationFilters() : observationFilters());
    setPage(1);
    if (!simulation) history.replaceState(history.state, '', observationHash('logs', {}, { view: attemptView ? 'attempts' : null }));
  };
  const toggleSimulation = () => {
    setDetail(null);
    if (simulation) {
      const previous = simulation.previous;
      setView(previous.view);
      setFilters(previous.filters);
      setPage(previous.page);
      setSize(previous.size);
      setViewSorts(previous.viewSorts);
      setSimulation(null);
      return;
    }
    setSimulation({ ...createCallLogSimulation(), previous: { view, filters, page, size, viewSorts } });
    setView('requests');
    setFilters(simulationFilters());
    setPage(1);
    setViewSorts({});
  };
  const lookup = useMemo(() => new Map(requests.map(row => [row.id, row])), [requests]);
  const request = detail && lookup.get(detail.id);
  const codes = [...new Set([...pool.map(row => String(row.status ?? 'unreported')), filters.http].filter(Boolean))]
    .sort((a, b) => a.localeCompare(b, 'zh-CN', { numeric: true }));
  const sources = [...new Set([...pool.map(row => row.errorSource), filters.errorSource].filter(Boolean))].sort();
  const conditions = observationConditions(pool, filters, selectors, patch => 'tenant' in patch ? changeTenant(patch) : change(patch));
  if (filters.request) conditions.push(['Request ID', filters.request, () => change({ request: '' })]);
  if (supply.group.items !== null) conditions.push([supply.group.label, supply.group.items.join('、') || '未选择', () => change({ supply: null })]);
  for (const [key, label, value] of [
    ['type', '模型类型', new Map(modelTypes).get(filters.type)], ['userRecord', '调用用户记录', new Map(userRecordOptions).get(filters.userRecord)],
    ['http', attemptView ? '上游状态码' : 'HTTP 状态码', httpLabel(filters.http === 'unreported' ? null : Number(filters.http))],
    ['errorSource', '错误来源', filters.errorSource], ['signal', '异常类型', new Map(errorSignals).get(filters.signal)],
  ]) {
    if (filters[key]) conditions.push([label, value || filters[key], () => change({ [key]: '' })]);
  }
  const pick = (dimension, label, update = change) => <ObservationPick dimension={dimension} label={label}
    rows={pool} filters={filters} onChange={update}/>;
  const showDetail = row => setDetail({ id: row.parentId || row.id, attemptId: row.parentId ? row.id : null });
  const requestIdCell = (value, row) => <Button className="admin-log-request-id" size="small" theme="borderless" onClick={() => showDetail(row)}
    title={value || undefined} aria-label={['查看请求详情', value, row.parentId && '第 ' + row.index + ' 次尝试'].filter(Boolean).join(' ')}>
    {value || '查看详情'}
  </Button>;
  const applyColumns = () => {
    const hidden = fields.map(([, field]) => field).filter(field => field !== 'requestId' && !columnDraft.includes(field));
    const next = { ...readHiddenColumns(), [view]: hidden };
    try { localStorage.setItem(columnStorageKey, JSON.stringify(next)); }
    catch { Toast.error('列设置保存失败，请重试'); return; }
    setHiddenColumns(next);
    if (hidden.includes(sort.field)) {
      setViewSorts(current => ({ ...current, [view]: defaultSort }));
      setPage(1);
    }
    setColumnDraft(null);
  };
  const columns = visibleFields.map(([title, dataIndex, format]) => {
    const width = attemptView ? attemptWidths[dataIndex] ?? 122 : requestWidths[dataIndex];
    const column = { title, dataIndex, width };
    if (sortFields.has(dataIndex)) {
      const active = sort.field === dataIndex;
      const Icon = active ? (sort.direction === 1 ? IconArrowUp : IconArrowDown) : IconSort;
      column.title = <Button size="small" theme="borderless" type="tertiary" icon={<Icon aria-hidden="true"/>}
        iconPosition="right" onClick={() => {
          setViewSorts(current => ({ ...current, [view]: { field: dataIndex, direction: active ? -sort.direction : -1 } }));
          setPage(1);
        }}>{title}</Button>;
      column.onHeaderCell = () => ({ 'aria-label': title, 'aria-sort': active ? (sort.direction === 1 ? 'ascending' : 'descending') : undefined });
    }
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
      <Space wrap>
        <Button theme="light" onClick={toggleSimulation}>{simulation ? '退出模拟' : '模拟日志'}</Button>
        <Button theme="solid" icon={<IconDownload aria-hidden="true"/>} onClick={exportCsv} disabled={!rows.length}>导出筛选结果</Button>
      </Space>
    </AdminPageHeading>
    {simulation && <Card className="admin-log-simulation">
      <section aria-label="留存模拟">
        <div className="admin-log-simulation-bar">
          <div className="admin-log-simulation-policy" role="status">
            <Text strong>{simulation.retainNew ? '当前策略 · 仅留存摘要' : '当前策略 · 关闭新请求留存'}</Text>
            <Text type="secondary" size="small">{simulation.retainNew ? '新模拟请求只留存调用元数据。'
              : '新模拟请求不会进入历史列表。此前留存且未过期的日志仍可查询。'}</Text>
          </div>
          <Space wrap>
            <Text>留存新请求</Text>
            <Switch aria-label="留存新请求" checked={simulation.retainNew}
              onChange={retainNew => setSimulation(current => ({ ...current, retainNew }))}/>
            <Button theme="light" onClick={() => setSimulation(current => simulateLogRequest(current))}>模拟一次调用</Button>
            <Button theme="light" onClick={() => { const row = requests.find(item => item.requestId === routingDemoRequestId); if (row) showDetail(row); }}>查看重试与备用模型回退</Button>
          </Space>
        </div>
        {simulation.latestRequestId && <Space wrap className="admin-log-simulation-latest">
          <Text role="status">新请求 ID <Text code>{simulation.latestRequestId}</Text></Text>
          <Button size="small" theme="borderless" onClick={() => {
            setView('requests');
            setFilters({ ...simulationFilters(), query: simulation.latestRequestId });
            setPage(1);
          }}>查询此请求</Button>
        </Space>}
      </section>
    </Card>}
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
        <ObservationFilterLayout primary={<>
          <Input className="admin-observe-search" aria-label="搜索 Request ID" placeholder="搜索 Request ID"
            prefix={<IconSearch aria-hidden="true"/>} value={filters.query} onChange={value => change({ query: value, request: '' })} showClear/>
          {attemptView && <Input className="admin-observe-search" aria-label="搜索上游 Request ID" placeholder="搜索上游 Request ID"
            prefix={<IconSearch aria-hidden="true"/>} value={filters.upstreamQuery} onChange={value => change({ upstreamQuery: value })} showClear/>}
          {pick('model', '模型')}
          {pick('tenant', '客户', changeTenant)}
          <ObservationPick dimension="project" label="项目" rows={pool.filter(row => filters.tenant == null || filters.tenant.includes(observationKey(row, 'tenant')))}
            filters={filters} onChange={change}/>
          <Choice size="small" label={attemptView ? '尝试结果' : '最终结果'} value={filters.outcome || 'all'} options={outcomeOptions}
            onChange={value => change({ outcome: value === 'all' ? '' : value })}/>
        </>}>
          <ObservationFilterGroup label="调用方">
            <ObservationIdentitySearch key={'user' + JSON.stringify(filters.tenant)} dimension="user" label="调用用户"
              rows={pool} filters={filters} onChange={patch => change({ ...patch, userRecord: '' })}/>
            <ObservationIdentitySearch key={'key' + JSON.stringify(filters.tenant)} dimension="key" label="API 密钥"
              rows={pool} filters={filters} onChange={change}/>
            <Choice size="small" label="调用用户记录" value={filters.userRecord || 'all'} options={userRecordOptions}
              onChange={value => change({ userRecord: value === 'all' ? '' : value, ...(value === 'uncollected' && { user: null }) })}/>
            {pick('source', '请求来源')}
            {pick('purpose', '调用类型')}
          </ObservationFilterGroup>
          <ObservationFilterGroup label="模型与渠道">
            {pick('callId', '模型调用标识')}
            <ObservationSupplyPick {...supply} onChange={change}/>
            {(attemptView || filters.endpoint != null) && pick('endpoint', '端点')}
          </ObservationFilterGroup>
          <ObservationFilterGroup label="请求结果">
            <Choice size="small" label={attemptView ? '上游状态码' : 'HTTP 状态码'} value={filters.http || 'all'}
              options={[[ 'all', '全部状态码' ], ...codes.map(code => [code, httpLabel(code === 'unreported' ? null : Number(code))])]}
              onChange={value => change({ http: value === 'all' ? '' : value })}/>
            {attemptView && <>
              <Choice size="small" label="错误来源" value={filters.errorSource || 'all'} options={[[ 'all', '全部错误来源' ], ...sources.map(value => [value, value])]}
                onChange={value => change({ errorSource: value === 'all' ? '' : value })}/>
              <Choice size="small" label="异常类型" value={filters.signal || 'all'} options={[[ 'all', '全部异常类型' ], ...errorSignals]}
                onChange={value => change({ signal: value === 'all' ? '' : value })}/>
            </>}
          </ObservationFilterGroup>
        </ObservationFilterLayout>
        <ObservationConditions conditions={conditions}/>
      </div>
    </Card>
    {!window && <Banner type="danger" closeIcon={null} description="请选择不超过 365 天的有效时间范围。"/>}
    <Card headerLine={false} bodyStyle={{ paddingTop: 0 }} headerExtraContent={
      <Button theme="light" icon={<IconSetting aria-hidden="true"/>}
        onClick={() => setColumnDraft(visibleFields.map(([, field]) => field))}>列设置</Button>
    }>
      <Table size="small" rowKey="id" columns={columns} dataSource={rows.slice((currentPage - 1) * size, currentPage * size)}
        scroll={{ x: 'max(100%, ' + columns.reduce((width, column) => width + column.width, 0) + 'px)' }}
        empty={window && (filters.query.trim() || filters.upstreamQuery.trim()) ? <Empty description={
          <Space direction="vertical">
            <Text strong>未找到可查看的日志</Text>
            <Button size="small" theme="borderless" onClick={() => change({ query: '', upstreamQuery: '' })}>清除搜索</Button>
          </Space>
        }/> : '没有符合条件的记录'}
        pagination={{ currentPage, total: rows.length, pageSize: size, showTotal: true, showSizeChanger: true, pageSizeOpts: PAGE_SIZES,
          onPageChange: setPage, onPageSizeChange: value => { setSize(value); setPage(1); } }}/>
    </Card>
    {columnDraft && <Modal visible title="列设置" width="min(500px, calc(100vw - 32px))" closeOnEsc
      okText="保存" onOk={applyColumns} onCancel={() => setColumnDraft(null)}>
      <CheckboxGroup className="admin-log-column-options" aria-label="显示的日志列" value={columnDraft} onChange={setColumnDraft}
        options={fields.map(([label, value]) => ({ label, value, disabled: value === 'requestId' }))}/>
      <Button size="small" theme="borderless" onClick={() => setColumnDraft(fields.map(([, field]) => field))}>恢复默认</Button>
    </Modal>}
    {request && <RequestLogDetail key={request.id} row={request} attemptId={detail.attemptId}
      evidence={simulation?.evidence[request.requestId]} sections={requestSections} close={() => setDetail(null)}/>}
  </div>;
}
