import assert from 'node:assert/strict';
import { createHash, randomUUID } from 'node:crypto';
import test from 'node:test';
import { API_PREFIX } from '../api-path.js';
import { startLocalBackend } from '../database/local-runtime.js';

test('deployment import and batch operations commit atomically and retain deleted deployment history', async t => {
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
  const stopped=await command(afterCreate.revision,'batch',{operation:'stop',ids});
  assert.equal(stopped.status,200,JSON.stringify(stopped.data));
  const afterStop=await read();
  assert.equal(allocated(afterStop),allocated(initial));
  const deleted=await command(afterStop.revision,'batch',{operation:'delete',ids});
  assert.equal(deleted.status,200,JSON.stringify(deleted.data));
  const final=await read();
  assert.equal(allocated(final),allocated(initial));
  assert.deepEqual(final.artifacts,initial.artifacts);
  assert(final.deployments.filter(row=>ids.includes(row.id)).every(row=>row.retiredAt && row.status==='停止' && row.events.length>=3));
});
