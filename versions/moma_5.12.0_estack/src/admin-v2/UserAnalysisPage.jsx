import AdminPageHeading from './AdminPageHeading';
import {userBusinessData} from '../business-facts.mjs';
import { Card, Space, Toast, Typography } from '@douyinfe/semi-ui';
import AnalysisMetric from './AnalysisMetric';
import { useMemo, useState } from 'react';
import { DateRange } from './AnalyticsFilters';
import { formatUsageNumber, usagePreset, usagePresets, operationsPeriod, operationsPeriodFromQuery } from './usage-analysis';
import { filterAnalytics } from './analytics';
import { userMetrics } from './user-analysis';
import UserCallDetails from './UserCallDetails';
import SavedFilterViews from '../components/SavedFilterViews';
import { FilterPresets, FilterReset, FilterToolbar } from '../components/FilterControls';

const presets = usagePresets;
const cards = [
  ['registered', '注册用户数', '截至所选区间结束时，已注册的去重用户 ID 总数。'],
  ['added', '新增注册', '所选区间内完成注册的去重用户 ID 数。'],
  ['login', '登录用户数', '所选区间内成功登录的去重用户 ID 数；按北京时间统计。'],
  ['active', '活跃用户数', '所选区间内发生 API 密钥调用的去重用户 ID 数。'],
  ['dau', 'DAU', '所选区间结束时，北京时间当日成功登录的去重用户数。'],
  ['mau', 'MAU', '所选区间结束时，北京时间自然月内成功登录的去重用户数；不累加 DAU。'],
];
const comparisonLabel = { today: '昨日同时段', yesterday: '前日', '7d': '前 7 天', '30d': '前 30 天', custom: '上个等长周期' };

function change(current, previous) {
  const diff = current - previous;
  return { amount: `${diff >= 0 ? '+' : '-'}${formatUsageNumber(Math.abs(diff))}`, rate: previous ? `${diff >= 0 ? '+' : ''}${(diff / previous * 100).toFixed(2)}%` : '—' };
}

export default function UserAnalysisPage({ state }) {
  const [clock, setClock] = useState(() => Date.now());
  const [initialPeriod] = useState(() => operationsPeriodFromQuery(new URLSearchParams(location.hash.split('?')[1] || '')));
  const [period, setPeriod] = useState(initialPeriod.period);
  const [range, setRange] = useState(initialPeriod.range);
  const [detailDraft, setDetailDraft] = useState({model:'',customer:''}), [detailFilter, setDetailFilter] = useState({model:'',customer:''});
  const data = useMemo(() => userBusinessData(state), [state,clock]);
  const metrics = useMemo(() => userMetrics(data, range, clock), [data, range, clock]);
  const rows = useMemo(() => filterAnalytics(state, { start: range.start, end: range.end }), [state, range]);
  const selectPeriod = value => { const current = Date.now(); setClock(current); setPeriod(value); setRange(usagePreset(value, current)); };
  const timeGroup = { label:'时间', text:`${presets.find(([id]) => id === period)?.[1] || '自定义'}（${range.start} — ${range.end}）`, scope:'全页' };
  const detailGroups = [{label:'模型',text:detailFilter.model || '全部模型',scope:'仅调用明细'}, {label:'客户',text:state.tenants.find(item => item.id === detailFilter.customer)?.name || detailFilter.customer || '全部客户',scope:'仅调用明细'}];
  const applyView = view => {
    if (!view) return;
    const current = Date.now();
    const restored = operationsPeriod(view.period, view.range, current);
    const detail = view.detailFilter || { model: '', customer: '' };
    setClock(current);
    setPeriod(restored.period);
    setRange(restored.range);
    setDetailFilter(detail);
    setDetailDraft(detail);
  };
  return <div className="admin-page-stack">
    <AdminPageHeading title="用户数据"/>
    <Card>
      <FilterToolbar>
        <FilterPresets label="时间筛选" value={period} onChange={selectPeriod} items={presets}/>
        <DateRange presets={presets} start={range.start} end={range.end} allowLongRange rangeHint="单日按小时，其余按日，最多 365 天"
          onChange={value => {
            const current = Date.now(), selected = operationsPeriod('custom', value, current);
            setClock(current);
            setRange(selected.range);
            setPeriod(selected.period);
          }}/>
        <FilterReset onClick={() => selectPeriod('yesterday')}/>
      </FilterToolbar>
      <div className="admin-analysis-view-row">
        <SavedFilterViews notify={Toast} scope="admin-user-analysis" value={{ period, range, detailFilter }} onApply={applyView}
          groups={[timeGroup, ...detailGroups]} currentGroups={[timeGroup]}
          saveDescription="保存全页时间和调用明细的模型、客户条件。模型／客户仅影响调用明细，不影响上方用户指标。保存后可快速应用已保存的筛选条件。"/>
      </div>
    </Card>
    <div className="admin-analysis-metrics">
      {cards.map(([key, title, note]) => {
        const daily = key === 'dau' || key === 'mau';
        const value = daily ? (metrics?.[key].at(-1) ?? 0) : (metrics?.current[key] ?? 0);
        const before = daily ? (metrics?.[key === 'dau' ? 'priorDau' : 'priorMau'] ?? 0) : (metrics?.previous[key] ?? 0);
        const delta = change(value, before);
        return <AnalysisMetric key={key} title={title} value={formatUsageNumber(value)} help={note}>
          {daily && <Space wrap>
            <Typography.Text size="small">企业 {formatUsageNumber(metrics?.[`${key}ByType`].企业.at(-1) ?? 0)}</Typography.Text>
            <Typography.Text size="small">个人 {formatUsageNumber(metrics?.[`${key}ByType`].个人.at(-1) ?? 0)}</Typography.Text>
          </Space>}
          <Typography.Text type="tertiary" size="small" title={`对比${comparisonLabel[period]}`}>环比 {delta.amount}　{delta.rate}</Typography.Text>
        </AnalysisMetric>;
      })}
    </div>
    <UserCallDetails state={state} rows={rows} start={range.start} end={range.end} draft={detailDraft} onDraftChange={setDetailDraft}
      query={detailFilter} onQueryChange={setDetailFilter} conditionGroups={detailGroups}/>
  </div>;
}
