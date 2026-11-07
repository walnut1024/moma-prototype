import ServiceModeDialog from './ServiceModeDialog';
import ServicePublicationDialog from './ServicePublicationDialog';
import { useEffect, useRef, useState } from 'react';
import { Plus, Boxes } from 'lucide-react';
import {Button, RadioGroup} from '@douyinfe/semi-ui';
import {Notice, Modal, serviceOperationsUi} from './ServiceUI';
import { Heading, useOperations } from './ModelOperationsUI';

import SupplyActionDialog from './SupplyActionDialog';
import ServiceManagementWorkspace from './ServiceManagementWorkspace';
import ModelOnboarding from './ModelOnboarding';
import SupplierModelListing from './SupplierModelListing';
import SupplierModelBatch from './SupplierModelBatch';
import { LISTING_FILTER_KEYS, listingAddress, validListingReturn, listingPreferences, rememberListing } from './supplier-listing';

export default function ModelManagement(props) {
  const { state } = props, baseOps = useOperations({...props,...serviceOperationsUi}, 'listing'), { params } = baseOps;
  const rememberedView = listingPreferences(localStorage).perspective;
  const perspective = params.get('perspective') === 'suppliers' || !params.has('perspective') && rememberedView === 'suppliers' ? 'suppliers' : 'models';
  const isList = !params.get('view');
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
    const nextView = Object.hasOwn(patch, 'view') ? patch.view : params.get('view');
    baseOps.go(patch, { ...options, base: options.base || (['templates', 'template', 'templateImport'].includes(nextView) ? 'model-templates' : 'listing') });
  };
  const ops = { ...baseOps, go }, drawerTrigger = useRef(null);
  const onboard = () => go({ view: 'onboarding', draft: null, step: '0', section: null, model: null, provider: null, panel: null, sourceLibrary: null, refresh: null });
  const [dialog, setDialog] = useState(null);
  const model = state.models.find(item => item.id === params.get('model')), view = params.get('view');
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
    if (target === 'price') { go({model:model.id,returnTo:location.hash},{base:'model-prices',reset:true});return; }
    if (target === 'routing') { go({view:null,model:model.id,perspective:'models',panel:'routing',service:null,mapping:null}); return; }
    if (target === 'basic') { go({view:'template',template:model.templateId || model.id,materialMode:'edit',returnTo:location.hash,returnModel:model.id},{base:'model-templates',reset:true}); return; }
    if (target === 'supply') { go({view:null,model:model.id,perspective:'models',panel:model.serviceMode==='provider'?null:'associate',draft:null,step:null,provider:null,catalogue:null}); return; }
    go({ perspective: 'models', model: model.id, view: null, tab: null, step: null }, { preserveScroll: true });
  };
  const act = (model, kind, item, button = document.activeElement) => ops.proceed(() => { if(['price','reprice','unifiedPrice','publish','display'].includes(kind)){go({model:model.id,tab:kind==='publish' || kind==='display'?'sales':'pricing',returnTo:location.hash},{base:'model-prices',reset:true});return;}if(kind==='scope'){go({model:model.id,panel:'access',scopeEdit:'1'},{base:'listing',reset:true});return;} drawerTrigger.current = document.activeElement; setDialog({modelId:model.id,kind,item}); });
  const viewSwitch = <RadioGroup type="button" aria-label="管理视角" value={perspective} onChange={event=>switchPerspective(event.target.value)} options={[{label:'模型视角',value:'models'},{label:'服务商视角',value:'suppliers'}]}/>;
  let content;
  if (view === 'supplier-batch') content = <SupplierModelBatch key={params.get('provider') + ':' + params.get('batchMode')} state={state} ops={ops} home={home} viewSwitch={viewSwitch}/>;
  else if (view === 'onboarding') content = <ModelOnboarding state={state} ops={ops} home={home}/>;
  else if (view === 'add') content = <ServiceManagementWorkspace sourceState={props.sourceState} state={state} ops={ops} act={act} creating cancelCreate={home} finishCreate={(next,id)=>go({view:null,model:id,sourceLibrary:null,panel:null,perspective:'models',q:null,type:null,mode:null,status:null,step:null,draft:null,provider:null,catalogue:null,listingReturn:null},{saved:true})} add={()=>{}}/>;
  else content = perspective === 'suppliers' ? <><Heading title={<><Boxes/>模型服务</>} description="按服务商目录批量配置供给。">{viewSwitch}<Button onClick={onboard}><Plus/>接入模型</Button><Button theme="light" onClick={()=>go({view:"add",sourceLibrary:null,step:null,panel:null,draft:null,model:null,provider:null})}>新增模型服务</Button></Heading><SupplierModelListing key={params.get('supplier') || 'default'} state={state} ops={ops} open={open} batch={batch}/></> : <ServiceManagementWorkspace state={state} ops={ops} act={act} add={()=>go({view:"add",sourceLibrary:null,step:null,panel:null,draft:null,model:null,provider:null})}/>;
  const dialogModel = dialog && state.models.find(item => item.id === dialog.modelId);
  const close = () => ops.proceed(() => { setDialog(null); ops.dirty(false); requestAnimationFrame(() => drawerTrigger.current?.isConnected && drawerTrigger.current.focus()); });
  return <div className={view==='onboarding' || view==='supplier-batch' || perspective==='suppliers' ? 'admin-page-stack mo-workbench' : 'semi-services'}>{content}{ops.error && !dialog && (view==='onboarding' || view==='supplier-batch' || perspective==='suppliers') && !(model && !view) && <Notice error>{ops.error}</Notice>}{ops.leaveDialog}{dialogModel && (['testSupply', 'publishSupply', 'unlistSupply', 'stopSupply', 'startSupply'].includes(dialog.kind) ? <SupplyActionDialog key={dialog.kind + dialog.item.id} state={state} model={dialogModel} supplyId={dialog.item.id} kind={dialog.kind} ops={ops} close={close}/> : dialog.kind === 'serviceMode' ? <ServiceModeDialog key={dialogModel.id} state={state} model={dialogModel} ops={ops} close={close}/> : dialog.kind==='enableService' ? <ServicePublicationDialog state={state} model={dialogModel} ops={ops} close={close} chooseMode={()=>setDialog({modelId:dialogModel.id,kind:'serviceMode'})}/> : ['disableService','stopSales'].includes(dialog.kind) ? <Modal title={dialog.kind==='disableService'?'停用技术服务':'下架'} description={dialogModel.name} onClose={close}><p>{dialog.kind==='disableService'?'停止技术服务，保留销售配置、价格与历史。':'停止销售，保留技术启用状态、价格与历史。'}</p>{ops.error && <Notice error>{ops.error}</Notice>}<div className="ss-footer"><Button theme="light" onClick={close}>取消</Button><Button disabled={!ops.can || Boolean(ops.conflict)} onClick={async()=>{if(await ops.run(dialog.kind,{expectedUpdatedAt:dialogModel.updatedAt},dialogModel.id,true))close();}}>确认</Button></div></Modal> : <Modal title={`下架并停用 ${dialogModel.name}`} description="下架后停止新的订购与调用，资料、价格和历史记录保留。" onClose={close}><p className="mo-muted">已有订购和已有 Key 不再允许发起新请求；已经开始的请求按原配置完成。</p><div className="ss-footer"><Button theme="light" onClick={close}>取消</Button><Button disabled={!ops.can} onClick={async()=>{if(await ops.run('unlist',{},dialogModel.id,true))setDialog(null);}}>确认下架并停用</Button></div>{ops.error && <Notice error>{ops.error}</Notice>}</Modal>)}</div>;
}