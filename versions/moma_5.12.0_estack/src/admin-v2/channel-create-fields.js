export function chooseChannelModel(models, current, field, input) {
  const model = models.find(row => row.id === input || field === 'modelCode' && row.modelId === input);
  if (model) return { modelId: model.id, modelName: model.name, modelCode: model.modelId, modelType: model.type };
  return { modelId: '', [field]: input || '', ...(current.modelId ? { [field === 'modelName' ? 'modelCode' : 'modelName']: '', modelType: '' } : {}) };
}
