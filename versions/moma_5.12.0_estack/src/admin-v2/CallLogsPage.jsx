import { workspaceStoragePrefix } from "../workspace-storage.mjs";
import { useMemo, useState } from 'react';
import { Banner, Button, Card, CheckboxGroup, Empty, Input, InputNumber, Space, Switch, Tabs, Toast, Typography } from '@douyinfe/semi-ui';
import { IconArrowDown, IconArrowUp, IconDownload, IconSearch, IconSetting, IconSort } from '@douyinfe/semi-icons';
import Table from './AdminTable';
import AdminStatus from './AdminStatus';
import AdminPageHeading from './AdminPageHeading';
import { AdminModal as Modal } from './AdminOverlay';
import RequestLogDetail from './RequestLogDetail';
import { requestLogSections } from './call-log-detail.mjs';
import { Choice } from './ServiceUI';
import { DEFAULT_PAGE_SIZE, FilterReset, FilterToolbar, PAGE_SIZES } from '../components/FilterControls';
import {
  ObservationConditions, ObservationFilterGroup, ObservationFilterLayout, ObservationIdentitySearch, ObservationPick,
  ObservationPlot, ObservationSupplyPick, ObservationTimeRange, observationConditions, useObservationSupply,
} from './CallObservationControls';
import {
  callObservations, changeObservationTenant, compareLogRows, defaultObservationGrain, filterObservations, httpLabel, logCsv, modelTypes,
  observationBuckets, observationFilters, observationHash, observationKey, observationNumber as fmt, observationWindow, outcomes, preflightTypes,
} from './call-observations.mjs';
import { applyLogPolicy, createCallLogSimulation, simulateLogRequest, routingDemoRequestId } from './call-log-simulation.mjs';

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
  source: 104, purpose: 104, tenantName: 140, projectName: 140, project: 150, ttft: 136,
  userName: 100, user: 144, keyName: 128, keyDisplayId: 160, keyMasked: 140,
  preflightType: 136, code: 205, errorReason: 238 };
const allRequestColumns = requestLogSections.flatMap(([, fields]) => fields);
const primaryFields = ['requestId', 'at', 'modelName', 'tenantName', 'projectName', 'outcome', 'status', 'duration', 'channelName'];
const requestColumns = [
  ...primaryFields.map(key => allRequestColumns.find(([, field]) => field === key)),
  ...allRequestColumns.filter(([, field]) => !primaryFields.includes(field)),
];
const defaultHiddenFields = requestColumns.slice(primaryFields.length).map(([, field]) => field);
const preflightNames = new Map(preflightTypes);
const preflightColumns = [
  ...requestColumns.slice(0, 3), ['前置错误类型', 'preflightType', value => preflightNames.get(value)],
  ['HTTP 状态码', 'status'], ['失败原因', 'errorReason', (value, row) => value ?? row.code ?? '未采集'],
  ['错误码', 'code'], ['客户', 'tenantName'],
];
const numericFields = new Set(['total', 'input', 'output', 'firstPacket', 'ttft', 'duration']);
const sortFields = new Set(['at', 'status', ...numericFields]);
const defaultSort = { field: 'at', direction: -1 };
const columnStorageKey = workspaceStoragePrefix + 'call-log-columns';
const simulationFilters = () => observationFilters(undefined, '24h');

function readHiddenColumns() {
  try {
    const saved = JSON.parse(localStorage.getItem(columnStorageKey));
    return {
      requests: Array.isArray(saved?.requests) ? saved.requests : defaultHiddenFields,
      preflight: Array.isArray(saved?.preflight) ? saved.preflight : [],
    };
  } catch { return { requests: defaultHiddenFields, preflight: [] }; }
}

export default function CallLogsPage({ state, params, simulation, setSimulation, canViewFullLog }) {
  const [view, setView] = useState(() => params.get('view') === 'preflight' ? 'preflight' : 'requests');
  const [filters, setFilters] = useState(() => observationFilters(params, simulation ? '24h' : 'today'));
  const [detail, setDetail] = useState(null);
  const [hiddenColumns, setHiddenColumns] = useState(readHiddenColumns);
  const [columnDraft, setColumnDraft] = useState(null);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [viewSorts, setViewSorts] = useState({});
  const [page, setPage] = useState(1);
  const [size, setSize] = useState(DEFAULT_PAGE_SIZE);
  const source = simulation?.data ?? state;
  const { requests } = useMemo(() => callObservations(source), [source]);
  const preflightView = view === 'preflight';
  const fields = preflightView ? preflightColumns : requestColumns;
  const visibleFields = fields.filter(([, field]) => field === 'requestId' || !hiddenColumns[view].includes(field));
  const sort = viewSorts[view] || defaultSort;
  const pool = preflightView ? requests.filter(row => row.preflightType) : requests;
  const projectRows = useMemo(() => requests.filter(row => filters.tenant == null
    || filters.tenant.includes(observationKey(row, 'tenant'))), [requests, filters.tenant]);
  const preflightEvents = useMemo(() => simulation && callObservations({ ...source, requests: simulation.preflightEvents }).requests,
    [source, simulation]);
  const supply = useObservationSupply(requests, filters.supply);
  const window = observationWindow(filters);
  const rows = filterObservations(pool, filters, window)
    .sort((a, b) => compareLogRows(a, b, sort.field, sort.direction));
  const trendRows = preflightView && preflightEvents ? filterObservations(preflightEvents, filters, window) : rows;
  const trend = preflightView && window && !filters.query.trim()
    ? observationBuckets(trendRows, window, defaultObservationGrain(filters, window)) : null;
  const currentPage = Math.min(page, Math.max(1, Math.ceil(rows.length / size)));
  const change = patch => { setFilters(current => ({ ...current, ...patch })); setPage(1); };
  const changeTenant = ({ tenant }) => {
    const patch = changeObservationTenant(requests, filters, tenant);
    change(patch);
    if ('project' in patch || 'user' in patch || 'key' in patch) Toast.info('已移除新客户范围之外的调用方条件');
  };
  const chooseView = next => {
    setView(next);
    change({ outcome: '', http: '', preflightType: '', ...(next === 'preflight' && { supply: null, endpoint: null }) });
  };
  const reset = () => {
    setFilters(simulation ? simulationFilters() : observationFilters());
    setPage(1);
    if (!simulation) history.replaceState(history.state, '', observationHash('logs', {}, { view: preflightView ? 'preflight' : null }));
  };
  const toggleSimulation = () => {
    setDetail(null);
    setSettingsOpen(false);
    if (simulation) {
      const previous = simulation.previous;
      setView(previous?.view ?? 'requests');
      setFilters(previous?.filters ?? observationFilters(params));
      setPage(previous?.page ?? 1);
      setSize(previous?.size ?? DEFAULT_PAGE_SIZE);
      setViewSorts(previous?.viewSorts ?? {});
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
  const request = lookup.get(detail);
  const codes = [...new Set([...pool.map(row => String(row.status ?? 'unreported')), filters.http].filter(Boolean))]
    .sort((a, b) => a.localeCompare(b, 'zh-CN', { numeric: true }));
  const conditions = observationConditions(pool, filters, selectors, patch => 'tenant' in patch ? changeTenant(patch) : change(patch));
  if (supply.group.items !== null) conditions.push([supply.group.label, supply.group.items.join('、') || '未选择', () => change({ supply: null })]);
  for (const [key, label, value] of [
    ['type', '模型类型', new Map(modelTypes).get(filters.type)], ['userRecord', '调用用户记录', new Map(userRecordOptions).get(filters.userRecord)],
    ['http', 'HTTP 状态码', httpLabel(filters.http === 'unreported' ? null : Number(filters.http))],
    ['preflightType', '前置错误类型', preflightNames.get(filters.preflightType)],
  ]) {
    if (filters[key]) conditions.push([label, value || filters[key], () => change({ [key]: '' })]);
  }
  const pick = (dimension, label, update = change) => <ObservationPick dimension={dimension} label={label}
    rows={pool} filters={filters} onChange={update}/>;
  const requestIdCell = (value, row) => <>
    <Button className="admin-log-request-id" size="small" theme="borderless" onClick={() => setDetail(row.id)}
      title={value || undefined} aria-label={value ? '查看请求详情 ' + value : '查看请求详情'}>{value || '查看详情'}</Button>
    {row.attempts.length > 1 && <div><Text size="small" type="tertiary">已记录 {row.attempts.length} 次上游尝试</Text></div>}
  </>;
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
      link.download = preflightView ? '前置错误.csv' : '调用日志.csv';
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
        {canViewFullLog && simulation && <Button icon={<IconSetting aria-hidden="true"/>}
          onClick={() => setSettingsOpen(true)}>模拟日志设置</Button>}
        <Button theme="solid" icon={<IconDownload aria-hidden="true"/>} onClick={exportCsv} disabled={!rows.length}>导出筛选结果</Button>
      </Space>
    </AdminPageHeading>
    {simulation && <Card className="admin-log-simulation">
      <section aria-label="留存模拟">
        <div className="admin-log-simulation-bar">
          <div className="admin-log-simulation-policy" role="status">
            <Text strong>{simulation.retainNew ? simulation.policy.captureBody ? '按项目留存正文' : '仅留存摘要' : '关闭新请求留存'}</Text>
          </div>
          <Space wrap>
            <Text>留存新请求</Text>
            <Switch aria-label="留存新请求" checked={simulation.retainNew}
              onChange={retainNew => setSimulation(current => ({ ...current, retainNew }))}/>
            <Button theme="light" onClick={() => setSimulation(current => simulateLogRequest(current))}>模拟一次调用</Button>
            <Button theme="light" onClick={() => setSimulation(current => simulateLogRequest(current, Date.now(), { preflight: true }))}>模拟前置错误</Button>
            <Button theme="light" onClick={() => setDetail(routingDemoRequestId)}>查看重试与备用模型回退</Button>
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
      <Tabs.TabPane itemKey="preflight" tab="前置错误"/>
    </Tabs>
    <Card>
      <div className="admin-analytics-fields">
        <FilterToolbar>
          <ObservationTimeRange filters={filters} window={window} onChange={change}/>
          <FilterReset onClick={reset}/>
        </FilterToolbar>
        <ObservationFilterLayout primary={<>
          <Input className="admin-observe-search" aria-label="搜索 Request ID" placeholder="搜索 Request ID"
            prefix={<IconSearch aria-hidden="true"/>} value={filters.query} onChange={value => change({ query: value })} showClear/>
          {pick('model', '模型')}
          {pick('tenant', '客户', changeTenant)}
          <ObservationPick dimension="project" label="项目" rows={projectRows} filters={filters} onChange={change}/>
          {preflightView ? <Choice size="small" label="前置错误类型" value={filters.preflightType || 'all'}
            options={[[ 'all', '全部错误类型' ], ...preflightTypes]}
            onChange={value => change({ preflightType: value === 'all' ? '' : value })}/>
            : <Choice size="small" label="最终结果" value={filters.outcome || 'all'} options={outcomeOptions}
              onChange={value => change({ outcome: value === 'all' ? '' : value })}/>}
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
          <ObservationFilterGroup label={preflightView ? '模型' : '模型与渠道'}>
            {pick('callId', '模型调用标识')}
            {!preflightView && <ObservationSupplyPick {...supply} onChange={change}/>}
            {!preflightView && filters.endpoint != null && pick('endpoint', '端点')}
          </ObservationFilterGroup>
          <ObservationFilterGroup label="请求结果">
            <Choice size="small" label="HTTP 状态码" value={filters.http || 'all'}
              options={[[ 'all', '全部状态码' ], ...codes.map(code => [code, httpLabel(code === 'unreported' ? null : Number(code))])]}
              onChange={value => change({ http: value === 'all' ? '' : value })}/>
          </ObservationFilterGroup>
        </ObservationFilterLayout>
        <ObservationConditions conditions={conditions}/>
      </div>
    </Card>
    {!window && <Banner type="danger" closeIcon={null} description="请选择不超过 365 天的有效时间范围。"/>}
    {trend && <ObservationPlot title="前置错误趋势" type="bar" stacked unit="次" labels={trend.map(bucket => bucket.label)}
      actions={<Text type="secondary">{preflightEvents ? '模拟前置错误合计' : '已记录前置错误'} {fmt(trendRows.length)} 次</Text>}
      series={preflightTypes.filter(([kind]) => !filters.preflightType || filters.preflightType === kind)
        .map(([kind, label]) => ({ label, values: trend.map(bucket => bucket.rows.filter(row => row.preflightType === kind).length) }))}
      onChoose={(index, label) => {
        const bucket = trend[index];
        if (bucket) change({ period: 'custom', start: new Date(bucket.start).toISOString(), end: new Date(bucket.end).toISOString(),
          preflightType: preflightTypes.find(([, name]) => name === label)?.[0] ?? '' });
      }}/>}
    <Card title={preflightView ? '已留存样本' : undefined} headerLine={false} bodyStyle={{ paddingTop: 0 }} headerExtraContent={
      <Button theme="light" icon={<IconSetting aria-hidden="true"/>}
        onClick={() => setColumnDraft(visibleFields.map(([, field]) => field))}>列设置</Button>
    }>
      <Table size="small" rowKey="id" columns={columns} dataSource={rows.slice((currentPage - 1) * size, currentPage * size)}
        scroll={{ x: 'max(100%, ' + columns.reduce((width, column) => width + column.width, 0) + 'px)' }}
        empty={window && filters.query.trim() ? <Empty description={
          <Space direction="vertical">
            <Text strong>未找到可查看的日志</Text>
            <Button size="small" theme="borderless" onClick={() => change({ query: '' })}>清除搜索</Button>
          </Space>
        }/> : '没有符合条件的记录'}
        pagination={{ currentPage, total: rows.length, pageSize: size, showTotal: true, showSizeChanger: true, pageSizeOpts: PAGE_SIZES,
          onPageChange: setPage, onPageSizeChange: value => { setSize(value); setPage(1); } }}/>
    </Card>
    {columnDraft && <Modal visible title="列设置" width="min(500px, calc(100vw - 32px))" closeOnEsc
      okText="保存" onOk={applyColumns} onCancel={() => setColumnDraft(null)}>
      <CheckboxGroup className="admin-log-column-options" aria-label="显示的日志列" value={columnDraft} onChange={setColumnDraft}
        options={fields.map(([label, value]) => ({ label, value, disabled: value === 'requestId' }))}/>
      <Button size="small" theme="borderless" onClick={() => setColumnDraft(fields
        .map(([, field]) => field).filter(field => preflightView || !defaultHiddenFields.includes(field)))}>恢复默认</Button>
    </Modal>}
    {settingsOpen && simulation && canViewFullLog && <LogPolicyDialog simulation={simulation} close={() => setSettingsOpen(false)}
      onSave={setSimulation}/>}
    {request && <RequestLogDetail key={request.id} row={request}
      evidence={simulation?.evidence[request.id]} canViewFullLog={canViewFullLog} close={() => setDetail(null)}/>}
  </div>;
}

function LogPolicyDialog({ simulation, close, onSave }) {
  const [draft, setDraft] = useState(simulation.policy);
  const [invalid, setInvalid] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const change = (field, value) => { setDraft(current => ({ ...current, [field]: value })); setInvalid(false); };
  const save = () => {
    const updated = applyLogPolicy(simulation, draft);
    if (!updated) { setInvalid(true); return; }
    onSave(updated);
    close();
    Toast.success('模拟日志设置已应用');
  };
  const cancel = () => {
    if (Object.keys(draft).every(key => draft[key] === simulation.policy[key])) { close(); return; }
    setConfirming(true);
  };
  return <><Modal visible title="模拟日志设置" okText="保存设置" onOk={save} onCancel={cancel}
    closeOnEsc width="min(560px, calc(100vw - 32px))">
    <div className="admin-analytics-fields admin-log-policy">
      <Banner type="info" closeIcon={null} description="设置在本次模拟中有效。已留存的正文按原记录查询。"/>
      <section>
        <Typography.Title heading={6} component="h3">隐私与内容记录</Typography.Title>
        <label className="admin-log-policy-switch">按需开启 Prompt / 响应全量记录
          <Switch aria-label="按需开启 Prompt / 响应全量记录" checked={draft.captureBody}
            onChange={value => change('captureBody', value)}/>
        </label>
        <Choice label="全量记录适用范围" value={draft.projectId}
          options={[[ 'all', '全部项目' ], ...simulation.data.projects.map(project => [project.id, project.name])]}
          disabled={!draft.captureBody} onChange={value => change('projectId', value)}/>
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
      </section>
      {invalid && <Banner type="danger" closeIcon={null} description="请填写整数。采样比例 1–100，留存天数 1–365，最大留存条数至少 100。"/>}
    </div>
  </Modal>
    {confirming && <Modal visible title="放弃未保存的日志设置？" okText="放弃修改" cancelText="继续编辑"
      onOk={close} onCancel={() => setConfirming(false)}/>}
  </>;
}
