import test from 'node:test';
import assert from 'node:assert/strict';
import { parseAdminState, commitAdminState } from '../src/admin-v2/store.js';
import { supplierChannelAssociations } from '../src/admin-v2/supplier-resources.js';
import { channelEnableConfirmationIssue, channelFirstEnableIssue, prepareChannelEnableConfirmation, prepareChannelFirstEnableConfirmation } from '../src/admin-v2/channel-enable-confirmation.js';

function fixture(count=2) {
  const providerId = 'provider-moma', name = '启用确认测试';
  const run = (state, operation, values) => commitAdminState(state, { type: 'modelOperations', operation: 'provider', data: { operation, objectId: providerId, values } });
  let state = run(parseAdminState(null), 'supplierChannelCreate', { name, interfaceType: 'openai', baseUrl: 'https://enable.example.invalid/v1', protocol: 'OpenAI', authMode: 'group', keyGroupId: 'default', models: [{ libraryId: 'model-2', upstreamModelId: 'vendor/chat', scenarios: [] }, { libraryId: 'model-6', upstreamModelId: 'vendor/embed', scenarios: [] }].slice(0,count) });
  const endpointId = state.endpoints.find(row => row.name === name).id, provider = current => current.providers.find(row => row.id === providerId), rows = current => supplierChannelAssociations(current, provider(current), endpointId);
  const untested=structuredClone(state),ids = rows(state).map(row => row.id); state = run(state, 'supplierModelsTest', { endpointId, associationIds: ids });
  const prepare = (current = state, selected = ids) => prepareChannelEnableConfirmation(current, providerId, endpointId, selected);
  const enable = (current, confirmation) => commitAdminState(current, { type: 'modelOperations', operation: 'supplierSelection', data: { action: 'enable', selections: confirmation.selections, confirmed: true } });
  return { state, untested, providerId, endpointId, ids, rows, provider, prepare, enable, run };
}

test('one newly created model can explicitly enable after testing without a selection step and testing itself never activates it',()=>{
 const env=fixture(1),before=structuredClone(env.state),args=[env.providerId,env.endpointId,env.ids];
 assert.equal(env.state.endpoints.find(row=>row.id===env.endpointId).onboardingCreated,true);
 assert.equal(channelFirstEnableIssue(env.state,...args),'');
 assert.throws(()=>prepareChannelFirstEnableConfirmation(env.untested,...args),/尚未全部通过/);
 assert.ok(env.rows(env.state).every(row=>row.enabled===false));
 const confirmation=prepareChannelFirstEnableConfirmation(env.state,...args);
 assert.equal(confirmation.firstActivation,true);assert.deepEqual(confirmation.selections.map(row=>row.associationId),env.ids);
 const enabled=env.enable(env.state,confirmation);
 assert.equal(env.rows(enabled)[0].enabled,true);assert.ok(env.rows(enabled)[0].activationChangedAt);assert.ok(enabled.endpoints.find(row=>row.id===env.endpointId).activationChangedAt);
 assert.ok(channelFirstEnableIssue(enabled,...args));assert.deepEqual(env.state,before);
});

test('history, an old origin and a shared channel retain the full selection and impact confirmation path',()=>{
 const env=fixture(1),args=[env.providerId,env.endpointId,env.ids];
 for(const mutate of [s=>{delete s.endpoints.find(row=>row.id===env.endpointId).onboardingCreated;},s=>{s.endpoints.find(row=>row.id===env.endpointId).activationChangedAt='2026-10-31';},s=>{env.provider(s).catalogConnections.find(row=>row.id===env.ids[0]).activationChangedAt='2026-10-31';},s=>{s.endpoints.find(row=>row.id===env.endpointId).status='停用';}]){
  const state=structuredClone(env.state);mutate(state);assert.ok(channelFirstEnableIssue(state,...args));assert.throws(()=>prepareChannelFirstEnableConfirmation(state,...args));assert.doesNotThrow(()=>env.prepare(state));
 }
 const shared=fixture();assert.ok(channelFirstEnableIssue(shared.state,shared.providerId,shared.endpointId,[shared.ids[0]]));
 const enabled=env.enable(env.state,env.prepare()),stopped=commitAdminState(enabled,{type:'modelOperations',operation:'supplierSelection',data:{action:'disable',confirmed:true,selections:env.prepare(enabled).selections}});
 assert.ok(env.rows(stopped)[0].activationChangedAt);assert.ok(channelFirstEnableIssue(stopped,...args));assert.doesNotThrow(()=>env.prepare(stopped));
});

test('a newly published service reference after the first-enable snapshot requires a fresh impact confirmation',()=>{
 const env=fixture(1),confirmation=prepareChannelFirstEnableConfirmation(env.state,env.providerId,env.endpointId,env.ids),changed=structuredClone(env.state),association=env.rows(changed)[0];
 changed.models.find(row=>row.id==='model-2').serviceMode='standard';
 changed.modelSupplies.push({id:'new-live-supply',modelId:'model-2',endpointId:env.endpointId,catalogueModelId:association.modelId,upstreamModelId:association.upstreamModelId,status:'已启用',validationStatus:'通过',capabilities:{}});
 changed.serviceRoutes.push({serviceId:'standard:model-2',activeVersion:1,versions:[{version:1,config:{strategy:'fixed',channels:[{supplyId:'new-live-supply',enabled:true}]}}]});
 assert.match(channelEnableConfirmationIssue(changed,confirmation),/服务引用/);assert.throws(()=>prepareChannelFirstEnableConfirmation(changed,env.providerId,env.endpointId,env.ids),/服务引用/);
 const reviewed=env.prepare(changed);assert.equal(reviewed.serviceImpact.length,1);assert.equal(reviewed.firstActivation,undefined);
});

test('confirmation freezes the complete selected ID order and fingerprints for the existing atomic transaction', () => {
  const env = fixture(), selected = [...env.ids].reverse(), confirmation = env.prepare(env.state, selected), frozen = structuredClone(confirmation);
  selected.splice(0, 1); assert.deepEqual(confirmation, frozen); assert.deepEqual(confirmation.selections.map(row => row.associationId), [...env.ids].reverse());
  assert.equal(channelEnableConfirmationIssue(env.state, confirmation), ''); assert.equal(confirmation.restoring, false);
  const enabled = env.enable(env.state, confirmation); assert.ok(env.rows(enabled).every(row => row.enabled)); assert.equal(enabled.endpoints.find(row => row.id === env.endpointId).status, '运行中');
});

test('one changed or removed selected mapping rejects the complete confirmation without filtering another member into a partial enable', () => {
  const env = fixture(), confirmation = env.prepare();
  for (const change of [state => { env.provider(state).catalogConnections.find(row => row.id === env.ids[1]).upstreamModelId = 'vendor/changed'; }, state => { env.provider(state).catalogConnections = env.provider(state).catalogConnections.filter(row => row.id !== env.ids[1]); }]) {
    const changed = structuredClone(env.state); change(changed); const before = structuredClone(changed);
    assert.match(channelEnableConfirmationIssue(changed, confirmation), /已变化/); assert.equal(confirmation.selections.length, 2);
    assert.throws(() => env.enable(changed, confirmation), /已变化/); assert.deepEqual(changed, before); assert.ok(env.rows(changed).every(row => !row.enabled));
  }
});

test('a newer failed check blocks the full frozen set even when request fingerprints did not change', () => {
  const env = fixture(), confirmation = env.prepare(), changed = env.run(env.state, 'supplierModelsTest', { endpointId: env.endpointId, associationIds: [env.ids[1]], scenarios: { [env.ids[1]]: 'unauthorized' } }), before = structuredClone(changed);
  assert.equal(confirmation.selections[1].expectedFingerprint, env.prepare().selections[1].expectedFingerprint);
  assert.match(channelEnableConfirmationIssue(changed, confirmation), /尚未全部通过/); assert.throws(() => env.enable(changed, confirmation), /健康检测/);
  assert.deepEqual(changed, before); assert.ok(env.rows(changed).every(row => !row.enabled));
});

test('pending tests, stopped supplier, credential removal and endpoint state changes all require a new confirmation', () => {
  const env = fixture(), confirmation = env.prepare();
  const changes = [state => { const endpoint = state.endpoints.find(row => row.id === env.endpointId); endpoint.serverTestJobs = [{ signature: JSON.parse(confirmation.selections[0].expectedFingerprint)[2], associationIds: [env.ids[1]] }]; }, state => { env.provider(state).status = '已停用'; }, state => { env.provider(state).apiKeys.forEach(key => { key.status = 'disabled'; }); }, state => { state.endpoints.find(row => row.id === env.endpointId).status = '停用'; }];
  for (const change of changes) { const current = structuredClone(env.state); change(current); assert.ok(channelEnableConfirmationIssue(current, confirmation)); }
  assert.throws(() => env.prepare(env.state, [...env.ids, env.ids[0]]), /不重复/); assert.throws(() => env.prepare(env.state, [env.ids[0], 'missing']), /已变化/);
});

test('restoring a stopped channel shows only services of the frozen selected mappings and leaves unselected mappings stopped', () => {
  const env = fixture(), state = structuredClone(env.state); state.endpoints.find(row => row.id === env.endpointId).status = '停用';
  for (const [index, libraryId] of ['model-2', 'model-6'].entries()) {
    state.models.find(row => row.id === libraryId).serviceMode = 'standard';
    const association = env.rows(state).find(row => row.id === env.ids[index]), supplyId = 'restore-supply-' + index;
    state.modelSupplies.push({ id: supplyId, providerId: env.providerId, modelId: libraryId, endpointId: env.endpointId, catalogueModelId: association.modelId, upstreamModelId: association.upstreamModelId, status: '已启用', validationStatus: '通过', capabilities: {} });
    state.serviceRoutes.push({ serviceId: 'standard:' + libraryId, activeVersion: 3, versions: [{ version: 3, config: { strategy: 'fixed', autoFailover: false, channels: [{ supplyId, enabled: true, priority: 1, weight: 1 }] } }] });
  }
  const confirmation = env.prepare(state, [env.ids[0]]); assert.equal(confirmation.restoring, true); assert.equal(confirmation.serviceImpact.length, 1); assert.equal(confirmation.serviceImpact[0].id, 'standard:model-2'); assert.equal(confirmation.serviceImpact[0].routeVersion, 3);
  const next = env.enable(state, confirmation); assert.equal(env.rows(next).find(row => row.id === env.ids[0]).enabled, true); assert.equal(env.rows(next).find(row => row.id === env.ids[1]).enabled, false);
  const changed = structuredClone(state), route = changed.serviceRoutes.find(row => row.serviceId === 'standard:model-2'); route.activeVersion = 4; route.versions.push({ version: 4, config: structuredClone(route.versions[0].config) });
  assert.match(channelEnableConfirmationIssue(changed, confirmation), /服务引用已变化/);
});
