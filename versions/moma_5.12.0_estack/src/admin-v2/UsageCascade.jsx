import { useState } from 'react';
import { ChevronDown } from 'lucide-react';
import { Button } from '../components/ui/button';
import { Checkbox } from '../components/ui/checkbox';
import { Input } from '../components/ui/input';
import { Popover, PopoverContent, PopoverTrigger } from '../components/ui/popover';
import { Select, SelectContent, SelectGroup, SelectItem, SelectTrigger, SelectValue } from '../components/ui/select';

export default function UsageCascade({ label, parentLabel, groups, items, value, onChange, compact = false }) {
  const [open, setOpen] = useState(false), [group, setGroup] = useState(null), [query, setQuery] = useState(''), [draft, setDraft] = useState([]);
  const selected = new Set(draft);
  const visible = items.filter(item => (group === null || item.groupId === group) && `${item.name} ${item.code || item.id}`.toLowerCase().includes(query.trim().toLowerCase()));
  const checked = visible.filter(item => selected.has(item.id)).length;
  const toggle = (ids, include) => setDraft(previous => include ? [...new Set([...previous, ...ids])] : previous.filter(id => !ids.includes(id)));
  const selectedItems = value === null ? [] : items.filter(item => value.includes(item.id));
  const display = value === null ? `全部${label}` : !value.length ? `未选择${label}` : value.length === 1 ? selectedItems[0]?.name || value[0] : `已选 ${value.length} 个${label}`;
  return <Popover open={open} onOpenChange={next => { setOpen(next); if (next) { setDraft(value === null ? items.map(item => item.id) : value); setGroup(null); setQuery(''); } }}>
    <PopoverTrigger asChild><Button variant="outline" className={compact ? 'ua-compact-chip' : ''} data-active={value !== null} aria-label={`${label}二级筛选`} aria-expanded={open}><span className="truncate">{compact ? `${label}：${value === null ? '全部' : value.length + '个'}` : display}</span><ChevronDown data-icon="inline-end"/></Button></PopoverTrigger>
    <PopoverContent align="start" className="ua-cascade" aria-label={`${parentLabel}与${label}筛选`}>
      <div className="ua-picker-toolbar ua-cascade-tools">
        <Input aria-label={`搜索${label}`} placeholder={`搜索${label}名称 / ID`} value={query} onChange={event => setQuery(event.target.value)}/>
        <Select value={group ?? '__all__'} onValueChange={value => setGroup(value === '__all__' ? null : value)}><SelectTrigger aria-label={parentLabel}><SelectValue/></SelectTrigger><SelectContent position="popper" align="start"><SelectGroup><SelectItem value="__all__">全部类型</SelectItem>{groups.map(item => <SelectItem key={item.id} value={item.id}>{item.name}</SelectItem>)}</SelectGroup></SelectContent></Select>
        <label className="ua-cascade-all"><Checkbox aria-label="全选当前结果" disabled={!visible.length} checked={checked && checked < visible.length ? 'indeterminate' : checked > 0} onCheckedChange={include => toggle(visible.map(item => item.id), include === true)}/>全选</label>
      </div>
      <div className="ua-cascade-list" role="group" aria-label={`${label}选项`}>
        {visible.map(item => <label key={item.id} className="ua-cascade-option" title={`${item.name}（${item.code || item.id}）`}><Checkbox checked={selected.has(item.id)} aria-label={`${item.name}（${item.code || item.id}）`} onCheckedChange={include => toggle([item.id], include === true)}/><span><b>{item.name}</b><small>（{item.code || item.id}）</small></span></label>)}
        {!visible.length && <p className="ua-cascade-empty">暂无匹配{label}</p>}
      </div>
      <div className="ua-cascade-footer"><span>已选 {draft.length} 个{label}</span><Button variant="ghost" size="sm" onClick={() => setDraft([])} disabled={!draft.length}>清空</Button><div/><Button variant="outline" size="sm" onClick={() => setOpen(false)}>取消</Button><Button size="sm" onClick={() => { onChange(items.length > 0 && draft.length === items.length && items.every(item => selected.has(item.id)) ? null : draft); setOpen(false); }}>确定</Button></div>
    </PopoverContent>
  </Popover>;
}
