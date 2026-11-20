
import { useMemo, useState } from 'react';
import { Button, Empty, Progress, Select, Table, Tag, Typography } from '@douyinfe/semi-ui';
import { DataZoomComponent } from 'echarts/components';
import { use as useChartComponents } from 'echarts/core';
import { Chart } from '../components/AnalyticsCharts';
import { indicators, idb, flash, glm } from './customer-analysis-demo';

useChartComponents([DataZoomComponent]);
const models = [idb, flash, glm];
const colors = ['#0874f8', '#54b938', '#ffac18'];
const limits = [150000000, 100000000, 50000000];
const grains = [['minute', '分钟明细'], ['hour', '小时明细'], ['day', '天明细']];
const format = (value, digits = 0) => Number.isFinite(value)
  ? value.toLocaleString('zh-CN', { minimumFractionDigits: digits, maximumFractionDigits: digits }) : '—';

export const limitRows = models.map((model, index) => ({
  model, user: 'CIDC-U-e5993c8b…', tpm: format(limits[index]), rpm: '—',
}));
const col = (title, dataIndex, width, render) => ({ title, dataIndex, width, ...(render && { render }) });
const modelTag = value => <Tag className="ca-model" size="small" color="blue">{value}</Tag>;
export const limitColumns = [
  col('调用用户', 'user', 220), col('模型', 'model', 220, modelTag), col('当前 TPM 限流', 'tpm', 170), col('当前 RPM 限流', 'rpm', 170),
];
const distributionColors = {
  [idb]: ['#0874f8','#ff9e22','#18b96e','#acb6c7'],
  [flash]: ['#0874f8','#b571fc','#ff9e22','#acb6c7'],
  [glm]: ['#ff9e22','#0874f8','#b571fc','#acb6c7'],
  未知: ['#b571fc'],
};
export const modelColumns = [
  col('模型', 'model', 208, modelTag),
  col('调用次数', 'requests', 103), col('调用占比', 'requestShare', 84),
  col('总 Token 量（亿 Token）', 'tokens', 140), col('Token 占比', 'tokenShare', 96),
  col('P50 TTFT (ms)', 'p50', 112), col('P90 TTFT (ms)', 'p90', 112), col('P99 TTFT (ms)', 'p99', 112),
  col('前 3 区间分布', 'distribution', 142, (value, row) => <div className="ca-distribution" role="img"
    aria-label={'演示区间占比 ' + value.join('%、') + '%'}>
    {value.map((width, i) => <i key={i} style={{ width: width + '%', backgroundColor: distributionColors[row.model][i] }}/>)}
  </div>),
];
const num = value => Number(String(value).replace(/[,%]/g, ''));
const average = (rows, key, requests) => rows.reduce((total, row) => total + row[key] * row.requests, 0) / requests;
function bucketRows(source, grain) {
  const rows = source.map(([time, model, requests, total, limited, success, input, output, ttft, p50]) => ({
    time: '2026-11-19 ' + time + ':00', model, requests: num(requests), total: num(total), limited: num(limited),
    success: num(success), input: num(input), output: num(output), ttft: num(ttft), p50: num(p50),
  }));
  if (grain === 'minute') return rows;
  const span = grain === 'hour' ? 13 : 10;
  const groups = Map.groupBy(rows, row => row.time.slice(0, span) + '|' + row.model);
  return Array.from(groups.values(), group => {
    const time = group[0].time.slice(0, span) + (grain === 'hour' ? ':00' : '');
    const sum = key => group.reduce((total, row) => total + row[key], 0);
    const requests = sum('requests');
    return {
      time, model: group[0].model, requests, total: sum('total'), limited: sum('limited'),
      success: average(group, 'success', requests), input: average(group, 'input', requests),
      output: average(group, 'output', requests), ttft: average(group, 'ttft', requests),
      p50: group.length === 1 ? group[0].p50 : null,
    };
  });
}
const callColumns = [
  col('时间', 'time', 167), col('模型', 'model', 188, modelTag),
  col('请求数', 'requests', 75, value => format(value)), col('总 Token', 'total', 108, value => format(value)),
  col('429 数', 'limited', 66), col('成功率', 'success', 143, value => <div className="ca-success">
    <span>{format(value, 2)}%</span><Progress percent={value} stroke="#12b665" aria-label="成功率"/>
  </div>),
  ...[['平均输入 Token', 'input'], ['平均输出 Token', 'output'], ['平均 TTFT (ms)', 'ttft'],
    ['P50 TTFT (ms)', 'p50'], ['P90 TTFT (ms)', 'p90']].map(([name, key]) => col(name, key, 110, value => format(value, 2))),
];

export function exportCalls(rows, grain, end, download) {
  download('客户调用明细_' + end, callColumns.map(column => column.title), bucketRows(rows, grain)
    .map(row => callColumns.map(({ dataIndex }) => dataIndex === 'success' ? format(row.success, 2) + '%' : row[dataIndex])));
}
const chartKeys = {
  请求数: 'requests', '总 Token': 'total', 成功率: 'success', '平均输入 Token': 'input', '平均输出 Token': 'output',
  '平均 TTFT': 'ttft', 'P50 TTFT': 'p50',
};
const chartUnits = {
  TPM: 'Token / 分钟', RPM: '次 / 分钟', 请求数: '次', '总 Token': 'Token', 成功率: '%',
  '平均输入 Token': 'Token', '平均输出 Token': 'Token', '平均 TTFT': 'ms', 'P50 TTFT': 'ms',
};
function sampleMinuteTrend() {
  let seed = 15401;
  const random = () => {
    seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
    return seed / 4294967296;
  };
  const start = Date.UTC(2026, 10, 13);
  return Array.from({ length: 968 }, (_, index) => {
    const time = new Date(start + index * 600000);
    const hour = time.getUTCHours() + time.getUTCMinutes() / 60;
    const busy = (1 + Math.sin(hour / 24 * 2 * Math.PI - 2)) / 2;
    const base = 1500000 + busy ** 1.33 * 23500000 * [1, .7, .85, 1, 1.13, .86, 1.04][Math.floor(index / 144)];
    const primary = (base * (.33 + 1.06 * random()) + random() * 6100000) * (random() > .985 ? 1.58 : 1);
    return {
      time: time.toISOString().slice(5, 16).replace('T', ' '),
      values: [primary, 180000 + 4800000 * busy * random() + random() ** 2 * 1800000, 80000 + 3400000 * busy * random()].map(Math.round),
    };
  });
}
const demoTrend = sampleMinuteTrend();
function observationSeries(rows, metric, grain) {
  const times = [...new Set(rows.map(row => row.time))].sort();
  const data = new Map(rows.map(row => [row.time + '|' + row.model, row]));
  const minutes = grain === 'day' ? 1440 : grain === 'hour' ? 60 : 1;
  return times.map(time => ({
    time: time.slice(5, grain === 'day' ? 10 : 16),
    values: models.map(model => {
      const row = data.get(time + '|' + model);
      if (!row) return null;
      if (metric === 'TPM' || metric === 'RPM') return row[metric === 'TPM' ? 'total' : 'requests'] / minutes;
      return row[chartKeys[metric]] ?? null;
    }),
  }));
}
function Trend({ rows, metric, grain, showSampleTrend, matchesModel }) {
  const illustrative = metric === 'TPM' && grain === 'minute' && showSampleTrend;
  const points = illustrative ? demoTrend : observationSeries(rows, metric, grain);
  const series = models.flatMap((model, index) => {
    const data = points.map(point => point.values[index]);
    if (!matchesModel(model) || !data.some(Number.isFinite)) return [];
    return [{
      name: model, type: 'line', data, showSymbol: points.length < 12,
      lineStyle: { width: 1.5 }, itemStyle: { color: colors[index] },
      ...(metric === 'TPM' && { markLine: {
        symbol: 'none', label: { show: false }, silent: true,
        lineStyle: { color: colors[index], type: 'dashed' }, data: [{ yAxis: limits[index] }],
      } }),
    }];
  });
  const name = metric + ' 趋势' + (chartUnits[metric] ? '（' + chartUnits[metric] + '）' : '');
  const chart = {
    animation: false,
    grid: { top: 16, left: 14, right: 20, bottom: 46, containLabel: true },
    tooltip: { trigger: 'axis', confine: true, valueFormatter: value => format(value, metric === '成功率' ? 2 : 0) },
    xAxis: { type: 'category', data: points.map(row => row.time), boundaryGap: false, axisTick: { show: false },
      axisLabel: { hideOverlap: true, interval: points.length > 12 ? Math.ceil(points.length / 11) : 'auto' } },
    yAxis: { type: 'value', min: 0, max: metric === 'TPM' ? 150000000 : metric === '成功率' ? 100 : undefined,
      axisLabel: { formatter: value => format(value) }, splitLine: { lineStyle: { color: '#eaf0f6' } } },
    dataZoom: [{ type: 'slider', bottom: 4, height: 18, showDetail: false }],
    series,
  };
  return <section className="ca-trend">
    <Typography.Title heading={5} component="h3">{name}</Typography.Title>
    {series.length ? <>
      <div className="ca-trend-key">{series.map(item => <span key={item.name}>
        <i style={{ borderColor: item.itemStyle.color }}/>{item.name}
      </span>)}{metric === 'TPM' && series.map(item => <span key={item.name + '-limit'}>
        <i className="ca-dash" style={{ borderColor: item.itemStyle.color }}/>{item.name} · 当前 TPM 限流 {format(limits[models.indexOf(item.name)])}
      </span>)}</div>
      <Chart height={266} option={chart} label={name}/>
    </> : <Empty description="所选条件下暂无此指标的样本"/>}
  </section>;
}

export default function CustomerCallDetail({ rows, grain, setGrain, showSampleTrend, matchesModel }) {
  const [metric, setMetric] = useState('TPM');
  const data = useMemo(() => bucketRows(rows, grain), [rows, grain]);
  return <div className="ca-call">
    <div className="ca-call-controls">
      <div className="ca-segment" role="group" aria-label="统计粒度">{grains.map(([value, label]) =>
        <Button key={value} theme={grain === value ? 'borderless' : 'light'} aria-pressed={grain === value} onClick={() => setGrain(value)}>{label}</Button>
      )}</div>
      <Select aria-label="趋势指标" prefix="趋势指标" value={metric} onChange={setMetric}
        optionList={indicators.map(label => ({ label, value: label }))}/>
    </div>
    <Trend rows={data} metric={metric} grain={grain} showSampleTrend={showSampleTrend} matchesModel={matchesModel}/>
    <section className="ca-trend">
      <Typography.Title heading={5} component="h3">客户调用明细</Typography.Title>
      <Table size="small" columns={callColumns} dataSource={data.map(row => ({ ...row, id: row.time + '|' + row.model }))}
        rowKey="id" scroll={{ x: 'max(100%, 1200px)' }} pagination={{ pageSize: 10, showSizeChanger: true,
          showQuickJumper: true, showTotal: true, pageSizeOpts: [10, 20, 50] }}
        empty={<Empty description="所选条件暂无调用明细样本"/>}/>
    </section>
  </div>;
}
