export const MODEL_TYPE_LABELS = {
  text: '语言模型',
  multimodal: '多模态理解',
  visual: '视觉模型',
  audio: '语音模型',
  embedding: '向量模型',
  rerank: '重排序模型',
  other: '其他专用模型',
};

export const MODEL_TASK_LABELS = {
  text: MODEL_TYPE_LABELS.text,
  multimodal: MODEL_TYPE_LABELS.multimodal,
  image: MODEL_TYPE_LABELS.visual + '（图像生成）',
  video: MODEL_TYPE_LABELS.visual + '（视频生成）',
  audio: MODEL_TYPE_LABELS.audio,
  embedding: MODEL_TYPE_LABELS.embedding,
  rerank: MODEL_TYPE_LABELS.rerank,
};

export const modelCategory = type => type === 'image' || type === 'video' ? 'visual' : type === 'voice' ? 'audio' : type;
export const modelTypeLabel = type => {
  const category = modelCategory(type);
  return Object.hasOwn(MODEL_TYPE_LABELS, category) ? MODEL_TYPE_LABELS[category] : undefined;
};
