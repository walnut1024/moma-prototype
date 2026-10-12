import test from 'node:test';
import assert from 'node:assert/strict';
import { createLogRecords, defaultLogFilters, restoreLogFilters, filterLogRecords, logJSON, logsCSV, shanghaiDate } from '../src/call-log-data.mjs';
import { maskApiKey } from '../src/api-key-utils.mjs';

test('saved views retain supported plans and dates without restoring removed billing', () => {
  const records=createLogRecords('2026-10-12');
  const supported=restoreLogFilters({billing:'Token Plan',resource:'办公团队套餐',range:'custom',start:'2026-10-01',end:'2026-10-03',query:' Request ID '},defaultLogFilters,records);
  assert.equal(supported.billing,'Token Plan');assert.equal(supported.resource,'办公团队套餐');
  assert.equal(supported.range,'custom');assert.equal(supported.start,'2026-10-01');assert.equal(supported.query,' Request ID ');
  const removed=restoreLogFilters({billing:'retired',resource:'retired-product'},defaultLogFilters,records);
  assert.equal(removed.billing,'');assert.equal(removed.resource,'');
});

test('call logs keep billing scopes, inclusive dates, missing usage and export data consistent', () => {
  const today = '2026-09-19';
  const rows = createLogRecords(today);
  const filtered = filterLogRecords(rows, '按量付费', defaultLogFilters, today);
  assert.equal(filtered.length, 21);
  assert.ok(filtered.every(row => row.billing === '按量付费' && row.time >= '2026-09-13'));
  const oneDay = filterLogRecords(rows, 'Token Plan', { ...defaultLogFilters, range: 'custom', start: today, end: today }, today);
  assert.equal(oneDay.length, 3);
  assert.ok(oneDay.filter(row => row.keyId).every(row => row.keyId.startsWith('key_tp_')));
  assert.equal(filterLogRecords(rows, '按量付费', { ...defaultLogFilters, key: 'key_tp_prod' }, today).length, 0);
  const all = filterLogRecords(rows, '全部', defaultLogFilters, today);
  assert.equal(all.length, 42);
  assert.deepEqual(new Set(rows.map(row => row.billing)), new Set(['按量付费', 'Token Plan']));
  const failed = oneDay.find(row => row.status === 403);
  const raw = JSON.parse(logJSON(failed));
  assert.equal(raw.total_tokens, null);
  assert.equal(raw.cache_tokens, null);
  assert.equal(raw.ttft, null);
  assert.equal(raw.duration_ms, 22);
  assert.equal(raw.error_code, 'Model.AccessDenied');
  const matched = filterLogRecords(rows, 'Token Plan', { ...defaultLogFilters, query: ` ${failed.id.toUpperCase()} `, source: '模型体验', status: '403' }, today);
  assert.equal(matched.length, 1);
  assert.equal(JSON.parse(logJSON(oneDay[1])).total_tokens, oneDay[1].input + oneDay[1].output);
  assert.equal(shanghaiDate(new Date('2026-09-18T16:00:00Z')), today);
  const csv = logsCSV([{ ...failed, keyName: '团队,"A"', model: '=1+1' }]);
  assert.ok(csv.startsWith('\ufeff'));
  assert.ok(csv.includes('"团队,""A"""'));
  assert.ok(csv.includes('"\'=1+1"'));
});

test('all sample calls have a redacted API Key and exports cannot reveal full credentials', () => {
  const rows = createLogRecords('2026-10-12');
  assert.ok(rows.every(row => row.keyId && row.keyName && row.apiKey.includes('*****')));
  assert.ok(rows.filter(row => row.source === '模型体验').every(row => row.apiKey !== '—'));
  const full = 'sk-abcdefghijklmnopqrstuvwxyz';
  const row = { ...rows[0], apiKey: full };
  const json = logJSON(row), csv = logsCSV([row]);
  assert.equal(JSON.parse(json).api_key, maskApiKey(full));
  assert.ok(csv.includes(maskApiKey(full)));
  assert.ok(!json.includes(full) && !csv.includes(full));
  const selected = filterLogRecords(rows, '全部', { ...defaultLogFilters, key: rows[0].keyId, source: '模型体验' }, '2026-10-12');
  assert.ok(selected.length && selected.every(log => log.keyId === rows[0].keyId));
});

test('audit fields preserve unknown values, observed zero and cache accounting across JSON and CSV', () => {
  const row = { ...createLogRecords('2026-10-12')[1], input: 100, output: 0, cache: 20, total: 100, first: 0, duration: 0, thinking: 0, isTimeout: false, isCanceled: true };
  const json = JSON.parse(logJSON(row));
  assert.equal(json.created_at, row.time);
  assert.equal(json.api_key_id, row.keyId);
  assert.equal(json.status, row.status);
  assert.equal(json.total_tokens, json.input_tokens + json.output_tokens);
  assert.equal(json.cache_tokens, 20);
  for (const field of ['client_ip', 'finished_at', 'endpoint_id', 'endpoint_name', 'resource_id', 'tpot', 'user_agent', 'input', 'output']) assert.equal(json[field], null, field);
  assert.equal(json.thinking_tokens, 0);
  assert.equal(json.ttft, 0);
  assert.equal(json.duration_ms, 0);
  assert.equal(json.is_timeout, false);
  assert.equal(json.is_canceled, true);
  const [header, values] = logsCSV([row]).replace(/^\ufeff/, '').split('\r\n').map(line => line.split(',').map(cell => cell.slice(1,-1)));
  const csv = Object.fromEntries(header.map((key, i) => [key, values[i]]));
  assert.equal(csv['客户端 IP'], '');
  assert.equal(csv['TPOT(ms)'], '');
  assert.equal(csv['输出 Tokens'], '0');
  assert.equal(csv['缓存命中 Tokens'], '20');
  assert.equal(csv['总 Tokens'], '100');
  assert.equal(csv['首 Token 时延(ms)'], '0');
  assert.equal(csv['是否超时'], 'false');
  assert.equal(csv['是否取消'], 'true');
});
