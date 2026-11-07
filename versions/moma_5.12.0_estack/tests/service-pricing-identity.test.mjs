import test from 'node:test';
import assert from 'node:assert/strict';
import { servicePriceIdentity } from '../src/admin-v2/service-workspace.js';
import { MOMA_PROVIDER, supplierDirectory } from '../src/admin-v2/moma-provider.js';
import { createAdminSeed, commitAdminState } from '../src/admin-v2/store.js';
import { withAdminSession } from './admin-session-fixture.mjs';

test('prices use current supplier names and customer-facing IDs for both modes', () => {
  const state={providers:[{id:'vendor',name:'智谱'},{id:MOMA_PROVIDER.id,name:'平台当前名称'}]};
  const model={modelId:'unified-call',serviceProviders:[{providerId:'vendor',callId:'vendor-call'}]};
  assert.deepEqual(servicePriceIdentity(state,model),{supplierName:'平台当前名称',callId:'unified-call'});
  assert.deepEqual(servicePriceIdentity(state,model,'vendor'),{supplierName:'智谱',callId:'vendor-call'});
  state.providers[1].name='平台更名';
  assert.equal(servicePriceIdentity(state,model).supplierName,'平台更名');
  assert.equal(servicePriceIdentity(state,model,'missing').callId,'');
  state.providers=[];
  assert.equal(servicePriceIdentity(state,model).supplierName,'服务商已不存在');
});

test('platform supplier is pinned once regardless of stored order', () => {
  const state=withAdminSession(createAdminSeed());
  state.providers.reverse();
  const rows=supplierDirectory(state);
  assert.equal(rows[0].id,MOMA_PROVIDER.id);
  assert.equal(rows.filter(row=>row.id===MOMA_PROVIDER.id).length,1);
});

test('built-in platform supplier cannot be removed in a batch', () => {
  const state=withAdminSession(createAdminSeed());
  const before=structuredClone(state);
  assert.throws(()=>commitAdminState(state,{type:'batch',changes:[{type:'remove',collection:'providers',id:MOMA_PROVIDER.id}]}),/内置平台服务商不可删除/);
  assert.deepEqual(state,before);
});
