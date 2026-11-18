import test from 'node:test';
import assert from 'node:assert/strict';
import { legacySupplierState } from './legacy-supplier-fixture.mjs';
import { serviceChannelOptions } from '../src/admin-v2/service-channel-options.js';

function fixture() {
  const state = legacySupplierState(), model = { ...state.models.find(row => row.id === 'model-1'), serviceProviders: [] };
  const provider = state.providers.find(row => row.id === 'service-review-provider-deepseek');
  return { state, model, provider };
}

test('channel choices require a provider and preserve the current workspace', () => {
  const { state, model, provider } = fixture(), before = structuredClone(state);
  assert.deepEqual(serviceChannelOptions(state, model, ''), []);
  const rows = serviceChannelOptions(state, model, provider.id);
  assert(rows.length > 0); assert(rows.some(row => !row.reason));
  assert(rows.every(row => row.provider.id === provider.id));
  assert.deepEqual(state, before);
});

test('blocked channels remain visible with their actual reason', () => {
  const { state, model, provider } = fixture();
  provider.status = '已停用';
  const rows = serviceChannelOptions(state, model, provider.id);
  assert(rows.length > 0); assert(rows.every(row => row.reason === '服务商已停用'));
});

test('existing associations are explained and removed associations can be selected again', () => {
  const { state, model, provider } = fixture(), row = serviceChannelOptions(state, model, provider.id)[0];
  model.serviceProviders = [{ providerId: provider.id, channelId: row.id, status: '已关联' }];
  assert.equal(serviceChannelOptions(state, model, provider.id).find(item => item.id === row.id).reason, '已关联当前模型服务');
  model.serviceProviders[0].status = '已移除';
  assert.equal(serviceChannelOptions(state, model, provider.id).find(item => item.id === row.id).reason, '');
});

test('deleted channels and channels of another model never become association options', () => {
  const { state, model, provider } = fixture(), row = serviceChannelOptions(state, model, provider.id)[0];
  const other = state.models.find(item => item.id !== model.id && !serviceChannelOptions(state, { ...item, serviceProviders: [] }, provider.id).length);
  assert(other); assert.deepEqual(serviceChannelOptions(state, other, provider.id), []);
  provider.catalogConnections.find(item => item.id === row.id).deletedAt = '2026-11-17T00:00:00.000Z';
  assert(!serviceChannelOptions(state, model, provider.id).some(item => item.id === row.id));
});
