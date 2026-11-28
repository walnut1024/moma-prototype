import { useEffect, useId, useMemo, useState } from 'react';
import { CalendarDays, LogIn, UserPlus, UserRound, UsersRound } from 'lucide-react';
import { userBusinessData } from '../user-business-data.mjs';
import SavedFilterViews from '../components/SavedFilterViews';
import TableFieldHelp from '../components/TableFieldHelp';
import { useChannelText } from './channel-language';
import { Button, Card, Input, Space, Toast, Typography } from './xa24/HaloUI.jsx';
import Table from './AdminTable';
import AnalysisMetric from './AnalysisMetric';
import { SemiDateRange as DateRange } from './SemiAnalyticsFilters';
import { formatUsageNumber, operationsPeriod, operationsPeriodFromQuery, usagePresets } from './usage-analysis';
import { filterAnalytics } from './analytics';
import { userCallRows, userMetrics } from './user-analysis';
import UserCallDetails from './UserCallDetails';
import './user-analysis.css';

const userPath = '#/admin-2/user-analysis';
const heroArt = import.meta.env.BASE_URL + 'assets/xa-user-analysis.png';
const emptyDetailFilter = { model: '', customer: '' };
const overviewCards = [
  ['registered', '注册用户数', UserRound, '截至所选区间结束时，已注册的去重用户 ID 总数。'],
  ['added', '新增注册', UserPlus, '所选区间内完成注册的去重用户 ID 数。'],
  ['login', '登录用户数', LogIn, '所选区间内成功登录的去重用户 ID 数。'],
  ['active', '活跃用户数', UsersRound, '所选区间内有 API 请求记录的去重用户 ID 数。'],
];
const activeCards = [
  ['dau', 'DAU', '所选区间结束时，北京时间当日成功登录的去重用户数。'],
  ['mau', 'MAU', '所选区间结束时，北京时间自然月内成功登录的去重用户数。'],
];
const comparisonLabel = { today: '昨日同时段', yesterday: '前日', '7d': '前 7 天', '30d': '前 30 天', custom: '上个等长周期' };
const formatNumber = value => value == null ? '—' : String(value);
const readQuery = now => ({ ...operationsPeriodFromQuery(new URLSearchParams(location.hash.split('?')[1] || ''), now), keyword: '' });

function comparison(current, previous, period) {
  if (current == null || previous == null) return '—';
  const diff = current - previous, prefix = diff >= 0 ? '+' : '';
  const rate = previous ? prefix + (diff / previous * 100).toFixed(2) + '%' : '—';
  return `较${comparisonLabel[period]} ${prefix}${formatUsageNumber(diff)}（${rate}）`;
}

export default function UserAnalysisPage({ state }) {
  const t = useChannelText();
  const nameId = useId();
  const detailsId = useId();
  const [clock, setClock] = useState(() => Date.now());
  const [query, setQuery] = useState(() => readQuery(clock));
  const [draft, setDraft] = useState(query);
  const [detailsOpen, setDetailsOpen] = useState(false);
  const [detailDraft, setDetailDraft] = useState(emptyDetailFilter);
  const [detailFilter, setDetailFilter] = useState(emptyDetailFilter);
  const { range, period, keyword } = query;
  useEffect(() => {
    const restore = () => {
      if (location.hash.split('?')[0] !== userPath) return;
      const now = Date.now(), next = readQuery(now);
      setClock(now);
      setQuery(next);
      setDraft(next);
    };
    addEventListener('hashchange', restore);
    return () => removeEventListener('hashchange', restore);
  }, []);
  const data = useMemo(() => userBusinessData(state, state.requests), [state]);
  const metrics = useMemo(() => userMetrics(data, range, clock), [data, range, clock]);
  const userRows = useMemo(() => userCallRows(state, data, range, clock)
    .sort((a, b) => (b.total ?? -1) - (a.total ?? -1) || a.name.localeCompare(b.name, 'zh-CN') || a.id.localeCompare(b.id)),
  [state, data, range, clock]);
  const displayedUsers = useMemo(() => userRows.filter(row => row.name.toLocaleLowerCase().includes(keyword.toLocaleLowerCase())),
    [userRows, keyword]);
  const detailRows = useMemo(() => detailsOpen
    ? filterAnalytics(state, range).filter(row => Date.parse(row.createdAt) < clock) : [], [detailsOpen, state, range, clock]);

  const applyQuery = next => {
    const now = Date.now();
    const applied = { ...operationsPeriod(next.period, next.range, now), keyword: next.keyword.trim() };
    setClock(now);
    setQuery(applied);
    setDraft(applied);
    const params = new URLSearchParams(location.hash.split('?')[1] || '');
    params.set('period', applied.period);
    params.set('start', applied.range.start);
    params.set('end', applied.range.end);
    history.replaceState(history.state, '', userPath + '?' + params);
  };
  const applyView = view => {
    if (!view) return;
    applyQuery({ ...view, keyword: typeof view.keyword === 'string' ? view.keyword : '' });
    const detail = view.detailFilter || emptyDetailFilter;
    setDetailFilter(detail);
    setDetailDraft(detail);
  };
  const timeGroup = { label: '时间', text: `${usagePresets.find(([id]) => id === period)?.[1] || '自定义'}（${range.start} — ${range.end}）`, scope: '全页' };
  const nameGroup = { label: '用户名', text: keyword || '全部用户', scope: '仅用户调用表' };
  const detailGroups = [
    { label: '模型', text: detailFilter.model || '全部模型', scope: '仅调用明细' },
    { label: '租户', text: state.tenants.find(item => item.id === detailFilter.customer)?.name || detailFilter.customer || '全部租户', scope: '仅调用明细' },
  ];
  const columns = [
    { title: '用户 ID', dataIndex: 'id', width: 150, ellipsis: true },
    { title: '用户名称', dataIndex: 'name', width: 165, ellipsis: true },
    { title: '调用总量', dataIndex: 'calls', width: 120, render: formatNumber },
    { title: '输入 Token 数', dataIndex: 'input', width: 130, render: formatNumber },
    { title: '输出 Token 数', dataIndex: 'output', width: 130, render: formatNumber },
    { title: <TableFieldHelp name="总 Token 数" description="所选范围内完整计量的输入与输出 Token 合计。"/>,
      dataIndex: 'total', width: 125, render: (value, row) => <span title={row.pendingTokenCalls
        ? `${row.pendingTokenCalls} 次调用的 Token 计量待确认` : undefined}>{formatNumber(value)}</span> },
    { title: <TableFieldHelp name="错误率 (%)" description="所选范围内，失败请求数占已判定成功或失败的请求数的比例。"/>,
      dataIndex: 'errorRate', width: 112, render: value => value == null ? '—' : value.toFixed(2) + '%' },
  ];
  return <div className="admin-page-stack xa24-page user-analysis-page">
    <div className="xa24-entry-header">
      <div>
        <h1>{t('用户数据')}</h1>
        <p>{t('查看各用户的模型用量和调用情况。')}</p>
      </div>
      <img alt="" className="xa24-entry-art" src={heroArt} width="80" height="80"/>
    </div>
    <Card className="xa24-page-card user-analysis-overview" padding={16}>
      <form className="user-analysis-query" aria-label={t('用户数据查询')}
        onSubmit={event => { event.preventDefault(); applyQuery(draft); }}>
        <div className="user-analysis-field">
          <label htmlFor={nameId}>{t('用户名')}</label>
          <Input id={nameId} aria-label={t('用户名')} placeholder={t('请输入用户名')} value={draft.keyword} maxLength={120}
            className="user-analysis-name" onChange={value => setDraft(current => ({ ...current, keyword: value ?? '' }))}/>
        </div>
        <div className="user-analysis-field user-analysis-date">
          <span aria-hidden="true">{t('时间')}</span>
          <DateRange start={draft.range.start} end={draft.range.end} allowLongRange activePreset={draft.period}
            presets={usagePresets} rangeHint="单次最多 365 天"
            trigger={<Button aria-label={t('日期范围')} icon={<CalendarDays size={15} aria-hidden="true"/>} iconPosition="right">
              {draft.range.start} – {draft.range.end}
            </Button>}
            onChange={(next, preset) => setDraft(current => ({ ...current, range: next, period: preset || 'custom' }))}/>
        </div>
        <div className="user-analysis-actions">
          <Button htmlType="submit" theme="solid" type="primary">{t('查询')}</Button>
          <Button onClick={() => applyQuery({ period: 'yesterday', keyword: '' })}>{t('重置')}</Button>
        </div>
      </form>
      <dl className="user-analysis-metrics" aria-label={t('用户指标')}>
        {overviewCards.map(([key, label, Icon, description]) => <div key={key} className="user-analysis-metric">
          <dt title={t(description)}><Icon size={15} aria-hidden="true"/>{t(label)}</dt>
          <dd title={comparison(metrics?.current[key], metrics?.previous[key], period)}>
            {formatUsageNumber(metrics?.current[key])}
          </dd>
        </div>)}
      </dl>
      <Table aria-label={t('用户调用数据')} columns={columns} dataSource={displayedUsers} scroll={{ x: 950 }}
        pagination={{ pageSize: 10, pageSizeOpts: [10, 20, 50, 100], showSizeChanger: true, showTotal: true }}
        empty={keyword ? '暂无匹配用户' : '所选范围暂无注册用户'}/>
    </Card>
    <div className="user-analysis-more">
      <Button theme="borderless" aria-expanded={detailsOpen} aria-controls={detailsId}
        onClick={() => setDetailsOpen(value => !value)}>{t('深入分析')}</Button>
      <div id={detailsId} hidden={!detailsOpen}>
        {detailsOpen && <div className="user-analysis-details">
          <SavedFilterViews notify={Toast} scope="admin-user-analysis" value={{ period, range, keyword, detailFilter }} onApply={applyView}
            groups={[timeGroup, nameGroup, ...detailGroups]} currentGroups={[timeGroup, nameGroup]}
            saveDescription="保存全页时间、用户名称及调用明细的模型和租户条件。"/>
          <div className="admin-analysis-metrics user-analysis-active">
            {activeCards.map(([key, title, note]) => {
              const value = metrics?.[key].at(-1);
              return <AnalysisMetric key={key} title={title} value={formatUsageNumber(value)} help={note}>
                <Space wrap>
                  <Typography.Text size="small">{t('企业')} {formatUsageNumber(metrics?.[`${key}ByType`].企业.at(-1))}</Typography.Text>
                  <Typography.Text size="small">{t('个人')} {formatUsageNumber(metrics?.[`${key}ByType`].个人.at(-1))}</Typography.Text>
                </Space>
                <Typography.Text type="tertiary" size="small">
                  {comparison(value, metrics?.[key === 'dau' ? 'priorDau' : 'priorMau'], period)}
                </Typography.Text>
              </AnalysisMetric>;
            })}
          </div>
          <UserCallDetails state={state} rows={detailRows} start={range.start} end={range.end} draft={detailDraft}
            onDraftChange={setDetailDraft} query={detailFilter} onQueryChange={setDetailFilter} conditionGroups={detailGroups}/>
        </div>}
      </div>
    </div>
  </div>;
}
