import AdminStatus from './AdminStatus';
import Table from './AdminTable';
import AdminActionMenu from './AdminActionMenu';
import { operationsReturn } from './model-pricing-workspace';
import { MODEL_CATALOGUE_TYPES } from './model-library';
import { pendingGuidedOnboardings } from './guided-onboarding';
import ChannelServiceContext from './ChannelServiceContext';
import { useState } from 'react';
import { Button, Descriptions, Empty, Input, Nav, Popover, Space, Tabs, Typography } from '@douyinfe/semi-ui';
import { IconPlus, IconSearch, IconFilter } from '@douyinfe/semi-icons';
import { Choice, Field, Notice, Modal } from './ServiceUI';
import { modelCode, displayTime } from './model-management';
import { SERVICE_MODES } from './model-operations';
import { serviceDirectoryModels, serviceIndexModels, selectServiceModel, serviceLifecycle, serviceHeaderStatus, serviceConfiguration } from './service-workspace';
import ServiceModelForm from './ServiceModelForm';
import ServiceOverview from './ServiceOverview';
import ServiceListingDialog from './ServiceListingDialog';
import { ServiceMappingsContent, ServiceAccessContent, ServiceCallGuide } from './ServiceContent';
import { SERVICE_WORKSPACE_TABS, serviceWorkspaceTab } from './service-workspace-panels';
import { PlatformTrialDialog } from './ServicePlatformTrial';
import ServiceFailover from './ServiceFailover';
import { modelOperationHistory } from './model-operation-history';

function ModelStatusSummary({ state, model, ops }) {
  const task = pendingGuidedOnboardings(state).find(row => row.model?.id === model.id);
  return task ? <Notice>本模型有接入任务待完成。<Button theme="borderless" onClick={() => ops.go({ view:'onboarding', draft:task.draft.id, step:String(task.step), model:null, panel:null })}>继续接入</Button></Notice> : null;
}
export function ModelOperationRecords({ state, model }) {
  const [query, setQuery] = useState(''), [operation, setOperation] = useState('all'), [detail, setDetail] = useState(null);
  const all = modelOperationHistory(state, model);
  const records = all.filter(row => (operation === 'all' || row.action === operation) && [row.action, row.objectLabel, row.actorName, row.actor, row.reason].join(' ').toLowerCase().includes(query.trim().toLowerCase()));
  const value = row => Array.isArray(row) ? row.length ? row.map(item => typeof item === 'object' ? Object.entries(item).map(([key,v]) => key+'：'+v).join('，') : item).join('；') : '无' : typeof row === 'object' ? Object.entries(row || {}).map(([key,v]) => key+'：'+v).join('；') : String(row);
  const columns = [
    { title:'时间', dataIndex:'createdAt', width:180, render:displayTime },
    { title:'操作', dataIndex:'action', width:180 },
    { title:'操作对象', width:200, render:(_, row) => row.objectLabel || row.objectId },
    { title:'操作人', width:140, render:(_, row) => row.actorName || row.actor },
    { title:'结果', width:100, render:(_, row) => <AdminStatus value={row.result}/> },
    { title:'详情', width:110, fixed:'right', render:(_, row) => <Button theme="borderless" onClick={() => setDetail(row)}>查看详情</Button> },
  ];
  return <div className="ss-body"><div className="ss-history-filters"><Input prefix={<IconSearch aria-hidden="true"/>} aria-label="搜索操作记录" placeholder="搜索动作 / 对象 / 操作人" value={query} onChange={text => { setQuery(text); }}/><Choice label="操作类型" value={operation} options={[[ 'all','全部操作' ], ...[...new Set(all.map(row => row.action))].map(name => [name,name])]} onChange={name => { setOperation(name); }}/></div>
    <Table rowKey="id" columns={columns} dataSource={records} scroll={{x:910,y:480}} empty="没有匹配的操作记录。" pagination={false}/>
    {detail && <Modal wide drawer title="操作详情" description={detail.action+' · '+displayTime(detail.createdAt)} onClose={() => setDetail(null)}><Descriptions data={[{key:'操作对象',value:detail.objectLabel || detail.objectId},{key:'操作人',value:detail.actorName || detail.actor},{key:'结果',value:detail.result}]}/>{detail.reason && <Notice error>{detail.reason}</Notice>}<Table pagination={false} dataSource={detail.changes || []} rowKey="field" empty="此记录未保留字段变更摘要。" columns={[{title:'字段 / 对象',render:(_,row) => <div className="ss-field-stack">{row.field}<Typography.Text type="tertiary">{row.object}</Typography.Text></div>},{title:'修改前',dataIndex:'before',render:value},{title:'修改后',dataIndex:'after',render:value}]}/></Modal>}
  </div>;
}

export default function ServiceManagementWorkspace({state,sourceState,ops,act,add,creating=false,cancelCreate,finishCreate}) {
  const {params,go} = ops, rows = serviceIndexModels(state,params);
  const [filtersOpen,setFiltersOpen] = useState(false), [listing,setListing] = useState(null), [visible,setVisible] = useState(true), [visibilityRevision,setVisibilityRevision] = useState(null);
  const selected = selectServiceModel(rows,params.get('model')), activeTab = serviceWorkspaceTab(params);
  const headerStatus = selected && serviceHeaderStatus(selected);
  const filterCount = ['type','mode','status'].filter(key => params.get(key) && params.get(key) !== 'all').length;
  const change = patch => go({...patch,view:null,panel:null,model:null,page:null,listingReturn:null,scopeEdit:null,tab:null,service:null,mapping:null,providerEdit:null,providerAdd:null,identityProvider:null,providerChannels:null,providerAssociate:null,routeProvider:null},{replace:true,preserveScroll:true});
  const tasks = pendingGuidedOnboardings(state).filter(task => !task.model);
  const closeListing = () => ops.proceed(() => {setListing(null);ops.dirty(false);ops.setError('');});
  const actions = selected ? [
    {node:'item',name:'灰度上架',disabled:!ops.can || Boolean(selected.archivedAt),onClick:() => ops.proceed(() => setListing('gray'))},
    {node:'item',name:'正式上架',disabled:!ops.can || Boolean(selected.archivedAt),onClick:() => ops.proceed(() => setListing('formal'))},
    {node:'item',name:'下架',disabled:!ops.can || selected.listingStatus !== '已上架',onClick:() => act(selected,'stopSales')},
    {node:'item',name:'可见性配置',disabled:!ops.can || Boolean(selected.archivedAt),onClick:() => ops.proceed(() => {setVisible(selected.marketVisible !== false);setVisibilityRevision(selected.updatedAt);setListing('visibility');})},
  ] : [];
  return <div className="semi-services ss-workspace">
    <aside className="ss-index" aria-label="平台模型目录">
      <Typography.Title heading={5}>平台模型目录（{serviceDirectoryModels(state,params.get('model'),params.get('catalogue')).length}）</Typography.Title>
      <Button theme="solid" icon={<IconPlus aria-hidden="true"/>} disabled={!ops.can || creating} onClick={add}>新增模型服务</Button>
      <Input prefix={<IconSearch aria-hidden="true"/>} showClear aria-label="搜索模型展示名或调用标识" placeholder="名称 / 调用标识" value={params.get('q') || ''} onChange={text => change({q:text || null})}/>
      <Popover trigger="custom" visible={filtersOpen} onClickOutSide={() => setFiltersOpen(false)} position="bottomLeft" content={<div className="semi-services ss-filter-fields"><Field label="模型分类"><Choice label="筛选模型类型" value={params.get('type') || 'all'} options={[[ 'all','全部分类' ],...Object.entries(MODEL_CATALOGUE_TYPES)]} onChange={type => change({type:type === 'all' ? null : type})}/></Field><Field label="服务模式"><Choice label="筛选服务模式" value={params.get('mode') || 'all'} options={[[ 'all','全部模式' ],...Object.entries(SERVICE_MODES).map(([key,item]) => [key,item.label]),['unset','待配置']]} onChange={mode => change({mode:mode === 'all' ? null : mode})}/></Field><Field label="上架状态"><Choice label="筛选上架状态" value={params.get('status') || 'all'} options={[[ 'all','全部状态' ],['listed','已上架'],['unlisted','已下架'],['unpublished','未上架'],['archived','已归档']]} onChange={status => change({status:status === 'all' ? null : status})}/></Field><div className="ss-footer"><Button theme="borderless" onClick={() => change({type:null,mode:null,status:null})}>重置筛选</Button><Button onClick={() => setFiltersOpen(false)}>完成</Button></div></div>}><Button icon={<IconFilter aria-hidden="true"/>} onClick={() => setFiltersOpen(!filtersOpen)} aria-label={`筛选模型${filterCount ? `，已选 ${filterCount} 项` : ''}`}>筛选{filterCount ? ` ${filterCount}` : ''}</Button></Popover>
      <Nav selectedKeys={!creating && selected ? [selected.id] : []} aria-label="模型列表" onSelect={({itemKey}) => go({view:null,panel:null,model:itemKey,listingReturn:null,scopeEdit:null,tab:null,service:null,mapping:null,providerEdit:null,providerAdd:null,identityProvider:null,providerChannels:null,providerAssociate:null,routeProvider:null},{replace:true,preserveScroll:true})}>
        {rows.map(model => <Nav.Item style={{height:"auto"}} key={model.id} itemKey={model.id} text={<div className="ss-model-item"><div className="ss-model-title"><Typography.Text strong>{model.name}</Typography.Text><AdminStatus value={serviceLifecycle(model)}/></div><Typography.Text type="tertiary" size="small">{SERVICE_MODES[model.serviceMode]?.label || '未选择模式'} · {serviceConfiguration(state,model).label}</Typography.Text><Typography.Text type="tertiary" size="small">{modelCode(model)}</Typography.Text></div>}/>) }
      </Nav>
      {!rows.length && <Empty description={<><p>没有匹配的模型。</p><Button theme="borderless" onClick={() => change({q:null,type:null,mode:null,status:null})}>清空查询和筛选</Button></>}/>}
      {tasks.length > 0 && <><Typography.Text type="tertiary">未建服务的接入任务</Typography.Text>{tasks.map(task => <Button key={task.draft.id} theme="borderless" onClick={() => go({view:'onboarding',draft:task.draft.id,step:String(task.step),model:null,panel:null})}>{task.master?.name || task.draft.rows[0]?.newModel?.name || '待选择模型'} · 继续任务</Button>)}</>}
    </aside>
    <section className="ss-detail" aria-label="模型服务工作台"><ChannelServiceContext state={state} ops={ops}/>{params.has('returnOnboarding') && <Notice><Button theme="borderless" onClick={() => go({view:'onboarding',draft:params.get('returnOnboarding'),step:'2',panel:null,model:null,returnOnboarding:null,providerAdd:null,providerEdit:null})}>返回接入任务</Button></Notice>}
      {creating ? <ServiceModelForm key="create" state={state} sourceState={sourceState} ops={ops} close={cancelCreate} saved={finishCreate}/> : selected ? <>
        <div className="ss-heading"><div className="ss-model-heading"><Typography.Title heading={4}>{selected.name}</Typography.Title><Space wrap><AdminStatus prefix="服务状态" value={headerStatus.service}/><AdminStatus prefix="可见性" value={headerStatus.visibility}/></Space></div><Space wrap>{operationsReturn(params.get('returnTo')) && <Button onClick={() => ops.proceed(() => {location.hash=params.get('returnTo');})}>返回来源页面</Button>}<AdminActionMenu label="服务操作" items={actions}>服务操作</AdminActionMenu></Space></div>
        {params.get('publicationReturn') === selected.id && <Button onClick={() => {go({publicationReturn:null},{saved:true,preserveScroll:true});act(selected,'publish');}}>返回上架检查</Button>}
        <ModelStatusSummary state={state} model={selected} ops={ops}/>
        <Tabs activeKey={activeTab} keepDOM={false} collapsible onChange={value => go({panel:value === 'materials' ? null : value,service:null,mapping:null,scopeEdit:null,tab:null,providerEdit:null,providerAdd:null,identityProvider:null,providerChannels:null,providerAssociate:null,routeProvider:['trial','guide','failover'].includes(value) ? params.get('routeProvider') : null},{preserveScroll:true})}>
          {SERVICE_WORKSPACE_TABS.map(([value,label]) => <Tabs.TabPane key={value} itemKey={value} tab={label}><div className="ss-tab-content">
            {value === 'materials' && <ServiceOverview state={state} model={selected} ops={ops}/>}
            {value === 'routing' && <ServiceMappingsContent key={selected.id} state={state} model={selected} ops={{...ops,can:ops.can && !selected.archivedAt}} act={act}/>}
            {value === 'access' && <ServiceAccessContent key={selected.id} state={state} model={selected} ops={ops}/>}
            {value === 'guide' && <ServiceCallGuide key={selected.id+'guide'+params.get('routeProvider')} state={state} model={selected} ops={{...ops,can:ops.can && !selected.archivedAt}}/>}
            {value === 'failover' && <ServiceFailover key={selected.id} state={state} model={selected} ops={{...ops,can:ops.can && !selected.archivedAt}}/>}
            {value === 'trial' && <PlatformTrialDialog key={selected.id+':'+params.get('routeProvider')} inline state={state} model={selected} providerId={params.get('routeProvider')} ops={{...ops,can:ops.can && !selected.archivedAt}}/>}
            {value === 'history' && <ModelOperationRecords key={selected.id} state={state} model={selected}/>}
          </div></Tabs.TabPane>)}
        </Tabs>
        {['gray','formal'].includes(listing) && <ServiceListingDialog key={selected.id+listing} state={state} model={selected} ops={ops} stage={listing} close={closeListing}/>}
        {listing === 'visibility' && <Modal title="可见性配置" description={selected.name} onClose={closeListing}><Field label="用户可见性"><Choice label="用户可见性" value={visible ? 'visible' : 'hidden'} options={[[ 'visible','用户可见' ],['hidden','用户不可见']]} disabled={!ops.can} onChange={value => {setVisible(value === 'visible');ops.dirty(true);}}/></Field><p>控制模型广场展示，调用授权与上架状态保持不变。</p>{ops.error && <Notice error>{ops.error}</Notice>}<div className="ss-footer"><Button onClick={closeListing}>取消</Button><Button disabled={!ops.can || Boolean(ops.conflict)} onClick={async () => {if(await ops.run('marketVisibility',{visible,expectedUpdatedAt:visibilityRevision},selected.id))closeListing();}}>保存可见性</Button></div></Modal>}
        {ops.conflict && <Notice error>其他页面的数据已变化，当前输入保留。<Button theme="borderless" onClick={ops.reload}>载入最新数据</Button></Notice>}
      </> : <Empty className="ss-empty" title={params.has('model') ? '未找到指定模型' : '请选择模型'} description={params.has('model') ? '模型可能已移除，或不符合当前筛选条件。' : '从左侧选择模型查看服务配置。'}>{params.has('model') && <Button onClick={() => change({q:null,type:null,mode:null,status:null})}>返回模型目录</Button>}</Empty>}
    </section>
  </div>;
}
