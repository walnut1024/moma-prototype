import test from 'node:test';
import assert from 'node:assert/strict';
import { initialModelWorkspace } from '../server/model-repository.js';
import { commitAdminState } from '../src/admin-v2/state-transaction.js';
import { providerApiKeysDraft, providerApiKeyRows, providerTransaction } from '../src/admin-v2/provider-management.js';
import { supplierChannelResources } from '../src/admin-v2/supplier-resources.js';
import { providerKeyGroups } from '../src/admin-v2/provider-key-groups.js';

const document = () => ({ provider: { name: '多地址密钥服务商', code: 'multi-address-keys', source_type: 'thirdParty', website: 'https://example.invalid', description: '描'.repeat(300), logo: 'https://example.invalid/logo.png', models: [], connections: [1, 2].map(index => ({ connection_id: 'address-' + index, base_url: `https://api${index}.example.invalid/v1`, protocol: 'OpenAI', interface_type: 'openai' })) } });
const run = (state, data) => commitAdminState(state, { type: 'modelOperations', operation: 'providerIntake', data }, '平台管理员');

test('intake atomically saves two URLs, two masked keys and the requested profile fields without creating model services', async () => {
  const state = initialModelWorkspace(), before = structuredClone(state), file = document();
  const secrets = ['fixture-first-secret-123456', 'fixture-second-secret-654321'];
  const { apiKeys } = await providerApiKeysDraft(secrets);
  const next = run(state, { document: file, apiKeys, confirmed: true }), provider = next.providers.find(row => row.code === file.provider.code);
  assert.deepEqual(supplierChannelResources(next, provider).map(row => row.baseUrl).sort(), file.provider.connections.map(row => row.base_url).sort());
  assert.equal(providerApiKeyRows(next, provider).length, 2);
  assert.equal(provider.apiKeys[0].id, provider.defaultApiKeyId);
  assert.deepEqual([provider.website, provider.logo, provider.description], [file.provider.website, file.provider.logo, file.provider.description]);
  for (const secret of secrets) assert(!JSON.stringify(next).includes(secret));
  for (const key of ['models', 'modelTemplates', 'modelSupplies', 'modelSalePrices']) assert.deepEqual(next[key], before[key]);
  assert.deepEqual(state, before);
});

test('description, immutable code, malformed keys, duplicate keys and invalid addresses are rejected without partial intake', async () => {
  const state = initialModelWorkspace(), before = structuredClone(state), { apiKeys } = await providerApiKeysDraft(['fixture-first-secret-123456']);
  for (const change of [
    file => { file.provider.description += '超'; },
    file => { file.provider.connections[1].base_url = 'https://user:secret@example.invalid/v1'; },
    file => { file.provider.source_type = 'other'; },
    file => { delete file.provider.source_type; },
  ]) { const file = document(); change(file); assert.throws(() => run(state, { document: file, apiKeys, confirmed: true })); assert.deepEqual(state, before); }
  for (const keys of [[...apiKeys, ...apiKeys], [{ ...apiKeys[0], api_key: 'forbidden' }], [{ fingerprint: 'x', maskedKey: 'bad' }], Array(21).fill(apiKeys[0])]) {
    assert.throws(() => run(state, { document: document(), apiKeys: keys, confirmed: true })); assert.deepEqual(state, before);
  }
  const saved = run(state, { document: document(), confirmed: true }), provider = saved.providers.find(row => row.code === 'multi-address-keys');
  for (const operation of ['summary', 'profile']) assert.throws(() => providerTransaction(saved, { operation, objectId: provider.id, data: { ...provider, expectedUpdatedAt: provider.updatedAt, code: 'changed-code' } }), /不可修改/);
  assert.throws(() => commitAdminState(state, { type: 'modelOperations', operation: 'providerIntake', data: { document: document(), confirmed: true } }, '只读观察员'), /无权/);
});

test('intake creates a named key group atomically and preserves key priority without exposing secrets', async () => {
  const state = initialModelWorkspace(), before = structuredClone(state);
  const { apiKeys } = await providerApiKeysDraft(['fixture-group-first-123456', 'fixture-group-second-654321']);
  const next = run(state, { document: document(), apiKeys, key_group_name: '  主账号组  ', confirmed: true });
  const provider = next.providers.find(row => row.code === 'multi-address-keys');
  const groups = providerKeyGroups(provider), group = groups.find(row => row.name === '主账号组');
  assert.deepEqual(group.keyIds, provider.apiKeys.map(row => row.id));
  assert.deepEqual(provider.apiKeys.map(row => row.fingerprint), apiKeys.map(row => row.fingerprint));
  assert.deepEqual(groups.find(row => row.id === 'default').keyIds, []);
  assert.equal(provider.defaultApiKeyId || '', '');
  assert(!JSON.stringify(next).includes('fixture-group-first-123456'));
  for (const name of ['', '默认 API 密钥组', 'x'.repeat(61), 'bad\nname', 42]) {
    assert.throws(() => run(state, { document: document(), apiKeys, key_group_name: name, confirmed: true }));
    assert.deepEqual(state, before);
  }
});
