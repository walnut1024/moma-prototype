import { useId, useState } from 'react';
import { Button, Input } from '@douyinfe/semi-ui';
import { Field, FieldLabel, Modal, Notice } from './ServiceUI';
import { offerStage, providerOffer } from '../service-access.mjs';
import { serviceIdentityBlockingMessage } from './service-identity-blocker.mjs';

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

  return <Modal title="编辑模型调用标识" description={model.name} onClose={close} footer={<>
    <Button theme="light" onClick={close}>取消</Button>
    <Button theme="solid" form={formId} htmlType="submit" disabled={!ops.can || !callId.trim() || callId.trim() === original || blocked}>
      {confirm ? '确认修改模型调用标识' : changing ? '核对变更' : '保存模型调用标识'}
    </Button>
  </>}>
    <form id={formId} onSubmit={submit}>
      <Field required label={<FieldLabel name="模型调用标识"/>}>
        <Input aria-label="模型调用标识" autoFocus value={callId} required maxLength={200} disabled={!ops.can || blocked}
          onChange={text => { setCallId(text); setConfirm(false); ops.dirty(true); ops.setError(''); }}/>
      </Field>
      {blocked && <Notice>{serviceIdentityBlockingMessage(model, providerId)}</Notice>}
      {changing && <Notice>原标识：{original}。保存后，客户需将调用参数改为新标识；原标识不再接受新请求。订购、配置和历史记录保留。</Notice>}
      {confirm && <p>请确认客户已完成模型调用标识迁移，再保存为 <code>{callId}</code>。</p>}
      {ops.error && <Notice error>{ops.error}</Notice>}
    </form>
  </Modal>;
}

