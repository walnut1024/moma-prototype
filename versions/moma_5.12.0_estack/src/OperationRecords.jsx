import { useState } from 'react';
import { Banner, Button, DatePicker, Empty, Input, Table } from '@douyinfe/semi-ui';
import { Download, RefreshCw } from 'lucide-react';
import { projectTime } from './components/ProjectConfiguration';
import { AdminPagination } from './admin-v2/AdminTable';
import { DEFAULT_PAGE_SIZE, PAGE_SIZES } from './components/FilterControls';
import { displayBusinessCopy } from './display-copy.mjs';
import { filterOperationRecords, operationRecordsCsv } from './operation-records.mjs';

const columns = [
  { title: '操作时间', dataIndex: 'time', width: 190, render: projectTime },
  { title: '操作人', dataIndex: 'actor', width: 120, render: actor => actor || '—' },
  { title: '功能', width: 120, render: () => '组织及成员' },
  { title: '操作内容', dataIndex: 'description' },
];

const dateText = date => {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
};

export default function OperationRecords({ tenant }) {
  const data={records:tenant.organization.audit,error:tenant.error};
  const [filters, setFilters] = useState({ query: '', start: '', end: '' });
  const [page, setPage] = useState(1);
  const [size, setSize] = useState(DEFAULT_PAGE_SIZE);
  const records = data.records.map((record, index) => ({
    ...record, rowKey: record.id || `${record.time}-${index}`, description: displayBusinessCopy(record.description),
  }));
  const filtered = filterOperationRecords(records, filters);
  const invalidRange = filters.start && filters.end && filters.start > filters.end;
  const error = data.error || (invalidRange ? '开始日期不能晚于结束日期，请调整日期范围。' : '');
  const total = error ? 0 : filtered.length;
  const currentPage = Math.min(page, Math.max(1, Math.ceil(total / size)));
  const visible = error ? [] : filtered.slice((currentPage - 1) * size, currentPage * size);
  const update = value => { setFilters(current => ({ ...current, ...value })); setPage(1); };
  const reset = () => { setFilters({ query: '', start: '', end: '' }); setPage(1); };
  const exportRecords = () => {
    const url = URL.createObjectURL(new Blob([operationRecordsCsv(filtered)], { type: 'text/csv;charset=utf-8' }));
    const anchor = document.createElement('a'); anchor.href = url; anchor.download = '操作记录.csv'; anchor.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  };
  return <div className="operation-page">
    <section className="operation-panel" aria-label="操作记录列表">
      <div className="operation-filters">
        <Input className="operation-search" aria-label="搜索操作记录" placeholder="搜索操作人、操作内容" value={filters.query} onChange={query => update({ query })} showClear />
        <div className="operation-dates">
          <span>操作日期</span>
          <span id="operation-start-label" className="sr-only">操作开始日期</span>
          <DatePicker aria-labelledby="operation-start-label" placeholder="开始日期" format="yyyy-MM-dd" value={filters.start || null} showClear
            disabledDate={date => Boolean(filters.end && dateText(date) > filters.end)}
            onChange={(_, start) => update({ start: start || '' })} />
          <span aria-hidden="true">—</span>
          <span id="operation-end-label" className="sr-only">操作结束日期</span>
          <DatePicker aria-labelledby="operation-end-label" placeholder="结束日期" format="yyyy-MM-dd" value={filters.end || null} showClear
            disabledDate={date => Boolean(filters.start && dateText(date) < filters.start)}
            onChange={(_, end) => update({ end: end || '' })} />
        </div>
        <Button type="tertiary" theme="borderless" onClick={reset}>重置筛选</Button>
        <Button type="tertiary" aria-label="刷新操作记录" title="刷新操作记录" icon={<RefreshCw size={16} aria-hidden="true" />} onClick={() => { tenant.reload(); setPage(1); }} />
        <Button type="tertiary" aria-label="导出操作记录" title="导出操作记录" icon={<Download size={16} aria-hidden="true" />} disabled={!total} onClick={exportRecords} />
      </div>
      {error && <Banner type="danger" description={error} closeIcon={null} />}
      <div className="operation-table-scroll" tabIndex={visible.length ? 0 : undefined} aria-label="操作记录表格，可横向滚动">
        <Table className="operation-table" columns={columns} dataSource={visible} pagination={false} size="small"
          rowKey="rowKey"
          scroll={{ x: visible.length ? 680 : undefined, y: 'max(240px, calc(100dvh - 360px))' }}
          empty={error ? null : <Empty title={records.length ? '没有匹配的操作记录' : '暂无操作记录'}
            description={records.length ? '调整搜索或日期条件后重试。' : '组织架构和成员信息发生变更后，记录会显示在这里。'}>
            {records.length > 0 && <Button theme="light" onClick={reset}>重置筛选</Button>}
          </Empty>} />
      </div>
      <AdminPagination className="operation-pagination" total={total} currentPage={currentPage} pageSize={size} pageSizeOpts={PAGE_SIZES}
        showSizeChanger onPageChange={setPage} onPageSizeChange={value => { setSize(value); setPage(1); }} />
    </section>
  </div>;
}
