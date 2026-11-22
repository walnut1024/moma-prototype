import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash, randomBytes } from 'node:crypto';
import { startLocalBackend } from '../database/local-runtime.js';
import { domainModelWorkspace } from '../src/mock/model-fields.js';
import { excelOffers, offerHeaders } from '../src/admin-v2/supplier-offer-fields.js';
import { protocolAndEndpoint, workbenchProtocolLabel } from '../src/admin-v2/workbench-protocol.js';

test('workbench short protocol names display endpoint paths while offer imports retain their canonical protocol', () => {
  const names = [
    ['OpenAI Chat Completions', 'OpenAI Chat'],
    ['OpenAI Responses', 'OpenAI Responses'],
    ['Anthropic Messages', 'Anthropic Messages'],
    ['OpenAI Embeddings', 'OpenAI Embeddings'],
    ['火山方舟 Video Generation', 'Ark Video'],
    ['DashScope Video Generation', 'DashScope Video'],
    ['MiniMax Video Generation', 'MiniMax Video'],
  ];
  for (const [stored, display] of names) assert.equal(workbenchProtocolLabel(stored), display);
  const address = 'https://gateway.example.test/v1/chat/completions';
  assert.equal(protocolAndEndpoint('OpenAI Chat Completions', address), 'OpenAI Chat：/v1/chat/completions');
  for (const name of ['OpenAI Chat', 'OpenAI Chat Completions']) {
    const [offer] = excelOffers([offerHeaders, ['测试模型', 'test/model', 'qa/test', '语言模型', name, address]], {});
    assert.equal(offer.bindings[0].protocol, 'OpenAI Chat Completions');
    assert.equal(offer.bindings[0].url, address);
  }
});

test('Responses channel selection persists through HTTP/D1 and invalid choices roll back', {timeout:60000},async()=>{
 const accessCode=randomBytes(24).toString('hex'),local=await startLocalBackend({demo:true,loginHashes:{'admin-001':createHash('sha256').update(accessCode).digest('hex')}});let cookie='';
 const request=(path,body)=>local.runtime.dispatchFetch('https://example.test/api/v1'+path,{method:body?'POST':'GET',headers:{...(cookie?{cookie}:{}),...(body?{origin:'https://example.test','x-moma-request':'1','content-type':'application/json','idempotency-key':body.operationId || crypto.randomUUID()}: {})},...(body?{body:JSON.stringify(body)}:{})});
 const read=async()=>domainModelWorkspace(await(await request('/model-operations')).json());
 const command=(state,data)=>({operationId:crypto.randomUUID(),expectedRevision:state.revision,action:{type:'modelOperations',operation:'supplierChannelRegister',data}});
 try{
  assert.equal((await request('/model-operations')).status,401);
  const login=await request('/auth/login',{accountId:'admin-001',accessCode});assert.equal(login.status,200);cookie=login.headers.get('set-cookie').split(';')[0];
  let state=await read();const provider=state.providers.find(row=>row.id==='provider-moma'),model=provider.catalogModels.find(row=>row.type==='text');
  const data={providerId:provider.id,modelId:model.modelId,name:'D1 Responses 接入',upstreamModelId:'vendor/responses',baseUrl:'https://responses.example.invalid/v1',protocol:'OpenAI',interfaceType:'openai-responses',authMode:'group',keyGroupId:'default',scenarios:[]};
  const before=structuredClone(state);const bad=await request('/model-operations/commands',command(state,{...data,interfaceType:'unsupported'}));assert.equal(bad.status,422);assert.deepEqual(await read(),before);
  const body=command(state,data),response=await request('/model-operations/commands',body);assert.equal(response.status,200,await response.clone().text());const receipt=await response.json();
  assert.deepEqual(await(await request('/model-operations/commands',body)).json(),receipt);
  state=await read();const endpoint=state.endpoints.find(row=>row.name===data.name);assert.equal(endpoint.interfaceType,'openai-responses');assert.equal(endpoint.protocol,'OpenAI');
  const stored=JSON.parse(await local.db.prepare('SELECT record_json FROM channels WHERE id=?').bind(endpoint.id).first('record_json'));assert.equal(stored.interfaceType,'openai-responses');
  for(const key of ['models','modelSalePrices','serviceRoutes','supplyPrices'])assert.deepEqual(state[key],before[key],key);
  assert.equal((await local.db.prepare('PRAGMA foreign_key_check').all()).results.length,0);
 }finally{await local.runtime.dispose();}
});
