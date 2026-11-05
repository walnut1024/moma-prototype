import { useState } from 'react';
import { ChevronDown } from 'lucide-react';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
import { Textarea } from '../components/ui/textarea';
import { Popover, PopoverContent, PopoverTrigger } from '../components/ui/popover';
import { Choice, Field, MultiChoice } from './ModelMetadataForm';
import { Notice } from './ModelOperationsUI';
import { MODEL_TYPES } from './model-management';
import {serviceModelSources} from './supply-models';
import { modelAuthors, serviceModelDraft, serviceModelSourceDraft, INPUT_MODALITY_OPTIONS, SERVICE_OUTPUT_MODALITIES, TASK_OPTIONS } from './model-profile';


export default function ServiceModelForm({state,sourceState=state,ops,model,close,saved,sourceLibraryId,guided=false,draftValues}) {
  const library=serviceModelSources(sourceState);
  const initialSource=!model ? library.find(record=>record.id===(sourceLibraryId || ops.params.get('sourceLibrary'))) : null;
  const [form,setForm]=useState(()=>{
    if (draftValues) return structuredClone(draftValues);
    const values=model?serviceModelDraft(model):initialSource?serviceModelSourceDraft(sourceState,initialSource):serviceModelDraft();
    if (guided && !model) {
      let code=values.modelId.replace(/[^a-zA-Z0-9]+/g,'-').replace(/^-+|-+$/g,'');
      if (!/^[a-zA-Z]/.test(code)) code='model-'+code;
      const base=code.slice(0,70).replace(/-+$/g,''); let suffix=2;
      while (state.models.some(row=>row.modelId===code || row.id===code)) code=base+'-'+suffix++;
      values.modelId=code;
    }
    return values;
  });
  const [source,setSource]=useState(initialSource?.id || ''), [query,setQuery]=useState(''), [sourceOpen,setSourceOpen]=useState(false), [replacement,setReplacement]=useState(null);
  const [revision]=useState(model?.updatedAt);
  const matches=library.filter(item=>[item.name,item.modelId].join(' ').toLowerCase().includes(query.trim().toLowerCase()));
  const change=patch=>{setForm(current=>({...current,...patch}));ops.dirty(true);ops.setError('');};
  const importRecord=record=>{setForm(serviceModelSourceDraft(sourceState,record));setSource(record.id);setSourceOpen(false);setReplacement(null);ops.dirty(true);ops.setError('');};
  const select=record=>{setSourceOpen(false);if(Object.values(form).some(value=>Array.isArray(value)?value.length:value && value!=='K'))setReplacement(record);else importRecord(record);};
  return <form className="sm-model-form" noValidate aria-label={model?'编辑模型资料':'新增模型服务'} onSubmit={async event=>{event.preventDefault();if(!model && !source){ops.setError('请先选择已接入模型');return;}const next=await ops.run(model?'serviceBasics':'createServiceModel',{...form,...(!model && source?{libraryId:source}:{}),expectedUpdatedAt:revision},model?.id);if(next)saved(next,model?.id || next.audits[0].objectId);}}>
    <h2>{guided?'补全对外资料':model?'编辑模型资料':'新增模型服务'}</h2>
    {model?.listingStatus==='已上架' && <p className="mo-muted">修改模型类型或输入、输出能力后，模型将自动下架，关联渠道需重新验证。</p>}
    {!model && !sourceLibraryId && <div className="mm-field sm-source-field"><div className="sm-source-heading"><span>已接入模型 *</span><Button type="button" variant="link" onClick={()=>ops.go({view:null,template:null,model:null,sourceLibrary:null,listingReturn:null,panel:null,perspective:'models'},{base:'providers'})}>前往模型接入</Button></div><Popover open={sourceOpen} onOpenChange={setSourceOpen}><PopoverTrigger asChild><Button type="button" variant="outline" className="sm-source-trigger" aria-label="选择已接入模型"><span>{library.find(item=>item.id===source)?.name || '从模型接入中搜索并选择模型'}</span><ChevronDown/></Button></PopoverTrigger><PopoverContent className="sm-source-picker" align="start"><Input aria-label="查询已接入模型" placeholder="模型名称 / 规范模型标识" value={query} onChange={event=>setQuery(event.target.value)}/><div>{matches.map(item=><Button key={item.id} type="button" variant="ghost" disabled={state.models.some(row=>row.id===item.id || row.templateId===item.id)} onClick={()=>select(item)}><strong>{item.name}</strong><small>{item.modelId}{state.models.some(row=>row.id===item.id || row.templateId===item.id)?' · 已有服务':''}</small></Button>)}{!matches.length && <p>暂无可选的已接入模型，请先在模型接入中添加模型。</p>}</div></PopoverContent></Popover><small>来源：模型接入 → 模型。保留同一模型资料引用，服务售价与路由另行配置。</small></div>}
    {replacement && <div className="sm-import-confirm" role="alert"><p>引入“{replacement.name}”将替换当前已填写的模型资料。</p><Button type="button" variant="outline" onClick={()=>setReplacement(null)}>保留当前内容</Button><Button type="button" onClick={()=>importRecord(replacement)}>确认引入</Button></div>}
    <div className="sm-metadata-grid">
      <Field label="模型名称 *"><Input aria-label="模型名称" required maxLength={100} disabled={!ops.can} value={form.name} onChange={event=>change({name:event.target.value})}/></Field>
      <Field label="对外调用标识 *" hint={model?'创建后不可修改；对外调用标识 在服务内容中配置。':'用户调用平台 API 时填写的 model 参数；最多 80 字符。'}><Input aria-label="对外调用标识" required readOnly={Boolean(model)} maxLength={80} autoCapitalize="none" spellCheck={false} disabled={!ops.can} value={form.modelId} onChange={event=>change({modelId:event.target.value})}/></Field>
      <Field label="模型类型 *"><Choice label="模型类型" value={form.type || 'none'} disabled={!ops.can || guided || !model && Boolean(source)} options={[[ 'none','请选择模型类型'],...Object.entries(MODEL_TYPES)]} onChange={type=>change({type:type==='none'?'':type})}/></Field>
      <Field label="模型作者 *"><Choice label="模型作者" value={form.author || 'none'} disabled={!ops.can} options={[[ 'none','请选择模型作者'],...modelAuthors(sourceState).map(author=>[author,author])]} onChange={author=>change({author:author==='none'?'':author})}/></Field>
      <Field label="发布时间 *"><Input aria-label="发布时间" type={/^\d{4}-\d{2}$/.test(form.releaseDate) ? "month" : "date"} required disabled={!ops.can} value={form.releaseDate} onInput={event=>change({releaseDate:event.target.value})}/></Field>
      <Field label="上下文（选填）" hint="K = 1,024 Token，M = 1,048,576 Token。"><div className="sm-context"><Input aria-label="上下文" inputMode="decimal" disabled={!ops.can} placeholder="选填" value={form.context} onChange={event=>change({context:event.target.value})}/><Choice label="上下文单位" disabled={!ops.can} value={form.contextUnit} options={[[ 'K','K'],['M','M']]} onChange={contextUnit=>change({contextUnit})}/></div></Field>
      <Field label="支持任务 *"><MultiChoice label="支持任务" choices={TASK_OPTIONS[form.type] || []} value={form.tasks || []} disabled={!ops.can} onChange={tasks=>change({tasks})}/></Field>
      <Field label="输入模态 *"><MultiChoice label="输入模态" choices={INPUT_MODALITY_OPTIONS} value={form.inputModalities} disabled={!ops.can} onChange={inputModalities=>change({inputModalities})}/></Field>
      <Field label="输出模态 / 结果类型 *"><MultiChoice label="输出模态 / 结果类型" choices={SERVICE_OUTPUT_MODALITIES} value={form.outputModalities} disabled={!ops.can} onChange={outputModalities=>change({outputModalities})}/></Field>
      <div className="sm-form-span"><Field label="模型简介 *"><Textarea aria-label="模型简介" required maxLength={1000} rows={3} disabled={!ops.can} value={form.description} onChange={event=>change({description:event.target.value})}/></Field></div>
    </div>
    {ops.error && <Notice error>{ops.error}</Notice>}
    <div className="sm-form-footer"><span>{!model && !guided && '添加后配置服务模式、售价和渠道，确认后上架。'}</span><Button type="button" variant="outline" onClick={close}>{guided?'返回连接检查':'取消'}</Button><Button type="submit" disabled={!ops.can || !model && !source}>{guided?'保存资料并继续':model?'保存模型资料':'完成添加'}</Button></div>
  </form>;
}
