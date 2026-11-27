import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createHash, randomUUID } from 'node:crypto';
import { startLocalBackend } from '../database/local-runtime.js';

test('only a system administrator can manage a selected tenant with the actual admin account', async t => {
  const previousPrivateSite = process.env.VITE_MOMA_PRIVATE_SITE;
  process.env.VITE_MOMA_PRIVATE_SITE='1';
  t.after(()=>{
    if (previousPrivateSite===undefined) delete process.env.VITE_MOMA_PRIVATE_SITE;
    else process.env.VITE_MOMA_PRIVATE_SITE=previousPrivateSite;
  });
  const password = randomUUID();
  const hash = createHash('sha256').update(password).digest('hex');
  const local = await startLocalBackend({ presets:true, loginHashes:{'admin-001':hash,'admin-002':hash,'zqzh':hash,'scoped-operator':hash} });
  t.after(()=>local.runtime.dispose());
  const origin = 'https://moma.test';
  async function request(path, cookie, body) {
    const response = await local.runtime.dispatchFetch(origin+'/api/v1'+path,{method:body ? 'POST':'GET',
      headers:{ ...(cookie && {cookie}), ...(body && {origin,'content-type':'application/json','x-moma-request':'1'}),
        ...(path==='/application/commands' && {'idempotency-key':body.operationId}) },
      ...(body && {body:JSON.stringify(body)})});
    return {status:response.status,data:await response.json(),cookie:response.headers.get('set-cookie')?.split(';')[0]};
  }
  const adminLogin = id=>request('/auth/login',undefined,{accountId:id,accessCode:password});
  const admin = await adminLogin('admin-001');
  const maintenance = await adminLogin('admin-002');
  assert.equal(admin.status,200,JSON.stringify(admin.data));
  assert.equal(maintenance.status,200,JSON.stringify(maintenance.data));
  const application = await request('/application',admin.cookie);
  const settings = (cookie,tenantId,operation,data)=>request('/application/commands',cookie,{
    operationId:randomUUID(),expectedRevision:application.data.revision,action:{type:'tenantServiceSettings',tenantId,operation,data},
  });
  assert.equal((await settings(maintenance.cookie,'zqzh','level',{level:'L0'})).status,403);
  const path = '/tenants/zqzh';
  assert.equal((await request(path+'/workspace')).status,401);
  assert.equal((await request(path+'/workspace',maintenance.cookie)).status,403);
  assert.equal((await request('/tenants/nonexistent/workspace',admin.cookie)).status,403);
  assert.equal((await request('/market/workspace',admin.cookie)).status,401);
  const view = await request(path+'/workspace',admin.cookie);
  assert.equal(view.status,200,JSON.stringify(view.data));
  assert.equal(view.data.identity.tenantId,'zqzh');
  assert.equal(view.data.canCreateProject,true);
  assert(view.data.projects.every(row=>!row.tenantId || row.tenantId==='zqzh'));
  const member = view.data.organization.members.find(row=>row.status==='已加入');
  const command = (action,data,tenantId='zqzh')=>request(path+'/commands',admin.cookie,{
    operationId:randomUUID(),expectedRevision:view.data.revision,tenantId,action,data,
  });
  assert.equal((await command('projectCreate',{name:'隔离检查',administratorId:member.id},'grzh')).status,409);
  assert.equal((await command('subscribe',{})).status,403);
  const created = await command('projectCreate',{name:'系统管理员创建的项目',administratorId:member.id});
  assert.equal(created.status,200,JSON.stringify(created.data));
  const after = await request(path+'/workspace',admin.cookie);
  const projectId = 'project-'+created.data.operationId;
  assert(after.data.projects.some(row=>row.id===projectId));
  assert(after.data.projectMembers[projectId].some(row=>row.id===member.id && row.role==='项目管理员'));
  const audit=after.data.projectAudits.find(row=>row.projectId===projectId);
  assert(audit?.actor);
  const other = await request('/tenants/grzh/workspace',admin.cookie);
  assert.equal(other.status,200,JSON.stringify(other.data));
  assert(!other.data.projects.some(row=>row.id===projectId));
  const backoffice = await request('/auth/me',admin.cookie);
  const record = await local.db.prepare('SELECT reference_json FROM model_workspace WHERE id=1').first('reference_json');
  const persisted = JSON.parse(record).audits.find(row=>row.projectId===projectId);
  assert.equal(persisted.actorId,backoffice.data.account.id);
  assert.equal(persisted.actorRole,'系统管理员');
  assert.equal(persisted.tenantId,'zqzh');
  assert.equal(JSON.parse(record).projects.find(row=>row.id===projectId).createdBy,backoffice.data.account.name);

  const state=JSON.parse(record);
  const tenantId='zqzh';
  const root=state.organizations.find(row=>row.tenantId===tenantId && !row.parentId);
  state.organizations.push({id:'dept-in',tenantId,parentId:root.id,name:'授权部门',status:'正常'},
    {id:'dept-out',tenantId,parentId:root.id,name:'其他部门',status:'正常'});
  state.users.push({id:'scoped-operator',name:'部门管理员',login:'scoped-operator',status:'正常'},
    {id:'scope-member',name:'成员',login:'scope-member',status:'正常'});
  state.memberships.push({id:'scoped-operator-member',tenantId,userId:'scoped-operator',organizationId:'dept-in',
    scopeId:'dept-in',role:'部门管理员',status:'正常'},
    {id:'scoped-member',tenantId,userId:'scope-member',organizationId:'dept-in',role:'普通成员',status:'正常'});
  await local.db.prepare('UPDATE model_workspace SET reference_json=? WHERE id=1').bind(JSON.stringify(state)).run();
  const scoped = await request('/auth/sign-in',undefined,{identifier:'scoped-operator',accessCode:password});
  assert.equal(scoped.status,200,JSON.stringify(scoped.data));
  const scopedView = await request('/market/workspace',scoped.cookie);
  assert.equal(scopedView.status,200,JSON.stringify(scopedView.data));
  assert.equal(scopedView.data.canManageOrganization,true);
  assert.equal(scopedView.data.canManage,false);
  assert.deepEqual(scopedView.data.organization.departments.map(row=>row.id),['dept-in']);
  assert.deepEqual(scopedView.data.organization.members.map(row=>row.id).sort(),['scoped-member','scoped-operator-member']);
  const update=(changes)=>request('/market/commands',scoped.cookie,{
    tenantId,operationId:randomUUID(),expectedRevision:scopedView.data.revision,action:'organization',
    data:{...scopedView.data.organization,members:scopedView.data.organization.members.map(row=>
      row.id==='scoped-member' ? {...row,...changes} : row)},
  });
  assert.equal((await update({departmentId:'dept-out'})).status,422);
  assert.equal((await update({role:'企业管理员'})).status,422);
  const updated = await update({name:'修改后的部门成员'});
  assert.equal(updated.status,200,JSON.stringify(updated.data));
  const refreshed = await request(path+'/workspace',admin.cookie);
  assert(refreshed.data.organization.members.some(row=>row.id==='scoped-member' && row.name==='修改后的部门成员'));
  assert(refreshed.data.organization.departments.some(row=>row.id==='dept-out'));
  assert.equal((await request(path+'/workspace',scoped.cookie)).status,401);
  const policy = await request('/project-space-policy',admin.cookie);
  assert.equal(policy.status,200,JSON.stringify(policy.data));
  const designated = await request('/project-space-policy',admin.cookie,{
    expectedRevision:policy.data.revision, operatingMode:'factory', internalTenantId:tenantId, personalEnabled:true,
  });
  assert.equal(designated.status,200,JSON.stringify(designated.data));
  const designatedView = await request(path+'/workspace',admin.cookie);
  assert.equal(designatedView.data.canCreateProject,false);
  const internalCommand = (workspace, action, data)=>request(path+'/commands',admin.cookie,{
    operationId:randomUUID(),expectedRevision:workspace.data.revision,tenantId,action,data,
  });
  const projectChanges = [
    ['projectCreate',{name:'需要用户控制台创建',administratorId:member.id}],
    ['projectUpdate',{projectId,type:'settings',input:{name:'需要用户控制台更新'}}],
    ['projectRoute',{route:{projectId}}],
    ['keys',{projectId,rows:[],billing:'按量付费'}],
  ];
  assert.equal((await internalCommand(designatedView,...projectChanges[0])).status,403);
  assert.equal((await request('/tenants/grzh/workspace',admin.cookie)).status,200);
  const saved = await request('/project-space-policy',admin.cookie,{
    expectedRevision:designated.data.revision, operatingMode:'internal', internalTenantId:tenantId, personalEnabled:false,
  });
  assert.equal(saved.status,200,JSON.stringify(saved.data));
  const internalView = await request(path+'/workspace',admin.cookie);
  assert.equal(internalView.status,200);
  assert.equal(internalView.data.canCreateProject,false);
  assert(internalView.data.projects.some(row=>row.id===projectId));
  assert(internalView.data.projects.every(row=>!row.canManage && !row.canEdit));
  for (const change of projectChanges) assert.equal((await internalCommand(internalView,...change)).status,403);
  const afterRejected = await request(path+'/workspace',admin.cookie);
  assert.equal(afterRejected.data.revision,internalView.data.revision);
  assert.deepEqual(afterRejected.data.projects,internalView.data.projects);
  assert.equal((await request('/tenants/grzh/workspace',admin.cookie)).status,403);

  const organization = {
    ...internalView.data.organization,
    departments:[...internalView.data.organization.departments,{id:'dept-extra',name:'内用部门',parentId:'root'}],
  };
  const savedOrganization = await internalCommand(internalView,'organization',organization);
  assert.equal(savedOrganization.status,200,JSON.stringify(savedOrganization.data));
  assert((await request(path+'/workspace',admin.cookie)).data.organization.departments.some(row=>row.id==='dept-extra'));

  const tenantAdmin = await request('/auth/sign-in',undefined,{identifier:'zqzh',accessCode:password});
  const customerView = await request('/market/workspace',tenantAdmin.cookie);
  assert.equal(customerView.data.canCreateProject,true);
  const customerProject = await request('/market/commands',tenantAdmin.cookie,{
    operationId:randomUUID(),expectedRevision:customerView.data.revision,tenantId,action:'projectCreate',data:{name:'前台创建的内用项目'},
  });
  assert.equal(customerProject.status,200,JSON.stringify(customerProject.data));
});
