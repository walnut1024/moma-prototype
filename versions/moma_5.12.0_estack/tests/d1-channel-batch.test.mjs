import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash, randomBytes } from 'node:crypto';
import { startLocalBackend } from '../database/local-runtime.js';
import { domainModelWorkspace } from '../src/mock/model-fields.js';
import { supplierChannelAssociations } from '../src/admin-v2/supplier-resources.js';
import { supplierChannelBatchPlan, supplierChannelLifecyclePlan } from '../src/admin-v2/supplier-channel-batch.js';
import { providerRemovalPlan } from '../src/admin-v2/provider-removal.js';
import { configureOnboardingTransport } from '../src/admin-v2/onboarding-client.js';
import { prepareCandidateTest, submitCandidateTest, recoverCandidateTest, candidateTestReceipt } from '../src/admin-v2/candidate-tests.js';

test('HTTP/D1 batch names and shared addresses preserve IDs, rollback failures, require evidence and retain replay/conflict/permission checks', { timeout: 60000 }, async () => {
  const accessCode = randomBytes(24).toString('hex'), hash = createHash('sha256').update(accessCode).digest('hex');
  const local = await startLocalBackend({ demo: true, loginHashes: { 'admin-001': hash, 'admin-002': hash } });
  let cookie = '';
  const request = async (path, body, token = cookie) => {
    const response = await local.runtime.dispatchFetch('https://example.test/api/v1' + path, { method: body ? 'POST' : 'GET', headers: {
      ...(token ? { cookie: token } : {}), ...(body ? { origin: 'https://example.test', 'x-moma-request': '1', 'content-type': 'application/json', 'idempotency-key': body.operationId || crypto.randomUUID() } : {}),
    }, ...(body ? { body: JSON.stringify(body) } : {}) });
    return { status: response.status, data: await response.json(), cookie: response.headers.get('set-cookie')?.split(';')[0] };
  };
  const read = async () => { const response = await request('/model-operations'); assert.equal(response.status, 200, JSON.stringify(response.data)); return domainModelWorkspace(response.data); };
  const command = async (operation, data) => {
    const state = await read(), operationId = crypto.randomUUID();
    return request('/model-operations/commands', { operationId, expectedRevision: state.revision, action: { type: 'modelOperations', operation, data } });
  };
  try {
    assert.equal((await request('/model-operations')).status, 401);
    const login = await request('/auth/login', { accountId: 'admin-001', accessCode }); cookie = login.cookie; assert.equal(login.status, 200);
    const readonly = await request('/auth/login', { accountId: 'admin-002', accessCode }, '');
    let state = await read(); const original = structuredClone(state), provider = state.providers.find(row => row.id === 'provider-moma');
    const rows = supplierChannelAssociations(state, provider), first = rows[0], other = rows.find(row => row.endpointId !== first.endpointId), ids = [first.id, other.id];
    const values = patch => ({ providerId: provider.id, associationIds: ids, expectedSignature: supplierChannelBatchPlan(state, provider.id, ids).signature, confirmed: true, ...patch });
    const name = values({ field: 'name', value: 'HTTP批量连接' });
    assert.equal((await request('/model-operations/commands', { operationId: crypto.randomUUID(), expectedRevision: state.revision, action: { type: 'modelOperations', operation: 'supplierChannelBatchEdit', data: name } }, readonly.cookie)).status, 403);
    for (const patch of [{ value: '' }, { value: 'a\nb' }, { associationIds: [...ids, 'foreign'] }, { expectedSignature: 'stale' }, { confirmed: false }]) assert.equal((await command('supplierChannelBatchEdit', { ...name, ...patch })).status, 422);
    assert.deepEqual(await read(), original);
    const body = { operationId: crypto.randomUUID(), expectedRevision: state.revision, action: { type: 'modelOperations', operation: 'supplierChannelBatchEdit', data: name } };
    const saved = await request('/model-operations/commands', body); assert.equal(saved.status, 200, JSON.stringify(saved.data));
    assert.deepEqual((await request('/model-operations/commands', body)).data, saved.data);
    assert.equal((await request('/model-operations/commands', { ...body, operationId: crypto.randomUUID() })).status, 409);
    state = await read(); assert.deepEqual(state.endpoints, original.endpoints);
    for (const id of ids) assert.equal(state.providers.find(row => row.id === provider.id).catalogConnections.find(row => row.id === id).sourceName, name.value);
    const nameState = structuredClone(state), value = 'https://http-batch.example.invalid/v1';
    assert.equal((await command('supplierChannelBatchEdit', values({ field: 'address', phase: 'prepare', value: 'not-a-url' }))).status, 422); assert.deepEqual(await read(), nameState);
    assert.equal((await command('supplierChannelBatchEdit', values({ field: 'address', phase: 'prepare', value }))).status, 200);
    state = await read(); const plan = supplierChannelBatchPlan(state, provider.id, ids), candidates = plan.connections.map(({ endpoint }) => ({ endpointId: endpoint.id, candidateId: endpoint.candidateConfiguration.id }));
    assert(plan.additional.length > 0);
    assert.equal((await command('supplierChannelBatchEdit', values({ field: 'address', phase: 'apply', value, candidates }))).status, 422);
    for (const { endpoint } of plan.connections) assert.equal((await read()).endpoints.find(row => row.id === endpoint.id).baseUrl, original.endpoints.find(row => row.id === endpoint.id).baseUrl);
    configureOnboardingTransport(async (path, options = {}) => {
      const response = await request('/simulation' + path, options.method === 'POST' ? options.body : undefined);
      if (response.status !== 200) throw Error(JSON.stringify(response.data));
      return response.data.result;
    });
    for (const target of candidates) {
      state = await read(); const context = { providerId: provider.id, endpointId: target.endpointId, candidateId: target.candidateId, expectedRevision: 0 };
      const job = await prepareCandidateTest(state, context);
      assert.equal((await command(job.operation, job.data)).status, 200);
      const submitted = await submitCandidateTest(job.data); assert.equal((await command(job.operation, submitted)).status, 200);
      let batch;
      for (let i = 0; i < 80; i++) { batch = await recoverCandidateTest(submitted); if (['completed', 'cancelled', 'interrupted'].includes(batch.status)) break; await new Promise(resolve => setTimeout(resolve, 40)); }
      assert.equal(batch.status, 'completed'); assert(batch.items.every(item => item.status === 'passed'));
      const receipt = candidateTestReceipt(submitted, batch); assert.equal((await command(receipt.operation, receipt.data)).status, 200);
    }
    state = await read(); const applied = await command('supplierChannelBatchEdit', values({ field: 'address', phase: 'apply', value, candidates })); assert.equal(applied.status, 200, JSON.stringify(applied.data));
    const fresh = await read(); for (const { endpointId } of candidates) { assert.equal(fresh.endpoints.find(row => row.id === endpointId).baseUrl, value); assert.equal(fresh.endpoints.find(row => row.id === endpointId).configurationRevision, 1); }
    assert.deepEqual(fresh.endpoints.map(row => row.id).sort(), original.endpoints.map(row => row.id).sort());
    assert.deepEqual(fresh.providers.filter(row => row.id !== provider.id), original.providers.filter(row => row.id !== provider.id));
    for (const key of ['modelTemplates', 'modelSalePrices', 'supplyPrices']) assert.deepEqual(fresh[key], original[key]);
    const sqlIds = await local.db.prepare('SELECT id FROM channel_models ORDER BY id').all(); assert(sqlIds.results.length > 0);
    assert.equal((await local.db.prepare('PRAGMA foreign_key_check').all()).results.length, 0);
    state = await read();
    const lifecycleData = action => ({ providerId: provider.id, associationIds: ids, action, confirmed: true,
      expectedSignature: supplierChannelLifecyclePlan(state, provider.id, ids, action).signature });
    const disabledData = lifecycleData('disable'), beforeDisable = structuredClone(state);
    for (const patch of [{ confirmed: false }, { expectedSignature: 'stale' }, { associationIds: [ids[0], 'foreign'] }]) {
      assert.equal((await command('supplierChannelBatchLifecycle', { ...disabledData, ...patch })).status, 422);
    }
    assert.deepEqual(await read(), beforeDisable);
    const disableBody = { operationId: crypto.randomUUID(), expectedRevision: state.revision, action: { type: 'modelOperations', operation: 'supplierChannelBatchLifecycle', data: disabledData } };
    assert.equal((await request('/model-operations/commands', disableBody, readonly.cookie)).status, 403);
    const disabled = await request('/model-operations/commands', disableBody); assert.equal(disabled.status, 200, JSON.stringify(disabled.data));
    assert.deepEqual((await request('/model-operations/commands', disableBody)).data, disabled.data);
    assert.equal((await request('/model-operations/commands', { ...disableBody, operationId: crypto.randomUUID() })).status, 409);
    state = await read(); assert(ids.every(id => !state.providers.find(p => p.id === provider.id).catalogConnections.find(row => row.id === id).enabled));
    assert.equal((await command('supplierChannelBatchLifecycle', lifecycleData('enable'))).status, 200);
    state = await read(); assert(ids.every(id => state.providers.find(p => p.id === provider.id).catalogConnections.find(row => row.id === id).enabled));
    const target = { providerId: provider.id, associationIds: ids }, removeData = () => ({ target, confirmed: true, expectedSignature: providerRemovalPlan(state, target).signature });
    assert.equal((await command('providerRemovalCommit', removeData())).status, 422);
    assert.equal((await command('providerRemovalPrepare', removeData())).status, 200);
    state = await read(); assert(providerRemovalPlan(state, target).ready);
    assert.equal((await command('providerRemovalCommit', removeData())).status, 200);
    const removed = await read(), owner = removed.providers.find(p => p.id === provider.id);
    assert(!owner.deletedAt); assert(ids.every(id => owner.catalogConnections.find(row => row.id === id).deletedAt));
    for (const row of beforeDisable.providers.find(p => p.id === provider.id).catalogConnections.filter(row => !ids.includes(row.id))) assert.deepEqual(owner.catalogConnections.find(r => r.id === row.id), row);
    assert.deepEqual(removed.endpoints.map(row => row.id), original.endpoints.map(row => row.id));
    assert.deepEqual(removed.providers.filter(p => p.id !== provider.id), original.providers.filter(p => p.id !== provider.id));
    assert.deepEqual(removed.modelSalePrices, original.modelSalePrices); assert.deepEqual(removed.supplyPrices, original.supplyPrices);
  } finally { configureOnboardingTransport(null); await local.runtime.dispose(); }
});
