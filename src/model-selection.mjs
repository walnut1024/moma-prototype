export const modelCategory = type => ({ text: '文本', multimodal: '多模态', image: '图片', video: '视频', voice: '语音' }[type] || '文本');
export const modelSupplier = model => model.name.split('/')[0];

export function filterModels(models, { query = '', category = '全部', provider = '全部供应商', billing = '全部计费', subscribedOnly = true } = {}) {
  const search = query.trim().toLowerCase();
  return models.filter(model => (!subscribedOnly || model.subscribed)
    && model.name.toLowerCase().includes(search)
    && (category === '全部' || modelCategory(model.type) === category)
    && (provider === '全部供应商' || modelSupplier(model) === provider)
    && (billing === '全部计费' || model.billing === billing));
}

export function chooseModel(selected, model, multiple, max) {
  if (!model.subscribed) return selected;
  if (!multiple) return [model.name];
  if (selected.includes(model.name)) return selected.filter(name => name !== model.name);
  return selected.length < max ? [...selected, model.name] : selected;
}
