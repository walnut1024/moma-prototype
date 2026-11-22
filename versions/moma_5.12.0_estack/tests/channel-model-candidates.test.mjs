import assert from 'node:assert/strict';
import test from 'node:test';
import { channelModelCandidates, matchesChannelModel } from '../src/admin-v2/channel-model-candidates.js';

test('channel model autofill requires the same provider, base URL and effective API endpoint', () => {
  const templates = ['match', 'other-address', 'other-format', 'other-path', 'ambiguous', 'missing', 'added', 'library-only'];
  const modelTemplates = templates.map(modelId => ({ id: modelId, modelId, name: modelId, type: 'text' }));
  const provider = { id: 'test-provider', catalogModelIds: templates.slice(0, -1) };
  const endpoint = { id: 'target', providerId: provider.id, interfaceType: 'openai', baseUrl: 'https://same.example/v1/' };
  const same = { ...endpoint, id: 'same', baseUrl: 'https://same.example/v1' };
  const otherAddress = { ...same, id: 'address', baseUrl: 'https://other.example/v1' };
  const otherFormat = { ...same, id: 'format', interfaceType: 'openai-responses' };
  const otherPath = { ...same, id: 'path', endpointPath: '/custom/chat' };
  provider.catalogConnections = [
    [same, 'match', 'vendor/exact'],
    [same, 'match', 'vendor/exact'],
    [otherAddress, 'other-address', 'vendor/remote'],
    [otherFormat, 'other-format', 'vendor/responses'],
    [otherPath, 'other-path', 'vendor/custom'],
    [same, 'ambiguous', 'vendor/one'],
    [same, 'ambiguous', 'vendor/two'],
    [same, 'missing', undefined],
    [endpoint, 'added', 'vendor/added'],
  ].map(([source, modelId, upstreamModelId], index) => ({ id: String(index), modelId, endpointId: source.id, upstreamModelId }));
  const foreignEndpoint = { ...same, id: 'foreign', providerId: 'another-provider' };
  const foreignProvider = { id: foreignEndpoint.providerId, catalogModelIds: ['library-only'],
    catalogConnections: [{ modelId: 'library-only', endpointId: foreignEndpoint.id, upstreamModelId: 'foreign/id' }] };
  const state = { modelTemplates, models: [], modelSupplies: [], providers: [provider, foreignProvider], modelData: {},
    endpoints: [endpoint, same, otherAddress, otherFormat, otherPath, foreignEndpoint] };
  const channel = { provider, endpoint, models: [{ master: modelTemplates.at(-2), association: provider.catalogConnections.at(-1) }] };
  const rows = new Map(channelModelCandidates(state, channel).map(row => [row.id, row]));
  assert.equal(rows.get('match').defaultSource.upstreamModelId, 'vendor/exact');
  for (const id of ['other-address', 'other-format', 'other-path', 'ambiguous', 'missing', 'library-only']) {
    assert.equal(rows.get(id).defaultSource, undefined, id);
  }
  assert.equal(rows.get('missing').sources[0].upstreamModelId, '');
  assert.equal(rows.get('library-only').supplied, false);
  assert.equal(rows.get('added').added, true);
  assert.equal(rows.get('added').currentUpstreamId, 'vendor/added');
  const filters = { format: 'openai', baseUrl: same.baseUrl, query: '', targetFormat: 'openai', targetBaseUrl: same.baseUrl };
  assert.equal(matchesChannelModel(rows.get('missing'), filters), true);
  assert.equal(matchesChannelModel(rows.get('library-only'), filters), true);
  assert.equal(matchesChannelModel(rows.get('other-address'), filters), false);
  assert.equal(matchesChannelModel(rows.get('other-address'), { ...filters, baseUrl: otherAddress.baseUrl, query: 'vendor/remote' }), true);
  assert.equal(matchesChannelModel(rows.get('other-format'), { ...filters, format: 'openai-responses' }), true);
});
