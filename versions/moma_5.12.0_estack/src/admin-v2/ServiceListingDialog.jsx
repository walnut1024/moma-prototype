import Table from './AdminTable';
import { useState } from 'react';
import { Button, Checkbox, Typography } from '@douyinfe/semi-ui';
import { Modal, Notice } from './ServiceUI';
import { salesChecks } from './service-sales';
import { scopeTenants } from './service-commercial';
import { serviceConfigurationTarget } from './service-workspace';
import { routingServices } from './service-routing';
import { offerKey, salesCustomer } from '../service-access.mjs';

export default function ServiceListingDialog({state,model,ops,stage,close,initialOfferKey}) {
  const services = routingServices(state).filter(row => row.modelId === model.id);
  const selectOffers = services.some(service => offerKey(service));
  const [tenantIds,setTenantIds]=useState(selectOffers ? [] : model.releaseTenantIds || []),[revision]=useState(model.updatedAt),[busy,setBusy]=useState(false);
  const [selected,setSelected]=useState(initialOfferKey ? [initialOfferKey] : []);
  const gray=stage==='gray';
  const label=gray?'灰度开售':'开售';
  const tenants=scopeTenants(state).filter(tenant=>salesCustomer(model,tenant.id));
  const changed=revision!==model.updatedAt;
  const groups=new Map();
  if (selectOffers) {
    for (const service of services) {
      const group=groups.get(service.providerId) || [];
      group.push(service);
      groups.set(service.providerId,group);
    }
  }
  const selectedKeys=selectOffers ? selected.filter(key=>[...groups.values()].some(rows=>rows.some(row=>offerKey(row)===key))) : undefined;
  const checks=salesChecks(state,model,selectedKeys,stage);
  const invalid=(selectOffers && !selectedKeys.length) || (gray && (!tenantIds.length || tenantIds.some(id=>!tenants.some(row=>row.id===id))));
  const select=(keys,checked)=>{
    setSelected(current=>checked?[...new Set([...current,...keys])]:current.filter(key=>!keys.includes(key)));
    ops.dirty(true);
  };
  async function submit() {
    setBusy(true);
    try {
      const data={releaseStage:stage,releaseTenantIds:gray?tenantIds:[],confirmed:true,expectedUpdatedAt:revision,...(selectOffers?{offerKeys:selectedKeys}:{})};
      if(await ops.run('startSales',data,model.id)) close();
    } finally { setBusy(false); }
  }
  return <Modal wide title={label} description={model.name} onClose={()=>!busy && close()} footer={<>
    <Button disabled={busy} onClick={close}>取消</Button>
    <Button loading={busy} disabled={!ops.can || Boolean(ops.conflict) || busy || changed || invalid || checks.some(row=>!row.passed)} onClick={submit}>{gray ? "确认灰度开售" : "确认开售"}</Button>
  </>}>
    {selectOffers && <div>
      <Typography.Title heading={6}>模型服务</Typography.Title>
      {[...groups].map(([id,services])=>{
        const name=state.providers.find(row=>row.id===id)?.name || id;
        const keys=services.map(offerKey), count=keys.filter(key=>selected.includes(key)).length;
        return <div key={id} style={{marginBottom:12}}>
          <Checkbox aria-label={name+'全部模型服务'} disabled={busy || !ops.can} checked={count===keys.length} indeterminate={count>0 && count<keys.length} onChange={event=>select(keys,event.target.checked)}>{name}（{keys.length} 个模型服务）</Checkbox>
          <div style={{paddingInlineStart:24}}>
            {services.map(service=><div key={service.id}><Checkbox disabled={busy || !ops.can} checked={selected.includes(offerKey(service))} onChange={event=>select([offerKey(service)],event.target.checked)}>{service.name} {service.callId}</Checkbox></div>)}
          </div>
        </div>;
      })}
      {!groups.size && <Typography.Paragraph>暂无可操作的模型服务。</Typography.Paragraph>}
    </div>}
    {gray && <>
      <Typography.Title heading={6}>销售对象</Typography.Title>
      <Table pagination={false} rowKey="id" dataSource={tenants} columns={[{title:'选择',width:80,render:(_,tenant)=><Checkbox aria-label={`销售对象 ${tenant.name}`} checked={tenantIds.includes(tenant.id)} disabled={!ops.can || busy} onChange={event=>{setTenantIds(ids=>event.target.checked?[...ids,tenant.id]:ids.filter(id=>id!==tenant.id));ops.dirty(true);}}/>},{title:'租户名称',dataIndex:'name'},{title:'租户 ID',dataIndex:'id'}]} empty="暂无有效租户。"/>
    </>}
    {(!selectOffers || selectedKeys.length>0) && <ul className="ss-checks">{checks.map((check,index)=><li key={index}><span>{check.passed?'✓':'待完成'} {check.label}</span>{!check.passed && serviceConfigurationTarget(model,check) && <Button theme="borderless" disabled={busy} onClick={()=>ops.proceed(()=>{
      const {page,...target}=serviceConfigurationTarget(model,check);ops.go({...target,returnTo:location.hash},{base:page,reset:true});
    })}>前往配置</Button>}</li>)}</ul>}
    {changed && <Notice error>服务配置已变化，请关闭后重新核对。</Notice>}{ops.error && <Notice error>{ops.error}</Notice>}
  </Modal>;
}
