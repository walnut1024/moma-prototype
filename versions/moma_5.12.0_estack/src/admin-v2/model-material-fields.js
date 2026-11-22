export const materialContextUnits = { K: 1024, M: 1048576 };

export const materialContextUnit = tokens => tokens >= materialContextUnits.M ? 'M' : 'K';

export function materialContextLabel(tokens) {
  if (!(tokens > 0)) return '—';
  const unit = materialContextUnit(tokens);
  return (tokens / materialContextUnits[unit]).toLocaleString('zh-CN', { maximumFractionDigits: 20 }) + ' ' + unit;
}
