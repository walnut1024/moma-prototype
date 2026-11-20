import { useState } from 'react';
import { Banner, Button, Select, Table } from '@douyinfe/semi-ui';
import { TimeSeriesChart } from './AnalyticsCharts';
import { shanghaiDate } from '../call-log-data.mjs';
import { bucketLabel } from '../usage-data.mjs';
import { tenantUsageReport, usageMoney, usageRanking, usageSuccessRate, UNASSIGNED, USAGE_OVERVIEW } from '../tenant-usage-report.mjs';
import { experienceKeyId, projectModelEnabled } from '../project-access.mjs';
import { activeProjectSpendBudget } from '../project-token-budget.mjs';
import { projectMoney, projectTime } from './ProjectConfiguration';

const DAY = 86_400_000;
const number = value => value == null ? '—' : value.toLocaleString('zh-CN');
const percent = value => value == null ? '—' : value.toFixed(1) + '%';
const feeNumber = value => value == null ? '—' : value.toLocaleString('zh-CN', { maximumFractionDigits:6 });

function change(value, previous, points = false) {
  if (value == null || previous == null || !points && previous === 0) return '较上期 —';
  const delta = points ? value - previous : (value / previous - 1) * 100;
  return `较上期 ${delta > 0 ? '+' : ''}${delta.toFixed(1)}${points ? ' 个百分点' : '%'}`;
}

export function ProjectBudgetNotice({ project, spend }) {
  const budget=activeProjectSpendBudget(project);
  if (!budget?.amountMicros || !spend) return null;
  const percentUsed=spend.spent/budget.amountMicros*100;
  if (percentUsed < budget.warnAt) return null;
  const label=percentUsed >= 100 ? budget.stop ? '项目预算已达上限，按量调用已停止' : '项目预算已达上限'
    : '项目预算已达到预警阈值';
  return <Banner className="project-budget-alert" type="warning" description={label + ' · 已用 ' + percent(percentUsed)} />;
}

export default function ProjectOverview({ tenant, project, department, openTab, onNavigate }) {
  const [days, setDays] = useState(1);
  const [metric, setMetric] = useState('fees');
  const [selectedCurrency, setCurrency] = useState('CNY');
  const source = tenant.report, amountLabel = tenant.internal ? '内部成本' : '调用费用';
  const records = source?.records || [];
  const models = source?.models || [];
  const now = source?.asOf || new Date();
  const filters = { category:USAGE_OVERVIEW, billing:null, projectId:project.id };
  const end = shanghaiDate(now);
  const start = shanghaiDate(new Date(now.getTime() - (days - 1) * DAY));
  const previousNow = new Date(now.getTime() - days * DAY);
  const current = tenantUsageReport({ records, models, filters, now, range:{ start, end } });
  const previous = tenantUsageReport({ records, models, filters, now:previousNow,
    range:{ start:shanghaiDate(new Date(previousNow.getTime() - (days - 1) * DAY)), end:shanghaiDate(previousNow) } });
  const currencies = [...new Set([...current.summary.fees.keys(), ...previous.summary.fees.keys()])];
  const currency = currencies.includes(selectedCurrency) || !currencies.length ? selectedCurrency : currencies[0];
  const money = value => value == null ? '—' : value.toLocaleString('zh-CN', { style:'currency', currency, maximumFractionDigits:6 });
  const tiles = [
    ['请求数', current.summary.requests, previous.summary.requests, number],
    ['Token', current.summary.tokens, previous.summary.tokens, number],
    [amountLabel, usageMoney(current.summary, currency), usageMoney(previous.summary, currency), money],
    ['成功率', usageSuccessRate(current.summary), usageSuccessRate(previous.summary), percent],
  ];
  const spend = tenant.projectBudgets[project.id];
  const budget = project.spendBudget?.amountMicros ? project.spendBudget : null;
  const routes = tenant.projectRouting?.routes.filter(row => row.projectId === project.id) || [];
  const keys = tenant.keys.filter(row => row.projectId === project.id);
  const experience = tenant.logKeys.find(row => row.id === experienceKeyId(project.id));
  const enabled = new Set(tenant.projectServices.filter(row => projectModelEnabled(project, row.modelKey)).map(row => row.modelKey));
  const recent = tenant.requests.filter(row => row.projectId === project.id).toSorted((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt));
  const links = [
    ['预算', project.canManage && budget ? `${projectMoney(spend?.spent / 1_000_000)} / ${projectMoney(budget.amountMicros / 1_000_000)}` : project.canManage ? '不限' : '—', () => openTab('settings')],
    ['模型权限', `${enabled.size} 个可用模型`, () => openTab('models')],
    ['项目分流', `${routes.length} 条`, () => onNavigate('route')],
    ['API Key', `${keys.length} 个可见 Key${experience ? ' · 在线体验已托管' : ''}`, () => openTab('keys')],
  ];
  const trends = [
    ['调用量趋势', '次', '#207453', current.buckets.map(row => row.totals.requests)],
    [amountLabel + '趋势', currency, '#376ac0', current.buckets.map(row => usageMoney(row.totals, currency))],
  ];
  const labels = current.buckets.map(row => days === 1 ? bucketLabel(row.time) : bucketLabel(row.time).slice(0, 5));
  const ranked = [['模型', 'modelId', models], ['API Key', 'keyId', source?.keys || []]];
  const recentColumns = [
    { title:'时间',dataIndex:'createdAt',render:projectTime },
    { title:'请求 ID',render:(_,row) => <Button theme="borderless"
      onClick={() => onNavigate('logs',{requestId:row.requestId || row.id})}>{row.requestId || row.id}</Button> },
    { title:'模型',render:(_,row) => row.publicModelId || row.modelId || '—' },
    { title:'调用来源',render:(_,row) => row.keyId === experienceKeyId(project.id) ? '在线体验' : row.source || '—' },
    { title:'状态码',render:(_,row) => row.httpStatus ?? '—' },
  ];
  return <>
<ProjectBudgetNotice project={project} spend={spend} />
    <div className="project-controls project-overview-toolbar">
      <label>统计时间 <Select aria-label="统计时间" value={days} onChange={setDays}
        optionList={[{value:1,label:'今日'},{value:7,label:'近 7 天'},{value:30,label:'近 30 天'}]} /></label>
      {currencies.length > 1 && <label>币种 <Select aria-label="币种" value={currency} onChange={setCurrency} optionList={currencies.map(value => ({ value,label:value }))} /></label>}
      <Button theme="borderless" onClick={() => onNavigate('usage', { days })}>查看用量统计</Button>
    </div>
    <div className="project-metrics">
      {tiles.map(([label, value, prior, format]) => <div key={label} className="project-panel">
        <span>{label}</span><strong>{format(value)}</strong><small>{change(value, prior, label === '成功率')}</small>
      </div>)}
    </div>
    <div className="project-overview-grid">
      {trends.map(([title, unit, color, values]) => <section key={title} className="project-panel" aria-label={title}>
        <h2>{title}</h2>
        {current.summary.requests > 0 && values.some(value => value !== null)
          ? <TimeSeriesChart height={205} compact overview={days > 1} labels={labels}
            series={[{ label:title, color, values, showPoints:unit === currency }]} valueFormatter={unit === currency ? feeNumber : undefined} unit={unit} label={title} />
          : <p className="project-empty">当前范围暂无数据</p>}
      </section>)}
    </div>
    <div className="project-controls">
      <label>排行指标 <Select aria-label="排行指标" value={metric} onChange={setMetric}
        optionList={[{value:'fees',label:amountLabel},{value:'requests',label:'请求数'}]} /></label>
    </div>
    <div className="project-overview-grid">
      {ranked.map(([title, dimension, names]) => {
        const rows = usageRanking(current, dimension, metric, currency).slice(0, 5);
        return <section key={dimension} className="project-panel" aria-label={title + '排行'}>
          <h2>{title} Top 5</h2>
          {rows.length ? <ol className="project-ranking">{rows.map(({ id, amount }) => {
            const label = names.find(row => row.id === id)?.name || (id === UNASSIGNED ? '未归属' : id);
            return <li key={id}>
              <Button theme="borderless" onClick={() => onNavigate('usage', { [dimension]:id, days })}>{label}</Button>
              <strong>{metric === 'fees' ? money(amount) : number(amount)}</strong>
            </li>;
          })}</ol> : <p className="project-empty">当前范围暂无排行</p>}
        </section>;
      })}
    </div>
    <section className="project-panel" aria-label="项目配置">
      <h2>配置摘要</h2>
      <dl className="project-facts">{links.map(([label, value, open]) => <div key={label}><dt>{label}</dt>
        <dd><Button theme="borderless" onClick={open}>{value}</Button></dd></div>)}</dl>
      {spend?.unpriced > 0 && <p className="project-muted">{spend.unpriced} 次成功调用暂未计入人民币预算</p>}
    </section>
    <section className="project-panel" aria-label="项目信息">
      <dl className="project-facts">
        <div><dt>项目 ID</dt><dd>{project.id}</dd></div><div><dt>状态</dt><dd>{project.status}</dd></div>
        {department && <div><dt>主责部门</dt><dd>{department}</dd></div>}
        <div><dt>创建时间</dt><dd>{projectTime(project.createdAt)}</dd></div>
        <div><dt>当前角色</dt><dd>{project.role}</dd></div>
      </dl>
    </section>
    <section className="project-panel" aria-label="最近调用">
      <div className="project-panel-heading"><h2>最近调用</h2><Button theme="borderless" onClick={() => onNavigate('logs')}>查看项目日志</Button></div>
      <Table columns={recentColumns} dataSource={recent.slice(0,8)} rowKey={row => row.requestId || row.id}
        size="small" pagination={false} scroll={{x:580}} empty="暂无调用记录" />
    </section>
  </>;
}
