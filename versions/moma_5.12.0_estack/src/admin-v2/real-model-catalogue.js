import mockConfig from '../mock/catalogues.json' with { type: 'json' };
// Official model metadata checked 2026-10-11. Supply, prices and checks remain local fixtures.













// First vendor release/service date for the exact model, never a third-party onboarding date.
export const MODEL_RELEASES = mockConfig["admin-v2/real-model-catalogue.js"]["MODEL_RELEASES"];
export const RECENT_TEMPLATE_CODES = mockConfig["admin-v2/real-model-catalogue.js"]["RECENT_TEMPLATE_CODES"];
export const REAL_MODELS = mockConfig["admin-v2/real-model-catalogue.js"]["REAL_MODELS"];
export const catalogueMetadata = id => structuredClone(REAL_MODELS.find(model => model.id === id));
export function catalogueModelSeed(at) {
  return REAL_MODELS.filter(model => /^model-\d+$/.test(model.id)).map((model, index) => ({ ...structuredClone(model), createdAt: at, updatedAt: at, status: index === 2 ? '验证中' : '运行中', visibility: index === 2 ? '内部' : '公开', defaultVersionId: `version-${index + 1}`, listingStatus: index < 2 ? '已上架' : '已下架', callsEnabled: index !== 2, openScope: 'all', tenantIds: [] }));
}
