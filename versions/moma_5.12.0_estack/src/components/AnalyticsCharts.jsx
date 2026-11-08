import { Button as SemiButton, Checkbox as SemiCheckbox, Input as SemiInput, Popover as SemiPopover, Space, Table, Typography } from '@douyinfe/semi-ui';
import { IconChevronDown, IconSetting } from '@douyinfe/semi-icons';
import { useContext, useEffect, useRef, useState } from 'react';
import { AdminUIContext } from './admin-ui-context';
import * as echarts from 'echarts/core';
import { LineChart, BarChart, PieChart, HeatmapChart } from 'echarts/charts';
import { GridComponent, TooltipComponent, LegendComponent, VisualMapComponent, MarkLineComponent } from 'echarts/components';
import { SVGRenderer } from 'echarts/renderers';
import { SlidersHorizontal } from 'lucide-react';
import { Button } from './ui/button';
import { Checkbox } from './ui/checkbox';
import { Input } from './ui/input';
import { Popover, PopoverContent, PopoverTrigger } from './ui/popover';
import { adminChartColor, chartPalette, chartColor, chartAxis, chartNumber, defaultChartSeries } from './chart-style.mjs';
import './analytics-charts.css';

echarts.use([LineChart, BarChart, PieChart, HeatmapChart, GridComponent, TooltipComponent, LegendComponent, VisualMapComponent, MarkLineComponent, SVGRenderer]);
const grid = '#e4eaf3';

function chartTheme(admin) {
  if (!admin) return { muted: '#64748b', primary: chartPalette[0], border: grid, text: '#263247',
    surface: '#fff', inactive: '#a1aab8', axis: '#dce4ee', fill: '#edf1f8', barText: '#34425b', danger: '#c43228', success: '#198754', tint: '#c6d7ff' };

  const style = getComputedStyle(document.body);
  const token = name => style.getPropertyValue(`--semi-color-${name}`).trim();
  return {
    fontFamily: style.fontFamily, muted: token('text-2'), primary: token('primary'),
    border: token('border'), text: token('text-0'), surface: token('bg-0'),
    inactive: token('text-3'), axis: token('border'), fill: token('fill-0'), barText: token('text-1'),
    danger: token('danger'), success: token('success'), tint: token('primary-light-active'),
  };
}
const safe = value => String(value ?? '').replace(/[&<>"']/g, character => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[character]);

function ChartData({ label, headings, rows, compact = false }) {
  const [open, setOpen] = useState(false);
  return <div className="admin-chart-data-section">
    <SemiButton size="small" theme="borderless" type="tertiary" icon={<IconChevronDown aria-hidden="true"/>}
      aria-label={`查看${label}数据`} aria-expanded={open} onClick={() => setOpen(!open)}>
      {compact ? '查看数据' : `查看${label}数据`}
    </SemiButton>
    {open && <section aria-label={`${label}数据区域`}>
      <Table size="small" pagination={false} rowKey="id" scroll={{ x: 'max(100%, 400px)', y: 320 }}
        columns={headings.map((title, index) => ({ title, key: index, render: (_, row) => row.values[index] }))}
        dataSource={rows.map((values, id) => ({ id, values }))}/>
    </section>}
  </div>;
}

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

export function TimeSeriesChart({ labels, series, unit = '', label, axisUnit, tickScale, height = 250, valueFormatter, type = 'line', stacked = false, domain, tickFormatter, overview = false, className = '', showData = true, compact = false, selectedNames, onSelectNames, onChoose }) {
  const admin = useContext(AdminUIContext);
  const theme = chartTheme(admin);
  const { muted, fontFamily } = theme;
  const [choice, setChoice] = useState(null), [query, setQuery] = useState('');
  const signature = series.map(item => item.label).join('\u0000');
  const selected = selectedNames ?? (choice?.signature === signature ? choice.names : defaultChartSeries(series));
  const legendNames = selectedNames ?? (choice?.signature === signature ? choice.legendNames : selected);
  const choose = (names, legendNames = names) => onSelectNames ? onSelectNames(names) : setChoice({ signature, names, legendNames });
  const seriesColor = item => admin
    ? adminChartColor(!compact && series.length === 1 ? chartPalette[0] : chartColor(item), theme.primary)
    : chartColor(item);
  const visible = series.filter(item => selected.includes(item.label));
  const axis = chartAxis(visible, unit, axisUnit, tickScale);
  const formatter = valueFormatter || chartNumber;
  const matches = series.filter(item => item.label.toLowerCase().includes(query.trim().toLowerCase()));
  const shown = `已展示 ${visible.length} / ${series.length} 条${!onChoose && choice?.signature !== signature && series.length > 8 ? ' · 默认按用量排序' : ''}`;
  const temporal = type !== 'bar' || labels.some(time => /^\d{2}-\d{2}|^\d{2}:\d{2}/.test(time));
  const showAllBarLabels = compact && type === 'bar' && (!onChoose || labels.length <= 8);
  const singleDay = labels.length > 0 && labels.every(time => /^\d{2}-\d{2} \d{2}:\d{2}$/.test(time) && time.slice(0, 5) === labels[0].slice(0, 5));
  const tooltip = items => {
    const time = items[0]?.axisValueLabel || '';
    const interval = compact && /^\d{2}:00$/.test(time) ? `${time}–${String((Number(time.slice(0, 2)) + 1) % 24).padStart(2, '0')}:00` : time;
    const ordered = compact ? type === 'bar' ? items : items.filter(item => item.value !== 0) : [...items].sort((a,b) => (Number.isFinite(b.value) ? b.value : -Infinity) - (Number.isFinite(a.value) ? a.value : -Infinity));
    const scale = compact ? axis.scale : 1;
    const suffix = scale === 1e8 ? ' 亿' : scale === 1e4 ? ' 万' : '';
    const zeros = compact && type !== 'bar' ? items.filter(item => item.value === 0).length : 0;
    return `<div>${safe(interval)}${temporal ? ' · 北京时间' : ''}</div>${ordered.map(item => `<div>${item.marker} ${safe(item.seriesName)}：<b>${safe(formatter(Number.isFinite(item.value) ? item.value / scale : item.value))}${Number.isFinite(item.value) ? `${suffix} ${safe(unit)}` : ''}</b></div>`).join('')}${zeros ? `<div>${zeros === items.length ? '当前' : '另 '}${zeros} 项本时段无用量</div>` : ''}`;
  };
  const option = {
    animation: false,
    ...(admin && { textStyle: { fontFamily } }),
    color: series.map(seriesColor),
    grid: { top: compact ? 34 : 66, left: 8, right: 16, bottom: compact ? 42 : 12, containLabel: true },
    legend: { show: !compact || type !== 'bar' || series.length > 1, type: 'scroll', data: legendNames, top: compact ? undefined : 0, bottom: compact ? 0 : undefined, right: 8, left: 8, selected: Object.fromEntries(series.map(item => [item.label, selected.includes(item.label)])), icon: 'rect', itemWidth: 18, itemHeight: 3, inactiveColor: theme.inactive, pageTextStyle: { color: muted }, tooltip: { show: compact }, textStyle: { color: muted, fontSize: 12, ...(compact ? { width: 160, overflow: 'truncate' } : {}) } },
    tooltip: { trigger: 'axis', confine: true, axisPointer: { type: type === 'bar' ? 'shadow' : 'line', lineStyle: { color: admin ? theme.axis : '#b8c7e8', type: 'dashed' } }, backgroundColor: theme.surface, borderColor: theme.border, extraCssText: `max-height:60vh;overflow-y:auto;border-radius:6px;box-shadow:${admin ? '0 4px 12px rgba(38,50,71,.12)' : '0 4px 16px #17243b12'}`, textStyle: { color: theme.text, fontSize: 12 }, formatter: tooltip },
    xAxis: { type: 'category', data: labels, boundaryGap: type === 'bar', axisTick: { show: false }, axisLine: { lineStyle: { color: theme.axis } }, axisLabel: { color: muted, fontSize: 12, hideOverlap: !showAllBarLabels, formatter: value => singleDay ? value.slice(6) : overview && /^\d{2}-\d{2}$/.test(value) ? value.replace('-', '/') : value, interval: showAllBarLabels ? 0 : labels.length > 16 ? Math.ceil(labels.length / 6) - 1 : 'auto' } },
    yAxis: { type: 'value', min: domain?.[0] ?? 0, max: domain?.[1], minInterval: ['次','人','个','张','个客户'].includes(unit) ? 1 : undefined, splitNumber: 4, name: axis.name, nameTextStyle: { color: muted, fontSize: 12, align: 'left' }, axisLabel: { color: muted, fontSize: 12, formatter: tickFormatter || (value => formatter(value / axis.scale)) }, splitLine: { lineStyle: { color: theme.border, type: 'dashed' } } },
    series: series.map((item, index) => ({ name: item.label, type: type === 'bar' ? 'bar' : 'line', data: item.values, label: type === 'bar' && item.showValues ? { show: true, position: 'top', color: muted, fontSize: 12 } : undefined, smooth: .2, connectNulls: false, showSymbol: Boolean(onChoose) || compact && (labels.length === 1 || item.showPoints === true), symbolSize: compact ? 6 : undefined, stack: stacked && type !== 'line' ? 'total' : undefined, areaStyle: type === 'area' ? { opacity: .12 } : undefined, barMaxWidth: 24, lineStyle: { width: item.total || /^(总|累计)/.test(item.label) ? 2.5 : 2, type: item.dashed ? 'dashed' : admin ? ['solid', 'dashed', 'dotted'][index % 3] : 'solid' }, emphasis: { focus: 'series' } })),
  };
  const chartType = type === 'bar' && stacked ? '堆叠柱状图' : { line: '折线图', bar: series.length > 1 ? '分组柱状图' : '柱状图', area: '面积图' }[type];
  return <div className={`unified-chart ${className}`} role="group" aria-label={`${label}（${chartType}）`}>
    {!compact && series.length > 1 && <div className="unified-chart-tools">{admin
      ? <Typography.Text size="small" type="tertiary">{shown}</Typography.Text>
      : <span>{shown}</span>}{admin ? <SemiPopover trigger="click" position="bottomRight" onVisibleChange={open => { if (open) setQuery(''); }} content={({ initialFocusRef }) =>
      <div ref={initialFocusRef} tabIndex={-1} className="admin-analytics-picker admin-analytics-fields">
        <Typography.Text strong>显示指标／模型</Typography.Text>
        <SemiInput aria-label={`${label}搜索曲线`} placeholder="搜索指标或模型名称" value={query} onChange={setQuery}/>
        <Space>
          <SemiButton size="small" theme="borderless" onClick={() => choose(series.map(item => item.label))}>显示全部</SemiButton>
          <SemiButton size="small" theme="borderless" onClick={() => setChoice(null)}>恢复默认</SemiButton>
        </Space>
        <div className="admin-analytics-options">
          {matches.map(item => <SemiCheckbox key={item.label} aria-label={`显示${item.label}`} checked={selected.includes(item.label)}
            disabled={visible.length === 1 && selected.includes(item.label)}
            onChange={event => choose(event.target.checked ? [...selected, item.label] : selected.filter(name => name !== item.label))}>
            {item.label}
          </SemiCheckbox>)}
          {!matches.length && <Typography.Text type="secondary">无匹配曲线</Typography.Text>}
        </div>
        <Typography.Text size="small" type="tertiary">仅改变图表显示，不影响统计、筛选和导出。</Typography.Text>
      </div>}>
      <SemiButton size="small" theme="borderless" type="tertiary" icon={<IconSetting aria-hidden="true"/>} aria-label={`${label}图表设置`}/>
    </SemiPopover> : <Popover><PopoverTrigger asChild><Button variant="outline" size="icon" aria-label={`${label}图表设置`} title="图表设置" onClick={() => setQuery('')}><SlidersHorizontal size={15}/></Button></PopoverTrigger><PopoverContent align="end" className="unified-chart-picker"><strong>显示指标／模型</strong><Input aria-label={`${label}搜索曲线`} placeholder="搜索指标或模型名称" value={query} onChange={event => setQuery(event.target.value)}/><div className="unified-chart-picker-actions"><Button variant="ghost" size="sm" onClick={() => choose(series.map(item => item.label))}>显示全部</Button><Button variant="ghost" size="sm" onClick={() => setChoice(null)}>恢复默认</Button></div><div className="unified-chart-options">{matches.map(item => <label key={item.label}><Checkbox aria-label={`显示${item.label}`} checked={selected.includes(item.label)} disabled={visible.length === 1 && selected.includes(item.label)} onCheckedChange={checked => choose(checked ? [...selected, item.label] : selected.filter(name => name !== item.label))}/><i style={{ background: seriesColor(item) }}/><span>{item.label}</span></label>)}{!matches.length && <p>无匹配曲线</p>}</div><small>仅改变图表显示，不影响统计、筛选和导出。</small></PopoverContent></Popover>}</div>}
    <Chart option={option} height={height} label={`${label}图表`} onLegend={event => choose(Object.keys(event.selected).filter(name => event.selected[name]), legendNames)}
      onClick={onChoose && (event => { if (event.componentType === 'series') onChoose(event.dataIndex, event.seriesName); })}/>
    {admin && showData && <ChartData compact={compact} label={label} headings={['时间 / 分类', ...visible.map(item => `${item.label}${unit ? `（${unit}）` : ''}`)]} rows={labels.map((time, index) => [time, ...visible.map(item => {
      const value = item.values[index];
      if (!Number.isFinite(value)) return '—';
      return onChoose ? <SemiButton theme="borderless" size="small" aria-label={`查看 ${time} ${item.label} 日志`} onClick={() => onChoose(index, item.label)}>{formatter(value)}</SemiButton> : formatter(value);
    })])}/>}
  </div>;
}

export function HorizontalBarChart({ rows, unit = '', label, height, onChoose, showData = false }) {
  const theme = chartTheme(useContext(AdminUIContext));
  const option = {
    textStyle: { fontFamily: theme.fontFamily },
    animation: false,
    grid: { top: 12, left: 8, right: 88, bottom: 28, containLabel: true },
    tooltip: { trigger: 'axis', confine: true, backgroundColor: theme.surface, borderColor: theme.border, textStyle: { color: theme.text, fontSize: 12 }, axisPointer: { type: 'shadow' }, formatter: items => `${safe(rows[items[0]?.dataIndex]?.name)}<br/>${safe(label)}：<b>${chartNumber(rows[items[0]?.dataIndex]?.value)} ${safe(unit)}</b>` },
    xAxis: { type: 'value', min: unit === '%' ? 0 : undefined, max: unit === '%' ? 100 : undefined, name: unit, nameTextStyle: { color: theme.muted, fontSize: 12 }, axisLabel: { color: theme.muted, fontSize: 12, formatter: chartNumber }, splitLine: { lineStyle: { color: theme.border, type: 'dashed' } } },
    yAxis: { type: 'category', inverse: true, data: rows.map(row=>row.name), axisLine: { show: false }, axisTick: { show: false }, axisLabel: { color: theme.muted, fontSize: 12, width: 150, overflow: 'truncate' } },
    series: [{ type: 'bar', barMaxWidth: 18, data: rows.map(row=>({ value: row.value, itemStyle: { color: row.value < 0 ? theme.danger : theme.primary }, label: { position: row.value < 0 ? 'left' : 'right' } })), label: { show: true, distance: 6, color: theme.text, fontSize: 12, formatter: item=>unit === '%' ? Number(item.value).toFixed(2)+'%' : chartNumber(item.value) } }],
  };
  return <>
    <Chart option={option} height={height || Math.max(220,rows.length*32+60)} label={`${label}（横向条形图）：${rows.map(row=>`${row.name} ${chartNumber(row.value)} ${unit}`).join('；')}`} onClick={event=>{if(rows[event.dataIndex])onChoose?.(rows[event.dataIndex].id);}}/>
    {showData && <ChartData compact label={label} headings={['分类', unit || '数值']} rows={rows.map(row => [
      onChoose ? <SemiButton theme="borderless" size="small" onClick={() => onChoose(row.id)} aria-label={`查看 ${row.name} 日志`}>{row.name}</SemiButton> : row.name,
      chartNumber(row.value),
    ])}/>}
  </>;
}

export function RankingChart({ rows, metric, unit, collection, scale, onChoose, label = '用量排行', showData = true }) {
  const admin = useContext(AdminUIContext);
  const theme = chartTheme(admin);
  const names = rows.map(row => collection.find(item => item.id === row.id)?.name || row.id);
  const option = {
    animation: false,
    ...(admin && { textStyle: { fontFamily: theme.fontFamily } }),
    grid: { top: 6, left: 126, right: 88, bottom: 4 },
    tooltip: { trigger: 'axis', confine: true, backgroundColor: theme.surface, borderColor: theme.border, textStyle: { color: theme.text, fontSize: 12 }, axisPointer: { type: 'shadow' }, formatter: items => `${safe(items[0]?.axisValueLabel)}<br/>${metric === 'calls' ? '调用次数' : safe(unit)}：<b>${chartNumber(rows[items[0]?.dataIndex]?.[metric])}</b>` },
    xAxis: { type: 'value', show: false },
    yAxis: { type: 'category', data: names.map((name, index) => `${index + 1}  ${name}`), inverse: true, axisLine: { show: false }, axisTick: { show: false }, axisLabel: { color: theme.muted, fontSize: 12, width: 116, overflow: 'truncate', margin: 10 } },
    series: [{ type: 'bar', data: rows.map(row => scale === 'log' ? Math.log10(row[metric] + 1) : row[metric]), barWidth: 10, showBackground: true, backgroundStyle: { color: theme.fill, borderRadius: 2 }, itemStyle: { color: theme.primary, borderRadius: 2 }, label: { show: true, position: 'right', distance: 8, color: theme.barText, fontSize: 12, formatter: ({ dataIndex }) => { const value = rows[dataIndex][metric]; return value >= 1e8 ? `${chartNumber(value / 1e8)}亿` : value >= 1e4 ? `${chartNumber(value / 1e4)}万` : chartNumber(value); } } }],
  };
  return <>
    <Chart option={option} height={Math.max(140, rows.length * 28 + 20)} label={`${label}，显示 ${rows.length} 个对象，点击条形查看明细`}
      onClick={event => { if (rows[event.dataIndex]) onChoose(rows[event.dataIndex].id); }}/>
    {admin && showData && <ChartData label={label} compact headings={['对象', `${metric === 'calls' ? '调用次数' : '用量'}（${unit || '次'}）`]}
      rows={rows.map((row, index) => [
        <div className="admin-table-record">
          <SemiButton size="small" theme="borderless" onClick={() => onChoose(row.id)}>{names[index]}</SemiButton>
        </div>, chartNumber(row[metric]),
      ])}/>}
  </>;
}

export function DonutChart({ rows, unit = '', label, height = 200, centerValue, centerLabel, showData = true, onChoose }) {
  const admin = useContext(AdminUIContext);
  const theme = chartTheme(admin);
  const total = rows.reduce((sum, row) => sum + row.value, 0);
  const option = {
    animation: false,
    ...(admin && { textStyle: { fontFamily: theme.fontFamily } }),
    tooltip: { trigger: 'item', confine: true, backgroundColor: theme.surface, borderColor: theme.border, textStyle: { color: theme.text, fontSize: 12 }, formatter: item => `${safe(item.name)}：<b>${chartNumber(item.value)} ${safe(unit)}</b><br/>占比 ${total ? (item.value / total * 100).toFixed(1) + '%' : '—'}` },
    series: [{ type: 'pie', radius: ['64%', '84%'], center: ['50%', '50%'], startAngle: 90, padAngle: 3, stillShowZeroSum: false,
      label: { show: false }, labelLine: { show: false },
      itemStyle: { borderRadius: 7 }, emphasis: { scaleSize: 5 },
      data: rows.map((row, index) => {
        const color = row.color || chartPalette[index % chartPalette.length];
        return { name: row.label, value: row.value, itemStyle: { color: admin ? adminChartColor(color, theme.primary) : color } };
      }) }],
  };
  return <><div className="unified-donut" style={{ position: 'relative' }}>
    <Chart option={option} height={height} label={`${label}：${rows.map(row => `${row.label} ${chartNumber(row.value)} ${unit}，占比 ${total ? (row.value / total * 100).toFixed(1) + '%' : '—'}`).join('；')}`} onClick={onChoose ? event=>{if(rows[event.dataIndex])onChoose(rows[event.dataIndex].id);} : undefined}/>
    <div className="unified-donut-center" style={{ position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', pointerEvents: 'none', gap: 4 }}>
      {admin ? <>
        <Typography.Title heading={3} component="span">{centerValue}</Typography.Title>
        <Typography.Text size="small" type="tertiary">{centerLabel}</Typography.Text>
      </> : <>
        <strong style={{ fontSize: 20, fontWeight: 650, color: '#202b3e' }}>{centerValue}</strong>
        <span style={{ fontSize: 12, color: theme.muted }}>{centerLabel}</span>
      </>}
    </div>
  </div>{admin && showData && <ChartData label={label} headings={['分类', `用量${unit ? `（${unit}）` : ''}`, '占比']} rows={rows.map(row => [row.label, chartNumber(row.value), total ? `${(row.value / total * 100).toFixed(1)}%` : '—'])}/>}</>;
}

export function CoverageHeatmap({ labels, rows, label, onChoose }) {
  const theme = chartTheme(useContext(AdminUIContext));
  const max=Math.max(1,...rows.flatMap(row=>row.values.filter(Number.isFinite)));
  const data=rows.flatMap((row,y)=>row.values.map((value,x)=>({value:[x,y,value ?? -1],label:{color:value>max*.94?'#fff':theme.text},...(value==null?{itemStyle:{color:theme.border}}:{})})));
  const option={
    textStyle: { fontFamily: theme.fontFamily },
    animation:false,
    grid:{top:12,left:8,right:16,bottom:64,containLabel:true},
    xAxis:{type:'category',data:labels,splitArea:{show:false},axisLine:{show:false},axisTick:{show:false},axisLabel:{color:theme.muted,fontSize:12,interval:'auto'}},
    yAxis:{type:'category',inverse:true,data:rows.map(row=>row.name),axisLine:{show:false},axisTick:{show:false},axisLabel:{color:theme.muted,fontSize:12,width:150,overflow:'truncate'}},
    visualMap:{type:'continuous',min:0,max,dimension:2,orient:'horizontal',left:'center',bottom:0,itemWidth:10,itemHeight:120,text:[`${chartNumber(max)} 个客户`,'0'],textStyle:{color:theme.muted,fontSize:12},inRange:{color:[theme.fill,theme.tint,theme.primary]},outOfRange:{color:theme.border}},
    tooltip:{trigger:'item',confine:true,backgroundColor:theme.surface,borderColor:theme.border,textStyle:{color:theme.text,fontSize:12},formatter:item=>{const [x,y,value]=item.value;return `${safe(rows[y].name)} · ${safe(labels[x])} · 北京时间<br/>去重客户：<b>${value<0?'待确认':chartNumber(value)+' 个'}</b>`;}},
    series:[{type:'heatmap',data,itemStyle:{borderWidth:2,borderColor:theme.surface},label:{show:labels.length<=10,color:theme.text,fontSize:12,formatter:item=>item.value[2]<0?'—':chartNumber(item.value[2])},emphasis:{itemStyle:{borderColor:theme.text,borderWidth:2}}}],
  };
  return <Chart option={option} height={Math.max(220,rows.length*36+100)} label={`${label}（热力图）：${rows.map(row=>`${row.name}：${labels.map((day,index)=>`${day} ${row.values[index]==null?'待确认':row.values[index]+' 个客户'}`).join('，')}`).join('；')}`} onClick={event=>{const [x,y]=event.value || [];if(rows[y])onChoose?.(rows[y].id,x);}}/>;
}

export function MarginWaterfall({ data, label }) {
  const theme = chartTheme(useContext(AdminUIContext));
  const {steps,currency}=data;
  const amount=value=>Number(value).toLocaleString('zh-CN',{minimumFractionDigits:2,maximumFractionDigits:6});
  const option={
    textStyle: { fontFamily: theme.fontFamily },
    animation:false,
    grid:{top:42,left:8,right:30,bottom:12,containLabel:true},
    xAxis:{type:'category',data:steps.map(row=>row.name),axisLine:{lineStyle:{color:theme.border}},axisTick:{show:false},axisLabel:{color:theme.muted,fontSize:12}},
    yAxis:{type:'value',boundaryGap:['20%','20%'],name:currency,nameTextStyle:{color:theme.muted,fontSize:12},axisLabel:{color:theme.muted,fontSize:12,formatter:chartNumber},splitLine:{lineStyle:{color:theme.border,type:'dashed'}}},
    tooltip:{trigger:'axis',confine:true,backgroundColor:theme.surface,borderColor:theme.border,textStyle:{color:theme.text,fontSize:12},formatter:items=>{const row=steps[items[0]?.dataIndex];return row?`${safe(row.name)}：<b>${amount(row.amount)} ${safe(currency)}</b>`:'';}},
    series:[{type:'bar',stack:'margin',stackStrategy:'all',silent:true,itemStyle:{color:'transparent'},emphasis:{itemStyle:{color:'transparent'}},data:steps.map(row=>row.base)},{type:'bar',stack:'margin',stackStrategy:'all',barMaxWidth:88,markLine:{silent:true,symbol:'none',label:{show:false},lineStyle:{color:theme.muted,type:'dashed'},data:[[{coord:[0,steps[0].amount]},{coord:[1,steps[0].amount]}],[{coord:[1,steps[2].amount]},{coord:[2,steps[2].amount]}]]},data:steps.map((row,index)=>({value:row.value,itemStyle:{color:index===1 || row.amount<0?theme.danger:index===0?theme.primary:theme.success},label:{position:row.amount<0&&index!==1?'bottom':'top'}})),label:{show:true,color:theme.text,fontSize:12,formatter:item=>amount(steps[item.dataIndex].amount)}}],
  };
  return <Chart option={option} height={320} label={`${label}（瀑布图）：${steps.map(row=>`${row.name} ${amount(row.amount)} ${currency}`).join('；')}`}/>;
}
