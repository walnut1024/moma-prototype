import test from 'node:test';
import assert from 'node:assert/strict';
import { platformAllowedChannels, platformCandidatePlan, platformFeeDisplay, platformPriceVersions, platformServices, publishPlatformCandidate, runPlatformTrial } from '../src/admin-v2/platform-service-client.js';
import { onboardingApi, prepareServerChannel } from '../src/admin-v2/onboarding-client.js';
import { platformPublicationFingerprint } from '../src/admin-v2/platform-publication-state.js';
import { setMockScenario } from '../src/admin-v2/mock-onboarding-service.js';

const at = Date.parse('2026-10-31T04:00:00Z'), effectiveAt = '2026-10-30T00:00:00Z';
const tokenItems = (input = 1000000, output = 0) => [{ name: '输入 Token', unit: '百万 Token', currency: 'CNY', amount: input }, { name: '输出 Token', unit: '百万 Token', currency: 'CNY', amount: output }];
const price = (items = tokenItems(), extra = {}) => ({ id: 'sale-v1', effectiveAt, items, ...extra });
function fixture() {
  const model = { id: 'canonical-chat', name: 'Chat', modelId: 'moma/chat', type: 'text', serviceMode: 'standard', openScope:'all',tenantIds:[], capabilities: { streaming: false, tools: false } };
  const endpoint = { id: 'endpoint-1', name: 'Primary', providerId: 'provider-1', baseUrl: 'https://example.test/v1', interfaceType: 'openai', authMode: 'none', status: '运行中' };
  const association = { id: 'association-1', modelId: 'supplier-catalogue-id', endpointId: endpoint.id, upstreamModelId: 'vendor/raw-chat', enabled: true, procurementVersions: [{ id: 'cost-v1', version: 1, status: '已发布', effectiveAt, publishedAt: effectiveAt, expiresAt: null, pricing: { discountFactor: 1000000, scenarios: tokenItems(500000, 0).map(({ amount, ...item }) => ({ ...item, listPrice: amount })) } }] };
  const provider = { id: endpoint.providerId, name: 'Supplier', status: '已启用', catalogModels: [{ modelId: association.modelId, libraryId: model.id }], catalogConnections: [association] };
  const supply = { id: 'supply-1', modelId: model.id, endpointId: endpoint.id, catalogueModelId: association.modelId, upstreamModelId: association.upstreamModelId, status: '已启用' };
  const config = { strategy: 'weighted', channels: [{ supplyId: supply.id, enabled: true, priority: 1, weight: 20, groupId: 'P1' }], groups: [{ id: 'P1', strategy: 'weighted' }], autoFailover: true };
  const state = { models: [model], modelTemplates: [], endpoints: [endpoint], providers: [provider], modelSupplies: [supply], supplyPrices: [], modelSalePrices: [price(tokenItems(), { modelId: model.id, scope: 'model', version: 1, status: '已发布' })], tenants: [{ id: 'tenant-explicit', name: 'Tenant', status: '正常' }], serviceRoutes: [{ serviceId: `standard:${model.id}`, activeVersion: 2, versions: [{ version: 2, config }] }] };
  const selection = { serviceId: `standard:${model.id}`, tenantIds: ['tenant-explicit'], supplyIds: [supply.id], at };
  return { state, model, endpoint, association, provider, supply, config, selection, plan: () => platformCandidatePlan(state, model, selection) };
}

test('price conversion preserves zero, micro currency, version and explicit validity', () => {
  const rows = platformPriceVersions(price(), { type: 'text' }, '销售价格', at);
  assert.deepEqual(rows.map(row => [row.unit, row.amount]), [['million_input_tokens', 1000000], ['million_output_tokens', 0]]);
  assert.equal(rows[0].id, 'sale-v1:million_input_tokens'); assert.equal(rows[0].effectiveAt, effectiveAt); assert.equal(rows[0].currency, 'CNY');
  assert.equal(platformPriceVersions(price([{ name: '重排请求数', unit: '千次', currency: 'USD', amount: 1200000 }]), { type: 'rerank' }, '采购价格', at)[0].amount, 1200);
  assert.equal(platformPriceVersions(price([{ name: '音频输入时长', unit: '分钟', currency: 'CNY', amount: 600000 }]), { type: 'audio' }, '采购价格', at)[0].amount, 10000);
});

test('fee presentation accepts only explicit integer micro-currency and preserves known zero', () => {
  assert.equal(platformFeeDisplay({ amount: 1000000, currency: 'CNY', unit: 'micro' }), 'CNY 1.00');
  assert.equal(platformFeeDisplay({ amount: 0, currency: 'USD', unit: 'micro' }), 'USD 0.00');
  for (const value of [null, {}, { amount: null, currency: 'CNY', unit: 'micro' }, { amount: 1, currency: 'CNY', unit: 'yuan' }, { amount: 1.5, currency: 'CNY', unit: 'micro' }]) assert.equal(platformFeeDisplay(value), '费用未知');
});

test('unknown, conditional, incompatible or inexact prices block instead of becoming free or rounded', () => {
  for (const [override, message] of [[{ amount: null }, /免费须明确填写 0/], [{ currency: undefined }, /明确币种/], [{ condition: '仅缓存命中' }, /条件报价/], [{ name: '缓存读取 Token' }, /计量规则/], [{ unit: '张' }, /计量规则/]]) {
    assert.throws(() => platformPriceVersions(price([{ ...tokenItems()[0], ...override }]), { type: 'text' }, '销售价格', at), message);
  }
  assert.throws(() => platformPriceVersions(price([{ name: '音频输入时长', unit: '分钟', currency: 'CNY', amount: 1 }]), { type: 'audio' }, '采购价格', at), /不能舍入/);
  assert.throws(() => platformPriceVersions(price(tokenItems(), { effectiveAt: undefined }), { type: 'text' }, '销售价格', at), /生效时间/);
  assert.throws(() => platformPriceVersions(price(tokenItems(), { expiresAt: '2026-10-31T03:59:59Z' }), { type: 'text' }, '销售价格', at), /已到期/);
});

test('candidate uses canonical and upstream IDs separately and only explicit published allowed bindings', () => {
  const env = fixture(), before = structuredClone(env.state), plan = env.plan();
  assert.equal(plan.candidate.bindings[0].id, env.supply.id);
  assert.equal(plan.candidate.bindings[0].model.id, env.model.id);
  assert.equal(plan.candidate.bindings[0].model.upstreamModelId, env.association.upstreamModelId);
  assert.equal(plan.candidate.bindings[0].procurementPrices[0].id, 'cost-v1:million_input_tokens');
  assert.deepEqual(plan.candidate.route.channels, [{ bindingId: env.supply.id, priority: 1, weight: 20 }]);
  assert.equal(plan.candidate.route.strategy, 'weighted'); assert.deepEqual(plan.candidate.tenantIds, ['tenant-explicit']);
  assert.deepEqual(env.state, before);
  env.config.channels.push({ supplyId: 'not-allowed', enabled: false, priority: 0, weight: 100 });
  assert.deepEqual(platformAllowedChannels(env.state, platformServices(env.state, env.model)[0]).map(row => row.id), [env.supply.id]);
  env.selection.supplyIds = ['not-allowed']; assert.throws(env.plan, /未发布或已移除/);
});

test('missing tenant authorization, mismatched master and incomparable quote do not produce a candidate', () => {
  let env = fixture(); env.selection.tenantIds = []; assert.throws(env.plan, /客户范围/);
  env = fixture(); env.provider.catalogModels[0].libraryId = 'missing'; assert.throws(env.plan, /主档关联/);
  env = fixture(); env.state.modelSalePrices[0].items[0].currency = 'USD'; env.state.modelSalePrices[0].items[1].currency = 'USD'; assert.throws(env.plan, /不可比/);
  env = fixture(); env.association.procurementVersions.push({ ...env.association.procurementVersions[0], id: 'cost-expired-latest', version: 2, effectiveAt: '2026-10-31T00:00:00Z', expiresAt: '2026-10-31T01:00:00Z' }); assert.throws(env.plan, /先发布价格/);
});

test('explicit supply references and shared template copies resolve the same canonical identity as upstream tests', () => {
  const legacy = fixture(); delete legacy.provider.catalogModels[0].libraryId;
  assert.equal(legacy.plan().candidate.bindings[0].model.id, legacy.model.id);
  const env = fixture(); env.model.templateId = 'template-reference';
  const canonical = { ...env.model, id: 'canonical-template-model' };
  env.state.models.unshift(canonical); env.state.modelTemplates.push({ ...canonical, id: 'template-reference' }); env.provider.catalogModels[0].libraryId = 'template-reference';
  assert.equal(env.plan().candidate.bindings[0].model.id, 'template-reference');
  delete env.model.templateId;
  assert.throws(env.plan, /主档关联与当前服务模型不一致/);
});

test('priority groups preserve explicit group order while unsupported strategies are rejected', () => {
  const env = fixture(); env.config.strategy = 'priority_weighted'; env.config.groups = [{ id: 'P2', strategy: 'weighted' }, { id: 'P1', strategy: 'weighted' }];
  assert.equal(env.plan().candidate.route.channels[0].priority, 1);
  env.config.groups[1].strategy = 'cost'; assert.throws(env.plan, /组内策略/);
  env.config.strategy = 'random'; assert.throws(env.plan, /调度策略/);
});

test('fixed and priority preserve enabled membership even when the irrelevant local weight is zero', () => {
  const env = fixture(); env.config.strategy = 'priority'; env.config.channels[0].weight = 0;
  assert.equal(platformAllowedChannels(env.state, platformServices(env.state, env.model)[0]).length, 1);
  assert.deepEqual(env.plan().candidate.route.channels, [{ bindingId: env.supply.id, priority: 1 }]);
  env.config.strategy = 'fixed'; assert.equal(env.plan().candidate.route.strategy, 'fixed');
  env.config.strategy = 'weighted'; assert.throws(env.plan, /权重无效/);
});

test('candidate fingerprint changes with price, credentials or allowed scope', () => {
  const env = fixture(), original = env.plan().fingerprint;
  env.state.modelSalePrices[0].items[0].amount++; assert.notEqual(env.plan().fingerprint, original);
  env.state.modelSalePrices[0].items[0].amount--; env.endpoint.baseUrl += '/changed'; assert.notEqual(env.plan().fingerprint, original);
  env.endpoint.baseUrl = 'https://example.test/v1'; assert.equal(env.plan().fingerprint, original);
  env.endpoint.adapterOptions = { tokenLimitField: 'max_tokens' }; assert.notEqual(env.plan().fingerprint, original);
});

test('audio candidate requires explicit probe matching the recorded upstream task', () => {
  const env = fixture(); env.model.type = 'audio'; env.model.profile = { tasks: ['语音合成', '语音识别'] };
  assert.throws(env.plan, /明确选择语音合成或语音识别/);
  env.selection.audioProbe = 'speech'; const speech = env.plan(); assert.equal(speech.candidate.bindings[0].model.probe, 'speech');
  env.selection.audioProbe = 'transcription'; const transcription = env.plan(); assert.equal(transcription.candidate.bindings[0].model.probe, 'transcription'); assert.notEqual(speech.fingerprint, transcription.fingerprint);
  env.model.profile.tasks = ['语音合成']; assert.throws(env.plan, /所选任务与模型资料不一致/);
});

test('trial orchestration uses actual server channel refs, memory-only limited identity and never client keys', async () => {
  const env = fixture(), calls = [], plan = env.plan();
  const service = { id: 'server-service', revision: 3, candidateVersion: 2, candidate: {} };
  const api = async (route, options) => {
    calls.push([route, options]);
    if (route === '/services' && !options) return { services: [] };
    if (route === '/services') return service;
    if (route.endsWith('/test-identities')) return { token: 'memory-limited-token' };
    if (route.endsWith('/trial')) return { billingReady: true, candidateVersion: 2, actualSupply: { channelId: 'server-channel' } };
    assert.fail(`Unexpected route ${route}`);
  };
  const result = await runPlatformTrial(plan, { api, prepareChannel: async () => ({ id: 'server-channel' }) });
  const candidate = calls.find(([route, options]) => route === '/services' && options)[1].body;
  assert.equal(candidate.bindings[0].channelId, 'server-channel'); assert.equal('localEndpointId' in candidate.bindings[0], false);
  assert.equal(calls.at(-1)[1].body.trialToken, 'memory-limited-token');
  assert.equal(JSON.stringify(result).includes('memory-limited-token'), false); assert.equal(JSON.stringify(plan).includes('memory-limited-token'), false);
  assert.equal(calls.some(([route]) => route.includes('client-keys') || route.includes('client/completions')), false);
});

test('changed source aborts before paid trial and publish sends expected server revision', async () => {
  const env = fixture(); let current = true, trialCalls = 0;
  const service = { id: 'server-service', revision: 7, candidateVersion: 1 };
  const api = async (route, options) => {
    if (route === '/services' && !options) return { services: [] };
    if (route === '/services') return service;
    if (route.endsWith('/test-identities')) { current = false; return { token: 'limited' }; }
    trialCalls++; return {};
  };
  await assert.rejects(runPlatformTrial(env.plan(), { api, prepareChannel: async () => ({ id: 'channel' }), isCurrent: () => current }), /配置已经变化/);
  assert.equal(trialCalls, 0);
  await publishPlatformCandidate(service, async (route, options) => { assert.equal(route, '/services/server-service/publish'); assert.equal(options.body.expectedRevision, 7); return service; });
});

test('default mock client completes upstream proof, platform trial and explicit publication without network or local listing', async t => {
  t.mock.timers.enable({ apis: ['Date'], now: at });
  t.mock.method(globalThis, 'fetch', () => { assert.fail('The approved mock workflow must not send network requests'); });
  setMockScenario('success');
  const env = fixture(), before = structuredClone(env.state);
  const channel = await prepareServerChannel(env.provider, env.endpoint);
  const batch = await onboardingApi('/tests', { method: 'POST', body: { operationId: crypto.randomUUID(), channelId: channel.id, models: [{ id: env.model.id, upstreamModelId: env.association.upstreamModelId, type: env.model.type }] } });
  t.mock.timers.tick(2000);
  const proof = await onboardingApi(`/tests/${batch.id}`); assert.equal(proof.items[0].status, 'passed');
  const receipt = await runPlatformTrial(env.plan());
  assert.equal(receipt.result.source, 'mock'); assert.equal(receipt.result.billingReady, true); assert.equal(receipt.result.customerDebited, false);
  assert.equal(receipt.result.actualSupply.channelId, channel.id); assert.equal(receipt.service.published, null);
  const published = await publishPlatformCandidate(receipt.service);
  assert.equal(published.published.config.bindings[0].model.id, env.model.id); assert.equal(published.published.source, 'mock');
  assert.deepEqual(env.state, before);
});

test('standard services retain their existing public model ID without adding a provider namespace', async () => {
  const env = fixture(); env.model.modelId = 'chat-without-provider';
  const candidate = env.plan().candidate;
  assert.equal(candidate.publicModelId, 'chat-without-provider');
  const channel = await prepareServerChannel(env.provider, env.endpoint);
  candidate.bindings[0].channelId = channel.id;
  const saved = await onboardingApi('/services', { method: 'POST', body: { ...candidate, operationId: crypto.randomUUID() } });
  assert.equal(saved.candidate.publicModelId, env.model.modelId);
});


test('technical candidates preserve missing costs and omit sales without weakening configuration checks', () => {
  const env=fixture();env.model.purpose='internal';env.state.modelSalePrices=[];env.association.procurementVersions=[];delete env.association.pricing;
  const plan=platformCandidatePlan(env.state,env.model,{...env.selection,technical:true});
  assert.equal(plan.candidate.technical,true);assert.equal(plan.candidate.purpose,'internal');
  assert.deepEqual(plan.candidate.salePrices,[]);assert.deepEqual(plan.candidate.bindings[0].procurementPrices,[]);
  assert.throws(env.plan,/价格/);
  env.endpoint.status='停用';assert.throws(()=>platformCandidatePlan(env.state,env.model,{...env.selection,technical:true}),/未启用/);
});

test('cost and sale changes preserve technical evidence while connections and routing still invalidate it',()=>{
  const env=fixture(),signature=()=>platformPublicationFingerprint(env.state,env.model,env.selection.serviceId);
  const before=signature();env.state.modelSalePrices[0].items[0].amount++;env.association.procurementVersions[0].pricing.scenarios[0].listPrice++;
  assert.equal(signature(),before);env.endpoint.baseUrl+='/changed';assert.notEqual(signature(),before);
});
