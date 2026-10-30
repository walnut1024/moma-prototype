import assert from 'node:assert/strict';
import test from 'node:test';
import { createAdminSeed, parseAdminState } from '../src/admin-v2/store.js';
import { MOMA_PROVIDER, DEFAULT_SUPPLIERS, supplierDirectory } from '../src/admin-v2/moma-provider.js';
const directoryNames = ['月之暗面 Kimi', 'DeepSeek 官方', '火山方舟', '中国移动 MoMA', '智谱'];

test('supplier directory includes MoMA, Zhipu and DeepSeek with their registered catalogues', () => {
  const state = createAdminSeed();
  const provider = supplierDirectory(state).find(item => item.id === MOMA_PROVIDER.id);
  assert.deepEqual(supplierDirectory(state).map(item => item.name), directoryNames);
  const snapshot = structuredClone(state);
  const zhipu = supplierDirectory(state).find(item => item.id === 'provider-zhipu-direct'), deepseek = state.providers.find(item => item.id === 'provider-deepseek-direct');
  assert.equal(zhipu, state.providers.find(item => item.id === 'provider-zhipu-direct'));
  assert.equal(deepseek, state.providers.find(item => item.id === 'provider-deepseek-direct'));
  assert.deepEqual(zhipu.catalogModelIds, ['glm-5.3']);
  assert.deepEqual(deepseek.catalogModelIds, ['deepseek-flash', 'deepseek-v4-pro']);
  for (const supplier of [zhipu, deepseek]) {
    const connection = state.endpoints.find(item => item.providerId === supplier.id);
    assert.equal(connection.status, '停用');
    assert.equal(connection.credentialRef, '');
    assert.equal(connection.connectionTest, null);
    assert.ok(!state.modelSupplies.some(item => item.endpointId === connection.id));
    assert.equal(state.providers.filter(item => item.code === supplier.code).length, 1);
  }
  assert.deepEqual(state, snapshot);
  assert.equal(provider.code, 'moma');
  assert.equal(provider.baseUrl, 'https://moma.cmecloud.cn/v1');
  assert.equal(provider.catalogModelIds.length, 3);
  assert.equal(new Set(provider.catalogModelIds).size, 3);
  assert.ok(provider.catalogModelIds.includes('Kimi/miKimi-K3'));
  assert.equal(state.providers.find(item => item.id === provider.id).catalogModelIds.length, 91);
  const endpoint = state.endpoints.find(item => item.providerId === provider.id);
  assert.equal(endpoint.baseUrl, provider.baseUrl);
  assert.equal(endpoint.status, '停用');
  assert.equal(endpoint.credentialRef, '');
  assert.equal(endpoint.connectionTest, null);
  assert.ok(!state.modelSupplies.some(item => item.endpointId === endpoint.id));
  assert.ok(!state.supplyPrices.some(item => item.providerId === provider.id));
});

test('saved data gains independent default suppliers without replacing renamed historical records', () => {
  const saved = createAdminSeed();
  const ids = new Set(DEFAULT_SUPPLIERS.map(item => item.id));
  saved.providers = saved.providers.filter(item => !ids.has(item.id));
  saved.endpoints = saved.endpoints.filter(item => !ids.has(item.providerId));
  saved.providers[0].name = '已编辑的原供应商';
  const raw = JSON.stringify(saved);
  const restored = parseAdminState(raw);
  assert.deepEqual(supplierDirectory(restored).map(item => item.name), directoryNames);
  for (const key of ['providers', 'endpoints']) {
    for (const item of saved[key]) assert.deepEqual(restored[key].find(record => record.id === item.id), item);
  }
  for (const key of ['modelSupplies', 'supplyPrices', 'modelSalePrices']) assert.deepEqual(restored[key], saved[key]);
  assert.equal(JSON.stringify(saved), raw);
});

test('supplier edits and newly registered suppliers survive reload without duplicate MoMA records', () => {
  const saved = createAdminSeed();
  const provider = saved.providers.find(item => item.id === MOMA_PROVIDER.id);
  provider.contact = '客户经理';
  provider.catalogModelIds = ['ZHIPU/GLM-5.3'];
  const zhipu = saved.providers.find(item => item.id === 'provider-zhipu-direct');
  zhipu.contact = '智谱客户经理';
  zhipu.status = '已停用';
  zhipu.catalogModelIds.push('custom-glm');
  saved.providers.push({ id: 'provider-custom', name: '新增供应商', code: 'custom' });
  const restored = parseAdminState(JSON.stringify(saved));
  for (const id of DEFAULT_SUPPLIERS.map(item => item.id)) assert.equal(restored.providers.filter(item => item.id === id).length, 1);
  assert.deepEqual(restored.providers.find(item => item.id === MOMA_PROVIDER.id), provider);
  assert.deepEqual(supplierDirectory(restored).find(item => item.id === zhipu.id), zhipu);
  assert.deepEqual(supplierDirectory(restored).map(item => item.name), [...directoryNames, '新增供应商']);
});
