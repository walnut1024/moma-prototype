import { dayOf, validAnalyticsRange } from './analytics';
import { useState } from 'react';
import { CalendarDays, ChevronDown, Bookmark, Trash2, X, Check } from 'lucide-react';
import { zhCN } from 'react-day-picker/locale';
import { Calendar } from '../components/ui/calendar';
import { Popover, PopoverTrigger, PopoverContent } from '../components/ui/popover';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
import { Command, CommandInput, CommandList, CommandGroup, CommandItem, CommandEmpty } from '../components/ui/command';
import './multi-pick.css';
const date = s => new Date(`${s}T12:00:00`);
const stamp = d => `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
export function DateRange({start,end,onChange,granularity='day',allowLongRange=false,label='',latest,rangeHint}) {
  const [open,setOpen]=useState(false),[range,setRange]=useState();
  const today=dayOf(Date.now());
  const valid=range?.from&&range?.to&&validAnalyticsRange(stamp(range.from),stamp(range.to),allowLongRange?'week':granularity);
  const choose=n=>{const to=date(today),from=date(today);from.setDate(from.getDate()-n+1);setRange({from,to})};
  return <Popover open={open} onOpenChange={v=>{setOpen(v);if(v)setRange({from:date(start),to:date(end)})}}><PopoverTrigger asChild><Button variant="outline" aria-label="日期范围"><CalendarDays/>{label && `${label} · `}{start} — {end}</Button></PopoverTrigger><PopoverContent className="w-auto max-w-[95vw]" align="start"><div className="flex gap-2"><Button variant="outline" size="sm" onClick={()=>choose(1)}>当日</Button>{(granularity==='week'?[28,90,365]:[7,14,30]).map(n=><Button key={n} variant="outline" size="sm" onClick={()=>{choose(n)}}>近 {n} 天</Button>)}</div><Calendar mode="range" min={0} disabled={{after:date(today)}} locale={zhCN} numberOfMonths={2} defaultMonth={date(start)} selected={range} onSelect={setRange}/><p className="text-sm text-muted-foreground">北京时间 · {rangeHint || (allowLongRange?'单日按小时，2–30 天按日，31–365 天按周':granularity==='week'?'周粒度最多 1 年（365 天）':'日粒度最多 30 天')} · 当日从 00:00 至当前时刻</p>{latest&&<p className="text-xs text-muted-foreground">演示记录截至 {latest}，之后的范围可能暂无数据。</p>}{range?.from&&range?.to&&!valid&&<p role="alert">日期范围超过当前粒度上限，请缩短范围。</p>}<div className="flex justify-end gap-2 mt-3"><Button variant="outline" onClick={()=>setOpen(false)}>取消</Button><Button disabled={!valid} onClick={()=>{onChange({start:stamp(range.from),end:stamp(range.to)});setOpen(false)}}>应用日期</Button></div></PopoverContent></Popover>;
}
export function MultiPick({label,value,onChange,items,searchPlaceholder}) {
  const [open,setOpen]=useState(false),[query,setQuery]=useState(''),[onlySelected,setOnlySelected]=useState(false),[draft,setDraft]=useState(value);
  const selected=new Set(draft===null?items.map(i=>i.id):draft);
  const matches=items.filter(i=>`${i.name} ${i.id} ${i.searchText || ''}`.toLowerCase().includes(query.trim().toLowerCase()));
  const visible=onlySelected?matches.filter(i=>selected.has(i.id)):matches;
  const allChecked=matches.length>0&&matches.every(i=>selected.has(i.id));
  const selectedCount=items.filter(i=>selected.has(i.id)).length;
  const toggle=id=>setDraft(selected.has(id)?items.filter(i=>selected.has(i.id)&&i.id!==id).map(i=>i.id):[...selected,id]);
  const toggleVisible=()=>setDraft(allChecked?items.filter(i=>selected.has(i.id)&&!matches.some(v=>v.id===i.id)).map(i=>i.id):[...new Set([...selected,...matches.map(i=>i.id)])]);
  const display=value===null||value.length===items.length?`全部${label}`:value.length&&items.length-value.length<=3?`全部${label}（已排除 ${items.length-value.length} 项）`:value.length?`${label}（已选 ${value.length}）`:`${label}（未选择）`;
  return <Popover open={open} onOpenChange={next=>{setOpen(next);if(next){setDraft(value);setQuery('');setOnlySelected(false)}}}>
    <PopoverTrigger asChild><Button variant="outline" aria-label={`${label}筛选`} aria-expanded={open}>{display}<ChevronDown/></Button></PopoverTrigger>
    <PopoverContent align="start" className="mp-panel" aria-label={`${label}多选`}>
      <Command shouldFilter={false} className="mp-command">
        <CommandInput aria-label={`搜索${label}`} placeholder={searchPlaceholder || `搜索${label}名称或 ID`} value={query} onValueChange={setQuery}/>
        <button type="button" className="mp-select-all" role="checkbox" aria-label={query?`全选搜索结果（${matches.length}）`:`全选全部${label}（${items.length}）`} aria-checked={allChecked} onClick={toggleVisible} disabled={!matches.length}><span className="mp-box" data-checked={allChecked}>{allChecked&&<Check/>}</span>{query?`全选搜索结果（${matches.length}）`:`全选全部${label}（${items.length}）`}</button>
        <div className="mp-toolbar"><span>已选择 <b>{selectedCount}</b> 项</span><button type="button" aria-pressed={onlySelected} onClick={()=>setOnlySelected(!onlySelected)}>仅看已选</button><button type="button" onClick={()=>setDraft([])} disabled={!selectedCount}>清空</button></div>
        <CommandList className="mp-list"><CommandEmpty>无匹配结果</CommandEmpty><CommandGroup>{visible.map(i=><CommandItem key={i.id} value={i.id} data-checked={selected.has(i.id)} aria-label={`${i.name}，${selected.has(i.id)?'已选':'未选'}`} onSelect={()=>toggle(i.id)}><span className="mp-box" data-checked={selected.has(i.id)}>{selected.has(i.id)&&<Check/>}</span><span className="mp-name" title={i.name}>{i.name}</span></CommandItem>)}</CommandGroup></CommandList>
      </Command>
      <footer className="mp-footer"><span>共 {onlySelected?visible.length:matches.length} 项{onlySelected?'（已选）':query?'（搜索结果）':''}</span><div><Button variant="outline" size="sm" onClick={()=>setOpen(false)}>取消</Button><Button size="sm" onClick={()=>{onChange(selectedCount===items.length?null:items.filter(i=>selected.has(i.id)).map(i=>i.id));setOpen(false)}}>确定（{selectedCount}）</Button></div></footer>
    </PopoverContent>
  </Popover>;
}
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '../components/ui/dialog';
const storageKey='moma-admin2-analytics-views';
export function SavedViews({filters,granularity,onApply,conditions,onRemove,disabled}) {
  const [views,setViews]=useState(()=>{try{const v=JSON.parse(localStorage.getItem(storageKey)||'[]');return Array.isArray(v)?v.filter(x=>x.name&&x.filters&&['tenant','model','provider'].every(k=>x.filters[k]===null||Array.isArray(x.filters[k]))):[]}catch{return []}});
  const [name,setName]=useState(''),[error,setError]=useState(''),[open,setOpen]=useState(false),[creating,setCreating]=useState(false),[notice,setNotice]=useState('');
  const persist=next=>{try{localStorage.setItem(storageKey,JSON.stringify(next));setViews(next);setError('');return true}catch{setError('浏览器存储不可用，视图未保存');return false}};
  const save=()=>{if(views.some(v=>v.name===name.trim())){setError('名称已存在，请使用其他名称');return}if(persist([...views,{id:crypto.randomUUID(),name:name.trim(),filters,granularity}])){setCreating(false);setNotice('视图已保存：'+name.trim());setName('')}};
  return <div className="an-selected-filters"><span className="an-note">当前条件</span><span className="an-note">{filters.start} — {filters.end} · {granularity==='week'?'按周':granularity==='hour'?'按小时':'按天'}</span>{conditions.map(c=><Button key={c.key} variant="secondary" size="sm" aria-label={`移除${c.label}`} onClick={()=>onRemove(c.key)}>{c.label}<X/></Button>)}{!conditions.length&&<span className="an-note">全部对象</span>}<div className="flex gap-2 ml-auto"><Button variant="outline" disabled={disabled} onClick={()=>{setError('');setCreating(true)}}><Bookmark/>保存为视图</Button><Popover open={open} onOpenChange={setOpen}><PopoverTrigger asChild><Button variant="outline">常用视图{views.length?` · ${views.length}`:''}<ChevronDown/></Button></PopoverTrigger><PopoverContent align="end" className="w-80"><div className="flex flex-col gap-2">{views.map(v=><div key={v.id} className="flex items-center gap-2"><Button className="flex-1 justify-start truncate" variant="ghost" onClick={()=>{onApply(v);setOpen(false);setNotice('已应用视图：'+v.name)}}>{v.name}</Button><Button variant="ghost" size="icon" aria-label={`删除视图 ${v.name}`} onClick={()=>persist(views.filter(x=>x.id!==v.id))}><Trash2/></Button></div>)}{!views.length&&<p className="text-sm text-muted-foreground">暂无视图，请先选择筛选条件，再点击“保存为视图”。</p>}{error&&<p role="alert">{error}</p>}</div></PopoverContent></Popover></div><span role="status" className="an-note">{notice}</span><Dialog open={creating} onOpenChange={setCreating}><DialogContent><DialogHeader><DialogTitle>保存为视图</DialogTitle><DialogDescription>保存当前日期、筛选条件和时间粒度，仅在当前浏览器生效。</DialogDescription></DialogHeader><p className="text-sm">{filters.start} — {filters.end} · {granularity==='hour'?'按小时':'按天'}</p><p className="text-sm">{conditions.map(c=>c.label).join('；')||'全部对象'}</p><label htmlFor="analytics-view-name">视图名称</label><Input id="analytics-view-name" placeholder="例如：重点租户 · 自有模型" maxLength={40} value={name} onChange={e=>setName(e.target.value)}/>{error&&<p role="alert">{error}</p>}<div className="flex justify-end gap-2"><Button variant="outline" onClick={()=>setCreating(false)}>取消</Button><Button disabled={!name.trim()||disabled} onClick={save}>保存视图</Button></div></DialogContent></Dialog></div>;
}
