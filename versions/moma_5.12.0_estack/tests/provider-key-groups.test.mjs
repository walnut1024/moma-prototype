import test from 'node:test';
import assert from 'node:assert/strict';
import { parseAdminState, commitAdminState, persistModelAction } from '../src/admin-v2/store.js';
import { providerKeyGroups, providerKeyGroupKeys } from '../src/admin-v2/provider-key-groups.js';
import { connectionKeys, connectionCredentialsReady, connectionTestPassed } from '../src/admin-v2/connection-state.js';
import { providerApiKeysDraft, providerApiKeyRows, providerModelConnectivityTest } from '../src/admin-v2/provider-management.js';
import { catalogueChannels } from '../src/admin-v2/provider-channels.js';

const providerId = 'provider-moma';
const owner = state => state.providers.find(row => row.id === providerId);
const endpoint = (state, code = 'CH-001') => state.endpoints.find(row => row.channelCode === code);
const action = (operation, values) => ({ type: 'modelOperations', operation: 'provider', data: { operation, objectId: providerId, values } });
const run = (state, operation, values) => commitAdminState(state, action(operation, values));
const createValues = { libraryId: 'model-2', modelId: 'GLM-5.2', name: '验收专用渠道', upstreamModelId: 'GLM-5.2', protocol: 'OpenAI', baseUrl: 'https://qa.example.invalid/v1/chat/completions', keyGroupId: 'default', scenarios: [{ name: '输入 Token', listPrice: '0', unit: '百万 Token', currency: 'CNY' }, { name: '输出 Token', listPrice: '8.5', unit: '百万 Token', currency: 'CNY' }] };

test('group read views preserve old credentials and expose unassigned keys in the default group', () => {
  const state = parseAdminState(null), provider = owner(state), before = structuredClone(state);
  const groups = providerKeyGroups(provider);
  assert.equal(groups[0].id, 'default');assert.equal(groups[0].name, '默认 API 密钥组');
  assert.equal(groups[0].keyIds[0], provider.defaultApiKeyId);
  assert.deepEqual(new Set(groups[0].keyIds), new Set(provider.apiKeys.map(key => key.id)));
  assert.equal(connectionKeys(endpoint(state), provider)[0].id, provider.defaultApiKeyId);
  assert.equal(connectionKeys(endpoint(state, 'CH-002'), provider)[0].id, 'KEY-003');
  assert.deepEqual(state, before);
});

test('group creation, rename and group-scoped key addition preserve identities and masked storage', async () => {
  const state = parseAdminState(null), created = run(state, 'keyGroupSave', { name: '生产专用组' });
  const group = owner(created).apiKeyGroups.find(row => row.id !== 'default');
  const renamed = run(created, 'keyGroupSave', { groupId: group.id, name: '国内生产组' });
  assert.equal(owner(renamed).apiKeyGroups.find(row => row.id === group.id).name, '国内生产组');
  const secret = 'test-group-key-only-00112233', draft = await providerApiKeysDraft([secret]);
  const next = run(renamed, 'addApiKeys', { ...draft, groupId: group.id });
  const keys = providerKeyGroupKeys(owner(next), group.id);
  assert.equal(keys.length, 1);assert.equal(keys[0].fingerprint, draft.apiKeys[0].fingerprint);
  assert.equal(owner(next).defaultApiKeyId, owner(state).defaultApiKeyId);
  assert.ok(!JSON.stringify(next).includes(secret));
  assert.throws(() => run(next, 'keyGroupSave', { name: '国内生产组' }), /已存在/);
  assert.throws(() => run(next, 'keyGroupSave', { groupId: 'default', name: '新默认' }), /不可重命名/);
  assert.throws(() => run(next, 'addApiKeys', { ...draft, groupId: 'foreign-group' }), /密钥组不存在/);
});

test('channel creation atomically creates a fresh endpoint and its model quote using the actual UI payload', () => {
  const state = parseAdminState(null), before = structuredClone(state);
  const next = run(state, 'supplierChannelCreate', createValues), created = next.endpoints.find(row => !state.endpoints.some(old => old.id === row.id));
  assert.equal(next.endpoints.length, state.endpoints.length + 1);assert.ok(created.channelCode);
  assert.equal(created.authMode, 'group');assert.equal(created.keyGroupId, 'default');assert.equal(created.status, '草稿');
  assert.equal(connectionKeys(created, owner(next))[0].id, owner(state).defaultApiKeyId);
  const association = catalogueChannels(next, owner(next), createValues.modelId).find(row => row.endpointId === created.id);
  assert.equal(association.upstreamModelId, createValues.upstreamModelId);
  assert.deepEqual(association.pricing.scenarios.map(row => row.listPrice), [0, 8500000]);assert.equal(association.enabled, false);
  for (const field of ['modelSupplies', 'models', 'serviceRoutes', 'supplyPrices', 'modelSalePrices']) assert.deepEqual(next[field], state[field]);
  assert.deepEqual(state, before);
  for (const patch of [{ endpointId: endpoint(state).id }, { channelId: 'existing-channel' }, { libraryId: 'missing-model' }, { keyGroupId: 'missing-group' }, { baseUrl: 'https://qa.example.invalid/v1' }, { scenarios: [] }, { scenarios: [{ ...createValues.scenarios[0], listPrice: '' }] }]) {
    assert.throws(() => run(state, 'supplierChannelCreate', { ...createValues, ...patch }));assert.deepEqual(state, before);
  }
  assert.throws(() => run(next, 'supplierChannelCreate', createValues), /名称不可重复/);
  assert.throws(() => persistModelAction(state, action('supplierChannelCreate', createValues), { getItem: () => JSON.stringify(state), setItem: () => { throw Error('quota'); } }), /quota/);
  assert.deepEqual(state, before);
});

test('major-key selection, disabled majors and deletion invalidate group channels without silent failover', () => {
  const state = run(parseAdminState(null), 'supplierChannelCreate', createValues), provider = owner(state);
  const channel = state.endpoints.find(row => row.name === createValues.name), key = provider.apiKeys.find(row => row.id === 'KEY-002');
  const values = { groupId: 'default', keyId: key.id };
  assert.throws(() => run(state, 'keyGroupPrimary', values), /确认/);
  const primary = run(state, 'keyGroupPrimary', { ...values, confirmed: true });
  assert.equal(owner(primary).defaultApiKeyId, key.id);assert.equal(connectionKeys(primary.endpoints.find(row => row.id === channel.id), owner(primary))[0].id, key.id);
  assert.equal(connectionTestPassed(endpoint(primary)), false);assert.deepEqual(endpoint(primary, 'CH-002'), endpoint(state, 'CH-002'));
  const disabled = run(primary, 'toggleApiKey', { keyId: key.id, expectedFingerprint: key.fingerprint, enabled: false, confirmed: true });
  assert.equal(connectionCredentialsReady(disabled.endpoints.find(row => row.id === channel.id), owner(disabled)), false);
  assert.equal(connectionKeys(disabled.endpoints.find(row => row.id === channel.id), owner(disabled)).length, 0);
  assert.ok(connectionKeys(disabled.endpoints.find(row => row.id === channel.id), owner(disabled), true).length > 1);
  const removed = run(primary, 'deleteApiKey', { keyId: key.id, expectedFingerprint: key.fingerprint, confirmed: true });
  assert.ok(providerKeyGroups(owner(removed)).every(group => !group.keyIds.includes(key.id)));
  assert.equal(connectionKeys(removed.endpoints.find(row => row.id === channel.id), owner(removed))[0].id, owner(removed).defaultApiKeyId);
});

test('only empty, unreferenced custom groups can be deleted; keys never move implicitly', async () => {
  const state = run(parseAdminState(null), 'keyGroupSave', { name: '临时组' }), group = owner(state).apiKeyGroups.find(row => row.id !== 'default');
  const added = run(state, 'addApiKeys', { ...await providerApiKeysDraft(['test-group-delete-local-223344']), groupId: group.id });
  const before = structuredClone(added);
  assert.throws(() => run(added, 'keyGroupDelete', { groupId: group.id, confirmed: true }), /移除组内/);
  assert.deepEqual(added, before);
  assert.throws(() => run(added, 'keyGroupDelete', { groupId: 'default', confirmed: true }), /不可删除/);
  const linked = run(state, 'supplierChannelCreate', { ...createValues, keyGroupId: group.id });
  assert.throws(() => run(linked, 'keyGroupDelete', { groupId: group.id, confirmed: true }), /仍被渠道引用/);
  const key = providerKeyGroupKeys(owner(added), group.id)[0];
  const emptied = run(added, 'deleteApiKey', { keyId: key.id, expectedFingerprint: key.fingerprint, confirmed: true });
  assert.throws(() => run(emptied, 'keyGroupDelete', { groupId: group.id }), /确认/);
  const removed = run(emptied, 'keyGroupDelete', { groupId: group.id, confirmed: true });
  assert.equal(providerKeyGroups(owner(removed)).some(row => row.id === group.id), false);
  assert.deepEqual(owner(removed).apiKeys, owner(state).apiKeys);
});

test('explicit group selection imports legacy key metadata without changing original credentials or unrelated fields', async () => {
  const state = parseAdminState(null), provider = owner(state), legacy = endpoint(state, 'CH-002');
  const draft = await providerApiKeysDraft(['test-legacy-group-reference-445566']);draft.apiKeys[0].id = 'legacy-group-key';
  delete legacy.authMode;delete legacy.apiKeyId;legacy.apiKeys = draft.apiKeys;legacy.credentialRef = '';
  const keys = providerApiKeyRows(state, provider).map(row => row.apiKey), before = structuredClone(legacy);
  assert.ok(providerKeyGroups(provider, keys)[0].keyIds.includes('legacy-group-key'));
  assert.ok(providerKeyGroupKeys(provider, 'default', true, keys).some(key => key.id === 'legacy-group-key'));
  const created = run(state, 'supplierChannelCreate', createValues);
  assert.deepEqual(endpoint(created, 'CH-002'), before);
  assert.deepEqual(owner(created).apiKeys.find(key => key.id === 'legacy-group-key'), draft.apiKeys[0]);
  const selected = run(created, 'supplierChannelSave', { mode: 'credentials', endpointId: legacy.id, authMode: 'group', keyGroupId: 'default', confirmed: true, name: 'must-ignore', baseUrl: 'invalid-url' });
  const saved = selected.endpoints.find(row => row.id === legacy.id);
  assert.equal(saved.name, before.name);assert.equal(saved.baseUrl, before.baseUrl);assert.equal(saved.authMode, 'group');
  assert.equal(saved.keyGroupId, 'default');assert.equal(saved.apiKeys.length, 0);assert.equal(saved.status, '停用');
  assert.deepEqual(owner(selected).apiKeys.find(key => key.id === 'legacy-group-key'), draft.apiKeys[0]);
});

test('group operations retain role, conflict and storage-failure boundaries', () => {
  const state = parseAdminState(null), input = action('keyGroupSave', { name: '不应落盘' }), before = JSON.stringify(state);
  assert.throws(() => commitAdminState({ ...state, currentRole: '运维人员' }, input), /无权/);
  assert.throws(() => persistModelAction(state, input, { getItem: () => JSON.stringify({ ...state, revision: state.revision + 1 }), setItem: () => assert.fail() }), /数据已变化/);
  assert.throws(() => persistModelAction(state, input, { getItem: () => before, setItem: () => { throw Error('quota'); } }), /quota/);
  assert.equal(JSON.stringify(state), before);
});

test('model connection previews use only the current group major and cannot bypass a disabled major', () => {
  const state = run(parseAdminState(null), 'supplierChannelCreate', createValues), provider = owner(state);
  const channel = state.endpoints.find(row => row.name === createValues.name);
  const values = { providerId, endpointId: channel.id, modelId: createValues.modelId, upstreamId: createValues.upstreamModelId, prompt: '连接检查', scenario: 'success' };
  assert.equal(providerModelConnectivityTest(state, values).keyId, provider.defaultApiKeyId);
  assert.throws(() => providerModelConnectivityTest(state, { ...values, keyId: 'KEY-002' }), /主要密钥/);
  const key = provider.apiKeys.find(row => row.id === provider.defaultApiKeyId);
  const disabled = run(state, 'toggleApiKey', { keyId: key.id, expectedFingerprint: key.fingerprint, enabled: false, confirmed: true });
  assert.throws(() => providerModelConnectivityTest(disabled, values), /主要密钥/);
  assert.throws(() => providerModelConnectivityTest(disabled, { ...values, keyId: key.id }), /主要密钥/);
});

test('adding the first key to a referenced empty group invalidates its channels and preserves unrelated channels', async () => {
  const state = run(parseAdminState(null), 'keyGroupSave', { name: '空组' }), groupId = owner(state).apiKeyGroups.find(row => row.id !== 'default').id;
  const created = run(state, 'supplierChannelCreate', { ...createValues, keyGroupId: groupId }), channel = created.endpoints.find(row => row.name === createValues.name);
  assert.equal(connectionCredentialsReady(channel, owner(created)), false);
  const next = run(created, 'addApiKeys', { ...await providerApiKeysDraft(['test-first-empty-group-key-556677']), groupId });
  const current = next.endpoints.find(row => row.id === channel.id);
  assert.equal(connectionCredentialsReady(current, owner(next)), true);assert.notEqual(current.credentialVersion, channel.credentialVersion);
  assert.equal(current.status, '停用');assert.deepEqual(endpoint(next), endpoint(created));
});

test('deleting a legacy default major imports the next original key so inherited channels stay coherent', () => {
  const state = parseAdminState(null), provider = owner(state), legacy = endpoint(state, 'CH-002'), keys = structuredClone(provider.apiKeys.slice(0, 2));
  provider.apiKeys = [];delete provider.defaultApiKeyId;
  delete legacy.authMode;delete legacy.apiKeyId;legacy.apiKeys = keys;
  const primary = run(state, 'keyGroupPrimary', { groupId: 'default', keyId: keys[0].id, confirmed: true });
  assert.equal(owner(primary).apiKeys.length, 1);
  const next = run(primary, 'deleteApiKey', { keyId: keys[0].id, expectedFingerprint: keys[0].fingerprint, confirmed: true });
  assert.equal(owner(next).defaultApiKeyId, keys[1].id);
  assert.equal(connectionKeys(endpoint(next), owner(next))[0].id, keys[1].id);
  assert.equal(connectionKeys(endpoint(next, 'CH-002'), owner(next))[0].id, keys[1].id);
  assert.equal(connectionTestPassed(endpoint(next)), false);
});
