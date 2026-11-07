import { Button, Descriptions, Table, Typography } from '@douyinfe/semi-ui';
import { CopyId } from './ServiceUI';
import { libraryRecord } from './model-library';
import { activeModelSalePrice, activeProviderPrice } from './service-workspace';
import { modelSupplies } from './model-management';
import { routingServices } from './service-routing';

export default function ServiceOverview({ state, model, ops }) {
  const master = libraryRecord(state, model.id);
  const services = routingServices(state).filter(row => row.modelId === model.id);
  const columns = [
    { title:'服务商', dataIndex:'name', width:160, render:name => <Typography.Text strong>{name}</Typography.Text> },
    { title:'对外调用标识', dataIndex:'callId', width:220, render:value => <CopyId value={value} label="对外调用标识"/> },
    { title:'成本', width:100, render:(_,service) => <Button theme="borderless" onClick={() => ops.go({model:model.id,returnTo:location.hash},{base:'model-costs',reset:true})}>{modelSupplies(state,model.id).filter(row => !service.providerId || row.provider?.id === service.providerId).length} 个来源</Button> },
    { title:'售价', width:100, render:(_,service) => <Button theme="borderless" onClick={() => ops.go({service:service.id,returnTo:location.hash},{base:'model-prices',reset:true})}>{(service.providerId ? activeProviderPrice(state,model.id,service.providerId) : activeModelSalePrice(state,model.id)) ? '查看售价' : '未配置'}</Button> },
  ];
  return <div className="ss-body">
    <Descriptions data={[
      {key:'模型资料',value:<Button theme="borderless" onClick={() => ops.go({view:'template',template:master?.id || model.id,materialMode:'view',returnTo:location.hash,returnModel:model.id},{base:'model-templates'})}>{master?.name || model.name}</Button>},
      {key:'开放范围',value:model.openScope === 'all' ? '全部有效客户' : (model.tenantIds || []).map(id => state.tenants.find(row => row.id === id)?.name || id).join('、') || '待配置'},
    ]}/>
    <Table rowKey="id" columns={columns} dataSource={services} scroll={{x:580}} pagination={false} empty="请先在渠道与路由中选择服务模式。"/>
  </div>;
}
