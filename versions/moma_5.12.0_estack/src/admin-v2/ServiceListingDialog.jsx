import { useChannelText } from './channel-language';
import Table from './AdminTable';
import { useState } from 'react';
import { Button, Checkbox, Typography } from './xa24/HaloUI.jsx';
import { Modal, Notice } from './ServiceUI';
import { offerSalesScope, salesChecks } from './service-sales';
import { scopeTenants } from './service-commercial';
import { serviceConfigurationTarget } from './service-workspace';

export default function ServiceListingDialog({state,model,ops,stage,close,initialOfferKey,targetService}) {
  const translateLabel = useChannelText();
  const [tenantIds,setTenantIds]=useState(() => offerSalesScope(model, initialOfferKey || '').tenantIds),[revision]=useState(model.updatedAt),[busy,setBusy]=useState(false);
  const gray=stage==='gray';
  const label=gray?'灰度开售':'开售';
  const tenants=scopeTenants(state);
  const changed=revision!==model.updatedAt;
  const offerKeys=initialOfferKey ? [initialOfferKey] : undefined;
  const checks=salesChecks(state,model,offerKeys);
  if (gray) checks.push({
    label:'销售对象有效',
    passed:tenantIds.length > 0 && tenantIds.every(id=>tenants.some(row=>row.id===id)),
  });
  async function submit() {
    setBusy(true);
    try {
      const data={releaseStage:stage,releaseTenantIds:gray?tenantIds:[],confirmed:true,expectedUpdatedAt:revision,...(offerKeys&&{offerKeys})};
      if(await ops.run('startSales',data,model.id)) close();
    } finally { setBusy(false); }
  }
  return <Modal wide title={label} description={`${targetService.name}（${targetService.callId}）`} onClose={()=>!busy && close()} footer={<>
    <Button disabled={busy} onClick={close}>{translateLabel("取消")}</Button>
    <Button loading={busy} disabled={!ops.can || Boolean(ops.conflict) || busy || changed || checks.some(row=>!row.passed && !row.warning)} onClick={submit}>{gray ? "确认灰度开售" : "确认开售"}</Button>
  </>}>
    {gray ? <>
      <Typography.Title heading={6}>{translateLabel("销售对象")}</Typography.Title>
      <Table pagination={false} rowKey="id" dataSource={tenants} columns={[{title:'选择',width:80,render:(_,tenant)=><Checkbox aria-label={`销售对象 ${tenant.name}`} checked={tenantIds.includes(tenant.id)} disabled={!ops.can || busy} onChange={event=>{setTenantIds(ids=>event.target.checked?[...ids,tenant.id]:ids.filter(id=>id!==tenant.id));ops.dirty(true);}}/>},{title:'租户名称',dataIndex:'name'},{title:'租户 ID',dataIndex:'id'}]} empty="暂无有效租户。"/>
    </> : <p>{translateLabel('销售范围：全部租户')}</p>}
    <ul className="ss-checks">{checks.map((check,index)=>{
      const destination = check.connectionId ? {page:'providers-reference',connection:check.connectionId,tab:'model-costs',modelCost:check.upstreamId} : serviceConfigurationTarget(model,check);
      return <li key={index}><span>{check.passed?'✓':check.warning?translateLabel('提醒'):translateLabel('待完成')} {check.label}</span>{!check.passed && destination && <Button theme="borderless" disabled={busy} onClick={()=>ops.proceed(()=>{
        const {page,...target}=destination;ops.go({...target,returnTo:location.hash},{base:page,reset:true});
      })}>前往配置</Button>}</li>;
    })}</ul>
    {changed && <Notice error>服务配置已变化，请关闭后重新核对。</Notice>}{ops.error && <Notice error>{ops.error}</Notice>}
  </Modal>;
}
