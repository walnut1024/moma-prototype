import test from 'node:test';
import assert from 'node:assert/strict';
import { mockOnboardingApi as api, getMockScenario, setMockScenario, SCENARIOS, setMockRuntimeState as rawSetMockRuntimeState, prepareMockConfiguration, commitMockConfiguration, getMockServiceSnapshots, inspectMockPublication } from '../src/admin-v2/mock-onboarding-service.js';

function fixture(t) {
  setMockRuntimeState(null);
  let clock = Date.now(), sequence = 0, fetchCalls = 0; const stored = new Map();
  t.mock.method(Date, 'now', () => clock);
  t.mock.method(globalThis, 'fetch', () => { fetchCalls++; throw new Error('mock must not send fetch'); });
  const previous = Object.getOwnPropertyDescriptor(globalThis, 'localStorage');
  Object.defineProperty(globalThis, 'localStorage', { configurable: true, value: { getItem: key => stored.get(key) ?? null, setItem: (key, value) => stored.set(key, value), removeItem: key => stored.delete(key) } });
  t.after(() => previous ? Object.defineProperty(globalThis, 'localStorage', previous) : delete globalThis.localStorage);
  const op = () => `operation-${++sequence}`, post = (route, body) => api(route, { method: 'POST', body: { operationId: op(), ...body } });
  const channel = (name, credentialId = 'opaque-key', extra = {}) => post('/channels', { providerId: 'supplier', clientChannelId: name, name, baseUrl: 'https://gateway.mock.invalid/v1', interfaceType: 'openai', authMode: 'key', credentialId, ...extra });
  const model = { id: 'model-main', associationId: 'association', upstreamModelId: 'vendor/chat', type: 'text' };
  const prove = async (ch, options = {}) => { const batch = await post('/tests', { channelId: ch.id, models: [{ ...model, ...options }] }); clock += 1000; return api(`/tests/${batch.id}`); };
  const price = (id, extra = {}) => ({ id, amount: 1000000, unit: 'request', currency: 'CNY', effectiveAt: new Date(clock - 60000).toISOString(), ...extra });
  const service = (ch, extra = {}) => post('/services', { publicModelId: `moma/mock-${sequence}`, mode: 'standard', tenantIds: ['tenant-a'], bindings: [{ id: 'binding', channelId: ch.id, model, procurementPrices: [price('cost')] }], salePrices: [price('sale')], route: { version: 1, strategy: 'fixed', channels: [{ bindingId: 'binding', priority: 1, weight: 1 }] }, ...extra });
  const trial = async current => { const identity = await post(`/services/${current.id}/test-identities`, { expectedRevision: current.revision }); return post(`/services/${current.id}/trial`, { trialToken: identity.token }); };
  const publish = async current => {
    await trial(current); const published = await post(`/services/${current.id}/publish`, { expectedRevision: current.revision });
    const local = JSON.parse(stored.get('moma.adminV2.5120.v1') || '{"models":[],"tenants":[],"providers":[],"endpoints":[]}');
    const config = published.published.config;
    const record = { id: current.id, modelId: config.publicModelId, serviceMode: 'standard', listingStatus: '已上架', visibility: '公开', callsEnabled: true, openScope: 'all', platformPublications: [{ serviceId: `standard:${current.id}`, mockServiceId: current.id, source: 'mock' }] };
    local.models = [...local.models.filter(row => row.id !== record.id), record];
    for (const id of [...config.tenantIds, 'tenant-a', 'tenant-b']) if (!local.tenants.some(row => row.id === id)) local.tenants.push({ id, status: '正常' });
    const mock = JSON.parse(stored.get('moma-5120-model-onboarding-mock-v1'));
    for (const channel of mock.channels) {
      if (!local.providers.some(row => row.id === channel.providerId)) local.providers.push({ id: channel.providerId, status: '已启用', catalogModels: [{ modelId: 'mapped-model', libraryId: model.id }], catalogConnections: [] });
      if (!local.endpoints.some(row => row.id === channel.clientChannelId)) {
        local.endpoints.push({ id: channel.clientChannelId, providerId: channel.providerId, status: '运行中' });
        local.providers.find(row => row.id === channel.providerId).catalogConnections.push({ id: model.associationId, modelId: 'mapped-model', endpointId: channel.clientChannelId, upstreamModelId: model.upstreamModelId, enabled: true });
      }
    }
    stored.set('moma.adminV2.5120.v1', JSON.stringify(local)); return published;
  };
  return { op, post, channel, model, prove, price, service, trial, publish, stored, advance: ms => { clock += ms; }, clock: () => clock, fetchCalls: () => fetchCalls };
}

test('mock credentials and normal requests never fetch or persist raw secrets', async t => {
  const env = fixture(t), secret = 'temporary-not-a-production-secret-12345';
  const key = await env.post('/credentials', { providerId: 'supplier', name: 'Key', secret });
  assert.equal(key.source, 'mock'); assert.equal('secret' in key, false); assert.equal([...env.stored.values()].join('').includes(secret), false);
  const ch = await env.channel('channel', key.id); await env.prove(ch); const current = await env.service(ch); await env.publish(current);
  const client = await env.post('/client-keys', { tenantId: 'tenant-a', serviceIds: [current.id] });
  const response = await api('/client/completions', { method: 'POST', token: client.clientKey, body: { operationId: env.op(), model: current.candidate.publicModelId, messages: [{ role: 'user', content: 'customer text remains visible' }] } });
  assert.equal(JSON.parse(env.stored.get('moma-5120-model-onboarding-mock-v1')).usage.find(row=>row.identityType==='client').billingStatus,'billable');
  assert.match(response.choices[0].message.content, /customer text remains visible/); assert.equal(response.source, 'mock'); assert.equal('cost' in response, false); assert.equal('actualSupply' in response, false); assert.equal(env.fetchCalls(), 0); assert.equal([...env.stored.values()].join('').includes(client.clientKey), false);
});

test('scenario is frozen at submission, two models run at once and high cost remains explicit', async t => {
  const env = fixture(t), ch = await env.channel('channel'); setMockScenario('success');
  const models = Array.from({ length: 5 }, (_, index) => ({ ...env.model, id: `model-${index}`, associationId: `mapping-${index}`, upstreamModelId: `upstream-${index}` }));
  const batch = await env.post('/tests', { channelId: ch.id, models }); setMockScenario('auth');
  let current = await api(`/tests/${batch.id}`); assert.equal(current.items.filter(item => item.status === 'running').length, 2); assert.equal(current.items.filter(item => item.status === 'queued').length, 3);
  env.advance(4000); current = await api(`/tests/${batch.id}`); assert.ok(current.items.every(item => item.status === 'passed' && item.evidenceSource === 'mock')); assert.equal(current.source, 'mock'); assert.ok(current.items.every(item => item.cost === null)); assert.equal(getMockScenario(), 'auth');
  await assert.rejects(env.post('/tests', { channelId: ch.id, models: [{ ...env.model, type: 'video' }] }), issue => issue.code === 'cost_confirmation_required');
});

test('cancel and reopening preserve one task; operation lookup does not create or restart it', async t => {
  const env = fixture(t), ch = await env.channel('channel'), request = { operationId: env.op(), channelId: ch.id, models: Array.from({ length: 4 }, (_, i) => ({ ...env.model, id: `m${i}`, upstreamModelId: `u${i}` })) };
  const first = await api('/tests', { method: 'POST', body: request }); env.advance(100); await env.post(`/tests/${first.id}/cancel`, {}); env.advance(1000);
  const reopened = await api(`/tests?operationId=${request.operationId}`); assert.equal(reopened.id, first.id); assert.equal(reopened.status, 'cancelled'); assert.equal(reopened.items.filter(item => item.status === 'cancelled').length, 2); assert.equal(reopened.items.filter(item => item.status === 'unknown').length, 2);
  const repeated = await api('/tests', { method: 'POST', body: request }); assert.equal(repeated.id, first.id);
  await assert.rejects(api('/tests?operationId=never-submitted'), issue => issue.code === 'submission_not_found');
  await assert.rejects(api('/tests', { method: 'POST', body: { ...request, models: [{ ...env.model, upstreamModelId: 'different' }] } }), issue => issue.code === 'idempotency_conflict');
});

test('failure scenes produce distinct status, code and unknown costs, including async terminal failure', async t => {
  const env = fixture(t), ch = await env.channel('channel');
  for (const [scenario, code] of [['auth', 'upstream_unauthorized'], ['forbidden', 'upstream_forbidden'], ['ratelimit', 'upstream_rate_limited'], ['protocol', 'invalid_response'], ['balance', 'insufficient_balance'], ['timeout', 'request_timeout']]) { setMockScenario(scenario); const result = await env.prove(ch); assert.equal(result.items[0].code, code); assert.equal(result.items[0].status, scenario === 'timeout' ? 'unknown' : 'failed'); assert.equal(result.items[0].cost, null); }
  setMockScenario('asyncfail'); const video = await env.post('/tests', { channelId: ch.id, models: [{ ...env.model, type: 'video' }], confirmExpensive: true }); env.advance(1000); assert.equal((await api(`/tests/${video.id}`)).items[0].status, 'running'); env.advance(4000); assert.equal((await api(`/tests/${video.id}`)).items[0].code, 'async_task_failed');
  setMockScenario('empty'); assert.deepEqual((await env.post('/discover', { channelId: ch.id })).models, []); assert.ok(SCENARIOS.some(([id]) => id === 'partial'));
});

test('new failures and old evidence cannot be replaced by earlier success during publication', async t => {
  const env = fixture(t), ch = await env.channel('channel'); await env.prove(ch); const current = await env.service(ch); await env.trial(current);
  setMockScenario('auth'); await env.prove(ch); await assert.rejects(env.post(`/services/${current.id}/publish`, { expectedRevision: current.revision }), issue => issue.code === 'validation_required');
  setMockScenario('success'); await env.prove(ch); env.advance(25 * 3600000); await assert.rejects(env.trial(current), issue => issue.code === 'validation_required');
});

test('trial customers and published price versions do not restrict otherwise eligible clients', async t => {
  const env = fixture(t), ch = await env.channel('channel'); await env.prove(ch); const current = await env.service(ch), key = await env.post('/client-keys', { tenantId: 'tenant-a', serviceIds: [current.id] });
  const request = () => api('/client/completions', { method: 'POST', token: key.clientKey, body: { operationId: env.op(), model: current.candidate.publicModelId, messages: [{ role: 'user', content: 'hello' }] } });
  await assert.rejects(request(), issue => issue.code === 'model_unavailable'); const published = await env.publish(current); const pending = request();
  const next = await api(`/services/${current.id}`, { method: 'PATCH', body: { operationId: env.op(), expectedRevision: published.revision, bindings: [{ ...published.candidate.bindings[0], procurementPrices: [env.price('new-cost', { amount: 3000000 })] }] } }); await env.publish(next);
  const priorResponse = await pending; const usage = await api('/usage'); assert.equal(usage.usage.find(row => row.id === priorResponse.id).cost.priceVersion, 'cost'); await request(); assert.equal((await api('/usage')).usage.at(-1).cost.priceVersion, 'new-cost'); assert.ok(usage.usage.every(row => row.customerDebited === false));
  const other = await env.post('/client-keys', { tenantId: 'tenant-b', serviceIds: [current.id] }); await api('/client/completions', { method: 'POST', token: other.clientKey, body: { operationId: env.op(), model: current.candidate.publicModelId, messages: [] } });
});

test('latest expired quote cannot resurrect an old unlimited quote and future quote does not start early', async t => {
  const env = fixture(t), ch = await env.channel('channel'); await env.prove(ch);
  const baseline = env.price('old', { effectiveAt: new Date(env.clock() - 3600000).toISOString() }), expired = env.price('expired', { effectiveAt: new Date(env.clock() - 1200000).toISOString(), expiresAt: new Date(env.clock() - 600000).toISOString() });
  const current = await env.service(ch, { bindings: [{ id: 'binding', channelId: ch.id, model: env.model, procurementPrices: [baseline, expired] }] }); await assert.rejects(env.trial(current), issue => issue.code === 'procurement_price_required');
  const updated = await api(`/services/${current.id}`, { method: 'PATCH', body: { operationId: env.op(), expectedRevision: current.revision, bindings: [{ id: 'binding', channelId: ch.id, model: env.model, procurementPrices: [baseline, env.price('future', { effectiveAt: new Date(env.clock() + 3600000).toISOString() })] }] } }); assert.equal((await env.trial(updated)).cost.priceVersion, 'old');
});

test('group switching rejects partial coverage and missing candidate evidence without changing any live refs', async t => {
  const env = fixture(t), a = await env.channel('a', 'shared-old'), b = await env.channel('b', 'shared-old'), ca = await env.channel('a-candidate', 'shared-new'), cb = await env.channel('b-candidate', 'shared-new');
  await env.prove(a); await env.prove(b); const sa = await env.service(a), sb = await env.service(b); await env.publish(sa); await env.publish(sb);
  await assert.rejects(env.post('/configuration-changes/preview', { scope: 'group', replacements: [{ channelId: a.id, candidateChannelId: ca.id }] }), issue => issue.code === 'group_references_incomplete');
  const plan = await env.post('/configuration-changes/preview', { scope: 'group', replacements: [{ channelId: a.id, candidateChannelId: ca.id }, { channelId: b.id, candidateChannelId: cb.id }] }); await env.prove(ca);
  await assert.rejects(env.post('/configuration-changes/apply', { previewId: plan.id, impactSignature: plan.impactSignature }), issue => issue.code === 'validation_required');
  const before = (await api('/services')).services; assert.equal(before.find(row => row.id === sa.id).published.config.bindings[0].channelId, a.id); assert.equal(before.find(row => row.id === sb.id).published.config.bindings[0].channelId, b.id);
  await env.prove(cb); const operationId = env.op(), applied = await api('/configuration-changes/apply', { method: 'POST', body: { operationId, previewId: plan.id, impactSignature: plan.impactSignature } }); assert.equal(applied.status, 'applied'); assert.equal((await api(`/configuration-changes/${plan.id}`)).status, 'applied'); assert.equal((await api('/configuration-changes/apply', { method: 'POST', body: { operationId, previewId: plan.id, impactSignature: plan.impactSignature } })).id, applied.id);
  const after = (await api('/services')).services; assert.equal(after.find(row => row.id === sa.id).published.config.bindings[0].channelId, ca.id); assert.deepEqual(after.find(row => row.id === sa.id).published.config.salePrices, before.find(row => row.id === sa.id).published.config.salePrices);
});

test('new references invalidate a preview and revoked credentials stop queued work and later runtime', async t => {
  const env = fixture(t), old = await env.channel('old'), candidate = await env.channel('candidate', 'new-key'); await env.prove(old); await env.prove(candidate); const current = await env.service(old); await env.publish(current);
  const plan = await env.post('/configuration-changes/preview', { replacements: [{ channelId: old.id, candidateChannelId: candidate.id }] }); await env.service(old);
  await assert.rejects(env.post('/configuration-changes/apply', { previewId: plan.id, impactSignature: plan.impactSignature }), issue => issue.code === 'configuration_impact_changed');
  const batch = await env.post('/tests', { channelId: old.id, models: Array.from({ length: 4 }, (_, i) => ({ ...env.model, id: `model-${i}`, upstreamModelId: `up-${i}` })) });
  const key = (await api('/credentials')).credentials.find(row => row.id === old.credentialId); await env.post(`/credentials/${key.id}/revoke`, { expectedRevision: key.version }); env.advance(3000); const result = await api(`/tests/${batch.id}`); assert.ok(result.items.some(item => item.status === 'failed' && item.code === 'supply_unavailable'));
});

test('local emergency revoke and provider/channel/model stops gate the same mock runtime, while stopped channels can still be checked', async t => {
  const env = fixture(t), ch = await env.channel('channel', 'local-key', { clientChannelId: 'local-endpoint', credential: { id: 'local-key', version: 'fingerprint-v1', status: 'active' } });
  const local = { providers: [{ id: 'supplier', status: '已启用', apiKeys: [{ id: 'local-key', status: 'enabled' }], catalogModels: [{ modelId: 'catalog-model', libraryId: env.model.id }], catalogConnections: [{ id: env.model.associationId, modelId: 'catalog-model', endpointId: 'local-endpoint', upstreamModelId: env.model.upstreamModelId, enabled: true }] }], endpoints: [{ id: 'local-endpoint', providerId: 'supplier', status: '运行中' }] };
  setMockRuntimeState(local); await env.prove(ch); const current = await env.service(ch); await env.publish(current); const key = await env.post('/client-keys', { tenantId: 'tenant-a', serviceIds: [current.id] });
  const request = () => api('/client/completions', { method: 'POST', token: key.clientKey, body: { operationId: env.op(), model: current.candidate.publicModelId, messages: [{ role: 'user', content: 'hello' }] } });
  await request(); local.providers[0].apiKeys[0].revokedAt = new Date(env.clock()).toISOString(); setMockRuntimeState(local); await assert.rejects(request(), issue => issue.code === 'credential_unavailable');
  delete local.providers[0].apiKeys[0].revokedAt; local.providers[0].status = '已停用'; setMockRuntimeState(local); await assert.rejects(request(), issue => issue.code === 'supply_unavailable');
  local.providers[0].status = '已启用'; local.endpoints[0].status = '停用'; setMockRuntimeState(local); await assert.rejects(request(), issue => issue.code === 'supply_unavailable'); assert.equal((await env.prove(ch)).items[0].status, 'passed');
  local.endpoints[0].status = '运行中'; local.providers[0].catalogConnections[0].enabled = false; setMockRuntimeState(local); await assert.rejects(request(), issue => issue.code === 'supply_unavailable');
});

test('provider primary takes healthy traffic and only fails over to the configured backup', async t => {
  const env = fixture(t), a = await env.channel('primary'), b = await env.channel('backup'); await env.prove(a); await env.prove(b);
  const current = await env.service(a, { mode:'provider', bindings: [{ id: 'primary', channelId: a.id, model: env.model, procurementPrices: [env.price('a')] }, { id: 'backup', channelId: b.id, model: env.model, procurementPrices: [env.price('b')] }], route: { version: 1, strategy: 'fixed', channels: [{ bindingId: 'backup', priority: 1, backup:true }, { bindingId: 'primary', priority: 2 }], autoFailover: true } });
  const healthy = await env.trial(current);
  assert.deepEqual(healthy.attempts.map(row=>row.bindingId), ['primary']);
  setMockScenario('partial'); const result = await env.trial(current); assert.equal(result.actualSupply.channelId, b.id); assert.deepEqual(result.attempts.map(row => row.status), ['failed', 'passed']);
});

test('metering-unknown scene keeps both costs unknown and blocks publication, while media has explicit mock quantities', async t => {
  const env = fixture(t), ch = await env.channel('channel'); await env.prove(ch); const current = await env.service(ch); setMockScenario('metering_unknown'); const result = await env.trial(current); assert.equal(result.cost, null); assert.equal(result.saleTrial, null); assert.equal(result.billingReady, false); await assert.rejects(env.post(`/services/${current.id}/publish`, { expectedRevision: current.revision }), issue => issue.code === 'platform_trial_required');
  setMockScenario('success'); const video = await env.post('/tests', { channelId: ch.id, models: [{ ...env.model, type: 'video' }], confirmExpensive: true }); env.advance(4000); const media = await api(`/tests/${video.id}`); assert.equal(media.items[0].usage.requests, 1); assert.equal(media.items[0].usage.seconds, 1);
});

test('shared mock account RPM is aggregated across channels instead of multiplied per model', async t => {
  const env = fixture(t), key = await env.post('/credentials', { providerId: 'supplier', name: 'limited', accountRpm: 1 });
  const a = await env.channel('a', key.id), b = await env.channel('b', key.id); await env.prove(a); const limited = await env.prove(b); assert.equal(limited.items[0].code, 'account_rate_limit'); assert.equal(limited.items[0].upstreamStatus, 429); env.advance(60000); assert.equal((await env.prove(b)).items[0].status, 'passed');
});

test('custom task endpoints reject generic discovery while manual task testing remains available', async t => {
  const env = fixture(t), ch = await env.channel('custom', 'custom-key', { interfaceType: 'custom', baseUrl: 'https://gateway.mock.invalid/task' });
  await assert.rejects(env.post('/discover', { channelId: ch.id }), issue => issue.code === 'discovery_unsupported'); assert.equal((await env.prove(ch)).items[0].status, 'passed');
});

test('browser delay is visible and aborts before dispatch without any network request', async t => {
  const env = fixture(t), previous = Object.getOwnPropertyDescriptor(globalThis, 'window'), timers = [];
  Object.defineProperty(globalThis, 'window', { configurable: true, value: { dispatchEvent() {} } });
  t.after(() => previous ? Object.defineProperty(globalThis, 'window', previous) : delete globalThis.window);
  t.mock.method(globalThis, 'setTimeout', (callback, ms) => { timers.push({ callback, ms }); return timers.length; }); t.mock.method(globalThis, 'clearTimeout', () => {});
  const controller = new AbortController(), pending = env.post('/channels', { providerId: 'supplier', name: 'must-not-be-created', interfaceType: 'openai', baseUrl: 'https://mock.invalid/v1', credentialId: 'key' });
  assert.equal(timers.at(-1).ms, 150); timers.at(-1).callback(); await pending;
  const before = [...env.stored.values()].join(''), aborted = api('/channels', { method: 'POST', signal: controller.signal, body: { operationId: env.op(), providerId: 'supplier', name: 'cancelled', interfaceType: 'openai', baseUrl: 'https://mock.invalid/v1', credentialId: 'key' } });
  const rejection = assert.rejects(aborted, issue => issue.name === 'AbortError'); controller.abort(); await rejection;
  assert.equal([...env.stored.values()].join(''), before); assert.equal(env.fetchCalls(), 0);
});

test('video task identifiers survive polling, cancellation and recovery unchanged', async t => {
  const env = fixture(t), ch = await env.channel('video'); const batch = await env.post('/tests', { channelId: ch.id, models: [{ ...env.model, type: 'video' }], confirmExpensive: true });
  env.advance(200); const started = await api(`/tests/${batch.id}`); assert.match(started.items[0].taskId, /^mock-task-/); await env.post(`/tests/${batch.id}/cancel`, {}); env.advance(4000); const recovered = await api(`/tests/${batch.id}`); assert.equal(recovered.items[0].taskId, started.items[0].taskId); assert.equal(recovered.items[0].status, 'unknown'); assert.equal(recovered.source, 'mock');
});


test('client authentication and service key scope precede idempotent responses, with caches isolated per customer key', async t => {
  const env = fixture(t), ch = await env.channel('scope'); await env.prove(ch); const current = await env.service(ch); await env.publish(current);
  const other = await env.service(ch);
  const a = await env.post('/client-keys', { tenantId: 'tenant-a', serviceIds: [current.id] }), b = await env.post('/client-keys', { tenantId: 'tenant-a', serviceIds: [current.id] }), forbidden = await env.post('/client-keys', { tenantId: 'tenant-b', serviceIds: [other.id] });
  const body = { operationId: env.op(), model: current.candidate.publicModelId, messages: [{ role: 'user', content: 'scoped content' }] }, request = token => api('/client/completions', { method: 'POST', token, body });
  const first = await request(a.clientKey); assert.equal((await request(a.clientKey)).id, first.id);
  await assert.rejects(request('invalid'), issue => issue.code === 'client_unauthorized'); await assert.rejects(request(forbidden.clientKey), issue => issue.code === 'model_forbidden');
  const second = await request(b.clientKey); assert.notEqual(second.id, first.id); assert.equal((await api('/usage')).clientCount, 2);
  await env.post('/client-keys/' + a.id + '/revoke', { expectedRevision: a.version }); await assert.rejects(request(a.clientKey), issue => issue.code === 'client_unauthorized'); assert.equal((await api('/usage')).clientCount, 2);
});

test('latest failed, unknown or unmetered platform trial blocks older success and preserves one failure receipt on retry', async t => {
  const env = fixture(t), ch = await env.channel('trial-history'); await env.prove(ch); const current = await env.service(ch); await env.trial(current);
  for (const [scenario, status] of [['auth', 'failed'], ['timeout', 'unknown'], ['metering_unknown', 'metering_unknown']]) {
    setMockScenario(scenario); const identity = await env.post('/services/' + current.id + '/test-identities', { expectedRevision: current.revision }), body = { operationId: env.op(), trialToken: identity.token };
    const request = () => api('/services/' + current.id + '/trial', { method: 'POST', body }); let traceId;
    if (scenario === 'metering_unknown') assert.equal((await request()).billingReady, false);
    else await assert.rejects(request(), issue => { traceId = issue.traceId; return issue.code === (scenario === 'timeout' ? 'request_timeout' : 'upstream_unauthorized'); });
    const before = (await api('/services')).services[0].trials; assert.equal(before.at(-1).status, status);
    if (scenario !== 'metering_unknown') { const usage = (await api('/usage')).usage.at(-1); assert.equal(usage.status, status); assert.equal(usage.cost, null); assert.equal(usage.saleTrial, null); assert.equal(usage.usage, null); assert.equal(usage.customerDebited, false); assert.equal(usage.attempts[0].channelId, ch.id); }
    setMockScenario('success');
    if (scenario === 'metering_unknown') assert.equal((await request()).billingReady, false);
    else await assert.rejects(request(), issue => issue.traceId === traceId);
    assert.equal((await api('/services')).services[0].trials.length, before.length);
    await assert.rejects(env.post('/services/' + current.id + '/publish', { expectedRevision: current.revision }), issue => issue.code === 'platform_trial_required');
    await env.trial(current);
  }
  assert.ok((await env.post('/services/' + current.id + '/publish', { expectedRevision: current.revision })).published);
});

test('a persisted queued or running trial cannot reuse an earlier successful trial for publication', async t => {
  const env = fixture(t), ch = await env.channel('pending-trial'); await env.prove(ch); const current = await env.service(ch); await env.trial(current);
  const storageKey = [...env.stored.keys()][0];
  for (const status of ['queued', 'running']) {
    const state = JSON.parse(env.stored.get(storageKey)), trials = state.services[0].trials;
    trials.push({ ...trials.at(-1), id: 'pending-' + status, status }); env.stored.set(storageKey, JSON.stringify(state));
    await assert.rejects(env.post('/services/' + current.id + '/publish', { expectedRevision: current.revision }), issue => issue.code === 'platform_trial_required');
  }
});

test('only active published route members block an unverified edit, respecting route strategy and explicit disable', async t => {
  const env = fixture(t), live = await env.channel('live'), zero = await env.channel('zero'), disabled = await env.channel('disabled'), absent = await env.channel('absent'); await env.prove(live);
  const binding = (id, channel) => ({ id, channelId: channel.id, model: env.model, procurementPrices: id === 'live' ? [env.price('cost')] : [] });
  const current = await env.service(live, { bindings: [binding('live', live), binding('zero', zero), binding('disabled', disabled), binding('absent', absent)], route: { version: 1, strategy: 'weighted', channels: [{ bindingId: 'live', priority: 1, weight: 100 }, { bindingId: 'zero', priority: 1, weight: 0 }, { bindingId: 'disabled', priority: 1, weight: 100, enabled: false }] } }); await env.publish(current);
  const prepared = prepareMockConfiguration({ unverifiedChannelIds: [zero.id, disabled.id, absent.id] }); commitMockConfiguration(prepared);
  const channels = (await api('/channels')).channels; assert.ok(channels.filter(row => [zero.id, disabled.id, absent.id].includes(row.id)).every(row => row.needsValidation));
  assert.throws(() => prepareMockConfiguration({ unverifiedChannelIds: [live.id] }), issue => issue.code === 'validation_required');
  const priority = await env.service(live, { route: { version: 1, strategy: 'priority', channels: [{ bindingId: 'binding', priority: 1, weight: 0 }] } }); await env.publish(priority);
  assert.throws(() => prepareMockConfiguration({ unverifiedChannelIds: [live.id] }), issue => issue.code === 'validation_required');
});


test('publication inspection is read-only and exposes isolated snapshots only after current platform publication', async t => {
  const env = fixture(t), ch = await env.channel('publication-inspection'); await env.prove(ch); const current = await env.service(ch);
  assert.equal(inspectMockPublication(current.id).ready, false); await env.publish(current);
  const before = [...env.stored.values()].join(''), inspection = inspectMockPublication(current.id), snapshots = getMockServiceSnapshots(); assert.equal(inspection.ready, true);
  snapshots[0].candidate.tenantIds.push('forged-tenant'); inspection.published.config.tenantIds.push('another-forged-tenant');
  assert.deepEqual(getMockServiceSnapshots()[0].candidate.tenantIds, ['tenant-a']); assert.equal([...env.stored.values()].join(''), before); assert.equal(env.fetchCalls(), 0);
  const key = await env.post('/client-keys', { tenantId: 'tenant-a', serviceIds: [current.id] }); setMockScenario('auth'); await assert.rejects(env.trial(getMockServiceSnapshots()[0]), issue => issue.code === 'upstream_unauthorized'); assert.equal(inspectMockPublication(current.id).ready, false);
  setMockScenario('success'); const result = await api('/client/completions', { method: 'POST', token: key.clientKey, body: { operationId: env.op(), model: current.candidate.publicModelId, messages: [{ role: 'user', content: 'published runtime remains separate' }] } }); assert.equal(result.source, 'mock');
});

test('publication inspection rejects nonmock proof provenance, uncommitted candidates and expired evidence', async t => {
  const env = fixture(t), ch = await env.channel('publication-provenance'); await env.prove(ch); const current = await env.service(ch); await env.publish(current);
  const storageKey = [...env.stored.keys()][0], original = env.stored.get(storageKey);
  for (const change of [state => { state.services[0].published.source = 'real'; }, state => { state.services[0].trials.at(-1).source = 'real'; }, state => { state.batches[0].source = 'real'; }, state => { state.batches[0].items[0].evidenceSource = 'real'; }, state => { state.services[0].trials.at(-1).status = 'running'; }]) {
    const state = JSON.parse(original); change(state); env.stored.set(storageKey, JSON.stringify(state)); const before = env.stored.get(storageKey);
    assert.equal(inspectMockPublication(current.id).ready, false); assert.equal(env.stored.get(storageKey), before);
  }
  env.stored.set(storageKey, original); const published = getMockServiceSnapshots()[0]; await api('/services/' + current.id, { method: 'PATCH', body: { operationId: env.op(), expectedRevision: published.revision, tenantIds: ['tenant-a'] } }); assert.match(inspectMockPublication(current.id).reason, /候选已变化/);
  env.stored.set(storageKey, original); env.advance(25 * 3600000); assert.equal(inspectMockPublication(current.id).ready, false);
});

function setMockRuntimeState(local) {
  rawSetMockRuntimeState(local);
  if (local && globalThis.localStorage) {
    const current = JSON.parse(localStorage.getItem('moma.adminV2.5120.v1') || '{"models":[],"tenants":[]}');
    localStorage.setItem('moma.adminV2.5120.v1', JSON.stringify({ ...current, ...local }));
  }
}

test('unlisting one model stops both provider services and old keys while another published model remains callable', async t => {
  const env=fixture(t), a=await env.channel('provider-a','opaque-a',{providerId:'supplier-a'}), b=await env.channel('provider-b','opaque-b',{providerId:'supplier-b'});
  await env.prove(a);await env.prove(b);
  const first=await env.service(a,{mode:'provider'}), second=await env.service(b,{mode:'provider'}), other=await env.service(a);
  for(const item of [first,second,other]) await env.publish(item);
  const key=await env.post('/client-keys',{tenantId:'tenant-a',serviceIds:[first.id,second.id,other.id]});
  const mainKey='moma.adminV2.5120.v1', local=JSON.parse(env.stored.get(mainKey));
  const common={...local.models.find(row=>row.id===first.id),id:'multi',modelId:'multi',serviceMode:'provider',serviceProviders:[{providerId:'supplier-a',callId:first.candidate.publicModelId},{providerId:'supplier-b',callId:second.candidate.publicModelId}],platformPublications:[{source:'mock',serviceId:'provider:multi:supplier-a',mockServiceId:first.id},{source:'mock',serviceId:'provider:multi:supplier-b',mockServiceId:second.id}]};
  local.models=[common,local.models.find(row=>row.id===other.id)];env.stored.set(mainKey,JSON.stringify(local));
  const bodies=[first,second,other].map(item=>({operationId:env.op(),model:item.candidate.publicModelId,messages:[{role:'user',content:'scope'}]}));
  const call=body=>api('/client/completions',{method:'POST',token:key.clientKey,body});
  for(const body of bodies) assert.equal((await call(body)).source,'mock');
  common.listingStatus='已下架';env.stored.set(mainKey,JSON.stringify(local));
  for(const body of bodies.slice(0,2)) {
    await assert.rejects(call(body),error=>error.code==='model_unavailable');
    await assert.rejects(call({...body,operationId:env.op(),identityType:'platform',trial:true}),error=>error.code==='model_unavailable');
  }
  assert.equal((await call({...bodies[2],operationId:env.op()})).source,'mock');
});

import { getMockOperationalRequests } from '../src/admin-v2/mock-onboarding-service.js';
import { operationFacts, businessFacts, businessSummary, analysisFilters } from '../src/admin-v2/operations-analysis.js';
import { usagePreset } from '../src/admin-v2/usage-analysis.js';
test('customer service calls produce immutable operational receipts while platform trials stay outside revenue',async t=>{
 const env=fixture(t),ch=await env.channel('operational-receipt');await env.prove(ch);const current=await env.service(ch);await env.publish(current);
 assert.equal(getMockOperationalRequests().length,0);
 const key=await env.post('/client-keys',{tenantId:'tenant-a',serviceIds:[current.id]});await api('/client/completions',{method:'POST',token:key.clientKey,body:{operationId:env.op(),model:current.candidate.publicModelId,messages:[{role:'user',content:'usage event'}]}});
 const requests=getMockOperationalRequests();assert.equal(requests.length,1);assert.equal(requests[0].tenantId,'tenant-a');assert.equal(requests[0].serviceId,'standard:'+current.id);assert.equal(requests[0].attempts[0].procurementSnapshot.items.length,1);
 const state={models:[{id:current.id,type:'text',name:'模型服务'}],providers:[{id:'supplier',name:'服务商'}],endpoints:[{id:requests[0].endpointId,providerId:'supplier',name:'渠道'}],tenants:[{id:'tenant-a',name:'客户'}],requests};
 const facts=businessFacts(state,operationFacts(state,usagePreset('today'),analysisFilters(),Date.now()+1));assert.equal(facts[0].complete,true);assert.ok(facts[0].sale.amount>0);assert.equal(businessSummary(facts,'CNY').pending,0);
 const before=JSON.stringify(requests);await env.post('/scenario',{value:'auth'}).catch(()=>{});assert.equal(JSON.stringify(getMockOperationalRequests()),before);
});
test('a final upstream client failure is retained once without creating customer income or a fake zero cost',async t=>{
 const env=fixture(t),ch=await env.channel('failed-operational');await env.prove(ch);const current=await env.service(ch);await env.publish(current);const key=await env.post('/client-keys',{tenantId:'tenant-a',serviceIds:[current.id]});
 setMockScenario('auth');const body={operationId:env.op(),model:current.candidate.publicModelId,messages:[{role:'user',content:'failure'}]};
 const publicFailure=error=>{assert.equal(error.code,'upstream_unauthorized');assert.equal(error.attempts?.length || 0,0);assert.equal(error.cost,undefined);assert.ok(!JSON.stringify(error).includes('procurementSnapshot'));return true;};
 await assert.rejects(api('/client/completions',{method:'POST',token:key.clientKey,body}),publicFailure);await assert.rejects(api('/client/completions',{method:'POST',token:key.clientKey,body}),publicFailure);
 const requests=getMockOperationalRequests();assert.equal(requests.length,1);assert.equal(requests[0].billingStatus,'not_billable');assert.equal(requests[0].attempts[0].error,'upstream_unauthorized');
 assert.equal(requests[0].attempts[0].procurementSnapshot.items.length,1);
 const state={models:[{id:current.id,type:'text'}],providers:[{id:'supplier'}],endpoints:[{id:requests[0].endpointId,providerId:'supplier'}],requests};
 const facts=businessFacts(state,operationFacts(state,usagePreset('today'),analysisFilters(),Date.now()+1));assert.equal(facts[0].sale.amount,0);assert.equal(facts[0].cost,null);assert.equal(facts[0].profit,null);
});

test('technical trials publish without sale or procurement prices and replay without duplicate usage', async t => {
  const env=fixture(t),ch=await env.channel('technical');await env.prove(ch);
  const current=await env.service(ch,{technical:true,purpose:'internal',salePrices:[],bindings:[{id:'binding',channelId:ch.id,model:env.model,procurementPrices:[]}]});
  const identity=await env.post(`/services/${current.id}/test-identities`,{expectedRevision:current.revision});
  const body={operationId:env.op(),trialToken:identity.token};
  const first=await api(`/services/${current.id}/trial`,{method:'POST',body});
  assert.equal(first.technicalReady,true);assert.equal(first.billingReady,false);assert.equal(first.cost,null);assert.equal(first.saleTrial,null);assert.equal(first.customerDebited,false);
  assert.deepEqual(await api(`/services/${current.id}/trial`,{method:'POST',body}),first);
  const stored=JSON.parse(env.stored.get('moma-5120-model-onboarding-mock-v1'));
  assert.equal(stored.usage.length,1);assert.equal(stored.usage[0].billingStatus,'not_applicable');assert.equal(stored.usage[0].costStatus,'pending');assert.equal(stored.usage[0].priceSnapshot,null);assert.equal(stored.usage[0].attempts[0].procurementSnapshot,null);
  const published=await env.post(`/services/${current.id}/publish`,{expectedRevision:current.revision});
  assert.equal(published.published.config.technical,true);assert.equal(inspectMockPublication(current.id).ready,true);
});

test('technical trial costs freeze their own price version and later costs never rewrite earlier records',async t=>{
  const env=fixture(t),ch=await env.channel('technical-cost');await env.prove(ch);
  const current=await env.service(ch,{technical:true,purpose:'internal',salePrices:[]});
  const first=await env.trial(current);assert.equal(first.cost.amount,1000000);assert.equal(first.saleTrial,null);
  const changed=await api(`/services/${current.id}`,{method:'PATCH',body:{operationId:env.op(),expectedRevision:current.revision,bindings:[{id:'binding',channelId:ch.id,model:env.model,procurementPrices:[env.price('cost-v2',{amount:2000000})]}]}});
  const second=await env.trial(changed);assert.equal(second.cost.amount,2000000);
  const records=JSON.parse(env.stored.get('moma-5120-model-onboarding-mock-v1')).usage;
  assert.equal(records.find(row=>row.id===first.id).cost.amount,1000000);
  assert.equal(records.find(row=>row.id===first.id).attempts[0].procurementSnapshot.id,'cost');
  assert.equal(records.find(row=>row.id===second.id).attempts[0].procurementSnapshot.id,'cost-v2');
});
