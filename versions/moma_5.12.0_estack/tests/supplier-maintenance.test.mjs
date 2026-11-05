import test from 'node:test';
import assert from 'node:assert/strict';
import { parseAdminState, commitAdminState, persistModelAction } from '../src/admin-v2/store.js';
import { withAdminSession } from './admin-session-fixture.mjs';
import { normalizeSupplyProfile, activeSupplierListPrice } from '../src/admin-v2/supplier-model-maintenance.js';
import { connectionKeys, connectionFingerprint, normalizeChannelKeyPool } from '../src/admin-v2/connection-state.js';
import { channelCandidateStatus, candidateTestPlan } from '../src/admin-v2/channel-change-management.js';
import { supplierChannelAssociations } from '../src/admin-v2/supplier-resources.js';
import { prepareCandidateTest, submitCandidateTest, recoverCandidateTest, candidateTestReceipt } from '../src/admin-v2/candidate-tests.js';
import { prepareServerChannel } from '../src/admin-v2/onboarding-client.js';
import { getMockChannelSnapshots } from '../src/admin-v2/mock-onboarding-service.js';
import { planMockOnboardingSync } from '../src/admin-v2/mock-onboarding-sync.js';

const owner = state => state.providers.find(row => row.id === 'provider-moma');
const entry = state => owner(state).catalogModels.find(row => row.modelId === 'GLM-5.2');
const action = (operation, values, providerId = 'provider-moma') => ({ type: 'modelOperations', operation: 'provider', data: { operation, objectId: providerId, values: { modelId: 'GLM-5.2', ...values } } });
const run = (state, operation, values) => commitAdminState(state, action(operation, values));
const initial = () => withAdminSession(parseAdminState(null));
const profile = { capabilities: { tools: false, context: '128000', output: '4000' }, parameters: [{ name: 'temperature', defaultValue: '0.5', range: '0–1', required: false }], constraints: 'temperature 与 top_p 不能同时设置', source: '供应商规格' };
const price = { expectedRevision: 0, confirmed: true, source: '报价单', effectiveAt: '2026-01-01T00:00:00Z', scenarios: [{ name: '输入 Token', unit: '百万 Token', currency: 'CNY', listPrice: '0', condition: '上下文 ≤32K' }] };

test('supplier declarations and independent price versions persist without changing identity, keys, procurement or sales', () => {
  const before = initial();
  let state = run(before, 'supplierModelProfile', { profile, expectedRevision: 0 });
  state = run(state, 'supplierListPricePublish', price);
  assert.equal(activeSupplierListPrice(entry(state)).pricing.scenarios[0].listPrice, 0);
  assert.equal(entry(state).supplyProfile.capabilities.tools, false);
  for (const field of ['endpoints', 'models', 'modelSupplies', 'serviceRoutes', 'modelSalePrices', 'supplyPrices']) assert.deepEqual(state[field], before[field]);
  for (const field of ['apiKeys', 'catalogConnections', 'catalogPricing', 'catalogModelIds']) assert.deepEqual(owner(state)[field], owner(before)[field]);
  const restored = parseAdminState(JSON.stringify(state));
  assert.deepEqual(entry(restored), entry(state));
  assert.throws(() => run(state, 'supplierModelProfile', { profile, expectedRevision: 0 }), /已变化/);
  assert.throws(() => run(state, 'supplierListPricePublish', price), /已变化/);
});

test('copy creates only the explicit supply relation and optional published quote; existing data cannot be overwritten', () => {
  let state = run(initial(), 'supplierModelProfile', { profile, expectedRevision: 0 });
  state = run(state, 'supplierListPricePublish', price);
  const targetId = 'provider-zhipu-direct', before = structuredClone(state);
  state = run(state, 'supplierModelCopy', { targetProviderId: targetId, libraryId: 'model-6', copyListPrice: true });
  const target = state.providers.find(row => row.id === targetId), copied = target.catalogModels.find(row => row.libraryId === 'model-6');
  assert.deepEqual(copied.supplyProfile, entry(state).supplyProfile);
  assert.equal(copied.listPriceVersions[0].status, '已发布');
  assert.ok(activeSupplierListPrice(copied));
  assert.deepEqual(target.catalogConnections, before.providers.find(row => row.id === targetId).catalogConnections);
  assert.deepEqual(target.apiKeys, before.providers.find(row => row.id === targetId).apiKeys);
  for (const field of ['endpoints', 'modelSupplies', 'serviceRoutes', 'models']) assert.deepEqual(state[field], before[field]);
  assert.throws(() => run(state, 'supplierModelCopy', { targetProviderId: targetId, libraryId: 'model-6' }), /不能重复/);
});

test('invalid declarations, incomplete prices and storage failures leave current data intact', () => {
  assert.throws(() => normalizeSupplyProfile({ ...profile, parameters: false }), /参数/);
  assert.throws(() => normalizeSupplyProfile({ ...profile, parameters: [...profile.parameters, ...profile.parameters] }), /重复/);
  assert.throws(() => normalizeSupplyProfile({ capabilities: { context: 100, output: 101 } }), /不能大于/);
  assert.throws(() => normalizeSupplyProfile({ capabilities: { context: true } }), /正整数/);
  const state = initial(), original = structuredClone(state);
  assert.throws(() => run(state, 'supplierListPricePublish', { ...price, scenarios: [{ ...price.scenarios[0], listPrice: '' }] }), /完整刊例价/);
  assert.throws(() => run(state, 'supplierListPricePublish', { ...price, expiresAt: price.effectiveAt }), /晚于/);
  const storage = { getItem: () => null, setItem: () => { throw new Error('quota'); } };
  assert.throws(() => persistModelAction(state, action('supplierModelProfile', { profile, expectedRevision: 0 }), storage), /quota/); assert.deepEqual(state, original);
});

test('expiry never revives a superseded list price', () => {
  const versions = { listPriceVersions: [{ id: 'old', version: 1, status: '已发布', effectiveAt: '2026-01-01' }, { id: 'new', version: 2, status: '已发布', effectiveAt: '2026-02-01', expiresAt: '2026-03-01' }] };
  assert.equal(activeSupplierListPrice(versions, Date.parse('2026-02-10')).id, 'new');
  assert.equal(activeSupplierListPrice(versions, Date.parse('2026-04-01')), null);
});

function poolFixture() {
  const state = initial();
  return commitAdminState(state, action('supplierChannelCreate', { name: '密钥池验证', interfaceType: 'openai', protocol: 'OpenAI', baseUrl: 'https://pool.example.invalid/v1', authMode: 'group', keyGroupId: 'default', models: [{ libraryId: 'model-2', upstreamModelId: 'pool/chat', scenarios: price.scenarios }] }));
}
const endpoint = state => state.endpoints.find(row => row.name === '密钥池验证');
const args = state => ({ providerId: owner(state).id, endpointId: endpoint(state).id, expectedRevision: endpoint(state).configurationRevision || 0, candidateId: endpoint(state).candidateConfiguration?.id });
const change = (state, operation, data = {}) => commitAdminState(state, { type: 'modelOperations', operation, data: { ...args(state), ...data } });
const bindings = state => owner(state).apiKeys.slice(0, 2).map((key, index) => ({ keyId: key.id, priority: 2 - index, enabled: true }));

test('pool priorities are channel-local and every enabled key needs evidence before an atomic application', () => {
  const before = poolFixture(), keys = bindings(before);
  let state = change(before, 'channelCandidateSave', { config: { authMode: 'pool', keyPool: keys } });
  assert.equal(connectionFingerprint(endpoint(state)), connectionFingerprint(endpoint(before)));
  assert.throws(() => candidateTestPlan(state, args(state)), /选择.*密钥/);
  state = change(state, 'channelCandidateTest', { keyId: keys[0].keyId });
  assert.equal(channelCandidateStatus(state, owner(state).id, endpoint(state).id).ready, false);
  assert.throws(() => change(state, 'channelCandidateApply', { confirmed: true }), /全部启用密钥/);
  state = change(state, 'channelCandidateTest', { keyId: keys[1].keyId });
  assert.equal(channelCandidateStatus(state, owner(state).id, endpoint(state).id).ready, true);
  const next = change(state, 'channelCandidateApply', { confirmed: true });
  assert.deepEqual(connectionKeys(endpoint(next), owner(next)).map(row => row.id), [keys[1].keyId, keys[0].keyId]);
  assert.deepEqual(owner(next).apiKeys, owner(before).apiKeys);
  assert.equal(owner(next).defaultApiKeyId, owner(before).defaultApiKeyId);
  assert.deepEqual(supplierChannelAssociations(next, owner(next), endpoint(next).id).map(row => [row.id, row.pricing]), supplierChannelAssociations(before, owner(before), endpoint(before).id).map(row => [row.id, row.pricing]));
  assert.deepEqual(next.serviceRoutes, before.serviceRoutes);
  assert.deepEqual(endpoint(parseAdminState(JSON.stringify(next))).keyPool, keys);
});

test('pool rejects duplicate, foreign, revoked and disabled keys; new failure or edited priority invalidates old evidence', () => {
  const before = poolFixture(), keys = bindings(before), provider = owner(before);
  for (const invalid of [[keys[0], keys[0]], [{ ...keys[0], keyId: 'foreign' }], [{ ...keys[0], priority: 0 }], [{ ...keys[0], enabled: false }]]) assert.throws(() => normalizeChannelKeyPool(invalid, provider));
  assert.throws(() => normalizeChannelKeyPool(keys, { ...provider, apiKeys: provider.apiKeys.map(key => ({ ...key, status: 'disabled' })) }), /启用/);
  let state = change(before, 'channelCandidateSave', { config: { authMode: 'pool', keyPool: keys } });
  for (const key of keys) state = change(state, 'channelCandidateTest', { keyId: key.keyId });
  const mapping = supplierChannelAssociations(state, owner(state), endpoint(state).id)[0];
  state = change(state, 'channelCandidateTest', { keyId: keys[1].keyId, scenarios: { [mapping.id]: 'unauthorized' } });
  assert.equal(channelCandidateStatus(state, owner(state).id, endpoint(state).id).ready, false);
  state = change(state, 'channelCandidateSave', { config: { authMode: 'pool', keyPool: keys.map(row => ({ ...row, priority: row.priority + 1 })) } });
  assert.equal(channelCandidateStatus(state, owner(state).id, endpoint(state).id).ready, false);
});

test('asynchronous pool probes bind each selected key and reject a receipt from another key', async t => {
  t.mock.method(globalThis, 'fetch', () => assert.fail('prototype checks must not call an upstream'));
  t.mock.timers.enable({ apis: ['Date'], now: Date.now() });
  let state = poolFixture(); const keys = bindings(state), channels = new Set();
  const before = state;
  await prepareServerChannel(owner(before), endpoint(before));
  state = change(state, 'channelCandidateSave', { config: { authMode: 'pool', keyPool: keys } });
  for (const key of keys) {
    const prepared = await prepareCandidateTest(state, { ...args(state), keyId: key.keyId });
    state = change(state, prepared.operation, prepared.data);
    const submitted = await submitCandidateTest(prepared.data); channels.add(submitted.serverChannelId);
    state = change(state, prepared.operation, submitted);
    t.mock.timers.tick(1000);
    const batch = await recoverCandidateTest(submitted);
    assert.equal(batch.credentialId, prepared.data.serverCredentialId);
    const receipt = candidateTestReceipt(submitted, batch);
    assert.throws(() => change(state, receipt.operation, { ...receipt.data, batch: { ...batch, credentialId: 'foreign' } }), /回执密钥/);
    state = change(state, receipt.operation, receipt.data);
  }
  assert.equal(channels.size, 2);
  assert.equal(channelCandidateStatus(state, owner(state).id, endpoint(state).id).ready, true);
  assert.equal(channelCandidateStatus(state, owner(state).id, endpoint(state).id, { requireReal: true }).ready, false);
  const applied = change(state, 'channelCandidateApply', { confirmed: true });
  const plan = planMockOnboardingSync(state, applied, getMockChannelSnapshots());
  assert.equal(plan.replacements.length, 1);
  const primary = endpoint(state).candidateTestJobs.find(job => job.keyId === keys[1].keyId);
  assert.equal(plan.replacements[0].candidateChannelId, primary.serverChannelId);
});
