import { canonicalMomaScenarios } from '../src/admin-v2/moma-billing-items.js';
import assert from 'node:assert/strict';
import test from 'node:test';
import { MOMA_PROVIDER, providerCatalogueIds, supplierDirectory } from '../src/admin-v2/moma-provider.js';
import { MOMA_CATALOGUE_PRICES, providerCataloguePrice, isPayAsYouGoPrice, isMomaCataloguePrice } from '../src/admin-v2/moma-catalogue-prices.js';
import { createAdminSeed, commitAdminState, parseAdminState } from '../src/admin-v2/store.js';
import { cataloguePriceDraft, cataloguePurchasePrice, normalizeCataloguePrice } from '../src/admin-v2/provider-catalogue-pricing.js';
import { tariffDictionarySeed } from '../src/admin-v2/tariff-dictionary.js';

const scenarios = id => normalizeCataloguePrice({ modelId: id, discountFactor: '', scenarios: MOMA_CATALOGUE_PRICES[id].scenarios }).scenarios;
const find = (id, name, condition) => scenarios(id).find(row => row.name === name && (!condition || row.condition?.includes(condition)));
const catalogueAction = values => ({ type: 'modelOperations', operation: 'provider', data: { operation: 'cataloguePrice', objectId: MOMA_PROVIDER.id, values } });

test('workbook and retained official offers have canonical billable items and yuan prices', () => {
  const dict = tariffDictionarySeed();
  assert.equal(Object.keys(MOMA_CATALOGUE_PRICES).length, 91);
  assert.equal(Object.values(MOMA_CATALOGUE_PRICES).filter(entry => entry.scenarios.length).length, 90);
  let count = 0;
  for (const id of Object.keys(MOMA_CATALOGUE_PRICES)) {
    assert.ok(MOMA_PROVIDER.catalogModelIds.includes(id));
    const entry = providerCataloguePrice(MOMA_PROVIDER, id);
    assert.equal(entry.discountFactor, 1000000);
    for (const row of entry.scenarios) {
      assert.ok(dict.some(item => item.kind === 'scenario' && item.name === row.name));
      assert.ok(dict.some(unit => unit.kind === 'unit' && unit.name === row.unit));
      assert.ok(isMomaCataloguePrice(row));
      assert.doesNotMatch(row.condition || '', /资源包|抵扣|TPM|点\//);
      assert.equal(row.currency, 'CNY');
      assert.ok(Number.isSafeInteger(row.listPrice) && row.listPrice >= 0);
      assert.equal(cataloguePurchasePrice(row.listPrice, entry.discountFactor), row.listPrice);
      count++;
    }
    assert.deepEqual(normalizeCataloguePrice({ ...cataloguePriceDraft(entry), modelId: id }), entry);
  }
  assert.equal(count, 304);
  for (const id of ['DeepSeek-R1-0528', 'DeepSeek-V3-0324', 'DeepSeek-V4.1-Flash', 'Qwen3.5-397B-A17B', 'Qwen2.5-14B-Instruct-1M', 'Qwen2.5-72B-Instruct-64K', 'BGE-Base-ZH-V1.5', 'qwen3.8-max', 'qwen3.7-plus', 'qwen3-omni-flash', 'qwen3.5-omni-plus-realtime', 'qwen3-livetranslate-flash-realtime', 'qwen-audio-3.0-asr-flash-streaming', 'fun-asr-realtime', 'qwen-image-2.0-pro', 'happyhorse-1.1-t2v', 'AICC-Doubao-Seedance-2.0', 'Kimi/miKimi-K3']) assert.ok(scenarios(id).length, id);
});

test('source-specific rates, units, tiers and night prices cannot collapse into one model price', () => {
  assert.equal(find('DeepSeek-V4-Flash-0731', '输入 Token').listPrice, 1000000);
  const night = find('DeepSeek-V4-Flash-0731', '输入 Token（夜间）');
  assert.equal(night.listPrice, 500000);
  assert.ok(!night.condition);
  assert.equal(scenarios('DeepSeek-V4-Flash-0731').length, 4);
  assert.equal(find('SenseVoice', '音频输入时长（按秒）').unit, '秒');
  assert.equal(find('SenseVoice', '音频输入时长（按秒）').listPrice, 700);
  assert.equal(find('qwen-audio-3.0-asr-flash', '音频输入时长（按秒）').listPrice, 220);
  assert.equal(find('qwen3.8-max', '缓存读取 Token', '输入（缓存命中）').listPrice, 1500000);
  assert.equal(find('qwen3.8-max', '缓存读取 Token', '显式缓存命中').listPrice, 1000000);
  assert.equal(find('qwen3.8-max', '缓存写入 Token', '显式缓存创建').listPrice, 15000000);
  assert.equal(find('qwen3.5-omni-plus-realtime', '音频输入 Token').listPrice, 53000000);
  assert.equal(find('qwen3.5-omni-plus-realtime', '输出 Token（文本及音频）').listPrice, 213000000);
  assert.equal(find('AICC-Doubao-Seedance-2.0', 'Token 用量（含视频输入，480p/720p）').listPrice, 56000000);
});

test('partner GLM, Kimi and video models follow workbook boundaries and quantities', () => {
  assert.equal(find('ZHIPU/GLM-5.1', '输入 Token（输入长度 (0,32K]）').listPrice, 6000000);
  assert.equal(find('ZHIPU/GLM-5.1', '缓存读取 Token（输入长度 (0,32K]）').listPrice, 1300000);
  assert.equal(find('ZHIPU/GLM-5.1', '输出 Token（输入长度 (32K,200K]）').listPrice, 28000000);
  assert.equal(find('kimi/kimi-k2.6', '输入 Token').listPrice, 6500000);
  assert.equal(find('kimi/kimi-k2.6', '缓存读取 Token').listPrice, 1100000);
  assert.equal(find('Kimi/miKimi-K3', '输出 Token').listPrice, 100000000);
  assert.deepEqual(scenarios('kimi/kimi‑k3'), []);
  assert.match(MOMA_CATALOGUE_PRICES['kimi/kimi‑k3'].note, /待核对/);
  assert.equal(find('minimax/minimax-h3-max', '视频输出时长（480P）').listPrice, 330000);
  assert.equal(find('minimax/MiniMax-H3', '图像输入（按张）').listPrice, 200000);
  assert.equal(scenarios('minimax/MiniMax-H3').length, 5);
  assert.equal(find('zhipu/glm-5.3-flash', '输入 Token').listPrice, 800000);
});

test('full catalogue reading preserves stored subsets, custom models and explicit user prices without rewriting state', () => {
  const state = createAdminSeed(), provider = state.providers.find(item => item.id === MOMA_PROVIDER.id);
  provider.catalogModelIds = ['ZHIPU/GLM-5.1', 'custom/model'];
  provider.catalogPricing = [{ modelId: 'ZHIPU/GLM-5.1', discountFactor: 0, scenarios: [{ name: '用户旧报价', unit: '张', currency: 'USD', listPrice: 0 }] }];
  const before = JSON.stringify(state);
  assert.equal(providerCatalogueIds(provider).length, 92);
  assert.equal(supplierDirectory(state)[0].catalogModelIds.length, 92);
  assert.deepEqual(providerCataloguePrice(provider, 'ZHIPU/GLM-5.1'), provider.catalogPricing[0]);
  assert.equal(providerCataloguePrice(provider, 'qwen-image-2.0-pro').scenarios[0].listPrice, 500000);
  assert.equal(providerCataloguePrice({ ...provider, id: 'provider-custom' }, 'qwen-image-2.0-pro'), undefined);
  for (const id of ['constructor', 'toString']) assert.deepEqual(providerCataloguePrice({ ...provider, catalogModelIds: ['constructor', 'toString'] }, id), { modelId: id, discountFactor: 1000000, scenarios: [] });
  assert.equal(JSON.stringify(state), before);
  assert.deepEqual(parseAdminState(before).providers.find(item => item.id === provider.id), provider);
});

test('new official models save through normal operations with role, revision and storage protections intact', () => {
  const state = createAdminSeed(), provider = state.providers.find(item => item.id === MOMA_PROVIDER.id);
  provider.catalogModelIds = ['ZHIPU/GLM-5.1'];
  const entry = providerCataloguePrice(provider, 'qwen-image-2.0-pro');
  const action = { type: 'modelOperations', operation: 'provider', data: { operation: 'catalogueDiscount', objectId: provider.id, values: { modelId: entry.modelId, discountFactor: '0.8' } } };
  const saved = commitAdminState(state, action), configured = saved.providers.find(item => item.id === provider.id);
  assert.equal(cataloguePurchasePrice(providerCataloguePrice(configured, entry.modelId).scenarios[0].listPrice, 800000), 400000);
  assert.deepEqual(configured.catalogModelIds, provider.catalogModelIds);
  for (const name of ['supplyPrices', 'modelSalePrices', 'endpoints', 'apiKeys', 'tariffDictionary']) assert.deepEqual(saved[name], state[name]);
  assert.throws(() => commitAdminState({ ...state, currentRole: '运维人员' }, action), /无权/);
});


test('MoMA saved quotes and subsequent edits only expose pay-as-you-go items without rewriting stored records', () => {
  const state = createAdminSeed(), provider = state.providers.find(item => item.id === MOMA_PROVIDER.id);
  const payg = { name: '输入 Token', unit: '百万 Token', currency: 'CNY', listPrice: 4000000, condition: '自营按量·移动云；输入tokens' };
  const excluded = [
    { ...payg, condition: '资源包抵扣；输入tokens；4000 点/百万tokens' },
    { ...payg, condition: '机密模型资源包抵扣；含视频输入；480p' },
    { ...payg, name: '资源包', unit: '包', condition: '机密模型资源包；700万 Tokens' },
    { ...payg, name: '输入 TPM 预留', unit: '千 TPM·月', condition: 'TPM预留；输入tokens' },
  ];
  provider.catalogPricing = [{ modelId: 'DeepSeek-R1', discountFactor: 800000, scenarios: [payg, ...excluded] }];
  const before = JSON.stringify(state);
  assert.deepEqual(providerCataloguePrice(provider, 'DeepSeek-R1').scenarios, canonicalMomaScenarios([payg]));
  assert.equal(providerCataloguePrice(provider, 'DeepSeek-R1').discountFactor, 800000);
  assert.equal(JSON.stringify(state), before);
  assert.deepEqual(providerCataloguePrice({ ...provider, id: 'custom-provider', catalogModelIds: ['DeepSeek-R1'] }, 'DeepSeek-R1').scenarios, [payg, ...excluded]);
  for (const row of excluded) {
    const value = cataloguePriceDraft({ modelId: 'DeepSeek-R1', scenarios: [row], discountFactor: null });
    assert.throws(() => commitAdminState(state, catalogueAction({ ...value, modelId: 'DeepSeek-R1' })), /仅支持按量计费/);
  }
  provider.catalogPricing[0].scenarios = excluded;
  assert.deepEqual(providerCataloguePrice(provider, 'DeepSeek-R1').scenarios, []);
  assert.ok(isPayAsYouGoPrice({ ...payg, condition: '不使用资源包，按量计费' }));
});


test('regional supplies never merge into the main-site model, while independent suppliers keep their own prices', () => {
  const state = createAdminSeed(), provider = state.providers.find(item => item.id === MOMA_PROVIDER.id);
  const row = { name: '输入 Token', unit: '百万 Token', currency: 'CNY', listPrice: 2000000, condition: '自营按量·移动云；输入tokens' };
  const regions = ['北京移动', '内蒙古移动', '上海移动', '安徽移动', '江西移动', '河南移动', '甘肃移动'].map(region => ({ ...row, condition: '自营按量·' + region + '；输入tokens' }));
  provider.catalogModelIds.push('DeepSeek-V4-Flash', 'Qwen3.5-35B');
  provider.catalogPricing = [{ modelId: 'DeepSeek-V4-Flash-0731', discountFactor: 800000, scenarios: [row, ...regions] }];
  const before = JSON.stringify(state);
  assert.deepEqual(providerCataloguePrice(provider, 'DeepSeek-V4-Flash-0731').scenarios, canonicalMomaScenarios([row]));
  assert.equal(providerCataloguePrice(provider, 'DeepSeek-V4-Flash-0731').discountFactor, 800000);
  assert.ok(providerCatalogueIds(provider).includes('DeepSeek-V4-Flash'));
  assert.equal(providerCataloguePrice(provider, 'DeepSeek-V4-Flash').scenarios.length, 4);
  for (const id of ['Qwen3.5-35B']) {
    assert.ok(!providerCatalogueIds(provider).includes(id));
    assert.ok(!Object.hasOwn(MOMA_CATALOGUE_PRICES, id));
    assert.equal(providerCataloguePrice(provider, id), undefined);
  }
  for (const regional of regions) {
    assert.ok(isPayAsYouGoPrice(regional));
    assert.ok(!isMomaCataloguePrice(regional));
    assert.throws(() => commitAdminState(state, catalogueAction({ ...cataloguePriceDraft({ scenarios: [regional], discountFactor: null }), modelId: 'DeepSeek-V4-Flash-0731' })), /省市节点/);
  }
  const independent = { ...provider, id: 'provider-anhui', code: 'anhui', catalogModelIds: ['DeepSeek-V4-Flash-0731', 'DeepSeek-V4-Flash'], catalogPricing: [{ ...provider.catalogPricing[0], scenarios: regions }] };
  state.providers.push(independent);
  const saved = commitAdminState(state, { type: 'modelOperations', operation: 'provider', data: { operation: 'cataloguePrice', objectId: independent.id, values: { modelId: 'DeepSeek-V4-Flash-0731', ...cataloguePriceDraft(independent.catalogPricing[0]) } } });
  assert.deepEqual(providerCataloguePrice(saved.providers.find(p => p.id === independent.id), 'DeepSeek-V4-Flash-0731').scenarios, regions);
  assert.deepEqual(providerCataloguePrice(saved.providers.find(p => p.id === provider.id), 'DeepSeek-V4-Flash-0731').scenarios, canonicalMomaScenarios([row]));
  state.providers.pop();
  assert.equal(JSON.stringify(state), before);
  assert.deepEqual(parseAdminState(before).providers.find(p => p.id === provider.id), provider);
});
