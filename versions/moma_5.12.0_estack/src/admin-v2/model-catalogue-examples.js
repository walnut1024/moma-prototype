// Verified model identities; suppliers, mapping availability and prices remain local fixtures.
import { catalogueMetadata } from './real-model-catalogue.js';
import { realProvider } from './real-provider-catalogue.js';
export function addCatalogueExamples({ models, providers, endpoints, modelSupplies, modelSalePrices, at }) {
  const vendors = ['alibaba', 'huawei', 'tencent', 'openrouter', 'mobile', 'unicom', 'telecom'];
  vendors.forEach(key => providers.push({ ...realProvider(`catalog-provider-${key}`), status: '已启用', contact: '', createdAt: at, updatedAt: at }));
  const examples = [
    { key: 'kimi', vendors: ['openrouter', 'huawei'], unit: '元/百万 Token', input: 2, output: 8, cached: 0.5, cacheWrite: 2.5 },
    { key: 'qwen', vendors: ['alibaba', 'openrouter'], unit: '元/百万 Token', input: 2.4, output: 12, cached: 0.6 },
    { key: 'image', vendors: ['alibaba', 'tencent'], unit: '元/张', input: 0.2 },
    { key: 'video', vendors: ['alibaba', 'tencent'], unit: '元/秒', input: 0.6 },
    { key: 'tts', vendors: ['alibaba', 'huawei'], unit: '元/万字符', input: 1.2 },
    { key: 'asr', vendors: ['alibaba', 'huawei'], unit: '元/分钟', input: 0.04 },
    { key: 'embedding', vendors: ['huawei', 'openrouter'], unit: '元/百万 Token', input: 0.3 },
    { key: 'rerank', vendors: ['huawei', 'tencent'], unit: '元/千次', input: 0.8 },
  ];
  examples.forEach((sample, index) => {
    const id = `catalog-demo-${sample.key}`, details = catalogueMetadata(id), capabilities = details.capabilities;
    const createdAt = new Date(Date.parse(at) + examples.length - index).toISOString();
    models.push({ ...details, listingStatus: '已上架', visibility: '公开', status: '运行中', callsEnabled: true, openScope: 'all', tenantIds: [], defaultVersionId: `version-${id}`, createdAt, updatedAt: at });
    const quote = { id: `sale-${id}-v1`, modelId: id, version: 1, inputPrice: Math.round(sample.input * 1000000), outputPrice: sample.output == null ? null : Math.round(sample.output * 1000000), cachedPrice: sample.cached == null ? null : Math.round(sample.cached * 1000000), cacheWritePrice: sample.cacheWrite == null ? null : Math.round(sample.cacheWrite * 1000000), unit: sample.unit, effectiveAt: at, status: '已发布', createdAt: at, updatedAt: at };
    modelSalePrices.push(quote);
    const aliases = sample.vendors.map(vendor => [vendor, details.modelId]);
    const carrierAliases = ['mobile', 'unicom', 'telecom'].map(vendor => [vendor, details.modelId]);
    [...aliases, ...carrierAliases.slice(index % 3), ...carrierAliases.slice(0, index % 3)].forEach(([vendor, upstreamModelId], i) => {
      const endpointId = `catalog-endpoint-${sample.key}-${vendor}`, supplyId = `catalog-supply-${sample.key}-${vendor}`;
      endpoints.push({ id: endpointId, endpointId, providerId: `catalog-provider-${vendor}`, name: `${realProvider(`catalog-provider-${vendor}`).name} 接入`, protocol: 'OpenAI', baseUrl: realProvider(`catalog-provider-${vendor}`).baseUrl, credentialRef: 'mock-catalogue-credential', modelIds: [id], status: '运行中', createdAt: at, updatedAt: at });
      modelSupplies.push({ id: supplyId, modelId: id, endpointId, upstreamModelId, capabilities: { ...capabilities }, status: '已启用', validationStatus: '通过', validationCases: [{ name: '接入验证', passed: true }], verifiedAt: at, createdAt: at, updatedAt: at });
      if (i === 1) modelSalePrices.push({ ...quote, id: `sale-${id}-v2`, supplyId, version: 2, inputPrice: Math.round(quote.inputPrice * 1.25), outputPrice: quote.outputPrice == null ? null : Math.round(quote.outputPrice * 1.25) });
    });
  });
}
