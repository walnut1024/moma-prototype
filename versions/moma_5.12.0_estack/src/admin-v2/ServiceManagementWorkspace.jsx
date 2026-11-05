import {MODEL_CATALOGUE_TYPES} from './model-library';
import ModelFieldLabel from './ModelFieldLabel';
import { pendingGuidedOnboardings } from './guided-onboarding';
import ChannelServiceContext from './ChannelServiceContext';
import { useEffect, useRef, useState } from 'react';
import { Search, SlidersHorizontal, Plus, Boxes } from 'lucide-react';
import { Button } from '../components/ui/button';
import { Toggle } from '../components/ui/toggle';
import { Input } from '../components/ui/input';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '../components/ui/tabs';
import { Popover, PopoverContent, PopoverTrigger } from '../components/ui/popover';
import { TooltipProvider } from '../components/ui/tooltip';
import ModelMetadataForm, { Choice, Field } from './ModelMetadataForm';
import { GridTable, Row, Cell, Status, Notice, Pagination } from './ModelOperationsUI';
import { MODEL_CATEGORIES, modelCategory, modelCode, displayTime } from './model-management';
import { SERVICE_MODES, listed } from './model-operations';
import { serviceDirectoryModels, serviceIndexModels, selectServiceModel, serviceLifecycle, serviceConfiguration } from './service-workspace';
import ServiceModelForm from './ServiceModelForm';
import ModelLibraryEditor from './ModelLibraryEditor';
import { libraryRecord } from './model-library';
import { serviceModelDraft } from './model-profile';
import { ServiceMappingsContent, ServicePricingContent, ServiceCallGuide } from './ServiceContent';
import { SERVICE_WORKSPACE_TABS, serviceWorkspaceTab } from './service-workspace-panels';
import { modelOperationHistory } from './model-operation-history';
import './service-workspace.css';

function ModelDetails({state,model,ops}) {
  const master=libraryRecord(state,model.id);
  const trigger=useRef(null);
  useEffect(()=>{if(ops.params.get('returnFocus')==='metadata'){ops.go({returnFocus:null},{saved:true,replace:true,preserveScroll:true});const frame=requestAnimationFrame(()=>trigger.current?.focus());return()=>cancelAnimationFrame(frame);}},[]);
  return <div className="sm-model-form"><div className="sm-section-bar"><Button ref={trigger} className="sm-push" variant="outline" disabled={!ops.can} onClick={()=>ops.go({panel:'editMetadata'})}>编辑卡片</Button></div><ModelMetadataForm key={`${master?.id || model.id}:${master?.updatedAt || model.updatedAt}`} model={master || model} readOnly cardOnly title=""/></div>;
}
function ModelStatusSummary({state,model,ops}) {
  const task=pendingGuidedOnboardings(state).find(row=>row.model?.id===model.id);
  return task ? <div className="sm-status-summary"><Notice>本模型有接入任务待完成。<Button variant="link" onClick={()=>ops.go({view:'onboarding',draft:task.draft.id,step:String(task.step),model:null,panel:null})}>继续接入</Button></Notice></div> : null;
}
function ModelOperationRecords({state,model}) {
  const records=modelOperationHistory(state,model),[page,setPage]=useState(1),current=Math.min(page,Math.max(1,Math.ceil(records.length/20)));
  return <div className="sm-model-form"><GridTable headings={['时间','操作','操作对象','操作人','操作结果']} empty={!records.length} emptyMessage="当前模型暂无操作记录。">{records.slice((current-1)*20,current*20).map(record=><Row key={record.id}><Cell>{displayTime(record.createdAt)}</Cell><Cell>{record.action}</Cell><Cell>{record.objectLabel || record.objectId}</Cell><Cell>{record.actorName || record.actor}{record.actorId && <small>{record.actorId}</small>}</Cell><Cell><Status good={record.result==='成功'}>{record.result}</Status>{record.reason && <small>{record.reason}</small>}</Cell></Row>)}</GridTable><Pagination count={records.length} page={current} setPage={setPage} size={20}/></div>;
}

export default function ServiceManagementWorkspace({state,sourceState,ops,act,add,creating=false,cancelCreate,finishCreate}) {
  const {params,go}=ops, rows=serviceIndexModels(state,params), [filtersOpen,setFiltersOpen]=useState(false);
  const selected=selectServiceModel(rows,params.get('model')), panel=params.get('panel');
  const activeTab=serviceWorkspaceTab(params);

  const filterCount=['type','mode','status'].filter(key=>params.get(key) && params.get(key)!=='all').length;
  const change=patch=>go({...patch,view:null,panel:null,model:null,page:null,listingReturn:null,tab:null,service:null,mapping:null,providerEdit:null,providerAdd:null,identityProvider:null,providerChannels:null,providerAssociate:null,routeProvider:null},{replace:true,preserveScroll:true});
  const tasks=pendingGuidedOnboardings(state);
  const profile=selected && serviceModelDraft(selected), configuration=selected && serviceConfiguration(state,selected);
  return <TooltipProvider delayDuration={200}><div className="sm-workspace">
    <aside className="sm-index" aria-label="平台模型目录">
      <div className="sm-index-title"><h2>平台模型目录（{serviceDirectoryModels(state,params.get('model'),params.get('catalogue')).length}）</h2></div>
      <div className="sm-index-create"><Button size="sm" disabled={!ops.can || creating} onClick={add}><Plus/>新增模型服务</Button></div>
      <div className="sm-index-toolbar"><label className="sm-search"><Search aria-hidden="true"/><Input aria-label="搜索模型名称或调用标识" placeholder="名称 / 调用标识" value={params.get('q') || ''} onChange={event=>change({q:event.target.value || null})}/></label><Popover open={filtersOpen} onOpenChange={setFiltersOpen}><PopoverTrigger asChild><Button variant="outline" aria-label={`筛选模型${filterCount?`，已选 ${filterCount} 项`:''}`}><SlidersHorizontal/><span>筛选{filterCount?` ${filterCount}`:''}</span></Button></PopoverTrigger><PopoverContent className="sm-filters" align="start"><Field label="模型分类"><Choice label="筛选模型类型" value={params.get('type') || 'all'} options={[[ 'all','全部分类'],...Object.entries(MODEL_CATEGORIES)]} onChange={type=>change({type:type==='all'?null:type})}/></Field><Field label="服务模式"><Choice label="筛选服务模式" value={params.get('mode') || 'all'} options={[[ 'all','全部模式'],...Object.entries(SERVICE_MODES).map(([key,item])=>[key,item.label]),['unset','待配置']]} onChange={mode=>change({mode:mode==='all'?null:mode})}/></Field><Field label="上架状态"><Choice label="筛选上架状态" value={params.get('status') || 'all'} options={[[ 'all','全部状态'],['listed','已上架'],['unlisted','已下架'],['unpublished','未上架']]} onChange={status=>change({status:status==='all'?null:status})}/></Field><div className="sm-filter-footer"><Button variant="link" onClick={()=>change({type:null,mode:null,status:null})}>重置筛选</Button><Button onClick={()=>setFiltersOpen(false)}>完成</Button></div></PopoverContent></Popover></div>
      <nav className="sm-models" aria-label="模型列表">{rows.map(model=><Button key={model.id} variant="ghost" aria-current={!creating && selected?.id===model.id?'true':undefined} onClick={()=>go({view:null,panel:null,model:model.id,listingReturn:null,tab:null,service:null,mapping:null,providerEdit:null,providerAdd:null,identityProvider:null,providerChannels:null,providerAssociate:null,routeProvider:null},{replace:true,preserveScroll:true})}><span className="sm-model-name"><strong title={model.name}>{model.name}</strong><Status good={listed(model)}>{serviceLifecycle(model)}</Status></span><small title={modelCode(model)+' · '+(SERVICE_MODES[model.serviceMode]?.label || '待配置')}>{SERVICE_MODES[model.serviceMode]?.label || '未选择模式'} · {serviceConfiguration(state,model).label} · {modelCode(model)}</small></Button>)}{!rows.length && <div className="sm-empty" role="status">没有匹配的模型。<Button variant="link" onClick={()=>change({q:null,type:null,mode:null,status:null})}>清空查询和筛选</Button></div>}</nav>{tasks.filter(task=>!task.model).length>0 && <nav className="sm-models" aria-label="未建服务的接入任务">{tasks.filter(task=>!task.model).map(task=><Button key={task.draft.id} variant="ghost" onClick={()=>go({view:'onboarding',draft:task.draft.id,step:String(task.step),model:null,panel:null})}><strong>{task.master?.name || task.draft.rows[0]?.newModel?.name || '待选择模型'}</strong><small>接入中 · 继续任务</small></Button>)}</nav>}
    </aside>
    <section className="sm-detail" aria-label="模型服务工作台"><ChannelServiceContext state={state} ops={ops}/>{params.has('returnOnboarding') && <Notice><Button variant="link" onClick={()=>go({view:'onboarding',draft:params.get('returnOnboarding'),step:'2',panel:null,model:null,returnOnboarding:null,providerAdd:null,providerEdit:null})}>返回接入任务</Button></Notice>}{creating?<ServiceModelForm key="create" state={state} sourceState={sourceState} ops={ops} close={cancelCreate} saved={finishCreate}/>:selected?<>
      <div className="sm-service-header"><div className="sm-model-symbol">{selected.profile?.logo?<img src={selected.profile.logo} alt=""/>:<Boxes aria-hidden="true"/>}</div><div className="sm-header-model"><div><h1>{selected.name}</h1><Status good={listed(selected)}>{serviceLifecycle(selected)}</Status><span className={`sm-config-state${configuration.issues.length?'':' good'}`}>配置：{configuration.label}</span></div><p><span><ModelFieldLabel name="规范模型标识"/> <code>{modelCode(libraryRecord(state,selected.id))}</code></span><span>模型作者 {profile.author || selected.maker || '—'}</span><span>模型类型 {MODEL_CATALOGUE_TYPES[modelCategory(selected.type)]}</span><span>原厂发布日期 {profile.releaseDate || '—'}</span></p></div><div className="sm-service-header-actions"><Button variant="outline" disabled={!ops.can || Boolean(ops.conflict)} onClick={()=>act(selected,listed(selected)?'unlist':'publish')}>{listed(selected)?'下架并停用':'上架'}</Button><Toggle variant="outline" aria-label="模型广场可见性" title="仅控制模型广场展示，不影响已有订购和 API 调用；未就绪的服务仍需完成配置发布。" pressed={selected.marketVisible!==false} disabled={!ops.can} onPressedChange={visible=>ops.proceed(async ()=>await ops.run('marketVisibility',{visible,expectedUpdatedAt:selected.updatedAt},selected.id))}>{selected.marketVisible!==false?'用户可见':'用户不可见'}</Toggle></div></div>
      {params.get('publicationReturn')===selected.id && <div className="sm-section-bar"><Button variant="outline" onClick={()=>{go({publicationReturn:null},{saved:true,preserveScroll:true});act(selected,'publish');}}>返回上架检查</Button></div>}
      <ModelStatusSummary state={state} model={selected} ops={ops}/>
      <Tabs className="sm-service-tabs" value={activeTab} onValueChange={value=>go({panel:value==='materials'?null:value,service:null,mapping:null,tab:null,providerEdit:null,providerAdd:null,identityProvider:null,providerChannels:null,providerAssociate:null,routeProvider:null},{preserveScroll:true})}>
        <TabsList variant="line" className="sm-service-tab-list" aria-label="模型工作区">{SERVICE_WORKSPACE_TABS.map(([value,label])=><TabsTrigger key={value} value={value}>{label}</TabsTrigger>)}</TabsList>
        <TabsContent value="materials">{panel==='editMetadata'?<div className="sm-model-form"><ModelLibraryEditor cardOnly key={selected.id} state={state} record={libraryRecord(state,selected.id)} ops={ops} onCancel={()=>go({panel:null,returnFocus:'metadata'})} onSaved={()=>go({panel:null,returnFocus:'metadata'},{saved:true})}/></div>:<ModelDetails state={state} model={selected} ops={ops}/>}</TabsContent>
        <TabsContent value="routing"><ServiceMappingsContent key={selected.id} state={state} model={selected} ops={ops} act={act}/></TabsContent>
        <TabsContent value="guide"><ServiceCallGuide key={selected.id+'guide'+params.get('routeProvider')} state={state} model={selected} ops={ops}/></TabsContent>
        <TabsContent value="pricing"><ServicePricingContent key={selected.id} state={state} model={selected} ops={ops}/></TabsContent>
        <TabsContent value="history"><ModelOperationRecords key={selected.id} state={state} model={selected}/></TabsContent>
      </Tabs>
      {ops.conflict && <Notice error>其他页面的数据已变化，当前输入保留。<Button variant="link" onClick={ops.reload}>载入最新数据</Button></Notice>}
      {ops.error && <Notice error>{ops.error}</Notice>}
    </>:<div className="sm-empty"><h2>{params.has('model')?'未找到指定模型':'请选择模型'}</h2><p>{params.has('model')?'模型可能已移除，或不符合当前筛选条件。':'从左侧选择模型查看服务配置。'}</p>{params.has('model') && <Button variant="outline" onClick={()=>change({q:null,type:null,mode:null,status:null})}>返回模型目录</Button>}</div>}</section>
  </div></TooltipProvider>;
}
