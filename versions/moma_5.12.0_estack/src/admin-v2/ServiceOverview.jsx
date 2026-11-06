import { useState } from 'react';
import { Button } from '../components/ui/button';
import { Choice, Field } from './ModelMetadataForm';
import { GridTable, Row, Cell, Status, Modal, Notice, CopyId } from './ModelOperationsUI';
import { libraryRecord } from './model-library';
import { activeModelSalePrice, activeProviderPrice } from './service-workspace';
import { modelSupplies } from './model-management';
import { routingServices } from './service-routing';
import { SERVICE_PURPOSES, servicePurpose } from './service-purpose';

export default function ServiceOverview({ state, model, ops }) {
  const master = libraryRecord(state, model.id);
  const services = routingServices(state).filter(row => row.modelId === model.id);
  const [editing, setEditing] = useState(null), [purpose, setPurpose] = useState('');
  const close = () => ops.proceed(() => { setEditing(null); ops.dirty(false); ops.setError(''); });
  return <div className="sm-model-form sm-overview">
    <dl className="sm-overview-facts">
      <div><dt>技术状态</dt><dd><Status good={model.callsEnabled === true}>{model.callsEnabled ? '已启用' : '已停用'}</Status></dd></div>
      <div><dt>销售状态</dt><dd>{model.listingStatus === '已上架' ? '已上架' : '未销售'}</dd></div>
      <div><dt>模型资料</dt><dd><Button variant="link" onClick={() => ops.go({ view:'template', template:master?.id || model.id, materialMode:'view', returnTo:location.hash, returnModel:model.id }, { base:'model-templates' })}>{master?.name || model.name}</Button></dd></div>
      <div><dt>开放范围</dt><dd>{model.openScope === 'all' ? '全部有效客户' : (model.tenantIds || []).map(id => state.tenants.find(row => row.id === id)?.name || id).join('、') || '待配置'}</dd></div>
    </dl>
    <GridTable className="sm-overview-services" headings={['服务提供方','对外调用标识','用途','成本','售价','操作']} empty={!services.length} emptyMessage="请先在渠道与路由中选择服务模式。">
      {services.map(service => <Row key={service.id}>
        <Cell><strong>{service.name}</strong></Cell><Cell><CopyId value={service.callId} label="对外调用标识"/></Cell>
        <Cell>{SERVICE_PURPOSES[servicePurpose(model,service.providerId)]}</Cell><Cell><Button variant="link" onClick={()=>ops.go({model:model.id,returnTo:location.hash},{base:'model-costs',reset:true})}>{modelSupplies(state,model.id).filter(row=>!service.providerId || row.provider?.id===service.providerId).length} 个来源</Button></Cell><Cell><Button variant="link" onClick={()=>ops.go({service:service.id,returnTo:location.hash},{base:'model-prices',reset:true})}>{(service.providerId?activeProviderPrice(state,model.id,service.providerId):activeModelSalePrice(state,model.id))?'查看售价':'未配置'}</Button></Cell>
        <Cell><Button variant="link" disabled={!ops.can || Boolean(model.archivedAt)} onClick={() => { setEditing({ service, updatedAt:model.updatedAt }); setPurpose(servicePurpose(model,service.providerId)); }}>修改用途</Button></Cell>
      </Row>)}
    </GridTable>
    {editing && <Modal title="修改服务用途" description={editing.service.name} onClose={close}>
      <Field label="服务用途"><Choice label="服务用途" value={purpose} options={Object.entries(SERVICE_PURPOSES)} disabled={!ops.can} onChange={value => { setPurpose(value); ops.dirty(true); }}/></Field>
      <p>变更前须停用技术服务并停止销售；已有价格、配置及历史保留。</p>
      {ops.error && <Notice error>{ops.error}</Notice>}
      <div className="mo-footer"><Button variant="outline" onClick={close}>取消</Button><Button disabled={!ops.can || Boolean(ops.conflict)} onClick={async () => { if (await ops.run('servicePurpose',{ purpose, providerId:editing.service.providerId, expectedUpdatedAt:editing.updatedAt, confirmed:true },model.id)) close(); }}>确认变更</Button></div>
    </Modal>}
  </div>;
}
