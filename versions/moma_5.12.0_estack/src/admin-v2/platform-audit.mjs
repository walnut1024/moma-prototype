export const PROJECT_AUDIT_ACTIONS = {
  'project.create': '创建项目',
  'project.configure': '保存项目设置',
  'project.models': '维护项目模型权限及限流',
  'project.member.add': '添加项目成员',
  'project.member.change': '调整项目成员角色',
  'project.member.remove': '移除项目成员',
  'project.member.exit': '退出项目',
  'project.enable': '启用项目',
  'project.disable': '停用项目',
  'project.delete': '删除项目',
  'project.route.create': '创建项目路由',
  'project.route.update': '编辑项目路由',
  'project.route.delete': '删除项目路由',
  'project.key.create': '创建 API Key',
  'project.key.update': '编辑 API Key',
  'project.key.rotate': '重置 API Key',
  'project.key.enable': '启用 API Key',
  'project.key.disable': '停用 API Key',
  'project.key.delete': '删除 API Key',
};

export const AUDIT_ACTIONS = {
  'service_route.publish': '发布路由',
  'supplier_key_group.rotate': '轮换共享密钥',
  'supplier_key.replace': '替换上游 API 密钥',
  'model_supply.disable': '批量停用上游模型',
  'service_mapping.discard': '放弃关联上游模型变更',
  'service_mapping.enable': '启用关联上游模型',
  'service_mapping.disable': '停用关联上游模型',
  'service_mapping.remove': '移除关联上游模型',
  'service_mapping.update': '保存关联上游模型',
  'model_service.start': '启动服务',
  'model_service.stop': '停止服务',
  'model_sale.stop_with_service': '因停服自动停售',
  ...PROJECT_AUDIT_ACTIONS,
  'site.personal_space.configure': '变更个人空间开关',
  'announcement.publish': '发布公告',
  'announcement.withdraw': '撤回公告',
};

export const AUDIT_RESULTS = { succeeded: '成功', failed: '失败', unknown: '未记录' };
export const AUDIT_SOURCES = { web: 'Web', unknown: '未记录' };
export const AUDIT_DOMAINS = { model_operations:'模型运营', projects:'项目管理', site:'站点配置' };

export const AUDIT_RESOURCES = {
  service_route: '服务路由',
  model_service: '模型服务',
  model_sale: '模型售卖',
  service_mapping: '关联上游模型',
  supplier_key_group: '供应密钥组',
  supplier_key: '供应密钥',
  supplier_connection: '连接配置',
  supplier: '服务商',
  model_material: '模型资料',
  model_supply: '上游模型',
  project: '项目',
  project_member: '项目成员',
  project_key: '项目 API Key',
  project_route: '项目路由',
  site: '站点',
  announcement: '公告',
};

export const AUDIT_OBJECT_FILTERS = {
  ...AUDIT_RESOURCES,
  model_supply_status: '上游模型状态',
  service_mapping_status: '关联上游模型状态',
};
