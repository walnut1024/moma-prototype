import test from 'node:test';
import assert from 'node:assert/strict';
import { createAdminSeed, commitAdminState, persistModelAction, loadAdminState, STORAGE_KEY } from '../src/admin-v2/store.js';
import { withAdminSession } from './admin-session-fixture.mjs';
import { prepareServiceShowcase, SERVICE_SHOWCASE_MODELS } from '../src/admin-v2/service-showcase.js';
import { serviceConfiguration, serviceDirectoryModels, activeModelSalePrice, activeProviderPrice } from '../src/admin-v2/service-workspace.js';
import { routingServices, routingChannels, activeRouteVersion, serviceRoute } from '../src/admin-v2/service-routing.js';
import { platformCandidatePlan } from '../src/admin-v2/platform-service-client.js';
import { serviceGuideRequest } from '../src/admin-v2/service-guide.js';
import { libraryRecord } from '../src/admin-v2/model-library.js';
import { directorySnapshot, marketModels, customerPriceRows, beginExperience, validateExperience } from '../src/service-directory.mjs';
import { linkedAccountFixture } from '../src/linked-accounts.mjs';
import { emptyAuthState, loginAuthAccount } from '../src/auth-state.mjs';
import { AUTH_DATA_KEY } from '../src/service-access.mjs';
import { serviceGuideCode } from '../src/admin-v2/service-guide.js';
const action = { type: 'modelOperations', operation: 'prepareServiceShowcase', data: { confirmed: true } };

test('two newest requested examples have complete, identity-consistent prices and isolated routes', () => {
  const state = prepareServiceShowcase(createAdminSeed()), models = serviceDirectoryModels(state);
  assert.deepEqual(models.map(row => row.modelId), SERVICE_SHOWCASE_MODELS.map(row => row.code));
  for (const model of models) {
    assert.deepEqual(serviceConfiguration(state, model).issues.filter(check=>check.tab!=='platform'), []);
    assert.equal(model.listingStatus, '已下架', 'fixture preparation cannot claim platform publication');
    assert.equal(libraryRecord(state, model.id).name, model.name);
    const services = routingServices(state).filter(row => row.modelId === model.id);
    assert.equal(services.length, model.serviceMode === 'provider' ? 2 : 1);
    for (const service of services) {
      const channels = routingChannels(state, service), version = activeRouteVersion(serviceRoute(state, service.id));
      assert.ok(channels.every(row => row.available && row.upstreamModelId === model.modelId));
      assert.ok(channels.every(row => !service.providerId || row.providerId === service.providerId));
      assert.equal(channels.length, service.providerId ? service.providerId === 'provider-moma' ? 2 : 1 : 3);
      assert.equal(version.config.autoFailover, false);
      assert.equal(version.config.autoRecover, false);
      assert.equal(version.config.channels.reduce((sum, row) => sum + row.weight, 0), 100);
      const price = service.providerId ? activeProviderPrice(state, model.id, service.providerId) : activeModelSalePrice(state, model.id);
      assert.equal(price.items.length, 2);
      assert.equal(serviceGuideRequest(model, service.callId).body.model, service.callId);
      assert.doesNotThrow(() => platformCandidatePlan(state, model, { serviceId: service.id, tenantIds: [state.tenants[0].id], supplyIds: version.config.channels.filter(row=>row.enabled).map(row => row.supplyId) }));
    }
  }
});

test('explicit preparation preserves unrelated records and old histories; replay preserves edits', () => {
  const source = withAdminSession(createAdminSeed()), before = structuredClone(source);
  const next = commitAdminState(source, action);
  assert.deepEqual(source, before);
  const selected = new Set(serviceDirectoryModels(next).map(row => row.id));
  for (const row of before.models.filter(row => !selected.has(row.id))) assert.deepEqual(next.models.find(item => item.id === row.id), row);
  for (const key of ['requests', 'orders', 'modelSalePrices', 'audits']) for (const row of before[key]) assert.deepEqual(next[key].find(item => item.id === row.id), row);
  assert.ok(serviceDirectoryModels(next, null, 'all').length > 4);
  next.models.find(row => selected.has(row.id)).name = '手工编辑保留';
  assert.equal(prepareServiceShowcase(next), next);
});

test('new workspace starts with two cases; existing workspace changes only through explicit action', () => {
  const values = new Map(), storage = { getItem: key => values.get(key) || null, setItem: (key, value) => values.set(key, value) };
  assert.equal(serviceDirectoryModels(loadAdminState(storage)).length, 2);
  const raw = storage.getItem(STORAGE_KEY); loadAdminState(storage); assert.equal(storage.getItem(STORAGE_KEY), raw);
  const existing = withAdminSession(createAdminSeed()); values.set(STORAGE_KEY, JSON.stringify(existing));
  assert.equal(loadAdminState(storage).models.some(row => row.serviceShowcase), false);
});

test('older marked examples remain unchanged and accessible outside the two-model default', () => {
  const state = prepareServiceShowcase(createAdminSeed());
  const old = { ...structuredClone(serviceDirectoryModels(state)[0]), id: 'older-hy3', modelId: 'hy3', name: '保留旧样例' };
  state.models.push(old);
  state.modelData.builtinIds.models.push(old.id);
  const before = structuredClone(state);
  assert.deepEqual(serviceDirectoryModels(state).map(row => row.modelId), ['glm-5.3', 'deepseek-v4-flash-0731']);
  assert.ok(serviceDirectoryModels(state, null, 'all').some(row => row.id === old.id));
  assert.ok(serviceDirectoryModels(state, old.id).some(row => row.id === old.id));
  assert.equal(prepareServiceShowcase(state), state);
  assert.deepEqual(state, before);
});

test('fixture preparation guards unsaved drafts, authorization, conflicts and storage failure', () => {
  const state = withAdminSession(createAdminSeed()), model = state.models.find(row => row.modelId === 'glm-5.3');
  model.commercialDrafts = { scope: { id: 'keep-me' } };
  assert.throws(() => prepareServiceShowcase(state), /草稿/);
  delete model.commercialDrafts;
  assert.throws(() => commitAdminState(state, { ...action, data: {} }), /确认/);
  assert.throws(() => commitAdminState({ ...state, currentRole: '运维人员' }, action), /无权/);
  const before = structuredClone(state);
  assert.throws(() => persistModelAction(state, action, { getItem: () => JSON.stringify(state), setItem() { throw Error('quota'); } }), /quota/);
  assert.deepEqual(state, before);
  assert.throws(() => persistModelAction(state, action, { getItem: () => JSON.stringify({ ...state, revision: state.revision + 1 }), setItem() { assert.fail(); } }), /数据已变化/);
});

test('all two fixtures complete actual mock channel tests, trial, publication and listing without network', async t => {
  const { completeServiceShowcase } = await import('../src/admin-v2/service-showcase-client.js');
  const { setMockScenario, inspectMockPublication, getMockServiceSnapshots } = await import('../src/admin-v2/mock-onboarding-service.js');
  const values = new Map(), storage = { getItem: key => values.get(key) ?? null, setItem: (key, value) => values.set(key, value), removeItem: key => values.delete(key) };
  const descriptor = Object.getOwnPropertyDescriptor(globalThis, 'localStorage');
  Object.defineProperty(globalThis, 'localStorage', { configurable: true, value: storage });
  t.after(() => { if (descriptor) Object.defineProperty(globalThis, 'localStorage', descriptor); else delete globalThis.localStorage; });
  t.mock.method(globalThis, 'fetch', () => assert.fail('No real upstream request'));
  setMockScenario('success');
  const linked = linkedAccountFixture(prepareServiceShowcase(createAdminSeed()), emptyAuthState());
  let state = withAdminSession(linked.state); storage.setItem(STORAGE_KEY, JSON.stringify(state));
  storage.setItem(AUTH_DATA_KEY, JSON.stringify(loginAuthAccount(linked.auth, '13800002001', 'enterprise')));
  state = await completeServiceShowcase(state, (current, command) => persistModelAction(current, command, storage));
  assert.ok(serviceDirectoryModels(state).every(model => model.listingStatus === '已上架'));
  assert.equal(getMockServiceSnapshots().length, 3);
  assert.ok(getMockServiceSnapshots().every(service => inspectMockPublication(service.id).ready));
  const snapshot = directorySnapshot(storage), cards = marketModels(snapshot.models);
  assert.equal(cards.length, 2);
  assert.equal(cards.flatMap(row => row.services).length, 3);
  for (const card of cards) for (const offer of card.services) {
    assert.equal(offer.callable, true);
    assert.equal(validateExperience(beginExperience(offer.id, 'text')), true);
    const model = state.models.find(row => row.id === offer.modelKey), service = routingServices(state).find(row => row.id === offer.id);
    assert.equal(offer.name, model.name);
    assert.equal(offer.releaseDate, model.profile.releaseDate);
    assert.equal(offer.callId, service.callId);
    const price = service.providerId ? activeProviderPrice(state, model.id, service.providerId) : activeModelSalePrice(state, model.id);
    assert.deepEqual(customerPriceRows(offer.salePrices), price.items.map(item => ({ name: item.name, amount: item.amount / 1000000, currency: item.currency, unit: item.unit })));
    for (const language of ['cURL', 'Python', 'Java', 'Go']) assert.equal(serviceGuideCode(offer.guideRequest, language), serviceGuideCode(serviceGuideRequest(model, service.callId), language));
    assert.equal(/procurement|fingerprint|example.invalid|showcase-key/.test(JSON.stringify(offer)), false);
  }
  const beforePrices = directorySnapshot(storage).models.map(row => row.salePrices);
  state.models.filter(row => row.serviceShowcase).forEach(model => { model.commercialDrafts = { price: { amount: 999 } }; });
  storage.setItem(STORAGE_KEY, JSON.stringify(state));
  assert.deepEqual(directorySnapshot(storage).models.map(row => row.salePrices), beforePrices, 'unpublished prices do not leak to customers');
  const before = storage.getItem(STORAGE_KEY);
  await assert.rejects(completeServiceShowcase(state, () => assert.fail(), { isCurrent: () => false }), /配置或后台账号/);
  assert.equal(storage.getItem(STORAGE_KEY), before);
});
