import { useChannelText } from './channel-language';
import { useState } from 'react';
import { Button, RadioGroup, Select, Typography } from '@douyinfe/semi-ui';
import { Field, Modal, Notice } from './ServiceUI';
import Table from './AdminTable';
import { salesScope } from './service-sales';
import { scopeTenants } from './service-commercial';

export function salesAudienceLabel(state, scope) {
  if (scope.openScope === 'all') return '全部租户';
  return scope.tenantIds.map(id => state.tenants.find(row => row.id === id)?.name || id).join('、') || '未设置';
}

export default function SalesAudience({ state, model, services, ops }) {
  const translateLabel = useChannelText();
  const current = salesScope(model);
  const [value, setValue] = useState(current);
  const [revision] = useState(model.updatedAt);
  const [preview, setPreview] = useState(false);
  const [busy, setBusy] = useState(false);
  const choices = scopeTenants(state).map(row => ({ value: row.id, label: row.name }));
  const update = patch => { setValue({ ...value, ...patch }); ops.dirty(true); };
  const locked = !ops.can || busy || revision !== model.updatedAt;
  const valid = value.openScope === 'all' || value.openScope === 'selected' && value.tenantIds.length > 0 &&
    value.tenantIds.every(id => choices.some(row => row.value === id));
  return <div className="ss-body">
    <Typography.Text>当前范围：{salesAudienceLabel(state, current)}</Typography.Text>
    <Field label="销售对象">
      <RadioGroup value={value.openScope} disabled={locked} aria-label={translateLabel("销售对象")}
        options={[{ value: 'all', label: '全部租户' }, { value: 'selected', label: '指定租户' }]}
        onChange={event => update({ openScope: event.target.value, tenantIds: [] })}/>
    </Field>
    {value.openScope === 'selected' && <Field label="销售对象租户" required>
      <Select multiple filter value={value.tenantIds} optionList={choices} disabled={locked}
        style={{ width: '100%' }} onChange={tenantIds => update({ tenantIds })}/>
    </Field>}
    <Typography.Title heading={6}>受影响服务</Typography.Title>
    <Table size="small" rowKey="id" dataSource={services.filter(row => row.modelId === model.id)} pagination={false}
      columns={[{ title: '模型 ID', dataIndex: 'callId' }]}/>
    <div className="ss-footer"><Button theme="solid" disabled={locked || !valid || JSON.stringify(current) === JSON.stringify(value)}
      onClick={() => setPreview(true)}>预览变更</Button></div>
    {preview && <Modal wide title="确认销售对象变更" description={model.name} onClose={() => !busy && setPreview(false)} footer={<>
      <Button disabled={busy} onClick={() => setPreview(false)}>返回修改</Button>
      <Button theme="solid" loading={busy} disabled={locked} onClick={async () => {
        setBusy(true);
        try {
          if (await ops.run('salesSettings', { scope: value, expectedUpdatedAt: revision, confirmed: true }, model.id)) setPreview(false);
        } finally { setBusy(false); }
      }}>确认保存</Button>
    </>}>
      <p>当前范围：{salesAudienceLabel(state, current)}</p>
      <p>调整后：{salesAudienceLabel(state, value)}</p>
      <p>将更新同一模型的 {services.filter(row => row.modelId === model.id).length} 项模型服务。</p>
      {ops.error && <Notice error>{ops.error}</Notice>}
    </Modal>}
  </div>;
}
