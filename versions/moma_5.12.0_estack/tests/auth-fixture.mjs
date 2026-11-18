import { authPhone } from '../src/auth-state.mjs';

export function withSignedInAccount(state, { phone, name }) {
  phone = authPhone(phone);
  const account = {
    id: `auth-user-${crypto.randomUUID()}`, phone, name: name || `用户${phone.slice(-4)}`,
    status: '正常', registeredAt: new Date().toISOString(),
  };
  return { ...state, accounts: [...state.accounts, account], currentUserId: account.id, activeSpace: 'personal' };
}
