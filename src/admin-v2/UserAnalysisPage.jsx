import { useMemo, useState } from 'react';
import { Info } from 'lucide-react';
import { Button } from '../components/ui/button';
import { Card, CardContent } from '../components/ui/card';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '../components/ui/tooltip';
import { DateRange } from './AnalyticsFilters';
import { formatUsageNumber, usagePreset } from './usage-analysis';
import { filterAnalytics } from './analytics';
import { userDemo, userMetrics } from './user-analysis';
import UserCallDetails from './UserCallDetails';
import './usage-analysis.css';
import './user-analysis.css';

const presets = [['today', '今日'], ['yesterday', '昨日'], ['7d', '近 7 天'], ['30d', '近 30 天']];
const cards = [
  ['registered', '注册用户数', '截至所选区间结束时，已注册的去重用户 ID 总数。'],
  ['added', '新增注册', '所选区间内完成注册的去重用户 ID 数。'],
  ['login', '登录用户数', '所选区间内成功登录的去重用户 ID 数；按北京时间统计。'],
  ['active', '活跃用户数', '所选区间内发生 API Key 调用的去重用户 ID 数。'],
  ['dau', 'DAU', '所选区间结束时，北京时间当日成功登录的去重用户数。'],
  ['mau', 'MAU', '所选区间结束时，北京时间自然月内成功登录的去重用户数；不累加 DAU。'],
  ['keys', 'API Key 数量', '截至所选区间结束时，已创建的 API Key 数量；按归属用户筛选。'],
];
const comparisonLabel = { today: '昨日同期', yesterday: '前日', '7d': '前 7 天', '30d': '前 30 天', custom: '上个等长周期' };

function Help({ label, children }) {
  return <Tooltip><TooltipTrigger asChild><button className="ua-help" type="button" aria-label={`${label}说明`}><Info size={13}/></button></TooltipTrigger><TooltipContent>{children}</TooltipContent></Tooltip>;
}

function change(current, previous) {
  const diff = current - previous;
  return { amount: `${diff >= 0 ? '+' : '-'}${formatUsageNumber(Math.abs(diff))}`, rate: previous ? `${diff >= 0 ? '+' : ''}${(diff / previous * 100).toFixed(2)}%` : '—' };
}

export default function UserAnalysisPage({ state }) {
  const [clock] = useState(() => Date.now());
  const [period, setPeriod] = useState('today');
  const [range, setRange] = useState(() => usagePreset('today'));
  const data = useMemo(() => userDemo(clock), [clock]);
  const metrics = useMemo(() => userMetrics(data, range, clock), [data, range, clock]);
  const rows = useMemo(() => filterAnalytics(state, { start: range.start, end: range.end }), [state, range]);
  const selectPeriod = value => { setPeriod(value); setRange(usagePreset(value, clock)); };
  return <TooltipProvider><div className="ua-page us-page">
    <Card className="ua-filters"><CardContent><div className="ua-filter-scroll"><div className="ua-filter-controls">
      <div className="ua-segments" role="group" aria-label="时间筛选">{presets.map(([id, label]) => <Button key={id} variant={period === id ? 'default' : 'outline'} onClick={() => selectPeriod(id)}>{label}</Button>)}</div>
      <DateRange label="自定义" start={range.start} end={range.end} allowLongRange rangeHint="单日按小时，其余按日，最多 365 天" onChange={value => { setRange(value); setPeriod('custom'); }}/>
      <Button className="ua-reset" variant="ghost" size="sm" onClick={() => selectPeriod('today')}>重置筛选</Button>
    </div></div></CardContent></Card>
    <Card className="ua-kpis"><CardContent><div className="ua-kpi-grid us-kpi-grid">{cards.map(([key, title, note]) => {
      const daily = key === 'dau' || key === 'mau';
      const value = daily ? (metrics?.[key].at(-1) ?? 0) : (metrics?.current[key] ?? 0);
      const before = daily ? (metrics?.[key === 'dau' ? 'priorDau' : 'priorMau'] ?? 0) : (metrics?.previous[key] ?? 0);
      const delta = change(value, before);
      return <div className="ua-kpi" key={key}><div className="ua-kpi-label">{title}<Help label={title}>{note}</Help></div><strong>{formatUsageNumber(value)}</strong>{daily && <small>企业 {formatUsageNumber(metrics?.[`${key}ByType`].企业.at(-1) ?? 0)}　个人 {formatUsageNumber(metrics?.[`${key}ByType`].个人.at(-1) ?? 0)}</small>}<small title={`对比${comparisonLabel[period]}`}>环比 {delta.amount}　{delta.rate}</small></div>;
    })}</div></CardContent></Card>
    <UserCallDetails state={state} rows={rows} start={range.start} end={range.end}/>
  </div></TooltipProvider>;
}
