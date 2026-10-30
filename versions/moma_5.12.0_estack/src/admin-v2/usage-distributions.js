export function usageTokenValue(row, metric = 'total') {
  if (row.unit !== 'Token' || !row.value || (metric === 'total' && row.value.complete !== true)) return null;
  const value = metric === 'output' && ['embedding', 'rerank'].includes(row.modelType) && row.value.output === undefined ? 0 : row.value[metric];
  return Number.isSafeInteger(value) && value >= 0 ? value : null;
}

export function usageShare(rows, key, metric = 'calls') {
  const groups = new Map();
  let total = 0, pendingCalls = 0;
  for (const row of rows) {
    if (metric !== 'calls' && row.unit !== 'Token') continue;
    const value = metric === 'calls' ? 1 : usageTokenValue(row, metric);
    if (value === null) { pendingCalls++; continue; }
    const id = row[key] || '__unknown__';
    groups.set(id, (groups.get(id) || 0) + value);
    total += value;
  }
  const ranked = [...groups].map(([id, value]) => ({ id, value })).sort((a, b) => b.value - a.value || a.id.localeCompare(b.id));
  const known = ranked.filter(row => row.id !== '__unknown__');
  const unknown = ranked.find(row => row.id === '__unknown__');
  const slices = total > 0 ? known.filter(row => row.value > 0).slice(0, 5) : [];
  const other = known.filter(row => row.value > 0).slice(5).reduce((sum, row) => sum + row.value, 0);
  if (other > 0) slices.push({ id: '__other__', value: other });
  if (unknown?.value > 0) slices.push(unknown);
  return { total, count: known.length, ranked, slices, unknownValue: unknown?.value || 0, pendingCalls };
}

export function usageDistributions(rows) {
  const customers = ['1–10', '11–100', '101–1,000', '1,001–10,000', '10,001及以上'].map(label => ({ label, value: 0 }));
  const tokens = ['0', '1–1,000', '1,001–4,000', '4,001–16,000', '16,001–64,000', '64,001及以上'].map(label => ({ label, value: 0 }));
  const callsByCustomer = new Map();
  let unknownCustomerCalls = 0, tokenCalls = 0, pendingTokenCalls = 0, nonTokenCalls = 0;
  for (const row of rows) {
    if (row.tenantId && row.tenantId !== '__unknown__') callsByCustomer.set(row.tenantId, (callsByCustomer.get(row.tenantId) || 0) + 1);
    else unknownCustomerCalls++;
    if (row.unit !== 'Token') { nonTokenCalls++; continue; }
    const value = usageTokenValue(row);
    if (value === null) { pendingTokenCalls++; continue; }
    tokenCalls++;
    tokens[[0, 1000, 4000, 16000, 64000, Infinity].findIndex(limit => value <= limit)].value++;
  }
  for (const calls of callsByCustomer.values()) customers[[10, 100, 1000, 10000, Infinity].findIndex(limit => calls <= limit)].value++;
  return { customers, tokens, customerCount: callsByCustomer.size, unknownCustomerCalls, tokenCalls, pendingTokenCalls, nonTokenCalls };
}
