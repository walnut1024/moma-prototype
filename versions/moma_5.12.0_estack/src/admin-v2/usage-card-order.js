import { usageModelTypes } from './usage-analysis.js';

export const defaultCardOrder = {
  overview: ['usage-token-trend', 'usage-call-trend'],
  categories: usageModelTypes.map(type => `usage-${type.id}`),
  rankings: ['usage-customer-token-rank', 'usage-model-token-rank', 'usage-customer-call-rank', 'usage-model-call-rank'],
};

export function normalizeCardOrder(saved) {
  return Object.fromEntries(Object.entries(defaultCardOrder).map(([group, defaults]) => {
    const valid = Array.isArray(saved?.[group]) ? [...new Set(saved[group].filter(id => defaults.includes(id)))] : [];
    return [group, [...valid, ...defaults.filter(id => !valid.includes(id))]];
  }));
}

export function moveCard(order, group, from, to) {
  const items = order[group];
  if (!items) return order;
  const fromIndex = items?.indexOf(from), toIndex = items?.indexOf(to);
  if (fromIndex < 0 || toIndex < 0 || fromIndex === toIndex) return order;
  const next = [...items];
  next.splice(fromIndex, 1);
  next.splice(toIndex, 0, from);
  return { ...order, [group]: next };
}
