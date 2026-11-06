import { mockContext } from './mock-onboarding-service.js';
import { platformCandidatePlan } from './platform-service-client.js';
import { platformPublicationServices } from './platform-publication-state.js';
import { connectionFingerprint } from './connection-state.js';

const normalized = config => ({ publicModelId: config.publicModelId, mode: config.mode, tenantIds: [...config.tenantIds].sort(), capabilities: [...config.capabilities].sort(), bindings: config.bindings.map(row=>({id:row.id,model:row.model})).sort((a,b)=>a.id.localeCompare(b.id)), route:{...config.route,channels:config.route.channels.map((row,index)=>({bindingId:row.bindingId,priority:row.priority ?? index+1,weight:row.weight ?? 1})).sort((a,b)=>a.bindingId.localeCompare(b.bindingId))} });
const stable = value => value && typeof value === 'object' ? Array.isArray(value) ? value.map(stable) : Object.fromEntries(Object.keys(value).sort().map(key=>[key,stable(value[key])])) : value;
export function assertMockModelPublication(state, model, onlyServiceId, publishedOnly = false, snapshot = null) {
  const engine=mockContext(state,snapshot), services = platformPublicationServices(model).filter(row => !onlyServiceId || row.id === onlyServiceId), snapshots = snapshot?.services || engine.getMockServiceSnapshots(), channels = engine.getMockChannelSnapshots();
  if (!services.length) throw new Error('服务模式或待发布服务已变化，请重新配置');
  return services.map(service => {
    const saved = snapshots.find(row => row.published?.config.publicModelId === service.callId);
    const status = saved && engine.inspectMockPublication(saved.id, publishedOnly, snapshot);
    if (!status?.ready) throw new Error(`${service.callId || '当前服务'}：${status?.reason || '请先完成平台试调用并发布验证后的配置'}`);
    const config = status.published.config, audioProbe = config.bindings.find(row=>row.model.type==='audio')?.model.probe || '';
    const plan = platformCandidatePlan(state,model,{serviceId:service.id,tenantIds:config.tenantIds,supplyIds:config.bindings.map(row=>row.id),audioProbe,technical:true});
    if (JSON.stringify(stable(normalized(config))) !== JSON.stringify(stable(normalized(plan.candidate)))) throw new Error('平台发布配置与当前服务或路由不一致，请重新试调用并发布');
    for (const binding of config.bindings) {
      const row = plan.rows.find(item=>item.id===binding.id), channel = channels.find(item=>item.id===binding.channelId);
      if (!channel || channel.providerId !== row.supply.provider.id || channel.clientChannelId !== row.supply.endpoint.id || channel.clientSignature !== connectionFingerprint(row.supply.endpoint)) throw new Error('平台发布供给与当前配置不一致，请重新测试');
    }
    return { serviceId: service.id, mockServiceId: saved.id, publishedVersion: status.published.version, source: 'mock' };
  });
}
export function assertNewMockPublications(previous, next, action, snapshot = null) {
  if (['basic', 'serviceBasics'].includes(action?.operation) || action?.operation === 'templateSave' && action.data?.id) throw new Error('已有模型资料请核对共享影响后提交发布');
  const changes = action?.type === 'batch' ? action.changes : [action];
  if (!['modelOperation', 'modelOperations'].includes(action?.type) && changes?.some(row => ['models', 'modelTemplates'].includes(row?.collection) && ['name','modelId','templateId','type','maker','description','profile','capabilities','usageUnit'].some(key => Object.hasOwn(row.changes || row.record || {}, key)))) throw new Error('模型资料须通过资料预览与发布操作维护');
  if (['unifiedPrice', 'configureServiceProvider', 'scope'].includes(action?.operation) && previous.models.find(row => row.id === action.modelId)?.listingStatus === '已上架') throw new Error('已上架服务请先保存售价或客户范围草稿，再明确发布');
  if (action?.operation === 'recordPlatformPublication') {
    const model = next.models.find(row=>row.id===action.modelId);
    if (!model) throw new Error('待记录平台验证的模型不存在');
    const [verified]=assertMockModelPublication(next,model,action.data.serviceId);
    if(verified.mockServiceId!==action.data.mockServiceId || verified.publishedVersion!==action.data.publishedVersion)throw new Error('平台发布验证引用不一致，请重新同步发布记录');
  }
  if(['publish','guidedPublish','enableService','startSales'].includes(action?.operation))assertMockModelPublication(next,next.models.find(row=>row.id===action.modelId),undefined,false,snapshot);
  if(action?.operation==='serviceProviderServing' && action.data?.enabled)assertMockModelPublication(next,next.models.find(row=>row.id===action.modelId),`provider:${action.modelId}:${action.data.providerId}`,false,snapshot);
  for (const model of next.models.filter(row=>{
    const before=previous.models.find(old=>old.id===row.id);
    return row.listingStatus==='已上架' && before?.listingStatus!=='已上架' || row.callsEnabled===true && before?.callsEnabled!==true;
  })) assertMockModelPublication(next,model,undefined,false,snapshot);
}
