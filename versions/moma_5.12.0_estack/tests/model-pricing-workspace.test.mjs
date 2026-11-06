import test from 'node:test';
import assert from 'node:assert/strict';
import {createAdminSeed} from '../src/admin-v2/store.js';
import {costRecords,priceRecords,operationsReturn} from '../src/admin-v2/model-pricing-workspace.js';
import {activeModelSalePrice,activeProviderPrice} from '../src/admin-v2/service-workspace.js';
import {sections,canAccessPage} from '../src/admin-v2/navigation.mjs';

test('five modules share operator permissions while measurement stays a page-level destination',()=>{
  assert.deepEqual(sections.find(row=>row.id==='models').items.map(row=>row.label),['渠道接入','模型服务','模型成本','模型售价','模型资料']);
  for(const page of ['model-costs','model-prices','tariff-dictionary']){
    assert.equal(canAccessPage('运营人员',page),true);assert.equal(canAccessPage('运维人员',page),false);
  }
});

test('cost and sale projections retain their stable owners without changing stored data',()=>{
  const state=createAdminSeed(),before=structuredClone(state),costs=costRecords(state),prices=priceRecords(state);
  assert.ok(costs.length);assert.equal(new Set(costs.map(row=>row.key)).size,costs.length);
  for(const row of costs){assert.equal(row.association.endpoint.providerId,row.provider.id);assert.ok(row.association.id);}
  for(const row of prices)if(row.providerId)assert.ok(row.model.serviceProviders.some(entry=>entry.providerId===row.providerId));
  assert.deepEqual(state,before);
});

test('expired latest sale never revives an older price for either service mode',()=>{
  const at=Date.parse('2026-11-06T00:00:00Z'),model={id:'m',serviceModeRevision:1};
  for(const scope of ['model','provider']){
    const state={models:[model],modelSalePrices:[{id:'old',modelId:'m',providerId:'p',scope,serviceModeRevision:1,status:'已发布',effectiveAt:'2026-01-01',version:1},{id:'expired',modelId:'m',providerId:'p',scope,serviceModeRevision:1,status:'已发布',effectiveAt:'2026-11-01',expiresAt:'2026-11-05',version:2}]};
    const price=scope==='model'?activeModelSalePrice(state,'m',at):activeProviderPrice(state,'m','p',at);assert.equal(price,undefined);
  }
});

test('cross-page return accepts only supported local management destinations',()=>{
  for(const path of ['#/admin-2/model-costs?provider=p&association=a','#/admin-2/model-prices?service=provider%3Am%3Ap','#/admin-2/listing?model=m&panel=access'])assert.equal(operationsReturn(path),path);
  for(const path of ['https://example.com','#/admin-2/admins','#/admin-2/listing\nhttps://example.com',null])assert.equal(operationsReturn(path),null);
});
