import { ROUTING_POLICIES, unifiedRouteStrategies, withinRouteLimits } from './routing-policy.js';
import { modelSupplies, availableSupplies, activeSupplyPrice, supplyModelUrl, priceItems } from './model-management.js';
import { connectionFingerprint, connectionBlockReason } from './connection-state.js';
import { catalogueChannels, channelBlockReason, channelUrl } from './provider-channels.js';
import { providerServices, providerServiceId, serviceChannelId, serviceChannelCosts } from './service-workspace.js';
import { billingItemKey } from './provider-catalogue-pricing.js';
import { routeMappingStatus } from './service-route-mapping.js';
import { mappingReadiness } from './service-model-mappings.js';

export const ROUTING_STRATEGIES = { fixed:'固定', random:'随机分流', weighted:'加权随机路由', priority_weighted:'优先级 + 加权分流', latency:'最低延迟路由', load:'最少并发路由', tpm:'最低 TPM 路由', cost:'最低成本路由', priority:'主备优先', ...Object.fromEntries(Object.entries(ROUTING_POLICIES).map(([id,item])=>[id,item.label])) };
const GROUP_STRATEGIES=['fixed','random','weighted','latency','load','tpm','cost'];
export const ROUTE_ADVANCED_DEFAULTS={timeoutSeconds:60,maxRetries:0,failureThreshold:3,recoverySeconds:30,latencyWindowSeconds:60,costBasis:'input'};
// shortcut: these service-level prototype versions do not execute gateway traffic; production needs a server-side publisher.

function costRevision(price) {
  let hash = 0xcbf29ce484222325n;
  for (const char of JSON.stringify(price || null)) hash = BigInt.asUintN(64, (hash ^ BigInt(char.codePointAt(0))) * 0x100000001b3n);
  return hash.toString(16);
}
const metric=(values,integer=false)=>values.find(value=>typeof value==='number' && Number.isFinite(value) && value>=0 && (!integer || Number.isInteger(value))) ?? null;

// Existing public model IDs and supplier call IDs are read-only service references.
export function routingServices(state) {
  return state.models.flatMap(model=>model.serviceMode==='standard' ? [{id:'standard:'+model.id,modelId:model.id,name:'统一模型服务模式',mode:'standard',callId:model.modelId,model,providerId:null}] : model.serviceMode==='provider' ? providerServices(model).map(entry=>({id:providerServiceId(model.id,entry.providerId),modelId:model.id,name:state.providers.find(provider=>provider.id===entry.providerId)?.name || '服务商已不存在',mode:'provider',callId:entry.callId,model,providerId:entry.providerId})) : []);
}

export function routingChannels(state, service, at = Date.now(), { runtime = false } = {}) {
  const ready=new Set(availableSupplies(state,service.modelId,service.model.capabilities).map(item=>item.id));
  const callId=service.providerId?providerServices(service.model).find(entry=>entry.providerId===service.providerId)?.callId:service.model.modelId;
  return modelSupplies(state,service.modelId).filter(supply=>!service.providerId || supply.provider?.id===service.providerId).map(supply=>{
    const channel=supply.provider && catalogueChannels(state,supply.provider,supply.catalogueModelId || supply.upstreamModelId).find(item=>item.endpointId===supply.endpointId && item.upstreamModelId===supply.upstreamModelId);
    const url=channel ? channelUrl(supply.provider,channel) : supplyModelUrl(supply,service.model);
    const costs=channel?.managed ? serviceChannelCosts(channel, at) : priceItems(activeSupplyPrice(state,supply.id,at),service.model);
    let reason=!supply.provider || !supply.endpoint ? '服务商或接入已不存在' : supply.status!=='已启用' ? '供应渠道已停用' : channel ? channelBlockReason(supply.provider,channel,{runtime}) : connectionBlockReason(supply.endpoint,supply.provider);
    if (!reason && !ready.has(supply.id)) reason='平台模型映射或能力需验证';
    if (!reason && !url) reason='请求地址待完善';
    if (!reason && runtime && (!costs.length || costs.some(item=>item.amount==null))) reason='渠道供应成本待配置';
    const row={...supply,channelId:channel ? serviceChannelId(channel) : supply.channelId || supply.endpointId,channelUpdatedAt:channel?.updatedAt,channelHealth:channel?.health,channelName:channel?.name || supply.endpoint?.name,verifiedAt:channel?.health?.testedAt || supply.verifiedAt,url,costItems:costs,costVersion:costRevision([channel?.pricing,activeSupplyPrice(state,supply.id,at)]),p95LatencyMs:metric([channel?.p95LatencyMs,channel?.metrics?.p95LatencyMs,supply.endpoint?.p95LatencyMs,supply.endpoint?.metrics?.p95LatencyMs]),activeRequests:metric([channel?.activeRequests,channel?.metrics?.activeRequests,supply.endpoint?.activeRequests,supply.endpoint?.metrics?.activeRequests],true)};
    for(const key of ['tokensPerMinute','requestsPerMinute','rpmLimit','tpmLimit'])row[key]=key.endsWith('Limit')?[channel?.[key],channel?.metrics?.[key],supply.endpoint?.[key],supply.endpoint?.metrics?.[key]].find(value=>value!=null) ?? null:metric([channel?.[key],channel?.metrics?.[key],supply.endpoint?.[key],supply.endpoint?.metrics?.[key]],true);
    const mapping=routeMappingStatus(state,{...service,callId},row);
    if (!reason && !mapping.valid) reason=mapping.reason;
    if (!reason) reason=mappingReadiness(state,service,row,{runtime});
    return {...row,mapping,reason,available:!reason};
  });
}

export const serviceRoute = (state, serviceId) => (state.serviceRoutes || []).find(item => item.serviceId === serviceId);
export const activeRouteVersion = route => route?.versions.find(item => item.version === route.activeVersion);
export const lastRouteVersion = route => route?.versions.reduce((last,item)=>!last || item.version>last.version?item:last,null);
export const routeStopReason = service => service.model.listingStatus==='已上架' && service.model.callsEnabled!==false && (!service.providerId || providerServices(service.model).find(row=>row.providerId===service.providerId)?.callsEnabled!==false) ? (service.providerId?'请先停服当前服务商，再停用路由。其他服务商不受影响。':'请先在模型页头下架并停用服务，再停用路由。隐藏模型不能代替停服。') : '';
export const emptyRouteConfig = service => ({ strategy:service?.mode==='standard'?'weighted':'fixed', groups:[{id:'P1',name:'默认组',strategy:service?.mode==='standard'?'weighted':'fixed'}], channels: [], autoFailover:false, excludeAbnormal:true, autoRecover:false, advanced:{...ROUTE_ADVANCED_DEFAULTS} });

export function routeGroups(config) {
  return config?.groups || [{id:'P1',name:'主用组',strategy:GROUP_STRATEGIES.includes(config?.strategy)?config.strategy:'weighted'}];
}

export function routeSourceVersion(state, service) {
  return JSON.stringify([service.id, service.model.updatedAt, service.model.capabilities, routingChannels(state, service).sort((a,b)=>a.id.localeCompare(b.id)).map(item => [item.id, item.channelId, item.channelUpdatedAt, item.channelHealth, item.reason, item.mapping, item.p95LatencyMs, item.activeRequests, item.tokensPerMinute, item.requestsPerMinute, item.rpmLimit, item.tpmLimit, item.provider?.id, item.endpointId, item.upstreamModelId, item.status, item.validationStatus, item.capabilities, item.updatedAt, item.endpoint?.updatedAt, item.endpoint && connectionFingerprint(item.endpoint), item.endpoint?.connectionTest, item.provider?.status, item.costVersion])]);
}

export function normalizeRouteConfig(input) {
  if (!input || !Object.hasOwn(ROUTING_STRATEGIES, input.strategy)) throw new Error('请选择有效的调度策略');
  if (!Array.isArray(input.channels) || input.channels.length > 20) throw new Error('每套方案最多配置 20 个渠道');
  const rawGroups=routeGroups(input),groupIds=new Set();
  if (!Array.isArray(rawGroups) || !rawGroups.length || rawGroups.length>10) throw new Error('请配置 1–10 个优先级组');
  const groups=rawGroups.map(group=>{
    if (!group || typeof group.id!=='string' || !/^[A-Za-z0-9_-]{1,32}$/.test(group.id) || groupIds.has(group.id)) throw new Error('优先级组标识不能为空或重复');
    if (typeof group.name!=='string' || !group.name.trim() || group.name.trim().length>60) throw new Error('优先级组名称必填，最多 60 字');
    if (!GROUP_STRATEGIES.includes(group.strategy)) throw new Error('请选择有效的组内策略');
    groupIds.add(group.id);return {id:group.id,name:group.name.trim(),strategy:group.strategy};
  });
  const ids = new Set();
  const channels = input.channels.map((row, index) => {
    if (!row || typeof row.supplyId !== 'string' || !row.supplyId || ids.has(row.supplyId)) throw new Error('供应渠道不能为空或重复');
    ids.add(row.supplyId);
    const groupId=row.groupId ?? groups[0].id,group=groups.find(item=>item.id===groupId);
    if (!group) throw new Error('渠道所属优先级组不存在');
    const text = String(row.weight ?? '').trim() || '0';
    if (!/^\d+(?:\.\d{1,2})?$/.test(text) || Number(text)>100) throw new Error('渠道权重须为 0–100，最多两位小数');
    const priority=row.priority ?? index+1;
    if (!/^\d+$/.test(String(priority)) || Number(priority)<1 || Number(priority)>1000) throw new Error('渠道优先级须为 1–1000 的整数');
    return { supplyId: row.supplyId, enabled: row.enabled !== false, groupId, weight:Number(text), priority:Number(priority) };
  });
  if (input.advanced!=null && (typeof input.advanced!=='object' || Array.isArray(input.advanced))) throw new Error('高级配置格式无效');
  const advanced={...ROUTE_ADVANCED_DEFAULTS};
  for (const [key,min,max,label] of [['timeoutSeconds',1,600,'超时'],['maxRetries',0,10,'重试次数'],['failureThreshold',1,20,'连续失败阈值'],['recoverySeconds',1,3600,'恢复间隔'],['latencyWindowSeconds',1,3600,'延迟统计窗口']]) {
    const value=input.advanced?.[key] ?? advanced[key];
    if (!/^\d+$/.test(String(value)) || Number(value)<min || Number(value)>max) throw new Error(`${label}须为 ${min}–${max} 的整数`);
    advanced[key]=Number(value);
  }
  advanced.costBasis=input.advanced?.costBasis ?? advanced.costBasis;
  if (!['input','output','total'].includes(advanced.costBasis)) throw new Error('请选择输入、输出或合计成本口径');
  return { strategy: input.strategy, groups, channels, autoFailover: input.autoFailover === true, excludeAbnormal:input.excludeAbnormal!==false, autoRecover:input.autoRecover!==false, advanced };
}

export function comparableRouteCosts(channels,basis) {
  if (!['input','output','total'].includes(basis)) throw new Error('请选择输入、输出或合计成本口径');
  let reference='';
  return channels.map(channel=>{
    const items=(channel.costItems || []).filter(item=>basis==='total' || (basis==='input'?/输入|input/i:/输出|output/i).test(item.name));
    if (!items.length || items.some(item=>!Number.isSafeInteger(item.amount) || item.amount<0 || typeof item.unit!=='string' || !item.unit.trim())) throw new Error('所选成本口径缺少完整服务商报价');
    if (new Set(items.map(item=>item.unit)).size!==1 || new Set(items.map(item=>item.currency || 'CNY')).size!==1) throw new Error('成本计费项单位或币种不同，不能比较');
    const identity=JSON.stringify(items.map(billingItemKey).sort());
    if (reference && identity!==reference) throw new Error('渠道计费项、适用条件、单位或币种不一致，不能比较成本');
    reference=identity;
    const amount=items.reduce((sum,item)=>sum+item.amount,0);
    if (!Number.isSafeInteger(amount)) throw new Error('成本合计超出可精确比较的范围');
    return {supplyId:channel.id,amount};
  });
}

function validateSelectionStrategy(strategy,rows,candidates,config) {
  if (strategy==='weighted' && (rows.some(row=>row.weight<=0) || rows.reduce((sum,row)=>sum+Math.round(row.weight*100),0)!==10000)) throw new Error('参与分流的渠道权重须大于 0，且合计必须等于 100%');
  const channels=rows.map(row=>candidates.find(item=>item.id===row.supplyId));
  if (strategy==='fixed') {
    if (rows.length!==1) throw new Error('固定策略只能选择一个供应渠道');
  }
  if (strategy==='latency' && channels.some(channel=>channel.p95LatencyMs==null)) throw new Error('最低延迟策略需要每个渠道的实际 P95 延迟数据');
  if (strategy==='load' && channels.some(channel=>channel.activeRequests==null)) throw new Error('最少并发路由需要每个渠道的实际并发请求数据');
  if (strategy==='tpm' && channels.some(channel=>channel.tokensPerMinute==null)) throw new Error('最低 TPM 路由需要每个渠道的实际分钟 Token 用量');
  for(const channel of channels)withinRouteLimits(channel);
  if (strategy==='cost') comparableRouteCosts(channels,config.advanced.costBasis);
}

export function validateRouteConfig(state, service, input, requireHealthy = true) {
  const config = normalizeRouteConfig(input);
  if(service.mode==='standard' && !unifiedRouteStrategies.includes(config.strategy))throw Error('统一模型服务模式仅支持加权随机、最少并发、最低 TPM、最低延迟和最低成本五种路由策略');
  const selected = config.channels.filter(item => item.enabled);
  if (!selected.length) throw new Error('至少选择一个参与调度的供应渠道');
  const candidates = routingChannels(state, service);
  for (const row of selected) {
    const channel = candidates.find(item => item.id === row.supplyId);
    if (!channel) throw new Error('所选渠道不属于当前模型或指定服务商，请重新选择');
    if (requireHealthy && !channel.available) throw new Error(`${channel.provider?.name || row.supplyId}：${channel.reason}`);
  }
  if (config.channels.some(row=>!candidates.some(channel=>channel.id===row.supplyId))) throw new Error('所选渠道不属于当前模型或指定服务商，请重新选择');
  if (config.strategy==='priority_weighted') for (const group of config.groups) {
    const rows=selected.filter(row=>row.groupId===group.id);
    if (!rows.length) throw new Error(`${group.name}至少需要一个参与调度的渠道`);
    validateSelectionStrategy(group.strategy,rows,candidates,config);
  }
  else validateSelectionStrategy(config.strategy,selected,candidates,config);
  return config;
}

export function routingStatus(state, service) {
  const route = serviceRoute(state, service.id), version = activeRouteVersion(route);
  if (!version) return lastRouteVersion(route)?{label:'已停用',good:false,reason:'路由已停用，请恢复或重新配置。'}:{ label: '待配置', good: false, reason: '尚未发布路由配置' };
  try { validateRouteConfig(state, service, version.config); return { label: '已配置', good: true, reason: '' }; }
  catch (error) { return { label: '需调整', good: false, reason: error.message }; }
}

export function routePreview(state, service, input, failedSupplyId = '') {
  const config = validateRouteConfig(state, service, input, false), channels = routingChannels(state, service);
  const selected = config.channels.filter(row => row.enabled);
  const unavailable = new Set(channels.filter(channel => !channel.available).map(channel => channel.id));
  for (const id of Array.isArray(failedSupplyId)?failedSupplyId:failedSupplyId?[failedSupplyId]:[]) unavailable.add(id);
  const distribute=(strategy,rows)=>{
    rows=rows.filter(row=>withinRouteLimits(channels.find(channel=>channel.id===row.supplyId)));
    if (!rows.length) return new Map();
    if (strategy==='weighted') {const total=rows.reduce((sum,row)=>sum+row.weight,0);return new Map(rows.map(row=>[row.supplyId,row.weight/total*100]));}
    if (strategy==='random') return new Map(rows.map(row=>[row.supplyId,100/rows.length]));
    let chosen=rows.slice().sort((a,b)=>a.priority-b.priority).slice(0,1);
    if (['latency','load','tpm','cost'].includes(strategy)) {
      const costs=strategy==='cost'?new Map(comparableRouteCosts(rows.map(row=>channels.find(channel=>channel.id===row.supplyId)),config.advanced.costBasis).map(item=>[item.supplyId,item.amount])):null;
      const value=row=>costs?costs.get(row.supplyId):channels.find(channel=>channel.id===row.supplyId)[strategy==='latency'?'p95LatencyMs':strategy==='tpm'?'tokensPerMinute':'activeRequests'];
      const minimum=Math.min(...rows.map(value));chosen=rows.filter(row=>value(row)===minimum);
    }
    return new Map(chosen.map(row=>[row.supplyId,100/chosen.length]));
  };
  let strategy=config.strategy, pool=selected;
  if (config.strategy==='priority_weighted') {
    const group=config.groups.find(item=>selected.some(row=>row.groupId===item.id && (!config.autoFailover || !unavailable.has(row.supplyId))));
    strategy=group?.strategy;pool=group?selected.filter(row=>row.groupId===group.id):[];
  }
  const shares=distribute(strategy,config.autoFailover?pool.filter(row=>!unavailable.has(row.supplyId)):pool);
  return selected.map(row=>({...row,channel:channels.find(item=>item.id===row.supplyId),share:unavailable.has(row.supplyId)?0:shares.get(row.supplyId)||0,failed:unavailable.has(row.supplyId)}));
}

export function routingTransaction(state, { operation, data = {} }) {
  const service = routingServices(state).find(item => item.id === data.serviceId);
  if (!service) throw new Error('服务引用已不存在，请返回列表重新选择');
  const route = serviceRoute(state, service.id), current = route?.activeVersion || 0;
  if (data.expectedVersion !== current) throw new Error('生效路由已变化，请重新载入并核对');
  const id = route?.id || `service-route-${crypto.randomUUID()}`;
  let changes, label;
  if (operation==='serviceRouteStop') {
    if (!route || !route.activeVersion && !route.draft) throw new Error('当前没有可停用的路由或草稿');
    const reason=routeStopReason(service);if(reason)throw new Error(reason);
    if (data.confirmed!==true) throw new Error('请确认停用路由并清空未发布草稿');
    changes={activeVersion:0,draft:null,draftUpdatedAt:null};label='停用服务路由并清空草稿';
  } else if (operation === 'serviceRouteDraft') {
    const draft = normalizeRouteConfig(data.config);
    if(service.mode==='standard' && !unifiedRouteStrategies.includes(draft.strategy))throw Error('统一模型服务模式不支持该路由策略');
    const candidates=new Set(routingChannels(state,service).map(item=>item.id));
    if (draft.channels.some(item=>!candidates.has(item.supplyId))) throw new Error('所选渠道不属于当前模型或服务商');
    changes = { draft, draftUpdatedAt: new Date().toISOString() };
    label = '保存路由草稿';
  } else if (['serviceRoutePublish','serviceRouteRollback','serviceRouteRestore'].includes(operation)) {
    if (!service.callId) throw new Error('请先在服务内容配置对外调用标识');
    if (data.sourceVersion !== routeSourceVersion(state, service)) throw new Error('供应渠道、模型或成本已变化，请重新校验并确认');
    const restoring=operation==='serviceRouteRestore';
    if(restoring && (current || !lastRouteVersion(route)))throw new Error('当前路由未停用或没有可恢复的配置');
    if(restoring && (data.confirmed!==true || route.draft))throw new Error('请先确认恢复；存在路由草稿时，请先明确配置并发布，避免覆盖草稿');
    const previous = restoring ? lastRouteVersion(route) : operation === 'serviceRouteRollback' && route?.versions.find(item => item.version === data.version);
    if (operation === 'serviceRouteRollback' && (!previous || previous.version === current)) throw new Error('请选择一个可回滚的历史版本');
    const config = validateRouteConfig(state, service, previous ? previous.config : data.config);
    const version = Math.max(0, ...(route?.versions || []).map(item => item.version)) + 1;
    const snapshot = { id: crypto.randomUUID(), version, config, publishedAt: new Date().toISOString(), actor: state.currentRole, rollbackFrom: !restoring && previous?.version || null, ...(restoring?{restoredFrom:previous.version}:{}), costVersions: Object.fromEntries(routingChannels(state, service).filter(item => config.channels.some(row => row.supplyId === item.id)).map(item => [item.id, item.costVersion])) };
    changes = { draft: null, draftUpdatedAt: null, activeVersion: version, versions: [...(route?.versions || []), snapshot] };
    label = restoring?'恢复服务路由':previous ? `回滚路由至 v${previous.version}，生成 v${version}` : `发布路由 v${version}`;
  } else throw new Error('未知路由操作');
  return { type: 'batch', objectId: id, label, changes: [{ type: route ? 'update' : 'add', collection: 'serviceRoutes', id, ...(route ? { changes } : { record: { id, serviceId: service.id, activeVersion: 0, versions: [], ...changes } }) }] };
}
