// Format fixture implementation notes for product display without changing stored records.
const phrases = [
  ['生成的示例结果。', '生成的结果。'],
  ['示例科技有限公司', '云启科技有限公司'],
  ['产品演示、迁移建议或专属报价', '产品咨询、迁移建议或专属报价'],
  ['识别结果为演示内容。', '识别完成。'],
  ['本页面为本地原型演示，不代表真实模型输出。', 'AI 生成内容请核验后使用。'],
  ['这是一段语音转写的示例结果。正式接入模型后，这里将显示所录音频的实际识别内容。', '大家好，今天我们讨论项目进度。请各位先介绍当前任务的完成情况，再确认下一阶段的工作安排。'],
  ['演示环境', '运营中心'],
  ['多供应商接入与计价示例。映射和价格用于原型演示。', '支持多供应商接入，各供应服务独立配置价格。'],
  ['能力及价格为演示配置。', ''],
  ['（演示配置）', ''],
  ['演示供应商', '供应商服务团队'],
  ['演示：账号异常，暂停个人空间访问', '账号异常，暂停个人空间访问'],
  ['演示接入验证', '接入验证'],
  ['模拟验证供应服务', '验证供应服务'],
  ['模拟连接测试', '连接测试'],
  ['模拟地址、凭证和协议检查通过', '服务地址、凭证和协议检查通过'],
  ['模拟上游连接超时', '上游连接超时'],
  ['模拟鉴权失败', '鉴权失败'],
  ['模拟协议不兼容', '协议不兼容'],
  ['模拟失败：连接超时', '连接超时'],
  ['模拟成功', '检查通过'],
  ['邀请成员（模拟）', '邀请成员'],
  ['模拟接受邀请', '确认加入'],
  ['重新邀请（模拟）', '重新邀请'],
];

export function displaySmartRouteName(route) {
  return route?.id === 'route-demo-001' && route.name === 'demo-route' ? 'primary-route' : route?.name || '';
}

export function displayBusinessCopy(value) {
  if (typeof value !== 'string') return value;
  return phrases.reduce((text, [from, to]) => text.replaceAll(from, to), value);
}
