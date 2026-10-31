import { REAL_PROVIDERS, BAICHUAN_PROVIDER } from './real-provider-catalogue.js';
import { REAL_MODELS } from './real-model-catalogue.js';
import { MOMA_PROVIDER } from './moma-provider.js';
import { libraryRecord, modelLibrary } from './model-library.js';

// Presets are reference metadata, never registered supply, account entitlements or validation.
export const ONBOARDING_PROVIDER_PRESETS = [MOMA_PROVIDER, ...REAL_PROVIDERS, BAICHUAN_PROVIDER].map(row => Object.freeze({ id: row.code, code: row.code, name: row.name, sourceType: row.sourceType, interfaceType: 'openai', defaultBaseUrl: row.baseUrl, catalogModelIds: Object.freeze([...(row.catalogModelIds || [])]), catalogueSource: row.catalogueSource || '', catalogueCheckedAt: row.catalogueCheckedAt || null }));
export function onboardingProviderPreset(id) {
  const preset = ONBOARDING_PROVIDER_PRESETS.find(row => row.id === id);
  if (!preset) throw new Error('供应商预设不存在，请重新选择');
  return { ...preset };
}
export function resolveOnboardingProvider(state, { providerId, providerPresetId } = {}) {
  if (Boolean(providerId) === Boolean(providerPresetId)) throw new Error('请选择已有供应商或供应商预设，不能同时选择');
  if (providerId) { const provider = state.providers.find(row => row.id === providerId && !row.deletedAt); if (!provider) throw new Error('供应商已不存在，请重新选择'); return structuredClone(provider); }
  const preset = onboardingProviderPreset(providerPresetId);
  const matches = state.providers.filter(row => !row.deletedAt && (row.onboardingPresetId === preset.id || row.code?.toLowerCase() === preset.code));
  if (matches.length > 1) throw new Error('供应商预设对应多个同编码实体，请明确选择已有供应商');
  if (matches[0]) { if (matches[0].sourceType !== preset.sourceType) throw new Error('供应商编码与预设的供给类型冲突，请明确选择已有供应商'); return structuredClone(matches[0]); }
  return { ...preset, id: 'preset:' + preset.id, providerPresetId: preset.id, isDraft: true, status: '未登记', apiKeys: [] };
}
export function onboardingModelPreset(id) {
  const model = REAL_MODELS.find(row => row.id === id);
  if (!model) throw new Error('模型参考预设不存在，请重新选择');
  const { modelId, name, maker, type, description, usageUnit, profile, capabilities } = model;
  return structuredClone({ id, modelId, name, maker, type, description, ...(usageUnit ? { usageUnit } : {}), profile, capabilities, sourceCheckedAt: model.sourceCheckedAt || profile?.sourceUpdated || null });
}
export function resolveOnboardingModel(state, { libraryId, modelPresetId } = {}) {
  if (Boolean(libraryId) === Boolean(modelPresetId)) throw new Error('请选择模型资料或模型参考预设，不能同时选择');
  if (libraryId) { const record = libraryRecord(state, libraryId); if (!record) throw new Error('模型资料已不存在，请重新选择'); return { record: structuredClone(record), isDraft: false }; }
  const preset = onboardingModelPreset(modelPresetId), matches = modelLibrary(state).filter(row => row.onboardingPresetId === modelPresetId || row.modelId?.toLowerCase() === preset.modelId.toLowerCase());
  if (matches.length > 1) throw new Error('模型预设对应多个同编码资料，请明确选择已有主档');
  if (matches[0]) { if (matches[0].type !== preset.type || matches[0].modelId?.toLowerCase() !== preset.modelId.toLowerCase()) throw new Error('模型参考预设与已有资料身份或类型冲突，请明确选择主档'); return { record: structuredClone(matches[0]), isDraft: false }; }
  return { record: preset, isDraft: true };
}
export function onboardingModelOptions(state) {
  const records = modelLibrary(state), known = new Set(records.map(row => row.modelId?.toLowerCase()));
  return [
    ...records.map(record => ({ ...structuredClone(record), libraryId: record.id, modelPresetId: '', source: 'library', sourceCheckedAt: record.sourceCheckedAt || record.profile?.sourceUpdated || null })),
    ...REAL_MODELS.filter(row => !known.has(row.modelId.toLowerCase())).map(row => ({ ...onboardingModelPreset(row.id), id: 'preset:' + row.id, libraryId: '', modelPresetId: row.id, source: 'reference' })),
  ];
}
export function assertOnboardingMetadata(value) {
  if (!value || typeof value !== 'object') return;
  for (const [key, item] of Object.entries(value)) { if (/^(secret|apiKey|apiKeys|password|token|accessToken|authorization|credentialRef|newKey|keyInput|keyInputs)$/i.test(key)) throw new Error('快捷接入只接受密钥掩码和指纹，不能保存明文或认证内容'); assertOnboardingMetadata(item); }
}
