import { useEffect, useMemo, useState } from 'react';
import { Activity, ArrowUp, ChevronLeft, ChevronRight, Download, Info, RefreshCw } from 'lucide-react';
import { useTenantData } from '../useTenantData';
import { bucketLabel, dateRange, fields, observationView, tenantUsageData, tenantUsageTypes, usageCSV, usagePeriod, usageNumber } from '../usage-data.mjs';
import { DateRange, MultiPick } from '../admin-v2/AnalyticsFilters';
import { TimeSeriesChart } from './AnalyticsCharts';
import { FilterField, FilterPresets, FilterReset, FilterToolbar, FilterViewRow } from './FilterControls';
import FrontPageHeader from './FrontPageHeader';
import SavedFilterViews from './SavedFilterViews';
import TenantUsageStatistics from './TenantUsageStatistics';
import { Button } from './ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from './ui/select';
import { Tabs, TabsContent, TabsList, TabsTrigger } from './ui/tabs';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from './ui/tooltip';
import './usage-statistics.css';

const categories = [['文本模型', '语言模型'], ['多模态模型', '多模态理解'], ['视觉模型', '视觉模型'], ['音频模型', '语音模型'], ['向量模型', '向量模型'], ['重排模型', '排序模型']];
const observationPeriod = (preset, now) => preset === 'yesterday' ? usagePeriod('yesterday', now) : dateRange(Number(preset) || 3, now);
const periods = [['1', '今日'], ['yesterday', '昨日'], ['7', '近 7 天'], ['30', '近 30 天']];

function Choice({ label, value, onChange, options }) {
  return <Select value={value} onValueChange={onChange}><SelectTrigger aria-label={label}><SelectValue /></SelectTrigger>
    <SelectContent>{options.map(([id, text]) => <SelectItem key={id} value={id}>{text}</SelectItem>)}</SelectContent></Select>;
}
function Hint({ label, children }) {
  return <Tooltip><TooltipTrigger asChild><Button variant="ghost" size="icon-sm" aria-label={label + '说明'} className="us-info"><Info /></Button></TooltipTrigger>
    <TooltipContent className="max-w-72">{children}</TooltipContent></Tooltip>;
}

function Trend({ id, title, keys: defaultKeys, options = {}, data }) {
  const [variant, setVariant] = useState(Object.keys(options.variants || {})[0]);
  const keys = options.variants?.[variant] || defaultKeys;
  const names = Object.fromEntries(options.series?.map(({ key, label }) => [key, label]) ?? []);
  const series = keys.map(key => ({ label: names[key] ?? fields[key]?.[0] ?? key, values: data.buckets.map(row => row[key]), color: key === 'failure' ? '#d94a4a' : undefined }));
  return <section id={id} className="us-chart">
    <div className="us-chart-head"><h3>{title}<Hint label={title}>{keys.map(key => <p key={key}>{names[key] ?? fields[key]?.[0] ?? key}：{fields[key]?.[2] ?? '按所选模型的计量档位统计。'}</p>)}</Hint></h3>
      <div className="us-chart-tools">{options.variants && <Choice label={title + '指标'} value={variant} onChange={setVariant} options={Object.keys(options.variants).map(key => [key, key])} />}</div>
    </div>
    {data.summary.requests ? <TimeSeriesChart labels={data.buckets.map(row => bucketLabel(row.time))} series={series} unit={fields[keys[0]]?.[1] ?? 'Token'} label={title} /> : <div className="us-empty">暂无用量数据</div>}
  </section>;
}

function ChartNavigation({ items }) {
  const [open, setOpen] = useState(true);
  const [active, setActive] = useState(0);
  useEffect(() => {
    const update = () => {
      const sections = items.map(([id]) => document.getElementById(id));
      const index = Math.max(0, sections.findLastIndex(section => section?.getBoundingClientRect().top <= 190));
      setActive(previous => sections[previous]?.offsetTop === sections[index]?.offsetTop ? previous : index);
    };
    update();
    window.addEventListener('scroll', update, { passive: true });
    return () => window.removeEventListener('scroll', update);
  }, [items]);
  return <aside className={`us-chart-nav${open ? '' : ' is-collapsed'}`} aria-label="图表导航">
    <div className="us-chart-nav-head"><strong>{open && '图表导航'}</strong><Button variant="ghost" size="icon" aria-label={open ? '收起图表导航' : '展开图表导航'} aria-expanded={open} onClick={() => setOpen(value => !value)}>{open ? <ChevronRight size={16} /> : <ChevronLeft size={16} />}</Button></div>
    {open && <><nav>{items.map(([id, title], index) => <button key={id} type="button" className={active === index ? 'active' : ''} aria-current={active === index ? 'location' : undefined} onClick={() => { setActive(index); document.getElementById(id)?.scrollIntoView({ behavior: 'smooth', block: 'start' }); }}>{title}</button>)}</nav><button type="button" className="us-back-top" onClick={() => window.scrollTo({ top: 0, behavior: 'smooth' })}><ArrowUp size={14} />回到顶部</button></>}
  </aside>;
}

function CallObservation({ projectScope }) {
  const source = useTenantData();
  const tenant = projectScope?.id ? { ...source,
    requests:source.requests.filter(row => row.projectId === projectScope.id && source.projects.some(project => project.id === row.projectId)),
    keys:source.keys.filter(row => row.projectId === projectScope.id),
  } : source;
  const [category, setCategory] = useState('文本模型');
  const [visual, setVisual] = useState('视觉理解'), [audio, setAudio] = useState('语音合成');
  const type = category === '视觉模型' ? visual : category === '音频模型' ? audio : category;
  const [modelIds, setModelIds] = useState(null), [apiKeyIds, setApiKeyIds] = useState(null);
  const [now, setNow] = useState(() => new Date());
  const [range, setRange] = useState(() => dateRange(1));
  const [preset, setPreset] = useState('1'), [minutes, setMinutes] = useState('60');
  const [notice, setNotice] = useState('');
  const models = tenant.models.filter(row => tenant.requests.some(request => request.modelId === row.id) || tenant.services.some(service => service.modelKey === row.id)).map(row => ({ id: row.modelId, name: row.name }));
  const keys = tenant.keys.map(key => ({ id: key.id, name: key.name, searchText: key.keyId }));
  const streaming = ['文本模型', '视觉理解'].includes(type);
  const charts = useMemo(() => [...observationView.charts, ...(streaming ? [['首 Token 时延', ['ttft']], ['输出吞吐', ['outputSecond']]] : [])], [streaming]);
  const rangeDays = (Date.parse(range.end) - Date.parse(range.start)) / 86400000 + 1;
  const error = !Number.isFinite(rangeDays) || rangeDays < 1 ? '请选择有效的起止日期。' : rangeDays > 31 ? '单次最多查看 31 天，请缩小日期范围。' : '';
  const data = useMemo(() => tenantUsageData({
    records: tenant.requests, models: tenant.models, billing: '全部', modelIds, apiKeyIds, ...range,
    minutes: Number(minutes), now, types: tenantUsageTypes(category, category === '视觉模型' ? visual : undefined),
  }), [tenant.requests, tenant.models, modelIds, apiKeyIds, range, minutes, now, category, visual]);
  const changeType = (value, setter) => { setter(value); setModelIds(null); };
  const updateTime = value => { const current = new Date(); setNow(current); setPreset(value); setRange(observationPeriod(value, current)); };
  const refresh = () => {
    if (preset !== 'custom') updateTime(preset);
    else setNow(new Date());
    setNotice('用量已刷新');
  };
  function exportData() {
    const url = URL.createObjectURL(new Blob([usageCSV(data, { ...observationView, charts }, '全部', type)], { type: 'text/csv;charset=utf-8' }));
    const link = document.createElement('a');
    link.href = url; link.download = `全部-${type}-${range.start}-${range.end}.csv`; link.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000); setNotice('已导出当前筛选范围的用量趋势');
  }
  const savedValue = { category, visual, audio, modelIds, apiKeyIds, preset, range, minutes };
  const viewGroups = [
    { label: '模型类别', text: categories.find(([id]) => id === category)?.[1] || category },
    ...(type === category ? [] : [{ label: '任务类型', text: type }]),
    { label: '时间', text: (periods.find(([id]) => id === preset)?.[1] || ({ '3': '近 3 天' }[preset]) || '自定义') + `（${range.start} — ${range.end}）` },
    { label: '统计粒度', text: { '5': '5 分钟', '60': '1 小时', '1440': '1 天' }[minutes] },
    { label: '模型 ID', items: modelIds, all: '全部模型' },
    { label: 'API Key', items: apiKeyIds?.map(id => keys.find(key => key.id === id)?.name ?? id) ?? null, all: '全部 Key' },
  ];
  const applySaved = value => {
    if (!value) return;
    const current = new Date();
    const customRange = value.range?.start && value.range?.end && value.range.start <= value.range.end ? value.range : dateRange(1, current);
    setNow(current);
    setCategory(categories.some(([id]) => id === value.category) ? value.category : '文本模型');
    setVisual(value.visual || '视觉理解'); setAudio(value.audio || '语音合成');
    setModelIds(Array.isArray(value.modelIds) ? value.modelIds : value.dimension === 'Model ID' && value.targets?.length ? value.targets : null);
    setApiKeyIds(Array.isArray(value.apiKeyIds) ? value.apiKeyIds : value.dimension === 'API Key' && value.targets?.length ? value.targets : null);
    setMinutes(['5', '60', '1440'].includes(value.minutes) ? value.minutes : '60');
    setPreset(value.preset || '3'); setRange(value.preset === 'custom' ? customRange : observationPeriod(value.preset || '3', current));
  };
  const reset = () => {
    updateTime('1'); setCategory('文本模型'); setVisual('视觉理解'); setAudio('语音合成'); setApiKeyIds(null); setMinutes('60'); setModelIds(null);
  };
  return <TooltipProvider><div className="us-page us-observation"><FrontPageHeader title="调用观测" description="查看调用成功率、响应时延与运行趋势" icon={Activity} />
    <Tabs value={category} onValueChange={value => changeType(value, setCategory)}>
      <TabsList variant="line" className="us-tabs">{categories.map(([id, label]) => <TabsTrigger key={id} value={id}>{label}</TabsTrigger>)}</TabsList>
      <TabsContent value={category} className="us-content">
        <div className="us-filter-panel"><FilterToolbar className="us-filters">
          <FilterPresets value={preset} onChange={updateTime} items={periods} />
          <DateRange start={range.start} end={range.end} maxDays={31} onChange={value => { setRange(value); setPreset('custom'); }} />
          {category === '视觉模型' && <Choice label="视觉任务类型" value={visual} onChange={value => changeType(value, setVisual)} options={['视觉理解', '图片生成', '视频生成'].map(value => [value, value])} />}
          {category === '音频模型' && <Choice label="音频任务类型" value={audio} onChange={value => changeType(value, setAudio)} options={['语音合成', '语音识别'].map(value => [value, value])} />}
          <FilterField label="模型 ID"><MultiPick label="模型 ID" value={modelIds} onChange={setModelIds} items={models} /></FilterField>
          <FilterField label="API Key"><MultiPick label="API Key" value={apiKeyIds} onChange={setApiKeyIds} items={keys} searchPlaceholder="搜索 API Key 名称或 ID" /></FilterField>
          <FilterField label="统计粒度"><Choice label="统计粒度" value={minutes} onChange={setMinutes} options={[['5', '5 分钟'], ['60', '1 小时'], ['1440', '1 天']]} /></FilterField>
          <FilterReset onClick={reset} />
          <div className="us-actions">
            <Tooltip><TooltipTrigger asChild><Button variant="outline" size="icon" aria-label="立即刷新调用观测" onClick={refresh}><RefreshCw /></Button></TooltipTrigger><TooltipContent>立即刷新</TooltipContent></Tooltip>
            <Tooltip><TooltipTrigger asChild><Button variant="outline" size="icon" aria-label="导出调用观测" disabled={!!error || !data.summary.requests} onClick={exportData}><Download /></Button></TooltipTrigger><TooltipContent>导出当前趋势</TooltipContent></Tooltip>
          </div>
        </FilterToolbar><FilterViewRow className="us-view-row"><SavedFilterViews scope={(tenant.identity?.key || 'anonymous') + ':tenant-observation:' + (projectScope?.id || 'space')} value={savedValue} onApply={applySaved} groups={viewGroups} disabled={!!error} /></FilterViewRow></div>
        {error ? <p className="us-error" role="alert">{error}</p> : <>
          <section className="us-summary"><div className="us-summary-section"><div className="us-metrics" style={{ '--metric-count': observationView.summary.length }}>
            {observationView.summary.map(key => <div className="us-metric" key={key}><span>{fields[key][0]}<Hint label={fields[key][0]}>{fields[key][2]}</Hint></span>
              <strong>{usageNumber(data.summary[key])}<small>{data.summary[key] == null ? '' : ` ${fields[key][1]}`}</small></strong></div>)}
          </div></div></section>
          <div className="us-chart-layout"><div className="us-charts">{charts.map(([title, keys, options], index) =>
            <Trend key={type + '-' + title} id={`usage-chart-${index}`} title={title} keys={keys} options={options} data={data} />)}</div>
            <ChartNavigation key={charts.map(([title]) => title).join('|')} items={charts.map(([title], index) => [`usage-chart-${index}`, title])} /></div>
        </>}
        <div className="us-foot"><span role="status">{notice}</span><span>北京时间</span></div>
      </TabsContent>
    </Tabs>
  </div></TooltipProvider>;
}

export default function UsageStatistics({ observation = false, projectScope, workspaceOverview, internal }) {
  return observation ? <CallObservation projectScope={projectScope} /> : <TenantUsageStatistics ChartNavigation={ChartNavigation}
    projectScope={projectScope} workspaceOverview={workspaceOverview} internal={internal} />;
}
