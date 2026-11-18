import { useEffect, useId, useState } from 'react';
import { Banner, Button, Card, DatePicker, Descriptions, Input, Space, Spin, Tag, Typography } from '@douyinfe/semi-ui';
import { IconSearch } from '@douyinfe/semi-icons';
import AdminPageHeading from './AdminPageHeading';
import AdminTable from './AdminTable';
import { AdminSideSheet } from './AdminOverlay';
import { openLogin } from '../login-navigation.mjs';
import { Choice } from './ServiceUI';
import { cloudAdminRequest } from './admin-client.mjs';
import { ADMIN_ROLE_LABELS } from './admin-accounts';
import { ROUTING_STRATEGIES } from './service-routing';
import { AUDIT_ACTIONS, AUDIT_DOMAINS, AUDIT_RESOURCES, AUDIT_RESULTS } from './platform-audit.mjs';
import './audit-logs.css';

const { Text, Title } = Typography;
const time = new Intl.DateTimeFormat('zh-CN', { timeZone: 'Asia/Shanghai', dateStyle: 'short', timeStyle: 'medium' });
const initialFilters = { period: '7', dates: [], action: '', q: '', actor: '', status: '', type: '', tenant: '', project: '' };
const periods = { '1': '近 24 小时', '7': '近 7 天', '30': '近 30 天', custom: '自定义日期' };
const fieldLabels = { active_version: '生效路由版本', strategy: '路由策略', channel_weights: '渠道权重', status: '映射状态',
  configuration_version: '配置版本', active_key_id: '首位密钥 ID', enabled: '供给状态', validation_id: '验证记录 ID',
  personal_space_enabled: '开放个人空间' };
const itemLabels = { succeeded: '已停用', unchanged: '无变化', unknown: '原状态未记录' };
const roleLabels = { target: '操作目标', changed: '实际变更', related: '关联对象' };
const actorName = actor => actor.name || actor.id || '未记录';
const resourceName = resource => resource?.name || resource?.id || '未记录';
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
  if (field === 'strategy') return ROUTING_STRATEGIES[data] || data;
  if (field === 'active_version' || field === 'configuration_version') return 'v' + data;
  if (field === 'channel_weights') return Object.entries(data).map(([id, weight]) => id + ' · ' + weight + '%').join('\n') || '无';
  return String(data);
}

function AuditDetails({ row, accountId, close, onLogin, tenantName, projectName }) {
  const [loaded, setLoaded] = useState(null);
  const [retry, setRetry] = useState(0);
  useEffect(() => {
    const controller = new AbortController();
    readAudit('/audit-logs/' + encodeURIComponent(row.event_id), accountId, controller.signal).then(
      data => { if (!controller.signal.aborted) setLoaded(data); },
      issue => { if (!controller.signal.aborted) setLoaded({ issue }); },
    );
    return () => controller.abort();
  }, [accountId, row.event_id, retry]);
  const event = loaded?.event;
  return <AdminSideSheet visible closeOnEsc width="min(760px, 100vw)" title="审计详情" onCancel={close}>
    <div className="audit-log-detail">
      <Space wrap><Title heading={5}>{AUDIT_ACTIONS[row.action_code]}</Title>{resultTag(row.outcome.status)}</Space>
      {!loaded && <Spin aria-label="正在加载审计详情"/>}
      {loaded?.issue && <Banner type="danger" closeIcon={null} description={<>{loaded.issue.message} <Button size="small"
        onClick={loginRequired(loaded.issue) ? onLogin : () => { setLoaded(null); setRetry(retry + 1); }}>{loginRequired(loaded.issue) ? '后台登录' : '重试'}</Button></>}/>}
      {event && <>
        <Descriptions data={[
          { key: '发生时间', value: time.format(new Date(event.occurred_at)) + '（北京时间）' },
          { key: '操作人', value: [actorName(event.actor), event.actor.name && event.actor.id, ADMIN_ROLE_LABELS[event.actor.role]].filter(Boolean).join(' · ') },
          { key: '审计 ID', value: event.event_id },
          { key: '操作 ID', value: event.operation_id },
          { key: '阶段', value: '配置提交' },
          ...(event.scope.type === 'project' ? [
            { key:'客户', value:tenantName(event.scope.tenant_id) },
            { key:'项目', value:projectName(event.scope.project_id) },
          ] : []),
          ...(event.links?.candidate_id ? [{ key: '候选 ID', value: event.links.candidate_id }] : []),
          ...(event.links?.validation_batch_ids?.length ? [{ key: '验证批次', value: event.links.validation_batch_ids.join('、') }] : []),
        ]}/>
        {event.item_results.length > 0 && <section>
          <Title heading={6}>逐项结果</Title>
          <AdminTable rowKey="resource_ref" pagination={false} dataSource={event.item_results} columns={[
            { title: '模型渠道供给', dataIndex: 'resource_ref', render: value => resourceName(event.resources.find(resource => resource.type + ':' + resource.id === value)) },
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
      </>}
    </div>
  </AdminSideSheet>;
}

export default function AuditLogsPage({ accountId, params, tenants = [], projects = [] }) {
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
  const update = (field, value) => setDraft(current => ({ ...current, [field]: value, ...(field === 'tenant' && { project:'' }) }));
  const refresh = () => { setLoaded(null); setRetry(current => current + 1); };
  const changeFilters = next => { setFilters(next); setCursors(['']); setRangeError(''); refresh(); };
  const apply = event => {
    event.preventDefault();
    if (draft.period === 'custom' && draft.dates.length !== 2) { setRangeError('请选择开始和结束日期'); return; }
    changeFilters(draft);
  };
  const page = next => { setLoaded(null); setCursors(next); };
  const hasFilters = filters.period !== '7' || Boolean(filters.q || filters.action || filters.actor || filters.status || filters.type || filters.tenant || filters.project);
  const tenantName = id => tenants.find(tenant => tenant.id === id)?.name || id;
  const projectName = id => projects.find(project => project.id === id)?.name || id;
  const availableProjects = projects.filter(project => !draft.tenant || project.tenantId === draft.tenant);
  const scopeOptions = (rows, value, allLabel) => [['',allLabel], ...rows.map(row=>[row.id,row.name]),
    ...(value && !rows.some(row=>row.id === value) ? [[value,value]] : [])];
  const columns = [
    { title: '发生时间', width: 155, dataIndex: 'occurred_at', render: value => time.format(new Date(value)) },
    { title: '操作人', width: 125, dataIndex: 'actor', render: actorName },
    { title: '模块', width: 95, dataIndex:'domain', render: domain => AUDIT_DOMAINS[domain] },
    { title: '操作动作', width: 150, render: (_, row) => <Button size="small" theme="borderless" aria-label={AUDIT_ACTIONS[row.action_code] + '详情'}
      onClick={() => setDetail(row)}>{AUDIT_ACTIONS[row.action_code]}</Button> },
    { title: '操作对象', width: 230, render: (_, row) => <>
      {row.target_count > 1 ? row.target_count + ' 个模型渠道供给'
        : row.target?.type === 'project' ? projectName(row.target.id) : resourceName(row.target)}
      {row.scope.type === 'project' && <><br/><Text size="small" type="tertiary">
        {tenantName(row.scope.tenant_id)} · {projectName(row.scope.project_id)}
      </Text></>}
      {row.matched?.roles.includes('related') && <><br/><Text size="small" type="tertiary">关联命中 · {resourceName(row.matched)}</Text></>}
    </> },
    { title: '结果', width: 85, render: (_, row) => resultTag(row.outcome.status) },
  ];
  return <div className="admin-page-stack audit-logs-page">
    <AdminPageHeading title="审计日志"/>
    <Card>
      <form className="audit-log-filters" aria-label="筛选审计日志" onSubmit={apply}>
        <Choice label="时间范围" value={draft.period} onSelect={value => update('period', value)} options={Object.entries(periods)}/>
        {draft.period === 'custom' && <><span id={dateLabel} className="sr-only">自定义日期</span>
          <DatePicker aria-labelledby={dateLabel} aria-invalid={Boolean(rangeError)} type="dateRange" format="yyyy-MM-dd"
            onChangeWithDateFirst={false} placeholder={['开始日期', '结束日期']}
            value={draft.dates} onChange={value => update('dates', Array.isArray(value) ? value.filter(Boolean) : [])}/>
        </>}
        <Input aria-label="搜索对象或记录 ID" placeholder="对象名称 / 对象 ID / 记录 ID" prefix={<IconSearch aria-hidden="true"/>}
          value={draft.q} maxLength={200} onChange={value => update('q', value)} showClear/>
        <Choice label="操作动作" value={draft.action} onSelect={value => update('action', value)}
          options={Object.entries({ '': '全部动作', ...AUDIT_ACTIONS })}/>
        <Choice label="操作结果" value={draft.status} onSelect={value => update('status', value)}
          options={Object.entries({ '': '全部结果', ...AUDIT_RESULTS })}/>
        <Button aria-expanded={more} onClick={() => setMore(!more)}>{more ? '收起筛选' : '更多筛选'}</Button>
        <Button theme="solid" htmlType="submit">查询</Button>
        <Button onClick={() => { setDraft(initialFilters); changeFilters(initialFilters); }}>重置</Button>
        {more && <div className="audit-log-extra-filters">
          <Choice label="客户" value={draft.tenant} onSelect={value => update('tenant',value)}
            options={scopeOptions(tenants,draft.tenant,'全部客户')}/>
          <Choice label="项目" value={draft.project} onSelect={value => update('project',value)}
            options={scopeOptions(availableProjects,draft.project,'全部项目')}/>
          <Input aria-label="操作人" placeholder="操作人名称 / 账号 ID" maxLength={100} value={draft.actor} onChange={value => update('actor', value)} showClear/>
          <Choice label="对象类型" value={draft.type} onSelect={value => update('type', value)}
            options={Object.entries({ '': '全部对象类型', ...AUDIT_RESOURCES })}/>
        </div>}
      </form>
      {rangeError && <Banner type="warning" description={rangeError} closeIcon={null}/>}
      {loaded?.issue ? <Banner type="danger" closeIcon={null} description={<>{loaded.issue.message} <Button size="small"
        onClick={loginRequired(loaded.issue) ? () => openLogin() : refresh}>{loginRequired(loaded.issue) ? '后台登录' : '重试'}</Button></>}/>
        : <AdminTable rowKey="event_id" dataSource={loaded?.items || []} columns={columns} loading={!loaded}
          empty={hasFilters ? '没有符合筛选条件的审计记录' : '暂无审计记录'}
          scroll={{ x: 'max(100%, 840px)' }} pagination={false}/>}
      {loaded && !loaded.issue && (cursors.length > 1 || loaded.nextCursor) && <Space className="audit-log-pagination" role="group" aria-label="分页">
        <Button size="small" disabled={cursors.length < 2} onClick={() => page(cursors.slice(0, -1))}>上一页</Button>
        <Text aria-live="polite">第 {cursors.length} 页</Text>
        <Button size="small" disabled={!loaded.nextCursor} onClick={() => page([...cursors, loaded.nextCursor])}>下一页</Button>
      </Space>}
    </Card>
    {detail && <AuditDetails row={detail} accountId={accountId} tenantName={tenantName} projectName={projectName}
      close={() => setDetail(null)} onLogin={() => openLogin()}/>}
  </div>;
}
