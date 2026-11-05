import test from 'node:test';
import assert from 'node:assert/strict';
import { parseAdminState, commitAdminState, persistModelAction } from '../src/admin-v2/store.js';
import { withAdminSession } from './admin-session-fixture.mjs';
import { guidedOnboarding } from '../src/admin-v2/guided-onboarding.js';
const command=()=>{
 const value={providerId:'provider-moma',name:'无草稿接入',interfaceType:'openai',baseUrl:'https://direct.invalid/v1',authMode:'group',keyGroupId:'default',timeoutSeconds:60,capacity:''};
 const rows=[{id:'selection',libraryId:'model-2',upstreamModelId:'glm-5.2',scenarios:[{name:'输入 Token',listPrice:'1',currency:'CNY',unit:'百万 Token',condition:''}]}];
 return {type:'modelOperations',operation:'guidedChannelCreate',data:{providerId:value.providerId,task:{value,rows,intent:'reserve'},values:{...value,protocol:'OpenAI',addressMode:'base',models:rows}}};
};
test('onboarding commits full channel and task together, never a partial draft; failure retains original records',()=>{
 const state=withAdminSession(parseAdminState(null)),before=structuredClone(state),action=command();
 const next=commitAdminState(state,action),task=next.modelOnboardings.find(row=>row.createdEndpointId===next.audits[0].objectId);
 assert.ok(task);assert.equal(task.status,'已完成');assert.ok(guidedOnboarding(next,task.id).endpoint);
 assert.equal(next.endpoints.length,state.endpoints.length+1);assert.equal(next.modelOnboardings.length,state.modelOnboardings.length+1);
 assert.deepEqual(next.models,state.models);assert.deepEqual(next.modelSupplies,state.modelSupplies);assert.deepEqual(next.modelSalePrices,state.modelSalePrices);
 const broken=structuredClone(action);broken.data.values.models[0].upstreamModelId='';assert.throws(()=>commitAdminState(state,broken));assert.deepEqual(state,before);
 const raw=JSON.stringify(state);assert.throws(()=>persistModelAction(state,action,{getItem:()=>raw,setItem(){throw Error('quota');}}),/quota/);assert.deepEqual(state,before);
});
