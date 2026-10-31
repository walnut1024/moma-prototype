import test from 'node:test';
import assert from 'node:assert/strict';
import { parseAdminState, commitAdminState } from '../src/admin-v2/store.js';
import { modelLibrary } from '../src/admin-v2/model-library.js';
import { supplierChannelAssociations } from '../src/admin-v2/supplier-resources.js';
import { channelUrl } from '../src/admin-v2/provider-channels.js';

const providerId = 'provider-moma';
const run = (state, operation, values) => commitAdminState(state, {
  type: 'modelOperations', operation: 'provider', data: { operation, objectId: providerId, values },
});

test('twenty canonical models share one connection and credential reference through batch test and explicit enable', () => {
  const initial = parseAdminState(null), library = modelLibrary(initial);
  const selected = [...library.filter(row => ['text', 'multimodal'].includes(row.type)).slice(0, 19), library.find(row => row.type === 'embedding')];
  assert.equal(selected.length, 20);
  assert.ok(selected.every(Boolean));
  assert.equal(new Set(selected.map(row => row.id)).size, 20);
  const models = selected.map((row, index) => ({ libraryId: row.id, upstreamModelId: `upstream/${row.modelId}:${index + 1}`, scenarios: [] }));
  const before = structuredClone(initial);
  let state = run(initial, 'supplierChannelCreate', {
    name: '二十模型接入验收', interfaceType: 'openai', addressMode: 'base', protocol: 'OpenAI',
    baseUrl: 'https://twenty-models.example.invalid/v1', taskUrls: {}, authMode: 'group', keyGroupId: 'default', models,
  });
  const channel = state.endpoints.find(row => row.name === '二十模型接入验收');
  const owner = () => state.providers.find(row => row.id === providerId);
  const rows = () => supplierChannelAssociations(state, owner(), channel.id);
  assert.equal(state.endpoints.length, initial.endpoints.length + 1);
  assert.equal(channel.keyGroupId, 'default');
  assert.equal(channel.baseUrl, 'https://twenty-models.example.invalid/v1');
  assert.equal(rows().length, 20);
  assert.ok(rows().every(row => !row.enabled && !row.health && row.pricing.scenarios.length === 0));
  assert.deepEqual(new Set(rows().map(row => row.upstreamModelId)), new Set(models.map(row => row.upstreamModelId)));
  for (const [index, model] of selected.entries()) {
    const mapping = rows().find(row => row.upstreamModelId === models[index].upstreamModelId);
    const registration = owner().catalogModels.find(row => row.modelId === mapping.modelId);
    assert.equal(registration.libraryId, model.id);
    assert.equal(channelUrl(owner(), mapping), `${channel.baseUrl}/${model.type === 'embedding' ? 'embeddings' : 'chat/completions'}`);
  }
  assert.deepEqual(owner().apiKeys, initial.providers.find(row => row.id === providerId).apiKeys);
  const batch = { endpointId: channel.id, associationIds: rows().map(row => row.id) };
  state = run(state, 'supplierModelsTest', batch);
  assert.ok(rows().every(row => row.health?.result === '通过' && row.health.simulated === true && !row.enabled));
  assert.equal(state.endpoints.find(row => row.id === channel.id).status, '草稿');
  state = run(state, 'supplierModelsEnable', batch);
  assert.equal(state.endpoints.find(row => row.id === channel.id).status, '运行中');
  assert.ok(rows().every(row => row.enabled));
  assert.equal(state.endpoints.filter(row => row.id === channel.id).length, 1);
  for (const field of ['models', 'modelTemplates', 'modelSupplies', 'modelSalePrices', 'supplyPrices', 'serviceRoutes']) assert.deepEqual(state[field], initial[field], field);
  assert.deepEqual(initial, before);
});
