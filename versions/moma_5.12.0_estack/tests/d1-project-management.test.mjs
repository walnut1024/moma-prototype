import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createHash, randomUUID } from 'node:crypto';
import { startLocalBackend } from '../database/local-runtime.js';

test('personal, commercial employee and internal employee use the same isolated project permissions', { timeout:30_000 }, async t => {
  const previous = process.env.VITE_MOMA_PRIVATE_SITE;
  process.env.VITE_MOMA_PRIVATE_SITE = '1';
  t.after(() => {
    if (previous === undefined) delete process.env.VITE_MOMA_PRIVATE_SITE;
    else process.env.VITE_MOMA_PRIVATE_SITE = previous;
  });
  const credentials = Object.fromEntries(['yyg','grzh','zqzh','qa-external','qa-internal'].map(id => [id,randomUUID()]));
  const loginHashes = Object.fromEntries(Object.entries(credentials).map(([id,value]) => [id,createHash('sha256').update(value).digest('hex')]));
  const local = await startLocalBackend({ loginHashes, presets:true });
  t.after(() => local.runtime.dispose());
  const stamp = { status:'正常', createdAt:new Date().toISOString() };
  const staff = [
    { id:'qa-external', login:'qa-external', name:'商业企业员工', ...stamp },
    { id:'qa-internal', login:'qa-internal', name:'内部员工', ...stamp },
  ];
  const addMember = (id,userId,tenantId,canCreateProjects) => ({
    id, userId, tenantId, canCreateProjects, role:'普通成员', ...stamp,
  });
  const external = addMember('qa-external-member','qa-external','zqzh',true);
  const internal = addMember('qa-internal-member','qa-internal','tenant-nanjing',true);
  const dual = addMember('qa-dual-member','grzh','zqzh',false);
  const reference = await local.db.prepare('SELECT reference_json FROM model_workspace WHERE id=1').first('reference_json');
  const data = JSON.parse(reference);
  data.users.push(...staff);
  data.memberships.push(external,internal,dual);
  await local.db.prepare('UPDATE model_workspace SET reference_json=? WHERE id=1').bind(JSON.stringify(data)).run();
  const origin = 'https://prototype.test';
  async function request(path, {cookie,body,requestOrigin=origin}={}) {
    const response=await local.runtime.dispatchFetch(origin + '/api/v1/' + path, {
      method:body ? 'POST' : 'GET', headers:{
        ...(cookie ? {cookie} : {}),
        ...(body ? {origin:requestOrigin,'x-moma-request':'1','content-type':'application/json'} : {}),
      },
      ...(body ? {body:JSON.stringify(body)} : {}),
    });
    return {status:response.status, data:await response.json(), cookie:response.headers.get('set-cookie')?.split(';')[0]};
  }
  const login = id => request('auth/sign-in',{body:{identifier:id,accessCode:credentials[id]}});
  const workspace = async cookie => {
    const result=await request('market/workspace',{cookie});
    assert.equal(result.status,200,JSON.stringify(result.data));
    return result.data;
  };
  const command = async (cookie, action, input, operationId=randomUUID()) => {
    const current=await workspace(cookie);
    return request('market/commands',{cookie,body:{
      operationId,tenantId:current.identity.tenantId,expectedRevision:current.revision,action,data:input,
    }});
  };
  const change=(cookie,projectId,type,input)=>command(cookie,'projectUpdate',{projectId,type,input});
  const switchTo=(cookie,tenantId)=>request('market/switch',{cookie,body:{tenantId}});
  const sessions=[];
  for (const [id, tenantId, name] of [['grzh','grzh','个人项目'], ['qa-external','zqzh','商业企业项目'], ['qa-internal','tenant-nanjing','内部项目']]) {
    const signed=await login(id);
    assert.equal(signed.status,200,JSON.stringify(signed.data));
    if (signed.data.tenant.id!==tenantId) assert.equal((await switchTo(signed.cookie,tenantId)).status,200);
    const view=await workspace(signed.cookie);
    assert.equal(view.identity.tenantId,tenantId);
    if(id!=='grzh'){assert.deepEqual(view.organization.audit,[]);assert(!Object.hasOwn(view.organization,'platformAccounts'));}
    assert.equal(view.canCreateProject,id!=='grzh');
    if(id!=='grzh') assert.equal(view.canManage,false);
    const created=await command(signed.cookie,'projectCreate',{name});
    assert.equal(created.status,id==='grzh' ? 422 : 200,JSON.stringify(created.data));
    const projectId=id==='grzh' ? view.projects[0].id : 'project-'+created.data.operationId;
    if(id==='grzh') {
      assert.equal(view.projects.length,1);
      assert.equal(view.projects[0].name,'默认项目');
      assert.equal(view.projects[0].inheritsSpaceModels,true);
      for (const status of ['停用','已删除']) assert.equal((await change(signed.cookie,projectId,'status',{status})).status,422);
      assert.equal((await change(signed.cookie,projectId,'settings',{name:'改名'})).status,422);
      const settings={name:'默认项目',description:'使用设置',amount:'10',warnAt:80,stop:true,retainContent:true};
      assert.equal((await change(signed.cookie,projectId,'settings',settings)).status,200);
      assert.equal((await workspace(signed.cookie)).projects[0].spendBudget.amountMicros,10_000_000);
    }
    assert.equal((await workspace(signed.cookie)).projects.find(row=>row.id===projectId).role,'项目管理员');
    const rows=[{id:randomUUID(),name:'独立密钥',enabled:true,models:null,secretPreview:'sk-demo*****abcd'}];
    assert.equal((await command(signed.cookie,'keys',{projectId,rows,billing:'按量付费'})).status,200);
    assert.equal((await workspace(signed.cookie)).keys.find(row=>row.id===rows[0].id).projectId,projectId);
    sessions.push({ cookie:signed.cookie,projectId,keyId:rows[0].id });
  }
  const [personal,commercial,employee]=sessions;
  assert.equal((await change(commercial.cookie,employee.projectId,'status',{status:'停用'})).status,422);
  assert.equal((await change(commercial.cookie,commercial.projectId,'members',{memberId:internal.id,role:'项目成员'})).status,422);
  assert.equal((await change(commercial.cookie,commercial.projectId,'exit',{})).status,422);
  assert.equal((await change(commercial.cookie,commercial.projectId,'members',{memberId:dual.id,role:'项目成员'})).status,200);
  assert.equal((await switchTo(personal.cookie,'zqzh')).status,200);
  const joined=await workspace(personal.cookie);
  assert.equal(joined.canCreateProject,false);
  assert(!joined.projects.some(row=>row.id===personal.projectId));
  assert(!joined.keys.some(row=>row.id===commercial.keyId));
  assert.equal(joined.projects.find(row=>row.id===commercial.projectId).role,'项目成员');
  assert.equal((await command(personal.cookie,'projectCreate',{name:'越权'})).status,422);
  assert.equal((await change(personal.cookie,commercial.projectId,'exit',{})).status,200);
  assert(!(await workspace(personal.cookie)).projects.some(row=>row.id===commercial.projectId));
  assert.equal((await switchTo(personal.cookie,'grzh')).status,200);
  assert((await workspace(personal.cookie)).projects.some(row=>row.id===personal.projectId));
  assert.equal((await change(commercial.cookie,commercial.projectId,'members',{memberId:dual.id,role:'项目管理员'})).status,200);
  assert.equal((await change(commercial.cookie,commercial.projectId,'exit',{})).status,200);
  assert(!(await workspace(commercial.cookie)).projects.some(row=>row.id===commercial.projectId));
  assert.equal((await switchTo(personal.cookie,'zqzh')).status,200);
  const handedOver=await workspace(personal.cookie);
  assert.equal(handedOver.projects.find(row=>row.id===commercial.projectId).ownerId,'grzh');
  assert(handedOver.keys.some(row=>row.id===commercial.keyId));
  assert.equal((await switchTo(personal.cookie,'grzh')).status,200);
  assert.equal((await change(employee.cookie,employee.projectId,'status',{status:'停用'})).status,200);
  assert.equal((await change(employee.cookie,employee.projectId,'status',{status:'正常'})).status,200);
  assert.equal((await change(employee.cookie,employee.projectId,'status',{status:'已删除'})).status,200);
  const archived=await workspace(employee.cookie);
  assert.equal(archived.projects.find(row=>row.id===employee.projectId).status,'已删除');
  assert(archived.projectAudits.some(row=>row.projectId===employee.projectId && row.action==='删除项目'));
  assert.equal((await command(employee.cookie,'keys',{projectId:employee.projectId,rows:[],billing:'按量付费'})).status,422);

  const owner=await login('zqzh');
  assert((await workspace(owner.cookie)).organization.audit.length>0);
  assert.deepEqual((await workspace(commercial.cookie)).organization.audit,[]);
  const admin=await login('yyg');
  assert.equal((await request('application',{cookie:admin.cookie})).data.customerOrderScope,'space');
  const projectQuery = session => 'audit-logs?project='+session.projectId+'&limit=1';
  for (const session of sessions) {
    assert.equal((await request(projectQuery(session),{cookie:session.cookie})).status,401);
    const result=await request(projectQuery(session),{cookie:admin.cookie});
    assert.equal(result.status,200,JSON.stringify(result.data));
    const [event] = result.data.items;
    assert.equal(event.scope.project_id,session.projectId);
    const detail=await request('audit-logs/'+event.event_id,{cookie:admin.cookie});
    assert.equal(detail.data.event.scope.project_id,session.projectId);
    assert(!JSON.stringify(detail.data).includes('sk-demo'));
    const next=await request(projectQuery(session)+'&after='+result.data.nextCursor,{cookie:admin.cookie});
    assert.equal(next.data.items[0].scope.project_id,session.projectId);
    assert.notEqual(next.data.items[0].event_id,event.event_id);
  }
  const wrongTenant = await request(projectQuery(personal)+'&tenant=zqzh',{cookie:admin.cookie});
  assert.deepEqual(wrongTenant.data.items,[]);
  const policy={expectedRevision:0,personalEnabled:false};
  assert.equal((await request('project-space-policy',{body:policy})).status,401);
  assert.equal((await request('project-space-policy',{cookie:commercial.cookie,body:policy})).status,401);
  assert.equal((await request('project-space-policy',{cookie:admin.cookie,body:policy,requestOrigin:'https://other.test'})).status,403);
  assert.equal((await request('project-space-policy',{cookie:admin.cookie,body:policy})).status,200);
  assert.equal((await request('project-space-policy',{cookie:admin.cookie,body:policy})).status,409);
  assert.equal((await request('market/workspace',{cookie:personal.cookie})).status,401);
  const internalOnly=await login('grzh');
  assert.deepEqual(internalOnly.data.spaces.map(row=>row.id),['zqzh']);
  assert.equal((await switchTo(internalOnly.cookie,'grzh')).status,403);
  assert.equal((await request('project-space-policy',{cookie:admin.cookie,body:{expectedRevision:1,personalEnabled:true}})).status,200);
  assert((await workspace(personal.cookie)).projects.some(row=>row.id===personal.projectId));
  const changes = await request('audit-logs?action=site.personal_space.configure',{cookie:admin.cookie});
  assert.equal(changes.data.items.length,2);
  const siteChange = await request('audit-logs/'+changes.data.items.find(row=>row.event_id==='space-policy:1').event_id,{cookie:admin.cookie});
  assert.deepEqual(siteChange.data.event.changes[0].before,{state:'known',value:true});
  assert.deepEqual(siteChange.data.event.changes[0].after,{state:'known',value:false});
});
