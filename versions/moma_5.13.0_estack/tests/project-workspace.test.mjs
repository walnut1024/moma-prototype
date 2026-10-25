import test from 'node:test';
import assert from 'node:assert/strict';
import { createAdminSeed, commitAdminState, persistAdminAction, STORAGE_KEY } from '../src/admin-v2/store.js';
import { productBillingType, assertProject, currentSpend, modelOffers, parseMoney, projectModels, visibleProjects, visibleRequests } from '../src/project-domain.mjs';

const identity = { tenantId: 'tenant-gov', userId: 'user-zhang' };
const projectId = 'project-1-1';
const now = Date.parse('2026-10-24T10:00:00+08:00');
const execute = (state, operation, values = {}, actor = identity, target = projectId) => commitAdminState(state, { type: 'workspace', operation, identity: actor, projectId: target, values, now });
const budgetSettings = (state, extra = {}) => { const project = state.projects.find(item => item.id === projectId); return { budget: '', budgetPeriod: project.budgetPeriod, warningPercent: project.warningPercent, overageAction: project.overageAction, logBodies: project.logBodies, ...extra }; };
const keyValues = { name: '业务调用', modelIds: ['model-1'], budget: '', budgetPeriod: 'month', fingerprint: 'a'.repeat(64), secretPreview: 'sk-*****abcd' };
const request = (state, extra = {}) => execute(state, 'request', { requestId: crypto.randomUUID(), prompt: '请介绍项目预算管理', modelId: 'model-1', keyId: `experience-${projectId}`, maxOutput: 1024, ...extra });
function withMember(role = '成员') {
  const state = createAdminSeed(), actor = { userId: 'workspace-member', tenantId: identity.tenantId };
  state.users.push({ id: actor.userId, name: '项目成员', status: '正常' });
  state.memberships.push({ id: 'wm', tenantId: actor.tenantId, userId: actor.userId, status: '正常', role: '普通成员' });
  state.projectMemberships.push({ id: 'wpm', projectId, userId: actor.userId, status: '正常', role });
  return { state, actor };
}
test('money preserves zero, six decimals and large exact integers; invalid values are rejected', () => {
  assert.equal(parseMoney(''), null); assert.equal(parseMoney('0'), 0); assert.equal(parseMoney('1.000001'), 1000001);
  for (const value of ['-1', '1.0000001', 'NaN', '1e3', '9007199254740991']) assert.throws(() => parseMoney(value));
});
test('project creation atomically creates owner membership and a managed Key, without model grants', () => {
  const before = createAdminSeed(), next = execute(before, 'create', { name: '新业务项目' });
  const project = next.projects[0]; assert.equal(before.projects.length + 1, next.projects.length);
  assert.ok(next.projectMemberships.some(item => item.projectId === project.id && item.userId === identity.userId));
  assert.ok(next.apiKeys.some(item => item.projectId === project.id && item.managed)); assert.equal(projectModels(next, project).length, 0);
  assert.throws(() => execute(next, 'create', { name: '新业务项目' }), /同名/);
  assert.throws(() => execute(before, 'create', { name: ' ' }), /名称/);
});
test('member and read-only permissions block cross-account access and unauthorized writes', () => {
  const { state, actor } = withMember();
  assert.deepEqual(visibleProjects(state, actor).map(item => item.id), [projectId]);
  assert.throws(() => execute(state, 'profile', { name: '项目新名称' }, actor), /无权/);
  assert.throws(() => assertProject(state, actor, 'project-2-1'), /无法访问/);
  const readOnly = withMember('只读'); assert.throws(() => execute(readOnly.state, 'createKey', keyValues, readOnly.actor), /无权/);
  assert.throws(() => execute(state, 'member', { userId: 'user-li', role: '成员' }), /当前账户/);
});
test('profile and budget saves update only their own fields and audit the corresponding project changes', () => {
  let state = createAdminSeed();
  state = execute(state, 'budget', budgetSettings(state, { budget: '12.000001', budgetPeriod: 'total', warningPercent: 65, overageAction: 'warn', logBodies: true }));
  const budgetFields = ['moneyBudget', 'budgetPeriod', 'warningPercent', 'overageAction', 'logBodies'];
  const savedBudget = Object.fromEntries(budgetFields.map(field => [field, state.projects.find(item => item.id === projectId)[field]]));
  state = execute(state, 'profile', { name: '  政务模型生产项目  ', description: '正式业务调用', budget: '0', warningPercent: 1, logBodies: false });
  let project = state.projects.find(item => item.id === projectId);
  assert.equal(project.name, '政务模型生产项目'); assert.equal(project.description, '正式业务调用');
  assert.deepEqual(Object.fromEntries(budgetFields.map(field => [field, project[field]])), savedBudget);
  assert.equal(state.audits[0].action, '更新项目基本信息');
  assert.deepEqual(Object.keys(state.audits[0].before[0].values).sort(), ['description', 'name']);
  state = execute(state, 'budget', budgetSettings(state, { budget: '0', logBodies: false, name: '不得覆盖的名称', description: '不得覆盖的说明' }));
  project = state.projects.find(item => item.id === projectId);
  assert.equal(project.name, '政务模型生产项目'); assert.equal(project.description, '正式业务调用'); assert.equal(project.moneyBudget, 0); assert.equal(project.logBodies, false);
  assert.equal(state.audits[0].action, '更新项目预算与日志'); assert.equal(state.audits[0].tenantId, identity.tenantId); assert.equal(state.audits[0].projectId, projectId);
  assert.deepEqual(Object.keys(state.audits[0].before[0].values).sort(), budgetFields.toSorted());
});
test('split project settings retain validation and reject the removed whole-project settings operation', () => {
  const state = createAdminSeed(), before = JSON.stringify(state);
  const otherName = state.projects.find(item => item.tenantId === identity.tenantId && item.id !== projectId).name;
  for (const values of [{ name: ' ' }, { name: '字'.repeat(51) }, { name: otherName }, { name: '有效项目', description: '字'.repeat(201) }]) assert.throws(() => execute(state, 'profile', values), /名称|说明/);
  for (const values of [{ budget: '-1' }, { budget: '1.0000001' }, { budgetPeriod: 'week' }, { warningPercent: 0 }, { warningPercent: 101 }, { warningPercent: 1.5 }, { overageAction: 'ignore' }]) assert.throws(() => execute(state, 'budget', budgetSettings(state, values)));
  assert.throws(() => execute(state, 'settings', {}), /未知项目操作/);
  assert.equal(JSON.stringify(state), before);
});
test('both project settings sections require current project administrator access', () => {
  const commands = [['profile', { name: '权限校验项目' }], ['budget', { budget: '0', budgetPeriod: 'month', warningPercent: 80, overageAction: 'stop', logBodies: false }]];
  for (const role of ['成员', '只读']) {
    const { state, actor } = withMember(role);
    for (const [operation, values] of commands) assert.throws(() => execute(state, operation, values, actor), /无权/);
  }
  const { state, actor } = withMember('管理员');
  for (const [operation, values] of commands) {
    assert.doesNotThrow(() => execute(state, operation, values, actor));
    assert.throws(() => execute(state, operation, values, actor, 'project-2-1'), /无法访问/);
  }
  state.projectMemberships.find(item => item.id === 'wpm').status = '已移除';
  for (const [operation, values] of commands) assert.throws(() => execute(state, operation, values, actor), /无法访问/);
});
test('owner transfer protects the owner and current membership, and grants no foreign membership', () => {
  let { state, actor } = withMember('管理员');
  assert.throws(() => execute(state, 'leave'), /先交接/);
  assert.throws(() => execute(state, 'member', { userId: identity.userId, role: '成员', remove: true }), /先交接/);
  assert.throws(() => execute(state, 'transfer', { userId: 'user-li' }), /项目内/);
  state = execute(state, 'transfer', { userId: actor.userId }); assert.equal(state.projects.find(item => item.id === projectId).ownerId, actor.userId);
  state = execute(state, 'leave'); assert.equal(state.projectMemberships.find(item => item.projectId === projectId && item.userId === identity.userId).status, '已退出');
});
test('Keys persist only masked credentials and fingerprints; model intersections and Key ownership are enforced', () => {
  let state = createAdminSeed(); state = execute(state, 'createKey', keyValues); const key = state.apiKeys[0];
  assert.equal(key.secretPreview, 'sk-*****abcd'); assert.ok(!JSON.stringify(state).includes('full-secret-never-store'));
  assert.equal(key.createdBy, identity.userId); assert.throws(() => execute(state, 'createKey', { ...keyValues, modelIds: ['foreign-model'] }), /项目已开通/);
  assert.throws(() => execute(state, 'createKey', { ...keyValues, expiresAt: '2020-01-01T00:00:00Z' }), /有效期/);
  const member = withMember(); member.state.apiKeys.push(key); assert.throws(() => execute(member.state, 'deleteKey', { id: key.id }, member.actor), /本人创建/);
  assert.throws(() => execute(state, 'deleteKey', { id: `experience-${projectId}` }), /托管/);
});
test('a request, exact money charge and immutable price snapshot share project, actor and Key IDs', () => {
  const before = createAdminSeed(), next = request(before), row = next.requests[0];
  assert.equal(row.httpStatus, 200); assert.equal(row.projectId, projectId); assert.equal(row.userId, identity.userId); assert.equal(row.customerCharge, 640);
  assert.equal(row.bodyRecorded, false); assert.equal(row.requestBody, undefined); assert.ok(row.priceSnapshot);
  assert.equal(currentSpend(next, next.projects.find(item => item.id === projectId), now), 640);
  const snap = structuredClone(row.priceSnapshot); next.modelSalePrices[0].inputPrice = 99000000; assert.deepEqual(row.priceSnapshot, snap);
  assert.throws(() => request(next, { requestId: row.requestId }), /重复/);
});
test('project and Key budgets, expiry and disabled models reject requests without charging', () => {
  let state = createAdminSeed(); state = execute(state, 'budget', budgetSettings(state, { budget: '0' }));
  let result = request(state).requests[0]; assert.equal(result.errorCode, 'project_budget_exhausted'); assert.equal(result.customerCharge, 0);
  state = execute(state, 'budget', budgetSettings(state, { budget: '' })); state = execute(state, 'createKey', { ...keyValues, budget: '0' });
  result = request(state, { keyId: state.apiKeys[0].id }).requests[0]; assert.equal(result.errorCode, 'key_budget_exhausted');
  const key = state.apiKeys[0]; key.expiresAt = '2020-01-01T00:00:00Z'; result = request(state, { keyId: key.id }).requests[0]; assert.equal(result.errorCode, 'key_expired');
  state = execute(state, 'model', { modelId: 'model-1', enabled: false, rpm: '', tpm: '' }); result = request(state).requests[0]; assert.equal(result.errorCode, 'model_not_authorized');
});
test('warning-only budget does not stop usage, and changing a period never deletes historical records', () => {
  let state = createAdminSeed(); state = execute(state, 'budget', budgetSettings(state, { budget: '0', overageAction: 'warn' })); state = request(state);
  assert.equal(state.requests[0].httpStatus, 200); const count = state.requests.length;
  state = execute(state, 'budget', budgetSettings(state, { budgetPeriod: 'total', budget: '' })); assert.equal(state.requests.length, count);
});
test('project RPM and TPM count the current minute, and invalid limits never save', () => {
  let state = createAdminSeed(); state = execute(state, 'model', { modelId: 'model-1', enabled: true, rpm: '1', tpm: '1000' }); state = request(state);
  assert.equal(request(state).requests[0].errorCode, 'rate_limit_exceeded');
  assert.throws(() => execute(state, 'model', { modelId: 'model-1', enabled: true, rpm: '-1', tpm: '' }), /正整数/);
});
test('body capture affects only new requests; members cannot view another member calls', () => {
  let { state, actor } = withMember(); state = request(state); const old = state.requests[0];
  state = execute(state, 'budget', budgetSettings(state, { logBodies: true })); state = request(state); assert.equal(state.requests[0].bodyRecorded, true); assert.ok(state.requests[0].requestBody);
  assert.equal(old.requestBody, undefined); assert.ok(!visibleRequests(state, state.projects.find(item => item.id === projectId), actor).some(row => row.userId === identity.userId));
});
test('delete requires exact confirmation and preserves history while disabling every associated Key', () => {
  let state = request(createAdminSeed()), count = state.requests.length; const project = state.projects.find(item => item.id === projectId);
  assert.throws(() => execute(state, 'delete', { confirmName: '错误名称' }), /完整项目名称/);
  state = execute(state, 'delete', { confirmName: project.name }); assert.equal(state.requests.length, count); assert.ok(state.apiKeys.filter(key => key.projectId === projectId).every(key => key.status === '已删除'));
  assert.throws(() => request(state), /无法访问/);
});
test('concurrency and storage failures leave input state untouched and do not report a successful commit', () => {
  const state = createAdminSeed(), before = JSON.stringify(state), action = { type: 'workspace', operation: 'create', identity, values: { name: '事务项目' } };
  assert.throws(() => persistAdminAction(state, action, { getItem: () => JSON.stringify({ ...state, revision: state.revision + 1 }), setItem: () => assert.fail('must not save') }), /数据已变化/);
  assert.throws(() => persistAdminAction(state, action, { getItem: () => JSON.stringify(state), setItem: () => { throw new Error('quota'); } }), /quota/);
  assert.equal(JSON.stringify(state), before); assert.match(STORAGE_KEY, /5130/);
});
test('catalogue offers use the same published selling prices and never substitute procurement prices', () => {
  const state = createAdminSeed(), model = state.models.find(item => item.id === 'model-1'), offers = modelOffers(state, model);
  assert.ok(offers.length); assert.ok(offers.every(offer => offer.price.supplyId === offer.id && offer.callId.includes('/')));
});
test('request parameter boundaries reject non-finite values and preserve zero-charge failures', () => {
  const state = createAdminSeed();
  for (const values of [{ temperature: 'NaN' }, { topP: Infinity }, { maxOutput: -1 }, { prompt: '字'.repeat(6001) }]) {
    const row = request(state, values).requests[0]; assert.notEqual(row.httpStatus, 200); assert.equal(row.customerCharge, 0);
  }
});
test('an account rate cap aggregates usage across its projects', () => {
  let state = createAdminSeed(); state.limits = [{ id: 'account-cap', scopeType: 'tenant', scopeId: identity.tenantId, rpm: 1, tpm: 100000, status: '已启用', name: '账户容量' }];
  state = request(state);
  state = execute(state, 'request', { requestId: crypto.randomUUID(), modelId: 'model-1', keyId: 'experience-project-1-2', prompt: '另一项目' }, identity, 'project-1-2');
  assert.equal(state.requests[0].errorCode, 'rate_limit_exceeded'); assert.match(state.requests[0].errorMessage, /账户容量/);
});
test('Token Plan Key ownership and subscribed model range remain independent of project ownership', () => {
  const state = createAdminSeed(); const next = execute(state, 'createKey', { ...keyValues, subscriptionId: 'order-001' });
  assert.equal(next.apiKeys[0].subscriptionId, 'order-001'); assert.equal(next.apiKeys[0].projectId, projectId);
  assert.throws(() => execute(state, 'createKey', { ...keyValues, subscriptionId: 'order-002' }), /Token Plan/);
  assert.throws(() => execute(state, 'createKey', { ...keyValues, subscriptionId: 'order-001', modelIds: ['model-2'] }), /Token Plan/);
});

test('repair: unreadable auth never falls back to the preview administrator', async () => {
  const {workspaceIdentity}=await import('../src/project-domain.mjs');
  assert.equal(workspaceIdentity({storageError:'blocked',user:null},'enterprise'),null);
});
test('repair: read-only members may leave, and membership changes reach the account directory', () => {
  const {state,actor}=withMember('只读');
  const next=execute(state,'leave',{},actor);
  assert.equal(next.projectMemberships.find(item=>item.id==='wpm').status,'已退出');
  const changed=execute(state,'organization',{type:'member.status',ids:[actor.userId],status:'已停用'},identity,null);
  assert.equal(changed.memberships.find(item=>item.id==='wm').status,'已停用');
  assert.throws(()=>execute(changed,'createKey',keyValues,actor));
});
test('repair: managed keys have effective models without dereferencing null, and failed validations remove supply', async () => {
  const {effectiveKeyModels}=await import('../src/project-domain.mjs');
  const state=createAdminSeed();
  assert.ok(effectiveKeyModels(state,state.apiKeys.find(item=>item.id===`experience-${projectId}`)).length);
  state.modelSupplies.filter(item=>item.modelId==='model-1').forEach(item=>{item.validationStatus='失败';});
  assert.equal(modelOffers(state,state.models.find(item=>item.id==='model-1')).length,0);
});
test('repair: Token Plan debits quota once and does not charge PAYG; expiry and exhaustion reject', () => {
  let state=createAdminSeed();
  state=execute(state,'createKey',{...keyValues,subscriptionId:'order-001'});
  const key=state.apiKeys[0], before=state.orders.find(item=>item.id==='order-001');
  const next=request(state,{keyId:key.id});
  assert.equal(next.requests[0].customerCharge,0);assert.equal(next.requests[0].quotaDebit,384);
  assert.equal(next.orders.find(item=>item.id===before.id).used,(before.used||0)+384);
  for(const patch of [{expiresAt:'2020-01-01T00:00:00Z'},{entitlement:1}]) {
    const broken=structuredClone(state);Object.assign(broken.orders.find(item=>item.id===before.id),patch);
    const rejected=request(broken,{keyId:key.id});assert.equal(rejected.requests[0].httpStatus,403);assert.equal(rejected.requests[0].customerCharge,0);
  }
});
test('repair: request metadata preserves context and failed attempts do not invent an upstream call', () => {
  const state=createAdminSeed();
  const result=request(state,{systemPrompt:'秘密系统提示',messages:[{role:'user',content:'秘密历史'}],deepThinking:true});
  assert.equal(result.requests[0].contextMessages,1);assert.equal(result.requests[0].parameters.deepThinking,true);assert.equal(result.requests[0].requestBody,undefined);
  const failed=request(state,{prompt:''});assert.equal(failed.requests[0].httpStatus,400);assert.deepEqual(failed.requests[0].attempts,[]);assert.equal(failed.requests[0].stages[1].result,'未执行');assert.equal(failed.audits[0].result,'失败');
});
test('repair: image-only calls, media units and usage boundaries remain coherent', async () => {
  let state=createAdminSeed();state=execute(state,'model',{modelId:'catalog-demo-image',enabled:true,rpm:'',tpm:''});
  const next=request(state,{modelId:'catalog-demo-image',prompt:'',attachments:[{name:'参考.png'}],quantity:2});
  assert.equal(next.requests[0].httpStatus,200);assert.deepEqual(next.requests[0].usage,{images:2});assert.equal(next.requests[0].customerCharge,400000);
  const {projectUsageData}=await import('../src/project-view-data.mjs');
  const data=projectUsageData({state:next,records:[next.requests[0]],start:'2026-10-24',end:'2026-10-24',now:new Date('2026-10-25T00:00:00+08:00')});
  assert.equal(data.summary.requests,1);assert.equal(data.summary.images,2);assert.equal(data.summary.total,null);assert.ok(data.buckets.every(item=>typeof item.time==='number'));assert.equal(data.buckets.reduce((sum,item)=>sum+item.requests,0),1);
});
test('repair: project routes cannot reference unauthorized models and orders are account scoped', () => {
  const state=createAdminSeed();assert.throws(()=>execute(state,'routes',{routes:[{id:'r',name:'测试路由',modelIds:['no-model']}]}));
  const next=execute(state,'routes',{routes:[{id:'r',name:'测试路由',modelIds:['model-1'],strategy:'效果优先'}]});assert.deepEqual(next.projects.find(item=>item.id===projectId).smartRoutes[0].modelIds,['model-1']);
  assert.throws(()=>execute(state,'order',{productIds:['product-plan']},identity,null),/重复/);
});

test('product billing classification accepts shared explicit types and catalogue codes', () => {
  assert.equal(productBillingType({billingType:'plan'}),'plan');
  assert.equal(productBillingType({code:'TOKEN-100M'}),'plan');
  assert.equal(productBillingType({billingMode:'按量付费'}),'payg');
  assert.equal(productBillingType({code:'CODING-TEAM'}),'coding');
  assert.equal(productBillingType({billingType:'package',code:'TOKEN-OLD'}),'package');
});
