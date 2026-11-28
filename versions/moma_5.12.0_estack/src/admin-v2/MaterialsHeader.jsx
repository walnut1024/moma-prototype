import { useChannelText } from './channel-language';
import { Button, Card, Space, Tabs, Toast } from './xa24/HaloUI.jsx';
import { AdminModal as Modal } from './AdminOverlay';
import ModelModuleHeading from './ModelModuleHeading';
import { CLASSIFICATION_KINDS, classificationQuery } from './model-classification';
import { TARIFF_KINDS } from './tariff-dictionary';
import './semi-materials.css';

const materialPages = [['model-templates', '模型'], ['provider-materials', '服务商'], ...Object.entries(CLASSIFICATION_KINDS), ...Object.entries(TARIFF_KINDS)];
export const materialOperationsUi = {
  notify: message => Toast.success(message),
  renderLeaveDialog: ({ cancel, discard }) => <Modal visible className="semi-materials" title="有未保存的配置" onCancel={cancel} footer={<Space><Button onClick={cancel}>继续编辑</Button><Button type="danger" onClick={discard}>放弃本次修改</Button></Space>}>放弃修改后继续离开，当前生效配置保留。</Modal>,
};

export default function MaterialsHeader({ active, ops, actions, children }) {
  const t = useChannelText();
  return <>
    <ModelModuleHeading module="materials" className="xa24-entry-header">{actions && <Space wrap>{actions}</Space>}</ModelModuleHeading>
    <Card padding={16} className="materials-content-card xa24-page-card">
      <Tabs type="line" activeKey={active} onChange={id => {
        if (id === 'provider-materials') return ops.go({}, { base: id, reset: true });
        const dictionary = Object.hasOwn(TARIFF_KINDS, id);
        const query = dictionary ? { tab: id } : Object.hasOwn(CLASSIFICATION_KINDS, id) ? classificationQuery(id) : {};
        ops.go(query, { base: dictionary ? 'tariff-dictionary' : 'model-templates', reset: !dictionary || !Object.hasOwn(TARIFF_KINDS, active) });
      }} aria-label={t('资料分类')}>
        {materialPages.map(([id, label]) => <Tabs.TabPane key={id} itemKey={id} tab={t(label)}/>)}
      </Tabs>
      {children}
    </Card>
  </>;
}
