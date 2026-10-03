import { useEffect, useState } from 'react';
import { Bookmark, ChevronDown, Trash2 } from 'lucide-react';
import { Button } from './ui/button';
import { Input } from './ui/input';
import { Popover, PopoverContent, PopoverTrigger } from './ui/popover';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from './ui/dialog';
import './saved-filter-views.css';

const signature = value => {
  const copy = { ...value };
  if (copy.preset && copy.preset !== 'custom' || copy.period && copy.period !== 'custom') delete copy.range;
  if (copy.period && copy.period !== 'custom' && copy.filters) { copy.filters = { ...copy.filters }; delete copy.filters.start; delete copy.filters.end; }
  if (['1', '7', '30'].includes(copy.range)) { delete copy.start; delete copy.end; }
  return JSON.stringify(copy);
};

function groupText(group) {
  if (!('items' in group)) return group.label ? `${group.label}：${group.text}` : group.text;
  if (group.items === null) return `${group.label}：${group.all || '全部'}`;
  if (!group.items.length) return `${group.label}：未选择`;
  if (group.items.length === 1) return `${group.label}：${group.items[0]}`;
  return `${group.label}：${group.items.length} 个 · ${group.items[0]} 等`;
}

function ConditionChip({ group }) {
  const [query, setQuery] = useState('');
  const label = groupText(group);
  if (!Array.isArray(group.items) || group.items.length < 2) return <span className="sfv-chip" title={label}>{label}</span>;
  const visible = group.items.filter(item => item.toLowerCase().includes(query.trim().toLowerCase()));
  return <Popover onOpenChange={open => { if (open) setQuery(''); }}><PopoverTrigger asChild><button type="button" className="sfv-chip sfv-chip-expand" aria-label={`${group.label}已选 ${group.items.length} 个，查看完整清单`} title={label}><span>{label}</span><ChevronDown size={13} aria-hidden="true"/></button></PopoverTrigger><PopoverContent align="start" className="sfv-detail"><strong>已选{group.label}（{group.items.length}）</strong>{group.items.length > 5 && <Input aria-label={`搜索已选${group.label}`} placeholder={`搜索已选${group.label}`} value={query} onChange={event => setQuery(event.target.value)}/>}<ul>{visible.map((item, index) => <li key={`${item}-${index}`}>{item}</li>)}</ul>{!visible.length && <p>没有匹配项</p>}<small>如需调整，请使用上方筛选框</small></PopoverContent></Popover>;
}

export function SelectedConditions({ groups, label = '已选条件' }) {
  return <div className="sfv-current"><span className="sfv-label">{label}</span>{groups.map(group => <ConditionChip key={`${group.label}-${group.text}`} group={group}/>)}</div>;
}

export default function SavedFilterViews({ scope, value, onApply, summary = '', conditions, groups, currentGroups = groups, saveDescription = '核对当前筛选条件并命名。视图仅在当前浏览器生效。', showCurrent = true, disabled = false, legacyKey }) {
  const key = `moma-5110-filter-views:${scope}`;
  const [views, setViews] = useState(() => {
    try {
      const stored = localStorage.getItem(key);
      const rows = JSON.parse(stored ?? (legacyKey ? localStorage.getItem(legacyKey) : null) ?? '[]');
      return Array.isArray(rows) ? rows.filter(row => row.name && (row.value || row.filters)).map(row => ({ id: row.id || crypto.randomUUID(), name: row.name, value: row.value || { filters: row.filters, granularity: row.granularity } })) : [];
    } catch { return []; }
  });
  const [name, setName] = useState(''), [error, setError] = useState(''), [open, setOpen] = useState(false), [creating, setCreating] = useState(false);
  const [applied, setApplied] = useState(null), [pending, setPending] = useState(null);
  useEffect(() => {
    if (!pending) return;
    setApplied({ ...pending, signature: signature(value) });
    setPending(null);
  }, [pending, value]);
  const persist = next => {
    try { localStorage.setItem(key, JSON.stringify(next)); setViews(next); setError(''); return true; }
    catch { setError('浏览器存储不可用，视图未保存'); return false; }
  };
  const save = () => {
    const label = name.trim();
    if (!label) return;
    if (views.some(view => view.name === label)) { setError('名称已存在，请使用其他名称'); return; }
    const id = crypto.randomUUID();
    if (persist([...views, { id, name: label, value }])) { setCreating(false); setName(''); setApplied({ id, name: label, signature: signature(value) }); }
  };
  const currentConditions = (conditions ?? summary.split(' · ')).filter(Boolean);
  const activeGroups = currentGroups || currentConditions.map(text => ({ text }));
  const viewLabel = applied ? `${applied.name}${signature(value) === applied.signature ? '' : ' · 已修改'}` : '当前筛选';
  return <div className={`sfv-actions${showCurrent ? ' sfv-with-current' : ''}`}>
    {showCurrent && <SelectedConditions groups={activeGroups}/>}
    <div className="sfv-controls"><Popover open={open} onOpenChange={setOpen}><PopoverTrigger asChild><Button type="button" variant="outline" className="sfv-view-trigger" aria-label={`视图：${viewLabel}`}><span>视图：{viewLabel}</span><ChevronDown size={15}/></Button></PopoverTrigger><PopoverContent align="end" className="w-80"><div className="flex flex-col gap-2">{views.map(view => <div key={view.id} className="flex items-center gap-2"><Button type="button" className="flex-1 justify-start truncate" variant="ghost" onClick={() => { onApply(view.value); setOpen(false); setPending({ id: view.id, name: view.name }); }}>{view.name}</Button><Button type="button" variant="ghost" size="icon" aria-label={`删除视图 ${view.name}`} onClick={() => { if (persist(views.filter(item => item.id !== view.id)) && applied?.id === view.id) setApplied(null); }}><Trash2 size={15}/></Button></div>)}{!views.length && <p className="text-sm text-muted-foreground">暂无视图，请先设置筛选条件。</p>}{error && <p role="alert">{error}</p>}</div></PopoverContent></Popover>
    <Button type="button" variant="outline" disabled={disabled} onClick={() => { setError(''); setCreating(true); }}><Bookmark size={15}/>保存为视图</Button></div>
    <Dialog open={creating} onOpenChange={setCreating}><DialogContent><DialogHeader><DialogTitle>保存为视图</DialogTitle><DialogDescription>{saveDescription}</DialogDescription></DialogHeader><div className="sfv-dialog-summary">{groups ? groups.map(group => <div key={group.label} className="sfv-dialog-group"><strong>{group.label}{group.scope && <small>{group.scope}</small>}</strong>{Array.isArray(group.items) && group.items.length > 0 ? <div><span>已选 {group.items.length} 个</span>{group.items.length > 5 ? <details><summary>{group.items[0]} 等 · 查看全部</summary><ul>{group.items.map((item, index) => <li key={`${item}-${index}`}>{item}</li>)}</ul></details> : <ul>{group.items.map((item, index) => <li key={`${item}-${index}`}>{item}</li>)}</ul>}</div> : <span>{'items' in group ? group.items === null ? group.all || '全部' : '未选择' : group.text}</span>}</div>) : currentConditions.join('；')}</div><label htmlFor={`saved-view-${scope}`}>视图名称</label><Input id={`saved-view-${scope}`} maxLength={40} placeholder="输入视图名称" value={name} onChange={event => setName(event.target.value)}/>{error && <p role="alert">{error}</p>}<div className="flex justify-end gap-2"><Button type="button" variant="outline" onClick={() => setCreating(false)}>取消</Button><Button type="button" disabled={!name.trim() || disabled} onClick={save}>保存视图</Button></div></DialogContent></Dialog>
  </div>;
}
