import test from 'node:test';
import assert from 'node:assert/strict';
import { parseAdminState, commitAdminState, persistModelAction, serializeAdminState } from '../src/admin-v2/store.js';
import { ONBOARDING_PROVIDER_PRESETS, onboardingProviderPreset, resolveOnboardingProvider, onboardingModelOptions, onboardingModelPreset } from '../src/admin-v2/onboarding-presets.js';
import { providerApiKeysDraft } from '../src/admin-v2/provider-management.js';
import { providerKeyGroups } from '../src/admin-v2/provider-key-groups.js';
import { connectionKeys } from '../src/admin-v2/connection-state.js';
import { supplierDirectory } from '../src/admin-v2/moma-provider.js';
import { channelDrafts, channelDraftIssue } from '../src/admin-v2/channel-onboarding.js';
import { supplierChannelAssociations } from '../src/admin-v2/supplier-resources.js';

const run = (state, operation, data) => commitAdminState(state, { type: 'modelOperations', operation, data });
const clean = () => { const state = parseAdminState(null); for (const key of ['providers', 'endpoints', 'models', 'modelTemplates', 'modelSupplies', 'supplyPrices', 'modelSalePrices', 'serviceRoutes', 'modelOnboardings']) state[key] = []; return state; };
const values = (extra = {}) => ({ name: '快捷渠道', interfaceType: 'openai', baseUrl: 'https://quick.example.invalid/v1', authMode: 'group', keyGroupId: 'default', models: [{ modelPresetId: 'model-2', upstreamModelId: 'vendor/raw:model.v2', scenarios: [] }], ...extra });
const created = state => state.endpoints.find(row => row.id === state.audits[0].objectId);
const keyMetadata = async value => (await providerApiKeysDraft([value])).apiKeys[0];

test('supplier presets contain only reference identity and choosing references never registers resources', () => {
  const state = clean(), before = structuredClone(state);
  assert.ok(ONBOARDING_PROVIDER_PRESETS.some(row => row.id === 'moma'));
  for (const row of ONBOARDING_PROVIDER_PRESETS) assert.deepEqual(Object.keys(row).sort(), ['id', 'code', 'name', 'sourceType', 'interfaceType', 'defaultBaseUrl', 'catalogModelIds', 'catalogueSource', 'catalogueCheckedAt'].sort());
  const provider = resolveOnboardingProvider(state, { providerPresetId: 'deepseek' }); assert.equal(provider.isDraft, true); assert.equal(provider.id, 'preset:deepseek');
  const options = onboardingModelOptions(state); assert.ok(options.some(row => row.modelPresetId === 'model-2' && !row.libraryId && row.sourceCheckedAt));
  assert.ok(Object.isFrozen(ONBOARDING_PROVIDER_PRESETS[0].catalogModelIds));
  provider.name = 'not persisted'; options[0].profile.tasks.push('not persisted'); assert.deepEqual(state, before); assert.notEqual(onboardingProviderPreset('deepseek').name, provider.name);
});

test('one quick create atomically registers only explicit supplier, masked key, one metadata reference and unenabled mapping', async () => {
  const state = clean(), before = structuredClone(state), secret = 'temporary-quick-create-key-value', newApiKey = await keyMetadata(secret);
  const next = run(state, 'channelQuickCreate', { providerPresetId: 'deepseek', newApiKey, values: values({ timeoutSeconds: 123, capacity: 17 }) }), endpoint = created(next), provider = next.providers.find(row => row.id === endpoint.providerId), template = next.modelTemplates[0];
  assert.equal(next.providers.length, 1); assert.equal(next.endpoints.length, 1); assert.equal(next.modelTemplates.length, 1); assert.equal(next.models.length, 0);
  assert.equal(endpoint.timeoutSeconds, 123); assert.equal(endpoint.capacity, 17); assert.equal(provider.code, 'deepseek'); assert.equal(provider.onboardingPresetId, 'deepseek'); assert.equal(endpoint.authMode, 'specific'); assert.equal(endpoint.onboardingCreated, true); assert.equal(endpoint.activationChangedAt, undefined); assert.equal(endpoint.connectionTest, null); assert.equal(endpoint.status, '草稿');
  assert.equal(provider.apiKeys.length, 1); assert.equal(connectionKeys(endpoint, provider)[0].fingerprint, newApiKey.fingerprint); assert.deepEqual(provider.catalogModelIds, ['glm-5.2']);
  assert.equal(template.onboardingPresetId, 'model-2'); assert.equal(template.sourceCheckedAt, onboardingModelPreset('model-2').sourceCheckedAt); assert.equal(template.listingStatus, undefined); assert.equal(template.health, undefined);
  assert.equal(provider.catalogModels[0].libraryId, template.id); assert.equal(provider.catalogConnections[0].upstreamModelId, 'vendor/raw:model.v2'); assert.equal(provider.catalogConnections[0].enabled, false); assert.equal(provider.catalogConnections[0].activationChangedAt, undefined); assert.deepEqual(provider.catalogConnections[0].pricing.scenarios, []);
  assert.equal(JSON.stringify(next).includes(secret), false); assert.equal(JSON.stringify(next.audits).includes(secret), false); assert.deepEqual(state, before); assert.deepEqual(next.serviceRoutes, before.serviceRoutes);
});

test('existing supplier, existing key and canonical material reuse without extra supplier, key or metadata', () => {
  const state = parseAdminState(null), provider = state.providers.find(row => row.id === 'provider-moma'), group = providerKeyGroups(provider).find(row => row.id === 'default'), before = structuredClone(state);
  assert.ok(group.keyIds.length);
  const next = run(state, 'channelQuickCreate', { providerId: provider.id, values: values({ models: [{ modelPresetId: 'model-2', upstreamModelId: 'vendor/reused', scenarios: [] }] }) }), endpoint = created(next);
  assert.equal(next.providers.length, state.providers.length); assert.equal(next.modelTemplates.length, state.modelTemplates.length); assert.equal(next.models.length, state.models.length); assert.equal(next.providers.find(row => row.id === provider.id).apiKeys.length, provider.apiKeys.length); assert.equal(endpoint.authMode, 'group'); assert.equal(connectionKeys(endpoint, next.providers.find(row => row.id === provider.id))[0].id, group.keyIds[0]); assert.deepEqual(state, before);
});

test('an inline new key binds the new channel while preserving the old group primary and old endpoint credentials', async () => {
  const state = parseAdminState(null), provider = state.providers.find(row => row.id === 'provider-moma'), oldPrimary = providerKeyGroups(provider)[0].keyIds[0], oldEndpoints = structuredClone(state.endpoints), newApiKey = await keyMetadata('temporary-second-quick-key-value');
  const next = run(state, 'channelQuickCreate', { providerId: provider.id, newApiKey, values: values({ models: [{ libraryId: 'model-2', upstreamModelId: 'vendor/second' }] }) }), endpoint = created(next), updated = next.providers.find(row => row.id === provider.id);
  assert.equal(updated.apiKeys.length, provider.apiKeys.length + 1); assert.equal(providerKeyGroups(updated)[0].keyIds[0], oldPrimary); assert.equal(endpoint.authMode, 'specific'); assert.notEqual(endpoint.apiKeyId, oldPrimary); assert.equal(connectionKeys(endpoint, updated)[0].fingerprint, newApiKey.fingerprint); assert.deepEqual(next.endpoints.filter(row => row.id !== endpoint.id), oldEndpoints);
});

test('legacy raw IDs and similar names never override explicit supplier identity and duplicate codes refuse guessing', () => {
  const state = clean(); state.providers = [{ id: 'provider-cmss', name: '江苏移动旧供应商', code: 'js-old', sourceType: 'thirdParty', catalogModelIds: [], apiKeys: [] }];
  const old = structuredClone(state.providers[0]), next = run(state, 'channelQuickCreate', { providerPresetId: 'deepseek', values: values() }), endpoint = created(next);
  assert.notEqual(endpoint.providerId, old.id); assert.deepEqual(next.providers.find(row => row.id === old.id), old);
  const ambiguous = clean(); ambiguous.providers = [{ ...old, id: 'one', code: 'deepseek' }, { ...old, id: 'two', code: 'DEEPSEEK' }];
  assert.throws(() => resolveOnboardingProvider(ambiguous, { providerPresetId: 'deepseek' }), /多个同编码/); assert.equal(resolveOnboardingProvider(ambiguous, { providerId: 'two' }).id, 'two');
  assert.throws(() => resolveOnboardingProvider(state, { providerId: old.id, providerPresetId: 'deepseek' }), /不能同时/);
  const sameName = clean(); sameName.providers = [{ ...old, name: onboardingProviderPreset('deepseek').name }]; const before = structuredClone(sameName);
  assert.throws(() => run(sameName, 'channelQuickCreate', { providerPresetId: 'deepseek', values: values() }), /名称已存在/); assert.deepEqual(sameName, before);
});

test('explicitly adopting a hidden reference supplier makes only that entity visible and preserves historical keys and offers', () => {
  const state = parseAdminState(null), provider = state.providers.find(row => row.code === 'deepseek'), before = structuredClone(provider);
  assert.equal(supplierDirectory(state).some(row => row.id === provider.id), false);
  const next = run(state, 'channelQuickCreate', { providerPresetId: 'deepseek', values: values({ models: [{ libraryId: 'model-2', upstreamModelId: 'vendor/visible' }] }) });
  assert.equal(next.providers.length, state.providers.length); assert.ok(supplierDirectory(next).some(row => row.id === provider.id)); assert.equal(state.providers.find(row => row.id === provider.id).onboardingPresetId, undefined);
  const actual = next.providers.find(row => row.id === provider.id); assert.deepEqual(actual.apiKeys || [], before.apiKeys || []); assert.deepEqual(actual.catalogPricing, before.catalogPricing); assert.equal(actual.code, before.code);
});

test('pending provider and model references round trip in drafts without registering anything and commit finishes the same draft atomically', async () => {
  const state = clean(), value = { providerId: '', providerPresetId: 'baichuan', name: '预设草稿', interfaceType: 'openai', baseUrl: 'https://unfinished.', authMode: 'group', keyGroupId: 'default' }, rows = [{ id: 'pending', libraryId: '', modelPresetId: 'model-2', upstreamModelId: 'vendor/pending', scenarios: [], selected: true, source: 'reference', confirmed: true }];
  const saved = run(state, 'channelDraftSave', { value, rows, step: 1 }), restored = parseAdminState(serializeAdminState(saved)), draft = channelDrafts(restored)[0];
  assert.equal(draft.value.providerPresetId, 'baichuan'); assert.equal(draft.rows[0].modelPresetId, 'model-2'); assert.equal(channelDraftIssue(restored, draft), ''); assert.deepEqual(saved.providers, []); assert.deepEqual(saved.modelTemplates, []); assert.deepEqual(saved.endpoints, []);
  const payload = { providerPresetId: 'baichuan', newApiKey: await keyMetadata('temporary-pending-quick-key'), draftId: draft.id, expectedDraftRevision: draft.draftRevision, values: values() };
  assert.throws(() => run(restored, 'channelQuickCreate', { ...payload, expectedDraftRevision: draft.draftRevision + 1 }), /草稿已变化/);
  const next = run(restored, 'channelQuickCreate', payload); assert.equal(next.modelOnboardings[0].status, '已完成'); assert.equal(next.modelOnboardings[0].draftRevision, draft.draftRevision + 1); assert.equal(next.modelOnboardings[0].createdEndpointId, created(next).id); assert.equal(channelDrafts(restored).length, 1);
});

test('invalid later mappings, URL, key or material identity leave no supplier, key, material or audit behind', async () => {
  const state = clean(), before = structuredClone(state), newApiKey = await keyMetadata('temporary-rollback-quick-key');
  const variants = [
    { values: values({ baseUrl: 'https://user:password@quick.invalid/v1' }) },
    { values: values({ models: [{ modelPresetId: 'model-2', upstreamModelId: 'first' }, { modelPresetId: 'missing', upstreamModelId: 'second' }] }) },
    { values: values({ models: [{ modelPresetId: 'model-2', libraryId: 'model-2', upstreamModelId: 'first' }] }) },
    { values: values({ models: [{ modelPresetId: 'model-2', upstreamModelId: 'first' }, { modelPresetId: 'model-2', upstreamModelId: 'second' }] }) },
    { newApiKey: { ...newApiKey, secret: 'must-never-persist' } },
    { newApiKey: { maskedKey: 'not-a-mask', fingerprint: newApiKey.fingerprint } },
    { values: values({ authMode: 'none' }) },
    { values: values({ keyGroupId: 'foreign-group' }) },
  ];
  for (const patch of variants) { assert.throws(() => run(state, 'channelQuickCreate', { providerPresetId: 'deepseek', newApiKey, values: values(), ...patch })); assert.deepEqual(state, before); }
  const collision = parseAdminState(null); collision.models.find(row => row.id === 'model-2').type = 'embedding';
  assert.throws(() => run(collision, 'channelQuickCreate', { providerId: 'provider-moma', values: values() }), /类型冲突/);
});

test('quick create follows role, revision and storage failure boundaries without persisting a partial entity', async () => {
  const state = clean(), before = structuredClone(state), data = { providerPresetId: 'deepseek', newApiKey: await keyMetadata('temporary-storage-failure-key'), values: values() }, action = { type: 'modelOperations', operation: 'channelQuickCreate', data };
  assert.throws(() => commitAdminState({ ...state, currentRole: '运维人员' }, action), /无权/);
  let raw = serializeAdminState(state), writes = 0;
  assert.throws(() => persistModelAction(state, action, { getItem: () => raw, setItem: () => { writes++; throw new Error('quota'); } }), /quota/); assert.equal(writes, 1); assert.equal(raw, serializeAdminState(state)); assert.deepEqual(state, before);
  raw = JSON.stringify({ ...state, revision: state.revision + 1 }); writes = 0;
  assert.throws(() => persistModelAction(state, action, { getItem: () => raw, setItem: () => { writes++; } }), /数据已变化/); assert.equal(writes, 0); assert.deepEqual(state, before);
});

test('only actual enable and disable actions stamp activation history; creation and testing never do', () => {
  let state = run(clean(), 'channelQuickCreate', { providerPresetId: 'deepseek', values: values() });
  const endpointId = created(state).id, providerId = created(state).providerId;
  const provider = current => current.providers.find(row => row.id === providerId), endpoint = current => current.endpoints.find(row => row.id === endpointId), mapping = current => supplierChannelAssociations(current, provider(current), endpointId)[0];
  const providerRun = (current, operation, extra) => run(current, 'provider', { operation, objectId: providerId, values: extra });
  // This fixture explicitly uses a self-hosted unauthenticated endpoint to isolate activation from secret setup.
  provider(state).sourceType = 'selfHosted'; endpoint(state).authMode = 'none';
  assert.equal(endpoint(state).activationChangedAt, undefined); assert.equal(mapping(state).activationChangedAt, undefined);
  state = providerRun(state, 'supplierModelsTest', { endpointId, associationIds: [mapping(state).id] }); assert.equal(endpoint(state).activationChangedAt, undefined); assert.equal(mapping(state).activationChangedAt, undefined);
  state = providerRun(state, 'supplierModelsEnable', { endpointId, associationIds: [mapping(state).id] }); assert.ok(endpoint(state).activationChangedAt); assert.ok(mapping(state).activationChangedAt);
  state = providerRun(state, 'channelDisable', { modelId: mapping(state).modelId, channelId: mapping(state).id, confirmed: true }); assert.ok(mapping(state).activationChangedAt);
  state = run(state, 'provider', { operation: 'disableConnection', objectId: endpointId, values: { confirmed: true } }); assert.ok(endpoint(state).activationChangedAt); assert.equal(endpoint(state).status, '停用');
});

test('a pending preset draft reuses supplier and material registered by another quick create before its own commit', async () => {
  const state = clean(), originalAlias = 'vendor/original-draft', draftValue = { providerId: '', providerPresetId: 'baichuan', name: '先保存的预设草稿', interfaceType: 'openai', baseUrl: 'https://quick.example.invalid/v1', authMode: 'group', keyGroupId: 'default' };
  const saved = run(state, 'channelDraftSave', { value: draftValue, rows: [{ id: 'pending-model', libraryId: '', modelPresetId: 'model-2', upstreamModelId: originalAlias, scenarios: [], source: 'reference', confirmed: true }], step: 0 }), draft = channelDrafts(saved)[0];
  assert.equal(saved.providers.length, 0); assert.equal(saved.modelTemplates.length, 0);
  const registered = run(saved, 'channelQuickCreate', { providerPresetId: 'baichuan', newApiKey: await keyMetadata('temporary-other-registration-key'), values: values({ name: '期间新增的另一个渠道', models: [{ modelPresetId: 'model-2', upstreamModelId: 'vendor/other-registration' }] }) });
  const firstEndpoint = created(registered), supplierId = firstEndpoint.providerId, materialId = registered.modelTemplates[0].id, currentDraft = channelDrafts(registered).find(row => row.id === draft.id);
  assert.equal(channelDraftIssue(registered, currentDraft), '');
  const next = run(registered, 'channelQuickCreate', { providerPresetId: currentDraft.value.providerPresetId, draftId: currentDraft.id, expectedDraftRevision: currentDraft.draftRevision, values: { ...currentDraft.value, models: currentDraft.rows.map(({ modelPresetId, upstreamModelId, scenarios }) => ({ modelPresetId, upstreamModelId, scenarios })) } }), secondEndpoint = created(next), supplier = next.providers.find(row => row.id === supplierId);
  assert.equal(next.providers.length, 1); assert.equal(next.modelTemplates.length, 1); assert.equal(next.modelTemplates[0].id, materialId); assert.equal(supplier.apiKeys.length, 1); assert.equal(supplier.catalogModels[0].libraryId, materialId);
  assert.equal(next.endpoints.length, 2); assert.notEqual(secondEndpoint.id, firstEndpoint.id); assert.equal(secondEndpoint.providerId, supplierId);
  assert.deepEqual(supplierChannelAssociations(next, supplier, secondEndpoint.id).map(row => row.upstreamModelId), [originalAlias]); assert.deepEqual(next.endpoints.find(row => row.id === firstEndpoint.id), firstEndpoint);
  const completed = next.modelOnboardings.find(row => row.id === draft.id); assert.equal(completed.status, '已完成'); assert.equal(completed.draftRevision, draft.draftRevision + 1); assert.equal(completed.createdEndpointId, secondEndpoint.id); assert.equal(currentDraft.status, '配置中');
});
