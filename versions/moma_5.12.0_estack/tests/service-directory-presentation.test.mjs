import test from 'node:test';
import assert from 'node:assert/strict';
import { directorySnapshot, marketModels, customerPriceRows } from '../src/service-directory.mjs';
import { ADMIN_DATA_KEY } from '../src/service-access.mjs';

function fixture(t, patch = {}) {
  const model = {
    id: 'presentation-model', modelId: 'public-model', name: '已发布名称', description: '卡片短介绍', type: 'text',
    serviceMode: 'standard', listingStatus: '已上架', visibility: '公开', callsEnabled: true, openScope: 'all',
    capabilities: { context: 131072, output: 8192, streaming: false, tools: true },
    profile: { author: '模型作者', logo: 'https://example.invalid/model.png', detailDescription: '详情第一段\n详情第二段',
      family: '模型系列', version: 'v2', releaseDate: '2026-04-24', lifecycle: 'stable', tasks: ['对话'],
      inputModalities: ['文本'], outputModalities: ['文本'], resultTypes: ['结构化数据'], scenarios: ['办公'],
      languages: ['中文', '英文'], documentation: 'https://example.invalid/docs', reasoning: 'unsupported',
      structured: 'supported', parameters: 284, activeParameters: 13, architecture: 'MoE', license: 'MIT',
      inputFormats: 'TXT', supportedParameters: ['temperature'], parameterRules: '按已公布限制使用',
      maxInput: 65536, sourceStatus: 'pending', privateNote: 'internal-only' },
    apiKey: 'must-not-project', procurementPrice: 'must-not-project', ...patch,
  };
  const state = { models: [model], modelTemplates: [], modelSupplies: [], endpoints: [], tenants: [], providers: [{ id: 'moma', name: '移动云 MoMA' }, { id: 'original', name: '原厂' }] };
  const rows = new Map([[ADMIN_DATA_KEY, JSON.stringify(state)]]);
  const storage = { getItem: key => rows.get(key) ?? null, setItem: (key, value) => rows.set(key, value), removeItem: key => rows.delete(key) };
  const descriptor = Object.getOwnPropertyDescriptor(globalThis, 'localStorage');
  Object.defineProperty(globalThis, 'localStorage', { configurable: true, value: storage });
  t.after(() => { if (descriptor) Object.defineProperty(globalThis, 'localStorage', descriptor); else delete globalThis.localStorage; });
  t.mock.method(globalThis, 'fetch', () => assert.fail('presentation must not fetch upstream data'));
  return { model, state, storage, snapshot: () => directorySnapshot(storage) };
}

test('card and detail project one effective model, keep draft text private and expose no supply internals', t => {
  const env = fixture(t);
  env.model.materialDraft = { values: { name: '未发布草稿名称', profile: { detailDescription: '未发布的长介绍' } } };
  env.storage.setItem(ADMIN_DATA_KEY, JSON.stringify(env.state));
  const [row] = env.snapshot().models;
  assert.equal(row.name, '已发布名称');
  assert.equal(row.modelId, 'public-model');
  assert.equal(row.typeLabel, '语言模型');
  assert.equal(row.desc, '卡片短介绍');
  assert.equal(row.detailDescription, '详情第一段\n详情第二段');
  assert.equal(row.logo, 'https://example.invalid/model.png');
  assert.equal(row.releaseDate, '2026-04-24');
  assert.deepEqual(row.outputModalities, ['文本', '结构化数据']);
  const facts = row.detailSections.flatMap(section => section.facts);
  assert.equal(facts.find(item => item.label === '模型架构').value, 'MoE（混合专家）');
  assert.equal(facts.find(item => item.label === '流式响应').value, '暂无');
  assert.equal(facts.find(item => item.label === '工具调用').value, '支持');
  assert.equal(facts.find(item => item.label === '总参数').value, '284 B');
  assert.equal(facts.find(item => item.label === '支持语言').value, '中文、英文');
  assert.equal(new Set(facts.map(item => item.label)).size, facts.length);
  assert.equal(/must-not-project|internal-only|未发布|procurementPrice|apiKey|sourceStatus/.test(JSON.stringify(row)), false);
  assert.equal(row.callable, false, 'displaying metadata does not bypass service access');
});

test('unknown metadata stays absent and unsafe stored logos are not rendered', t => {
  const env = fixture(t, { type: 'image', capabilities: {}, profile: { logo: 'javascript:alert(1)', tasks: [], architecture: 'unknown' } });
  const [row] = env.snapshot().models;
  assert.equal(row.logo, '');
  assert.equal(row.typeLabel, '视觉生成');
  assert.equal(row.releaseDate, '');
  assert.equal(row.detailDescription, '');
  assert.deepEqual(row.detailSections, []);
  assert.equal(row.context, '未填写');
});

test('provider services reuse the same presentation while preserving distinct service identities', t => {
  const env = fixture(t, { serviceMode: 'provider', serviceProviders: [{ providerId: 'moma', callId: 'moma/model' }, { providerId: 'original', callId: 'original/model' }] });
  const rows = env.snapshot().models;
  assert.equal(rows.length, 2);
  assert.deepEqual(rows.map(row => row.provider), ['移动云 MoMA', '原厂']);
  assert.notEqual(rows[0].id, rows[1].id);
  assert.notEqual(rows[0].callId, rows[1].callId);
  assert.deepEqual(rows[0].detailSections, rows[1].detailSections);
  assert.equal(marketModels(rows).length, 1);
  assert.deepEqual(marketModels(rows)[0].providers, ['移动云 MoMA', '原厂']);
  assert.deepEqual(rows.map(row => row.guideRequest.body.model), ['moma/model', 'original/model']);
  env.model.listingStatus = '已下架';
  env.storage.setItem(ADMIN_DATA_KEY, JSON.stringify(env.state));
  assert.deepEqual(env.snapshot().models, []);
});

test('market groups stable identities, scopes examples without deleting historical offers, and does not merge equal names', () => {
  const rows = [{ modelKey: 'a', id: 'a1', name: '同名', showcase: true, provider: '甲', callable: false }, { modelKey: 'a', id: 'a2', name: '同名', showcase: true, provider: '乙', callable: true }, { modelKey: 'b', id: 'b1', name: '同名', defaultCatalogue: false, provider: '甲', callable: true }];
  assert.equal(marketModels(rows).length, 1);
  assert.equal(marketModels(rows)[0].callable, true);
  assert.equal(marketModels(rows, 'all').length, 2);
  assert.equal(rows.length, 3);
  assert.deepEqual(marketModels([]), []);
});

test('customer prices preserve free and missing distinctions and exclude future or expired versions', () => {
  const base = { amount: 3000000, currency: 'CNY', unit: 'million_input_tokens', effectiveAt: '2026-01-01' }, at = Date.parse('2026-11-02');
  assert.deepEqual(customerPriceRows([base, { ...base, amount: 0, unit: 'million_output_tokens' }, { ...base, amount: null }, { ...base, expiresAt: '2026-10-01' }, { ...base, effectiveAt: '2027-01-01' }], at), [{ name: '输入 Token', amount: 3, currency: 'CNY', unit: '百万 Token' }, { name: '输出 Token', amount: 0, currency: 'CNY', unit: '百万 Token' }]);
});

test('default gallery limits existing marked examples to the two requested modes without deleting old services', t => {
  const env = fixture(t, { modelId: 'deepseek-v4-flash-0731', serviceShowcase: 'service-showcase-20261102' });
  env.state.models.push({ ...structuredClone(env.model), id: 'old-kimi', modelId: 'kimi-k2.7-code' });
  env.state.modelData={builtinIds:{models:['old-kimi']},activeIds:{models:[env.model.id]},userIds:{}};
  env.storage.setItem(ADMIN_DATA_KEY, JSON.stringify(env.state));
  const rows = env.snapshot().models;
  assert.equal(rows.length, 2);
  assert.deepEqual(marketModels(rows).map(row => row.modelId), ['deepseek-v4-flash-0731']);
  assert.equal(marketModels(rows, 'all').length, 2);
  assert.equal(rows[0].mode, 'standard');
  assert.equal(rows[0].provider, '平台统一服务');
});

test('hidden provider and unified models stay in the service directory but never appear in either gallery scope', t => {
  const env=fixture(t,{marketVisible:false,serviceMode:'provider',serviceProviders:[{providerId:'moma',callId:'moma/model'},{providerId:'original',callId:'original/model'}]});
  const rows=env.snapshot().models;assert.equal(rows.length,2);assert(rows.every(row=>row.marketVisible===false));
  assert.deepEqual(marketModels(rows),[]);assert.deepEqual(marketModels(rows,'all'),[]);
  env.model.serviceMode='standard';env.storage.setItem(ADMIN_DATA_KEY,JSON.stringify(env.state));
  assert.equal(env.snapshot().models.length,1);assert.deepEqual(marketModels(env.snapshot().models,'all'),[]);
});

test('downlisted suppliers disappear from front choices while other providers remain and source records survive',t=>{
 const env=fixture(t,{serviceMode:'provider',serviceProviders:[{providerId:'moma',callId:'moma/model',marketVisible:false},{providerId:'original',callId:'original/model'}]});
 assert.deepEqual(env.snapshot().models.map(row=>row.provider),['原厂']);
 assert.equal(env.model.serviceProviders.length,2);
 env.model.serviceProviders[0].marketVisible=true;env.storage.setItem(ADMIN_DATA_KEY,JSON.stringify(env.state));
 assert.equal(env.snapshot().models.length,2);
});
