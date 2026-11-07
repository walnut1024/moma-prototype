import { useId, useState } from 'react';
import { Button, Empty, InputNumber, Select, Space, Table, Typography } from '@douyinfe/semi-ui';
import { IconChevronLeft, IconChevronRight } from '@douyinfe/semi-icons';
import './admin-table.css';

export function AdminPagination({
  total = 0, currentPage = 1, pageSize = 10, pageSizeOpts = [10, 20, 40, 100],
  showSizeChanger = false, hideOnSinglePage = false, disabled, className = '',
  onPageChange, onPageSizeChange, onChange,
}) {
  const sizeLabel = useId();
  const [draftPage, setDraftPage] = useState(null);
  const pages = Math.max(1, Math.ceil(total / pageSize));
  const current = Math.min(Math.max(1, currentPage), pages);
  const showControls = showSizeChanger || !hideOnSinglePage || pages > 1;
  const changePage = page => {
    setDraftPage(null);
    if (!Number.isInteger(page) || page < 1 || page > pages || page === current) return;
    onPageChange?.(page);
    onChange?.(page, pageSize);
  };
  const changeSize = size => {
    if (size === pageSize) return;
    setDraftPage(null);
    onPageSizeChange?.(size);
    onChange?.(1, size);
  };

  return <div className={`admin-pagination ${className}`} role="group" aria-label="分页">
    <Typography.Text type="tertiary">共 {total} 条</Typography.Text>
    {showControls && <Space wrap>
      <Button theme="borderless" type="tertiary" size="small" aria-label="上一页"
        icon={<IconChevronLeft aria-hidden="true"/>} disabled={disabled || current === 1} onClick={() => changePage(current - 1)}/>
      {pages > 1 && <InputNumber className="admin-page-number" size="small" hideButtons min={1} max={pages}
        aria-label="跳转页码" value={draftPage ?? current} disabled={disabled}
        onChange={setDraftPage} onBlur={() => setDraftPage(null)} onKeyDown={event => {
          if (event.key !== 'Enter') return;
          event.preventDefault();
          changePage(Number(event.target.value));
        }}/>}
      <Typography.Text aria-live="polite" className={pages > 1 ? 'sr-only' : undefined}>{current} / {pages}</Typography.Text>
      {pages > 1 && <Typography.Text aria-hidden="true">/ {pages}</Typography.Text>}
      <Button theme="borderless" type="tertiary" size="small" aria-label="下一页"
        icon={<IconChevronRight aria-hidden="true"/>} disabled={disabled || current === pages} onClick={() => changePage(current + 1)}/>
      {showSizeChanger && <>
        <span id={sizeLabel} className="sr-only">每页条数</span>
        <Select aria-labelledby={sizeLabel} size="small" value={pageSize} disabled={disabled} onChange={changeSize}
          optionList={[...new Set([...pageSizeOpts, pageSize])].map(value => ({ value, label: `${value} 条 / 页` }))}/>
      </>}
    </Space>}
  </div>;
}

const renderPagination = pagination => <AdminPagination {...pagination}/>;

export default function AdminTable({ empty = '暂无数据', size = 'small', ...props }) {
  return <Table {...props} size={size} renderPagination={renderPagination}
    empty={typeof empty === 'string' && empty.trim() ? <Empty description={empty}/> : empty}/>;
}
