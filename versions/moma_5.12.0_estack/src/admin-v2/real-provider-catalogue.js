import mockConfig from '../mock/catalogues.json' with { type: 'json' };
// Official OpenAI-compatible entries checked 2026-10-11; registered catalogues are documented subsets, not account entitlements.
const provider = (id, name, code, baseUrl, catalogueSource, catalogModelIds, integrationType = '模型厂商直连') => ({ id, name, code, baseUrl, catalogueSource, catalogModelIds, catalogueCheckedAt: '2026-10-11', sourceType: 'thirdParty', integrationType });
export const CARRIER_PROVIDERS = mockConfig["admin-v2/real-provider-catalogue.js"]["CARRIER_PROVIDERS"];
export const REAL_PROVIDERS = mockConfig["admin-v2/real-provider-catalogue.js"]["REAL_PROVIDERS"];
export const BAICHUAN_PROVIDER = provider('provider-baichuan', '百川智能', 'baichuan', 'https://api.baichuan-ai.com/v1', 'https://platform.baichuan-ai.com/docs/api?activity=true', ['Baichuan2-Turbo', 'Baichuan2-Turbo-192k']);
export const realProvider = id => structuredClone(REAL_PROVIDERS.find(item => item.id === id));
