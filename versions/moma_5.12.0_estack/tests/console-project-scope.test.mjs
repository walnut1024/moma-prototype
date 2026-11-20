import test from 'node:test';
import assert from 'node:assert/strict';
import { personalDefaultProject, customerProject, assertPersonalProjects } from '../src/personal-project.mjs';
import { projectAccess, projectModelEnabled } from '../src/project-access.mjs';
import { newProject, changeProject } from '../src/project-configuration.mjs';
import { projectAccessError, projectBudgetUsage, projectCallError } from '../src/project-call.mjs';
import { millionTokens, projectBudgetStart, projectTokenBudget } from '../src/project-token-budget.mjs';
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

test('project Token budget resets on Beijing calendar boundaries and shares usage across models and Keys', () => {
  const at=Date.parse('2026-11-30T16:00:30Z');
  for (const [period, start] of Object.entries({
    hour:'2026-11-30T16:00:00Z', day:'2026-11-30T16:00:00Z',
    week:'2026-11-29T16:00:00Z', month:'2026-11-30T16:00:00Z',
  })) assert.equal(projectBudgetStart(period, at), Date.parse(start));
  assert.equal(projectBudgetStart('total', at), -Infinity);
  const project={id:'project',tenantId:'enterprise',status:'正常',
    tokenBudget:projectTokenBudget({limit:'0.000050',period:'day',rpm:'2',tpm:'30'})};
  const current={tenantId:project.tenantId,projectId:project.id,keyId:'key-1',modelId:'different-model',
    createdAt:'2026-11-30T16:00:00Z',usage:{input:20,output:5,cached:20},httpStatus:200,billingType:'Token Plan'};
  const previous={...current,createdAt:'2026-11-30T15:59:00Z'};
  const state={requests:[current,previous,{...current,purpose:'gateway-test'},
    {...current,projectId:'other-project'}, {...current,tenantId:'other-tenant'}, {...current,httpStatus:402}]};
  assert.deepEqual(projectBudgetUsage(state.requests,project,at),{tokens:25,minuteTokens:25,minuteRequests:1});
  const check=(usage,key={id:'key-2'})=>projectCallError(state,project,{id:'model'},key,usage,null,at);
  assert.equal(check({input:5}),null);
  assert.equal(check({input:6}),'project_rate_limit_exceeded');
  assert.equal(check({input:26},{billingType:'Token Plan'}),'project_token_budget_exceeded');
  project.tokenBudget.tpm=null;
  assert.equal(check({input:25}),null);
  state.requests.push({...current,httpStatus:504,admittedAt:current.createdAt,usage:null});
  assert.equal(check({input:1}),'project_rate_limit_exceeded');
  assert.equal(projectTokenBudget({period:'total'}),null);
  project.spendBudget={stop:true,amountMicros:1};
  project.tokenBudget=null;
  assert.equal(check({input:1}),null);
  delete project.tokenBudget;
  assert.equal(check({input:1}),'budget_charge_unavailable');
  const precise = millionTokens(Number.MAX_SAFE_INTEGER);
  assert.equal(projectTokenBudget({period:'total',limit:precise}).limit,Number.MAX_SAFE_INTEGER);
  assert.throws(()=>projectTokenBudget({period:'forever',limit:'1'}),/预算周期/);
  assert.throws(()=>projectTokenBudget({period:'total',limit:'0.0000001'}),/6 位小数/);
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
  state.memberships.push({id:'member',tenantId:'enterprise',userId:'owner',role:'普通成员',status:'正常',canCreateProjects:true});
  state.projects.push({id:'enterprise-project',tenantId:'enterprise',name:'客服',ownerId:'admin',status:'正常',memberRoles:{member:'项目成员'},modelPermissions:[]});
  const enterpriseIdentity={tenantId:'enterprise',spaceId:'enterprise'};
  const enterpriseLink={backendMembershipId:'member',backendUserId:'owner'};
  const access=projectAccess(state,enterpriseIdentity,enterpriseLink);
  assert.equal(access.canCreate,false);
  assert.deepEqual(access.projects.map(row=>row.id),['enterprise-project']);
  assert.equal(access.projects[0].canEdit,false);
  assert.equal(projectModelEnabled(access.projects[0],'model'),false);
  const context={state,identity:enterpriseIdentity,link:enterpriseLink};
  assert.throws(()=>newProject(context,{name:'无权限项目'},'blocked'),/无权创建项目/);
  state.projects.at(-1).memberRoles.member='项目管理员';
  assert.equal(projectAccess(state,enterpriseIdentity,enterpriseLink).projects[0].canManage,true);
  assert.throws(()=>newProject(context,{name:'无权限项目'},'blocked'),/无权创建项目/);
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

test('historical personal names and references survive settings edits; invalid ownership is reported', () => {
  const state=personal();
  state.projects[0].name='历史名称';
  const before=structuredClone(state);
  const {projects}=changeProject({state,identity,link},'default','settings',{
    name:'默认项目',description:'使用设置',amount:'12.5',warnAt:80,stop:true,retainContent:false,
  },[]);
  assertPersonalProjects(state,{...state,projects});
  assert.equal(projects[0].name,'历史名称');
  assert.equal(projects[0].spendBudget.amountMicros,12_500_000);
  assert.equal(customerProject(state,state.projects[0]).name,'默认项目');
  assert.deepEqual(state,before);
  const invalid=structuredClone(state);
  invalid.projects[0].ownerId='another-user';
  assert.throws(()=>personalDefaultProject(invalid,'person'),/归属异常/);
  invalid.projects[0].ownerId='owner';
  invalid.projects.push({...invalid.projects[0],id:'unexpected'});
  assert.throws(()=>projectAccess(invalid,identity,link),/有且仅有/);
  const frozen={...state,tenants:[{...state.tenants[0],status:'停用'}]};
  assert.equal(customerProject(frozen,frozen.projects[0]).status,'停用');
});
