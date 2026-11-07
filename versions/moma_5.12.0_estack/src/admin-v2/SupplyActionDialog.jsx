import { Button } from '@douyinfe/semi-ui';
import { modelSupplies, supplyModelUrl } from './model-management';
import { Modal, Notice } from './ModelOperationsUI';
import { ModelConnectivityTest } from './ProviderApiKeys';

const actions = {
  publishSupply: { title: '上架销售', message: '请确认是否上架销售该模型' },
  unlistSupply: { title: '下架停售', message: '是否下架停售该模型，该操作执行后，用户面订购入口将不可见该模型，请谨慎操作。' },
  stopSupply: { title: '停止服务', message: '是否对该模型对外停止服务，该操作执行后，用户访问将报错，请谨慎操作。' },
  startSupply: { title: '恢复服务', message: '是否恢复当前渠道的模型服务？' },
};

export default function SupplyActionDialog({ state, model, supplyId, kind, ops, close }) {
  const supply = modelSupplies(state, model.id).find(item => item.id === supplyId);
  if (!supply || !supply.provider || !supply.endpoint) return <Modal title="服务商模型已变化" onClose={close}><Notice error>请关闭弹窗并重新核对服务商模型。</Notice></Modal>;
  if (kind === 'testSupply') return <ModelConnectivityTest state={state} provider={supply.provider} endpoint={supply.endpoint} supply={supply} ops={ops} close={close}/>;
  const action = actions[kind];
  return <Modal title={action.title} description={action.message} onClose={close}>
    <dl className="mo-facts mo-supply-confirm"><div><dt>模型</dt><dd>{model.name}</dd></div><div><dt>服务商</dt><dd>{supply.provider.name}</dd></div><div><dt>服务商模型 URL</dt><dd><code>{supplyModelUrl(supply, model) || 'URL 待配置'}</code></dd></div></dl>
    {kind !== 'publishSupply' && <p className="mo-muted">本次操作仅影响当前渠道。{kind === 'startSupply' ? '恢复服务不自动上架售卖，如需开放新增订购，请另行上架销售。' : kind === 'unlistSupply' ? '已有订购仍可调用。' : '该供给不再承接调用。'}</p>}
    {ops.error && <Notice error>{ops.error}</Notice>}
    <div className="mo-footer"><Button theme="light" onClick={close}>取消</Button><Button disabled={!ops.can} onClick={async () => { if (await ops.run(kind, { id: supply.id }, model.id)) close(); }}>确认{action.title}</Button></div>
  </Modal>;
}
