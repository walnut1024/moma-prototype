import { MOMA_PROVIDER } from './moma-provider.js';
import momaReferences from '../data/moma-channel-references.json' with { type: 'json' };

const checkedAt = '2026-11-12';

function provider(code, name, maker, baseUrl, catalogueSource, docs, models, options = {}) {
  return {
    code, name, sourceType: 'thirdParty', baseUrl, catalogueSource, catalogueCheckedAt: checkedAt, ...options,
    catalogModelIds: models.map(model => model.upstreamModelId),
    models: models.map(({ upstreamModelId, name, inputModalities, context, output, documentation, modelId, author, tools, listedAt, baseUrl: modelBaseUrl = baseUrl }) => ({
      id: `official-${code}-${upstreamModelId.toLowerCase()}`,
      upstreamModelId, modelId: modelId || upstreamModelId.toLowerCase(), name, maker: author || maker, baseUrl: modelBaseUrl,
      type: inputModalities.length > 1 ? 'multimodal' : 'text',
      sourceCheckedAt: checkedAt,
      ...(listedAt ? { listedAt } : {}),
      profile: { inputModalities, outputModalities: ['文本'], documentation: documentation || docs },
      capabilities: { context, output, streaming: true, tools },
    })),
  };
}

const chat = (upstreamModelId, name, inputModalities, output, options = {}) => ({
  upstreamModelId, name, inputModalities: ['文本', ...inputModalities], context: 1048576, output, tools: null, ...options,
});

const visual = ['图片', '视频'];
const momaSquare = 'https://ecloud.10086.cn/api/page/maas/moma/modelSquare/';
const momaHohhot = 'https://zhenze-huhehaote.cmecloud.cn/v1';
const momaDocumentation = name => `${momaSquare}modelSquareDetails?modelName=${encodeURIComponent(name)}`;
const momaChat = (listedAt, id, name, author, input, baseUrl) => chat(id, name, input, null, {
  author, baseUrl, listedAt, context: null, modelId: id.split('/').at(-1),
  documentation: momaDocumentation(name),
});

// Published China-region Chat Completions configurations. Account-specific settings are entered when creating a channel.
export const OFFICIAL_CHANNEL_PRESETS = [
  provider(MOMA_PROVIDER.code, MOMA_PROVIDER.name, '中国移动', MOMA_PROVIDER.baseUrl,
    `${momaSquare}modelSquareList`, null, [
      momaChat('2026-10-27', 'kimi/kimi-k3.1-pro', 'Kimi-k3.1-pro', '月之暗面', visual),
      momaChat('2026-10-24', 'deepseek-v4.1-flash-1017', 'DeepSeek-V4.1-Flash-1017', 'DeepSeek', ['图片'], 'https://vip.moma.cmecloud.cn/v1'),
      momaChat('2026-10-20', 'minimax/minimax-m3.1-flash', 'MiniMax-M3.1-Flash', 'MiniMax', visual),
      momaChat('2026-09-12', 'deepseek-v4.1-flash', 'DeepSeek-V4.1-Flash', 'DeepSeek', ['图片'], momaHohhot),
      momaChat('2026-09-09', 'glm-5.3', 'GLM-5.3', '智谱 AI', [], momaHohhot),
      momaChat('2026-08-07', 'deepseek-v4-flash-0731', 'DeepSeek-V4-Flash-0731', 'DeepSeek', [], momaHohhot),
      momaChat('2026-07-17', 'kimi/kimi-k3', 'Kimi-K3', '月之暗面', visual),
      momaChat('2026-07-16', 'glm-5.2', 'GLM-5.2', '智谱 AI', [], momaHohhot),
      momaChat('2026-07-03', 'qwen/qwen3.7-plus', 'Qwen3.7-Plus', '阿里云', ['图片']),
      momaChat('2026-06-24', 'kimi/kimi-k2.7-code', 'Kimi-K2.7-Code', '月之暗面', []),
      momaChat('2026-06-04', 'qwen/qwen3.7-max', 'Qwen3.7-Max', '阿里云', []),
      momaChat('2026-06-01', 'minimax/minimax-m3', 'MiniMax-M3', 'MiniMax', ['图片']),
    ]),
  provider('deepseek', 'DeepSeek', 'DeepSeek', 'https://api.deepseek.com',
    'https://api-docs.deepseek.com/zh-cn/', 'https://api-docs.deepseek.com/zh-cn/quick_start/pricing/', [
      chat('deepseek-v4-pro', 'DeepSeek-V4-Pro-0813', [], 393216, { tools: true }),
      chat('deepseek-flash', 'DeepSeek-V4.1-Flash-1017', ['图片'], 393216, { tools: true }),
    ], { existingProvider: ['provider-deepseek-official', 'deepseek-official'] }),
];

export const MOMA_BUILTIN_MODELS = [
  ...OFFICIAL_CHANNEL_PRESETS.find(row => row.code === MOMA_PROVIDER.code).models,
  ...momaReferences.map(row => ({
    ...row,
    id: `official-${MOMA_PROVIDER.code}-${(row.upstreamModelId || row.modelId).toLowerCase()}`,
    sourceCheckedAt: '2026-11-13',
    profile: { documentation: momaDocumentation(row.name) },
  })),
].sort((a, b) => b.listedAt.localeCompare(a.listedAt));
