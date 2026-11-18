import test from 'node:test';
import assert from 'node:assert/strict';
import { personalDefaultProject, customerProject, assertPersonalProjects } from '../src/personal-project.mjs';
import { projectAccess, projectModelEnabled } from '../src/project-access.mjs';
import { newProject, changeProject } from '../src/project-configuration.mjs';
import { projectAccessError, projectCallError } from '../src/project-call.mjs';
import { loadAdminState, commitAdminState } from '../src/admin-v2/store.js';

const personal = () => ({
  tenants:[{id:'person',type:'个人',ownerId:'owner',defaultProjectId:'default'}],
  projects:[{id:'default',tenantId:'person',ownerId:'owner',name:'默认项目',status:'正常',modelPermissions:[]}],
  memberships:[], users:[], organizations:[], requests:[],
});
const identity = {tenantId:'person',spaceId:'personal'};
const link = {backendUserId:'owner'};

test('personal space always binds one default project, with no project creation or lifecycle operations', () => {
  const state = personal();
  const context = {state,identity,link};
  const access = projectAccess(state,identity,link);
  assert.equal(access.canCreate,false);
  assert.equal(access.projects.length,1);
  assert.equal(access.projects[0].id,'default');
  assert.throws(() => newProject(context,{name:'second'},'second'),/固定使用默认项目/);
  for (const status of ['停用','已删除','正常']) {
    assert.throws(() => changeProject(context,'default','status',{status},[]),/随客户管理/);
  }
  assert.throws(() => changeProject(context,'default','settings',{name:'renamed'},[]),/不可重命名/);
  assert.throws(() => changeProject(context,'default','members',{},[]),/随客户管理/);
});

test('web experience and API checks inherit personal model eligibility while enforcing budget and Key validity', () => {
  const state=personal();
  const project=customerProject(state,state.projects[0]);
  assert.equal(projectModelEnabled(project,'purchased-model'),true);
  assert.equal(projectAccessError(project,'purchased-model',null,Date.now()),null);
  assert.equal(projectAccessError(project,'purchased-model',{expiresAt:'2020-01-01'},Date.now()),'key_expired');
  project.spendBudget={stop:true,amountMicros:100};
  assert.equal(projectCallError(state,project,{id:'purchased-model'},null,{input:1},{currency:'CNY',micros:101},Date.now()),'project_budget_exceeded');
  assert.equal(projectAccessError({...project,status:'停用'},'purchased-model',null,Date.now()),'project_unavailable');
});

test('personal invariant rejects extra, replaced, deleted or renamed defaults without changing original records', () => {
  const state=personal();
  assert.equal(personalDefaultProject(state,'person').id,'default');
  const extra=structuredClone(state);
  extra.projects.push({...extra.projects[0],id:'second'});
  assert.throws(() => assertPersonalProjects(state,extra),/固定使用默认项目/);
  const renamed=structuredClone(state);
  renamed.projects[0].name='renamed';
  assert.throws(() => assertPersonalProjects(state,renamed),/不可替换或重命名/);
  const deleted=structuredClone(state);
  deleted.projects[0].status='已删除';
  assert.throws(() => assertPersonalProjects(state,deleted),/有且仅有/);
  assert.deepEqual(state,personal());
});

test('enterprise administrators create projects while members only see assigned projects', () => {
  const state=personal();
  state.tenants.push({id:'enterprise',type:'企业'});
  state.memberships.push({id:'member',tenantId:'enterprise',userId:'owner',role:'普通成员',status:'正常'});
  state.projects.push({id:'enterprise-project',tenantId:'enterprise',name:'客服',ownerId:'admin',status:'正常',memberRoles:{member:'项目成员'},modelPermissions:[]});
  const enterpriseIdentity={tenantId:'enterprise',spaceId:'enterprise'};
  const enterpriseLink={backendMembershipId:'member',backendUserId:'owner'};
  const access=projectAccess(state,enterpriseIdentity,enterpriseLink);
  assert.equal(access.canCreate,false);
  assert.deepEqual(access.projects.map(row=>row.id),['enterprise-project']);
  assert.equal(access.projects[0].canEdit,false);
  assert.equal(projectModelEnabled(access.projects[0],'model'),false);
  state.memberships[0].role='租户管理员';
  const project=newProject({state,identity:enterpriseIdentity,link:enterpriseLink},{name:'new',description:''},'new');
  assert.equal(project.tenantId,'enterprise');
  assert.deepEqual(project.modelPermissions,[]);
});

test('backend customer transactions cannot bypass the single personal project rule', () => {
  let state=loadAdminState({getItem:()=>null,setItem:()=>{}});
  state=commitAdminState(state,{type:'individual',operation:'create',
    ids:{tenant:'personal-test',project:'default-test',user:'personal-user-test'},
    data:{accountMode:'new',name:'个人客户',phone:'13912345678'}},'平台管理员');
  assert.equal(state.tenants.find(row=>row.id==='personal-test').defaultProjectId,'default-test');
  const count=state.projects.length;
  assert.throws(() => commitAdminState(state,{type:'add',collection:'projects',record:{
    id:'second',tenantId:'personal-test',name:'第二个',status:'正常',
  }},'平台管理员'),/固定使用默认项目/);
  assert.throws(() => commitAdminState(state,{type:'update',collection:'projects',id:'default-test',changes:{status:'已删除'}},'平台管理员'),/有且仅有/);
  assert.equal(state.projects.length,count);
});
