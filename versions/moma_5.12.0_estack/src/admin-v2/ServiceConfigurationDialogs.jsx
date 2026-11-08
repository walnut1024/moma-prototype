import { PROVIDER_TYPES } from './provider-management';
import { useId, useState } from 'react';
import { Button, Input, TextArea, Typography } from '@douyinfe/semi-ui';
import { Choice, Field, FieldLabel, Modal, Notice } from './ServiceUI';
import { offerStage, providerOffer } from '../service-access.mjs';

export function ServiceIdentityDialog({ model, providerId, ops, close, onSaved = close }) {
  const entry = providerOffer(model,providerId);
  const original = providerId ? entry?.callId || '' : model.modelId;
  const formId = useId();
  const [callId, setCallId] = useState(original), [revision] = useState(model.updatedAt), [confirm, setConfirm] = useState(false);
  const changing = Boolean(original && original !== callId.trim());
  const blocked = Boolean(original) && (['formal','gray'].includes(offerStage(model,entry)) || (providerId ? entry?.callsEnabled !== false : model.callsEnabled === true));
  const submit = async event => {
    event.preventDefault();
    if (changing && !confirm) {
      setConfirm(true);
      return;
    }
    if (await ops.run(providerId ? 'configureServiceIdentity' : 'configureServiceModelIdentity',
      { providerId, callId, expectedUpdatedAt: revision, confirmed: true }, model.id)) onSaved();
  };

  return <Modal title="编辑调用标识" description={model.name} onClose={close} footer={<>
    <Button theme="light" onClick={close}>取消</Button>
    <Button theme="solid" form={formId} htmlType="submit" disabled={!ops.can || !callId.trim() || callId.trim() === original || blocked}>
      {confirm ? '确认修改调用标识' : changing ? '核对变更' : '保存调用标识'}
    </Button>
  </>}>
    <form id={formId} onSubmit={submit}>
      <Field required label={<FieldLabel name="对外调用标识"/>}>
        <Input aria-label="对外调用标识" autoFocus value={callId} required maxLength={200} disabled={!ops.can || blocked}
          onChange={text => { setCallId(text); setConfirm(false); ops.dirty(true); ops.setError(''); }}/>
      </Field>
      {blocked && <Notice>先下架并停用当前服务，再修改对外调用标识。</Notice>}
      {changing && <Notice>原标识：{original}。保存后，客户需将调用参数改为新标识；原标识不再接受新请求。订购、配置和历史记录保留。</Notice>}
      {confirm && <p>请确认客户已完成调用标识迁移，再保存为 <code>{callId}</code>。</p>}
      {ops.error && <Notice error>{ops.error}</Notice>}
    </form>
  </Modal>;
}

export function ServiceSupplierDialog({ops,done,cancel}) {
  const formId = useId();
  const [value,setValue]=useState({name:'',code:'',sourceType:'thirdParty',contact:'',contactInfo:'',description:''});
  const set=(key,input)=>{setValue(row=>({...row,[key]:input}));ops.dirty(true);ops.setError('');};
  return <Modal title="添加服务商" description="登记服务商主体资料，渠道接入与密钥在添加后配置。" onClose={cancel} footer={<><Button htmlType="button" onClick={cancel}>取消</Button><Button form={formId} htmlType="submit" theme="solid" disabled={!ops.can}>保存服务商</Button></>}><form id={formId} onSubmit={async event=>{event.preventDefault();const next=await ops.run('provider',{operation:'create',values:value});if(next)done(next,next.audits[0].objectId);}}>
    <div className="ss-form-grid"><Field label="服务商名称 *"><Input aria-label="服务商名称" required value={value.name} disabled={!ops.can} onChange={text=>set('name',text)}/></Field><Field label="英文编码 *" hint="2–32 位小写字母、数字或连字符，字母开头；创建后固定。"><Input aria-label="英文编码" required pattern="[a-z][a-z0-9-]{1,31}" autoCapitalize="none" autoComplete="off" spellCheck={false} value={value.code} disabled={!ops.can} onChange={text=>set('code',text.toLowerCase())}/></Field><Field label="供给类型 *"><Choice label="供给类型" value={value.sourceType} options={Object.entries(PROVIDER_TYPES)} disabled={!ops.can} onChange={type=>set('sourceType',type)}/></Field><div/><Field label="联系人（选填）"><Input aria-label="联系人" value={value.contact} disabled={!ops.can} onChange={text=>set('contact',text)}/></Field><Field label="联系人号码/邮箱（选填）"><Input aria-label="联系人号码/邮箱" value={value.contactInfo} disabled={!ops.can} onChange={text=>set('contactInfo',text)}/></Field></div>
    <Field label="备注（选填）"><TextArea aria-label="备注" rows={4} maxLength={2000} showClear value={value.description} disabled={!ops.can} onChange={text=>set('description',text)}/><Typography.Text type="tertiary">{[...value.description.trim()].length} / 2000 字</Typography.Text></Field>
    {ops.error && <Notice error>{ops.error}</Notice>}
  </form></Modal>;
}
