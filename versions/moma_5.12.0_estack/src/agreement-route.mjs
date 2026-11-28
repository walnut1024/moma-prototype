import { AGREEMENTS } from './site-config.mjs';

import { appBase } from './prototype-ui.mjs';

const route = '#/agreements/';

export function agreementHref(key) {
  return appBase + route + key;
}

export function agreementFromHash(hash) {
  const key = hash.startsWith(route) ? hash.slice(route.length) : '';
  return AGREEMENTS.some(([id]) => id === key) ? key : null;
}
