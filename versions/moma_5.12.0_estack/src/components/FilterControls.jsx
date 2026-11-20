import { useContext } from 'react';
import { Button, Pagination } from '@douyinfe/semi-ui';
import { AdminUIContext } from './admin-ui-context';
import './filter-controls.css';

export const PAGE_SIZES = [20, 50, 100];
export const DEFAULT_PAGE_SIZE = 20;
export const normalizePageSize = value => PAGE_SIZES.includes(Number(value)) ? Number(value) : DEFAULT_PAGE_SIZE;

export const TIME_PRESETS = [['today', '今日'], ['yesterday', '昨日'], ['7d', '近 7 天'], ['30d', '近 30 天']];

export function FilterToolbar({ children, className = '' }) {
  const admin = useContext(AdminUIContext);
  if (admin) return <div className={`admin-filter-toolbar ${className}`.trim()} role="group" aria-label="筛选条件">{children}</div>;
  return <div className={`filter-toolbar ${className}`.trim()} role="group" aria-label="筛选条件">{children}</div>;
}

export function FilterPresets({ label = '时间筛选', value, onChange, items = TIME_PRESETS, children, className = '' }) {
  const admin = useContext(AdminUIContext);
  const classes = admin ? 'admin-time-presets' : `filter-presets ${className}`.trim();
  return <div className={classes} role="group" aria-label={label}>
    {items.map(([id, text]) => <Button key={id} theme={value === id ? 'solid' : 'light'}
      aria-pressed={value === id} onClick={() => onChange(id)}>{text}</Button>)}
    {children}
  </div>;
}

export function FilterReset({ onClick }) {
  const admin = useContext(AdminUIContext);
  return <Button type="tertiary" theme="borderless" size={admin ? 'default' : 'small'}
    className={admin ? undefined : 'filter-reset'} onClick={onClick}>重置筛选</Button>;
}

export function FilterField({ label, labelId, children, className = '' }) {
  return <div className={`filter-field ${className}`.trim()}><span id={labelId}>{label}</span>{children}</div>;
}

export function FilterViewRow({ children, className = '' }) {
  return <div className={`filter-view-row ${className}`.trim()}>{children}</div>;
}

export function FilterPagination({ total, page, size, onPageChange, onSizeChange }) {
  const current = Math.min(page, Math.max(1, Math.ceil(total / size)));
  return <div className="filter-pagination"><span>共 {total} 条</span>
    {total > 0 && <Pagination total={total} currentPage={current} pageSize={size} size="small"
      showSizeChanger pageSizeOpts={PAGE_SIZES} preventPageChangeOnPageSizeChange
      onPageChange={onPageChange} onPageSizeChange={onSizeChange} />}
  </div>;
}
