import { Button, Card, Input, Modal, Progress, RadioGroup, Select, Switch, Tabs, Tag, TextArea } from '@douyinfe/semi-ui';
import { useId, useState } from 'react';
import { roleDemoWorkspace } from '../role-demo-data.mjs';
import { shanghaiDate } from '../shanghai-date.mjs';
import { TimeSeriesChart } from './AnalyticsCharts';
import './role-demo-overview.css';

const DAY = 86_400_000;
const num = value => Number(value).toLocaleString('zh-CN');
const money = value => Number(value).toLocaleString('zh-CN', { style: 'currency', currency: 'CNY' });
const pct = value => value.toLocaleString('zh-CN', { style: 'percent', maximumFractionDigits: 1 });
const compact = value => value >= 1e6 ? (value / 1e6).toFixed(1) + 'M' : value >= 1e3 ? (value / 1e3).toFixed(1) + 'K' : num(value);
const tokens = row => row.input + row.output;
const subscription = row => ['订阅','Token Plan','subscription'].includes(row.billing ?? row.billingType);
const periods = [{ label: '近 7 天', value: 7 }, { label: '近 3 天', value: 3 }];
const ranks = [{ label: '按模型', value: '模型' }, { label: '按密钥', value: '密钥' }, { label: '按用户', value: '用户' }];
const uid = (prefix, suffix) => `${prefix}-${suffix}`;

function recentDays(count) {
  const midnight = Date.parse(`${shanghaiDate(new Date())}T00:00:00+08:00`);
  return Array.from({ length: count }, (_, index) => shanghaiDate(new Date(midnight - (count - 1 - index) * DAY)));
}

function summary(records) {
  return records.reduce((total, row) => {
    total.count += 1;
    total.tokens += tokens(row);
    total.cost += row.cost;
    total.success += Number(row.status === '成功');
    if (subscription(row)) total.plan += row.planTokens ?? tokens(row);
    else total.payg += row.cost;
    return total;
  }, { count: 0, tokens: 0, cost: 0, success: 0, plan: 0, payg: 0 });
}

function groupCalls(records, key) {
  const groups = new Map();
  for (const row of records) {
    const name = key(row);
    if (!groups.has(name)) groups.set(name, []);
    groups.get(name).push(row);
  }
  return [...groups].map(([name, rows]) => ({ name, ...summary(rows) }));
}

function Panel({ title, actions, children }) {
  return <Card className="role-demo-card" bordered={false} header={<div className="role-demo-card-heading"><h2>{title}</h2>{actions}</div>}>
    {children}
  </Card>;
}

function DataTable({ headings, rows, label, className = '' }) {
  return <div className="role-demo-table-scroll" role="region" aria-label={label} tabIndex={0}>
    <table className={'role-demo-project-table ' + className}>
      <thead><tr>{headings.map(name => <th key={name} scope="col">{name}</th>)}</tr></thead>
      <tbody>{rows.map(({ id, cells }) => <tr key={id}><th scope="row">{cells[0]}</th>
        {cells.slice(1).map((cell, index) => <td key={index}>{cell}</td>)}
      </tr>)}</tbody>
    </table>
    {!rows.length && <p className="role-demo-empty">暂无记录</p>}
  </div>;
}

function Period({ value, onChange, label }) {
  return <RadioGroup type="button" aria-label={label} value={value} options={periods} onChange={event => onChange(event.target.value)} />;
}

function OverviewTrend({ title, caption, total, totalFormatter, trend, records, measure, units, color, onDetails, english }) {
  const [period, setPeriod] = useState(7);
  const days = recentDays(period);
  const scale = total ?? measure(summary(records.filter(row => row.date >= days[0])));
  return <Panel title={title} actions={onDetails && <Button className="role-demo-detail-button" size="small" onClick={onDetails}>{english ? 'View Details' : '查看详情'}</Button>}>
    <p className="role-demo-muted">{caption(period)}</p>
    <strong className="role-demo-trend-value">{totalFormatter(scale)}</strong>
    <div className="role-demo-trend-controls"><span className="role-demo-muted">{trend}</span><Period value={period} onChange={setPeriod} label={trend + '周期'} /></div>
    <TimeSeriesChart labels={days.map(day => day.slice(5))} series={[{
      label: trend, color, showPoints: true, values: days.map(day => measure(summary(records.filter(row => row.date === day)))),
    }]} unit={units} label={trend} height={130} type="area" compact overview showData={false} />
  </Panel>;
}

function DemoPlans({ plans, project, personal, models, onOrder, onResources, english }) {
  const [detail, setDetail] = useState(null);
  const planModels = plan => Array.isArray(plan?.models) ? plan.models : models;
  const heading = personal ? (english ? 'My Token Plan' : '我的 Token Plan') : '项目 Token Plan';
  return <Panel title={<>{heading} <Tag size="small" color="grey">{plans.length}</Tag></>}
    actions={<div className="role-demo-overview-actions">
      {personal ? <><Button theme="borderless" size="small" onClick={onOrder}>{english ? 'Subscribe to Token Plan' : '订购 Token Plan'} ↗</Button><Button size="small" onClick={() => setDetail('all')}>{english ? 'View More' : '查看全部'}</Button></>
        : <Button theme="borderless" size="small" onClick={onResources}>查看资源权限 ↗</Button>}
    </div>}>
    {!personal && <p className="role-demo-muted">已关联「{project?.name || '当前项目'}」，套餐额度仅限本项目调用使用，不跨项目共享。</p>}
    {plans.length ? <ul className="role-demo-plan-list">{plans.map(plan => {
      const remaining = Math.max(0, plan.total - plan.used);
      const expired = Boolean(plan.expiresAt && plan.expiresAt < shanghaiDate(new Date()));
      const balance = `${compact(remaining)} / ${compact(plan.total)}`;
      return <li key={plan.id}>
        <strong>{plan.name}</strong>
        <p className="role-demo-muted">{english ? 'Remain' : '余量'} {balance}</p>
        <Progress percent={plan.total ? remaining / plan.total * 100 : 0} size="small" aria-label={`${plan.name}剩余 Token`} aria-valuetext={`${balance} Token`} />
        <p className="role-demo-muted">{english ? 'Expiry' : '到期时间'} {plan.expiresAt || '—'}</p>
        <div className="role-demo-plan-status" data-plan-state={expired || !remaining ? 'inactive' : 'active'}>{expired ? '已到期' : remaining ? '已启用' : '额度耗尽'}</div>
        {personal ? <span className="role-demo-muted">账户级套餐</span> : <Button className="role-demo-text-button" theme="borderless" size="small" onClick={() => setDetail(plan.id)}>包含 {planModels(plan).length} 个固定模型</Button>}
      </li>;
    })}</ul> : <p className="role-demo-empty">暂无 Token Plan</p>}
    {detail && <Modal visible title={detail === 'all' ? heading : plans.find(plan => plan.id === detail)?.name} footer={null} onCancel={() => setDetail(null)}>
      <ul>{(detail === 'all' ? plans.map(plan => `${plan.name} · 到期时间 ${plan.expiresAt || '—'}`) : planModels(plans.find(plan => plan.id === detail)))
        .map(item => <li key={item}>{item}</li>)}</ul>
    </Modal>}
  </Panel>;
}

function Rankings({ records, keys, fees }) {
  const [period, setPeriod] = useState(7);
  const [group, setGroup] = useState('模型');
  const title = `${fees ? '费用' : '调用量'}排行 Top 5`;
  const measure = fees ? 'cost' : 'count';
  const scoped = records.filter(row => row.date >= recentDays(period)[0]);
  const total = summary(scoped)[measure];
  const by = row => group === '模型' ? row.model : group === '用户' ? row.user
    : keys.find(key => key.id === row.keyId)?.name || keys.find(key => key.user === row.user)?.name || '在线体验';
  const rows = groupCalls(scoped, by).sort((left, right) => right[measure] - left[measure]).slice(0, 5);
  return <Panel title={title}>
    <div className="role-demo-trend-controls role-demo-rank-controls">
      <RadioGroup aria-label={title + '分组'} type="button" value={group} options={ranks} onChange={event => setGroup(event.target.value)} />
      <Period value={period} onChange={setPeriod} label={title + '周期'} />
    </div>
    <DataTable label={title} className="role-demo-rank-table" headings={['排名', group, fees ? '费用' : '请求数', '占比']}
      rows={rows.map((row, index) => ({ id: row.name, cells: [index + 1, row.name, fees ? money(row.cost) : num(row.count),
        <div className="role-demo-rank-share"><Progress percent={total ? row[measure] / total * 100 : 0} size="small" aria-label={row.name + '占比'} />{total ? pct(row[measure] / total) : '0%'}</div>,
      ] }))} />
  </Panel>;
}

function callTime(row) {
  const time = row.createdAt || row.date;
  return String(time).replace(/^\d{4}-/, '').replace('-', '/').replace('T', ' ').slice(0, 14);
}

function RecentCalls({ records, onPage }) {
  const [active, setActive] = useState(null);
  const recent = [...records].sort((a, b) => (b.createdAt || b.date).localeCompare(a.createdAt || a.date)).slice(0, 5);
  return <Panel title="最近调用" actions={<Button theme="borderless" onClick={() => onPage('call-logs')}>查看全部日志</Button>}>
    <DataTable label="最近调用" headings={['调用时间','模型','渠道','调用来源','状态','Token','费用','操作']} rows={recent.map(row => ({id:row.id,cells:[
      callTime(row), row.model, subscription(row) ? '订阅' : '按量', row.source || 'API 调用', <Tag size="small" color={row.status === '成功' ? 'green' : 'red'}>{row.status}</Tag>,
      num(tokens(row)), money(row.cost), <Button theme="borderless" size="small" onClick={() => setActive(row)}>详情</Button>,
    ]}))} />
    {active && <Modal visible title="调用详情" footer={null} onCancel={() => setActive(null)}><dl className="role-demo-project-fields">
      {Object.entries({'请求 ID':active.id,'调用时间':callTime(active),'模型':active.model,'调用用户':active.user,'状态':active.status,
        '输入 Token':num(active.input),'输出 Token':num(active.output),'费用':money(active.cost)}).map(([label,value]) => <div key={label}><dt>{label}</dt><dd>{value}</dd></div>)}
    </dl></Modal>}
  </Panel>;
}

const popularModels = [
  { name:'DeepSeek-V4-Pro', description:'适用于多步骤推理、代码分析和长文本处理。', note:'服务商：DeepSeek' },
  { name:'GLM-5.3', description:'适用于通用对话、复杂推理与工具调用。', note:'服务商：智谱 AI' },
  { name:'DeepSeek-V4-Flash-0731', description:'适用于实时问答、摘要和高频文本处理。', note:'服务商：DeepSeek' },
];

export function RoleDemoHome({ workspace, onPage, onProjectChange, english = false }) {
  const { actorId, role, personal, canManageProject, projects, project, records, keys, plans } = workspace;
  const filterId = useId();
  const [selection, setSelection] = useState(null);
  const [users, setUsers] = useState([]);
  const [period, setPeriod] = useState(7);
  const chosen = selection?.filter(id => projects.some(row => row.id === id)) || [project?.id].filter(Boolean);
  const selectedProjects = chosen.length ? chosen : [project?.id].filter(Boolean);
  const projectWorkspaces = selectedProjects.map(id => id === project?.id ? workspace : roleDemoWorkspace(actorId || role, id));
  const allRecords = projectWorkspaces.flatMap(item => item.records);
  const previousRecords = projectWorkspaces.flatMap(item => item.previousRecords || []);
  const allKeys = projectWorkspaces.flatMap(item => item.keys);
  const userOptions = [...new Set(allRecords.map(row => row.user))].map(name => ({label:name,value:name}));
  const scopedUsers = users.filter(name => userOptions.some(option => option.value === name));
  const canFilterUsers = !personal && canManageProject;
  const byUsers = rows => canFilterUsers && scopedUsers.length ? rows.filter(row => scopedUsers.includes(row.user)) : rows;
  const scoped = byUsers(allRecords);
  const today = shanghaiDate(new Date());
  const comparable = recentDays(period * 2);
  const values = summary(scoped.filter(row => row.date >= comparable[period]));
  const prior = summary(byUsers([...previousRecords,...allRecords]).filter(row => row.date >= comparable[0] && row.date < comparable[period]));
  const monthly = summary(byUsers([...previousRecords,...allRecords]).filter(row => row.date.startsWith(today.slice(0, 7))));
  const projectModels = (project?.models || [...new Set(records.map(row => row.model))]).map(modelName);
  const openProject = tab => onPage('projects', {projectId:project?.id,tab});
  const metrics = [
    ['请求数',num(values.count),'已进入推理的请求',values.count,prior.count], ['总 Token',num(values.tokens),'输入 + 输出',values.tokens,prior.tokens],
    ['订阅额度消耗',num(values.plan),'订阅实例抵扣',values.plan,prior.plan], ['按量费用',money(values.payg),'按量实例按成功调用计费',values.payg,prior.payg],
    ['成功率',values.count ? pct(values.success / values.count) : '—','策略拒绝 0 次',values.count ? values.success / values.count : 0,prior.count ? prior.success / prior.count : 0],
  ];
  const compare = canFilterUsers && groupCalls(scoped.filter(row => row.date >= recentDays(period)[0]), row => row.user).sort((a,b) => b.tokens - a.tokens);
  const configs = [
    ['项目预算', money(summary(records).cost) + ' / ' + money(project?.budget?.amount ?? project?.budget ?? 5000), () => openProject('budget')],
    ['资源权限与限流', projectModels.join(' · ') || '—', () => openProject('models')],
    ['业务密钥', `生效中 ${keys.filter(key => key.status === '生效中').length} 个 / 共 ${keys.length} 个`, () => onPage('api-keys')],
    ['调用日志', project?.logCapture ? '采集输入输出正文' : '仅采集调用元数据', () => openProject('logs')],
    ['调用路由', '直连所选模型', canManageProject && (() => onPage('smart-route'))],
  ];

  return <div className="role-demo-overview">
    <div className="role-demo-overview-title">
      <h1>{english ? 'Hello, welcome to the' : '您好，欢迎使用'} <span className="role-demo-workbench">{english ? 'Workbench' : '工作台'}</span></h1>
      {personal ? <span className="role-demo-balance">{english ? 'Account Balance' : '账户余额'} <strong>{money(workspace.balance ?? 238.7)}</strong></span>
        : <div className="role-demo-overview-filters">
          <span className="sr-only" id={uid(filterId,'projects')}>统计项目</span>
          <Select aria-labelledby={uid(filterId,'projects')} multiple maxTagCount={1} value={selectedProjects}
            onChange={ids => { if (!ids.length) return; setSelection(ids); if (!ids.includes(project?.id)) onProjectChange?.(ids[0]); }}
            optionList={projects.map(row => ({label:row.name,value:row.id}))} />
          <span className="role-demo-scope">{selectedProjects.length} {english ? 'projects combined' : '个项目合计'}</span>
          {canFilterUsers && <>
            <span className="sr-only" id={uid(filterId,'users')}>调用用户</span>
            <Select aria-labelledby={uid(filterId,'users')} multiple maxTagCount={1} placeholder="全部用户" value={scopedUsers}
              onChange={setUsers} optionList={userOptions} />
          </>}
        </div>}
    </div>
    <div className="role-demo-trends">
      <OverviewTrend title={english ? 'Current Month Expenses' : '本月费用'} caption={() => english ? `Estimated cost (Month ${Number(today.slice(5,7))})` : `${Number(today.slice(5,7))}月预计费用`} total={monthly.cost} totalFormatter={money}
        trend="费用趋势" records={scoped} measure={row => row.cost} units="元" color="#654cf0" />
      <OverviewTrend title={english ? 'Pay-as-you-go Usage' : '按量计费用量'} caption={days => `文本模型近 ${days} 天 Token 消耗量`} totalFormatter={compact}
        trend="用量趋势" records={scoped.filter(row => !subscription(row))} measure={row => row.tokens} units="Token" color="#1a6aff"
        onDetails={() => onPage('usage-statistics')} english={english} />
    </div>
    <DemoPlans plans={plans} project={project} personal={personal} models={projectModels} english={english}
      onOrder={() => onPage('model-order')} onResources={() => openProject('models')} />
    {personal ? <Panel title="热门模型" actions={<Button theme="borderless" onClick={() => onPage('model-market')}>查看全部</Button>}>
      <div className="role-demo-popular-models">{popularModels.map(model => <article key={model.name}>
        <h3>{model.name}</h3><p>{model.description}</p><p className="role-demo-muted">{model.note}</p>
      </article>)}</div>
    </Panel> : <>
      <Panel title="指标总览" actions={<div className="role-demo-trend-controls"><span className="role-demo-muted">对比前 {period} 天 · 北京时间</span>
        <Period value={period} onChange={setPeriod} label="指标统计周期" /></div>}>
        <dl className="role-demo-metrics">{metrics.map(([label,value,help,current,previous]) => <div key={label}><dt>{label}</dt><dd>{value}</dd>
          <p className="role-demo-muted">环比 {previous ? pct((current - previous) / previous) : '无可比数据'}</p>
          <p className="role-demo-muted">{help}</p></div>)}</dl>
      </Panel>
      {compare && <Panel title="成员用量对比" actions={<span className="role-demo-muted">按 Token 排序 · 当前统计周期</span>}>
        <DataTable label="成员用量对比" headings={['成员','请求数','Token','费用']} rows={compare.map(row => ({id:row.name,cells:[row.name,num(row.count),num(row.tokens),money(row.cost)]}))} />
      </Panel>}
      <p className="role-demo-billing-note">订阅套餐额度仅抵扣订阅实例。额度用尽后，订阅实例停止调用，不会自动切换为按量计费。</p>
      <div className="role-demo-trends"><Rankings records={scoped} keys={allKeys} /><Rankings records={scoped} keys={allKeys} fees /></div>
      <RecentCalls records={scoped} onPage={onPage} />
      <Panel title="项目配置摘要"><dl className="role-demo-project-summary">{configs.map(([label,value,action]) => <div key={label}>
        <dt>{label}</dt><dd>{value}</dd>{action && <Button theme="borderless" size="small" onClick={action} aria-label={'查看' + label}>查看</Button>}
      </div>)}</dl></Panel>
    </>}
  </div>;
}

const projectTabs = [['general','基本信息'],['models','资源权限'],['members','成员与权限'],['budget','预算'],['logs','日志设置']];
const departmentRoles = ['项目管理员','普通成员'];
const roleNotes = {
  租户管理员:'管理租户下的全部项目空间。',
  项目管理员:'管理本项目的普通成员、模型与 API 密钥。',
  普通成员:'查看本项目配置、本人用量与调用元数据，维护自己的密钥。',
};
const roleFor = (workspace, project) => workspace.canManageTenant ? '租户管理员' : project.role || (workspace.canManageProject ? '项目管理员' : '普通成员');
const modelName = model => typeof model === 'string' ? model : model.name;

function ProjectResources({ detail, settings, canManage, update }) {
  const models = (detail.project?.models || [...new Set(detail.records.map(row => row.model))]).map(modelName);
  const [query, setQuery] = useState('');
  const [tab, setTab] = useState('models');
  return <Tabs activeKey={tab} onChange={setTab}>
    <Tabs.TabPane itemKey="models" tab="模型">
      <div className="role-demo-trend-controls"><p className="role-demo-muted">已分配的模型可在本项目启用或停用。</p>
        <Input value={query} onChange={setQuery} placeholder="搜索规格名称或供应商" aria-label="搜索项目模型" /></div>
      <DataTable label="项目模型" headings={['规格名称','供应商','模型类别','启用']} rows={models.map(name => {
        const supplier = name.startsWith('GLM') ? '智谱 AI' : 'DeepSeek';
        return {id:name,name,supplier};
      }).filter(row => `${row.name} ${row.supplier}`.toLowerCase().includes(query.trim().toLowerCase())).map(row => ({id:row.id,cells:[
        row.name,row.supplier,'文本生成',<Switch checked={settings.models?.[row.name] ?? true} disabled={!canManage} aria-label={'启用 ' + row.name}
          onChange={value => update({models:{...settings.models,[row.name]:value}})} />,
      ]}))} />
    </Tabs.TabPane>
    <Tabs.TabPane itemKey="plans" tab="Token Plan">
      <DataTable label="项目 Token Plan" headings={['套餐名称','剩余额度','到期时间','启用']} rows={detail.plans.map(row => ({id:row.id,cells:[row.name,
        num(Math.max(0,row.total-row.used)) + ' Token',row.expiresAt || '—',<Switch checked={settings.plans?.[row.id] ?? true} disabled={!canManage}
          aria-label={'启用 ' + row.name} onChange={value => update({plans:{...settings.plans,[row.id]:value}})} />,
      ]}))} />
    </Tabs.TabPane>
  </Tabs>;
}

function ProjectBudget({ project, used, settings, canManage, update }) {
  const configured = settings.budget || (typeof project.budget === 'object' ? project.budget : {enabled:true,amount:project.budget ?? 5000,stop:false,threshold:80});
  const [draft, setDraft] = useState(configured);
  const [saved, setSaved] = useState(false);
  const set = change => { setSaved(false); setDraft(next => ({...next,...change})); };
  const valid = !draft.enabled || (String(draft.amount ?? '').trim() !== '' && Number(draft.amount) >= 0 && Number.isFinite(Number(draft.amount)) && /^\d+(?:\.\d{1,6})?$/.test(String(draft.amount)) &&
    (!draft.stop || Number.isInteger(Number(draft.threshold)) && Number(draft.threshold) > 0 && Number(draft.threshold) <= 100));
  return <>
    <h3>项目预算</h3><p className="role-demo-muted">北京时间自然月</p>
    <dl className="role-demo-metrics"><div><dt>本月已消耗</dt><dd>{money(used)}</dd></div>
      <div><dt>月预算</dt><dd>{configured.enabled ? money(configured.amount) : '不限额'}</dd></div>
      <div><dt>当前状态</dt><dd>{configured.enabled && used > Number(configured.amount) ? '已超出' : '正常'}</dd></div></dl>
    {canManage ? <form className="role-demo-project-form" onSubmit={event => {
      event.preventDefault(); if (valid) { update({budget:draft}); setSaved(true); }
    }}>
      <h3>预算设置</h3>
      <label className="role-demo-switch-row">月预算<Switch aria-label="月预算" checked={draft.enabled} onChange={enabled => set({enabled})} /></label>
      {draft.enabled && <><label>月预算（元）<Input aria-label="月预算（元）" value={String(draft.amount ?? '')} inputMode="decimal" onChange={amount => set({amount})} /></label>
        <label className="role-demo-switch-row">超限停服<Switch aria-label="超限停服" checked={draft.stop} onChange={stop => set({stop})} /></label>
        {draft.stop && <label>超限阈值（%）<Input aria-label="超限阈值" value={String(draft.threshold ?? 80)} inputMode="numeric" onChange={threshold => set({threshold})} /></label>}</>}
      <Button htmlType="submit" theme="solid" disabled={!valid}>保存预算</Button>{saved && <span role="status">预算已保存</span>}
    </form> : <p className="role-demo-muted">预算设置仅租户管理员可修改，当前为只读视图。</p>}
  </>;
}

function ProjectLogs({ project, settings, canManage, update }) {
  const [capture, setCapture] = useState(settings.capture ?? project.logCapture ?? false);
  const [saved, setSaved] = useState(false);
  return <>
    <label className="role-demo-switch-row">调用 Prompt 等全文采集<Switch aria-label="调用 Prompt 等全文采集" checked={capture}
      disabled={!canManage} onChange={value => { setSaved(false); setCapture(value); }} /></label>
    <p className="role-demo-muted">默认仅记录元数据。开启后，新产生的请求和响应用于详情核对，全文保留 7 天。</p>
    {canManage ? <Button theme="solid" onClick={() => { update({capture}); setSaved(true); }}>保存日志设置</Button>
      : <p className="role-demo-muted">日志设置仅租户管理员可修改。</p>}
    {saved && <span role="status" className="role-demo-save-status">日志设置已保存</span>}
  </>;
}

export function RoleDemoProjects({ workspace, onPage, initialProjectId, initialTab }) {
  const [detailId, setDetailId] = useState(initialProjectId || '');
  const [tab, setTab] = useState(initialTab || 'general');
  const [query, setQuery] = useState('');
  const [custom, setCustom] = useState([]);
  const [overrides, setOverrides] = useState({});
  const [removed, setRemoved] = useState([]);
  const [edit, setEdit] = useState(null);
  const [confirm, setConfirm] = useState(null);
  const [memberEdit, setMemberEdit] = useState(null);
  const updateFor = (id, change) => setOverrides(current => ({...current,[id]:{...current[id],...change}}));
  const { actorId, role, canManageTenant } = workspace;
  const projects = [...workspace.projects,...custom].filter(row => !removed.includes(row.id)).map(row => ({...row,...overrides[row.id]?.info}));
  const project = projects.find(row => row.id === detailId);
  const detail = project && (workspace.projects.some(row => row.id === detailId) ? roleDemoWorkspace(actorId || role, detailId)
    : {project,people:[],records:[],plans:[],canManageProject:true});
  const canManage = canManageTenant || detail?.canManageProject;
  const canBudget = canManageTenant || (workspace.canConfigureBudget ?? workspace.canConfigureProject);
  const canLogs = canManageTenant || (workspace.canConfigureLogs ?? workspace.canConfigureProject);
  const settings = overrides[detailId] || {};
  const joined = settings.people || detail?.people || [];
  const currentRole = project ? roleFor(detail,project) : '';
  const search = query.trim().toLowerCase();
  const open = (id, nextTab = 'general') => { setDetailId(id); setTab(nextTab); };
  const startEdit = row => setEdit(row ? {id:row.id,name:row.name,description:row.description} : {name:'',description:''});
  const createOrSave = () => {
    const name = edit.name.trim();
    if (!name || projects.some(row => row.id !== edit.id && row.name === name)) return;
    const info = { name, description:edit.description.trim() };
    if (edit.id) updateFor(edit.id,{info});
    else setCustom(rows => [...rows,{id:'demo-'+crypto.randomUUID(),...info,owner:workspace.people.find(row => row.id === (actorId || role))?.name || '租户管理员',
      role:'租户管理员',memberCount:0,createdAt:new Date().toISOString()}]);
    setEdit(null);
  };
  const saveMember = () => {
    const name = memberEdit.name.trim();
    if (!name || joined.some(row => row.id !== memberEdit.id && row.name === name)) return;
    const people = memberEdit.id ? joined.map(row => row.id === memberEdit.id ? {...row,role:memberEdit.role} : row)
      : [...joined,{id:'demo-'+crypto.randomUUID(), name, role:memberEdit.role}];
    updateFor(detailId,{people});
    setMemberEdit(null);
  };
  const canDelete = row => canManageTenant && row.id !== 'company-default' && !row.isDefault;
  return <div className="role-demo-overview role-demo-projects">
    <div className="role-demo-overview-title">
      <h1>{project ? <>项目管理 <span className="role-demo-muted">/</span> {project.name}</> : '项目管理'}</h1>
      <div className="role-demo-overview-actions">
        {project ? <><Button onClick={() => workspace.canManageProject ? setDetailId('') : onPage?.('home')}>返回列表</Button>{canManage && workspace.projects.some(row => row.id === project.id) &&
          <Button theme="solid" onClick={() => onPage?.('home',{projectId:project.id})}>进入项目</Button>}</>
          : canManageTenant && <Button theme="solid" onClick={() => startEdit(null)}>新建项目</Button>}
      </div>
    </div>
    {!project ? <Card className="role-demo-card" bordered={false}>
      <Input className="role-demo-project-search" aria-label="搜索项目" placeholder="搜索项目空间名称" value={query} onChange={setQuery} />
      <DataTable label="项目管理" headings={['项目空间名称','负责人','当前角色','成员数','创建时间',...(canManageTenant ? ['操作'] : [])]}
        rows={projects.filter(row => !search || `${row.name} ${row.owner}`.toLowerCase().includes(search)).map(row => ({id:row.id,cells:[
          <div className="role-demo-project-name"><Button className="role-demo-text-button" size="small" theme="borderless" onClick={() => open(row.id)}>{row.name}</Button>
            {(row.id === 'company-default' || row.isDefault) && <Tag size="small" color="grey">默认</Tag>}</div>,
          row.owner || '—',<Tag size="small" color="blue">{roleFor(workspace,row)}</Tag>,num(overrides[row.id]?.people?.length ?? row.memberCount),
          row.createdAt ? callTime(row) : '—',
          ...(canManageTenant ? [<div className="role-demo-table-actions">
            <Button size="small" theme="borderless" onClick={() => open(row.id,'models')}>资源分配</Button>
            {canDelete(row) && <Button type="danger" size="small" theme="borderless" onClick={() => setConfirm({project:row})}>删除项目</Button>}
          </div>] : []),
        ]}))} />
    </Card> : <Card className="role-demo-card" bordered={false}>
      <Tabs key={project.id} activeKey={tab} onChange={setTab}>
        {projectTabs.map(([id,label]) => <Tabs.TabPane key={id} itemKey={id} tab={label} />)}
      </Tabs>
      <div className="role-demo-project-detail">
        {tab === 'general' && <>
          <div className="role-demo-card-heading"><h2>项目信息</h2>{canManage && <Button onClick={() => startEdit(project)}>编辑项目</Button>}</div>
          <dl className="role-demo-project-fields">{Object.entries({'项目名称':project.name,'项目 ID':project.id,'项目描述':project.description || '—',
            '项目负责人':project.owner || '—','当前角色':currentRole}).map(([label,value]) => <div key={label}><dt>{label}</dt><dd>{value}</dd></div>)}</dl>
          {canDelete(project) && <Button type="danger" onClick={() => setConfirm({project})}>删除项目</Button>}
        </>}
        {tab === 'models' && <ProjectResources detail={detail} settings={settings} canManage={canManage} update={change => updateFor(detailId,change)} />}
        {tab === 'members' && <>
          <div className="role-demo-card-heading"><h2>项目成员</h2>{canManage && <Button onClick={() => setMemberEdit({name:'',role:'普通成员'})}>添加成员</Button>}</div>
          <DataTable label="项目成员" headings={['成员','角色','权限',...(canManage ? ['操作'] : [])]} rows={joined.map(row => ({id:row.id,cells:[row.name,
            <Tag size="small" color="blue">{row.role}</Tag>,roleNotes[row.role] || '—',...(canManage ? [row.name !== project.owner && (canManageTenant || row.role === '普通成员')
              ? <div className="role-demo-table-actions">{canManageTenant && <Button theme="borderless" size="small" onClick={() => setMemberEdit(row)}>调整角色</Button>}
                <Button theme="borderless" type="danger" size="small" onClick={() => setConfirm({member:row})}>移除</Button></div> : '—'] : []),
          ]}))} />
        </>}
        {tab === 'budget' && <ProjectBudget key={detailId} project={project} used={summary(detail.records).cost} settings={settings}
          canManage={canBudget} update={change => updateFor(detailId,change)} />}
        {tab === 'logs' && <ProjectLogs key={detailId} project={project} settings={settings} canManage={canLogs} update={change => updateFor(detailId,change)} />}
      </div>
    </Card>}
    {edit && <Modal visible title={edit.id ? '编辑项目' : '新建项目'} onCancel={() => setEdit(null)} onOk={createOrSave}
      okButtonProps={{disabled:!edit.name.trim() || projects.some(row => row.id !== edit.id && row.name === edit.name.trim())}}>
      <div className="role-demo-project-form"><label>项目名称<Input value={edit.name} aria-label="项目名称" onChange={name => setEdit({...edit,name})} /></label>
        <label>项目描述<TextArea value={edit.description} aria-label="项目描述" onChange={description => setEdit({...edit,description})} /></label></div>
    </Modal>}
    {memberEdit && <Modal visible title={memberEdit.id ? '调整角色' : '添加成员'} onCancel={() => setMemberEdit(null)} onOk={saveMember}
      okButtonProps={{disabled:!memberEdit.name.trim() || joined.some(row => row.id !== memberEdit.id && row.name === memberEdit.name.trim())}}>
      <div className="role-demo-project-form"><label>成员名称<Input aria-label="成员名称" value={memberEdit.name} disabled={Boolean(memberEdit.id)}
        onChange={name => setMemberEdit({...memberEdit,name})} /></label>
        <RadioGroup aria-label="项目角色" options={(canManageTenant ? departmentRoles : ['普通成员']).map(value => ({value,label:value}))}
          value={memberEdit.role} onChange={event => setMemberEdit({...memberEdit,role:event.target.value})} /></div>
    </Modal>}
    {confirm && <Modal visible title={confirm.project ? '删除项目' : '移除成员'} okType="danger" onCancel={() => setConfirm(null)} onOk={() => {
      if (confirm.project) { setRemoved(current => [...current,confirm.project.id]); if (detailId === confirm.project.id) setDetailId(''); }
      else updateFor(detailId,{people:joined.filter(row => row.id !== confirm.member.id)});
      setConfirm(null);
    }}><p>确认{confirm.project ? '删除项目' : '移除成员'}「{(confirm.project || confirm.member).name}」？</p></Modal>}
  </div>;
}
