import { useState } from 'react';
import { Button, Checkbox, Steps, Typography } from '@douyinfe/semi-ui';
import { Choice, Field, Modal, Notice } from './ServiceUI';
import { SERVICE_MODES } from './model-operations';
import { modelCode } from './model-management';

export default function ServiceModeDialog({state,model,ops,close}) {
  const reset=Boolean(model.serviceMode),[step,setStep]=useState(0),[downlist,setDownlist]=useState(false),[clear,setClear]=useState(false),[serviceMode,setServiceMode]=useState(''),[revision]=useState(model.updatedAt),[busy,setBusy]=useState(false);
  const changed=revision!==model.updatedAt,blocked=!ops.can || Boolean(ops.conflict) || changed || busy;
  const mappings=state.modelSupplies.filter(row=>row.modelId===model.id && row.status!=='已移除');
  const routes=(state.serviceRoutes || []).filter(row=>row.serviceId===`standard:${model.id}` || row.serviceId.startsWith(`provider:${model.id}:`));
  const save=async()=>{if(blocked || !SERVICE_MODES[serviceMode] || reset && (!downlist || !clear))return;setBusy(true);try{if(await ops.run('serviceMode',{serviceMode,expectedUpdatedAt:revision,confirmedReset:reset || model.listingStatus==='已上架'},model.id))close();}finally{setBusy(false);}};
  return <Modal wide title={reset?'切换服务模式':'选择服务模式'} description={model.name+' · '+modelCode(model)} onClose={()=>!busy && close()}>
    {reset && <Steps type="basic" current={step}><Steps.Step title="下架该模型"/><Steps.Step title="清除映射及路由"/><Steps.Step title="设置服务模式"/></Steps>}
    {reset && <Typography.Paragraph type="tertiary">逐项确认，最后统一提交；此前当前配置继续生效，取消不会下架或清空配置。</Typography.Paragraph>}
    {reset && step===0 && <><Notice>切换模式需下架模型并停止新的调用；已开始的请求按原配置完成。</Notice><Checkbox checked={downlist} disabled={blocked} onChange={event=>{setDownlist(event.target.checked);ops.dirty(true);}}>确认下架该模型</Checkbox></>}
    {reset && step===1 && <><Notice error>将清除 {mappings.length} 条模型映射的有效关联及 {routes.filter(row=>row.activeVersion || row.draft).length} 套路由的生效配置/草稿，并解除当前服务商关联。新模式需要重新配置服务商、渠道和售价。</Notice><Typography.Paragraph>模型资料、渠道接入资源、价格与调用历史保留；原模式售价不自动沿用于新模式。</Typography.Paragraph><Checkbox checked={clear} disabled={blocked} onChange={event=>{setClear(event.target.checked);ops.dirty(true);}}>确认清除模型映射及路由</Checkbox></>}
    {(!reset || step===2) && <><Typography.Paragraph>当前模式：{SERVICE_MODES[model.serviceMode]?.label || '未设置'}</Typography.Paragraph><Field label={reset?'新服务模式 *':'服务模式 *'}><Choice label="服务模式" value={serviceMode || undefined} placeholder="请选择服务模式" disabled={blocked} options={Object.entries(SERVICE_MODES).filter(([id])=>id!==model.serviceMode).map(([id,item])=>[id,item.label])} onChange={value=>{setServiceMode(value);ops.dirty(true);ops.setError('');}}/></Field>{Object.values(SERVICE_MODES).map(item=><Typography.Paragraph key={item.label}><Typography.Text strong>{item.label}：</Typography.Text>{item.description}</Typography.Paragraph>)}</>}
    {changed && <Notice error>服务配置已变化，请关闭后载入最新配置重新确认。</Notice>}{ops.error && <Notice error>{ops.error}</Notice>}
    <div className="ss-footer"><Button disabled={busy} onClick={close}>取消</Button>{reset && step>0 && <Button disabled={busy} onClick={()=>setStep(step-1)}>上一步</Button>}{reset && step<2?<Button disabled={blocked || (step===0?!downlist:!clear)} onClick={()=>setStep(step+1)}>{step===0?'确认下架并继续':'确认清除并继续'}</Button>:<Button theme="solid" loading={busy} disabled={blocked || !serviceMode} onClick={save}>{reset?'确认下架、清理并切换模式':'确认选择服务模式'}</Button>}</div>
  </Modal>;
}
