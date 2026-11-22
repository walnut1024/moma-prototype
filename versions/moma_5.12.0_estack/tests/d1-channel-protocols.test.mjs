import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash, randomBytes } from 'node:crypto';
import { startLocalBackend } from '../database/local-runtime.js';
import { channelListPaths, channelListType } from '../src/admin-v2/channel-connection-directory.js';
import { channelConversationRequest, modelTaskUrl } from '../src/admin-v2/channel-interface.js';
import { providerApiKeysDraft } from '../src/admin-v2/provider-management.js';
import { channelChangeImpact } from '../src/admin-v2/channel-change-management.js';
import { domainModelWorkspace } from '../src/mock/model-fields.js';

test('Responses channel selection persists through HTTP/D1 and invalid choices roll back', {timeout:60000},async()=>{
 const accessCode=randomBytes(24).toString('hex'),local=await startLocalBackend({demo:true,loginHashes:{'admin-001':createHash('sha256').update(accessCode).digest('hex')}});let cookie='';
 const request=(path,body)=>local.runtime.dispatchFetch('https://example.test/api/5120'+path,{method:body?'POST':'GET',headers:{...(cookie?{cookie}:{}),...(body?{origin:'https://example.test','x-moma-request':'1','content-type':'application/json','idempotency-key':body.operationId || crypto.randomUUID()}: {})},...(body?{body:JSON.stringify(body)}:{})});
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

  const rows = [{ creationId: crypto.randomUUID(), name: 'Editable Endpoint', keys: (await providerApiKeysDraft(['local-protocol-fixture'])).apiKeys }];
  const editable = { providerId: provider.id, channelSourceType: 'selfHosted', modelProtocol: 'openai-responses',
    baseUrl: 'https://editable.example.invalid/base', endpointPath: '/proxy/inference', authMode: 'independent',
    timeoutSeconds: 60, rows, models: [] };
  const create = data => ({ ...command(state, data), action: { type: 'modelOperations', operation: 'channelDirectoryCreate', data } });
  for (const patch of [{endpointPath:'//other.example.invalid/inference'}, {endpointPath:'/inference?token=example'}, {channelSourceType:'unknown'}]) {
    const refused = await request('/model-operations/commands', create({...editable, ...patch}));
    assert.equal(refused.status, 422, await refused.text());
  }
  assert.deepEqual(await read(), state);
  const created = await request('/model-operations/commands', create(editable));
  assert.equal(created.status, 200, await created.text());
  state = await read();
  const saved = state.endpoints.find(row => row.name === rows[0].name);
  assert.equal(saved.channelSourceType, 'selfHosted');
  assert.equal(saved.baseUrl, editable.baseUrl);
  assert.equal(channelListType({ endpoint: saved, models: [] }), 'OpenAI Responses');
  assert.deepEqual(channelListPaths({ endpoint: saved, models: [] }), ['/proxy/inference']);
  const upstream = channelConversationRequest(saved, { type: 'text', upstreamModelId: 'fixture' });
  assert.equal(upstream.url, 'https://editable.example.invalid/proxy/inference');
  assert.equal(upstream.body.input, '请回复你好。');

  const video = { ...editable, modelProtocol: 'ark-video', baseUrl: 'https://video.example.invalid',
    endpointPath: '/gateway/video/jobs', rows: [{ ...rows[0], name: 'Editable Video', creationId: crypto.randomUUID() }] };
  const videoCreated = await request('/model-operations/commands', create(video));
  assert.equal(videoCreated.status, 200, await videoCreated.text());
  const videoRecord = (await read()).endpoints.find(row => row.name === video.rows[0].name);
  assert.equal(channelListType({ endpoint: videoRecord, models: [] }), '火山方舟 Video Generation');
  assert.deepEqual(channelListPaths({ endpoint: videoRecord, models: [] }), ['/gateway/video/jobs']);
  assert.equal(modelTaskUrl(videoRecord, 'video'), 'https://video.example.invalid/gateway/video/jobs');
  assert.throws(() => modelTaskUrl(videoRecord, 'text'), /不适用于此模型任务/);

  state = await read();
  const poolRow = { creationId: crypto.randomUUID(), name: 'Editable Pool',
    keys: (await providerApiKeysDraft(['local-pool-first-key', 'local-pool-second-key'])).apiKeys };
  const poolCreated = await request('/model-operations/commands', create({ ...editable, rows: [poolRow], keyStrategy: 'random' }));
  assert.equal(poolCreated.status, 200, await poolCreated.text());
  state = await read();
  const poolRecord = () => state.endpoints.find(row => row.name === poolRow.name);
  const edit = (record, patch) => request('/model-operations/commands', {
    operationId: crypto.randomUUID(), expectedRevision: state.revision, action: { type: 'modelOperations', operation: 'supplierChannelEdit', data: {
      providerId: provider.id, endpointId: record.id, baseUrl: record.baseUrl,
      expectedUpdatedAt: record.updatedAt, expectedProviderUpdatedAt: state.providers.find(row => row.id === provider.id).updatedAt,
      ...patch,
    } },
  });
  const originalPool = poolRecord();
  for (const patch of [{ channelSourceType: 'unknown' }, { channelSourceType: 'thirdParty', expectedUpdatedAt: 'stale' }]) {
    assert.equal((await edit(originalPool, patch)).status, 422);
  }
  const info = await edit(originalPool, { channelSourceType: 'thirdParty', note: '更新渠道资料' });
  assert.equal(info.status, 200, await info.text());
  state = await read();
  const livePool = poolRecord();
  assert.equal(livePool.channelSourceType, 'thirdParty');
  assert.equal(livePool.directoryNote, '更新渠道资料');
  assert.equal(livePool.candidateConfiguration, originalPool.candidateConfiguration);
  assert.equal(livePool.configurationRevision, originalPool.configurationRevision);
  assert.deepEqual(livePool.keyPool, originalPool.keyPool);
  const newKeys = (await providerApiKeysDraft(['local-pool-new-key'])).apiKeys;
  const pool = { keyPool: [livePool.keyPool[0]], keyStrategy: 'roundRobin', newKeys };
  const change = { prepareConnection: true, allAssociations: true, modelProtocol: 'openai-responses',
    endpointPath: '/proxy/next', expectedImpactRevision: channelChangeImpact(state, provider.id, livePool.id).revision, pool };
  for (const patch of [{ expectedImpactRevision: 'stale' }, { channelSourceType: 'selfHosted' },
    { pool: { ...pool, newKeys: [] } }, { pool: { ...pool, newKeys: [poolRow.keys[0]] } },
    { pool: undefined, newApiKey: newKeys[0], channelOwned: true }]) {
    assert.equal((await edit(livePool, { ...change, ...patch })).status, 422);
  }
  assert.deepEqual(await read(), state);
  const staged = await edit(livePool, change);
  assert.equal(staged.status, 200, await staged.text());
  state = await read();
  const pending = poolRecord(), candidate = pending.candidateConfiguration;
  assert.equal(pending.endpointPath, '/proxy/inference');
  assert.deepEqual(pending.keyPool, livePool.keyPool);
  assert.equal(candidate.config.authMode, 'pool');
  assert.equal(candidate.config.endpointPath, '/proxy/next');
  assert.equal(candidate.config.keyStrategy, 'roundRobin');
  assert.equal(candidate.config.keyPool.length, 2);
  assert.deepEqual(candidate.config.keyPool[0], livePool.keyPool[0]);
  const applied = await edit(pending, { baseUrl: undefined, candidateId: candidate.id, expectedRevision: pending.configurationRevision || 0,
    confirmed: true, allAssociations: true, unlinked: true, channelSourceType: 'selfHosted' });
  assert.equal(applied.status, 200, await applied.text());
  state = await read();
  const appliedPool = poolRecord();
  assert.equal(appliedPool.channelSourceType, 'selfHosted');
  assert.equal(appliedPool.endpointPath, '/proxy/next');
  assert.equal(appliedPool.keyStrategy, 'roundRobin');
  assert.equal(appliedPool.authMode, 'pool');
  assert.deepEqual(appliedPool.keyPool, candidate.config.keyPool);
  assert.deepEqual(new Set(appliedPool.apiKeys.map(key => key.fingerprint)), new Set([poolRow.keys[0].fingerprint, newKeys[0].fingerprint]));
  assert.equal(appliedPool.candidateConfiguration, null);

  assert.equal((await local.db.prepare('PRAGMA foreign_key_check').all()).results.length,0);
 }finally{await local.runtime.dispose();}
});
