import { useChannelText } from '../admin-v2/channel-language';
import { lazy, Suspense, useContext } from 'react';
import { Button, Pagination } from '@douyinfe/semi-ui';
import { AdminUIContext } from './admin-ui-context';
import './filter-controls.css';

const WorkbenchButton = lazy(() => import('../admin-v2/xa24/HaloComponents.jsx').then(module => ({ default: module.XaButton })));

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
  const PresetButton = admin ? WorkbenchButton : Button;
  const controls = items.map(([id, text]) => <PresetButton key={id} theme={value === id ? 'solid' : 'light'}
    aria-pressed={value === id} onClick={() => onChange(id)}>{text}</PresetButton>);
  return <div className={classes} role="group" aria-label={label}>
    {admin ? <Suspense fallback={null}>{controls}</Suspense> : controls}
    {children}
  </div>;
}

export function FilterReset({ onClick, label = '重置筛选' }) {
  const t = useChannelText();
  const admin = useContext(AdminUIContext);
  if (admin) return <Suspense fallback={null}>
    <WorkbenchButton type="tertiary" theme="borderless" onClick={onClick}>{t(label)}</WorkbenchButton>
  </Suspense>;
  return <Button type="tertiary" theme="borderless" size="small" className="filter-reset" onClick={onClick}>{t(label)}</Button>;
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
