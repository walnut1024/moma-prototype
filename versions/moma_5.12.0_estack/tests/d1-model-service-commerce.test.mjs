import assert from 'node:assert/strict';
import {createHash,randomBytes} from 'node:crypto';
import test from 'node:test';
import { startLocalBackend } from '../database/local-runtime.js';
import { loadModelWorkspace, modelChanges } from '../server/model-repository.js';
import { modelServiceSupply } from '../server/model-service-sales.js';
import { readProjectFact } from '../server/project-facts.js';
import { channelFingerprint } from '../src/admin-v2/provider-channels.js';
import { registeredServiceUpstreams } from '../src/admin-v2/service-model-mappings.js';
import { resourceId } from '../src/resource-id.mjs';
import { marketCardFixture } from './market-card-fixture.mjs';

test('independent services retain separate sale, order, price and call identities', {timeout:90_000}, async t => {
  process.env.VITE_MOMA_PRIVATE_SITE = '1';
  const origin = 'https://example.test', adminId = 'admin-001', account = 'grzh';
  const accessCode = randomBytes(18).toString('hex');
  const digest = value => createHash('sha256').update(value).digest('hex');
  const {db,runtime} = await startLocalBackend({demo:true,presets:true,loginHashes:{[adminId]:digest(accessCode),[account]:digest(accessCode)}});
  t.after(() => runtime.dispose());

  async function request(path, {cookie,body,key,secret,requestId} = {}) {
    const response = await runtime.dispatchFetch(origin + '/api/v1' + path, {
      method:body ? 'POST' : 'GET',
      headers:{...(cookie && {cookie}), ...(body && {'content-type':'application/json'}),
        ...(body && !secret && {origin,'x-moma-request':'1'}),
        ...(key && {'idempotency-key':key}), ...(secret && {authorization:'Bearer '+secret}),
        ...(requestId && {'x-request-id':requestId})},
      ...(body && {body:JSON.stringify(body)}),
    });
    return {status:response.status,data:await response.json(),cookie:response.headers.get('set-cookie')?.split(';')[0]};
  }
  function ok(result) {
    assert.equal(result.status,200,JSON.stringify(result.data));
    return result.data;
  }

  const adminLogin = await request('/auth/login',{body:{accountId:adminId,accessCode}});
  ok(adminLogin);
  const admin = adminLogin.cookie;
  const tenantLogin = await request('/market/login',{body:{username:account,accountType:'personal',accessCode}});
  ok(tenantLogin);
  const cookie = tenantLogin.cookie;
  const tenantId = tenantLogin.data.tenant.id;
  const read = async path => ok(await request(path,{cookie}));
  const project = (await read('/market/workspace')).projects.find(row=>row.status==='正常');
  assert.ok(project);

  const workspace = await loadModelWorkspace(db,{id:adminId,role:'平台管理员'},{simulation:false});
  const association = registeredServiceUpstreams(workspace).filter(row=>!row.reason).map(row=>({
    id:resourceId('service-channel'),channelId:row.id,name:row.name,fingerprint:channelFingerprint(row),
    upstreamId:row.upstreamModelId,provider:row.provider.name,enabled:true,priority:0,weight:100,
  })).find(configuration => {
    const prices = modelServiceSupply(workspace,{type:'text',channels:[configuration]})[0]?.costPrices;
    return prices?.map(item=>item.unit+':'+item.currency).sort().join() === 'million_input_tokens:CNY,million_output_tokens:CNY';
  });
  assert.ok(association,'fixture includes a qualified two-item upstream in CNY');

  const serviceCommand = async (row,revision = 0,expectedSale) => {
    const operationId = resourceId('operation');
    return request('/model-services-new',{cookie:admin,key:operationId,
      body:{action:'save',id:row.id,row,revision,operationId,expectedSale}});
  };
  async function makeService(suffix) {
    const id = resourceId('model-service');
    const created = ok(await serviceCommand({id,name:'B-14 服务 '+suffix,callId:'b14-independent-'+suffix,
      type:'text',listed:false,channels:[]})).row;
    const configured = ok(await serviceCommand({...created,channels:[association]},created.revision)).row;
    const row = ok(await serviceCommand({...configured,listed:true},configured.revision)).row;
    assert.equal(Object.hasOwn(row,'modelId'),false);
    return row;
  }
  const a = await makeService('a'), b = await makeService('b');
  assert.notEqual(a.id,b.id);
  assert.equal(a.channels[0].channelId,b.channels[0].channelId);

  const saleCommand = (service,action,revision,fields={}) => {
    const operationId = resourceId('operation');
    return request('/model-service-sales',{cookie:admin,key:operationId,body:{serviceId:service.id,action,revision,operationId,...fields}});
  };
  async function openSale(service, amount) {
    const items = ['输入 Token','输出 Token'].map(name=>({name,condition:'',unit:'百万 Token',currency:'CNY',amount}));
    ok(await saleCommand(service,'price',0,{items}));
    ok(await saleCommand(service,'start',1,{stage:'formal',grayTenantIds:[]}));
  }
  await openSale(a,'2');
  await openSale(b,'9');

  async function cardCommand(operation,data) {
    const expectedRevision = ok(await request('/model-operations',{cookie:admin})).revision;
    const operationId = resourceId('operation');
    return ok(await request('/model-operations/commands',{cookie:admin,key:operationId,body:{
      operationId,expectedRevision,action:{type:'modelOperations',operation,data:{...data,expectedRevision}},
    }}));
  }
  await cardCommand('marketCardCreate',{...marketCardFixture,name:'B-14 统一展示资料'});
  const cards = JSON.parse(await db.prepare('SELECT meta_json FROM model_workspace WHERE id=1').first('meta_json')).modelData.marketCards;
  const selectedCard = Object.entries(cards).find(([,card])=>card.content.name==='B-14 统一展示资料');
  assert.ok(selectedCard);
  const [cardId] = selectedCard;
  await cardCommand('marketCardLink',{card_id:cardId,serviceIds:[a.id,b.id]});
  await cardCommand('marketCardSetStatus',{card_id:cardId,listing_stage:'formal',serviceIds:[a.id]});

  const catalogue = () => read('/market/catalogue');
  const shown = (await catalogue()).services.find(row=>row.id===a.id);
  assert.equal(shown.model_id,cardId);
  assert.equal(shown.serviceModelId,a.id);
  assert.equal(shown.projectServiceId,a.id);
  assert.equal(shown.canOrder,true);
  assert.equal((await catalogue()).cards.find(row=>row.card_id===cardId).name,'B-14 统一展示资料');
  assert(!(await catalogue()).services.some(row=>row.id===b.id));
  const order = (offerId,priceId) => request('/market/orders',{cookie,body:{tenantId,offerIds:[offerId],salePriceIds:{[offerId]:priceId}}});
  assert.equal((await order(b.id,shown.salePriceId)).data.error.code,'MODEL_FORBIDDEN');
  assert.equal((await order(a.id,'stale-price')).data.error.code,'PRICE_CHANGED');
  const firstOrder = ok(await order(a.id,shown.salePriceId)).orders[0];
  assert.equal(firstOrder.offerId,a.id);
  assert.deepEqual(ok(await order(a.id,shown.salePriceId)).orders,[firstOrder]);

  await cardCommand('marketCardSetStatus',{card_id:cardId,listing_stage:'formal',serviceIds:[a.id,b.id]});
  const both = (await catalogue()).services.filter(row=>row.card_id===cardId);
  assert.deepEqual(new Set(both.map(row=>row.id)),new Set([a.id,b.id]));
  assert.notEqual(both[0].salePriceId,both[1].salePriceId);

  const messages = [{role:'user',content:'独立销售调用验收'}];
  const invokeWeb = (model,requestId = resourceId('request')) => request('/market/completions',{cookie,
    body:{tenantId,projectId:project.id,requestId,model,messages,task:'text'}});
  assert.equal((await invokeWeb(b.callId)).data.error.code,'order_required');
  const webRequest = resourceId('request'), web = await invokeWeb(a.callId,webRequest);
  assert.equal(ok(web).model,a.callId);
  assert.equal(web.data.source,'mock');
  assert.deepEqual(ok(await invokeWeb(a.callId,webRequest)),web.data);

  const secret = 'sk-'+randomBytes(16).toString('hex'), keyId = resourceId('api-key');
  const settings = await read('/market/workspace');
  ok(await request('/market/commands',{cookie,body:{operationId:resourceId('operation'),expectedRevision:settings.revision,
    tenantId,action:'keys',data:{projectId:project.id,billing:'按量付费',rows:[{id:keyId,name:'独立售卖验收',
      enabled:true,models:[a.id,b.id],secretPreview:'sk-demo*****b14a',credentialDigest:digest(secret)}]}}}));
  const invokeAPI = (model,requestId = resourceId('request')) => request('/chat/completions',{secret,requestId,body:{model,messages}});
  assert.equal((await invokeAPI(b.callId)).data.error.code,'order_required');
  const apiRequest = resourceId('request');
  const api = await invokeAPI(a.callId,apiRequest);
  assert.equal(ok(api).model,a.callId);
  assert.deepEqual(ok(await invokeAPI(a.callId,apiRequest)),api.data);
  assert.equal((await invokeAPI(a.callId,webRequest)).data.error.code,'REQUEST_ID_CONFLICT');

  const adminActor = {id:adminId,role:'平台管理员'};
  const costed = await loadModelWorkspace(db,adminActor,{command:true,simulation:false});
  const costId = modelServiceSupply(costed,b)[0].costPrice.id;
  const uncosted = structuredClone(costed);
  const findCost = state => [...state.supplyPrices, ...state.providers.flatMap(provider =>
    (provider.catalogConnections || []).flatMap(row => row.procurementVersions || []))].find(version=>version.id===costId);
  const activeCost = findCost(uncosted);
  assert.ok(activeCost);
  const originalExpiry = activeCost.expiresAt;
  activeCost.expiresAt = '2020-01-01T00:00:00.000Z';
  await db.batch(modelChanges(db,costed,uncosted));
  assert.equal(modelServiceSupply(uncosted,b)[0].costPrices,null);

  const priceB = both.find(row=>row.id===b.id).salePriceId;
  const secondOrder = ok(await order(b.id,priceB)).orders[0];
  assert.equal(secondOrder.offerId,b.id);
  assert.notEqual(secondOrder.id,firstOrder.id);
  const bRequest = resourceId('request');
  ok(await invokeAPI(b.callId,bRequest));
  const bFact = await readProjectFact(db,tenantId,bRequest);
  assert.equal(bFact.procurementVersionId,null);
  assert.equal(bFact.procurementSnapshot,null);
  assert.equal(bFact.costStatus,'pending');
  assert.ok(bFact.charge.micros > 0);
  const facts = (await read('/market/workspace')).report.records;
  assert.equal(facts.find(row=>row.requestId===webRequest).modelId,a.id);
  assert.equal(facts.find(row=>row.requestId===apiRequest).modelId,a.id);
  assert.equal(facts.find(row=>row.requestId===bRequest).modelId,b.id);
  assert(facts.find(row=>row.requestId===apiRequest).charge.micros < facts.find(row=>row.requestId===bRequest).charge.micros);
  assert.equal(await db.prepare('SELECT COUNT(*) AS n FROM market_charge_receipts WHERE tenant_id=?').bind(tenantId).first('n'),3);
  const ownOrders = (await read('/market/workspace')).orders;
  assert.equal(ownOrders.find(row=>row.id===firstOrder.id).priceSnapshot.id,shown.salePriceId);
  assert.equal(ownOrders.find(row=>row.id===secondOrder.id).priceSnapshot.id,priceB);
  const restored = await loadModelWorkspace(db,adminActor,{command:true,simulation:false});
  const beforeRestore = structuredClone(restored);
  findCost(restored).expiresAt = originalExpiry;
  await db.batch(modelChanges(db,beforeRestore,restored));

  async function setLimit(data) {
    const config = ok(await request('/traffic-limits',{cookie:admin}));
    const operationId = resourceId('operation');
    ok(await request('/traffic-limits',{cookie:admin,key:operationId,body:{
      operationId,expectedRevision:config.revision,accountId:config.accountId,operation:'model',id:a.id,data,
    }}));
  }
  await setLimit({rpm:1,tpm:1_000_000});
  assert.equal((await invokeWeb(a.callId)).data.error.code,'model_service_rate_limit_exceeded');
  assert.equal((await invokeAPI(a.callId)).data.error.code,'model_service_rate_limit_exceeded');
  ok(await invokeAPI(b.callId));
  await setLimit(null);

  ok(await saleCommand(a,'pause',2));
  ok(await invokeWeb(a.callId));
  ok(await invokeAPI(a.callId));
  ok(await saleCommand(a,'start',3,{stage:'formal',grayTenantIds:[]}));
  const inspect = () => request('/model-services-new?inspect='+a.id,{cookie:admin}).then(ok);
  const stop = async () => serviceCommand({...a,listed:false},a.revision,(await inspect()).sale);
  assert.equal((await stop()).status,400);
  await cardCommand('marketCardSetStatus',{card_id:cardId,listing_stage:'formal',serviceIds:[b.id]});

  // The lifecycle write and the automatic stop-sale record commit together.
  await db.prepare(`CREATE TRIGGER reject_b14_cascade BEFORE INSERT ON audit_events
    WHEN NEW.action='因停服自动停售' BEGIN SELECT RAISE(ABORT,'test B14 cascade failure'); END`).run();
  try {
    assert.equal((await stop()).status,503);
    const snapshot = await inspect();
    assert.equal(snapshot.revision,a.revision);
    assert.equal(snapshot.sale.status,'在售');
    ok(await invokeAPI(a.callId));
  } finally {
    await db.prepare('DROP TRIGGER reject_b14_cascade').run();
  }
  const stopped = ok(await stop()).row;
  const readSale = async () => ok(await request('/model-service-sales',{cookie:admin})).rows.find(row=>row.serviceId===a.id);
  assert.equal((await readSale()).stage,'paused');
  assert.equal(await db.prepare("SELECT entity_id FROM audit_events WHERE action='因停服自动停售'").first('entity_id'),a.id);
  assert.equal((await invokeWeb(a.callId)).data.error.code,'MODEL_UNAVAILABLE');
  assert.equal((await invokeAPI(a.callId)).data.error.code,'MODEL_UNAVAILABLE');
  ok(await invokeWeb(b.callId));
  ok(await serviceCommand({...stopped,listed:true},stopped.revision));
  assert.equal((await readSale()).stage,'paused');
  ok(await invokeAPI(a.callId));
  const app = ok(await request('/application',{cookie:admin}));
  const operationId = resourceId('operation');
  ok(await request('/application/commands',{cookie:admin,key:operationId,
    body:{operationId,expectedRevision:app.revision,action:{type:'cancelMarketOrder',id:firstOrder.id}}}));
  assert.equal((await invokeAPI(a.callId)).data.error.code,'order_required');
  const cancelled = (await read('/market/workspace')).orders.find(row=>row.id===firstOrder.id);
  assert.equal(cancelled.status,'已退订');
  assert.equal(cancelled.priceSnapshot.id,shown.salePriceId);
});
