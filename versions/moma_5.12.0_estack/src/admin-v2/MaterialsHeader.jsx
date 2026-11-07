import { Button, Modal, Space, Tabs, Toast, Typography } from '@douyinfe/semi-ui';
import { TARIFF_KINDS } from './tariff-dictionary';
import './semi-materials.css';

const materialPages = [['model-templates', '模型'], ...Object.entries(TARIFF_KINDS)];
export const materialOperationsUi = {
  notify: message => Toast.success(message),
  renderLeaveDialog: ({ cancel, discard }) => <Modal visible className="semi-materials" title="有未保存的配置" onCancel={cancel} footer={<Space><Button onClick={cancel}>继续编辑</Button><Button type="danger" onClick={discard}>放弃本次修改</Button></Space>}>放弃修改后继续离开，当前生效配置保留。</Modal>,
};

export default function MaterialsHeader({ active, ops, children }) {
  return <>
    <div className="materials-heading"><Typography.Title heading={4}>模型资料</Typography.Title><Space wrap>{children}</Space></div>
    <Tabs type="line" activeKey={active} onChange={id => ops.go(id === 'model-templates' ? {} : { tab: id }, { base: id === 'model-templates' ? id : 'tariff-dictionary', reset: id === 'model-templates' || active === 'model-templates' })} aria-label="资料分类">
      {materialPages.map(([id, label]) => <Tabs.TabPane key={id} itemKey={id} tab={label}/>)}
    </Tabs>
  </>;
}
