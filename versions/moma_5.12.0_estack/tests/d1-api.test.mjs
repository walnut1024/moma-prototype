import assert from 'node:assert/strict';
import {domainModelWorkspace} from '../src/mock/model-fields.js';
import { before, after, test } from 'node:test';
import { randomBytes, createHash } from 'node:crypto';
import { startLocalBackend } from '../database/local-runtime.js';
import { createSeed, initializeDatabase } from '../database/seed.js';

const adminCode = 'Test@' + randomBytes(8).toString('hex'), opsCode = 'Test@' + randomBytes(8).toString('hex');
const sha = value => createHash('sha256').update(value).digest('hex');
let local, token, readonlyToken;
const serviceId = 'model-glm53';
async function request(path, { method = 'GET', body, session = token, key, headers = {} } = {}) {
  const response = await local.runtime.dispatchFetch(`https://example.test/api/5120${path}`, { method,
    headers: { ...(session ? { cookie: session } : {}), ...(method === 'POST' ? { origin: 'https://example.test', 'x-moma-request': '1', 'content-type': 'application/json' } : {}),
      ...(key ? { 'idempotency-key': key } : {}), ...headers }, ...(body !== undefined ? { body: JSON.stringify(body) } : {}) });
  const raw = await response.json(),data=path==='/model-operations' && response.ok?domainModelWorkspace(raw):raw;
  return { status: response.status, data, headers: response.headers };
}
async function login(id, code) {
  const result = await request('/auth/login', { method: 'POST', session: null, body: { accountId: id, accessCode: code } });
  assert.equal(result.status, 200);
  return result.headers.get('set-cookie').split(';')[0];
}
before(async () => {
  local = await startLocalBackend({ loginHashes: { 'admin-001': sha(adminCode), 'admin-002': sha(opsCode) } });
  token = await login('admin-001', adminCode); readonlyToken = await login('admin-002', opsCode);
}, { timeout: 30000 });
after(async () => { await local?.runtime.dispose(); });


test('uses real D1 with the 5.12.0 cases, both modes, original IDs and integer prices', async () => {
  const services = await request('/services?limit=100');
  services.data.items=services.data.items.filter(r=>['model-glm53','mock-service-deepseek-v4-flash-0731'].includes(r.id));
  assert.equal(services.status, 200);
  assert.deepEqual(services.data.items.map(row => row.serviceMode).sort(), ['provider','standard']);
  assert(services.data.items.every(row => row.listingStatus === '已下架' && !row.callsEnabled));
  const workspace = await request(`/services/${serviceId}/workspace`);
  assert.equal(workspace.data.material.record_id, 'template-glm-5.3');
  assert.equal(workspace.data.offers.length, 2);
  assert.equal(workspace.data.channelModels.length, 6);
  assert(workspace.data.channelModels.some(r=>r.id==='showcase-supply-moma-self-glm-5.3'));
  assert.equal(workspace.data.offers[0].active_publication_id, null);
  const prices = await local.db.prepare('SELECT amount_micros FROM price_items').all();
  assert.equal(prices.results.length, 18);
  assert(prices.results.every(row => Number.isSafeInteger(row.amount_micros)));
  assert.equal((await local.db.prepare('SELECT count(*) AS n FROM simulation_jobs').first()).n, 0);
  assert.equal((await local.db.prepare("SELECT count(*) AS n FROM credentials WHERE supplier_id='provider-moma'").first()).n, 2);
});

test('requires current server identity and follows existing navigation roles', async () => {
  assert.equal((await request('/services', { session: null })).status, 401);
  assert.equal((await request('/services', { session: readonlyToken })).status, 403);
  const me = await request('/auth/me', { session: readonlyToken });
  assert.equal(me.data.account.role, '运维人员');
  assert.equal((await request(`/services/${serviceId}/visibility`, { method: 'POST', session: readonlyToken, body: {} })).status, 403);
  const forged = await request('/auth/login', { method: 'POST', session: null, body: { accountId: 'admin-001', accessCode: adminCode, role: '平台管理员' } });
  assert.equal(forged.status, 400);
});

test('login uses a secure cookie and never returns an access code or token in JSON', async () => {
  const result = await request('/auth/login', { method: 'POST', session: null, body: { accountId: 'admin-001', accessCode: adminCode } });
  assert.match(result.headers.get('set-cookie'), /HttpOnly; Secure; SameSite=Lax; Path=\/api\/5120/);
  assert(!JSON.stringify(result.data).includes(adminCode));
  assert.equal(result.data.token, undefined);
  assert.equal((await request('/auth/login', { method: 'POST', session: null, body: { accountId: 'admin-001', accessCode: '0'.repeat(64) } })).status, 401);
});

test('password login rejects invalid lengths and values without creating a session', async () => {
  const before = (await local.db.prepare('SELECT count(*) AS n FROM admin_sessions').first()).n;
  for (const accessCode of ['', 'a'.repeat(7), 'a'.repeat(129), null, ['invalid']]) {
    const result = await request('/auth/login', { method: 'POST', session: null, body: { accountId: 'admin-001', accessCode } });
    assert.equal(result.status, 401);
    assert.equal(result.headers.get('set-cookie'), null);
  }
  assert.equal((await local.db.prepare('SELECT count(*) AS n FROM admin_sessions').first()).n, before);
});

test('bounds pagination, escapes wildcard searches and preserves current material fields', async () => {
  const first = await request('/materials?limit=1');
  assert.equal(first.data.items.length, 1); assert(first.data.nextCursor);
  const next = await request('/materials?limit=1&after=' + encodeURIComponent(first.data.nextCursor));
  assert.notEqual(first.data.items[0].record_id, next.data.items[0].record_id);
  assert.equal((await request('/materials?limit=101')).status, 400);
  assert.equal((await request('/materials?q=' + encodeURIComponent('中'.repeat(30)))).status, 400);
  assert.equal((await request('/materials?q=%25')).data.items.length, 0);
  const detail = await request('/materials/template-glm-5.3');
  assert.equal(detail.data.material.type, 'text');
  assert.equal(detail.data.material.canonical_slug, 'glm-5.3');
  assert(detail.data.material.profile.author);
  assert.equal((await request('/materials/missing')).status, 404);
});

test('visibility changes only presentation, commits audit, and is shared by another browser session', async () => {
  const before = (await request(`/services/${serviceId}/workspace`)).data;
  const result = await request(`/services/${serviceId}/visibility`, { method: 'POST', key: 'visibility-1', body: { operationId: 'visibility-1', expectedRevision: before.service.revision, visible: false } });
  assert.equal(result.status, 200);
  const sessionB = await login('admin-001', adminCode);
  const current = (await request(`/services/${serviceId}/workspace`, { session: sessionB })).data;
  assert.equal(current.service.marketVisible, false);
  assert.equal(current.service.revision, before.service.revision + 1);
  assert.equal(current.service.callsEnabled, before.service.callsEnabled);
  assert.equal(current.service.listingStatus, before.service.listingStatus);
  assert.deepEqual(current.offers, before.offers);
  const history = await request(`/services/${serviceId}/history`);
  assert.equal(history.data.items[0].action, '用户不可见');
  assert.equal(history.data.items[0].operation_id, 'visibility-1');
});

test('replay is idempotent and mismatched requests do not overwrite', async () => {
  const original = (await request('/operations/visibility-1')).data;
  const body = { operationId: 'visibility-1', expectedRevision: original.revision - 1, visible: false };
  const replay = await request(`/services/${serviceId}/visibility`, { method: 'POST', key: 'visibility-1', body });
  assert.equal(replay.status, 200); assert.deepEqual(replay.data, original);
  assert.equal((await request(`/services/${serviceId}/visibility`, { method: 'POST', key: 'visibility-1', body: { ...body, visible: true } })).status, 409);
  assert.equal((await local.db.prepare('SELECT count(*) AS n FROM operations').first()).n, 1);
  assert.equal((await local.db.prepare('SELECT count(*) AS n FROM audit_events').first()).n, 1);
});

test('two concurrent edits of the same revision cannot both commit', async () => {
  const before = (await request(`/services/${serviceId}/workspace`)).data.service;
  const results = await Promise.all(['race-a','race-b'].map(key => request(`/services/${serviceId}/visibility`, { method: 'POST', key, body: { operationId: key, expectedRevision: before.revision, visible: true } })));
  assert.deepEqual(results.map(row => row.status).sort(), [200,409]);
  assert.equal((await request(`/services/${serviceId}/workspace`)).data.service.revision, before.revision + 1);
});

test('identical concurrent submissions return the same committed operation', async () => {
  const before = (await request(`/services/${serviceId}/workspace`)).data.service;
  const args = { method: 'POST', key: 'same-race', body: { operationId: 'same-race', expectedRevision: before.revision, visible: false } };
  const results = await Promise.all([request(`/services/${serviceId}/visibility`, args), request(`/services/${serviceId}/visibility`, args)]);
  assert.deepEqual(results.map(row => row.status), [200,200]);
  assert.deepEqual(results[0].data, results[1].data);
  assert.equal((await local.db.prepare("SELECT count(*) AS n FROM audit_events WHERE operation_id='same-race'").first()).n, 1);
});

test('failure after updating a business row rolls back the row, sequence, receipt and audit', async () => {
  await local.db.prepare("CREATE TRIGGER reject_audit BEFORE INSERT ON audit_events BEGIN SELECT RAISE(ABORT,'test_failure'); END").run();
  try {
    const before = (await request(`/services/${serviceId}/workspace`)).data.service;
    const state = await local.db.prepare('SELECT commit_seq FROM db_state').first();
    const result = await request(`/services/${serviceId}/visibility`, { method: 'POST', key: 'failure-1', body: { operationId: 'failure-1', expectedRevision: before.revision, visible: false } });
    assert.equal(result.status, 503);
    assert.deepEqual((await request(`/services/${serviceId}/workspace`)).data.service, before);
    assert.deepEqual(await local.db.prepare('SELECT commit_seq FROM db_state').first(), state);
    assert.equal((await request('/operations/failure-1')).status, 404);
  } finally { await local.db.prepare('DROP TRIGGER reject_audit').run(); }
});

test('rejects untrusted input, cross-origin requests and oversized bodies without writing', async () => {
  const before = (await local.db.prepare('SELECT count(*) AS n FROM operations').first()).n;
  const body = { operationId: 'bad-1', expectedRevision: 1, visible: false };
  assert.equal((await request(`/services/${serviceId}/visibility`, { method: 'POST', key: 'bad-1', body, headers: { origin: 'https://attacker.invalid' } })).status, 403);
  assert.equal((await request(`/services/${serviceId}/visibility`, { method: 'POST', key: 'bad-1', body: { ...body, actor: 'admin-001' } })).status, 400);
  assert.equal((await request(`/services/${serviceId}/visibility`, { method: 'POST', key: 'bad-1', body: { ...body, visible: 'false' } })).status, 400);
  assert.equal((await request(`/services/${serviceId}/visibility`, { method: 'POST', key: 'bad-1', body: { data: 'x'.repeat(256 * 1024) } })).status, 413);
  assert.equal((await local.db.prepare('SELECT count(*) AS n FROM operations').first()).n, before);
});

test('seed replays do not restore edited resources or fabricate validation results', async () => {
  const before = await local.db.prepare('SELECT market_visible,revision FROM services WHERE id=?').bind(serviceId).first();
  const result = await initializeDatabase(local.db, await createSeed());
  assert.equal(result.initialized, false);
  assert.deepEqual(await local.db.prepare('SELECT market_visible,revision FROM services WHERE id=?').bind(serviceId).first(), before);
  assert.equal((await local.db.prepare('SELECT count(*) AS n FROM publications').first()).n, 0);
  const check = await local.db.prepare('PRAGMA foreign_key_check').all(); assert.equal(check.results.length, 0);
});

test('real D1 enforces supplier and price ownership constraints', async () => {
  await assert.rejects(local.db.prepare(`INSERT INTO channel_keys(channel_id,supplier_id,credential_id,priority,position) VALUES(?,?,?,?,?)`)
    .bind('showcase-channel-moma-self','provider-moma','showcase-key-zhipu-official',1,0).run(), /FOREIGN KEY/);
  const rows = (await local.db.prepare("SELECT id,offer_id FROM price_versions WHERE kind='sale' ORDER BY id").all()).results;
  await assert.rejects(local.db.prepare('UPDATE offers SET active_sale_price_id=? WHERE record_id=?').bind(rows[0].id, rows[1].offer_id).run(), /FOREIGN KEY/);
});

test('expired or revoked sessions cannot read data or replay a success', async () => {
  const session = await login('admin-001', adminCode);
  const logout = await request('/auth/logout', { method: 'POST', session, body: {} });
  assert.equal(logout.status, 200);
  assert.equal((await request('/services', { session })).status, 401);
  assert.equal((await request('/operations/visibility-1', { session })).status, 401);
  assert.equal((await request('/does-not-exist', { session: null })).status, 404);
});

test('card updates persist through HTTP without requiring hidden tasks or discarding technical data',async()=>{
 const {metadata,materialBase}=await import('../src/admin-v2/model-operations.js');
 let state=(await request('/model-operations')).data;
 const model=state.models.find(row=>row.id==='model-2'),code='card-contract-'+randomBytes(6).toString('hex');
 const createId=crypto.randomUUID(),create=await request('/model-operations/commands',{method:'POST',key:createId,body:{operationId:createId,expectedRevision:state.revision,action:{type:'modelOperations',operation:'templateSave',data:{...metadata(model),modelId:code,name:'卡片合同测试',profile:{...model.profile,license:'MIT',architecture:'Dense',supportedParameters:['temperature']}}}}});
 assert.equal(create.status,200,JSON.stringify(create.data));
 state=(await request('/model-operations')).data;
 const record=state.modelTemplates.find(row=>row.modelId===code),before=structuredClone(record),id=crypto.randomUUID();
 const body={operationId:id,expectedRevision:state.revision,action:{type:'modelOperations',operation:'templatePublish',data:{id:record.id,expectedBase:materialBase(state,record),confirmed:true,value:{...metadata(record),name:'卡片修改已保存',profile:{...record.profile,tasks:[],releaseDate:'2026-11-03'}}}}};
 const saved=await request('/model-operations/commands',{method:'POST',key:id,body});assert.equal(saved.status,200,JSON.stringify(saved.data));
 const next=(await request('/model-operations')).data,current=next.modelTemplates.find(row=>row.id===record.id);
 assert.equal(current.name,'卡片修改已保存');assert.equal(current.profile.releaseDate,'2026-11-03');assert.equal(current.profile.tasks?.length || 0,0);
 for(const key of ['license','architecture','supportedParameters'])assert.deepEqual(current.profile[key],before.profile[key]);
 assert.deepEqual(current.capabilities,before.capabilities);assert.deepEqual(next.providers,state.providers);
 assert.equal((await request('/model-operations/commands',{method:'POST',session:readonlyToken,key:crypto.randomUUID(),body:{...body,operationId:crypto.randomUUID(),expectedRevision:next.revision}})).status,403);
});

test('channel name and upstream identifier save together through HTTP and D1 without changing procurement history',async()=>{
 const suffix=randomBytes(6).toString('hex'),providerId='provider-moma';
 async function command(state,values,operation='supplierChannelSave',session=token){const id=crypto.randomUUID();return request('/model-operations/commands',{method:'POST',session,key:id,body:{operationId:id,expectedRevision:state.revision,action:{type:'modelOperations',operation:'provider',data:{operation,objectId:providerId,values}}}});}
 let state=(await request('/model-operations')).data;
 const created=await command(state,{name:'HTTP渠道-'+suffix,protocol:'OpenAI',baseUrl:'https://contract.example.invalid/v1/chat/completions',keyGroupId:'default',models:[{libraryId:'template-glm-5.3',upstreamModelId:'contract-'+suffix,scenarios:[{name:'输入 Token',listPrice:'1.2',unit:'百万 Token',currency:'CNY'}]}]},'supplierChannelCreate');
 assert.equal(created.status,200,JSON.stringify(created.data));
 state=(await request('/model-operations')).data;
 const endpoint=state.endpoints.find(row=>row.name==='HTTP渠道-'+suffix),provider=state.providers.find(row=>row.id===providerId),mapping=provider.catalogConnections.find(row=>row.endpointId===endpoint.id),before=structuredClone(mapping);
 const values={mode:'info',endpointId:endpoint.id,name:'HTTP修改渠道-'+suffix,modelId:mapping.modelId,associationId:mapping.id,upstreamModelId:'contract-v2-'+suffix,expectedUpdatedAt:endpoint.updatedAt,expectedProviderUpdatedAt:provider.updatedAt};
 const saved=await command(state,values);assert.equal(saved.status,200,JSON.stringify(saved.data));
 const fresh=(await request('/model-operations')).data,owner=fresh.providers.find(row=>row.id===providerId),current=owner.catalogConnections.find(row=>row.id===mapping.id);
 assert.equal(fresh.endpoints.find(row=>row.id===endpoint.id).name,values.name);assert.equal(current.upstreamModelId,values.upstreamModelId);assert.equal(current.enabled,false);
 for(const key of ['pricing','procurementVersions','procurementRevision','listPriceVersions'])assert.deepEqual(current[key],before[key]);
 assert.deepEqual(fresh.modelSupplies,state.modelSupplies);assert.deepEqual(fresh.modelSalePrices,state.modelSalePrices);assert.deepEqual(owner.catalogModels,provider.catalogModels);
 const bad=await command(fresh,{...values,name:'不得部分保存',associationId:'not-owned',expectedUpdatedAt:fresh.endpoints.find(row=>row.id===endpoint.id).updatedAt,expectedProviderUpdatedAt:owner.updatedAt});assert(bad.status>=400);
 const unchanged=(await request('/model-operations')).data;assert.equal(unchanged.endpoints.find(row=>row.id===endpoint.id).name,values.name);assert.deepEqual(unchanged.providers.find(row=>row.id===providerId).catalogConnections,owner.catalogConnections);
 assert.equal((await command(unchanged,values,'supplierChannelSave',readonlyToken)).status,403);
});

test('connection testing uses saved credential identity and persists diagnostics while leaving its display metadata unchanged',async()=>{
 const {supplierChannelAssociations}=await import('../src/admin-v2/supplier-resources.js'),{healthFingerprint}=await import('../src/admin-v2/channel-health.js');
 const state=(await request('/model-operations')).data,provider=state.providers.find(row=>row.id==='provider-moma'),key=provider.apiKeys.find(row=>row.id==='showcase-key-moma-self');
 const association=supplierChannelAssociations(state,provider).find(row=>row.endpoint.apiKeyId===key.id),before=structuredClone(provider.apiKeys),id=crypto.randomUUID();
 assert.equal(key.maskedKey,'mock••••2026');
 const tested=await request('/model-operations/commands',{method:'POST',key:id,body:{operationId:id,expectedRevision:state.revision,action:{type:'modelOperations',operation:'channelHealthTest',data:{providerId:provider.id,endpointId:association.endpointId,associationId:association.id,keyId:key.id,expectedFingerprint:healthFingerprint(provider,association,key),confirmed:true,scenario:'success'}}}});
 assert.equal(tested.status,200,JSON.stringify(tested.data));
 const fresh=(await request('/model-operations')).data,endpoint=fresh.endpoints.find(row=>row.id===association.endpointId),record=endpoint.keyConnectivityTests.at(-1);
 assert.equal(record.result,'通过');assert.equal(record.simulated,true);assert.equal(record.keyId,key.id);
 assert.deepEqual(fresh.providers.find(row=>row.id===provider.id).apiKeys,before);assert.equal(endpoint.status,association.endpoint.status);assert.deepEqual(fresh.modelSupplies,state.modelSupplies);
});

test('split supplier registration commits batch models and channel-owned keys through HTTP, preserves refresh and rejects foreign or stale writes', async () => {
  const { supplierModelRegistration, registeredSupplierModelIds } = await import('../src/admin-v2/supplier-model-registration.js');
  const { connectionKeys } = await import('../src/admin-v2/connection-state.js');
  const { providerApiKeysDraft } = await import('../src/admin-v2/provider-management.js');
  const { providerKeyGroups } = await import('../src/admin-v2/provider-key-groups.js');
  async function command(state, operation, data, session = token) {
    const id = crypto.randomUUID();
    return request('/model-operations/commands', { method: 'POST', session, key: id, body: { operationId: id, expectedRevision: state.revision, action: { type: 'modelOperations', operation, data } } });
  }
  let state = (await request('/model-operations')).data;
  const providerId = 'provider-moma';
  const { modelCatalogue } = await import('../src/admin-v2/model-library.js');
  const existing = registeredSupplierModelIds(state, state.providers.find(row => row.id === providerId));
  const candidates = modelCatalogue(state).filter(row => !existing.includes(row.id));
  const image = candidates.find(row => row.type === 'image');
  const libraryIds = [image.id, ...candidates.filter(row => row.id !== image.id).slice(0, 4).map(row => row.id)];
  const register = { providerId, libraryIds: supplierModelRegistration(state, state.providers.find(row => row.id === providerId), libraryIds).map(row => row.id) };
  const saved = await command(state, 'supplierModelsRegister', register); assert.equal(saved.status, 200, JSON.stringify(saved.data));
  const fresh = (await request('/model-operations')).data;
  const master = modelCatalogue(fresh).find(row => row.id === image.id); assert.equal(master.type, 'image');
  const provider = fresh.providers.find(row => row.id === providerId), model = provider.catalogModels.find(row => row.libraryId === master.id);
  assert.deepEqual(fresh.endpoints, state.endpoints); assert.deepEqual(fresh.models, state.models); assert.deepEqual(fresh.modelTemplates, state.modelTemplates);
  const secret = 'contract-private-key-' + randomBytes(12).toString('hex'), apiKey = (await providerApiKeysDraft([secret])).apiKeys[0];
  const values = { providerId, modelId: model.modelId, name: 'HTTP独立渠道', upstreamModelId: 'vendor/image', baseUrl: 'https://contract.example.invalid/v1/images/generations', authMode: 'independent', apiKey, scenarios: [] };
  for (const scenarios of [null, {}, [{ name: '图像生成', listPrice: '', unit: '张', currency: 'CNY' }], [{ name: '图像生成', listPrice: '1', unit: '', currency: 'CNY' }]]) {
    const rejected = await command(fresh, 'supplierChannelRegister', { ...values, scenarios });
    assert.equal(rejected.status, 422, JSON.stringify(rejected.data));
  }
  const unchanged = (await request('/model-operations')).data;
  assert.equal(unchanged.revision, fresh.revision);
  assert.deepEqual(unchanged.endpoints, fresh.endpoints);
  assert.deepEqual(unchanged.providers, fresh.providers);
  const created = await command(fresh, 'supplierChannelRegister', values); assert.equal(created.status, 200, JSON.stringify(created.data));
  state = (await request('/model-operations')).data;
  const endpoint = state.endpoints.find(row => !fresh.endpoints.some(old => old.id === row.id)), current = state.providers.find(row => row.id === providerId);
  assert.equal(connectionKeys(endpoint, current)[0].fingerprint, apiKey.fingerprint); assert.equal(endpoint.apiKeys[0].scope, 'channel');
  assert.deepEqual(current.catalogConnections.find(row=>row.endpointId===endpoint.id).pricing.scenarios,[]);
  assert.deepEqual(current.apiKeys, provider.apiKeys); assert.ok(providerKeyGroups(current).every(group => !group.keyIds.includes(endpoint.apiKeyId)));
  assert.ok(!JSON.stringify(state).includes(secret)); assert.deepEqual(state.modelSalePrices, fresh.modelSalePrices);
  assert.equal((await command(fresh, 'supplierChannelRegister', values)).status, 409);
  assert.equal((await command(state, 'supplierChannelRegister', values, readonlyToken)).status, 403);
  const bad = await command(state, 'supplierChannelRegister', { ...values, modelId: 'not-owned' }); assert.ok(bad.status >= 400);
  assert.deepEqual((await request('/model-operations')).data.endpoints, state.endpoints);
});

test('adding a channel keeps the explicitly selected registered model when historical aliases share its master', async () => {
  const state = (await request('/model-operations')).data, provider = state.providers.find(row => row.id === 'provider-moma');
  assert.ok(provider.catalogModels.some(row => row.modelId === 'GLM-5.3'));
  assert.ok(provider.catalogModels.some(row => row.modelId === 'glm-5.3'));
  const id = crypto.randomUUID(), name = '明确别名渠道-' + randomBytes(4).toString('hex');
  const result = await request('/model-operations/commands', { method: 'POST', key: id, body: { operationId: id, expectedRevision: state.revision, action: { type: 'modelOperations', operation: 'supplierChannelRegister', data: { providerId: provider.id, modelId: 'glm-5.3', name, upstreamModelId: 'vendor/explicit', baseUrl: 'https://explicit.example.invalid/v1/chat/completions', authMode: 'group', keyGroupId: 'default', scenarios: [{ name: '输入 Token', listPrice: '0', unit: '百万 Token', currency: 'CNY' }] } } } });
  assert.equal(result.status, 200, JSON.stringify(result.data));
  const fresh = (await request('/model-operations')).data, current = fresh.providers.find(row => row.id === provider.id), endpoint = fresh.endpoints.find(row => row.name === name);
  assert.equal(current.catalogConnections.find(row => row.endpointId === endpoint.id).modelId, 'glm-5.3');
  assert.deepEqual(current.catalogModelIds, provider.catalogModelIds); assert.deepEqual(current.catalogModels, provider.catalogModels);
  assert.deepEqual(fresh.models, state.models); assert.deepEqual(fresh.modelTemplates, state.modelTemplates);
});

test('deletion HTTP contract requires service unbinding even after delisting and stopping, then removes channels before the supplier model', async () => {
  async function command(state, operation, data, modelId, session = token) {
    const id = crypto.randomUUID();
    return request('/model-operations/commands', { method: 'POST', session, key: id, body: { operationId: id, expectedRevision: state.revision, action: { type: 'modelOperations', operation, data, ...(modelId ? { modelId } : {}) } } });
  }
  const fresh = async () => (await request('/model-operations')).data;
  let state = await fresh();
  const code = 'delete-http-' + randomBytes(5).toString('hex');
  let result = await command(state, 'provider', { operation: 'create', values: { name: code, code, sourceType: 'thirdParty', catalogModelIds: [] } });
  assert.equal(result.status, 200, JSON.stringify(result.data)); state = await fresh();
  const providerId = state.providers.find(row => row.code === code).id;
  const providerCommand = (state, operation, values, session = token) => command(state, 'provider', { operation, objectId: providerId, values }, undefined, session);
  result = await providerCommand(state, 'supplierChannelCreate', { name: '可删除渠道', protocol: 'OpenAI', baseUrl: 'https://delete-http.example.invalid/v1/chat/completions', authMode: 'inherit', models: [{ libraryId: 'template-glm-5.3', upstreamModelId: 'vendor/delete-http', scenarios: [{ name: '输入 Token', listPrice: '0', unit: '百万 Token', currency: 'CNY' }] }] });
  assert.equal(result.status, 200, JSON.stringify(result.data)); state = await fresh();
  const provider = state.providers.find(row => row.id === providerId), mapping = provider.catalogConnections[0], endpointId = mapping.endpointId, values = { modelId: mapping.modelId, associationId: mapping.id, endpointId, confirmed: true };
  assert.equal((await providerCommand(state, 'catalogueRemove', { modelId: mapping.modelId, confirmed: true })).status, 422);
  result = await command(state, 'associateServiceProvider', { providerId, expectedUpdatedAt: state.models.find(row => row.id === serviceId).updatedAt }, serviceId);
  assert.equal(result.status, 200, JSON.stringify(result.data)); state = await fresh();
  for (const operation of ['serviceProviderListing', 'serviceProviderServing']) {
    result = await command(state, operation, { providerId, enabled: false, expectedUpdatedAt: state.models.find(row => row.id === serviceId).updatedAt }, serviceId);
    assert.equal(result.status, 200, JSON.stringify(result.data)); state = await fresh();
  }
  const before = state;
  result = await providerCommand(state, 'supplierCatalogueChannelDelete', values);
  assert.equal(result.status, 422); assert.match(JSON.stringify(result.data), /下架或停服不会解除关联/);
  state = await fresh(); assert.deepEqual(state.endpoints, before.endpoints); assert.deepEqual(state.providers, before.providers);
  assert.equal((await providerCommand(state, 'supplierCatalogueChannelDelete', values, readonlyToken)).status, 403);
  result = await command(state, 'removeServiceProvider', { providerId, confirmed: true, expectedUpdatedAt: state.models.find(row => row.id === serviceId).updatedAt }, serviceId);
  assert.equal(result.status, 200, JSON.stringify(result.data)); state = await fresh();
  assert.equal((await providerCommand(before, 'supplierCatalogueChannelDelete', values)).status, 409);
  assert.equal((await providerCommand(state, 'supplierCatalogueChannelDelete', { ...values, confirmed: false })).status, 422);
  result = await providerCommand(state, 'supplierCatalogueChannelDelete', values); assert.equal(result.status, 200, JSON.stringify(result.data));
  state = await fresh(); assert.ok(!state.endpoints.some(row => row.id === endpointId));
  const archived = state.providers.find(row => row.id === providerId).catalogConnections.find(row => row.id === mapping.id);
  assert.ok(archived.deletedAt); assert.deepEqual(archived.pricing, mapping.pricing);
  const stored = await local.db.prepare('SELECT deleted_at,record_json FROM channels WHERE id=?').bind(endpointId).first(); assert.ok(stored.deleted_at); assert.equal(JSON.parse(stored.record_json).id, endpointId);
  const templates = structuredClone(state.modelTemplates), prices = structuredClone(state.modelSalePrices);
  result = await providerCommand(state, 'catalogueRemove', { modelId: mapping.modelId, confirmed: true }); assert.equal(result.status, 200, JSON.stringify(result.data));
  state = await fresh(); assert.ok(state.providers.find(row => row.id === providerId).removedCatalogModelIds.includes(mapping.modelId));
  assert.deepEqual(state.modelTemplates, templates); assert.deepEqual(state.modelSalePrices, prices);
});

test('channel editor HTTP saves costs and candidate address atomically with history, conflicts and readonly protection', async () => {
  const { supplierChannelAssociations } = await import('../src/admin-v2/supplier-resources.js');
  let state = (await request('/model-operations')).data;
  const provider = state.providers.find(row=>row.id==='provider-moma'), mapping = supplierChannelAssociations(state,provider)[0], endpoint=mapping.endpoint;
  const values={providerId:provider.id,endpointId:endpoint.id,associationId:mapping.id,modelId:mapping.modelId,name:'HTTP完整编辑渠道',upstreamModelId:mapping.upstreamModelId,baseUrl:'https://edited-http.example.invalid/v1/chat/completions',expectedUpdatedAt:endpoint.updatedAt,expectedProviderUpdatedAt:provider.updatedAt,expectedPriceRevision:mapping.procurementRevision || 0,scenarios:[{name:'输入 Token',listPrice:'0',currency:'CNY',unit:'百万 Token'}]};
  const command=(data, session=token, id=crypto.randomUUID())=>request('/model-operations/commands',{method:'POST',session,key:id,body:{operationId:id,expectedRevision:state.revision,action:{type:'modelOperations',operation:'supplierChannelEdit',data}}});
  const invalid=await command({...values,scenarios:[{...values.scenarios[0],listPrice:''}]});assert.equal(invalid.status,422,JSON.stringify(invalid.data));
  const untouched=(await request('/model-operations')).data;assert.equal(untouched.revision,state.revision);assert.deepEqual(untouched.endpoints,state.endpoints);assert.deepEqual(untouched.providers,state.providers);
  assert.equal((await command(values,readonlyToken)).status,403);
  const id=crypto.randomUUID(),saved=await command(values,token,id);assert.equal(saved.status,200,JSON.stringify(saved.data));
  assert.equal((await command(values,token,id)).status,200);
  assert.equal((await command(values)).status,409);
  const fresh=(await request('/model-operations')).data,updated=fresh.endpoints.find(row=>row.id===endpoint.id),owner=fresh.providers.find(row=>row.id===provider.id),association=owner.catalogConnections.find(row=>row.id===mapping.id);
  assert.equal(updated.name,values.name);assert.equal(updated.baseUrl,endpoint.baseUrl);assert.equal(updated.candidateConfiguration.config.baseUrl,values.baseUrl);
  assert.equal(association.procurementRevision,(mapping.procurementRevision || 0)+1);assert.equal(association.procurementVersions.at(-1).pricing.scenarios[0].listPrice,0);
  assert.deepEqual(owner.apiKeys,provider.apiKeys);assert.deepEqual(fresh.modelSalePrices,state.modelSalePrices);assert.deepEqual(fresh.modelSupplies,state.modelSupplies);
  for(const row of provider.catalogConnections.filter(row=>row.id!==mapping.id))assert.deepEqual(owner.catalogConnections.find(other=>other.id===row.id).pricing,row.pricing);
  state=fresh;
  const stale=await command({...values,baseUrl:updated.baseUrl,expectedUpdatedAt:updated.updatedAt,expectedProviderUpdatedAt:owner.updatedAt,expectedPriceRevision:99});assert.equal(stale.status,422);
  assert.deepEqual((await request('/model-operations')).data.providers,fresh.providers);
});

test('editor HTTP stages shared key selection without switching the active key and rejects unusable groups atomically', async () => {
  const {supplierChannelAssociations}=await import('../src/admin-v2/supplier-resources.js');
  const {connectionKeys}=await import('../src/admin-v2/connection-state.js');
  const state=(await request('/model-operations')).data,provider=state.providers.find(row=>row.id==='provider-moma');
  const mapping=supplierChannelAssociations(state,provider).find(row=>!row.endpoint.candidateConfiguration && row.endpoint.authMode!=='group');
  assert(mapping);
  const endpoint=mapping.endpoint,base={providerId:provider.id,endpointId:endpoint.id,associationId:mapping.id,modelId:mapping.modelId,name:endpoint.name,upstreamModelId:mapping.upstreamModelId,baseUrl:endpoint.baseUrl,expectedUpdatedAt:endpoint.updatedAt,expectedProviderUpdatedAt:provider.updatedAt};
  const command=(data,session=token)=>{const id=crypto.randomUUID();return request('/model-operations/commands',{method:'POST',session,key:id,body:{operationId:id,expectedRevision:state.revision,action:{type:'modelOperations',operation:'supplierChannelEdit',data}}});};
  assert.equal((await command({...base,keyGroupId:'not-owned',name:'不可部分保存'})).status,422);
  assert.equal((await command({...base,keyGroupId:'default'},readonlyToken)).status,403);
  const unchanged=(await request('/model-operations')).data;assert.deepEqual(unchanged.endpoints,state.endpoints);assert.deepEqual(unchanged.providers,state.providers);
  const saved=await command({...base,keyGroupId:'default'});assert.equal(saved.status,200,JSON.stringify(saved.data));
  const fresh=(await request('/model-operations')).data,updated=fresh.endpoints.find(row=>row.id===endpoint.id),owner=fresh.providers.find(row=>row.id===provider.id);
  assert.deepEqual(connectionKeys(updated,owner),connectionKeys(endpoint,provider));
  assert.equal(updated.candidateConfiguration.config.authMode,'group');assert.equal(updated.candidateConfiguration.config.keyGroupId,'default');
  assert.deepEqual(owner.apiKeys,provider.apiKeys);assert.deepEqual(fresh.modelSalePrices,state.modelSalePrices);
  for(const other of state.endpoints.filter(row=>row.id!==endpoint.id))assert.deepEqual(fresh.endpoints.find(row=>row.id===other.id),other);
});

test('unified editor HTTP stages inline independent credentials with address and zero cost, rejecting partial and raw writes', async () => {
  const {supplierChannelAssociations}=await import('../src/admin-v2/supplier-resources.js');
  const {providerApiKeysDraft}=await import('../src/admin-v2/provider-management.js');
  const {connectionKeys}=await import('../src/admin-v2/connection-state.js');
  let state=(await request('/model-operations')).data;
  const provider=state.providers.find(row=>row.id==='provider-moma'), mapping=supplierChannelAssociations(state,provider).find(row=>!row.endpoint.candidateConfiguration), endpoint=mapping.endpoint;
  const secret='local-unified-http-independent-2026', newApiKey=(await providerApiKeysDraft([secret])).apiKeys[0];
  const values={providerId:provider.id,endpointId:endpoint.id,associationId:mapping.id,modelId:mapping.modelId,name:'HTTP统一编辑',upstreamModelId:mapping.upstreamModelId,baseUrl:'https://unified-http.example.invalid/v1',expectedUpdatedAt:endpoint.updatedAt,expectedProviderUpdatedAt:provider.updatedAt,expectedPriceRevision:mapping.procurementRevision || 0,newApiKey,scenarios:[{name:'输入 Token',listPrice:'0',currency:'CNY',unit:'百万 Token'}]};
  const command=(data, session=token, id=crypto.randomUUID())=>request('/model-operations/commands',{method:'POST',session,key:id,body:{operationId:id,expectedRevision:state.revision,action:{type:'modelOperations',operation:'supplierChannelEdit',data}}});
  for(const patch of [{newApiKey:{...newApiKey,rawKey:secret}},{scenarios:[]},{keyGroupId:'default'}])assert.equal((await command({...values,...patch})).status,422);
  assert.equal((await command(values,readonlyToken)).status,403);
  const untouched=(await request('/model-operations')).data;assert.equal(untouched.revision,state.revision);assert.deepEqual(untouched.providers,state.providers);assert.deepEqual(untouched.endpoints,state.endpoints);
  const id=crypto.randomUUID(), result=await command(values,token,id);assert.equal(result.status,200,JSON.stringify(result.data));assert.equal((await command(values,token,id)).status,200);
  const fresh=(await request('/model-operations')).data, updated=fresh.endpoints.find(row=>row.id===endpoint.id), owner=fresh.providers.find(row=>row.id===provider.id);
  assert.deepEqual(connectionKeys(updated,owner),connectionKeys(endpoint,provider));assert.equal(updated.baseUrl,endpoint.baseUrl);
  assert.equal(updated.candidateConfiguration.config.baseUrl,values.baseUrl);assert.equal(updated.candidateConfiguration.config.authMode,'specific');assert.equal(owner.apiKeys.find(row=>row.id===updated.candidateConfiguration.config.apiKeyId).fingerprint,newApiKey.fingerprint);
  assert.equal(owner.catalogConnections.find(row=>row.id===mapping.id).pricing.scenarios[0].listPrice,0);assert.equal(JSON.stringify(fresh).includes(secret),false);assert.deepEqual(fresh.modelSalePrices,state.modelSalePrices);
  for(const row of state.endpoints.filter(row=>row.id!==endpoint.id))assert.deepEqual(fresh.endpoints.find(other=>other.id===row.id),row);
});

test('explicit builtin catalogue upgrade is atomic, idempotent and preserves existing business records over HTTP', async () => {
  const { modelChanges, loadModelWorkspace } = await import('../server/model-repository.js');
  const { BUILTIN_MODEL_CATALOGUE } = await import('../src/mock/builtin-model-catalogue.js');
  const spec = BUILTIN_MODEL_CATALOGUE.models.find(row => row.name === 'Kimi K3.1 Pro');
  const before = await loadModelWorkspace(local.db,{id:'admin-001',role:'平台管理员'});
  const legacy = structuredClone(before);
  legacy.modelTemplates = legacy.modelTemplates.filter(row => row.id !== spec.id);
  legacy.modelData.catalogueIds = legacy.modelData.catalogueIds.filter(id => id !== spec.id);
  await local.db.batch(modelChanges(local.db,before,legacy));
  const state = (await request('/model-operations')).data, id = crypto.randomUUID();
  const body = {operationId:id,expectedRevision:state.revision,action:{type:'modelOperations',operation:'installModelCatalogue',data:{catalogueIds:[spec.id]}}};
  const saved = await request('/model-operations/commands',{method:'POST',key:id,body});
  assert.equal(saved.status,200,JSON.stringify(saved.data));
  assert.deepEqual((await request('/model-operations/commands',{method:'POST',key:id,body})).data,saved.data);
  const fresh = (await request('/model-operations')).data;
  assert.equal(fresh.modelTemplates.find(row => row.id === spec.id).name,spec.name);
  assert.ok(fresh.modelData.builtinIds.modelTemplates.includes(spec.id));
  assert.ok(!fresh.modelData.userIds.modelTemplates?.includes(spec.id));
  assert.deepEqual(fresh.modelTemplates.filter(row => row.id !== spec.id),state.modelTemplates);
  for (const key of ['models','providers','endpoints','modelSupplies','modelSalePrices','supplyPrices','serviceRoutes']) assert.deepEqual(fresh[key],state[key]);
  const submit = (data, session = token, expectedRevision = fresh.revision) => { const key = crypto.randomUUID(); return request('/model-operations/commands',{method:'POST',key,session,body:{operationId:key,expectedRevision,action:{type:'modelOperations',operation:'installModelCatalogue',data}}}); };
  assert.equal((await submit({catalogueIds:['foreign']})).status,422);
  assert.equal((await submit({catalogueIds:[spec.id]},readonlyToken)).status,403);
  assert.equal((await submit({catalogueIds:[spec.id]},token,state.revision)).status,409);
  assert.equal((await request('/model-operations')).data.revision,fresh.revision);
});

test('catalogue cleanup HTTP archives directory membership only, persists the exact list and rejects stale registration', async () => {
  const { modelLibrary, modelCatalogue } = await import('../src/admin-v2/model-library.js');
  const { BUILTIN_MODEL_CATALOGUE } = await import('../src/mock/builtin-model-catalogue.js');
  let state=(await request('/model-operations')).data;
  const id=crypto.randomUUID(),body={operationId:id,expectedRevision:state.revision,action:{type:'modelOperations',operation:'cleanModelCatalogue',data:{}}};
  const response=await request('/model-operations/commands',{method:'POST',key:id,body});assert.equal(response.status,200,JSON.stringify(response.data));
  assert.deepEqual((await request('/model-operations/commands',{method:'POST',key:id,body})).data,response.data);
  const fresh=(await request('/model-operations')).data;
  assert.deepEqual(modelCatalogue(fresh).map(row=>row.name),BUILTIN_MODEL_CATALOGUE.models.map(row=>row.name));
  for(const key of ['models','modelTemplates','providers','endpoints','modelSupplies','serviceRoutes','modelSalePrices','supplyPrices','modelOnboardings']) assert.deepEqual(fresh[key],state[key],key);
  const archived=modelLibrary(fresh).find(row=>fresh.modelData.archivedCatalogueIds.includes(row.id));assert.ok(archived);
  const submit=(action,session=token,expectedRevision=fresh.revision)=>{const key=crypto.randomUUID();return request('/model-operations/commands',{method:'POST',key,session,body:{operationId:key,expectedRevision,action}});};
  assert.equal((await submit(body.action,readonlyToken)).status,403);
  assert.equal((await submit(body.action,token,state.revision)).status,409);
  assert.equal((await submit({type:'modelOperations',operation:'supplierModelsRegister',data:{providerId:'provider-moma',libraryIds:[archived.id]}})).status,422);
  assert.equal((await request('/model-operations')).data.revision,fresh.revision);
});

test('supplier model removal over HTTP checks canonical aliases and preserves their historical records', async () => {
  const {modelChanges}=await import('../server/model-repository.js');
  let state=(await request('/model-operations')).data;
  const fixture=structuredClone(state),providerId='alignment-contract-provider',libraryId='builtin-pp-ocrv6';
  fixture.providers.push({id:providerId,name:'别名删除合同',code:'alignment-contract',status:'已启用',catalogueScope:'managed',catalogModelIds:['pp-ocrv6','pp-ocr-alias'],catalogModels:[{modelId:'pp-ocrv6',libraryId},{modelId:'pp-ocr-alias',libraryId}],catalogConnections:[{id:'alignment-mapping',modelId:'pp-ocr-alias',endpointId:'alignment-endpoint',enabled:false}],apiKeys:[]});
  fixture.endpoints.push({id:'alignment-endpoint',providerId,name:'别名渠道',protocol:'OpenAI',baseUrl:'https://alignment.example.invalid/v1',status:'草稿',apiKeys:[]});
  await local.db.batch(modelChanges(local.db,state,fixture));
  state=(await request('/model-operations')).data;
  async function remove(session=token){const id=crypto.randomUUID();return request('/model-operations/commands',{method:'POST',session,key:id,body:{operationId:id,expectedRevision:state.revision,action:{type:'modelOperations',operation:'provider',data:{operation:'catalogueRemove',objectId:providerId,values:{modelId:'pp-ocrv6',confirmed:true}}}}});}
  const blocked=await remove();assert.equal(blocked.status,422);assert.match(JSON.stringify(blocked.data),/全部渠道/);
  assert.deepEqual((await request('/model-operations')).data.providers,state.providers);
  const closed=structuredClone(state);closed.providers.find(row=>row.id===providerId).catalogConnections[0].deletedAt='2026-11-01';
  await local.db.batch(modelChanges(local.db,state,closed));
  state=(await request('/model-operations')).data;
  assert.equal((await remove(readonlyToken)).status,403);
  const saved=await remove();assert.equal(saved.status,200,JSON.stringify(saved.data));
  const next=(await request('/model-operations')).data,owner=next.providers.find(row=>row.id===providerId);
  assert.deepEqual(owner.removedCatalogModelIds,['pp-ocrv6','pp-ocr-alias']);
  assert.deepEqual(owner.catalogModels,state.providers.find(row=>row.id===providerId).catalogModels);
  for(const key of ['models','modelTemplates','endpoints','modelSupplies','modelSalePrices','serviceRoutes'])assert.deepEqual(next[key],state[key]);
});

test('acceptance cleanup is scoped, atomic, replayable and soft-archives only the three confirmed fixture graphs', async () => {
  const {modelChanges,initialModelWorkspace}=await import('../server/model-repository.js');
  const {withAcceptanceFixtures,fixtures}=await import('./acceptance-fixture-state.mjs');
  const templates=withAcceptanceFixtures(initialModelWorkspace());
  const before=(await request('/model-operations')).data,seeded=structuredClone(before);
  for(const [key,field]of [['providers','providerId'],['endpoints','endpointId'],['models','modelId'],['modelSupplies','supplyId'],['modelTemplates','libraryId']])seeded[key].push(...templates[key].filter(row=>fixtures.some(spec=>spec[field]===row.id)));
  seeded.modelVersions.push(...templates.modelVersions.filter(row=>fixtures.some(spec=>spec.modelId===row.modelId)));
  await local.db.batch([local.db.prepare('PRAGMA defer_foreign_keys=ON'),...modelChanges(local.db,before,seeded)]);
  let state=(await request('/model-operations')).data;
  async function command(providerId,confirmed,session=token){const id=crypto.randomUUID(),body={operationId:id,expectedRevision:state.revision,action:{type:'modelOperations',operation:'archiveAcceptanceFixture',data:{providerId,confirmed}}};return {id,body,result:await request('/model-operations/commands',{method:'POST',key:id,session,body})};}
  assert.equal((await command('provider-moma',true)).result.status,422);
  assert.equal((await command(fixtures[0].providerId,false)).result.status,422);
  assert.equal((await command(fixtures[0].providerId,true,readonlyToken)).result.status,403);
  const baseline=structuredClone(state);
  for(const spec of fixtures){
    const {id,body,result}=await command(spec.providerId,true);assert.equal(result.status,200,JSON.stringify(result.data));
    const replay=await request('/model-operations/commands',{method:'POST',key:id,body});assert.equal(replay.status,200);assert.deepEqual(replay.data,result.data);
    state=(await request('/model-operations')).data;
    assert.ok(!state.providers.some(row=>row.id===spec.providerId));assert.ok(!state.models.some(row=>row.id===spec.modelId));assert.ok(state.modelData.archivedCatalogueIds.includes(spec.libraryId));
    for(const [table,field]of [['suppliers','providerId'],['channels','endpointId'],['services','modelId']])assert.ok((await local.db.prepare(`SELECT deleted_at FROM ${table} WHERE id=?`).bind(spec[field]).first()).deleted_at);
  }
  for(const key of ['modelTemplates','modelSalePrices','supplyPrices','orders','requests','tariffDictionary'])assert.deepEqual(state[key],baseline[key]);
  for(const [key,field]of [['providers','providerId'],['endpoints','endpointId'],['models','modelId'],['modelSupplies','supplyId']])assert.deepEqual(state[key],baseline[key].filter(row=>!fixtures.some(spec=>spec[field]===row.id)));
  assert.equal(state.revision,baseline.revision+3);
});
