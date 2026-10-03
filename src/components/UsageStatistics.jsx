import { useEffect, useMemo, useState } from 'react';
import { ArrowUp, ChevronDown, ChevronLeft, ChevronRight, Download, Info, RefreshCw } from 'lucide-react';
import { Button } from './ui/button';
import { Input } from './ui/input';
import { Select, SelectContent, SelectGroup, SelectItem, SelectTrigger, SelectValue } from './ui/select';
import { Tabs, TabsContent, TabsList, TabsTrigger } from './ui/tabs';
import { ToggleGroup, ToggleGroupItem } from './ui/toggle-group';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from './ui/tooltip';
import { Popover, PopoverContent, PopoverTrigger } from './ui/popover';
import { Progress } from './ui/progress';
import SavedFilterViews from './SavedFilterViews';
import { FilterField, FilterPresets, FilterReset, FilterToolbar, FilterViewRow } from './FilterControls';
import { DateRange, MultiPick } from '../admin-v2/AnalyticsFilters';
import { TimeSeriesChart } from './AnalyticsCharts';
import { bucketLabel, dateRange, fields, usageCSV, usageModels, usageModelGroups, usageNumber, observationData, observationView, selectedMeteringView, selectedUsageData, selectedUsageTypes, usagePeriod } from '../usage-data.mjs';
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
const observationCategories = [['文本模型', '语言模型'], ['多模态模型', '多模态理解'], ['视觉模型', '视觉模型'], ['音频模型', '语音模型'], ['向量模型', '向量模型'], ['重排模型', '排序模型']];
const observationPeriod = (preset, now) => preset === 'yesterday' ? usagePeriod('yesterday', now) : dateRange(Number(preset) || 3, now);
function Trend({ id, title, keys: defaultKeys, options = {}, data, scaled = false, language = false }) {
  const [variant, setVariant] = useState(Object.keys(options.variants || {})[0]);
  const keys = options.variants?.[variant] || defaultKeys;
  const names = Object.fromEntries(options.series?.map(({ key, label }) => [key, label]) ?? []);
  const models = [...new Set(data.buckets.flatMap(row => Object.keys(row.modelUsage || {})))];
  const modelSeries = scaled && !options.series && keys.length === 1 && models.length > 0 && data.buckets.some(row => row.modelUsage);
  let series = title === '模型请求次数趋势'
    ? Object.keys(data.summary.modelRequests || {}).map(name => ({ label: name, values: data.buckets.map(row => row.modelRequests?.[name] || 0) }))
    : modelSeries ? models.filter(model => data.buckets.some(row => Number.isFinite(row.modelUsage?.[model]?.[keys[0]]))).map(model => ({ label: model, values: data.buckets.map(row => row.modelUsage?.[model]?.[keys[0]] ?? null) }))
    : keys.map(key => ({ label: names[key] ?? fields[key]?.[0] ?? key, values: data.buckets.map(row => row[key]), dashed: key === 'cache', color: key === 'failure' ? '#d94a4a' : undefined }));
  const unit = fields[keys[0]]?.[1] ?? 'Token';
  if ((modelSeries || title === '模型请求次数趋势') && series.length > 1) series = [{ label: ['ms', '%', 'Token/秒', 'Token/次'].includes(unit) ? '整体' : '总量', total: true, values: data.buckets.map(row => row[keys[0]] ?? null) }, ...series];
  return <section id={id} className="us-chart">
    <div className="us-chart-head"><h3>{title}<Hint label={title}>{language && languageChartHints[title] ? <p>{languageChartHints[title]}</p> : keys.map(key => <p key={key}>{names[key] ?? fields[key]?.[0] ?? key}：{fields[key]?.[2] ?? '按所选模型的计量档位统计。'}</p>)}{options.series && <p>各条线为该模型的计量分项，相加得到本图总量。</p>}{scaled && unit === 'Token/分钟' && <p>图表各点为当前时间桶的每分钟平均量，不是单个自然分钟峰值。</p>}{scaled && ['读缓存总 Token 数', '写入缓存总 Token 数', '区间内命中显式缓存总 Token 数'].includes(title) && <p>图表按时间桶展示；所选区间总量为各点之和。</p>}</Hint></h3>
      <div className="us-chart-tools">{options.variants && <Choice label={`${title}指标`} value={variant} onChange={setVariant} options={Object.keys(options.variants).map(key => [key, key])} />}</div>
    </div>
    {data.summary.requests ? <TimeSeriesChart labels={data.buckets.map(row => bucketLabel(row.time))} series={series} unit={unit} label={title} /> : <div className="us-empty">暂无用量数据</div>}
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
  return <div className="us-summary-section">{title && <h3>{title}</h3>}<div className="us-metrics" style={{ '--metric-count': keys.length }}>{keys.map(key => <div className="us-metric" key={key}><span>{fields[key][0]}<Hint label={fields[key][0]}>{fields[key][2]}</Hint></span><strong>{usageNumber(summary[key])}<small>{fields[key][1] === 'Token' || summary[key] == null ? '' : ` ${fields[key][1]}`}</small></strong></div>)}</div></div>;
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
  const [apiKeyIds, setApiKeyIds] = useState(null);
  const [keySearch, setKeySearch] = useState('');
  const [keyPickerOpen, setKeyPickerOpen] = useState(false);
  const keyOptions = apiKeyOptions(billing);
  const selectedKey = keyOptions.find(key => key.id === apiKeyId);
  const groups = useMemo(() => [category], [category]);
  const selectedTypes = selectedUsageTypes(groups, modelIds);
  const modelOptions = usageModelGroups.filter(group => group.id === category).flatMap(group => group.types.flatMap(type => usageModels[type].map(id => ({ id, name: id }))));
  const [now, setNow] = useState(() => new Date());
  const [autoRefresh, setAutoRefresh] = useState(0);
  const [range, setRange] = useState(() => observation ? dateRange(1) : usagePeriod('today'));
  const [preset, setPreset] = useState(observation ? '1' : 'today'), [minutes, setMinutes] = useState('60');
  const [notice, setNotice] = useState('');
  const observationModels = observation ? usageModels[type].map(id => ({ id, name: id })) : [];
  const observationKeys = ['按量付费', 'Token Plan'].flatMap(source => apiKeyOptions(source).map(key => ({ id: key.id, name: `${key.name}（${source}）`, searchText: key.id })));
  const streaming = observation && ['文本模型', '视觉理解'].includes(type);
  const view = observation ? { ...observationView, charts: [...observationView.charts, ...(streaming ? [['首 Token 时延', ['ttft']], ['输出吞吐', ['outputSecond']]] : [])] } : selectedMeteringView(selectedTypes, modelIds);
  const rangeDays = (Date.parse(range.end) - Date.parse(range.start)) / 86400000 + 1;
  const error = !Number.isFinite(rangeDays) || rangeDays < 1 ? '请选择有效的起止日期。' : rangeDays > 31 ? '单次最多查看 31 天，请缩小日期范围。' : !observation && !selectedTypes.length ? '请选择至少一个模型 ID。' : '';
  const bucketMinutes = observation ? Number(minutes) : rangeDays === 1 ? 10 : 60;
  const data = useMemo(() => observation ? observationData({ billing, type, modelIds, apiKeyIds, ...range, minutes: bucketMinutes, now }) : selectedUsageData({ billing, groups, modelIds, apiKeyId, ...range, minutes: bucketMinutes, now }), [observation, billing, type, groups, modelIds, apiKeyId, apiKeyIds, range, bucketMinutes, now]);
  const changeType = (value, setter) => { setter(value); setModelIds(null); };
  function exportData() {
    const label = observation ? type : category;
    const url = URL.createObjectURL(new Blob([usageCSV(data, view, billing, label)], { type: 'text/csv;charset=utf-8' }));
    const link = document.createElement('a'); link.href = url; link.download = `${billing}-${label}-${range.start}-${range.end}.csv`; link.click(); setTimeout(() => URL.revokeObjectURL(url), 1000); setNotice('已导出当前筛选范围的用量趋势');
  }
  const changeBilling = value => { setBilling(value); setApiKeyId(null); setKeySearch(''); };
  const refreshUsage = automatic => {
    const next = new Date();
    setNow(next);
    if (preset !== 'custom') setRange(observation ? observationPeriod(preset, next) : usagePeriod(preset, next));
    setNotice(automatic ? '用量已自动刷新' : '用量已刷新');
  };
  useEffect(() => {
    if (!autoRefresh) return;
    const timer = window.setInterval(() => refreshUsage(true), autoRefresh * 1000);
    return () => window.clearInterval(timer);
  }, [autoRefresh, now, preset, observation]);
  const refreshTime = value => value.toLocaleTimeString('zh-CN', { timeZone: 'Asia/Shanghai', hour12: false });
  const autoLabel = { 30: '30 秒', 60: '1 分钟', 300: '5 分钟' }[autoRefresh];
  const savedValue = observation
    ? { category, visual, audio, modelIds, apiKeyIds, preset, range, minutes }
    : { category, billing, modelIds, apiKeyId, preset, range };
  const periodName = observation ? ({ '1': '今日', yesterday: '昨日', '3': '近 3 天', '7': '近 7 天', '30': '近 30 天' }[preset] || '自定义') : ({ today: '今日', yesterday: '昨日', '7d': '近 7 天', '30d': '近 30 天' }[preset] || '自定义');
  const viewGroups = [
    { label: '模型类别', text: observation ? observationCategories.find(([id]) => id === category)?.[1] || category : category },
    ...(type === category ? [] : [{ label: '任务类型', text: type }]),
    { label: '时间', text: `${periodName}（${range.start} — ${range.end}）` },
    ...(observation ? [{ label: '统计粒度', text: { '5': '5 分钟', '60': '1 小时', '1440': '1 天' }[minutes] }] : [{ label: '计费方式', text: billing }]),
    { label: '模型 ID', items: modelIds === null ? null : modelIds, all: '全部模型' },
    { label: 'API Key', items: observation ? apiKeyIds === null ? null : apiKeyIds.map(id => observationKeys.find(key => key.id === id)?.name ?? id) : apiKeyId ? [selectedKey?.name ?? apiKeyId] : null, all: '全部 Key' },
  ];
  const applySaved = value => {
    if (!value || !usageModelGroups.some(group => group.id === value.category) && !observation) return;
    const current = new Date();
    const customRange = value.range?.start && value.range?.end && value.range.start <= value.range.end ? value.range : dateRange(1, current);
    setNow(current);
    if (observation) {
      const nextCategory = ['文本模型', '多模态模型', '视觉模型', '音频模型', '向量模型', '重排模型'].includes(value.category) ? value.category : '文本模型';
      setCategory(nextCategory); setVisual(value.visual || '视觉理解'); setAudio(value.audio || '语音合成');
      setModelIds(Array.isArray(value.modelIds) ? value.modelIds : value.dimension === 'Model ID' && value.targets?.length ? value.targets : null);
      setApiKeyIds(Array.isArray(value.apiKeyIds) ? value.apiKeyIds : value.dimension === 'API Key' && value.targets?.length ? value.targets : null);
      setMinutes(['5', '60', '1440'].includes(value.minutes) ? value.minutes : '60');
      setPreset(value.preset || '3'); setRange(value.preset === 'custom' ? customRange : observationPeriod(value.preset || '3', current));
    } else {
      setCategory(value.category); setBilling(['按量付费', 'Token Plan'].includes(value.billing) ? value.billing : '按量付费');
      setModelIds(value.modelIds === null || Array.isArray(value.modelIds) ? value.modelIds : null);
      setApiKeyId(value.apiKeyId || null); setPreset(value.preset || 'today');
      setRange(value.preset === 'custom' ? customRange : usagePeriod(value.preset || 'today', current));
    }
  };
  const datePicker = <DateRange start={range.start} end={range.end} maxDays={31} onChange={value => { setRange(value); setPreset('custom'); }}/>;
  const resetFilters = () => {
    const current = new Date(); setNow(current); setPreset(observation ? '1' : 'today'); setRange(observation ? observationPeriod('1', current) : usagePeriod('today', current));
    setCategory(observation ? '文本模型' : '语言模型'); setBilling(observation ? '全部' : '按量付费'); setVisual('视觉理解'); setAudio('语音合成'); setApiKeyIds(null); setMinutes('60'); setModelIds(null); setApiKeyId(null); setKeySearch(''); setKeyPickerOpen(false);
  };
  return <TooltipProvider><div className={observation ? "us-page us-observation" : "us-page us-metering"}><div className="us-title"><div><h1>{observation ? "调用观测" : "用量统计"}</h1><p>{observation ? "查看调用成功率、响应时延与运行趋势" : "查看不同计费方式下的实际模型用量"}</p></div></div>
    <Tabs value={category} onValueChange={value => { if (observation) changeType(value, setCategory); else { setCategory(value); setModelIds(null); } }}><TabsList variant="line" className="us-tabs">{(observation ? observationCategories : usageModelGroups.map(group => [group.id, group.id])).map(([id, label]) => <TabsTrigger key={id} value={id}>{label}</TabsTrigger>)}</TabsList>
    <TabsContent value={category} className="us-content">
      <div className="us-filter-panel"><FilterToolbar className="us-filters">
        <FilterPresets value={preset} onChange={value => { const current = new Date(); setNow(current); setPreset(value); setRange(observation ? observationPeriod(value, current) : usagePeriod(value, current)); }} items={observation ? [['1', '今日'], ['yesterday', '昨日'], ['7', '近 7 天'], ['30', '近 30 天']] : undefined} />
        {datePicker}
        {observation && category === '视觉模型' && <Choice label="视觉任务类型" value={visual} onChange={value => changeType(value, setVisual)} options={['视觉理解', '图片生成', '视频生成'].map(x => [x, x])} />}
        {observation && category === '音频模型' && <Choice label="音频任务类型" value={audio} onChange={value => changeType(value, setAudio)} options={['语音合成', '语音识别'].map(x => [x, x])} />}
        <FilterField label="模型 ID"><MultiPick key={category} label="模型 ID" value={modelIds} onChange={setModelIds} items={observation ? observationModels : modelOptions} searchPlaceholder="搜索模型，如 DeepSeek-V4-Pro" /></FilterField>
        {observation ? <FilterField label="API Key"><MultiPick label="API Key" value={apiKeyIds} onChange={setApiKeyIds} items={observationKeys} searchPlaceholder="搜索 API Key 名称或 ID" /></FilterField> : <FilterField label="API Key"><Popover open={keyPickerOpen} onOpenChange={setKeyPickerOpen}><PopoverTrigger asChild><Button variant="outline" aria-label="API Key 筛选" title={selectedKey?.id}>{selectedKey?.name ?? '全部 Key'}<ChevronDown size={14}/></Button></PopoverTrigger><PopoverContent align="start" className="us-key-picker"><Input aria-label="搜索 API Key" placeholder="搜索 API Key 名称或 Track ID" value={keySearch} onChange={e => setKeySearch(e.target.value)}/><div role="listbox" aria-label="API Key 选项"><button role="option" aria-selected={apiKeyId === null} onClick={() => { setApiKeyId(null); setKeyPickerOpen(false); }}>全部 Key</button>{keyOptions.filter(key => `${key.name} ${key.id}`.toLowerCase().includes(keySearch.trim().toLowerCase())).map(key => <Tooltip key={key.id}><TooltipTrigger asChild><button role="option" aria-selected={apiKeyId === key.id} onClick={() => { setApiKeyId(key.id); setKeyPickerOpen(false); }}>{maskApiKey(key.key)} ({key.name})<small>{key.id}</small></button></TooltipTrigger><TooltipContent>{key.id}</TooltipContent></Tooltip>)}{!keyOptions.some(key => `${key.name} ${key.id}`.toLowerCase().includes(keySearch.trim().toLowerCase())) && <p>无匹配的 API Key</p>}</div></PopoverContent></Popover></FilterField>}
        {observation ? <FilterField label="统计粒度"><Choice label="统计粒度" value={minutes} onChange={setMinutes} options={[["5", "5 分钟"], ["60", "1 小时"], ["1440", "1 天"]]} /></FilterField> : <FilterField label="数据范围"><ToggleGroup type="single" value={billing} onValueChange={value => value && changeBilling(value)} variant="outline" size="sm" className="us-segmented" aria-label="数据范围">{['按量付费', 'Token Plan'].map(value => <ToggleGroupItem key={value} value={value}>{value}</ToggleGroupItem>)}</ToggleGroup></FilterField>}
        <FilterReset onClick={resetFilters}/>
        <div className="us-actions"><div className={observation ? '' : 'us-refresh-group'}><Tooltip><TooltipTrigger asChild><Button variant="outline" size="icon" aria-label={observation ? '立即刷新调用观测' : '立即刷新用量'} onClick={() => refreshUsage(false)}><RefreshCw /></Button></TooltipTrigger><TooltipContent>立即刷新</TooltipContent></Tooltip>{!observation && <Popover><PopoverTrigger asChild><Button variant="outline" className={autoRefresh ? 'us-refresh-settings is-active' : 'us-refresh-settings'} aria-label={`自动刷新设置${autoLabel ? `，每 ${autoLabel}` : '，已关闭'}`}><span>{autoLabel ? `自动 · ${autoLabel}` : '自动刷新'}</span><ChevronDown size={14} /></Button></PopoverTrigger><PopoverContent className="us-refresh-popover" align="end"><strong>自动刷新</strong><p>按设定频率更新当前筛选结果</p><fieldset><legend className="sr-only">自动刷新频率</legend>{[[0, '关闭'], [30, '每 30 秒'], [60, '每 1 分钟'], [300, '每 5 分钟']].map(([seconds, label]) => <label key={seconds}><input type="radio" name="usage-auto-refresh" checked={autoRefresh === seconds} onChange={() => { setAutoRefresh(seconds); if (seconds) refreshUsage(false); }} />{label}</label>)}</fieldset><small>上次刷新：{refreshTime(now)}{autoRefresh > 0 && <> · 下次刷新：{refreshTime(new Date(now.getTime() + autoRefresh * 1000))}</>}</small></PopoverContent></Popover>}</div><Tooltip><TooltipTrigger asChild><Button variant="outline" size="icon" aria-label={observation ? '导出调用观测' : '导出用量'} disabled={!!error || !data.summary.requests} onClick={exportData}><Download /></Button></TooltipTrigger><TooltipContent>导出当前趋势</TooltipContent></Tooltip></div>
      </FilterToolbar>
      <FilterViewRow className="us-view-row"><SavedFilterViews scope={observation ? 'tenant-observation' : 'tenant-usage'} value={savedValue} onApply={applySaved} groups={viewGroups} disabled={!!error}/></FilterViewRow></div>
      {!observation && billing === 'Token Plan' && <div className="us-quota us-metering-quota"><span>本月 · 全部模型</span><span>已用 <strong>586.21 M</strong> / 1 B Token</span><Progress value={58.621} aria-label="本月套餐额度使用率" /><span>剩余 <strong>413.79 M</strong></span></div>}
      {error ? <p className="us-error" role="alert">{error}</p> : <><section className="us-summary">{observation ? <Metrics keys={view.summary} summary={data.summary} /> : <UsageOverview summary={data.summary} view={view} days={rangeDays} />}</section>
      <div className="us-chart-layout"><div className="us-charts">{view.charts.map(([title, keys, options], index) => <Trend key={`${type}-${title}`} id={`usage-chart-${index}`} title={title} keys={keys} options={options} data={data} scaled={!observation} language={!observation && category === '语言模型'} />)}</div><ChartNavigation key={view.charts.map(([title]) => title).join('|')} charts={view.charts} type={category} /></div></>}
      <div className="us-foot"><span role="status">{notice}</span><span>北京时间 · 示例数据</span></div>
    </TabsContent></Tabs>
  </div></TooltipProvider>;
}
