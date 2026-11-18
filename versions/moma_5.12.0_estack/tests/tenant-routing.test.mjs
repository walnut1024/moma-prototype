import test from 'node:test';
import assert from 'node:assert/strict';
import { activeTenantVersion, autoStrategies, changeTenantRoute, routeTargets, tenantRouteVisible, keyTenantRoute } from '../src/tenant-routing.mjs';

const service = (callId, modelKey, providerId, price, context) => ({
  callId, modelKey, providerId, mode: 'provider', name: modelKey, type: 'text', callable: true,
  capabilities: { context, output: 512 }, salePrices: [{ unit: 'million_input_tokens', currency: 'CNY', amount: price }],
});
const offers = [service('a-1', 'model-a', 'a', 7, 1000), service('a-2', 'model-a', 'b', 4, 1000),
  service('b-1', 'model-b', 'a', 3, 2000)];
const config = { models: ['model-a', 'model-b'], providers: [], sort: 'default', fallbackModel: '',
  description: '', systemPrompt: '保持简洁', parameters: { temperature: 0, max_tokens: 128 } };
const context = { state: { tenants:[{id:'tenant',type:'企业'}],
  projects:[{id:'project',tenantId:'tenant',status:'正常',ownerId:'owner'}],
  memberships:[{id:'membership',tenantId:'tenant',userId:'owner',role:'租户管理员',status:'正常'}], tenantRoutes: [{ id: 'old', tenantId: 'tenant', ownerId: 'owner', models: ['a-1'] }] },
  identity: { tenantId: 'tenant', name: '操作者' }, link: { backendUserId: 'owner', backendMembershipId:'membership' }, canManage: true };
const publish = { projectId:'project', action: 'publish', kind: 'preset', name: 'support', config };

test('preset keeps model order and confines provider sorting to each model', () => {
  const targets = routeTargets({ ...config, providers: ['b', 'a'], sort: 'manual' }, offers, '@preset/support');
  assert.deepEqual(targets.map(row => row.callId), ['a-2', 'a-1', 'b-1']);
  assert.deepEqual(routeTargets(config, offers, 'moma/performance').map(row => row.callId), ['b-1']);
  assert.deepEqual(routeTargets(config, offers, 'moma/cost').map(row => row.callId), ['b-1']);
  assert.deepEqual(routeTargets(config, offers, '@preset/support', { inputTokens: 950 }).map(row => row.callId), ['b-1']);
});

test('publishing and switching versions keep identifiers, authorization and historical configurations', () => {
  const state = changeTenantRoute(context, publish, offers, 'new');
  assert.deepEqual(state.tenantRoutes[0], context.state.tenantRoutes[0]);
  const row = state.tenantRoutes[1];
  assert.equal(row.callId, '@preset/support');
  assert.equal(activeTenantVersion(row).config.parameters.temperature, 0);
  const next = { ...context, state };
  const ref = { projectId:'project', kind: row.kind, id: row.id, callId: row.callId };
  assert.throws(() => changeTenantRoute(next, publish, offers, 'duplicate'), /已被使用/);
  const unauthorised = { ...next, link: { backendUserId: 'other' }, canManage: false };
  assert.equal(tenantRouteVisible(row, 'tenant', 'project', 'other', false), false);
  assert.throws(() => changeTenantRoute(unauthorised, { ...ref, action: 'stop' }, offers, 'x'), /无权/);
  const v2 = changeTenantRoute(next, { ...publish, ...ref, config: { ...config, models: ['model-b'] } }, offers, 'unused');
  const revert = { ...ref, action: 'switch', version: 1 };
  assert.throws(() => changeTenantRoute({ ...next, state: v2 }, revert, offers.slice(2), 'unused'), /已订购/);
  const reverted = changeTenantRoute({ ...next, state: v2 }, revert, offers, 'unused').tenantRoutes[1];
  assert.equal(reverted.activeVersion, 1);
  assert.equal(reverted.versions.length, 2);
  assert.equal(reverted.callId, row.callId);
});

test('automatic configuration only changes on publish and cannot be edited by a member', () => {
  const base = { projectId:'project', kind: 'auto', callId: 'moma/auto', config: { ...config, models: [] } };
  const draft = changeTenantRoute(context, { ...base, action: 'draft' }, offers, 'auto');
  assert.equal(draft.tenantRoutes[1].enabled, false);
  assert.throws(() => changeTenantRoute(context, { ...base, action: 'publish' }, offers, 'auto'), /至少选择/);
  assert.throws(() => changeTenantRoute({ ...context, link:{backendUserId:'other'} }, { ...base, action: 'draft' }, offers, 'auto'), /无权/);
});

test('the three Auto Router IDs keep independent saved configurations and request overrides affect only moma/auto', () => {
  const [router, performance, cost] = autoStrategies;
  const publish = (state, strategy, patch) => changeTenantRoute({ ...context, state }, {
    projectId:'project', action:'publish', kind:'auto', callId:strategy.callId, config:{ ...config, ...patch },
  },offers,strategy.callId);
  let state = publish(context.state,router,{costTier:'medium',sort:'price'});
  state = publish(state,performance,{models:['model-b'],fallbackModel:'model-b'});
  state = publish(state,cost,{models:['model-a'],excludedModels:['model-b']});
  const [auto,fast,cheap] = state.tenantRoutes.slice(1);
  assert.deepEqual([auto.callId,fast.callId,cheap.callId],['moma/auto','moma/performance','moma/cost']);
  assert.deepEqual(activeTenantVersion(fast).config.models,['model-b']);
  assert.deepEqual(activeTenantVersion(cheap).config.models,['model-a']);
  assert.deepEqual(activeTenantVersion(cheap).config.excludedModels,['model-b']);
  const balanced=activeTenantVersion(auto).config;
  assert.equal(routeTargets(balanced,offers,router.callId)[0].callId,'a-2');
  assert.equal(routeTargets(balanced,offers,router.callId,{costTier:'high'})[0].callId,'b-1');
  assert.equal(routeTargets({...balanced,preventOverrides:true},offers,router.callId,{costTier:'high'})[0].callId,'a-2');
  assert.equal(routeTargets({...balanced,excludedModels:['model-a']},offers,router.callId)[0].callId,'b-1');
  assert.throws(() => publish(state,router,{excludedModels:['model-a','model-b']}), /至少选择/);
});

test('preset exclusions and manual preference filter providers separately from model fallback', () => {
  const targets = routeTargets({ ...config, providerOrder:['b'], sort:'manual',
    allowProviderFallbacks:false },offers,'@preset/support');
  assert.deepEqual(targets.map(row=>row.callId),['a-2','b-1']);
  const next = routeTargets({ ...config, providerOrder:['b'], sort:'manual', excludedProviders:['b'] },offers,'@preset/support');
  assert.deepEqual(next.map(row=>row.callId),['a-1','b-1']);
  assert.throws(() => changeTenantRoute(context,{...publish,config:{...config,excludedProviders:['a','b']}},offers,'new'),
    /未覆盖全部模型/);
});

test('identical strategy and preset call IDs are independent across projects; IDs and version history survive edits', () => {
  const state={...context.state, projects:[...context.state.projects,{...context.state.projects[0],id:'second'}]};
  const scoped={...context,state};
  const first=changeTenantRoute(scoped,publish,offers,'first');
  const second=changeTenantRoute({...scoped,state:first},{...publish,projectId:'second'},offers,'second-route');
  assert.deepEqual(second.tenantRoutes.find(row=>row.id==='first'),first.tenantRoutes.find(row=>row.id==='first'));
  assert.equal(second.tenantRoutes.find(row=>row.id==='second-route').callId,'@preset/support');
  assert.throws(()=>changeTenantRoute({...scoped,state:second},{...publish,projectId:'second',id:'first',callId:'@preset/support'},offers,'x'),/无权/);
  assert.throws(()=>changeTenantRoute(scoped,{...publish,projectId:undefined},offers,'x'),/选择项目/);
  assert.throws(()=>changeTenantRoute(scoped,{...publish,projectId:'foreign'},offers,'x'),/无权/);
});

test('project administrators manage automatic routes without gaining enterprise rights; members retain their own presets', () => {
  const member={...context.state.memberships[0],role:'普通成员'};
  const state={...context.state,memberships:[member],projects:[{...context.state.projects[0],memberRoles:{membership:'项目管理员'}}]};
  const input={projectId:'project',kind:'auto',action:'draft',callId:'moma/auto',config:{...config,models:[]}};
  const draft=changeTenantRoute({...context,state,canManage:false},input,offers,'auto-project');
  assert.equal(draft.tenantRoutes.at(-1).projectId,'project');
  state.projects=[{...state.projects[0],memberRoles:{membership:'项目成员'}}];
  assert.throws(()=>changeTenantRoute({...context,state},input,offers,'x'),/无权/);
  const own=changeTenantRoute({...context,state},publish,offers,'own');
  assert.equal(own.tenantRoutes.at(-1).ownerId,'owner');
  state.projects=[{...state.projects[0],status:'停用'}];
  assert.throws(()=>changeTenantRoute({...context,state},publish,offers,'x'),/不可用/);
});

test('routing configuration cannot publish candidates not enabled for the current project', () => {
  const state={...context.state,projects:[{...context.state.projects[0],modelPermissions:[{modelId:'model-b'}]}]};
  assert.throws(()=>changeTenantRoute({...context,state},publish,offers,'x'),/已订购/);
  assert.equal(changeTenantRoute({...context,state},{...publish,config:{...config,models:['model-b']}},offers,'x').tenantRoutes.at(-1).projectId,'project');
});

test('personal routing is attached only to its immutable default project', () => {
  const state={...context.state,tenants:[{id:'tenant',type:'个人',ownerId:'owner',defaultProjectId:'project'}]};
  const personal={...context,state,identity:{...context.identity,spaceId:'personal'}};
  assert.equal(changeTenantRoute(personal,publish,offers,'x').tenantRoutes.at(-1).projectId,'project');
  assert.throws(()=>changeTenantRoute(personal,{...publish,projectId:'other'},offers,'x'),/无权/);
});


test('Bearer resolution uses the stored Key project and the preset owner or project management permission', () => {
  const route={id:'route',tenantId:'tenant',projectId:'project',ownerId:'owner',kind:'preset',callId:'@preset/private',enabled:true};
  const state={...context.state,tenantRoutes:[route]};
  const key={tenantId:'tenant',projectId:'project',ownerId:'owner'};
  assert.equal(keyTenantRoute(state,key,route.callId),route);
  assert.equal(keyTenantRoute(state,{...key,projectId:'second'},route.callId),undefined);
  assert.equal(keyTenantRoute(state,{...key,ownerId:'other'},route.callId),undefined);
  assert.equal(keyTenantRoute(state,undefined,route.callId),undefined);
  assert.equal(keyTenantRoute({...state,tenantRoutes:[{...route,enabled:false}]},key,route.callId),undefined);
});
