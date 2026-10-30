import { normalizeCataloguePrice } from './provider-catalogue-pricing.js';

const checkedAt = '2026-10-25';
const deepseekSource = 'https://api-docs.deepseek.com/quick_start/pricing/';
const kimiSource = 'https://platform.kimi.com/docs/guide/kimi-k3-quickstart';
const arkPriceSource = 'https://docs.volcengine.com/docs/ark/model-pricing?lang=en&redirect=1';
const row = (name, price = null, condition = '', currency = 'CNY', unit = '百万 Token') => ({ name, listPrice: price, condition, currency, unit });
const kimiPrices = currency => [row('缓存写入 Token（5 分钟）', null, '', currency), row('缓存写入 Token（1 小时）', null, '', currency), row('缓存读取 Token', null, '', currency), row('输入 Token', null, '缓存未命中', currency), row('输出 Token', null, '', currency)];

// Official product facts are separate from account credentials and actual service availability.
export const OFFICIAL_SUPPLY_CATALOGUE = [
  { id: 'provider-kimi-official', name: '月之暗面 Kimi', code: 'kimi-official', models: [
    { modelId: 'kimi-k3', name: 'Kimi K3', type: 'multimodal', source: kimiSource, channels: [
      { key: 'cn', name: '国内服务', source: kimiSource, addresses: [{ protocol: 'OpenAI', baseUrl: 'https://api.moonshot.cn/v1/chat/completions' }], scenarios: kimiPrices('CNY') },
      { key: 'global', name: '国际服务', source: 'https://platform.kimi.ai/docs/guide/kimi-k3-quickstart', addresses: [{ protocol: 'OpenAI', baseUrl: 'https://api.moonshot.ai/v1/chat/completions' }], scenarios: kimiPrices('USD') },
    ] },
  ] },
  { id: 'provider-deepseek-official', name: 'DeepSeek 官方', code: 'deepseek-official', models: [
    { modelId: 'deepseek-v4-pro', name: 'DeepSeek V4 Pro', type: 'text', source: deepseekSource, channels: [
      { key: 'official', name: '官方服务', source: deepseekSource, addresses: [{ protocol: 'OpenAI', baseUrl: 'https://api.deepseek.com/chat/completions' }, { protocol: 'Anthropic', baseUrl: 'https://api.deepseek.com/anthropic/v1/messages' }], scenarios: [
        row('缓存读取 Token', '0.022', '空闲时段', 'USD'), row('输入 Token', '0.66', '空闲时段；缓存未命中', 'USD'), row('输出 Token', '1.98', '空闲时段', 'USD'),
        row('缓存读取 Token', '0.044', '高峰时段', 'USD'), row('输入 Token', '1.32', '高峰时段；缓存未命中', 'USD'), row('输出 Token', '3.96', '高峰时段', 'USD'),
      ], note: '高峰：工作日北京时间 09:00–12:00、14:00–18:00，中国法定节假日除外；其余为空闲时段。' },
    ] },
  ] },
  { id: 'provider-ark-official', name: '火山方舟', code: 'ark-official', models: [
    { modelId: 'doubao-seedance-2-0-260128', name: 'Seedance 2.0', type: 'video', source: 'https://docs.volcengine.com/docs/ark/create-video-generation-task-api?lang=zh', channels: [
      { key: 'official', name: '北京服务', source: arkPriceSource, addresses: [{ protocol: '其他', baseUrl: 'https://ark.cn-beijing.volces.com/api/v3/contents/generations/tasks' }], scenarios: [row('Token 用量', null, '输出视频 480p/720p；输入不含视频'), row('Token 用量', null, '输出视频 480p/720p；输入含视频'), row('Token 用量', null, '输出视频 1080p；输入不含视频'), row('Token 用量', null, '输出视频 1080p；输入含视频')], note: '按视频生成 Token 计费，不将视频秒数估算价作为刊例价。金额待核实。' },
    ] },
    { modelId: 'doubao-seedream-5-0-flash-260915', name: 'Seedream 5.0 Flash', type: 'image', source: 'https://docs.volcengine.com/docs/ark/model-release-announcement?lang=zh', channels: [
      { key: 'official', name: '北京服务', source: arkPriceSource, addresses: [{ protocol: '其他', baseUrl: 'https://ark.cn-beijing.volces.com/api/v3/images/generations' }], scenarios: [row('图像输入（按张）', '0', '', 'CNY', '张'), row('图像输出（按张）', '0.12', '成功输出图片', 'CNY', '张')] },
    ] },
  ] },
];

export function officialSupplyRecords() {
  const providers = [], endpoints = [];
  for (const supplier of OFFICIAL_SUPPLY_CATALOGUE) {
    const catalogConnections = [], catalogModels = [], catalogPricing = [];
    for (const model of supplier.models) {
      catalogModels.push({ modelId: model.modelId, name: model.name, type: model.type, source: model.source, checkedAt });
      for (const channel of model.channels) {
        const id = `official-${supplier.code}-${model.modelId}-${channel.key}`, endpointId = `endpoint-${id}`;
        const pricing = normalizeCataloguePrice({ modelId: model.modelId, scenarios: channel.scenarios });
        endpoints.push({ id: endpointId, endpointId, providerId: supplier.id, name: `${model.name} ${channel.name}`, ...channel.addresses[0], apiKeys: [], credentialRef: '', capacity: null, timeoutSeconds: 60, modelIds: [], status: '草稿', connectionTest: null });
        catalogConnections.push({ id, modelId: model.modelId, name: channel.name, origin: 'direct', upstreamProvider: '', upstreamModelId: model.modelId, endpointId, apiAddresses: channel.addresses, pricing, source: channel.source, sourceNote: channel.note || (channel.scenarios.some(item => item.listPrice == null) ? '官方文档已确认计费项，金额待核实。' : ''), checkedAt, enabled: false, health: null });
        if (!catalogPricing.some(item => item.modelId === model.modelId)) catalogPricing.push(pricing);
      }
    }
    providers.push({ id: supplier.id, name: supplier.name, code: supplier.code, sourceType: 'thirdParty', status: '已启用', contact: '', contactInfo: '', description: '', catalogModelIds: supplier.models.map(model => model.modelId), catalogModels, catalogPricing, catalogConnections });
  }
  return { providers, endpoints };
}

export function officialCatalogueTransaction(state) {
  const records = officialSupplyRecords(), changes = [];
  for (const collection of ['providers', 'endpoints']) for (const record of records[collection]) {
    if (!state[collection].some(item => item.id === record.id)) changes.push({ type: 'add', collection, record });
  }
  return { type: 'batch', label: '载入官方模型目录', objectId: 'official-supply-catalogue', changes };
}
