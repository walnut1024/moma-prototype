import test from 'node:test';
import assert from 'node:assert/strict';
import {initialModelWorkspace} from '../server/model-repository.js';
import {activeRouteVersion, routingServices, serviceRoute} from '../src/admin-v2/service-routing.js';
import {routeEditorChannels, routeEditorPayload} from '../src/admin-v2/service-route-editor.js';
import {routeEditConfig} from '../src/admin-v2/route-workspace.js';
import {routeMappingAddresses} from '../src/admin-v2/service-model-mappings.js';
import {forwardingChanges, publicRouteAddress} from '../src/admin-v2/service-route-forwarding.js';
import {commitAdminState} from '../src/admin-v2/state-transaction.js';

test('channel interface routes publish together, use registered addresses, and keep earlier versions', () => {
  const state = initialModelWorkspace();
  const service = routingServices(state).find(row => row.callId === 'glm-5.3-moma');
  const route = serviceRoute(state, service.id);
  const config = routeEditConfig(service, route);
  const channels = routeEditorChannels(state, service);
  const channel = channels.find(row => row.id === config.channels.find(member => member.enabled && !member.backup)?.supplyId);
  const chat = '/v1/chat/completions';
  const messages = '/v1/messages';
  const responses = '/v1/responses';
  const current = routeMappingAddresses(service, channel, config);
  assert.equal(current.find(row => row.path === messages).forwarding, '原生转发');
  const submit = forwarding => commitAdminState(state, {
    type:'modelOperations', operation:'serviceRouteConfigure', modelId:service.modelId,
    data:routeEditorPayload(state, service, {...config, forwarding}, channels),
  }, '平台管理员');
  const next = submit([{path:responses, upstreamPath:chat}, {path:messages, upstreamPath:chat}]);
  const nextRoute = serviceRoute(next, service.id);
  const after = routeMappingAddresses(service, channel, activeRouteVersion(nextRoute).config);
  const changes = forwardingChanges(current, after);
  assert.equal(changes.length, 2);
  assert.equal(changes.find(row => row.path === responses).previous, undefined);
  assert.equal(changes.find(row => row.path === messages).next.url, current.find(row => row.path === chat).url);
  assert.deepEqual(nextRoute.versions.slice(0, route.versions.length), route.versions);
  const nextService = routingServices(next).find(row=>row.id===service.id);
  const removed = commitAdminState(next, {type:'modelOperations',operation:'serviceRouteConfigure',modelId:service.modelId,
    data:routeEditorPayload(next,nextService,{...activeRouteVersion(nextRoute).config,
      forwarding:activeRouteVersion(nextRoute).config.forwarding.filter(row=>row.path!==responses)},routeEditorChannels(next,nextService))},'平台管理员');
  const removedRoute = serviceRoute(removed,service.id);
  const removedRows = routeMappingAddresses(nextService,channel,activeRouteVersion(removedRoute).config);
  assert.equal(removedRows.some(row=>row.path===responses),false);
  assert.equal(forwardingChanges(after,removedRows).find(row=>row.path===responses).next,undefined);
  assert.deepEqual(removedRoute.versions.slice(0,nextRoute.versions.length),nextRoute.versions);
  assert.throws(() => submit([{path:responses, upstreamPath:responses}]), /没有匹配的上游接口/);
  assert.throws(() => submit([{path:responses, upstreamPath:chat}, {path:responses, upstreamPath:chat}]), /重复/);
  assert.throws(() => submit([{path:chat, upstreamPath:messages}]), /转换方向无效/);
});

test('public route addresses use the configured gateway, retain path prefixes and never duplicate v1',()=>{
  assert.equal(publicRouteAddress('/v1/chat/completions'),'http://xxxx/v1/chat/completions');
  const base='https://gateway.example.test/inference/v1/';
  assert.equal(publicRouteAddress('/v1/chat/completions',base),'https://gateway.example.test/inference/v1/chat/completions');
  assert.equal(publicRouteAddress('/v1/responses',base),'https://gateway.example.test/inference/v1/responses');
  assert.equal(publicRouteAddress('/v1/images/generations','https://gateway.example.test'),'https://gateway.example.test/v1/images/generations');
  for (const invalid of ['', '$MOMA_BASE_URL', 'not-a-url', 'javascript:alert(1)', 'https://user:secret@gateway.example.test/v1', 'https://gateway.example.test/v1?key=secret']) {
    assert.equal(publicRouteAddress('/v1/messages',invalid),'');
  }
  assert.equal(publicRouteAddress('/v1/messages','https://gateway.example.test/v1'),'https://gateway.example.test/v1/messages');
});
