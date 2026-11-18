export const AUDIT_ACTIONS = {
  'service_route.publish': '发布路由',
  'supplier_key_group.rotate': '轮换共享密钥',
  'supplier_key.replace': '替换 API 密钥',
  'model_supply.disable': '批量停用渠道',
};

export const AUDIT_RESULTS = { succeeded: '成功', failed: '失败', unknown: '未记录' };

export const AUDIT_RESOURCES = {
  service_route: '服务路由',
  model_service: '模型服务',
  service_mapping: '服务映射',
  supplier_key_group: '供应密钥组',
  supplier_key: '供应密钥',
  supplier_connection: '连接配置',
  supplier: '服务商',
  model_material: '模型资料',
  model_supply: '模型渠道供给',
};
