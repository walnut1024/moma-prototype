// Catalogue metadata is separate from verified supply capabilities and routing.
const field = (key, label, kind = 'text', placeholder = '待确认') => ({ key, label, kind, placeholder });
export const ARCHITECTURE_OPTIONS = [['Dense', 'Dense（稠密）'], ['MoE', 'MoE（混合专家）'], ['Diffusion', 'Diffusion（扩散）'], ['Autoregressive', 'Autoregressive（自回归）'], ['Hybrid', 'Hybrid（混合架构）'], ['Other', '其他架构']];
export const LICENSE_OPTIONS = [['Apache-2.0', 'Apache 2.0'], ['MIT', 'MIT'], ['BSD-3-Clause', 'BSD 3-Clause'], ['CC-BY-4.0', 'CC BY 4.0'], ['CC-BY-NC-4.0', 'CC BY-NC 4.0'], ['Proprietary', '专有协议'], ['Custom', '厂商自定义协议']];
export const LANGUAGE_OPTIONS = ['中文', '中文繁体', '英文', '日文', '韩文', '法文', '德文', '西班牙文', '葡萄牙文', '俄文', '阿拉伯文', '印地文', '越南文', '泰文', '印尼文', '粤语'];
export const INPUT_MODALITY_OPTIONS = ['文本', '图片', '音频', '视频'];
export const OUTPUT_MODALITY_OPTIONS = INPUT_MODALITY_OPTIONS;
export const RESULT_TYPE_OPTIONS = ['生成文本', '结构化数据', '向量', '相关性分数', '排序结果'];
export const SCENARIO_OPTIONS = ['客服', '办公', '编程', '知识检索', '内容创作', '教育', '数据分析'];
export const TASK_OPTIONS = {
  text: ['对话', '文本生成', '代码生成', '文本理解与提取', '翻译', '图像理解', '视频理解'],
  multimodal: ['图像理解', '视频理解', '对话', '文本生成', '代码生成'],
  image: ['文生图', '图像编辑', '图像修复', '图像扩展'],
  video: ['文生视频', '图生视频', '参考生视频', '视频编辑', '视频延长'],
  audio: ['语音合成', '语音识别', '语音翻译', '实时语音对话'],
  embedding: ['文本向量化', '图像向量化', '多模态向量化'],
  rerank: ['文档重排', '多模态重排'],
};
export const IDENTITY_FIELDS = [field('family', '模型系列'), field('version', '模型版本'), field('releaseDate', '发布日期', 'date'), field('lifecycle', '版本状态', 'lifecycle'), field('retirementDate', '退役日期', 'date'), field('replacement', '替代模型ID')];
export const TECHNICAL_FIELDS = [field('license', '许可协议', 'license'), field('architecture', '模型架构', 'architecture'), { ...field('parameters', '总参数', 'decimal'), unit: 'B' }, { ...field('activeParameters', '激活参数', 'decimal'), unit: 'B' }, field('openWeights', '开放权重', 'support'), field('baseModel', '基础模型'), field('precision', '量化精度'), field('knowledgeCutoff', '知识截止日期', 'date')];
export const PRESENTATION_FIELDS = [field('author', '模型作者'), field('logo', '模型 Logo', 'image'), field('scenarios', '适用场景', 'scenarios'), field('languages', '支持语言', 'languages')];
export const COMMON_FIELDS = [field('tasks', '支持任务', 'tasks'), field('inputModalities', '输入模态', 'modalities'), field('outputModalities', '输出模态', 'modalities'), field('resultTypes', '结果类型', 'results')];
export const INTERFACE_FIELDS = [field('inputFormats', '输入文件格式', 'text', '例如 PDF、PNG、WAV'), field('inputMethods', '输入方式', 'methods'), field('supportedParameters', '支持参数', 'parameters'), field('parameterRules', '参数范围与组合限制', 'text', '例如 1080P 仅支持 5 秒和 10 秒')];
export const RECORD_FIELDS = [field('documentation', '资料链接', 'url', 'https://'), field('sourceUpdated', '资料核对日期', 'date'), field('sourceStatus', '资料确认状态', 'confirmation'), field('benchmark', '评测任务与指标'), field('benchmarkResult', '评测结果'), field('benchmarkDataset', '数据集与版本'), field('benchmarkConditions', '测试条件'), field('benchmarkDate', '测试日期', 'date')];
export const FEATURE_FIELDS = [field('reasoning', '深度思考', 'support'), field('structured', '结构化输出', 'support'), field('cache', '提示词缓存', 'support'), field('batch', '批量调用', 'support')];
export function normalizeModelLogo(value) {
  if (!value.startsWith('data:')) {
    if (value.length > 1000) throw new Error('模型 Logo 地址最多 1000 字符');
    let url; try { url = new URL(value); } catch { throw new Error('模型 Logo 地址无效'); }
    if (!['https:', 'http:'].includes(url.protocol) || url.username || url.password) throw new Error('模型 Logo 需填写无凭据的 http 或 https 地址');
    return value;
  }
  const match = value.match(/^data:image\/(png|jpeg|webp);base64,([A-Za-z0-9+/]+={0,2})$/);
  if (!match || match[2].length > 1398104) throw new Error('Logo 仅支持 1 MB 以内的 PNG、JPEG 或 WebP 图片');
  let bytes; try { bytes = atob(match[2]); } catch { throw new Error('Logo 图片数据无效'); }
  const valid = match[1] === 'png' ? bytes.startsWith('\x89PNG\r\n\x1a\n') : match[1] === 'jpeg' ? bytes.startsWith('\xff\xd8\xff') : bytes.startsWith('RIFF') && bytes.slice(8, 12) === 'WEBP';
  if (!valid || bytes.length > 1048576) throw new Error('Logo 图片格式或大小无效');
  return value;
}
export function specificationFields(type, usageUnit, profile = {}) {
  const numeric = (key, label) => { const unit = label.match(/（(.+)）$/)?.[1]; return { ...field(key, label.replace(/（.+）$/, ''), 'number'), unit }; };
  const tasks = Array.isArray(profile.tasks) ? profile.tasks : [];
  switch (type) {
    case 'text': return [numeric('maxInput', '最大输入（Token）'), numeric('reasoningBudget', '思考预算上限（Token）'), field('tokenizer', '分词器'), field('responseFormats', '响应格式', 'text', '例如 text、json_object'), ...(tasks.some(task => ['图像理解', '视频理解'].includes(task)) ? [numeric('imageLimit', '单次图片上限（张）'), numeric('fileSize', '单文件上限（MB）'), numeric('videoDuration', '输入视频上限（秒）')] : [])];
    case 'multimodal': return [numeric('maxInput', '最大输入（Token）'), numeric('imageLimit', '单次图片上限（张）'), numeric('fileSize', '单文件上限（MB）'), numeric('videoDuration', '输入视频上限（秒）')];
    case 'image': return [field('resolutions', '输出分辨率', 'text', '例如 1024×1024、1536×1024'), field('aspectRatios', '宽高比', 'text', '例如 1:1、16:9'), field('outputFormats', '图片格式'), numeric('imageLimit', '单次生成上限（张）'), numeric('referenceLimit', '参考图片上限（张）'), field('editing', '图片编辑', 'support')];
    case 'video': return [field('resolutions', '视频分辨率'), field('aspectRatios', '宽高比'), numeric('minDuration', '最短生成时长（秒）'), numeric('maxDuration', '最长生成时长（秒）'), field('frameRates', '输出帧率（FPS）'), field('sound', '声音生成', 'support'), field('firstLastFrame', '首尾帧', 'support'), numeric('referenceLimit', '参考媒体上限（个）'), field('outputFormats', '视频格式'), field('async', '异步任务', 'support')];
    case 'audio': {
      return [...(tasks.includes('语音合成') || tasks.includes('实时语音对话') ? [numeric('maxCharacters', '单次文本上限（字符）'), field('sampleRates', '采样率（Hz）'), field('outputFormats', '音频格式'), field('voices', '音色范围'), field('voiceClone', '声音复刻', 'support'), field('speedControl', '语速调节', 'support'), field('emotionControl', '情绪控制', 'support')] : []), ...(tasks.some(task => ['语音识别', '语音翻译', '实时语音对话'].includes(task)) ? [numeric('maxDuration', '单次音频上限（秒）'), numeric('fileSize', '音频文件上限（MB）'), field('timestamps', '时间戳', 'support'), field('diarization', '说话人区分', 'support'), field('translation', '语音翻译', 'support')] : [])];
    }
    case 'embedding': return [field('dimensions', '可选向量维度', 'dimensions', '例如 512、1024'), numeric('batchSize', '单批文本上限（条）'), numeric('maxInput', '单条输入上限（Token）'), field('vectorType', '向量类型'), field('normalization', '向量归一化', 'support'), field('encodingFormats', '编码格式')];
    case 'rerank': return [numeric('documentLimit', '候选文档上限（篇）'), numeric('documentTokens', '单篇文档上限（Token）'), { ...numeric('topN', '返回结果上限（篇）'), label: '返回结果上限（Top N）' }, field('scoreRange', '相关性分数范围'), field('returnDocuments', '返回文档内容', 'support'), field('truncation', '超长文档截断', 'support')];
    default: return [];
  }
}
export function normalizeModelProfile(value = {}, type, usageUnit) {
  const descriptors = [...IDENTITY_FIELDS, ...TECHNICAL_FIELDS, ...PRESENTATION_FIELDS, ...COMMON_FIELDS, ...INTERFACE_FIELDS, ...FEATURE_FIELDS.filter(item => ['text', 'multimodal'].includes(type) || item.key === 'batch'), ...specificationFields(type, usageUnit, value), ...RECORD_FIELDS, field('detailDescription', '详细介绍')];
  const result = {};
  for (const descriptor of descriptors) {
    const raw = value[descriptor.key];
    if (raw == null || raw === '' || raw === 'unknown') continue;
    if (['languages', 'modalities', 'tasks', 'results', 'scenarios', 'methods', 'parameters'].includes(descriptor.kind)) {
      if (!Array.isArray(raw) || raw.some(item => typeof item !== 'string' || !item.trim() || item.length > 80) || raw.length > 100) throw new Error(`${descriptor.label}需选择有效选项`);
      const selected = [...new Set(raw.map(item => item.trim()))];
      const choices = descriptor.kind === 'tasks' ? TASK_OPTIONS[type] : descriptor.kind === 'results' ? RESULT_TYPE_OPTIONS : descriptor.kind === 'modalities' ? INPUT_MODALITY_OPTIONS : null;
      if (choices && selected.some(item => !choices.includes(item))) throw new Error(`${descriptor.label}包含不适用选项`);
      if (selected.length) result[descriptor.key] = selected;
      continue;
    }
    const clean = String(raw).trim();
    if (!clean) continue;
    if (descriptor.kind === 'image') { result[descriptor.key] = normalizeModelLogo(clean); continue; }
    if (clean.length > 1000) throw new Error(`${descriptor.label}最多 1000 字符`);
    if (descriptor.kind === 'decimal') {
      if (!Number.isFinite(Number(clean)) || Number(clean) <= 0) throw new Error('参数规模必须为正数，单位为 B');
      result[descriptor.key] = Number(clean);
    } else if (descriptor.kind === 'number') {
      if (!Number.isSafeInteger(Number(clean)) || Number(clean) < 1) throw new Error(`${descriptor.label}必须为正整数`);
      result[descriptor.key] = Number(clean);
    } else {
      if (descriptor.kind === 'support' && !['supported', 'unsupported'].includes(clean)) throw new Error(`${descriptor.label}状态无效`);
      if (descriptor.kind === 'lifecycle' && !['stable', 'preview', 'deprecated'].includes(clean)) throw new Error('版本状态无效');
      if (descriptor.kind === 'confirmation' && !['pending', 'confirmed'].includes(clean)) throw new Error('资料确认状态无效');
      if (descriptor.kind === 'date' && (!/^\d{4}-\d{2}-\d{2}$/.test(clean) || Number.isNaN(Date.parse(clean)) || new Date(clean).toISOString().slice(0, 10) !== clean)) throw new Error(`${descriptor.label}日期无效`);
      if (descriptor.kind === 'url') { let url; try { url = new URL(clean); } catch { throw new Error(`${descriptor.label}需填写完整的 http 或 https 地址`); } if (!['https:', 'http:'].includes(url.protocol) || url.username || url.password) throw new Error(`${descriptor.label}需填写无凭据的 http 或 https 地址`); }
      if (descriptor.kind === 'dimensions' && !clean.split(/[,，、\s]+/).every(item => /^\d+$/.test(item) && Number.isSafeInteger(Number(item)) && Number(item) > 0)) throw new Error('向量维度需填写正整数，多个维度用逗号分隔');
      result[descriptor.key] = clean;
    }
  }
  if (result.minDuration && result.maxDuration && result.minDuration > result.maxDuration) throw new Error('最短生成时长不能超过最长生成时长');
  if (result.topN && result.documentLimit && result.topN > result.documentLimit) throw new Error('返回结果上限不能超过候选文档上限');
  if (result.activeParameters && result.parameters && result.activeParameters > result.parameters) throw new Error('激活参数不能超过总参数');
  if (result.retirementDate && result.releaseDate && result.retirementDate < result.releaseDate) throw new Error('退役日期不能早于发布日期');
  if (result.benchmarkResult && (!result.benchmark || !result.benchmarkDataset || !result.benchmarkConditions || !result.benchmarkDate)) throw new Error('填写评测结果时，请同时填写任务与指标、数据集版本、测试条件和日期');
  return result;
}
export function modelProfileDraft(model) {
  const draft = { ...model?.profile };
  // Canonicalize existing local values for the new controls without discarding edits.
  if (typeof draft.parameters === 'string') {
    const matched = draft.parameters.trim().match(/^(\d+(?:\.\d+)?)\s*(?:B(?:[（(]总参数[）)])?)?$/i);
    if (matched) draft.parameters = Number(matched[1]);
  }
  if (typeof draft.languages === 'string') draft.languages = [...new Set(draft.languages.split(/[,，、]/).map(item => item.trim()).filter(Boolean))];
  for (const key of ['inputModalities', 'outputModalities']) {
    if (typeof draft[key] === 'string') draft[key] = [...new Set(draft[key].split(/[,，、]/).map(item => ['查询文本', '候选文档'].includes(item.trim()) ? '文本' : item.trim()).filter(Boolean))];
  }
  if (typeof draft.tasks === 'string') draft.tasks = [...new Set(draft.tasks.split(/[,，、]/).map(item => ({ 图文理解: '图像理解', 转写: '语音识别', 检索结果重排: '文档重排', 重排: '文档重排', 向量化: '文本向量化', 图像生成: '文生图', 视频生成: '文生视频' }[item.trim()] || item.trim())).filter(Boolean))];
  if (typeof draft.scenarios === 'string') draft.scenarios = draft.scenarios.split(/[,，、]/).map(item => item.trim()).filter(Boolean);
  const results = draft.outputModalities?.filter(item => RESULT_TYPE_OPTIONS.includes(item));
  if (results?.length) { draft.resultTypes = [...new Set([...(draft.resultTypes || []), ...results])]; draft.outputModalities = draft.outputModalities.filter(item => !RESULT_TYPE_OPTIONS.includes(item)); }
  return draft;
}

export function requireModelBasics(profile) {
  if (!profile.tasks?.length) throw new Error('请选择至少一个支持任务');
  if (!profile.inputModalities?.length) throw new Error('请选择至少一种输入模态');
  if (!profile.outputModalities?.length && !profile.resultTypes?.length) throw new Error('请选择输出模态或结果类型');
}

export const SERVICE_OUTPUT_MODALITIES = [...INPUT_MODALITY_OPTIONS, '向量', '相关性分数', '排序结果', '结构化数据'];
export function modelAuthors(state) {
  return [...new Set([...state.models, ...state.modelTemplates].map(model => model.profile?.author || model.maker).filter(value => typeof value === 'string' && value.trim()).map(value => value.trim()))].sort((a,b) => a.localeCompare(b,'zh-CN'));
}
export function serviceModelDraft(model) {
  const profile = modelProfileDraft(model), context = model?.capabilities?.context;
  const contextUnit = context && context % 1048576 === 0 ? 'M' : 'K';
  return { name:model?.name || '', modelId:model?.modelId || '', type:model?.type || '', author:profile.author || model?.maker || '', releaseDate:profile.releaseDate || '', inputModalities:profile.inputModalities || [], outputModalities:[...new Set([...(profile.outputModalities || []), ...(profile.resultTypes || []).filter(value=>SERVICE_OUTPUT_MODALITIES.includes(value))])], context:context ? String(context / (contextUnit==='M'?1048576:1024)) : '', contextUnit, description:model?.description || '' };
}
export function serviceMetadataReady(model) {
  const data=serviceModelDraft(model);
  return Boolean(data.name.trim() && data.modelId.trim() && data.type && data.author.trim() && /^\d{4}-\d{2}-\d{2}$/.test(data.releaseDate) && data.inputModalities.length && data.outputModalities.length && data.description.trim());
}
export function normalizeServiceModel(state, data, existing) {
  const text = (value,label,max) => { if(typeof value!=='string' || !value.trim() || value.length>max) throw new Error(`${label}必填，最多 ${max} 字符`); return value.trim(); };
  const name=text(data.name,'模型名称',100), modelId=existing?.modelId || text(data.modelId,'模型 ID',80);
  if(!existing && !/^[a-zA-Z][a-zA-Z0-9]*(?:-[a-zA-Z0-9]+)*$/.test(modelId)) throw new Error('模型 ID 仅支持英文字母、数字和中划线，须以字母开头，中划线不能连续或结尾');
  const author=text(data.author,'模型作者',100);
  if(!modelAuthors(state).includes(author)) throw new Error('请选择已有模型作者');
  const releaseDate=text(data.releaseDate,'发布时间',10);
  if(!/^\d{4}-\d{2}-\d{2}$/.test(releaseDate) || Number.isNaN(Date.parse(releaseDate)) || new Date(releaseDate).toISOString().slice(0,10)!==releaseDate) throw new Error('请选择有效的发布时间');
  const selected=(value,options,label)=>{if(!Array.isArray(value) || !value.length || value.some(item=>!options.includes(item))) throw new Error(`请选择有效的${label}`); return [...new Set(value)];};
  const inputModalities=selected(data.inputModalities,INPUT_MODALITY_OPTIONS,'输入模态'), outputs=selected(data.outputModalities,SERVICE_OUTPUT_MODALITIES,'输出模态');
  if(!['K','M'].includes(data.contextUnit)) throw new Error('上下文单位请选择 K 或 M');
  const amount=String(data.context ?? '').trim();
  const context=amount ? Number(amount) * (data.contextUnit==='M'?1048576:1024) : null;
  if(amount && (!/^\d+(?:\.\d+)?$/.test(amount) || !Number.isSafeInteger(context) || context<=0)) throw new Error('上下文须为正数，换算后的 Token 数必须为有效整数');
  return {name,modelId,type:data.type,maker:author,description:text(data.description,'模型简介',1000),usageUnit:existing?.usageUnit,profile:{...existing?.profile,author,releaseDate,inputModalities,outputModalities:outputs.filter(value=>INPUT_MODALITY_OPTIONS.includes(value)),resultTypes:outputs.filter(value=>!INPUT_MODALITY_OPTIONS.includes(value))},capabilities:{...existing?.capabilities,context}};
}

export function modelKeySpecs(model) {
  const profile = modelProfileDraft(model), specs = [];
  const add = (label, value, unit = '') => { if (value != null && value !== '') specs.push({ label, value: String(value), unit }); };
  if (['text', 'multimodal'].includes(model.type)) { add('上下文', model.capabilities?.context, 'Token'); add('最大输出', model.capabilities?.output, 'Token'); }
  if (['image', 'video'].includes(model.type)) { add('分辨率', profile.resolutions); if (model.type === 'video') add('最长生成', profile.maxDuration, '秒'); else add('单次生成', profile.imageLimit, '张'); }
  if (model.type === 'audio') { add('语言', profile.languages?.join('、')); add('音色', profile.voices); add('音频上限', profile.maxDuration, '秒'); add('文本上限', profile.maxCharacters, '字符'); }
  if (model.type === 'embedding') { add('向量维度', profile.dimensions); add('最大输入', profile.maxInput, 'Token'); }
  if (model.type === 'rerank') { add('候选文档', profile.documentLimit, '篇'); add('单篇文档', profile.documentTokens, 'Token'); }
  return specs.slice(0, 2);
}
