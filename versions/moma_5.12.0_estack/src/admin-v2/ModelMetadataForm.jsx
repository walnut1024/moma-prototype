import { useEffect, useRef, useState } from 'react';
import { ChevronDown } from 'lucide-react';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
import { Textarea } from '../components/ui/textarea';
import { Popover, PopoverContent, PopoverTrigger } from '../components/ui/popover';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../components/ui/select';
import { MODEL_TYPES, modelCategory } from './model-management';
import { IDENTITY_FIELDS, TECHNICAL_FIELDS, PRESENTATION_FIELDS, COMMON_FIELDS, INTERFACE_FIELDS, RECORD_FIELDS, FEATURE_FIELDS, ARCHITECTURE_OPTIONS, LICENSE_OPTIONS, LANGUAGE_OPTIONS, INPUT_MODALITY_OPTIONS, OUTPUT_MODALITY_OPTIONS, RESULT_TYPE_OPTIONS, SCENARIO_OPTIONS, TASK_OPTIONS, specificationFields, modelProfileDraft, normalizeModelLogo } from './model-profile';
import {MODEL_CATALOGUE_TYPES} from './model-library';
import ModelFieldLabel from './ModelFieldLabel';
import { displayBusinessCopy } from '../display-copy.mjs';
const makerLabel = value => value?.replace(/[（(]示意[）)]/g, '').trim();
const blankModel = model => ({ modelId: model?.modelId || '', name: model?.name || '', maker: makerLabel(model?.maker) || '', description: displayBusinessCopy(model?.description) || '', type: model?.type || 'text', usageUnit: model?.usageUnit || '', profile: modelProfileDraft(model), capabilities: { streaming: null, tools: null, context: null, output: null, ...model?.capabilities } });

export function Choice({ label, value, options, onChange, disabled }) {
  return <Select value={value} onValueChange={onChange} disabled={disabled}><SelectTrigger aria-label={label}><SelectValue/></SelectTrigger><SelectContent>{options.map(([id, name]) => <SelectItem value={String(id)} key={id}>{name}</SelectItem>)}</SelectContent></Select>;
}
export function MultiChoice({ label, choices, value = [], onChange, disabled }) {
  const options = [...new Set([...choices, ...value])];
  return <Popover><PopoverTrigger asChild><Button type="button" variant="outline" className="mm-multi-trigger" aria-label={label} disabled={disabled} title={value.join('、')}><span>{value.length ? value.slice(0, 2).join('、') + (value.length > 2 ? ' 等' + value.length + '项' : '') : '请选择' + label}</span><ChevronDown/></Button></PopoverTrigger><PopoverContent align="start" className="mm-multi-options"><div><b>{label}</b><Button type="button" variant="link" disabled={disabled || !value.length} onClick={() => onChange([])}>清空</Button></div><div className="mm-multi-grid">{options.map(option => <label key={option}><input type="checkbox" disabled={disabled} checked={value.includes(option)} onChange={event => onChange(event.target.checked ? [...value, option] : value.filter(item => item !== option))}/>{option}</label>)}</div></PopoverContent></Popover>;
}
function UnitInput({ unit, ...props }) {
  return <div className="mm-unit-input"><Input {...props}/><span>{unit}</span></div>;
}
export function Field({ label, children, hint, className = '' }) { return <label className={`mm-field ${className}`}><span>{label}</span>{children}{hint && <small>{hint}</small>}</label>; }
export function CapabilityFields({ value, type, onChange, disabled, catalogue = false, fields = ['context', 'output', 'streaming', 'tools'] }) {
  const set = (key, input) => onChange({ ...value, [key]: input });
  return <div className="mm-capability-fields">
    {fields.includes('context') && ['text', 'multimodal', 'embedding', 'rerank'].includes(type) && <Field label={<ModelFieldLabel name="上下文窗口"/>}><UnitInput unit="Token" aria-label="上下文窗口" required={!catalogue} min="1" step="1" type="number" placeholder="待确认" value={value.context ?? ''} disabled={disabled} onChange={event => set('context', event.target.value)}/></Field>}
    {fields.includes('output') && ['text', 'multimodal'].includes(type) && <Field label={<ModelFieldLabel name="最大输出"/>}><UnitInput unit="Token" aria-label="最大输出" required={!catalogue} min="1" step="1" type="number" placeholder="待确认" value={value.output ?? ''} disabled={disabled} onChange={event => set('output', event.target.value)}/></Field>}
    {['text', 'multimodal', 'audio'].includes(type) && (catalogue ? ['streaming', ...(['text', 'multimodal'].includes(type) ? ['tools'] : [])].filter(key => fields.includes(key)).map(key => <Field key={key} label={key === 'streaming' ? '流式响应' : '工具调用'}><Choice label={key === 'streaming' ? '流式响应' : '工具调用'} disabled={disabled} value={value[key] == null ? 'unknown' : value[key] ? 'supported' : 'unsupported'} options={[['unknown', '未填写'], ['supported', '支持'], ['unsupported', '不支持']]} onChange={input => set(key, input === 'unknown' ? null : input === 'supported')}/></Field>) : <div className="mm-checkbox-row"><label><input type="checkbox" checked={Boolean(value.streaming)} disabled={disabled} onChange={event => set('streaming', event.target.checked)}/>支持流式响应</label>{['text', 'multimodal'].includes(type) && <label><input type="checkbox" checked={Boolean(value.tools)} disabled={disabled} onChange={event => set('tools', event.target.checked)}/>支持工具调用</label>}</div>)}
  </div>;
}
const contextLabel = value => value % 1024 === 0 ? `${value / 1024}K` : value.toLocaleString('zh-CN');
export default function ModelMetadataForm({ model, initial, can = true, run, dirty = () => {}, onSaved, onSubmit: save, onDraftChange, title = "模型资料", submitLabel, startEditing = false, readOnly = false, onCancel, cardOnly = false, sourceLabel, scrollable = false }) {
  const [form, setForm] = useState(() => blankModel(model || initial)), [error, setError] = useState(''), [editing, setEditing] = useState(!readOnly && (startEditing || !model)), [uploading, setUploading] = useState(false);
  const editTrigger = useRef(null), logoInput = useRef(null), wasEditing = useRef(false), uploadVersion = useRef(0);
  const editable = editing && can && !readOnly;
  useEffect(() => { onDraftChange?.(form); }, [form, onDraftChange]);
  useEffect(() => { if (wasEditing.current && !editing) editTrigger.current?.focus(); wasEditing.current = editing; }, [editing]);
  useEffect(() => () => { uploadVersion.current++; }, []);
  const change = (key, value) => { setForm(current => {
    const next = { ...current, [key]: value };
    if (key === 'type') {
      const descriptors = [...IDENTITY_FIELDS, ...TECHNICAL_FIELDS, ...PRESENTATION_FIELDS, ...COMMON_FIELDS, ...INTERFACE_FIELDS, ...RECORD_FIELDS, ...FEATURE_FIELDS, ...specificationFields(value, current.usageUnit, current.profile)];
      next.profile = Object.fromEntries(descriptors.filter(field => current.profile[field.key] != null).map(field => [field.key, current.profile[field.key]]));
      next.profile.tasks = (current.profile.tasks || []).filter(task => TASK_OPTIONS[value].includes(task));
      next.profile.detailDescription = current.profile.detailDescription;
    }
    return next;
  }); setError(''); dirty(true); };
  const profileChange = (key, value) => { setForm(current => ({ ...current, capabilities:{...current.capabilities,...(key==='supportedParameters' && value.includes('tools')?{tools:true}:{})}, profile: { ...current.profile, [key]: value,...(key==='supportedParameters' && value.includes('reasoning')?{reasoning:'supported'}:{}),...(key==='supportedParameters' && value.includes('structured_outputs')?{structured:'supported'}:{}) } })); setError(''); dirty(true); };
  const cancel = () => { uploadVersion.current++; setUploading(false); setForm(blankModel(model || initial)); setError(''); dirty(false); setEditing(false); };
  const uploadLogo = event => {
    const file = event.target.files?.[0]; event.target.value = '';
    if (!file) return;
    const version = ++uploadVersion.current;
    if (!['image/png', 'image/jpeg', 'image/webp'].includes(file.type) || file.size > 1048576) { setError('Logo 仅支持 1 MB 以内的 PNG、JPEG 或 WebP 图片'); return; }
    setUploading(true); setError('');
    const reader = new FileReader();
    reader.onerror = () => { if (version === uploadVersion.current) { setUploading(false); setError('读取图片失败，请重新选择'); } };
    reader.onload = async () => {
      try {
        const logo = normalizeModelLogo(String(reader.result));
        const image = document.createElement('img'); image.src = logo; await image.decode();
        if (version === uploadVersion.current) profileChange('logo', logo);
      } catch { if (version === uploadVersion.current) setError('图片无法读取，请选择有效的 PNG、JPEG 或 WebP 图片'); }
      finally { if (version === uploadVersion.current) setUploading(false); }
    };
    reader.readAsDataURL(file);
  };
  const submit = event => {
    event.preventDefault(); if (!editable || uploading) return;

    const result = (save || (value => run(model ? 'basic' : 'create', value)))( { ...form, capabilities: ['text', 'multimodal', 'embedding', 'rerank'].includes(form.type) ? form.capabilities : { streaming: form.type === 'audio' ? form.capabilities.streaming : null, tools: null, context: null, output: null } });
    if (result && !save) { if (model) { setForm(blankModel(result.models.find(item => item.id === model.id))); setEditing(false); } onSaved?.(result); }
  };
  const supportOptions = [['unknown', '未填写'], ['supported', '支持'], ['unsupported', '不支持']];
  const fact = value => <span className="mm-fact-value">{value == null || value === '' ? '—' : value}</span>;
  const fields = descriptors => descriptors.map(({ key, label, kind, placeholder, unit }) => {
    const value = form.profile[key];
    const choices = kind === 'architecture' ? ARCHITECTURE_OPTIONS : kind === 'license' ? LICENSE_OPTIONS : kind === 'confirmation' ? [['pending','待核对'],['confirmed','已核对']] : kind === 'lifecycle' ? [['stable', '稳定版'], ['preview', '预览版'], ['deprecated', '已退役']] : null;
    const options = choices && [['unknown', '未填写'], ...choices, ...(value && value !== 'unknown' && !choices.some(([id]) => id === value) ? [[value, value]] : [])];
    const multi = { languages: LANGUAGE_OPTIONS, modalities: key === 'inputModalities' ? INPUT_MODALITY_OPTIONS : OUTPUT_MODALITY_OPTIONS, tasks: TASK_OPTIONS[form.type], results: RESULT_TYPE_OPTIONS, scenarios: SCENARIO_OPTIONS, methods: ['文件上传', 'URL', 'Base64', '文本内容'], parameters: ['temperature','top_p','top_k','max_tokens','seed','stop','tools','tool_choice','reasoning','include_reasoning','structured_outputs','response_format','frequency_penalty','presence_penalty'] }[kind];
    const display = kind === 'support' ? supportOptions.find(([id]) => id === (value || 'unknown'))?.[1] : choices ? options.find(([id]) => id === (value || 'unknown'))?.[1] : Array.isArray(value) ? value.join('、') : value != null && value !== '' ? String(value) + (unit ? ' ' + unit : '') : '';
    return <Field label={<ModelFieldLabel name={label}/>} key={key} className={kind==='json'?'mm-json-field':kind==='image'?'mm-image-field':''}>{kind === 'image' ? <div className="mm-logo-upload">{value ? <img src={value} alt="模型 Logo"/> : !editing && fact('—')}{editing && <div><Input ref={logoInput} className="mm-logo-file" type="file" accept="image/png,image/jpeg,image/webp" aria-label="上传模型 Logo" disabled={!editable || uploading} onChange={uploadLogo}/><Button type="button" variant="outline" disabled={!editable || uploading} onClick={() => logoInput.current?.click()}>{value ? '更换图片' : '上传图片'}</Button><small>{uploading ? '正在读取图片…' : 'PNG、JPEG、WebP，最大 1 MB'}{value && <Button type="button" variant="link" disabled={!editable || uploading} onClick={() => profileChange('logo', '')}>移除图片</Button>}</small></div>}</div> : !editing ? fact(kind==='json' && value!=null?JSON.stringify(value):display) : kind==='json' ? <Textarea aria-label={label} rows={4} value={typeof value==='string'?value:JSON.stringify(value ?? {},null,2)} disabled={!editable} onChange={event=>profileChange(key,event.target.value)}/> : multi ? <MultiChoice label={label} choices={multi} value={value || []} disabled={!editable} onChange={input => profileChange(key, input)}/> : choices || kind === 'support' ? <Choice label={label} value={value || 'unknown'} options={options || supportOptions} disabled={!editable} onChange={input => profileChange(key, input)}/> : ['decimal', 'number'].includes(kind) ? <UnitInput unit={unit || 'B'} aria-label={label} type="number" min={kind === 'decimal' ? '0' : '1'} step={kind === 'decimal' ? 'any' : '1'} placeholder={placeholder} value={value ?? ''} disabled={!editable} onChange={event => profileChange(key, event.target.value)}/> : <Input aria-label={label} type={kind === 'date' ? ['releaseDate','knowledgeCutoff'].includes(key) && /^\d{4}-\d{2}$/.test(model?.profile?.[key] || initial?.profile?.[key] || '') ? 'month' : 'date' : 'text'} placeholder={placeholder} value={value ?? ''} disabled={!editable} onInput={kind==='date'?event=>profileChange(key,event.currentTarget.value):undefined} onChange={kind==='date'?undefined:event=>profileChange(key,event.target.value)}/>}</Field>;
  });
  const heading = (title, hint) => <div className="mm-basic-section-heading"><h3>{title}</h3>{editing && hint && <span>{hint}</span>}</div>;
  const capabilityFields = keys => editing ? <CapabilityFields catalogue fields={keys} value={form.capabilities} type={form.type} disabled={!editable} onChange={value => change('capabilities', value)}/> : <div className="mm-capability-fields">
    {keys.includes('context') && ['text', 'multimodal', 'embedding', 'rerank'].includes(form.type) && <Field label={<ModelFieldLabel name="上下文窗口"/>}>{fact(form.capabilities.context > 0 ? contextLabel(form.capabilities.context) + ' Token' : '')}</Field>}
    {keys.includes('output') && ['text', 'multimodal'].includes(form.type) && <Field label="最大输出">{fact(form.capabilities.output > 0 ? contextLabel(form.capabilities.output) + ' Token' : '')}</Field>}
    {['text', 'multimodal', 'audio'].includes(form.type) && ['streaming', ...(['text', 'multimodal'].includes(form.type) ? ['tools'] : [])].filter(key => keys.includes(key)).map(key => <Field key={key} label={key === 'streaming' ? '流式响应' : '工具调用'}>{fact(form.capabilities[key] == null ? '未填写' : form.capabilities[key] ? '支持' : '不支持')}</Field>)}
  </div>;
  const body = <>
    {(title || model && !editing && !readOnly) && <div className="mm-section-heading">{title && <h2>{title}</h2>}{model && !editing && !readOnly && <Button ref={editTrigger} type="button" variant="outline" disabled={!can} onClick={() => { setForm(blankModel(model || initial)); setEditing(true); }}>编辑</Button>}</div>}
    <section className="mm-metadata-section" aria-label={cardOnly?'模型卡片':'基本信息'}>
    {!cardOnly && heading('基本信息', '')}
    <div className="mm-basic-grid">
      <Field label={<ModelFieldLabel name="模型名称" required={editing}/>}> {editing ? <Input aria-label="模型名称" required autoFocus={Boolean(model) && !scrollable} value={form.name} disabled={!editable} onChange={event => change('name', event.target.value)}/> : fact(form.name)}</Field>
      {fields(PRESENTATION_FIELDS.filter(item => item.key === 'logo'))}
      <Field label={'模型类型' + (editing ? ' *' : '')}>{editing ? cardOnly ? <Choice label="模型类型" value={form.type} options={Object.entries(MODEL_TYPES)} disabled={!editable} onChange={value=>change('type',value)}/> : <Choice label="模型类型" disabled={!editable} value={modelCategory(form.type)} options={Object.entries(MODEL_CATALOGUE_TYPES)} onChange={value=>change('type',value==='visual'?'image':value)}/> : fact(MODEL_CATALOGUE_TYPES[modelCategory(form.type)])}</Field>
      {!cardOnly && modelCategory(form.type)==='visual' && <Field label="视觉任务类型">{editing?<Choice label="视觉任务类型" disabled={!editable} value={form.type} options={['image','video'].map(type=>[type,type==='image'?'图像':'视频'])} onChange={value=>change('type',value)}/>:fact(form.type==='video'?'视频':'图像')}</Field>}
      {cardOnly ? fields(COMMON_FIELDS.filter(item=>['inputModalities','outputModalities'].includes(item.key))) : <><Field label={<ModelFieldLabel name="规范模型标识" required={editing}/>}>{editing?<Input aria-label="规范模型标识" required readOnly={Boolean(model)} disabled={editing && !editable} value={form.modelId} placeholder="例如 zhipu/glm-5.3" onChange={event=>change('modelId',event.target.value)}/>:fact(form.modelId)}</Field>{fields([...PRESENTATION_FIELDS.filter(item=>item.key==='author'),...IDENTITY_FIELDS.filter(item=>['family','version','releaseDate'].includes(item.key))])}</>}
      {cardOnly ? <Field label="上下文窗口">{editing ? <UnitInput unit="Token" aria-label="上下文窗口" type="number" min="1" step="1" placeholder="待确认" value={form.capabilities.context ?? ''} disabled={!editable || !['text','multimodal','embedding','rerank'].includes(form.type)} onChange={event=>change('capabilities',{...form.capabilities,context:event.target.value})}/> : fact(form.capabilities.context > 0 ? contextLabel(form.capabilities.context)+' Token' : '')}</Field> : null}
      {cardOnly && fields(IDENTITY_FIELDS.filter(item=>item.key==='releaseDate').map(item=>({...item,label:'原厂发布日期'})))}
    </div>
    <Field className="mm-description-field" label={(cardOnly ? '模型简介' : '简短介绍') + (editing && cardOnly ? ' *' : '')}>{editing ? <Textarea aria-label={cardOnly ? '模型简介' : '简短介绍'} required={cardOnly} rows={2} disabled={!editable} value={form.description} placeholder="说明模型的主要用途与特点" onChange={event => change('description', event.target.value)}/> : fact(form.description)}</Field>
    </section>
    {!cardOnly && <>
    <section className="mm-metadata-section" aria-label="模态与任务">{heading('模态与任务','')}<div className="mm-basic-grid">{fields([...COMMON_FIELDS,...PRESENTATION_FIELDS.filter(item=>['languages','scenarios'].includes(item.key))])}</div></section>
    <section className="mm-metadata-section" aria-label="调用能力">{heading('调用能力','')}<div className="mm-basic-spec-grid">{capabilityFields(['context','output','streaming','tools'])}{fields(FEATURE_FIELDS.filter(item=>['text','multimodal'].includes(form.type) || item.key==='batch'))}{fields(specificationFields(form.type,form.usageUnit,form.profile))}</div></section>
    <section className="mm-metadata-section" aria-label="支持参数">{heading('支持参数','')}<div className="mm-basic-grid">{fields(INTERFACE_FIELDS.filter(item=>!['parameterRules','defaultParameters'].includes(item.key)))}</div>{fields(INTERFACE_FIELDS.filter(item=>['defaultParameters','parameterRules'].includes(item.key)))}</section>
    <section className="mm-metadata-section" aria-label="技术与来源">{heading('技术与来源','')}<div className="mm-basic-grid">{sourceLabel && <Field label="资料来源">{fact(sourceLabel)}</Field>}{fields(TECHNICAL_FIELDS)}{fields(IDENTITY_FIELDS.filter(item=>['lifecycle','retirementDate','replacement'].includes(item.key)))}{fields(RECORD_FIELDS)}</div><Field className="mm-description-field mm-detail-description" label="详细介绍">{editing?<Textarea aria-label="详细介绍" rows={4} disabled={!editable} value={form.profile.detailDescription || ''} onChange={event=>profileChange('detailDescription',event.target.value)}/>:fact(form.profile.detailDescription)}</Field></section>
    </>}
    {error && <p className="mm-warning-text" role="alert">{error}</p>}
  </>;
  const Container=readOnly?'div':'form';
  return <Container className={`mm-form mm-basic-form mm-presentation-form${editing ? '' : ' mm-basic-view'}${scrollable ? ' mm-scroll-form' : ''}`} onSubmit={readOnly?undefined:submit}>{scrollable?<div className="mm-form-scroll" tabIndex={-1}>{body}</div>:body}
    {!editing && scrollable && <footer className="mm-form-footer"><Button type="button" variant="outline" onClick={onCancel}>关闭</Button></footer>}
    {editing && <footer className="mm-form-footer">{!cardOnly && <span>规范模型标识创建后固定；上游模型标识在渠道接入中维护。</span>}<div className={cardOnly ? 'ml-auto' : undefined}>{(model || onCancel) && <Button type="button" variant="outline" onClick={onCancel || cancel}>取消</Button>}<Button type="submit" className="mm-primary" disabled={!editable || uploading}>{submitLabel || (model ? '保存模型资料' : '下一步：接入供应商')}</Button></div></footer>}
  </Container>;
}
