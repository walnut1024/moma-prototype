import { Tooltip, TooltipTrigger, TooltipContent } from '../components/ui/tooltip';
import { Fragment, useState } from 'react';
import { Download, ArrowUpDown, ChevronDown, ChevronRight } from 'lucide-react';
import { Card, CardHeader, CardTitle, CardContent } from '../components/ui/card';
import { Button } from '../components/ui/button';
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from '../components/ui/table';
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from '../components/ui/select';
import { Popover, PopoverTrigger, PopoverContent } from '../components/ui/popover';
import { Command, CommandInput, CommandList, CommandGroup, CommandItem, CommandEmpty } from '../components/ui/command';
import { FilterToolbar, FilterReset } from '../components/FilterControls';
import { SelectedConditions } from '../components/SavedFilterViews';
import { customerModelDetails } from './analytics';
import { formatUsageNumber } from './usage-analysis';
const columns = [['model','模型'],['customer','客户名称'],['customerId','客户 ID'],['total','计量用量'],['calls','请求记录数'],['success','HTTP 请求成功率'],['peakTpm','区间峰值 TPM'],['avgTpm','区间平均 TPM'],['activeDays','有调用天数']];
const detailColumns = [['dailyUsage','日均用量'],['endUsage','结束日用量'],['avgRpm','区间平均 RPM'],['maxRpm','区间峰值 RPM'],['ttft','平均 TTFT (ms)'],['maxTtft','最大 TTFT (ms)'],['ttftSamples','TTFT 样本数'],['maxInput','最大输入 Token'],['avgInput','平均输入 Token'],['maxOutput','最大输出 Token'],['avgOutput','平均输出 Token'],['customerType','客户类型'],['pending','待确认请求数']];
const display = value => value == null ? '—' : typeof value === 'number' ? value > 0 && value < 0.01 ? '<0.01' : formatUsageNumber(value) : value;
const statusLabels = ['成功','400','5xx','0','其他'];
function StatusBar({ row }) {
  return <div className="an-success-cell"><Tooltip><TooltipTrigger asChild><button type="button" className="an-status-bar" aria-label={row.statuses.map((n,i)=>statusLabels[i]+': '+n+' 次').join('，')+'，请求记录数 '+row.calls}>
    {row.statuses.map((count,i)=><span key={statusLabels[i]} className={'an-status-'+i} style={{width:count/row.calls*100+'%'}}/>)}
  </button></TooltipTrigger><TooltipContent className="an-status-tooltip" side="top">
    {row.statuses.map((count,i)=><div key={statusLabels[i]}><span><i className={'an-status-'+i}/>{statusLabels[i]}</span><b>{display(count)}</b><span>{(count/row.calls*100).toFixed(1)}%</span></div>)}
    <div className="an-status-total"><strong>请求记录数</strong><b>{display(row.calls)}</b></div>
  </TooltipContent></Tooltip><span>{row.success.toFixed(2)}%</span></div>;
}
function DetailPick({ label, value, onChange, options }) {
  const [open, setOpen] = useState(false), [search, setSearch] = useState('');
  const visible = options.filter(option => option.label.toLowerCase().includes(search.trim().toLowerCase()));
  return <Popover open={open} onOpenChange={next => { setOpen(next); if (next) setSearch(''); }}><PopoverTrigger asChild><Button type="button" variant="outline" className="an-detail-picker" aria-label={`调用明细${label}`}>
    <span>{options.find(option => option.value === value)?.label || value || `全部${label}`}</span><ChevronDown size={14}/>
  </Button></PopoverTrigger><PopoverContent align="start" className="w-72 p-0"><Command shouldFilter={false}>
    <CommandInput aria-label={`搜索调用明细${label}`} placeholder={`搜索${label}`} value={search} onValueChange={setSearch}/>
    <CommandList><CommandEmpty>无匹配结果</CommandEmpty><CommandGroup>{visible.map(option => <CommandItem key={option.value || 'all'} value={option.value || 'all'} onSelect={() => { onChange(option.value); setOpen(false); }}>{option.label}</CommandItem>)}</CommandGroup></CommandList>
  </Command></PopoverContent></Popover>;
}
export default function UserCallDetails({ state, rows, start, end, draft, onDraftChange, query, onQueryChange, conditionGroups }) {
  const [sort,setSort]=useState({key:'total',direction:-1}), [page,setPage]=useState(0), [size,setSize]=useState(20), [expanded,setExpanded]=useState(null);
  const details=customerModelDetails(state,rows,start,end);
  const modelOptions=[{value:'',label:'全部模型'},...[...new Set(state.models.map(model=>model.name))].sort((a,b)=>a.localeCompare(b,'zh-CN')).map(value=>({value,label:value}))];
  const customerOptions=[{value:'',label:'全部客户'},...[...new Map(state.tenants.map(row=>[row.id,{value:row.id,label:`${row.name} · ${row.id}`}])).values()].sort((a,b)=>a.label.localeCompare(b.label,'zh-CN'))];
  const data=details.filter(r=>(!query.model||r.model===query.model)&&(!query.customer||r.customerId===query.customer)).sort((a,b)=>{
    if(a[sort.key]==null)return b[sort.key]==null?0:1;
    if(b[sort.key]==null)return -1;
    return sort.direction*(typeof a[sort.key]==='number'?a[sort.key]-b[sort.key]:String(a[sort.key]).localeCompare(String(b[sort.key]),'zh-CN'));
  });
  const pages=Math.max(1,Math.ceil(data.length/size)), current=Math.min(page,pages-1);
  function exportCsv() {
    const escape=value=>'"'+String(value??'—').replaceAll('"','""')+'"';
    const exportColumns=[...columns,['unit','计量单位'],...detailColumns];
    const csv=[exportColumns.map(([,label])=>label),...data.map(r=>exportColumns.map(([key])=>key==='success'&&r.success!=null?`${r.success.toFixed(2)}%`:r[key]))].map(row=>row.map(escape).join(',')).join('\r\n');
    const url=URL.createObjectURL(new Blob(['\ufeff'+csv],{type:'text/csv;charset=utf-8'}));
    const link=document.createElement('a');link.href=url;link.download=`客户模型调用明细_${start}_${end}.csv`;link.click();setTimeout(()=>URL.revokeObjectURL(url),1000);
  }
  return <Card className="an-call-details"><CardHeader><CardTitle>调用明细</CardTitle></CardHeader><CardContent>
    <form className="an-detail-search" onSubmit={e=>{e.preventDefault();onQueryChange(draft);setPage(0)}}><FilterToolbar>
      <div className="an-detail-field"><span>模型</span><DetailPick label="模型" value={draft.model} onChange={model=>onDraftChange({...draft,model})} options={modelOptions}/></div>
      <div className="an-detail-field"><span>客户名称 / ID</span><DetailPick label="客户名称或 ID" value={draft.customer} onChange={customer=>onDraftChange({...draft,customer})} options={customerOptions}/></div>
      <Button type="submit">查询</Button><FilterReset onClick={()=>{onDraftChange({model:'',customer:''});onQueryChange({model:'',customer:''});setPage(0)}}/>
      <Button type="button" variant="outline" disabled={!data.length} onClick={exportCsv}><Download/>导出表格</Button>
    </FilterToolbar></form>
    {conditionGroups && <div className="an-detail-conditions"><SelectedConditions groups={conditionGroups} label="已选条件（仅调用明细）"/></div>}
    <p className="an-note">计量用量仅汇总已确认请求，并按模型单位分别统计；TPM 仅适用于 Token 模型。区间平均 TPM／RPM 包含无调用分钟。</p>
    <div className="an-detail-table-scroll"><Table><TableHeader><TableRow>{columns.map(([key,label])=><TableHead key={key} aria-sort={sort.key===key?(sort.direction===1?'ascending':'descending'):'none'}><button type="button" onClick={()=>{setSort({key,direction:sort.key===key?-sort.direction:-1});setPage(0)}}>{label}<ArrowUpDown size={12}/></button></TableHead>)}<TableHead>详情</TableHead></TableRow></TableHeader><TableBody>
      {data.slice(current*size,(current+1)*size).map(r=><Fragment key={r.id}><TableRow>{columns.map(([key])=><TableCell key={key}>{key==='success'?<StatusBar row={r}/>:key==='customer'?<a className="an-customer-link" href={`#/admin-2/customer-usage-detail?customer=${encodeURIComponent(r.customerId)}&start=${start}&end=${end}`} onClick={()=>window.scrollTo(0,0)}>{r.customer}</a>:key==='total'?<><span>{r.total==null?'—':`${display(r.total)} ${r.unit}`}</span>{r.pending>0&&<small className="an-pending">{r.pending} 条待确认</small>}</>:display(r[key])}</TableCell>)}<TableCell><Button type="button" variant="ghost" size="sm" aria-expanded={expanded===r.id} aria-label={`${r.customer} ${r.model} 调用详情`} onClick={()=>setExpanded(expanded===r.id?null:r.id)}><ChevronRight className={expanded===r.id?'an-expanded':''}/></Button></TableCell></TableRow>{expanded===r.id&&<TableRow className="an-expanded-row"><TableCell colSpan={columns.length+1}><div className="an-detail-fields">{detailColumns.filter(([key])=>!['maxInput','avgInput','maxOutput','avgOutput'].includes(key)||r.unit==='Token').filter(([key])=>!['ttft','maxTtft','ttftSamples'].includes(key)||r.ttftSamples>0).map(([key,label])=><div key={key}><span>{label}</span><strong>{display(r[key])}{['dailyUsage','endUsage'].includes(key)&&r[key]!=null?` ${r.unit}`:''}</strong></div>)}</div></TableCell></TableRow>}</Fragment>)}
      {!data.length&&<TableRow><TableCell colSpan={columns.length+1}>暂无匹配记录，请调整模型、客户或上方日期筛选。</TableCell></TableRow>}
    </TableBody></Table></div>
    <div className="an-pagination"><span>共 {data.length} 条</span><Select value={String(size)} onValueChange={v=>{setSize(Number(v));setPage(0)}}><SelectTrigger aria-label="调用明细每页条数"><SelectValue/></SelectTrigger><SelectContent>{[20,50,100].map(n=><SelectItem key={n} value={String(n)}>{n} 条 / 页</SelectItem>)}</SelectContent></Select><Button variant="outline" disabled={!current} onClick={()=>setPage(current-1)}>上一页</Button><span>{current+1} / {pages}</span><Button variant="outline" disabled={current+1>=pages} onClick={()=>setPage(current+1)}>下一页</Button></div>
  </CardContent></Card>;
}
