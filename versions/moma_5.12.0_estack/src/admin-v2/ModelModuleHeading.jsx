import AdminPageHeading from './AdminPageHeading';

const modules = {
  service: ['模型服务', '配置服务模式、模型调用标识和渠道路由，管理服务验证、启停与归档。'],
  market: ['模型广场', '维护模型卡片、关联服务和展示范围。'],
  prices: ['模型售价', '维护面向客户的计费项与售价，查看售价版本。'],
  materials: ['模型资料', '维护模型资料、作者和系列，以及共用计量字典。'],
};

export default function ModelModuleHeading({ module, title, description, className = 'ss-heading', children }) {
  const [name, defaultDescription] = modules[module];
  return <AdminPageHeading className={className} title={title ?? name} description={description === undefined ? defaultDescription : description}>{children}</AdminPageHeading>;
}
