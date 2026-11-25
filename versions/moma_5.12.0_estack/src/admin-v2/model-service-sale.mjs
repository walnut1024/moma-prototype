export const modelServiceSaleStage = {
  unlisted: '未开售',
  gray: '灰度在售',
  formal: '在售',
  paused: '已停售',
};

export const modelServiceSaleActive = sale => ['gray', 'formal'].includes(sale?.stage);

export function activeModelServiceSalePrice(sale, at = Date.now()) {
  const time = typeof at === 'number' ? at : Date.parse(at);
  const price = (sale?.prices || []).slice().reverse().find(row => Date.parse(row.effectiveAt) <= time);
  return price && (!price.expiresAt || Date.parse(price.expiresAt) > time) ? price : null;
}

const priceMeasures = items => items.map(item => item.unit + ':' + item.currency).sort().join();

export const matchingModelServicePrices = (cost, sale) =>
  Boolean(cost?.length && sale?.length && priceMeasures(cost) === priceMeasures(sale));
