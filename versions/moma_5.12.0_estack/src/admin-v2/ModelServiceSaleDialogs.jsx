import { useState } from 'react';
import { Button, Select, Space, Tabs, Typography } from '@douyinfe/semi-ui';
import AdminStatus from './AdminStatus';
import Descriptions from './AdminDescriptions';
import Table from './AdminTable';
import { CopyId, Field, Modal, Notice } from './ServiceUI';
import { RetailPriceFields } from './ServiceWorkspaceDialogs';
import { serviceStatus } from './model-services-new';
import { displayTime, moneyDisplay } from './model-management';
import { retailItems, scopeTenants } from './service-commercial';
import { salesAudienceLabel } from './SalesAudience';

const modelPriceRows = price => (price?.items || []).map(({ name, condition, unit, currency, amount }) =>
  ({ name, condition, unit, currency, amount: String(amount / 1_000_000) }));

function QuoteItems({ items }) {
  return items.map((item, index) => <Typography.Paragraph key={index}>{item.name}：{item.currency} {moneyDisplay(item.amount)} / {item.unit}</Typography.Paragraph>);
}

export const modelServiceSaleAudience = (state, sale) => salesAudienceLabel(state, {
  openScope: sale.stage === 'formal' ? 'all' : 'selected', tenantIds: sale.stage === 'gray' ? sale.grayTenantIds : [],
});

function TenantPicker({ choices, tenantIds, change, disabled }) {
  return <Field label="销售对象租户" required><Select multiple filter value={tenantIds} optionList={choices}
    disabled={disabled} style={{ width: '100%' }} onChange={change}/></Field>;
}

const tenantsForSale = state => scopeTenants(state).map(row => ({ value: row.id, label: row.name + ' · ' + row.id }));
const hasValidTenants = (ids, choices) => ids.length > 0 && ids.every(id => choices.some(row => row.value === id));

function SaleQuote({ state, row, ops, change, busy }) {
  const [draft, setDraft] = useState(() => modelPriceRows(row.price));
  const [revision, setRevision] = useState(row.revision);
  const [preview, setPreview] = useState(null);
  const editing = ops.can && ops.params.get('edit') === '1';
  const stale = revision !== row.revision;
  const close = saved => ops.go({ edit: null }, { saved, preserveScroll: true });
  const previewQuote = () => {
    try {
      setPreview(retailItems(state, draft, row.price?.items));
      ops.setError('');
    } catch (error) { ops.setError(error.message); }
  };
  const publish = async () => {
    if (await change({ action: 'price', serviceId: row.id, revision, items: draft })) {
      ops.dirty(false);
      close(true);
    }
  };
  return <div className="ss-body">
    {editing && stale && <Notice error>售卖配置已更新，当前输入保留。
      <Button theme="borderless" disabled={busy} onClick={() => { setRevision(row.revision); setPreview(null); }}>按最新版本重新核对</Button>
    </Notice>}
    <RetailPriceFields state={state} rows={editing ? draft : modelPriceRows(row.price)} readOnly={!editing}
      onEdit={() => ops.go({ edit:'1' }, { preserveScroll: true })} ops={{ ...ops, can: ops.can && !busy }} prefix="模型刊例价"
      setRows={update => { setDraft(update); setPreview(null); ops.dirty(true); ops.setError(''); }}/>
    {editing && preview && <Notice>
      <Typography.Title heading={5}>模型刊例价变更预览</Typography.Title>
      <Typography.Paragraph>当前模型刊例价{row.price ? ' v' + row.price.version : '未配置'}</Typography.Paragraph>
      <QuoteItems items={row.price?.items || []}/>
      <Typography.Paragraph>发布后模型刊例价</Typography.Paragraph>
      <QuoteItems items={preview}/>
      <Typography.Paragraph>发布后，已有订购租户的后续新请求也按新价格计费。</Typography.Paragraph>
    </Notice>}
    {editing && <div className="ss-footer">
      <Button type="tertiary" disabled={busy} onClick={() => preview ? setPreview(null) : close(false)}>{preview ? '取消预览' : '取消'}</Button>
      <Button theme="solid" loading={busy} disabled={busy || stale} onClick={preview ? publish : previewQuote}>
        {preview ? '确认发布模型刊例价' : '预览变更'}
      </Button>
    </div>}
  </div>;
}

function SaleAudience({ state, row, ops, change, busy }) {
  const [tenantIds, setTenantIds] = useState(row.grayTenantIds);
  const [revision, setRevision] = useState(row.revision);
  const [preview, setPreview] = useState(false);
  const choices = tenantsForSale(state), stale = revision !== row.revision;
  const canSave = ops.can && row.stage === 'gray' && !busy && !stale && hasValidTenants(tenantIds, choices);
  const changed = tenantIds.length !== row.grayTenantIds.length || tenantIds.some(id => !row.grayTenantIds.includes(id));
  const current = modelServiceSaleAudience(state, row);
  const submit = async () => {
    const result = await change({ action: 'scope', serviceId: row.id, revision, grayTenantIds: tenantIds });
    if (result) {
      setRevision(result.revision);
      setPreview(false);
      ops.dirty(false);
    }
  };
  return <div className="ss-body">
    <Typography.Text>当前范围：{current}</Typography.Text>
    {row.stage === 'gray' && <>
      {stale && <Notice error>售卖配置已更新，当前输入保留。
        <Button theme="borderless" disabled={busy} onClick={() => { setRevision(row.revision); setPreview(false); }}>按最新范围重新核对</Button>
      </Notice>}
      <TenantPicker choices={choices} tenantIds={tenantIds} disabled={!ops.can || busy} change={ids => { setTenantIds(ids); ops.dirty(true); }}/>
      <div className="ss-footer"><Button theme="solid" disabled={!canSave || !changed} onClick={() => setPreview(true)}>预览变更</Button></div>
    </>}
    {preview && <Modal title="确认销售对象变更" description={row.callId} onClose={() => !busy && setPreview(false)} footer={<>
      <Button disabled={busy} onClick={() => setPreview(false)}>返回修改</Button>
      <Button theme="solid" loading={busy} disabled={!canSave} onClick={submit}>确认保存</Button>
    </>}>
      <p>当前范围：{current}</p>
      <p>调整后：{salesAudienceLabel(state, { openScope: 'selected', tenantIds })}</p>
      {ops.error && <Notice error>{ops.error}</Notice>}
    </Modal>}
  </div>;
}

export function ModelServiceSaleDetail({ state, row, ops, actions, change, busy, tab }) {
  return <div className="ss-body">
    <div className="ss-section-bar"><Typography.Title heading={5}>模型售卖</Typography.Title>{actions}</div>
    <Descriptions data={[
      { key: '模型服务 ID', value: <CopyId value={row.id} label="模型服务 ID"/> },
      { key: '模型 ID', value: <CopyId value={row.callId} label="模型 ID"/> },
      { key: '服务状态', value: <AdminStatus value={serviceStatus(row.service)}/> },
      { key: '售卖状态', value: <Space><AdminStatus value={row.status}/>{!row.price && <AdminStatus value="不可售"/>}</Space> },
      { key: '模型刊例价版本', value: row.price ? `v${row.price.version}` : '待配置' },
    ]}/>
    <Tabs activeKey={tab} keepDOM={false} onChange={item => ops.go({ tab: item, edit: null }, { preserveScroll: true })}>
      <Tabs.TabPane itemKey="pricing" tab="模型刊例价配置">
        <SaleQuote key={row.id + ':' + ops.params.get('edit')} state={state} row={row} ops={ops} change={change} busy={busy}/>
      </Tabs.TabPane>
      <Tabs.TabPane itemKey="scope" tab="销售对象">
        <SaleAudience key={row.id} state={state} row={row} ops={ops} change={change} busy={busy}/>
      </Tabs.TabPane>
      <Tabs.TabPane itemKey="history" tab="变更记录">
        <div className="ss-tab-content ss-body">
          <Typography.Title heading={5}>模型刊例价版本</Typography.Title>
          <Table size="small" rowKey="id" pagination={false} scroll={{x:760,y:420}} empty="尚无模型刊例价版本。"
            dataSource={row.prices.slice().reverse()} columns={[
              { title: '模型刊例价版本 ID', dataIndex: 'id', width: 280, render: value => <CopyId value={value} label="模型刊例价版本 ID"/> },
              { title: '版本', dataIndex: 'version', width: 80 },
              { title: '生效时间', dataIndex: 'effectiveAt', width: 180, render: displayTime },
              { title: '计费项与模型刊例价', render: (_, price) => <QuoteItems items={price.items}/> },
            ]}/>
        </div>
      </Tabs.TabPane>
    </Tabs>
  </div>;
}

export function ModelServiceSaleStatusDialog({ state, row, ops, stage, revision, change, busy, close, configure }) {
  const [tenantIds, setTenantIds] = useState(row.grayTenantIds);
  const pause = stage === 'pause', gray = stage === 'gray';
  const title = pause ? '停售' : gray ? '灰度开售' : '开售';
  const choices = tenantsForSale(state), stale = revision !== row.revision;
  const checks = gray ? [...row.checks, { label: '销售对象有效', passed: hasValidTenants(tenantIds, choices) }] : row.checks;
  const targets = {
    service: () => ops.go({ service: row.id, returnTo: location.hash }, { base: 'listing-new', reset: true }),
    pricing: () => configure(row),
    cost: check => ops.go({
      ...(check.connectionId && { connection: check.connectionId, tab: 'model-costs' }), returnTo: location.hash,
    }, { base: 'providers-reference', reset: true }),
  };
  return <Modal wide={!pause} centered={pause} title={title} description={row.callId} onClose={() => !busy && close()} footer={<>
    <Button disabled={busy} onClick={close}>取消</Button>
    <Button theme="solid" type={pause ? 'danger' : 'primary'} loading={busy}
      disabled={!ops.can || busy || stale || !pause && checks.some(check => !check.passed)} onClick={async () => {
        const result = await change({
          action: pause ? 'pause' : 'start', serviceId: row.id, revision,
          ...(!pause && { stage }), ...(gray && { grayTenantIds: tenantIds }),
        });
        if (result) close();
      }}>确认{title}</Button>
  </>}>
    {pause ? <p>停售后暂停新订购，已有订单与调用权限继续有效。</p> : <>
      {gray && <TenantPicker choices={choices} tenantIds={tenantIds} disabled={busy || !ops.can} change={setTenantIds}/>}
      <ul className="ss-checks">{checks.map(check => <li key={check.label}>
        <span>{check.passed ? '✓' : '待完成'} {check.label}</span>
        {!check.passed && targets[check.target] && <Button theme="borderless" disabled={busy} onClick={() => { close(); targets[check.target](check); }}>前往配置</Button>}
      </li>)}</ul>
    </>}
    {stale && <Notice error>售卖配置已更新，请关闭后重新核对。</Notice>}
    {ops.error && <Notice error>{ops.error}</Notice>}
  </Modal>;
}
