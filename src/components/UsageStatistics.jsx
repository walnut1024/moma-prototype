import FrontPageHeader from "./FrontPageHeader";
import { Activity, ChartNoAxesCombined } from "lucide-react";
import { useEffect, useMemo, useState } from 'react';
import { ArrowUp, ChevronDown, ChevronLeft, ChevronRight, Download, Info, RefreshCw } from 'lucide-react';
import { Button } from './ui/button';
import { Input } from './ui/input';
import { Select, SelectContent, SelectGroup, SelectItem, SelectTrigger, SelectValue } from './ui/select';
import { Tabs, TabsContent, TabsList, TabsTrigger } from './ui/tabs';
import { ToggleGroup, ToggleGroupItem } from './ui/toggle-group';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from './ui/tooltip';
import { Popover, PopoverContent, PopoverTrigger } from './ui/popover';
import { tokenPlanSubscriptions } from '../token-plan-data.mjs';
import SavedFilterViews from './SavedFilterViews';
import { FilterField, FilterPresets, FilterReset, FilterToolbar, FilterViewRow } from './FilterControls';
import { DateRange, MultiPick } from '../admin-v2/AnalyticsFilters';
import { TimeSeriesChart } from './AnalyticsCharts';
import { chartPalette } from './chart-style.mjs';
import { bucketLabel, dateRange, fields, usageCSV, usageModels, billingUsageModels, usageModelGroups, usageNumber, observationData, observationView, selectedMeteringView, selectedUsageData, selectedUsageTypes, usagePeriod, usageKeyOptions } from '../usage-data.mjs';
import './usage-statistics.css';
import './usage-simple.css';
import { maskApiKey } from '../api-key-utils.mjs';

const usageTimePresets = [['today', '当日'], ['7d', '近 7 天'], ['30d', '近 30 天']];

function Choice({ label, value, onChange, options }) {
  return <Select value={value} onValueChange={onChange}><SelectTrigger aria-label={label}><SelectValue /></SelectTrigger><SelectContent><SelectGroup>{options.map(([id, text]) => <SelectItem key={id} value={id}>{text}</SelectItem>)}</SelectGroup></SelectContent></Select>;
}
function Hint({ label, children }) {
  return <Tooltip delayDuration={300}><TooltipTrigger asChild><Button variant="ghost" size="icon-sm" aria-label={`${label}说明`} className="us-info"><Info /></Button></TooltipTrigger><TooltipContent sideOffset={6} className="max-w-72 text-left leading-relaxed">{children}</TooltipContent></Tooltip>;
}
const observationCategories = [['文本模型', '语言模型'], ['多模态模型', '多模态理解'], ['视觉模型', '视觉模型'], ['音频模型', '语音模型'], ['向量模型', '向量模型'], ['重排模型', '排序模型']];
const observationPeriod = (preset, now) => preset === 'yesterday' ? usagePeriod('yesterday', now) : dateRange(Number(preset) || 3, now);
function Trend({ id, title, keys: defaultKeys, options = {}, data }) {
  const [variant, setVariant] = useState(Object.keys(options.variants || {})[0]);
  const keys = options.variants?.[variant] || defaultKeys;
  const names = Object.fromEntries(options.series?.map(({ key, label }) => [key, label]) ?? []);
  const series = keys.map((key, index) => ({ label: names[key] ?? fields[key]?.[0] ?? key, values: data.buckets.map(row => row[key]), color: key === 'failure' ? '#d94a4a' : options.note ? chartPalette[index % chartPalette.length] : undefined }));
  const unit = fields[keys[0]]?.[1] ?? 'Token';
  const pointDetails = options.models?.length > 1 ? data.buckets.map(row => options.models.map(id => ({ label: id, value: row.modelUsage[id] ? keys.every(key => Number.isFinite(row.modelUsage[id][key])) ? keys.reduce((total, key) => total + row.modelUsage[id][key], 0) : null : 0 }))) : undefined;
  return <section id={id} className="us-chart">
    <div className="us-chart-head"><h3>{title}<Hint label={title}>{options.note ?? keys.map(key => <p key={key}>{fields[key]?.[2] ?? '按所选模型的计量档位统计。'}</p>)}</Hint></h3>
      <div className="us-chart-tools">{options.variants && <Choice label={`${title}指标`} value={variant} onChange={setVariant} options={Object.keys(options.variants).map(key => [key, key])} />}</div>
    </div>
    {(options.models ? data.buckets.length : data.summary.requests) ? <TimeSeriesChart labels={data.buckets.map(row => bucketLabel(row.time))} series={series} pointDetails={pointDetails} unit={unit} label={title} /> : <div className="us-empty">暂无用量数据</div>}
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
function UsageOverview({ summary, view, days }) {
  return <div className="us-overview-groups" style={{ '--overview-count': view.summary.length > 4 ? 3 : view.summary.length }}>{view.summary.map((key, index) => {
    const label = view.charts[index][0];
    return <div key={key} className="us-overview-group">
      <span>{label}<Hint label={label}>{view.hints[key]}</Hint></span><strong>{usageNumber(summary[key])}{fields[key][1] !== 'Token' && summary[key] != null && <small> {fields[key][1]}</small>}</strong><small>{days} 天累计</small>
    </div>;
  })}</div>;
}
export default function UsageStatistics({ observation = false, userType = 'enterprise' }) {
  const defaultBilling = observation ? '全部' : userType === 'personal' ? 'Token Plan' : '按量付费';
  const [billing, setBilling] = useState(defaultBilling);
  const [category, setCategory] = useState(observation ? '文本模型' : '语言模型');
  const [visual, setVisual] = useState('视觉理解'), [audio, setAudio] = useState('语音合成');
  const type = category === '视觉模型' ? visual : category === '音频模型' ? audio : category;
  const [modelIds, setModelIds] = useState(null);
  const [apiKeyId, setApiKeyId] = useState(null);
  const [apiKeyIds, setApiKeyIds] = useState(null);
  const [keySearch, setKeySearch] = useState('');
  const [keyPickerOpen, setKeyPickerOpen] = useState(false);
  const [subscriptionId, setSubscriptionId] = useState(tokenPlanSubscriptions[0].id);
  const subscription = tokenPlanSubscriptions.find(plan => plan.id === subscriptionId);
  const keyOptions = usageKeyOptions(billing, !observation && billing === 'Token Plan' ? subscriptionId : null);
  const selectedKey = keyOptions.find(key => key.id === apiKeyId);
  const groups = useMemo(() => [category], [category]);
  const selectedTypes = selectedUsageTypes(groups, modelIds, billingUsageModels);
  const modelOptions = usageModelGroups.filter(group => group.id === category).flatMap(group => group.types.flatMap(type => billingUsageModels[type].map(id => ({ id, name: id }))));
  const [now, setNow] = useState(() => new Date());
  const [range, setRange] = useState(() => observation ? dateRange(1) : usagePeriod('today'));
  const [preset, setPreset] = useState(observation ? '1' : 'today'), [minutes, setMinutes] = useState('60');
  const [notice, setNotice] = useState('');
  const observationModels = observation ? usageModels[type].map(id => ({ id, name: id })) : [];
  const observationKeys = ['按量付费', 'Token Plan'].flatMap(source => usageKeyOptions(source).map(key => ({ id: key.id, name: `${key.name}（${key.subscriptionId ?? source}）`, searchText: key.id })));
  const streaming = observation && ['文本模型', '视觉理解'].includes(type);
  const view = observation ? { ...observationView, charts: [...observationView.charts, ...(streaming ? [['首 Token 时延', ['ttft']], ['输出吞吐', ['outputSecond']]] : [])] } : selectedMeteringView(selectedTypes, modelIds, billingUsageModels);
  const rangeDays = (Date.parse(range.end) - Date.parse(range.start)) / 86400000 + 1;
  const error = !Number.isFinite(rangeDays) || rangeDays < 1 ? '请选择有效的起止日期。' : rangeDays > 31 ? '单次最多查看 31 天，请缩小日期范围。' : !observation && !selectedTypes.length ? '请选择至少一个模型 ID。' : '';
  const bucketMinutes = observation ? Number(minutes) : 60;
  const data = useMemo(() => observation ? observationData({ billing, type, modelIds, apiKeyIds, ...range, minutes: bucketMinutes, now }) : selectedUsageData({ catalog: billingUsageModels, billing, groups, modelIds, apiKeyId, subscriptionId: billing === 'Token Plan' ? subscriptionId : null, ...range, minutes: bucketMinutes, now }), [observation, billing, type, groups, modelIds, apiKeyId, apiKeyIds, subscriptionId, range, bucketMinutes, now]);
  const changeType = (value, setter) => { setter(value); setModelIds(null); };
  function exportData() {
    const label = observation ? type : category;
    const url = URL.createObjectURL(new Blob([usageCSV(data, view, billing, label, observation ? {} : { ...range, subscriptionId: billing === 'Token Plan' ? subscriptionId : null, apiKeyId })], { type: 'text/csv;charset=utf-8' }));
    const link = document.createElement('a'); link.href = url; link.download = `${billing}-${label}-${range.start}-${range.end}.csv`; link.click(); setTimeout(() => URL.revokeObjectURL(url), 1000); setNotice(observation ? '已导出当前筛选范围的调用趋势' : '已导出当前筛选范围的计量趋势');
  }
  const changeBilling = value => { setBilling(value); setApiKeyId(null); setKeySearch(''); };
  const refreshUsage = () => {
    const next = new Date();
    setNow(next);
    if (preset !== 'custom') setRange(observation ? observationPeriod(preset, next) : usagePeriod(preset, next));
    setNotice('用量已刷新');
  };
  const savedValue = observation
    ? { category, visual, audio, modelIds, apiKeyIds, preset, range, minutes }
    : { category, billing, subscriptionId, modelIds, apiKeyId, preset, range };
  const periodName = observation ? ({ '1': '今日', yesterday: '昨日', '3': '近 3 天', '7': '近 7 天', '30': '近 30 天' }[preset] || '自定义') : ({ today: '当日', yesterday: '昨日', '7d': '近 7 天', '30d': '近 30 天' }[preset] || '自定义');
  const viewGroups = [
    { label: '模型类别', text: observation ? observationCategories.find(([id]) => id === category)?.[1] || category : category },
    ...(type === category ? [] : [{ label: '任务类型', text: type }]),
    { label: '时间', text: `${periodName}（${range.start} — ${range.end}）` },
    ...(observation ? [{ label: '统计粒度', text: { '5': '5 分钟', '60': '1 小时', '1440': '1 天' }[minutes] }] : [{ label: '计费方式', text: billing }]),
    ...(!observation && billing === 'Token Plan' ? [{ label: '订阅', text: subscriptionId }] : []),
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
      const nextBilling = ['按量付费', 'Token Plan'].includes(value.billing) ? value.billing : defaultBilling;
      const planId = tokenPlanSubscriptions.some(plan => plan.id === value.subscriptionId) ? value.subscriptionId : tokenPlanSubscriptions[0].id;
      setCategory(value.category); setBilling(nextBilling); setSubscriptionId(planId);
      setModelIds(value.modelIds === null || Array.isArray(value.modelIds) ? value.modelIds : null);
      setApiKeyId(usageKeyOptions(nextBilling, nextBilling === 'Token Plan' ? planId : null).some(key => key.id === value.apiKeyId) ? value.apiKeyId : null); setPreset(value.preset || 'today');
      setRange(value.preset === 'custom' ? customRange : usagePeriod(value.preset || 'today', current));
    }
  };
  const datePicker = <DateRange start={range.start} end={range.end} maxDays={31} label={observation ? '自定义' : ''} presets={observation ? undefined : usageTimePresets} onChange={value => { setRange(value); setPreset('custom'); }}/>;
  const resetFilters = () => {
    const current = new Date(); setNow(current); setPreset(observation ? '1' : 'today'); setRange(observation ? observationPeriod('1', current) : usagePeriod('today', current));
    setCategory(observation ? '文本模型' : '语言模型'); setBilling(defaultBilling); setVisual('视觉理解'); setAudio('语音合成'); setApiKeyIds(null); setMinutes('60'); setModelIds(null); setApiKeyId(null); setKeySearch(''); setKeyPickerOpen(false); setSubscriptionId(tokenPlanSubscriptions[0].id);
  };
  return <TooltipProvider><div className={observation ? "us-page us-observation" : "us-page us-metering"}><FrontPageHeader title={observation ? "调用观测" : "用量统计"} description={observation ? "查看调用成功率、响应时延与运行趋势" : "查看输入、输出及缓存等计费分项的用量"} icon={observation ? Activity : ChartNoAxesCombined} actions={!observation && <ToggleGroup type="single" value={billing} onValueChange={value => value && changeBilling(value)} variant="outline" size="sm" className="us-segmented" aria-label="计费方式">{['按量付费', 'Token Plan'].map(value => <ToggleGroupItem key={value} value={value}>{value}</ToggleGroupItem>)}</ToggleGroup>} />
    <Tabs value={category} onValueChange={value => { if (observation) changeType(value, setCategory); else { setCategory(value); setModelIds(null); } }}><TabsList variant="line" className="us-tabs">{(observation ? observationCategories : usageModelGroups.map(group => [group.id, group.id])).map(([id, label]) => <TabsTrigger key={id} value={id}>{label}</TabsTrigger>)}</TabsList>
    <TabsContent value={category} className="us-content">
      <div className="us-filter-panel"><FilterToolbar className="us-filters">
        <FilterPresets value={preset} onChange={value => { const current = new Date(); setNow(current); setPreset(value); setRange(observation ? observationPeriod(value, current) : usagePeriod(value, current)); }} items={observation ? [['1', '今日'], ['yesterday', '昨日'], ['7', '近 7 天'], ['30', '近 30 天']] : usageTimePresets} />
        {datePicker}
        {observation && category === '视觉模型' && <Choice label="视觉任务类型" value={visual} onChange={value => changeType(value, setVisual)} options={['视觉理解', '图片生成', '视频生成'].map(x => [x, x])} />}
        {observation && category === '音频模型' && <Choice label="音频任务类型" value={audio} onChange={value => changeType(value, setAudio)} options={['语音合成', '语音识别'].map(x => [x, x])} />}
        <FilterField label="模型 ID"><MultiPick key={category} label="模型 ID" value={modelIds} onChange={setModelIds} items={observation ? observationModels : modelOptions} searchPlaceholder="搜索模型，如 DeepSeek-V4-Pro" /></FilterField>
        {observation ? <FilterField label="API Key"><MultiPick label="API Key" value={apiKeyIds} onChange={setApiKeyIds} items={observationKeys} searchPlaceholder="搜索 API Key 名称或 ID" /></FilterField> : <FilterField label="API Key"><Popover open={keyPickerOpen} onOpenChange={setKeyPickerOpen}><PopoverTrigger asChild><Button variant="outline" aria-label="API Key 筛选" title={selectedKey?.id}>{selectedKey?.name ?? '全部 Key'}<ChevronDown size={14}/></Button></PopoverTrigger><PopoverContent align="start" className="us-key-picker"><Input aria-label="搜索 API Key" placeholder="搜索 Key 名称或 Key ID" value={keySearch} onChange={e => setKeySearch(e.target.value)}/><div role="listbox" aria-label="API Key 选项"><button role="option" aria-selected={apiKeyId === null} onClick={() => { setApiKeyId(null); setKeyPickerOpen(false); }}>全部 Key</button>{keyOptions.filter(key => `${key.name} ${key.id}`.toLowerCase().includes(keySearch.trim().toLowerCase())).map(key => <Tooltip key={key.id}><TooltipTrigger asChild><button role="option" aria-selected={apiKeyId === key.id} onClick={() => { setApiKeyId(key.id); setKeyPickerOpen(false); }}>{maskApiKey(key.key)} ({key.name})<small>{key.id}</small></button></TooltipTrigger><TooltipContent>{key.id}</TooltipContent></Tooltip>)}{!keyOptions.some(key => `${key.name} ${key.id}`.toLowerCase().includes(keySearch.trim().toLowerCase())) && <p>无匹配的 API Key</p>}</div></PopoverContent></Popover></FilterField>}
        {observation ? <FilterField label="统计粒度"><Choice label="统计粒度" value={minutes} onChange={setMinutes} options={[["5", "5 分钟"], ["60", "1 小时"], ["1440", "1 天"]]} /></FilterField> : null}
        <FilterReset onClick={resetFilters}/>
        <div className="us-actions"><div><Tooltip><TooltipTrigger asChild><Button variant="outline" size="icon" aria-label={observation ? '立即刷新调用观测' : '立即刷新用量'} onClick={refreshUsage}><RefreshCw /></Button></TooltipTrigger><TooltipContent>立即刷新</TooltipContent></Tooltip></div><Tooltip><TooltipTrigger asChild><Button variant="outline" size="icon" aria-label={observation ? '导出调用观测' : '导出用量'} disabled={!!error || !data.summary.requests} onClick={exportData}><Download /></Button></TooltipTrigger><TooltipContent>{observation ? '导出当前趋势' : '导出当前计量趋势'}</TooltipContent></Tooltip></div>
      </FilterToolbar>
      <FilterViewRow className="us-view-row"><SavedFilterViews scope={observation ? 'tenant-observation' : 'tenant-usage'} value={savedValue} onApply={applySaved} groups={viewGroups} disabled={!!error}/></FilterViewRow></div>
      {!observation && billing === 'Token Plan' && <div className="us-subscription">
        <FilterField label="已购套餐"><Choice label="已购套餐" value={subscriptionId} onChange={value => { setSubscriptionId(value); setApiKeyId(null); setKeySearch(''); setKeyPickerOpen(false); }} options={tokenPlanSubscriptions.map(plan => [plan.id, plan.name + ' · ' + plan.id])}/></FilterField>
        <span>有效期：{subscription.startAt} 至 {subscription.endAt}</span>
        <div className="us-quota-facts"><span>当前额度周期 <b>—</b></span><span>已用额度 <b>—</b></span><span>剩余额度 <b>—</b></span><Hint label="套餐额度">套餐额度按当前订阅的额度周期统计，与上方用量查询时段独立。没有额度记录时显示 —。</Hint></div>
      </div>}
      {!observation && view.pending.length > 0 && <p className="us-billing-pending" role="status">计费维度待配置：{view.pending.join('、')}。已明确计费项的模型正常统计。</p>}
      {error ? <p className="us-error" role="alert">{error}</p> : <>{!observation && !view.charts.length ? <div className="us-empty">暂无可展示的计费用量指标</div> : <section className="us-summary">{observation ? <Metrics keys={view.summary} summary={data.summary} /> : <UsageOverview summary={data.summary} view={view} days={rangeDays} />}</section>}
      {observation ? <div className="us-chart-layout"><div className="us-charts">{view.charts.map(([title, keys, options], index) => <Trend key={type + title} id={'usage-chart-' + index} title={title} keys={keys} options={options} data={data}/>)}</div><ChartNavigation key={view.charts.map(([title]) => title).join('|')} charts={view.charts} type={category}/></div> : <>
        <div className="us-charts">{view.charts.map(([title, keys, options]) => <Trend key={category + title + JSON.stringify(modelIds)} title={title} keys={keys} options={options} data={data}/>)}</div>
      </>}</>}
      <div className="us-foot"><span role="status">{notice}</span><span>北京时间</span></div>
    </TabsContent></Tabs>
  </div></TooltipProvider>;
}
