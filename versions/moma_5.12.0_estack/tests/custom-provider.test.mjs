import test from 'node:test';
import assert from 'node:assert/strict';
import { createAdminSeed, commitAdminState, parseAdminState } from '../src/admin-v2/store.js';
import { appendProviderCatalogue } from '../src/admin-v2/provider-management.js';
const register = (state, provider, providerId) => commitAdminState(state, { type: 'modelOperations', operation: 'providerRegistration', data: { provider, providerId, connections: [{ protocol: 'OpenAI', baseUrl: 'https://custom.example.invalid/v1', credentialRef: 'env:CUSTOM_KEY', timeoutSeconds: 60 }] } });
const input = { name: '自定义服务商测试', code: '  MY-Service  ', sourceType: 'thirdParty', integrationType: '其他兼容服务', catalogModelIds: [] };

test('custom supplier creation lowercases unique codes, preserves existing identities and persists catalogue drafts', () => {
  const seed = createAdminSeed(), original = JSON.stringify(seed);
  const ids = appendProviderCatalogue([], ' Model/Alpha\r\n\nModel/Beta\r\nModel/Alpha\n');
  const state = register(seed, { ...input, catalogModelIds: ids });
  const provider = state.providers.find(p => p.code === 'my-service');
  assert.ok(provider);
  assert.deepEqual(provider.catalogModelIds, ['Model/Alpha', 'Model/Beta']);
  assert.equal(JSON.stringify(seed), original);
  for (const saved of seed.providers) assert.deepEqual(state.providers.find(p => p.id === saved.id), saved);
  assert.deepEqual(state.endpoints.filter(item => item.providerId !== provider.id), seed.endpoints);
  assert.equal(state.endpoints.filter(item => item.providerId === provider.id).length, 1);
  assert.deepEqual(state.modelSupplies, seed.modelSupplies);
  assert.deepEqual(parseAdminState(JSON.stringify(state)).providers.find(p => p.id === provider.id), provider);
  assert.throws(() => register(state, { ...input, name: '另一个名称', code: 'MY-SERVICE' }), /不可重复/);
  assert.throws(() => register(state, { ...input, name: '第三个名称', code: 'MOMA' }), /不可重复/);
  const edited = register(state, { ...provider, code: 'attempt-change', catalogModelIds: ['Model/Beta'] }, provider.id);
  assert.equal(edited.providers.find(p => p.id === provider.id).code, 'my-service');
  assert.deepEqual(edited.providers.find(p => p.id === provider.id).catalogModelIds, ['Model/Alpha', 'Model/Beta']);
});

test('catalogue batch append keeps Model ID casing, skips duplicate lines and retains existing rows', () => {
  const current = ['Model/Alpha'];
  assert.deepEqual(appendProviderCatalogue(current, 'Model/Alpha\nModel/Beta\nmodel/alpha\n'), ['Model/Alpha', 'Model/Beta', 'model/alpha']);
  assert.deepEqual(current, ['Model/Alpha']);
  for (const text of ['', ' \n ', 'Model/Alpha']) assert.throws(() => appendProviderCatalogue(current, text), /请输入|均已存在/);
  assert.throws(() => appendProviderCatalogue(current, 'valid\ninvalid model'), /有效 Model ID/);
  assert.throws(() => appendProviderCatalogue(current, 'x'.repeat(201)), /有效 Model ID/);
  const full = Array.from({ length: 2000 }, (_, i) => `Model/${i}`);
  assert.throws(() => appendProviderCatalogue(full, 'extra'), /最多 2000/);
  assert.equal(full.length, 2000);
});

test('case-insensitive uniqueness includes historical codes without rewriting saved records', () => {
  const seed = createAdminSeed();
  seed.providers[0].code = 'HISTORICAL';
  const original = JSON.stringify(seed);
  assert.throws(() => register(seed, { ...input, code: 'historical' }), /不可重复/);
  assert.equal(JSON.stringify(seed), original);
  for (const code of ['', '1start', 'has space', '中文', 'a'.repeat(33)]) assert.throws(() => register(seed, { ...input, code }), /英文编码/);
  assert.throws(() => register(seed, { ...input, catalogModelIds: ['bad model'] }), /有效 Model ID/);
  assert.equal(JSON.stringify(seed), original);
});
