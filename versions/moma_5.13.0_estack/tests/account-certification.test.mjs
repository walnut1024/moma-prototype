import test from 'node:test';
import assert from 'node:assert/strict';
import { emptyAuthState, registerAuthAccount, authRoute, realNameErrors, submitRealNameCertification, submitEnterpriseCertification } from '../src/auth-state.mjs';

const phone = '13800138000';
const registered = () => registerAuthAccount(emptyAuthState(), { phone });
const identity = { name: '张三', idNumber: '11010519491231002X', consent: true };
const company = { subjectType: 'enterprise', companyName: '青禾科技有限公司', taxId: 'REG20261006', province: '江苏省', city: '南京市', industry: 'I', contactName: '张三', contactType: 'phone', contactIdentity: phone, authorized: true, authorizationRole: 'authorized-agent', authorizationNote: '受单位委托办理企业认证' };

test('phone registration creates one signed-in account without enterprise permissions', () => {
  const state = registered();
  assert.equal(authRoute('#/auth/account'), 'account');
  assert.equal(state.currentUserId, state.accounts[0].id);
  assert.equal(state.activeSpace, 'personal');
  assert.deepEqual(state.memberships, []);
  assert.throws(() => registerAuthAccount(state, { phone }), /已注册/);
});

test('real-name submission validates identity syntax and consent, stores only masked data', () => {
  assert.equal(Object.keys(realNameErrors(identity)).length, 0);
  assert.ok(realNameErrors({ ...identity, idNumber: '110105194912310021' }).idNumber);
  assert.ok(realNameErrors({ ...identity, consent: false }).consent);
  assert.throws(() => submitRealNameCertification(emptyAuthState(), identity), /先登录/);
  const state = registered(), next = submitRealNameCertification(state, identity);
  assert.equal(next.accounts[0].realNameCertification.status, '审核中');
  assert.equal(JSON.stringify(next).includes(identity.idNumber), false);
  assert.deepEqual(next.memberships, state.memberships);
  assert.equal(next.activeSpace, 'personal');
  assert.throws(() => submitRealNameCertification(next, identity), /已有/);
});

test('enterprise certification belongs to the logged-in applicant and grants no role', () => {
  assert.throws(() => submitEnterpriseCertification(emptyAuthState(), company), /先登录/);
  const state = registered();
  assert.throws(() => submitEnterpriseCertification(state, { ...company, authorized: false }), /有权代表/);
  assert.throws(() => submitEnterpriseCertification(state, { ...company, authorizationRole: '' }), /申请人身份/);
  assert.throws(() => submitEnterpriseCertification(state, { ...company, authorizationNote: '' }), /授权说明/);
  const next = submitEnterpriseCertification(state, { ...company, contactIdentity: '13900139000', adminIdentity: 'attacker@example.com' });
  assert.equal(next.applications[0].contactIdentity, phone);
  assert.equal(next.applications[0].adminIdentity, undefined);
  assert.equal(next.applications[0].adminUserId, undefined);
  assert.equal(next.applications[0].authorizationRole, 'authorized-agent');
  assert.equal(next.applications[0].applicantUserId, state.currentUserId);
  assert.equal(next.applications[0].status, '待处理');
  assert.deepEqual(next.accounts, state.accounts);
  assert.deepEqual(next.memberships, []);
  assert.throws(() => submitEnterpriseCertification(next, company), /已有/);
  const supplement = { ...next, applications: next.applications.map(item => ({ ...item, status: '需补充' })) };
  const corrected = submitEnterpriseCertification(supplement, { ...company, authorizationNote: '补充授权范围' }, next.applications[0].id);
  assert.equal(corrected.applications.length, 1);
  assert.equal(corrected.applications[0].status, '待处理');
  assert.deepEqual(corrected.accounts, state.accounts);
  const other = registerAuthAccount(next, { phone: '13900139000' });
  assert.throws(() => submitEnterpriseCertification(other, { ...company, contactIdentity: '13900139000' }, next.applications[0].id), /无权/);
});

test('obsolete registration gallery route is unavailable', () => {
  assert.equal(authRoute('#/auth/flows'), null);
  assert.equal(authRoute('#/auth/register'), 'register');
});
