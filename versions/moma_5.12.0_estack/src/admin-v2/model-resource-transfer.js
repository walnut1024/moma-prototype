import { modelIdentity, modelServiceIdentity, channelIdentity, modelPresentation, priceItemReferences } from '../model-identities.mjs';
import { serviceReferences, offerKey, providerOffer, offerStage, offerGrayTenants } from '../service-access.mjs';
import { resolveChannelAssociationModel } from './channel-association-model.js';
import { providerTransaction, providerCode } from './provider-management.js';
import { activeModelSalePrice, activeProviderPrice, commercialPriceBase } from './service-workspace.js';
import { mappingSourceVersion } from './service-model-mappings.js';
import { platformRouteInterface } from './service-route-mapping.js';
import { RESOURCE_SCHEMA, resourceKey, validateResourceTarget, selectResourceRows } from './model-resource-scope.js';
import { providerResourceFields, connectionResourceFields, registrationResources, procurementResource, procurementHistoryResources, serviceResourceFields, resourceReferences } from './model-resource-fields.js';
import { materializeChannelAssociation } from './channel-association-model.js';
import { CHANNEL_INTERFACES } from './channel-interface.js';
import { channelChangeTransaction } from './channel-change-management.js';

const same = (a, b) => JSON.stringify(canonical(a)) === JSON.stringify(canonical(b));
function canonical(value) {
  if (Array.isArray(value)) return value.map(canonical);
  return value && typeof value === 'object' ? Object.fromEntries(Object.keys(value).sort().map(key => [key, canonical(value[key])])) : value;
}
function validatePriceItems(state, items, original) {
  if (!Array.isArray(items)) throw Error('计费项须为数组');
  const ids = new Set();
  for (const item of items) {
    if (!item || Object.keys(item).some(key => !['name','condition','unit','currency','amount','billing_item_id','unit_id','currency_id','price_item_id'].includes(key))) throw Error('计费项包含未知字段');
    const references = priceItemReferences(state, { name: item.name, unit: item.unit, currency: item.currency });
    for (const field of ['billing_item_id','unit_id','currency_id']) if (item[field] !== references[field]) throw Error(`计费字典关联 ${field} 与名称、单位或币种不一致`);
    if (item.price_item_id != null) {
      if (ids.has(item.price_item_id) || !original.some(row => row.price_item_id === item.price_item_id)) throw Error('价格项 ID 重复或不属于当前价格版本');
      ids.add(item.price_item_id);
    }
  }
}
const scopeTypes = { channels: ['provider', 'provider_model', 'connection', 'channel'], services: ['model_service'], market: ['market_model','market_service'], prices: ['sale_price'] };

export function resourceRows(state, scope) {
  const rows = [];
  if (scope === 'channels') {
    for (const provider of state.providers.filter(row => !row.deletedAt)) {
      rows.push({ type: 'provider', id: provider.id, name: provider.name, slug: providerCode(provider), ...providerResourceFields(provider) });
      rows.push(...registrationResources(state, provider));
      for (const connection of state.endpoints.filter(row => row.providerId === provider.id && !row.deletedAt))
        rows.push({ type: 'connection', id: connection.id, provider_id: provider.id, name: connection.name, base_url: connection.baseUrl, protocol: connection.protocol, ...connectionResourceFields(connection) });
      for (const channel of (provider.catalogConnections || []).filter(row => !row.deletedAt)) {
        let model, issue;
        try { model = resolveChannelAssociationModel(state, provider, channel); } catch (error) { issue = error.message; }
        rows.push({ type: 'channel', id: channelIdentity(state, channel.id), model_id: model?.id || null, canonical_slug: model?.modelId || null,
          ...(issue ? { association_issue: issue } : {}),
          provider_id: provider.id, connection_id: channel.endpointId, name: channel.sourceName || channel.name || '', upstream_model_id: channel.upstreamModelId,
          enabled: channel.enabled === true, capacity_limits: channel.capacityLimits || {}, capacity_revision: channel.capacityRevision || 0,
          api_addresses: (channel.apiAddresses || []).map(address => ({ protocol: address.protocol, base_url: address.baseUrl })),
          procurement: procurementResource(state, materializeChannelAssociation(state, provider, channel)), procurement_history: procurementHistoryResources(state, channel) });
      }
    }
    return rows;
  }
  for (const service of serviceReferences(state).filter(row => !row.model.deletedAt && !row.model.archivedAt)) {
    const { model } = service, identity = modelIdentity(state, model), id = modelServiceIdentity(state, model, offerKey(service));
    const base = { id, model_id: identity.id, canonical_slug: identity.canonical_slug, model_service_config_id: model.id };
    if (scope === 'services') rows.push({ type: 'model_service', ...base, call_id: service.callId,
      provider_id: service.providerId || null, channel_id: service.channelId ? channelIdentity(state, service.channelId) : null, ...serviceResourceFields(state, service) });
    if (scope === 'market' && !rows.some(row => row.model_id === identity.id)) {
      const presentation = modelPresentation(state, model);
      rows.push({ type: 'market_model', id: identity.id, model_id: identity.id, canonical_slug: identity.canonical_slug,
        name: presentation.name, description: presentation.description, profile: presentation.profile });
    }
    if (scope === 'market') {
      const entry = service.providerId ? providerOffer(model,offerKey(service)) : null;
      rows.push({type:'market_service',...base,model_service_id:id,call_id:service.callId,
        listing_stage:offerStage(model,entry),market_visible:(entry || model).marketVisible!==false,gray_customer_ids:offerGrayTenants(model,entry)});
    }
    if (scope === 'prices') {
      const price = service.providerId ? activeProviderPrice(state, model.id, offerKey(service)) : activeModelSalePrice(state, model.id);
      rows.push({ type: 'sale_price', ...base, model_service_id: id, price_version_id: price?.id || null, call_id: service.callId,
        effective_at: price?.effectiveAt || null, expires_at: price?.expiresAt || null,
        sales_scope: { open_scope: model.salesScope?.openScope || 'none', customer_ids: model.salesScope?.tenantIds || [] },
        items: (price?.items || []).map((item,index) => ({ ...item, condition:item.condition || '', ...priceItemReferences(state,item), price_item_id: `${price.id}:item:${index}`, amount: item.amount == null ? '' : String(item.amount / 1000000) })) });
    }
  }
  return rows;
}

export function exportModelResources(state, scope, target = { level: 'module' }) {
  if (!Object.hasOwn(scopeTypes,scope)) throw Error('请选择有效导出范围');
  validateResourceTarget(state, scope, target);
  const all = resourceRows(state, scope), rows = selectResourceRows(all, target);
  return { schema: RESOURCE_SCHEMA, operation: 'update', scope, target, revision: state.revision, rows,
    references: resourceReferences(state, scope, scope === 'channels' ? all : [...resourceRows(state, 'channels'), ...all], rows, target) };
}

// Reuse business commands so import obeys the same lifecycle and price validation as editing.
export function importModelResources(state, file, run, expectedTarget) {
  if (!file || file.schema !== RESOURCE_SCHEMA || !['update', 'link'].includes(file.operation) || !Object.hasOwn(scopeTypes,file.scope)
    || Object.keys(file).sort().join() !== ['schema', 'operation', 'scope', 'target', 'revision', 'rows', 'references'].sort().join()) throw Error('请重新查看并复制 v2 模型运营维护 JSON');
  if (expectedTarget && !same(file.target, expectedTarget)) throw Error('JSON 对象范围与当前页面不一致');
  if (file.operation === 'link' && file.scope !== 'services') throw Error('批量关联只适用于模型服务');
  if (file.revision !== state.revision) throw Error('导入文件版本已过期，请重新导出后核对');
  if (new TextEncoder().encode(JSON.stringify(file)).length > 10 * 1024 * 1024) throw Error('JSON 内容不能超过 10 MB，请缩小到服务商或模型范围维护');
  if (!Array.isArray(file.rows) || file.rows.length > 500) throw Error('每批最多维护 500 行，请缩小到服务商或模型范围维护');
  const snapshot = exportModelResources(state, file.scope, file.target);
  if (!same(file.references, snapshot.references)) throw Error('只读关联 references 不可修改，请重新复制当前 JSON');
  const current = new Map(snapshot.rows.map(row => [resourceKey(row), row]));
  const seen = new Set(), changes = [], working = structuredClone(state);
  const apply = transaction => {
    for (const change of transaction.changes) {
      if (change.type === 'add') working[change.collection].unshift(change.record);
      else if (change.type === 'update') Object.assign(working[change.collection].find(row => row.id === change.id), change.changes);
      else throw Error('导入不能删除对象');
      changes.push(change);
    }
  };
  for (const row of file.rows) {
    if (file.operation === 'link') {
      if (file.scope !== 'services' || !row || Object.keys(row).sort().join(',') !== 'channel_id,model_service_id') throw Error('关联文件只接受 model_service_id 和 channel_id');
      const pair = JSON.stringify([row.model_service_id, row.channel_id]);
      if (seen.has(pair)) throw Error('文件内关联重复');
      seen.add(pair);
      const service = serviceReferences(working).find(item => item.model_service_id === row.model_service_id);
      const channel = resourceRows(working, 'channels').find(item => item.type === 'channel' && item.id === row.channel_id);
      if (!service || !channel || channel.model_id !== service.model_id) throw Error('关联 ID 不存在或不属于同一模型');
      if (!snapshot.rows.some(item => item.id === row.model_service_id)) throw Error('模型服务不属于当前对象范围');
      if (service.providerId && (service.providerId !== channel.provider_id || service.channelId && channelIdentity(working, service.channelId) !== channel.id)) throw Error('渠道不属于所选模型服务');
      if (working.modelSupplies.some(item => item.modelId === service.model.id && item.status !== '已移除' && channelIdentity(working, item.channelId || item.id) === channel.id)) continue;
      const provider = working.providers.find(item => item.id === channel.provider_id);
      const association = provider.catalogConnections.find(item => channelIdentity(working, item.id) === channel.id && !item.deletedAt);
      apply(run(working, { operation: 'serviceMappingCreate', modelId: service.model.id, data: {
        serviceId: service.id, expectedSource: mappingSourceVersion(working, service), name: (channel.name || '渠道映射').slice(0, 60),
        config: { providerId: provider.id, endpointId: association.endpointId, associationId: association.id,
          catalogueModelId: association.modelId, upstreamModelId: association.upstreamModelId, platformInterface: platformRouteInterface(service.model).path, additionalInterfaces: [] },
      } }));
      continue;
    }
    if (!row || typeof row.id !== 'string' || !scopeTypes[file.scope].includes(row.type)) throw Error('每行必须提供有效类型和永久 ID');
    const key = resourceKey(row), original = current.get(key);
    if (seen.has(key)) throw Error('文件内永久 ID 重复');
    seen.add(key);
    if (!original) throw Error('永久 ID 不存在或不属于当前范围，不能作为新增记录导入');
    if (!same(Object.keys(row).sort(), Object.keys(original).sort())) throw Error('导入字段不完整或含未知字段');
    const mutable = ({ provider: ['name', 'source_type', 'website', 'documentation', 'logo', 'description', 'introduction', 'contact', 'contact_info'], provider_model: [], connection: ['name', 'base_url', 'protocol', 'interface_type', 'task_urls'], channel: ['name', 'upstream_model_id', 'capacity_limits', 'procurement'],
      model_service: ['call_id'], market_model: ['name', 'description', 'profile'], market_service:['listing_stage','market_visible','gray_customer_ids'], sale_price: ['items'] })[row.type];
    for (const field of Object.keys(original)) if (!mutable.includes(field) && !same(row[field], original[field])) throw Error(`关联字段 ${field} 不可修改，请核对 ID 和归属`);
    if (same(row, original)) continue;
    if (row.type === 'provider') {
      const provider = working.providers.find(item => item.id === row.id);
      apply(providerTransaction(working, { operation: 'profile', objectId: row.id, data: { ...provider, name: row.name, code: row.slug, sourceType: row.source_type,
        website: row.website, documentation: row.documentation, logo: row.logo, description: row.description, introduction: row.introduction,
        contact: row.contact, contactInfo: row.contact_info, expectedUpdatedAt: provider.updatedAt ?? null } }));
    } else if (row.type === 'connection') {
      const endpoint = working.endpoints.find(item => item.id === row.id);
      if (row.interface_type && CHANNEL_INTERFACES.find(item => item.id === row.interface_type)?.protocol !== row.protocol) throw Error('连接协议与接口类型不一致');
      if (row.name !== original.name) apply(providerTransaction(working, { operation: 'supplierChannelSave', objectId: row.provider_id,
        data: { endpointId: row.id, mode: 'info', name: row.name } }));
      if (['base_url','protocol','interface_type','task_urls'].some(field => !same(row[field], original[field]))) apply(providerTransaction(working, { operation: 'supplierChannelSave', objectId: row.provider_id,
        data: { ...endpoint, endpointId: row.id, mode: 'address', baseUrl: row.base_url, protocol: row.protocol, ...(row.interface_type ? { interfaceType: row.interface_type } : {}), taskUrls: row.task_urls, confirmed: true } }));
    } else if (row.type === 'channel') {
      if (!row.model_id) throw Error('请先修复该渠道的模型关联，再导入维护');
      const provider = working.providers.find(item => item.id === row.provider_id);
      const association = provider.catalogConnections.find(item => channelIdentity(working, item.id) === row.id && !item.deletedAt);
      if (row.name !== original.name || row.upstream_model_id !== original.upstream_model_id) apply(providerTransaction(working, { operation: 'supplierAssociationSave', objectId: provider.id, data: {
        associationId: association.id, modelId: association.modelId, endpointId: association.endpointId, upstreamModelId: row.upstream_model_id,
        sourceName: row.name, preservePricing: true, scenarios: [] } }));
      if (!same(row.capacity_limits, original.capacity_limits)) apply(run(working, { operation: 'channelCapacitySave', data: {
        providerId: provider.id, endpointId: association.endpointId, associationId: association.id, expectedCapacityRevision: row.capacity_revision, limits: row.capacity_limits } }));
      if (!same(row.procurement, original.procurement)) {
        if (!row.procurement || !same(Object.keys(row.procurement).sort(), Object.keys(original.procurement).sort()) || row.procurement.price_version_id !== original.procurement.price_version_id || row.procurement.revision !== original.procurement.revision) throw Error('采购价格版本及关联字段不可修改');
        validatePriceItems(working, row.procurement.items, original.procurement.items);
        apply(channelChangeTransaction(working, { operation: 'channelProcurementPublish', data: { providerId: provider.id, endpointId: association.endpointId,
          associationId: association.id, expectedPriceRevision: row.procurement.revision, effectiveAt: row.procurement.effective_at, expiresAt: row.procurement.expires_at,
          scenarios: row.procurement.items.map(item => ({ name: item.name, condition: item.condition, unit: item.unit, currency: item.currency, listPrice: item.amount })), confirmed: true } }));
      }
    } else {
      const service = serviceReferences(working).find(item => modelServiceIdentity(working, item.model, offerKey(item)) === row.id);
      if (row.type === 'market_model') {
        const model = working.models.find(item => modelIdentity(working, item).id === row.model_id && !item.deletedAt);
        apply(run(working, { operation: 'marketContentSave', modelId: model.id, data: { name: row.name, description: row.description, profile: row.profile, expectedUpdatedAt: model.updatedAt } }));
      } else if (row.type === 'model_service') {
        apply(run(working, { operation: service.providerId ? 'configureServiceIdentity' : 'configureServiceModelIdentity', modelId: service.model.id,
          data: { providerId: offerKey(service), callId: row.call_id, confirmed: true, expectedUpdatedAt: service.model.updatedAt } }));
      } else if (row.type === 'market_service') {
        if (typeof row.market_visible!=='boolean' || !Array.isArray(row.gray_customer_ids)) throw Error('广场展示或灰度范围格式无效');
        const key = offerKey(service), model = service.model;
        if (row.listing_stage!==original.listing_stage || !same(row.gray_customer_ids,original.gray_customer_ids)) {
          if (!['formal','gray','withdrawn'].includes(row.listing_stage)) throw Error('已经营服务可正式上架、灰度上架或下架');
          apply(run(working,{operation:row.listing_stage==='withdrawn'?'stopSales':'startSales',modelId:model.id,data:{
            ...(service.providerId?{offerKeys:[key]}:{}),releaseStage:row.listing_stage,releaseTenantIds:row.gray_customer_ids,confirmed:true,expectedUpdatedAt:model.updatedAt,
          }}));
        }
        if (row.market_visible!==original.market_visible) apply(run(working,{operation:service.providerId?'serviceProviderListing':'marketVisibility',modelId:model.id,
          data:{providerId:key,enabled:row.market_visible,visible:row.market_visible,expectedUpdatedAt:model.updatedAt}}));
      } else {
        if (!Array.isArray(row.items)) throw Error('售价计费项须为数组');
        validatePriceItems(working, row.items, original.items);
        apply(run(working, { operation: 'commercialPublish', modelId: service.model.id,
          data: { kind: 'price', providerId: offerKey(service), value: { callId: service.callId, items: row.items }, confirmed: true,
            expectedBase: commercialPriceBase(working, service.model, offerKey(service)) } }));
      }
    }
  }
  return { type: 'batch', label: '批量维护模型运营', objectId: file.scope, changes };
}
