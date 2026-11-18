import { API_PREFIX } from '../../api-path.js';
import { domainModelWorkspace } from '../mock/model-fields.js';
import { openLogin } from '../login-navigation.mjs';

export async function cloudAdminRequest(path, { method = 'GET', body, operationId, signal } = {}) {
  const response = await fetch(API_PREFIX + path, { method, credentials: 'same-origin', signal,
    headers: { ...(method === 'GET' ? {} : { 'content-type': 'application/json', 'x-moma-request': '1' }),
      ...(operationId ? { 'Idempotency-Key': operationId } : {}) },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }) });
  const data = await response.json();
  if (!response.ok || data.error) {
    if (response.status === 401 && !path.startsWith('/auth/') && typeof location !== 'undefined' && location.hash.startsWith('#/admin')) openLogin();
    throw Object.assign(new Error(data.error?.message || '请求失败'), { code: data.error?.code, status: response.status });
  }
  return path === '/model-operations' ? domainModelWorkspace(data) : data;
}

export const loadPackageFactorHistory = (modelId, signal) =>
  cloudAdminRequest('/package-management/factor-history?' + new URLSearchParams({ model: modelId }), { signal });
