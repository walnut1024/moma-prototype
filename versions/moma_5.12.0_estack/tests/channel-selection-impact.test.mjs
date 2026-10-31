import test from 'node:test';
import assert from 'node:assert/strict';
import { channelSelectionGroups, channelSelectionServiceImpact } from '../src/admin-v2/channel-selection-impact.js';
import { channelFingerprint } from '../src/admin-v2/provider-channels.js';
import { connectionFingerprint } from '../src/admin-v2/connection-state.js';

function fixture() {
  const model = { id: 'master', name: 'Chat', modelId: 'moma/chat', type: 'text', serviceMode: 'standard', capabilities: {} };
  const state = { models: [model], modelTemplates: [], modelSalePrices: [], supplyPrices: [], endpoints: [], providers: [], modelSupplies: [], serviceRoutes: [] };
  const selections = [];
  for (let i = 0; i < 3; i++) {
    const provider = { id: `provider-${i}`, name: `Supplier ${i}`, sourceType: 'selfHosted', status: '已启用', catalogModelIds: ['vendor/chat'], catalogModels: [{ modelId: 'vendor/chat', type: 'text', libraryId: model.id }] };
    const endpoint = { id: `channel-${i}`, name: `Channel ${i}`, providerId: provider.id, baseUrl: 'https://example.test/v1/chat/completions', protocol: 'OpenAI', authMode: 'none', status: '运行中' };
    endpoint.connectionTest = { result: '通过', fingerprint: connectionFingerprint(endpoint) };
    const mapping = { id: `mapping-${i}`, endpointId: endpoint.id, modelId: 'vendor/chat', upstreamModelId: 'vendor/chat', enabled: true, pricing: { discountFactor: 1000000, scenarios: [{ name: '输入 Token', unit: '百万 Token', currency: 'CNY', listPrice: 1000000 }] } };
    mapping.health = { result: '通过', fingerprint: channelFingerprint({ ...mapping, endpoint }) }; provider.catalogConnections = [mapping];
    state.providers.push(provider); state.endpoints.push(endpoint); state.modelSupplies.push({ id: `supply-${i}`, modelId: model.id, endpointId: endpoint.id, catalogueModelId: mapping.modelId, upstreamModelId: mapping.upstreamModelId, status: '已启用', validationStatus: '通过', capabilities: {} });
    selections.push({ providerId: provider.id, endpointId: endpoint.id, associationId: mapping.id, modelId: mapping.modelId });
  }
  state.serviceRoutes.push({ serviceId: `standard:${model.id}`, activeVersion: 1, versions: [{ version: 1, config: { strategy: 'priority', autoFailover: true, channels: [{ supplyId: 'supply-0', enabled: true }, { supplyId: 'supply-1', enabled: true }, { supplyId: 'supply-2', enabled: false }] } }] });
  return { state, selections };
}

test('bulk test queue fixes supplier/channel identities and splits only at the 50-model boundary', () => {
  const selection = Array.from({ length: 105 }, (_, index) => ({ providerId: 'p', endpointId: 'e', associationId: `a-${index}`, expectedFingerprint: `snapshot-${index}` }));
  selection.push({ providerId: 'p2', endpointId: 'e', associationId: 'other', expectedFingerprint: 'original' });
  const before = structuredClone(selection), groups = channelSelectionGroups(selection);
  assert.deepEqual(groups.map(row => row.selections.length), [50, 50, 5, 1]);
  assert.deepEqual(groups.flatMap(row => row.selections).map(row => row.associationId), selection.map(row => row.associationId));
  groups[0].selections[0].expectedFingerprint = 'changed'; assert.deepEqual(selection, before);
});

test('impact lists only previously allowed available alternatives and identifies loss of the last supply', () => {
  const { state, selections } = fixture(), before = structuredClone(state);
  const first = channelSelectionServiceImpact(state, [selections[0]]);
  assert.equal(first.length, 1); assert.equal(first[0].unavailable, false); assert.deepEqual(first[0].remaining.map(row => row.id), ['supply-1']);
  const both = channelSelectionServiceImpact(state, selections.slice(0, 2));
  assert.equal(both[0].unavailable, true); assert.deepEqual(both[0].remaining, []);
  assert.deepEqual(channelSelectionServiceImpact(state, [selections[2]]), []);
  assert.deepEqual(state, before);
});
