import test from 'node:test';
import assert from 'node:assert/strict';
import {legacySupplierState} from './legacy-supplier-fixture.mjs';
import {commitAdminState,persistModelAction} from '../src/admin-v2/store.js';
import {providerKeyGroups} from '../src/admin-v2/provider-key-groups.js';
import {providerApiKeyId,providerApiKeyRows} from '../src/admin-v2/provider-management.js';
import {connectionKeys} from '../src/admin-v2/connection-state.js';

const owner = state => state.providers.find(row=>row.id==='provider-moma');
const group = state => providerKeyGroups(owner(state))[0];
const args = state => ({providerId:owner(state).id,groupId:'default',expectedGroupVersion:owner(state).keyGroupRevisions?.default || 0,candidateId:owner(state).keyGroupCandidates?.[0]?.id});
const action = (state,keyId,direction,patch={}) => ({type:'modelOperations',operation:'keyGroupPriority',data:{...args(state),expectedKeyIds:group(state).keyIds,keyId,direction,...patch}});
const run = (state,keyId,direction,patch) => commitAdminState(state,action(state,keyId,direction,patch));
const candidate = (state,operation,patch={}) => commitAdminState(state,{type:'modelOperations',operation,data:{...args(state),...patch}});

test('short display codes preserve stable identities and distinguish existing long named IDs',()=>{
  for(const id of ['showcase-key-moma-self','showcase-key-moma-resale','showcase-key-deepseek']){const key={id};assert.match(providerApiKeyId(key),/^KEY-[a-f0-9]{8}$/);assert.equal(key.id,id);assert.equal(providerApiKeyId({id}),providerApiKeyId(key));}
  assert.notEqual(providerApiKeyId({id:'showcase-key-moma-self'}),providerApiKeyId({id:'showcase-key-moma-resale'}));
  assert.equal(providerApiKeyId({id:'KEY-001'}),'KEY-001');
});
test('distinct saved IDs with the same fingerprint remain visible and reorder without losing channel references',()=>{
  const state=legacySupplierState(),provider=owner(state);provider.apiKeys[1].fingerprint=provider.apiKeys[0].fingerprint;
  const keys=providerApiKeyRows(state,provider).map(row=>row.apiKey),visible=providerKeyGroups(provider,keys)[0];
  assert.deepEqual(visible.keyIds,group(state).keyIds);assert(keys.some(key=>key.id==='KEY-001') && keys.some(key=>key.id==='KEY-002'));
  const next=run(state,'KEY-003','up');assert.deepEqual(next.endpoints,state.endpoints);assert.equal(owner(next).apiKeys.length,provider.apiKeys.length);
});
test('explicit priority edits import referenced legacy key metadata atomically without rewriting original channel identities',()=>{
  const state=legacySupplierState(),provider=owner(state),legacy={id:'legacy-shared-key',maskedKey:'test••••••••only',fingerprint:'a'.repeat(64),status:'enabled'};
  state.endpoints.push({id:'legacy-shared-endpoint',providerId:provider.id,apiKeys:[legacy],authMode:'specific',apiKeyId:legacy.id,status:'草稿'});
  const expectedKeyIds=providerKeyGroups(provider,providerApiKeyRows(state,provider).map(row=>row.apiKey))[0].keyIds;
  const next=run(state,legacy.id,'up',{expectedKeyIds});assert(owner(next).apiKeys.some(row=>row.id===legacy.id));assert.deepEqual(next.endpoints,state.endpoints);assert.equal(group(next).keyIds.at(-2),legacy.id);
});
test('adjacent backup moves persist full ordering and history without changing active credentials or other resources',()=>{
  const state=legacySupplierState(),before=structuredClone(state),next=run(state,'KEY-003','up');
  assert.deepEqual(group(next).keyIds,['KEY-001','KEY-003','KEY-002']);
  assert.equal(owner(next).defaultApiKeyId,owner(state).defaultApiKeyId);
  assert.equal(owner(next).keyGroupRevisions.default,1);assert.equal(owner(next).keyGroupVersions.length,2);
  for(const key of ['endpoints','models','modelSupplies','serviceRoutes','supplyPrices','modelSalePrices'])assert.deepEqual(next[key],state[key],key);
  const restored=run(next,'KEY-003','down');assert.deepEqual(group(restored).keyIds,group(state).keyIds);assert.deepEqual(state,before);
});
test('first-key changes stage a candidate, preserve current calls and require passing tests before explicit application',()=>{
  const state=legacySupplierState(),staged=run(state,'KEY-002','up');
  assert.deepEqual(group(staged).keyIds,group(state).keyIds);assert.deepEqual(staged.endpoints,state.endpoints);
  assert.equal(owner(staged).keyGroupCandidates[0].priorityChange,true);
  assert.deepEqual(owner(staged).keyGroupCandidates[0].keyIds,['KEY-002','KEY-001','KEY-003']);
  assert.throws(()=>candidate(staged,'keyGroupCandidateApply',{confirmed:true}),/尚未|未通过|测试/);
  const tested=candidate(staged,'keyGroupCandidateTest');const applied=candidate(tested,'keyGroupCandidateApply',{confirmed:true});
  assert.deepEqual(group(applied).keyIds,['KEY-002','KEY-001','KEY-003']);assert.equal(owner(applied).defaultApiKeyId,'KEY-002');
  const inherited=applied.endpoints.find(row=>row.providerId===owner(applied).id && row.authMode==='inherit');assert.equal(connectionKeys(inherited,owner(applied))[0].id,'KEY-002');
  for(const key of ['models','serviceRoutes','modelSalePrices'])assert.deepEqual(applied[key],state[key],key);
  const rollback=candidate(applied,'keyGroupCandidateRollback',{targetVersion:0});assert.deepEqual(owner(rollback).keyGroupCandidates[0].keyIds,group(state).keyIds);
});
test('unreferenced groups save primary order directly; disabled or revoked new primaries are rejected',()=>{
  const state=legacySupplierState();state.endpoints=state.endpoints.filter(row=>row.providerId!=='provider-moma');
  const next=run(state,'KEY-002','up');assert.equal(owner(next).defaultApiKeyId,'KEY-002');assert.ok(!owner(next).keyGroupCandidates?.length);
  for(const patch of [{status:'disabled'},{revokedAt:new Date().toISOString()}]){const bad=structuredClone(state);Object.assign(owner(bad).apiKeys[1],patch);assert.throws(()=>run(bad,'KEY-002','up'),/可用|撤销/);}
});
test('invalid moves, stale order/revision, foreign groups, pending edits and readonly or failed writes never mutate state',()=>{
  const state=legacySupplierState(),before=structuredClone(state);
  for(const [id,direction,patch] of [['KEY-001','up'],['KEY-003','down'],['missing','up'],['KEY-002','sideways'],['KEY-002','up',{groupId:'foreign'}],['KEY-002','up',{expectedGroupVersion:99}],['KEY-002','up',{expectedKeyIds:['KEY-002','KEY-001','KEY-003']}]])assert.throws(()=>run(state,id,direction,patch));
  assert.throws(()=>commitAdminState(state,action(state,'KEY-003','up'),'运维人员'),/无权/);
  assert.throws(()=>persistModelAction(state,action(state,'KEY-003','up'),{getItem:()=>JSON.stringify(state),setItem:()=>{throw Error('quota');}}),/quota/);
  const staged=run(state,'KEY-002','up');assert.throws(()=>run(staged,'KEY-003','up'),/待处理/);
  const discarded=candidate(staged,'keyGroupCandidateDiscard');assert.deepEqual(group(discarded).keyIds,group(state).keyIds);
  assert.deepEqual(state,before);
});
