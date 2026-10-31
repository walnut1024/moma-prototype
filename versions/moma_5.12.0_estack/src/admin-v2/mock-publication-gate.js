import { getMockChannelSnapshots, getMockServiceSnapshots, inspectMockPublication } from './mock-onboarding-service.js';
import { platformCandidatePlan } from './platform-service-client.js';
import { platformPublicationServices } from './platform-publication-state.js';
import { connectionFingerprint } from './connection-state.js';

const normalized = config => ({ publicModelId: config.publicModelId, mode: config.mode, tenantIds: [...config.tenantIds].sort(), capabilities: [...config.capabilities].sort(), salePrices: config.salePrices, bindings: config.bindings.map(row=>({id:row.id,model:row.model,procurementPrices:row.procurementPrices})).sort((a,b)=>a.id.localeCompare(b.id)), route:{...config.route,channels:config.route.channels.map((row,index)=>({bindingId:row.bindingId,priority:row.priority ?? index+1,weight:row.weight ?? 1})).sort((a,b)=>a.bindingId.localeCompare(b.bindingId))} });
const stable = value => value && typeof value === 'object' ? Array.isArray(value) ? value.map(stable) : Object.fromEntries(Object.keys(value).sort().map(key=>[key,stable(value[key])])) : value;
export function assertMockModelPublication(state, model, onlyServiceId) {
  const services = platformPublicationServices(model).filter(row => !onlyServiceId || row.id === onlyServiceId), snapshots = getMockServiceSnapshots(), channels = getMockChannelSnapshots();
  if (!services.length) throw new Error('服务模式或待发布服务已变化，请重新配置');
  return services.map(service => {
    const saved = snapshots.find(row => row.published?.config.publicModelId === service.callId);
    const status = saved && inspectMockPublication(saved.id);
    if (!status?.ready) throw new Error(`${service.callId || '当前服务'}：${status?.reason || '请先完成平台试调用并发布验证后的配置'}`);
    const config = status.published.config, audioProbe = config.bindings.find(row=>row.model.type==='audio')?.model.probe || '';
    const plan = platformCandidatePlan(state,model,{serviceId:service.id,tenantIds:config.tenantIds,supplyIds:config.bindings.map(row=>row.id),audioProbe});
    if (JSON.stringify(stable(normalized(config))) !== JSON.stringify(stable(normalized(plan.candidate)))) throw new Error('平台发布配置与当前服务、价格或路由不一致，请重新试调用并发布');
    for (const binding of config.bindings) {
      const row = plan.rows.find(item=>item.id===binding.id), channel = channels.find(item=>item.id===binding.channelId);
      if (!channel || channel.providerId !== row.supply.provider.id || channel.clientChannelId !== row.supply.endpoint.id || channel.clientSignature !== connectionFingerprint(row.supply.endpoint)) throw new Error('平台发布供给与当前配置不一致，请重新测试');
    }
    return { serviceId: service.id, mockServiceId: saved.id, publishedVersion: status.published.version, source: 'mock' };
  });
}
export function assertNewMockPublications(previous, next, action) {
  if (action?.operation === 'recordPlatformPublication') {
    const model = next.models.find(row=>row.id===action.modelId);
    if (!model) throw new Error('待记录平台验证的模型不存在');
    const [verified]=assertMockModelPublication(next,model,action.data.serviceId);
    if(verified.mockServiceId!==action.data.mockServiceId || verified.publishedVersion!==action.data.publishedVersion)throw new Error('平台发布验证引用不一致，请重新同步发布记录');
  }
  if(action?.operation==='publish')assertMockModelPublication(next,next.models.find(row=>row.id===action.modelId));
  for (const model of next.models.filter(row=>row.listingStatus==='已上架' && previous.models.find(old=>old.id===row.id)?.listingStatus!=='已上架')) assertMockModelPublication(next,model);
}
