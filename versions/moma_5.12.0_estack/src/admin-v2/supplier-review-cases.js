import { normalizeCataloguePrice } from './provider-catalogue-pricing.js';
import { connectionFingerprint, connectionCredentialsReady } from './connection-state.js';
import { channelFingerprint } from './provider-channels.js';
import { modelLibrary } from './model-library.js';

const tokens = (input, output) => [{ name: '输入 Token', listPrice: String(input), unit: '百万 Token', currency: 'CNY' }, ...(output == null ? [] : [{ name: '输出 Token', listPrice: String(output), unit: '百万 Token', currency: 'CNY' }])];
export const SUPPLIER_REVIEW_CASES = [
  { id: 'provider-moma', code: 'moma', name: '中国移动 MoMA', models: [['GLM-5.2', 'GLM-5.2', 'text'], ['BGE-M3', 'BGE-M3', 'embedding'], ['AICC-Doubao-Seedance-2.0', 'Seedance-2.0', 'visual'], ['DeepSeek-V4-Flash-0731', 'DeepSeek-V4-Flash-0731', 'text'], ['Kimi/miKimi-K3', 'Kimi/miKimi-K3', 'multimodal']], keys: [['KEY-001', '生产凭证'], ['KEY-002', '备用凭证'], ['KEY-003', '专用凭证']], channels: [['CH-001', '生产渠道', 'https://moma.example.invalid/v1/chat/completions', 'inherit'], ['CH-002', '专用渠道', 'https://vip.moma.example.invalid/v1/chat/completions', 'specific', 'KEY-003']], links: [[0, 0, 'GLM-5.2', tokens(8, 28)], [0, 1, 'glm-5.2', tokens(7, 25)], [3, 0, 'DeepSeek-V4-Flash-0731', tokens(1.5, 6)], [4, 1, 'Kimi/miKimi-K3', tokens(2, 8)]] },
  { id: 'provider-deepseek-official', code: 'deepseek-official', name: 'DeepSeek 官方', models: [['deepseek-reasoner', 'DeepSeek-R1', 'text']], keys: [['KEY-101', '生产凭证']], channels: [['CH-101', '官方渠道', 'https://api.deepseek.com/chat/completions', 'inherit']], links: [[0, 0, 'deepseek-reasoner', tokens(4, 16)]] },
  { id: 'provider-ark-official', code: 'ark-official', name: '火山方舟', models: [['doubao-pro', 'Doubao-Pro', 'text'], ['doubao-seed', 'Doubao-Seed', 'text']], keys: [['KEY-201', '生产账号'], ['KEY-202', '专用账号'], ['KEY-203', '海外账号']], channels: [['CH-201', '北京渠道', 'https://beijing.ark.example.invalid/v1/chat/completions', 'inherit'], ['CH-202', '上海渠道', 'https://shanghai.ark.example.invalid/v1/chat/completions', 'specific', 'KEY-202'], ['CH-203', '海外渠道', 'https://overseas.ark.example.invalid/v1/chat/completions', 'specific', 'KEY-203']], links: [[0, 0, 'doubao-pro', tokens(2, 8)], [0, 1, 'doubao-pro', tokens(2.1, 8.5)], [0, 2, 'doubao-pro', tokens(2.3, 9)], [1, 0, 'doubao-seed', tokens(.8, 2)]] },
  { id: 'provider-kimi-official', code: 'kimi-official', name: '月之暗面 Kimi', models: [['kimi-k2', 'Kimi-K2', 'multimodal']], keys: [], channels: [['CH-301', '默认渠道', 'https://api.moonshot.cn/v1/chat/completions', 'inherit']], links: [[0, 0, 'kimi-k2', tokens(2, 8)]] },
  { id: 'provider-zhipu-direct', code: 'zhipu-direct', name: '智谱', models: [['glm-4-7', 'GLM-4.7', 'text'], ['glm-5.2', 'GLM-5.2', 'text']], keys: [], channels: [], links: [] },
];

// Merge only missing fixtures; saved edits, deletions and service data are never reset.
export function prepareSupplierReviewCases(source, merge = true) {
  if (source.supplierReviewVersion === 1) return source;
  const state = structuredClone(source), at = new Date().toISOString();
  for (const spec of SUPPLIER_REVIEW_CASES) {
    let provider = state.providers.find(row => row.id === spec.id);
    if (!provider) { provider = { id: spec.id, name: spec.name, code: spec.code, status: '已启用', sourceType: 'thirdParty', catalogModelIds: [], catalogModels: [], catalogConnections: [], apiKeys: [] }; state.providers.push(provider); }
    if (!merge) {
      state.endpoints = state.endpoints.filter(row => row.providerId !== provider.id);
      Object.assign(provider, { catalogModelIds: [], catalogModels: [], catalogConnections: [], catalogPricing: [], apiKeys: [], defaultApiKeyId: '', removedCatalogModelIds: [], catalogueScope: 'managed' });
    }
    for (const [modelId, name, type] of spec.models) {
      let master;
      if (!merge) {
        master = modelLibrary(state).find(row => row.modelId.toLowerCase() === modelId.toLowerCase() && row.type === type);
        if (!master) {
          master = { id: `supplier-template-${modelId}`, modelId: modelId.toLowerCase(), name, type: type === 'visual' ? 'video' : type, maker: '', description: name + ' 的模型资料演示记录，具体能力规格待核对。', usageUnit: type === 'visual' ? '秒' : '百万 Token', capabilities: {}, profile: { tasks: [type === 'visual' ? '文生视频' : '对话'], inputModalities: ['文本'], outputModalities: [type === 'visual' ? '视频' : '文本'] }, revision: 1, updatedAt: at };
          state.modelTemplates.push(master);
        }
      }
      if (!(provider.removedCatalogModelIds || []).includes(modelId) && !(provider.catalogModelIds || []).includes(modelId)) provider.catalogModelIds = [...(provider.catalogModelIds || []), modelId];
      if (!provider.catalogModels?.some(row => row.modelId === modelId)) provider.catalogModels = [...(provider.catalogModels || []), { modelId, name, type: master?.type || type, ...(master ? { libraryId: master.id } : {}) }];
    }
    provider.supplierReviewModelIds = spec.models.map(row => row[0]);
    for (const [id, name] of spec.keys) if (!provider.apiKeys?.some(row => row.id === id)) provider.apiKeys = [...(provider.apiKeys || []), { id, name, maskedKey: `test••••••••${id.slice(-3).padStart(4, '0')}`, fingerprint: (Number(id.slice(-3)) + 1000).toString(16).padStart(64, '0'), status: 'enabled', createdAt: at }];
    if (!provider.defaultApiKeyId) provider.defaultApiKeyId = (merge ? source.providers.find(row => row.id === spec.id)?.apiKeys?.[0]?.id : '') || spec.keys[0]?.[0] || '';
    for (const [code, name, baseUrl, authMode, apiKeyId = ''] of spec.channels) {
      const id = `supplier-review-${code}`;
      if (state.endpoints.some(row => row.id === id)) continue;
      const endpoint = { id, endpointId: id, providerId: provider.id, channelCode: code, supplierChannel: true, name, protocol: 'OpenAI', baseUrl, authMode, apiKeyId, credentialVersion: 'supplier-review-1', apiKeys: [], credentialRef: '', timeoutSeconds: 60, capacity: null, modelIds: [], status: '草稿', createdAt: at, updatedAt: at };
      if (connectionCredentialsReady(endpoint, provider)) { endpoint.status = '运行中'; endpoint.connectionTest = { result: '通过', testedAt: at, fingerprint: connectionFingerprint(endpoint) }; }
      state.endpoints.push(endpoint);
    }
    for (const [modelIndex, channelIndex, upstreamModelId, scenarios] of spec.links) {
      const modelId = spec.models[modelIndex][0], endpointId = `supplier-review-${spec.channels[channelIndex][0]}`, id = `supplier-review-link-${spec.code}-${modelIndex}-${channelIndex}`;
      if ((provider.removedCatalogModelIds || []).includes(modelId) || provider.catalogConnections?.some(row => row.id === id || row.modelId === modelId && row.endpointId === endpointId)) continue;
      const endpoint = state.endpoints.find(row => row.id === endpointId);
      const row = { id, modelId, endpointId, upstreamModelId, name: endpoint.name, origin: 'undisclosed', pricing: normalizeCataloguePrice({ modelId, scenarios }), enabled: endpoint.status === '运行中', health: null, createdAt: at, updatedAt: at };
      if (row.enabled) row.health = { result: '通过', testedAt: at, fingerprint: channelFingerprint({ ...row, endpoint }) };
      provider.catalogConnections = [...(provider.catalogConnections || []), row];
    }
  }
  state.supplierReviewVersion = 1;
  return state;
}
