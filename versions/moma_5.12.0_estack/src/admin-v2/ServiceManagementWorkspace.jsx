import ChannelServiceContext from './ChannelServiceContext';
import ServicePlatformTrial from './ServicePlatformTrial';
import { useState } from 'react';
import { Search, SlidersHorizontal, Plus, FileUp, Boxes } from 'lucide-react';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '../components/ui/tabs';
import { Popover, PopoverContent, PopoverTrigger } from '../components/ui/popover';
import { Tooltip, TooltipTrigger, TooltipContent, TooltipProvider } from '../components/ui/tooltip';
import { Choice, Field } from './ModelMetadataForm';
import { GridTable, Row, Cell, Status, Notice } from './ModelOperationsUI';
import { MODEL_CATEGORIES, MODEL_TYPES, modelCode, displayTime } from './model-management';
import { SERVICE_MODES, listed } from './model-operations';
import { serviceDirectoryModels, serviceIndexModels, selectServiceModel, serviceLifecycle, serviceConfiguration, providerServices } from './service-workspace';
import ServiceModelForm from './ServiceModelForm';
import { serviceModelDraft } from './model-profile';
import { ServiceContent, ServiceRoutesContent, ServiceCallGuide } from './ServiceContent';
import './service-workspace.css';

function ModelDetails({model,ops}) {
  const value=serviceModelDraft(model);
  const fields=[['模型名称',value.name],['模型 ID',value.modelId],['模型类型',MODEL_TYPES[value.type]],['模型作者',value.author],['发布时间',value.releaseDate],['上下文',value.context?`${value.context} ${value.contextUnit} Token`:'—'],['输入模态',value.inputModalities.join('、')],['输出模态',value.outputModalities.join('、')],['模型简介',value.description]];
  return <div className="sm-model-form"><div className="sm-section-bar"><h2>模型信息</h2><Button className="sm-push" variant="outline" disabled={!ops.can} onClick={()=>ops.go({panel:'editMetadata'})}>编辑资料</Button></div><dl className="sm-metadata-grid sm-model-facts">{fields.map(([label,text])=><div key={label} className={label==='模型简介'?'sm-form-span':''}><dt>{label}</dt><dd>{text || '—'}</dd></div>)}</dl></div>;
}
export default function ServiceManagementWorkspace({state,ops,act,add,importModels,creating=false,cancelCreate,finishCreate}) {
  const {params,go}=ops, rows=serviceIndexModels(state,params), [filtersOpen,setFiltersOpen]=useState(false);
  const selected=selectServiceModel(rows,params.get('model')), panel=params.get('panel');
  const activeTab=['metadata','editMetadata'].includes(panel)?'info':panel==='routing'?'routing':panel==='guide'?'guide':panel==='history'?'history':'content';
  const filterCount=['type','mode','status'].filter(key=>params.get(key) && params.get(key)!=='all').length;
  const change=patch=>go({...patch,view:null,panel:null,model:null,page:null,listingReturn:null,tab:null,service:null,mapping:null,providerEdit:null,providerAdd:null,providerChannels:null,providerAssociate:null,routeProvider:null},{replace:true,preserveScroll:true});
  const records=selected?state.audits.filter(item=>item.objectId===selected.id).slice(0,100):[];
  const profile=selected && serviceModelDraft(selected), configuration=selected && serviceConfiguration(state,selected);
  return <TooltipProvider delayDuration={200}><div className="sm-workspace">
    <aside className="sm-index" aria-label="平台模型目录">
      <div className="sm-index-title"><h2>平台模型目录（{serviceDirectoryModels(state,params.get('model')).length}）</h2><Tooltip><TooltipTrigger asChild><Button variant="outline" size="icon" aria-label="批量导入模型" disabled={!ops.can || creating} onClick={importModels}><FileUp aria-hidden="true"/></Button></TooltipTrigger><TooltipContent side="bottom">批量导入模型</TooltipContent></Tooltip></div>
      <div className="sm-index-create"><Button size="sm" disabled={!ops.can || creating} onClick={add}><Plus/>新增模型服务</Button></div>
      <div className="sm-index-toolbar"><label className="sm-search"><Search aria-hidden="true"/><Input aria-label="搜索模型名称或 Model ID" placeholder="名称 / Model ID" value={params.get('q') || ''} onChange={event=>change({q:event.target.value || null})}/></label><Popover open={filtersOpen} onOpenChange={setFiltersOpen}><PopoverTrigger asChild><Button variant="outline" aria-label={`筛选模型${filterCount?`，已选 ${filterCount} 项`:''}`}><SlidersHorizontal/><span>筛选{filterCount?` ${filterCount}`:''}</span></Button></PopoverTrigger><PopoverContent className="sm-filters" align="start"><Field label="模型分类"><Choice label="筛选模型类型" value={params.get('type') || 'all'} options={[[ 'all','全部分类'],...Object.entries(MODEL_CATEGORIES)]} onChange={type=>change({type:type==='all'?null:type})}/></Field><Field label="服务模式"><Choice label="筛选服务模式" value={params.get('mode') || 'all'} options={[[ 'all','全部模式'],...Object.entries(SERVICE_MODES).map(([key,item])=>[key,item.label]),['unset','待配置']]} onChange={mode=>change({mode:mode==='all'?null:mode})}/></Field><Field label="上架状态"><Choice label="筛选上架状态" value={params.get('status') || 'all'} options={[[ 'all','全部状态'],['listed','已上架'],['unlisted','已下架'],['draft','草稿'],['unpublished','未上架']]} onChange={status=>change({status:status==='all'?null:status})}/></Field><div className="sm-filter-footer"><Button variant="link" onClick={()=>change({type:null,mode:null,status:null})}>重置筛选</Button><Button onClick={()=>setFiltersOpen(false)}>完成</Button></div></PopoverContent></Popover></div>
      <nav className="sm-models" aria-label="模型列表">{rows.map(model=><Button key={model.id} variant="ghost" aria-current={!creating && selected?.id===model.id?'true':undefined} onClick={()=>go({view:null,panel:null,model:model.id,listingReturn:null,tab:null,service:null,mapping:null,providerEdit:null,providerAdd:null,providerChannels:null,providerAssociate:null,routeProvider:null},{replace:true,preserveScroll:true})}><span className="sm-model-name"><strong title={model.name}>{model.name}</strong><Status good={listed(model)}>{serviceLifecycle(model)}</Status></span><small title={modelCode(model)+' · '+(SERVICE_MODES[model.serviceMode]?.label || '待配置')}>{SERVICE_MODES[model.serviceMode]?.label || '未选择模式'} · {serviceConfiguration(state,model).label} · {modelCode(model)}</small></Button>)}{!rows.length && <div className="sm-empty" role="status">没有匹配的模型。<Button variant="link" onClick={()=>change({q:null,type:null,mode:null,status:null})}>清空查询和筛选</Button></div>}</nav>
    </aside>
    <section className="sm-detail" aria-label="模型服务工作台"><ChannelServiceContext state={state} ops={ops}/>{creating?<ServiceModelForm key="create" state={state} ops={ops} close={cancelCreate} saved={finishCreate}/>:selected?<>
      <div className="sm-service-header"><div className="sm-model-symbol">{selected.profile?.logo?<img src={selected.profile.logo} alt=""/>:<Boxes aria-hidden="true"/>}</div><div className="sm-header-model"><div><h1>{selected.name}</h1><Status good={listed(selected)}>{serviceLifecycle(selected)}</Status><span className="sm-config-state">配置：{configuration.label}</span></div><p><span>Model ID <code>{modelCode(selected)}</code></span><span>厂商 {profile.author || selected.maker || '—'}</span><span>模型类型 {MODEL_TYPES[selected.type]}</span><span>发布时间 {profile.releaseDate || '—'}</span></p></div><div className="sm-service-header-actions"><ServicePlatformTrial key={selected.id} state={state} model={selected} ops={ops}/><Button variant="outline" disabled={!ops.can} onClick={()=>act(selected,listed(selected)?'unlist':'publish')}>{listed(selected)?'下架':configuration.issues.length?'校验并上架':selected.firstPublishedAt?'重新上架':'上架'}</Button><Button type="submit" form={panel==='routing'?'service-route-config':'service-channel-association'} disabled={!ops.can || !['associate','routing'].includes(panel) || panel==='routing' && (!selected.serviceMode || selected.serviceMode==='provider' && !providerServices(selected).length)}>保存</Button></div></div>
      <Tabs className="sm-service-tabs" value={activeTab} onValueChange={value=>go({panel:value==='info'?'metadata':value==='routing'?'routing':value==='guide'?'guide':value==='history'?'history':null,service:null,mapping:null,tab:null,providerEdit:null,providerAdd:null,providerChannels:null,providerAssociate:null,routeProvider:null},{preserveScroll:true})}>
        <TabsList variant="line" className="sm-service-tab-list" aria-label="模型服务内容"><TabsTrigger value="content">服务内容</TabsTrigger><TabsTrigger value="routing">渠道与路由</TabsTrigger><TabsTrigger value="info">模型信息</TabsTrigger><TabsTrigger value="guide">调用指南</TabsTrigger><TabsTrigger value="history">操作记录</TabsTrigger></TabsList>
        <TabsContent value="info">{panel==='editMetadata'?<ServiceModelForm key={selected.id} state={state} model={selected} ops={ops} close={()=>go({panel:'metadata'})} saved={()=>go({panel:'metadata'},{saved:true})}/>:<ModelDetails model={selected} ops={ops}/>}</TabsContent>
        <TabsContent value="routing"><ServiceRoutesContent key={selected.id} state={state} model={selected} ops={ops}/></TabsContent>
        <TabsContent value="guide"><ServiceCallGuide key={selected.id} state={state} model={selected} ops={ops}/></TabsContent>
        <TabsContent value="content"><ServiceContent key={selected.id} state={state} model={selected} ops={ops} act={act}/></TabsContent>
        <TabsContent value="history"><GridTable headings={['时间','操作人','操作','结果']} empty={!records.length} emptyMessage="当前模型暂无操作记录。">{records.map(record=><Row key={record.id}><Cell>{displayTime(record.createdAt)}</Cell><Cell>{record.actor}</Cell><Cell>{record.action}</Cell><Cell>{record.result}</Cell></Row>)}</GridTable></TabsContent>
      </Tabs>
      {ops.conflict && <Notice error>其他页面的数据已变化，当前输入保留。<Button variant="link" onClick={ops.reload}>载入最新数据</Button></Notice>}
      {ops.error && <Notice error>{ops.error}</Notice>}
    </>:<div className="sm-empty"><h2>{params.has('model')?'未找到指定模型':'请选择模型'}</h2><p>{params.has('model')?'模型可能已移除，或不符合当前筛选条件。':'从左侧选择模型查看服务配置。'}</p>{params.has('model') && <Button variant="outline" onClick={()=>change({q:null,type:null,mode:null,status:null})}>返回模型目录</Button>}</div>}</section>
  </div></TooltipProvider>;
}
