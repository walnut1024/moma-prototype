import { withAdminSession } from './admin-session-fixture.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';
import { parseAdminState as baseParseAdminState, commitAdminState, persistModelAction, serializeAdminState } from '../src/admin-v2/store.js';
import { resolveOnboardingProvider, resolveOnboardingModel } from '../src/admin-v2/onboarding-presets.js';
import { providerApiKeysDraft } from '../src/admin-v2/provider-management.js';
import { channelDrafts, channelDraftIssue } from '../src/admin-v2/channel-onboarding.js';
import { supplierChannelAssociations } from '../src/admin-v2/supplier-resources.js';
import { serviceMetadataReady, serviceModelDraft } from '../src/admin-v2/model-profile.js';

const run = (state, operation, data) => commitAdminState(state, { type: 'modelOperations', operation, data });
const clean = () => { const state = parseAdminState(null); for (const key of ['providers', 'endpoints', 'models', 'modelTemplates', 'modelSupplies', 'supplyPrices', 'modelSalePrices', 'serviceRoutes', 'modelOnboardings']) state[key] = []; return state; };
const payload = extra => ({ newProvider: { name: '目录外独立服务商' }, values: { name: '独立接入', interfaceType: 'openai', baseUrl: 'https://custom.example.invalid/v1', keyGroupId: 'default', authMode: 'group', models: [{ newModel: { modelId: 'custom-model-v1', type: 'text' } }] }, ...extra });

test('custom identity previews stay read-only and never fabricate model capabilities or service metadata', () => {
  const state = clean(), before = structuredClone(state), data = payload();
  const provider = resolveOnboardingProvider(state, data), model = resolveOnboardingModel(state, data.values.models[0]);
  assert.equal(provider.name, data.newProvider.name); assert.equal(provider.code, undefined); assert.equal(provider.id, 'new-provider');
  assert.equal(model.record.name, 'custom-model-v1'); assert.equal(model.record.metadataStatus, '待完善'); assert.equal(model.record.id, 'new-model:custom-model-v1');
  assert.deepEqual(model.record.profile, { tasks: [], inputModalities: [], outputModalities: [], resultTypes: [] }); assert.ok(Object.values(model.record.capabilities).every(value => value === null));
  provider.name = 'local edit'; model.record.profile.tasks.push('local edit'); assert.deepEqual(state, before);
});

test('one save atomically registers a custom supplier, minimal canonical model, masked key and disabled channel with separate upstream identity', async () => {
  const state = clean(), before = structuredClone(state), secret = 'mock-custom-onboarding-key-value', newApiKey = (await providerApiKeysDraft([secret])).apiKeys[0];
  const next = run(state, 'channelQuickCreate', payload({ newApiKey })), endpoint = next.endpoints.find(row => row.id === next.audits[0].objectId), provider = next.providers.find(row => row.id === endpoint.providerId), master = next.modelTemplates[0];
  assert.match(provider.code, /^custom-[a-f0-9]{24}$/); assert.equal(master.modelId, 'custom-model-v1'); assert.equal(master.onboardingPresetId, undefined); assert.equal(master.metadataStatus, '待完善');
  assert.equal(provider.catalogModels[0].libraryId, master.id); assert.equal(provider.catalogConnections[0].upstreamModelId, master.modelId); assert.equal(provider.catalogConnections[0].enabled, false);
  assert.equal(endpoint.authMode, 'specific'); assert.equal(provider.apiKeys[0].id, endpoint.apiKeyId); assert.equal(endpoint.connectionTest, null); assert.equal(endpoint.status, '草稿');
  assert.equal(serviceMetadataReady(master), false); assert.equal(JSON.stringify(next).includes(secret), false); assert.deepEqual(state, before); assert.deepEqual(next.serviceRoutes, before.serviceRoutes);
  const restored = parseAdminState(serializeAdminState(next)); assert.deepEqual(restored.modelTemplates.find(row => row.id === master.id).profile, master.profile);
  const withAlias = run(clean(), 'channelQuickCreate', payload({ values: { ...payload().values, models: [{ newModel: { modelId: 'custom-model-v1', name: '自定义显示名称', type: 'text' }, upstreamModelId: 'Vendor/ACTUAL:V1' }] } }));
  assert.equal(withAlias.modelTemplates[0].name, '自定义显示名称'); assert.equal(withAlias.providers[0].catalogConnections[0].upstreamModelId, 'Vendor/ACTUAL:V1');
});

test('minimal custom material can be technically tested and enabled while incomplete service creation remains blocked', async t => {
  t.mock.method(globalThis, 'fetch', () => assert.fail('technical mock must not call a real upstream'));
  const newApiKey = (await providerApiKeysDraft(['mock-custom-technical-key-value'])).apiKeys[0];
  let state = run(clean(), 'channelQuickCreate', payload({ newApiKey }));
  const endpoint = state.endpoints[0], providerId = endpoint.providerId, providerRun = (operation, values) => run(state, 'provider', { operation, objectId: providerId, values });
  const association = () => supplierChannelAssociations(state, state.providers.find(row => row.id === providerId), endpoint.id)[0];
  state = providerRun('supplierModelsTest', { endpointId: endpoint.id, associationIds: [association().id] });
  assert.equal(association().enabled, false);
  state = providerRun('supplierModelsEnable', { endpointId: endpoint.id, associationIds: [association().id] }); assert.equal(association().enabled, true);
  const master = state.modelTemplates[0], before = structuredClone(state);
  assert.throws(() => run(state, 'createServiceModel', { ...serviceModelDraft(master), libraryId: master.id, serviceMode: 'standard' }));
  assert.deepEqual(state, before); assert.equal(state.models.length, 0); assert.deepEqual(master.profile.tasks, []); assert.equal(master.capabilities.tools, null);
});

test('custom forms survive unfinished draft round trips without materializing supplier, model or secret', () => {
  const state = clean(), saved = run(state, 'channelDraftSave', { value: { newProvider: { name: '' }, name: '目录外草稿', interfaceType: 'openai', baseUrl: 'https://unfinished.' }, rows: [{ id: 'custom-row', newModel: { modelId: '', type: 'text' }, upstreamModelId: '', scenarios: [] }] });
  const restored = parseAdminState(serializeAdminState(saved)), draft = channelDrafts(restored).find(row => row.value.name === '目录外草稿');
  assert.deepEqual(draft.value.newProvider, { name: '' }); assert.deepEqual(draft.rows[0].newModel, { modelId: '', type: 'text' }); assert.equal(channelDraftIssue(restored, draft), '');
  assert.equal(saved.providers.length, 0); assert.equal(saved.modelTemplates.length, 0); assert.equal(saved.endpoints.length, 0);
  const finished = run(saved, 'channelQuickCreate', payload({ draftId: draft.id, expectedDraftRevision: draft.draftRevision }));
  assert.equal(finished.modelOnboardings.find(row => row.id === draft.id).status, '已完成'); assert.equal(finished.modelTemplates.length, 1);
});

test('restoring incomplete identity text stays neutral while valid duplicate identities and broken references still report conflicts', () => {
  const state = clean(), value = { newProvider: { name: '未完成资料服务商' }, name: '未完成身份草稿', interfaceType: 'openai', baseUrl: 'https://unfinished.' };
  for (const modelId of ['', 'Upper Part', 'draft model ']) {
    const saved = run(state, 'channelDraftSave', { value, rows: [{ id: 'unfinished-model', newModel: { modelId, type: 'embedding' }, upstreamModelId: '', scenarios: [] }] }), draft = channelDrafts(saved)[0];
    assert.equal(channelDraftIssue(saved, draft), '');
    assert.throws(() => run(saved, 'channelQuickCreate', { newProvider: value.newProvider, values: { ...payload().values, models: [{ newModel: { modelId, type: 'embedding' } }] } }));
  }
  const registered = run(state, 'channelQuickCreate', payload()), provider = registered.providers[0], master = registered.modelTemplates[0];
  const duplicateProvider = { value: { ...value, newProvider: { name: provider.name } }, rows: [{ id: 'one', newModel: { modelId: '', type: 'text' } }] };
  assert.match(channelDraftIssue(registered, duplicateProvider), /服务商名称已存在/);
  const duplicateModel = { value: { providerId: provider.id }, rows: [{ id: 'one', newModel: { modelId: master.modelId, type: master.type } }] };
  assert.match(channelDraftIssue(registered, duplicateModel), /模型编码.*已存在/);
  assert.match(channelDraftIssue(registered, { value: { providerId: 'missing' }, rows: [] }), /服务商已不存在/);
  assert.match(channelDraftIssue(registered, { value: { providerId: provider.id }, rows: [{ libraryId: 'missing' }] }), /模型资料已不存在/);
});

test('custom identities reject conflicts, unsupported fields, malformed IDs and any later invalid row atomically', () => {
  const state = clean(), before = structuredClone(state), base = payload();
  const variants = [
    { ...base, providerPresetId: 'deepseek' },
    { ...base, newProvider: { name: 'name', sourceType: 'selfHosted' } },
    { ...base, newProvider: { name: 'bad\nname' } },
    { ...base, values: { ...base.values, models: [{ newModel: { modelId: 'Upper Case', type: 'text' } }] } },
    { ...base, values: { ...base.values, models: [{ newModel: { modelId: 'invalid-type', type: 'imaginary' } }] } },
    { ...base, values: { ...base.values, models: [{ newModel: { modelId: 'one', type: 'text', capabilities: { tools: true } } }] } },
    { ...base, values: { ...base.values, models: [{ newModel: { modelId: 'one', type: 'text' }, modelPresetId: 'model-2' }] } },
    { ...base, values: { ...base.values, models: [base.values.models[0], { newModel: { modelId: 'second', type: 'video' } }] } },
    { ...base, values: { ...base.values, models: [base.values.models[0], base.values.models[0]] } },
  ];
  for (const data of variants) { assert.throws(() => run(state, 'channelQuickCreate', data)); assert.deepEqual(state, before); }
  const registered = run(state, 'channelQuickCreate', base), existing = registered.providers[0], master = registered.modelTemplates[0];
  assert.throws(() => run(registered, 'channelQuickCreate', base), /服务商名称已存在/);
  assert.throws(() => run(registered, 'channelQuickCreate', { providerId: existing.id, values: base.values }), /模型编码.*已存在/);
  const reused = run(registered, 'channelQuickCreate', { providerId: existing.id, values: { ...base.values, name: '明确引用已有资料', models: [{ libraryId: master.id, upstreamModelId: 'actual/second' }] } });
  assert.equal(reused.modelTemplates.length, 1); assert.equal(reused.providers.length, 1);
});

test('custom draft rejects secret or unknown identity fields and custom save respects role, stale draft and storage failure', () => {
  const state = clean(), base = payload(), value = { newProvider: base.newProvider, name: 'safe draft', interfaceType: 'openai', baseUrl: base.values.baseUrl };
  for (const patch of [{ value: { ...value, newProvider: { name: 'safe', password: 'raw-secret' } } }, { rows: [{ id: 'one', newModel: { modelId: 'safe', type: 'text', token: 'raw-secret' } }] }, { rows: [{ id: 'one', newModel: { modelId: 'safe', type: 'text', profile: {} } }] }]) assert.throws(() => run(state, 'channelDraftSave', { value, rows: [{ id: 'one', newModel: base.values.models[0].newModel }], ...patch }));
  assert.throws(() => run({ ...state, currentRole: '运维人员' }, 'channelQuickCreate', base), /无权/);
  const draftState = run(state, 'channelDraftSave', { value, rows: [{ id: 'one', newModel: base.values.models[0].newModel }] }), draft = channelDrafts(draftState)[0];
  assert.throws(() => run(draftState, 'channelQuickCreate', { ...base, draftId: draft.id, expectedDraftRevision: draft.draftRevision + 1 }), /草稿已变化/);
  const action = { type: 'modelOperations', operation: 'channelQuickCreate', data: base }, raw = serializeAdminState(state);
  assert.throws(() => persistModelAction(state, action, { getItem: () => raw, setItem: () => { throw new Error('quota'); } }), /quota/); assert.equal(serializeAdminState(state), raw);
  let writes = 0; assert.throws(() => persistModelAction(state, action, { getItem: () => JSON.stringify({ ...state, revision: state.revision + 1 }), setItem: () => { writes++; } }), /数据已变化/); assert.equal(writes, 0);
});

test('appending a custom model atomically materializes only its metadata and mapping, preserves the existing channel and completes its matching draft', () => {
  const first = run(clean(), 'channelQuickCreate', payload()), endpoint = first.endpoints[0], providerId = endpoint.providerId, oldProvider = structuredClone(first.providers[0]), before = structuredClone(first);
  const data = { providerId, values: { endpointId: endpoint.id, models: [{ newModel: { modelId: 'appended-custom-v2', type: 'text' }, upstreamModelId: 'Vendor/Appended:V2' }] } };
  const value = { providerId, name: endpoint.name, interfaceType: endpoint.interfaceType, baseUrl: endpoint.baseUrl, authMode: 'group', keyGroupId: 'default' };
  const draftState = run(first, 'channelDraftSave', { endpointId: endpoint.id, value, rows: [{ id: 'append-row', newModel: data.values.models[0].newModel, upstreamModelId: 'Vendor/Appended:V2' }] }), draft = channelDrafts(draftState)[0];
  const next = run(draftState, 'channelQuickCreate', { ...data, draftId: draft.id, expectedDraftRevision: draft.draftRevision }), owner = next.providers.find(row => row.id === providerId);
  assert.equal(next.audits[0].objectId, endpoint.id); assert.deepEqual(next.endpoints, first.endpoints); assert.equal(next.providers.length, 1); assert.equal(next.modelTemplates.length, 2);
  assert.deepEqual(owner.catalogConnections.find(row => row.id === oldProvider.catalogConnections[0].id), oldProvider.catalogConnections[0]);
  const added = owner.catalogConnections.find(row => row.upstreamModelId === 'Vendor/Appended:V2'); assert.equal(added.enabled, false); assert.equal(next.modelOnboardings.find(row => row.id === draft.id).status, '已完成');
  const master = next.modelTemplates.find(row => row.modelId === 'appended-custom-v2'); assert.equal(owner.catalogModels.find(row => row.modelId === master.modelId).libraryId, master.id);
  assert.throws(() => run(first, 'channelQuickCreate', { ...data, values: { ...data.values, baseUrl: 'https://must-not-override.invalid/v1' } }), /不能同时修改/);
  assert.throws(() => run(first, 'channelQuickCreate', { ...data, providerId: 'foreign-provider' }), /渠道已变化/);
  assert.throws(() => run(first, 'channelQuickCreate', { ...data, newApiKey: {} }), /不能同时修改/);
  assert.throws(() => run(first, 'channelQuickCreate', { ...data, values: { ...data.values, models: [data.values.models[0], { newModel: { modelId: 'bad-second', type: 'video' } }] } })); assert.deepEqual(first, before);
  assert.throws(() => run(draftState, 'channelQuickCreate', { ...payload({ newProvider: undefined, providerId }), draftId: draft.id, expectedDraftRevision: draft.draftRevision }), /草稿已变化/);
});

function parseAdminState(...args) { return withAdminSession(baseParseAdminState(...args)); }
