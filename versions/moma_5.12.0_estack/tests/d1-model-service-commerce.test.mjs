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

const adminId = 'admin-001';
const adminActor = {id:adminId,role:'平台管理员'};
const digest = value => createHash('sha256').update(value).digest('hex');

async function commerceTestBackend(t, account, licenseEdition) {
  const previous = process.env.VITE_MOMA_PRIVATE_SITE;
  process.env.VITE_MOMA_PRIVATE_SITE = '1';
  t.after(() => {
    if (previous === undefined) delete process.env.VITE_MOMA_PRIVATE_SITE;
    else process.env.VITE_MOMA_PRIVATE_SITE = previous;
  });
  const origin = 'https://example.test';
  const accessCode = randomBytes(18).toString('hex');
  const {db,runtime} = await startLocalBackend({demo:true,presets:true,licenseEdition,
    loginHashes:{[adminId]:digest(accessCode),[account]:digest(accessCode)}});
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
  const adminLogin = await request('/auth/login',{body:{accountId:adminId,accessCode}});
  ok(adminLogin);
  return {db,request,admin:adminLogin.cookie,login:accountType => request('/market/login',{
    body:{username:account,accountType,accessCode},
  })};
}

function ok(result) {
  assert.equal(result.status,200,JSON.stringify(result.data));
  return result.data;
}

async function costedTextAssociation(db) {
  const workspace = await loadModelWorkspace(db,adminActor,{simulation:false});
  const association = registeredServiceUpstreams(workspace).filter(row=>!row.reason).map(row=>({
    id:resourceId('service-channel'),channelId:row.id,name:row.name,fingerprint:channelFingerprint(row),
    upstreamId:row.upstreamModelId,provider:row.provider.name,enabled:true,priority:0,weight:100,
  })).find(configuration => {
    const prices = modelServiceSupply(workspace,{type:'text',channels:[configuration]})[0]?.costPrices;
    return prices?.map(item=>item.unit+':'+item.currency).sort().join() === 'million_input_tokens:CNY,million_output_tokens:CNY';
  });
  assert.ok(association,'fixture includes a qualified two-item upstream in CNY');
  return association;
}

function modelServicesClient(request, admin, association) {
  const serviceCommand = (row,revision = 0,expectedSale) => {
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
  return {serviceCommand,makeService};
}

test('independent services retain separate sale, order, price and call identities', {timeout:90_000}, async t => {
  const {db,request,login,admin} = await commerceTestBackend(t,'grzh');
  const tenantLogin = await login('personal');
  ok(tenantLogin);
  const cookie = tenantLogin.cookie;
  const tenantId = tenantLogin.data.tenant.id;
  const read = async path => ok(await request(path,{cookie}));
  const project = (await read('/market/workspace')).projects.find(row=>row.status==='正常');
  assert.ok(project);
  const {makeService,serviceCommand} = modelServicesClient(request,admin,await costedTextAssociation(db));
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

test('a new internal service needs tenant and project authorization but no sale or customer charge', {timeout:90_000}, async t => {
  const tenantId = 'zqzh';
  const {db,request,login,admin} = await commerceTestBackend(t,tenantId,'internal');
  const foreignKey = 'sk-' + randomBytes(16).toString('hex');
  await db.prepare("UPDATE model_workspace SET reference_json=json_insert(reference_json,'$.apiKeys[#]',json(?)) WHERE id=1")
    .bind(JSON.stringify({id:resourceId('api-key'),name:'原个人项目密钥',ownerId:'grzh',tenantId:'grzh',projectId:'project-grzh',
      status:'有效',billingType:'按量付费',modelIds:[],credentialDigest:digest(foreignKey)})).run();
  const policy = ok(await request('/project-space-policy',{cookie:admin}));
  ok(await request('/project-space-policy',{cookie:admin,body:{
    expectedRevision:policy.revision,operatingMode:'factory',internalTenantId:tenantId,personalEnabled:true,
  }}));
  assert.equal(ok(await request('/deployment/license')).commerceWritable,false);
  assert.equal((await request('/model-service-sales',{cookie:admin})).data.error.code,'LICENSE_REQUIRED');

  const tenantLogin = await login('enterprise');
  assert.equal(ok(tenantLogin).tenant.internal,true);
  assert.equal(tenantLogin.data.tenant.id,tenantId);
  const cookie = tenantLogin.cookie;
  const workspace = async () => ok(await request('/market/workspace',{cookie}));
  async function tenantCommand(action, data) {
    const {revision} = await workspace();
    return request('/market/commands',{cookie,body:{
      operationId:resourceId('operation'),tenantId,expectedRevision:revision,action,data,
    }});
  }
  const application = async () => ok(await request('/application',{cookie:admin}));
  async function tenantSettings(operation, data) {
    const operationId = resourceId('operation');
    return request('/application/commands',{cookie:admin,key:operationId,body:{
      operationId,expectedRevision:(await application()).revision,
      action:{type:'tenantServiceSettings',tenantId,operation,data},
    }});
  }

  const {makeService,serviceCommand} = modelServicesClient(request,admin,await costedTextAssociation(db));
  const service = await makeService('internal');
  const departmentId = (await application()).organizations.find(row=>row.tenantId===tenantId && !row.parentId).id;
  const createProject = async name => 'project-' + ok(await tenantCommand('projectCreate',{name,departmentId})).operationId;
  const projectA = await createProject('内用项目 A');
  const projectB = await createProject('内用项目 B');
  assert.equal((await application()).marketModelServices.find(row=>row.id===service.id).independentService,true);
  const assign = projectId => tenantCommand('projectUpdate',{projectId,type:'models',input:[{modelId:service.id,rpm:null,tpm:null}]});
  const hasProjectService = async () => (await workspace()).projectServices.some(row=>row.id===service.id);
  const messages = [{role:'user',content:'内用项目首次调用'}];
  const invokeWeb = (projectId, requestId = resourceId('request')) => request('/market/completions',{cookie,
    body:{tenantId,projectId,requestId,model:service.callId,messages,task:'text'}});

  assert.equal(await hasProjectService(),false);
  assert.equal((await assign(projectA)).status,422);
  assert.equal((await tenantSettings('open-models',{modelIds:[service.id,resourceId('model-service')]})).status,422);
  assert.equal(await hasProjectService(),false,'failed bulk authorization must not open the valid service');

  ok(await tenantSettings('open-models',{modelIds:[service.id]}));
  const grant = (await application()).tenants.find(row=>row.id===tenantId).modelRules.find(row=>row.modelId===service.id);
  assert.deepEqual(grant,{modelId:service.id,rpm:null,tpm:null});
  const eligible = (await workspace()).projectServices.find(row=>row.id===service.id);
  assert.ok(eligible);
  const {callable,canOrder,ordered,salePrices} = eligible;
  assert.deepEqual({callable,canOrder,ordered,salePrices},{callable:true,canOrder:false,ordered:false,salePrices:[]});
  ok(await assign(projectA));
  const market = ok(await request('/market/catalogue?project='+projectA,{cookie}));
  assert(!market.services.some(row=>row.id===service.id),'a service without a card stays out of the marketplace');
  const blockedWeb = await invokeWeb(projectB);
  assert.equal(blockedWeb.status,403);
  assert.equal(blockedWeb.data.error.code,'project_model_not_enabled');
  const legacyProject = (await workspace()).projects.find(row=>row.id==='project-'+tenantId);
  assert.ok(legacyProject);
  assert.equal((await invokeWeb(legacyProject.id)).data.error.code,'project_model_not_enabled');
  const webRequest = resourceId('request');
  const web = ok(await invokeWeb(projectA,webRequest));
  assert.equal(web.model,service.callId);
  assert.equal(web.source,'mock');

  async function projectKey(projectId, models) {
    const secret = 'sk-' + randomBytes(16).toString('hex');
    ok(await tenantCommand('keys',{projectId,billing:'按量付费',rows:[{
      id:resourceId('api-key'),name:'内用项目密钥',enabled:true,models,
      secretPreview:secret.slice(0,8) + '*****' + secret.slice(-4),credentialDigest:digest(secret),
    }]}));
    return secret;
  }
  const invokeAPI = (secret, requestId = resourceId('request')) => request('/chat/completions',{secret,requestId,body:{model:service.callId,messages}});
  const projectAKey = await projectKey(projectA,[service.callId]);
  const projectBKey = await projectKey(projectB,null);
  const stateWithKeys = await application();
  const keyId = stateWithKeys.apiKeys.find(key=>key.projectId===projectA).id;
  const toggleOperation = resourceId('operation');
  const blockedToggle = await request('/application/commands',{cookie:admin,key:toggleOperation,body:{
    operationId:toggleOperation,expectedRevision:stateWithKeys.revision,
    action:{type:'enterprise',operation:'toggle-key',tenantId,keyId},
  }});
  assert.equal(blockedToggle.status,403);
  const foreign = await invokeAPI(foreignKey);
  assert.equal(foreign.status,403);
  assert.equal(foreign.data.error.code,'customer_unavailable');
  const blockedAPI = await invokeAPI(projectBKey);
  assert.equal(blockedAPI.status,403);
  assert.equal(blockedAPI.data.error.code,'project_model_not_enabled');
  const apiRequest = resourceId('request');
  assert.equal(ok(await invokeAPI(projectAKey,apiRequest)).model,service.callId);

  for (const requestId of [webRequest,apiRequest]) {
    const fact = await readProjectFact(db,tenantId,requestId);
    assert.equal(fact.modelId,service.id);
    assert.equal(fact.projectId,projectA);
    assert.equal(fact.departmentId,departmentId);
    assert.equal(fact.settlement,'internal');
    assert.ok(fact.internalCost?.micros > 0);
    assert.deepEqual(await db.prepare('SELECT sale_price_id FROM model_service_calls WHERE tenant_id=? AND request_id=?')
      .bind(tenantId,requestId).first(),{sale_price_id:null});
    assert.equal(await db.prepare('SELECT 1 FROM market_charge_receipts WHERE tenant_id=? AND request_id=?')
      .bind(tenantId,requestId).first(),null);
  }
  assert.equal(await db.prepare('SELECT 1 FROM model_service_sales WHERE service_id=?').bind(service.id).first(),null);
  assert.equal(await db.prepare('SELECT 1 FROM model_service_orders WHERE service_id=?').bind(service.id).first(),null);

  const stopped = ok(await serviceCommand({...service,listed:false},service.revision)).row;
  const deleteIssue = ok(await request('/model-services-new?inspect='+service.id,{cookie:admin})).deleteIssue;
  assert.match(deleteIssue,/租户授权/);
  const operationId = resourceId('operation');
  const blockedDelete = await request('/model-services-new',{cookie:admin,key:operationId,body:{
    action:'delete',id:service.id,revision:stopped.revision,operationId,
  }});
  assert.equal(blockedDelete.status,400);
  assert.equal(blockedDelete.data.error.message,deleteIssue);
  ok(await serviceCommand({...stopped,listed:true},stopped.revision));
  assert.equal(await hasProjectService(),true);

  ok(await tenantSettings('remove-model',{modelId:service.id}));
  assert.equal(await hasProjectService(),false);
  assert.equal((await invokeWeb(projectA)).status,403);
  assert.equal((await invokeAPI(projectAKey)).status,403);
});
