import test from 'node:test';
import assert from 'node:assert/strict';
import { marketSupplyGroups } from '../src/admin-v2/model-market-supplies.js';

test('market groups existing model mappings by provider and keeps linked direct providers without channels', () => {
  const state = {
    providers: [{ id: 'p1', name: '甲' }, { id: 'p2', name: '乙' }, { id: 'p3', name: '丙' }],
    endpoints: [
      { id: 'e1', providerId: 'p1', name: '主渠道' },
      { id: 'e2', providerId: 'p2', name: '主渠道' },
    ],
    modelSupplies: [
      { modelId: 'm', endpointId: 'e1' },
      { modelId: 'm', endpointId: 'e1' },
      { modelId: 'm', endpointId: 'e2' },
      { modelId: 'm', endpointId: 'removed', status: '已移除' },
      { modelId: 'different-model', endpointId: 'e2' },
    ],
  };
  const view = model => marketSupplyGroups(state, { id: 'm', ...model }).map(({ id, channels }) => [id, [...channels]]);
  assert.deepEqual(view({ serviceMode: 'standard' }), [['p1', [['e1', '主渠道']]], ['p2', [['e2', '主渠道']]]]);
  assert.deepEqual(view({
    serviceMode: 'provider',
    serviceProviders: [{ providerId: 'p1' }, { providerId: 'p2', status: '已移除' }, { providerId: 'p3' }],
  }), [['p1', [['e1', '主渠道']]], ['p3', []]]);
});
