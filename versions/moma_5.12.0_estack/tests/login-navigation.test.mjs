import test from 'node:test';
import assert from 'node:assert/strict';
import { LOGIN_BASE, loginLocation, loginReturn, loginDestination } from '../src/login-navigation.mjs';
import { cloudAdminRequest } from '../src/admin-v2/admin-client.mjs';

test('one login entry preserves a complete local return address, including order and detail parameters', () => {
  for (const source of [LOGIN_BASE + '?page=experience&project=p', LOGIN_BASE + '#/admin-2/listing?model=a', LOGIN_BASE + 'order/serviceOrder/?model=a']) {
    const url = new URL(loginLocation(source), 'https://moma.invalid');
    assert.equal(url.pathname, LOGIN_BASE);
    assert.equal(new URLSearchParams(url.hash.split('?')[1]).get('returnTo'), source);
  }
});

test('login rejects external, other-version, normalized traversal and recursive return addresses', () => {
  for (const value of ['https://other.test/', '//other.test/', LOGIN_BASE + '../other/', LOGIN_BASE + '\\evil', LOGIN_BASE + '#/auth/login', '/moma_5.11.0/']) {
    assert.equal(loginReturn(value), '');
    assert.equal(loginLocation(value), LOGIN_BASE + '#/auth/login');
  }
});

test('customers return to their source, and customer logins cannot enter an admin destination', () => {
  const source = LOGIN_BASE + '?page=model-detail&model=a';
  assert.equal(loginDestination(source), source);
  assert.equal(loginDestination(LOGIN_BASE + '#/admin-2/admins'), LOGIN_BASE + '?page=space-overview');
  assert.equal(loginDestination(null), LOGIN_BASE + '?page=space-overview');
});

test('backend identities land on an allowed home and only resume pages permitted by their role', () => {
  assert.equal(loginDestination('', {role:'平台管理员'}), LOGIN_BASE + '#/admin-2/dashboard');
  assert.equal(loginDestination('', {role:'运营人员'}), LOGIN_BASE + '#/admin-2/dashboard');
  assert.equal(loginDestination('', {role:'运维人员'}), LOGIN_BASE + '#/admin-2/call-analysis');
  const source = LOGIN_BASE + '#/admin-2/listing?model=a';
  assert.equal(loginDestination(source, {role:'运营人员'}), source);
  assert.equal(loginDestination(source, {role:'运维人员'}), LOGIN_BASE + '#/admin-2/call-analysis');
  assert.throws(() => loginDestination(source, {role:'普通成员'}), /没有可访问/);
});

test('expired module requests return to unified login while forbidden and login requests stay in place', async () => {
  const fetch = globalThis.fetch, location = globalThis.location;
  try {
    for (const [path,status,redirect] of [['/traffic-limits',401,true],['/audit-logs',401,true],['/package-management',401,true],['/model-operations',403,false],['/auth/sign-in',401,false]]) {
      const source = '#/admin-2/traffic-limits';
      globalThis.location = {pathname:LOGIN_BASE,search:'',hash:source};
      globalThis.fetch = async () => Response.json({error:{message:'denied'}},{status});
      await assert.rejects(cloudAdminRequest(path), error => error.status === status);
      assert.equal(globalThis.location.hash.startsWith('#/auth/login'),redirect,path + ':' + status);
      if (redirect) assert.equal(new URLSearchParams(globalThis.location.hash.split('?')[1]).get('returnTo'),LOGIN_BASE + source);
    }
  } finally {
    globalThis.fetch=fetch;
    if (location === undefined) delete globalThis.location; else globalThis.location=location;
  }
});
