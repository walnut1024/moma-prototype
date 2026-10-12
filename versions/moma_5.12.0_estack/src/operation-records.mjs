export function readOperationRecords(storage, key) {
  const raw = storage.getItem(key);
  if (!raw) return [];
  const state = JSON.parse(raw);
  if (!Array.isArray(state?.audit)) throw new Error('操作记录读取失败，请刷新后重试。');
  return state.audit.filter(row => row && typeof row.time === 'string' && typeof row.description === 'string');
}

export function filterOperationRecords(records, { query = '', start = '', end = '' }) {
  const needle = query.trim().toLowerCase();
  return records.filter(row => (!needle || `${row.actor ?? ''} ${row.description}`.toLowerCase().includes(needle)) && (!start || row.time.slice(0, 10) >= start) && (!end || row.time.slice(0, 10) <= end));
}

export function operationRecordsCsv(records) {
  const quote = value => `"${String(value ?? '').replace(/^[=+@-]/, "'$&").replaceAll('"', '""')}"`;
  return '\uFEFF' + [['操作时间', '操作人', '功能', '操作内容'], ...records.map(row => [row.time, row.actor, '组织及成员', row.description])].map(row => row.map(quote).join(',')).join('\r\n');
}
