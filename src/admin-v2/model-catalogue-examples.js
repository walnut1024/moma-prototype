// Editable local examples. IDs, suppliers and prices illustrate catalogue design, not vendor offers.
export function addCatalogueExamples({ models, providers, endpoints, modelSupplies, modelSalePrices, at }) {
  const vendors = [['alibaba', '阿里云百炼'], ['huawei', '华为云 MaaS'], ['tencent', '腾讯云'], ['openrouter', 'OpenRouter'], ['mobile', '中国移动'], ['unicom', '中国联通'], ['telecom', '中国电信']];
  vendors.forEach(([key, name]) => providers.push({ id: `catalog-provider-${key}`, name, sourceType: 'thirdParty', status: '已启用', contact: '供应商服务团队', createdAt: at, updatedAt: at }));
  const examples = [
    { key: 'kimi', name: 'Kimi K3', maker: '月之暗面', type: 'multimodal', aliases: [['openrouter', 'moonshotai/kimi-k3'], ['huawei', 'Kimi/k3']], unit: '元/百万 Token', input: 2, output: 8, cached: 0.5, cacheWrite: 2.5, context: 131072, tools: true },
    { key: 'qwen', name: 'Qwen3 Max', maker: '通义千问', type: 'text', aliases: [['alibaba', 'qwen3-max'], ['openrouter', 'qwen/qwen3-max']], unit: '元/百万 Token', input: 2.4, output: 12, cached: 0.6, context: 262144, tools: true },
    { key: 'image', name: 'Qwen Image', maker: '通义千问', type: 'image', aliases: [['alibaba', 'qwen-image'], ['tencent', 'Qwen/qwen-image']], unit: '元/张', input: 0.2 },
    { key: 'video', name: 'Wan Video', maker: '通义万相', type: 'video', aliases: [['alibaba', 'wan-video'], ['tencent', 'Wan/video']], unit: '元/秒', input: 0.6 },
    { key: 'tts', name: 'Qwen TTS', maker: '通义千问', type: 'audio', usageUnit: '字符', aliases: [['alibaba', 'qwen-tts'], ['huawei', 'Qwen/tts']], unit: '元/万字符', input: 1.2 },
    { key: 'asr', name: 'SenseVoice ASR', maker: '通义实验室', type: 'audio', usageUnit: '分钟', aliases: [['alibaba', 'sensevoice-v1'], ['huawei', 'SenseVoice/asr']], unit: '元/分钟', input: 0.04 },
    { key: 'embedding', name: 'BGE M3', maker: 'BAAI', type: 'embedding', aliases: [['huawei', 'BAAI/bge-m3'], ['openrouter', 'baai/bge-m3']], unit: '元/百万 Token', input: 0.3, context: 8192 },
    { key: 'rerank', name: 'BGE Reranker', maker: 'BAAI', type: 'rerank', aliases: [['huawei', 'BAAI/bge-reranker-v2-m3'], ['tencent', 'bge-reranker-v2-m3']], unit: '元/千次', input: 0.8, context: 8192 },
  ];
  examples.forEach((sample, index) => {
    const id = `catalog-demo-${sample.key}`, capabilities = { streaming: ['text', 'multimodal', 'audio'].includes(sample.type), tools: Boolean(sample.tools), context: sample.context || null, output: ['text', 'multimodal'].includes(sample.type) ? 8192 : null };
    const createdAt = new Date(Date.parse(at) + examples.length - index).toISOString();
    models.push({ id, modelId: `demo/${sample.key}`, name: sample.name, maker: sample.maker, type: sample.type, usageUnit: sample.usageUnit, description: `${sample.name} 支持多供应商接入，各供应服务独立配置价格。`, capabilities, listingStatus: '已上架', visibility: '公开', status: '运行中', callsEnabled: true, openScope: 'all', tenantIds: [], defaultVersionId: `version-${id}`, createdAt, updatedAt: at });
    const quote = { id: `sale-${id}-v1`, modelId: id, version: 1, inputPrice: Math.round(sample.input * 1000000), outputPrice: sample.output == null ? null : Math.round(sample.output * 1000000), cachedPrice: sample.cached == null ? null : Math.round(sample.cached * 1000000), cacheWritePrice: sample.cacheWrite == null ? null : Math.round(sample.cacheWrite * 1000000), unit: sample.unit, effectiveAt: at, status: '已发布', createdAt: at, updatedAt: at };
    modelSalePrices.push(quote);
    const carrierAliases = ['mobile', 'unicom', 'telecom'].map(vendor => [vendor, `${vendor}/${sample.aliases[0][1].split('/').at(-1)}`]);
    [...sample.aliases, ...carrierAliases.slice(index % 3), ...carrierAliases.slice(0, index % 3)].forEach(([vendor, upstreamModelId], i) => {
      const endpointId = `catalog-endpoint-${sample.key}-${vendor}`, supplyId = `catalog-supply-${sample.key}-${vendor}`;
      endpoints.push({ id: endpointId, endpointId, providerId: `catalog-provider-${vendor}`, name: `${sample.name} 接入点`, protocol: 'OpenAI', baseUrl: `https://${vendor}.demo.invalid/v1`, credentialRef: 'mock-catalogue-credential', modelIds: [id], status: '运行中', createdAt: at, updatedAt: at });
      modelSupplies.push({ id: supplyId, modelId: id, endpointId, upstreamModelId, capabilities: { ...capabilities }, status: '已启用', validationStatus: '通过', validationCases: [{ name: '接入验证', passed: true }], verifiedAt: at, createdAt: at, updatedAt: at });
      if (i === 1) modelSalePrices.push({ ...quote, id: `sale-${id}-v2`, supplyId, version: 2, inputPrice: Math.round(quote.inputPrice * 1.25), outputPrice: quote.outputPrice == null ? null : Math.round(quote.outputPrice * 1.25) });
    });
  });
}
