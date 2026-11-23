import test from 'node:test';
import assert from 'node:assert/strict';
import { modelChannelName } from '../src/admin-v2/model-channel-name.js';
import { initialModelWorkspace, modelSupplyRelations } from '../server/model-repository.js';
import { channelManagementDirectory, supplierModelChannelRows } from '../src/admin-v2/supplier-model-channel-table.js';
import { costRecords, supplyCostTableRows } from '../src/admin-v2/model-pricing-workspace.js';

test('independent model channel names take precedence over their shared connection name', () => {
  const provider = { catalogConnections: [] }, endpoint = { id: 'connection-a', name: '旧连接名称', supplierChannel: true };
  const first = { id: 'channel-a', endpointId: endpoint.id, endpoint, sourceName: '自营' };
  const second = { id: 'channel-b', endpointId: endpoint.id, endpoint, sourceName: '转售' };
  const before = structuredClone({ provider, first, second });
  assert.equal(modelChannelName(provider, first), '自营');
  assert.equal(modelChannelName(provider, second), '转售');
  assert.deepEqual({ provider, first, second }, before);
});

test('channels without a separate name retain their current connection label and pending state', () => {
  const provider = { catalogConnections: [] }, endpoint = { id: 'connection-a', name: '标准连接', supplierChannel: true };
  assert.equal(modelChannelName(provider, { endpointId: endpoint.id, endpoint }), '标准连接');
  assert.equal(modelChannelName(provider, null), '待添加连接');
});

test('both directory perspectives retain identical channel names, identities, capacities and costs without changing state', () => {
  const state = initialModelWorkspace(), provider = state.providers.find(row => row.id === 'provider-moma');
  const saved = provider.catalogConnections.find(row => !row.deletedAt && row.endpointId);
  saved.sourceName = '独立上游模型'; saved.capacityLimits = { rpm: 300, tpm: 1000000 };
  const relations = modelSupplyRelations(state), before = structuredClone(state);
  const directory = channelManagementDirectory(state, [provider], relations);
  const groups = directory.byProvider.get(provider.id), supplierRows = supplierModelChannelRows(state, groups);
  const providerCosts = new Map(costRecords(state, groups).map(row => [row.key, row]));
  const modelRows = supplyCostTableRows(directory.models, costRecords(state, directory.models.flatMap(model => model.groups))).filter(row => row.channel);
  assert(supplierRows.some(row => row.channel.id === saved.id && modelChannelName(provider, row.channel) === '独立上游模型'));
  assert.equal(modelRows.length, supplierRows.length);
  for (const row of supplierRows) {
    const modelRow = modelRows.find(other => other.channel.id === row.channel.id);
    assert(modelRow);
    assert.equal(modelRow.model.id, row.group.master.id);
    assert.equal(modelChannelName(modelRow.group.owner, modelRow.channel), modelChannelName(row.group.owner, row.channel));
    assert.deepEqual(modelRow.channel.capacityLimits, row.channel.capacityLimits);
    assert.deepEqual(modelRow.cost, providerCosts.get(provider.id + ':' + row.channel.id));
  }
  assert.deepEqual(state, before);
});
