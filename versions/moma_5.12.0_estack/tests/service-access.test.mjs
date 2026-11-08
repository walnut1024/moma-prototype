import test from 'node:test';
import assert from 'node:assert/strict';
import { serviceReferences, serviceAccess, resolveUserIdentity, ADMIN_DATA_KEY, AUTH_DATA_KEY } from '../src/service-access.mjs';
import { linkedAccountFixture, prepareLinkedAccounts, activeAdmin } from '../src/linked-accounts.mjs';
import { createAdminSeed, persistAdminAction } from '../src/admin-v2/store.js';
import { emptyAuthState, availableAuthSpaces, loginAuthAccount } from '../src/auth-state.mjs';
import { experienceTasks } from '../src/service-directory.mjs';
import { chooseModel, filterModels } from '../src/model-selection.mjs';

const storageFor = state => { const rows = new Map([[ADMIN_DATA_KEY, JSON.stringify(state)]]); return { rows, getItem: key => rows.get(key) ?? null, setItem: (key, value) => rows.set(key, value) }; };
const fixture = () => linkedAccountFixture(createAdminSeed(), emptyAuthState());
test('six accounts are explicit, repeatable, preserve disabled identities and never grant a personal space to an enterprise account', () => {
  const {state,auth} = fixture();
  assert.equal(auth.accounts.length, 3); assert.equal(state.admins.filter(row => row.id.startsWith('admin-link')).length,3);
  assert.equal(auth.currentUserId, null); assert.equal(state.adminSession, undefined);
  for (const account of auth.accounts) {
    const signed = loginAuthAccount(auth, account.phone, account.userType), identity = resolveUserIdentity(state,signed);
    assert.equal(availableAuthSpaces(signed).length,1); assert.equal(identity.userId, account.id);
    assert.equal(signed.activeSpace === 'personal', account.userType === 'personal');
  }
  auth.accounts[0].status='停用'; state.admins.find(row=>row.id==='admin-link-system').status='已停用';
  assert.deepEqual(linkedAccountFixture(state,auth),{state,auth});
  assert.throws(()=>loginAuthAccount(auth,auth.accounts[1].phone,'personal'),/停用/);
});
test('mapping rejects duplicates, mismatched membership, inactive customer and unowned personal customer without name guessing', () => {
  const {state,auth} = fixture(), signed = loginAuthAccount(auth,'13800002001','enterprise');
  const alter = callback => { const next=structuredClone({state,auth:signed}); callback(next); assert.throws(()=>resolveUserIdentity(next.state,next.auth)); };
  alter(({auth})=>auth.identityLinks.push({...auth.identityLinks[0]}));
  alter(({state})=>state.memberships.find(row=>row.id==='member-link-enterprise-a').tenantId='tenant-nanjing');
  alter(({state})=>state.tenants.find(row=>row.id==='tenant-gov').status='停用');
  alter(({auth})=>auth.identityLinks=[]);
  alter(({auth})=>auth.memberships[0].status='已移除');
  const personal = loginAuthAccount(auth,'13800001001','personal');
  state.tenants.find(row=>row.id==='personal-demo-001').ownerId='other';
  assert.throws(()=>resolveUserIdentity(state,personal));
});
test('explicit preparation is idempotent and an auth write failure rolls back only its own main write', () => {
  const store=storageFor(createAdminSeed()), before=store.getItem(ADMIN_DATA_KEY);
  const broken={...store,setItem:(key,value)=>{if(key===AUTH_DATA_KEY)throw new Error('quota');store.setItem(key,value);}};
  assert.throws(()=>prepareLinkedAccounts(broken),/quota/); assert.equal(store.getItem(ADMIN_DATA_KEY),before);
  assert.equal(prepareLinkedAccounts(store),true); const saved=new Map(store.rows);
  assert.equal(prepareLinkedAccounts(store),false); assert.deepEqual(store.rows,saved);
  const auth=JSON.parse(store.getItem(AUTH_DATA_KEY));auth.identityLinks[0].tenantId='other';store.setItem(AUTH_DATA_KEY,JSON.stringify(auth));
  assert.throws(()=>prepareLinkedAccounts(store),/冲突/);
});
test('manager identity controls permission and audit regardless of a forged role; user session stays separate', () => {
  const {state}=fixture(), storage=storageFor(state);
  assert.throws(()=>persistAdminAction(state,{type:'setSettings',changes:{}},storage),/后台 mock 账号/);
  let next=persistAdminAction(state,{type:'enterAdmin',accountId:'admin-link-maintenance'},storage);
  assert.throws(()=>persistAdminAction({...next,currentRole:'平台管理员'},{type:'update',collection:'models',id:next.models[0].id,changes:{name:'越权'}},storage),/无权/);
  next=persistAdminAction(next,{type:'enterAdmin',accountId:'admin-link-system'},storage);
  next=persistAdminAction(next,{type:'setSettings',changes:{environmentLabel:'测试'}},storage);
  assert.equal(next.audits[0].actorId,'admin-link-system'); assert.equal(storage.getItem(AUTH_DATA_KEY),null);
  next.admins.find(row=>row.id==='admin-link-system').status='已停用';assert.throws(()=>activeAdmin(next));
  assert.throws(()=>persistAdminAction(next,{type:'setRole',role:'平台管理员'},storage));
});
test('gray eligibility applies to enterprise A, B and personal P per provider and ignores retired model scope', () => {
  const tenants=['tenant-gov','tenant-nanjing','personal-demo-001'];
  const state={tenants:tenants.map(id=>({id,status:'正常'})),grants:[],models:[]};
  for (const [index,scope] of [[0,[tenants[0],tenants[2]]],[1,[tenants[1]]],[2,tenants],[3,[]]]) {
    const model={id:`s${index}`,modelId:`call${index}`,serviceMode:'provider',serviceProviders:[{providerId:'p1',callId:`c${index}p1`},{providerId:'p2',callId:`c${index}p2`}],listingStatus:'已上架',visibility:'公开',callsEnabled:true,releaseStage:'gray',releaseTenantIds:scope,openScope:'selected',tenantIds:[]};
    state.models=[model]; model.platformPublications=['p1','p2'].map(p=>({serviceId:`provider:${model.id}:${p}`,mockServiceId:p,source:'mock'}));
    const refs=serviceReferences(state);
    for(const ref of refs) for(const tenantId of tenants) {
      const live={id:ref.providerId,published:{config:{publicModelId:ref.callId,tenantIds:tenants}}};
      assert.equal(serviceAccess(state,ref,tenantId,live).allowed,scope.includes(tenantId));
      live.published.config.tenantIds=[];assert.equal(serviceAccess(state,ref,tenantId,live).allowed,scope.includes(tenantId));
    }
    model.listingStatus='已下架';assert.equal(serviceAccess(state,refs[0],tenants[0],{}).allowed,false);
  }
});
test('task and selection contracts use known capability and stable ids without guessing by name or subscription', () => {
  assert.deepEqual(experienceTasks({type:'text',profile:{}}),[]);
  assert.deepEqual(experienceTasks({profile:{tasks:['语音合成'],inputModalities:['文本'],outputModalities:['音频']}}),[]);
  assert.deepEqual(experienceTasks({profile:{tasks:['语音识别'],inputModalities:['音频'],outputModalities:['文本']}}),['voice']);
  const rows=[{id:'a',name:'同名',callable:true},{id:'b',name:'同名',callable:false,subscribed:true}];
  assert.deepEqual(chooseModel([],rows[0],false,1),['a']);assert.deepEqual(chooseModel([],rows[1],false,1),[]);
  assert.deepEqual(filterModels(rows).map(row=>row.id),['a']);rows[0].name='改名';assert.deepEqual(chooseModel(['a'],rows[0],true,3),[]);
});

test('auth commits reject old tab snapshots and failed writes; A→B→A never reuses a task identity generation', async () => {
  const { persistAuthState } = await import('../src/auth-state.mjs');
  const { state, auth }=fixture(), storage=storageFor(state);
  storage.setItem(AUTH_DATA_KEY,JSON.stringify(auth));
  const a=persistAuthState(auth,loginAuthAccount(auth,'13800002001','enterprise'),storage);
  const b=persistAuthState(a,loginAuthAccount(a,'13800002002','enterprise'),storage);
  assert.throws(()=>persistAuthState(a,{...a,currentUserId:null},storage),/已变化/);
  const again=persistAuthState(b,loginAuthAccount(b,'13800002001','enterprise'),storage);
  assert.notEqual(resolveUserIdentity(state,a).generation,resolveUserIdentity(state,again).generation);
  const before=storage.getItem(AUTH_DATA_KEY);
  assert.throws(()=>persistAuthState(again,{...again,currentUserId:null},{...storage,setItem(){throw new Error('quota');}}),/quota/);
  assert.equal(storage.getItem(AUTH_DATA_KEY),before);
});

test('mock managers use existing account-management fields and reject occupied email identities', async () => {
  const {adminAccountTransaction}=await import('../src/admin-v2/admin-accounts.js');
  const {state,auth}=fixture(),account=state.admins.find(row=>row.id==='admin-link-operations');
  assert.equal(account.account,'operations@mock.example.com');assert.equal(account.accountType,'email');assert.equal(account.email,account.account);
  const edit=adminAccountTransaction(state,{operation:'edit',id:account.id,values:{name:'运营编辑',role:account.role,phone:''}});
  assert.equal(edit.changes[0].changes.account,account.account);
  const conflict=createAdminSeed();conflict.admins.push({id:'someone-else',account:' Operations@mock.example.com '});
  assert.throws(()=>linkedAccountFixture(conflict,auth),/登录名已被占用/);
});

test('one-click mock switching follows exact user/customer identity, increments session generation and records explicit login events without changing business configuration', async () => {
  const {switchLinkedUser}=await import('../src/linked-accounts.mjs');
  const {state,auth}=fixture(),storage=storageFor(state);storage.setItem(AUTH_DATA_KEY,JSON.stringify(auth));
  const main=storage.getItem(ADMIN_DATA_KEY);
  for(const [index,id] of ['auth-link-enterprise-a','auth-link-enterprise-b','auth-link-personal-p','auth-link-enterprise-a'].entries()){
    const next=switchLinkedUser(id,storage);assert.equal(next.currentUserId,id);assert.equal(next.sessionGeneration,index+1);
    assert.equal(resolveUserIdentity(state,next).tenantId,id.endsWith('-b')?'tenant-nanjing':id.endsWith('-p')?'personal-demo-001':'tenant-gov');
    const saved=JSON.parse(storage.getItem(ADMIN_DATA_KEY)),original=JSON.parse(main);
    for(const key of ['models','providers','apiKeys','tenants','memberships','orders'])assert.deepEqual(saved[key],original[key]);
    assert.equal(saved.identityEvents.length,index+1);
  }
  const before=storage.getItem(AUTH_DATA_KEY);switchLinkedUser('auth-link-enterprise-a',storage);assert.equal(storage.getItem(AUTH_DATA_KEY),before);
  assert.throws(()=>switchLinkedUser('admin-link-system',storage),/前台 mock/);
});

test('quick switch refuses disabled, unprepared, mismatched and failed-save identities without replacing the current session', async () => {
  const {switchLinkedUser}=await import('../src/linked-accounts.mjs');
  for(const change of [
    ({auth})=>{auth.accounts.find(x=>x.id==='auth-link-enterprise-b').status='停用';},
    ({auth})=>{auth.accounts=auth.accounts.filter(x=>x.id!=='auth-link-enterprise-b');},
    ({auth})=>{auth.identityLinks=auth.identityLinks.filter(x=>x.authUserId!=='auth-link-enterprise-b');},
    ({state})=>{state.memberships.find(x=>x.id==='member-link-enterprise-b').status='停用';},
    ({auth})=>{auth.accounts.find(x=>x.id==='auth-link-enterprise-b').phone='13800002999';},
  ]){
    const data=fixture();data.auth=loginAuthAccount(data.auth,'13800002001','enterprise');change(data);
    const storage=storageFor(data.state);storage.setItem(AUTH_DATA_KEY,JSON.stringify(data.auth));const before=storage.getItem(AUTH_DATA_KEY);
    assert.throws(()=>switchLinkedUser('auth-link-enterprise-b',storage));assert.equal(storage.getItem(AUTH_DATA_KEY),before);
  }
  const {state,auth}=fixture(),storage=storageFor(state);storage.setItem(AUTH_DATA_KEY,JSON.stringify(auth));const before=storage.getItem(AUTH_DATA_KEY);storage.setItem=()=>{throw Error('quota');};assert.throws(()=>switchLinkedUser('auth-link-enterprise-a',storage),/quota/);assert.equal(storage.getItem(AUTH_DATA_KEY),before);
});
