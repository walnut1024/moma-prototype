import assert from 'node:assert/strict';
import test from 'node:test';
import { canonicalMomaScenarios, MOMA_BILLING_ITEMS } from '../src/admin-v2/moma-billing-items.js';
import { MOMA_PROVIDER } from '../src/admin-v2/moma-provider.js';
import { MOMA_CATALOGUE_PRICES, providerCataloguePrice } from '../src/admin-v2/moma-catalogue-prices.js';
import { createAdminSeed, commitAdminState } from '../src/admin-v2/store.js';
import { normalizeCataloguePrice, cataloguePriceDraft } from '../src/admin-v2/provider-catalogue-pricing.js';
import { tariffDictionaryEntries, tariffOptions, tariffScenarioUnit, appendCommonTariffScenarios, tariffDictionaryTransaction } from '../src/admin-v2/tariff-dictionary.js';

const price = id => providerCataloguePrice(MOMA_PROVIDER, id);
const inputLow = '输入 Token（输入长度 (0,128K]）', outputLow = '输出 Token（输入长度 (0,128K]）';

test('Qwen input and output remain separate, while same-price thinking modes merge inside each input-length tier', () => {
  assert.deepEqual(price('Qwen3.5-27B').scenarios.map(row => [row.name,row.listPrice]), [['输入 Token',600000],['输出 Token',4800000],['输入 Token（夜间）',240000],['输出 Token（夜间）',1920000]]);
  const rows = price('Qwen3.5-35B-A3B').scenarios;
  assert.deepEqual(rows.map(row=>[row.name,row.listPrice]), [[inputLow,400000],[outputLow,3200000],['输入 Token（输入长度 (128K,256K]）',1600000],['输出 Token（输入长度 (128K,256K]）',12800000]]);
  assert.ok(rows.every(row=>!row.condition&&!/[\r\n]/.test(row.name)));
  assert.deepEqual(price('Qwen3-32B').scenarios.filter(row=>row.name.startsWith('输出')).map(row=>[row.name,row.listPrice]), [['输出 Token（思考）',20000000],['输出 Token（非思考）',8000000]]);
});

test('dictionary includes every canonical billing label and its actual quantity unit', () => {
  const state=createAdminSeed(), entries=tariffDictionaryEntries(state), ids=new Set();let count=0;
  for(const item of MOMA_BILLING_ITEMS){assert.ok(item.builtin);assert.ok(!ids.has(item.id));ids.add(item.id);assert.ok(item.name.length<=80);assert.match(item.englishName,/^[\x20-\x7e]{1,80}$/);}
  for(const id of MOMA_PROVIDER.catalogModelIds)for(const row of price(id).scenarios){const entry=entries.find(item=>item.kind==='scenario'&&item.name===row.name);assert.ok(entry,row.name);assert.equal(tariffScenarioUnit(state,row.name),row.unit,row.name);count++;}
  assert.equal(count,304);
  assert.equal(tariffScenarioUnit(state,'音频输入时长（按秒）'),'秒');
  assert.notEqual(price('qwen3.8-max').scenarios.find(row=>row.name==='缓存读取 Token').listPrice,price('qwen3.8-max').scenarios.find(row=>row.name==='缓存读取 Token（显式缓存）').listPrice);
});

test('new dictionary definitions work in existing storage without rewriting custom records or quote snapshots', () => {
  const state=createAdminSeed();state.tariffDictionary=state.tariffDictionary.filter(item=>!item.id.startsWith('tariff-moma-'));
  const custom={id:'custom-fee',kind:'scenario',name:'自定义费用',englishName:'Custom fee',unitId:'tariff-unit-1',status:'已停用',builtin:false};state.tariffDictionary.push(custom);
  const before=JSON.stringify(state);
  assert.ok(tariffOptions(state,'scenario').includes(inputLow));
  assert.ok(!tariffOptions(state,'scenario').includes(custom.name));
  const rows=appendCommonTariffScenarios([], [inputLow,outputLow], state,'CNY');assert.deepEqual(rows.map(row=>row.unit),['百万 Token','百万 Token']);
  const item=tariffDictionaryEntries(state).find(item=>item.name===inputLow);
  for(const operation of ['save','status','delete'])assert.throws(()=>tariffDictionaryTransaction(state,{operation,id:item.id,builtin:false,name:'changed',status:'已停用'}),/内置字典项只读/);
  assert.equal(JSON.stringify(state),before);
});

test('different prices, currencies, units and unrecognized custom conditions never disappear during deduplication', () => {
  const original=normalizeCataloguePrice({modelId:'Qwen3.5-35B-A3B',discountFactor:'0.8',scenarios:MOMA_CATALOGUE_PRICES['Qwen3.5-35B-A3B'].scenarios}), before=JSON.stringify(original);
  const altered=structuredClone(original.scenarios);altered[2].listPrice=4000000;
  const separate=canonicalMomaScenarios(altered);
  assert.equal(separate.length,5);assert.ok(separate.some(row=>row.name==='输出 Token（输入长度 (0,128K]，思考）'&&row.listPrice===4000000));
  const sample={name:'自定义',unit:'百万 Token',currency:'CNY',listPrice:1,condition:'上下文自定义'};
  assert.equal(canonicalMomaScenarios([sample,{...sample,currency:'USD'},{...sample,unit:'张'},{...sample,listPrice:2},{...sample,condition:'另一条件'}]).length,5);
  const conflict = canonicalMomaScenarios([{ name: '输入 Token', unit: '百万 Token', currency: 'CNY', listPrice: 1, condition: '自营按量·移动云；输入tokens' }, { name: '输入 Token', unit: '百万 Token', currency: 'CNY', listPrice: 2, condition: '合作按量；输入' }]);
  assert.equal(conflict.length,2);assert.ok(conflict.every(row=>row.condition));
  assert.equal(JSON.stringify(original),before);
});

test('canonical price saves retain amounts and tier distinctions, and duplicate rows still fail validation', () => {
  const state=createAdminSeed(), provider=state.providers.find(item=>item.id===MOMA_PROVIDER.id), rows=MOMA_CATALOGUE_PRICES['Qwen3.5-35B-A3B'].scenarios;
  const draft={modelId:'Qwen3.5-35B-A3B',discountFactor:'0.8',scenarios:rows};
  const action={type:'modelOperations',operation:'provider',data:{operation:'cataloguePrice',objectId:provider.id,values:draft}};
  const saved=commitAdminState(state,action), stored=saved.providers.find(item=>item.id===provider.id).catalogPricing[0];
  assert.equal(stored.scenarios.length,4);assert.ok(stored.scenarios.every(row=>!row.condition));
  const canonical=cataloguePriceDraft(stored);
  assert.throws(()=>normalizeCataloguePrice({...canonical,scenarios:[canonical.scenarios[0],canonical.scenarios[0]]}),/不可重复/);
  assert.equal(state.providers.find(item=>item.id===provider.id).catalogPricing,undefined);
});
