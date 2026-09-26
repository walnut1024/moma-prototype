import { useEffect, useMemo, useState } from 'react';
import { AreaChart, ArrowUp, BarChart3, CalendarDays, ChevronDown, ChevronLeft, ChevronRight, Download, Info, LineChart, RefreshCw } from 'lucide-react';
import { Button } from './ui/button';
import { Input } from './ui/input';
import { Select, SelectContent, SelectGroup, SelectItem, SelectTrigger, SelectValue } from './ui/select';
import { Tabs, TabsContent, TabsList, TabsTrigger } from './ui/tabs';
import { ToggleGroup, ToggleGroupItem } from './ui/toggle-group';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from './ui/tooltip';
import { Popover, PopoverContent, PopoverTrigger } from './ui/popover';
import { Progress } from './ui/progress';
import MetricChart from './MetricChart';
import { MultiPick } from '../admin-v2/AnalyticsFilters';
import { TrendChart } from '../admin-v2/UsageECharts';
import { bucketLabel, dateRange, fields, usageCSV, usageKeys, usageModels, usageModelGroups, usageNumber, observationData, observationView, selectedMeteringView, selectedUsageData, selectedUsageTypes, usagePeriod } from '../usage-data.mjs';
import './usage-statistics.css';
import { apiKeyOptions, maskApiKey } from '../api-key-data.mjs';

function Choice({ label, value, onChange, options }) {
  return <Select value={value} onValueChange={onChange}><SelectTrigger aria-label={label}><SelectValue /></SelectTrigger><SelectContent><SelectGroup>{options.map(([id, text]) => <SelectItem key={id} value={id}>{text}</SelectItem>)}</SelectGroup></SelectContent></Select>;
}
function Hint({ label, children }) {
  return <Tooltip><TooltipTrigger asChild><Button variant="ghost" size="icon-sm" aria-label={`${label}说明`} className="us-info"><Info /></Button></TooltipTrigger><TooltipContent className="max-w-72">{children}</TooltipContent></Tooltip>;
}
const languageChartHints = {
  '总 Token 数': '输入 Token 数 + 输出 Token 数；读缓存命中已包含在输入 Token 中，不重复相加。',
  '输入 Token 数': '请求（Prompt）部分消耗的 Token 数量，包含读缓存命中的 Token。',
  '输出 Token 数': '模型响应（Completion）部分消耗的 Token 数量。',
  '每分钟总 Token 数（TPM）': '每分钟输入 Token 数 + 每分钟输出 Token 数。',
  '每分钟输入 Token 数（TPM）': '每分钟输入侧的 Token 吞吐量（tokens/min）。',
  '每分钟输出 Token 数（TPM）': '每分钟输出侧的 Token 吞吐量（tokens/min）。',
  '每分钟读缓存 Token 数': '单位时间内命中缓存的 Token 数，包含隐式与显式缓存；已计入输入 Token。',
  '每分钟写入缓存 Token 数': '单位时间内创建缓存的 Token 数；本页仅统计已记录的显式缓存写入，部分模型支持。',
  '读缓存总 Token 数': '所选区间内命中缓存的总 Token 数，包含隐式与显式缓存；已计入输入 Token。',
  '写入缓存总 Token 数': '所选区间内创建显式缓存的总 Token 数，仅特定模型支持，具体以模型计量说明为准。',
  '每分钟读显式缓存 Token 数': '每分钟命中显式缓存的 Token 数，仅特定模型支持。',
  '区间内命中显式缓存总 Token 数': '所选区间内命中显式缓存的总 Token 数，仅特定模型支持。',
  '平均输入 Token（TPR）': 'TPR 指 Tokens Per Request（每请求 Token 数）。每请求输入 Token 的平均值＝输入 Token 总数 ÷ 有输入计量的请求数。',
  '平均输出 Token（TPR）': 'TPR 指 Tokens Per Request（每请求 Token 数）。每请求输出 Token 的平均值＝输出 Token 总数 ÷ 有输出计量的请求数。',
};
function Trend({ id, title, keys: defaultKeys, options = {}, data, scaled = false, language = false }) {
  const [chartType, setChartType] = useState(options.defaultType || 'line');
  const [variant, setVariant] = useState(Object.keys(options.variants || {})[0]);
  const keys = options.variants?.[variant] || defaultKeys;
  const series = title === '模型请求次数趋势'
    ? Object.keys(data.summary.modelRequests || {}).map(name => ({ label: name, values: data.buckets.map(row => row.modelRequests?.[name] || 0) }))
    : keys.map(key => ({ label: fields[key][0], values: data.buckets.map(row => row[key]), dashed: key === 'cache', color: key === 'failure' ? '#ef6464' : undefined }));
  const unit = fields[keys[0]][1];
  const max = Math.max(0, ...series.flatMap(item => item.values.filter(Number.isFinite)));
  const scale = scaled && ['Token', 'Token/分钟'].includes(unit) ? max >= 1e8 ? 1e8 : max >= 1e4 ? 1e4 : 1 : 1;
  const axisUnit = scale > 1 ? `${scale === 1e8 ? '亿' : '万'} Tokens${unit === 'Token/分钟' ? '/分钟' : ''}` : undefined;
  return <section id={id} className="us-chart">
    <div className="us-chart-head"><h3>{title}<Hint label={title}>{language && languageChartHints[title] ? <p>{languageChartHints[title]}</p> : keys.map(key => <p key={key}>{fields[key][0]}：{fields[key][2]}</p>)}{scaled && unit === 'Token/分钟' && <p>图表各点为当前时间桶的每分钟平均量，不是单个自然分钟峰值。</p>}{scaled && ['读缓存总 Token 数', '写入缓存总 Token 数', '区间内命中显式缓存总 Token 数'].includes(title) && <p>图表按时间桶展示；所选区间总量为各点之和。</p>}</Hint></h3>
      <div className="us-chart-tools">{options.variants && <Choice label={`${title}指标`} value={variant} onChange={setVariant} options={Object.keys(options.variants).map(key => [key, key])} />}
        <ToggleGroup type="single" value={chartType} onValueChange={value => value && setChartType(value)} variant="outline" size="sm" aria-label={`${title}图表类型`}>
          {[['line', '折线图', LineChart], ['bar', '柱状图', BarChart3], ['area', '面积图', AreaChart]].map(([value, label, Icon]) => <Tooltip key={value}><TooltipTrigger asChild><ToggleGroupItem value={value} aria-label={label}><Icon /></ToggleGroupItem></TooltipTrigger><TooltipContent>{label}</TooltipContent></Tooltip>)}
        </ToggleGroup>
      </div>
    </div>
    {data.summary.requests ? scaled ? <TrendChart labels={data.buckets.map(row => bucketLabel(row.time))} series={series} type={chartType} stacked={options.stacked} unit={unit} axisUnit={axisUnit || unit} tickScale={scale} label={title} /> : <MetricChart labels={data.buckets.map(row => bucketLabel(row.time))} series={series} type={chartType} stacked={options.stacked} domain={unit === '%' ? [0, Math.min(100, Math.max(1, Math.ceil(Math.max(...data.buckets.flatMap(row => keys.map(key => row[key] ?? 0))) * 1.2)))] : undefined} unit={unit} label={title} height={250} overview /> : <div className="us-empty">暂无用量数据</div>}
  </section>;
}
function ChartNavigation({ charts, type }) {
  const [open, setOpen] = useState(true);
  const [active, setActive] = useState(0);
  useEffect(() => {
    const update = () => {
      const sections = charts.map((_, index) => document.getElementById(`usage-chart-${index}`));
      const index = Math.max(0, sections.findLastIndex(section => section?.getBoundingClientRect().top <= 190));
      setActive(previous => Math.floor(previous / 2) === Math.floor(index / 2) ? previous : index);
    };
    update();
    window.addEventListener('scroll', update, { passive: true });
    return () => window.removeEventListener('scroll', update);
  }, [type]);
  return <aside className={`us-chart-nav${open ? '' : ' is-collapsed'}`} aria-label="图表导航">
    <div className="us-chart-nav-head"><strong>{open && '图表导航'}</strong><Button variant="ghost" size="icon" aria-label={open ? '收起图表导航' : '展开图表导航'} aria-expanded={open} onClick={() => setOpen(value => !value)}>{open ? <ChevronRight size={16} /> : <ChevronLeft size={16} />}</Button></div>
    {open && <><nav>{charts.map(([title], index) => <button key={title} type="button" className={active === index ? 'active' : ''} aria-current={active === index ? 'location' : undefined} onClick={() => { setActive(index); document.getElementById(`usage-chart-${index}`)?.scrollIntoView({ behavior: 'smooth', block: 'start' }); }}>{title}</button>)}</nav><button type="button" className="us-back-top" onClick={() => window.scrollTo({ top: 0, behavior: 'smooth' })}><ArrowUp size={14} />回到顶部</button></>}
  </aside>;
}
function Metrics({ title, keys, summary }) {
  return <div className="us-summary-section"><h3>{title}</h3><div className="us-metrics" style={{ '--metric-count': keys.length }}>{keys.map(key => <div className="us-metric" key={key}><span>{fields[key][0]}<Hint label={fields[key][0]}>{fields[key][2]}</Hint></span><strong>{usageNumber(summary[key])}<small>{fields[key][1] === 'Token' || summary[key] == null ? '' : ` ${fields[key][1]}`}</small></strong></div>)}</div></div>;
}
function OverviewGroup({ label, hint, value, unit, details }) {
  return <div className="us-overview-group"><span>{label}<Hint label={label}>{hint}</Hint></span><strong>{usageNumber(value)}{unit && value != null && <small> {unit}</small>}</strong>{details?.length > 0 && <div className="us-overview-details">{details.map(([name, amount]) => <span key={name}>{name} <b>{usageNumber(amount)}</b></span>)}</div>}</div>;
}
function UsageOverview({ summary, view, days }) {
  const tokenSupported = view.charts.some(([, keys]) => keys.some(key => ['total', 'input', 'tpm'].includes(key)));
  const tokenTotal = tokenSupported ? summary.total ?? 0 : null;
  const groups = [
    { label: 'Token调用总量', hint: '所选时段已计量的 Token 总量；张、秒、字符等其他单位不计入。', value: tokenTotal, unit: 'Token' },
    { label: '模型调用次数', hint: '所选时段的模型请求数，包含成功与失败请求。', value: summary.requests, unit: '次' },
    { label: '日均Token调用量', hint: 'TPD 全称 Token Per Day（每日 Token 数）。Token 调用总量除以所选北京时间自然日数，含无调用日；今日按 1 日计算。', value: tokenTotal === null ? null : tokenTotal / days, unit: 'TPD' },
    { label: 'TPM峰值', hint: 'TPM 全称 Tokens Per Minute（每分钟 Token 数）。按请求发生的自然分钟汇总 Token，取区间内最大值；不使用图表的小时或日采样值。', value: tokenTotal === null ? null : summary.peakTpm, unit: 'TPM' },
    { label: 'TPM均值', hint: 'TPM 全称 Tokens Per Minute（每分钟 Token 数）。Token 调用总量除以已观测分钟数，包含无调用分钟。', value: tokenTotal === null ? null : summary.tpm ?? 0, unit: 'TPM' },
  ];
  return <><div className="us-overview-groups" style={{ '--overview-count': groups.length }}>{groups.map(group => <OverviewGroup key={group.label} {...group} />)}</div>{view.nonTokenSummary?.length > 0 && <Metrics title="其他计量" keys={view.nonTokenSummary} summary={summary} />}</>;
}
export default function UsageStatistics({ observation = false }) {
  const [billing, setBilling] = useState(observation ? '全部' : '按量付费');
  const [category, setCategory] = useState(observation ? '文本模型' : '语言模型');
  const [visual, setVisual] = useState('视觉理解'), [audio, setAudio] = useState('语音合成');
  const type = category === '视觉模型' ? visual : category === '音频模型' ? audio : category;
  const [modelIds, setModelIds] = useState(null);
  const [apiKeyId, setApiKeyId] = useState(null);
  const [keySearch, setKeySearch] = useState('');
  const [keyPickerOpen, setKeyPickerOpen] = useState(false);
  const keyOptions = apiKeyOptions(billing);
  const selectedKey = keyOptions.find(key => key.id === apiKeyId);
  const groups = useMemo(() => [category], [category]);
  const selectedTypes = selectedUsageTypes(groups, modelIds);
  const modelOptions = usageModelGroups.filter(group => group.id === category).flatMap(group => group.types.flatMap(type => usageModels[type].map(id => ({ id, name: id }))));
  const [now, setNow] = useState(() => new Date());
  const [autoRefresh, setAutoRefresh] = useState(0);
  const [range, setRange] = useState(() => observation ? dateRange(3) : usagePeriod('today'));
  const [preset, setPreset] = useState(observation ? '3' : 'today'), [minutes, setMinutes] = useState('60');
  const [dimension, setDimension] = useState('Model ID'), [targets, setTargets] = useState([]), [query, setQuery] = useState('');
  const [notice, setNotice] = useState('');
  const options = dimension === 'Model ID' ? usageModels[type] : (billing === '全部' ? ['按量付费', 'Token Plan'].flatMap(usageKeys) : usageKeys(billing));
  const streaming = observation && ['文本模型', '视觉理解'].includes(type);
  const view = observation ? { ...observationView, charts: [...observationView.charts, ...(streaming ? [['首 Token 时延', ['ttft']], ['输出吞吐', ['outputSecond']]] : [])] } : selectedMeteringView(selectedTypes);
  const rangeDays = (Date.parse(range.end) - Date.parse(range.start)) / 86400000 + 1;
  const error = !Number.isFinite(rangeDays) || rangeDays < 1 ? '请选择有效的起止日期。' : rangeDays > 31 ? '单次最多查看 31 天，请缩小日期范围。' : !observation && !selectedTypes.length ? '请选择至少一个模型 ID。' : '';
  const bucketMinutes = observation ? Number(minutes) : rangeDays > 2 ? 1440 : 60;
  const data = useMemo(() => observation ? observationData({ billing, type, dimension, targets, ...range, minutes: bucketMinutes, now }) : selectedUsageData({ billing, groups, modelIds, apiKeyId, ...range, minutes: bucketMinutes, now }), [observation, billing, type, dimension, targets, groups, modelIds, apiKeyId, range, bucketMinutes, now]);
  const changeType = (value, setter) => { setter(value); setTargets([]); setQuery(''); };
  function exportData() {
    const label = observation ? type : category;
    const url = URL.createObjectURL(new Blob([usageCSV(data, view, billing, label)], { type: 'text/csv;charset=utf-8' }));
    const link = document.createElement('a'); link.href = url; link.download = `${billing}-${label}-${range.start}-${range.end}.csv`; link.click(); setTimeout(() => URL.revokeObjectURL(url), 1000); setNotice('已导出当前筛选范围的用量趋势');
  }
  const changeBilling = value => { setBilling(value); setApiKeyId(null); setKeySearch(''); if (dimension === 'API Key') setTargets([]); setQuery(''); };
  const refreshUsage = automatic => {
    const next = new Date();
    setNow(next);
    if (preset !== 'custom') setRange(observation ? dateRange(Number(preset), next) : usagePeriod(preset, next));
    setNotice(automatic ? '用量已自动刷新' : '用量已刷新');
  };
  useEffect(() => {
    if (!autoRefresh) return;
    const timer = window.setInterval(() => refreshUsage(true), autoRefresh * 1000);
    return () => window.clearInterval(timer);
  }, [autoRefresh, now, preset, observation]);
  const refreshTime = value => value.toLocaleTimeString('zh-CN', { timeZone: 'Asia/Shanghai', hour12: false });
  const autoLabel = { 30: '30 秒', 60: '1 分钟', 300: '5 分钟' }[autoRefresh];
  const datePicker = <Popover><PopoverTrigger asChild><Button variant="outline" className="us-date-trigger" aria-label={observation ? '选择日期范围' : '自定义时间范围'}><CalendarDays />{!observation && '自定义 · '}{range.start.replaceAll('-', '/')}<span>—</span>{range.end.replaceAll('-', '/')}</Button></PopoverTrigger><PopoverContent className="us-date-popover" align="start"><p>日期范围 · 北京时间</p><div className="us-dates"><Input type="date" aria-label="开始日期" value={range.start} max={dateRange(1, now).end} onChange={e => { setRange({ ...range, start: e.target.value }); setPreset('custom'); }} /><span>—</span><Input type="date" aria-label="结束日期" value={range.end} max={dateRange(1, now).end} onChange={e => { setRange({ ...range, end: e.target.value }); setPreset('custom'); }} /></div></PopoverContent></Popover>;
  return <TooltipProvider><div className={observation ? "us-page us-observation" : "us-page us-metering"}><div className="us-title"><div><h1>{observation ? "调用观测" : "用量统计"}</h1><p>{observation ? "查看调用成功率、响应时延与运行趋势" : "查看不同计费方式下的实际模型用量"}</p></div></div>
    <Tabs value={category} onValueChange={value => { if (observation) changeType(value, setCategory); else { setCategory(value); setModelIds(null); } }}><TabsList variant="line" className="us-tabs">{(observation ? ['文本模型', '多模态模型', '视觉模型', '音频模型', '向量模型', '重排模型'] : usageModelGroups.map(group => group.id)).map(item => <TabsTrigger key={item} value={item}>{item}</TabsTrigger>)}</TabsList>
    <TabsContent value={category} className="us-content">
      <div className="us-filters">
        {observation && category === '视觉模型' && <Choice label="视觉任务类型" value={visual} onChange={value => changeType(value, setVisual)} options={['视觉理解', '图片生成', '视频生成'].map(x => [x, x])} />}
        {observation && category === '音频模型' && <Choice label="音频任务类型" value={audio} onChange={value => changeType(value, setAudio)} options={['语音合成', '语音识别'].map(x => [x, x])} />}
        {observation ? <div className="us-model-filter"><Choice label="筛选维度" value={dimension} onChange={value => changeType(value, setDimension)} options={[["Model ID", "模型"], ["API Key", "API Key"]]} />
        <Popover><PopoverTrigger asChild><Button variant="outline" className="us-target">{targets.length ? `已选 ${targets.length} 项` : dimension === 'Model ID' ? '全部模型' : '全部 API Key'}<ChevronDown data-icon="inline-end" /></Button></PopoverTrigger><PopoverContent className="us-picker" align="start"><Input aria-label="搜索筛选项" placeholder="搜索名称" value={query} onChange={e => setQuery(e.target.value)} /><ToggleGroup type="multiple" value={targets} onValueChange={setTargets} orientation="vertical" className="us-options">{options.filter(x => x.toLowerCase().includes(query.toLowerCase())).map(item => <ToggleGroupItem key={item} value={item}>{item}</ToggleGroupItem>)}</ToggleGroup>{!options.some(x => x.toLowerCase().includes(query.toLowerCase())) && <p>无匹配结果</p>}<Button variant="ghost" onClick={() => setTargets([])}>清空选择 · 查看全部</Button></PopoverContent></Popover></div> : <>
          <ToggleGroup type="single" value={preset} onValueChange={value => { if (value) { setPreset(value); setRange(usagePeriod(value, now)); } }} variant="outline" size="sm" className="us-segmented" aria-label="时间筛选">{[['today', '今日'], ['yesterday', '昨日'], ['7d', '近 7 天'], ['30d', '近 30 天']].map(([value, label]) => <ToggleGroupItem key={value} value={value}>{label}</ToggleGroupItem>)}</ToggleGroup>
          {datePicker}
          <div className="us-filter-multi"><span>模型 ID</span><MultiPick key={category} label="模型 ID" value={modelIds} onChange={setModelIds} items={modelOptions} searchPlaceholder="搜索模型，如 DeepSeek-V4-Pro" /></div>
          <div className="us-filter-multi"><span>API Key</span><Popover open={keyPickerOpen} onOpenChange={setKeyPickerOpen}><PopoverTrigger asChild><Button variant="outline" aria-label="API Key 筛选" title={selectedKey?.id}>{selectedKey ? `${maskApiKey(selectedKey.key)} (${selectedKey.name})` : '全部 Key'}<ChevronDown size={14}/></Button></PopoverTrigger><PopoverContent align="start" className="us-key-picker"><Input aria-label="搜索 API Key" placeholder="搜索 API Key 名称或 Track ID" value={keySearch} onChange={e => setKeySearch(e.target.value)}/><div role="listbox" aria-label="API Key 选项"><button role="option" aria-selected={apiKeyId === null} onClick={() => { setApiKeyId(null); setKeyPickerOpen(false); }}>全部 Key</button>{keyOptions.filter(key => `${key.name} ${key.id}`.toLowerCase().includes(keySearch.trim().toLowerCase())).map(key => <Tooltip key={key.id}><TooltipTrigger asChild><button role="option" aria-selected={apiKeyId === key.id} onClick={() => { setApiKeyId(key.id); setKeyPickerOpen(false); }}>{maskApiKey(key.key)} ({key.name})<small>{key.id}</small></button></TooltipTrigger><TooltipContent>{key.id}</TooltipContent></Tooltip>)}{!keyOptions.some(key => `${key.name} ${key.id}`.toLowerCase().includes(keySearch.trim().toLowerCase())) && <p>无匹配的 API Key</p>}</div></PopoverContent></Popover></div>
          <div className="us-filter-billing"><span>数据范围</span><ToggleGroup type="single" value={billing} onValueChange={value => value && changeBilling(value)} variant="outline" size="sm" className="us-segmented" aria-label="数据范围">{['按量付费', 'Token Plan'].map(value => <ToggleGroupItem key={value} value={value}>{value}</ToggleGroupItem>)}</ToggleGroup></div>
        </>}
        {observation && <><Choice label="快捷时间" value={preset} onChange={value => { setPreset(value); if (value !== 'custom') setRange(dateRange(Number(value), now)); }} options={[["1", "今天"], ["3", "近 3 天"], ["7", "近 7 天"], ["30", "近 30 天"], ["custom", "自定义"]]} />{datePicker}<Choice label="统计粒度" value={minutes} onChange={setMinutes} options={[["5", "5 分钟"], ["60", "1 小时"], ["1440", "1 天"]]} /></>}
        <div className="us-actions"><div className={observation ? '' : 'us-refresh-group'}><Tooltip><TooltipTrigger asChild><Button variant="outline" size="icon" aria-label="立即刷新用量" onClick={() => refreshUsage(false)}><RefreshCw /></Button></TooltipTrigger><TooltipContent>立即刷新</TooltipContent></Tooltip>{!observation && <Popover><PopoverTrigger asChild><Button variant="outline" className={autoRefresh ? 'us-refresh-settings is-active' : 'us-refresh-settings'} aria-label={`自动刷新设置${autoLabel ? `，每 ${autoLabel}` : '，已关闭'}`}><span>{autoLabel ? `自动 · ${autoLabel}` : '自动刷新'}</span><ChevronDown size={14} /></Button></PopoverTrigger><PopoverContent className="us-refresh-popover" align="end"><strong>自动刷新</strong><p>按设定频率更新当前筛选结果</p><fieldset><legend className="sr-only">自动刷新频率</legend>{[[0, '关闭'], [30, '每 30 秒'], [60, '每 1 分钟'], [300, '每 5 分钟']].map(([seconds, label]) => <label key={seconds}><input type="radio" name="usage-auto-refresh" checked={autoRefresh === seconds} onChange={() => { setAutoRefresh(seconds); if (seconds) refreshUsage(false); }} />{label}</label>)}</fieldset><small>上次刷新：{refreshTime(now)}{autoRefresh > 0 && <> · 下次刷新：{refreshTime(new Date(now.getTime() + autoRefresh * 1000))}</>}</small></PopoverContent></Popover>}</div><Tooltip><TooltipTrigger asChild><Button variant="outline" size="icon" aria-label="导出用量" disabled={!!error || !data.summary.requests} onClick={exportData}><Download /></Button></TooltipTrigger><TooltipContent>导出当前趋势</TooltipContent></Tooltip></div>
      </div>
      {!observation && billing === 'Token Plan' && <div className="us-quota us-metering-quota"><span>本月 · 全部模型</span><span>已用 <strong>586.21 M</strong> / 1 B Token</span><Progress value={58.621} aria-label="本月套餐额度使用率" /><span>剩余 <strong>413.79 M</strong></span></div>}
      {error ? <p className="us-error" role="alert">{error}</p> : <><section className="us-summary">{observation && <div className="us-summary-head"><h2>调用概览</h2><span>所选区间 · {preset === 'custom' ? `${range.start} — ${range.end}` : preset === '1' ? '今天' : `近 ${preset} 天`}</span></div>}{observation ? <Metrics title="调用质量" keys={view.summary} summary={data.summary} /> : <UsageOverview summary={data.summary} view={view} days={rangeDays} />}</section>
      {observation ? <div className="us-charts">{view.charts.map(([title, keys, options]) => <Trend key={`${type}-${title}`} title={title} keys={keys} options={options} data={data} />)}</div> : <div className="us-chart-layout"><div className="us-charts">{view.charts.map(([title, keys, options], index) => <Trend key={title} id={`usage-chart-${index}`} title={title} keys={keys} options={options} data={data} scaled language={category === '语言模型'} />)}</div><ChartNavigation key={view.charts.map(([title]) => title).join('|')} charts={view.charts} type={category} /></div>}</>}
      <div className="us-foot"><span role="status">{notice}</span><span>北京时间 · 示例数据</span></div>
    </TabsContent></Tabs>
  </div></TooltipProvider>;
}
