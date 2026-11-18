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

const qwenDocs = 'https://help.aliyun.com/zh/model-studio/text-generation-model';
const bailianChatDocs = 'https://help.aliyun.com/zh/model-studio/qwen-api-via-openai-chat-completions';
const bailianDeepSeek = { author: 'DeepSeek', documentation: 'https://help.aliyun.com/zh/model-studio/deepseek-api', tools: true };
const arkDeepSeek = { author: 'DeepSeek', tools: true };
const glmCatalogue = 'https://docs.bigmodel.cn/cn/guide/start/model-overview';
const glmFlash = { documentation: 'https://docs.bigmodel.cn/cn/guide/models/vlm/glm-5.3-flash', tools: true };
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
  provider('bailian', '阿里云百炼', '阿里云', 'https://dashscope.aliyuncs.com/compatible-mode/v1',
    'https://help.aliyun.com/zh/model-studio/compatibility-of-openai-with-dashscope',
    qwenDocs, [
      chat('qwen3.8-max', 'Qwen3.8-Max', visual, 131072, { tools: true }),
      chat('qwen3.8-flash', 'Qwen3.8-Flash', visual, 131072, { tools: true }),
      chat('qwen3.7-plus', 'Qwen3.7-Plus', visual, 131072, { tools: true }),
      chat('qwen3.7-max', 'Qwen3.7-Max', visual, null),
      chat('qwen3.7-flash', 'Qwen3.7-Flash', visual, 65536, { tools: true }),
      chat('qwen3.6-plus', 'Qwen3.6-Plus', visual, 65536),
      chat('qwen3.6-flash', 'Qwen3.6-Flash', visual, 65536),
      chat('qwen3.6-35b-a3b', 'Qwen3.6-35B-A3B', visual, 65536, { context: 262144 }),
      chat('qwen3.5-plus', 'Qwen3.5-Plus', visual, 65536),
      chat('qwen3.5-flash', 'Qwen3.5-Flash', visual, 65536),
      chat('qwen3-coder-flash', 'Qwen3-Coder-Flash', [], null),
      chat('deepseek-v4.1-flash-1017', 'DeepSeek-V4.1-Flash-1017', ['图片'], 393216, bailianDeepSeek),
      chat('deepseek-v4.1-flash', 'DeepSeek-V4.1-Flash', ['图片'], 393216, bailianDeepSeek),
      chat('deepseek-v4-pro-0813', 'DeepSeek-V4-Pro-0813', [], 393216, bailianDeepSeek),
      chat('deepseek-v4-pro', 'DeepSeek-V4-Pro', [], 393216, bailianDeepSeek),
      chat('deepseek-v4-flash-0731', 'DeepSeek-V4-Flash-0731', [], 393216, bailianDeepSeek),
      chat('glm-5.3', 'GLM-5.3', [], 131072, { author: '智谱 AI' }),
      chat('ZHIPU/GLM-5.3', 'GLM-5.3（智谱直供）', [], 131072, { author: '智谱 AI', modelId: 'glm-5.3', documentation: 'https://help.aliyun.com/zh/model-studio/glm-5-3-by-zhipu' }),
      chat('kimi-k3.1-pro', 'Kimi K3.1 Pro', visual, null, { author: '月之暗面', documentation: bailianChatDocs }),
      chat('kimi-k3', 'Kimi K3', visual, null, { author: '月之暗面', documentation: bailianChatDocs }),
      chat('kimi/kimi-k3.1-pro', 'Kimi K3.1 Pro（月之暗面直供）', visual, null, { author: '月之暗面', modelId: 'kimi-k3.1-pro', documentation: bailianChatDocs }),
      chat('kimi/kimi-k3.1-pro-highspeed', 'Kimi K3.1 Pro Highspeed（月之暗面直供）', visual, null, { author: '月之暗面', modelId: 'kimi-k3.1-pro-highspeed', documentation: bailianChatDocs }),
      chat('kimi/kimi-k3', 'Kimi K3（月之暗面直供）', visual, null, { author: '月之暗面', modelId: 'kimi-k3', documentation: bailianChatDocs }),
      chat('MiniMax-M3.1-Flash', 'MiniMax-M3.1-Flash', visual, null, { author: 'MiniMax', context: null }),
      chat('MiniMax/MiniMax-M3.1-Flash', 'MiniMax-M3.1-Flash（MiniMax 直供）', visual, null, { author: 'MiniMax', modelId: 'minimax-m3.1-flash', context: null, documentation: bailianChatDocs }),
    ], { addressHint: '默认使用北京地域共享地址。若使用业务空间专属地址，请填写控制台中的地址，并使用对应地域的 API Key。' }),
  provider('volcengine', '火山方舟', '字节跳动', 'https://ark.cn-beijing.volces.com/api/v3',
    'https://docs.volcengine.com/docs/ark/base-url-and-authentication?lang=zh',
    'https://docs.volcengine.com/docs/ark/model-list?lang=zh', [
      chat('doubao-seed-2-1-pro-260915', 'Doubao Seed 2.1 Pro', visual, 262144, { tools: true }),
      chat('doubao-seed-2-1-lite-260915', 'Doubao Seed 2.1 Lite', [...visual, '音频'], 262144, { tools: true }),
      chat('doubao-seed-evolving', 'Doubao Seed Evolving', visual, 262144),
      chat('doubao-seed-2-1-turbo-260628', 'Doubao Seed 2.1 Turbo', visual, 262144, { context: 262144 }),
      chat('doubao-seed-2-1-pro-260628', 'Doubao Seed 2.1 Pro（260628）', visual, 262144, { context: 262144 }),
      chat('doubao-seed-2-0-lite-260428', 'Doubao Seed 2.0 Lite（LTS）', [...visual, '音频'], 131072, { context: 262144 }),
      chat('doubao-seed-2-0-mini-260428', 'Doubao Seed 2.0 Mini（LTS）', [...visual, '音频'], 131072, { context: 262144 }),
      chat('doubao-seed-character-260628', 'Doubao Seed Character（260628）', ['图片'], 32768, { context: 131072 }),
      chat('doubao-seed-character-251128', 'Doubao Seed Character（251128）', [], 32768, { context: 131072 }),
      chat('doubao-seed-translation-250915', 'Doubao Seed Translation', [], 3072, { context: 4096 }),
      chat('glm-5-3-flash-260828', 'GLM-5.3-Flash', visual, 131072, { modelId: 'glm-5.3-flash', author: '智谱 AI' }),
      chat('glm-5-2-260617', 'GLM-5.2', [], 131072, { modelId: 'glm-5.2', author: '智谱 AI' }),
      chat('kimi-k3-1-pro-261024', 'Kimi K3.1 Pro', visual, 1048576, { modelId: 'kimi-k3.1-pro', author: '月之暗面' }),
      chat('deepseek-v4-1-flash-261017', 'DeepSeek-V4.1-Flash-1017', ['图片'], 393216, { ...arkDeepSeek, modelId: 'deepseek-v4.1-flash-1017' }),
      chat('deepseek-v4-1-flash-economy-261017', 'DeepSeek-V4.1-Flash-1017 经济版', ['图片'], 393216, { ...arkDeepSeek, modelId: 'deepseek-v4.1-flash-1017' }),
      chat('deepseek-v4-1-flash-260910', 'DeepSeek-V4.1-Flash（260910）', ['图片'], 393216, arkDeepSeek),
      chat('deepseek-v4-pro-ga-260813', 'DeepSeek-V4-Pro-0813', [], 393216, { ...arkDeepSeek, modelId: 'deepseek-v4-pro-0813' }),
      chat('deepseek-v4-flash-ga-260731', 'DeepSeek-V4-Flash-0731', [], 393216, { ...arkDeepSeek, modelId: 'deepseek-v4-flash-0731' }),
    ], { existingProvider: ['provider-ark-official', 'ark-official'], modelHint: '如使用自建推理接入点，请填写方舟控制台中的 Endpoint ID。' }),
  provider('zhipu', '智谱开放平台', '智谱 AI', 'https://open.bigmodel.cn/api/paas/v4',
    'https://docs.bigmodel.cn/cn/guide/models/text/glm-5.3',
    glmCatalogue, [
      chat('glm-5.3', 'GLM-5.3', [], 131072, { documentation: 'https://docs.bigmodel.cn/cn/guide/models/text/glm-5.3', tools: true }),
      chat('glm-5.3-flash', 'GLM-5.3-Flash', [...visual, '文件'], 131072, glmFlash),
      chat('glm-5.3-flashx', 'GLM-5.3-FlashX', [...visual, '文件'], 131072, glmFlash),
      chat('glm-5.3-flashx-legal', 'GLM-5.3-FlashX-Legal', [], 131072, { documentation: 'https://docs.bigmodel.cn/cn/guide/models/vlm/glm-5.3-flash#glm-5-3-flashx-legal' }),
      chat('glm-5.2', 'GLM-5.2', [], 131072),
      ...['GLM-5.1', 'GLM-5', 'GLM-5-Turbo', 'GLM-4.7', 'GLM-4.7-Flash', 'GLM-4.7-FlashX', 'GLM-4.6'].map(name => chat(name.toLowerCase(), name, [], 131072, { context: 204800 })),
      ...['GLM-4.5-Air', 'GLM-4.5-AirX', 'GLM-4.5-Flash'].map(name => chat(name.toLowerCase(), name, [], 98304, { context: 131072 })),
      ...['GLM-4-Flash-250414', 'GLM-4-FlashX-250414'].map(name => chat(name.toLowerCase(), name, [], 16384, { context: 131072 })),
      chat('glm-4-long', 'GLM-4-Long', [], 4096),
      chat('glm-5v-turbo', 'GLM-5V-Turbo', visual, 131072, { context: 204800 }),
      chat('glm-4.6v', 'GLM-4.6V', visual, 32768, { context: 131072 }),
      chat('glm-4.6v-flash', 'GLM-4.6V-Flash', visual, 32768, { context: 131072 }),
      chat('glm-4.6v-flashx', 'GLM-4.6V-FlashX', visual, null, { context: null }),
      ...['GLM-4.1V-Thinking-Flash', 'GLM-4.1V-Thinking-FlashX'].map(name => chat(name.toLowerCase(), name, ['图片'], 16384, { context: 65536 })),
      chat('glm-4v-flash', 'GLM-4V-Flash', ['图片'], 1024, { context: 16384 }),
      chat('autoglm-phone', 'AutoGLM-Phone', ['图片'], 2048, { context: 20480 }),
    ], { existingProvider: ['provider-zhipu-direct', 'zhipu-direct'] }),
  provider('deepseek', 'DeepSeek', 'DeepSeek', 'https://api.deepseek.com',
    'https://api-docs.deepseek.com/zh-cn/', 'https://api-docs.deepseek.com/zh-cn/quick_start/pricing/', [
      chat('deepseek-v4-pro', 'DeepSeek-V4-Pro-0813', [], 393216, { tools: true }),
      chat('deepseek-flash', 'DeepSeek-V4.1-Flash-1017', ['图片'], 393216, { tools: true }),
    ], { existingProvider: ['provider-deepseek-official', 'deepseek-official'] }),
  provider('moonshot', '月之暗面 Kimi API 开放平台', '月之暗面', 'https://api.moonshot.cn/v1',
    'https://platform.kimi.com/docs/get-api-key', 'https://platform.kimi.com/docs/guide/kimi-k3-1-pro-quickstart', [
      chat('kimi-k3.1-pro', 'Kimi K3.1 Pro', visual, 1048576, { tools: true }),
      chat('kimi-k3.1-pro-highspeed', 'Kimi K3.1 Pro Highspeed', visual, 1048576, { tools: true }),
      chat('kimi-k3', 'Kimi K3', visual, 1048576, { tools: true, documentation: 'https://platform.kimi.com/docs/guide/kimi-k3-quickstart' }),
    ], { existingProvider: ['provider-kimi-official', 'kimi-official'] }),
  provider('minimax', 'MiniMax 开放平台', 'MiniMax', 'https://api.minimax.cn/v1',
    'https://platform.minimax.cn/docs/api-reference/text-openai-api', 'https://platform.minimax.cn/docs/api-reference/text-openai-api', [
      chat('MiniMax-M3.1-Flash', 'MiniMax-M3.1-Flash', visual, null, { context: 1000000, tools: true }),
      chat('MiniMax-M3', 'MiniMax-M3', visual, null, { context: 1000000, tools: true }),
    ]),
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
