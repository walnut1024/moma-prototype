import { availableWorkspaces, canAccessPage, WORKSPACE_HOME } from './admin-v2/navigation.mjs';

export const LOGIN_BASE = '/moma_5.12.0_estack/';

export function loginReturn(value) {
  if (typeof value !== 'string' || !value.startsWith(LOGIN_BASE) || /[\\\r\n]/.test(value)) return '';
  const url = new URL(value, 'https://moma.invalid');
  if (url.origin !== 'https://moma.invalid' || ![LOGIN_BASE, LOGIN_BASE + 'order/serviceOrder/'].includes(url.pathname) || url.hash.startsWith('#/auth/')) return '';
  return url.pathname + url.search + url.hash;
}

export function loginLocation(returnTo) {
  const target = loginReturn(returnTo);
  return LOGIN_BASE + '#/auth/login' + (target ? '?returnTo=' + encodeURIComponent(target) : '');
}

export function loginDestination(returnTo, account) {
  const target = loginReturn(returnTo);
  const hash = target && new URL(target, 'https://moma.invalid').hash;
  if (account) {
    const home = WORKSPACE_HOME[availableWorkspaces(account.role)[0]];
    if (!home) throw Error('当前账号没有可访问的后台工作区');
    const page = hash?.match(/^#\/admin-2\/([^/?]+)/)?.[1];
    return target && new URL(target, 'https://moma.invalid').pathname === LOGIN_BASE && page && canAccessPage(account.role, page) ? target : LOGIN_BASE + '#/admin-2/' + home;
  }
  return target && !hash.startsWith('#/admin') ? target : LOGIN_BASE + '?page=space-overview';
}

export function openLogin(returnTo = location.pathname + location.search + location.hash) {
  if (location.hash.startsWith('#/auth/login')) return;
  const target = loginLocation(returnTo);
  if (location.pathname === LOGIN_BASE) location.hash = target.slice(target.indexOf('#'));
  else location.assign(target);
}
