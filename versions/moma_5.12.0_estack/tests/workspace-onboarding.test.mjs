import test from 'node:test';
import assert from 'node:assert/strict';
import { loadAdminState, persistAdminAction, persistEnterpriseAction, persistIndividualAction, STORAGE_KEY } from '../src/admin-v2/store.js';
import { AUTH_DATA_KEY, resolveUserIdentity, workspaceServiceOrdered } from '../src/service-access.mjs';
import { SITE_CONFIG_KEY } from '../src/site-config.mjs';

function memoryStorage() {
  const data = new Map();
  return { getItem:key => data.get(key) ?? null, setItem:(key,value) => data.set(key,value), removeItem:key => data.delete(key) };
}

function signedInWorkspace(storage) {
  const state = loadAdminState(storage);
  const account = state.admins.find(row => row.role === '平台管理员' && row.status === '已启用');
  return persistAdminAction(state, {type:'enterAdmin',accountId:account.id}, storage);
}

const enterprise = index => ({
  type:'enterprise', operation:'create', deploymentMode:'private',
  ids:{ tenant:'onboard-company-' + index, user:'onboard-admin-' + index, member:'onboard-member-' + index, organization:'onboard-org-' + index },
  data:{ type:'企业', companyName:'客户企业 ' + index, taxId:'MOCK' + index, countryRegion:'中国', province:'江苏省',
    contactName:'联系人', contactPhone:'02512345678', accountMode:'new', adminName:'管理员 ' + index,
    login:'work-admin-' + index, phone:'1391234990' + index },
});

const personal = {
  type:'individual', operation:'create', ids:{ tenant:'personal-owner', project:'personal-project' },
  data:{ accountMode:'existing', userId:'onboard-admin-1' },
};

test('factory private deployment opens multiple enterprises and a personal space on one existing login', () => {
  const storage = memoryStorage();
  const initial = signedInWorkspace(storage);
  const first = persistEnterpriseAction(initial, enterprise(1), storage);
  const second = persistEnterpriseAction(first, enterprise(2), storage);
  assert.equal(second.tenants.filter(row => row.deploymentMode === 'private').length, 2);
  const opened = persistIndividualAction(second, personal, storage);
  const auth = JSON.parse(storage.getItem(AUTH_DATA_KEY));
  assert.equal(auth.accounts.filter(account => account.id === 'onboard-admin-1').length, 1);
  const current = { ...auth, currentUserId:'onboard-admin-1' };
  assert.equal(resolveUserIdentity(opened, { ...current, activeSpace:'onboard-company-1' }, storage).tenantId, 'onboard-company-1');
  assert.equal(resolveUserIdentity(opened, { ...current, activeSpace:'personal' }, storage).tenantId, 'personal-owner');
  assert.throws(() => resolveUserIdentity(opened, { ...current, activeSpace:'onboard-company-2' }, storage), /尚未关联/);
  assert.equal(opened.projects.find(row => row.id === 'personal-project').tenantId, 'personal-owner');
  assert.throws(() => persistIndividualAction(opened, personal, storage), /已开通个人空间/);
  storage.setItem(SITE_CONFIG_KEY, JSON.stringify({personalEnabled:false}));
  assert.throws(() => persistEnterpriseAction(opened, enterprise(3), storage), /已开通本企业/);
  assert.throws(() => resolveUserIdentity(opened, { ...current, activeSpace:'personal' }, storage), /仅开放本企业/);
});

test('customer creation rolls back when the login write fails', () => {
  const storage = memoryStorage();
  const state = signedInWorkspace(storage);
  const raw = storage.getItem(STORAGE_KEY);
  const save = storage.setItem;
  storage.setItem = (key,value) => {
    if (key === AUTH_DATA_KEY) throw Error('storage unavailable');
    return save(key,value);
  };
  assert.throws(() => persistEnterpriseAction(state, enterprise(1), storage), /storage unavailable/);
  assert.equal(storage.getItem(STORAGE_KEY), raw);
  assert.equal(storage.getItem(AUTH_DATA_KEY), null);
});

test('factory orders grant a specific service to the purchasing tenant while active', () => {
  const service = { id:'offer-a', modelId:'model' };
  const order = { tenantId:'company-1', serviceId:'offer-a', status:'生效中', endAt:'2026-12-01T00:00:00Z' };
  const state = { orders:[order], products:[] };
  const at = Date.parse('2026-11-13T00:00:00Z');
  assert.equal(workspaceServiceOrdered(state, 'company-1', service, at), true);
  assert.equal(workspaceServiceOrdered(state, 'company-2', service, at), false);
  assert.equal(workspaceServiceOrdered(state, 'company-1', { ...service, id:'offer-b' }, at), false);
  assert.equal(workspaceServiceOrdered(state, 'company-1', service, Date.parse(order.endAt)), false);
});
