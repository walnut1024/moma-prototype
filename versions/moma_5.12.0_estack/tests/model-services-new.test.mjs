import assert from 'node:assert/strict';
import test from 'node:test';
import { adminBreadcrumbs } from '../src/admin-v2/breadcrumbs.mjs';
import { canAccessPage, pageFromHash } from '../src/admin-v2/navigation.mjs';
import {
  channelSetupIssue, contextRoutingEnabled, rateIssue, readNewServices, saveNewServices, serviceChannelShares,
  serviceIdentityIssue, tenantServiceRates,
} from '../src/admin-v2/model-services-new.js';

test('the new service catalogue and detail have independent routes', () => {
  const params = new URLSearchParams({ service: 'new-service', tab: 'channels' });
  assert.equal(pageFromHash('#/admin-2/listing-new?' + params), 'listing-new');
  assert.equal(canAccessPage('平台管理员', 'listing-new'), true);
  assert.equal(canAccessPage('运维人员', 'listing-new'), false);
  assert.deepEqual(adminBreadcrumbs('listing-new', params).slice(1), [
    { label: '模型服务', href: '#/admin-2/listing-new' }, { label: '服务详情' },
  ]);
});

test('context precedes priority and qualified channels share an equal-priority group by weight', () => {
  const channels = [
    { id: 'short', enabled: true, priority: 0, weight: 80, context: 32000 },
    { id: 'long', enabled: true, priority: 0, weight: 20, context: 128000 },
    { id: 'backup', enabled: true, priority: 1, weight: 50, context: 256000 },
    { id: 'unavailable', enabled: true, reason: '验证失效', priority: 0, weight: 80, context: 128000 },
    { id: 'disabled', enabled: false, priority: 0, weight: 80, context: 128000 },
  ];
  assert.deepEqual([...serviceChannelShares(channels, 8000)], [['short', 0.8], ['long', 0.2]]);
  assert.deepEqual([...serviceChannelShares(channels, 60000)], [['long', 1]]);
  assert.deepEqual([...serviceChannelShares(channels, 160000)], [['backup', 1]]);
  assert.deepEqual([...serviceChannelShares(channels, 300000)], []);
  assert.equal(channelSetupIssue({ tokenizer: 'test', channels }), '');
  assert.match(channelSetupIssue({ tokenizer: 'test', channels: [{ enabled: true, context: null }] }), /上下文长度/);
});

test('the context switch preserves saved tokenizers and channel capacities while paused', () => {
  const service = { tokenizer: 'test', channels: [{ enabled: true, context: 32000 }] };
  const paused = { ...service, contextPaused: true };
  assert.equal(contextRoutingEnabled(service), true);
  assert.equal(contextRoutingEnabled(paused), false);
  assert.equal(channelSetupIssue({ ...paused, channels: [{ enabled: true, context: null }] }), '');
  const resumed = { ...paused, contextPaused: false };
  assert.equal(contextRoutingEnabled(resumed), true);
  assert.equal(resumed.tokenizer, 'test');
  assert.equal(resumed.channels[0].context, 32000);
});

test('tenant limits inherit each metric independently and keep explicit zero', () => {
  const service = { type: 'text', limits: { L3: { rpm: 120, tpm: 80000 } } };
  assert.deepEqual(tenantServiceRates(service, { level: 'L3', rates: { rpm: 0, tpm: null } }), { rpm: 0, tpm: 80000 });
  assert.deepEqual(tenantServiceRates({ ...service, type: 'audio' }, { level: 'L0', rates: {} }), { rpm: null });
  assert.equal(rateIssue({ rpm: 0, tpm: null }), '');
  assert.match(rateIssue({ rpm: -1 }), /非负整数/);
});

test('local persistence preserves existing workspace records and rejects a stale save', () => {
  const values = new Map([['old-workspace', 'unchanged']]);
  const storage = { getItem: key => values.get(key), setItem: (key, value) => values.set(key, value) };
  const original = readNewServices(storage);
  const rows = [{ id: 'service-a', callId: 'sample/a', channels: [], grants: [], limits: {} }];
  saveNewServices(storage, original, rows);
  assert.deepEqual(readNewServices(storage), rows);
  assert.throws(() => saveNewServices(storage, original, []), /其他页面/);
  assert.equal(values.get('old-workspace'), 'unchanged');
  assert.match(serviceIdentityIssue({ name: 'Service', callId: 'sample/a' }, rows), /已存在/);
});
