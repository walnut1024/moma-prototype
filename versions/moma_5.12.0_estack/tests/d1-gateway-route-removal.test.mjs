import assert from 'node:assert/strict';
import { createHash, randomUUID } from 'node:crypto';
import { test } from 'node:test';
import { startLocalBackend } from '../database/local-runtime.js';
import { gatewayRouteDraft, gatewayRouteRecord, routeTarget } from '../src/admin-v2/gateway-route-settings.mjs';

test('deletes one unreferenced gateway route with an authorized session and preserves stored history', { timeout: 30_000 }, async t => {
  const accessCodes = Object.fromEntries(['admin-001', 'admin-002', 'test-route-operator'].map(id => [id, randomUUID()]));
  const loginHashes = Object.fromEntries(Object.entries(accessCodes).map(([id, code]) => [id, createHash('sha256').update(code).digest('hex')]));
  const { runtime, db } = await startLocalBackend({ demo: true, presets: true, inferenceDemo: true, loginHashes });
  t.after(() => runtime.dispose());
  await db.prepare('INSERT INTO admin_accounts(id,name,role) VALUES(?,?,?)').bind('test-route-operator', '路由验收运营人员', '运营人员').run();

  const request = async (path, { session, body } = {}) => {
    const response = await runtime.dispatchFetch(`https://example.test/api/v1/${path}`, {
      method: body ? 'POST' : 'GET',
      headers: { ...(session && { cookie: session }), ...(body && {
        origin: 'https://example.test', 'x-moma-request': '1', 'content-type': 'application/json',
        ...(body.operationId && { 'idempotency-key': body.operationId }),
      }) },
      ...(body && { body: JSON.stringify(body) }),
    });
    return { status: response.status, data: await response.json(), cookie: response.headers.get('set-cookie')?.split(';')[0] };
  };
  const login = async accountId => {
    const result = await request('auth/login', { body: { accountId, accessCode: accessCodes[accountId] } });
    assert.equal(result.status, 200);
    return result.cookie;
  };
  const [admin, maintenance, operations] = await Promise.all(Object.keys(accessCodes).map(login));
  const read = async (session = admin) => {
    const result = await request('application', { session });
    assert.equal(result.status, 200);
    return result.data;
  };
  const command = (session, expectedRevision, action, operationId = randomUUID()) => request('application/commands', {
    session, body: { operationId, expectedRevision, action },
  });
  const remove = id => ({ type: 'remove', collection: 'routes', id });
  const batch = (...changes) => ({ type: 'batch', label: '删除模型路由', objectId: changes[0].id, changes });

  const initial = await read();
  const deploymentRoute = initial.routes.find(route => route.routeId === 'demo-deploy-bge-m3-nj');
  const fallback = initial.fallbacks.find(rule => initial.routes.some(route => route.id === rule.routeId));
  assert.ok(deploymentRoute);
  assert.ok(fallback);
  const sample = { ...deploymentRoute, id: 'route-removal-contract', routeId: 'route-removal-contract', status: '已停用' };
  const created = await command(admin, initial.revision, { type: 'add', collection: 'routes', record: sample });
  assert.equal(created.status, 200, JSON.stringify(created.data.error));
  const historical = { id: 'request-route-removal-contract', routeId: sample.id, releaseId: 'release-2', httpStatus: 200 };
  await db.prepare("UPDATE model_workspace SET reference_json=json_insert(reference_json,'$.requests[#]',json(?)) WHERE id=1")
    .bind(JSON.stringify(historical)).run();
  const before = await read();
  const deletes = batch(remove(sample.id));
  assert.equal((await command(operations, before.revision, deletes)).status, 403);
  assert.equal((await command(admin, before.revision, remove(sample.id))).status, 403);
  assert.equal((await command(admin, before.revision, batch({ ...remove(sample.id), changes: {} }))).status, 403);
  assert.equal((await command(admin, before.revision, batch(remove(sample.id), remove(deploymentRoute.id)))).status, 403);
  assert.equal((await command(admin, before.revision, batch(remove(sample.id), {
    type: 'update', collection: 'fallbacks', id: fallback.id, changes: { status: '已停用' },
  }))).status, 403);

  const referenced = await command(admin, before.revision, batch(remove(fallback.routeId)));
  assert.equal(referenced.status, 422);
  assert.match(referenced.data.error.message, /熔断与回退规则引用/);
  const inUse = await command(admin, before.revision, batch(remove(deploymentRoute.id)));
  assert.equal(inUse.status, 422);
  assert.match(inUse.data.error.message, /运行中的模型部署使用/);
  assert.equal((await read()).revision, before.revision);

  const operationId = randomUUID();
  const removed = await command(maintenance, before.revision, deletes, operationId);
  assert.equal(removed.status, 200, JSON.stringify(removed.data.error));
  assert.deepEqual(await command(maintenance, before.revision, deletes, operationId), removed);
  assert.equal((await command(maintenance, before.revision, deletes)).status, 409);
  const after = await read();
  assert.equal(after.revision, before.revision + 1);
  assert.deepEqual(after.routes, before.routes.filter(route => route.id !== sample.id));
  assert.deepEqual(after.fallbacks, before.fallbacks);
  assert.deepEqual(after.releases, before.releases);
  const reference = JSON.parse(await db.prepare('SELECT reference_json FROM model_workspace WHERE id=1').first('reference_json'));
  assert.deepEqual(reference.requests.find(row => row.id === historical.id), historical);

  await t.test('round-trips the route editor record through HTTP for create and an existing route edit', async () => {
    const workspace = await read(maintenance);
    const original = workspace.routes.find(row => row.id === deploymentRoute.id);
    const [primary] = original.targets;
    const model = workspace.models.find(row => row.id === original.modelId);
    const alternate = workspace.endpoints.find(row => row.id !== primary.endpointId && row.modelIds.includes(model.id));
    assert.ok(alternate);
    const mapping = `${model.modelId}=gateway-embedding`;
    const draft = {
      ...gatewayRouteDraft(workspace), name: 'gateway-roundtrip-contract', path: '/v1/embeddings',
      targets: [{ ...routeTarget('target'), endpointId: primary.endpointId, weight: '100', mapping, passMultimodal: true, passPath: '/v1' }],
      headersEnabled: true, headers: [{ name: 'X-Route-Mode', value: 'qa' }],
      degradeEnabled: true, degradeCodes: ['4xx', '5xx'], degradeEndpointId: alternate.id, degradeMapping: mapping,
    };
    const record = gatewayRouteRecord(workspace, draft, undefined, 'route-roundtrip-contract');
    const created = await command(maintenance, workspace.revision, { type: 'add', collection: 'routes', record });
    assert.equal(created.status, 200, JSON.stringify(created.data.error));
    const reloaded = await read(maintenance);
    const createdRow = reloaded.routes.find(row => row.id === record.id);
    assert.deepEqual(createdRow, { ...record, createdAt: createdRow.createdAt, updatedAt: createdRow.updatedAt });
    assert.deepEqual(createdRow.pathMatch, { mode: 'prefix', value: '/v1/embeddings' });
    assert.deepEqual(createdRow.modelMatch, { mode: 'exact', value: 'gateway-embedding' });
    assert.deepEqual(createdRow.targets, [{ endpointId: primary.endpointId, weight: 100, mapping, passMultimodal: true, passPath: '/v1' }]);
    assert.deepEqual(createdRow.requestHeaders, { entries: [{ name: 'X-Route-Mode', value: 'qa' }] });
    assert.deepEqual(createdRow.degrade, { endpointId: alternate.id, codes: ['4xx', '5xx'], mapping });

    const editedRecord = gatewayRouteRecord(reloaded, { ...draft, name: original.name, path: '/compat/embeddings' }, original, original.id);
    const { id, ...changes } = editedRecord;
    const update = { type: 'update', collection: 'routes', id, changes };
    assert.equal((await command(maintenance, reloaded.revision, { ...update, changes: editedRecord })).status, 403);
    const updated = await command(maintenance, reloaded.revision, update);
    assert.equal(updated.status, 200, JSON.stringify(updated.data.error));
    const afterEdit = await read();
    const updatedRow = afterEdit.routes.find(row => row.id === original.id);
    assert.deepEqual(updatedRow, { ...editedRecord, updatedAt: updatedRow.updatedAt });
    assert.equal(updatedRow.routeId, original.routeId);
    assert.equal(updatedRow.status, original.status);
    assert.equal(updatedRow.mode, original.mode);
    assert.equal(updatedRow.releaseId, original.releaseId);
    assert.deepEqual(afterEdit.routes.find(row => row.id === record.id), createdRow);
  });

  await t.test('rejects malformed, duplicate and credential route headers through HTTP and permits clearing them', async () => {
    const workspace = await read(maintenance);
    const route = workspace.routes.find(row => row.id === 'route-roundtrip-contract');
    const invalidHeaders = [
      ...['Authorization', 'Content-Type', 'Cookie', 'Set-Cookie', 'X-API-Key', 'X-Upstream-Credential'].map(name => ({ entries: [{ name, value: 'sample' }] })),
      { entries: [{ name: 'Bad Header', value: 'sample' }] },
      { entries: [{ name: 'X-Route', value: 'sample\r\nInjected: value' }] },
      { entries: [{ name: 'X-Route', value: 'one' }, { name: 'x-route', value: 'two' }] },
      { entries: [{ name: 'X-Route', value: 'sample', extra: true }] },
      { entries: [] },
      { entries: [{ name: 'X-Route', value: 'sample' }], extra: true },
    ];
    const rejectedCreate = await command(maintenance, workspace.revision, {
      type: 'add', collection: 'routes', record: { ...route, id: 'route-rejected-header', requestHeaders: invalidHeaders[0] },
    });
    assert.equal(rejectedCreate.status, 422);
    for (const requestHeaders of invalidHeaders) {
      const rejected = await command(maintenance, workspace.revision, {
        type: 'update', collection: 'routes', id: route.id, changes: { requestHeaders },
      });
      assert.equal(rejected.status, 422, JSON.stringify(requestHeaders));
      assert.equal(rejected.data.error.code, 'BUSINESS_BLOCKED');
      assert.match(rejected.data.error.message, /有效、唯一且不含凭证/);
    }
    const beforeClear = await read();
    assert.equal(beforeClear.revision, workspace.revision);
    assert.deepEqual(beforeClear.routes, workspace.routes);
    const cleared = await command(maintenance, workspace.revision, {
      type: 'update', collection: 'routes', id: route.id, changes: { requestHeaders: null },
    });
    assert.equal(cleared.status, 200, JSON.stringify(cleared.data.error));
    const afterClear = await read();
    const saved = afterClear.routes.find(row => row.id === route.id);
    assert.equal(afterClear.revision, workspace.revision + 1);
    assert.deepEqual(saved, { ...route, updatedAt: saved.updatedAt, requestHeaders: null });
  });
});
