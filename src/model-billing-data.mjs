export const usageModels = {
  文本模型: ['DeepSeek-V4-Pro', 'DeepSeek-V4-Flash', 'DeepSeek-V4-Flash-0731', 'Qwen3.7-Max', 'Qwen3-32B', 'Qwen3.5-27B', 'Qwen3.5-9B', 'Qwen3.5-35B-A3B', 'Qwen3.5-397B-A17B', 'GLM-5.1', 'GLM-5.2', 'Kimi-K2.6', 'Kimi-K2.7-Code', 'Kimi-K3', 'MiniMax-M3', 'qwen3-max', 'qwen3.5-flash', 'qwen3.5-plus', 'qwen3.6-flash', 'qwen3.6-plus', 'qwen3.7-plus'],
  视觉理解: ['Qwen-VL', 'GLM-VL'],
  多模态模型: ['Qwen-Omni', 'GLM-Omni'],
  图片生成: ['Qwen-Image', 'Seedream', 'HY-Image'],
  视频生成: ['MiniMax-H3', 'Wan3.0-Video', 'Seedance-2.0'],
  语音合成: ['Qwen-Audio-TTS'],
  语音识别: ['Qwen-Audio-ASR-Flash'],
  向量模型: ['BGE-M3'],
  重排模型: ['BGE-Reranker-V2-M3'],
};
const tier32 = ['0＜输入长度≤32K', '32K＜输入长度≤128K', '128K＜输入长度≤252K'];
const tier128 = ['0＜输入长度≤128K', '128K＜输入长度≤256K'];
const tier256 = ['0＜输入长度≤256K', '256K＜输入长度≤1M'];
const tier1M = ['0＜输入长度≤128K', '128K＜输入长度≤256K', '256K＜输入长度≤1M'];
export const languageMetering = {
  'DeepSeek-V4-Pro': { cache: true },
  'DeepSeek-V4-Flash-0731': { cache: true },
  'Qwen3.7-Max': { cache: true, explicit: true },
  'Qwen3-32B': { modes: true },
  'Qwen3.5-35B-A3B': { tiers: tier128, modes: true },
  'Qwen3.5-397B-A17B': { tiers: tier128 },
  'GLM-5.1': { tiers: ['0＜输入长度≤32K', '32K＜输入长度≤200K'], cache: true },
  'GLM-5.2': { cache: true },
  'Kimi-K2.6': { cache: true, cachedInput: true },
  'Kimi-K2.7-Code': { cache: true, cachedInput: true },
  'Kimi-K3': { cache: true, cachedInput: true },
  'MiniMax-M3': { tiers: ['0＜输入长度≤512K', '512K＜输入长度≤1M'], cache: true },
  'qwen3-max': { tiers: tier32, cache: true, explicit: true, cachedInput: true },
  'qwen3.5-flash': { tiers: tier1M, explicit: true },
  'qwen3.5-plus': { tiers: tier1M, explicit: true },
  'qwen3.6-flash': { tiers: tier256, explicit: true },
  'qwen3.6-plus': { tiers: tier256, explicit: true },
  'qwen3.7-plus': { tiers: tier256, cache: true, explicit: true, cachedInput: true },
};

export const modelOrderRows = [
    [
      "AICC-doubao-seedance-2.0",
      "合营",
      "视觉模型",
      "火山引擎",
      "共 4 个资费场景",
      "56 ~ 102 元/百万tokens",
      "未订购",
      "—",
      "—",
    ],
    [
      "AITC-DeepSeek-V4-flash",
      "自营",
      "文本模型",
      "移动云",
      "AITC-DeepSeek-V4-flash-输入\nAITC-DeepSeek-V4-flash-输出",
      "2 元/百万tokens\n4 元/百万tokens",
      "使用中",
      "2026-09-14 21:21:42",
      "362天后到期\n2027-09-14 21:21:42",
    ],
    [
      "CosyVoice",
      "自营",
      "语音模型",
      "移动云",
      "处理字符数资费",
      "2 元/万字符",
      "使用中",
      "2026-09-14 21:21:47",
      "362天后到期\n2027-09-14 21:21:47",
    ],
    [
      "DeepSeek-R1,DeepSeek-R1-0528",
      "自营",
      "文本模型",
      "移动云",
      "输入tokens\n输出tokens",
      "4 元/百万tokens\n16 元/百万tokens",
      "使用中",
      "2026-09-14 21:21:36",
      "362天后到期\n2027-09-14 21:21:36",
    ],
    [
      "DeepSeek-R1-Distill-Llama-70B",
      "自营",
      "文本模型",
      "移动云",
      "输入/输出tokens",
      "4.13 元/百万tokens",
      "使用中",
      "2026-09-14 21:21:39",
      "362天后到期\n2027-09-14 21:21:39",
    ],
    [
      "DeepSeek-R1-Distill-Llama-8B",
      "自营",
      "文本模型",
      "移动云",
      "输入/输出tokens",
      "0.42 元/百万tokens",
      "使用中",
      "2026-09-14 21:21:31",
      "362天后到期\n2027-09-14 21:21:31",
    ],
    [
      "DeepSeek-R1-Distill-Qwen-14B",
      "自营",
      "文本模型",
      "移动云",
      "输入/输出tokens",
      "0.7 元/百万tokens",
      "使用中",
      "2026-09-14 21:21:35",
      "362天后到期\n2027-09-14 21:21:35",
    ],
    [
      "DeepSeek-R1-Distill-Qwen-32B",
      "自营",
      "文本模型",
      "移动云",
      "输入/输出tokens",
      "1.26 元/百万tokens",
      "使用中",
      "2026-09-14 21:21:34",
      "362天后到期\n2027-09-14 21:21:34",
    ],
    [
      "DeepSeek-V2-Lite-Chat",
      "自营",
      "文本模型",
      "移动云",
      "输入/输出tokens",
      "1.33 元/百万tokens",
      "使用中",
      "2026-09-14 21:21:35",
      "362天后到期\n2027-09-14 21:21:35",
    ],
    [
      "DeepSeek-V3.2,DeepSeek-V3,DeepSeek-V3.1",
      "自营",
      "文本模型",
      "移动云",
      "输入tokens\n输出tokens",
      "2 元/百万tokens\n8 元/百万tokens",
      "使用中",
      "2026-09-14 21:21:33",
      "362天后到期\n2027-09-14 21:21:33",
    ],
    [
      "deepseek-v3.2",
      "合营",
      "文本模型",
      "优刻得科技股份有限公司",
      "DeepSeek-V3.2-输入\nDeepSeek-V3.2-输出\nDeepSeek-V3.2-缓存",
      "2 元/百万tokens\n3 元/百万tokens\n0.4 元/百万tokens",
      "未订购",
      "—",
      "—",
    ],
    [
      "GLM-5.1",
      "合营",
      "文本模型",
      "智谱 AI",
      "共 6 个资费场景",
      "1.3 ~ 28 元/百万tokens",
      "未订购",
      "—",
      "—",
    ],
    [
      "GLM-5.3-Flash",
      "合营",
      "多模态模型",
      "智谱 AI",
      "共 3 个资费场景",
      "0.23 ~ 2.8 元/百万tokens",
      "未订购",
      "—",
      "—",
    ],
    [
      "Kimi-K2.6",
      "合营",
      "多模态模型",
      "月之暗面",
      "共 3 个资费场景",
      "1.1 ~ 27 元/百万tokens",
      "未订购",
      "—",
      "—",
    ],
  ];

// Existing prototype tariff/metering definitions; prices remain in the order rows.
export const modelBillingItems = Object.fromEntries([
  ...usageModels['文本模型'].map(id => [id, ['input', 'output', ...(languageMetering[id]?.cache || languageMetering[id]?.explicit ? ['cacheReadTotal'] : []), ...(languageMetering[id]?.explicit ? ['cacheCreate'] : [])]]),
  ...usageModels['视觉理解'].map(id => [id, ['input', 'output', 'cacheReadTotal', 'cacheCreate']]),
  ...usageModels['多模态模型'].map(id => [id, ['input', 'output']]),
  ...usageModels['图片生成'].map(id => [id, ['images']]),
  ...usageModels['视频生成'].map(id => [id, ['metered']]),
  ...usageModels['语音识别'].map(id => [id, ['audio']]),
  ...usageModels['语音合成'].map(id => [id, ['characters']]),
  ...usageModels['向量模型'].map(id => [id, ['input']]),
  ...usageModels['重排模型'].map(id => [id, ['input']]),
]);
for (const row of modelOrderRows) {
  for (const id of row[0].split(',')) {
    if (id === 'CosyVoice') modelBillingItems[id] = ['characters'];
    else if (id === 'deepseek-v3.2') { modelBillingItems[id] = ['input', 'output', 'cacheReadTotal']; languageMetering[id] = { cache: true }; }
    else if (row[2] === '文本模型' && !modelBillingItems[id]) modelBillingItems[id] = ['input', 'output'];
    // A scene count alone does not establish its metering dimensions.
  }
}
export const billingUsageModels = Object.fromEntries(Object.entries(usageModels).map(([type, ids]) => [type, [...ids]]));
for (const row of modelOrderRows) for (const id of row[0].split(',')) {
  if (Object.values(billingUsageModels).some(ids => ids.includes(id))) continue;
  const type = row[2] === '视觉模型' ? '视频生成' : row[2] === '语音模型' ? '语音合成' : row[2];
  billingUsageModels[type].push(id);
}
const billingLabels = { input: '输入 Token', output: '输出 Token', cacheReadTotal: '缓存命中 Token', cacheCreate: '缓存写入 Token', images: '生成图片张数', audio: '识别音频时长', characters: '合成字符数', metered: '计量 Token' };
export function orderBillingScene(row) {
  const items = modelBillingItems[row[0].split(',')[0]];
  if (!items) return row[4];
  return items.map(key => billingLabels[key]).join('\n');
}
