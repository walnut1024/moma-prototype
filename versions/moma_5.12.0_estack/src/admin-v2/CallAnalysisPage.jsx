import AdminPageHeading from './AdminPageHeading';
import { useState } from 'react';
import { Banner, Button, Card, Space, Table, Toast, Typography } from '@douyinfe/semi-ui';
import { IconArrowRight, IconCalendar } from '@douyinfe/semi-icons';
import { TimeSeriesChart } from '../components/AnalyticsCharts';
import { FilterPresets, FilterReset, FilterToolbar, TIME_PRESETS } from '../components/FilterControls';
import SavedFilterViews from '../components/SavedFilterViews';
import { AnalysisHelp } from './AnalysisMetric';
import { DateRange, MultiPick } from './AnalyticsFilters';
import { Choice } from './ServiceUI';
import { usagePreset } from './usage-analysis';
import { dayOf, filterAnalytics, summarize, timeBuckets, inputLengthDistribution, weeklyBuckets, validAnalyticsRange } from './analytics';

const { Title, Text, Paragraph } = Typography;
const types=[['','全部类型'],['text','语言模型'],['multimodal','多模态模型'],['image','图片生成'],['video','视频生成'],['audio','语音模型'],['embedding','向量模型'],['rerank','重排模型']];
const fmt=v=>v==null?'—':Number(v).toLocaleString('zh-CN',{maximumFractionDigits:2});

function Plot({ title, labels, series, unit = '' }) {
  return <Card title={<Title heading={5} component="h2">{title}</Title>}>
    <TimeSeriesChart compact labels={labels} series={series} unit={unit} valueFormatter={unit === '次/分钟' ? value => Number(value.toFixed(4)) : undefined}
      label={title} height={260}/>
  </Card>;
}

export default function CallAnalysisPage({ state }) {
  const latest=dayOf(state.requests.length?Math.max(...state.requests.map(r=>Date.parse(r.createdAt))):Date.now());
  const routeFilters = new URLSearchParams(location.hash.split("?")[1]||"");
  const initialStart = routeFilters.get("start") || usagePreset('today').start;
  const initialEnd = routeFilters.get("end") || usagePreset('today').end;
  const initialGranularity = (Date.parse(initialEnd)-Date.parse(initialStart))/86400000>=30?"week":"day";
  const [filters,setFilters]=useState({start:initialStart,end:initialEnd,tenant:routeFilters.has('tenant')?[routeFilters.get('tenant')]:null,model:routeFilters.has('model')?[routeFilters.get('model')]:null,provider:null,type:'',key:'',source:''});
  const [granularity,setGranularity]=useState(initialGranularity),[lengthMetric,setLengthMetric]=useState('calls');
  const [period,setPeriod]=useState(routeFilters.has('start') || routeFilters.has('end') ? 'custom' : 'today');
  const choosePeriod=value=>{setPeriod(value);setFilters(f=>({...f,...usagePreset(value)}));setGranularity('day')};
  const set=(key,value)=>{setFilters(f=>({...f,[key]:['tenant','model','provider'].includes(key)&&typeof value==='string'?[value]:value,...(key==='type'?{model:null}:{})}))};
  const invalid=!validAnalyticsRange(filters.start,filters.end,granularity);
  const changeGranularity=v=>{if(!v)return;setGranularity(v)};
  const rows=invalid?[]:filterAnalytics(state,{...filters,key:'',source:''}), summary=summarize(rows), buckets=invalid?[]:(granularity==='week'?weeklyBuckets(rows,filters.start,filters.end):timeBuckets(rows,filters.start,filters.end)),labels=buckets.map(b=>b.label);
  const name=(collection,id)=>state[collection].find(x=>x.id===id)?.name||(id==='undefined'?'未识别':id)||'未识别';
  const series=(label,key)=>({label,values:buckets.map(b=>b[key])});
  const viewGroups=[
    {label:'时间',text:`${TIME_PRESETS.find(([id])=>id===period)?.[1] || '自定义'}（${filters.start} — ${filters.end}）`},
    {label:'统计粒度',text:granularity==='week'?'按周':'按天'},
    {label:'租户',items:filters.tenant?.map(id=>name('tenants',id))??null},
    {label:'模型类型',text:types.find(([id])=>id===filters.type)?.[1]||'全部'},
    {label:'模型 ID',items:filters.model?.map(id=>name('models',id))??null,all:'全部模型'},
    {label:'服务商',items:filters.provider?.map(id=>name('providers',id))??null},
  ];
  const lengths=inputLengthDistribution(rows);
  const reset = () => {
    setFilters({ ...usagePreset('today'), tenant: null, model: null, provider: null, key: '', source: '', type: '' });
    setPeriod('today');
    setGranularity('day');
  };
  const applyView = view => {
    if (!view?.filters) return false;
    setPeriod(view.period || 'custom');
    setFilters({ ...view.filters, ...(view.period && view.period !== 'custom' ? usagePreset(view.period) : {}) });
    setGranularity(view.granularity === 'week' ? 'week' : 'day');
  };
  const failedLogs = () => {
    const selectedIds = values => values == null ? '' : values.join(',') || '__none__';
    const params = new URLSearchParams({ failed: '1', model: selectedIds(filters.model), start: filters.start, end: filters.end,
      provider: selectedIds(filters.provider), tenant: selectedIds(filters.tenant), type: filters.type });
    location.hash = `/admin-2/logs?${params}`;
  };
  const summaryItems = [
    ['总请求', fmt(summary.calls)],
    ['成功 / 失败', `${summary.success} / ${summary.failed}`],
    ['模型请求成功率 / 失败率', summary.rate == null ? '—' : `${fmt(summary.rate)}% / ${fmt(100 - summary.rate)}%`,
      '按当前筛选范围内请求统计，HTTP 2xx 计为成功，其余计为失败；暂无请求时显示 —。'],
    ['平均 / P95 时延', `${fmt(summary.avg)} / ${fmt(summary.p95)} ms`, '对当前筛选内请求样本计算'],
  ];
  const byModel = [...new Set(rows.map(row => row.modelId))].map(id => {
    const requests = rows.filter(row => row.modelId === id);
    const values = summarize(requests);
    return { id, ...values, name: name('models', id), tpm: requests.some(row => row.usage?.input != null)
      ? values.total / (((Date.parse(filters.end) - Date.parse(filters.start)) / 86400000 + 1) * 1440) : null };
  });
  const detailColumns = [
    { title: '模型', dataIndex: 'name' },
    { title: '请求数', dataIndex: 'calls', align: 'right' },
    { title: '成功率', dataIndex: 'rate', align: 'right', render: value => value == null ? '—' : `${fmt(value)}%` },
    { title: '失败率', dataIndex: 'rate', key: 'failure', align: 'right', render: value => value == null ? '—' : `${fmt(100 - value)}%` },
    ...[['平均时延 (ms)', 'avg'], ['P95 (ms)', 'p95'], ['TTFT (ms)', 'ttft'], ['TPM', 'tpm']]
      .map(([title, dataIndex]) => ({ title, dataIndex, align: 'right', render: fmt })),
  ];
  return <div className="admin-page-stack">
    <AdminPageHeading title="调用数据"/>
    <Card>
      <div className="admin-analytics-fields">
        <FilterToolbar>
          <FilterPresets value={period} onChange={choosePeriod}/>
          <DateRange granularity={granularity} start={filters.start} end={filters.end} latest={latest}
            trigger={<Button icon={<IconCalendar aria-hidden="true"/>} aria-label="日期范围">
              {filters.start === filters.end ? filters.start : `${filters.start} — ${filters.end}`}
            </Button>}
            onChange={range => { setPeriod('custom'); setFilters(current => ({ ...current, ...range })); }}/>
          <Space>
            <Text type="secondary">北京时间</Text>
            <AnalysisHelp label="统计时间">记录截至 {latest}。{filters.end === dayOf(Date.now()) ? '当日截至当前时刻。' : ''}{granularity === 'week' ? '按周一至周日汇总，* 表示不足一周。' : ''}</AnalysisHelp>
          </Space>
          <Choice label="统计粒度" value={granularity} options={[[ 'day', '按天' ], [ 'week', '按周' ]]} onSelect={changeGranularity}/>
          <FilterReset onClick={reset}/>
        </FilterToolbar>
        <div className="admin-analysis-filter-row">
          <div className="admin-filter-toolbar" role="group" aria-label="调用数据对象筛选">
            <MultiPick compact label="租户" value={filters.tenant} onChange={value => set('tenant', value)} items={state.tenants}/>
            <Choice label="模型类型" value={filters.type || 'all'} options={types.map(([value, label]) => [value || 'all', label])}
              onSelect={value => set('type', value === 'all' ? '' : value)}/>
            <MultiPick compact label="模型 ID" value={filters.model} onChange={value => set('model', value)}
              items={state.models.filter(model => !filters.type || model.type === filters.type)}/>
            <MultiPick compact label="服务商" value={filters.provider} onChange={value => set('provider', value)} items={state.providers}/>
          </div>
          <SavedFilterViews notify={Toast} scope="admin-call-analysis" legacyKey="moma-admin2-5120-analytics-views" showCurrent={false}
            disabled={invalid} groups={viewGroups} value={{ period, filters, granularity }} onApply={applyView}/>
        </div>
      </div>
    </Card>
    {invalid ? <Banner type="danger" closeIcon={null} description={
      `${granularity === 'week' ? '周粒度最多 365 天' : '日粒度最多 30 天'}，结束日期不能晚于今天，请调整日期范围。`
    }/> : <>
      {!rows.length && <Paragraph type="secondary" role="status">所选时段暂无调用记录。</Paragraph>}
      <Card title={<Title heading={5} component="h2">调用概览</Title>} headerExtraContent={
        <Button icon={<IconArrowRight aria-hidden="true"/>} iconPosition="right" onClick={failedLogs}>查看失败日志</Button>
      }>
        <div className="admin-analysis-metrics admin-analysis-metrics-four">
          {summaryItems.map(([title, value, help]) => <div key={title} className="admin-analysis-metric">
            <div className="admin-analysis-metric-label"><Text type="secondary">{title}</Text>{help && <AnalysisHelp label={title}>{help}</AnalysisHelp>}</div>
            <Title heading={4} component="span">{value}</Title>
          </div>)}
        </div>
      </Card>
      <div className="admin-analysis-plot-grid">
        <Plot title="请求量趋势" labels={labels} unit="次" series={[series('全部请求', 'calls'), series('失败请求', 'failed')]}/>
        <Plot title="成功率趋势" labels={labels} unit="%" series={[series('成功率', 'rate')]}/>
        <Plot title="响应时延趋势" labels={labels} unit="ms" series={[series('平均', 'avg'), series('P95', 'p95')]}/>
        {(!filters.type || ['text', 'multimodal'].includes(filters.type)) &&
          <Plot title="首 Token 时延（已上报样本）" labels={labels} unit="ms" series={[series('平均 TTFT', 'ttft')]}/>}
        <Plot title="请求吞吐 RPM" labels={labels} unit="次/分钟" series={[{ label: '平均 RPM',
          values: buckets.map(bucket => bucket.calls / (granularity === 'week' ? bucket.days * 1440 : 1440)) }]}/>
        {!['audio', 'video', 'image'].includes(filters.type) &&
          <Plot title="Token 吞吐 TPM" labels={labels} unit="Token/分钟" series={[{ label: '平均 TPM', values: buckets.map(bucket => bucket.total / 1440) }]}/>}
        <Plot title="状态码分布趋势" labels={labels} unit="次" series={[2, 4, 5, '其他'].map(code => ({
          label: code === '其他' ? code : `${code}xx`,
          values: buckets.map(bucket => bucket.rows.filter(row => {
            const category = Math.floor(row.httpStatus / 100);
            return code === '其他' ? ![2, 4, 5].includes(category) : category === code;
          }).length),
        }))}/>
        <Card title={<Space wrap><Title heading={5} component="h2">单次调用输入长度分布</Title>
          <AnalysisHelp label="输入长度分布">按单次客户请求的输入 Token 分段；缺失字段不当作零。</AnalysisHelp>
        </Space>} headerExtraContent={<Choice label="长度分布指标" value={lengthMetric}
          options={[[ 'calls', '请求数' ], [ 'tokens', '输入 Token' ]]} onSelect={setLengthMetric}/>}>
          {rows.some(row => Number.isFinite(row.usage?.input))
            ? <TimeSeriesChart compact type="bar" labels={lengths.map(bucket => bucket.label)}
                series={[{ label: lengthMetric === 'calls' ? '请求数' : '输入 Token', values: lengths.map(bucket => bucket[lengthMetric]) }]}
                unit={lengthMetric === 'calls' ? '次' : 'Token'} label="单次调用输入长度分布" height={260}/>
            : <Paragraph type="secondary">当前范围没有已上报输入 Token 的调用</Paragraph>}
        </Card>
      </div>
      {['image', 'video'].includes(filters.type) && <Paragraph type="tertiary">当前为请求接收统计；任务终态与完成时长未采集，不代表生成成功率。</Paragraph>}
      <Card title={<Space><Title heading={5} component="h2">模型性能明细</Title>
        <AnalysisHelp label="模型性能统计">TTFT 仅统计已上报样本；TPM 为所选完整时间区间平均值。</AnalysisHelp>
      </Space>}>
        <Table rowKey="id" size="small" dataSource={byModel} columns={detailColumns} pagination={false}
          empty="所选范围暂无记录" scroll={{ x: 'max(100%, 880px)' }}/>
      </Card>
    </>}
  </div>;
}
