import test from 'node:test';
import assert from 'node:assert/strict';
import { customForwarding, normalizeCustomAdapter, parseCustomManagement } from '../src/admin-v2/channel-custom-adapter.js';

const base = { task: 'video', method: 'POST', path: '/jobs', match: 'video-*', conversion: 'task', idPath: '$.id', statusPath: '/jobs/{id}', auth: 'header', header: 'x-api-key' };
const endpoint = { baseUrl: 'https://example.invalid/entry' };
const config = { routes: [base, { ...base, match: '', path: '/fallback' }],
  models: { method: 'GET', path: '/partner/models', listPath: '$.data', idPath: '$.id', completePath: '$.complete' },
  balance: { method: 'GET', path: '/partner/balance', amountPath: '$.remaining', unitPath: '$.currency' } };

test('custom routing matches in order on the configured origin and checks a final fallback', () => {
  const adapter = normalizeCustomAdapter(config);
  assert.equal(customForwarding(adapter, endpoint, 'video', 'video-v2').url, 'https://example.invalid/jobs');
  assert.equal(customForwarding(adapter, endpoint, 'video', 'demo').url, 'https://example.invalid/fallback');
  assert.equal(customForwarding(adapter, endpoint, 'audio', 'demo'), null);
  assert.throws(() => normalizeCustomAdapter({ ...adapter, routes: [...adapter.routes].reverse() }), /放在最后/);
  assert.throws(() => normalizeCustomAdapter({ ...adapter, routes: [{ ...base, path: '//external.invalid/job' }] }), /路径/);
  assert.throws(() => normalizeCustomAdapter({ ...adapter, routes: [{ ...base, statusPath: '/jobs' }] }), /查询路径/);
});

test('management parsers preserve completeness, zero balances and reported units', () => {
  const adapter = normalizeCustomAdapter(config);
  assert.deepEqual(parseCustomManagement(adapter, 'models', { data: [{ id: 'example' }], complete: false }), { models: ['example'], complete: false });
  assert.deepEqual(parseCustomManagement(adapter, 'balance', { remaining: 0, currency: '试用点数' }), { amount: 0, unit: '试用点数', used: null });
  assert.throws(() => parseCustomManagement(adapter, 'balance', { currency: 'CNY' }), /解析失败/);
  assert.throws(() => normalizeCustomAdapter({ ...adapter, balance: { ...adapter.balance, unitPath: '$.authorization' } }), /响应字段路径/);
});

test('each forwarding rule can bind an independent credential by ID only', () => {
  const route = { ...base, auth: 'credential', credentialId: 'provider-reference-1' };
  const adapter = normalizeCustomAdapter({ ...config, routes: [route] });
  assert.equal(customForwarding(adapter, endpoint, 'video', 'video-v2').credentialId, 'provider-reference-1');
  assert.equal(Object.hasOwn(adapter.routes[0], 'header'), false);
  assert.throws(() => normalizeCustomAdapter({ ...config, routes: [{ ...route, credentialId: 'sk-opaque-value' }] }), /独立凭证引用/);
});
