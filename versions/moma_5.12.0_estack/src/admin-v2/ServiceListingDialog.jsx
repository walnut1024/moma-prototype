import Table from './AdminTable';
import { useState } from 'react';
import { Button, Checkbox, Typography } from '@douyinfe/semi-ui';
import { Modal, Notice } from './ServiceUI';
import { salesChecks } from './service-sales';
import { scopeTenants } from './service-commercial';
import { serviceConfigurationTarget } from './service-workspace';

export default function ServiceListingDialog({state,model,ops,stage,close}) {
  const [tenantIds,setTenantIds]=useState(model.releaseTenantIds || []),[revision]=useState(model.updatedAt),[busy,setBusy]=useState(false);
  const gray=stage==='gray',tenants=scopeTenants(state).filter(row=>model.openScope==='all' || model.tenantIds?.includes(row.id)),checks=salesChecks(state,model),changed=revision!==model.updatedAt;
  const invalid=gray && (!tenantIds.length || tenantIds.some(id=>!tenants.some(row=>row.id===id)));
  return <Modal wide title={gray?'灰度上架':'正式上架'} description={model.name} onClose={()=>!busy && close()}>
    {gray?<><Typography.Title heading={6}>灰度客户</Typography.Title><Table pagination={false} rowKey="id" dataSource={tenants} columns={[{title:'选择',width:80,render:(_,tenant)=><Checkbox aria-label={`灰度客户 ${tenant.name}`} checked={tenantIds.includes(tenant.id)} disabled={!ops.can || busy} onChange={event=>{setTenantIds(ids=>event.target.checked?[...ids,tenant.id]:ids.filter(id=>id!==tenant.id));ops.dirty(true);}}/>},{title:'客户名称',dataIndex:'name'},{title:'客户 ID',dataIndex:'id'}]} empty="当前调用授权中没有有效客户，请先维护调用授权。"/><Typography.Paragraph>仅向所选客户开放，并与当前调用授权取交集。</Typography.Paragraph></>:<Typography.Paragraph>向当前调用授权范围内的有效客户开放，结束灰度范围限制。</Typography.Paragraph>}
    <ul className="ss-checks">{checks.map((check,index)=><li key={index}><span>{check.passed?'✓':'待完成'} {check.label}</span>{!check.passed && <Button theme="borderless" disabled={busy} onClick={()=>ops.proceed(()=>{const {page,...target}=serviceConfigurationTarget(model,check);close();ops.go({...target,returnTo:location.hash},{base:page,reset:true});})}>前往配置</Button>}</li>)}</ul>
    {changed && <Notice error>服务配置已变化，请关闭后重新核对。</Notice>}{ops.error && <Notice error>{ops.error}</Notice>}
    <div className="ss-footer"><Button disabled={busy} onClick={close}>取消</Button><Button loading={busy} disabled={!ops.can || Boolean(ops.conflict) || busy || changed || invalid || checks.some(row=>!row.passed)} onClick={async()=>{setBusy(true);try{if(await ops.run('startSales',{releaseStage:stage,releaseTenantIds:gray?tenantIds:[],confirmed:true,expectedUpdatedAt:revision},model.id))close();}finally{setBusy(false);}}}>{gray?'确认灰度上架':'确认正式上架'}</Button></div>
  </Modal>;
}
