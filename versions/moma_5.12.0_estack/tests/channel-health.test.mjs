import { legacySupplierState } from './legacy-supplier-fixture.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';
import { commitAdminState, persistModelAction } from '../src/admin-v2/store.js';
import { withAdminSession } from './admin-session-fixture.mjs';
import { supplierChannelAssociations } from '../src/admin-v2/supplier-resources.js';
import { connectionKeys } from '../src/admin-v2/connection-state.js';
import { keyHealth, channelModelHealth, healthFingerprint, HEALTH_MAX_AGE } from '../src/admin-v2/channel-health.js';
const setup = () => {
 const state=withAdminSession(legacySupplierState()), provider=state.providers.find(row=>row.id==='provider-moma');
 const association=supplierChannelAssociations(state,provider).find(row=>connectionKeys(row.endpoint,provider).length && row.endpoint.protocol==='OpenAI');
 return {state,provider,association,key:connectionKeys(association.endpoint,provider)[0]};
};
const action = (provider,association,key,extra={}) => ({type:'modelOperations',operation:'channelHealthTest',data:{providerId:provider.id,endpointId:association.endpointId,associationId:association.id,keyId:key.id,expectedFingerprint:healthFingerprint(provider,association,key),confirmed:true,...extra}});
const current = (state,provider,association) => supplierChannelAssociations(state,state.providers.find(row=>row.id===provider.id),association.endpointId).find(row=>row.id===association.id);
test('per-key detection persists diagnostics only, retains identity and qualification, and survives reload',()=>{
 const {state,provider,association,key}=setup(),before=structuredClone(state);
 assert.equal(keyHealth(provider,association,key).label,'未检测');
 const next=commitAdminState(state,action(provider,association,key)),row=current(JSON.parse(JSON.stringify(next)),provider,association);
 assert.equal(keyHealth(provider,row,key).label,'正常');assert.equal(keyHealth(provider,row,key).record.durationMs,486);
 assert.deepEqual(next.providers,before.providers);assert.deepEqual(next.modelSupplies,before.modelSupplies);assert.deepEqual(next.serviceRoutes,before.serviceRoutes);assert.deepEqual(next.modelSalePrices,before.modelSalePrices);
 assert.deepEqual(row.endpoint.connectionTest,association.endpoint.connectionTest);assert.equal(row.endpoint.status,association.endpoint.status);
 assert.equal(row.endpoint.keyConnectivityTests[0].simulated,true);assert.equal(row.endpoint.keyConnectivityTests[0].response,undefined);
});
test('failures, timeout and expiry override earlier success, changed key/address/mapping requires retest',()=>{
 const {state,provider,association,key}=setup();
 let next=commitAdminState(state,action(provider,association,key));let row=current(next,provider,association);
 assert.equal(keyHealth(provider,row,key,Date.parse(row.endpoint.keyConnectivityTests[0].testedAt)+HEALTH_MAX_AGE).label,'结果过期');
 assert.equal(keyHealth(provider,row,{...key,fingerprint:'a'.repeat(64)}).label,'待复测');
 next=commitAdminState(next,action(provider,row,key,{scenario:'unauthorized'}));row=current(next,provider,association);
 assert.equal(keyHealth(provider,row,key).label,'异常');assert.equal(keyHealth(provider,row,key).record.status,401);
 next=commitAdminState(next,action(provider,row,key,{scenario:'timeout'}));row=current(next,provider,association);
 assert.equal(keyHealth(provider,row,key).record.durationMs,10000);
 assert.equal(keyHealth(provider,{...row,upstreamModelId:'changed'},key).label,'待复测');
 assert.equal(keyHealth(provider,{...row,endpoint:{...row.endpoint,baseUrl:'https://changed.invalid/v1/chat/completions'}},key).label,'待复测');
});
test('one key success never qualifies an entire pool and disabled keys are excluded from active coverage',()=>{
 const {state,provider,association,key}=setup(),second=provider.apiKeys.find(row=>row.id!==key.id);
 const endpoint=state.endpoints.find(row=>row.id===association.endpointId);endpoint.authMode='pool';endpoint.keyPool=[{keyId:key.id,enabled:true,priority:1},{keyId:second.id,enabled:true,priority:2}];
 let row=current(state,provider,association), next=commitAdminState(state,action(provider,row,key));row=current(next,provider,association);
 assert.equal(channelModelHealth(provider,row).label,'待补充检测');
 const failed=commitAdminState(next,action(provider,row,second,{scenario:'unauthorized'}));
 assert.equal(channelModelHealth(provider,current(failed,provider,association)).label,'部分异常');
 next=commitAdminState(next,action(provider,row,second));row=current(next,provider,association);assert.equal(channelModelHealth(provider,row).label,'正常');
 assert.equal(channelModelHealth({...provider,apiKeys:provider.apiKeys.map(k=>k.id===second.id?{...k,status:'disabled'}:k)},row).rows.length,1);
});
test('foreign, revoked, stale, unconfirmed, unauthorized and failed-storage tests cannot mutate data',()=>{
 const {state,provider,association,key}=setup(),before=JSON.stringify(state),cmd=action(provider,association,key);
 for(const patch of [{keyId:'foreign'},{associationId:'foreign'},{expectedFingerprint:'stale'},{confirmed:false}])assert.throws(()=>commitAdminState(state,{...cmd,data:{...cmd.data,...patch}}));
 assert.throws(()=>commitAdminState({...state,currentRole:'运维人员'},cmd),/无权/);
 assert.throws(()=>persistModelAction(state,cmd,{getItem:()=>before,setItem(){throw Error('quota');}}),/quota/);
 assert.equal(JSON.stringify(state),before);
});

import { providerModelConnectivityTest } from '../src/admin-v2/provider-management.js';
test('testing saved credentials validates identity and availability without rewriting their display mask',()=>{
 const {state,provider,association,key}=setup();key.maskedKey='展示掩码';const before=structuredClone(state);
 const next=commitAdminState(state,action(provider,association,key));assert.equal(current(next,provider,association).endpoint.keyConnectivityTests.at(-1).result,'通过');assert.deepEqual(next.providers,before.providers);assert.deepEqual(state,before);
 const request={providerId:provider.id,endpointId:association.endpointId,modelId:association.modelId,upstreamId:association.upstreamModelId,keyId:key.id,prompt:'只回复 OK',scenario:'success'};
 for(const patch of [{fingerprint:'bad'},{status:'disabled'},{revokedAt:new Date().toISOString()}]){
  Object.assign(key,patch);assert.throws(()=>providerModelConnectivityTest(state,request),/密钥/);Object.assign(key,before.providers.find(row=>row.id===provider.id).apiKeys.find(row=>row.id===key.id));
 }
});
