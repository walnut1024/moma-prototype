import assert from 'node:assert/strict';
import test from 'node:test';
import { channelModelCandidates, matchesChannelModel } from '../src/admin-v2/channel-model-candidates.js';

const chat = 'OpenAI Chat Completions';
const address = 'https://same.example/v1/chat/completions';
const binding = (upstream, url = address, protocol = chat) => ({ upstream, url, protocol });
const offer = (modelId, bindings) => ({
  modelId, libraryId: modelId,
  offerFields: { name: '供应 ' + modelId, bindings },
});

test('manual addition reads only saved supplier bindings for the current interface and full request address', () => {
  const catalogModels = [
    offer('match', [binding('vendor/exact'), binding('vendor/exact', address + '/')]),
    offer('other-address', [binding('vendor/remote', 'https://other.example/v1/chat/completions')]),
    offer('other-format', [binding('vendor/responses', address, 'OpenAI Responses')]),
    offer('other-path', [binding('vendor/custom', 'https://same.example/v1/custom/chat')]),
    offer('ambiguous', [binding('vendor/one'), binding('vendor/two')]),
    offer('missing', [binding('')]),
    offer('invalid', [binding('contains space')]),
    offer('added', [binding('vendor/saved')]),
    offer('duplicate', [binding('vendor/connected')]),
    offer('deleted-material', [binding('vendor/deleted')]),
    { modelId: 'legacy-connection', libraryId: 'legacy-connection' },
  ];
  const provider = {
    id: 'provider-deepseek-official', code: 'deepseek',
    catalogModels, catalogModelIds: catalogModels.map(row => row.modelId),
    catalogConnections: [
      { modelId: 'legacy-connection', endpointId: 'same', upstreamModelId: 'vendor/legacy' },
      { modelId: 'added', endpointId: 'target', upstreamModelId: 'vendor/connected' },
    ],
  };
  const endpoint = { id: 'target', providerId: provider.id, interfaceType: 'openai', baseUrl: 'https://same.example/v1/' };
  const foreign = offer('foreign', [binding('vendor/foreign')]);
  const foreignProvider = { id: 'foreign-provider', catalogModelIds: ['foreign'], catalogModels: [foreign] };
  const ids = [...provider.catalogModelIds, 'foreign', 'library-only', 'deepseek-v4-pro'];
  const modelTemplates = ids.map(modelId => ({ id: modelId, modelId, name: modelId, type: 'text',
    ...(modelId === 'deleted-material' && { referenceDeletedAt: '2026-11-25' }),
  }));
  const state = {
    modelTemplates, models: [], modelSupplies: [], providers: [provider, foreignProvider], modelData: {},
    endpoints: [endpoint, { ...endpoint, id: 'same' }],
  };
  const channel = { provider, endpoint, models: [{
    master: modelTemplates.find(model => model.id === 'added'),
    association: provider.catalogConnections[1],
  }] };
  const rows = new Map(channelModelCandidates(state, channel).map(row => [row.id, row]));
  assert.deepEqual([...rows.keys()].sort(), ['added', 'deleted-material', 'duplicate', 'match']);
  assert.equal(rows.get('deleted-material').upstreamModelId, 'vendor/deleted');
  assert.equal(rows.get('match').upstreamModelId, 'vendor/exact');
  assert.equal(rows.get('match').displayName, '供应 match');
  assert.equal(rows.get('added').added, true);
  assert.equal(rows.get('added').upstreamModelId, 'vendor/saved');
  assert.equal(rows.get('duplicate').duplicate, true);
  assert.equal(matchesChannelModel(rows.get('match'), '供应 match'), true);
  assert.equal(matchesChannelModel(rows.get('match'), 'VENDOR/EXACT'), true);
  assert.equal(matchesChannelModel(rows.get('match'), 'vendor/remote'), false);
});

test('manual addition matches the connection path appended to its Base URL', () => {
  const provider = {
    id: 'provider-registered',
    catalogModelIds: ['registered-offer'],
    catalogModels: [offer('registered-offer', [binding('vendor/registered')])],
  };
  const endpoint = {
    id: 'channel-target', providerId: provider.id, interfaceType: 'openai',
    endpointPath: '/v1/chat/completions', baseUrl: 'https://same.example',
  };
  const modelTemplates = [{ id: 'registered-offer', modelId: 'registered-offer', name: '模型库名称', type: 'text' }];
  const state = { modelTemplates, models: [], modelSupplies: [], providers: [provider], endpoints: [endpoint], modelData: {} };
  const [registered] = channelModelCandidates(state, { provider, endpoint, models: [] });
  assert.equal(registered.upstreamModelId, 'vendor/registered');
  const changed = { ...endpoint, endpointPath: '/v2/chat/completions' };
  assert.deepEqual(channelModelCandidates(state, { provider, endpoint: changed, models: [] }), []);
});

test('manual addition uses the displayed API format for saved full-address connections', () => {
  const url = 'https://same.example/v1/embeddings';
  const provider = {
    id: 'provider-registered', catalogModelIds: ['embedding-offer'],
    catalogModels: [offer('embedding-offer', [binding('vendor/embedding', url, 'OpenAI Embeddings')])],
  };
  const endpoint = { id: 'legacy-task-url', providerId: provider.id, interfaceType: 'custom', baseUrl: url };
  const modelTemplates = [{ id: 'embedding-offer', modelId: 'embedding-offer', name: '向量模型', type: 'embedding' }];
  const state = { modelTemplates, models: [], modelSupplies: [], providers: [provider], endpoints: [endpoint], modelData: {} };
  const [candidate] = channelModelCandidates(state, { provider, endpoint, models: [] });
  assert.equal(candidate.upstreamModelId, 'vendor/embedding');
});
