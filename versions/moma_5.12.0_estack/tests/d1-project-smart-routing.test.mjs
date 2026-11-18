import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash,randomUUID} from 'node:crypto';
import {startLocalBackend} from '../database/local-runtime.js';

test('routing workspace and commands enforce enterprise project membership, project admin rights and the personal default', {timeout:30000}, async t=>{
  const password=randomUUID(),ids=['admin-001','zqzh','grzh','route-member','route-manager'];
  const local=await startLocalBackend({demo:true,presets:true,loginHashes:Object.fromEntries(ids.map(id=>[id,createHash('sha256').update(password).digest('hex')]))});
  t.after(()=>local.runtime.dispose());
  const reference=JSON.parse(await local.db.prepare('SELECT reference_json FROM model_workspace WHERE id=1').first('reference_json'));
  const project=reference.projects.find(row=>row.tenantId==='zqzh');
  const personal=reference.projects.find(row=>row.tenantId==='grzh');
  for(const [id,role]of [['route-member','项目成员'],['route-manager','项目管理员']]){
    reference.users.push({id,login:id,name:id,status:'正常'});
    reference.memberships.push({id:'membership-'+id,userId:id,tenantId:'zqzh',role:'普通成员',status:'正常'});
    project.memberRoles={...project.memberRoles,['membership-'+id]:role};
  }
  reference.projects.push({...project,id:'hidden-project',memberRoles:{}});
  const auto={id:'auto-existing',tenantId:'zqzh',projectId:project.id,ownerId:'zqzh',kind:'auto',callId:'moma/auto',name:'均衡模式',
    enabled:true,activeVersion:2,versions:[{number:1,config:{models:[]},actor:'历史管理员'},{number:2,config:{models:[]}}],draft:{models:[]}};
  const own={id:'own-existing',tenantId:'zqzh',projectId:project.id,ownerId:'route-member',kind:'preset',callId:'@preset/own',name:'own',versions:[],enabled:false};
  reference.tenantRoutes=[auto,own,{...own,id:'foreign-preset',ownerId:'route-manager',callId:'@preset/other'},
    {...auto,id:'hidden-auto',projectId:'hidden-project'}];
  await local.db.prepare('UPDATE model_workspace SET reference_json=? WHERE id=1').bind(JSON.stringify(reference)).run();
  const origin='https://prototype.test';
  async function request(path,cookie,body){
    const response=await local.runtime.dispatchFetch(origin+'/api/v1/'+path,{method:body?'POST':'GET',headers:{...(cookie?{cookie}:{}),
      ...(body?{origin,'x-moma-request':'1','content-type':'application/json'}:{})},...(body?{body:JSON.stringify(body)}:{})});
    return {status:response.status,data:await response.json(),cookie:response.headers.get('set-cookie')?.split(';')[0]};
  }
  const login=async id=>{
    const result=await request('auth/sign-in',null,{identifier:id,accessCode:password});
    assert.equal(result.status,200,JSON.stringify(result.data));return result.cookie;
  };
  const workspace=async cookie=>{const result=await request('market/workspace',cookie);assert.equal(result.status,200,JSON.stringify(result.data));return result.data;};
  const command=async(cookie,tenantId,data,expectedRevision)=>request('market/commands',cookie,{operationId:randomUUID(),tenantId,action:'routes',data,
    expectedRevision:expectedRevision??(await workspace(cookie)).revision});
  const admin=await login('zqzh'),member=await login('route-member'),manager=await login('route-manager'),person=await login('grzh');
  const memberView=await workspace(member);
  assert.deepEqual(memberView.routes.map(row=>row.id),['auto-existing','own-existing']);
  assert.equal(memberView.routes[0].draft,undefined);
  assert.deepEqual(memberView.routes[0].versions.map(row=>row.number),[2]);
  const managerView=await workspace(manager);
  assert.equal(managerView.canManage,false);
  assert.equal(managerView.routes.length,3);
  assert(managerView.routes[0].draft);
  assert.equal((await workspace(admin)).routes.length,4);
  const input={projectId:project.id,kind:'auto',action:'draft',callId:'moma/auto',config:{models:[],providers:[],sort:'default'}};
  assert.equal((await command(member,'zqzh',{...input,canManage:true})).status,422);
  assert.equal((await command(manager,'zqzh',{...input,projectId:'hidden-project'})).status,422);
  assert.equal((await command(manager,'zqzh',{...input,projectId:undefined})).status,422);
  const revision=(await workspace(manager)).revision;
  assert.equal((await command(manager,'zqzh',input,revision)).status,200);
  assert.equal((await command(manager,'zqzh',input,revision)).status,409);
  const saved=(await workspace(admin)).routes.find(row=>row.id===auto.id);
  assert.equal(saved.id,auto.id);assert.deepEqual(saved.versions,auto.versions);assert.equal(saved.activeVersion,2);
  assert.equal((await command(member,'zqzh',{projectId:project.id,kind:'preset',id:own.id,callId:own.callId,action:'stop'})).status,200);
  assert.equal((await command(member,'zqzh',{projectId:'hidden-project',kind:'preset',id:own.id,callId:own.callId,action:'stop'})).status,422);
  assert.equal((await command(member,'zqzh',{projectId:project.id,kind:'preset',id:'foreign-preset',callId:'@preset/other',action:'stop'})).status,422);
  const personView=await workspace(person);
  assert.equal(personView.projects.length,1);assert.equal(personView.projects[0].id,personal.id);
  assert.equal((await command(person,'grzh',{...input,projectId:personal.id})).status,200);
  assert.equal((await command(person,'grzh',input)).status,422);
  assert.equal((await workspace(person)).routes[0].projectId,personal.id);
  const adminView=await request('application',(await request('auth/login',null,{accountId:'admin-001',accessCode:password})).cookie);
  assert.equal(adminView.status,200,JSON.stringify(adminView.data));
  assert.equal(adminView.data.tenantRoutes.find(row=>row.id===auto.id).projectId,project.id);
  assert.equal(adminView.data.tenantRoutes.find(row=>row.id===auto.id).versions.length,2);
  const persisted=JSON.parse(await local.db.prepare('SELECT reference_json FROM model_workspace WHERE id=1').first('reference_json'));
  assert.deepEqual(persisted.tenantRoutes.find(row=>row.id==='hidden-auto'),reference.tenantRoutes[3]);
  assert(persisted.audits.some(row=>row.action==='维护智能路由'&&row.projectId===project.id));
});
