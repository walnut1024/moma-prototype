import test from 'node:test';
import assert from 'node:assert/strict';
import { createAdminSeed, commitAdminState } from '../src/admin-v2/store.js';
import { withAdminSession } from './admin-session-fixture.mjs';
import { pendingGuidedOnboardings } from '../src/admin-v2/guided-onboarding.js';
import { similarOnboardingProviders, resolveOnboardingProvider } from '../src/admin-v2/onboarding-presets.js';
const seed=()=>withAdminSession(createAdminSeed());
test('a model-only task is safe to resume before selecting a supplier and does not create a service',()=>{
  const state=seed(),before=structuredClone(state);
  const next=commitAdminState(state,{type:'modelOperations',operation:'channelDraftSave',data:{guided:true,step:1,value:{providerId:'unselected',name:''},rows:[{id:'one',newModel:{modelId:'pending-new-model',name:'待接入模型',type:'text'},upstreamModelId:'',scenarios:[]}]}});
  assert.deepEqual(next.models,before.models);assert.deepEqual(next.endpoints,before.endpoints);
  assert.equal(pendingGuidedOnboardings(next).filter(context=>context.endpoint).length,0,'unfinished forms are not resumable tasks');
});
test('supplier similarity is a reuse hint and never merges different stable entities',()=>{
  const state=seed();state.providers=[{id:'real',name:'智谱',code:'custom-zhipu',status:'已启用',sourceType:'thirdParty'}];
  assert.deepEqual(similarOnboardingProviders(state,'智谱开放平台').map(row=>row.id),['real']);
  const selected=resolveOnboardingProvider(state,{providerPresetId:'zhipu'});assert.notEqual(selected.id,'real');assert.equal(selected.isDraft,true);
  assert.deepEqual(resolveOnboardingProvider(state,{providerId:'real'}).id,'real');
});
