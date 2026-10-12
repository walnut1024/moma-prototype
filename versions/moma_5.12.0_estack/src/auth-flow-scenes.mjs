import { AUTH_ENTERPRISE_LOGIN, AUTH_INVITE, emptyAuthState, encodeAuthPassword } from './auth-state.mjs';

// Separate fixtures for the UI collection. Never written to the platform account store.
export const authFlowScenes = [
  { id: 'personal', title: '个人注册', group: '个人用户', path: '手机号验证 → 注册成功 → 设置密码 → 进入个人空间', route: 'register' },
  { id: 'password', title: '密码与登录', group: '个人用户', path: '手机号验证 → 设置新密码 → 密码登录 → 进入个人空间', route: 'password' },
  { id: 'enterprise', title: '政企注册', group: '政企用户', path: '单位信息 → 管理员与联系信息 → 核对提交 → 查询进度', route: 'enterprise' },
  { id: 'pending', title: '申请待处理', group: '政企用户', path: '验证联系人 → 查看申请记录 → 查询其他申请', route: 'application', status: '待处理' },
  { id: 'supplement', title: '补充申请资料', group: '政企用户', path: '查看处理意见 → 补充资料 → 重新提交 → 查询进度', route: 'application', status: '需补充' },
  { id: 'approved', title: '管理员激活', group: '政企用户', path: '服务已开通 → 验证管理员 → 设置密码 → 政企登录', route: 'application', status: '已开通' },
  { id: 'closed', title: '申请已关闭', group: '政企用户', path: '查看处理意见 → 重新申请 → 核对提交', route: 'application', status: '已关闭' },
  { id: 'invite', title: '受邀成员加入', group: '政企用户', path: '核对邀请 → 验证受邀手机号 → 确认加入 → 进入政企空间', route: 'invite' },
  { id: 'enterprise-login', title: AUTH_ENTERPRISE_LOGIN.includes('email') ? '政企邮箱登录' : '政企密码登录', group: '政企用户', path: '输入已激活账号 → 密码登录 → 进入政企空间', route: 'login' },
  { id: 'spaces', title: '多政企空间登录', group: '政企用户', path: '验证账号 → 选择政企空间 → 进入空间 → 切换空间', route: 'login' },
  { id: 'expired', title: '激活链接失效', group: '异常状态', path: '失效提示 → 返回政企登录 → 申请服务', route: 'activate' },
];

export async function createAuthFlowScene(id) {
  const scene = authFlowScenes.find(item => item.id === id);
  if (!scene) throw new Error('请选择有效的注册流程');
  const state = emptyAuthState();
  let params = '', phone = '', details = [];
  const phoneIdentity = '13800138000';
  const adminType = AUTH_ENTERPRISE_LOGIN.includes('email') ? 'email' : 'phone';
  const adminIdentity = adminType === 'email' ? 'admin@example.com' : '13900139000';
  if (scene.status) {
    const application = { id: 'APP-QINGHE01', status: scene.status, subjectType: 'enterprise', companyName: '青禾科技有限公司', taxId: 'REG20261006', province: '江苏省', city: '南京市', industry: 'I', contactName: '陈宁', contactType: adminType, contactIdentity: adminIdentity, adminName: '陈宁', adminType, adminIdentity, createdAt: '2026-10-06T09:00:00+08:00', updatedAt: '2026-10-06T09:00:00+08:00' };
    if (scene.status === '需补充') application.processingNote = '请核对单位登记标识，并补充完整的管理员姓名。';
    if (scene.status === '已关闭') application.processingNote = '申请已由联系人撤回。如仍需开通服务，请重新申请。';
    if (scene.status === '已开通') {
      application.adminUserId = 'collection-admin';
      state.accounts.push({ id: application.adminUserId, name: application.adminName, [adminType]: adminIdentity, status: '正常', activation: { token: 'collection-activation', type: adminType, enterpriseId: 'collection-qinghe', expiresAt: new Date(Date.now() + 3600000).toISOString() } });
      state.memberships.push({ userId: application.adminUserId, enterpriseId: 'collection-qinghe', enterprise: application.companyName, role: '企业管理员', status: '已加入' });
      application.processingNote = '单位资料已核对，政企空间已开通。请管理员完成账号激活。';
    }
    state.applications.push(application);
    params = `?id=${application.id}&contactType=${adminType}&contact=${encodeURIComponent(adminIdentity)}`;
    details = [['申请编号', application.id], ['申请联系账号', application.contactIdentity], ['管理员账号', adminIdentity]];
  } else if (id === 'enterprise-login') {
    phone = adminIdentity; params = '?type=enterprise';
    state.accounts.push({ id: 'collection-email', name: '陈宁', [adminType]: adminIdentity, status: '正常', credential: await encodeAuthPassword('Account2026!') });
    state.memberships.push({ userId: 'collection-email', enterpriseId: 'collection-qinghe', enterprise: '青禾科技有限公司', role: '企业管理员', status: '已加入' });
    details = [['登录账号', adminIdentity], ['登录密码', 'Account2026!']];
  } else if (['password', 'spaces'].includes(id)) {
    phone = phoneIdentity;
    const credential = await encodeAuthPassword('Account2026!');
    state.accounts.push({ id: 'collection-person', phone, name: '林晓', status: '正常', credential });
    details = [['手机号码', phone], ['登录密码', 'Account2026!']];
    if (id === 'spaces') {
      params = '?type=enterprise';
      state.memberships = ['青禾科技有限公司', '清源政务服务中心'].map((enterprise, index) => ({ userId: 'collection-person', enterpriseId: `collection-space-${index}`, enterprise, role: index ? '普通成员' : '企业管理员', status: '已加入' }));
    }
  } else if (id === 'invite') {
    params = `?token=${AUTH_INVITE.id}`;
    phone = AUTH_INVITE.phone;
    details = [['受邀手机号', phone]];
  } else if (id === 'expired') params = '?token=expired-activation';
  else if (id === 'personal') { phone = phoneIdentity; details = [['手机号码', phone]]; }
  else details = [['单位全称', '青禾科技有限公司'], ['登记标识', 'REG20261006'], ['管理员与联系账号', adminIdentity], ['管理员账号', adminIdentity]];
  return { scene, state, params, phone, details };
}
