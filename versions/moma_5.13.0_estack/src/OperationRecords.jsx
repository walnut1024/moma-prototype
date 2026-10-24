import { useState } from 'react';
import { Download, History, RefreshCw } from 'lucide-react';
import FrontPageHeader from './components/FrontPageHeader';
import { Button } from './components/ui/button';
import { Input } from './components/ui/input';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from './components/ui/table';
import { DEFAULT_PAGE_SIZE, FilterPagination, FilterReset } from './components/FilterControls';
import { ORGANIZATION_STORAGE_KEY } from './organization-data.mjs';
import { displayBusinessCopy } from './display-copy.mjs';
import { filterOperationRecords, operationRecordsCsv, readOperationRecords } from './operation-records.mjs';

function load() {
  try { return { records: readOperationRecords(localStorage, ORGANIZATION_STORAGE_KEY), error: '' }; }
  catch { return { records: [], error: '操作记录读取失败，请刷新后重试。' }; }
}

export default function OperationRecords() {
  const [data, setData] = useState(load);
  const [filters, setFilters] = useState({ query: '', start: '', end: '' });
  const [page, setPage] = useState(1);
  const [size, setSize] = useState(DEFAULT_PAGE_SIZE);
  const records = data.records.map(record => ({ ...record, description: displayBusinessCopy(record.description) }));
  const filtered = filterOperationRecords(records, filters);
  const invalidRange = filters.start && filters.end && filters.start > filters.end;
  const update = value => { setFilters(current => ({ ...current, ...value })); setPage(1); };
  const reset = () => { setFilters({ query: '', start: '', end: '' }); setPage(1); };
  const exportRecords = () => {
    const url = URL.createObjectURL(new Blob([operationRecordsCsv(filtered)], { type: 'text/csv;charset=utf-8' }));
    const anchor = document.createElement('a'); anchor.href = url; anchor.download = '操作记录.csv'; anchor.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  };
  return <div className="operation-page">
    <FrontPageHeader title="操作记录" description="查看组织架构、成员归属与管理权限的变更记录，保留最近 200 条" icon={History} />
    <section className="operation-panel" aria-label="操作记录列表">
      <div className="operation-filters">
        <Input className="operation-search" aria-label="搜索操作记录" placeholder="搜索操作人、操作内容" value={filters.query} onChange={event => update({ query: event.target.value })} />
        <div className="operation-dates"><span>操作日期</span><Input type="date" aria-label="操作开始日期" value={filters.start} max={filters.end || undefined} onChange={event => update({ start: event.target.value })} /><span>—</span><Input type="date" aria-label="操作结束日期" value={filters.end} min={filters.start || undefined} onChange={event => update({ end: event.target.value })} /></div>
        <FilterReset onClick={reset} />
        <Button variant="outline" size="icon" aria-label="刷新操作记录" title="刷新操作记录" onClick={() => { setData(load()); setPage(1); }}><RefreshCw /></Button>
        <Button variant="outline" size="icon" aria-label="导出操作记录" title="导出操作记录" disabled={!!data.error || !!invalidRange || !filtered.length} onClick={exportRecords}><Download /></Button>
      </div>
      {(data.error || invalidRange) && <p className="operation-error" role="alert">{data.error || '开始日期不能晚于结束日期，请调整日期范围。'}</p>}
      <div className="operation-table-scroll"><Table className="operation-table"><TableHeader><TableRow>{['操作时间', '操作人', '功能', '操作内容'].map(label => <TableHead key={label}>{label}</TableHead>)}</TableRow></TableHeader><TableBody>
        {!data.error && !invalidRange && filtered.slice((page - 1) * size, page * size).map((record, index) => <TableRow key={record.id || `${record.time}-${index}`}><TableCell>{record.time}</TableCell><TableCell>{record.actor || '—'}</TableCell><TableCell>组织及成员</TableCell><TableCell>{record.description}</TableCell></TableRow>)}
        {!data.error && !invalidRange && !filtered.length && <TableRow><TableCell colSpan={4}><div className="operation-empty"><History aria-hidden="true" className="mx-auto mb-3 size-6" /><strong>{records.length ? '没有匹配的操作记录' : '暂无操作记录'}</strong><p>{records.length ? '调整搜索或日期条件后重试。' : '组织架构和成员信息发生变更后，记录会显示在这里。'}</p>{records.length > 0 && <Button variant="outline" onClick={reset}>重置筛选</Button>}</div></TableCell></TableRow>}
      </TableBody></Table></div>
      <FilterPagination total={invalidRange || data.error ? 0 : filtered.length} page={page} size={size} onPageChange={setPage} onSizeChange={value => { setSize(value); setPage(1); }} />
    </section>
  </div>;
}
