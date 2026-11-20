import { resourceId } from '../resource-id.mjs';
import { offerKey, offerStage } from '../service-access.mjs';
import { supplierChannelAssociations, supplierChannelResources } from './supplier-resources.js';
import { retiredSupplierModelIds } from './supply-models.js';
import { routingServices, routingChannels, validateRouteConfig } from './service-routing.js';

const update = (collection, id, changes) => ({ type: 'update', collection, id, changes });
const active = row => row && !row.deletedAt;
const published = (model, entry) => ['formal', 'gray'].includes(offerStage(model, entry));

function removalScope(state, target) {
  if (!target || Object.keys(target).some(key => !['providerId', 'endpointId', 'associationId', 'associationIds', 'keepEndpoint'].includes(key)) ||
    target.keepEndpoint !== undefined && (target.keepEndpoint !== true || !target.associationId || !target.endpointId)) throw Error('移除对象无效');
  if (target.associationIds !== undefined && (target.endpointId || target.associationId || !Array.isArray(target.associationIds) || !target.associationIds.length || target.associationIds.length > 500 || target.associationIds.some(id => typeof id !== 'string') || new Set(target.associationIds).size !== target.associationIds.length)) throw Error('请选择 1–500 条不重复的渠道');
  const provider = state.providers.find(row => row.id === target.providerId && active(row));
  if (!provider) throw Error('服务商已移除，请重新载入');
  const resources = supplierChannelResources(state, provider);
  const all = supplierChannelAssociations(state, provider);
  const associations = target.associationIds ? all.filter(row => target.associationIds.includes(row.id)) : target.associationId ? all.filter(row => row.id === target.associationId && row.endpointId === target.endpointId)
    : target.endpointId ? all.filter(row => row.endpointId === target.endpointId) : all;
  if (target.associationId && associations.length !== 1 || target.endpointId && !resources.some(row => row.id === target.endpointId)) throw Error('渠道已变化或不属于当前服务商');
  if (target.associationIds && associations.length !== target.associationIds.length) throw Error('渠道已变化或不属于当前服务商');
  const scoped = Boolean(target.associationId || target.associationIds);
  const endpoints = target.associationIds ? resources.filter(row => associations.some(channel => channel.endpointId === row.id)) : target.endpointId ? resources.filter(row => row.id === target.endpointId) : resources;
  const ids = new Set(associations.flatMap(row => [row.id, row.relationId].filter(Boolean)));
  for (const row of state.supplyRelations?.channels || []) if (row.providerId === provider.id && associations.some(a => a.id === row.associationId)) ids.add(row.id);
  const wholeEndpoints = new Set(endpoints.filter(endpoint => !target.keepEndpoint && (!scoped || !all.some(row => row.endpointId === endpoint.id && !ids.has(row.id)))).map(row => row.id));
  const supplies = state.modelSupplies.filter(row => row.status !== '已移除' && (row.providerId || state.endpoints.find(e => e.id === row.endpointId)?.providerId) === provider.id &&
    (!target.endpointId || row.endpointId === target.endpointId) && (!scoped || (row.channelId ? ids.has(row.channelId) : associations.some(a => a.endpointId === row.endpointId && a.modelId === (row.catalogueModelId || row.upstreamModelId) && a.upstreamModelId === row.upstreamModelId))));
  supplies.forEach(row => ids.add(row.id));
  const modelIds = new Set(supplies.map(row => row.modelId));
  const references = (member, modelId) => ids.has(member.supplyId) || modelIds.has(modelId) && wholeEndpoints.has(member.supplyId);
  return { provider, endpoints, associations, ids, wholeEndpoints, supplies, modelIds, references };
}

export function providerRemovalPlan(state, target) {
  const scope = removalScope(state, target), { provider, endpoints, associations, ids, supplies, references } = scope;
  const rows = [], routes = [], services = routingServices(state);
  for (const route of state.serviceRoutes || []) {
    const service = services.find(row => row.id === route.serviceId);
    if (!service) continue;
    const current = route.versions?.find(row => row.version === route.activeVersion);
    const touches = config => config?.channels?.some(row => references(row, service.modelId)) || config?.forwarding?.some(row => references(row, service.modelId));
    if (!touches(current?.config) && !touches(route.draft)) continue;
    let remainingConfig = null, remainingError = '';
    if (touches(current?.config)) {
      const config = { ...current.config, channels: current.config.channels.filter(row => !references(row, service.modelId)),
        ...(current.config.forwarding ? { forwarding: current.config.forwarding.filter(row => !references(row, service.modelId)) } : {}) };
      try { remainingConfig = validateRouteConfig(state, service, config); } catch (error) { remainingError = error.message; }
    }
    routes.push({ route, service, active: touches(current?.config), draft: touches(route.draft), remainingConfig, remainingError });
  }
  for (const model of state.models) {
    const affected = supplies.filter(row => row.modelId === model.id);
    const entries = model.serviceMode === 'provider' ? (model.serviceProviders || []).filter(entry => {
      if (entry.status === '已移除' || entry.providerId !== provider.id) return false;
      if (!target.endpointId && !target.associationIds) return true;
      return entry.channelId ? ids.has(entry.channelId) : affected.length > 0;
    }) : [];
    if (model.serviceMode === 'standard' && !affected.length && !routes.some(row => row.service.modelId === model.id)) continue;
    if (model.serviceMode !== 'standard' && !entries.length) continue;
    for (const entry of model.serviceMode === 'standard' ? [null] : entries) {
      const key = entry ? offerKey(entry) : '', serviceId = entry ? 'provider:' + model.id + ':' + key : 'standard:' + model.id;
      const route = routes.find(row => row.route.serviceId === serviceId);
      let keepServing = Boolean(route?.active && route.remainingConfig);
      if (!route?.active) {
        const saved = state.serviceRoutes?.find(row => row.serviceId === serviceId);
        const version = saved?.versions?.find(row => row.version === saved.activeVersion);
        const service = services.find(row => row.id === serviceId);
        if (version && service && !version.config.channels.some(row => references(row, model.id))) {
          try { validateRouteConfig(state, service, version.config); keepServing = true; } catch { /* An invalid remaining route cannot keep the service enabled. */ }
        }
      }
      const channelNames = associations.filter(row => entry?.channelId ? [row.id, row.relationId].includes(entry.channelId) : affected.some(supply => supply.endpointId === row.endpointId && supply.upstreamModelId === row.upstreamModelId)).map(row => row.sourceName || row.name || row.upstreamModelId).filter(Boolean);
      rows.push({ id: serviceId, modelId: model.id, offerKey: key, name: model.serviceName || model.name,
        callId: entry?.callId || model.modelId, channelName: entry?.channelName || [...new Set(channelNames)].join('、') || [...new Set(affected.map(row => endpoints.find(endpoint => endpoint.id === row.endpointId)?.name).filter(Boolean))].join('、') || '未配置渠道',
        callsEnabled: model.callsEnabled === true && entry?.callsEnabled !== false, listed: published(model, entry),
        keepServing, needsStop: !keepServing && (model.callsEnabled === true && entry?.callsEnabled !== false || published(model, entry)),
        routeActive: Boolean(route?.active), routeError: route?.remainingError || '' });
    }
  }
  const blockers = [];
  for (const endpoint of endpoints) {
    const jobs = [...(endpoint.serverTestJobs || []), ...(endpoint.candidateConfiguration?.pendingTests || [])];
    if (jobs.some(job => !job.receivedAt && (!(target.associationId || target.associationIds) || !job.associationIds?.length || job.associationIds.some(id => ids.has(id))))) blockers.push('渠道「' + endpoint.name + '」仍有未完成检测，请先查询或取消检测');
  }
  if ((provider.keyGroupCandidates || []).some(candidate => candidate.pendingTests?.some(job => !job.receivedAt && endpoints.some(endpoint => endpoint.id === job.endpointId)))) blockers.push('服务商仍有未完成的密钥组检测');
  if (state.modelOnboardings.some(task => task.status !== '已放弃' && !(task.guided ? task.completion : task.status === '已完成') &&
    (task.providerId || task.value?.providerId) === provider.id && (!target.endpointId && !target.associationIds || endpoints.some(endpoint => endpoint.id === task.endpointId || endpoint.id === task.createdEndpointId) || task.createdAssociationIds?.some(id => ids.has(id))))) blockers.push('仍有未完成的接入任务，请先完成或放弃任务');
  if ((state.routes || []).some(route => route.targets?.some(member => scope.wholeEndpoints.has(typeof member === 'string' ? member : member.endpointId))) ||
    (state.fallbacks || []).some(route => route.chain?.some(id => scope.wholeEndpoints.has(id)))) blockers.push('仍被网关路由或故障转移引用，请先调整对应配置');
  const needsProcessing = rows.some(row => row.needsStop || row.routeActive) || routes.some(row => row.draft) ||
    supplies.some(row => row.status === '已启用');
  const signature = JSON.stringify([target, provider.updatedAt, associations.map(row => [row.id, row.updatedAt, row.enabled]),
    endpoints.map(row => [row.id, row.updatedAt]), rows, routes.map(row => [row.route.id, row.route.updatedAt, row.route.activeVersion, row.route.draft]), supplies.map(row => [row.id, row.updatedAt, row.status]), blockers]);
  return { ...scope, rows, routes, blockers, needsProcessing, ready: !blockers.length && !needsProcessing, signature,
    name: target.associationIds ? `${associations.length} 条模型渠道` : target.associationId ? associations[0].sourceName || associations[0].name || associations[0].upstreamModelId : target.endpointId ? endpoints[0].name : provider.name };
}

export function providerRemovalTransaction(state, { operation, data = {} }) {
  const plan = providerRemovalPlan(state, data.target);
  if (data.expectedSignature !== plan.signature) throw Error('关联数据已变化，请重新检查后继续');
  if (data.confirmed !== true) throw Error('请明确确认移除影响');
  if (plan.blockers.length) throw Error(plan.blockers.join('；'));
  if (!['providerRemovalPrepare', 'providerRemovalCommit'].includes(operation)) throw Error('未知移除操作');
  const commit = operation === 'providerRemovalCommit';
  if (commit && !plan.ready) throw Error('仍有启用服务、上架渠道或活动路由，请先停服并下架');
  const { provider, ids, supplies, routes, endpoints, associations } = plan, at = new Date().toISOString(), changes = [];
  const changedModels = new Map();
  for (const model of state.models) {
    const rows = plan.rows.filter(row => row.modelId === model.id);
    if (!rows.length) continue;
    const stop = rows.filter(row => !row.keepServing), patch = {};
    if (model.serviceMode === 'provider') {
      const stopped = new Set(stop.map(row => row.offerKey));
      patch.serviceProviders = (model.serviceProviders || []).map(entry => stopped.has(offerKey(entry)) ? { ...entry, callsEnabled: false, listingStage: 'withdrawn', grayTenantIds: [],
        providerName: provider.name, channelUnavailableReason: commit ? '渠道未接入' : '渠道待移除' } : entry);
      const listed = patch.serviceProviders.filter(entry => entry.status !== '已移除' && ['formal', 'gray'].includes(offerStage(model, entry)));
      patch.listingStatus = listed.length ? '已上架' : '已下架';
      patch.releaseStage = listed.some(entry => offerStage(model, entry) === 'formal') ? 'formal' : listed.length ? 'gray' : null;
      patch.releaseTenantIds = [...new Set(listed.flatMap(entry => entry.grayTenantIds || []))];
    } else if (stop.length) Object.assign(patch, { callsEnabled: false, listingStatus: '已下架', releaseStage: null, releaseTenantIds: [], lifecycleStopReason: commit ? 'channel-unavailable' : 'channel-removal', status: '停用' });
    if (Object.keys(patch).length) changedModels.set(model.id, { model, patch });
  }
  for (const { route, service, active: current, draft, remainingConfig } of routes) {
    const patch = {};
    if (current) {
      if (remainingConfig) {
        const version = Math.max(0, ...(route.versions || []).map(row => row.version)) + 1;
        patch.versions = [...route.versions, { id: resourceId('route-version'), version, config: remainingConfig, publishedAt: at, actor: state.currentRole, reason: '移除供给渠道', costVersions: Object.fromEntries(routingChannels(state, service).filter(row => remainingConfig.channels.some(member => member.supplyId === row.id)).map(row => [row.id, row.costVersion])) }];
        patch.activeVersion = version;
      } else patch.activeVersion = 0;
    }
    if (draft) Object.assign(patch, { draftInvalidReason: '渠道已失效，请重新配置', draftInvalidatedAt: at });
    if (draft) Object.assign(patch, { draft: null, invalidatedDrafts: [...(route.invalidatedDrafts || []), { config: route.draft, invalidatedAt: at, reason: '渠道已失效，请重新配置' }] });
    if (Object.keys(patch).length) changes.push(update('serviceRoutes', route.id, patch));
    if (current && !remainingConfig && !plan.rows.some(row => row.id === service.id)) throw Error('活动路由缺少对应模型服务，请先核对');
  }
  for (const { model, patch } of changedModels.values()) changes.push(update('models', model.id, patch));
  for (const supply of supplies) changes.push(update('modelSupplies', supply.id, { status: commit ? '已移除' : '已停用', salesEnabled: false,
    channelUnavailableReason: commit ? '渠道未接入' : '渠道待移除', ...(supply.serviceMapping?.pending && commit ? { serviceMapping: { ...supply.serviceMapping, pending: null, invalidatedPending: supply.serviceMapping.pending } } : {}) }));
  const all = provider.catalogConnections || [];
  const catalogConnections = all.map(row => ids.has(row.id) ? { ...row, enabled: false, ...(commit ? { deletedAt: at } : {}) } : row);
  for (const row of associations) if (!catalogConnections.some(saved => saved.id === row.id)) catalogConnections.push({ ...row, endpoint: undefined, enabled: false, ...(commit ? { deletedAt: at } : {}) });
  const entireProvider = !data.target.endpointId && !data.target.associationIds;
  const providerPatch = { catalogConnections };
  if (commit) providerPatch.removedCatalogModelIds = retiredSupplierModelIds(state, provider,
    supplierChannelAssociations(state, provider).filter(row => !ids.has(row.id) && !ids.has(row.relationId)), associations.map(row => row.modelId));
  if (commit && entireProvider) Object.assign(providerPatch, { deletedAt: at, status: '已停用', catalogueScope: 'managed', catalogModelIds: [],
    catalogModels: (provider.catalogModels || []).map(row => ({ ...row, deletedAt: row.deletedAt || at })) });
  changes.push(update('providers', provider.id, providerPatch));
  if (commit) for (const endpoint of endpoints) {
    if (plan.wholeEndpoints.has(endpoint.id)) changes.push(update('endpoints', endpoint.id, { deletedAt: at, status: '停用' }));
  }
  return { type: 'batch', objectId: data.target.associationId || data.target.endpointId || provider.id,
    label: commit ? entireProvider ? '移除服务商' : '移除模型渠道' : '停服并下架待移除渠道', changes };
}
