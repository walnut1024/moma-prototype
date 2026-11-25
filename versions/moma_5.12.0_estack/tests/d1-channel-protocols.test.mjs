import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash, randomBytes } from 'node:crypto';
import { startLocalBackend } from '../database/local-runtime.js';
import { domainModelWorkspace } from '../src/mock/model-fields.js';
import { excelOffers, offerHeaders } from '../src/admin-v2/supplier-offer-fields.js';
import { protocolAndEndpoint, workbenchProtocolLabel } from '../src/admin-v2/workbench-protocol.js';
import { providerApiKeysDraft } from '../src/admin-v2/provider-management.js';

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

test('HTTP/D1 derives new connection endpoints and enforces separate upstream key limits', async t => {
  const accessCode = randomBytes(24).toString('hex');
  const hash = createHash('sha256').update(accessCode).digest('hex');
  const local = await startLocalBackend({demo:true, loginHashes:{'admin-001':hash}});
  t.after(() => local.runtime.dispose());
  let cookie;
  function request(path, body) {
    const headers = cookie ? {cookie} : {};
    if (body) Object.assign(headers, {origin:'https://example.test', 'content-type':'application/json', 'x-moma-request':'1'});
    if (body?.operationId) headers['idempotency-key'] = body.operationId;
    return local.runtime.dispatchFetch('https://example.test/api/v1' + path, {
      method:body ? 'POST' : 'GET', headers, body:body ? JSON.stringify(body) : undefined,
    });
  }
  const login = await request('/auth/login', {accountId:'admin-001', accessCode});
  assert.equal(login.status, 200);
  cookie = login.headers.get('set-cookie').split(';')[0];
  const read = async () => domainModelWorkspace(await (await request('/model-operations')).json());
  let state = await read();
  const {apiKeys:defaultKeys} = await providerApiKeysDraft(['qa-format-endpoint-key']);
  const modern = {providerId:'provider-moma', channelSourceType:'thirdParty',
    baseUrl:'https://endpoint-contract.example.invalid/api/v1/', authMode:'independent', timeoutSeconds:60};
  const alternatePath = '/services/aigc/image2video/video-synthesis';
  const defaultVideoPath = '/services/aigc/video-generation/video-synthesis';
  function command(operation, data) {
    return request('/model-operations/commands', {
      operationId:crypto.randomUUID(), expectedRevision:state.revision,
      action:{type:'modelOperations', operation, data},
    });
  }
  function create(fields, name, keys = defaultKeys) {
    const creationId = crypto.randomUUID();
    return command('channelDirectoryCreate', {...modern, keyStrategy:'priority', ...fields, rows:[{creationId, name, keys}]});
  }

  const rejected = await create({modelProtocol:'dashscope-video', endpointPath:alternatePath}, 'D1 拒绝覆盖端点');
  assert.equal(rejected.status, 422);
  assert.match((await rejected.json()).error.message, /接口端点由接口格式/);
  const missingFormat = await create({}, 'D1 缺少接口格式');
  assert.equal(missingFormat.status, 422);
  assert.match((await missingFormat.json()).error.message, /请选择接口格式/);
  const afterRejection = await read();
  assert.equal(afterRejection.revision, state.revision);
  assert.deepEqual(afterRejection.endpoints, state.endpoints);

  const cases = [
    [{modelProtocol:'openai-responses'}, 'D1 自动端点', '/responses'],
    [{modelProtocol:'dashscope-video', endpointPath:defaultVideoPath}, 'D1 正确端点', defaultVideoPath],
    [{channelSourceType:undefined, modelProtocol:'dashscope-video', endpointPath:alternatePath}, 'D1 旧入口自定义端点', alternatePath],
  ];
  for (const [fields, name, path] of cases) {
    const response = await create(fields, name);
    assert.equal(response.status, 200, await response.clone().text());
    state = await read();
    const endpoint = state.endpoints.find(row => row.name === name);
    assert.equal(endpoint.modelProtocol, fields.modelProtocol);
    assert.equal(endpoint.endpointPath, path);
    const stored = await local.db.prepare('SELECT base_url, record_json FROM channels WHERE id=?').bind(endpoint.id).first();
    assert.equal(stored.base_url, modern.baseUrl.slice(0, -1));
    assert.equal(JSON.parse(stored.record_json).endpointPath, path);
  }

  const profile = {name:'D1 密钥上限服务商', code:'d1-key-cap', sourceType:'thirdParty'};
  const providerCreated = await command('provider', {operation:'create', values:profile});
  assert.equal(providerCreated.status, 200, await providerCreated.clone().text());
  state = await read();
  const providerId = state.providers.find(row => row.code === profile.code).id;
  const shared = () => state.providers.find(row => row.id === providerId).apiKeys ?? [];
  const fields = {providerId, modelProtocol:'openai'};
  const secrets = Array.from({length:12}, (_, index) => `qa-directory-key-limit-${index}`);
  const {apiKeys:keys} = await providerApiKeysDraft(secrets);
  const overLimit = await create(fields, 'D1 提交六把连接密钥', keys.slice(0, 6));
  assert.equal(overLimit.status, 422);
  assert.match((await overLimit.json()).error.message, /每个连接最多配置 5 把/);
  assert.deepEqual(await read(), state);
  const created = await create(fields, 'D1 提交五把连接密钥', keys.slice(0, 5));
  assert.equal(created.status, 200, await created.clone().text());
  state = await read();
  const endpoint = state.endpoints.find(row => row.name === 'D1 提交五把连接密钥');
  const privateKeys = JSON.parse(await local.db.prepare('SELECT record_json FROM channels WHERE id=?')
    .bind(endpoint.id).first('record_json')).apiKeys;
  assert.deepEqual(privateKeys.map(row => row.fingerprint), keys.slice(0, 5).map(row => row.fingerprint));
  assert.deepEqual(shared(), []);

  const addToPool = apiKeys => command('provider', {operation:'addApiKeys', objectId:providerId, values:{apiKeys, standalone:true}});
  const firstFour = await addToPool(keys.slice(6, 10));
  assert.equal(firstFour.status, 200, await firstFour.clone().text());
  state = await read();
  assert.equal(shared().length, 4);
  const tooMany = await addToPool(keys.slice(10, 12));
  assert.equal(tooMany.status, 422);
  assert.match((await tooMany.json()).error.message, /上游 API 密钥池最多配置 5 把/);
  assert.deepEqual(await read(), state);
  const fifth = await addToPool(keys.slice(10, 11));
  assert.equal(fifth.status, 200, await fifth.clone().text());
  state = await read();
  assert.deepEqual(shared().map(row => row.fingerprint), keys.slice(6, 11).map(row => row.fingerprint));
  assert.equal((await addToPool(keys.slice(11))).status, 422);
  assert.deepEqual(await read(), state);
  for (const secret of secrets) assert(!JSON.stringify(state).includes(secret));
});
