import assert from 'node:assert/strict';
import { createHash, randomUUID } from 'node:crypto';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';
import { supplierDirectory } from '../src/admin-v2/moma-provider.js';
import { supplierModelChannelGroups } from '../src/admin-v2/supplier-model-channel-table.js';
import { startLocalBackend } from '../database/local-runtime.js';

test('the preset administrator and customers share D1 while their workspaces stay isolated after a restart', { timeout:30_000 }, async () => {
  const persistPath=await mkdtemp(join(tmpdir(),'moma5120-linkage-'));
  const passwords=Object.fromEntries(['yyg','zqzh','grzh'].map(id=>[id,randomUUID()]));
  const loginHashes=Object.fromEntries(Object.entries(passwords).map(([id,password])=>[id,createHash('sha256').update(password).digest('hex')]));
  let local;
  try {
    local=await startLocalBackend({ persistPath, loginHashes });
    const request=async (path,{ cookie, body }={})=>{
      const headers={ ...(cookie?{ Cookie:cookie }:{}), ...(body?{ 'X-MoMA-Request':'1', Origin:local.url.origin,'Content-Type':'application/json' }:{}) };
      if (path==='application/commands') headers['Idempotency-Key']=body.operationId;
      const response=await fetch(new URL('api/5120/'+path,local.url),{ headers, ...(body?{method:'POST',body:JSON.stringify(body)}:{}) });
      return { status:response.status, data:await response.json(), cookie:response.headers.get('set-cookie')?.split(';')[0] };
    };
    const login=(id,admin=false)=>request(admin?'auth/login':'market/login',{body:{[admin?'accountId':'tenantId']:id,accessCode:passwords[id]}});
    assert.equal((await request('market/workspace')).status,401);
    const admin=await login('yyg',true);
    const [business,personal]=await Promise.all([login('zqzh'),login('grzh')]);
    assert.equal(admin.data.account.role,'平台管理员');
    assert.equal(business.data.tenant.type,'企业');
    assert.equal(personal.data.tenant.type,'个人');

    const state=(await request('application',{cookie:admin.cookie})).data;
    assert.ok(state.tenants.some(row=>row.id==='zqzh'));
    assert.ok(state.tenants.some(row=>row.id==='grzh'));
    const rows=state.providers.flatMap(provider=>provider.catalogConnections.map(channel=>[provider.name,channel.sourceName]));
    assert.deepEqual(rows, [['移动云','自营'],['移动云','原厂转售'],['阿里云','自营'],['阿里云','原厂转售'],['深度求索','自营'],['智谱','自营']]);
    const visible=supplierDirectory(state);
    assert.equal(visible.length,4);
    assert.equal(visible.flatMap(provider=>supplierModelChannelGroups(state,provider)).filter(group=>group.modelId).flatMap(group=>group.channels).length,6);
    for(const id of ['glm-5.3','deepseek-flash','deepseek-v4-pro','seedance-2.5']) assert.ok(state.modelTemplates.some(row=>row.modelId===id),id);
    assert.equal((await local.db.prepare('PRAGMA foreign_key_check').all()).results.length,0);
    const workspace=await request('market/workspace',{cookie:business.cookie});
    assert.equal(workspace.data.identity.tenantId,'zqzh');
    assert.equal(workspace.data.organization.members[0].role,'企业管理员');
    const operation={ operationId:randomUUID(), tenantId:'zqzh', expectedRevision:workspace.data.revision, action:'keys',
      data:{ billing:'按量付费',rows:[{id:'linkage-test-key',name:'原型验收 Key',enabled:true,models:null,secretPreview:'sk-demo*****abcd'}] } };
    assert.equal((await request('market/commands',{cookie:personal.cookie,body:operation})).status,409);
    assert.equal((await request('market/commands',{cookie:business.cookie,body:operation})).status,200);
    assert.equal((await request('market/commands',{cookie:business.cookie,body:operation})).status,200);
    assert.equal((await request('market/commands',{cookie:business.cookie,body:{...operation,operationId:randomUUID()}})).status,409);
    const app=(await request('application',{cookie:admin.cookie})).data;
    assert.equal(app.apiKeys.find(row=>row.id==='linkage-test-key').tenantId,'zqzh');
    assert.ok(!(await request('market/workspace',{cookie:personal.cookie})).data.keys.some(row=>row.id==='linkage-test-key'));

    const adminCommand=async action=>{
      const revision=(await request('application',{cookie:admin.cookie})).data.revision;
      return request('application/commands',{cookie:admin.cookie,body:{operationId:randomUUID(),expectedRevision:revision,action}});
    };
    assert.equal((await adminCommand({type:'individual',operation:'edit',tenantId:'grzh',data:{nickname:'个人演示改名'}})).status,200);
    assert.equal((await request('market/workspace',{cookie:personal.cookie})).data.profile.name,'个人演示改名');

    const runtime=app.artifacts.find(row=>row.type==='运行时镜像' && row.validation==='通过' && row.status==='可运行');
    const cluster=app.clusters.find(row=>row.status==='运行中' && row.totalGpu>row.allocatedGpu);
    assert(runtime && cluster);
    const deployment={deploymentId:'linkage-test',name:'演示部署',modelId:'model-1',runtimeId:runtime.id,weightPath:'/models/demo',
      clusterId:cluster.id,namespace:'demo',replicas:1,gpuPerReplica:1,tensorParallel:1,pipelineParallel:1,gpuMemoryUtilization:0.9,startupTimeout:30};
    const created=await adminCommand({type:'deploymentOperation',operation:'create',data:deployment});
    assert.equal(created.status,200,JSON.stringify(created.data));
    const saved=(await request('application',{cookie:admin.cookie})).data.deployments.find(row=>row.deploymentId===deployment.deploymentId);
    const checked=await adminCommand({type:'deploymentOperation',operation:'check',deploymentId:saved.id});
    assert.equal(checked.status,200,JSON.stringify(checked.data));
    const ready=(await request('application',{cookie:admin.cookie})).data;
    assert.equal(ready.deployments.find(row=>row.id===saved.id).status,'运行中');
    assert.ok(ready.endpoints.some(row=>row.id===ready.deployments.find(item=>item.id===saved.id).endpointId));
    assert.equal(ready.models.length,0,'模拟部署不得自动发布服务');

    const temporaryPassword=randomUUID(),loginDigest=createHash('sha256').update(temporaryPassword).digest('hex');
    const createdAdmin=await adminCommand({type:'adminAccount',operation:'create',id:'admin-validation',
      loginDigest,values:{account:'qa@example.invalid',accountType:'email',name:'验收运营',role:'运营人员'}});
    assert.equal(createdAdmin.status,200,JSON.stringify(createdAdmin.data));
    const operator=await request('auth/login',{body:{accountId:'qa@example.invalid',accessCode:temporaryPassword}});
    assert.equal(operator.data.account.role,'运营人员');
    assert(!JSON.stringify((await request('application',{cookie:operator.cookie})).data).includes(loginDigest));
    assert.equal((await request('application/commands',{cookie:operator.cookie,body:{operationId:randomUUID(),
      expectedRevision:createdAdmin.data.revision,action:{type:'adminAccount',operation:'toggle',id:'yyg'}}})).status,403);

    await local.runtime.dispose();
    local=null;
    local=await startLocalBackend({ persistPath, loginHashes, presets:true });
    const persisted=(await request('market/workspace',{cookie:business.cookie})).data;
    assert.equal(persisted.keys.find(row=>row.id==='linkage-test-key').secretPreview,'sk-demo*****abcd');
    assert.equal((await request('application',{cookie:admin.cookie})).data.providers.length,4);
  } finally {
    await local?.runtime.dispose();
    await rm(persistPath,{recursive:true,force:true});
  }
});
