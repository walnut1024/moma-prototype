import { useState } from 'react';
import { ChevronDown } from 'lucide-react';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
import { Popover, PopoverContent, PopoverTrigger } from '../components/ui/popover';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../components/ui/select';
import { modelCategory } from './model-management';
import {MODEL_CATALOGUE_TYPES} from './model-library';
import ModelFieldLabel from './ModelFieldLabel';
import { modelMetadataDraft as blankModel } from './model-metadata-draft';

export function Choice({ label, value, options, onChange, disabled }) {
  return <Select value={value} onValueChange={onChange} disabled={disabled}><SelectTrigger aria-label={label}><SelectValue/></SelectTrigger><SelectContent>{options.map(([id, name]) => <SelectItem value={String(id)} key={id}>{name}</SelectItem>)}</SelectContent></Select>;
}
export function MultiChoice({ label, choices, value = [], onChange, disabled, groups = [] }) {
  const [query,setQuery]=useState(''),[group,setGroup]=useState('all');
  const options = [...new Set([...choices, ...value])].filter(option=>option.toLowerCase().includes(query.trim().toLowerCase()) && (group==='all' || group==='selected' && value.includes(option) || groups.find(row=>row[0]===group)?.[1].includes(option)));
  return <Popover><PopoverTrigger asChild><Button type="button" variant="outline" className="mm-multi-trigger" aria-label={label} disabled={disabled} title={value.join('、')}><span>{value.length ? value.slice(0, 2).join('、') + (value.length > 2 ? ' 等' + value.length + '项' : '') : '请选择' + label}</span><ChevronDown/></Button></PopoverTrigger><PopoverContent align="start" className="mm-multi-options"><div><b>{label}</b><Button type="button" variant="link" disabled={disabled || !value.length} onClick={() => onChange([])}>清空</Button></div><Input aria-label={`搜索${label}`} placeholder="搜索名称 / 标识" value={query} onChange={event=>setQuery(event.target.value)}/>{groups.length>0 && <Choice label={`${label}类型`} value={group} options={[['all','全部类型'],['selected','已选客户'],...groups.map(([name])=>[name,name])]} onChange={setGroup}/>}<small>已选 {value.length} 项</small><div className="mm-multi-grid">{options.map(option => <label key={option}><input type="checkbox" disabled={disabled} checked={value.includes(option)} onChange={event => onChange(event.target.checked ? [...value, option] : value.filter(item => item !== option))}/>{option}</label>)}{!options.length && <p role="status">没有匹配项</p>}</div></PopoverContent></Popover>;
}
function UnitInput({ unit, ...props }) {
  return <div className="mm-unit-input"><Input {...props}/><span>{unit}</span></div>;
}
function ContextInput({value,onChange,disabled}) {
  const [unit,setUnit]=useState(value>0 && value%1024===0?'K':'Token');
  return <div className="mm-context-input"><Input aria-label="上下文窗口" type="number" min="1" step="1" value={value==null || value===''?'':Number(value)/(unit==='K'?1024:1)} disabled={disabled} onChange={event=>onChange(event.target.value===''?'':String(Number(event.target.value)*(unit==='K'?1024:1)))}/><Choice label="上下文窗口单位" value={unit} options={[[ 'K','K Token' ],['Token','Token']]} disabled={disabled} onChange={setUnit}/></div>;
}
export function Field({ label, children, hint, className = '' }) { return <label className={`mm-field ${className}`}><span>{label}</span>{children}{hint && <small>{hint}</small>}</label>; }
export function CapabilityFields({ value, type, onChange, disabled, catalogue = false, fields = ['context', 'output', 'streaming', 'tools'] }) {
  const set = (key, input) => onChange({ ...value, [key]: input });
  return <div className="mm-capability-fields">
    {fields.includes('context') && ['text', 'multimodal', 'embedding', 'rerank'].includes(type) && <Field label={<ModelFieldLabel name="上下文窗口"/>}><ContextInput value={value.context} disabled={disabled} onChange={value=>set('context',value)}/></Field>}
    {fields.includes('output') && ['text', 'multimodal'].includes(type) && <Field label={<ModelFieldLabel name="最大输出"/>}><UnitInput unit="Token" aria-label="最大输出" required={!catalogue} min="1" step="1" type="number" placeholder="待确认" value={value.output ?? ''} disabled={disabled} onChange={event => set('output', event.target.value)}/></Field>}
    {['text', 'multimodal', 'audio'].includes(type) && (catalogue ? ['streaming', ...(['text', 'multimodal'].includes(type) ? ['tools'] : [])].filter(key => fields.includes(key)).map(key => <Field key={key} label={key === 'streaming' ? '流式响应' : '工具调用'}><Choice label={key === 'streaming' ? '流式响应' : '工具调用'} disabled={disabled} value={value[key] == null ? 'unknown' : value[key] ? 'supported' : 'unsupported'} options={[['unknown', '未填写'], ['supported', '支持'], ['unsupported', '不支持']]} onChange={input => set(key, input === 'unknown' ? null : input === 'supported')}/></Field>) : <div className="mm-checkbox-row"><label><input type="checkbox" checked={Boolean(value.streaming)} disabled={disabled} onChange={event => set('streaming', event.target.checked)}/>支持流式响应</label>{['text', 'multimodal'].includes(type) && <label><input type="checkbox" checked={Boolean(value.tools)} disabled={disabled} onChange={event => set('tools', event.target.checked)}/>支持工具调用</label>}</div>)}
  </div>;
}
const contextLabel = value => value % 1024 === 0 ? `${value / 1024}K` : value.toLocaleString('zh-CN');
export default function ModelMetadataForm({ model }) {
  const form = blankModel(model);
  const fact = value => <span className="mm-fact-value">{value == null || value === '' ? '—' : value}</span>;
  return <div className="mm-form mm-basic-form mm-presentation-form mm-basic-view"><section className="mm-metadata-section" aria-label="模型卡片"><div className="mm-basic-grid">
    <Field label={<ModelFieldLabel name="模型展示名"/>}>{fact(form.name)}</Field>
    <Field label="模型 Logo">{form.profile.logo?<img src={form.profile.logo} alt="模型 Logo"/>:fact('—')}</Field>
    <Field label="模型类型">{fact(MODEL_CATALOGUE_TYPES[modelCategory(form.type)])}</Field>
    {modelCategory(form.type)==='visual' && <Field label="视觉任务类型">{fact(form.type==='video'?'视频':'图像')}</Field>}
    <Field label="输入模态">{fact((form.profile.inputModalities || []).join('、'))}</Field><Field label="输出模态">{fact((form.profile.outputModalities || []).join('、'))}</Field>
    <Field label="上下文窗口">{fact(form.capabilities.context>0?contextLabel(form.capabilities.context)+' Token':'')}</Field>
    <Field label="原厂发布日期">{fact(form.profile.releaseDate)}</Field>
  </div><Field className="mm-description-field" label="模型简介">{fact(form.description)}</Field></section></div>;
}
