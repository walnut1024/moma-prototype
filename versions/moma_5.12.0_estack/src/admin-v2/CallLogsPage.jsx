import { useChannelText } from './channel-language';
import TableFieldHelp from '../components/TableFieldHelp';
import { callLogFieldHelp } from '../components/call-log-field-help';
import { workspaceStoragePrefix } from '../workspace-storage.mjs';
import { projectCallErrors } from '../project-call.mjs';
import { useEffect, useMemo, useRef, useState } from 'react';
import { Banner, Button, Empty, InputNumber, Space, Switch, Tabs, Tag, Toast, Typography } from './xa24/HaloUI.jsx';
import { CheckboxGroup } from './xa24/HaloUI.jsx';
import { IconArrowDown, IconArrowUp, IconSetting, IconSort } from './xa24/HaloIcons.jsx';
import Table from './AdminTable';
import AdminPageHeading from './AdminPageHeading';
import AdminStatus from './AdminStatus';
import { AdminModal as Modal } from './AdminOverlay';
import RequestLogDetail from './RequestLogDetail';
import { readRequestBody } from './call-log-detail.mjs';
import CallLogFilters from './CallLogFilters';
import { Choice } from './ServiceUI';
import { TimeSeriesChart } from '../components/AnalyticsCharts';
import {
  callObservations, compareLogRows, httpLabel, observationBuckets, observationHash, observationNumber as fmt,
  observationTime, outcomes, preflightTypes, purposeLabels,
} from './call-observations.mjs';
import { filterCallLogs, logFilters, logWindow } from './call-log-filters.mjs';
import { applyLogPolicy, createCallLogSimulation, simulateLogRequest } from './call-log-simulation.mjs';

const { Text } = Typography;
const unknown = value => value ?? '未采集';
const statusColumn = value => <AdminStatus value={httpLabel(value)}
  color={value == null ? 'grey' : value >= 200 && value < 300 ? 'green' : 'red'}/>;
const requestWidths = { requestId: 178, sessionId: 164, at: 172, modelName: 216, outcome: 108, status: 132, duration: 140,
  firstPacket: 140, providerName: 156, channelName: 108, provider: 156, channel: 126, total: 108, input: 108, output: 108,
  source: 112, purpose: 112, tenantName: 132, projectName: 138, project: 164, ttft: 148,
  userName: 128, user: 144, keyName: 168, keyMasked: 152,
  preflightType: 140, code: 186, errorReason: 224, upstreamRequestId: 190, index: 114, upstreamModelId: 182, endpointName: 238 };
const combinedFields = { modelName: 'callId', keyName: 'keyDisplayId' };
const requestColumns = [
  ['Request ID', 'requestId'], ['开始时间', 'at', observationTime], ['模型名称/调用标识', 'modelName'],
  ['请求结果', 'outcome', value => outcomes[value]], ['总耗时（ms）', 'duration'], ['连接', 'channelName'],
  ['所属租户', 'tenantName'], ['HTTP 状态码', 'status'], ['首包延迟（ms）', 'firstPacket'], ['首 Token 时延（ms）', 'ttft'],
  ['服务商', 'providerName'], ['服务商 ID', 'provider'], ['连接 ID', 'channel'],
  ['总 Token', 'total'], ['输入 Token', 'input'], ['输出 Token', 'output'],
  ['请求来源', 'source'], ['调用类型', 'purpose', value => purposeLabels[value]], ['项目', 'projectName'], ['项目 ID', 'project'],
  ['API Key/ID', 'keyName'], ['API Key（脱敏）', 'keyMasked'], ['调用用户', 'userName'], ['调用用户 ID', 'user'],
];
const preflightNames = new Map(preflightTypes);
const preflightCodeNames = {
  auth_rejected: 'API Key 无效', invalid_request: '请求参数不正确', rate_limit_exceeded: '请求超过限流阈值',
  key_expired: 'API Key 已到期', ip_not_allowed: '来源 IP 不在白名单内', customer_unavailable: '租户空间不可用',
  INTERNAL_SPACE: '密钥类型不适用',
};
const preflightColumns = [
  ...requestColumns.slice(0, 3), ['前置错误类型', 'preflightType', value => preflightNames.get(value)],
  ['HTTP 状态码', 'status'], ['失败原因', 'errorReason', (value, row) => value ?? row.code ?? '未采集'],
  ['错误码', 'code'], ['所属租户', 'tenantName'],
];
const upstreamColumns = [
  ['客户 Request ID', 'requestId'], ['Session ID', 'sessionId'], ['上游 Request ID', 'upstreamRequestId'],
  ['尝试序号', 'index'], ['开始时间', 'at', observationTime],
  ['服务商', 'providerName'], ['连接', 'channelName'], ['上游模型', 'upstreamModelId'], ['上游状态', 'outcome', value => outcomes[value]],
  ['上游 HTTP 状态码', 'status'], ['耗时（ms）', 'duration'], ['错误码', 'code'],
  ['失败/成功原因', 'errorReason', (value, row) => row.outcome === 'success' ? row.successReason || '上游响应成功' : value],
  ['端点', 'endpointName'], ['所属租户', 'tenantName'], ['项目', 'projectName'],
];
const logViews = {
  requests: { label: '客户请求', title: '请求记录', columns: requestColumns },
  upstream: { label: '上游请求', title: '请求尝试', columns: upstreamColumns },
  preflight: { label: '前置错误', title: '留存样本', columns: preflightColumns },
};
const numericFields = new Set(['total', 'input', 'output', 'firstPacket', 'ttft', 'duration', 'index']);
const sortFields = new Set(['at', 'status', ...numericFields]);
const defaultSort = { field: 'at', direction: -1 };
const trendColors = ['#1a6aff', '#ff9d46', '#6780db', '#8493a8'];
const logPageSizes = [10, 20, 50, 100];
const columnStorageKey = workspaceStoragePrefix + 'call-log-columns';
const policyStorageKey = workspaceStoragePrefix + 'call-log-simulation-policy';

function readSimulationPolicy() {
  try { return JSON.parse(sessionStorage.getItem(policyStorageKey)); }
  catch { return null; }
}

function readHiddenColumns() {
  let saved;
  try {
    saved = JSON.parse(localStorage.getItem(columnStorageKey));
  } catch { /* 浏览器存储禁用时使用默认列。 */ }
  return Object.fromEntries(Object.keys(logViews).map(view => [view,
    Array.isArray(saved?.[view]) ? saved[view] : [],
  ]));
}

export default function CallLogsPage({ state, params, simulation, setSimulation, canViewFullLog, refreshRead }) {
  const translateLabel = useChannelText();
  const [view, setView] = useState(() => Object.hasOwn(logViews, params.get('view')) ? params.get('view') : 'requests');
  const [filters, setFilters] = useState(() => logFilters(params));
  const [detail, setDetail] = useState(null);
  const [hiddenColumns, setHiddenColumns] = useState(readHiddenColumns);
  const [columnDraft, setColumnDraft] = useState(null);
  const [settingsSource, setSettingsSource] = useState(null);
  const [simulationPolicy, setSimulationPolicy] = useState(readSimulationPolicy);
  const [viewSorts, setViewSorts] = useState({});
  const [page, setPage] = useState(1);
  const [size, setSize] = useState(20);
  const [refreshing, setRefreshing] = useState(false);
  const [exporting, setExporting] = useState(false);
  const refreshRequest = useRef(null);
  useEffect(() => () => refreshRequest.current?.abort(), []);
  const source = simulation?.data ?? state;
  useEffect(() => {
    if (simulation && simulationPolicy && simulation.policy !== simulationPolicy) {
      const configured = applyLogPolicy(simulation, simulationPolicy);
      if (configured) setSimulation(configured);
    }
  }, [simulation, simulationPolicy, setSimulation]);
  const { requests, attempts } = useMemo(() => callObservations(source), [source]);
  const preflightView = view === 'preflight';
  const { columns: fields, title, label } = logViews[view];
  const visibleFields = fields.filter(([, field]) => field === 'requestId' || !hiddenColumns[view].includes(field));
  const sort = viewSorts[view] || defaultSort;
  const pool = preflightView ? requests.filter(row => row.preflightType) : view === 'upstream' ? attempts : requests;
  const preflightEvents = useMemo(() => simulation && callObservations({ ...source, requests: simulation.preflightEvents }).requests,
    [source, simulation]);
  const window = logWindow(filters);
  const rows = filterCallLogs(pool, filters, window, view === 'upstream')
    .sort((a, b) => compareLogRows(a, b, sort.field, sort.direction));
  const trendRows = preflightView && preflightEvents ? filterCallLogs(preflightEvents, filters, window) : rows;
  const trend = preflightView && window && !filters.query.trim() && !filters.request
    ? observationBuckets(trendRows, window, window.end - window.start < 48 * 60 * 60 * 1000 ? 'hour' : 'day') : null;
  const errors = new Map((preflightView ? preflightEvents ?? pool : []).map(row => [row.code,
    [preflightCodeNames[row.code] ?? projectCallErrors[row.code]?.[1] ?? preflightNames.get(row.preflightType), row.code]
      .filter(Boolean).join(' · ')]));
  const currentPage = Math.min(page, Math.max(1, Math.ceil(rows.length / size)));
  const change = (patch, nextView = view) => {
    const next = { ...filters, ...patch };
    setFilters(next);
    setPage(1);
    if (!simulation) history.replaceState(history.state, '', observationHash('logs', next, { view: nextView }));
  };
  const chooseView = next => {
    setView(next);
    // 连接、结果和状态码在请求和上游请求中来自不同层级。
    change({ outcome: '', http: '', query: '', request: '', preflightType: '', errorCode: '', upstreamModelId: null,
      ...(next === 'preflight' && { supply: null, endpoint: null, user: null, key: null, source: null, purpose: null, userRecord: '',
        ...(filters.period === '1h' && { period: '7d', start: '', end: '' }) }) }, next);
  };
  const reset = () => {
    setFilters(logFilters());
    setPage(1);
    if (!simulation) history.replaceState(history.state, '', observationHash('logs', {}, { view: view === 'requests' ? null : view }));
  };
  const lookup = useMemo(() => new Map(requests.map(row => [row.id, row])), [requests]);
  const request = lookup.get(detail?.requestId);
  const openDetail = row => setDetail({ requestId: row.parentId ?? row.id, attemptId: row.parentId ? row.id : undefined });
  const refresh = async () => {
    if (simulation) {
      if (canViewFullLog) setSimulation(current => current && simulateLogRequest(current, Date.now(), { preflight: preflightView }));
      setPage(1);
      return;
    }
    if (refreshRequest.current) return;
    const controller = new AbortController();
    refreshRequest.current = controller;
    setRefreshing(true);
    try {
      await refreshRead(controller.signal);
      setPage(1);
    } catch {
      if (!controller.signal.aborted) Toast.error('刷新失败，请重试');
    } finally {
      refreshRequest.current = null;
      setRefreshing(false);
    }
  };
  const requestIdCell = (value, row) => {
    const hasBody = canViewFullLog && view !== 'upstream' && readRequestBody(simulation?.evidence[value]).segments
      .some(segment => segment.text != null && /(^|-)request$/.test(segment.id));
    return <>
      <Button className="admin-log-request-id" size="small" theme="borderless" onClick={() => openDetail(row)}
        title={value || undefined} aria-label={['查看请求详情', value, row.parentId && `第 ${row.index} 次尝试`].filter(Boolean).join(' ')}>
        {value || '查看详情'}
      </Button>
      {hasBody && <div><Text size="small" type="tertiary">含请求正文</Text></div>}
      {row.attempts?.length > 1 && <div><Text size="small" type="tertiary">{row.attempts.length} 次上游尝试</Text></div>}
    </>;
  };
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
    const width = requestWidths[dataIndex];
    const description = view === 'upstream' && dataIndex === 'duration'
      ? '单次上游请求尝试从开始到结束的时间，单位为毫秒。'
      : callLogFieldHelp[dataIndex];
    const column = { title: description ? <TableFieldHelp name={title} description={description}/> : title, dataIndex, width };
    if (sortFields.has(dataIndex)) {
      const active = sort.field === dataIndex;
      const Icon = active ? (sort.direction === 1 ? IconArrowUp : IconArrowDown) : IconSort;
      column.title = <TableFieldHelp name={title} description={description} sortIcon={<Icon aria-hidden="true"/>}
        onSort={() => {
          setViewSorts(current => ({ ...current, [view]: { field: dataIndex, direction: active ? -sort.direction : -1 } }));
          setPage(1);
        }}/>;
      column.onHeaderCell = () => ({ 'aria-label': title, 'aria-sort': active ? (sort.direction === 1 ? 'ascending' : 'descending') : undefined });
    }
    if (dataIndex === 'requestId') return { ...column, render: requestIdCell, fixed: 'left' };
    if (dataIndex === 'status') return { ...column, render: statusColumn };
    if (dataIndex === 'outcome') return { ...column, render: value => <AdminStatus value={outcomes[value]}/> };
    if (numericFields.has(dataIndex)) return { ...column, render: fmt, align: 'right' };
    if (combinedFields[dataIndex]) return { ...column, render: (value, row) => <div className="admin-log-stacked-cell">
      <span title={value}>{unknown(value)}</span>
      <span title={row[combinedFields[dataIndex]]}>{unknown(row[combinedFields[dataIndex]])}</span>
    </div> };
    return { ...column, render: (value, row) => unknown(format ? format(value, row) : value), ellipsis: { showTitle: true } };
  });
  columns.push({ title: '操作', dataIndex: 'action', fixed: 'right', width: 86, render: (_, row) =>
    <Button theme="borderless" size="small" onClick={() => openDetail(row)}>详情</Button> });
  const exportXlsx = async () => {
    if (exporting || !rows.length) return;
    setExporting(true);
    try {
      const { callLogWorkbook } = await import('./call-log-xlsx.mjs');
      const data = [fields.map(([title]) => title), ...rows.map(row => fields.map(([, key, format]) => {
        if (key === 'status') return httpLabel(row[key]);
        const value = format ? format(row[key], row) : row[key];
        return combinedFields[key] ? `${unknown(value)} / ${unknown(row[combinedFields[key]])}` : value;
      }))];
      const href = URL.createObjectURL(new Blob([callLogWorkbook(data, label)], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }));
      const link = document.createElement('a');
      link.href = href;
      link.download = `${label}_${observationTime(Date.now()).replace(/[-:]/g, '').replace(' ', '_')}.xlsx`;
      document.body.append(link);
      link.click();
      link.remove();
      setTimeout(() => URL.revokeObjectURL(href), 0);
      Toast.success('已开始下载');
    } catch { Toast.error('导出失败，请重试'); }
    finally { setExporting(false); }
  };
  const settings = canViewFullLog && <Button className="admin-log-policy-entry" theme="outline" type="tertiary"
    icon={<IconSetting aria-hidden="true"/>} onClick={() => {
      const session = simulation ?? createCallLogSimulation();
      setSettingsSource(simulationPolicy ? { ...session, policy: simulationPolicy } : session);
    }}>日志设置</Button>;
  const trendSeries = trend && preflightTypes.map(([kind, name], index) => ({ label: name, color: trendColors[index],
    values: trend.map(bucket => bucket.rows.filter(row => row.preflightType === kind).length) }));
  return <div className="admin-page-stack admin-call-logs">
    <AdminPageHeading className="xa24-entry-header" title={translateLabel('调用日志')}
      description={translateLabel('查询模型调用记录并查看单次请求详情', 'Inspect model calls and individual request details')}>
      <Space wrap>{simulation && <Tag color="blue">模拟数据</Tag>}{settings}</Space>
    </AdminPageHeading>
    <section className="admin-call-logs-panel" aria-label={translateLabel('调用日志')}>
      <Tabs activeKey={view} onChange={chooseView} aria-label="调用日志视图">
        {Object.entries(logViews).map(([id, item]) => <Tabs.TabPane key={id} itemKey={id} tab={item.label}/>)}
      </Tabs>
      <CallLogFilters key={view} view={view} pool={pool} filters={filters} window={window} errors={errors}
        onChange={change} onReset={reset} onRefresh={refresh} refreshing={refreshing}/>
      {!window && <Banner type="danger" closeIcon={null} description="请选择有效的起止时间。"/>}
      {trend?.length > 0 && <section className="admin-log-trend" aria-label="前置错误趋势">
        <div className="admin-log-trend-heading"><h2>前置错误趋势</h2><span>共 {fmt(trendRows.length)} 次</span></div>
        <p>统计已采集事件。点击柱形查看对应时段、类型的留存样本。</p>
        <TimeSeriesChart label="前置错误趋势" height={209} type="bar" stacked compact legendAtTop
          unit="次" labels={trend.map(bucket => bucket.label)} series={trendSeries}
          onChoose={(index, label) => {
            const bucket = trend[index];
            const kind = preflightTypes.find(([, name]) => name === label)?.[0];
            if (bucket?.rows.some(row => row.preflightType === kind)) change({ period: 'custom', start: new Date(bucket.start).toISOString(),
              end: new Date(bucket.end).toISOString(), preflightType: kind });
          }}/>
      </section>}
      <section className="admin-log-results" aria-label={title}>
        <div className="admin-log-results-heading">
          <div className="admin-log-results-title"><h2>{title}</h2><span role="status">共 {fmt(rows.length)} 条</span></div>
          <Space wrap>
            <Button theme="solid" onClick={exportXlsx} disabled={!rows.length} loading={exporting}>导出筛选结果</Button>
            <Button theme="outline" type="tertiary" onClick={() => setColumnDraft(visibleFields.map(([, field]) => field))}>列设置</Button>
          </Space>
        </div>
      <Table size="small" rowKey="id" columns={columns} dataSource={rows.slice((currentPage - 1) * size, currentPage * size)}
        scroll={{ x: 'max(100%, ' + columns.reduce((width, column) => width + column.width, 0) + 'px)' }}
        empty={<Empty description="没有符合条件的记录">
          <Button size="small" theme="borderless" onClick={reset}>清除筛选</Button>
        </Empty>}
        pagination={rows.length > 0 && { currentPage, total: rows.length, pageSize: size, showTotal: true, showSizeChanger: true, pageSizeOpts: logPageSizes,
          onPageChange: setPage, onPageSizeChange: value => { setSize(value); setPage(1); } }}/>
      </section>
    </section>
    {columnDraft && <Modal visible title="列设置" width="min(560px, calc(100vw - 32px))" closeOnEsc
      onCancel={() => setColumnDraft(null)} footer={<div className="admin-log-column-footer">
        <Button size="small" theme="borderless" onClick={() => setColumnDraft(fields.map(([, field]) => field))}>{translateLabel('恢复默认')}</Button>
        <Space><Button theme="outline" onClick={() => setColumnDraft(null)}>取消</Button>
          <Button theme="solid" onClick={applyColumns}>保存</Button></Space>
      </div>}>
      <CheckboxGroup className="admin-log-column-options" aria-label="显示的日志列" value={columnDraft} onChange={setColumnDraft}
        options={fields.map(([label, value]) => ({ label, value, disabled: value === 'requestId' }))}/>
    </Modal>}
    {settingsSource && canViewFullLog && <LogPolicyDialog simulation={settingsSource}
      close={() => setSettingsSource(null)} onSave={updated => {
        try { sessionStorage.setItem(policyStorageKey, JSON.stringify(updated.policy)); }
        catch { Toast.error('模拟日志设置保存失败，请重试'); return false; }
        setSimulationPolicy(updated.policy);
        if (simulation) setSimulation(updated);
        return true;
      }}/>}
    {request && <RequestLogDetail key={detail.attemptId ?? request.id} row={request} attemptId={detail.attemptId}
      evidence={simulation?.evidence[request.requestId]} fromCallLogs
      canViewFullLog={canViewFullLog} close={() => setDetail(null)}/>}
  </div>;
}

function LogPolicyDialog({ simulation, close, onSave }) {
  const [draft, setDraft] = useState(simulation.policy);
  const [invalid, setInvalid] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const dirty = Object.keys(draft).some(key => draft[key] !== simulation.policy[key]);
  const change = (field, value) => { setDraft(current => ({ ...current, [field]: value })); setInvalid(false); };
  const save = () => {
    const updated = applyLogPolicy(simulation, draft);
    if (!updated) { setInvalid(true); return; }
    if (!onSave(updated)) return;
    close();
    Toast.success('模拟日志设置已应用');
  };
  const cancel = () => {
    if (!dirty) { close(); return; }
    setConfirming(true);
  };
  return <><Modal visible title="日志设置" okText="保存" okButtonProps={{ disabled: !dirty }} onOk={save} onCancel={cancel}
    closeOnEsc width="min(560px, calc(100vw - 32px))">
    <div className="admin-analytics-fields admin-log-policy">
      <section>
        <Typography.Title heading={6} component="h3">正文留存</Typography.Title>
        <label className="admin-log-policy-switch">保存完整请求和响应
          <Switch aria-label="保存完整请求和响应" checked={draft.captureBody}
            onChange={value => change('captureBody', value)}/>
          <span className="admin-log-policy-state">{draft.captureBody ? '已开启' : '已关闭'}</span>
        </label>
        {draft.captureBody && <label className="admin-log-policy-project"><span>适用项目</span><Choice label="适用项目" value={draft.projectId}
          options={[[ 'all', '全部项目' ], ...simulation.data.projects.map(project => [project.id, project.name])]}
          onChange={value => change('projectId', value)}/></label>}
        <Text type="secondary" size="small">设置作用于后续模拟请求。完整日志仅平台管理员可查看。</Text>
      </section>
      <section>
        <Typography.Title heading={6} component="h3">前置错误采样与留存</Typography.Title>
        <div className="admin-log-policy-fields">
          {[
            ['sampleRate', '采样比例（%）', 1, 100], ['retentionDays', '留存天数', 1, 365], ['maxSamples', '最大留存条数', 100],
          ].map(([key, label, min, max]) => <label key={key}>{label}
            <InputNumber aria-label={label} value={draft[key]} min={min} max={max} step={1}
              onChange={value => change(key, value)}/>
          </label>)}
        </div>
        <Text type="secondary" size="small">采样只影响模拟错误明细。超过天数或条数上限的样本会被清理。</Text>
      </section>
      {invalid && <Banner type="danger" closeIcon={null} description="请填写整数。采样比例 1–100，留存天数 1–365，最大留存条数至少 100。"/>}
    </div>
  </Modal>
    {confirming && <Modal visible title="放弃未保存的日志设置？" okText="放弃修改" cancelText="继续编辑"
      onOk={close} onCancel={() => setConfirming(false)}/>}
  </>;
}
