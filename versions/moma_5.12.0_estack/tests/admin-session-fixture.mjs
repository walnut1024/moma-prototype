export function withAdminSession(state) {
  const account = state.admins?.find(row => row.status === '已启用' && row.role === state.currentRole);
  if (!account) throw new Error('Test fixture requires an enabled admin');
  return { ...state, adminSession: { accountId: account.id } };
}
