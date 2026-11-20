import { Button, Card, Typography } from '@douyinfe/semi-ui';
import { ArrowRight } from 'lucide-react';
import { TimeSeriesChart } from './AnalyticsCharts';
import { shanghaiDate } from '../call-log-data.mjs';
import { tenantUsageReport, USAGE_OVERVIEW, usageMoney } from '../tenant-usage-report.mjs';
import './console-home.css';

const DAY = 86_400_000;
const number = value => value == null ? '—' : value.toLocaleString('zh-CN');

export default function ConsoleHome({ tenant, personal, internal, models, onOpenModel, onPage }) {
  const { report } = tenant;
  const billing = !internal && tenant.canManage;
  const header = <div className="console-home-heading">
    <Typography.Title heading={3} component="h1">首页</Typography.Title>
    {personal && <Button theme="borderless" onClick={()=>onPage('project-overview')}>查看默认项目</Button>}
  </div>;

  if (!report) return <div className="console-home">
    {header}
    <Card>{tenant.error ? <p role="alert">{tenant.error} <Button onClick={tenant.reload}>重试</Button></p>
      : <p role="status">正在加载首页…</p>}</Card>
  </div>;

  const now = report.asOf;
  const end = shanghaiDate(now);
  const data = {records:report.records, models:report.models, now};
  const monthly = tenantUsageReport({...data,filters:{category:USAGE_OVERVIEW,billing:null},range:{start:end.slice(0,7)+'-01',end}});
  const weekly = tenantUsageReport({...data,filters:{category:USAGE_OVERVIEW,billing:internal ? null : '按量付费'},
    range:{start:shanghaiDate(new Date(now.getTime()-6*DAY)),end}});
  const currencyTotals = [...monthly.summary.fees.keys()].sort().map(currency=>
    usageMoney(monthly.summary,currency).toLocaleString('zh-CN',{style:'currency',currency,maximumFractionDigits:6}));
  const hot = [...models].sort((a,b)=>Number(Boolean(b.hot))-Number(Boolean(a.hot)) ||
    (monthly.rankings.modelId.get(b.serviceModelId)?.requests || 0)-(monthly.rankings.modelId.get(a.serviceModelId)?.requests || 0)).slice(0,3);
  const openUsage = () => onPage(personal ? 'usage-statistics' : 'space-overview');
  const plans = billing ? tenant.plans.filter(row=>!row.product?.name?.includes('Coding')) : [];

  return <div className="console-home">
    {header}
    <div className="console-home-summary">
      <Card className="console-home-card console-home-total" title={billing ? '本月费用' : '本月请求量'}>
        <span className="console-home-caption">{end.slice(5,7).replace(/^0/,'')} 月 · {billing || tenant.canManage ? '当前空间' : '可访问的项目'}</span>
        <strong className="console-home-value">{billing ? currencyTotals.join(' / ') || '—' : number(monthly.summary.requests)}</strong>
        <span className="console-home-caption">{billing ? currencyTotals.length ? '已记录的调用费用' : '暂无计费记录' : '次请求'}</span>
        <Button theme="borderless" icon={<ArrowRight size={14}/>} onClick={()=>billing ? onPage('billing') : openUsage()}>
          {billing ? '查看账单' : '查看用量'}
        </Button>
      </Card>
      <Card className="console-home-card" title="近 7 天用量"
        headerExtraContent={<Button size="small" onClick={openUsage}>查看详情</Button>}>
        <span className="console-home-caption">{internal ? '模型用量' : '按量计费'} · Token</span>
        <strong className="console-home-value">{number(weekly.summary.tokens)}</strong>
        {weekly.summary.tokens === null ? <p className="console-home-empty">暂无 Token 用量</p>
          : <TimeSeriesChart height={158} overview compact showData={false}
            labels={weekly.buckets.map(row=>shanghaiDate(new Date(row.time)).slice(5))}
            series={[{label:'Token 用量',color:'#315cee',values:weekly.buckets.map(row=>row.totals.tokens ?? (row.totals.requests ? null : 0)),showPoints:true}]}
            unit="Token" label="近 7 天 Token 用量" />}
      </Card>
    </div>
    {billing && <Card className="console-home-card" title="我的 Token Plan"
      headerExtraContent={<Button size="small" onClick={()=>onPage('model-order')}>查看订购</Button>}>
      {plans.length ? <ul className="console-home-plan-list">{plans.map(row=><li key={row.id}>
        <strong>{row.product?.name}</strong><span>{row.status}</span>
        <span>{row.expiresAt ? '到期 ' + shanghaiDate(new Date(row.expiresAt)) : '—'}</span>
      </li>)}</ul> : <p className="console-home-empty">暂无生效中的 Token Plan</p>}
    </Card>}
    <section aria-labelledby="console-hot-models" className="console-home-hot">
      <div className="console-home-hot-heading">
        <Typography.Title id="console-hot-models" heading={5} component="h2">热门模型</Typography.Title>
        <Button size="small" onClick={()=>onPage('model-market')}>查看全部</Button>
      </div>
      {hot.length ? <div className="console-home-models">{hot.map(model=><Card className="console-home-card" key={model.modelKey}>
        <div className="console-home-model-heading">
          {model.logo && <img src={model.logo} alt="" onError={event=>{event.currentTarget.hidden=true;}} />}
          <Button theme="borderless" onClick={()=>onOpenModel(model)}>{model.name}</Button>
        </div>
        <p>{[model.typeLabel,model.provider].filter(Boolean).join(' · ')}</p>
        {model.desc && <p>{model.desc}</p>}
      </Card>)}</div> : <Card className="console-home-card"><p className="console-home-empty">暂无可展示的模型</p></Card>}
    </section>
  </div>;
}
