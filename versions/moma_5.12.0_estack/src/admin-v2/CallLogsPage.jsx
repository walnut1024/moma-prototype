import { workspaceStoragePrefix } from '../workspace-storage.mjs';
import { projectCallErrors } from '../project-call.mjs';
import { useEffect, useMemo, useState } from 'react';
import { Banner, Button, Card, CheckboxGroup, Empty, InputNumber, Space, Switch, Tabs, Toast, Typography } from '@douyinfe/semi-ui';
import { IconArrowDown, IconArrowUp, IconDownload, IconSetting, IconSort } from '@douyinfe/semi-icons';
import Table from './AdminTable';
import AdminStatus from './AdminStatus';
import AdminPageHeading from './AdminPageHeading';
import { AdminModal as Modal } from './AdminOverlay';
import RequestLogDetail from './RequestLogDetail';
import { readRequestBody, requestLogSections } from './call-log-detail.mjs';
import CallLogFilters from './CallLogFilters';
import { Choice } from './ServiceUI';
import { DEFAULT_PAGE_SIZE, PAGE_SIZES } from '../components/FilterControls';
import { ObservationPlot } from './CallObservationControls';
import { AnalysisHelp } from './AnalysisMetric';
import {
  callObservations, compareLogRows, defaultObservationGrain, httpLabel, logCsv,
  observationBuckets, observationHash, observationNumber as fmt, observationTime, observationWindow, outcomes, preflightTypes,
} from './call-observations.mjs';
import { filterCallLogs, logFilters } from './call-log-filters.mjs';
import { applyLogPolicy, createCallLogSimulation } from './call-log-simulation.mjs';

const { Text } = Typography;
const unknown = value => value ?? '未采集';
const statusColumn = value => <AdminStatus value={httpLabel(value)}
  color={value == null ? 'grey' : value >= 200 && value < 300 ? 'green' : 'red'}/>;
const requestWidths = { requestId: 166, at: 174, modelName: 154, callId: 156, outcome: 92, status: 102, duration: 116,
  firstPacket: 130, providerName: 124, channelName: 130, provider: 136, channel: 144, total: 96, input: 104, output: 104,
  source: 104, purpose: 104, tenantName: 140, projectName: 140, project: 150, ttft: 136,
  userName: 100, user: 144, keyName: 128, keyDisplayId: 160, keyMasked: 140,
  preflightType: 136, code: 205, errorReason: 238, upstreamRequestId: 190, index: 80, upstreamModelId: 200, endpointName: 160 };
const allRequestColumns = requestLogSections.flatMap(([, fields]) => fields);
const primaryFields = ['requestId', 'at', 'modelName', 'outcome', 'duration', 'channelName', 'tenantName'];
const requestColumns = [
  ...primaryFields.map(key => allRequestColumns.find(([, field]) => field === key)),
  ...allRequestColumns.filter(([, field]) => !primaryFields.includes(field)),
];
const preflightNames = new Map(preflightTypes);
const preflightCodeNames = {
  auth_rejected: 'API Key 无效', invalid_request: '请求参数不正确', rate_limit_exceeded: '请求超过限流阈值',
  key_expired: 'API Key 已到期', ip_not_allowed: '来源 IP 不在白名单内', customer_unavailable: '客户空间不可用',
  INTERNAL_SPACE: '密钥类型不适用',
};
const preflightColumns = [
  ...requestColumns.slice(0, 3), ['前置错误类型', 'preflightType', value => preflightNames.get(value)],
  ['HTTP 状态码', 'status'], ['失败原因', 'errorReason', (value, row) => value ?? row.code ?? '未采集'],
  ['错误码', 'code'], ['客户', 'tenantName'],
];
const upstreamColumns = [
  ['客户 Request ID', 'requestId'], ['上游 Request ID', 'upstreamRequestId'], ['尝试序号', 'index'], ['开始时间', 'at', observationTime],
  ['服务商', 'providerName'], ['渠道', 'channelName'], ['上游模型', 'upstreamModelId'], ['上游状态', 'outcome', value => outcomes[value]],
  ['上游 HTTP 状态码', 'status'], ['耗时（ms）', 'duration'], ['错误码', 'code'], ['失败原因', 'errorReason'],
  ['端点', 'endpointName'], ['客户', 'tenantName'], ['项目', 'projectName'],
];
const logViews = {
  requests: { label: '客户请求', title: '请求记录', columns: requestColumns },
  upstream: { label: '上游请求', title: '请求尝试', columns: upstreamColumns },
  preflight: { label: '前置错误', title: '留存样本', columns: preflightColumns },
};
const numericFields = new Set(['total', 'input', 'output', 'firstPacket', 'ttft', 'duration', 'index']);
const sortFields = new Set(['at', 'status', ...numericFields]);
const defaultSort = { field: 'at', direction: -1 };
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

export default function CallLogsPage({ state, params, simulation, setSimulation, canViewFullLog }) {
  const [view, setView] = useState(() => Object.hasOwn(logViews, params.get('view')) ? params.get('view') : 'requests');
  const [filters, setFilters] = useState(() => logFilters(params));
  const [detail, setDetail] = useState(null);
  const [hiddenColumns, setHiddenColumns] = useState(readHiddenColumns);
  const [columnDraft, setColumnDraft] = useState(null);
  const [settingsSource, setSettingsSource] = useState(null);
  const [simulationPolicy, setSimulationPolicy] = useState(readSimulationPolicy);
  const [viewSorts, setViewSorts] = useState({});
  const [page, setPage] = useState(1);
  const [size, setSize] = useState(DEFAULT_PAGE_SIZE);
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
  const window = observationWindow(filters);
  const rows = filterCallLogs(pool, filters, window, view === 'upstream')
    .sort((a, b) => compareLogRows(a, b, sort.field, sort.direction));
  const trendRows = preflightView && preflightEvents ? filterCallLogs(preflightEvents, filters, window) : rows;
  const trend = preflightView && window && !filters.query.trim() && !filters.request
    ? observationBuckets(trendRows, window, defaultObservationGrain(filters, window)) : null;
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
    // 渠道、结果和状态码在客户请求和上游请求中来自不同层级。
    change({ outcome: '', http: '', query: '', request: '', preflightType: '', errorCode: '', upstreamModelId: null,
      ...(next === 'preflight' && { supply: null, endpoint: null, user: null, key: null, source: null, purpose: null, userRecord: '' }) }, next);
  };
  const reset = () => {
    setFilters(logFilters());
    setPage(1);
    if (!simulation) history.replaceState(history.state, '', observationHash('logs', {}, { view: view === 'requests' ? null : view }));
  };
  const lookup = useMemo(() => new Map(requests.map(row => [row.id, row])), [requests]);
  const request = lookup.get(detail?.requestId);
  const requestIdCell = (value, row) => {
    const requestId = row.parentId ?? row.id;
    const attemptId = row.parentId ? row.id : undefined;
    const hasBody = canViewFullLog && readRequestBody(simulation?.evidence[value]).segments
      .some(segment => segment.text != null && /(^|-)request$/.test(segment.id));
    return <>
      <Button className="admin-log-request-id" size="small" theme="borderless" onClick={() => setDetail({ requestId, attemptId })}
        title={value || undefined} aria-label={['查看请求详情', value, attemptId && `第 ${row.index} 次尝试`].filter(Boolean).join(' ')}>
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
    if (dataIndex === 'requestId') return { ...column, render: requestIdCell, fixed: 'left' };
    if (dataIndex === 'status') return { ...column, render: statusColumn };
    if (dataIndex === 'outcome') return { ...column, render: value => <AdminStatus value={outcomes[value]}/> };
    if (numericFields.has(dataIndex)) return { ...column, render: fmt, align: 'right' };
    return { ...column, render: (value, row) => unknown(format ? format(value, row) : value), ellipsis: { showTitle: true } };
  });
  const exportCsv = () => {
    const data = [fields.map(([title]) => title), ...rows.map(row => fields.map(([, key, format]) => format ? format(row[key], row) : row[key]))];
    try {
      const href = URL.createObjectURL(new Blob([logCsv(data)], { type: 'text/csv;charset=utf-8' }));
      const link = document.createElement('a');
      link.href = href;
      link.download = label + '.csv';
      document.body.append(link);
      link.click();
      link.remove();
      setTimeout(() => URL.revokeObjectURL(href), 0);
      Toast.success('已开始下载');
    } catch { Toast.error('导出失败，请重试'); }
  };
  return <div className="admin-page-stack admin-call-logs">
    <AdminPageHeading title="调用日志">
      {canViewFullLog && <Button className="admin-log-policy-entry" theme="outline" type="tertiary" icon={<IconSetting aria-hidden="true"/>}
        onClick={() => {
          const session = simulation ?? createCallLogSimulation();
          setSettingsSource(simulationPolicy ? { ...session, policy: simulationPolicy } : session);
        }}>日志设置</Button>}
    </AdminPageHeading>
    <section className="admin-call-logs-panel">
      <Tabs activeKey={view} onChange={chooseView} aria-label="调用日志视图">
        {Object.entries(logViews).map(([id, item]) => <Tabs.TabPane key={id} itemKey={id} tab={item.label}/>)}
      </Tabs>
      <CallLogFilters key={view} view={view} pool={pool} filters={filters} window={window} errors={errors}
        onChange={change} onReset={reset}/>
      {!window && <Banner type="danger" closeIcon={null} description="请选择不超过 365 天的有效时间范围。"/>}
      {trend && <ObservationPlot title="前置错误趋势" height={218} compact={false} type="bar" stacked unit="次" labels={trend.map(bucket => bucket.label)}
        actions={<Space wrap><Text type="secondary">共 {fmt(trendRows.length)} 次</Text>
          <AnalysisHelp label="什么是前置错误">请求在发送到模型前被拒绝，例如密钥失效、参数错误或超出频率限制。</AnalysisHelp>
        </Space>}
        series={[...new Set(trendRows.map(row => row.code))].map(code => ({ label: errors.get(code),
          values: trend.map(bucket => bucket.rows.filter(row => row.code === code).length),
        }))}
        onChoose={(index, label) => {
          const bucket = trend[index];
          if (bucket) change({ period: 'custom', start: new Date(bucket.start).toISOString(), end: new Date(bucket.end).toISOString(),
            errorCode: [...errors].find(([, name]) => name === label)?.[0] ?? '' });
        }}/>}
      <Card className="admin-log-results" headerLine={false}
        title={<span>{title} <small role="status">{fmt(rows.length)} 条</small></span>}
        headerExtraContent={
        <Space wrap>
          <Button theme="solid" icon={<IconDownload aria-hidden="true"/>} onClick={exportCsv} disabled={!rows.length}>导出筛选结果</Button>
          <Button theme="light" icon={<IconSetting aria-hidden="true"/>}
            onClick={() => setColumnDraft(visibleFields.map(([, field]) => field))}>列设置</Button>
        </Space>}>
      <Table size="small" rowKey="id" columns={columns} dataSource={rows.slice((currentPage - 1) * size, currentPage * size)}
        scroll={{ x: 'max(100%, ' + columns.reduce((width, column) => width + column.width, 0) + 'px)' }}
        empty={<Empty description="没有符合条件的记录">
          <Button size="small" theme="borderless" onClick={reset}>清除筛选</Button>
        </Empty>}
        pagination={{ currentPage, total: rows.length, pageSize: size, showTotal: true, showSizeChanger: true, pageSizeOpts: PAGE_SIZES,
          onPageChange: setPage, onPageSizeChange: value => { setSize(value); setPage(1); } }}/>
      </Card>
    </section>
    {columnDraft && <Modal visible title="列设置" width="min(500px, calc(100vw - 32px))" closeOnEsc
      okText="保存" onOk={applyColumns} onCancel={() => setColumnDraft(null)}>
      <CheckboxGroup className="admin-log-column-options" aria-label="显示的日志列" value={columnDraft} onChange={setColumnDraft}
        options={fields.map(([label, value]) => ({ label, value, disabled: value === 'requestId' }))}/>
      <Button size="small" theme="borderless" onClick={() => setColumnDraft(fields.map(([, field]) => field))}>恢复默认</Button>
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
