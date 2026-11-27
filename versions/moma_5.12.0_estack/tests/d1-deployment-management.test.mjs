import assert from 'node:assert/strict';
import { createHash, randomUUID } from 'node:crypto';
import test from 'node:test';
import { API_PREFIX } from '../api-path.js';
import { startLocalBackend } from '../database/local-runtime.js';

test('deployment batch operations preserve history and linked inference connections follow serving status', async t => {
  const accessCode = randomUUID();
  const hash = createHash('sha256').update(accessCode).digest('hex');
  const local = await startLocalBackend({ presets:true, loginHashes:{ 'admin-001':hash, 'admin-002':hash, 'admin-003':hash } });
  t.after(() => local.runtime.dispose());
  await local.db.prepare("INSERT OR IGNORE INTO admin_accounts(id,name,role,enabled) VALUES('admin-003','运营测试','运营人员',1)").run();
  const origin = 'https://moma.test';
  const request = async (path, cookie, body) => {
    const response = await local.runtime.dispatchFetch(origin + API_PREFIX + path, {
      method: body ? 'POST' : 'GET',
      headers: {
        ...(cookie && { cookie }),
        ...(body && { origin, 'content-type':'application/json', 'x-moma-request':'1' }),
        ...(body?.operationId && { 'idempotency-key':body.operationId }),
      },
      ...(body && { body:JSON.stringify(body) }),
    });
    return { status:response.status, data:await response.json(), cookie:response.headers.get('set-cookie')?.split(';')[0] };
  };
  const admin = await request('/auth/login',null,{ accountId:'admin-001',accessCode });
  const maintenance = await request('/auth/login',null,{ accountId:'admin-002',accessCode });
  const operator = await request('/auth/login',null,{ accountId:'admin-003',accessCode });
  assert.equal(admin.status,200);
  assert.equal(maintenance.status,200);
  assert.equal(operator.status,200);
  const read = async () => {
    const result=await request('/application',maintenance.cookie);
    assert.equal(result.status,200);
    return result.data;
  };
  const submit = (revision, action, cookie=maintenance.cookie) =>
    request('/application/commands',cookie,{
      operationId:randomUUID(), expectedRevision:revision, action,
    });
  const command = (revision, operation, data, cookie) =>
    submit(revision, {type:'deploymentOperation',operation,data}, cookie);
  const initial=await read();
  const cluster=initial.clusters.find(row=>row.status==='运行中');
  const model=initial.modelTemplates.find(row=>row.type==='text' && !row.deletedAt);
  const runtime=initial.artifacts.find(row=>row.type==='运行时镜像' && row.status==='可运行');
  const register = {type:'add', collection:'artifacts', record:{...runtime, id:'artifact-retired-test'}};
  const disable = {type:'update', collection:'artifacts', id:runtime.id, changes:{status:'不可运行'}};
  const mixedBatch = {type:'batch', changes:[
    {type:'update', collection:'clusters', id:cluster.id, changes:{name:'不应写入'}},
    disable,
  ]};
  for (const {cookie} of [admin, maintenance]) {
    for (const action of [register, disable, mixedBatch]) {
      assert.equal((await submit(initial.revision, action, cookie)).status, 403);
    }
  }
  const afterDenied = await read();
  assert.equal(afterDenied.revision, initial.revision);
  assert.deepEqual(afterDenied.artifacts, initial.artifacts);
  assert.deepEqual(afterDenied.clusters, initial.clusters);
  const allocated=state=>state.clusters.find(row=>row.id===cluster.id).allocatedGpu;
  const configuration = {
    modelId:model.id, clusterId:cluster.id, runtimeId:runtime.id, weightPath:'/models/parity-test', namespace:'inference',
    replicas:1, gpuPerReplica:1, tensorParallel:1, pipelineParallel:1, gpuMemoryUtilization:.9, startupTimeout:600,
  };
  const items=['parity-1','parity-2'].map(deploymentId=>({...configuration,deploymentId,name:deploymentId}));
  const denied=await command(initial.revision,'import',{items},operator.cookie);
  assert.equal(denied.status,403);
  const invalid=await command(initial.revision,'import',{items:[items[0],{...items[1],replicas:100}]});
  assert.equal(invalid.status,422);
  assert.equal((await read()).revision,initial.revision);
  assert.deepEqual((await read()).deployments,initial.deployments);
  const created=await command(initial.revision,'import',{items});
  assert.equal(created.status,200,JSON.stringify(created.data));
  const afterCreate=await read();
  const ids=afterCreate.deployments.filter(row=>items.some(item=>item.deploymentId===row.deploymentId)).map(row=>row.id);
  assert.equal(ids.length,2);
  assert.equal(allocated(afterCreate),allocated(initial)+2);
  const stale=await command(afterCreate.revision,'batch',{operation:'stop',ids:[ids[0],randomUUID()]});
  assert.equal(stale.status,422);
  assert.equal(allocated(await read()),allocated(afterCreate));
  const deployment = afterCreate.deployments.find(row => row.id === ids[0]);
  const readyResponse = await submit(afterCreate.revision, { type: 'deploymentOperation', operation: 'check', deploymentId: deployment.id });
  assert.equal(readyResponse.status, 200, JSON.stringify(readyResponse.data));
  const ready = await read();
  const savedDeployment = ready.deployments.find(row => row.id === deployment.id);
  const configuredPath = '/inference/chat/completions';
  await local.db.prepare("UPDATE channels SET record_json=json_set(record_json,'$.endpointPath',?) WHERE id=?")
    .bind(configuredPath, savedDeployment.endpointId).run();
  const modelWorkspace = async () => {
    const response = await request('/model-operations', operator.cookie);
    assert.equal(response.status, 200);
    return response.data;
  };
  const modelCommand = (revision, operation, data, cookie = operator.cookie) => request('/model-operations/commands', cookie, {
    operationId: randomUUID(), expectedRevision: revision, action: { type: 'modelOperations', operation, data },
  });
  const catalogue = await modelWorkspace();
  const target = catalogue.inferenceConnectionTargets.find(row => row.deploymentName === deployment.name);
  assert.ok(target);
  assert.deepEqual(catalogue.deployments, []);
  assert.equal(target.modelName, model.name);
  assert.equal(target.interfaceType, 'openai');
  assert.equal(target.endpointPath, configuredPath);
  assert.equal(target.endpointId, savedDeployment.endpointId);
  assert(!catalogue.inferenceConnectionTargets.some(row => row.deploymentName === items.find(row => row.name !== deployment.name).name));
  assert.equal((await request('/model-operations', maintenance.cookie)).status, 403);
  const connect = 'channelDirectoryCreateInference';
  const data = { instanceId: target.id, name: '内置部署接入验收', note: '来自平台部署', creationId: randomUUID() };
  assert.equal((await modelCommand(catalogue.revision, connect, data, maintenance.cookie)).status, 403);
  assert.equal((await modelCommand(catalogue.revision, connect, { ...data, baseUrl: 'https://override.example.invalid' })).status, 422);
  assert.equal((await modelCommand(catalogue.revision, connect, { ...data, instanceId: randomUUID() })).status, 422);
  const connected = await modelCommand(catalogue.revision, connect, data);
  assert.equal(connected.status, 200, JSON.stringify(connected.data));
  const connection = connected.data.patches.endpoints.upsert.find(row => row.directoryCreationId === data.creationId);
  assert.deepEqual(connection.inferenceSource, { deploymentId: deployment.id, endpointId: savedDeployment.endpointId, instanceId: target.id });
  assert.equal(connection.providerId, 'provider-builtin-inference');
  assert.equal(connection.authMode, 'none');
  assert.equal(connection.status, '草稿');
  assert.equal(connection.baseUrl, target.baseUrl);
  assert.equal(connection.endpointPath, configuredPath);
  const provider = connected.data.patches.providers.upsert.find(row => row.id === connection.providerId);
  assert.equal(provider.name, '内置模型推理');
  assert.equal(provider.catalogConnections.find(row => row.endpointId === connection.id).upstreamModelId, model.modelId);
  const persisted = await modelWorkspace();
  assert.equal(persisted.inferenceConnectionTargets.find(row => row.id === target.id).connectionId, connection.id);
  assert.deepEqual(persisted.providers.find(row => row.id === 'provider-self'),
    catalogue.providers.find(row => row.id === 'provider-self'));
  assert.equal((await modelCommand(persisted.revision, connect, { ...data, creationId: randomUUID() })).status, 422);
  const sourceEndpoint = persisted.endpoints.find(row => row.id === target.endpointId);
  const sourceProvider = persisted.providers.find(row => row.id === sourceEndpoint.providerId);
  const sourceChange = await modelCommand(persisted.revision, 'supplierChannelEdit', {
    endpointId: sourceEndpoint.id, providerId: sourceProvider.id, expectedUpdatedAt: sourceEndpoint.updatedAt,
    expectedProviderUpdatedAt: sourceProvider.updatedAt, baseUrl: 'https://override-source.example.invalid/v1',
    prepareConnection: true, addressOnly: true, allAssociations: true,
  });
  assert.equal(sourceChange.status, 422, JSON.stringify(sourceChange.data));
  assert.match(sourceChange.data.error.message, /仍被内置模型推理连接引用/);
  const edit = { endpointId: connection.id, providerId: provider.id, expectedUpdatedAt: connection.updatedAt,
    expectedProviderUpdatedAt: provider.updatedAt, baseUrl: connection.baseUrl };
  const rejectedEdit = await modelCommand(persisted.revision, 'supplierChannelEdit', {
    ...edit, baseUrl: 'https://override.example.invalid/v1', prepareConnection: true, addressOnly: true, allAssociations: true,
  });
  assert.equal(rejectedEdit.status, 422, JSON.stringify(rejectedEdit.data));
  assert.match(rejectedEdit.data.error.message, /由部署提供/);
  const revised = await modelCommand(persisted.revision, 'supplierChannelEdit', {
    ...edit, connectionNameOnly: true, name: '更新后的内置连接', note: '更新后的简介',
  });
  assert.equal(revised.status, 200, JSON.stringify(revised.data));
  const revisedEndpoint = revised.data.patches.endpoints.upsert.find(row => row.id === connection.id);
  assert.equal(revisedEndpoint.name, '更新后的内置连接');
  assert.equal(revisedEndpoint.directoryNote, '更新后的简介');
  const paused = await modelCommand(revised.data.revision, 'provider', {
    operation: 'disableProvider', objectId: provider.id, values: { confirmed: true },
  });
  assert.equal(paused.status, 200, JSON.stringify(paused.data));
  assert.deepEqual((await modelWorkspace()).inferenceConnectionTargets, []);
  const blocked = await modelCommand(paused.data.revision, connect, { ...data, creationId: randomUUID() });
  assert.equal(blocked.status, 422);
  assert.match(blocked.data.error.message, /内置模型推理服务商不可用/);
  const resumed = await modelCommand(paused.data.revision, 'provider', { operation: 'enableProvider', objectId: provider.id });
  assert.equal(resumed.status, 200, JSON.stringify(resumed.data));
  assert.equal((await modelWorkspace()).inferenceConnectionTargets.find(row => row.id === target.id).connectionId, connection.id);
  const verification = await modelCommand(resumed.data.revision, 'checkConnection', { endpointId: connection.id });
  assert.equal(verification.status, 200, JSON.stringify(verification.data));
  assert.equal(verification.data.patches.endpoints.upsert.find(row => row.id === connection.id).status, '运行中');

  const stopped=await command(ready.revision,'batch',{operation:'stop',ids});
  assert.equal(stopped.status,200,JSON.stringify(stopped.data));
  const afterStop=await read();
  assert.equal(allocated(afterStop),allocated(initial));
  const afterStopModel = await modelWorkspace();
  assert(!afterStopModel.inferenceConnectionTargets.some(row => row.id === target.id));
  assert.equal(afterStopModel.endpoints.find(row => row.id === connection.id).status, '停用');
  assert.equal((await modelCommand(afterStopModel.revision, 'checkConnection', { endpointId: connection.id })).status, 422);
  const deleted=await command(afterStop.revision,'batch',{operation:'delete',ids});
  assert.equal(deleted.status,200,JSON.stringify(deleted.data));
  const final=await read();
  assert.equal(allocated(final),allocated(initial));
  assert.deepEqual(final.artifacts,initial.artifacts);
  assert(final.deployments.filter(row=>ids.includes(row.id)).every(row=>row.retiredAt && row.status==='停止' && row.events.length>=3));
});
