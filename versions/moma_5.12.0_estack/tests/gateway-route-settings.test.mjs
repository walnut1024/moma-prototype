import assert from 'node:assert/strict';
import test from 'node:test';
import { gatewayRouteDraft, gatewayRouteRecord, gatewayRouteRows } from '../src/admin-v2/gateway-route-settings.mjs';

const state = {
  providers: [{ id: 'p1', name: '测试服务商' }],
  models: [{ id: 'm1', modelId: 'demo-chat' }],
  endpoints: [
    { id: 'e1', providerId: 'p1', name: '端点一', modelIds: ['m1'] },
    { id: 'e2', providerId: 'p1', name: '端点二', modelIds: ['m1'] },
  ],
  routes: [{
    id: 'r1', routeId: 'legacy-route', name: '既有路由', mode: '优先级', status: '已生效', releaseId: 'release-001',
    modelId: 'm1', targets: [{ endpointId: 'e1', weight: 100, priority: 1 }],
  }],
};

test('legacy routes retain identifiers, activation and mapping when edited', () => {
  const [route] = state.routes;
  assert.deepEqual(gatewayRouteRows(state), [{
    id: 'r1', name: '既有路由', pathMatch: undefined, modelMatch: { mode: 'exact', value: 'demo-chat' },
    providerNames: ['测试服务商'],
  }]);
  const draft = gatewayRouteDraft(state, route);
  assert.equal(draft.targets[0].mapping, 'demo-chat=demo-chat');
  const recorded = gatewayRouteRecord(state, { ...draft, path: '/v1/chat/completions' }, route, 'unused');
  assert.equal(recorded.id, route.id);
  assert.equal(recorded.routeId, route.routeId);
  assert.equal(recorded.status, route.status);
  assert.equal(recorded.mode, route.mode);
  assert.equal(recorded.releaseId, route.releaseId);
  assert.equal(recorded.targets[0].priority, 1);
  assert.deepEqual(recorded.pathMatch, { mode: 'prefix', value: '/v1/chat/completions' });
});

test('new route validation persists mapping, passthrough, request headers and degradation groups', () => {
  const draft = {
    ...gatewayRouteDraft(state), name: 'sample-route', path: '/v1/chat/completions',
    targets: [{ endpointId: 'e1', weight: '100', mapping: 'demo-chat=external-chat', passMultimodal: true, passPath: '/v1' }],
    headersEnabled: true, headers: [{ name: 'X-Route-Mode', value: 'demo' }],
    degradeEnabled: true, degradeCodes: ['5xx'], degradeEndpointId: 'e2', degradeMapping: 'demo-chat=external-chat',
  };
  const record = gatewayRouteRecord(state, draft, undefined, 'r2');
  assert.equal(record.id, 'r2');
  assert.equal(record.modelId, 'm1');
  assert.deepEqual(record.modelMatch, { mode: 'exact', value: 'external-chat' });
  assert.deepEqual(record.requestHeaders.entries, [{ name: 'X-Route-Mode', value: 'demo' }]);
  assert.equal(record.targets[0].passPath, '/v1');
  assert.deepEqual(record.degrade.codes, ['5xx']);
  assert.throws(() => gatewayRouteRecord(state, { ...draft, headers: [{ name: 'Authorization', value: 'sample' }] }), /凭证/);
  assert.throws(() => gatewayRouteRecord(state, { ...draft, targets: [{ ...draft.targets[0], weight: '90' }] }), /100%/);
});
