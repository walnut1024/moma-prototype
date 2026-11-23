import { useEffect, useSyncExternalStore } from 'react';
import { API_PREFIX } from '../api-path.js';
import { cacheLicense, deploymentLicense, licenseSnapshot } from './deployment-license.mjs';

const event = 'moma:deployment-license';
let loading;
const subscribe = listener => {
  window.addEventListener(event, listener);
  return () => window.removeEventListener(event, listener);
};

function refresh() {
  loading ||= fetch(API_PREFIX + '/deployment/license', { credentials: 'same-origin', cache: 'no-store' })
    .then(response => {
      if (!response.ok) throw Error('无法读取站点授权');
      return response.json();
    })
    .then(cacheLicense)
    .catch(() => cacheLicense({ ...deploymentLicense({ MOMA_LICENSE_EDITION: 'internal' }), status: 'unavailable' }))
    .finally(() => { loading = null; });
}

export function useDeploymentLicense(enabled = true) {
  const license = useSyncExternalStore(subscribe, licenseSnapshot);
  useEffect(() => {
    if (!enabled) return;
    if (!licenseSnapshot()) void refresh();
    window.addEventListener('focus', refresh);
    return () => window.removeEventListener('focus', refresh);
  }, [enabled]);
  useEffect(() => {
    if (!enabled || !license?.expiresAt || license.status !== 'active') return;
    const delay = Date.parse(license.expiresAt) - Date.now();
    const timeout = setTimeout(refresh, Math.max(0, Math.min(delay + 50, 2147483647)));
    return () => clearTimeout(timeout);
  }, [enabled, license]);
  return license;
}
