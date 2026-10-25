import FrontPageHeader from "./components/FrontPageHeader";
import { FileText } from "lucide-react";
import { DateRange } from "./admin-v2/AnalyticsFilters";
import { DEFAULT_PAGE_SIZE, PAGE_SIZES, FilterField, FilterPresets, FilterReset } from "./components/FilterControls";
import { validAnalyticsRange } from "./admin-v2/analytics";
import { useEffect, useRef, useState } from 'react';
import { Tabs } from 'radix-ui';
import { ChevronLeft, ChevronRight, Copy, Download, Eye, FileSearch, Maximize2, Minimize2, RotateCcw, Search, WrapText, X } from 'lucide-react';
import { Button } from './components/ui/button';
import SavedFilterViews from './components/SavedFilterViews';
import { createLogRecords, defaultLogFilters, restoreLogFilters, logPeriod, filterLogRecords, logJSON, logStatuses, logsCSV, shanghaiDate } from './call-log-data.mjs';
import { maskApiKey } from './api-key-utils.mjs';

function IconAction({ label, icon: Icon, ...props }) {
  return <Button type="button" variant="ghost" size="icon" title={label} aria-label={label} {...props}><Icon aria-hidden="true" /></Button>;
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
  const dialog = useRef(null);
  const [expanded, setExpanded] = useState(false);
  const [tab, setTab] = useState('overview');
  const [wrap, setWrap] = useState(true);
  const [notice, setNotice] = useState('');
  useEffect(() => {
    const previous = document.activeElement;
    dialog.current.showModal();
    return () => { previous?.focus(); };
  }, []);
  async function copy(text) {
    try { await navigator.clipboard.writeText(text); setNotice('已复制'); }
    catch { setNotice('复制失败，请选中文本后手动复制'); }
  }
  const [status, error, suggestion] = logStatuses[log.status] || ['未知状态', log.errorCode || '', log.errorMessage || ''];
  const json = logJSON(log);
  return <dialog ref={dialog} className={`cl-drawer ${expanded ? 'cl-expanded' : ''}`} aria-labelledby="cl-detail-title" onCancel={onClose} onClick={event => { if (event.target === event.currentTarget && event.clientX < event.currentTarget.getBoundingClientRect().left) onClose(); }}>
    <div className="cl-drawer-head"><div><h2 id="cl-detail-title">请求详情</h2><p>{log.billing} · {log.source}</p></div><div className="cl-actions"><IconAction label={expanded ? '收起详情' : '展开详情'} icon={expanded ? Minimize2 : Maximize2} onClick={() => setExpanded(!expanded)} /><IconAction label="关闭详情" icon={X} onClick={onClose} /></div></div>
    <div className="cl-request-id"><span>Request ID</span><code>{log.id}</code><IconAction label="复制 Request ID" icon={Copy} onClick={() => copy(log.id)} /></div>
    <Tabs.Root className="cl-detail-tabs" value={tab} onValueChange={value => { setTab(value); setNotice(''); }}>
      <div className="cl-tabbar"><Tabs.List aria-label="详情视图"><Tabs.Trigger value="overview">概览</Tabs.Trigger><Tabs.Trigger value="json">JSON</Tabs.Trigger></Tabs.List>{tab === 'json' && <div className="cl-actions"><IconAction label="自动换行" icon={WrapText} aria-pressed={wrap} onClick={() => setWrap(!wrap)} /><IconAction label="复制 JSON" icon={Copy} onClick={() => copy(json)} /><IconAction label="下载 JSON" icon={Download} onClick={() => saveFile(json, `${log.id}.json`, 'application/json;charset=utf-8')} /></div>}</div>
      <Tabs.Content value="overview" className="cl-detail-scroll">
        <section className={`cl-result ${log.status === 200 ? '' : 'cl-error'}`}><strong><span className="cl-dot" />{log.status} · {status}</strong>{error && <><code>{error}</code><p>{suggestion}</p></>}</section>
        <section className="cl-detail-section"><h3>请求与归属</h3><dl>{[['项目', log.projectName || '—'], ['调用人', log.userName || '—'], ['费用', log.charge == null ? '—' : '¥' + (log.charge / 1e6).toFixed(6)], ['套餐扣减', log.quotaDebit ?? '—'], ['请求开始时间', log.time], ['请求结束时间', log.finishedAt ?? '—'], ['模型 ID', log.model], ['请求来源', log.source], ['计费方式', log.billing], ['服务名称 / ID', [log.endpointName, log.endpointId].filter(Boolean).join(' / ') || '—'], ['套餐', log.resource || '—'], ['套餐 ID', log.resourceId ?? '—'], ['Key 名称/Key ID', log.keyName ? `${log.keyName}（${log.keyId}）` : '不适用'], ['API Key', log.apiKey === '系统托管' ? '系统托管' : maskApiKey(log.apiKey)], ['客户端 IP', log.clientIp ?? '—'], ['调用方式', log.stream == null ? '—' : log.stream ? '流式' : '非流式']].map(([label, value]) => <div key={label}><dt>{label}</dt><dd>{value}</dd></div>)}</dl></section>
        <section className="cl-detail-section"><h3>Token 用量</h3><dl className="cl-metrics">{[['输入 Tokens', log.input], ['输出 Tokens', log.output], ['缓存命中 Tokens', log.cache], ['总 Tokens', log.total], ['思考 Tokens', log.thinking]].map(([label, value]) => <div key={label}><dt>{label}</dt><dd>{number(value)}</dd></div>)}</dl><p className="cl-muted">总 Tokens = 输入 + 输出；缓存命中已包含在输入中，不重复累加。{log.billing === 'Token Plan' && 'Token 用量不等同于套餐额度扣减。'}缺失字段显示 —。</p></section>
        <section className="cl-detail-section"><h3>其他计量</h3><dl>{[['图片张数',log.usage?.images],['音视频秒数',log.usage?.seconds],['合成字符数',log.usage?.characters]].map(([name,value])=><div key={name}><dt>{name}</dt><dd>{number(value)}</dd></div>)}</dl></section><section className="cl-detail-section"><h3>时延与完成状态</h3><dl className="cl-metrics"><div><dt>首 Token 时延</dt><dd>{duration(log.first)}</dd></div><div><dt>总时延</dt><dd>{duration(log.duration)}</dd></div><div><dt>每 Token 输出时延</dt><dd>{duration(log.tpot)}</dd></div></dl><dl><div><dt>是否超时</dt><dd>{log.isTimeout == null ? '—' : log.isTimeout ? '是' : '否'}</dd></div><div><dt>是否取消</dt><dd>{log.isCanceled == null ? '—' : log.isCanceled ? '是' : '否'}</dd></div></dl></section>
        <details className="cl-more"><summary>调度过程</summary>{(log.stages || []).map((stage, index) => <p key={index}>{stage.name}：{stage.result}</p>)}</details><details className="cl-more"><summary>接口与客户端</summary><dl><div><dt>接口路径</dt><dd>{log.api ?? (log.projectId ? '未记录' : '/v1/chat/completions')}</dd></div><div><dt>协议</dt><dd>{log.stream ? 'SSE' : 'HTTP'}</dd></div><div><dt>User-Agent</dt><dd>{log.userAgent ?? '—'}</dd></div></dl></details>
        <details className="cl-more"><summary>请求与响应内容</summary><dl><div><dt>请求内容</dt><dd>{log.requestBody ?? '未采集'}</dd></div><div><dt>响应内容</dt><dd>{log.responseBody ?? '未采集'}</dd></div></dl></details>
      </Tabs.Content>
      <Tabs.Content value="json" className="cl-detail-scroll cl-json-panel"><JSONCode text={json} wrap={wrap} /></Tabs.Content>
    </Tabs.Root>
    <div role="status" className="cl-feedback">{notice}</div>
  </dialog>;
}

export default function CallLogs({ billing = '全部', records: suppliedRecords, scopeId = 'tenant-call-logs', initialRequest = '' }) {
  const [today] = useState(shanghaiDate);
  const [sampleRecords] = useState(() => suppliedRecords ? [] : createLogRecords(today));
  const records = suppliedRecords || sampleRecords;
  const defaults = billing === '全部' ? { ...defaultLogFilters, range:'1' } : defaultLogFilters;
  const [draft, setDraft] = useState(defaults);
  const [filters, setFilters] = useState(defaults);
  const [page, setPage] = useState(1);
  const [size, setSize] = useState(DEFAULT_PAGE_SIZE);
  const [selected, setSelected] = useState(() => records.find(row => row.id === initialRequest) || null);
  const [notice, setNotice] = useState('');
  const [dateError, setDateError] = useState('');
  const unified = billing === '全部';
  const scope = unified ? records : records.filter(log => log.billing === billing);
  const filtered = filterLogRecords(records, billing, filters, today);
  const pages = Math.max(1, Math.ceil(filtered.length / size));
  const visible = filtered.slice((page - 1) * size, page * size);
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
  return <div className="cl-page us-page">
    <FrontPageHeader title={unified ? "调用日志" : `${billing}调用日志`} description="查询模型调用记录与请求详情" icon={FileText} />
    <section className="cl-panel" aria-label={unified ? '全部调用记录' : `${billing}调用记录`}>
      <form className="cl-filters" onSubmit={query}>
        {unified ? <><FilterPresets value={draft.range} items={[["1","今日"],["yesterday","昨日"],["7","近 7 天"],["30","近 30 天"]]} onChange={range => { update('range',range);setFilters(current=>({...current,range}));setPage(1);setDateError(''); }}/><DateRange start={period.start} end={period.end} maxDays={31} onChange={value=>{setDraft(current=>({...current,...value,range:'custom'}));setFilters(current=>({...current,...value,range:'custom'}));setPage(1);setDateError('')}}/></> : <select aria-label="时间范围" value={draft.range} onChange={e => update('range', e.target.value)}><option value="7">最近 7 天</option><option value="1">今天</option><option value="30">最近 30 天</option><option value="custom">自定义时间</option></select>}
        {unified && <FilterField label="计费方式"><select aria-label="筛选计费方式" value={draft.billing} onChange={e => update('billing', e.target.value)}><option value="">全部计费方式</option><option>按量付费</option><option>Token Plan</option></select></FilterField>}
        <FilterField label="模型"><select aria-label="筛选模型" value={draft.model} onChange={e => update('model', e.target.value)}><option value="">全部模型</option>{[...new Set(scope.map(log => log.model))].map(model => <option key={model}>{model}</option>)}</select></FilterField>
        {(unified || billing !== '按量付费') && <FilterField label="套餐"><select aria-label="筛选套餐" value={draft.resource} onChange={e => update('resource', e.target.value)}><option value="">全部套餐</option>{[...new Set(scope.map(log => log.resource).filter(Boolean))].map(resource => <option key={resource}>{resource}</option>)}</select></FilterField>}
        <FilterField label="API Key"><select aria-label="筛选 API Key" value={draft.key} onChange={e => update('key', e.target.value)}><option value="">全部 API Key</option>{[...new Map(scope.filter(log => log.keyId).map(log => [log.keyId, log])).values()].map(log => <option key={log.keyId} value={log.keyId}>{log.keyName}</option>)}</select></FilterField>
        <FilterField label="请求来源"><select aria-label="请求来源" value={draft.source} onChange={e => update('source', e.target.value)}><option value="">全部来源</option><option>API 调用</option><option>模型体验</option></select></FilterField>
        <FilterField label="状态"><select aria-label="调用状态" value={draft.status} onChange={e => update('status', e.target.value)}><option value="">全部状态</option>{Object.entries(logStatuses).map(([code, [label]]) => <option key={code} value={code}>{code} · {label}</option>)}</select></FilterField>
        <div className="cl-search-group"><input aria-label="搜索 Request ID" placeholder="搜索 Request ID" value={draft.query} onChange={e => update('query', e.target.value)} /><div className="cl-actions"><IconAction label="查询" icon={Search} variant="default" type="submit" />{unified ? <FilterReset onClick={reset}/> : <IconAction label="重置筛选" icon={RotateCcw} onClick={reset} />}</div></div>
        {!unified && draft.range === 'custom' && <div className="cl-date-range"><label>开始日期<input type="date" max={draft.end || today} value={draft.start} onInput={e => update('start', e.currentTarget.value)} required /></label><span>—</span><label>结束日期<input type="date" min={draft.start} max={today} value={draft.end} onInput={e => update('end', e.currentTarget.value)} required /></label><small>北京时间 UTC+8</small></div>}
        {dateError && <p role="alert" className="cl-date-error">{dateError}</p>}
      </form>
      {unified && <div className="cl-view-row"><SavedFilterViews scope={scopeId} saveDescription="保存当前已应用的时间、计费方式、模型、套餐、API Key、请求来源、状态和 Request ID 条件；查询草稿不包含在视图中。保存后可快速应用已保存的筛选条件。" value={filters} onApply={value => { if (!value || !['1','yesterday','7','30','custom'].includes(value.range) || value.range === 'custom' && !validAnalyticsRange(value.start,value.end,'day',Date.now(),31)) return; const next = restoreLogFilters(value, defaults, records); setFilters(next); setDraft(next); setPage(1); setDateError(''); }} summary={viewConditions.join(' · ')} preview={viewPreview} conditions={viewConditions}/></div>}
      <div className="cl-table-tools"><span>请求记录 <b>{filtered.length}</b></span><span className="cl-feedback" role="status">{notice}</span><IconAction label="导出筛选结果" icon={Download} disabled={!filtered.length} onClick={() => { saveFile(logsCSV(filtered), `${unified ? '' : `${billing}-`}调用日志.csv`, 'text/csv;charset=utf-8'); setNotice(`已导出 ${filtered.length} 条记录`); }} /></div>
      <div className="cl-table-note">单位：Tokens / ms；缓存命中包含在输入中，缺失字段显示 —。</div>
      <div className="cl-table-scroll" tabIndex={0} aria-label="调用日志表格，可横向滚动"><table className="cl-table cl-audit-table"><thead><tr>{['请求时间', 'Request ID', '模型 ID', '服务 / 套餐', 'API Key', '状态码', '输入 Tokens', '输出 Tokens', '缓存命中 Tokens', '首 Token 时延', '总时延', '操作'].map(label => <th key={label} scope="col">{label}</th>)}</tr></thead><tbody>
        {visible.map(log => <tr key={log.id}>
          <td><time dateTime={log.time.replace(' ', 'T') + '+08:00'}>{log.time.slice(0, 10)}<small>{log.time.slice(11, 19)}</small></time></td>
          <td><div className="cl-id"><button type="button" className="cl-request-link" title={log.id} aria-label={`查看请求 ${log.id}`} onClick={() => setSelected(log)}><code>{log.id.slice(0, 8)}…{log.id.slice(-4)}</code></button><IconAction label={`复制 Request ID ${log.id}`} icon={Copy} size="icon-xs" onClick={() => copyId(log.id)} /></div></td>
          <td>{log.model}</td>
          <td>{log.resource || log.endpointName || '—'}<small>{log.billing}{(log.resourceId || log.endpointId) && ` · ${log.resourceId || log.endpointId}`}</small></td>
          <td><code>{log.apiKey === '系统托管' ? '系统托管' : maskApiKey(log.apiKey)}</code></td>
          <td><span className={`cl-status ${log.status === 200 ? 'cl-success' : 'cl-failed'}`} title={logStatuses[log.status]?.[0] || '未知状态'}>{log.status}</span></td>
          {[log.input, log.output, log.cache].map((value, index) => <td className="cl-numeric" key={index} title={value == null ? '本次请求未返回此用量字段' : undefined}>{number(value)}</td>)}
          <td className="cl-numeric" title="首 Token 时延，单位 ms">{number(log.first)}</td><td className="cl-numeric" title="请求端到端时延，单位 ms">{number(log.duration)}</td>
          <td><IconAction label={`查看请求详情 ${log.id}`} icon={Eye} onClick={() => setSelected(log)} /></td>
        </tr>)}
        {!visible.length && <tr><td colSpan={12}><div className="cl-empty"><FileSearch aria-hidden="true" /><strong>暂无符合条件的调用日志</strong><p>试试调整时间范围或清除筛选条件。</p><Button variant="outline" onClick={reset}>重置筛选</Button></div></td></tr>}
      </tbody></table></div>
      <div className="cl-pagination"><span>共 {filtered.length} 条</span><div><select aria-label="每页条数" value={size} onChange={event => { setSize(Number(event.target.value)); setPage(1); }}>{PAGE_SIZES.map(value => <option key={value} value={value}>{value} 条 / 页</option>)}</select><IconAction label="上一页" icon={ChevronLeft} disabled={page <= 1} onClick={() => setPage(page - 1)} /><span aria-live="polite">{page} / {pages}</span><IconAction label="下一页" icon={ChevronRight} disabled={page >= pages} onClick={() => setPage(page + 1)} /></div></div>
    </section>
    {selected && <LogDetail log={selected} onClose={() => setSelected(null)} />}
  </div>;
}
