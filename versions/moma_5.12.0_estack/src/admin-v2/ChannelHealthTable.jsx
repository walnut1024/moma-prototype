import TableFieldHelp from '../components/TableFieldHelp';
import { useChannelText } from './channel-language';
import { Popover, Button, Tooltip, Typography } from '@douyinfe/semi-ui';
import { Chart } from '../components/AnalyticsCharts';
import { DEFAULT_PAGE_SIZE } from '../components/FilterControls';
import Table from './AdminTable';
import AdminStatus from './AdminStatus';
import ChannelCostCell from './ChannelCostCell';
import { availabilityDefinition } from './channel-health-observations.mjs';

const seconds = new Intl.NumberFormat('zh-CN', { minimumFractionDigits: 2, maximumFractionDigits: 3 });
const tokensPerSecond = new Intl.NumberFormat('zh-CN', { minimumFractionDigits: 1, maximumFractionDigits: 2 });
const metricColumnWidth = 122;
const availabilityPercent = value => Number.isFinite(value) ? value.toFixed(2) + '%' : '—';
const headers = {
  health: [
    '统计最近 3 个 UTC 日期（含今天）。排除上游 4xx（含 429）、明确限流、取消和结果未知的请求。',
    '每分钟至少有 10 次有效上游请求才纳入统计。该分钟成功率达到 80% 即为达标。',
    '',
    '健康：所有纳入统计的分钟都达标。',
    '异常：至少一个纳入统计的分钟未达标。',
    '样本不足：有上游记录，但没有任何一分钟达到样本门槛。',
    '暂无观测：统计范围内没有上游记录。',
  ].join('\n'),
  ttft: '所选时段内有效样本的首 Token 时延第 50 百分位，单位为秒。',
  otps: '所选时段内有效成功样本的输出速率第 50 百分位。每次请求单独计算每秒输出的 Token 数。',
  cacheRate: '所选时段内，上游已采集样本的缓存读取 Token 数占输入 Token 总数的比例。',
};
function metricHeader(label, help) {
  return <TableFieldHelp name={label} description={help}/>;
}

function byMetric(value) {
  return (a, b, order) => {
    const left = value(a), right = value(b);
    if (left == null || right == null) return ((left == null) - (right == null)) * (order === 'descend' ? -1 : 1);
    return left - right;
  };
}

function MetricSparkline({ labels, values, label, format }) {
  const first = values.findIndex(Number.isFinite);
  const end = values.findLastIndex(Number.isFinite) + 1;
  const trendValues = values.slice(first, end);
  return <Chart height={24} label={label + '趋势'} option={{ animation: false, color: ['#7294b6'],
      grid: { top: 3, bottom: 3, left: 3, right: 3 }, tooltip: { trigger: 'axis', appendToBody: true, valueFormatter: format },
      xAxis: { type: 'category', show: false, data: labels.slice(first, end), boundaryGap: trendValues.length < 2 },
      yAxis: { type: 'value', show: false, scale: true },
      series: [{ type: 'line', name: label, data: trendValues, showAllSymbol: true,
        symbolSize: trendValues.length < 2 ? 4 : 2, lineStyle: { width: 1.5 } }] }}/>;
}

function MetricTrend({ row, field, label, format, labels, summaries, onTrend }) {
  const value = row[field];
  if (value == null) return missingMetric;
  const values = summaries.map(bucket => bucket.get(row.id)?.[field] ?? null);
  return <button type="button" className="channel-health-metric channel-health-trend" aria-label={row.channelName + ' ' + row.upstreamModelId + ' ' + label + ' ' + format(value) + '，查看趋势'}
    onClick={() => onTrend(row.id)}>
    <MetricSparkline {...{ labels, values, label, format }}/>
    <span className="channel-health-value">{format(value)}</span>
  </button>;
}

const missingMetric = <span className="channel-health-metric">
  <span className="channel-health-value channel-health-value-missing">—</span>
</span>;

function Availability({ uptime }) {
  if (uptime?.available == null) return <Tooltip content="最近 3 天内暂无可统计的上游响应。">
    {missingMetric}
  </Tooltip>;
  const details = <div>{uptime.periods.map(period => <div key={period.label}>
    {period.label} · {period.count ? `${period.success} / ${period.count} 次成功` : '暂无可统计响应'}
  </div>)}</div>;
  return <div className="channel-health-metric">
    <MetricSparkline label="可用率" format={availabilityPercent}
      labels={uptime.periods.map(period => period.label)}
      values={uptime.periods.map(period => period.rate)}/>
    <Tooltip content={details}>
      <span className="channel-health-value" tabIndex={0}>{availabilityPercent(uptime.available)}</span>
    </Tooltip>
  </div>;
}

export default function ChannelHealthTable({ rows, labels, summaries, simulated, canManageChannels, onTrend, loading }) {
  const t = useChannelText();
  const trend = (field, label, format) => ({
    title: headers[field] ? metricHeader(label, headers[field]) : label, dataIndex: field, width: metricColumnWidth,
    sorter: byMetric(row => row[field]),
    render: (_, row) => <MetricTrend {...{ row, field, label, format, labels, summaries, onTrend }}/>,
  });
  const columns = [
    { title: t('上游模型/服务商'), width: 150, fixed: 'left', render: (_, row) => <div className="channel-health-identity">
      <Typography.Text strong ellipsis={{ showTooltip: true }}>
        {row.upstreamModelId || '模型未采集'}
      </Typography.Text>
      <Typography.Text size="small" type="secondary" ellipsis={{ showTooltip: true }}>{row.providerName || '服务商未采集'}</Typography.Text>
    </div> },
    { title: t('连接'), dataIndex: 'channelName', width: 90, render: (value, row) =>
      <Typography.Text ellipsis={{ showTooltip: true }} link={!simulated && canManageChannels && row.enabledLabel ? {
        href: '#/admin-2/providers-reference?' + new URLSearchParams({ connection: row.channel }), target: '_blank', rel: 'noopener',
      } : undefined}>{value || '—'}</Typography.Text> },
    { title: metricHeader(t('服务地址'), t('当前连接配置的服务地址。实际请求路径可能因接口或模型映射而不同。')),
      dataIndex: 'baseUrl', width: 180, render: value =>
        <Typography.Text className="channel-health-url" ellipsis={{ rows: 2, showTooltip: true }}>{value || '—'}</Typography.Text> },
    { title: t('状态'), width: 72, render: (_, row) => <AdminStatus value={row.enabledLabel} label={t(row.enabledLabel)}/> },
    { title: metricHeader(t('健康状态'), headers.health), width: 80,
      render: (_, row) => <AdminStatus value={row.health} label={t(row.health)} color={row.health === '健康' ? 'green' : undefined}/> },
    { title: metricHeader(t('可用率'), availabilityDefinition), dataIndex: 'uptime', width: metricColumnWidth,
      sorter: byMetric(row => row.uptime?.available), render: uptime => <Availability uptime={uptime}/> },
    trend('ttft', 'TTFT (P50)', value => seconds.format(value / 1000) + 's'),
    trend('otps', t('吞吐量 (P50)'), value => tokensPerSecond.format(value) + 'tps'),
    trend('cacheRate', t('缓存命中率'), availabilityPercent),
    ...(canManageChannels ? [{ title: t('采购价'), width: 184, render: (_, row) => row.costs?.map(cost =>
      <div key={cost.key}><ChannelCostCell cost={{ ...cost, items: cost.items.slice(0, 2) }}/>
        {cost.items.length > 2 && <Popover trigger="click" position="left" content={<div className="channel-health-prices"><ChannelCostCell cost={cost}/></div>}>
          <Button theme="borderless" size="small">全部 {cost.items.length} 项</Button>
        </Popover>}</div>) ?? '—' }] : []),
  ];
  return <Table className="channel-health-table" loading={loading} aria-label={t('上游模型观测列表')} rowKey="id" size="small" columns={columns} dataSource={rows}
    empty={t('没有匹配的上游模型')} pagination={rows.length > DEFAULT_PAGE_SIZE ? { pageSize: DEFAULT_PAGE_SIZE } : false}
    scroll={{ x: columns.reduce((total, column) => total + column.width, 0) }}/>;
}
