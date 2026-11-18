import { AGREEMENTS } from './site-config.mjs';

const route = '#/agreements/';

export function agreementHref(key) {
  return '/moma_5.12.0_estack/' + route + key;
}

export function agreementFromHash(hash) {
  const key = hash.startsWith(route) ? hash.slice(route.length) : '';
  return AGREEMENTS.some(([id]) => id === key) ? key : null;
}
