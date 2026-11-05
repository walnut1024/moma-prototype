import ModelMaterialDrawer from './ModelMaterialDrawer';
import {materialDrawerSide} from './model-material-drawer';
import { CommercialDialog } from './ServiceWorkspaceDialogs';
import { libraryRemovalIssue, modelCatalogue, MODEL_CATALOGUE_TYPES } from './model-library';
import { useEffect, useRef, useState } from 'react';
import { Plus, CheckCircle2, AlertCircle, ArrowRight, FileText, Image, Video, AudioLines, Braces, Gauge, ListOrdered, File, Boxes, Building2 } from 'lucide-react';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
import { serviceConfigurationTarget } from './service-workspace';
import { Textarea } from '../components/ui/textarea';
import { FilterPagination, FilterReset, DEFAULT_PAGE_SIZE } from '../components/FilterControls';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '../components/ui/tooltip';
import { ToggleGroup, ToggleGroupItem } from '../components/ui/toggle-group';
import { Choice, Field } from './ModelMetadataForm';
import ModelBatchImport from './ModelBatchImport';
import { modelCategory, modelCode, modelSupplies, publicationChecks } from './model-management';
import { modelProfileDraft } from './model-profile';
import { modelLibrary, libraryRecord, SERVICE_MODES } from './model-operations';
import { Heading, Notice, SearchBox, GridTable, Row, Cell, Modal, useOperations } from './ModelOperationsUI';

import MaterialsHeader from './MaterialsHeader';
import SupplyActionDialog from './SupplyActionDialog';
import SupplyPriceEditor from './SupplyPriceEditor';
import ServiceManagementWorkspace from './ServiceManagementWorkspace';
import ModelOnboarding from './ModelOnboarding';
import { UnifiedPriceDialog } from './ServiceWorkspaceDialogs';
import SupplierModelListing from './SupplierModelListing';
import SupplierModelBatch from './SupplierModelBatch';
import { LISTING_FILTER_KEYS, listingAddress, validListingReturn, listingPreferences, rememberListing } from './supplier-listing';

const modalityIcons = { 文本: FileText, 图片: Image, 视频: Video, 音频: AudioLines, 向量: Braces, 相关性分数: Gauge, 排序结果: ListOrdered };
function TemplateModalities({ profile }) {
  const inputs = profile.inputModalities || [], outputs = profile.outputModalities?.length ? profile.outputModalities : profile.resultTypes || [];
  const label = `输入：${inputs.join('、') || '未填写'}；输出：${outputs.join('、') || '未填写'}`;
  const icons = values => values.length ? values.map(value => { const Icon = modalityIcons[value] || File; return <span key={value} title={value}><Icon aria-hidden="true"/></span>; }) : <span>—</span>;
  return <Tooltip><TooltipTrigger asChild><span className="mo-template-modalities" tabIndex={0} role="img" aria-label={label}><span>{icons(inputs)}</span><ArrowRight aria-hidden="true"/><span>{icons(outputs)}</span></span></TooltipTrigger><TooltipContent>{label}</TooltipContent></Tooltip>;
}
function TemplateList({ state, ops }) {
  const openMaterial=(event,id,mode)=>ops.go({view:'template',template:id,materialMode:mode,drawerSide:materialDrawerSide(event.currentTarget.getBoundingClientRect(),window.innerWidth)},{preserveScroll:true});
  const [query, setQuery] = useState(''), [type, setType] = useState('all'), [page, setPage] = useState(1), [size, setSize] = useState(DEFAULT_PAGE_SIZE);
  const [removing, setRemoving] = useState(null);
  const records = modelCatalogue(state);
  const rows = records.filter(template => (!query || [template.name, template.modelId, template.profile?.author].join(' ').toLowerCase().includes(query.toLowerCase())) && (type === 'all' || modelCategory(template.type) === type));
  const current = Math.min(page, Math.ceil(rows.length / size) || 1);
  return <TooltipProvider delayDuration={200}><section className="mo-surface"><div className="mo-toolbar" role="group" aria-label="筛选条件"><SearchBox value={query} onChange={value => { setQuery(value); setPage(1); }} placeholder="搜索模型名称 / 作者 / 规范标识"/><span className="mo-filter-label">模型类型</span><Choice label="模型类型" value={type} options={[[ 'all', '全部类型'], ...Object.entries(MODEL_CATALOGUE_TYPES)]} onChange={value => { setType(value); setPage(1); }}/><FilterReset onClick={() => { setQuery(''); setType('all'); setPage(1); }}/></div><GridTable className="mo-template-table" headings={['模型名称', '规范模型标识', '作者', '原厂发布日期', '模型类型', '资料状态', '输入 / 输出', '上下文窗口', '操作']} empty={!rows.length}>{rows.slice((current - 1) * size, current * size).map(template => {
    const profile = modelProfileDraft(template);
    return <Row key={template.id}><Cell><Button variant="link" className="mo-template-name" title={template.name} onClick={event=>openMaterial(event,template.id,'view')}>{template.name}</Button></Cell><Cell><code title={template.modelId}>{template.modelId || '—'}</code></Cell><Cell>{profile.author || template.maker || '—'}</Cell><Cell>{profile.releaseDate || '—'}</Cell><Cell>{MODEL_CATALOGUE_TYPES[modelCategory(template.type)]}</Cell><Cell>{profile.sourceStatus==='confirmed'?'已核对':'待核对'}</Cell><Cell><TemplateModalities profile={profile}/></Cell><Cell>{template.capabilities.context ? template.capabilities.context / 1024 + 'K Token' : '—'}</Cell><Cell><div className="mo-template-actions"><Button variant="link" onClick={event=>openMaterial(event,template.id,'edit')}>编辑</Button><Tooltip><TooltipTrigger asChild><span tabIndex={0}><Button variant="link" disabled={!ops.can || Boolean(libraryRemovalIssue(state, template.id))} aria-label={'删除模型资料：' + template.name} onClick={() => { ops.setError(''); setRemoving(template); }}>删除</Button></span></TooltipTrigger><TooltipContent>{libraryRemovalIssue(state, template.id) || '删除未被引用的模型资料'}</TooltipContent></Tooltip></div></Cell></Row>;
  })}</GridTable><FilterPagination total={rows.length} page={current} size={size} onPageChange={setPage} onSizeChange={value => { setSize(value); setPage(1); }}/></section>{removing && <Modal title="删除模型资料" description={removing.name} onClose={() => { setRemoving(null); ops.setError(''); }}><p>仅可删除未被引用的模型资料。删除后将无法在添加供应模型时选择。</p>{ops.error && <Notice error>{ops.error}</Notice>}<div className="mo-footer"><Button variant="outline" onClick={() => setRemoving(null)}>取消</Button><Button variant="destructive" disabled={!ops.can || Boolean(libraryRemovalIssue(state, removing.id))} onClick={async () => { if (await ops.run('templateDelete', { id: removing.id, confirmed: true })) setRemoving(null); }}>确认删除资料</Button></div></Modal>}</TooltipProvider>;
}
export default function ModelManagement(props) {
  const { state } = props, baseOps = useOperations(props, props.templatePage ? 'model-templates' : 'listing'), { params } = baseOps;
  const rememberedView = listingPreferences(localStorage).perspective;
  const perspective = params.get('perspective') === 'suppliers' || !params.has('perspective') && rememberedView === 'suppliers' ? 'suppliers' : 'models';
  const isList = !props.templatePage && !params.get('view');
  const restoreList = useRef(true);
  const rememberCurrentList = () => rememberListing(localStorage, { perspective, [perspective]: { address: listingAddress(params, perspective), scrollY: window.scrollY } });
  useEffect(() => {
    if (!isList || location.hash.split('?')[0] !== '#/admin-2/listing') { restoreList.current = true; return; }
    const saved = listingPreferences(localStorage)[perspective];
    if (!params.size && validListingReturn(saved?.address)) { baseOps.go(Object.fromEntries(new URLSearchParams(saved.address.split('?')[1])), { saved: true, replace: true }); return; }
    rememberListing(localStorage, { perspective, [perspective]: { address: listingAddress(params, perspective), scrollY: window.scrollY } });
    if (restoreList.current) {
      restoreList.current = false;
      const scrollY = saved?.address === listingAddress(params, perspective) && Number.isFinite(saved.scrollY) ? Math.max(0, saved.scrollY) : 0;
      const frame = requestAnimationFrame(() => window.scrollTo(0, scrollY));
      return () => cancelAnimationFrame(frame);
    }
  }, [params, isList, perspective]);
  const go = (patch, options = {}) => {
    if (isList && ['add', 'supplier-batch', 'onboarding'].includes(patch.view)) {
      rememberCurrentList(); patch = { ...patch, listingReturn: listingAddress(params, perspective) };
    }
    const nextView = Object.hasOwn(patch, 'view') ? patch.view : params.get('view') || (props.templatePage ? 'templates' : null);
    baseOps.go(patch, { ...options, base: options.base || (['templates', 'template', 'templateImport'].includes(nextView) ? 'model-templates' : 'listing') });
  };
  const ops = { ...baseOps, go }, drawerTrigger = useRef(null);
  const onboard = () => go({ view: 'onboarding', draft: null, step: '0', section: null, model: null, provider: null, panel: null, sourceLibrary: null, refresh: null });
  const [dialog, setDialog] = useState(null);
  const model = state.models.find(item => item.id === params.get('model')), view = params.get('view') || (props.templatePage ? 'templates' : null);
  const template = libraryRecord(state, params.get('template'));
  const returnFromLibrary = (id, saved = false) => validListingReturn(params.get('returnListing')) ? ops.proceed(() => { location.hash = params.get('returnListing'); }) : params.get('returnModel') ? go({ view: null, template: null, returnModel: null, model: params.get('returnModel'), tab: null }, { base: 'listing', saved }) : params.get('returnDraft') ? go({ view: 'add', template: null, returnDraft: null, draft: params.get('returnDraft'), library: id || params.get('library'), step: 'metadata' }, { base: 'listing', saved }) : go({ view: 'templates', template: null,materialMode:null,drawerSide:null }, { saved,preserveScroll:true });
  const home = () => validListingReturn(params.get('listingReturn')) ? ops.proceed(() => { location.hash = params.get('listingReturn'); }) : params.get('origin')?.startsWith('#/admin-2/providers') ? ops.proceed(() => { location.hash = params.get('origin'); }) : go({ view: null, model: null, sourceLibrary: null, step: null, tab: null, template: null, return: null, supply: null, chosen: null, draft: null, provider: null, catalogue: null, section: null, refresh: null });
  const switchPerspective = next => {
    if (!next || next === perspective) return;
    ops.proceed(() => {
      if (isList) rememberCurrentList(); restoreList.current = true;
      const saved = listingPreferences(localStorage)[next]?.address;
      const nextParams = new URLSearchParams(validListingReturn(saved)?.split('?')[1] || '');
      const patch = Object.fromEntries(LISTING_FILTER_KEYS.map(key => [key, nextParams.get(key)]));
      go({ ...patch, perspective: next, view: null, model: null, draft: null, step: null, batchMode: null, listingReturn: null }, { saved: true, replace: true });
    });
  };
  const batch = (provider, ids, review = false) => {
    rememberListing(localStorage, { batch: { providerId: provider.id, ids } });
    go({ view: 'supplier-batch', provider: provider.id, model: null, draft: null, batchMode: review ? 'review' : 'configure' });
  };
  const open = (model, target = 'supplies') => {
    if (target === 'price') { if(model.serviceMode==='provider') go({view:null,model:model.id,perspective:'models',panel:null}); else act(model,'unifiedPrice'); return; }
    if (target === 'routing') { go({view:null,model:model.id,perspective:'models',panel:'routing',service:null,mapping:null}); return; }
    if (target === 'basic') { go({view:null,model:model.id,perspective:'models',panel:'editMetadata',tab:null}); return; }
    if (target === 'supply') { go({view:null,model:model.id,perspective:'models',panel:model.serviceMode==='provider'?null:'associate',draft:null,step:null,provider:null,catalogue:null}); return; }
    go({ perspective: 'models', model: model.id, view: null, tab: null, step: null }, { preserveScroll: true });
  };
  const act = (model, kind, item) => ops.proceed(() => { drawerTrigger.current = document.activeElement; const supplies = modelSupplies(state, model.id); setDialog({ modelId: model.id, kind: kind === 'reprice' ? supplies.length === 1 ? 'price' : 'choosePrice' : kind, item: kind === 'reprice' && supplies.length === 1 ? supplies[0] : item }); });
  const viewSwitch = <TooltipProvider delayDuration={200}><ToggleGroup type="single" value={perspective} onValueChange={switchPerspective} spacing={0} aria-label="管理视角" className="mo-perspective-switch">{[['models', '模型视角', Boxes], ['suppliers', '供应商视角', Building2]].map(([value, label, Icon]) => <Tooltip key={value}><TooltipTrigger asChild><ToggleGroupItem value={value} aria-label={label}><Icon/></ToggleGroupItem></TooltipTrigger><TooltipContent side="bottom">{label}</TooltipContent></Tooltip>)}</ToggleGroup></TooltipProvider>;
  let content;
  if (['templates','template'].includes(view)) content = <><MaterialsHeader active="model-templates" ops={ops}><Button variant="outline" disabled={!ops.can} onClick={() => go({ view: 'templateImport' })}>批量导入</Button><Button disabled={!ops.can} onClick={event=>go({view:'template',template:null,materialMode:'edit',drawerSide:materialDrawerSide(event.currentTarget.getBoundingClientRect(),window.innerWidth)},{preserveScroll:true})}><Plus/>新建资料</Button></MaterialsHeader><TemplateList state={state} ops={ops}/>{view==='template' && (params.get('template') && !template?<Modal title="模型资料不存在" onClose={()=>returnFromLibrary()}><Notice error>该模型资料可能已移除。</Notice></Modal>:<ModelMaterialDrawer state={state} record={template} ops={ops} initial={state.modelOnboardings.find(item=>item.id===params.get('returnDraft'))?.model || {modelId:params.get('code') || '',name:params.get('code') || ''}} onClose={()=>returnFromLibrary(template?.id)} onSaved={(next,id)=>params.get('returnListing') || params.get('returnModel') || params.get('returnDraft')?returnFromLibrary(id,true):go({template:id,materialMode:'view'},{saved:true,replace:true,preserveScroll:true})}/>)}</>;
  else if (view === 'templateImport') content = <><Heading title="批量导入模型资料" description="先校验，再确认导入；相同规范模型标识不会覆盖。"/><section className="mo-surface mo-pad"><ModelBatchImport key={view} mode="template" state={{...state,models:modelLibrary(state)}} can={ops.can} dirty={ops.dirty} run={async (_operation,data)=>await ops.run('templateImport',data)} close={saved=>go({view:'templates'},{saved:saved===true})}/></section></>;
  else if (view === 'supplier-batch') content = <SupplierModelBatch key={params.get('provider') + ':' + params.get('batchMode')} state={state} ops={ops} home={home} viewSwitch={viewSwitch}/>;
  else if (view === 'onboarding') content = <ModelOnboarding state={state} ops={ops} home={home}/>;
  else if (view === 'add') content = <ServiceManagementWorkspace sourceState={props.sourceState} state={state} ops={ops} act={act} creating cancelCreate={home} finishCreate={(next,id)=>go({view:null,model:id,sourceLibrary:null,panel:null,perspective:'models',q:null,type:null,mode:null,status:null,step:null,draft:null,provider:null,catalogue:null,listingReturn:null},{saved:true})} add={()=>{}}/>;
  else content = perspective === 'suppliers' ? <><Heading title={<><Boxes/>模型服务</>} description="按供应商目录批量配置供给。">{viewSwitch}<Button onClick={onboard}><Plus/>接入模型</Button><Button variant="outline" onClick={()=>go({view:"add",sourceLibrary:null,step:null,panel:null,draft:null,model:null,provider:null})}>新增模型服务</Button></Heading><SupplierModelListing key={params.get('supplier') || 'default'} state={state} ops={ops} open={open} batch={batch}/></> : <ServiceManagementWorkspace state={state} ops={ops} act={act} add={()=>go({view:"add",sourceLibrary:null,step:null,panel:null,draft:null,model:null,provider:null})}/>;
  const dialogModel = dialog && state.models.find(item => item.id === dialog.modelId);
  const close = () => ops.proceed(() => { setDialog(null); ops.dirty(false); requestAnimationFrame(() => drawerTrigger.current?.isConnected && drawerTrigger.current.focus()); });
  return <div className={`mo-workbench${['templates','template'].includes(view) ? ' mo-catalog-workbench mo-template-workbench' : !view ? ' mo-catalog-workbench mo-model-list-workbench' : ''}`}>{content}{ops.error && !dialog && !(model && !view) && <Notice error>{ops.error}</Notice>}{ops.leaveDialog}{dialogModel && (['testSupply', 'publishSupply', 'unlistSupply', 'stopSupply', 'startSupply'].includes(dialog.kind) ? <SupplyActionDialog key={dialog.kind + dialog.item.id} state={state} model={dialogModel} supplyId={dialog.item.id} kind={dialog.kind} ops={ops} close={close}/> : dialog.kind === 'choosePrice' ? <Modal title="选择调价供给" description="请选择供应商及渠道模型，售价按供给分别维护。" onClose={close}>{modelSupplies(state, dialogModel.id).map(item => <Button key={item.id} variant="outline" onClick={() => setDialog({ ...dialog, kind: 'price', item })}>{item.provider?.name} · {item.callId || item.upstreamModelId}</Button>)}</Modal> : dialog.kind === 'price' ? <Modal title="售价配置" description="修改当前渠道的平台售价，其他渠道售价保持不变。" drawer onClose={close}><SupplyPriceEditor key={dialog.item.id} state={state} model={dialogModel} ops={ops} supply={modelSupplies(state,dialogModel.id).find(item => item.id === dialog.item.id)} onCancel={close} onSaved={() => setDialog(null)}/>{ops.error && <Notice error>{ops.error}</Notice>}</Modal> : dialog.kind === 'unifiedPrice' ? <UnifiedPriceDialog key={dialogModel.id} state={state} model={dialogModel} ops={ops} close={close}/> : dialog.kind === 'serviceMode' ? <ServiceModeDialog key={dialogModel.id} state={state} model={dialogModel} ops={ops} close={close}/> : dialog.kind === 'display' ? <DisplayDialog key={dialogModel.id} model={dialogModel} ops={ops} close={close} saved={close}/> : dialog.kind === 'scope' ? <ScopeDialog state={state} model={dialogModel} ops={ops} close={close} saved={() => setDialog(null)}/> : <Modal title={dialog.kind === 'publish' ? `上架 ${dialogModel.name}` : `下架并停用 ${dialogModel.name}`} description={dialog.kind === 'publish' ? '检查通过后，该模型可供租户订购。' : '下架后停止新的订购与调用，资料、价格和历史记录保留。'} onClose={close}>{dialog.kind === 'publish' ? <ul className="mo-checks">{publicationChecks(state,dialogModel).map(check => <li key={check.label}>{check.passed ? <CheckCircle2/> : <AlertCircle/>}{check.label}{!check.passed && <Button variant="link" onClick={() => { if(check.tab==='serviceMode'){setDialog({modelId:dialogModel.id,kind:'serviceMode'});return;} setDialog(null); if(check.tab==='pricing' && dialogModel.serviceMode==='standard'){act(dialogModel,'unifiedPrice');return;} go({view:null,perspective:'models',model:dialogModel.id,...serviceConfigurationTarget(dialogModel,check)}); }}>前往配置</Button>}</li>)}</ul> : <p className="mo-muted">已有订购和已有 Key 不再允许发起新请求；已经开始的请求按原配置完成。</p>}<div className="mo-footer"><Button variant="outline" onClick={close}>取消</Button><Button disabled={!ops.can || dialog.kind === 'publish' && publicationChecks(state,dialogModel).some(check => !check.passed)} onClick={async () => { if (await ops.run(dialog.kind, { id: dialog.item?.id }, dialogModel.id, true)) setDialog(null); }}>确认{dialog.kind === 'publish' ? '上架' : '下架并停用'}</Button></div>{ops.error && <Notice error>{ops.error}</Notice>}</Modal>)}</div>;
}
function ServiceModeDialog({ model, ops, close }) {
  const [value, setValue] = useState(() => ({ serviceMode: '', expectedUpdatedAt: model.updatedAt }));
  const resetRequired=Boolean(model.serviceMode), delisting=resetRequired || model.listingStatus==='已上架';
  const mode = SERVICE_MODES[value.serviceMode];
  return <Modal title={resetRequired ? '切换服务模式' : '选择服务模式'} description={model.name + ' · ' + modelCode(model)} onClose={close}>
    {resetRequired?<><Notice error>切换服务模式会触发模型下架，并清除路由映射配置。请务必谨慎操作，是否确定切换？</Notice><p className="mo-muted">当前关联渠道、供应商和平台售价需重新配置。模型资料、供应管理资源及历史版本保留。</p></>:<p className="mo-muted">服务模式为必选项，选择后才能关联渠道和配置售价。{delisting?'保存时模型将自动下架，完成配置后需重新上架。':''}</p>}
    <div className="flex flex-col gap-3">{Object.values(SERVICE_MODES).map(item => <p key={item.label}><strong>{item.label}：</strong>{item.description}</p>)}</div>
    <div className="mo-form-grid"><Field label={resetRequired?'新服务模式 *':'服务模式 *'}><Choice label="服务模式" value={value.serviceMode || 'none'} options={[[ 'none','请选择服务模式'],...Object.entries(SERVICE_MODES).filter(([id])=>id!==model.serviceMode).map(([id, item]) => [id, item.label])]} disabled={!ops.can} onChange={serviceMode => { setValue(current => ({ ...current, serviceMode:serviceMode==='none'?'':serviceMode })); ops.dirty(true); ops.setError(''); }}/></Field></div>
    {ops.error && <Notice error>{ops.error}</Notice>}
    <div className="mo-footer"><Button variant="outline" onClick={close}>取消</Button><Button disabled={!ops.can || !mode} onClick={async () => { if (await ops.run('serviceMode', {...value,confirmedReset:delisting}, model.id)) close(); }}>{resetRequired?'确定切换服务模式':'确认选择服务模式'}</Button></div>
  </Modal>;
}
function DisplayDialog({ model, ops, close, saved }) {
  const [value, setValue] = useState(() => ({ name: model.name, description: model.description || '', visibility: model.visibility, expectedUpdatedAt: model.updatedAt }));
  const change = (key, input) => { setValue(current => ({ ...current, [key]: input })); ops.dirty(true); ops.setError(''); };
  return <Modal title="展示信息配置" description={model.name + ' · ' + modelCode(model)} onClose={close}>
    <form onSubmit={async event => { event.preventDefault(); if (await ops.run('display', value, model.id)) saved(); }}>
      <div className="mo-form-grid">
        <Field label="模型展示名称 *"><Input aria-label="模型展示名称" required value={value.name} disabled={!ops.can} onChange={event => change('name', event.target.value)}/></Field>
        <Field label="展示状态"><Choice label="展示状态" value={value.visibility} options={[[ '公开', '模型广场可见'], ['内部', '模型广场不可见']]} disabled={!ops.can} onChange={input => change('visibility', input)}/></Field>
        <div className="mo-span"><Field label="模型介绍 *"><Textarea aria-label="模型介绍" required rows={4} value={value.description} disabled={!ops.can} onChange={event => change('description', event.target.value)}/></Field></div>
      </div>
      {ops.error && <Notice error>{ops.error}</Notice>}
      <div className="mo-footer"><Button type="button" variant="outline" onClick={close}>取消</Button><Button type="submit" disabled={!ops.can}>保存展示信息</Button></div>
    </form>
  </Modal>;
}
function ScopeDialog(props) { return <CommercialDialog {...props} kind="scope"/>; }
