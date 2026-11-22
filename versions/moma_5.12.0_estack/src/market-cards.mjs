import { projectRole } from './project-access.mjs';
import { isResourceId, resourceId } from './resource-id.mjs';
import { modelLibrary, modelMaterial } from './admin-v2/model-library.js';
import { MODEL_TYPES } from './admin-v2/model-management.js';
import { INPUT_MODALITY_OPTIONS, RESULT_TYPE_OPTIONS, modelProfileDraft } from './admin-v2/model-profile.js';
import { modelIdentity, modelPresentation, modelServiceIdentity } from './model-identities.mjs';
import { activeCustomer, offerGrayTenants, offerKey, offerStage, providerOffer, salesPaused, serviceCallsEnabled, serviceReferences } from './service-access.mjs';

export const marketCardStatuses = { withdrawn: '不可见', preview: '预告可见', gray: '灰度可见', formal: '全部可见' };
export const marketCardFeatures = { online_experience: '在线体验', smart_routing: '智能路由', supports_agent: '支持Agent', supports_mcp: '支持MCP', file_upload: '上传文件' };
export const marketCardOutputOptions = [...INPUT_MODALITY_OPTIONS, ...RESULT_TYPE_OPTIONS];

export function marketCardStatus(card) {
  if (card.status === 'draft') return 'withdrawn';
  return card.status === 'listed' ? card.scope.type === 'selected' ? 'gray' : 'formal' : card.status;
}

export const marketCardStopsSales = card => Boolean(card && card.status !== 'listed');

export function marketCardFieldValues(model) {
  const profile = modelProfileDraft(model);
  const tags = !model?.card && Array.isArray(profile.tags) && profile.tags.length ? profile.tags : model?.tags;
  return {
    name: model?.name || '', heat: model?.heat ?? '', description: model?.description || '',
    description_en: model?.description_en || profile.descriptionEn || '', type: model?.type || '', context_length: model?.capabilities?.context ?? '',
    family: profile.family || '', input_modalities: profile.inputModalities || [],
    output_modalities: [...new Set([...(profile.outputModalities || []), ...(profile.resultTypes || [])])],
    precision: profile.precision || '', tags: Array.isArray(tags) ? tags : [], release_date: profile.releaseDate || '',
    parameters: Number.isFinite(profile.parameters) ? profile.parameters : '', features: model?.features || {},
  };
}

export function marketCardFieldError(data) {
  const filled = (key, max) => typeof data[key] === 'string' && data[key].trim() && data[key].length <= max;
  const selected = (values, choices) => Array.isArray(values) && values.length > 0 && values.every(value => choices.includes(value));
  const checks = [
    [filled('name', 100), '请填写模型展示名（最多 100 字）'],
    [data.heat == null || data.heat === '' || Number.isFinite(data.heat) && data.heat >= 0, '热度须为非负数'],
    [filled('description', 5000), '请填写模型中文简介（最多 5000 字）'],
    [filled('description_en', 5000), '请填写模型英文简介（最多 5000 字）'],
    [typeof data.type === 'string' && Object.hasOwn(MODEL_TYPES, data.type), '请选择模型类型'],
    [Number.isSafeInteger(data.context_length) && data.context_length > 0, '上下文长度换算后须为正整数 Token'],
    [filled('family', 100), '请填写模型系列（最多 100 字）'],
    [selected(data.input_modalities, INPUT_MODALITY_OPTIONS), '请选择输入模态'],
    [selected(data.output_modalities, marketCardOutputOptions), '请选择输出模态'],
    [filled('precision', 100), '请填写模型精度（最多 100 字）'],
    [Array.isArray(data.tags) && data.tags.length > 0 && data.tags.length <= 20 &&
      data.tags.every(value => typeof value === 'string' && value.trim() && value.length <= 50), '请填写模型标签（最多 20 个，每个最多 50 字）'],
    [typeof data.release_date === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(data.release_date) &&
      Number.isFinite(Date.parse(data.release_date)) && new Date(data.release_date).toISOString().slice(0, 10) === data.release_date, '请选择有效的模型发布日期'],
    [data.parameters == null || data.parameters === '' || Number.isFinite(data.parameters) && data.parameters > 0, '参数量须为正数'],
    [data.features == null || typeof data.features === 'object' && !Array.isArray(data.features) && Object.entries(data.features)
      .every(([key, value]) => Object.hasOwn(marketCardFeatures, key) && typeof value === 'boolean'), '模型功能设置无效'],
  ];
  return checks.find(([valid]) => !valid)?.[1];
}

export function marketCardServices(state, modelId, references = serviceReferences(state)) {
  return references.filter(service => (!modelId || service.model_id === modelId) &&
    !service.model.deletedAt && !service.model.archivedAt && service.callId)
    .map(service => {
      const entry = service.providerId ? providerOffer(service.model, offerKey(service)) : null;
      const stage = offerStage(service.model, entry);
      return {
        id: service.model_service_id,
        modelId: service.model_id,
        name: service.model.name,
        serviceName: service.model.serviceName || service.model.name,
        callId: service.callId,
        started: serviceCallsEnabled(service.model, entry) && !state.stoppedModelOfferIds?.includes(service.model_service_id),
        stage, grayTenantIds: offerGrayTenants(service.model, entry),
        legacyShown: service.model.marketVisible !== false && entry?.marketVisible !== false && ['formal', 'gray'].includes(stage),
      };
    });
}

export const marketCardModelId = (cardId, card) => card.model_id || (isResourceId(cardId, 'model-card') ? null : cardId);

export function marketCardsByModel(cards = {}) {
  return new Map(Object.entries(cards).flatMap(([cardId, card]) => {
    const modelId = marketCardModelId(cardId, card);
    return modelId ? [[modelId, card]] : [];
  }));
}

export function marketCardLinkableServices(state, modelId) {
  const services = marketCardServices(state, modelId);
  const models = new Map(modelLibrary(state).filter(row => !row.archivedAt).map(row => [row.id, row]));
  const existingCalls = new Set(services.map(row => JSON.stringify([row.modelId, row.callId])));
  const configured = (state.marketModelServices || []).flatMap(row => {
    const model = models.get(row.modelId);
    if (!model || (modelId && row.modelId !== modelId) || existingCalls.has(JSON.stringify([row.modelId, row.callId]))) return [];
    return [{ id: row.id, modelId: row.modelId, name: model.name, serviceName: row.name,
      callId: row.callId, started: Boolean(row.listed) }];
  });
  const candidates = [...services, ...configured];
  if (modelId) return candidates;
  const occupied = marketCardsByModel(state.modelData?.marketCards);
  const listed = new Set(services.filter(service => service.legacyShown).map(service => service.modelId));
  return candidates.filter(service => service.modelId && !occupied.has(service.modelId) && !listed.has(service.modelId));
}

export function marketCardIndex(state, orderedModels) {
  const cards = state.modelData?.marketCards || {};
  const saved = new Map(Object.entries(cards).map(([cardId, card]) =>
    [marketCardModelId(cardId, card) || cardId, { cardId, card }]));
  const references = serviceReferences(state);
  const services = new Map();
  for (const model of orderedModels) {
    const id = modelIdentity(state, model).id;
    if (!services.has(id)) services.set(id, model);
  }
  const materials = new Map(modelLibrary(state).map(row => [row.id, row]));
  const ranks = new Map((state.modelData?.marketOrder || []).map((id, index) => [id, index]));
  const rank = row => ranks.get(row.id) ?? ranks.get(row.cardId) ?? ranks.size;
  return [...new Set([...services.keys(), ...saved.keys()])].flatMap(key => {
    const { cardId = key, card } = saved.get(key) || {};
    const modelId = card ? marketCardModelId(cardId, card) : key;
    const serviceModel = services.get(modelId), material = materials.get(modelId);
    const model = serviceModel || material;
    const canonicalSlug = material?.modelId || (model ? modelIdentity(state, model).canonical_slug || model.modelId : '');
    if (!model && modelId) return [];
    if (card) return [{ ...(model || { id: cardId }), ...card.content, card, cardId, modelId, canonicalSlug, legacy: false }];
    const linked = marketCardServices(state, modelId, references);
    const displayed = linked.filter(row => row.legacyShown);
    const shown = displayed.map(row => row.id);
    return [{
      ...modelPresentation(state, model), cardId, modelId, canonicalSlug, legacy: true,
      card: {
        linked: linked.map(row => row.id), shown, status: shown.length ? 'listed' : model.firstPublishedAt ? 'withdrawn' : 'draft',
        scope: displayed.length && displayed.every(row => row.stage === 'gray')
          ? { type: 'selected', tenantIds: [...new Set(displayed.flatMap(row => row.grayTenantIds))] } : emptyScope,
      },
    }];
  }).sort((a, b) => rank(a) - rank(b));
}

const emptyScope = { type: 'all', tenantIds: [], organizationIds: [], projectIds: [] };
const countScope = scope => (scope.tenantIds?.length || 0) + (scope.organizationIds?.length || 0) + (scope.projectIds?.length || 0);

export function marketScopeOptions(state) {
  return (state.tenants || []).filter(activeCustomer).map(row => ({ value: row.id, label: `${row.name} · ${row.id}` }));
}

function checkedMarketScope(state, input) {
  const tenants = new Set(marketScopeOptions(state).map(row => row.value));
  const ids = input?.tenantIds;
  if (!Array.isArray(ids) || !ids.length || ids.length > 100 || new Set(ids).size !== ids.length ||
    ids.some(id => !tenants.has(id))) throw Error('请选择有效的可见租户（最多 100 个）');
  return { ...emptyScope, type: 'selected', tenantIds: ids };
}

export function marketAudience(state, { tenantId, member, projectId } = {}) {
  const organizations = new Set();
  const projects = [];
  if (member?.status === '正常' && tenantId && member.tenantId === tenantId) {
    const own = new Map((state.organizations || []).filter(row => row.tenantId === tenantId && row.status === '正常').map(row => [row.id, row]));
    for (let id = member.organizationId; own.has(id) && !organizations.has(id); id = own.get(id).parentId) organizations.add(id);
    const admin = ['租户管理员', '企业管理员'].includes(member.role);
    projects.push(...(state.projects || []).filter(row => row.tenantId === tenantId && row.status === '正常' && (admin || projectRole(row, member))));
  }
  return { tenantId, organizations, projects, projectId: projects.some(row => row.id === projectId) ? projectId : null };
}

export function marketCardInScope(card, audience) {
  const { scope } = card;
  return card.status === 'listed' && (scope.type === 'all' ||
    scope.tenantIds?.includes(audience.tenantId) ||
    scope.projectIds?.includes(audience.projectId) ||
    scope.organizationIds?.some(id => audience.organizations.has(id)));
}

export function marketCardVisible(card, serviceId, audience) {
  return card.shown.includes(serviceId) && marketCardInScope(card, audience);
}

export function marketCardCatalogueEntry(card, modelId, canonicalSlug, audience, cardId = modelId) {
  const preview = card.status === 'preview';
  if (!preview && (!modelId || !marketCardInScope(card, audience))) return;
  const { name, type, description, description_en, profile, capabilities, features, tags, heat } = card.content;
  return { card_id: cardId, model_id: modelId, canonical_slug: canonicalSlug, name, type, description, description_en, profile, capabilities, features, tags, heat, preview };
}

export function marketCardIssues(card, services) {
  const available = new Set(services.filter(row => row.started).map(row => row.id));
  return [
    !card.content?.name?.trim() || !card.content?.description?.trim() ? '请补齐模型展示名和简介' : '',
    !card.shown.length || card.shown.some(id => !card.linked.includes(id) || !available.has(id))
      ? '请至少选择一个已启动的关联服务' : '',
    card.scope.type === 'selected' && !countScope(card.scope) ? '请至少选择一个可见租户' : '',
  ].filter(Boolean);
}

export function marketCardBlocksServiceSales(state, model, key) {
  const serviceId = modelServiceIdentity(state, model, key);
  const card = marketCardsByModel(state.modelData?.marketCards).get(modelIdentity(state, model).id);
  return marketCardStopsSales(card) && card.linked.includes(serviceId);
}

function pauseLinkedSales(state, card) {
  const paused = new Map();
  for (const service of serviceReferences(state)) {
    const { model } = service, key = offerKey(service);
    const entry = providerOffer(model, key);
    if (!card.linked.includes(service.model_service_id) || !['gray', 'formal'].includes(offerStage(model, entry)) || salesPaused(model, key)) continue;
    if (!paused.has(model.id)) paused.set(model.id, { model, keys: new Set() });
    paused.get(model.id).keys.add(key);
  }
  return [...paused.values()].map(({ model, keys }) => ({
    type: 'update', collection: 'models', id: model.id, changes: !keys.has('')
      ? { serviceProviders: model.serviceProviders.map(row => keys.has(offerKey(row)) && row.status !== '已移除' ? { ...row, salesPaused: true } : row) }
      : { salesPaused: true },
  }));
}

export function marketCardTransaction(state, action, orderedModels) {
  const { modelId, data = {}, operation } = action;
  if (data.expectedRevision !== state.revision) throw Error('模型广场已有修订，请载入最新数据后重试');
  const creating = operation === 'marketCardCreate';
  const existing = creating ? null : marketCardIndex(state, orderedModels).find(row => row.cardId === (data.card_id ?? modelId));
  if (!creating && !existing) throw Error('模型卡片不存在');
  if ((creating || operation === 'marketCardEdit') && data.source_model_id && !modelMaterial(state, data.source_model_id)) throw Error('模型资料不存在');
  const cardId = existing?.cardId || resourceId('model-card');
  let card = existing ? {
    ...existing.card, content: existing.card.content || {
      name: existing.name, description: existing.description, profile: existing.profile || {}, tags: existing.tags || [],
      type: existing.type, capabilities: existing.capabilities || {},
    },
  } : { linked: [], shown: [], status: 'draft', scope: emptyScope };
  let label;
  if (operation === 'marketCardCreate' || operation === 'marketCardEdit') {
    const error = marketCardFieldError(data);
    if (error) throw Error(error);
    const source = creating ? null : card.content;
    const profile = modelProfileDraft(source);
    if (profile.family !== data.family.trim()) delete profile.familyId;
    card = { ...card, content: {
      type: data.type, name: data.name.trim(), description: data.description.trim(), description_en: data.description_en.trim(),
      heat: Number.isFinite(data.heat) ? data.heat : null, tags: [...new Set(data.tags.map(tag => tag.trim()))],
      features: Object.fromEntries(Object.keys(marketCardFeatures).map(key => [key, data.features?.[key] === true])),
      capabilities: { ...source?.capabilities, context: data.context_length },
      profile: { ...profile, family: data.family.trim(), precision: data.precision.trim(), releaseDate: data.release_date,
        inputModalities: [...new Set(data.input_modalities)],
        outputModalities: [...new Set(data.output_modalities.filter(value => INPUT_MODALITY_OPTIONS.includes(value)))],
        resultTypes: [...new Set(data.output_modalities.filter(value => RESULT_TYPE_OPTIONS.includes(value)))],
        parameters: Number.isFinite(data.parameters) ? data.parameters : null },
    } };
    label = creating ? '新建模型卡片' : '编辑模型卡片';
  } else {
    if (operation === 'marketCardLink') {
      const ids = data.serviceIds;
      const services = marketCardLinkableServices(state, existing.modelId);
      const valid = new Set([...services.map(row => row.id), ...card.linked]);
      if (!Array.isArray(ids) || new Set(ids).size !== ids.length || ids.some(id => !valid.has(id))) {
        throw Error('请选择该模型下的有效服务');
      }
      const models = new Set(services.filter(service => ids.includes(service.id)).map(service => service.modelId));
      if (models.size > 1) throw Error('请选择同一模型下的服务');
      if (card.status === 'listed' && card.shown.some(id => !ids.includes(id) && services.some(row => row.id === id))) throw Error('请先从展示服务中移除，再解除关联');
      card = { ...card, linked: ids, shown: card.shown.filter(id => ids.includes(id)) };
      if (!existing.modelId && models.size) card.model_id = services.find(row => ids.includes(row.id)).modelId;
      label = '保存模型卡片关联服务';
    } else if (operation === 'marketCardSetStatus') {
      const { listing_stage: status, serviceIds } = data;
      if (typeof status !== 'string' || !Object.hasOwn(marketCardStatuses, status)) throw Error('请选择可见性');
      if (status === 'formal' || status === 'gray') {
        if (!Array.isArray(serviceIds) || new Set(serviceIds).size !== serviceIds.length) throw Error('展示服务无效');
        const scope = status === 'formal' ? emptyScope : checkedMarketScope(state, data.scope);
        card = { ...card, shown: serviceIds, scope, status: 'listed' };
        const issues = marketCardIssues(card, marketCardServices(state, existing.modelId));
        if (issues.length) throw Error(issues.join('、'));
      } else card = { ...card, status };
      label = '设置模型卡片可见性';
    }
  }
  const changes = ['marketCardSetStatus', 'marketCardLink'].includes(operation) && marketCardStopsSales(card)
    ? pauseLinkedSales(state, card) : [];
  return { type: 'batch', label, objectId: cardId, changes, marketCard: { cardId, card } };
}
