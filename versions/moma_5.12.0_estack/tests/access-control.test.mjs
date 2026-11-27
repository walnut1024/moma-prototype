import test from 'node:test';
import assert from 'node:assert/strict';
import { tenantHref, userAffiliations } from '../src/admin-v2/access-control.mjs';
import { sections, canAccessPage } from '../src/admin-v2/navigation.mjs';
import { tenantServiceTransaction } from '../src/admin-v2/tenant-service-settings.mjs';

test('tenant detail links preserve list filters and distinguish accounts from tenants', () => {
  const href = tenantHref({ id:'personal-space', ownerId:'u1', type:'个人' }, { tab:'models' }, new URLSearchParams('q=Alice&type=个人&enterprise=old&create=personal'));
  const params = new URLSearchParams(href.split('?')[1]);
  assert.equal(params.get('personal'), 'u1');
  assert.equal(params.get('q'), 'Alice');
  assert.equal(params.has('enterprise'), false);
  assert.equal(params.has('create'), false);
  assert.equal(params.get('tab'), 'models');
});

test('user project affiliations stay inside explicit tenant membership', () => {
  const state = { tenants:[{ id:'a', type:'企业' }, { id:'b', type:'企业' }, { id:'p', type:'个人', ownerId:'u1' }],
    memberships:[{ id:'ma', userId:'u1', tenantId:'a', role:'普通成员', status:'正常' }],
    projects:[{ id:'pa', tenantId:'a', memberRoles:{ ma:'项目成员' } }, { id:'pb', tenantId:'b', memberRoles:{ ma:'项目管理员' } }, { id:'pp', tenantId:'p' }] };
  const rows = userAffiliations(state, 'u1');
  assert.deepEqual(rows.map(row => row.tenant.id), ['a', 'p']);
  assert.deepEqual(rows.flatMap(row => row.projects.map(item => item.project.id)), ['pa', 'pp']);
  assert.deepEqual(userAffiliations(state, 'missing'), []);
});

test('access control lists tenant and project management and keeps operations project reads tenant-scoped', () => {
  const group = sections.find(row => row.title === '访问控制');
  assert.deepEqual(group.items.map(row => row.children[0]), [['tenants', '租户管理'], ['projects', '项目管理']]);
  assert(!sections.find(row => row.id === 'commerce').items.some(row=>row.id==='enterprise'));
  assert.equal(canAccessPage('运营人员', 'tenants'), true);
  assert.equal(canAccessPage('运维人员', 'tenants'), false);
  assert.equal(canAccessPage('运营人员', 'organization-members'), false);
  assert.equal(canAccessPage('平台管理员', 'organization-members'), true);
  assert.equal(canAccessPage('平台管理员', 'projects'), true);
  assert.equal(canAccessPage('运营人员', 'projects'), false);
  assert.equal(canAccessPage('运营人员', 'projects', undefined, new URLSearchParams('tenant=a')), true);
});

test('opening, limiting and removing a model preserve other models already granted to the tenant', () => {
  const existing = {modelId:'alpha',rpm:80,tpm:4000};
  const tenant = {id:'a',status:'正常',modelRules:[existing]};
  const model = (id, salesScope)=>({id,modelId:id,serviceMode:'standard',listingStatus:'已上架',
    visibility:'公开',callsEnabled:true,type:'text',salesScope});
  const state = {tenants:[tenant],grants:[],models:[model('alpha'),model('beta'),
    model('restricted',{openScope:'selected',tenantIds:['b']})]};
  const apply = (operation,data) => tenantServiceTransaction(state,{tenantId:'a',operation,data}).changes[0].changes.modelRules;
  assert.throws(()=>apply('open-models',{modelIds:['beta','restricted']}),/无法授权的模型服务/);
  assert.deepEqual(tenant.modelRules,[existing]);
  tenant.modelRules = apply('open-models',{modelIds:['beta']});
  assert.deepEqual(tenant.modelRules,[{modelId:'beta',rpm:null,tpm:null},existing]);
  tenant.modelRules = apply('model-limits',{modelId:'beta',rpm:30,tpm:1000});
  assert.deepEqual(tenant.modelRules,[{modelId:'beta',rpm:30,tpm:1000},existing]);
  assert.deepEqual(apply('remove-model',{modelId:'beta'}),[existing]);
});

test('internal bulk authorization requires running independently callable services', () => {
  const tenant = {id:'company',type:'企业',status:'正常'};
  const state = {tenants:[tenant],models:[],grants:[],spacePolicy:{internalTenantId:tenant.id},marketModelServices:[
    {id:'running',callId:'running',listed:true,independentService:true},
    {id:'stopped',callId:'stopped',listed:false,independentService:true},
    {id:'legacy-wrapper',callId:'legacy',listed:true,independentService:false},
  ]};
  const authorize = modelIds => tenantServiceTransaction(state,{
    tenantId:tenant.id,operation:'open-models',data:{modelIds},
  }).changes[0].changes.modelRules;
  assert.throws(()=>authorize(['running','stopped']),/无法授权的模型服务/);
  assert.throws(()=>authorize(['legacy-wrapper']),/无法授权的模型服务/);
  assert.deepEqual(authorize(['running']),[{modelId:'running',rpm:null,tpm:null}]);
});
