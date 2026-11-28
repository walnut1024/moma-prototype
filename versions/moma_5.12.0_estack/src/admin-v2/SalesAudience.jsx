import { useState } from 'react';
import { Button, Select, Typography } from './xa24/HaloUI.jsx';
import { Field, Modal, Notice } from './ServiceUI';
import { offerSalesScope } from './service-sales';
import { scopeTenants } from './service-commercial';
import { offerKey } from '../service-access.mjs';

export function salesAudienceLabel(state, scope) {
  if (scope.openScope === 'all') return '全部租户';
  return scope.tenantIds.map(id => state.tenants.find(row => row.id === id)?.name || id).join('、') || '未设置';
}

export default function SalesAudience({ state, service, ops }) {
  const model = service.model, key = offerKey(service);
  const current = offerSalesScope(model, key);
  const [tenantIds, setTenantIds] = useState(current.tenantIds);
  const [revision] = useState(model.updatedAt);
  const [preview, setPreview] = useState(false);
  const [busy, setBusy] = useState(false);
  const choices = scopeTenants(state).map(row => ({ value: row.id, label: row.name + ' · ' + row.id }));
  const locked = !ops.can || busy || revision !== model.updatedAt || service.status !== '灰度在售';
  const valid = tenantIds.length > 0 && tenantIds.every(id => choices.some(row => row.value === id));
  const changed = tenantIds.length !== current.tenantIds.length || tenantIds.some(id => !current.tenantIds.includes(id));
  return <div className="ss-body">
    <Typography.Text>当前范围：{salesAudienceLabel(state, current)}</Typography.Text>
    {service.status === '灰度在售' && <><Field label="销售对象租户" required>
      <Select multiple filter value={tenantIds} optionList={choices} disabled={locked}
        style={{ width: '100%' }} onChange={ids => { setTenantIds(ids); ops.dirty(true); }}/>
    </Field>
      <div className="ss-footer"><Button theme="solid" disabled={locked || !valid || !changed}
        onClick={() => setPreview(true)}>预览变更</Button></div></>}
    {preview && <Modal wide title="确认销售对象变更" description={service.callId} onClose={() => !busy && setPreview(false)} footer={<>
      <Button disabled={busy} onClick={() => setPreview(false)}>返回修改</Button>
      <Button theme="solid" loading={busy} disabled={locked} onClick={async () => {
        setBusy(true);
        try {
          if (await ops.run('startSales', { releaseStage: 'gray', releaseTenantIds: tenantIds,
            ...(key && { offerKeys: [key] }), expectedUpdatedAt: revision, confirmed: true }, model.id)) setPreview(false);
        } finally { setBusy(false); }
      }}>确认保存</Button>
    </>}>
      <p>当前范围：{salesAudienceLabel(state, current)}</p>
      <p>调整后：{salesAudienceLabel(state, { openScope: 'selected', tenantIds })}</p>
      {ops.error && <Notice error>{ops.error}</Notice>}
    </Modal>}
  </div>;
}
