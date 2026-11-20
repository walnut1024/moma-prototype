import assert from 'node:assert/strict';
import { createHash, randomUUID } from 'node:crypto';
import { test } from 'node:test';
import { startLocalBackend } from '../database/local-runtime.js';
import { userBusinessData } from '../src/business-facts.mjs';
import { resourceId } from '../src/resource-id.mjs';

test('an authenticated system demo user receives distinct sessions and samples stay outside account statistics', {timeout:30_000}, async t => {
  process.env.VITE_MOMA_PRIVATE_SITE='1';
  const accessCode=randomUUID();
  const passwordDigest=createHash('sha256').update(accessCode).digest('hex');
  const local=await startLocalBackend({loginHashes:{'admin-002':passwordDigest}});
  t.after(()=>local.runtime.dispose());
  const adminId=await local.db.prepare("SELECT id FROM admin_accounts WHERE login_name='admin-001'").first('id');
  assert.match(adminId,/^admin-account-/);
  await local.db.prepare('UPDATE admin_accounts SET access_hash=? WHERE id=?').bind(passwordDigest,adminId).run();
  const origin='https://prototype.test';
  async function request(path, {body,cookie}={}) {
    const response=await local.runtime.dispatchFetch(origin+'/api/v1/'+path,{
      method:body ? 'POST' : 'GET',
      headers:{...(cookie && {cookie}),...(body && {origin,'x-moma-request':'1','content-type':'application/json'})},
      ...(body && {body:JSON.stringify(body)}),
    });
    return {status:response.status,data:await response.json(),cookies:response.headers.getSetCookie().filter(value=>!value.includes('Max-Age=0')).map(value=>value.split(';')[0])};
  }
  const signIn=(identifier,password=accessCode)=>request('auth/sign-in',{body:{identifier,accessCode:password}});
  assert.equal((await signIn('admin-001',randomUUID())).status,401);
  assert.equal((await request('market/login',{body:{username:'admin-001',accountType:'enterprise',accessCode}})).status,401);
  const scoped=await request('auth/login',{body:{accountId:'admin-001',accessCode}});
  assert.equal(scoped.cookies.length,1);
  assert.equal((await signIn('admin-001')).cookies.length,1);

  const tenant={id:'zqzh',name:'政企演示账号',type:'企业',ownerId:'front-demo-admin-001',status:'正常',demo:true};
  const project={id:resourceId('project'),tenantId:tenant.id,name:'默认项目',ownerId:tenant.ownerId,status:'正常'};
  await local.db.prepare(`UPDATE model_workspace SET reference_json=json_insert(reference_json,
    '$.tenants[#]',json(?),'$.projects[#]',json(?)) WHERE id=1`)
    .bind(JSON.stringify(tenant),JSON.stringify(project)).run();

  const dual=await signIn('admin-001');
  assert.equal(dual.status,200,JSON.stringify(dual.data));
  assert.equal(dual.data.account.id,adminId);
  assert.deepEqual(dual.data.spaces.map(space=>space.id),['zqzh']);
  assert.equal(dual.cookies.length,2);
  const [admin,market]=dual.cookies;
  assert.match(admin,/^moma5120_v2_session=/);
  assert.match(market,/^moma5120_v2_market=/);
  assert.notEqual(admin.split('=')[1],market.split('=')[1]);
  assert.equal((await request('auth/me',{cookie:market})).status,401);
  assert.equal((await request('market/workspace',{cookie:admin})).status,401);
  assert.equal((await request('auth/me',{cookie:admin})).data.account.selectedEnterprise,undefined);
  assert.deepEqual((await request('auth/me',{cookie:admin+'; '+market})).data.account.selectedEnterprise,
    {id:tenant.id,name:tenant.name});
  const front=await request('market/workspace',{cookie:market});
  assert.equal(front.status,200);
  assert.equal(front.data.identity.tenantId,'zqzh');
  assert.equal(front.data.identity.userId,'front-demo-admin-001');
  assert.equal(front.data.canCreateProject,true);
  assert.deepEqual(front.data.projects.map(row=>row.id),[project.id]);
  assert.equal((await request('market/login',{body:{username:'admin-001',accountType:'enterprise',accessCode}})).status,401);
  const other=await signIn('admin-002');
  assert.equal(other.cookies.length,1);
  assert.equal(other.data.account.role,'运维人员');

  assert.equal((await signIn('admin-001')).cookies.length,2);
  const state=(await request('application',{cookie:admin})).data;
  assert.deepEqual(state.accountUserIds,['front-demo-admin-001']);
  assert.deepEqual(userBusinessData(state,[]).users.map(row=>row.id).sort(),state.accountUserIds);
  assert.equal(state.memberships.filter(row=>row.userId==='front-demo-admin-001').length,1);
  assert.equal(state.users.filter(row=>row.login==='admin-001').length,1);

  const second = {...tenant,id:'enterprise-two',name:'第二企业'};
  const memberOnly = {...tenant,id:'member-only',name:'仅普通成员企业'};
  const otherEnterprise = {...tenant,id:'other-enterprise',name:'其他企业'};
  const personal = {...tenant,id:'personal-space',type:'个人',name:'个人空间'};
  const secondProject = {...project,id:resourceId('project'),tenantId:second.id,name:'第二企业项目'};
  const references=JSON.parse(await local.db.prepare('SELECT reference_json FROM model_workspace WHERE id=1').first('reference_json'));
  references.tenants.push(second,memberOnly,otherEnterprise,personal);
  references.projects.push(secondProject);
  references.memberships.push(
    {id:'member-second',tenantId:second.id,userId:tenant.ownerId,status:'正常',role:'企业管理员'},
    {id:'member-read',tenantId:memberOnly.id,userId:tenant.ownerId,status:'正常',role:'普通成员'},
  );
  await local.db.prepare('UPDATE model_workspace SET reference_json=? WHERE id=1').bind(JSON.stringify(references)).run();

  const chooser=await signIn('admin-001');
  assert.equal(chooser.status,200);
  assert.equal(chooser.data.selectEnterprise,true);
  assert.deepEqual(chooser.data.spaces.map(space=>space.id).sort(),[second.id,tenant.id].sort());
  assert.deepEqual(chooser.cookies,[]);
  const pickSpace=tenantId=>request('auth/sign-in',{body:{identifier:'admin-001',accessCode,tenantId}});
  for(const blocked of [memberOnly.id,otherEnterprise.id,personal.id]) assert.equal((await pickSpace(blocked)).status,403);
  assert.equal((await request('market/switch',{body:{tenantId:second.id},cookie:market})).status,403);
  const signOut=await request('auth/logout',{body:{},cookie:admin+'; '+market});
  assert.equal(signOut.status,200);
  assert.equal((await request('auth/me',{cookie:admin})).status,401);
  assert.equal((await request('market/workspace',{cookie:market})).status,401);

  const selected=await pickSpace(second.id);
  assert.equal(selected.status,200);
  const [nextAdmin,nextMarket]=selected.cookies;
  const nextPair=nextAdmin+'; '+nextMarket;
  const me=await request('auth/me',{cookie:nextPair});
  assert.deepEqual(me.data.account.selectedEnterprise,{id:second.id,name:second.name});
  assert.equal((await request('auth/me',{cookie:other.cookies[0]+'; '+nextMarket})).data.account.selectedEnterprise,undefined);
  const scopedWorkspace=await request('market/workspace',{cookie:nextMarket});
  assert.equal(scopedWorkspace.status,200);
  assert.deepEqual(scopedWorkspace.data.projects.map(row=>row.id),[secondProject.id]);
  assert.deepEqual(scopedWorkspace.data.accountProjects.map(row=>row.id),[secondProject.id]);

  references.memberships.find(row=>row.id==='member-second').status='停用';
  await local.db.prepare('UPDATE model_workspace SET reference_json=? WHERE id=1').bind(JSON.stringify(references)).run();
  assert.equal((await request('auth/me',{cookie:nextPair})).data.account.selectedEnterprise,undefined);
  assert.equal((await request('market/workspace',{cookie:nextMarket})).status,401);
  assert.equal((await pickSpace(second.id)).status,403);
  await local.db.prepare("UPDATE admin_accounts SET enabled=0 WHERE login_name='admin-001'").run();
  assert.equal((await request('auth/me',{cookie:nextAdmin})).status,401);
  assert.equal((await signIn('admin-001')).status,401);
});
