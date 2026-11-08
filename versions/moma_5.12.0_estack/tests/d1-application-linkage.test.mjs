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
  const passwords=Object.fromEntries(['yyg','zqzh','grzh','admin-002','linked-member'].map(id=>[id,randomUUID()]));
  const loginHashes=Object.fromEntries(Object.entries(passwords).map(([id,password])=>[id,createHash('sha256').update(password).digest('hex')]));
  let local;
  try {
    local=await startLocalBackend({ persistPath, loginHashes });
    const request=async (path,{ cookie, body }={})=>{
      const headers={ ...(cookie?{ Cookie:cookie }:{}), ...(body?{ 'X-MoMA-Request':'1', Origin:local.url.origin,'Content-Type':'application/json' }:{}) };
      if (path==='application/commands') headers['Idempotency-Key']=body.operationId;
      const response=await fetch(new URL('api/v1/'+path,local.url),{ headers, ...(body?{method:'POST',body:JSON.stringify(body)}:{}) });
      return { status:response.status, data:await response.json(), cookie:response.headers.get('set-cookie')?.split(';')[0] };
    };
    const customerLogin=(username,accountType,accessCode)=>request('market/login',{body:{username,accountType,accessCode}});
    const login=(id,admin=false)=>admin ? request('auth/login',{body:{accountId:id,accessCode:passwords[id]}})
      : customerLogin(id,id==='grzh'?'personal':'enterprise',passwords[id]);
    assert.equal((await request('market/workspace')).status,401);
    const admin=await login('yyg',true);
    const [business,personal]=await Promise.all([login('zqzh'),login('grzh')]);
    assert.equal(admin.data.account.role,'平台管理员');
    assert.equal(business.data.tenant.type,'企业');
    assert.equal(personal.data.tenant.type,'个人');
    assert.equal((await customerLogin('grzh','enterprise',passwords.grzh)).status,401);
    assert.equal((await customerLogin('yyg','enterprise',passwords.yyg)).status,401);
    assert.equal((await request('auth/login',{body:{accountId:'grzh',accessCode:passwords.grzh}})).status,401);
    assert.equal((await request('auth/me',{cookie:business.cookie})).status,401);
    assert.equal((await request('market/workspace',{cookie:admin.cookie})).status,401);
    const phone='13900908070', password='qa1'+randomUUID();
    const codeResult=await request('market/signup-code',{body:{phone}});
    assert.equal(codeResult.status,200);
    assert.equal((await request('market/signup-code',{body:{phone}})).status,429);
    const signup={phone,challengeId:codeResult.data.id,code:codeResult.data.code,password,consent:true};
    const badCode=signup.code==='000000'?'999999':'000000';
    assert.equal((await request('market/signup',{body:{...signup,code:badCode}})).status,422);
    const registered=await request('market/signup',{body:signup});
    assert.equal(registered.status,201,JSON.stringify(registered.data.error));
    assert.equal(registered.data.tenant.type,'个人');
    assert.equal((await request('market/signup',{body:signup})).status,422);
    const signedIn=(await request('market/workspace',{cookie:registered.cookie})).data;
    assert.equal(signedIn.profile.account,phone);
    assert.equal(signedIn.projects.length,1);
    assert.notEqual(signedIn.identity.userId,signedIn.identity.tenantId);
    assert(!JSON.stringify(signedIn).includes(password));

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

    const maintenance=await login('admin-002',true);
    assert.equal(maintenance.data.account.role,'运维人员');
    const restricted=await request('application/open',{cookie:maintenance.cookie,body:{}});
    assert.equal(restricted.status,200,JSON.stringify(restricted.data.error));
    for(const field of ['users','memberships','projects','apiKeys','grants','orders','bills','ledger','identityEvents','modelSalePrices','supplyPrices']){
      assert(!Object.hasOwn(restricted.data,field),field);
    }
    assert.deepEqual(restricted.data.gatewayKeyOptions.find(row=>row.id==='linkage-test-key'),
      {id:'linkage-test-key',keyId:'linkage-test-key',status:'有效'});
    assert(restricted.data.tenants.every(row=>!Object.hasOwn(row,'ownerId')));
    assert.equal(restricted.data.clusters.length,app.clusters.length);

    const tenantCommand=async (login,tenantId,action,data)=>{
      const expectedRevision=(await request('market/workspace',{cookie:login.cookie})).data.revision;
      return request('market/commands',{cookie:login.cookie,body:{operationId:randomUUID(),tenantId,expectedRevision,action,data}});
    };
    const [keep]=operation.data.rows;
    const retired={...keep,id:'linkage-retired-key',quotaLimit:987654,quotaType:'日'};
    const unlimited={...keep,id:'linkage-retired-unlimited-key'};
    const writeKeys=(login,tenantId,rows)=>tenantCommand(login,tenantId,'keys',{billing:'按量付费',rows});
    assert.equal((await writeKeys(business,'zqzh',[keep,retired,unlimited])).status,200);
    assert.equal((await writeKeys(business,'zqzh',[keep])).status,200);
    const afterDelete=(await request('application',{cookie:admin.cookie})).data;
    assert.equal(afterDelete.grants.find(row=>row.subjectId===retired.id).status,'已停用');
    assert.equal((await writeKeys(personal,'grzh',[retired])).status,422);
    assert.equal((await writeKeys(personal,'grzh',[unlimited])).status,422);

    const org=(await request('market/workspace',{cookie:business.cookie})).data.organization;
    const account=org.platformAccounts.find(row=>!org.members.some(member=>member.account===row.account));
    assert(account);
    const invited={id:'linkage-member',name:account.name,phone:account.phone,account:account.account,
      role:'普通成员',status:'待加入',departmentId:'root'};
    const writeOrg=data=>tenantCommand(business,'zqzh','organization',data);
    const invitation=await writeOrg({...org,members:[...org.members,invited]});
    assert.equal(invitation.status,200,JSON.stringify(invitation.data.error));
    const activeOrg=(await request('market/workspace',{cookie:business.cookie})).data.organization;
    const renamed={...activeOrg.members.find(row=>row.id===invited.id),name:'企业内部显示名',phone:'13900009999'};
    assert.equal(renamed.userId,account.sourceUserId);
    const edit=await writeOrg({...activeOrg,members:activeOrg.members.map(row=>row.id===renamed.id?renamed:row)});
    assert.equal(edit.status,200,JSON.stringify(edit.data.error));
    const edited=(await request('market/workspace',{cookie:business.cookie})).data.organization;
    assert.equal(edited.members.find(row=>row.id===renamed.id).name,renamed.name);
    assert.equal(edited.members.find(row=>row.id===renamed.id).phone,renamed.phone);
    assert.deepEqual(edited.platformAccounts.find(row=>row.sourceUserId===account.sourceUserId),account);
    const globalUser=(await request('application',{cookie:admin.cookie})).data.users.find(row=>row.id===account.sourceUserId);
    assert.equal(globalUser.name,account.name);
    assert.equal(globalUser.phone,account.phone);

    const member={id:'linked-member',login:'qa-member',phone:'13900139000',name:'双空间成员',status:'正常'};
    await local.db.prepare(`UPDATE model_workspace SET reference_json=json_insert(reference_json,
      '$.users[#]',json(?),'$.tenants[#]',json(?),'$.memberships[#]',json(?)) WHERE id=1`)
      .bind(JSON.stringify(member),JSON.stringify({id:'member-private-space',type:'个人',status:'正常',ownerId:member.id,name:'个人空间'}),
        JSON.stringify({id:'linked-member-business',userId:member.id,tenantId:'zqzh',role:'普通成员',status:'正常'})).run();
    const memberSession=await customerLogin(member.login,'enterprise',passwords[member.id]);
    assert.equal(memberSession.status,200);
    const memberWorkspace=(await request('market/workspace',{cookie:memberSession.cookie})).data;
    assert.equal(memberWorkspace.identity.userId,member.id);
    assert.equal(memberWorkspace.identity.tenantId,'zqzh');
    assert.equal(memberWorkspace.canManage,false);
    assert(!memberWorkspace.keys.some(row=>row.id===keep.id));
    assert.equal((await request('market/switch',{cookie:memberSession.cookie,body:{tenantId:'grzh'}})).status,403);
    assert.equal((await request('market/switch',{cookie:memberSession.cookie,body:{tenantId:'member-private-space'}})).status,200);
    const switched=(await request('market/workspace',{cookie:memberSession.cookie})).data;
    assert.equal(switched.identity.userId,member.id);
    assert.equal(switched.identity.tenantId,'member-private-space');
    const idNumber='11010519491231002X';
    assert.equal((await tenantCommand(memberSession,'member-private-space','certifyPersonal',{name:'演示成员',idNumber,consent:true})).status,200);
    const company={subjectType:'enterprise',companyName:'验收测试有限公司',taxId:'REG20261006',province:'江苏省',city:'南京市',
      industry:'I',contactName:'演示成员',authorized:true,authorizationRole:'legal-representative',contactIdentity:'13800138000'};
    assert.equal((await tenantCommand(memberSession,'member-private-space','certifyEnterprise',company)).status,200);
    const certified=(await request('market/workspace',{cookie:memberSession.cookie})).data;
    assert.equal(certified.profile.realNameCertification.status,'审核中');
    assert(!JSON.stringify(certified).includes(idNumber));
    assert.equal(certified.applications[0].applicantUserId,member.id);
    assert.equal(certified.applications[0].contactIdentity,member.phone);
    assert.equal(certified.applications[0].status,'待处理');
    assert.deepEqual((await request('market/workspace',{cookie:personal.cookie})).data.applications,[]);
    assert.equal((await writeKeys(memberSession,'zqzh',[])).status,409);
    assert.equal((await request('market/switch',{cookie:memberSession.cookie,body:{tenantId:'zqzh'}})).status,200);
    await local.db.prepare("UPDATE model_workspace SET reference_json=json_set(reference_json,'$.memberships[#-1].status','停用') WHERE id=1").run();
    assert.equal((await request('market/workspace',{cookie:memberSession.cookie})).status,401);

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
    const registeredAgain=await customerLogin(phone,'personal',password);
    assert.equal(registeredAgain.status,200);
    assert.equal(registeredAgain.data.tenant.id,registered.data.tenant.id);
    const persisted=(await request('market/workspace',{cookie:business.cookie})).data;
    assert.equal(persisted.keys.find(row=>row.id==='linkage-test-key').secretPreview,'sk-demo*****abcd');
    assert.equal(persisted.organization.members.find(row=>row.id===renamed.id).name,renamed.name);
    assert.equal((await writeKeys(business,'zqzh',[keep,retired])).status,422);
    assert.equal((await request('application',{cookie:admin.cookie})).data.providers.length,4);
  } finally {
    await local?.runtime.dispose();
    await rm(persistPath,{recursive:true,force:true});
  }
});
