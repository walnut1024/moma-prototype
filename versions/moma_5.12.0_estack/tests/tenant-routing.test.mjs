import test from 'node:test';
import assert from 'node:assert/strict';
import { activeTenantVersion, changeTenantRoute, routeTargets, tenantRouteVisible } from '../src/tenant-routing.mjs';

const service = (callId, modelKey, providerId, price, context) => ({
  callId, modelKey, providerId, mode: 'provider', name: modelKey, type: 'text', callable: true,
  capabilities: { context, output: 512 }, salePrices: [{ unit: 'million_input_tokens', currency: 'CNY', amount: price }],
});
const offers = [service('a-1', 'model-a', 'a', 7, 1000), service('a-2', 'model-a', 'b', 4, 1000),
  service('b-1', 'model-b', 'a', 3, 2000)];
const config = { models: ['model-a', 'model-b'], providers: [], sort: 'default', fallbackModel: '',
  description: '', systemPrompt: '保持简洁', parameters: { temperature: 0, max_tokens: 128 } };
const context = { state: { tenantRoutes: [{ id: 'old', tenantId: 'tenant', ownerId: 'owner', models: ['a-1'] }] },
  identity: { tenantId: 'tenant', name: '操作者' }, link: { backendUserId: 'owner' }, canManage: true };
const publish = { action: 'publish', kind: 'preset', name: 'support', config };

test('preset keeps model order and confines provider sorting to each model', () => {
  const targets = routeTargets({ ...config, providers: ['b', 'a'], sort: 'manual' }, offers, '@preset/support');
  assert.deepEqual(targets.map(row => row.callId), ['a-2', 'a-1', 'b-1']);
  assert.deepEqual(routeTargets(config, offers, 'moma/performance').map(row => row.callId), ['b-1']);
  assert.deepEqual(routeTargets(config, offers, 'moma/cost').map(row => row.callId), ['b-1']);
  assert.deepEqual(routeTargets(config, offers, '@preset/support', { inputTokens: 950 }).map(row => row.callId), ['b-1']);
});

test('publishing and switching versions keep identifiers, authorization and historical configurations', () => {
  const state = changeTenantRoute(context, publish, offers, 'new');
  assert.deepEqual(state.tenantRoutes[0], context.state.tenantRoutes[0]);
  const row = state.tenantRoutes[1];
  assert.equal(row.callId, '@preset/support');
  assert.equal(activeTenantVersion(row).config.parameters.temperature, 0);
  const next = { ...context, state };
  const ref = { kind: row.kind, id: row.id, callId: row.callId };
  assert.throws(() => changeTenantRoute(next, publish, offers, 'duplicate'), /已被使用/);
  const unauthorised = { ...next, link: { backendUserId: 'other' }, canManage: false };
  assert.equal(tenantRouteVisible(row, 'tenant', 'other', false), false);
  assert.throws(() => changeTenantRoute(unauthorised, { ...ref, action: 'stop' }, offers, 'x'), /无权/);
  const v2 = changeTenantRoute(next, { ...publish, ...ref, config: { ...config, models: ['model-b'] } }, offers, 'unused');
  const revert = { ...ref, action: 'switch', version: 1 };
  assert.throws(() => changeTenantRoute({ ...next, state: v2 }, revert, offers.slice(2), 'unused'), /已订购/);
  const reverted = changeTenantRoute({ ...next, state: v2 }, revert, offers, 'unused').tenantRoutes[1];
  assert.equal(reverted.activeVersion, 1);
  assert.equal(reverted.versions.length, 2);
  assert.equal(reverted.callId, row.callId);
});

test('automatic configuration only changes on publish and cannot be edited by a member', () => {
  const base = { kind: 'auto', callId: 'moma/auto', config: { ...config, models: [] } };
  const draft = changeTenantRoute(context, { ...base, action: 'draft' }, offers, 'auto');
  assert.equal(draft.tenantRoutes[1].enabled, false);
  assert.throws(() => changeTenantRoute(context, { ...base, action: 'publish' }, offers, 'auto'), /至少选择/);
  assert.throws(() => changeTenantRoute({ ...context, canManage: false }, { ...base, action: 'draft' }, offers, 'auto'), /无权/);
});
