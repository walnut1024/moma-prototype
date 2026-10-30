import { useEffect, useRef, useState } from 'react';
import { Button } from '../components/ui/button';
import SupplierCreationDialog from './SupplierCreationDialog';
import { GridTable, Row, Cell, Notice } from './ModelOperationsUI';
import { supplierChannelAssociations } from './supplier-resources';
import { channelCheckCurrent, channelInterfaceIssue } from './provider-channels';
import { SupplierKeyGroupField } from './SupplierKeyGroupField';
import { supplyModelRecord } from './supply-models';
import { connectionCredentialsReady, connectionTestPassed } from './connection-state';

export default function SupplierChannelBatchTest({ state, provider, endpointId, associationIds, ops, close }) {
  const [selected, setSelected] = useState([]), [confirming, setConfirming] = useState(false);
  const endpoint = state.endpoints.find(row => row.id === endpointId);
  const rows = supplierChannelAssociations(state, provider, endpointId).filter(row => associationIds.includes(row.id));
  const passed = row => connectionTestPassed(endpoint) && channelCheckCurrent(row) && row.health?.result === '通过' && !channelInterfaceIssue(provider, row);
  const ready = connectionCredentialsReady(endpoint, provider);
  const eligibleSelected = rows.filter(row => selected.includes(row.id) && passed(row)).map(row => row.id);
  const run = (operation, ids) => ops.run('provider', { operation, objectId: provider.id, values: { endpointId, associationIds: ids } });
  const started = useRef(false);
  useEffect(() => {
    if (started.current || !ready || !ops.can || !rows.length) return;
    started.current = true;
    run('supplierModelsTest', associationIds);
  }, [ready, ops.can]); // Run once after saving; StrictMode must not create a second batch.
  return <SupplierCreationDialog title="测试与启用" description="配置已保存，测试后明确选择要启用的模型。" cancel={close} cancelLabel="关闭" disabled={!ops.can || !eligibleSelected.length || provider.status !== '已启用'} action={confirming ? '确认启用所选' : '启用所选'} submit={() => { if (!confirming) setConfirming(true); else if (run('supplierModelsEnable', eligibleSelected)) { setSelected([]); setConfirming(false); } }} footer={<Button type="button" variant="outline" disabled={!ops.can || !ready || rows.every(passed)} onClick={() => { setConfirming(false); run('supplierModelsTest', rows.filter(row => !passed(row)).map(row => row.id)); }}>重试未通过项</Button>}>
    <ol className="supplier-onboarding-steps" aria-label="接入步骤">{['配置连接', '选择模型', '测试与启用'].map((label, index) => <li key={label} aria-current={index === 2 ? 'step' : undefined}><span>{index + 1}</span>{label}</li>)}</ol>
    <div className="supplier-onboarding-context"><strong>{provider.name}</strong><span>{endpoint?.name}</span><span role="status">通过 {rows.filter(passed).length} / {rows.length}</span></div>
    {['group', 'inherit'].includes(endpoint?.authMode) && <SupplierKeyGroupField fixed ops={ops} state={state} provider={provider} value={endpoint.authMode === 'group' ? endpoint.keyGroupId : 'default'} disabled={!ops.can} onChange={() => {}}/>}
    {!ready && <Notice error>渠道缺少可用 API 密钥，请添加密钥后重新测试。</Notice>}
    <GridTable headings={['选择', '上游模型 ID', '验证结果', '启用状态', '采购价', '操作']}>
      {rows.map(row => <Row key={row.id}><Cell><input type="checkbox" aria-label={`选择启用 ${row.upstreamModelId}`} checked={eligibleSelected.includes(row.id)} disabled={!ops.can || !passed(row)} onChange={event => { setSelected(current => event.target.checked ? [...current, row.id] : current.filter(id => id !== row.id)); setConfirming(false); }}/></Cell><Cell><code>{row.upstreamModelId}</code></Cell><Cell>{channelInterfaceIssue(provider, row) || (passed(row) ? '通过' : row.health?.message || '待测试')}</Cell><Cell>{row.enabled && endpoint.status === '运行中' ? '已启用' : '未启用'}</Cell><Cell>{row.pricing?.scenarios?.length ? '已配置' : '待配置'}</Cell><Cell><Button type="button" variant="link" disabled={!ops.can || !ready} onClick={() => { setConfirming(false); run('supplierModelsTest', [row.id]); }}>重新测试</Button></Cell></Row>)}
    </GridTable>
    {confirming && <Notice>将启用渠道及所选 {eligibleSelected.length} 个模型。采购价待配置的模型暂不能用于正式服务。{endpoint.status === '停用' && '此前未选中的模型将保持停用。'}</Notice>}
    {provider.status !== '已启用' && <Notice error>供应商已停用，请先启用供应商。</Notice>}
    {ops.error && <Notice error>{ops.error}</Notice>}
    <Button type="button" variant="link" onClick={() => { const master = rows[0] && supplyModelRecord(state, provider, rows[0].modelId); const model = master && state.models.find(item => item.id === master.id || item.templateId === master.id); close(); ops.go({ model: model?.id || null, q: model ? null : master?.modelId || null, view: null, type: null, mode: null, status: null }, { base: 'listing' }); }}>前往服务管理</Button>
  </SupplierCreationDialog>;
}
