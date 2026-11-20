import { LOGIN_BASE } from './login-navigation.mjs';
import { siteUrl } from './site-config.mjs';

export const PORTAL_HOME_ENDPOINT = '/site-portal';

export function isPortalHomeEntry({ pathname, search, hash }) {
  return !search && !hash && [LOGIN_BASE, LOGIN_BASE.slice(0, -1), LOGIN_BASE + 'index.html'].includes(pathname);
}

export function portalHomeUrl(value, origin) {
  const address = siteUrl(value);
  if (!address) return '';
  const target = new URL(address);
  return target.origin === origin && isPortalHomeEntry(target) ? '' : address;
}
