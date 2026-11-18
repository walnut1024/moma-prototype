import ModelResourceJsonPage from './ModelResourceJsonPage';
import ModelResourceTransfer from './ModelResourceTransfer';
import { IconPlus } from '@douyinfe/semi-icons';
import ServiceModeDialog from './ServiceModeDialog';
import ServicePublicationDialog from './ServicePublicationDialog';
import { useEffect, useRef, useState } from 'react';
import { Button } from '@douyinfe/semi-ui';
import {Notice, Modal, CopyId, serviceOperationsUi} from './ServiceUI';
import ModelModuleHeading from './ModelModuleHeading';
import { useOperations } from './ModelOperationsUI';

import ServiceManagementWorkspace, { ServiceModelList } from './ServiceManagementWorkspace';
import ServiceModelForm from './ServiceModelForm';
import ModelOnboarding from './ModelOnboarding';
import { listingAddress, validListingReturn, listingPreferences, rememberListing } from './supplier-listing';
import { serviceArchiveIssues, serviceDeleteIssues } from './service-maintenance';
import { serviceDisplayName, selectServiceModel } from './service-workspace';
import { modelPresentation } from '../model-identities.mjs';
import { operationsReturn } from './model-pricing-workspace';
import { providerOffer } from '../service-access.mjs';

const serviceActions = {
  disableService: ['停止服务', '停止后，新请求无法调用此模型服务。'],
  serviceArchive: ['归档', '归档后，服务移入已归档列表，配置和操作记录可查。'],
  serviceDelete: ['删除模型服务', '删除后，服务从列表移除。模型资料、供应渠道和历史记录保留。'],
  serviceRestore: ['恢复', '恢复后，请完成配置检查再启动服务。'],
};

function ServiceActionDialog({ state, model, dialog, ops, close }) {
  const [busy, setBusy] = useState(false);
  const [title, description] = serviceActions[dialog.kind];
  const entry = dialog.providerId && providerOffer(model, dialog.providerId);
  const issues = dialog.kind === 'serviceDelete' ? serviceDeleteIssues(state, model, dialog.providerId) : dialog.kind === 'serviceArchive' ? serviceArchiveIssues(state, model) : [];
  const changed = dialog.revision !== model.updatedAt || Boolean(dialog.providerId && !entry);
  return <Modal title={title} description={entry?.callId || serviceDisplayName(model)} onClose={() => !busy && close()} footer={<>
    <Button theme="light" disabled={busy} onClick={close}>取消</Button>
    <Button type={dialog.kind === 'serviceDelete' ? 'danger' : 'primary'} loading={busy} disabled={!ops.can || busy || changed || Boolean(ops.conflict) || issues.length > 0} onClick={async () => {
      setBusy(true);
      try {
        const data = { expectedUpdatedAt: dialog.revision, confirmed: true, ...(dialog.modelServiceId ? { model_service_id: dialog.modelServiceId } : {}) };
        const saved = entry && dialog.kind === 'disableService'
          ? await ops.run('serviceProviderServing', { ...data, providerId: dialog.providerId, enabled: false }, model.id)
          : await ops.run(dialog.kind, data, model.id);
        if (!saved) return;
        close();
        if (dialog.kind === 'serviceDelete') ops.go({ model:null,view:null,panel:null,sourceLibrary:null,status:null,perspective:'models' }, { saved:true,reset:true,replace:true });
        if (['serviceArchive', 'serviceRestore'].includes(dialog.kind)) {
          ops.go({model:model.id,perspective:'models',status:dialog.kind === 'serviceArchive' ? 'archived' : null}, {saved:true,reset:true,replace:true});
        }
      } finally { setBusy(false); }
    }}>确认{title}</Button>
  </>}>
    {dialog.modelServiceId && <CopyId value={dialog.modelServiceId} label="模型服务 ID"/>}
    <p>{dialog.kind === 'serviceDelete' && entry ? '删除当前模型服务，其他模型服务不受影响。模型资料、供应渠道和历史记录保留。' : entry ? '停止后，该模型调用标识拒绝新请求。其他渠道可继续提供服务。' : description}</p>
    {issues.length > 0 && <Notice error><ul>{issues.map(issue => <li key={issue}>{issue}</li>)}</ul></Notice>}
    {changed && <Notice error>服务配置已变化，请关闭后重新核对。</Notice>}
    {ops.error && <Notice error>{ops.error}</Notice>}
  </Modal>;
}

export default function ModelManagement(props) {
  const { state, sourceState=state } = props, baseOps = useOperations({...props,...serviceOperationsUi}, 'listing'), { params } = baseOps;
  const view = ['add', 'onboarding'].includes(params.get('view')) ? params.get('view') : null;
  const isList = !view && !params.has('model') && params.get('resourceJson') !== '1';
  const restoreList = useRef(true);
  const rememberCurrentList = () => rememberListing(localStorage, { perspective: 'models', models: { address: listingAddress(params, 'models'), scrollY: window.scrollY } });
  useEffect(() => {
    if (!isList || location.hash.split('?')[0] !== '#/admin-2/listing') { restoreList.current = true; return; }
    const saved = listingPreferences(localStorage).models;
    if (!params.size && validListingReturn(saved?.address)) {
      const previous = new URLSearchParams(saved.address.split('?')[1]);
      previous.delete('model');
      previous.set('perspective', 'models');
      baseOps.go(Object.fromEntries(previous), { saved: true, replace: true });
      return;
    }
    rememberCurrentList();
    if (restoreList.current) {
      restoreList.current = false;
      const scrollY = saved?.address === listingAddress(params, 'models') && Number.isFinite(saved.scrollY) ? Math.max(0, saved.scrollY) : 0;
      const frame = requestAnimationFrame(() => window.scrollTo(0, scrollY));
      return () => cancelAnimationFrame(frame);
    }
  }, [params, isList]);
  const go = (patch, options = {}) => {
    if (!view && ['add', 'onboarding'].includes(patch.view)) {
      if (isList) rememberCurrentList();
      patch = { ...patch, listingReturn: patch.view === 'add' || !isList ? location.hash : listingAddress(params, 'models') };
    }
    const nextView = Object.hasOwn(patch, 'view') ? patch.view : params.get('view');
    baseOps.go(patch, { ...options, base: options.base || (['templates', 'template', 'templateImport'].includes(nextView) ? 'model-templates' : 'listing') });
  };
  const ops = { ...baseOps, go }, drawerTrigger = useRef(null), createTrigger = useRef(null);
  const addService = event => {
    createTrigger.current = event.currentTarget;
    go({ view: 'add', sourceLibrary: null }, { preserveScroll: true });
  };
  const [dialog, setDialog] = useState(null);
  const creating = view === 'add';
  const cancelCreate = () => {
    const target = validListingReturn(params.get('listingReturn')) || operationsReturn(params.get('origin')) || operationsReturn(params.get('returnTo'));
    if (target) {
      const address = new URL(target.slice(1), location.origin);
      baseOps.go(Object.fromEntries(address.searchParams), { base: address.pathname.split('/').at(-1), reset: true, saved: true, replace: true, preserveScroll: true });
    } else go({ view: null, sourceLibrary: null }, { saved: true, replace: true, preserveScroll: true });
    requestAnimationFrame(() => createTrigger.current?.focus({ preventScroll: true }));
  };
  const finishCreate = ids => go({
    view: null, model: ids.length === 1 ? ids[0] : null, sourceLibrary: null, panel: ids.length === 1 ? 'routing' : null, perspective: 'models',
    ...(ids.length > 1 && { q: null, type: null, mode: null, status: null, page: null }),
    step: null, draft: null, provider: null, listingReturn: null, tab: null, service: null, mapping: null,
    providerEdit: null, providerAdd: null, identityProvider: null, providerChannels: null, providerAssociate: null, routeProvider: null,
  }, { saved: true, replace: true });
  const home = () => validListingReturn(params.get('listingReturn')) ? ops.proceed(() => { location.hash = params.get('listingReturn'); }) : params.get('origin')?.startsWith('#/admin-2/providers') ? ops.proceed(() => { location.hash = params.get('origin'); }) : go({ view: null, model: null, sourceLibrary: null, step: null, tab: null, template: null, return: null, supply: null, chosen: null, draft: null, provider: null, catalogue: null, section: null, refresh: null });
  const open = (model, row) => {
    rememberCurrentList();
    go({view:null,model:model.id,perspective:'models',panel:'routing',service:row?.serviceKey || null,routeProvider:row?.providerKey || null,mapping:null});
  };
  const act = (model, kind, providerId, button = document.activeElement, modelServiceId) => ops.proceed(() => {
    drawerTrigger.current = button;
    ops.setError('');
    setDialog({modelId:model.id,kind,providerId,modelServiceId,revision:model.updatedAt});
  });
  let content;
  if (view === 'onboarding') content = <ModelOnboarding state={state} ops={ops} home={home}/>;
  else if (params.has('model')) content = <ServiceManagementWorkspace state={state} sourceState={sourceState} ops={ops} act={act}/>;
  else content = <ServiceModelList state={state} sourceState={sourceState} ops={ops} open={open} act={act}/>;
  const dialogModel = dialog && state.models.find(item => item.id === dialog.modelId);
  const close = () => ops.proceed(() => { setDialog(null); ops.dirty(false); requestAnimationFrame(() => drawerTrigger.current?.isConnected && drawerTrigger.current.focus()); });
  const detailModel = params.has('model') && selectServiceModel(state.models, params.get('model'));
  const heading = view !== 'onboarding' && <ModelModuleHeading module="service"
    title={detailModel ? `模型服务：${modelPresentation(state, detailModel).name}` : undefined}
    description={detailModel ? null : undefined}>
    {!params.has('model') && <ModelResourceTransfer state={sourceState} ops={ops} scope="services" onView={isList ? rememberCurrentList : undefined}/>}
    <Button theme="solid" icon={<IconPlus aria-hidden="true"/>} disabled={!ops.can} onClick={addService}>新增模型服务</Button>
  </ModelModuleHeading>;
  if (params.get('resourceJson') === '1') return <ModelResourceJsonPage state={sourceState} ops={ops} scope="services"/>;
  return <div className={view==='onboarding' ? 'admin-page-stack mo-workbench' : 'semi-services'}>{heading}{content}
    {creating && <ServiceModelForm key={params.get('sourceLibrary') || 'new'} sourceState={sourceState} ops={ops} close={cancelCreate} saved={finishCreate}/>}
    {ops.error && !dialog && view==='onboarding' && <Notice error>{ops.error}</Notice>}
    {ops.leaveDialog}
    {dialogModel && (dialog.kind === 'serviceMode'
      ? <ServiceModeDialog key={dialogModel.id} model={dialogModel} ops={ops} close={close}/>
      : dialog.kind === 'enableService'
        ? <ServicePublicationDialog state={state} model={dialogModel} providerId={dialog.providerId} ops={ops} close={close} chooseMode={()=>setDialog({modelId:dialogModel.id,kind:'serviceMode'})}/>
        : <ServiceActionDialog key={dialogModel.id+dialog.kind} state={sourceState} model={dialogModel} dialog={dialog} ops={ops} close={close}/>)}
  </div>;
}
