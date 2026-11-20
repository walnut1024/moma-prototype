import {useTenantData} from './useTenantData';
import {tenantLogRecords} from './call-log-data.mjs';
import FrontPageHeader from "./components/FrontPageHeader";
import { FileText } from "lucide-react";
import { SemiDateRange as DateRange } from "./admin-v2/SemiAnalyticsFilters";
import { AdminSideSheet as SideSheet } from './admin-v2/AdminOverlay';
import { DEFAULT_PAGE_SIZE, FilterField, FilterPagination, FilterPresets, FilterReset } from "./components/FilterControls";
import { validAnalyticsRange } from "./admin-v2/analytics";
import { useState } from 'react';
import { Button, DatePicker, Input, Select, Table, Tabs, Tag } from '@douyinfe/semi-ui';
import { Copy, Download, Eye, FileSearch, Maximize2, Minimize2, RotateCcw, Search, WrapText } from 'lucide-react';
import SavedFilterViews from './components/SavedFilterViews';
import { defaultLogFilters, restoreLogFilters, logPeriod, filterLogRecords, logJSON, logStatuses, logsCSV, shanghaiDate } from './call-log-data.mjs';
import { maskApiKey } from './api-key-utils.mjs';

function IconAction({ label, icon: Icon, ...props }) {
  return <Button theme="borderless" type="tertiary" size="small" icon={<Icon size={16} aria-hidden="true"/>}
    title={label} aria-label={label} {...props}/>;
}

function saveFile(content, name, type) {
  const url = URL.createObjectURL(new Blob([content], { type }));
  const anchor = document.createElement('a');
  anchor.href = url; anchor.download = name; anchor.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

const number = value => value == null ? '—' : value.toLocaleString('en-US');
const duration = value => value == null ? '—' : `${number(value)} ms`;

function JSONCode({ text, wrap }) {
  return <pre className={`cl-json ${wrap ? 'cl-json-wrap' : ''}`} tabIndex={0} aria-label="原始日志 JSON"><code>{text.split('\n').map((line, index) => <span className="cl-code-line" key={index}><span className="cl-line-number" aria-hidden="true">{index + 1}</span><span>{line.split(/("(?:\\.|[^"\\])*"\s*:|"(?:\\.|[^"\\])*"|\b(?:true|false|null|\d+)\b)/g).map((token, i) => <span key={i} className={token.endsWith(':') ? 'cl-json-key' : token.startsWith('"') ? 'cl-json-string' : /^(true|false|null|\d+)$/.test(token) ? 'cl-json-value' : undefined}>{token}</span>)}</span></span>)}</code></pre>;
}

function LogDetail({ log, onClose }) {
  const [expanded, setExpanded] = useState(false);
  const [tab, setTab] = useState('overview');
  const [wrap, setWrap] = useState(true);
  const [notice, setNotice] = useState('');
  async function copy(text) {
    try { await navigator.clipboard.writeText(text); setNotice('已复制'); }
    catch { setNotice('复制失败，请选中文本后手动复制'); }
  }
  const [status, defaultError, suggestion] = logStatuses[log.status] || ['失败','','请联系管理员核对请求。'];
  const error = log.error || defaultError;
  const json = logJSON(log);
  return <SideSheet visible className="cl-drawer" title="请求详情" placement="right"
    width={`min(${expanded ? 1040 : 740}px, 100vw)`} onCancel={onClose} maskClosable closeOnEsc>
    <div className="cl-drawer-head"><p>{log.billing} · {log.source}</p>
      <IconAction label={expanded ? '收起详情' : '展开详情'} icon={expanded ? Minimize2 : Maximize2} onClick={() => setExpanded(!expanded)} /></div>
    <div className="cl-request-id"><span>Request ID</span><code>{log.id}</code><IconAction label="复制 Request ID" icon={Copy} onClick={() => copy(log.id)} /></div>
    <Tabs className="cl-detail-tabs" activeKey={tab} onChange={value => { setTab(value); setNotice(''); }} keepDOM={false}
      tabBarExtraContent={tab === 'json' && <div className="cl-actions"><IconAction label="自动换行" icon={WrapText} aria-pressed={wrap} onClick={() => setWrap(!wrap)} /><IconAction label="复制 JSON" icon={Copy} onClick={() => copy(json)} /><IconAction label="下载 JSON" icon={Download} onClick={() => saveFile(json, `${log.id}.json`, 'application/json;charset=utf-8')} /></div>}>
      <Tabs.TabPane itemKey="overview" tab="概览" className="cl-detail-scroll">
        <section className={`cl-result ${log.status === 200 ? '' : 'cl-error'}`}><strong><span className="cl-dot" />{log.status} · {status}</strong>{error && <><code>{error}</code><p>{suggestion}</p></>}</section>
        <section className="cl-detail-section"><h3>请求与归属</h3><dl>{[['请求开始时间', log.time], ['请求结束时间', log.finishedAt ?? '—'], ['模型 ID', log.model], ['请求来源', log.source], ['计费方式', log.billing], ['服务名称 / ID', [log.endpointName, log.endpointId].filter(Boolean).join(' / ') || '—'], ['套餐', log.resource || '—'], ['套餐 ID', log.resourceId ?? '—'], ['Key 名称/Key ID', log.keyName ? `${log.keyName}（${log.keyId}）` : '不适用'], ['API Key', maskApiKey(log.apiKey)], ['客户端 IP', log.clientIp ?? '—'], ['调用方式', log.stream ? '流式' : '非流式']].map(([label, value]) => <div key={label}><dt>{label}</dt><dd>{value}</dd></div>)}</dl></section>
        <section className="cl-detail-section"><h3>Token 用量</h3><dl className="cl-metrics">{[['输入 Tokens', log.input], ['输出 Tokens', log.output], ['缓存命中 Tokens', log.cache], ['总 Tokens', log.total], ['思考 Tokens', log.thinking]].map(([label, value]) => <div key={label}><dt>{label}</dt><dd>{number(value)}</dd></div>)}</dl><p className="cl-muted">总 Tokens = 输入 + 输出；缓存命中已包含在输入中，不重复累加。{log.billing === 'Token Plan' && 'Token 用量不等同于套餐额度扣减。'}缺失字段显示 —。</p></section>
        <section className="cl-detail-section"><h3>时延与完成状态</h3><dl className="cl-metrics"><div><dt>首 Token 时延</dt><dd>{duration(log.first)}</dd></div><div><dt>总时延</dt><dd>{duration(log.duration)}</dd></div><div><dt>每 Token 输出时延</dt><dd>{duration(log.tpot)}</dd></div></dl><dl><div><dt>是否超时</dt><dd>{log.isTimeout == null ? '—' : log.isTimeout ? '是' : '否'}</dd></div><div><dt>是否取消</dt><dd>{log.isCanceled == null ? '—' : log.isCanceled ? '是' : '否'}</dd></div></dl></section>
        <details className="cl-more"><summary>接口与客户端</summary><dl><div><dt>接口路径</dt><dd>/v1/chat/completions</dd></div><div><dt>协议</dt><dd>{log.stream ? 'SSE' : 'HTTP'}</dd></div><div><dt>User-Agent</dt><dd>{log.userAgent ?? '—'}</dd></div></dl></details>
        <details className="cl-more"><summary>请求与响应内容</summary><dl><div><dt>请求内容</dt><dd>{log.requestBody ?? '未采集'}</dd></div><div><dt>响应内容</dt><dd>{log.responseBody ?? '未采集'}</dd></div></dl></details>
      </Tabs.TabPane>
      <Tabs.TabPane itemKey="json" tab="JSON" className="cl-detail-scroll cl-json-panel"><JSONCode text={json} wrap={wrap} /></Tabs.TabPane>
    </Tabs>
    <div role="status" className="cl-feedback">{notice}</div>
  </SideSheet>;
}

export default function CallLogs({ billing = '全部', projectId, requestId }) {
  const [today] = useState(shanghaiDate);
  const tenant=useTenantData();
  const project=tenant.projects.find(row=>row.id===projectId);
  const records=tenantLogRecords({ ...tenant, requests:projectId ? tenant.requests.filter(row=>project && row.projectId===project.id) : tenant.requests });
  const defaults = { ...defaultLogFilters, range:projectId ? '30' : billing === '全部' ? '1' : '7', query:requestId || '' };
  const [draft, setDraft] = useState(defaults);
  const [filters, setFilters] = useState(defaults);
  const [page, setPage] = useState(1);
  const [size, setSize] = useState(DEFAULT_PAGE_SIZE);
  const [selectedId, setSelected] = useState(requestId || null);
  const selected = records.find(row => row.id === selectedId);
  const [notice, setNotice] = useState('');
  const [dateError, setDateError] = useState('');
  const unified = billing === '全部';
  const scope = unified ? records : records.filter(log => log.billing === billing);
  const filtered = filterLogRecords(records, billing, filters, today);
  const current = Math.min(page, Math.max(1, Math.ceil(filtered.length / size)));
  const visible = filtered.slice((current - 1) * size, current * size);
  const update = (name, value) => setDraft(current => ({ ...current, [name]: value }));
  function query(event) {
    event.preventDefault();
    if (draft.range === 'custom' && !validAnalyticsRange(draft.start,draft.end,'day',Date.now(),31)) { setDateError('请选择有效的起止日期，开始日期不能晚于结束日期。'); return; }
    setDateError(''); setNotice(''); setFilters({ ...draft }); setPage(1);
  }
  function reset() { setDraft(defaults); setFilters(defaults); setPage(1); setDateError(''); setNotice(''); }
  async function copyId(id) {
    try { await navigator.clipboard.writeText(id); setNotice('Request ID 已复制'); }
    catch { setNotice('复制失败，请在详情中选中 Request ID 后手动复制'); }
  }
  const appliedPeriod=filters.range === 'custom' ? filters : logPeriod(filters.range,today);
  const viewTime = `${{ '1':'今日',yesterday:'昨日','7':'近 7 天','30':'近 30 天' }[filters.range]||'自定义'}（${appliedPeriod.start} — ${appliedPeriod.end}）`;
  const viewConditions = [`时间：${viewTime}`, `计费方式：${filters.billing || '全部'}`, `模型：${filters.model || '全部模型'}`, `API Key：${scope.find(log => log.keyId === filters.key)?.keyName || filters.key || '全部 Key'}`, `请求来源：${filters.source || '全部'}`, `状态：${filters.status ? `${filters.status} ${logStatuses[filters.status]?.[0] || ''}` : '全部'}`, ...(filters.resource ? [`套餐：${filters.resource}`] : []), ...(filters.query ? [`Request ID：${filters.query}`] : [])];
  const viewPreview = [viewTime, filters.billing, filters.model ? `模型 ${filters.model}` : '全部模型', ...(filters.resource ? [filters.resource] : []), ...(filters.key ? [`Key ${scope.find(log => log.keyId === filters.key)?.keyName || filters.key}`] : []), filters.source, filters.status && `状态 ${filters.status}`, filters.query && `Request ID ${filters.query}`].filter(Boolean).join(' · ');
  const period = draft.range === 'custom' ? draft : logPeriod(draft.range,today);
  const choice = (key,label,items) => <>
    <span id={`call-log-filter-${key}`} className="sr-only">{label}</span>
    <Select aria-labelledby={`call-log-filter-${key}`} value={draft[key]}
      onChange={value=>update(key,value)} optionList={items.map(([value,label])=>({value,label}))} />
  </>;
  const distinct = field => [...new Set(scope.map(log=>log[field]).filter(Boolean))].map(value=>[value,value]);
  const columns=[
    { title:'请求时间',width:112,render:(_,log)=><time dateTime={log.time.replace(' ', 'T') + '+08:00'}>{log.time.slice(0,10)}<small>{log.time.slice(11,19)}</small></time> },
    { title:'Request ID',width:166,render:(_,log)=><div className="cl-id">
      <Button theme="borderless" size="small" className="cl-request-link" title={log.id} aria-label={`查看请求 ${log.id}`}
        onClick={()=>setSelected(log.id)}><code>{log.id.slice(0,8)}…{log.id.slice(-4)}</code></Button>
      <IconAction label={`复制 Request ID ${log.id}`} icon={Copy} onClick={()=>copyId(log.id)} />
    </div> },
    { title:'模型 ID',width:165,dataIndex:'model' },
    { title:'服务 / 套餐',width:170,render:(_,log)=><>{log.resource || log.endpointName || '—'}
      <small className="cl-cell-sub" title={[log.billing, log.resourceId || log.endpointId].filter(Boolean).join(' · ')}>
        {log.billing}{(log.resourceId || log.endpointId) && ` · ${log.resourceId || log.endpointId}`}</small></> },
    { title:'API Key',width:108,render:(_,log)=><code>{maskApiKey(log.apiKey)}</code> },
    { title:'状态码',width:80,render:(_,log)=><Tag color={log.status===200?'green':'red'} title={logStatuses[log.status]?.[0] || '未定义状态'}>{log.status ?? '—'}</Tag> },
    ...[['输入 Tokens','input'],['输出 Tokens','output'],['缓存命中 Tokens','cache']].map(([title,key])=>({
      title,width:112,align:'right',render:(_,log)=><span title={log[key]==null?'本次请求未返回此用量字段':undefined}>{number(log[key])}</span>,
    })),
    { title:'首 Token 时延',width:105,align:'right',render:(_,log)=>number(log.first) },
    { title:'总时延',width:86,align:'right',render:(_,log)=>number(log.duration) },
    { title:'操作',width:64,fixed:'right',align:'center',render:(_,log)=>
      <IconAction label={`查看请求详情 ${log.id}`} icon={Eye} onClick={()=>setSelected(log.id)} /> },
  ];
  return <div className="cl-page us-page">
    <FrontPageHeader title={unified ? "调用日志" : `${billing}调用日志`} description={project ? '所属项目 · ' + project.name : projectId ? '当前空间无权访问此项目' : '查询模型调用记录与请求详情'} icon={FileText} />
    <section className="cl-panel" aria-label={unified ? '全部调用记录' : `${billing}调用记录`}>
      <form className="cl-filters" onSubmit={query}>
        {unified ? <>
          <FilterPresets value={draft.range} items={[['1','今日'],['yesterday','昨日'],['7','近 7 天'],['30','近 30 天']]}
            onChange={range=>{update('range',range);setFilters(current=>({...current,range}));setPage(1);setDateError('');}} />
          <DateRange start={period.start} end={period.end} maxDays={31} onChange={value=>{
            setDraft(current=>({...current,...value,range:'custom'}));
            setFilters(current=>({...current,...value,range:'custom'}));setPage(1);setDateError('');
          }} />
        </> : choice('range','时间范围',[['7','最近 7 天'],['1','今天'],['30','最近 30 天'],['custom','自定义时间']])}
        {unified && <FilterField label="计费方式">{choice('billing','筛选计费方式',[['','全部计费方式'],['按量付费','按量付费'],['Token Plan','Token Plan']])}</FilterField>}
        <FilterField label="模型">{choice('model','筛选模型',[['','全部模型'],...distinct('model')])}</FilterField>
        {(unified || billing!=='按量付费') && <FilterField label="套餐">{choice('resource','筛选套餐',[['','全部套餐'],...distinct('resource')])}</FilterField>}
        <FilterField label="API Key">{choice('key','筛选 API Key',[['','全部 API Key'],
          ...new Map(scope.filter(log=>log.keyId).map(log=>[log.keyId,log.keyName]))])}</FilterField>
        <FilterField label="请求来源">{choice('source','请求来源',[['','全部来源'],['API 调用','API 调用'],['模型体验','模型体验']])}</FilterField>
        <FilterField label="状态">{choice('status','调用状态',[['','全部状态'],
          ...Object.entries(logStatuses).map(([code,[label]])=>[code,`${code} · ${label}`])])}</FilterField>
        <div className="cl-search-group">
          <Input aria-label="搜索 Request ID" placeholder="搜索 Request ID" value={draft.query} onChange={value=>update('query',value)} />
          <div className="cl-actions"><IconAction label="查询" icon={Search} theme="solid" type="primary" htmlType="submit"/>
            {unified ? <FilterReset onClick={reset}/> : <IconAction label="重置筛选" icon={RotateCcw} onClick={reset}/>}
          </div>
        </div>
        {!unified && draft.range==='custom' && <div className="cl-date-range">
          {[[ 'start','开始日期'],['end','结束日期']].map(([key,label])=><label key={key}>{label}
            <DatePicker type="date" format="yyyy-MM-dd" onChangeWithDateFirst={false} value={draft[key] || ''}
              aria-label={label} disabledDate={date=>shanghaiDate(date)>today} onChange={value=>update(key,value || '')} />
          </label>)}<small>北京时间 UTC+8</small>
        </div>}
        {dateError && <p role="alert" className="cl-date-error">{dateError}</p>}
      </form>
      {unified && <div className="cl-view-row"><SavedFilterViews scope={`${tenant.identity?.key || 'anonymous'}:tenant-call-logs`} saveDescription="保存当前已应用的时间、计费方式、模型、套餐、API Key、请求来源、状态和 Request ID 条件；查询草稿不包含在视图中。保存后可快速应用已保存的筛选条件。" value={filters} onApply={value => { if (!value || !['1','yesterday','7','30','custom'].includes(value.range) || value.range === 'custom' && !validAnalyticsRange(value.start,value.end,'day',Date.now(),31)) return; const next = restoreLogFilters(value, defaults, records); setFilters(next); setDraft(next); setPage(1); setDateError(''); }} summary={viewConditions.join(' · ')} preview={viewPreview} conditions={viewConditions}/></div>}
      <div className="cl-table-tools"><span>请求记录 <b>{filtered.length}</b></span><span className="cl-feedback" role="status">{notice}</span><IconAction label="导出筛选结果" icon={Download} disabled={!filtered.length} onClick={() => { saveFile(logsCSV(filtered), `${unified ? '' : `${billing}-`}调用日志.csv`, 'text/csv;charset=utf-8'); setNotice(`已导出 ${filtered.length} 条记录`); }} /></div>
      <div className="cl-table-note">单位：Tokens / ms；缓存命中包含在输入中，缺失字段显示 —。</div>
      <Table className="cl-table" aria-label="调用日志" rowKey="id" columns={columns} dataSource={visible}
        size="small" pagination={false} scroll={{x:1392,y:'max(280px, calc(100dvh - 440px))'}}
        empty={<div className="cl-empty"><FileSearch aria-hidden="true" /><strong>暂无符合条件的调用日志</strong>
          <p>试试调整时间范围或清除筛选条件。</p><Button type="tertiary" onClick={reset}>重置筛选</Button></div>} />
      <FilterPagination total={filtered.length} page={current} size={size} onPageChange={setPage}
        onSizeChange={value=>{setSize(value);setPage(1);}} />
    </section>
    {selected && <LogDetail log={selected} onClose={() => setSelected(null)} />}
  </div>;
}
