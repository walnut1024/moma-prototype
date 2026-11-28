import { useChannelText } from './channel-language';
import AdminPageHeading from './AdminPageHeading';
import marketplaceArtwork from './xa27-artwork/xaModelCards.png';
import materialsArtwork from './xa27-artwork/xaMaterials.png';

const modules = {
  service: ['模型服务', '管理可调用的模型服务及其上游关联。', 'Manage callable model services and their upstream associations.'],
  market: ['模型广场', '配置模型在模型广场的展示与可见范围。', 'Configure how models are displayed in the marketplace and who can see them.', marketplaceArtwork],
  prices: ['模型销售', '维护模型刊例价、销售对象和售卖状态。'],
  materials: ['基础资料', '维护模型、服务商和供给所需的基础资料。', 'Maintain the reference data for models, providers, and upstream supply.', materialsArtwork],
};

export default function ModelModuleHeading({ module, title, description, className = 'ss-heading', artwork, children }) {
  const t = useChannelText();
  const [name, defaultDescription, englishDescription, defaultArtwork] = modules[module];
  return <AdminPageHeading className={className} title={title ?? t(name)}
    description={description === undefined ? t(defaultDescription, englishDescription) : description}
    artwork={artwork === undefined ? defaultArtwork : artwork}>{children}</AdminPageHeading>;
}
