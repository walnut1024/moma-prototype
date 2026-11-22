import { modelServiceKey } from '../model-identities.mjs';
import { MODEL_DATA_COLLECTIONS } from '../mock/model-data.js';
import { resourceId } from '../resource-id.mjs';

export function marketDemoState(currentRole) {
  const providers = ['示例服务商 A', '示例服务商 B', '示例服务商 C'].map(name => ({ id: resourceId('provider'), name }));
  const tenants = ['示例科技公司', '示例研究院', '示例软件公司'].map(name => ({
    id: resourceId('tenant'), name, status: '正常',
  }));
  const marketCards = {}, resourceIds = {};
  const models = ['text', 'multimodal'].map((type, index) => {
    const name = index ? '模拟多模态模型' : '模拟语言模型';
    const modelId = 'market-demo-' + type;
    const model = {
      id: resourceId('model'), name, modelId, type, description: `${name}用于演示卡片和服务关联。`,
      capabilities: { context: index ? 1048576 : 131072 },
      profile: { descriptionEn: 'An example model for marketplace workflows.', family: '示例系列', precision: 'BF16',
        inputModalities: index ? ['文本', '图片'] : ['文本'], outputModalities: ['文本'], tags: ['模拟数据'], releaseDate: '2026-11-01' },
      serviceMode: 'provider', callsEnabled: true, visibility: '公开',
      serviceProviders: providers.map((provider, providerIndex) => ({
        providerId: provider.id, callId: `${modelId}-${providerIndex + 1}`, callsEnabled: true, listingStage: 'unlisted',
      })),
    };
    const ids = model.serviceProviders.map(row => resourceIds[modelServiceKey(model, row.providerId)] = resourceId('model_service'));
    marketCards[model.id] = {
      content: { name, type, description: model.description, description_en: model.profile.descriptionEn,
        profile: model.profile, capabilities: model.capabilities, tags: model.profile.tags },
      linked: ids.slice(0, 1), shown: [], status: index ? 'preview' : 'draft', scope: { type: 'all', tenantIds: [] },
    };
    return model;
  });
  return { ...Object.fromEntries(MODEL_DATA_COLLECTIONS.map(key => [key, []])),
    revision: 0, currentRole, cloudOperations: true, models, providers, tenants,
    orders: [], audits: [], admins: [], memberships: [], users: [], projects: [],
    spacePolicy: { internalTenantId: tenants[0].id }, modelData: { marketCards, resourceIds } };
}
