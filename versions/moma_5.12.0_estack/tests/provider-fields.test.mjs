import test from 'node:test';
import assert from 'node:assert/strict';
import { initialModelWorkspace } from '../server/model-repository.js';
import { commitAdminState } from '../src/admin-v2/state-transaction.js';
import { providerApiKeysDraft, providerApiKeyRows } from '../src/admin-v2/provider-management.js';
import { supplierChannelResources } from '../src/admin-v2/supplier-resources.js';
import { providerKeyGroups } from '../src/admin-v2/provider-key-groups.js';

const profile = { name: '多地址密钥服务商', code: 'multi-address-keys', sourceType: 'thirdParty',
  website: 'https://example.invalid', description: '描'.repeat(300), logo: 'https://example.invalid/logo.png' };
const owner = state => state.providers.find(row => row.code === profile.code);
const run = (state, operation, values, role = '平台管理员') => commitAdminState(state, {
  type: 'modelOperations', operation: 'provider', data: { operation, objectId: owner(state)?.id, values },
}, role);

test('provider and connection commands save two URLs, masked keys and profile fields without creating services', async () => {
  const state = initialModelWorkspace(), before = structuredClone(state);
  const secrets = ['fixture-first-secret-123456', 'fixture-second-secret-654321'];
  const { apiKeys } = await providerApiKeysDraft(secrets);
  let next = run(state, 'create', profile);
  next = run(next, 'addApiKeys', { apiKeys, standalone: true });
  const provider = owner(next);
  const urls = ['https://api1.example.invalid/v1', 'https://api2.example.invalid/v1'];
  for (const [index, baseUrl] of urls.entries()) {
    next = run(next, 'supplierChannelSave', {
      name: '连接 ' + index, protocol: 'OpenAI', interfaceType: 'openai', baseUrl,
      authMode: 'specific', apiKeyId: provider.apiKeys[0].id,
    });
  }
  assert.deepEqual(supplierChannelResources(next, provider).map(row => row.baseUrl).sort(), urls);
  assert.equal(providerApiKeyRows(next, provider).length, 2);
  assert.equal(provider.defaultApiKeyId || '', '');
  assert.ok(provider.apiKeys.every(key => key.standalone));
  assert.ok(supplierChannelResources(next, provider).every(row =>
    row.authMode === 'specific' && row.apiKeyId === provider.apiKeys[0].id && !row.keyGroupId));
  assert.deepEqual([provider.website, provider.logo, provider.description], [profile.website, profile.logo, profile.description]);
  for (const secret of secrets) assert(!JSON.stringify(next).includes(secret));
  for (const key of ['models', 'modelTemplates', 'modelSupplies', 'modelSalePrices']) assert.deepEqual(next[key], before[key]);
  assert.deepEqual(state, before);
});

test('provider, connection and key commands reject invalid edits without changing their input state', async () => {
  const state = initialModelWorkspace(), before = structuredClone(state), { apiKeys } = await providerApiKeysDraft(['fixture-first-secret-123456']);
  assert.throws(() => run(state, 'create', { ...profile, description: profile.description + '超' }), /300 字/);
  for (const sourceType of ['other', undefined]) {
    assert.throws(() => run(state, 'create', { ...profile, sourceType }), /供给类型/);
  }
  assert.throws(() => run(state, 'create', profile, '只读观察员'), /无权/);
  assert.deepEqual(state, before);

  const saved = run(state, 'create', profile), unchanged = structuredClone(saved), provider = owner(saved);
  for (const keys of [[...apiKeys, ...apiKeys], [{ fingerprint: 'x', maskedKey: 'bad' }], Array(21).fill(apiKeys[0])]) {
    assert.throws(() => run(saved, 'addApiKeys', { apiKeys: keys }), /API 密钥/);
  }
  for (const operation of ['summary', 'profile']) {
    assert.throws(() => run(saved, operation, { ...provider, expectedUpdatedAt: provider.updatedAt, code: 'changed-code' }), /不可修改/);
  }
  assert.throws(() => run(saved, 'supplierChannelSave', {
    name: '非法连接', protocol: 'OpenAI', interfaceType: 'openai', authMode: 'inherit',
    baseUrl: 'https://user:secret@example.invalid/v1',
  }), /地址/);
  assert.deepEqual(saved, unchanged);
});

test('key group creation and key addition preserve key priority without exposing secrets', async () => {
  const state = run(initialModelWorkspace(), 'create', profile), before = structuredClone(state);
  const { apiKeys } = await providerApiKeysDraft(['fixture-group-first-123456', 'fixture-group-second-654321']);
  const created = run(state, 'keyGroupSave', { name: '  主账号组  ' });
  const groupId = providerKeyGroups(owner(created)).find(row => row.name === '主账号组').id;
  const next = run(created, 'addApiKeys', { apiKeys, groupId });
  const provider = owner(next), groups = providerKeyGroups(provider), group = groups.find(row => row.id === groupId);
  assert.deepEqual(group.keyIds, provider.apiKeys.map(row => row.id));
  assert.deepEqual(provider.apiKeys.map(row => row.fingerprint), apiKeys.map(row => row.fingerprint));
  assert.deepEqual(groups.find(row => row.id === 'default').keyIds, []);
  assert.equal(provider.defaultApiKeyId || '', '');
  assert(!JSON.stringify(next).includes('fixture-group-first-123456'));
  for (const name of ['', '默认 API 密钥组', 'x'.repeat(61), 'bad\nname', 42]) {
    assert.throws(() => run(state, 'keyGroupSave', { name }), /密钥组/);
    assert.deepEqual(state, before);
  }
});
