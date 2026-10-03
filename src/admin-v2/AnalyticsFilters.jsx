import { dayOf, validAnalyticsRange } from './analytics';
import { useState } from 'react';
import { CalendarDays, ChevronDown, Check } from 'lucide-react';
import { zhCN } from 'react-day-picker/locale';
import { Calendar } from '../components/ui/calendar';
import { Popover, PopoverTrigger, PopoverContent } from '../components/ui/popover';
import { Button } from '../components/ui/button';
import { Command, CommandInput, CommandList, CommandGroup, CommandItem, CommandEmpty } from '../components/ui/command';
import './multi-pick.css';
import { TIME_PRESETS } from '../components/FilterControls';
import { usagePreset } from './usage-analysis';
const date = s => new Date(`${s}T12:00:00`);
const stamp = d => `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
export function DateRange({start,end,onChange,granularity='day',allowLongRange=false,label='自定义',latest,rangeHint,maxDays=allowLongRange||granularity==='week'?365:30}) {
  const [open,setOpen]=useState(false),[range,setRange]=useState();
  const today=dayOf(Date.now());
  const valid=range?.from&&range?.to&&validAnalyticsRange(stamp(range.from),stamp(range.to),granularity,Date.now(),maxDays);
  const choose=id=>{const next=usagePreset(id);setRange({from:date(next.start),to:date(next.end)})};
  return <Popover open={open} onOpenChange={v=>{setOpen(v);if(v)setRange({from:date(start),to:date(end)})}}><PopoverTrigger asChild><Button variant="outline" className="filter-date-trigger" aria-label="日期范围"><CalendarDays/>{label && `${label} · `}{start} — {end}</Button></PopoverTrigger><PopoverContent className="filter-date-popover w-auto max-w-[95vw]" align="start"><div className="flex gap-2">{TIME_PRESETS.map(([id,name])=><Button key={id} variant="outline" size="sm" onClick={()=>choose(id)}>{name}</Button>)}</div><Calendar mode="range" min={0} disabled={{after:date(today)}} locale={zhCN} numberOfMonths={2} defaultMonth={date(start)} selected={range} onSelect={setRange}/><p className="text-sm text-muted-foreground">北京时间 · {rangeHint || (allowLongRange?'单日按小时，2–30 天按日，31–365 天按周':granularity==='week'?'周粒度最多 1 年（365 天）':`单次最多 ${maxDays} 天`)} · 当日从 00:00 至当前时刻</p>{latest&&<p className="text-xs text-muted-foreground">演示记录截至 {latest}，之后的范围可能暂无数据。</p>}{range?.from&&range?.to&&!valid&&<p role="alert">请选择不晚于今天且不超过 {maxDays} 天的日期范围。</p>}<div className="flex justify-end gap-2 mt-3"><Button variant="outline" onClick={()=>setOpen(false)}>取消</Button><Button disabled={!valid} onClick={()=>{onChange({start:stamp(range.from),end:stamp(range.to)});setOpen(false)}}>应用日期</Button></div></PopoverContent></Popover>;
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
  const display=value===null||value.length===items.length?`全部${label}`:value.length?`${label}（已选 ${value.length}）`:`${label}（未选择）`;
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
