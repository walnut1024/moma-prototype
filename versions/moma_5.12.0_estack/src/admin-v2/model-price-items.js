export function priceUnits(model) {
  if (model.type === 'image') return ['元/张'];
  if (model.type === 'video') return ['元/秒', '元/百万 Token'];
  if (model.type === 'audio') return model.profile?.tasks?.includes('语音合成') || model.usageUnit === '字符' ? ['元/万字符', '元/分钟', '元/秒', '元/百万 Token'] : ['元/分钟', '元/秒', '元/百万 Token', '元/万字符'];
  if (model.type === 'rerank') return ['元/千次', '元/百万 Token'];
  return ['元/百万 Token'];
}

export const hasOutputPrice = (model, unit = priceUnits(model)[0]) => ['text', 'multimodal'].includes(model.type) || (['video', 'audio'].includes(model.type) && unit === '元/百万 Token');

export function priceItems(price, model) {
  if (!price) return [];
  if (Array.isArray(price.items)) return price.items;
  // Historical snapshots keep their original fields and IDs; only their presentation is expanded.
  const hasOutput = hasOutputPrice(model, price.unit);
  const fields = [['inputPrice', hasOutput ? '输入' : '单价']];
  if (hasOutput) fields.push(['outputPrice', '输出']);
  if (price.cachedPrice != null) fields.push(['cachedPrice', '缓存读取']);
  if (price.cacheWritePrice != null) fields.push(['cacheWritePrice', '缓存写入']);
  return fields.map(([key, name]) => ({ name, unit: price.unit, currency: 'CNY', amount: price[key] ?? null }));
}
