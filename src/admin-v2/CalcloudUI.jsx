import { useEffect, useId, useRef, useState } from 'react';
import { toast } from 'sonner';
import { Info, RefreshCw, X, ChevronsUpDown, Check as CheckIcon } from 'lucide-react';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../components/ui/select';
import { Checkbox } from '../components/ui/checkbox';
import { Popover, PopoverTrigger, PopoverContent } from '../components/ui/popover';
import { Command, CommandInput, CommandList, CommandItem, CommandEmpty } from '../components/ui/command';
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from '../components/ui/table';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '../components/ui/dialog';
import { Tooltip, TooltipContent, TooltipTrigger } from '../components/ui/tooltip';
import { FilterPagination } from '../components/FilterControls';
import { TimeSeriesChart } from '../components/AnalyticsCharts';
import { CALCLOUD_STORAGE_KEY, createCalcloudSeed, calcloudTransaction } from './calcloud-domain.mjs';

export const number = value => Number.isFinite(value) ? value.toLocaleString('zh-CN', { maximumFractionDigits: 2 }) : '—';
export const money = value => Number.isFinite(value) ? `¥${value.toLocaleString('zh-CN', { minimumFractionDigits: 2, maximumFractionDigits: 4 })}` : '—';
export const time = value => value && Number.isFinite(Date.parse(value)) ? new Date(value).toLocaleString('zh-CN', { timeZone: 'Asia/Shanghai', hour12: false }) : '—';
export function Field({ label, required, children, wide }) {
  return <div className={`cc-field${wide ? ' cc-wide' : ''}`}><span>{label}{required && <b aria-label="必填"> *</b>}</span>{children}</div>;
}
export function TextField({ label, value, onChange, required, ...props }) {
  const id = useId();
  return <div className="cc-field"><label htmlFor={id}>{label}{required && <b> *</b>}</label><Input id={id} value={value ?? ''} onChange={e => onChange(e.target.value)} required={required} {...props}/></div>;
}
export function Choice({ label, value, options, onChange, all = false, disabled }) {
  return <Select value={value || (all ? '__all' : '')} onValueChange={v => onChange(v === '__all' ? '' : v)} disabled={disabled}><SelectTrigger aria-label={label}><SelectValue placeholder={`请选择${label}`}/></SelectTrigger><SelectContent>{all && <SelectItem value="__all">全部{label}</SelectItem>}{options.map(item => { const [id, name] = Array.isArray(item) ? item : [item.id, item.name]; return <SelectItem key={id} value={String(id)}>{name}</SelectItem>; })}</SelectContent></Select>;
}
export function Check({ label, value, onChange }) {
  const id = useId(); return <div className="cc-check"><Checkbox id={id} checked={!!value} onCheckedChange={v => onChange(v === true)}/><label htmlFor={id}>{label}</label></div>;
}
export function PageHead({ title, note, children }) {
  return <div className="cc-head"><div><h1>{title}</h1>{note && <p>{note}</p>}</div><div className="cc-actions">{children}</div></div>;
}
export function DataTable({ columns, rows, empty = '暂无符合条件的记录' }) {
  const [page, setPage] = useState(1), [size, setSize] = useState(20);
  const current = Math.min(page, Math.max(1, Math.ceil(rows.length / size)));
  return <><Table className="cc-table"><TableHeader><TableRow>{columns.map(([label]) => <TableHead key={label}>{label}</TableHead>)}</TableRow></TableHeader><TableBody>{rows.slice((current - 1) * size, current * size).map(row => <TableRow key={row.id}>{columns.map(([label, render]) => <TableCell key={label}>{render(row)}</TableCell>)}</TableRow>)}{!rows.length && <TableRow><TableCell colSpan={columns.length} className="cc-empty">{empty}</TableCell></TableRow>}</TableBody></Table><FilterPagination total={rows.length} page={current} size={size} onPageChange={setPage} onSizeChange={setSize}/></>;
}
export function Modal({ title, description = '完成配置后保存。', open, close, children, wide, drawer }) {
  return <Dialog open={open} onOpenChange={v => { if (!v) close(); }}><DialogContent showCloseButton={false} className={`cc-dialog${wide ? ' cc-dialog-wide' : ''}${drawer ? ' cc-drawer' : ''}`}><DialogHeader><DialogTitle>{title}</DialogTitle><DialogDescription>{description}</DialogDescription></DialogHeader>{children}<Button type="button" variant="ghost" size="icon-sm" className="absolute top-2 right-2" aria-label="关闭弹窗" onClick={close}><X/></Button></DialogContent></Dialog>;
}
export function FormFooter({ close, error, saving }) {
  return <><p className="cc-error" role={error ? 'alert' : undefined}>{error}</p><div className="cc-form-footer"><Button type="button" variant="outline" onClick={close}>取消</Button><Button type="submit" disabled={saving}>保存</Button></div></>;
}
export function Confirm({ target, close, run }) {
  return <Modal title="确认删除" description="删除后无法恢复；被其他配置引用的记录不能删除。" open={!!target} close={close}><p>删除“{target?.name}”？</p><DialogFooter><Button variant="outline" onClick={close}>取消</Button><Button variant="destructive" onClick={() => { if (run()) close(); }}>删除</Button></DialogFooter></Modal>;
}
export function Hint({ label, children }) {
  return <Tooltip><TooltipTrigger asChild><Button type="button" variant="ghost" size="icon-sm" aria-label={`${label}说明`}><Info size={14}/></Button></TooltipTrigger><TooltipContent className="cc-tooltip">{children}</TooltipContent></Tooltip>;
}
export function Metrics({ items }) {
  return <dl className="cc-metrics">{items.map(([label, value, hint]) => <div key={label}><dt>{label}{hint && <Hint label={label}>{hint}</Hint>}</dt><dd>{value}</dd></div>)}</dl>;
}
export function Trend({ title, labels, series, unit, hint, type = 'line', zoom = true }) {
  return <section className="cc-chart"><h2>{title}{hint && <Hint label={title}>{hint}</Hint>}</h2><TimeSeriesChart labels={labels} series={series} unit={unit} label={title} type={type} zoom={zoom} height={280}/></section>;
}
export function ModelSwitch({label,value,disabled,onChange}) {
  return <Button type="button" variant="ghost" size="sm" role="switch" aria-label={label} aria-checked={!!value} disabled={disabled} className="cc-switch" onClick={()=>onChange(!value)}><span/><span className="sr-only">{value?'已开启':'已关闭'}</span></Button>;
}
export function PickValues({label,values,options,onChange,multiple=false,creatable=false}) {
  const [open,setOpen]=useState(false),[query,setQuery]=useState('');
  const entries=[...new Set([...options,...values])].filter(Boolean),select=value=>{onChange(multiple?(values.includes(value)?values.filter(v=>v!==value):[...values,value]):[value]);if(!multiple)setOpen(false);};
  return <Popover open={open} onOpenChange={v=>{setOpen(v);setQuery('');}}><PopoverTrigger asChild><Button type="button" variant="outline" role="combobox" aria-expanded={open} aria-label={label} className="cc-picker-trigger"><span>{values.length?values.join('、'):`请选择${label}`}</span><ChevronsUpDown size={14}/></Button></PopoverTrigger><PopoverContent className="cc-picker" align="start"><Command><CommandInput placeholder={`搜索${label}`} value={query} onValueChange={setQuery}/><CommandList><CommandEmpty>无匹配选项</CommandEmpty>{entries.map(v=><CommandItem key={v} value={v} onSelect={()=>select(v)}><CheckIcon className={values.includes(v)?'opacity-100':'opacity-0'}/>{v}</CommandItem>)}{creatable&&query.trim()&&!entries.includes(query.trim())&&<CommandItem value={query} onSelect={()=>select(query.trim())}>添加“{query.trim()}”</CommandItem>}</CommandList></Command><Button type="button" variant="ghost" size="sm" onClick={()=>{onChange([]);setOpen(false);}}>清空选择</Button></PopoverContent></Popover>;
}
export function Refresh({ onClick }) { return <Button type="button" variant="outline" size="icon" aria-label="刷新" onClick={onClick}><RefreshCw/></Button>; }

function readConfig(state) {
  const raw = localStorage.getItem(CALCLOUD_STORAGE_KEY);
  if (raw === null) return { data: createCalcloudSeed(state), raw };
  const data = JSON.parse(raw);
  if (data?.version !== 1 || !['models', 'providers', 'routes', 'traffic'].every(key => Array.isArray(data[key]) && data[key].every(r => r && typeof r.id === 'string') && new Set(data[key].map(r => r.id)).size === data[key].length)) throw new Error('配置格式不正确，原记录已保留');
  if (!data.models.every(m => typeof m.name === 'string' && Array.isArray(m.tags) && Array.isArray(m.bindings) && m.bindings.every(b => Array.isArray(b.inputs) && Array.isArray(b.outputs) && Array.isArray(b.features) && b.custom && b.prices) && m.examples) || !data.routes.every(r => Array.isArray(r.headers) && Array.isArray(r.query) && Array.isArray(r.targets) && Array.isArray(r.fallback)) || !data.providers.every(p => typeof p.code === 'string')) throw new Error('配置字段不完整，原记录已保留');
  return { data, raw };
}
export function useCalcloudConfig(state) {
  const [loaded, setLoaded] = useState(() => { try { return readConfig(state); } catch (e) { return { error: e.message }; } });
  const [conflict, setConflict] = useState(false);
  useEffect(() => { const changed = e => { if (e.key === CALCLOUD_STORAGE_KEY) setConflict(true); }; addEventListener('storage', changed); return () => removeEventListener('storage', changed); }, []);
  const reload = () => { try { setLoaded(readConfig(state)); setConflict(false); } catch (e) { setLoaded({ error: e.message }); } };
  const run = command => {
    try {
      if (loaded.error) throw new Error(loaded.error);
      if (localStorage.getItem(CALCLOUD_STORAGE_KEY) !== loaded.raw) { setConflict(true); throw new Error('配置已在其他页面更新，请重新载入后再保存'); }
      const data = calcloudTransaction(loaded.data, command, state), raw = JSON.stringify(data);
      localStorage.setItem(CALCLOUD_STORAGE_KEY, raw); setLoaded({ data, raw }); toast.success(command.operation === 'delete' ? '已删除' : '已保存'); return true;
    } catch (e) { toast.error(e.message); return e.message; }
  };
  const banner = loaded.error || conflict ? <div className="cc-storage" role="alert">{loaded.error || '其他页面已更新配置，请先重新载入。'}<Button variant="outline" size="sm" onClick={reload}>重新载入</Button></div> : null;
  return { config: loaded.data, run, banner, reload, blocked: !!loaded.error || conflict };
}
export function useDraftGuard(dirty, discard) {
  const [pending, setPending] = useState(null), allowed = useRef(false);
  const proceed = action => { if (dirty) setPending(() => action); else action(); };
  useEffect(() => {
    if (!dirty) return;
    const leave = e => { e.preventDefault(); e.returnValue = ''; };
    const click = e => { const node = e.target.closest('.v2-sidebar button, .v2-workspace-tab-list button, .platform-header a'); if (!allowed.current && node) { e.preventDefault(); e.stopPropagation(); setPending(() => () => { allowed.current = true; node.click(); allowed.current = false; }); } };
    const hash = e => { if (allowed.current) return; e.stopImmediatePropagation(); history.replaceState(null, '', e.oldURL); setPending(() => () => { allowed.current = true; location.href = e.newURL; setTimeout(() => { allowed.current = false; }, 0); }); };
    addEventListener('beforeunload', leave); document.addEventListener('click', click, true); addEventListener('hashchange', hash, true);
    return () => { removeEventListener('beforeunload', leave); document.removeEventListener('click', click, true); removeEventListener('hashchange', hash, true); };
  }, [dirty]);
  const guard = <Modal title="放弃未保存的修改？" description="离开后，本次修改不会保存。" open={!!pending} close={() => setPending(null)}><DialogFooter><Button variant="outline" onClick={() => setPending(null)}>继续编辑</Button><Button onClick={() => { const action = pending; setPending(null); discard(); allowed.current = true; action(); setTimeout(() => { allowed.current = false; }, 0); }}>放弃修改</Button></DialogFooter></Modal>;
  return { proceed, guard };
}
