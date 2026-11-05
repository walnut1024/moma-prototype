export const modelCategory = type => ({ text: '文本', multimodal: '多模态', image: '图片', video: '视频', voice: '语音' }[type] || type || '未填写');
export const modelSupplier = model => model.provider || '未填写';

export function filterModels(models, { query = '', category = '全部', provider = '全部供应商', billing = '全部计费', callableOnly = true } = {}) {
  const search = query.trim().toLowerCase();
  return models.filter(model => (!callableOnly || model.callable)
    && model.name.toLowerCase().includes(search)
    && (category === '全部' || modelCategory(model.type) === category)
    && (provider === '全部供应商' || modelSupplier(model) === provider)
    && (billing === '全部计费' || model.billing === billing));
}

export function chooseModel(selected, model, multiple, max) {
  if (!model.callable) return selected;
  if (!multiple) return [model.id];
  if (selected.includes(model.id)) return selected.filter(name => name !== model.id);
  return selected.length < max ? [...selected, model.id] : selected;
}
