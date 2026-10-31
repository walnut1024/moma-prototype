import test from 'node:test';
import assert from 'node:assert/strict';
import { parseAdminState, commitAdminState } from '../src/admin-v2/store.js';
import { supplierChannelAssociations } from '../src/admin-v2/supplier-resources.js';
import { prepareAuthorizedCandidateProbe, candidateProbeResumeIssue, candidateProbeResultCurrent } from '../src/admin-v2/candidate-probe-start.js';

function fixture() {
  const providerId='provider-moma';
  let state=commitAdminState(parseAdminState(null),{type:'modelOperations',operation:'provider',data:{operation:'supplierChannelCreate',objectId:providerId,values:{name:'一键候选测试',interfaceType:'openai',baseUrl:'https://active.example.invalid/v1',protocol:'OpenAI',authMode:'group',keyGroupId:'default',models:[{libraryId:'model-2',upstreamModelId:'vendor/chat',scenarios:[]}]}}});
  const endpoint=state.endpoints.find(row=>row.name==='一键候选测试'),provider=state.providers.find(row=>row.id===providerId),mapping=supplierChannelAssociations(state,provider,endpoint.id)[0];
  const context={providerId,endpointId:endpoint.id,expectedRevision:0};
  const records=[{associationId:mapping.id,modelId:'model-2',upstreamModelId:mapping.upstreamModelId,type:'text'}];
  return {state,endpoint,context,records,prepare:()=>{
    state=commitAdminState(state,{type:'modelOperations',operation:'channelCandidateSave',data:{...context,config:{baseUrl:'https://candidate.example.invalid/v1'}}});
    return {state,context:{...context,candidateId:state.endpoints.find(row=>row.id===endpoint.id).candidateConfiguration.id}};
  }};
}

test('one explicit basic test click can prepare and test a candidate while preserving the active configuration',async t=>{
  t.mock.method(globalThis,'fetch',()=>assert.fail('mock candidate tests do not use network'));
  const env=fixture(),original=structuredClone(env.state);let prepared=0;
  const beforeTest=()=>{prepared++;return env.prepare();};
  await assert.rejects(()=>prepareAuthorizedCandidateProbe(env.state,env.context,{}, {records:env.records,beforeTest}),/明确授权/);
  assert.equal(prepared,0);assert.deepEqual(env.state,original);
  const job=await prepareAuthorizedCandidateProbe(env.state,env.context,{}, {records:env.records,beforeTest,explicitBasicClick:true});
  assert.equal(prepared,1);assert.equal(job.operation,'channelCandidateTestJob');assert.equal(job.data.request.models.length,1);
  assert.equal(env.state.endpoints.find(row=>row.id===env.endpoint.id).baseUrl,env.endpoint.baseUrl);
  assert.equal(env.state.endpoints.find(row=>row.id===env.endpoint.id).candidateConfiguration,undefined);
});

test('media and specialist candidate plans require their own explicit usage acknowledgement before preparing',async()=>{
  const env=fixture();let prepared=0;const beforeTest=()=>{prepared++;return null;};
  await assert.rejects(()=>prepareAuthorizedCandidateProbe(env.state,env.context,{check:'tools'}, {records:env.records,beforeTest,explicitBasicClick:true}),/明确授权/);
  const media=[{...env.records[0],type:'image'}],options={expensiveIds:[env.records[0].associationId]};
  await assert.rejects(()=>prepareAuthorizedCandidateProbe(env.state,env.context,options,{records:media,beforeTest,explicitBasicClick:true}),/明确授权/);
  assert.equal(prepared,0);
  assert.equal(await prepareAuthorizedCandidateProbe(env.state,env.context,options,{records:media,beforeTest,consent:true}),null);
  assert.equal(prepared,1);
});

test('a mapping added while preparing cannot silently expand the explicitly authorized candidate test',async()=>{
  const env=fixture();
  const beforeTest=()=>{
    const changed=commitAdminState(env.state,{type:'modelOperations',operation:'provider',data:{operation:'supplierModelsAdd',objectId:env.context.providerId,values:{endpointId:env.endpoint.id,models:[{libraryId:'model-6',upstreamModelId:'vendor/embed',scenarios:[]}]}}});
    const next=commitAdminState(changed,{type:'modelOperations',operation:'channelCandidateSave',data:{...env.context,config:{baseUrl:'https://candidate.example.invalid/v1'}}});
    return {state:next,context:{...env.context,candidateId:next.endpoints.find(row=>row.id===env.endpoint.id).candidateConfiguration.id}};
  };
  await assert.rejects(()=>prepareAuthorizedCandidateProbe(env.state,env.context,{}, {records:env.records,beforeTest,explicitBasicClick:true}),/模型范围已变化/);
  assert.equal(env.state.endpoints.find(row=>row.id===env.endpoint.id).baseUrl,env.endpoint.baseUrl);
  assert.equal(env.state.endpoints.find(row=>row.id===env.endpoint.id).candidateTestJobs,undefined);
});

test('continuing an unsubmitted original candidate request rechecks its stored identity and current credentials',async()=>{
  const env=fixture(),prepared=env.prepare(),job=await prepareAuthorizedCandidateProbe(prepared.state,prepared.context,{}, {explicitBasicClick:true});
  const tracked=commitAdminState(prepared.state,{type:'modelOperations',operation:job.operation,data:job.data});
  assert.equal(candidateProbeResumeIssue(tracked,prepared.context,job.data),'');
  const changed=structuredClone(tracked);changed.providers.find(row=>row.id===env.context.providerId).apiKeys.forEach(row=>{row.status='disabled';});
  assert.ok(candidateProbeResumeIssue(changed,prepared.context,job.data));
  assert.ok(candidateProbeResumeIssue(tracked,prepared.context,{...job.data,request:{...job.data.request,models:[]}}));
  assert.ok(candidateProbeResumeIssue(tracked,{...prepared.context,candidateId:'other'},job.data));
});

test('applied candidates and untested form edits label retained results as history without clearing a new prepared job',()=>{
  const context={providerId:'provider',endpointId:'endpoint',candidateId:'candidate-1'},job={...context};
  assert.equal(candidateProbeResultCurrent(context,job),true);
  assert.equal(candidateProbeResultCurrent({...context,candidateId:undefined},job),false);
  assert.equal(candidateProbeResultCurrent(context,job,true),false);
  assert.equal(candidateProbeResultCurrent({...context,endpointId:'other'},job),false);
  assert.equal(candidateProbeResultCurrent({...context,candidateId:'candidate-2'},job),false);
  assert.equal(candidateProbeResultCurrent({...context,candidateId:'candidate-2'},{...job,candidateId:'candidate-2'}),true);
  assert.equal(job.candidateId,'candidate-1');
});
