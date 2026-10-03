import { useEffect, useRef, useState } from 'react';
import * as echarts from 'echarts/core';
import { LineChart, BarChart } from 'echarts/charts';
import { GridComponent, TooltipComponent, LegendComponent } from 'echarts/components';
import { SVGRenderer } from 'echarts/renderers';
import { SlidersHorizontal } from 'lucide-react';
import { Button } from './ui/button';
import { Checkbox } from './ui/checkbox';
import { Input } from './ui/input';
import { Popover, PopoverContent, PopoverTrigger } from './ui/popover';
import { chartPalette, chartColor, chartAxis, chartNumber, defaultChartSeries } from './chart-style.mjs';
import './analytics-charts.css';

echarts.use([LineChart, BarChart, GridComponent, TooltipComponent, LegendComponent, SVGRenderer]);
const muted = '#64748b', grid = '#e4eaf3';
const safe = value => String(value ?? '').replace(/[&<>"']/g, character => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[character]);

function Chart({ option, height, label, onClick, onLegend }) {
  const element = useRef(null), chart = useRef(null);
  useEffect(() => {
    const instance = echarts.init(element.current, null, { renderer: 'svg' });
    chart.current = instance;
    const observer = new ResizeObserver(() => { if (!instance.isDisposed()) instance.resize(); });
    observer.observe(element.current);
    return () => { observer.disconnect(); instance.dispose(); chart.current = null; };
  }, []);
  useEffect(() => { chart.current?.setOption(option, { notMerge: true }); }, [option]);
  useEffect(() => {
    const instance = chart.current;
    if (!instance) return;
    if (onClick) instance.on('click', onClick);
    if (onLegend) instance.on('legendselectchanged', onLegend);
    return () => { if (!instance.isDisposed()) { if (onClick) instance.off('click', onClick); if (onLegend) instance.off('legendselectchanged', onLegend); } };
  }, [onClick, onLegend]);
  return <div className="ua-echart unified-chart-canvas" ref={element} style={{ height }} role="img" aria-label={label} />;
}

export function TimeSeriesChart({ labels, series, unit = '', label, axisUnit, tickScale, height = 250, valueFormatter, type = 'line', stacked = false, domain, tickFormatter, overview = false, className = '' }) {
  const [choice, setChoice] = useState(null), [query, setQuery] = useState('');
  const signature = series.map(item => item.label).join('\u0000');
  const selected = choice?.signature === signature ? choice.names : defaultChartSeries(series);
  const legendNames = choice?.signature === signature ? choice.legendNames : selected;
  const choose = (names, legendNames = names) => setChoice({ signature, names, legendNames });
  const visible = series.filter(item => selected.includes(item.label));
  const axis = chartAxis(visible, unit, axisUnit, tickScale);
  const formatter = valueFormatter || chartNumber;
  const matches = series.filter(item => item.label.toLowerCase().includes(query.trim().toLowerCase()));
  const temporal = type !== 'bar' || labels.some(time => /^\d{2}-\d{2}|^\d{2}:\d{2}/.test(time));
  const singleDay = labels.length > 0 && labels.every(time => /^\d{2}-\d{2} \d{2}:\d{2}$/.test(time) && time.slice(0, 5) === labels[0].slice(0, 5));
  const option = {
    animation: false,
    color: series.map(chartColor),
    grid: { top: 66, left: 8, right: 16, bottom: 12, containLabel: true },
    legend: { type: 'scroll', data: legendNames, top: 0, right: 8, left: 8, selected: Object.fromEntries(series.map(item => [item.label, selected.includes(item.label)])), icon: 'rect', itemWidth: 18, itemHeight: 3, inactiveColor: '#a1aab8', pageTextStyle: { color: muted }, textStyle: { color: muted, fontSize: 12 } },
    tooltip: { trigger: 'axis', confine: true, axisPointer: { type: type === 'bar' ? 'shadow' : 'line', lineStyle: { color: '#b8c7e8', type: 'dashed' } }, backgroundColor: '#fff', borderColor: grid, extraCssText: 'max-height:60vh;overflow-y:auto;border-radius:6px;box-shadow:0 4px 16px #17243b12', textStyle: { color: '#263247', fontSize: 12 }, formatter: items => `<div>${safe(items[0]?.axisValueLabel)}${temporal ? ' · 北京时间' : ''}</div>${[...items].sort((a,b) => (Number.isFinite(b.value) ? b.value : -Infinity) - (Number.isFinite(a.value) ? a.value : -Infinity)).map(item => `<div>${item.marker} ${safe(item.seriesName)}：<b>${safe(formatter(item.value))}${Number.isFinite(item.value) ? ` ${safe(unit)}` : ''}</b></div>`).join('')}` },
    xAxis: { type: 'category', data: labels, boundaryGap: type === 'bar', axisTick: { show: false }, axisLine: { lineStyle: { color: '#dce4ee' } }, axisLabel: { color: muted, fontSize: 12, hideOverlap: true, formatter: value => singleDay ? value.slice(6) : overview && /^\d{2}-\d{2}$/.test(value) ? value.replace('-', '/') : value, interval: labels.length > 16 ? Math.ceil(labels.length / 6) - 1 : 'auto' } },
    yAxis: { type: 'value', min: domain?.[0] ?? 0, max: domain?.[1], minInterval: ['次','人','个','张'].includes(unit) ? 1 : undefined, splitNumber: 4, name: axis.name, nameTextStyle: { color: muted, fontSize: 12, align: 'left' }, axisLabel: { color: muted, fontSize: 12, formatter: tickFormatter || (value => formatter(value / axis.scale)) }, splitLine: { lineStyle: { color: grid, type: 'dashed' } } },
    series: series.map(item => ({ name: item.label, type: type === 'bar' ? 'bar' : 'line', data: item.values, smooth: .2, connectNulls: false, showSymbol: false, stack: stacked && type !== 'line' ? 'total' : undefined, areaStyle: type === 'area' ? { opacity: .12 } : undefined, barMaxWidth: 24, lineStyle: { width: item.total || /^(总|累计)/.test(item.label) ? 2.5 : 2, type: item.dashed ? 'dashed' : 'solid' }, emphasis: { focus: 'series' } })),
  };
  return <div className={`unified-chart ${className}`} role="group" aria-label={`${label}（${{ line: '折线图', bar: '柱状图', area: '面积图' }[type]}）`}>
    {series.length > 1 && <div className="unified-chart-tools"><span>已展示 {visible.length} / {series.length} 条{choice?.signature !== signature && series.length > 8 ? ' · 默认按用量排序' : ''}</span><Popover><PopoverTrigger asChild><Button variant="outline" size="icon" aria-label={`${label}图表设置`} title="图表设置" onClick={() => setQuery('')}><SlidersHorizontal size={15}/></Button></PopoverTrigger><PopoverContent align="end" className="unified-chart-picker"><strong>显示指标／模型</strong><Input aria-label={`${label}搜索曲线`} placeholder="搜索指标或模型名称" value={query} onChange={event => setQuery(event.target.value)}/><div className="unified-chart-picker-actions"><Button variant="ghost" size="sm" onClick={() => choose(series.map(item => item.label))}>显示全部</Button><Button variant="ghost" size="sm" onClick={() => setChoice(null)}>恢复默认</Button></div><div className="unified-chart-options">{matches.map(item => <label key={item.label}><Checkbox aria-label={`显示${item.label}`} checked={selected.includes(item.label)} disabled={visible.length === 1 && selected.includes(item.label)} onCheckedChange={checked => choose(checked ? [...selected, item.label] : selected.filter(name => name !== item.label))}/><i style={{ background: chartColor(item) }}/><span>{item.label}</span></label>)}{!matches.length && <p>无匹配曲线</p>}</div><small>仅改变图表显示，不影响统计、筛选和导出。</small></PopoverContent></Popover></div>}
    <Chart option={option} height={height} label={`${label}图表`} onLegend={event => choose(Object.keys(event.selected).filter(name => event.selected[name]), legendNames)}/>
  </div>;
}

export function RankingChart({ rows, metric, unit, collection, scale, onChoose }) {
  const names = rows.map((row, index) => `${index + 1}  ${collection.find(item => item.id === row.id)?.name || row.id}`);
  const option = {
    animation: false,
    grid: { top: 6, left: 126, right: 88, bottom: 4 },
    tooltip: { trigger: 'axis', confine: true, backgroundColor: '#fff', borderColor: grid, textStyle: { color: '#263247', fontSize: 12 }, axisPointer: { type: 'shadow' }, formatter: items => `${safe(items[0]?.axisValueLabel)}<br/>${metric === 'calls' ? '调用次数' : safe(unit)}：<b>${chartNumber(rows[items[0]?.dataIndex]?.[metric])}</b>` },
    xAxis: { type: 'value', show: false },
    yAxis: { type: 'category', data: names, inverse: true, axisLine: { show: false }, axisTick: { show: false }, axisLabel: { color: muted, fontSize: 12, width: 116, overflow: 'truncate', margin: 10 } },
    series: [{ type: 'bar', data: rows.map(row => scale === 'log' ? Math.log10(row[metric] + 1) : row[metric]), barWidth: 10, showBackground: true, backgroundStyle: { color: '#edf1f8', borderRadius: 2 }, itemStyle: { color: chartPalette[0], borderRadius: 2 }, label: { show: true, position: 'right', distance: 8, color: '#34425b', fontSize: 12, formatter: ({ dataIndex }) => { const value = rows[dataIndex][metric]; return value >= 1e8 ? `${chartNumber(value / 1e8)}亿` : value >= 1e4 ? `${chartNumber(value / 1e4)}万` : chartNumber(value); } } }],
  };
  return <Chart option={option} height={Math.max(140, rows.length * 28 + 20)} label={`用量排行，显示 ${rows.length} 个对象，点击条形查看明细`} onClick={event => { if (rows[event.dataIndex]) onChoose(rows[event.dataIndex].id); }} />;
}
