import test from 'node:test';
import assert from 'node:assert/strict';
import { channelDiscoveryPreview, channelDiscoveryRevision } from '../src/admin-v2/channel-discovery-diff.js';

const fixture = () => {
  const master = { id: 'master-a', modelId: 'vendor/chat', name: 'Maintained name', type: 'text', capabilities: { context: 32000, tools: true, streaming: null } };
  const provider = { id: 'supplier', catalogModels: [{ modelId: 'catalog-a', libraryId: master.id }], catalogConnections: [{ id: 'mapping-a', endpointId: 'channel-a', modelId: 'catalog-a', upstreamModelId: 'vendor/chat', pricing: { scenarios: [{ listPrice: 0 }] } }, { id: 'mapping-missing', endpointId: 'channel-a', modelId: 'catalog-old', upstreamModelId: 'vendor/old' }] };
  return { master, provider, state: { models: [master], modelTemplates: [], providers: [provider] } };
};

test('discovery diffs distinguish explicit upstream changes from absent or unknown attributes without writing', () => {
  const { provider, state } = fixture(), before = structuredClone(state);
  const preview = channelDiscoveryPreview(state, provider, 'channel-a', { complete: true, source: 'upstream', models: [{ id: 'vendor/chat', name: 'Upstream name', context_length: 64000, capabilities: { tools: false, streaming: false } }, { id: 'vendor/new', type: 'text' }] });
  const existing = preview.rows.find(row => row.upstreamModelId === 'vendor/chat');
  assert.equal(existing.status, '属性差异'); assert.equal(existing.existingAssociationId, 'mapping-a');
  assert.deepEqual(existing.attributes.filter(item => item.different).map(item => item.field), ['name', 'context_length', 'tools']);
  assert.equal(existing.attributes.find(item => item.field === 'streaming').current, null);
  assert.equal(preview.rows.find(row => row.upstreamModelId === 'vendor/new').existingAssociationId, null);
  assert.deepEqual(preview.missing, [{ id: 'mapping-missing', upstreamModelId: 'vendor/old', modelId: 'catalog-old' }]);
  assert.deepEqual(state, before);
});

test('an ID-only or partial discovery never claims attributes match or a model was removed', () => {
  const { provider, state } = fixture();
  const preview = channelDiscoveryPreview(state, provider, 'channel-a', { complete: false, partialReason: 'upstream_forbidden', models: [{ id: 'vendor/chat' }] });
  assert.equal(preview.rows[0].status, '已存在'); assert.equal(preview.rows[0].attributes.length, 0); assert.deepEqual(preview.missing, []);
  assert.equal(preview.partialReason, 'upstream_forbidden');
});

test('mapping revision is stable across ordering and changes when the explicit model reference changes', () => {
  const { provider } = fixture(), initial = channelDiscoveryRevision(provider, 'channel-a');
  provider.catalogConnections.reverse(); assert.equal(channelDiscoveryRevision(provider, 'channel-a'), initial);
  provider.catalogConnections[0].upstreamModelId = 'vendor/new-upstream-id'; assert.notEqual(channelDiscoveryRevision(provider, 'channel-a'), initial);
});
