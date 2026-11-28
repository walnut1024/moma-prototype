import { diagnosticRequest, latestRequests } from './request-identity.mjs';

export function userBusinessData(state, requests) {
  const accounts = state.accountUserIds && new Set(state.accountUserIds);
  const users = state.users.filter(row => (!accounts || accounts.has(row.id)) && (row.registeredAt || row.createdAt))
    .map(row => ({
      id: row.id,
      type: state.tenants.some(tenant => tenant.ownerId === row.id && tenant.type === '个人') ? '个人' : '企业',
      at: Date.parse(row.registeredAt || row.createdAt),
    }));
  const logins = (state.identityEvents || []).filter(row => row.type === 'login')
    .map(row => ({ userId: row.userId, at: Date.parse(row.at) }));
  const calls = latestRequests(requests).filter(row => row.userId && !diagnosticRequest(row))
    .map(row => ({ userId: row.userId, at: Date.parse(row.createdAt) }));
  const keys = state.apiKeys.filter(row => row.ownerId)
    .map(row => ({ userId: row.ownerId, at: Date.parse(row.createdAt) }));
  return { users, logins, calls, keys };
}
