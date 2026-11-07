import { REAL_PROVIDERS, BAICHUAN_PROVIDER } from './real-provider-catalogue.js';
import { REAL_MODELS } from './real-model-catalogue.js';
import { MOMA_PROVIDER } from './moma-provider.js';
import { libraryRecord, modelLibrary, modelCatalogue } from './model-library.js';
import { MODEL_TYPES } from './model-management.js';

// Presets are reference metadata, never registered supply, account entitlements or validation.
export const ONBOARDING_PROVIDER_PRESETS = [MOMA_PROVIDER, ...REAL_PROVIDERS, BAICHUAN_PROVIDER].map(row => Object.freeze({ id: row.code, code: row.code, name: row.name, sourceType: row.sourceType, interfaceType: 'openai', defaultBaseUrl: row.baseUrl, catalogModelIds: Object.freeze([...(row.catalogModelIds || [])]), catalogueSource: row.catalogueSource || '', catalogueCheckedAt: row.catalogueCheckedAt || null }));
export function onboardingProviderPreset(id) {
  const preset = ONBOARDING_PROVIDER_PRESETS.find(row => row.id === id);
  if (!preset) throw new Error('服务商预设不存在，请重新选择');
  return { ...preset };
}
const newFields = (value, fields, label) => {
  if (!value || typeof value !== 'object' || Array.isArray(value) || Object.keys(value).some(key => !fields.includes(key))) throw new Error(`${label}包含不支持的字段`);
};
const identityText = (value, label, max) => {
  if (typeof value !== 'string' || !value.trim() || value.trim().length > max || /\p{Cc}/u.test(value)) throw new Error(`请填写有效的${label}，最多${max}字`);
  return value.trim();
};
export function resolveOnboardingProvider(state, { providerId, providerPresetId, newProvider } = {}) {
  if ([providerId, providerPresetId, newProvider].filter(Boolean).length !== 1) throw new Error('请选择已有服务商、服务商预设或新服务商，不能同时选择');
  if (newProvider) {
    newFields(newProvider, ['name'], '新服务商');
    const name = identityText(newProvider.name, '服务商名称', 100);
    if (state.providers.some(row => !row.deletedAt && row.name?.trim().toLowerCase() === name.toLowerCase())) throw new Error('服务商名称已存在，请明确选择已有服务商');
    return { id: 'new-provider', isDraft: true, name, sourceType: 'thirdParty', status: '未登记', apiKeys: [] };
  }
  if (providerId) { const provider = state.providers.find(row => row.id === providerId && !row.deletedAt); if (!provider) throw new Error('服务商已不存在，请重新选择'); return structuredClone(provider); }
  const preset = onboardingProviderPreset(providerPresetId);
  const matches = state.providers.filter(row => !row.deletedAt && (row.onboardingPresetId === preset.id || row.code?.toLowerCase() === preset.code));
  if (matches.length > 1) throw new Error('服务商预设对应多个同编码实体，请明确选择已有服务商');
  if (matches[0]) { if (matches[0].sourceType !== preset.sourceType) throw new Error('服务商编码与预设的供给类型冲突，请明确选择已有服务商'); return structuredClone(matches[0]); }
  return { ...preset, id: 'preset:' + preset.id, providerPresetId: preset.id, isDraft: true, status: '未登记', apiKeys: [] };
}
export function onboardingModelPreset(id) {
  const model = REAL_MODELS.find(row => row.id === id);
  if (!model) throw new Error('模型参考预设不存在，请重新选择');
  const { modelId, name, maker, type, description, usageUnit, profile, capabilities } = model;
  return structuredClone({ id, modelId, name, maker, type, description, ...(usageUnit ? { usageUnit } : {}), profile, capabilities, sourceCheckedAt: model.sourceCheckedAt || profile?.sourceUpdated || null });
}
export function resolveOnboardingModel(state, { libraryId, modelPresetId, newModel } = {}) {
  if ([libraryId, modelPresetId, newModel].filter(Boolean).length !== 1) throw new Error('请选择模型资料、模型参考预设或新模型，不能同时选择');
  if (newModel) {
    newFields(newModel, ['modelId', 'name', 'type'], '新模型');
    const modelId = identityText(newModel.modelId, '模型编码', 80), name = identityText(newModel.name || modelId, '模型名称', 100);
    if (!/^[a-z0-9][a-z0-9._:/-]{0,79}$/.test(modelId)) throw new Error('模型编码须由小写字母、数字及 . _ : / - 组成，最多80字');
    if (!Object.hasOwn(MODEL_TYPES, newModel.type)) throw new Error('请选择模型类型');
    if (modelLibrary(state).some(row => row.modelId?.toLowerCase() === modelId.toLowerCase())) throw new Error('相同模型编码的资料已存在，请明确选择已有资料');
    return { isDraft: true, record: { id: 'new-model:' + modelId, modelId, name, type: newModel.type, maker: '', description: '', metadataStatus: '待完善', profile: { tasks: [], inputModalities: [], outputModalities: [], resultTypes: [] }, capabilities: { context: null, output: null, streaming: null, tools: null } } };
  }
  if (libraryId) { const record = libraryRecord(state, libraryId); if (!record) throw new Error('模型资料已不存在，请重新选择'); return { record: structuredClone(record), isDraft: false }; }
  const preset = onboardingModelPreset(modelPresetId), matches = modelLibrary(state).filter(row => row.onboardingPresetId === modelPresetId || row.modelId?.toLowerCase() === preset.modelId.toLowerCase());
  if (matches.length > 1) throw new Error('模型预设对应多个同编码资料，请明确选择已有主档');
  if (matches[0]) { if (matches[0].type !== preset.type || matches[0].modelId?.toLowerCase() !== preset.modelId.toLowerCase()) throw new Error('模型参考预设与已有资料身份或类型冲突，请明确选择主档'); return { record: structuredClone(matches[0]), isDraft: false }; }
  return { record: preset, isDraft: true };
}
export function onboardingModelOptions(state) {
  const records = modelCatalogue(state), known = new Set(records.map(row => row.modelId?.toLowerCase()));
  return [
    ...records.map(record => ({ ...structuredClone(record), libraryId: record.id, modelPresetId: '', source: 'library', sourceCheckedAt: record.sourceCheckedAt || record.profile?.sourceUpdated || null })),
    ...(state.modelData?.archivedCatalogueIds ? [] : REAL_MODELS).filter(row => !known.has(row.modelId.toLowerCase())).map(row => ({ ...onboardingModelPreset(row.id), id: 'preset:' + row.id, libraryId: '', modelPresetId: row.id, source: 'reference' })),
  ];
}
export function assertOnboardingMetadata(value) {
  if (!value || typeof value !== 'object') return;
  for (const [key, item] of Object.entries(value)) { if (/^(secret|apiKey|apiKeys|password|token|accessToken|authorization|credentialRef|newKey|keyInput|keyInputs)$/i.test(key)) throw new Error('快捷接入只接受密钥掩码和指纹，不能保存明文或认证内容'); assertOnboardingMetadata(item); }
}

export function similarOnboardingProviders(state, name) {
  const normalize=value=>String(value || '').toLowerCase().replace(/官方|开放平台|引擎|[\s·（）()]/gu,'');
  const target=normalize(name);
  return target.length<2?[]:state.providers.filter(row=>!row.deletedAt && [normalize(row.name),normalize(row.code)].some(value=>value.length>=2 && (target.includes(value) || value.includes(target))));
}
