import test from 'node:test';
import assert from 'node:assert/strict';
import { AUTH_INVITE, authRoute, emptyAuthState, authPhone, enterpriseLoginPolicy, normalizeAuthLogin, verifyAuthCode, registerAuthAccount, loginAuthAccount, availableAuthSpaces, acceptAuthInvite, submitAuthApplication, queryAuthApplication, applicationErrors, activationAccount, activateAuthAccount, encodeAuthPassword, matchesAuthPassword } from '../src/auth-state.mjs';

test('phone registration is unique and does not silently register during login', () => {
  const state = registerAuthAccount(emptyAuthState(), { phone: '+86 13800138000' });
  assert.equal(state.accounts[0].phone, '13800138000');
  assert.throws(() => registerAuthAccount(state, { phone: '13800138000' }), /已注册/);
  assert.throws(() => loginAuthAccount(state, '13900139000', 'personal'), /尚未注册/);
  assert.throws(() => authPhone('123'), /格式错误/);
  assert.equal(authRoute('#/auth/invite?token=abc'), 'invite');
  assert.equal(authRoute('#/admin-2/accounts'), null);
});

test('verification binds the code to the phone, purpose, expiry and retry limit', () => {
  const challenge = { identity: '13800138000', type: 'phone', code: '123456', purpose: 'register', issuedAt: 1000, attempts: 0 };
  const data = { identity: '13800138000', type: 'phone', code: '123456', purpose: 'register', now: 2000 };
  assert.equal(verifyAuthCode(challenge, data), true);
  assert.throws(() => verifyAuthCode(challenge, { ...data, identity: '13900139000' }), /已变化/);
  assert.throws(() => verifyAuthCode(challenge, { ...data, purpose: 'password' }), /已变化/);
  assert.throws(() => verifyAuthCode(challenge, { ...data, now: 301000 }), /已过期/);
  assert.throws(() => verifyAuthCode(challenge, { ...data, code: '000000' }), /错误/);
  assert.throws(() => verifyAuthCode({ ...challenge, attempts: 5 }, data), /次数过多/);
});

test('only the invited phone may join and repeated acceptance keeps one relationship', () => {
  const state = registerAuthAccount(emptyAuthState(), { phone: AUTH_INVITE.phone });
  const joined = acceptAuthInvite(state, AUTH_INVITE.id, Date.parse('2026-10-05T12:00:00+08:00'));
  assert.equal(joined.memberships.length, 1);
  assert.equal(joined.memberships[0].role, '普通成员');
  assert.equal(joined.activeSpace, AUTH_INVITE.enterpriseId);
  assert.equal(loginAuthAccount({ ...joined, currentUserId: null }, AUTH_INVITE.phone, 'enterprise').activeSpace, AUTH_INVITE.enterpriseId);
  assert.equal(acceptAuthInvite(joined, AUTH_INVITE.id).memberships.length, 1);
  assert.throws(() => acceptAuthInvite({ ...joined, memberships: joined.memberships.map(member => ({ ...member, enterpriseFrozen: true })) }, AUTH_INVITE.id), /已冻结/);
  const other = registerAuthAccount(state, { phone: '13900139000' });
  assert.throws(() => acceptAuthInvite(other, AUTH_INVITE.id), /不一致/);
  assert.throws(() => acceptAuthInvite(state, 'revoked'), /不存在/);
  assert.throws(() => acceptAuthInvite(state, AUTH_INVITE.id, Date.parse(AUTH_INVITE.expiresAt)), /已过期/);
});

test('application intake is independent of identity creation and query requires the original contact', () => {
  const state = emptyAuthState();
  const data = { subjectType: 'government', companyName: '政务服务中心', taxId: '91320000123456789X', province: '江苏省', industry: 'S', contactName: '张三', contactType: 'email', contactIdentity: 'CONTACT@example.com', adminName: '李四', adminType: 'phone', adminIdentity: '13900139000' };
  const challenge = { identity: 'contact@example.com', type: 'email', code: '123456', purpose: 'enterprise', issuedAt: Date.now(), attempts: 0 };
  const verification = { challenge, code: '123456', identity: data.contactIdentity, type: 'email' };
  const applied = submitAuthApplication(state, data, verification);
  const record = applied.applications[0];
  assert.equal(record.status, '待处理');
  assert.deepEqual(applied.accounts, state.accounts);
  assert.deepEqual(applied.memberships, state.memberships);
  assert.equal(applied.currentUserId, null);
  assert.equal(record.adminName, '张三');
  assert.equal(record.adminType, record.contactType);
  assert.equal(record.adminIdentity, record.contactIdentity);
  assert.equal(record.contactIdentity, 'contact@example.com');
  assert.throws(() => submitAuthApplication(applied, data, verification), /已有开通申请/);
  assert.throws(() => submitAuthApplication(state, data, { ...verification, code: '000000' }), /验证码错误/);
  assert.throws(() => submitAuthApplication(state, { ...data, contactIdentity: 'other@example.com' }, verification), /已变化/);
  assert.equal(applicationErrors(data, 2, ['phone']).contactType, '当前项目不支持此登录方式');
  assert.equal(applicationErrors({ ...data, province: '' }, 1).province, '请选择省份');
  assert.deepEqual(applicationErrors({ ...data, contactName: '', contactIdentity: '' }, 1), {});
  assert.equal(applicationErrors({ contactType: 'phone' }, 2).contactName, '请填写 40 字以内的申请人姓名');
  assert.throws(() => queryAuthApplication(applied, record.id, { ...verification, challenge: null }), /先获取/);
  const queryProof = { ...verification, challenge: { ...challenge, purpose: 'application' } };
  assert.equal(queryAuthApplication(applied, record.id, queryProof).id, record.id);
  assert.throws(() => queryAuthApplication(applied, record.id, { ...queryProof, identity: 'other@example.com', challenge: { ...queryProof.challenge, identity: 'other@example.com' } }), /不匹配/);
  assert.throws(() => submitAuthApplication(applied, data, verification, record.id), /状态/);
  const supplement = { ...applied, applications: [{ ...record, status: '需补充' }] };
  const updated = submitAuthApplication(supplement, { ...data, contactName: '王五' }, verification, record.id);
  assert.equal(updated.applications.length, 1);
  assert.equal(updated.applications[0].id, record.id);
  assert.equal(updated.applications[0].status, '待处理');
  assert.equal(updated.applications[0].adminName, '王五');
  const closed = { ...applied, applications: [{ ...record, status: '已关闭' }] };
  assert.equal(submitAuthApplication(closed, data, verification).applications.length, 2);
});

test('administrator activation requires a valid link, active membership and matching verification', async () => {
  const token = 'issued-activation-token';
  const user = { id: 'new-admin', name: '管理员', email: 'admin@example.com', status: '正常', activation: { token, type: 'email', enterpriseId: 'opened', expiresAt: new Date(Date.now() + 600000).toISOString() } };
  const state = { ...emptyAuthState(), accounts: [user], memberships: [{ userId: user.id, enterpriseId: 'opened', enterprise: '已开通企业', role: '企业管理员', status: '已加入' }] };
  assert.throws(() => loginAuthAccount(state, user.email, 'enterprise'), /尚未激活/);
  assert.throws(() => activationAccount(state, 'unknown'), /链接无效/);
  assert.throws(() => activationAccount(state, token, Date.parse(user.activation.expiresAt)), /已过期/);
  assert.throws(() => activationAccount({ ...state, memberships: [] }, token), /不可用/);
  const verification = { challenge: { identity: user.email, type: 'email', code: '123456', purpose: 'activate', issuedAt: Date.now(), attempts: 0 }, code: '123456' };
  await assert.rejects(activateAuthAccount(state, token, { ...verification, code: '000000' }, 'Admin2026!'), /验证码错误/);
  const activated = await activateAuthAccount(state, token, verification, 'Admin2026!');
  assert.equal(activated.currentUserId, null);
  assert.equal(activated.accounts[0].activation, null);
  assert.equal(activated.memberships.length, 1);
  assert.equal(await matchesAuthPassword('Admin2026!', activated.accounts[0].credential), true);
  assert.equal(loginAuthAccount(activated, user.email, 'enterprise').activeSpace, 'opened');
  assert.throws(() => activationAccount(activated, token), /链接无效/);
});

test('personal freezing does not revoke an active enterprise membership; stopped identities cannot log in', () => {
  const state = acceptAuthInvite(registerAuthAccount(emptyAuthState(), { phone: AUTH_INVITE.phone }), AUTH_INVITE.id);
  const frozen = { ...state, accounts: state.accounts.map(user => ({ ...user, personalFrozen: true })) };
  assert.deepEqual(availableAuthSpaces(frozen).map(space => space.id), [AUTH_INVITE.enterpriseId]);
  const stopped = { ...state, accounts: state.accounts.map(user => ({ ...user, status: '停用' })) };
  assert.throws(() => loginAuthAccount(stopped, AUTH_INVITE.phone, 'personal'), /停用/);
  assert.deepEqual(availableAuthSpaces(stopped), []);
});

test('login enters the selected user type and never silently falls back to another space', () => {
  const personal = registerAuthAccount(emptyAuthState(), { phone: AUTH_INVITE.phone });
  assert.throws(() => loginAuthAccount(personal, AUTH_INVITE.phone, 'enterprise'), /暂无可进入的企业/);
  assert.throws(() => loginAuthAccount(personal, AUTH_INVITE.phone, 'unknown'), /请选择/);
  const joined = acceptAuthInvite(personal, AUTH_INVITE.id);
  assert.equal(loginAuthAccount(joined, AUTH_INVITE.phone, 'personal').activeSpace, 'personal');
  assert.equal(loginAuthAccount({ ...joined, activeSpace: 'personal' }, AUTH_INVITE.phone, 'enterprise').activeSpace, AUTH_INVITE.enterpriseId);
  const frozen = { ...joined, accounts: joined.accounts.map(user => ({ ...user, personalFrozen: true })) };
  assert.throws(() => loginAuthAccount(frozen, AUTH_INVITE.phone, 'personal'), /个人空间已停用/);
  assert.equal(loginAuthAccount(frozen, AUTH_INVITE.phone, 'enterprise').activeSpace, AUTH_INVITE.enterpriseId);
  const unavailable = { ...joined, memberships: joined.memberships.map(member => ({ ...member, enterpriseFrozen: true })) };
  assert.throws(() => loginAuthAccount(unavailable, AUTH_INVITE.phone, 'enterprise'), /暂无可进入的企业/);
  const multiple = { ...joined, memberships: [...joined.memberships, { ...joined.memberships[0], enterpriseId: 'second', enterprise: '另一家企业' }] };
  assert.equal(loginAuthAccount(multiple, AUTH_INVITE.phone, 'enterprise').activeSpace, null);
});

test('password checking uses a salted verifier and rejects invalid or wrong passwords', async () => {
  const credential = await encodeAuthPassword('MoMA2026!');
  assert.equal(credential.digest.includes('MoMA2026'), false);
  assert.equal(await matchesAuthPassword('MoMA2026!', credential), true);
  assert.equal(await matchesAuthPassword('Wrong2026!', credential), false);
  assert.equal(await matchesAuthPassword('short', credential), false);
  await assert.rejects(encodeAuthPassword('12345678'), /包含字母和数字/);
});

test('enterprise email login preserves membership boundaries and normalizes the registered identity', async () => {
  const credential = await encodeAuthPassword('Email2026!');
  const state = { ...emptyAuthState(), accounts: [{ id: 'email-user', email: 'member@example.com', name: '企业成员', status: '正常', credential }], memberships: [{ userId: 'email-user', enterpriseId: 'email-enterprise', enterprise: '邮箱测试企业', status: '已加入', role: '普通成员' }] };
  const next = loginAuthAccount(state, ' Member@EXAMPLE.com ', 'enterprise');
  assert.equal(next.currentUserId, 'email-user');
  assert.equal(next.activeSpace, 'email-enterprise');
  assert.deepEqual(availableAuthSpaces(next).map(space => space.id), ['email-enterprise']);
  assert.equal(await matchesAuthPassword('Email2026!', next.accounts[0].credential), true);
  assert.equal(await matchesAuthPassword('Wrong2026!', next.accounts[0].credential), false);
  assert.throws(() => loginAuthAccount(state, 'unknown@example.com', 'enterprise'), /邮箱未登记/);
  assert.throws(() => loginAuthAccount({ ...state, memberships: [] }, 'member@example.com', 'enterprise'), /暂无可进入的企业/);
  assert.throws(() => loginAuthAccount({ ...state, accounts: [{ ...state.accounts[0], status: '停用' }] }, 'member@example.com', 'enterprise'), /停用/);
  assert.throws(() => loginAuthAccount(state, 'member@example.com', 'personal'), /格式错误/);
  assert.throws(() => loginAuthAccount({ ...state, accounts: [...state.accounts, { ...state.accounts[0], id: 'duplicate', email: 'MEMBER@example.com' }] }, 'member@example.com', 'enterprise'), /多条身份/);
});

test('project login policy permits phone, email or both without enabling email for individuals', () => {
  assert.deepEqual(enterpriseLoginPolicy('phone'), ['phone']);
  assert.deepEqual(enterpriseLoginPolicy('email'), ['email']);
  assert.deepEqual(enterpriseLoginPolicy('phone,email'), ['phone', 'email']);
  assert.throws(() => enterpriseLoginPolicy('anything'), /配置仅支持/);
  assert.equal(normalizeAuthLogin(' Member@Example.com ', 'enterprise', ['email']), 'member@example.com');
  assert.equal(normalizeAuthLogin('+86 13800138000', 'enterprise', ['phone']), '13800138000');
  assert.throws(() => normalizeAuthLogin('member@example.com', 'enterprise', ['phone']), /格式错误/);
  assert.throws(() => normalizeAuthLogin('13800138000', 'enterprise', ['email']), /邮箱格式错误/);
  assert.throws(() => normalizeAuthLogin('a..b@example.com', 'enterprise'), /邮箱格式错误/);
});
