// Synthetic organization/member records for density, filtering and pagination demos.
// Existing identities, projects and department assignments are never replaced.
export function enterpriseOrganizationSeed() {
  const tenantId = 'tenant-gov', rootId = 'org-tenant-gov';
  const createdAt = '2026-10-04T10:00:00+08:00';
  const record = (id, fields) => ({ id, createdAt, updatedAt: createdAt, demo: true, ...fields });
  const departments = [
    ['general', '综合管理部', null],
    ['applications', '政务应用中心', null],
    ['services', '政务服务部', 'applications'],
    ['data', '数据治理部', 'applications'],
    ['standards', '数据标准组', 'data'],
    ['sharing', '数据共享组', 'data'],
    ['technology', '平台技术中心', null],
    ['models', '模型研发部', 'technology'],
    ['operations', '平台运维部', 'technology'],
    ['security', '信息安全部', null],
    ['research', '政务研究室', null],
  ];
  const organizationId = code => `org-demo-gov-${code}`;
  const organizations = departments.map(([code, name, parent]) => record(organizationId(code), { tenantId, parentId: parent ? organizationId(parent) : rootId, name, status: '正常' }));
  const names = ['刘宁', '周悦', '王晓', '陈宇', '李欣', '赵磊', '孙婷', '吴昊', '郑洁', '冯晨', '徐敏', '许航', '沈静', '韩睿', '杨帆', '朱琳', '秦川', '何佳', '吕峰', '施文', '张蕾', '蒋毅', '曹颖', '严凯', '华蓉', '金鹏', '魏然', '陶慧', '姜博', '谢芸', '邹辰', '苏瑾', '潘岳', '葛思', '范青', '彭越'];
  const assigned = ['general', 'services', 'standards', 'sharing', 'models', 'operations', 'security'];
  const users = names.map((name, index) => record(`user-demo-gov-${String(index + 1).padStart(2, '0')}`, { name, login: `demo.gov.${String(index + 1).padStart(3, '0')}`, phone: `+120255501${String(index).padStart(2, '0')}`, email: `gov.${index + 1}@example.com`, status: '正常', initialized: true }));
  const memberships = users.map((user, index) => record(`member-demo-gov-${String(index + 1).padStart(2, '0')}`, {
    userId: user.id, name: user.name, tenantId,
    organizationId: index >= 33 ? undefined : index < 2 ? rootId : organizationId(assigned[(index - 2) % assigned.length]),
    projectIds: index % 3 === 0 ? ['project-1-1', 'project-1-2'] : [index % 2 ? 'project-1-1' : 'project-1-2'],
    role: index % 9 === 0 ? '部门管理员' : index % 3 === 0 ? '开发者' : '普通成员',
    status: index % 8 === 7 ? '停用' : '正常',
  }));
  return { organizations, users, memberships };
}
