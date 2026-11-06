import {activeChannelProcurement} from './channel-change-management';
import { useEffect, useRef, useState } from 'react';
import { ArrowLeft, ArrowRight, Check, CheckCircle2, AlertCircle, Plus } from 'lucide-react';
import { Button } from '../components/ui/button';
import { Checkbox } from '../components/ui/checkbox';
import { Input } from '../components/ui/input';
import { Field } from './ModelMetadataForm';
import { SupplierChannelDialog } from './SupplierResourceDialogs';
import { channelFingerprint } from './provider-channels';
import { Heading, Modal, Notice, Status } from './ModelOperationsUI';
import SupplierChannelConfiguration from './SupplierChannelConfiguration';
import SupplierChannelBatchTest from './SupplierChannelBatchTest';
import ServiceModelForm from './ServiceModelForm';
import ProcurementVersionEditor from './ProcurementVersionEditor';
import { platformPublicationFingerprint } from './platform-publication-state';
import { getMockServiceSnapshots } from './mock-onboarding-service';
import { activeModelSalePrice, activeProviderPrice, serviceChannelCosts, serviceLifecycle } from './service-workspace';
import { displayTime, priceItems } from './model-management';
import { BillingItems } from './ServiceContent';
import ModelOnboardingSales from './ModelOnboardingSales';
import { PlatformTrialDialog } from './ServicePlatformTrial';
import { RouteWorkbench } from './ServiceRouting';
import { serviceMetadataReady } from './model-profile';
import { routingServices, routingChannels, serviceRoute, activeRouteVersion, emptyRouteConfig, routeSourceVersion } from './service-routing';
import { guidedOnboarding, pendingGuidedOnboardings, onboardingStepLabels } from './guided-onboarding';
import { ONBOARDING_PROVIDER_PRESETS } from './onboarding-presets';
import './model-onboarding.css';

const descriptions = [
  '先选择已有模型或登记最少身份，再配置供应。',
  '选择供应商和渠道，确认采购条件，测试通过后明确启用。',
  '完善展示资料，明确销售模式、平台售价与客户范围。',
  '验证实际供给与计费，核对后一次发布并上架。',
];

function OnboardingSummary({ state, model }) {
  return <section className="onboarding-summary" aria-label="服务发布摘要"><dl><div><dt>销售模式</dt><dd>{model.serviceMode==='standard'?'统一服务':'分供应商服务'}</dd></div><div><dt>客户范围</dt><dd>{model.openScope==='all'?'全部客户':state.tenants.filter(row=>model.tenantIds?.includes(row.id)).map(row=>row.name).join('、') || '未选择客户'}</dd></div></dl>{routingServices(state).filter(row=>row.modelId===model.id).map(service=>{
    const price=service.mode==='standard'?activeModelSalePrice(state,model.id):activeProviderPrice(state,model.id,service.providerId),route=activeRouteVersion(serviceRoute(state,service.id)),publication=model.platformPublications?.find(row=>row.serviceId===service.id);
    return <div className="onboarding-summary-service" key={service.id}><strong>{service.name}</strong><code>{service.callId}</code><BillingItems items={priceItems(price,model)}/><small>售价 v{price?.version || '—'} · 路由 v{route?.version || '—'}{publication?.fingerprint===platformPublicationFingerprint(state,model,service.id) && ` · 配置 v${publication.publishedVersion} · ${displayTime(publication.recordedAt)}`}</small></div>;
  })}</section>;
}

function OnboardingProfile({ state, context, ops, back, next }) {
  const [revision] = useState(context.draft.draftRevision);
  const profileOps = { ...ops, run: async (operation, values, modelId) => await ops.run('guidedProfileSave', { draftId: context.draft.id, expectedDraftRevision: revision, values }, modelId) };
  return <ServiceModelForm state={state} ops={profileOps} model={context.model} sourceLibraryId={context.master.id} guided close={back} saved={next}/>;
}

function OnboardingRoute({ state, context, ops, next, back, exit }) {
  const { model, provider, supply } = context;
  const service = routingServices(state).find(row => row.modelId === model.id && (row.mode === 'standard' || row.providerId === provider.id));
  const route = service && serviceRoute(state, service.id), active = activeRouteVersion(route);
  const channel = service && routingChannels(state, service).find(row => row.id === supply?.id);
  const [version] = useState(route?.activeVersion || 0), [sourceVersion] = useState(() => service && routeSourceVersion(state, service));
  const [confirmed, setConfirmed] = useState(false);
  const existing = Boolean(active);
  const routeOps={...ops,run:async (operation,data)=>await ops.run(operation==='serviceRoutePublish'?'guidedRouteSave':operation==='serviceRouteConfigure'?'guidedRouteConfigure':operation,{...data,draftId:context.draft.id,expectedDraftRevision:context.draft.draftRevision})};
  return <section className="onboarding-route" aria-label="确认流量路由"><h2>确认流量路由</h2>{existing ? <>
    <p className="onboarding-caption">确认发布路由后生效，服务仍需完成验证和上架。</p><RouteWorkbench state={state} model={model} ops={routeOps} draftOnly serviceId={service?.id}/>
  </> : <>
    <div className="onboarding-route-path"><div><span>对外调用 ID</span><code>{service?.callId}</code></div><ArrowRight aria-hidden="true"/><div><span>{provider.name} · {context.endpoint.name}</span><code>{context.association.upstreamModelId}</code></div><strong>100% 流量</strong></div>
    <p className="onboarding-caption">首次接入使用这一条渠道。后续可在“路由及映射”中增加备用渠道和分流策略。</p>
    {channel?.reason && <Notice error>{channel.reason}</Notice>}
    <label className="onboarding-confirm"><Checkbox checked={confirmed} disabled={!ops.can || !channel?.available} onCheckedChange={value => setConfirmed(value === true)}/>确认使用上述渠道承接此服务的全部流量</label>
  </>}
    {ops.error && <Notice error>{ops.error}</Notice>}
    <footer className="onboarding-footer"><Button type="button" variant="outline" onClick={back}>{context.draft.intent==='activate'?'上一步：接通供应':'上一步：价格与范围'}</Button><Button type="button" variant="outline" onClick={exit}>返回模型服务</Button>{context.serviceReady ? <Button type="button" onClick={next}>{context.draft.intent==='activate'?'下一步：验证并发布':'下一步：验证并上架'}<ArrowRight/></Button> : !existing && <Button type="button" disabled={!ops.can || !channel?.available || !confirmed} onClick={async () => {
      const result = await routeOps.run('serviceRoutePublish', { serviceId: service.id, expectedVersion: version, sourceVersion, config: { ...emptyRouteConfig(service), channels: [{ supplyId: channel.id, enabled: true, groupId: 'P1', priority: 1, weight: 100 }] } });
      if (result) next();
    }}>发布路由并继续</Button>}</footer>
  </section>;
}

export default function ModelOnboarding({ state, ops, home }) {
  const [connectionStep,setConnectionStep]=useState(null);
  const id = ops.params.get('draft'), task = id ? guidedOnboarding(state, id) : null, context = task?.endpoint ? task : null;
  const [listing, setListing] = useState(null), [retryTrial, setRetryTrial] = useState(false), [editing, setEditing] = useState(null), [upstreamId, setUpstreamId] = useState(''), [procurement,setProcurement]=useState(false), [validated,setValidated]=useState(null);
  const titleRef = useRef(null);
  const activating=context?.draft.intent==='activate';
  const publishLabel=activating?'发布并投入服务':'发布并上架';
  const stepLabels=onboardingStepLabels(context?.draft.intent);
  const requested = Number(ops.params.get('step') || 0), minimum = context?.endpoint ? 1 : 0;
  const step = Math.max(minimum, Math.min(Number.isInteger(requested) ? requested : 0, context?.step || 0));
  const displayStep=context?.endpoint?step:connectionStep ?? step;
  useEffect(() => { titleRef.current?.focus({ preventScroll: true }); window.scrollTo(0, 0); }, [id, step, ops.params.get('section'), context?.listed]);
  const navigate = (step, section = null) => ops.go({ view: 'onboarding', draft: id, step: String(step), section, refresh: null, panel: null }, { saved: true });
  const guardedNavigate = (step, section) => ops.proceed(() => navigate(step, section));
  const servicePage = () => ops.go({ view: null, model: context.model.id, perspective: 'models', draft: null, step: null, section: null, panel: null, tab: null, provider: null, sourceLibrary: null, q: null, type: null, mode: null, status: null, origin: null, listingReturn: null }, { saved: true });
  const start = () => ops.go({ view: 'onboarding', draft: null, step: '0', section: null, model: null, provider: null, sourceLibrary: null, refresh: null }, { saved: true });
  const pending = !id ? pendingGuidedOnboardings(state).filter(task => task.endpoint) : [];
  if (id && !context) return <Notice error>接入进度不存在或已放弃。<Button variant="link" onClick={home}>返回模型服务</Button></Notice>;
  if (context?.draft.status === '已完成' && (!context.endpoint || !context.channel || !context.master)) return <Notice error>本次接入的渠道或模型资料已变化，进度已保留。<Button variant="link" onClick={() => ops.go({ provider: context.provider?.id, origin: location.hash }, { base: 'providers' })}>前往模型接入核对</Button></Notice>;
  const source = context?.draft.rows[0];
  const providerName = context?.provider?.name || context?.draft.value.newProvider?.name || state.providers.find(row => row.id === context?.draft.value.providerId)?.name || ONBOARDING_PROVIDER_PRESETS.find(row => row.id === context?.draft.value.providerPresetId)?.name;
  const modelName = context?.model?.name || context?.master?.name || source?.newModel?.name || source?.upstreamModelId;
  const platformChecks = context?.checks.filter(check => check.tab === 'platform') || [], verified = platformChecks.length > 0 && platformChecks.every(check => check.passed);
  const ready = context?.serviceReady && (verified || validated?.result.billingReady && validated.publicationFingerprint===platformPublicationFingerprint(context.candidateState,context.model,validated.serviceId));
  const section = !context?.model || !serviceMetadataReady(context.model) ? 'profile' : (['profile', 'sales', 'route'].includes(ops.params.get('section')) ? ops.params.get('section') : null) || (!context.supply || !context.model.serviceMode || context.checks.some(check => ['pricing', 'publication'].includes(check.tab) && !check.passed) ? 'sales' : 'route');
  const editConnection = mode => { setEditing({ mode, fingerprint: channelFingerprint(context.channel), revision: context.draft.draftRevision }); setUpstreamId(context.association.upstreamModelId); ops.setError(''); };
  const closeEdit = () => ops.proceed(() => { setEditing(null); ops.setError(''); });
  return <div className="model-onboarding"><Heading title={context?.draft.intent==='reserve'?'准备备用供应':context?.draft.intent==='activate'?'投入当前服务':'接入并上架模型'}><Button type="button" variant="outline" onClick={home}><ArrowLeft/>返回</Button></Heading>
    {context?.completed ? <section className="onboarding-complete"><CheckCircle2 aria-hidden="true"/><h2 ref={titleRef} tabIndex={-1}>{modelName} · {context.draft.intent==='reserve'?'备用准备已完成':serviceLifecycle(context.model)}</h2><p>{context.draft.intent==='reserve'?(context.supplyReady?'本次备用准备已完成。是否承接流量以当前发布路由为准。':'本次备用准备已完成，当前采购条件或供应检查已变化，请进入“路由及映射”，再从“维护供给”核对。'):'本次发布已完成，以下为当前服务配置。'}</p>{context.model && <OnboardingSummary state={state} model={context.model}/>}<div className="onboarding-complete-actions"><Button onClick={context.model?servicePage:()=>ops.go({provider:context.provider.id},{base:'providers'})}>{context.model?'查看模型服务':'查看供应资源'}</Button><Button variant="outline" onClick={start}><Plus/>接入另一款模型</Button></div></section> : <>
      <ol className="onboarding-steps" aria-label="模型接入与上架进度">{stepLabels.map((label, index) => <li key={label} aria-current={displayStep === index ? 'step' : undefined}><Button type="button" variant="ghost" disabled={index < minimum || index > (context?.step || 0)} onClick={() => guardedNavigate(index)}><span className="onboarding-step-number">{index < (context?.step || 0) ? <Check aria-label="已完成"/> : index + 1}</span><span>{label}</span></Button></li>)}</ol>
      {pending.length > 0 && <details className="onboarding-resume"><summary>继续未完成的接入（{pending.length}）</summary>{pending.map(item => <div key={item.draft.id}><div><strong>{item.draft.profile?.name || item.model?.name || item.master?.name || item.draft.rows[0]?.upstreamModelId || '未命名模型'}</strong><span>{onboardingStepLabels(item.draft.intent)[item.step]}</span></div><Button type="button" variant="link" onClick={() => ops.proceed(() => ops.go({ draft: item.draft.id, step: String(item.step), section: null, refresh: null }, { saved: true }))}>继续接入<ArrowRight/></Button></div>)}</details>}
      {context && <div className="onboarding-context"><div><strong>{modelName || '待选择模型'}</strong>{providerName && <span>{providerName}</span>}{(context.association?.upstreamModelId || source?.upstreamModelId) && <code title="上游模型 ID">{context.association?.upstreamModelId || source.upstreamModelId}</code>}</div><Status good={Boolean(context.endpoint && !context.connectionIssue)}>{context.endpoint ? context.connectionIssue ? '接入待完成' : '接入已启用' : '待接入'}</Status></div>}
      <section className="onboarding-content" aria-label={stepLabels[displayStep]}><header className="onboarding-content-heading"><h2 ref={titleRef} tabIndex={-1}>{stepLabels[displayStep]}</h2><p>{activating && step===2?'保留既有销售配置，关联本次供应并确认流量安排。':activating && step===3?'验证本次路由候选，确认后投入当前服务。':descriptions[displayStep]}</p></header>
        {step < 2 && !context?.endpoint && <SupplierChannelConfiguration key={id || 'new'} state={state} provider={state.providers.find(row => row.id === ops.params.get('provider'))} libraryId={ops.params.get('sourceLibrary') || ''} draft={context?.draft} guidedStep={step} onStepChange={setConnectionStep} ops={ops} close={home} onBack={() => navigate(0)} onConnected={(next, taskId) => ops.go({draft:taskId,step:'1',section:null},{saved:true})}/>}
        {step === 1 && context?.endpoint && <><SupplierChannelBatchTest key={context.endpoint.id} state={state} provider={context.provider} endpointId={context.endpoint.id} associationIds={[context.association.id]} ops={ops} close={home} embedded onContinue={async () => context.draft.intent==='reserve'?await ops.run('guidedReserveComplete',{draftId:id,expectedDraftRevision:context.draft.draftRevision}):navigate(2)} continueLabel={context.draft.intent==='reserve'?'完成备用准备':context.draft.intent==='activate'?'下一步：投入服务':'下一步：配置销售'} continueDisabled={!context.supplyReady} navigation={<div className="supplier-row-actions"><Button type="button" variant="outline" disabled={!ops.can} onClick={() => editConnection('address')}>修改地址 / 接口</Button><Button type="button" variant="outline" disabled={!ops.can} onClick={() => editConnection('credentials')}>修改密钥</Button>{!context.supply && <Button type="button" variant="outline" disabled={!ops.can} onClick={() => editConnection('upstream')}>修改上游模型 ID</Button>}</div>}/><div className="onboarding-form-section"><h3>采购条件</h3><p>{serviceChannelCosts(context.channel).length?`${serviceChannelCosts(context.channel).length} 个计费项 · ${activeChannelProcurement(context.channel)?'采购价已生效':'采购价待发布'}`:'采购价待配置，暂不能完成备用或配置销售'}</p><Button variant="outline" disabled={!ops.can} onClick={()=>setProcurement(true)}>维护采购条件</Button>{!activeChannelProcurement(context.channel)&&<Notice>请在“维护采购条件”中预览并发布采购价，再完成备用准备或继续配置销售。</Notice>}</div></>}
        {step === 2 && (context.draft.intent==='activate' && context.model ? <section className="onboarding-route"><h2>投入当前服务</h2><p>保留当前模型资料、销售模式、售价和客户范围；本次仅关联供应并配置路由。</p>{ops.error && !context.supply && <Notice error>{ops.error}</Notice>}{!context.supply?<><Button disabled={!ops.can} onClick={async ()=>await ops.run('guidedSupplyAttach',{draftId:id,expectedDraftRevision:context.draft.draftRevision})}>关联本次供应</Button><Button variant="outline" onClick={()=>ops.go({view:null,model:context.model.id,panel:'pricing',providerAdd:context.model.serviceMode==='provider'?'1':null,returnOnboarding:id},{saved:true})}>维护新增供应商服务</Button></>:<OnboardingRoute key={`${id}:route`} state={state} context={context} ops={ops} next={()=>navigate(3)} back={()=>guardedNavigate(1)} exit={home}/>}</section> : <>
          {section === 'profile' ? <OnboardingProfile key={`${id}:profile:${ops.params.get('refresh') || ''}`} state={state} context={context} ops={ops} back={() => guardedNavigate(1)} next={() => navigate(2, 'sales')}/> : section === 'sales' ? <ModelOnboardingSales key={`${id}:sales:${ops.params.get('refresh') || ''}`} state={state} context={context} ops={ops} onSaved={() => navigate(2, 'route')} back={() => guardedNavigate(2, 'profile')}/> : <OnboardingRoute key={`${id}:route`} state={state} context={context} ops={ops} next={() => navigate(3)} back={() => guardedNavigate(2, 'sales')} exit={home}/>}</>)}
        {step === 3 && <><OnboardingSummary state={context.candidateState} model={context.model}/><ul className="onboarding-checks">{context.checks.map(check => <li key={check.label}>{check.passed ? <CheckCircle2/> : <AlertCircle/>}<span>{context.routeTransaction && check.tab==='routing' && check.passed?'路由候选检查通过，尚未改变当前流量':check.label}</span>{!check.passed && check.tab !== 'platform' && <Button type="button" variant="link" onClick={() => guardedNavigate(2, check.tab === 'basic' ? 'profile' : check.tab === 'routing' ? 'route' : 'sales')}>前往完善</Button>}</li>)}</ul>
          {verified && !retryTrial ? <div className="onboarding-verified"><Notice>平台试调用通过，验证后的配置已发布。确认上架后，客户即可使用。</Notice><Button type="button" variant="link" onClick={() => setRetryTrial(true)}>重新试调用</Button></div> : <PlatformTrialDialog key={`${id}:platform`} state={context.candidateState} model={context.model} providerId={context.model.serviceMode === 'provider' ? context.provider.id : undefined} ops={ops} embedded close={home} onPublished={() => setRetryTrial(false)} onValidated={setValidated}/>}
          <footer className="onboarding-footer onboarding-listing-footer"><Button type="button" variant="outline" onClick={() => guardedNavigate(2, 'route')}>返回服务配置</Button><Button type="button" disabled={!ops.can || !ready || ops.hasUnsaved()} onClick={() => setListing({ revision: state.revision,operationId:crypto.randomUUID() })}>{publishLabel}</Button></footer>
        </>}
      </section>
    </>}
    {procurement && <ProcurementVersionEditor state={state} provider={context.provider} association={context.channel} ops={ops} close={()=>setProcurement(false)}/>}
    {editing && (editing.mode === 'upstream' ? <Modal title="修改上游模型 ID" description="保留当前模型资料，修正供应商调用 ID。" onClose={closeEdit}><form noValidate className="supplier-resource-form" onSubmit={async event => { event.preventDefault(); if (await ops.run('guidedUpstreamSave', { draftId: id, expectedDraftRevision: editing.revision, expectedFingerprint: editing.fingerprint, upstreamModelId: upstreamId, confirmed: true })) setEditing(null); }}><Field label="上游模型 ID *"><Input aria-label="修正上游模型 ID" maxLength={200} value={upstreamId} onChange={event => { setUpstreamId(event.target.value); ops.dirty(true); }}/></Field><p>保存后需要重新测试并启用，模型资料和采购价保留。</p>{ops.error && <Notice error>{ops.error}</Notice>}<div className="mo-footer"><Button type="button" variant="outline" onClick={closeEdit}>取消</Button><Button type="submit" disabled={!ops.can || upstreamId === context.association.upstreamModelId}>确认修改并重新测试</Button></div></form></Modal> : <SupplierChannelDialog state={state} provider={context.provider} endpoint={context.endpoint} mode={editing.mode} ops={ops} close={closeEdit} done={() => setEditing(null)}/>)}
    {listing && <Modal title={`${publishLabel} · ${modelName}`} description="确认售价、客户范围与流量安排。" onClose={() => setListing(null)}><p>发布后，{context.model.openScope === 'all' ? '全部客户' : `已选的 ${context.model.tenantIds.length} 个客户`}可使用已发布的服务配置。</p><OnboardingSummary state={context.candidateState} model={context.model}/>{ops.error && <Notice error>{ops.error}</Notice>}{listing.revision !== state.revision && <Notice error>配置已变化，请关闭后重新核对。</Notice>}<div className="mo-footer"><Button variant="outline" onClick={() => setListing(null)}>返回核对</Button><Button disabled={!ops.can || !ready || listing.revision !== state.revision} onClick={async () => { const current=validated || {service:getMockServiceSnapshots().find(row=>row.published?.config.publicModelId===context.service.callId),serviceId:context.service.id,publicationFingerprint:platformPublicationFingerprint(context.candidateState,context.model,context.service.id)};if(current.service && await ops.run('guidedPublish',{draftId:id,expectedDraftRevision:context.draft.draftRevision,serviceId:current.serviceId,mockServiceId:current.service.id,expectedMockRevision:current.service.revision,publishedVersion:current.service.candidateVersion,expectedFingerprint:current.publicationFingerprint,operationId:listing.operationId,confirmed:true},context.model.id))setListing(null); }}>确认{publishLabel}</Button></div></Modal>}
  </div>;
}
