import { useId, useState } from 'react';
import { Checkbox, InputNumber, Select } from '@douyinfe/semi-ui';
import { modelCategory } from './model-management';
import {MODEL_CATALOGUE_TYPES} from './model-library';
import ModelFieldLabel from './ModelFieldLabel';
import { modelMetadataDraft as blankModel } from './model-metadata-draft';

export function Choice({ label, value, options, onChange, disabled }) {
  const id = useId();
  return <><span id={id} className="sr-only">{label}</span><Select aria-labelledby={id} value={value === undefined || value === null ? '' : String(value)} disabled={disabled} onChange={value => onChange(value)} optionList={options.map(([id, name]) => ({ value: String(id), label: name }))}/></>;
}
export function MultiChoice({ label, choices, value = [], onChange, disabled, groups = [] }) {
  const id = useId();
  const grouped = groups.filter(([, rows]) => rows.length > 0);
  const extra = [...new Set([...choices, ...value])].filter(option => !grouped.some(([, rows]) => rows.includes(option)));
  return <><span id={id} className="sr-only">{label}</span><Select aria-labelledby={id} multiple filter maxTagCount={2} showRestTagsPopover disabled={disabled} value={value} placeholder={'请选择' + label} onChange={value => onChange(value)} emptyContent={<span role="status">没有匹配项</span>}>{grouped.map(([name, rows]) => <Select.OptGroup key={name} label={name}>{rows.map(option => <Select.Option key={option} value={option}>{option}</Select.Option>)}</Select.OptGroup>)}{extra.map(option => <Select.Option key={option} value={option}>{option}</Select.Option>)}</Select></>;
}
function UnitInput({ unit, ...props }) {
  return <div className="mm-unit-input"><InputNumber {...props}/><span>{unit}</span></div>;
}
function ContextInput({value,onChange,disabled}) {
  const [unit,setUnit]=useState(value>0 && value%1024===0?'K':'Token');
  return <div className="mm-context-input"><InputNumber aria-label="上下文窗口" min={1} step={1} value={value==null || value===''?'':Number(value)/(unit==='K'?1024:1)} disabled={disabled} onChange={input=>onChange(input===''||input==null?'':String(Number(input)*(unit==='K'?1024:1)))}/><Choice label="上下文窗口单位" value={unit} options={[['K','K Token'],['Token','Token']]} disabled={disabled} onChange={setUnit}/></div>;
}
export function Field({ label, children, hint, className = '' }) { return <label className={`mm-field ${className}`}><span>{label}</span>{children}{hint && <small>{hint}</small>}</label>; }
export function CapabilityFields({ value, type, onChange, disabled, catalogue = false, fields = ['context', 'output', 'streaming', 'tools'] }) {
  const set = (key, input) => onChange({ ...value, [key]: input });
  return <div className="mm-capability-fields">
    {fields.includes('context') && ['text', 'multimodal', 'embedding', 'rerank'].includes(type) && <Field label={<ModelFieldLabel name="上下文窗口"/>}><ContextInput value={value.context} disabled={disabled} onChange={value=>set('context',value)}/></Field>}
    {fields.includes('output') && ['text', 'multimodal'].includes(type) && <Field label={<ModelFieldLabel name="最大输出"/>}><UnitInput unit="Token" aria-label="最大输出" required={!catalogue} min={1} step={1} placeholder="待确认" value={value.output == null || value.output === '' ? '' : Number(value.output)} disabled={disabled} onChange={input => set('output', input == null || input === '' ? '' : String(input))}/></Field>}
    {['text', 'multimodal', 'audio'].includes(type) && (catalogue ? ['streaming', ...(['text', 'multimodal'].includes(type) ? ['tools'] : [])].filter(key => fields.includes(key)).map(key => <Field key={key} label={key === 'streaming' ? '流式响应' : '工具调用'}><Choice label={key === 'streaming' ? '流式响应' : '工具调用'} disabled={disabled} value={value[key] == null ? 'unknown' : value[key] ? 'supported' : 'unsupported'} options={[['unknown', '未填写'], ['supported', '支持'], ['unsupported', '不支持']]} onChange={input => set(key, input === 'unknown' ? null : input === 'supported')}/></Field>) : <div className="mm-checkbox-row"><Checkbox aria-label="支持流式响应" checked={Boolean(value.streaming)} disabled={disabled} onChange={event => set('streaming', event.target.checked)}>支持流式响应</Checkbox>{['text', 'multimodal'].includes(type) && <Checkbox aria-label="支持工具调用" checked={Boolean(value.tools)} disabled={disabled} onChange={event => set('tools', event.target.checked)}>支持工具调用</Checkbox>}</div>)}
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
