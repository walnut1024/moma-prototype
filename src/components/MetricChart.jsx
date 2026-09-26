import { Area, AreaChart, Bar, BarChart, CartesianGrid, XAxis, YAxis } from 'recharts';
import { ChartContainer, ChartLegend, ChartLegendContent, ChartTooltip, ChartTooltipContent } from './ui/chart';

const colors = ['#3568f9', '#13aaa7', '#9270ff', '#f59e0b', '#ef5da8', '#06b6d4', '#f97316', '#64748b'];
const short = value => Math.abs(value) >= 1e6 ? `${Number((value / 1e6).toFixed(1))} M` : Math.abs(value) >= 1e3 ? `${Number((value / 1e3).toFixed(1))} K` : Number(value.toFixed(2));

// Shared shadcn chart surface for tenant and both management consoles.
export default function MetricChart({ labels, series, type = 'line', height = 260, unit = '', axisUnit, label = '用量趋势', className = '', overview = false, stacked = false, domain, tickFormatter }) {
  const config = Object.fromEntries(series.map((item, i) => [`s${i}`, { label: item.label, color: item.color || colors[i % colors.length] }]));
  const data = labels.map((time, index) => Object.fromEntries([['time', time], ...series.map((item, i) => [`s${i}`, item.values[index] ?? null])]));
  const Plot = type === 'bar' ? BarChart : AreaChart;
  const Mark = type === 'bar' ? Bar : Area;
  const million = overview && unit === 'Token' && series.some(item => item.values.some(value => value >= 1e6));
  const multipleDays = labels.length > 0 && labels[0].slice(0, 5) !== labels.at(-1).slice(0, 5);
  const ticks = overview && multipleDays ? [...new Set(labels.map((time, i) => i === 0 || time.slice(0, 5) !== labels[i - 1].slice(0, 5) ? time : null).filter(Boolean))] : undefined;
  return <div className={className} role="group" aria-label={`${label}（${{ line: '折线图', bar: '柱状图', area: '面积图' }[type]}）`} style={{ minWidth: 0 }}>
    <div className="px-2 text-xs text-muted-foreground">{axisUnit || (million ? 'M Token' : unit)}</div>
    <ChartContainer config={config} className="w-full aspect-auto" style={{ height }}>
      <Plot accessibilityLayer data={data} margin={{ top: 8, right: 14, left: 6, bottom: 2 }}>
        <CartesianGrid vertical={overview} strokeDasharray={overview ? undefined : "3 3"} />
        <XAxis dataKey="time" tickLine={false} axisLine={false} minTickGap={45} interval="preserveStartEnd" tickMargin={10} ticks={ticks} tickFormatter={value => overview ? multipleDays ? value.slice(0, 5).replace('-', '/') : value.slice(6) : value} tick={{ fontSize: overview ? 12 : 11 }} />
        <YAxis tickLine={false} axisLine={false} width={50} domain={domain} tickFormatter={tickFormatter || (unit === '百万 Token' ? value => Number(value.toFixed(6)) : million ? value => Number((value / 1e6).toFixed(1)) : short)} tick={{ fontSize: 11 }} />
        <ChartTooltip content={<ChartTooltipContent formatter={(value, name) => <><span className="text-muted-foreground">{name}</span><strong className="ml-auto font-mono">{Number(value).toLocaleString('zh-CN', { maximumFractionDigits: unit === '百万 Token' ? 6 : 2 })} {unit}</strong></>} />} />
        <ChartLegend itemSorter={null} content={<ChartLegendContent className="flex-wrap" />} />
        {series.map((item, i) => <Mark key={`s${i}`} dataKey={`s${i}`} name={item.label} type="monotone" stackId={stacked && type !== 'line' ? 'total' : undefined} stroke={`var(--color-s${i})`} fill={`var(--color-s${i})`} fillOpacity={type === 'bar' ? 1 : type === 'area' ? .18 : 0} strokeWidth={2} {...(type === 'bar' ? { maxBarSize: 24 } : { dot: false, connectNulls: false })} strokeDasharray={item.dashed && type === 'line' ? '5 4' : undefined} isAnimationActive={false} />)}
      </Plot>
    </ChartContainer>
  </div>;
}
