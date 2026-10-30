import test from 'node:test';
import assert from 'node:assert/strict';
import {createAdminSeed,parseAdminState,commitAdminState} from '../src/admin-v2/store.js';
import {prepareSupplierReviewCases} from '../src/admin-v2/supplier-review-cases.js';
import {supplierChannelResources,supplierChannelAssociations,supplierCredentialIssues,supplierChannelReadiness} from '../src/admin-v2/supplier-resources.js';
import {displayedCatalogueIds} from '../src/admin-v2/moma-provider.js';
import {catalogueChannels,channelInterfaceIssue,channelBlockReason} from '../src/admin-v2/provider-channels.js';
import {availableServiceChannels} from '../src/admin-v2/service-workspace.js';
import {connectionCredentialsReady} from '../src/admin-v2/connection-state.js';
import {providerApiKeysDraft} from '../src/admin-v2/provider-management.js';
const owner=(s,id='provider-moma')=>s.providers.find(p=>p.id===id);
const run=(s,id,operation,values)=>commitAdminState(s,{type:'modelOperations',operation:'provider',data:{operation,objectId:id,values}});

test('an unassociated legacy resource does not make configured supplier models appear broken',()=>{
 const s=prepareSupplierReviewCases(createAdminSeed()),p=owner(s),legacy=s.endpoints.find(row=>row.id==='endpoint-moma');
 assert.ok(legacy);assert.equal(connectionCredentialsReady(legacy,p),false);
 assert.equal(supplierChannelAssociations(s,p,legacy.id).length,0);
 assert.deepEqual(supplierCredentialIssues(s,p,displayedCatalogueIds(p,s)),[]);
 assert.equal(supplierChannelReadiness(legacy,p).label,'凭证待配置');
 assert.equal(supplierChannelResources(s,p).some(row=>row.id===legacy.id),true);
});

test('a legacy inherited-credential choice takes effect only after the channel configuration is saved',()=>{
 const s=prepareSupplierReviewCases(createAdminSeed()),p=owner(s),legacy=s.endpoints.find(row=>row.id==='endpoint-moma');
 assert.equal(legacy.authMode,undefined);assert.equal(connectionCredentialsReady(legacy,p),false);
 const next=run(s,p.id,'supplierChannelSave',{endpointId:legacy.id,name:legacy.name,protocol:'OpenAI',baseUrl:'https://moma.example.invalid/v1/chat/completions',authMode:'inherit'});
 const saved=next.endpoints.find(row=>row.id===legacy.id);
 assert.equal(connectionCredentialsReady(saved,owner(next)),true);
 assert.equal(supplierChannelReadiness(saved,owner(next)).label,'待连接测试');
 assert.equal(connectionCredentialsReady(legacy,p),false);
});

test('the credential warning is scoped to the actual affected models and Kimi recovery cannot skip stages',async()=>{
 let s=parseAdminState(null);const id='provider-kimi-official';let p=owner(s,id),ep=supplierChannelResources(s,p)[0];
 assert.deepEqual(supplierCredentialIssues(s,p).map(issue=>issue.modelIds),[['kimi-k2']]);
 assert.deepEqual(supplierCredentialIssues(s,p,[]),[]);
 const before=JSON.stringify(s);let link=catalogueChannels(s,p,'kimi-k2')[0];
 assert.throws(()=>run(s,id,'channelTest',{modelId:'kimi-k2',channelId:link.id,scenario:'success'}),/凭证/);
 const key=await providerApiKeysDraft(['test-kimi-case-local-only-1234']);
 s=run(s,id,'addApiKeys',key);p=owner(s,id);ep=s.endpoints.find(row=>row.id===ep.id);
 assert.deepEqual(supplierCredentialIssues(s,p),[]);assert.equal(supplierChannelReadiness(ep,p).label,'待连接测试');
 assert.throws(()=>run(s,id,'channelTest',{modelId:'kimi-k2',channelId:link.id,scenario:'success'}),/渠道连接测试/);
 s=run(s,id,'supplierChannelTest',{endpointId:ep.id});
 assert.equal(supplierChannelReadiness(s.endpoints.find(row=>row.id===ep.id),owner(s,id)).label,'待启用渠道');
 s=run(s,id,'supplierChannelEnable',{endpointId:ep.id});
 link=catalogueChannels(s,owner(s,id),'kimi-k2')[0];assert.equal(link.enabled,false);
 s=run(s,id,'channelTest',{modelId:'kimi-k2',channelId:link.id,scenario:'success'});
 s=run(s,id,'channelEnable',{modelId:'kimi-k2',channelId:link.id});
 assert.equal(catalogueChannels(s,owner(s,id),'kimi-k2')[0].enabled,true);
 assert.equal(supplierChannelReadiness(s.endpoints.find(row=>row.id===ep.id),owner(s,id)).ready,true);
 assert.equal(before.includes('test-kimi-case-local-only-1234'),false);assert.equal(JSON.stringify(s).includes('test-kimi-case-local-only-1234'),false);
});

test('a saved native model linked to a chat-only channel cannot be reported or retested as usable',()=>{
 const s=parseAdminState(null),p=owner(s),ep=s.endpoints.find(row=>row.channelCode==='CH-001');
 p.catalogConnections.push({...p.catalogConnections.find(row=>row.endpointId===ep.id),id:'old-vector-link',modelId:'BGE-M3',upstreamModelId:'BGE-M3'});
 const link=catalogueChannels(s,p,'BGE-M3')[0];
 assert.match(channelInterfaceIssue(p,link),/不适用 Chat Completions/);
 assert.throws(()=>run(s,p.id,'channelTest',{modelId:'BGE-M3',channelId:link.id,scenario:'success'}),/不适用 Chat Completions/);
 assert.throws(()=>run(s,p.id,'channelEnable',{modelId:'BGE-M3',channelId:link.id}),/不适用 Chat Completions/);
});

test('failed or inactive shared resources block service selection even when a model association was previously enabled',()=>{
 const s=parseAdminState(null),p=owner(s),ep=s.endpoints.find(row=>row.channelCode==='CH-001');
 const link=catalogueChannels(s,p,'GLM-5.2').find(row=>row.endpointId===ep.id);
 assert.equal(channelBlockReason(p,link),'');
 const failed=run(s,p.id,'supplierChannelTest',{endpointId:ep.id,scenario:'超时'}),failedProvider=owner(failed);
 assert.equal(catalogueChannels(failed,failedProvider,link.modelId).find(row=>row.id===link.id).enabled,true);
 assert.equal(supplierChannelReadiness(failed.endpoints.find(row=>row.id===ep.id),failedProvider).ready,false);
 assert.match(availableServiceChannels(failed,failedProvider,link.modelId).find(row=>row.id===link.id).reason,/渠道连接测试/);
 const inactive=structuredClone(s);inactive.endpoints.find(row=>row.id===ep.id).status='停用';
 assert.match(availableServiceChannels(inactive,owner(inactive),link.modelId).find(row=>row.id===link.id).reason,/渠道待启用/);
});
