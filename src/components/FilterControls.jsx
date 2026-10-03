import { Button } from './ui/button';
import './filter-controls.css';

export const TIME_PRESETS = [['today', '今日'], ['yesterday', '昨日'], ['7d', '近 7 天'], ['30d', '近 30 天']];

export function FilterToolbar({ children, className = '' }) {
  return <div className={`filter-toolbar ${className}`.trim()} role="group" aria-label="筛选条件">{children}</div>;
}

export function FilterPresets({ label = '时间筛选', value, onChange, items = TIME_PRESETS, className = '' }) {
  return <div className={`filter-presets ${className}`.trim()} role="group" aria-label={label}>{items.map(([id, text]) => <Button key={id} type="button" variant={value === id ? 'default' : 'outline'} aria-pressed={value === id} onClick={() => onChange(id)}>{text}</Button>)}</div>;
}

export function FilterReset({ onClick }) {
  return <Button type="button" variant="ghost" size="sm" className="filter-reset" onClick={onClick}>重置筛选</Button>;
}

export function FilterField({ label, children, className = '' }) {
  return <div className={`filter-field ${className}`.trim()}><span>{label}</span>{children}</div>;
}

export function FilterViewRow({ children, className = '' }) {
  return <div className={`filter-view-row ${className}`.trim()}>{children}</div>;
}

export function FilterPagination({ total, page, size, onPageChange, onSizeChange }) {
  const pages = Math.max(1, Math.ceil(total / size));
  const current = Math.min(page, pages);
  return <div className="filter-pagination"><span>共 {total} 条</span><div>
    <select aria-label="每页条数" value={size} onChange={event => { onSizeChange(Number(event.target.value)); onPageChange(1); }}>
      {[10, 20, 50, 100].map(value => <option key={value} value={value}>{value} 条 / 页</option>)}
    </select>
    <Button type="button" variant="outline" size="sm" disabled={current === 1} onClick={() => onPageChange(current - 1)}>上一页</Button>
    <span aria-live="polite">{current} / {pages}</span>
    <Button type="button" variant="outline" size="sm" disabled={current === pages} onClick={() => onPageChange(current + 1)}>下一页</Button>
  </div></div>;
}
