import AdminStatus from './AdminStatus';
import Table from './AdminTable';
import { useId, useState } from 'react';
import { Button, Input, Descriptions, Typography } from '@douyinfe/semi-ui';
import { Field, Modal, Notice } from './ServiceUI';
import ProcurementPriceFields from './ProcurementPriceFields';
import { cataloguePriceDraft, cataloguePurchasePrice, catalogueMoneyDisplay } from './provider-catalogue-pricing';
import { activeChannelProcurement } from './channel-change-management';
import { supplierChannelName } from './supplier-resources';

const time = value => value && Number.isFinite(Date.parse(value)) ? new Date(value).toLocaleString('zh-CN') : '—';
const localTime = () => new Date(Date.now() - new Date().getTimezoneOffset() * 60000).toISOString().slice(0, 23);

export default function ProcurementVersionEditor({ state, provider, association, ops, close }) {
  const current = provider.catalogConnections?.find(row => row.id === association.id && !row.deletedAt) || association;
  const [scenarios, setScenarios] = useState(() => cataloguePriceDraft({ scenarios: (current.pricing?.scenarios || []).map(item => ({ ...item, listPrice: cataloguePurchasePrice(item.listPrice, current.pricing.discountFactor, item.purchasePrice), purchasePrice: undefined })) }).scenarios);
  const [effectiveAt, setEffectiveAt] = useState(localTime), [expiresAt, setExpiresAt] = useState(''), [publishing, setPublishing] = useState(null);
  const formId = useId();
  const [busy, setBusy] = useState(false);
  const revision = current.procurementRevision || 0, versions = current.procurementVersions || [], active = activeChannelProcurement(current);
  const cancel = () => { if (!busy) ops.proceed(close); };
  const changed = callback => value => { callback(value); setPublishing(null); ops.dirty(true); ops.setError(''); };
  const args = { providerId: provider.id, endpointId: association.endpointId, associationId: association.id, expectedPriceRevision: revision };
  const save = event => {
    event.preventDefault();
    if (!ops.can || busy) return;
    try {
      if (!effectiveAt || !Number.isFinite(Date.parse(effectiveAt))) throw new Error('请填写有效的采购价生效时间');
      if (expiresAt && (!Number.isFinite(Date.parse(expiresAt)) || Date.parse(expiresAt) <= Date.parse(effectiveAt))) throw new Error('到期时间须晚于生效时间');
      setPublishing({ ...args, scenarios: structuredClone(scenarios), effectiveAt: new Date(effectiveAt).toISOString(), expiresAt: expiresAt ? new Date(expiresAt).toISOString() : null, version: Math.max(0, ...versions.map(row => row.version)) + 1 });
    } catch (error) { ops.setError(error.message); }
  };
  const status = version => version.status === '草稿' ? '历史未发布' : version.expiresAt && Date.parse(version.expiresAt) <= Date.now() ? '已到期' : Date.parse(version.effectiveAt) > Date.now() ? '待生效' : active?.id === version.id ? '生效中' : '历史';
  const quote = active === undefined ? current.pricing : active?.pricing;
  const stale = publishing && publishing.expectedPriceRevision !== revision;
  const publish = async () => {
    if (busy || stale || !ops.can) return;
    setBusy(true);
    try {
      if (await ops.run('channelProcurementPublish', { ...publishing, confirmed: true })) {
        setPublishing(null);
        ops.dirty(false);
      }
    } finally {
      setBusy(false);
    }
  };
  return <Modal drawer wide title="采购价版本"
    description={`${provider.name} · ${supplierChannelName(provider, association.endpoint)} · ${association.upstreamModelId}`}
    onClose={cancel} footer={publishing ? <>
      <Button type="tertiary" disabled={busy} onClick={() => setPublishing(null)}>取消发布</Button>
      <Button theme="solid" loading={busy} disabled={!ops.can || stale || busy} onClick={publish}>确认发布采购价</Button>
    </> : <>
      <Button type="tertiary" onClick={cancel}>关闭</Button>
      <Button theme="solid" form={formId} htmlType="submit" disabled={!ops.can}>预览并发布采购价</Button>
    </>}>
    <div className="ss-body">
      <Descriptions data={[
        { key: '报价修订', value: revision },
        { key: '当前采购价', value: quote?.scenarios?.length ? `${quote.scenarios.length} 个计费项${active ? ` · 版本 ${active.version}` : ''}` : '待配置' },
      ]}/>
      {active === null && <Notice error>当前没有有效采购价，成本保持待核算；经营上架须补齐成本。技术验证与内部启用可继续，已发起请求保留原采购版本。</Notice>}
      {publishing && <section className="ss-change-section" aria-label="确认发布采购价">
        <Notice>确认发布采购价版本 {publishing.version}，于 {time(publishing.effectiveAt)} 生效
          {publishing.expiresAt ? `，于 ${time(publishing.expiresAt)} 到期` : ''}。客户售价不变，已完成请求不追溯重算。</Notice>
        {stale && <Notice error>采购报价已更新，请取消后重新选择版本。</Notice>}
      </section>}
      <form id={formId} className="ss-change-form" noValidate onSubmit={save}>
        <Typography.Title heading={5} component="h3">新建采购价</Typography.Title>
        <div className="ss-change-time-fields">
          <Field label="生效时间 *"><Input type="datetime-local" step="0.001" aria-label="采购价生效时间"
            value={effectiveAt} disabled={!ops.can || busy} onChange={(_value, event) => changed(setEffectiveAt)(event.target.value)}/></Field>
          <Field label="到期时间（选填）"><Input type="datetime-local" step="0.001" aria-label="采购价到期时间"
            value={expiresAt} disabled={!ops.can || busy} onChange={(_value, event) => changed(setExpiresAt)(event.target.value)}/></Field>
        </div>
        <ProcurementPriceFields state={state} ops={ops} scenarios={scenarios} disabled={!ops.can || busy} onChange={changed(setScenarios)}/>
      </form>
      <section className="ss-change-section">
        <Typography.Title heading={5} component="h3">报价版本</Typography.Title>
        <Table size="small" rowKey="id" pagination={false} scroll={{ x: 860, y: 360 }} dataSource={versions.slice().reverse()} empty="尚无采购价版本记录。" columns={[
          { title: '版本', dataIndex: 'version', width: 80 },
          { title: '生效 / 到期', width: 200, render: (_, version) => <div>{time(version.effectiveAt)}
            <Typography.Paragraph type="tertiary">{version.expiresAt ? '到期 ' + time(version.expiresAt) : '未设置到期时间'}</Typography.Paragraph></div> },
          { title: '采购计费项', width: 330, render: (_, version) => version.pricing.scenarios.length
            ? version.pricing.scenarios.map((item, index) => <Typography.Paragraph key={index}>
              {item.name}{item.condition ? '（' + item.condition + '）' : ''}：{item.listPrice == null ? '待配置'
                : item.currency + ' ' + catalogueMoneyDisplay(cataloguePurchasePrice(item.listPrice, version.pricing.discountFactor, item.purchasePrice))} / {item.unit}
            </Typography.Paragraph>) : '待配置' },
          { title: '状态', width: 100, render: (_, version) => {
            const label = status(version);
            return <AdminStatus value={label}/>;
          } },
          { title: '操作', width: 130, render: (_, version) => <Button theme="borderless" size="small" disabled={!ops.can || busy}
            onClick={() => changed(setScenarios)(cataloguePriceDraft(version.pricing).scenarios)}>沿用报价</Button> },
        ]}/>
      </section>
      {ops.error && <Notice error>{ops.error}</Notice>}
    </div>
  </Modal>;
}
