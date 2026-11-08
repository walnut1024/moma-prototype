import test from 'node:test';
import assert from 'node:assert/strict';
import {createAdminSeed} from '../src/admin-v2/store.js';
import {costRecords,priceRecords,operationsReturn} from '../src/admin-v2/model-pricing-workspace.js';
import {priceItems} from '../src/admin-v2/model-management.js';
import {activeModelSalePrice,activeProviderPrice} from '../src/admin-v2/service-workspace.js';
import {sections,canAccessPage} from '../src/admin-v2/navigation.mjs';

test('model operations modules share operator permissions while measurement stays a page-level destination',()=>{
  assert.deepEqual(sections.find(row=>row.id==='models').items.map(row=>row.label),['渠道接入','模型服务','模型广场','模型成本','模型售价','模型资料']);
  for(const page of ['model-market','model-costs','model-prices','tariff-dictionary']){
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
  for(const path of ['#/admin-2/model-costs?provider=p&association=a','#/admin-2/model-prices?service=provider%3Am%3Ap','#/admin-2/listing?model=m&panel=access','#/admin-2/model-market?model=m&listing=gray'])assert.equal(operationsReturn(path),path);
  for(const path of ['https://example.com','#/admin-2/admins','#/admin-2/listing\nhttps://example.com',null])assert.equal(operationsReturn(path),null);
});

test('combined pricing filters use stable model and supplier IDs, preserve zero-cost rows and reject missing selections',async()=>{
  const {filterPricingRecords,pricingFilterOptions}=await import('../src/admin-v2/model-pricing-workspace.js');
  const rows=[
    {key:'a',modelKey:'m1',modelName:'同名模型',supplierId:'p1',supplierName:'同名服务商',status:'已配置',items:[{amount:0}]},
    {key:'b',modelKey:'m2',modelName:'同名模型',supplierId:'p2',supplierName:'同名服务商',status:'已配置'},
    {key:'c',modelKey:'m1',modelName:'同名模型',supplierId:'p1',supplierName:'同名服务商',status:'待配置'},
    {key:'d',modelKey:'m1',modelName:'同名模型',supplierId:'p2',supplierName:'同名服务商',status:'已失效'},
  ],before=structuredClone(rows),params=new URLSearchParams({filterModel:'m1',filterSupplier:'p1',filterStatus:'已配置',page:'3'});
  assert.deepEqual(filterPricingRecords(rows,params).map(row=>row.key),['a']);
  assert.deepEqual(pricingFilterOptions(rows),{models:[['m1','同名模型'],['m2','同名模型']],suppliers:[['p1','同名服务商'],['p2','同名服务商']]});
  assert.equal(params.get('page'),'3');assert.deepEqual(rows,before);
  params.set('filterStatus','已失效');assert.deepEqual(filterPricingRecords(rows,params),[]);
  assert.equal(filterPricingRecords(rows,new URLSearchParams()).length,4);
  for(const key of ['filterModel','filterSupplier','filterStatus'])assert.deepEqual(filterPricingRecords(rows,new URLSearchParams({[key]:'deleted-or-unknown'})),[]);
});

test('unified sale filters belong to the current platform supplier, while provider services keep their real supplier',async()=>{
  const {MOMA_PROVIDER}=await import('../src/admin-v2/moma-provider.js');
  const {filterPricingRecords}=await import('../src/admin-v2/model-pricing-workspace.js');
  const state=createAdminSeed();state.providers.find(row=>row.id===MOMA_PROVIDER.id).name='平台现名';
  Object.assign(state.models[0],{serviceMode:'standard',archivedAt:null,listingStatus:'已下架'});
  Object.assign(state.models[1],{serviceMode:'provider',archivedAt:null,listingStatus:'已下架',serviceProviders:[{providerId:state.providers.find(row=>row.id!==MOMA_PROVIDER.id).id,callId:'qa-provider-service'}]});
  const rows=priceRecords(state),unified=rows.filter(row=>!row.providerId);assert.ok(unified.length);
  assert.ok(unified.every(row=>row.supplierId===MOMA_PROVIDER.id && row.supplierName==='平台现名'));
  for(const row of rows.filter(row=>row.providerId))assert.equal(row.supplierId,row.providerId);
  assert.ok(filterPricingRecords(rows,new URLSearchParams({filterSupplier:MOMA_PROVIDER.id})).every(row=>!row.providerId || row.providerId===MOMA_PROVIDER.id));
});

test('scrolling price rows merge models across services while retaining each tariff, zero and missing price',async()=>{
  const {pricingTableRows}=await import('../src/admin-v2/model-pricing-workspace.js');
  const records=[
    {id:'s1',modelKey:'a',modelName:'同名模型',model:{},price:{items:[{name:'输入',amount:0,unit:'百万 Token',currency:'CNY'},{name:'输出',amount:2500000,unit:'百万 Token',currency:'USD'}]}},
    {id:'s2',modelKey:'b',modelName:'同名模型',model:{},price:null},
    {id:'s3',modelKey:'a',modelName:'同名模型',model:{},price:{items:[{name:'调用',amount:null,unit:'次',currency:'CNY'}]}},
  ],before=structuredClone(records),rows=pricingTableRows(records,row=>priceItems(row.price,row.model));
  assert.deepEqual(rows.map(row=>row.id),['s1','s1','s3','s2']);
  assert.deepEqual(rows.map(row=>row.modelSpan),[3,0,0,1]);
  assert.deepEqual(rows.map(row=>row.recordSpan),[2,0,1,1]);
  assert.equal(new Set(rows.map(row=>row.tableKey)).size,4);
  assert.equal(rows[0].item.amount,0);assert.equal(rows[1].item.currency,'USD');assert.equal(rows[2].item.amount,null);assert.equal(rows[3].item,null);
  assert.deepEqual(records,before);
});

test('cost table keeps each channel and tariff, including explicit zero and channels without a quote',async()=>{
  const {pricingTableRows}=await import('../src/admin-v2/model-pricing-workspace.js');
  const rows=pricingTableRows([
    {key:'p:c1',modelKey:'m',items:[{name:'输入',condition:'≤ 32K',amount:0,unit:'百万 Token',currency:'CNY'},{name:'输出',amount:2500000,unit:'百万 Token',currency:'USD'}]},
    {key:'p:c2',modelKey:'m',items:[]},
  ],row=>row.items);
  assert.deepEqual(rows.map(row=>[row.tableKey,row.modelSpan,row.recordSpan]),[['p:c1:0',3,2],['p:c1:1',0,0],['p:c2:0',0,1]]);
  assert.deepEqual(rows.map(row=>row.item),[
    {name:'输入',condition:'≤ 32K',amount:0,unit:'百万 Token',currency:'CNY'},
    {name:'输出',amount:2500000,unit:'百万 Token',currency:'USD'},
    null,
  ]);
});
