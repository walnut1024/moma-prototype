import Table from './AdminTable';
import { useState } from 'react';
import { Button, Checkbox, Typography } from '@douyinfe/semi-ui';
import { Modal, Notice } from './ServiceUI';
import { PlatformTrialDialog } from './ServicePlatformTrial';
import { salesChecks } from './service-sales';
import { scopeTenants } from './service-commercial';
import { serviceConfigurationTarget } from './service-workspace';
import { routingServices } from './service-routing';
import { offerKey, offerStage, providerOffer, salesCustomer } from '../service-access.mjs';

export default function ServiceListingDialog({state,model,ops,stage,close}) {
  const [tenantIds,setTenantIds]=useState(model.serviceMode==='provider' ? [] : model.releaseTenantIds || []),[revision]=useState(model.updatedAt),[busy,setBusy]=useState(false);
  const [selected,setSelected]=useState([]),[validation,setValidation]=useState(null);
  const gray=stage==='gray',withdraw=stage==='withdrawn',selectOffers=model.serviceMode==='provider';
  const label=withdraw?'下架':gray?'灰度上架':'正式上架';
  const tenants=scopeTenants(state).filter(tenant=>!selectOffers || salesCustomer(model,tenant.id));
  const changed=revision!==model.updatedAt;
  const groups=new Map();
  if (selectOffers) {
    for (const service of routingServices(state).filter(row=>row.modelId===model.id)) {
      const entry=providerOffer(model,offerKey(service)), listed=['gray','formal'].includes(offerStage(model,entry));
      if (withdraw && !listed) continue;
      const group=groups.get(service.providerId) || [];
      group.push(service);
      groups.set(service.providerId,group);
    }
  }
  const selectedKeys=selectOffers ? selected.filter(key=>[...groups.values()].some(rows=>rows.some(row=>offerKey(row)===key))) : undefined;
  const checks=withdraw?[]:salesChecks(state,model,selectedKeys);
  const invalid=(selectOffers && !selectedKeys.length) || (gray && (!tenantIds.length || tenantIds.some(id=>!tenants.some(row=>row.id===id))));
  const select=(keys,checked)=>{
    setSelected(current=>checked?[...new Set([...current,...keys])]:current.filter(key=>!keys.includes(key)));
    ops.dirty(true);
  };
  async function submit() {
    setBusy(true);
    try {
      const data={releaseStage:stage,releaseTenantIds:gray?tenantIds:[],confirmed:true,expectedUpdatedAt:revision,...(selectOffers?{offerKeys:selectedKeys}:{})};
      if(await ops.run(withdraw?'stopSales':'startSales',data,model.id)) close();
    } finally { setBusy(false); }
  }
  if (validation) return <PlatformTrialDialog state={state} model={model} ops={ops} providerId={validation.providerId} close={()=>setValidation(null)} onPublished={close}/>;
  return <Modal wide title={label} description={model.name} onClose={()=>!busy && close()} footer={<>
    <Button disabled={busy} onClick={close}>取消</Button>
    <Button loading={busy} disabled={!ops.can || Boolean(ops.conflict) || busy || changed || invalid || checks.some(row=>!row.passed)} onClick={submit}>确认{label}</Button>
  </>}>
    {selectOffers && <div>
      <Typography.Title heading={6}>渠道服务</Typography.Title>
      {[...groups].map(([id,services])=>{
        const name=state.providers.find(row=>row.id===id)?.name || id;
        const keys=services.map(offerKey), count=keys.filter(key=>selected.includes(key)).length;
        return <div key={id} style={{marginBottom:12}}>
          <Checkbox aria-label={name+'全部渠道'} disabled={busy || !ops.can} checked={count===keys.length} indeterminate={count>0 && count<keys.length} onChange={event=>select(keys,event.target.checked)}>{name}（{keys.length} 条渠道）</Checkbox>
          <div style={{paddingInlineStart:24}}>
            {services.map(service=><div key={service.id}><Checkbox disabled={busy || !ops.can} checked={selected.includes(offerKey(service))} onChange={event=>select([offerKey(service)],event.target.checked)}>{service.name} {service.callId}</Checkbox></div>)}
          </div>
        </div>;
      })}
      {!groups.size && <Typography.Paragraph>暂无可操作的渠道服务。</Typography.Paragraph>}
    </div>}
    {withdraw && <Typography.Paragraph>所选渠道将停止新订购和新调用。</Typography.Paragraph>}
    {gray && <>
      <Typography.Title heading={6}>灰度客户</Typography.Title>
      <Table pagination={false} rowKey="id" dataSource={tenants} columns={[{title:'选择',width:80,render:(_,tenant)=><Checkbox aria-label={`灰度客户 ${tenant.name}`} checked={tenantIds.includes(tenant.id)} disabled={!ops.can || busy} onChange={event=>{setTenantIds(ids=>event.target.checked?[...ids,tenant.id]:ids.filter(id=>id!==tenant.id));ops.dirty(true);}}/>},{title:'客户名称',dataIndex:'name'},{title:'客户 ID',dataIndex:'id'}]} empty="暂无有效客户。"/>
    </>}
    {(!selectOffers || selectedKeys.length>0) && <ul className="ss-checks">{checks.map((check,index)=><li key={index}><span>{check.passed?'✓':'待完成'} {check.label}</span>{!check.passed && <Button theme="borderless" disabled={busy || (check.tab==='platform' && !ops.can)} onClick={()=>ops.proceed(()=>{
      if(check.tab==='platform'){setValidation(check);return;}
      const {page,...target}=serviceConfigurationTarget(model,check);ops.go({...target,returnTo:location.hash},{base:page,reset:true});
    })}>{check.tab==='platform'?'验证当前服务':'前往配置'}</Button>}</li>)}</ul>}
    {changed && <Notice error>服务配置已变化，请关闭后重新核对。</Notice>}{ops.error && <Notice error>{ops.error}</Notice>}
  </Modal>;
}
