import test from 'node:test';
import assert from 'node:assert/strict';
import { initialModelWorkspace } from '../server/model-repository.js';
import { commitAdminState } from '../src/admin-v2/state-transaction.js';
import { archiveAcceptanceFixture } from '../src/admin-v2/acceptance-cleanup.js';
import { withAcceptanceFixtures, fixtures } from './acceptance-fixture-state.mjs';

const action = spec => ({ type: 'modelOperations', operation: 'archiveAcceptanceFixture', data: { providerId: spec.providerId, confirmed: true } });
test('explicit acceptance cleanup removes only the scoped current resources and retains materials, prices and business history', () => {
  const state = withAcceptanceFixtures(initialModelWorkspace()), before = structuredClone(state);
  let next = state;
  for (const spec of fixtures) next = commitAdminState(next, action(spec), '平台管理员');
  for (const [key, field] of [['providers','providerId'],['endpoints','endpointId'],['models','modelId'],['modelSupplies','supplyId']]) assert.deepEqual(next[key], state[key].filter(row => !fixtures.some(spec => spec[field] === row.id)));
  assert.deepEqual(next.modelVersions, state.modelVersions.filter(row => !fixtures.some(spec => spec.modelId === row.modelId)));
  for (const key of ['modelTemplates','modelSalePrices','supplyPrices','requests','orders','serviceRoutes','modelOnboardings','tariffDictionary']) assert.deepEqual(next[key], state[key]);
  assert.equal(next.revision, state.revision + 3); assert.equal(next.audits.length, state.audits.length + 3);
  assert.deepEqual(state, before);
});
test('cleanup refuses other suppliers, missing confirmation, modified identities and any new live references without partial writes', () => {
  const state = withAcceptanceFixtures(initialModelWorkspace()), spec = fixtures[0], before = structuredClone(state);
  for (const data of [{providerId:'provider-moma',confirmed:true},{providerId:spec.providerId},{providerId:'unknown',confirmed:true}]) assert.throws(() => archiveAcceptanceFixture(state,data));
  const mutations = [
    s => { s.providers.find(row=>row.id===spec.providerId).name='手工改名'; },
    s => { s.models.find(row=>row.id===spec.modelId).callsEnabled=true; },
    s => { s.models.find(row=>row.id===spec.modelId).listingStatus='已上架'; },
    s => { s.providers.find(row=>row.id===spec.providerId).catalogModelIds.push('manual'); },
    s => { s.modelSupplies.push({...s.modelSupplies.find(row=>row.id===spec.supplyId),id:'foreign-supply',modelId:'model-glm53'}); },
    s => { s.serviceRoutes.push({id:'foreign-route',serviceId:'standard:model-glm53',draft:{channels:[{supplyId:spec.supplyId}]}}); },
    s => { s.orders.push({id:'order',modelId:spec.modelId}); },
    s => { s.endpoints.find(row=>row.id===spec.endpointId).serverTestJobs=[{id:'pending'}]; },
    s => { s.modelOnboardings.push({id:'pending',providerId:spec.providerId}); },
  ];
  for (const mutate of mutations) { const changed=structuredClone(state);mutate(changed);const snapshot=structuredClone(changed);assert.throws(()=>commitAdminState(changed,action(spec),'平台管理员'));assert.deepEqual(changed,snapshot); }
  assert.throws(()=>archiveAcceptanceFixture({...state,currentRole:'运营人员'},action(spec).data),/仅平台管理员/);
  assert.deepEqual(state,before);
});
