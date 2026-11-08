import { IconPlus } from '@douyinfe/semi-icons';
import ServiceModeDialog from './ServiceModeDialog';
import ServicePublicationDialog from './ServicePublicationDialog';
import { useEffect, useRef, useState } from 'react';
import {Button, RadioGroup} from '@douyinfe/semi-ui';
import {Notice, Modal, serviceOperationsUi} from './ServiceUI';
import ModelModuleHeading from './ModelModuleHeading';
import { useOperations } from './ModelOperationsUI';

import ServiceManagementWorkspace from './ServiceManagementWorkspace';
import ModelOnboarding from './ModelOnboarding';
import SupplierModelListing from './SupplierModelListing';
import SupplierModelBatch from './SupplierModelBatch';
import { LISTING_FILTER_KEYS, listingAddress, validListingReturn, listingPreferences, rememberListing } from './supplier-listing';
import { serviceArchiveIssues } from './service-maintenance';

const serviceActions = {
  disableService: ['停用', '停用后，新请求无法调用此模型服务。'],
  serviceArchive: ['归档', '归档后，服务移入已归档列表，配置和操作记录可查。'],
  serviceRestore: ['恢复', '恢复后的服务处于下架、停用状态。'],
};

function ServiceActionDialog({ state, model, dialog, ops, close }) {
  const [busy, setBusy] = useState(false);
  const [title, description] = serviceActions[dialog.kind];
  const issues = dialog.kind === 'serviceArchive' ? serviceArchiveIssues(state, model) : [];
  const changed = dialog.revision !== model.updatedAt;
  return <Modal title={title} description={model.name} onClose={() => !busy && close()} footer={<>
    <Button theme="light" disabled={busy} onClick={close}>取消</Button>
    <Button loading={busy} disabled={!ops.can || busy || changed || issues.length > 0} onClick={async () => {
      setBusy(true);
      try {
        if (!await ops.run(dialog.kind, { expectedUpdatedAt: dialog.revision, confirmed: true }, model.id)) return;
        close();
        if (['serviceArchive', 'serviceRestore'].includes(dialog.kind)) {
          ops.go({model:model.id,perspective:'models',status:dialog.kind === 'serviceArchive' ? 'archived' : null}, {saved:true,reset:true,replace:true});
        }
      } finally { setBusy(false); }
    }}>确认{title}</Button>
  </>}>
    <p>{description}</p>
    {issues.length > 0 && <Notice error><ul>{issues.map(issue => <li key={issue}>{issue}</li>)}</ul></Notice>}
    {changed && <Notice error>服务配置已变化，请关闭后重新核对。</Notice>}
    {ops.error && <Notice error>{ops.error}</Notice>}
  </Modal>;
}

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
  const act = (model, kind, item, button = document.activeElement) => ops.proceed(() => { if(['price','reprice','unifiedPrice','publish','display'].includes(kind)){go({model:model.id,tab:kind==='publish' || kind==='display'?'sales':'pricing',returnTo:location.hash},{base:'model-prices',reset:true});return;} drawerTrigger.current = button; ops.setError(''); setDialog({modelId:model.id,kind,item,revision:model.updatedAt}); });
  const viewSwitch = <RadioGroup type="button" aria-label="管理视角" value={perspective} onChange={event=>switchPerspective(event.target.value)} options={[{label:'模型视角',value:'models'},{label:'服务商视角',value:'suppliers'}]}/>;
  let content;
  if (view === 'supplier-batch') content = <SupplierModelBatch key={params.get('provider') + ':' + params.get('batchMode')} state={state} ops={ops} home={home} viewSwitch={viewSwitch}/>;
  else if (view === 'onboarding') content = <ModelOnboarding state={state} ops={ops} home={home}/>;
  else if (view === 'add') content = <ServiceManagementWorkspace sourceState={props.sourceState} state={state} ops={ops} act={act} creating cancelCreate={home} finishCreate={(next,id)=>go({view:null,model:id,sourceLibrary:null,panel:null,perspective:'models',q:null,type:null,mode:null,status:null,step:null,draft:null,provider:null,catalogue:null,listingReturn:null},{saved:true})} add={()=>{}}/>;
  else content = perspective === 'suppliers' ? <><ModelModuleHeading module="service"><div className="mo-actions">{viewSwitch}<Button icon={<IconPlus aria-hidden="true"/>} onClick={onboard}>接入模型</Button><Button theme="light" onClick={()=>go({view:"add",sourceLibrary:null,step:null,panel:null,draft:null,model:null,provider:null})}>新增模型服务</Button></div></ModelModuleHeading><SupplierModelListing key={params.get('supplier') || 'default'} state={state} ops={ops} open={open} batch={batch}/></> : <ServiceManagementWorkspace state={state} ops={ops} act={act} add={()=>go({view:"add",sourceLibrary:null,step:null,panel:null,draft:null,model:null,provider:null})}/>;
  const dialogModel = dialog && state.models.find(item => item.id === dialog.modelId);
  const close = () => ops.proceed(() => { setDialog(null); ops.dirty(false); requestAnimationFrame(() => drawerTrigger.current?.isConnected && drawerTrigger.current.focus()); });
  return <div className={view==='onboarding' || view==='supplier-batch' || perspective==='suppliers' ? 'admin-page-stack mo-workbench' : 'semi-services'}>{(view==='add' || !view && perspective==='models') && <ModelModuleHeading module="service"/>}{content}{ops.error && !dialog && (view==='onboarding' || view==='supplier-batch' || perspective==='suppliers') && !(model && !view) && <Notice error>{ops.error}</Notice>}{ops.leaveDialog}{dialogModel && (dialog.kind === 'serviceMode' ? <ServiceModeDialog key={dialogModel.id} state={state} model={dialogModel} ops={ops} close={close}/> : dialog.kind==='enableService' ? <ServicePublicationDialog state={state} model={dialogModel} ops={ops} close={close} chooseMode={()=>setDialog({modelId:dialogModel.id,kind:'serviceMode'})}/> : Object.hasOwn(serviceActions,dialog.kind) ? <ServiceActionDialog key={dialogModel.id+dialog.kind} state={props.sourceState || state} model={dialogModel} dialog={dialog} ops={ops} close={close}/> : <Modal title={`下架并停用 ${dialogModel.name}`} description="下架后停止新的订购与调用，资料、价格和历史记录保留。" onClose={close} footer={<><Button theme="light" onClick={close}>取消</Button><Button disabled={!ops.can} onClick={async()=>{if(await ops.run('unlist',{},dialogModel.id,true))setDialog(null);}}>确认下架并停用</Button></>}><p className="mo-muted">已有订购和已有 Key 不再允许发起新请求；已经开始的请求按原配置完成。</p>{ops.error && <Notice error>{ops.error}</Notice>}</Modal>)}</div>;
}
