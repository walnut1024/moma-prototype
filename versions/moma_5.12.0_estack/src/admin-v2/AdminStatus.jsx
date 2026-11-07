import { Tag } from '@douyinfe/semi-ui';

const statusColors = new Map([
  ['green', ['正常', '有效', '可用', '可运行', '运行中', '已启用', '已配置', '当前生效', '生效中',
    '通过', '已通过', '成功', '达标', '已恢复', '已解决', '已完成', '已确认', '已执行',
    '已开通', '已出账', '已计量', '已上架', '正式上架', '在售']],
  ['orange', ['需关注', '待开通', '待生效', '待出账', '待审批', '待确认', '待结算', '有差异', '处理中', '高',
    '部署中', '扩缩容中', '更新中', '配置中', '待配置', '待验证', '连接待验证', '凭证待配置',
    '待检测', '未检测', '检测中', '待补充检测', '待复测', '结果过期', '部分异常', '需调整',
    '待上架', '灰度上架', '灰度用户可见', '灰度在售']],
  ['red', ['失败', '测试失败', '未通过', '异常', '接口不匹配', '已拒绝', '未达标',
    '已失效', '服务不可用', '不可销售']],
  ['blue', ['允许展示', '用户可见']],
].flatMap(([color, labels]) => labels.map(label => [label, color])));

export default function AdminStatus({ value, prefix, color = statusColors.get(value) ?? 'grey' }) {
  if (value == null || value === '' || value === '—') return '—';
  return <Tag size="small" color={color}>{prefix ? `${prefix}：${value}` : value}</Tag>;
}
