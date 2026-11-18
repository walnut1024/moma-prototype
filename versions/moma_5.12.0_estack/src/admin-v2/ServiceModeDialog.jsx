import { useState } from 'react';
import { Button, Input, Typography } from '@douyinfe/semi-ui';
import { Choice, Field, FieldLabel, Modal, Notice } from './ServiceUI';
import { SERVICE_MODES } from './model-operations';
import { serviceDisplayName } from './service-workspace';

export default function ServiceModeDialog({model,ops,close}) {
  const [serviceMode,setServiceMode]=useState(''),[revision]=useState(model.updatedAt),[busy,setBusy]=useState(false);
  const [callId,setCallId]=useState(model.modelId || '');
  const downlist=model.listingStatus==='已上架';
  const changed=revision!==model.updatedAt,blocked=!ops.can || Boolean(ops.conflict) || changed || busy;
  const ready=Object.hasOwn(SERVICE_MODES,serviceMode) && (serviceMode!=='standard' || Boolean(callId.trim()));
  const save=async()=>{
    if(blocked || !ready)return;
    setBusy(true);
    try{
      const next=await ops.run('serviceMode',{
        serviceMode,expectedUpdatedAt:revision,confirmDownlist:downlist,
        ...(serviceMode==='standard' && {callId:callId.trim()}),
      },model.id);
      if(next)close();
    }finally{setBusy(false);}
  };
  return <Modal wide title="选择服务模式" description={serviceDisplayName(model)} onClose={()=>!busy && close()} footer={<>
    <Button disabled={busy} onClick={close}>取消</Button>
    <Button theme="solid" loading={busy} disabled={blocked || !ready} onClick={save}>{downlist?'确认下架并设置模式':'确认选择服务模式'}</Button>
  </>}>
    {downlist && <Notice>首次设置服务模式前需下架模型。下架后停止新的调用。</Notice>}
    <Field label="服务模式" required>
      <Choice label="服务模式" value={serviceMode || undefined} placeholder="请选择服务模式" disabled={blocked}
        options={Object.entries(SERVICE_MODES).map(([id,item])=>[id,item.label])}
        onChange={value=>{setServiceMode(value);ops.dirty(true);ops.setError('');}}/>
    </Field>
    {serviceMode==='standard' && <Field required label={<FieldLabel name="模型调用标识"/>}>
      <Input value={callId} maxLength={200} disabled={blocked} onChange={value=>{setCallId(value);ops.dirty(true);ops.setError('');}}/>
    </Field>}
    {Object.values(SERVICE_MODES).map(item=><Typography.Paragraph key={item.label}><Typography.Text strong>{item.label}：</Typography.Text>{item.description}</Typography.Paragraph>)}
    {changed && <Notice error>服务配置已变化，请关闭后载入最新配置重新确认。</Notice>}{ops.error && <Notice error>{ops.error}</Notice>}
  </Modal>;
}
