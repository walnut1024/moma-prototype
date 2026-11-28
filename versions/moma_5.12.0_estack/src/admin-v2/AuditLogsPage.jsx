import { useChannelText } from './channel-language';
import { useEffect, useId, useState } from 'react';
import Descriptions from './AdminDescriptions';
import { Banner, Button, Card, DatePicker, Empty, Input, Space, Spin, Tabs, Tag, Toast, Typography } from './xa24/HaloUI.jsx';
import { IconRefresh, IconSearch } from './xa24/HaloIcons.jsx';
import AdminPageHeading from './AdminPageHeading';
import AdminTable from './AdminTable';
import { AdminSideSheet } from './AdminOverlay';
import { openLogin } from '../login-navigation.mjs';
import { Choice, CopyId } from './ServiceUI';
import JsonDocument from './JsonDocument';
import { cloudAdminRequest } from './admin-client.mjs';
import { ADMIN_ROLE_LABELS } from './admin-accounts';
import { ROUTING_STRATEGIES } from './service-routing';
import { AUDIT_ACTIONS, AUDIT_DOMAINS, AUDIT_OBJECT_FILTERS, AUDIT_RESOURCES, AUDIT_RESULTS, AUDIT_SOURCES } from './platform-audit.mjs';
import './audit-logs.css';

const { Text, Title } = Typography;
const time = new Intl.DateTimeFormat('zh-CN', { timeZone: 'Asia/Shanghai', dateStyle: 'short', timeStyle: 'medium' });
const initialFilters = { period: '7', dates: [], event_id: '', actor: '', action: '', source: '', q: '', status: '', type: '', tenant: '', project: '' };
const periods = { '1': '近 24 小时', '7': '近 7 天', '30': '近 30 天', custom: '自定义日期' };
const auditModules = {
  'service_route.publish': '模型运营 / 模型服务',
  'supplier_key_group.rotate': '模型运营 / 模型接入',
  'supplier_key.replace': '模型运营 / 模型接入',
  'model_supply.disable': '模型运营 / 模型接入',
  'model_sale.stop_with_service': '商业运营 / 模型销售',
  'announcement.publish': '平台管理 / 公告管理',
  'announcement.withdraw': '平台管理 / 公告管理',
};
const fieldLabels = { active_version: '生效路由版本', strategy: '路由策略', channel_weights: '上游模型权重', status: '关联上游模型状态',
  configuration_version: '配置版本', active_key_id: '首位密钥 ID', enabled: '上游模型状态', validation_id: '验证记录 ID', personal_space_enabled: '开放个人空间',
  mapping_pending: '关联上游模型变更', service_running: '模型服务状态', sale_status: '售卖状态', marketVisible: '可见性', salesScope: '销售对象',
  announcement_status: '公告状态' };
const itemLabels = { succeeded: '已停用', unchanged: '无变化', unknown: '原状态未记录' };
const roleLabels = { target: '操作目标', changed: '实际变更', related: '关联对象' };
const actorName = actor => actor.name || actor.id || '未记录';
const resourceName = resource => resource?.name || resource?.id || '未记录';
const auditTime = value => time.format(new Date(value));
const moduleName = row => auditModules[row.action_code] || AUDIT_DOMAINS[row.domain] || '—';
const clientName = source => AUDIT_SOURCES[source] || '未记录';
const resultTag = status => <Tag color={status === 'succeeded' ? 'green' : status === 'failed' ? 'red' : 'grey'} size="small">{AUDIT_RESULTS[status]}</Tag>;
const loginRequired = issue => issue?.status === 401;

async function readAudit(path, accountId, signal) {
  const data = await cloudAdminRequest(path, { signal });
  if (data.accountId !== accountId) throw Object.assign(new Error('请使用当前后台账号登录'), { status: 401 });
  return data;
}

function fieldValue(field, value) {
  if (value.state !== 'known') return { redacted: '已脱敏', absent: '无' }[value.state] || '未记录';
  const data = value.value;
  if (data == null) return '未设置';
  if (field === 'enabled' || field === 'personal_space_enabled') return data ? '已启用' : '已停用';
  if (field === 'service_running') return data ? '服务中' : '已停服';
  if (field === 'announcement_status') return { draft:'草稿', scheduled:'待生效', active:'生效中', expired:'已到期', withdrawn:'已撤回' }[data];
  if (field === 'mapping_pending') return data ? '待应用' : '无待应用变更';
  if (field === 'strategy') return ROUTING_STRATEGIES[data] || data;
  if (field === 'active_version' || field === 'configuration_version') return 'v' + data;
  if (field === 'channel_weights') return Object.entries(data).map(([id, weight]) => id + ' · ' + weight + '%').join('\n') || '无';
  return String(data);
}

function AuditChanges({ event }) {
  return <div className="audit-log-changes">
    {event.item_results.length > 0 && <section>
      <Title heading={6}>逐项结果</Title>
      <AdminTable rowKey="resource_ref" pagination={false} dataSource={event.item_results} columns={[
        { title: '上游模型', dataIndex: 'resource_ref', render: value => resourceName(event.resources.find(resource => resource.type + ':' + resource.id === value)) },
        { title: '结果', dataIndex: 'status', render: value => itemLabels[value] },
      ]}/>
    </section>}
    <section>
      <Title heading={6}>变更内容</Title>
      <AdminTable rowKey={change => change.resource_ref + ':' + change.field} pagination={false}
        empty="此记录未保留字段变更摘要" dataSource={event.changes} tableLayout="fixed" columns={[
          { title: '字段 / 对象', width: '40%', render: (_, change) => <><Text>{fieldLabels[change.field] || change.field}</Text><br/>
            <Text type="tertiary" size="small">{change.resource_ref}</Text></> },
          { title: '变更前', width: '30%', render: (_, change) => fieldValue(change.field, change.before) },
          { title: '变更后', width: '30%', render: (_, change) => fieldValue(change.field, change.after) },
        ]}/>
    </section>
    <section>
      <Title heading={6}>操作对象及关联对象</Title>
      <AdminTable rowKey={resource => resource.type + ':' + resource.id} pagination={false} empty="此记录未保留对象"
        dataSource={event.resources} columns={[
          { title: '对象', render: (_, resource) => <>{resourceName(resource)}{resource.name && <><br/><Text type="tertiary" size="small">{resource.id}</Text></>}</> },
          { title: '类型', dataIndex: 'type', render: value => AUDIT_RESOURCES[value] },
          { title: '关系', dataIndex: 'roles', render: values => values.map(role => roleLabels[role]).join('、') },
        ]}/>
    </section>
  </div>;
}

function AuditEvidenceJson({ label, data, fullWidth, toggleFullWidth }) {
  if (!data) return <Empty description={'此事件未记录' + label}/>;
  const text = JSON.stringify(data, null, 2);
  const copy = async () => {
    try { await navigator.clipboard.writeText(text); Toast.success('审计 JSON 已复制'); }
    catch { Toast.error('复制失败，请选择文本复制'); }
  };
  return <JsonDocument text={text} label={label + ' JSON'} actions={<>
    <Button size="small" onClick={copy}>复制审计 JSON</Button>
    <Button size="small" onClick={toggleFullWidth}>{fullWidth ? '退出全屏' : '全屏查看'}</Button>
  </>}/>;
}

function AuditDetails({ row, accountId, close, onLogin, tenantName, projectName }) {
  const [loaded, setLoaded] = useState(null);
  const [retry, setRetry] = useState(0);
  const [fullWidth, setFullWidth] = useState(false);
  useEffect(() => {
    const controller = new AbortController();
    readAudit('/audit-logs/' + encodeURIComponent(row.event_id), accountId, controller.signal).then(
      data => { if (!controller.signal.aborted) setLoaded(data); },
      issue => { if (!controller.signal.aborted) setLoaded({ issue }); },
    );
    return () => controller.abort();
  }, [accountId, row.event_id, retry]);
  const event = loaded?.event;
  const jsonViewProps = { fullWidth, toggleFullWidth: () => setFullWidth(current => !current) };
  return <AdminSideSheet visible closeOnEsc width={fullWidth ? '100vw' : 'min(760px, 100vw)'} title="审计详情" onCancel={close}>
    <div className="audit-log-detail">
      {!loaded && <Spin aria-label="正在加载审计详情"/>}
      {loaded?.issue && <Banner type="danger" closeIcon={null} description={<>{loaded.issue.message} <Button size="small"
        onClick={loginRequired(loaded.issue) ? onLogin : () => { setLoaded(null); setRetry(retry + 1); }}>{loginRequired(loaded.issue) ? '后台登录' : '重试'}</Button></>}/>}
      {event && <>
        <Descriptions row column={2} size="small" data={[
          { key: '事件 ID', value: <CopyId label="事件 ID" value={event.event_id}/> },
          { key: '时间', value: auditTime(event.occurred_at) + '（北京时间）' },
          { key: '操作人', value: [actorName(event.actor), event.actor.name && event.actor.id, ADMIN_ROLE_LABELS[event.actor.role]].filter(Boolean).join(' · ') },
          { key: '操作类型', value: AUDIT_ACTIONS[event.action_code] },
          { key: '模块', value: moduleName(event) },
          { key: '原始操作 Code', value: <CopyId label="原始操作 Code" value={event.action_code}/> },
          { key: 'IP 地址', value: event.ip_address || '未记录' },
          { key: '客户端', value: clientName(event.source) },
          { key: '租户', value: tenantName(event.scope?.tenant_id) || '—' },
          { key: '项目', value: projectName(event.scope?.project_id) || '—' },
          { key: '结果', value: resultTag(event.outcome.status) },
          { key: '操作 ID', value: event.operation_id },
          { key: '阶段', value: '配置提交' },
          ...(event.links?.candidate_id ? [{ key: '候选 ID', value: event.links.candidate_id }] : []),
          ...(event.links?.validation_batch_ids?.length ? [{ key: '验证批次', value: event.links.validation_batch_ids.join('、') }] : []),
        ]}/>
        <Tabs defaultActiveKey="changes" lazyRender onChange={() => setFullWidth(false)} size="small">
          <Tabs.TabPane itemKey="request" tab="请求证据">
            {event.request_evidence?.parameters === null && <Text type="tertiary">此事件未留存请求参数</Text>}
            <AuditEvidenceJson label="请求证据" data={event.request_evidence} {...jsonViewProps}/>
          </Tabs.TabPane>
          <Tabs.TabPane itemKey="response" tab="响应证据">
            <AuditEvidenceJson label="响应证据" data={event.response_evidence} {...jsonViewProps}/>
          </Tabs.TabPane>
          <Tabs.TabPane itemKey="changes" tab="变更证据"><AuditChanges event={event}/></Tabs.TabPane>
          <Tabs.TabPane itemKey="raw" tab="原始详情">
            <AuditEvidenceJson label="审计事件" data={event} {...jsonViewProps}/>
          </Tabs.TabPane>
        </Tabs>
      </>}
    </div>
  </AdminSideSheet>;
}

export default function AuditLogsPage({ accountId, params, tenants = [], projects = [] }) {
  const translateLabel = useChannelText();
  const initialScope = { ...initialFilters, tenant:params?.get('tenant') || '', project:params?.get('project') || '',
    action:Object.hasOwn(AUDIT_ACTIONS,params?.get('action')) ? params.get('action') : '' };
  const [draft, setDraft] = useState(initialScope);
  const [filters, setFilters] = useState(initialScope);
  const [cursors, setCursors] = useState(['']);
  const [loaded, setLoaded] = useState(null);
  const [retry, setRetry] = useState(0);
  const [detail, setDetail] = useState(null);
  const [more, setMore] = useState(Boolean(initialScope.tenant || initialScope.project));
  const [rangeError, setRangeError] = useState('');
  const dateLabel = useId();
  const after = cursors.at(-1);
  useEffect(() => {
    const controller = new AbortController();
    const { period, dates, ...conditions } = filters;
    const query = new URLSearchParams(Object.entries(conditions).filter(([, value]) => value));
    if (after) query.set('after', after);
    if (period === 'custom') {
      query.set('from', String(Date.parse(dates[0] + 'T00:00:00+08:00')));
      query.set('to', String(Date.parse(dates[1] + 'T23:59:59.999+08:00')));
    } else if (period !== '7') query.set('from', String(Date.now() - Number(period) * 86400000));
    readAudit('/audit-logs?' + query, accountId, controller.signal).then(
      data => { if (!controller.signal.aborted) setLoaded(data); },
      issue => { if (!controller.signal.aborted) setLoaded({ issue }); },
    );
    return () => controller.abort();
  }, [accountId, after, filters, retry]);
  const update = (field, value) => setDraft(current => ({ ...current, [field]: value, ...(field === 'tenant' && { project: '' }) }));
  const refresh = () => { setLoaded(null); setRetry(current => current + 1); };
  const changeFilters = next => { setFilters(next); setCursors(['']); setRangeError(''); refresh(); };
  const apply = event => {
    event.preventDefault();
    if (draft.period === 'custom' && draft.dates.length !== 2) { setRangeError('请选择开始和结束日期'); return; }
    changeFilters({ ...draft, event_id: draft.event_id.trim(), actor: draft.actor.trim(), q: draft.q.trim() });
  };
  const page = next => { setLoaded(null); setCursors(next); };
  const hasFilters = Object.keys(initialFilters).some(field => field !== 'dates' && filters[field] !== initialFilters[field]);
  const tenantName = id => tenants.find(tenant => tenant.id === id)?.name || id;
  const projectName = id => projects.find(project => project.id === id)?.name || id;
  const availableProjects = projects.filter(project => !draft.tenant || project.tenantId === draft.tenant);
  const scopeOptions = (rows, value, allLabel) => [['',allLabel], ...rows.map(row=>[row.id,row.name]),
    ...(value && !rows.some(row=>row.id === value) ? [[value,value]] : [])];
  const columns = [
    { title: '事件 ID', width: 226, dataIndex: 'event_id', render: (value, row) => <Button size="small" theme="borderless"
      className="audit-event-link" title={value} onClick={() => setDetail(row)}>{value}</Button> },
    { title: '时间', width: 174, dataIndex: 'occurred_at', render: value => <span className="audit-log-time">{auditTime(value)}</span> },
    { title: '操作人', width: 105, dataIndex: 'actor', render: actor => <div className="audit-log-actor"
      title={[actor.name, actor.id].filter(Boolean).join('\n')}>
      <span>{actorName(actor)}</span>
      {actor.name && actor.id && <Text type="tertiary" size="small">{actor.id}</Text>}
    </div> },
    { title: '操作类型', width: 122, dataIndex: 'action_code', render: value => AUDIT_ACTIONS[value] },
    { title: '模块', width: 165, render: (_, row) => moduleName(row) },
    { title: 'IP 地址', width: 106, dataIndex: 'ip_address', render: value => value || '—' },
    { title: '客户端', width: 77, dataIndex: 'source', render: clientName },
    { title: '租户', width: 70, render: (_, row) => tenantName(row.scope?.tenant_id) || '—' },
    { title: '项目', width: 70, render: (_, row) => projectName(row.scope?.project_id) || '—' },
    { title: '结果', width: 77, render: (_, row) => resultTag(row.outcome.status) },
    { title: '操作对象', width: 172, render: (_, row) => <>
      {row.target_count > 1 ? row.target_count + ' 个上游模型'
        : row.target?.type === 'project' ? projectName(row.target.id) : resourceName(row.target)}
      {row.matched?.roles.includes('related') && <><br/><Text size="small" type="tertiary">关联命中 · {resourceName(row.matched)}</Text></>}
    </> },
  ];
  return <div className="admin-page-stack audit-logs-page">
    <AdminPageHeading title={translateLabel("审计日志")}>
      <Button icon={<IconRefresh aria-hidden="true"/>} onClick={() => { setCursors(['']); refresh(); }}>刷新</Button>
    </AdminPageHeading>
    <Card>
      <form className="audit-log-filters" aria-label="筛选审计日志" onSubmit={apply}>
        <Choice label="时间范围" value={draft.period} onChange={value => update('period', value)} options={Object.entries(periods)}/>
        {draft.period === 'custom' && <><span id={dateLabel} className="sr-only">自定义日期</span>
          <DatePicker aria-labelledby={dateLabel} aria-invalid={Boolean(rangeError)} type="dateRange" format="yyyy-MM-dd"
            onChangeWithDateFirst={false} placeholder={['开始日期', '结束日期']}
            value={draft.dates} onChange={value => update('dates', Array.isArray(value) ? value.filter(Boolean) : [])}/>
        </>}
        <Input aria-label="事件 ID" placeholder="事件 ID" prefix={<IconSearch aria-hidden="true"/>}
          value={draft.event_id} maxLength={200} onChange={value => update('event_id', value)} showClear/>
        <Input aria-label="操作人" placeholder="操作人名称 / 账号 ID" maxLength={100} value={draft.actor} onChange={value => update('actor', value)} showClear/>
        <Choice label="操作类型" value={draft.action} onChange={value => update('action', value)}
          options={Object.entries({ '': '全部操作类型', ...AUDIT_ACTIONS })}/>
        <Choice label="客户端类型" value={draft.source} onChange={value => update('source', value)}
          options={Object.entries({ '': '全部客户端类型', ...AUDIT_SOURCES })}/>
        <Button aria-expanded={more} onClick={() => setMore(!more)}>{more ? '收起筛选' : '更多筛选'}</Button>
        <Button theme="solid" htmlType="submit">查询</Button>
        <Button onClick={() => { setDraft(initialFilters); changeFilters(initialFilters); }}>重置</Button>
        {more && <div className="audit-log-extra-filters">
          <Choice label="租户" value={draft.tenant} onChange={value => update('tenant',value)}
            options={scopeOptions(tenants,draft.tenant,'全部租户')}/>
          <Choice label="项目" value={draft.project} onChange={value => update('project',value)}
            options={scopeOptions(availableProjects,draft.project,'全部项目')}/>

          <Input aria-label="搜索对象或记录 ID" placeholder="对象名称 / 对象 ID / 记录 ID"
            value={draft.q} maxLength={200} onChange={value => update('q', value)} showClear/>
          <Choice label="操作结果" value={draft.status} onChange={value => update('status', value)}
            options={Object.entries({ '': '全部结果', ...AUDIT_RESULTS })}/>
          <Choice label="对象类型" value={draft.type} onChange={value => update('type', value)}
            options={Object.entries({ '': '全部对象类型', ...AUDIT_OBJECT_FILTERS })}/>
        </div>}
      </form>
      {rangeError && <Banner type="warning" description={rangeError} closeIcon={null}/>}
      {loaded?.issue ? <Banner type="danger" closeIcon={null} description={<>{loaded.issue.message} <Button size="small"
        onClick={loginRequired(loaded.issue) ? () => openLogin() : refresh}>{loginRequired(loaded.issue) ? '后台登录' : '重试'}</Button></>}/>
        : <AdminTable className="audit-log-table" rowKey="event_id" dataSource={loaded?.items || []} columns={columns} loading={!loaded}
          empty={hasFilters ? '没有符合筛选条件的审计记录' : '暂无审计记录'}
          scroll={{ x: `max(100%, ${columns.reduce((width, column) => width + column.width, 0)}px)` }} tableLayout="fixed" pagination={false}/>}
      {loaded && !loaded.issue && (cursors.length > 1 || loaded.nextCursor) && <Space className="audit-log-pagination" role="group" aria-label={translateLabel("分页")}>
        <Button size="small" disabled={cursors.length < 2} onClick={() => page(cursors.slice(0, -1))}>{translateLabel("上一页")}</Button>
        <Text aria-live="polite">第 {cursors.length} 页</Text>
        <Button size="small" disabled={!loaded.nextCursor} onClick={() => page([...cursors, loaded.nextCursor])}>{translateLabel("下一页")}</Button>
      </Space>}
    </Card>
    {detail && <AuditDetails row={detail} accountId={accountId} tenantName={tenantName} projectName={projectName} close={() => setDetail(null)} onLogin={() => openLogin()}/>}
  </div>;
}
