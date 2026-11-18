import { useState } from 'react';
import { Button, Input, TextArea } from '@douyinfe/semi-ui';
import { Modal, Field, Notice } from './ServiceUI';
import { modelPresentation } from '../model-identities.mjs';

export default function MarketContentEditor({ state, model, ops, close }) {
  const [value, setValue] = useState(() => modelPresentation(state, model)), [revision] = useState(model.updatedAt), [busy, setBusy] = useState(false);
  const change = patch => { setValue(row => ({ ...row, ...patch })); ops.dirty(true); };
  return <Modal wide title="维护广场展示信息" onClose={() => !busy && close()} footer={<>
    <Button disabled={busy} onClick={close}>取消</Button><Button theme="solid" loading={busy} disabled={!ops.can || busy} onClick={async () => {
      setBusy(true);
      try { if (await ops.run('marketContentSave', { name: value.name, description: value.description, profile: value.profile, expectedUpdatedAt: revision }, model.id)) close(); }
      finally { setBusy(false); }
    }}>保存展示信息</Button>
  </>}>
    <Field label="模型展示名"><Input aria-label="模型展示名" value={value.name} maxLength={100} onChange={name => change({ name })}/></Field>
    <Field label="模型介绍"><TextArea aria-label="模型介绍" value={value.description} maxLength={5000} onChange={description => change({ description })}/></Field>
    {[['author', '模型作者'], ['logo', '模型图标 URL'], ['detailDescription', '详细介绍']].map(([key, label]) => <Field key={key} label={label}>
      <Input aria-label={label} value={value.profile[key] || ''} onChange={text => change({ profile: { ...value.profile, [key]: text } })}/>
    </Field>)}
    {ops.error && <Notice error>{ops.error}</Notice>}
  </Modal>;
}
