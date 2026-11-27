export const usageTotal = usage => Object.values(usage || {}).reduce((sum, value) => sum + (Number(value) || 0), 0);

export function percentile(values, ratio) {
  if (!values.length) return null;
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.ceil(sorted.length * ratio) - 1];
}
