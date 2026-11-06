import test from 'node:test';
import assert from 'node:assert/strict';
import { parseAdminState, commitAdminState } from '../src/admin-v2/store.js';
import { withAdminSession } from './admin-session-fixture.mjs';
import { supplierModelRegistration } from '../src/admin-v2/supplier-model-registration.js';
import { supplierModelChannelGroups } from '../src/admin-v2/supplier-model-channel-table.js';
import { providerApiKeysDraft, providerApiKeyRows } from '../src/admin-v2/provider-management.js';
import { connectionKeys } from '../src/admin-v2/connection-state.js';
import { providerKeyGroups } from '../src/admin-v2/provider-key-groups.js';
import { modelLibrary } from '../src/admin-v2/model-library.js';
const owner = state => state.providers.find(row => row.id === 'provider-moma');
const initial = () => withAdminSession(parseAdminState(null));
const run = (state, operation, data) => commitAdminState(state, { type: 'modelOperations', operation, data });
function models(state, libraryIds) {
  return { providerId: owner(state).id, libraryIds: supplierModelRegistration(state, owner(state), libraryIds).map(row => row.id) };
}
function channel(state, patch = {}) {
  const model = supplierModelChannelGroups(state, owner(state)).find(row => row.master?.type === 'text');
  return { providerId: owner(state).id, modelId: model.modelId, name: '新增测试渠道', upstreamModelId: 'vendor/test-model', baseUrl: 'https://new.example.invalid/v1/chat/completions', authMode: 'group', keyGroupId: 'default', scenarios: [{ name: '输入 Token', listPrice: '0', unit: '百万 Token', currency: 'CNY' }], ...patch };
}
test('batch selection shares canonical identities atomically without creating materials, services or channels', () => {
  const state = initial(), before = structuredClone(state);
  const available = modelLibrary(state).filter(row => !supplierModelChannelGroups(state, owner(state)).some(group => group.master?.id === row.id));
  const ids = available.slice(0, 5).map(row => row.id);
  assert.equal(ids.length, 5);
  const next = run(state, 'supplierModelsRegister', models(state, ids));
  for (const id of ids) assert.ok(owner(next).catalogModels.some(row => row.libraryId === id));
  for (const key of ['modelTemplates', 'models', 'endpoints', 'modelSupplies', 'modelSalePrices', 'serviceRoutes']) assert.deepEqual(next[key], state[key]);
  for (const input of [undefined, '', [], ['foreign'], [ids[0], ids[0]], available.slice(0, 6).map(row => row.id)]) assert.throws(() => models(state, input));
  assert.throws(() => run(state, 'supplierModelsRegister', { providerId: owner(state).id, libraryIds: [ids[0], 'missing'] }), /变化/);
  assert.throws(() => models(next, [ids[0]]), /已登记/);
  assert.deepEqual(state, before);
  const restored = parseAdminState(JSON.stringify(next));
  assert.deepEqual(owner(restored).catalogModels, owner(next).catalogModels);
});
test('same-name distinct canonical identities are not conflated by supplier registration', () => {
  const state = initial();
  const template = modelLibrary(state).find(row => !supplierModelChannelGroups(state, owner(state)).some(group => group.master?.id === row.id));
  state.modelTemplates.push({ ...template, id: 'distinct-id', modelId: 'distinct-code' });
  const next = run(state, 'supplierModelsRegister', models(state, [template.id, 'distinct-id']));
  assert.ok(owner(next).catalogModels.some(row => row.libraryId === template.id));
  assert.ok(owner(next).catalogModels.some(row => row.libraryId === 'distinct-id'));
});
test('channel registration requires an existing supplier model, explicit identifier, address and usable shared credential', () => {
  const state = initial(), before = structuredClone(state);
  for (const scenarios of [null, {}]) assert.throws(() => run(state, 'supplierChannelRegister', channel(state, { scenarios })), /采购成本须为计费项列表/);
  for (const scenarios of [undefined, []]) {
    const next=run(state,'supplierChannelRegister',channel(state,{scenarios}));
    const endpoint=next.endpoints.find(row=>!state.endpoints.some(old=>old.id===row.id));
    assert.deepEqual(owner(next).catalogConnections.find(row=>row.endpointId===endpoint.id).pricing.scenarios,[]);
    assert.equal(endpoint.status,'草稿');assert.deepEqual(next.modelSalePrices,state.modelSalePrices);
  }
  for (const scenarios of [[{ name: '', listPrice: '1', unit: '百万 Token', currency: 'CNY' }], [{ name: '输入 Token', listPrice: '1', unit: '', currency: 'CNY' }], [{ name: '输入 Token', listPrice: '-1', unit: '百万 Token', currency: 'CNY' }]]) assert.throws(() => run(state, 'supplierChannelRegister', channel(state, { scenarios })));
  for (const patch of [{ modelId: 'foreign' }, { upstreamModelId: '' }, { upstreamModelId: 'white space' }, { name: '' }, { baseUrl: '' }, { baseUrl: 'https://bad.invalid/v1' }, { keyGroupId: 'foreign' }, { scenarios: [{ name: '输入 Token', listPrice: '', unit: '百万 Token', currency: 'CNY' }] }]) assert.throws(() => run(state, 'supplierChannelRegister', channel(state, patch)));
  const noKeys = structuredClone(state); owner(noKeys).apiKeys = [];
  assert.throws(() => run(noKeys, 'supplierChannelRegister', channel(noKeys)), /可用密钥/);
  const next = run(state, 'supplierChannelRegister', channel(state, { scenarios: [{ name: '输入 Token', listPrice: '0', unit: '百万 Token', currency: 'CNY' }] }));
  const endpoint = next.endpoints.find(row => !state.endpoints.some(old => old.id === row.id));
  assert.equal(endpoint.status, '草稿'); assert.equal(endpoint.authMode, 'group');
  const mapping = owner(next).catalogConnections.find(row => row.endpointId === endpoint.id);
  assert.equal(mapping.upstreamModelId, 'vendor/test-model'); assert.equal(mapping.pricing.scenarios[0].listPrice, 0); assert.equal(mapping.enabled, false);
  assert.equal(mapping.modelId, channel(state).modelId);
  assert.deepEqual(owner(next).catalogModelIds, owner(state).catalogModelIds);
  assert.deepEqual(owner(next).catalogModels, owner(state).catalogModels);
  assert.deepEqual(state, before);
});
test('independent credentials belong only to the new channel and never enter shared groups or plaintext storage', async () => {
  const state = initial(), secret = 'local-independent-test-key-12345678', apiKey = (await providerApiKeysDraft([secret])).apiKeys[0];
  const next = run(state, 'supplierChannelRegister', channel(state, { authMode: 'independent', apiKey }));
  const endpoint = next.endpoints.find(row => !state.endpoints.some(old => old.id === row.id));
  assert.deepEqual(owner(next).apiKeys, owner(state).apiKeys);
  assert.equal(connectionKeys(endpoint, owner(next))[0].fingerprint, apiKey.fingerprint);
  assert.equal(endpoint.apiKeys[0].scope, 'channel');
  assert.ok(providerKeyGroups(owner(next), [...owner(next).apiKeys, ...endpoint.apiKeys]).every(group => !group.keyIds.includes(endpoint.apiKeyId)));
  assert.ok(providerApiKeyRows(next, owner(next)).every(row => row.apiKey.id !== endpoint.apiKeyId));
  const other = { ...endpoint, id: 'other', apiKeys: [] };
  assert.equal(connectionKeys(other, owner(next)).length, 0);
  assert.ok(!JSON.stringify(next).includes(secret));
  assert.equal(connectionKeys(parseAdminState(JSON.stringify(next)).endpoints.find(row => row.id === endpoint.id), owner(next))[0].fingerprint, apiKey.fingerprint);
  assert.throws(() => run(state, 'supplierChannelRegister', channel(state, { authMode: 'independent', apiKey: { ...apiKey, raw: secret } })), /脱敏/);
  const readonly = { ...state, currentRole: '只读审计员' };
  assert.throws(() => run(readonly, 'supplierChannelRegister', channel(readonly)), /权限|账号|无权/);
});
test('historical implicit price references do not block explicit catalogue registration or create a second master', async () => {
  const { initialModelWorkspace } = await import('../server/model-repository.js');
  const { providerCatalogueIds } = await import('../src/admin-v2/moma-provider.js');
  const { supplyModelRecord } = await import('../src/admin-v2/supply-models.js');
  const { modelCatalogue } = await import('../src/admin-v2/model-library.js');
  const { registeredSupplierModelIds } = await import('../src/admin-v2/supplier-model-registration.js');
  const state = withAdminSession(initialModelWorkspace()), provider = owner(state), registered = registeredSupplierModelIds(state, provider);
  const code = providerCatalogueIds(provider).find(code => {const master = supplyModelRecord(state,provider,code);return master && modelCatalogue(state).some(row => row.id===master.id) && !registered.includes(master.id);});
  assert.ok(code);
  const master = supplyModelRecord(state,provider,code);
  const next = run(state,'supplierModelsRegister',models(state,[master.id]));
  assert.ok(registeredSupplierModelIds(next,owner(next)).includes(master.id));
  assert.deepEqual(next.modelTemplates,state.modelTemplates);assert.deepEqual(next.endpoints,state.endpoints);
});
