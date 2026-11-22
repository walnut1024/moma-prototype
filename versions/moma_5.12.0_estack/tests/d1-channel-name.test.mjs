import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash, randomBytes } from 'node:crypto';
import { startLocalBackend } from '../database/local-runtime.js';
import { domainModelWorkspace } from '../src/mock/model-fields.js';
import { supplierChannelAssociations, supplierChannelName } from '../src/admin-v2/supplier-resources.js';
import { channelIdentity } from '../src/model-identities.mjs';
import { resourceRows } from '../src/admin-v2/model-resource-transfer.js';

test('HTTP channel rename survives refresh and replay without renaming the connection or sibling channels', async () => {
  const accessCode=randomBytes(24).toString('hex'), hash=createHash('sha256').update(accessCode).digest('hex');
  const local=await startLocalBackend({demo:true,loginHashes:{'admin-001':hash,'admin-002':hash,'test-operator':hash}});
  const request=async(path,body,cookie)=>{
    const response=await local.runtime.dispatchFetch('https://example.test/api/v1'+path,{method:body?'POST':'GET',headers:{
      ...(cookie?{cookie}:{}),...(body?{'content-type':'application/json',origin:'https://example.test','x-moma-request':'1'}:{}),
      ...(body?.operationId?{'idempotency-key':body.operationId}:{}),
    },...(body?{body:JSON.stringify(body)}:{})});
    return {status:response.status,data:await response.json(),cookie:response.headers.get('set-cookie')?.split(';')[0]};
  };
  try {
    await local.db.prepare("INSERT INTO admin_accounts(id,name,role) VALUES('test-operator','运营验收','运营人员')").run();
    const login=await request('/auth/login',{accountId:'admin-001',accessCode});assert.equal(login.status,200);
    const readonly=await request('/auth/login',{accountId:'admin-002',accessCode});assert.equal(readonly.status,200);
    const operator = await request('/auth/login', { accountId: 'test-operator', accessCode });
    assert.equal(operator.status, 200);
    const catalogue = token => request('/channel-health', undefined, token);
    assert.equal((await catalogue()).status, 401);
    const [adminHealth, maintenanceHealth, operatorHealth] = await Promise.all([
      catalogue(login.cookie), catalogue(readonly.cookie), catalogue(operator.cookie),
    ]);
    assert.equal(adminHealth.status, 200);
    assert.equal(maintenanceHealth.status, 403);
    assert.equal(operatorHealth.status, 200);
    assert.deepEqual(operatorHealth.data.catalogue, adminHealth.data.catalogue);
    assert.ok(adminHealth.data.catalogue.length > 0);
    assert.ok(adminHealth.data.catalogue.some(row => row.baseUrl?.startsWith('https://')));
    for (const { baseUrl } of adminHealth.data.catalogue) {
      if (!baseUrl) continue;
      const url = new URL(baseUrl);
      assert.ok(['http:', 'https:'].includes(url.protocol));
      assert.equal(url.username + url.password + url.search + url.hash, '');
    }
    for (const row of adminHealth.data.catalogue) {
      assert.deepEqual(Object.keys(row.cost).sort(), ['items', 'key', 'status']);
      assert.ok(!('association' in row) && !('credentials' in row));
    }
    assert.equal((await request('/channel-health', {}, login.cookie)).status, 405);
    const read=async()=>domainModelWorkspace((await request('/model-operations',undefined,login.cookie)).data);
    const state=await read(),provider=state.providers.find(row=>row.id==='provider-moma');
    const association=supplierChannelAssociations(state,provider).find(row=>supplierChannelAssociations(state,provider,row.endpointId).length>1);
    assert(association,'fixture must exercise a shared connection');
    const endpoint=association.endpoint,values={providerId:provider.id,endpointId:endpoint.id,associationId:association.id,modelId:association.modelId,
      name:supplierChannelName(provider,endpoint),sourceName:'转售渠道',upstreamModelId:association.upstreamModelId,baseUrl:endpoint.baseUrl,
      expectedUpdatedAt:endpoint.updatedAt,expectedProviderUpdatedAt:provider.updatedAt};
    const command=(data,token=login.cookie,id=crypto.randomUUID())=>request('/model-operations/commands',{
      operationId:id,expectedRevision:state.revision,action:{type:'modelOperations',operation:'supplierChannelEdit',data},
    },token);
    for(const patch of [{sourceName:''},{sourceName:'x'.repeat(61)},{sourceName:'line\nbreak'},{associationId:'foreign'},{associationId:undefined},{expectedProviderUpdatedAt:'stale'}])
      assert.equal((await command({...values,...patch})).status,422);
    assert.equal((await command(values,readonly.cookie)).status,403);
    const untouched=await read();assert.deepEqual(untouched.providers,state.providers);assert.deepEqual(untouched.endpoints,state.endpoints);
    const id=crypto.randomUUID(),saved=await command(values,login.cookie,id);assert.equal(saved.status,200,JSON.stringify(saved.data));
    assert.deepEqual((await command(values,login.cookie,id)).data,saved.data);assert.equal((await command(values)).status,409);
    const fresh=await read(),owner=fresh.providers.find(row=>row.id===provider.id);
    const original=provider.catalogConnections.find(row=>row.id===association.id),current=owner.catalogConnections.find(row=>row.id===association.id);
    assert.deepEqual(current,{...original,sourceName:'转售渠道',updatedAt:current.updatedAt});
    assert.equal(supplierChannelAssociations(fresh,owner,endpoint.id).find(row=>row.id===association.id).name,'转售渠道');
    assert.equal(resourceRows(fresh,'channels').find(row=>row.type==='channel'&&row.id===channelIdentity(fresh,association.id)).name,'转售渠道');
    assert.equal(channelIdentity(fresh,association.id),channelIdentity(state,association.id));
    assert.deepEqual(fresh.endpoints,state.endpoints);
    assert.deepEqual(owner.catalogConnections.filter(row=>row.id!==association.id),provider.catalogConnections.filter(row=>row.id!==association.id));
    assert.deepEqual(fresh.providers.filter(row=>row.id!==provider.id),state.providers.filter(row=>row.id!==provider.id));
    for(const key of ['models','modelSalePrices','supplyPrices','modelSupplies','serviceRoutes','modelTemplates'])assert.deepEqual(fresh[key],state[key]);
    assert.equal(fresh.revision,state.revision+1);
  } finally {await local.runtime.dispose();}
});
