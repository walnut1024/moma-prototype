import { useEffect, useRef, useState } from 'react';
import { Tabs } from 'radix-ui';
import { ChevronLeft, ChevronRight, Copy, Download, Eye, FileSearch, Maximize2, Minimize2, RotateCcw, Search, WrapText, X } from 'lucide-react';
import { Button } from './components/ui/button';
import { createLogRecords, defaultLogFilters, filterLogRecords, logJSON, logStatuses, logsCSV, shanghaiDate } from './call-log-data.mjs';

function IconAction({ label, icon: Icon, ...props }) {
  return <Button type="button" variant="ghost" size="icon" title={label} aria-label={label} {...props}><Icon aria-hidden="true" /></Button>;
}

function saveFile(content, name, type) {
  const url = URL.createObjectURL(new Blob([content], { type }));
  const anchor = document.createElement('a');
  anchor.href = url; anchor.download = name; anchor.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

const number = value => value === null ? '—' : value.toLocaleString('en-US');
const duration = value => value === null ? '—' : value < 1000 ? `${value} ms` : `${(value / 1000).toFixed(2)} s`;

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
  const [status, error, suggestion] = logStatuses[log.status];
  const json = logJSON(log);
  return <dialog ref={dialog} className={`cl-drawer ${expanded ? 'cl-expanded' : ''}`} aria-labelledby="cl-detail-title" onCancel={onClose} onClick={event => { if (event.target === event.currentTarget && event.clientX < event.currentTarget.getBoundingClientRect().left) onClose(); }}>
    <div className="cl-drawer-head"><div><h2 id="cl-detail-title">请求详情</h2><p>{log.billing} · {log.source}</p></div><div className="cl-actions"><IconAction label={expanded ? '收起详情' : '展开详情'} icon={expanded ? Minimize2 : Maximize2} onClick={() => setExpanded(!expanded)} /><IconAction label="关闭详情" icon={X} onClick={onClose} /></div></div>
    <div className="cl-request-id"><span>Request ID</span><code>{log.id}</code><IconAction label="复制 Request ID" icon={Copy} onClick={() => copy(log.id)} /></div>
    <Tabs.Root className="cl-detail-tabs" value={tab} onValueChange={value => { setTab(value); setNotice(''); }}>
      <div className="cl-tabbar"><Tabs.List aria-label="详情视图"><Tabs.Trigger value="overview">概览</Tabs.Trigger><Tabs.Trigger value="json">JSON</Tabs.Trigger></Tabs.List>{tab === 'json' && <div className="cl-actions"><IconAction label="自动换行" icon={WrapText} aria-pressed={wrap} onClick={() => setWrap(!wrap)} /><IconAction label="复制 JSON" icon={Copy} onClick={() => copy(json)} /><IconAction label="下载 JSON" icon={Download} onClick={() => saveFile(json, `${log.id}.json`, 'application/json;charset=utf-8')} /></div>}</div>
      <Tabs.Content value="overview" className="cl-detail-scroll">
        <section className={`cl-result ${log.status === 200 ? '' : 'cl-error'}`}><strong><span className="cl-dot" />{log.status} · {status}</strong>{error && <><code>{error}</code><p>{suggestion}</p></>}</section>
        <section className="cl-detail-section"><h3>基本信息</h3><dl>{[['请求时间', log.time], ['模型', log.model], ['请求来源', log.source], ['API Key', log.keyName ? `${log.keyName}（${log.keyId}）` : '不适用'], ...(log.resource ? [[log.billing === 'Token Plan' ? '所属套餐' : '所属资源包', log.resource]] : []), ['调用方式', log.stream ? '流式' : '非流式']].map(([label, value]) => <div key={label}><dt>{label}</dt><dd>{value}</dd></div>)}</dl></section>
        <section className="cl-detail-section"><h3>Token 用量</h3>{log.total === null ? <p className="cl-muted">本次请求未返回用量信息</p> : <><dl className="cl-metrics">{[['输入', log.input], ['输出', log.output], ['合计', log.total]].map(([label, value]) => <div key={label}><dt>{label}</dt><dd>{number(value)}</dd></div>)}</dl><p className="cl-muted">缓存命中 {number(log.cache)}，已包含在输入中{log.billing === 'Token Plan' ? '。Token 用量不等同于套餐额度扣减。' : ''}</p></>}</section>
        <section className="cl-detail-section"><h3>性能信息</h3><dl className="cl-metrics"><div><dt>首 Token 耗时</dt><dd>{duration(log.first)}</dd>{log.first === null && <small>未产生首 Token</small>}</div><div><dt>总耗时</dt><dd>{duration(log.duration)}</dd></div></dl></section>
        <details className="cl-more"><summary>更多信息</summary><dl><div><dt>接口路径</dt><dd>/v1/chat/completions</dd></div><div><dt>协议</dt><dd>{log.stream ? 'SSE' : 'HTTP'}</dd></div></dl></details>
      </Tabs.Content>
      <Tabs.Content value="json" className="cl-detail-scroll cl-json-panel"><JSONCode text={json} wrap={wrap} /></Tabs.Content>
    </Tabs.Root>
    <div role="status" className="cl-feedback">{notice}</div>
  </dialog>;
}

export default function CallLogs({ billing = '全部' }) {
  const [today] = useState(shanghaiDate);
  const [records] = useState(() => createLogRecords(today));
  const [draft, setDraft] = useState(defaultLogFilters);
  const [filters, setFilters] = useState(defaultLogFilters);
  const [page, setPage] = useState(1);
  const [size, setSize] = useState(10);
  const [selected, setSelected] = useState(null);
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
    if (draft.range === 'custom' && (!draft.start || !draft.end || draft.start > draft.end)) { setDateError('请选择有效的起止日期，开始日期不能晚于结束日期。'); return; }
    setDateError(''); setNotice(''); setFilters({ ...draft }); setPage(1);
  }
  function reset() { setDraft(defaultLogFilters); setFilters(defaultLogFilters); setPage(1); setDateError(''); setNotice(''); }
  async function copyId(id) {
    try { await navigator.clipboard.writeText(id); setNotice('Request ID 已复制'); }
    catch { setNotice('复制失败，请在详情中选中 Request ID 后手动复制'); }
  }
  return <div className="cl-page us-page">
    <div className="us-title"><div><h1>{unified ? '调用日志' : `${billing}调用日志`}</h1><p>查询模型调用记录与请求详情</p></div><span className="cl-demo">演示数据</span></div>
    <section className="cl-panel" aria-label={unified ? '全部调用记录' : `${billing}调用记录`}>
      <form className="cl-filters" onSubmit={query}>
        <select aria-label="时间范围" value={draft.range} onChange={e => update('range', e.target.value)}><option value="7">最近 7 天</option><option value="1">今天</option><option value="30">最近 30 天</option><option value="custom">自定义时间</option></select>
        {unified && <select aria-label="筛选计费方式" value={draft.billing} onChange={e => update('billing', e.target.value)}><option value="">全部计费方式</option><option>按量付费</option><option>Token Plan</option><option>资源包</option></select>}
        <select aria-label="筛选模型" value={draft.model} onChange={e => update('model', e.target.value)}><option value="">全部模型</option>{[...new Set(scope.map(log => log.model))].map(model => <option key={model}>{model}</option>)}</select>
        {(unified || billing !== '按量付费') && <select aria-label="筛选套餐或资源包" value={draft.resource} onChange={e => update('resource', e.target.value)}><option value="">全部套餐/资源包</option>{[...new Set(scope.map(log => log.resource).filter(Boolean))].map(resource => <option key={resource}>{resource}</option>)}</select>}
        <select aria-label="筛选 API Key" value={draft.key} onChange={e => update('key', e.target.value)}><option value="">全部 API Key</option>{[...new Map(scope.filter(log => log.keyId).map(log => [log.keyId, log])).values()].map(log => <option key={log.keyId} value={log.keyId}>{log.keyName}</option>)}</select>
        <select aria-label="请求来源" value={draft.source} onChange={e => update('source', e.target.value)}><option value="">全部来源</option><option>API 调用</option><option>模型体验</option></select>
        <select aria-label="调用状态" value={draft.status} onChange={e => update('status', e.target.value)}><option value="">全部状态</option>{Object.entries(logStatuses).map(([code, [label]]) => <option key={code} value={code}>{code} · {label}</option>)}</select>
        <div className="cl-search-group"><input aria-label="搜索 Request ID" placeholder="搜索 Request ID" value={draft.query} onChange={e => update('query', e.target.value)} /><div className="cl-actions"><IconAction label="查询" icon={Search} variant="default" type="submit" /><IconAction label="重置筛选" icon={RotateCcw} onClick={reset} /></div></div>
        {draft.range === 'custom' && <div className="cl-date-range"><label>开始日期<input type="date" max={draft.end || today} value={draft.start} onInput={e => update('start', e.currentTarget.value)} required /></label><span>—</span><label>结束日期<input type="date" min={draft.start} max={today} value={draft.end} onInput={e => update('end', e.currentTarget.value)} required /></label><small>北京时间 UTC+8</small></div>}
        {dateError && <p role="alert" className="cl-date-error">{dateError}</p>}
      </form>
      <div className="cl-table-tools"><span>请求记录 <b>{filtered.length}</b></span><span className="cl-feedback" role="status">{notice}</span><IconAction label="导出筛选结果" icon={Download} disabled={!filtered.length} onClick={() => { saveFile(logsCSV(filtered), `${unified ? '' : `${billing}-`}调用日志.csv`, 'text/csv;charset=utf-8'); setNotice(`已导出 ${filtered.length} 条记录`); }} /></div>
      <div className="cl-table-scroll" tabIndex={0} aria-label="调用日志表格，可横向滚动"><table className="cl-table"><thead><tr>{['Request ID', '请求时间', '模型', ...(unified ? ['计费方式'] : []), ...(unified || billing !== '按量付费' ? ['套餐/资源包'] : []), '请求来源', 'API Key', 'Token 用量', '首 Token 耗时', '总耗时', '状态', '操作'].map(label => <th key={label} scope="col">{label}</th>)}</tr></thead><tbody>
        {visible.map(log => <tr key={log.id}><td><div className="cl-id"><code title={log.id}>{log.id.slice(0, 8)}…{log.id.slice(-4)}</code><IconAction label={`复制 Request ID ${log.id}`} icon={Copy} size="icon-xs" onClick={() => copyId(log.id)} /></div></td><td><time dateTime={log.time.replace(' ', 'T') + '+08:00'}>{log.time.slice(0, 10)}<small>{log.time.slice(11, 19)}</small></time></td><td>{log.model}</td>{unified && <td>{log.billing}</td>}{(unified || billing !== '按量付费') && <td>{log.resource || '—'}</td>}<td>{log.source}</td><td>{log.keyName || <span className="cl-muted">不适用</span>}{log.keyId && <small>{log.keyId}</small>}</td><td title={log.total === null ? '本次请求未返回用量信息' : undefined}><b className="cl-total">{number(log.total)}</b>{log.total !== null && <small>输入 {number(log.input)} · 输出 {number(log.output)}</small>}</td><td title={log.first === null ? '未产生首 Token' : undefined}>{duration(log.first)}</td><td>{duration(log.duration)}</td><td><span className={`cl-status ${log.status === 200 ? 'cl-success' : 'cl-failed'}`} title={logStatuses[log.status][0]}><span className="cl-dot" />{log.status}<span className="sr-only"> {logStatuses[log.status][0]}</span></span></td><td><IconAction label={`查看请求详情 ${log.id}`} icon={Eye} onClick={() => setSelected(log)} /></td></tr>)}
        {!visible.length && <tr><td colSpan={10 + Number(unified) + Number(unified || billing !== '按量付费')}><div className="cl-empty"><FileSearch aria-hidden="true" /><strong>暂无符合条件的调用日志</strong><p>试试调整时间范围或清除筛选条件。</p><Button variant="outline" onClick={reset}>重置筛选</Button></div></td></tr>}
      </tbody></table></div>
      <div className="cl-pagination"><span>共 {filtered.length} 条</span><div><select aria-label="每页条数" value={size} onChange={event => { setSize(Number(event.target.value)); setPage(1); }}><option value="10">10 条 / 页</option><option value="20">20 条 / 页</option></select><IconAction label="上一页" icon={ChevronLeft} disabled={page <= 1} onClick={() => setPage(page - 1)} /><span aria-live="polite">{page} / {pages}</span><IconAction label="下一页" icon={ChevronRight} disabled={page >= pages} onClick={() => setPage(page + 1)} /></div></div>
    </section>
    {selected && <LogDetail log={selected} onClose={() => setSelected(null)} />}
  </div>;
}
