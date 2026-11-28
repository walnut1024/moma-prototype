import { useMemo, useState } from 'react';
import { BarChart3, CalendarDays, ChartNoAxesCombined, Repeat2, TrendingUp } from 'lucide-react';
import { HorizontalBarChart, TimeSeriesChart } from '../components/AnalyticsCharts';
import { Card, Button } from './xa24/HaloUI.jsx';
import { useChannelText } from './channel-language';
import { requestOutcome } from './call-observations.mjs';
import { usageBuckets, usageGroups, usageRates } from './usage-analysis';
import { usageTokenValue } from './usage-distributions';

const displayNumber = new Intl.NumberFormat('zh-CN', { maximumFractionDigits: 2 });
const format = value => Number.isFinite(value) ? displayNumber.format(value) : '—';
const confirmedToken = row => row.usageConfirmed !== false && usageTokenValue(row) !== null;
const modalities = [
  ['text', '语言模型用量趋势'],
  ['multimodal', '多模态模型用量趋势'],
  ['visual', '视觉模型用量趋势', [['Token', 'Token 调用量'], ['张', '图片·张'], ['秒', '时长·秒']]],
  ['audio', '语音模型用量趋势', [['Token', 'Token 调用量'], ['字符', '文本·万字符'], ['秒', '时长·秒']]],
  ['embedding', '向量模型用量趋势'],
];

function quantitySeries(buckets, unit, category) {
  const metered = buckets.map(rows => rows.filter(row => row.unit === unit && (!category || row.category === category)));
  const hasObservations = metered.some(rows => rows.length > 0);
  return metered.map(rows => {
    if (!rows.length) return hasObservations ? 0 : null;
    const complete = rows.every(row => unit === 'Token' ? confirmedToken(row) : row.usageConfirmed !== false && row.value.complete);
    return complete ? rows.reduce((sum, row) => sum + row.value.total, 0) : null;
  });
}

function EmptyChart() {
  const t = useChannelText();
  return <p className="ua-statistics-empty">{t('所选范围暂无可展示数据')}</p>;
}

function TrendCard({ title, unit, labels, values, area = true, domain, controls }) {
  const t = useChannelText();
  return <Card className="ua-statistics-plot">
    <div className="ua-statistics-card-heading">
      <h2><TrendingUp size={16} aria-hidden="true"/>{t(title)} <small>（{t('单位')}：{unit}）</small></h2>
      {controls}
    </div>
    {values.some(Number.isFinite) ? <TimeSeriesChart compact legendAtTop type={area ? 'area' : 'line'} showData={false}
      height={238} label={t(title)} unit={unit} labels={labels} domain={domain}
      series={[{ label: t('总量'), total: true, values }]}/> : <EmptyChart/>}
  </Card>;
}

function ModalityChart({ group, title, choices, labels, buckets, tokenUnit, tokenScale }) {
  const t = useChannelText();
  const [unit, setUnit] = useState('Token');
  const scale = unit === 'Token' ? tokenScale : unit === '字符' ? 10000 : 1;
  const label = { Token: tokenUnit, 字符: '万字符' }[unit] || unit;
  const values = quantitySeries(buckets, unit, group).map(value => value == null ? null : value / scale);
  return <TrendCard title={title} unit={t(label)} labels={labels} values={values} controls={choices && (
    <div className="ua-statistics-pills" role="group" aria-label={t(title)}>
      {choices.map(([value, name]) => <Button size="small" theme={unit === value ? 'light' : 'borderless'}
        key={value} aria-pressed={unit === value} onClick={() => setUnit(value)}>{t(name)}</Button>)}
    </div>
  )}/>;
}

function RankingCard({ id, rows, title, denominator, unit, onChoose }) {
  const t = useChannelText();
  const fraction = denominator > 0 ? format(rows.reduce((total, row) => total + row.raw, 0) * 100 / denominator) + '%' : '—';
  return <section id={id} tabIndex={-1} aria-label={t(title)} className="ua-statistics-ranking">
    <Card className="xa24-page-card ua-statistics-plot">
      <div className="ua-statistics-card-heading">
        <h2><BarChart3 size={16} aria-hidden="true"/>{t(title)} <small>（{t('单位')}：{unit}）</small></h2>
        <span className="ua-statistics-share">{t('Top 10 占比')} <strong>{fraction}</strong></span>
      </div>
      {rows.length ? <HorizontalBarChart rows={rows} height={340} label={t(title)} unit={unit}
        onChoose={onChoose} showData/> : <EmptyChart/>}
    </Card>
  </section>;
}

export default function UsageStatisticsOverview({ result, state, million, onChoose }) {
  const t = useChannelText();
  const { current, window: period } = result;
  const { labels, buckets, tokens, calls, success, rates, customerGroups, modelGroups, tokenTotal } = useMemo(() => {
    const ranges = usageBuckets([], [], period);
    const groups = ranges.map(() => []);
    for (const row of current) {
      const index = ranges.findIndex(bucket => row.at >= bucket.start && row.at < bucket.end);
      if (index !== -1) groups[index].push(row);
    }
    const confirmed = current.filter(confirmedToken);
    const ranked = current.map(row => row.unit === 'Token' && row.usageConfirmed === false
      ? { ...row, value: { ...row.value, complete: false } } : row);
    return {
      labels: ranges.map(row => row.label), buckets: groups,
      tokens: quantitySeries(groups, 'Token'),
      calls: groups.map(rows => current.length ? rows.length : null),
      success: groups.map(rows => {
        const outcomes = rows.map(row => requestOutcome(row));
        const successful = outcomes.filter(value => value === 'success').length;
        const known = successful + outcomes.filter(value => value === 'failed').length;
        return known ? successful * 100 / known : null;
      }),
      rates: confirmed.length ? usageRates(confirmed, period) : {},
      customerGroups: usageGroups(ranked, 'tenantId'), modelGroups: usageGroups(ranked, 'modelId'),
      tokenTotal: confirmed.length ? confirmed.reduce((sum, row) => sum + row.value.total, 0) : null,
    };
  }, [current, period]);
  const tokenUnit = million ? '百万 Tokens' : '千 Tokens';
  const abbreviation = million ? 'M' : 'K';
  const tokenScale = million ? 1e6 : 1e3;
  const tokenDisplay = value => value == null ? null : value / tokenScale;
  const metricCards = [
    ['Token 调用总量', tokenDisplay(tokenTotal), abbreviation, BarChart3],
    ['模型调用次数', current.length, '次', Repeat2],
    ['日均 Token 调用量', tokenDisplay(rates.averageTpd), abbreviation, CalendarDays],
    ['每分钟 Token 调用量峰值', tokenDisplay(rates.peakTpm), abbreviation, TrendingUp],
    ['每分钟 Token 调用量均值', tokenDisplay(rates.averageTpm), abbreviation, ChartNoAxesCombined],
  ];
  const ranking = (groups, collection, metric, scale) => {
    const names = new Map(collection.map(item => [item.id, item.name || item.modelId || item.id]));
    return groups.filter(row => row[metric] > 0)
      .sort((a, b) => b[metric] - a[metric] || a.id.localeCompare(b.id)).slice(0, 10)
      .map(row => ({
        id: row.id, value: row[metric] / scale, raw: row[metric],
        name: names.get(row.id) || (row.id === '__unknown__' ? t('未归属') : row.id),
      }));
  };
  return <>
    <Card className="ua-statistics-summary">
      <h2>{t('指标总览')}</h2>
      <dl>
        {metricCards.map(([title, value, unit, Icon]) => <div key={title}>
          <dt><Icon size={14} aria-hidden="true"/>{t(title)}</dt>
          <dd>{format(value)}{Number.isFinite(value) && <small>{t(unit)}</small>}</dd>
        </div>)}
      </dl>
    </Card>
    <TrendCard title="Token 调用量趋势" unit={tokenUnit} labels={labels} values={tokens.map(tokenDisplay)}/>
    <TrendCard title="模型调用次数趋势" unit={t('次')} labels={labels} values={calls}/>
    <TrendCard title="成功率趋势" unit="%" labels={labels} values={success} area={false} domain={[0, 100]}/>
    {modalities.map(([group, title, choices]) => <ModalityChart key={group} group={group} title={title} choices={choices}
      labels={labels} buckets={buckets} tokenUnit={tokenUnit} tokenScale={tokenScale}/>)}
    {[
      ['Token 用量 Top 10 客户', customerGroups, state.tenants, 'total', tokenUnit, tokenScale, 'tenantId'],
      ['Token 用量 Top 10 模型', modelGroups, state.models, 'total', tokenUnit, tokenScale, 'modelId'],
      ['模型调用次数 Top 10 客户', customerGroups, state.tenants, 'calls', t('次'), 1, 'tenantId'],
      ['模型调用次数 Top 10 模型', modelGroups, state.models, 'calls', t('次'), 1, 'modelId'],
    ].map(([title, groups, collection, metric, unit, scale, dimension]) => {
      const cardId = `usage-${dimension}-${metric}-ranking`;
      return <RankingCard key={cardId} id={cardId} title={title} rows={ranking(groups, collection, metric, scale)} unit={unit}
        denominator={metric === 'total' ? tokenTotal : current.length} onChoose={id => onChoose(dimension, id, cardId)}/>;
    })}
  </>;
}
