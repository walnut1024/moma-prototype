import AdminPageHeading from './AdminPageHeading';

const modules = {
  service: ['模型服务', '配置模型 ID、关联上游模型和故障转移策略，管理服务启停。'],
  market: ['模型广场', '维护模型卡片、关联服务和展示范围。'],
  prices: ['模型销售', '维护模型刊例价、销售对象和售卖状态。'],
  materials: ['基础资料', '维护模型资料、服务商供应模型、作者和系列，以及共用计量字典。'],
};

export default function ModelModuleHeading({ module, title, description, className = 'ss-heading', children }) {
  const [name, defaultDescription] = modules[module];
  return <AdminPageHeading className={className} title={title ?? name} description={description === undefined ? defaultDescription : description}>{children}</AdminPageHeading>;
}
