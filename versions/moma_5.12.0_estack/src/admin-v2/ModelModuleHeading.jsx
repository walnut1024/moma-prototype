import AdminPageHeading from './AdminPageHeading';

const modules = {
  service: ['模型服务', '配置调用标识、渠道路由和客户授权，验证服务并管理启停与归档。'],
  market: ['模型广场', '管理模型正式上架、灰度上架和下架，并设置模型在用户侧广场是否展示。'],
  costs: ['模型成本', '按模型、服务商和渠道查看及维护采购价。'],
  prices: ['模型售价', '维护面向客户的计费项、售价及销售范围，查看售价版本。'],
  materials: ['模型资料', '维护模型与服务商资料，以及共用的计费项、计费单位和货币。'],
};

export default function ModelModuleHeading({ module, title, className = 'ss-heading', children }) {
  const [name, description] = modules[module];
  return <AdminPageHeading className={className} title={title ?? name} description={description}>{children}</AdminPageHeading>;
}
