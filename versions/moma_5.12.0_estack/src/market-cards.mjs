import { modelCatalogue } from './admin-v2/model-library.js';
import { normalizeModelLogo } from './admin-v2/model-profile.js';
import { modelIdentity, modelPresentation } from './model-identities.mjs';
import { activeCustomer, offerKey, offerStage, providerOffer, serviceCallsEnabled, serviceReferences } from './service-access.mjs';

export function marketCardServices(state, modelId, references = serviceReferences(state)) {
  return references.filter(service => service.model_id === modelId &&
    !service.model.deletedAt && !service.model.archivedAt && service.callId)
    .map(service => {
      const entry = service.providerId ? providerOffer(service.model, offerKey(service)) : null;
      return {
        id: service.model_service_id,
        callId: service.callId,
        started: serviceCallsEnabled(service.model, entry),
        legacyShown: service.model.marketVisible !== false && entry?.marketVisible !== false &&
          ['formal', 'gray'].includes(offerStage(service.model, entry)),
      };
    });
}

export function marketCardIndex(state, orderedModels) {
  const cards = state.modelData?.marketCards || {};
  const references = serviceReferences(state);
  const services = new Map();
  for (const model of orderedModels) {
    const id = modelIdentity(state, model).id;
    if (!services.has(id)) services.set(id, model);
  }
  const materials = new Map(modelCatalogue(state).map(row => [row.id, row]));
  const ranks = new Map((state.modelData?.marketOrder || []).map((id, index) => [id, index]));
  const rank = row => ranks.get(row.id) ?? ranks.size;
  return [...new Set([...services.keys(), ...Object.keys(cards)])].flatMap(modelId => {
    const serviceModel = services.get(modelId);
    const material = materials.get(modelId);
    if (!material && !serviceModel) return [];
    const card = Object.hasOwn(cards, modelId) ? cards[modelId] : null;
    const model = serviceModel || material;
    const canonicalSlug = material?.modelId || modelIdentity(state, model).canonical_slug || model.modelId;
    if (card) return [{ ...model, ...card.content, card, modelId, canonicalSlug, legacy: false }];
    const linked = marketCardServices(state, modelId, references);
    const shown = linked.filter(row => row.legacyShown).map(row => row.id);
    return [{
      ...modelPresentation(state, model), modelId, canonicalSlug, legacy: true,
      card: {
        linked: linked.map(row => row.id), shown, status: shown.length ? 'listed' : model.firstPublishedAt ? 'withdrawn' : 'draft',
        scope: { type: 'all', tenantIds: [] },
      },
    }];
  }).sort((a, b) => rank(a) - rank(b));
}

export function marketCardVisible(card, serviceId, tenantId) {
  return card.status === 'listed' && card.shown.includes(serviceId) &&
    (card.scope.type === 'all' || card.scope.tenantIds.includes(tenantId));
}

export function marketCardIssues(card, services) {
  const available = new Set(services.filter(row => row.started).map(row => row.id));
  return [
    !card.content?.name?.trim() || !card.content?.description?.trim() ? '请补齐模型展示名称和简介' : '',
    !card.shown.length || card.shown.some(id => !card.linked.includes(id) || !available.has(id))
      ? '请至少选择一个已启动的关联服务' : '',
    card.scope.type === 'selected' && !card.scope.tenantIds.length ? '请选择可见范围' : '',
  ].filter(Boolean);
}

export function marketCardTransaction(state, action, orderedModels) {
  const { modelId, data = {}, operation } = action;
  if (data.expectedRevision !== state.revision) throw Error('模型广场已有修订，请载入最新数据后重试');
  const existing = marketCardIndex(state, orderedModels).find(row => row.modelId === modelId);
  const material = existing || modelCatalogue(state).find(item => item.id === modelId);
  if (!material) throw Error('模型资料不存在');
  const services = marketCardServices(state, modelId);
  let card = existing ? {
    ...existing.card, content: existing.card.content || {
      name: existing.name, description: existing.description, profile: existing.profile || {},
    },
  } : { linked: [], shown: [], status: 'draft', scope: { type: 'all', tenantIds: [] } };
  let label;
  if (operation === 'marketCardCreate' || operation === 'marketCardEdit') {
    const creating = operation === 'marketCardCreate';
    if (creating === Boolean(existing)) throw Error(creating ? '此模型已存在卡片，请编辑已有卡片' : '模型卡片不存在');
    if (typeof data.name !== 'string' || !data.name.trim() || data.name.length > 100 ||
      typeof data.description !== 'string' || !data.description.trim() || data.description.length > 5000) {
      throw Error('请填写模型展示名称和简介');
    }
    if (typeof data.logo !== 'string' || data.logo.length > 1400000) throw Error('模型图标 URL 无效');
    card = { ...card, content: {
      name: data.name.trim(), description: data.description.trim(),
      profile: { ...(card.content?.profile || material.profile), logo: data.logo === (card.content?.profile || material.profile)?.logo ? data.logo : data.logo ? normalizeModelLogo(data.logo.trim()) : '' },
    } };
    label = creating ? '新建模型卡片' : '编辑模型卡片';
  } else {
    if (!existing) throw Error('请先新建模型卡片');
    if (operation === 'marketCardLink') {
      const ids = data.serviceIds;
      if (!Array.isArray(ids) || new Set(ids).size !== ids.length || ids.some(id => !services.some(row => row.id === id))) {
        throw Error('请选择该模型下的有效服务');
      }
      if (card.status === 'listed' && card.shown.some(id => !ids.includes(id) && services.some(row => row.id === id))) throw Error('请先从展示服务中移除，再解除关联');
      card = { ...card, linked: ids, shown: card.shown.filter(id => ids.includes(id)) };
      label = '保存模型卡片关联服务';
    } else if (operation === 'marketCardList') {
      const { scope, serviceIds } = data;
      if (!Array.isArray(serviceIds) || new Set(serviceIds).size !== serviceIds.length ||
        !['all', 'selected'].includes(scope?.type) || !Array.isArray(scope.tenantIds) ||
        new Set(scope.tenantIds).size !== scope.tenantIds.length ||
        (scope.type === 'all' && scope.tenantIds.length) ||
        scope.tenantIds.some(id => !state.tenants.some(row => row.id === id && activeCustomer(row)))) {
        throw Error('可见范围或展示服务无效');
      }
      card = { ...card, shown: serviceIds, scope: { type: scope.type, tenantIds: scope.tenantIds }, status: 'listed' };
      const issues = marketCardIssues(card, services);
      if (issues.length) throw Error(issues.join('、'));
      label = existing.card.status === 'listed' ? '调整模型卡片上架' : '上架模型卡片';
    } else if (operation === 'marketCardUnlist') {
      if (card.status !== 'listed' || data.confirmed !== true) throw Error('请核对并确认下架展示');
      card = { ...card, status: 'withdrawn' };
      label = '下架模型卡片';
    }
  }
  return { type: 'batch', label, objectId: modelId, changes: [], marketCard: { modelId, card } };
}
