import test from 'node:test';
import assert from 'node:assert/strict';
import { createAdminSeed, commitAdminState, parseAdminState } from '../src/admin-v2/store.js';
import { providerConnectionDraft } from '../src/admin-v2/provider-management.js';
import { connectionCredentialsReady, connectionTestPassed } from '../src/admin-v2/connection-state.js';
const run = (state, operation, data) => commitAdminState(state, { type: 'modelOperations', operation, data });
const provider = { name: '多连接服务商', code: 'multi-connection', sourceType: 'thirdParty', contact: '', contactInfo: '', description: '' };
const connection = async (baseUrl = 'https://provider.example.invalid/v1', inputs = ['sk-fixture-alpha-0001']) => providerConnectionDraft({ name: '服务连接', protocol: 'OpenAI', baseUrl, timeoutSeconds: 60, capacity: '', apiKeys: [], keyInputs: inputs.map(value => ({ value })) });

test('multiple connections and their keys persist atomically without plaintext or model catalogue imports', async () => {
  const seed = createAdminSeed(), before = JSON.stringify(seed);
  const connections = [await connection(), { ...await connection('https://other.example.invalid/api', ['sk-fixture-beta-0002', 'sk-fixture-beta-0003']), protocol: '其他' }];
  const state = run(seed, 'providerRegistration', { provider: { ...provider, contact: '联系人', contactInfo: 'contact@example.invalid', description: '备'.repeat(140) }, connections });
  const saved = state.providers.find(item => item.code === provider.code), endpoints = state.endpoints.filter(item => item.providerId === saved.id).sort((a, b) => a.name.localeCompare(b.name));
  assert.equal(endpoints.length, 2);
  assert.deepEqual(endpoints.map(item => item.apiKeys.length), [1, 2]);
  assert.equal(endpoints[1].protocol, '其他');
  assert.ok(endpoints.every(item => item.status === '草稿' && !connectionTestPassed(item) && connectionCredentialsReady(item, saved)));
  assert.equal(saved.contactInfo, 'contact@example.invalid');
  assert.deepEqual(saved.catalogModelIds, []);
  assert.deepEqual(state.models, seed.models);
  assert.deepEqual(state.modelSupplies, seed.modelSupplies);
  const serialized = JSON.stringify(state);
  for (const key of ['sk-fixture-alpha-0001', 'sk-fixture-beta-0002', 'sk-fixture-beta-0003']) assert.ok(!serialized.includes(key));
  assert.deepEqual(parseAdminState(serialized).endpoints, state.endpoints);
  assert.equal(JSON.stringify(seed), before);
  assert.throws(() => run(seed, 'providerRegistration', { provider, connections: [connections[0], { ...connections[1], baseUrl: 'invalid' }] }), /服务地址/);
  assert.equal(JSON.stringify(seed), before);
});

test('third-party keys are mandatory per connection; self-hosted HTTP may omit keys', async () => {
  const seed = createAdminSeed(), empty = await connection('http://self.example.invalid/v1', []);
  assert.throws(() => run(seed, 'providerRegistration', { provider, connections: [{ ...empty, baseUrl: 'https://third.example.invalid/v1' }] }), /每个连接至少/);
  const state = run(seed, 'providerRegistration', { provider: { ...provider, sourceType: 'selfHosted' }, connections: [empty] });
  const saved = state.providers.find(item => item.code === provider.code), endpoint = state.endpoints.find(item => item.providerId === saved.id);
  assert.equal(endpoint.credentialRef, '');
  assert.deepEqual(endpoint.apiKeys, []);
  assert.equal(connectionCredentialsReady(endpoint, saved), true);
  const checked = run(state, 'checkConnection', { endpointId: endpoint.id });
  assert.ok(connectionTestPassed(checked.endpoints.find(item => item.id === endpoint.id)));
  for (const invalid of [{ ...empty, protocol: 'invalid' }, { ...empty, baseUrl: 'https://user:pass@example.invalid/v1' }]) assert.throws(() => run(seed, 'providerRegistration', { provider: { ...provider, sourceType: 'selfHosted' }, connections: [invalid] }));
});

test('required identity, source, connections and optional minimum-length notes are checked on save', async () => {
  const seed = createAdminSeed(), connections = [await connection()];
  for (const [patch, message] of [[{ name: '' }, /供应商名称/], [{ code: '' }, /英文编码/], [{ sourceType: '' }, /供给类型/], [{ description: '备'.repeat(2001) }, /最多 2000/]]) assert.throws(() => run(seed, 'providerRegistration', { provider: { ...provider, ...patch }, connections }), message);
  for (const missing of [undefined, []]) assert.throws(() => run(seed, 'providerRegistration', { provider, connections: missing }), /至少添加/);
  await assert.rejects(() => connection(undefined, ['duplicate-key-0001', 'duplicate-key-0001']), /相同/);
  await assert.rejects(() => connection(undefined, ['short']), /12–512/);
});

test('editing connection keys invalidates dependent checks and keeps other connections and catalogue', async () => {
  let state = run(createAdminSeed(), 'providerRegistration', { provider, connections: [await connection(), await connection('https://second.example.invalid/v1')] });
  const saved = state.providers.find(item => item.code === provider.code), endpoints = state.endpoints.filter(item => item.providerId === saved.id), endpoint = endpoints[0];
  state = run(state, 'checkConnection', { endpointId: endpoint.id });
  const checked = state.endpoints.find(item => item.id === endpoint.id);
  const draft = await providerConnectionDraft({ ...checked, keyInputs: [{ value: 'sk-replaced-fixture-0002' }] });
  state = run(state, 'provider', { operation: 'connection', objectId: endpoint.id, values: { ...draft, providerId: saved.id } });
  const edited = state.endpoints.find(item => item.id === endpoint.id);
  assert.equal(edited.apiKeys.length, 2);
  assert.equal(edited.status, '停用');
  assert.equal(edited.connectionTest, null);
  assert.deepEqual(state.endpoints.find(item => item.id === endpoints[1].id), endpoints[1]);
  assert.deepEqual(state.providers.find(item => item.id === saved.id).catalogModelIds, []);
});
