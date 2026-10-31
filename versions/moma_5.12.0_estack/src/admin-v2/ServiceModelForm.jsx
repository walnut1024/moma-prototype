import { useState } from 'react';
import { ChevronDown } from 'lucide-react';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
import { Textarea } from '../components/ui/textarea';
import { Popover, PopoverContent, PopoverTrigger } from '../components/ui/popover';
import { Choice, Field, MultiChoice } from './ModelMetadataForm';
import { Notice } from './ModelOperationsUI';
import { MODEL_TYPES } from './model-management';
import { modelLibrary } from './model-operations';
import { modelAuthors, serviceModelDraft, INPUT_MODALITY_OPTIONS, SERVICE_OUTPUT_MODALITIES } from './model-profile';
import { libraryRecord } from './model-library';

export default function ServiceModelForm({state,ops,model,close,saved}) {
  const initialSource=!model && ops.params.get('sourceLibrary') ? libraryRecord(state,ops.params.get('sourceLibrary')) : null;
  const [form,setForm]=useState(()=>serviceModelDraft(model || initialSource));
  const [source,setSource]=useState(initialSource?.id || ''), [query,setQuery]=useState(''), [sourceOpen,setSourceOpen]=useState(false), [replacement,setReplacement]=useState(null);
  const [revision]=useState(model?.updatedAt);
  const library=modelLibrary(state), matches=library.filter(item=>[item.name,item.modelId].join(' ').toLowerCase().includes(query.trim().toLowerCase()));
  const change=patch=>{setForm(current=>({...current,...patch}));ops.dirty(true);ops.setError('');};
  const importRecord=record=>{setForm(serviceModelDraft(record));setSource(record.id);setSourceOpen(false);setReplacement(null);ops.dirty(true);ops.setError('');};
  const select=record=>{if(Object.values(form).some(value=>Array.isArray(value)?value.length:value && value!=='K'))setReplacement(record);else importRecord(record);};
  return <form className="sm-model-form" noValidate aria-label={model?'编辑模型资料':'新增模型服务'} onSubmit={event=>{event.preventDefault();const next=ops.run(model?'serviceBasics':'createServiceModel',{...form,...(!model && source?{libraryId:source}:{}),expectedUpdatedAt:revision},model?.id);if(next)saved(next,model?.id || next.audits[0].objectId);}}>
    <h2>{model?'编辑模型资料':'新增模型服务'}</h2>
    {model?.listingStatus==='已上架' && <p className="mo-muted">修改模型类型或输入、输出能力后，模型将自动下架，关联渠道需重新验证。</p>}
    {!model && <Field label="引用模型资料（选填）" hint="服务保留原资料引用；可完善对外展示内容。"><Popover open={sourceOpen} onOpenChange={setSourceOpen}><PopoverTrigger asChild><Button type="button" variant="outline" className="sm-source-trigger" aria-label="从资料管理引入"><span>{library.find(item=>item.id===source)?.name || '搜索并选择模型资料'}</span><ChevronDown/></Button></PopoverTrigger><PopoverContent className="sm-source-picker" align="start"><Input aria-label="查询模型资料" placeholder="模型名称 / 模型 ID" value={query} onChange={event=>setQuery(event.target.value)}/><div>{matches.map(item=><Button key={item.id} type="button" variant="ghost" disabled={state.models.some(row=>row.id===item.id || row.templateId===item.id)} onClick={()=>select(item)}><strong>{item.name}</strong><small>{item.modelId}{state.models.some(row=>row.id===item.id || row.templateId===item.id)?' · 已有服务':''}</small></Button>)}{!matches.length && <p>没有匹配的模型资料。</p>}</div></PopoverContent></Popover></Field>}
    {replacement && <div className="sm-import-confirm" role="alert"><p>引入“{replacement.name}”将替换当前已填写的模型资料。</p><Button type="button" variant="outline" onClick={()=>setReplacement(null)}>保留当前内容</Button><Button type="button" onClick={()=>importRecord(replacement)}>确认引入</Button></div>}
    <div className="sm-metadata-grid">
      <Field label="模型名称 *"><Input aria-label="模型名称" required maxLength={100} disabled={!ops.can} value={form.name} onChange={event=>change({name:event.target.value})}/></Field>
      <Field label="模型 ID *" hint={model?'创建后不可修改。':'英文字母、数字和中划线，最多 80 字符。'}><Input aria-label="模型 ID" required readOnly={Boolean(model)} maxLength={80} autoCapitalize="none" spellCheck={false} disabled={!ops.can} value={form.modelId} onChange={event=>change({modelId:event.target.value})}/></Field>
      <Field label="模型类型 *"><Choice label="模型类型" value={form.type || 'none'} disabled={!ops.can} options={[[ 'none','请选择模型类型'],...Object.entries(MODEL_TYPES)]} onChange={type=>change({type:type==='none'?'':type})}/></Field>
      <Field label="模型作者 *"><Choice label="模型作者" value={form.author || 'none'} disabled={!ops.can} options={[[ 'none','请选择模型作者'],...modelAuthors(state).map(author=>[author,author])]} onChange={author=>change({author:author==='none'?'':author})}/></Field>
      <Field label="发布时间 *"><Input aria-label="发布时间" type="date" required disabled={!ops.can} value={form.releaseDate} onInput={event=>change({releaseDate:event.target.value})}/></Field>
      <Field label="上下文（选填）" hint="K = 1,024 Token，M = 1,048,576 Token。"><div className="sm-context"><Input aria-label="上下文" inputMode="decimal" disabled={!ops.can} placeholder="选填" value={form.context} onChange={event=>change({context:event.target.value})}/><Choice label="上下文单位" disabled={!ops.can} value={form.contextUnit} options={[[ 'K','K'],['M','M']]} onChange={contextUnit=>change({contextUnit})}/></div></Field>
      <Field label="输入模态 *"><MultiChoice label="输入模态" choices={INPUT_MODALITY_OPTIONS} value={form.inputModalities} disabled={!ops.can} onChange={inputModalities=>change({inputModalities})}/></Field>
      <Field label="输出模态 *"><MultiChoice label="输出模态" choices={SERVICE_OUTPUT_MODALITIES} value={form.outputModalities} disabled={!ops.can} onChange={outputModalities=>change({outputModalities})}/></Field>
      <div className="sm-form-span"><Field label="模型简介 *"><Textarea aria-label="模型简介" required maxLength={1000} rows={3} disabled={!ops.can} value={form.description} onChange={event=>change({description:event.target.value})}/></Field></div>
    </div>
    {ops.error && <Notice error>{ops.error}</Notice>}
    <div className="sm-form-footer"><span>{!model && '完成后进入草稿，再选择服务模式、配置售价和关联渠道。'}</span><Button type="button" variant="outline" onClick={close}>取消</Button><Button type="submit" disabled={!ops.can}>{model?'保存模型资料':'完成添加'}</Button></div>
  </form>;
}
