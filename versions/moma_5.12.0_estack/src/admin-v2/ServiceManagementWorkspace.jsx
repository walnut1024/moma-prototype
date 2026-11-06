import { operationsReturn } from './model-pricing-workspace';
import {MODEL_CATALOGUE_TYPES} from './model-library';
import { pendingGuidedOnboardings } from './guided-onboarding';
import ChannelServiceContext from './ChannelServiceContext';
import { useState } from 'react';
import { Search, SlidersHorizontal, Plus, Waypoints } from 'lucide-react';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '../components/ui/tabs';
import { Popover, PopoverContent, PopoverTrigger } from '../components/ui/popover';
import { TooltipProvider } from '../components/ui/tooltip';
import { Choice, Field } from './ModelMetadataForm';
import { GridTable, Row, Cell, Status, Notice, Pagination, Modal, MoreActions } from './ModelOperationsUI';
import { modelCode, displayTime } from './model-management';
import { SERVICE_MODES, listed } from './model-operations';
import { serviceDirectoryModels, serviceIndexModels, selectServiceModel, serviceLifecycle, serviceConfiguration } from './service-workspace';
import ServiceModelForm from './ServiceModelForm';
import ServiceOverview from './ServiceOverview';
import ServicePlatformTrial from './ServicePlatformTrial';
import { ServiceMappingsContent, ServiceAccessContent, ServiceCallGuide } from './ServiceContent';
import { SERVICE_WORKSPACE_TABS, serviceWorkspaceTab } from './service-workspace-panels';
import { modelOperationHistory } from './model-operation-history';
import { serviceArchiveIssues } from './service-maintenance';
import './service-workspace.css';

function ModelStatusSummary({state,model,ops}) {
  const task=pendingGuidedOnboardings(state).find(row=>row.model?.id===model.id);
  return task ? <div className="sm-status-summary"><Notice>本模型有接入任务待完成。<Button variant="link" onClick={()=>ops.go({view:'onboarding',draft:task.draft.id,step:String(task.step),model:null,panel:null})}>继续接入</Button></Notice></div> : null;
}
export function ModelOperationRecords({state,model}) {
  const [query,setQuery]=useState(''),[operation,setOperation]=useState('all'),[detail,setDetail]=useState(null),[page,setPage]=useState(1);
  const all=modelOperationHistory(state,model),records=all.filter(row=>(operation==='all' || row.action===operation) && [row.action,row.objectLabel,row.actorName,row.actor,row.reason].join(' ').toLowerCase().includes(query.trim().toLowerCase())),current=Math.min(page,Math.max(1,Math.ceil(records.length/20)));
  const value=row=>Array.isArray(row)?row.length?row.map(item=>typeof item==='object'?Object.entries(item).map(([key,v])=>key+'：'+v).join('，'):item).join('；'):'无':typeof row==='object'?Object.entries(row || {}).map(([key,v])=>key+'：'+v).join('；'):String(row);
  return <div className="sm-model-form"><div className="sm-history-filters"><Input aria-label="搜索操作记录" placeholder="搜索动作 / 对象 / 操作人" value={query} onChange={event=>{setQuery(event.target.value);setPage(1);}}/><Choice label="操作类型" value={operation} options={[[ 'all','全部操作'],...[...new Set(all.map(row=>row.action))].map(name=>[name,name])]} onChange={name=>{setOperation(name);setPage(1);}}/></div><GridTable className="sm-history-table" headings={['时间','操作','操作对象','操作人','结果','详情']} empty={!records.length} emptyMessage="没有匹配的操作记录。">{records.slice((current-1)*20,current*20).map(record=><Row key={record.id}><Cell>{displayTime(record.createdAt)}</Cell><Cell>{record.action}</Cell><Cell>{record.objectLabel || record.objectId}</Cell><Cell>{record.actorName || record.actor}</Cell><Cell><Status good={record.result==='成功'}>{record.result}</Status></Cell><Cell><Button variant="link" onClick={()=>setDetail(record)}>查看详情</Button></Cell></Row>)}</GridTable><Pagination count={records.length} page={current} setPage={setPage} size={20}/>{detail && <Modal wide drawer title="操作详情" description={detail.action+' · '+displayTime(detail.createdAt)} onClose={()=>setDetail(null)}><p>{detail.objectLabel || detail.objectId}</p><p>操作人：{detail.actorName || detail.actor} · {detail.result}</p>{detail.reason && <Notice error>{detail.reason}</Notice>}<GridTable headings={['字段 / 对象','修改前','修改后']} empty={!detail.changes?.length} emptyMessage="此记录未保留字段变更摘要。">{(detail.changes || []).map((row,index)=><Row key={index}><Cell>{row.field}<small>{row.object}</small></Cell><Cell>{value(row.before)}</Cell><Cell>{value(row.after)}</Cell></Row>)}</GridTable></Modal>}</div>;
}

export default function ServiceManagementWorkspace({state,sourceState,ops,act,add,creating=false,cancelCreate,finishCreate}) {
  const {params,go}=ops, rows=serviceIndexModels(state,params), [filtersOpen,setFiltersOpen]=useState(false),[maintenance,setMaintenance]=useState(null);
  const selected=selectServiceModel(rows,params.get('model'));
  const activeTab=serviceWorkspaceTab(params);
  const filterCount=['type','mode','status'].filter(key=>params.get(key) && params.get(key)!=='all').length;
  const change=patch=>go({...patch,view:null,panel:null,model:null,page:null,listingReturn:null,tab:null,service:null,mapping:null,providerEdit:null,providerAdd:null,identityProvider:null,providerChannels:null,providerAssociate:null,routeProvider:null},{replace:true,preserveScroll:true});
  const tasks=pendingGuidedOnboardings(state);
  const tabList=<TabsList variant="line" className="sm-service-tab-list" aria-label="模型工作区">{SERVICE_WORKSPACE_TABS.map(([value,label])=><TabsTrigger key={value} value={value}>{label}</TabsTrigger>)}</TabsList>;
  const serviceActions=selected && <><ServicePlatformTrial state={state} model={selected} ops={ops}/><Button variant="outline" disabled={!ops.can || Boolean(selected.archivedAt)} onClick={()=>act(selected,selected.callsEnabled?'disableService':'enableService')}>{selected.callsEnabled?'停用技术服务':'启用技术服务'}</Button><Button variant="outline" onClick={()=>go({service:(selected.serviceMode==='provider'?'provider:'+selected.id+':'+selected.serviceProviders?.find(row=>row.status!=='已移除')?.providerId:'standard:'+selected.id),returnTo:location.hash},{base:'model-prices',reset:true})}>维护售价与销售</Button><MoreActions label="服务维护" disabled={!ops.can}><Button variant="ghost" onClick={()=>ops.proceed(()=>setMaintenance(selected.archivedAt?'serviceRestore':'serviceArchive'))}>{selected.archivedAt?'恢复已归档服务':'归档服务'}</Button></MoreActions></>;
  const header=selected && <div className="sm-service-heading"><div className="sm-service-title"><div className="sm-model-symbol">{selected.profile?.logo?<img src={selected.profile.logo} alt=""/>:<Waypoints aria-hidden="true"/>}</div><div className="sm-header-model"><h1>{selected.name}</h1></div></div>{tabList}<div className="sm-service-header-actions">{operationsReturn(params.get('returnTo')) && <Button variant="outline" onClick={()=>ops.proceed(()=>{location.hash=params.get('returnTo');})}>返回来源页面</Button>}<Popover><PopoverTrigger asChild><Button variant="ghost" aria-label="服务操作">服务操作</Button></PopoverTrigger><PopoverContent className="sm-service-actions-menu" align="end">{serviceActions}</PopoverContent></Popover></div></div>;
  return <TooltipProvider delayDuration={200}><div className="sm-workspace">
    <aside className="sm-index" aria-label="平台模型目录">
      <div className="sm-index-title"><h2>平台模型目录（{serviceDirectoryModels(state,params.get('model'),params.get('catalogue')).length}）</h2></div>
      <div className="sm-index-create"><Button size="sm" disabled={!ops.can || creating} onClick={add}><Plus/>新增模型服务</Button></div>
      <div className="sm-index-toolbar"><label className="sm-search"><Search aria-hidden="true"/><Input aria-label="搜索模型名称或调用标识" placeholder="名称 / 调用标识" value={params.get('q') || ''} onChange={event=>change({q:event.target.value || null})}/></label><Popover open={filtersOpen} onOpenChange={setFiltersOpen}><PopoverTrigger asChild><Button variant="outline" aria-label={`筛选模型${filterCount?`，已选 ${filterCount} 项`:''}`}><SlidersHorizontal/><span>筛选{filterCount?` ${filterCount}`:''}</span></Button></PopoverTrigger><PopoverContent className="sm-filters" align="start"><Field label="模型分类"><Choice label="筛选模型类型" value={params.get('type') || 'all'} options={[[ 'all','全部分类'],...Object.entries(MODEL_CATALOGUE_TYPES)]} onChange={type=>change({type:type==='all'?null:type})}/></Field><Field label="服务模式"><Choice label="筛选服务模式" value={params.get('mode') || 'all'} options={[[ 'all','全部模式'],...Object.entries(SERVICE_MODES).map(([key,item])=>[key,item.label]),['unset','待配置']]} onChange={mode=>change({mode:mode==='all'?null:mode})}/></Field><Field label="上架状态"><Choice label="筛选上架状态" value={params.get('status') || 'all'} options={[[ 'all','全部状态'],['listed','已上架'],['unlisted','已下架'],['unpublished','未上架'],['archived','已归档']]} onChange={status=>change({status:status==='all'?null:status})}/></Field><div className="sm-filter-footer"><Button variant="link" onClick={()=>change({type:null,mode:null,status:null})}>重置筛选</Button><Button onClick={()=>setFiltersOpen(false)}>完成</Button></div></PopoverContent></Popover></div>
      <nav className="sm-models" aria-label="模型列表">{rows.map(model=><Button key={model.id} variant="ghost" aria-current={!creating && selected?.id===model.id?'true':undefined} onClick={()=>go({view:null,panel:null,model:model.id,listingReturn:null,tab:null,service:null,mapping:null,providerEdit:null,providerAdd:null,identityProvider:null,providerChannels:null,providerAssociate:null,routeProvider:null},{replace:true,preserveScroll:true})}><span className="sm-model-name"><strong title={model.name}>{model.name}</strong><Status good={listed(model)}>{serviceLifecycle(model)}</Status></span><small title={modelCode(model)+' · '+(SERVICE_MODES[model.serviceMode]?.label || '待配置')}>{SERVICE_MODES[model.serviceMode]?.label || '未选择模式'} · {serviceConfiguration(state,model).label} · {modelCode(model)}</small></Button>)}{!rows.length && <div className="sm-empty" role="status">没有匹配的模型。<Button variant="link" onClick={()=>change({q:null,type:null,mode:null,status:null})}>清空查询和筛选</Button></div>}</nav>{tasks.filter(task=>!task.model).length>0 && <nav className="sm-models" aria-label="未建服务的接入任务">{tasks.filter(task=>!task.model).map(task=><Button key={task.draft.id} variant="ghost" onClick={()=>go({view:'onboarding',draft:task.draft.id,step:String(task.step),model:null,panel:null})}><strong>{task.master?.name || task.draft.rows[0]?.newModel?.name || '待选择模型'}</strong><small>接入中 · 继续任务</small></Button>)}</nav>}
    </aside>
    <section className={`sm-detail${!creating && selected?' sm-service-detail':''}`} aria-label="模型服务工作台"><ChannelServiceContext state={state} ops={ops}/>{params.has('returnOnboarding') && <Notice><Button variant="link" onClick={()=>go({view:'onboarding',draft:params.get('returnOnboarding'),step:'2',panel:null,model:null,returnOnboarding:null,providerAdd:null,providerEdit:null})}>返回接入任务</Button></Notice>}{creating?<ServiceModelForm key="create" state={state} sourceState={sourceState} ops={ops} close={cancelCreate} saved={finishCreate}/>:selected?<>
      {params.get('publicationReturn')===selected.id && <div className="sm-section-bar"><Button variant="outline" onClick={()=>{go({publicationReturn:null},{saved:true,preserveScroll:true});act(selected,'publish');}}>返回上架检查</Button></div>}
      {maintenance && <Modal title={maintenance==='serviceArchive'?'归档服务':'恢复已归档服务'} description={selected.name} onClose={()=>setMaintenance(null)}><p>{maintenance==='serviceArchive'?'归档后移入已归档列表，保留资料、ID、配置、价格及调用历史。':'恢复后保持下架和停服，请核对配置后重新上架。'}</p>{maintenance==='serviceArchive' && serviceArchiveIssues(state,selected).map(issue=><p key={issue}>{issue}</p>)}{maintenance==='serviceArchive' && serviceArchiveIssues(state,selected).length>0 && <Button variant="link" onClick={()=>{setMaintenance(null);go({panel:'routing'});}}>前往渠道与路由处理引用</Button>}<div className="mo-footer"><Button variant="outline" onClick={()=>setMaintenance(null)}>取消</Button><Button disabled={!ops.can || maintenance==='serviceArchive' && serviceArchiveIssues(state,selected).length>0} onClick={async()=>{if(await ops.run(maintenance,{confirmed:true,expectedUpdatedAt:selected.updatedAt},selected.id)){setMaintenance(null);go({status:maintenance==='serviceArchive'?'archived':null},{saved:true});}}}>确认{maintenance==='serviceArchive'?'归档':'恢复'}</Button></div>{ops.error && <Notice error>{ops.error}</Notice>}</Modal>}
      <ModelStatusSummary state={state} model={selected} ops={ops}/>
      <Tabs className="sm-service-tabs" value={activeTab} onValueChange={value=>{go({panel:value==='materials'?null:value,service:null,mapping:null,tab:null,providerEdit:null,providerAdd:null,identityProvider:null,providerChannels:null,providerAssociate:null,routeProvider:null},{preserveScroll:true});}}>
        {header}
        <TabsContent value="materials"><ServiceOverview state={state} model={selected} ops={ops}/></TabsContent>
        <TabsContent value="routing"><ServiceMappingsContent key={selected.id} state={state} model={selected} ops={{...ops,can:ops.can && !selected.archivedAt}} act={act}/></TabsContent>
        <TabsContent value="guide"><ServiceCallGuide key={selected.id+'guide'+params.get('routeProvider')} state={state} model={selected} ops={{...ops,can:ops.can && !selected.archivedAt}}/></TabsContent>
        <TabsContent value="access"><ServiceAccessContent key={selected.id} state={state} model={selected} ops={ops}/></TabsContent>
        <TabsContent value="history"><ModelOperationRecords key={selected.id} state={state} model={selected}/></TabsContent>
      </Tabs>
      {ops.conflict && <Notice error>其他页面的数据已变化，当前输入保留。<Button variant="link" onClick={ops.reload}>载入最新数据</Button></Notice>}
      {ops.error && <Notice error>{ops.error}</Notice>}
    </>:<div className="sm-empty"><h2>{params.has('model')?'未找到指定模型':'请选择模型'}</h2><p>{params.has('model')?'模型可能已移除，或不符合当前筛选条件。':'从左侧选择模型查看服务配置。'}</p>{params.has('model') && <Button variant="outline" onClick={()=>change({q:null,type:null,mode:null,status:null})}>返回模型目录</Button>}</div>}</section>
  </div></TooltipProvider>;
}
