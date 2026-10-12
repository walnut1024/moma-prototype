// Official model metadata checked 2026-10-11. Supply, prices and checks remain local fixtures.
const bailian = 'https://help.aliyun.com/zh/model-studio/models';
const textDocs = 'https://help.aliyun.com/zh/model-studio/text-generation-model';
const visionDocs = 'https://help.aliyun.com/zh/model-studio/vision-model';
const imageDocs = 'https://help.aliyun.com/zh/model-studio/image-model';
const videoDocs = 'https://help.aliyun.com/zh/model-studio/video-generate-edit-model';
const ttsDocs = 'https://help.aliyun.com/zh/model-studio/tts-model';
const asrDocs = 'https://help.aliyun.com/zh/model-studio/asr-model';
const embeddingDocs = 'https://help.aliyun.com/zh/model-studio/embedding-rerank-model';
const kimiDocs = 'https://platform.kimi.ai/docs/models';
const deepseekDocs = 'https://api-docs.deepseek.com/quick_start/pricing/';
const glmDocs = version => `https://docs.bigmodel.cn/cn/guide/models/text/glm-${version}`;
const hf = name => `https://huggingface.co/${name}`;
const releases = 'https://help.aliyun.com/zh/model-studio/newly-released-models';
// First vendor release/service date for the exact model, never a third-party onboarding date.
export const MODEL_RELEASES = {
  'kimi-k3': { date: '2026-07-16', source: 'https://www.kimi.ai/zh-hant/help/agent/agent-overview' },
  'qwen3.8-max': { date: '2026-08-02', source: releases },
  'qwen-image-3.0-pro': { date: '2026-07-20', source: releases },
  'wan3.0-video': { date: '2026-08-06', source: releases },
  'qwen-audio-3.0-tts-flash': { date: '2026-07-14', source: releases },
  'bge-m3': { date: '2024-01-30', source: 'https://github.com/FlagOpen/FlagEmbedding' },
  'bge-reranker-v2-m3': { date: '2024-03-18', source: 'https://github.com/FlagOpen/FlagEmbedding' },
  'glm-5': { date: '2026-02-12', source: 'https://z.ai/blog/glm-5' },
  'glm-5.3': { date: '2026-08-14', source: 'https://z.ai/blog/glm-5.3' },
  'deepseek-flash': { date: '2026-09-10', source: 'https://api-docs.deepseek.com/updates/?release=deepseek-coder' },
  'qwen3.8-flash': { date: '2026-08-26', source: releases },
  'qwen3.8-omni-flash': { date: '2026-09-18', source: 'https://qwen.ai/blog?id=qwen3.8-omni-flash' },
  'qwen-image-2.1-pro': { date: '2026-10-02', source: releases },
  'qwen-image-2.1-turbo': { date: '2026-10-09', source: releases },
  'minimax-h3': { date: '2026-07-31', source: 'https://www.minimax.cn/blog/minimax-h3' },
  'qwen3.7-text-embedding': { date: '2026-07-15', source: releases },
  'qwen3.7-text-embedding-flash': { date: '2026-09-01', source: releases },
  'qwen3.7-text-rerank': { date: '2026-09-01', source: releases },
  'qwen-audio-3.0-asr-flash-filetrans': { date: '2026-07-30', source: releases },
  'qwen-audio-3.0-tts-plus': { date: '2026-07-14', source: releases },
};
export const RECENT_TEMPLATE_CODES = ['glm-5.3', 'deepseek-flash', 'qwen3.8-flash', 'qwen3.8-omni-flash', 'qwen-image-2.1-pro', 'qwen-image-2.1-turbo', 'minimax-h3', 'qwen3.7-text-embedding', 'qwen3.7-text-embedding-flash', 'qwen3.7-text-rerank', 'qwen-audio-3.0-asr-flash-filetrans', 'qwen-audio-3.0-tts-plus'];
const modalities = {
  text: [['文本'], ['文本'], [], ['对话', '文本生成', '代码生成']],
  multimodal: [['文本', '图片', '视频'], ['文本'], [], ['对话', '图像理解', '视频理解', '代码生成']],
  image: [['文本'], ['图片'], [], ['文生图']],
  video: [['文本'], ['视频'], [], ['文生视频']],
  audio: [['文本'], ['音频'], [], ['语音合成']],
  embedding: [['文本'], [], ['向量'], ['文本向量化']],
  rerank: [['文本'], [], ['相关性分数', '排序结果'], ['文档重排']],
};
function model(id, modelId, name, maker, type, description, source, extra = {}) {
  const [inputModalities, outputModalities, resultTypes, tasks] = modalities[type];
  return { id, modelId, name, maker, type, description, usageUnit: type === 'audio' ? '字符' : undefined,
    capabilities: { context: null, output: null, streaming: null, tools: null, ...extra.capabilities },
    profile: { author: maker, inputModalities, outputModalities, resultTypes, tasks, documentation: source, sourceUpdated: '2026-10-11', ...(MODEL_RELEASES[modelId] ? { releaseDate: MODEL_RELEASES[modelId].date } : {}), ...extra.profile },
    ...Object.fromEntries(Object.entries(extra).filter(([key]) => !['capabilities', 'profile'].includes(key))) };
}
const longText = { context: 1048576, streaming: true, tools: true };
const asr = { usageUnit: '分钟', profile: { inputModalities: ['音频'], outputModalities: ['文本'], tasks: ['语音识别'] } };
export const REAL_MODELS = [
  model('model-1', 'deepseek-v4-pro', 'DeepSeek V4 Pro', 'DeepSeek', 'text', '面向代码、推理与长文本任务的语言模型。', deepseekDocs, { capabilities: { ...longText, output: 393216 }, profile: { family: 'DeepSeek', version: 'V4-Pro-0813', reasoning: 'supported', structured: 'supported' } }),
  model('model-2', 'glm-5.2', 'GLM-5.2', '智谱 AI', 'text', '面向项目级开发与长程智能体任务的语言模型。', glmDocs('5.2'), { capabilities: { ...longText, output: 131072 }, profile: { family: 'GLM', version: '5.2', reasoning: 'supported', structured: 'supported' } }),
  model('model-3', 'kimi-k2.6', 'Kimi K2.6', '月之暗面', 'multimodal', '支持视觉与文本输入，适用于对话、推理及智能体任务。', kimiDocs, { capabilities: { context: 262144 }, profile: { family: 'Kimi', version: 'K2.6' } }),
  model('model-4', 'MiniMax-M3', 'MiniMax M3', 'MiniMax', 'text', '用于文本生成、编程及工具调用。', textDocs, { capabilities: { context: 196608, tools: true }, profile: { structured: 'unsupported' } }),
  model('model-5', 'qwen-audio-3.0-tts-plus', 'Qwen Audio 3.0 TTS Plus', '阿里巴巴', 'audio', '将文本合成为语音，支持内置及自定义音色。', ttsDocs),
  model('model-6', 'bge-large-zh-v1.5', 'BGE Large ZH v1.5', '北京智源人工智能研究院', 'embedding', '用于中文语义检索与文本向量化。', hf('BAAI/bge-large-zh-v1.5'), { profile: { dimensions: '1024', languages: ['中文'] } }),
  model('model-7', 'qwen3.5-omni-plus', 'Qwen3.5 Omni Plus', '阿里巴巴', 'multimodal', '支持多模态理解及语音对话。', visionDocs, { capabilities: { context: 262144, tools: true }, profile: { inputModalities: ['文本', '图片', '音频', '视频'], outputModalities: ['文本', '音频'], tasks: ['对话', '图像理解', '视频理解'] } }),
  model('model-8', 'qwen3.7-plus', 'Qwen3.7 Plus', '阿里巴巴', 'multimodal', '支持文本、图像与视频理解，适用于通用对话和内容分析。', visionDocs, { capabilities: { ...longText, output: 65536 }, profile: { videoDuration: 7200, imageLimit: 2048, structured: 'supported' } }),
  model('model-9', 'deepseek-flash', 'DeepSeek V4.1 Flash', 'DeepSeek', 'multimodal', '支持思考模式与视觉输入的快速模型。', deepseekDocs, { capabilities: { ...longText, output: 393216 }, profile: { inputModalities: ['文本', '图片'], tasks: ['对话', '图像理解', '代码生成'], version: 'V4.1-Flash', reasoning: 'supported', structured: 'supported' } }),
  model('model-10', 'kimi-k2.7-code', 'Kimi K2.7 Code', '月之暗面', 'multimodal', '面向代码任务的模型，支持长上下文指令处理。', kimiDocs, { capabilities: { context: 262144, tools: true }, profile: { structured: 'unsupported' } }),
  model('model-11', 'qwen3.8-flash', 'Qwen3.8 Flash', '阿里巴巴', 'multimodal', '支持图像与视频理解的快速千问模型。', textDocs, { capabilities: longText }),
  model('model-12', 'wan2.7-image-pro', 'Wan2.7 Image Pro', '阿里巴巴', 'image', '支持文生图、多图参考及图片编辑。', imageDocs, { profile: { inputModalities: ['文本', '图片'], tasks: ['文生图', '图像编辑'], resolutions: '4096×4096（生成）、2048×2048（编辑）', referenceLimit: 9 } }),
  model('model-13', 'happyhorse-1.1-t2v', 'HappyHorse 1.1 T2V', '阿里巴巴', 'video', '根据文本描述生成有声视频。', videoDocs, { profile: { resolutions: '1080P', maxDuration: 15 } }),
  model('model-14', 'happyhorse-1.1-i2v', 'HappyHorse 1.1 I2V', '阿里巴巴', 'video', '根据输入图片生成视频。', videoDocs, { profile: { inputModalities: ['文本', '图片'], tasks: ['图生视频'], resolutions: '1080P', minDuration: 3, maxDuration: 15 } }),
  model('model-15', 'bge-reranker-base', 'BGE Reranker Base', '北京智源人工智能研究院', 'rerank', '对查询与候选文本进行相关性评分。', hf('BAAI/bge-reranker-base')),
  model('model-16', 'qwen3.7-text-rerank', 'Qwen3.7 Text Rerank', '阿里巴巴', 'rerank', '用于文本检索结果重排。', bailian),
  model('model-17', 'qwen3.7-text-embedding', 'Qwen3.7 Text Embedding', '阿里巴巴', 'embedding', '用于文本语义检索与向量化。', bailian),
  model('model-18', 'qwen3-vl-embedding', 'Qwen3 VL Embedding', '阿里巴巴', 'embedding', '将文本和图片转换为检索向量。', embeddingDocs, { profile: { inputModalities: ['文本', '图片'], tasks: ['多模态向量化'] } }),
  model('model-19', 'qwen-audio-3.1-asr-flash-filetrans', 'Qwen Audio 3.1 ASR Flash Filetrans', '阿里巴巴', 'audio', '用于录音文件转写，支持说话人分离。', asrDocs, asr),
  model('model-20', 'cosyvoice-v3.5-plus', 'CosyVoice v3.5 Plus', '阿里巴巴', 'audio', '支持语音合成与自定义音色。', ttsDocs),
  model('model-21', 'happyhorse-1.1-r2v', 'HappyHorse 1.1 R2V', '阿里巴巴', 'video', '根据参考素材生成视频。', videoDocs, { profile: { inputModalities: ['文本', '图片'], tasks: ['参考生视频'] } }),
  model('model-22', 'FLUX.1-dev', 'FLUX.1 Dev', 'Black Forest Labs', 'image', '开放权重的文本生成图像模型。', hf('black-forest-labs/FLUX.1-dev'), { profile: { openWeights: 'supported', parameters: 12 } }),
  model('model-glm53', 'glm-5.3', 'GLM-5.3', '智谱 AI', 'text', '面向复杂软件工程和长程智能体任务，始终启用思考。', glmDocs('5.3'), { capabilities: { ...longText, output: 131072 }, profile: { version: '5.3', reasoning: 'supported', structured: 'supported' } }),
  model('catalog-demo-kimi', 'kimi-k3', 'Kimi K3', '月之暗面', 'text', '支持原生视觉理解与长上下文，适用于编程、知识工作和推理。', 'https://platform.kimi.ai/docs/guide/kimi-k3-quickstart', { capabilities: longText, profile: { family: 'Kimi', version: 'K3', parameters: 2800, architecture: 'MoE', reasoning: 'supported', inputModalities: ['文本', '图片', '视频'], tasks: ['对话', '图像理解', '视频理解', '代码生成'] } }),
  model('catalog-demo-qwen', 'qwen3.8-max', 'Qwen3.8 Max', '阿里巴巴', 'multimodal', '支持文本、图像与视频理解，适用于复杂内容分析和通用任务。', visionDocs, { capabilities: longText, profile: { reasoning: 'supported', structured: 'supported', videoDuration: 7200, imageLimit: 2048 } }),
  model('catalog-demo-image', 'qwen-image-3.0-pro', 'Qwen Image 3.0 Pro', '阿里巴巴', 'image', '支持复杂版面、文字渲染和图像编辑。', imageDocs, { profile: { inputModalities: ['文本', '图片'], tasks: ['文生图', '图像编辑'], resolutions: '最高2048×2048' } }),
  model('catalog-demo-video', 'wan3.0-video', 'Wan3.0 Video', '阿里巴巴', 'video', '支持文本、图像、视频及音频参考，统一生成视频。', 'https://help.aliyun.com/zh/model-studio/wan3-0-video', { profile: { inputModalities: ['文本', '图片', '视频', '音频'], tasks: ['文生视频', '图生视频', '参考生视频'], resolutions: '480P、720P、1080P', minDuration: 2, maxDuration: 30 } }),
  model('catalog-demo-tts', 'qwen-audio-3.0-tts-flash', 'Qwen Audio 3.0 TTS Flash', '阿里巴巴', 'audio', '支持文本语音合成、声音复刻和声音设计。', ttsDocs),
  model('catalog-demo-asr', 'SenseVoiceSmall', 'SenseVoice Small', '阿里巴巴', 'audio', '支持多语言语音识别及音频事件识别。', hf('FunAudioLLM/SenseVoiceSmall'), { ...asr, profile: { ...asr.profile, languages: ['中文', '英文', '粤语', '日文', '韩文'] } }),
  model('catalog-demo-embedding', 'bge-m3', 'BGE-M3', '北京智源人工智能研究院', 'embedding', '支持多语言稠密、稀疏及多向量检索。', hf('BAAI/bge-m3'), { capabilities: { context: 8192 }, profile: { dimensions: '1024', maxInput: 8192, openWeights: 'supported', license: 'MIT' } }),
  model('catalog-demo-rerank', 'bge-reranker-v2-m3', 'BGE Reranker v2 M3', '北京智源人工智能研究院', 'rerank', '对多语言查询与文档进行相关性评分和重排。', hf('BAAI/bge-reranker-v2-m3'), { profile: { openWeights: 'supported', license: 'Apache-2.0' } }),
  model('template-glm-5', 'glm-5', 'GLM-5', '智谱 AI', 'text', '用于通用对话、编程及智能体任务。', glmDocs('5'), { capabilities: { context: 204800, output: 131072, streaming: true, tools: true }, profile: { parameters: 744, activeParameters: 40, architecture: 'MoE', reasoning: 'supported', structured: 'supported' } }),
  model('template-qwen-omni', 'qwen3.8-omni-flash', 'Qwen3.8 Omni Flash', '阿里巴巴', 'multimodal', '用于音视频内容理解、多模态分析及智能体任务。', 'https://help.aliyun.com/zh/model-studio/qwen3-8-omni-flash', { profile: { inputModalities: ['文本', '图片', '音频', '视频'] } }),
  model('template-qwen-image21-pro', 'qwen-image-2.1-pro', 'Qwen Image 2.1 Pro', '阿里巴巴', 'image', '统一图像生成与编辑，支持透明图像及多图参考。', imageDocs, { profile: { inputModalities: ['文本', '图片'], tasks: ['文生图', '图像编辑'], referenceLimit: 10 } }),
  model('template-qwen-image21-turbo', 'qwen-image-2.1-turbo', 'Qwen Image 2.1 Turbo', '阿里巴巴', 'image', '支持透明图像生成、参考图编辑与高效内容创作。', imageDocs, { profile: { inputModalities: ['文本', '图片'], tasks: ['文生图', '图像编辑'] } }),
  model('template-minimax-h3', 'minimax-h3', 'MiniMax H3', 'MiniMax', 'video', '统一理解多模态参考素材，生成带原生音频的视频。', 'https://www.minimax.cn/blog/minimax-h3', { profile: { inputModalities: ['文本', '图片', '视频', '音频'], outputModalities: ['视频', '音频'], tasks: ['文生视频', '图生视频', '参考生视频', '视频编辑'], resolutions: '最高2K', maxDuration: 15 } }),
  model('template-qwen-embedding-flash', 'qwen3.7-text-embedding-flash', 'Qwen3.7 Text Embedding Flash', '阿里巴巴', 'embedding', '用于多语言语义检索与高吞吐文本向量化。', embeddingDocs),
  model('template-qwen-asr30', 'qwen-audio-3.0-asr-flash-filetrans', 'Qwen Audio 3.0 ASR Flash Filetrans', '阿里巴巴', 'audio', '录音文件转写，支持多语言、方言和热词输入。', asrDocs, asr),
];
export const catalogueMetadata = id => structuredClone(REAL_MODELS.find(model => model.id === id));
export function catalogueModelSeed(at) {
  return REAL_MODELS.filter(model => /^model-\d+$/.test(model.id)).map((model, index) => ({ ...structuredClone(model), createdAt: at, updatedAt: at, status: index === 2 ? '验证中' : '运行中', visibility: index === 2 ? '内部' : '公开', defaultVersionId: `version-${index + 1}`, listingStatus: index < 2 ? '已上架' : '已下架', callsEnabled: index !== 2, openScope: 'all', tenantIds: [] }));
}
