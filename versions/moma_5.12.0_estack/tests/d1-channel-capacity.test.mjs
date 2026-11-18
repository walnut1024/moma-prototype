import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash, randomBytes } from 'node:crypto';
import { startLocalBackend } from '../database/local-runtime.js';
import { domainModelWorkspace } from '../src/mock/model-fields.js';

test('channel capacity HTTP commands persist independent structured limits in D1 and reject stale or invalid writes', { timeout: 60000 }, async () => {
  const code = randomBytes(24).toString('hex');
  const local = await startLocalBackend({ demo: true, loginHashes: { 'admin-001': createHash('sha256').update(code).digest('hex') } });
  let cookie;
  const request = async (path, body, key) => {
    const response = await local.runtime.dispatchFetch('https://example.test/api/5120' + path, {
      method: body ? 'POST' : 'GET', headers: { ...(cookie ? { cookie } : {}), ...(body ? { origin: 'https://example.test', 'x-moma-request': '1', 'content-type': 'application/json' } : {}), ...(key ? { 'idempotency-key': key } : {}) },
      ...(body ? { body: JSON.stringify(body) } : {}),
    });
    return { status: response.status, data: await response.json(), cookie: response.headers.get('set-cookie')?.split(';')[0] };
  };
  const reload = async () => {
    const result = await request('/model-operations');
    assert.equal(result.status, 200);
    return domainModelWorkspace(result.data);
  };
  const owner = state => state.providers.find(row => row.id === 'provider-moma');
  const command = (state, association, limits, capacityRevision = 0) => ({ operationId: crypto.randomUUID(), expectedRevision: state.revision,
    action: { type: 'modelOperations', operation: 'channelCapacitySave', data: { providerId: owner(state).id, endpointId: association.endpointId, associationId: association.id, expectedCapacityRevision: capacityRevision, limits } } });
  const send = body => request('/model-operations/commands', body, body.operationId);
  try {
    assert.equal((await request('/model-operations')).status, 401);
    const login = await request('/auth/login', { accountId: 'admin-001', accessCode: code });
    assert.equal(login.status, 200); cookie = login.cookie;
    const original = await reload(), [first, second, shared] = owner(original).catalogConnections;
    assert.equal(first.modelId, second.modelId);
    assert.equal(first.endpointId, shared.endpointId);
    const firstBody = command(original, first, { rpm: 1000, tpm: 2000000, concurrency: 50, inputTpm: 1500000 });
    const saved = await send(firstBody);
    assert.equal(saved.status, 200, JSON.stringify(saved.data));
    assert.deepEqual((await send(firstBody)).data, saved.data);
    let state = await reload();
    assert.deepEqual(state.supplyRelations, saved.data.supplyRelations);
    assert.equal(state.supplyRelations.channels.find(row => row.associationId === first.id).providerId, owner(state).id);
    assert.deepEqual(owner(state).catalogConnections[0].capacityLimits, firstBody.action.data.limits);
    assert.deepEqual(owner(state).catalogConnections.slice(1), owner(original).catalogConnections.slice(1));
    const secondBody = command(state, second, { rpm: 600, tpm: 1000000, concurrency: 20 });
    assert.equal((await send(secondBody)).status, 200);
    state = await reload();
    assert.equal(owner(state).catalogConnections[0].capacityLimits.rpm, 1000);
    assert.equal(owner(state).catalogConnections[1].capacityLimits.rpm, 600);
    assert.equal(owner(state).catalogConnections[2].capacityLimits, undefined);
    const stored = JSON.parse(await local.db.prepare('SELECT record_json FROM suppliers WHERE id=?').bind(owner(state).id).first('record_json'));
    assert.deepEqual(stored.catalogConnections[0].capacityLimits, firstBody.action.data.limits);
    assert.deepEqual(stored.catalogConnections[1].capacityLimits, secondBody.action.data.limits);
    assert.equal((await send(command(state, first, { rpm: 2 }))).status, 422);
    assert.equal((await send(command(state, first, { rpm: -1 }, 1))).status, 422);
    assert.equal((await send(command(state, { ...first, associationId: 'missing', id: 'missing' }, { rpm: 2 }, 1))).status, 422);
    assert.equal((await send({ ...command(original, first, { rpm: 2 }, 1), expectedRevision: original.revision })).status, 409);
    assert.deepEqual(await reload(), state);
    for (const key of ['endpoints', 'models', 'modelSupplies', 'serviceRoutes', 'modelSalePrices', 'supplyPrices']) assert.deepEqual(state[key], original[key], key);
  } finally { await local.runtime.dispose(); }
});
