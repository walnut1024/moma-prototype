import { formatUsageNumber as compact } from './usage-analysis';
import { useEffect, useRef } from 'react';
import * as echarts from 'echarts/core';
import { LineChart, BarChart } from 'echarts/charts';
import { GridComponent, TooltipComponent, LegendComponent } from 'echarts/components';
import { SVGRenderer } from 'echarts/renderers';

echarts.use([LineChart, BarChart, GridComponent, TooltipComponent, LegendComponent, SVGRenderer]);

const blue = '#3568f9';
const muted = '#71819a';
const grid = '#e8edf5';
const safe = value => String(value ?? '').replace(/[&<>"']/g, character => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[character]);

function Chart({ option, height, label, onClick }) {
  const element = useRef(null);
  const chart = useRef(null);
  useEffect(() => {
    const instance = echarts.init(element.current, null, { renderer: 'svg' });
    chart.current = instance;
    const observer = new ResizeObserver(() => instance.resize());
    observer.observe(element.current);
    return () => { observer.disconnect(); instance.dispose(); chart.current = null; };
  }, []);
  useEffect(() => { chart.current?.setOption(option, { notMerge: true }); }, [option]);
  useEffect(() => {
    const instance = chart.current;
    if (!instance || !onClick) return;
    instance.on('click', onClick);
    return () => instance.off('click', onClick);
  }, [onClick]);
  return <div className="ua-echart" ref={element} style={{ height }} role="img" aria-label={label} />;
}

export function TrendChart({ labels, series, unit, label, type = 'line', stacked = false, axisUnit = unit, tickScale = 1 }) {
  const option = {
    animationDuration: 220,
    color: series.map(item => item.color || blue),
    grid: { top: 58, left: 46, right: 18, bottom: 34, containLabel: false },
    legend: { type: 'scroll', top: 1, right: 8, left: 8, itemWidth: 16, itemHeight: 3, textStyle: { color: '#65748b', fontSize: 10 } },
    tooltip: { trigger: 'axis', axisPointer: { type: type === 'bar' ? 'shadow' : 'line', lineStyle: { color: '#b8c7e8', type: 'dashed' } }, backgroundColor: '#fff', borderColor: grid, textStyle: { color: '#34425b', fontSize: 12 }, formatter: items => `<div>${safe(items[0]?.axisValueLabel)}</div>${items.map(item => `<div>${item.marker} ${safe(item.seriesName)}：<b>${compact(item.value)} ${unit}</b></div>`).join('')}` },
    xAxis: { type: 'category', data: labels, boundaryGap: type === 'bar', axisTick: { show: false }, axisLine: { lineStyle: { color: '#dce4ee' } }, axisLabel: { color: muted, fontSize: 10, hideOverlap: true, interval: labels.length > 16 ? Math.ceil(labels.length / 8) - 1 : 'auto' } },
    yAxis: { type: 'value', min: 0, minInterval: unit === '次' ? 1 : undefined, splitNumber: 4, name: axisUnit, nameTextStyle: { color: muted, fontSize: 10, align: 'left' }, axisLabel: { color: muted, fontSize: 10, formatter: value => compact(value / tickScale) }, splitLine: { lineStyle: { color: grid, type: 'dashed' } } },
    series: series.map((item, index) => ({ name: item.label, type: type === 'bar' ? 'bar' : 'line', data: item.values, smooth: type === 'bar' ? undefined : .2, connectNulls: false, showSymbol: type !== 'bar' && labels.length <= 12, symbol: 'circle', symbolSize: 5, lineStyle: { width: index ? 2 : 2.5, type: item.dashed ? 'dashed' : 'solid' }, areaStyle: type === 'area' ? { opacity: .14 } : type === 'line' && index === 0 ? { opacity: .055 } : undefined, barMaxWidth: 24, stack: type === 'bar' && stacked ? 'total' : undefined, emphasis: { focus: 'series' } })),
  };
  return <Chart option={option} height={250} label={label} />;
}

export function RankingChart({ rows, metric, unit, collection, scale, onChoose }) {
  const names = rows.map((row, index) => `${index + 1}  ${collection.find(item => item.id === row.id)?.name || row.id}`);
  const option = {
    animationDuration: 220,
    grid: { top: 6, left: 118, right: 78, bottom: 4 },
    tooltip: { trigger: 'axis', axisPointer: { type: 'shadow' }, formatter: items => `${safe(items[0]?.axisValueLabel)}<br/>${metric === 'calls' ? '调用次数' : unit}：<b>${compact(rows[items[0]?.dataIndex]?.[metric] || 0)}</b>` },
    xAxis: { type: 'value', show: false },
    yAxis: { type: 'category', data: names, inverse: true, axisLine: { show: false }, axisTick: { show: false }, axisLabel: { color: '#4c5d79', fontSize: 11, width: 108, overflow: 'truncate', margin: 10 } },
    series: [{ type: 'bar', data: rows.map(row => scale === 'log' ? Math.log10(row[metric] + 1) : row[metric]), barWidth: 10, showBackground: true, backgroundStyle: { color: '#edf1f8', borderRadius: 2 }, itemStyle: { color: blue, borderRadius: 2 }, label: { show: true, position: 'right', distance: 8, color: '#34425b', fontSize: 11, formatter: ({ dataIndex }) => compact(rows[dataIndex][metric]) } }],
  };
  return <Chart option={option} height={Math.max(140, rows.length * 28 + 20)} label={`用量排行，显示 ${rows.length} 个对象，点击条形查看明细`} onClick={event => { if (rows[event.dataIndex]) onChoose(rows[event.dataIndex].id); }} />;
}
