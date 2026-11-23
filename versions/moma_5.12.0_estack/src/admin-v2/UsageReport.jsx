import { useChannelText } from './channel-language';
import { useMemo } from 'react';
import { Button, Card, Space, Typography } from '@douyinfe/semi-ui';
import { DonutChart, HorizontalBarChart, TimeSeriesChart } from '../components/AnalyticsCharts';
import { adminChartColor, chartPalette } from '../components/chart-style.mjs';
import { AnalysisHelp } from './AnalysisMetric';
import { formatUsageNumber } from './usage-analysis';
import { dayOf } from './analytics';
import { usageShare } from './usage-distributions';
import { billingGroups, modelFamilies, usageChange, usageScenes, usageReport } from './usage-report';

const { Text, Title, Paragraph } = Typography;
const trendColors = { paid: '#1b8e3d', free: chartPalette[2], pending: chartPalette[6] };
const compact = value => value >= 1e12 ? `${(value / 1e12).toLocaleString('zh-CN', { maximumFractionDigits: 2 })}万亿` : formatUsageNumber(value).replace('w', '万');
const percentage = (value, total) => value != null && total > 0 ? `${(value * 100 / total).toLocaleString('zh-CN', { maximumFractionDigits: 2 })}%` : '—';
const valueText = (value, unit) => value == null ? '—' : `${compact(value)} ${unit}`;
const heading = (title, help) => <Space wrap><Title heading={5} component="h2">{title}</Title>{help && <AnalysisHelp label={title}>{help}</AnalysisHelp>}</Space>;

function Metrics({ items }) {
  return <dl className="ua-report-metrics">
    {items.map(([label, value, unit, note, change]) => <div className="ua-report-metric" key={label}>
      <dt>{label}</dt>
      <dd data-change={change ? value.startsWith('+') ? 'up' : value.startsWith('-') ? 'down' : undefined : undefined}>
        {unit ? compact(value) : value}{unit && value != null && <small>{unit}</small>}
      </dd>
      {note && <dd className="ua-report-note">{note}</dd>}
    </div>)}
  </dl>;
}

function Breakdown({ title, rows, unit, total, onChoose }) {
  return <Card title={heading(title)}>
    {total > 0 ? <div className="ua-report-donut">
      <DonutChart rows={rows.filter(row => row.value > 0)} label={title} unit={unit} height={190} centerValue={compact(total)} centerLabel={unit}
        onChoose={onChoose} showData={false}/>
      <ul className="ua-report-legend">
        {rows.map(row => <li key={row.id}>
          <span className="ua-native-swatch" aria-hidden="true" style={{ background: adminChartColor(row.color) }}/>
          {onChoose && row.id !== '__unknown__' ? <Button theme="borderless" size="small" onClick={() => onChoose(row.id)} title={row.label}>{row.label}</Button> : <span>{row.label}</span>}
          <span>{valueText(row.value, unit)} <Text size="small" type="tertiary">{percentage(row.value, total)}</Text></span>
        </li>)}
      </ul>
    </div> : <Paragraph type="secondary" className="ua-native-chart-empty">所选范围暂无可展示数据</Paragraph>}
  </Card>;
}

export default function UsageReport({ state, range, result, filters, clock, live, provider, onProvider }) {
  const translateLabel = useChannelText();
  const data = useMemo(() => usageReport(state, range, result, filters, clock), [state, range, result, filters, clock]);
  const { selected, prior } = data;
  const single = range.start === range.end;
  const period = single ? live ? '今日' : '当日' : '期间';
  const comparison = range.end === dayOf(clock) ? '较昨日同时段' : '较昨日';
  const weekEnd = range.end.slice(5);
  const weekLabel = `${data.weekStart.slice(5)} 至 ${weekEnd}`;
  const monthLabel = `${data.monthStart.slice(0, 7)} · 截至 ${weekEnd}`;
  const amounts = [
    [`${period} Token 总调用量`, selected.tokens, 'Token'],
    ...(single ? [[`${comparison} Token 变化`, usageChange(selected.tokens, prior.tokens), null, null, true]] : []),
    [`${period} Token 总调用次数`, selected.calls, '次'],
    ...(single ? [[`${comparison}调用次数变化`, usageChange(selected.calls, prior.calls), null, null, true]] : []),
    ...(single && !live ? [
      ['近一周日均 Token 调用量', data.week.tokens == null ? null : data.week.tokens / 7, 'Token', weekLabel],
      ['近一周 Token 调用总量', data.week.tokens, 'Token', weekLabel],
      ['近一周 Token 调用总次数', data.week.calls, '次', weekLabel],
    ] : []),
    ...(single ? usageScenes.map(([id, title]) => [`${period}${title} Token 调用量`, selected.buckets[id].tokens, 'Token']) : []),
  ];
  const classified = billingGroups.slice(0, 2);
  const billing = [
    ...classified.map(([id, label]) => [`${period}${label} Token 总量`, selected.buckets[id].tokens, 'Token']),
    ...classified.map(([id, label]) => [`${period}${label}调用次数`, selected.buckets[id].calls, '次']),
  ];
  const models = new Map(state.models.map(model => [model.id, model.name || model.modelId || model.id]));
  const providers = new Map(state.providers.map(item => [item.id, item.name || item.id]));
  const selectedProvider = providers.get(provider) || provider;
  const providerRows = data.providers.ranked.filter(row => row.value > 0);
  const ranked = provider ? usageShare(result.current.filter(row => row.providerId === provider), 'modelId', 'total').ranked : data.models.ranked;
  const top = ranked.filter(row => row.value > 0 && row.id !== '__unknown__').slice(0, 10).map(row => ({ ...row, name: models.get(row.id) || row.id }));
  const rankingTitle = provider ? `${selectedProvider} · TOP10 模型 Token 使用量` : 'TOP10 模型 Token 使用量';
  return <div className="ua-report">
    <Card title={heading('Token 调用总览', 'Token 总调用量仅计入计量完整的 Token 请求。总调用次数按平台请求去重，含其他计量单位的请求。近一周为所选日及之前六个自然日。')}>
      <Metrics items={amounts}/>
      {(selected.pending > 0 || selected.buckets.unknown.calls > 0) && <Paragraph type="secondary" size="small" className="ua-report-note">
        {[selected.pending > 0 && `${compact(selected.pending)} 次 Token 计量待确认`, selected.buckets.unknown.calls > 0 && `${compact(selected.buckets.unknown.calls)} 次调用未归属业务场景`].filter(Boolean).join(' · ')}
      </Paragraph>}
    </Card>
    {live ? <Card title={heading('今日全天预测')}><Paragraph type="secondary">暂无预测数据</Paragraph></Card> : <>
      {single && <Card title={heading('每日 Token 调用量趋势（近 30 天）', '截至所选日期。未记录 Token 用量的日期留空。')}>
        <TimeSeriesChart type="area" legendAtTop compact unit="Token" label="每日 Token 调用量趋势（近 30 天）"
          labels={data.daily.map(row => row.date.slice(5))}
          series={[{ label: 'Token 总调用量', total: true, values: data.daily.map(row => row.tokens) },
            ...billingGroups.filter(([id]) => id !== 'pending' || data.daily.some(row => row.buckets[id].tokens != null))
              .map(([id, label]) => ({ label: `${label} Token`, color: trendColors[id], values: data.daily.map(row => row.buckets[id].tokens) }))]}/>
      </Card>}
      <Card title={heading('付费与免费 Token 分析', '按实际记录的付费、免费归属汇总。未确认归属的用量和调用单列。')}>
        <Metrics items={billing}/>
        {selected.buckets.pending.calls > 0 && <Paragraph type="secondary" size="small" className="ua-report-note">
          归属待确认 · {valueText(selected.buckets.pending.tokens, 'Token')} · {valueText(selected.buckets.pending.calls, '次')}
        </Paragraph>}
      </Card>
      <div className="ua-report-pair">
        {[['tokens', 'Token', ' Token 占比', ' Token'], ['calls', '次', '调用次数占比', '调用']].map(([metric, unit, title, suffix]) => (
          <Breakdown key={metric} title={`付费 vs 免费${title}`} unit={unit} total={selected[metric]}
            rows={billingGroups.filter(([id]) => id !== 'pending' || selected.buckets[id].calls > 0)
              .map(([id, label, color]) => ({ id, label: id === 'pending' ? label : label + suffix, color, value: selected.buckets[id][metric] }))}/>
        ))}
      </div>
      {single && <>
        <Card title={heading('大模型 Token 使用量', '以所选日期所在月统计。日均按月初至所选日的自然日计算。')}>
          <Metrics items={[['大模型本月日均 Token 使用量', data.month.total, 'Token', monthLabel],
            ...modelFamilies.map(([id, label]) => [`${label}本月日均 Token 使用量`, data.month[id], 'Token', monthLabel])]}/>
        </Card>
        <Card title={heading('各大模型本月 Token 使用量对比', '从每月 1 日起每 7 天为一周，最后一周截至所选日期。')}>
          <TimeSeriesChart type="bar" legendAtTop compact unit="Token" label="各大模型本月 Token 使用量对比"
            labels={data.weeks.map((week, index) => `${Number(range.end.slice(5, 7))}月第${index + 1}周\n${week.start.slice(5)}–${week.end.slice(5)}`)}
            series={modelFamilies.map(([id, label], index) => ({ label, color: chartPalette[index], values: data.weeks.map(week => week.values[id]) }))}/>
        </Card>
        <div className="ua-report-pair">
          <Card title={heading(rankingTitle)} headerExtraContent={provider && <Button onClick={() => onProvider(null)} size="small">{translateLabel("全部服务商")}</Button>}>
            {top.length ? <HorizontalBarChart rows={top} unit="Token" label={rankingTitle} showData/> :
              <Paragraph type="secondary" className="ua-native-chart-empty">所选范围暂无已确认 Token 用量</Paragraph>}
          </Card>
          <Breakdown title="各服务商 Token 使用量" unit="Token" total={data.providers.total}
            rows={providerRows.map((row, index) => ({ ...row, label: row.id === '__unknown__' ? '未归属服务商' : providers.get(row.id) || row.id, color: chartPalette[index % chartPalette.length] }))}
            onChoose={id => { if (id !== '__unknown__') onProvider(id); }}/>
        </div>
      </>}
    </>}
  </div>;
}
