import assert from 'node:assert/strict';
import { createHash, randomUUID } from 'node:crypto';
import { test } from 'node:test';
import { startLocalBackend } from '../database/local-runtime.js';

test('cluster management protects deployed topology and removes eligible clusters as a batch', async t => {
  const accessCode = randomUUID();
  const hash = createHash('sha256').update(accessCode).digest('hex');
  const local = await startLocalBackend({ presets: true, loginHashes: { 'admin-002': hash, 'admin-003': hash } });
  t.after(() => local.runtime.dispose());
  await local.db.prepare("INSERT OR IGNORE INTO admin_accounts(id,name,role,enabled) VALUES('admin-003','运营测试','运营人员',1)").run();

  const origin = 'https://moma.test';
  async function request(path, cookie, body) {
    const response = await local.runtime.dispatchFetch(origin + '/api/v1' + path, {
      method: body ? 'POST' : 'GET',
      headers: {
        ...(cookie && { cookie }),
        ...(body && { origin, 'content-type': 'application/json', 'x-moma-request': '1' }),
        ...(body?.operationId && { 'idempotency-key': body.operationId }),
      },
      ...(body && { body: JSON.stringify(body) }),
    });
    return { status: response.status, data: await response.json(), cookie: response.headers.get('set-cookie')?.split(';')[0] };
  }

  const maintenance = await request('/auth/login', null, { accountId: 'admin-002', accessCode });
  const operator = await request('/auth/login', null, { accountId: 'admin-003', accessCode });
  assert.equal(maintenance.status, 200);
  assert.equal(operator.status, 200);
  const application = () => request('/application', maintenance.cookie);
  const command = (revision, action, cookie = maintenance.cookie) => request('/application/commands', cookie, {
    operationId: randomUUID(), expectedRevision: revision, action,
  });
  const change = ids => ({ type: 'batch', changes: ids.map(id => ({ type: 'remove', collection: 'clusters', id })) });
  const initial = (await application()).data;
  const occupied = initial.clusters.find(row => row.nodes > 0);
  const clusterId = `cluster-${randomUUID()}`;
  const created = await command(initial.revision, { type: 'add', collection: 'clusters', record: {
    id: clusterId, clusterId: 'cluster-management-test', name: '集群管理测试', nodes: 0, totalGpu: 0, allocatedGpu: 0, status: '待注册',
  } });
  assert.equal(created.status, 200, JSON.stringify(created.data));
  const before = (await application()).data;
  const denied = await command(before.revision, change([clusterId]), operator.cookie);
  assert.equal(denied.status, 403, JSON.stringify(denied.data));
  const blocked = await command(before.revision, change([clusterId, occupied.id]));
  assert.equal(blocked.status, 422, JSON.stringify(blocked.data));
  assert.match(JSON.stringify(blocked.data), /仍有节点/);
  const unchanged = (await application()).data;
  assert.equal(unchanged.revision, before.revision);
  assert.deepEqual(unchanged.clusters, before.clusters);
  const removed = await command(before.revision, change([clusterId]));
  assert.equal(removed.status, 200, JSON.stringify(removed.data));
  const final = (await application()).data;
  assert.deepEqual(final.clusters, before.clusters.filter(row => row.id !== clusterId));

  const topologyId = `topology-${randomUUID()}`;
  const layers = [
    { id: 'rack', name: '机架', labelKey: 'topology.gpustack.ai/rack' },
    { id: 'room', name: '机房', labelKey: 'bench.example/room' },
  ];
  const newCluster = await command(final.revision, { type: 'add', collection: 'clusters', record: {
    id: topologyId, clusterId: 'cluster-topology-test', name: '集群拓扑测试', nodes: 0, totalGpu: 0, allocatedGpu: 0,
    topologyLayers: layers, status: '待注册',
  } });
  assert.equal(newCluster.status, 200, JSON.stringify(newCluster.data));
  // Install prior persisted deployment references before exercising the topology command.
  for (const [id, layer, retiredAt] of [['current-room', 'room'], ['stopped-rack', 'rack'], ['historical-zone', 'old-zone', '2026-10-01']]) {
    await local.db.prepare("UPDATE model_workspace SET reference_json=json_insert(reference_json, '$.deployments[#]', json(?)) WHERE id=1")
      .bind(JSON.stringify({ id, name: id, clusterId: topologyId, status: '停止', retiredAt, pdSettings: { gather: { layer, strategy: 'MustGather' } } })).run();
  }
  const fixed = (await application()).data;
  const topologyChange = topologyLayers => ({ type: 'update', collection: 'clusters', id: topologyId, changes: { topologyLayers } });
  const blockedRemoval = await command(fixed.revision, topologyChange(layers.slice(0, 1)));
  assert.equal(blockedRemoval.status, 422, JSON.stringify(blockedRemoval.data));
  assert.match(JSON.stringify(blockedRemoval.data), /current-room/);
  const disabledRack = topologyChange([{ ...layers[0], disabled: true }, layers[1]]);
  const blockedDisabled = await command(fixed.revision, disabledRack);
  assert.equal(blockedDisabled.status, 422, JSON.stringify(blockedDisabled.data));
  assert.match(JSON.stringify(blockedDisabled.data), /stopped-rack/);
  assert.equal((await command(fixed.revision, disabledRack, operator.cookie)).status, 403);
  assert.equal((await application()).data.revision, fixed.revision);

  const keepImplicitRack = await command(fixed.revision, topologyChange(layers.slice(1)));
  assert.equal(keepImplicitRack.status, 200, JSON.stringify(keepImplicitRack.data));
  assert.equal((await command(fixed.revision, topologyChange([]))).status, 409);
  const saved = (await application()).data;
  assert.deepEqual(saved.clusters.find(row => row.id === topologyId).topologyLayers, layers.slice(1));
  assert.deepEqual(saved.deployments, fixed.deployments);
});
