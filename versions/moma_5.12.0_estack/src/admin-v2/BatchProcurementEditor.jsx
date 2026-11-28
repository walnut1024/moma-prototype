import { useChannelText } from './channel-language';
import { useId, useState } from 'react';
import { Button, Input, Typography } from './xa24/HaloUI.jsx';
import Table from './AdminTable';
import { AdminSideSheet } from './AdminOverlay';
import { Field, Notice } from './ServiceUI';
import ProcurementPriceFields from './ProcurementPriceFields';
import ChannelCostCell from './ChannelCostCell';
import { normalizeProviderPrice } from './provider-management';
import { catalogueMoneyDisplay, validateQuoteTariffs } from './provider-catalogue-pricing';
import './procurement-cost.css';

export default function BatchProcurementEditor({ state, channel, models, ops, close }) {
  const translateLabel = useChannelText();
  const formId = useId();
  const [scenarios, setScenarios] = useState([]);
  const [pricing, setPricing] = useState(null);
  const [effectiveAt, setEffectiveAt] = useState(() => new Date(Date.now() + 8 * 3600_000).toISOString().slice(0, 16));
  const [expiresAt, setExpiresAt] = useState('');
  const [busy, setBusy] = useState(false);
  const revision = association => association?.procurementRevision || 0;
  const rows = models.map(({ association }) => ({ associationId: association.id, expectedPriceRevision: revision(association) }));
  const stale = models.some(model => {
    const current = channel.models.find(item => item.key === model.key);
    return !current || revision(current.association) !== revision(model.association);
  });
  const blocked = !ops.can || busy || stale;
  const set = setter => value => { setter(value); ops.dirty(true); ops.setError(''); };
  const cancel = () => { if (!busy) ops.proceed(() => close(false)); };
  const preview = event => {
    event.preventDefault();
    if (blocked) return;
    try {
      const quote = normalizeProviderPrice(channel.provider, { modelId: models[0].association.modelId, discountFactor: '1', scenarios });
      validateQuoteTariffs(state, quote.scenarios);
      if (!quote.scenarios.length || quote.scenarios.some(item => item.listPrice == null)) throw Error('请补齐计费项和服务商成本价，免费请明确填写 0');
      ops.setError('');
      setPricing(quote);
    } catch (error) { ops.setError(error.message); }
  };
  const publish = async () => {
    if (blocked || !pricing) return;
    try {
      const start = Date.parse(effectiveAt + '+08:00'), end = expiresAt ? Date.parse(expiresAt + '+08:00') : null;
      if (!Number.isFinite(start)) throw Error('请填写有效的服务商成本价生效时间');
      if (end != null && (!Number.isFinite(end) || end <= start)) throw Error('到期时间须晚于生效时间');
      setBusy(true);
      const saved = await ops.run('channelProcurementBatchPublish', {
        providerId: channel.provider.id, endpointId: channel.id, rows, scenarios,
        effectiveAt: new Date(start).toISOString(), expiresAt: end == null ? null : new Date(end).toISOString(), confirmed: true,
      });
      if (saved) close(true);
    } catch (error) { ops.setError(error.message); }
    finally { setBusy(false); }
  };
  return <AdminSideSheet visible className="semi-services procurement-cost-sheet" title={translateLabel("批量设置成本")}
    width="min(960px, 100vw)" onCancel={cancel} closeOnEsc footer={pricing ? <>
      <Button type="tertiary" disabled={busy} onClick={() => { setPricing(null); ops.setError(''); }}>{translateLabel("返回编辑")}</Button>
      <Button theme="solid" loading={busy} disabled={blocked} onClick={publish}>确认发布</Button>
    </> : <>
      <Button type="tertiary" onClick={cancel}>{translateLabel("取消")}</Button>
      <Button theme="solid" form={formId} htmlType="submit" disabled={blocked || !scenarios.length}>下一步：预览发布</Button>
    </>}>
    <div className="ss-body">
      <Typography.Paragraph>为「{channel.name}」连接的 {models.length} 款所选模型设置同一套计费项和服务商成本价。</Typography.Paragraph>
      {stale && <Notice error>所选模型或服务商成本价已有变化，请重新选择。</Notice>}
      {pricing ? <>
        <div className="procurement-cost-dates">
          <Field label="生效时间（北京时间） *"><Input type="datetime-local" aria-label="服务商成本价生效时间" value={effectiveAt} disabled={blocked} onChange={set(setEffectiveAt)}/></Field>
          <Field label="到期时间（选填，北京时间）"><Input type="datetime-local" aria-label="服务商成本价到期时间" value={expiresAt} disabled={blocked} onChange={set(setExpiresAt)}/></Field>
        </div>
        <Table aria-label="发布范围" rowKey="key" pagination={{ pageSize: 10, hideOnSinglePage: true }} dataSource={models} columns={[
          { title: '模型', dataIndex: 'modelName' },
          { title: '上游模型 ID', render: (_, model) => model.association.upstreamModelId },
          { title: '当前服务商成本价', render: (_, model) => <ChannelCostCell cost={model}/> },
        ]}/>
        <Table aria-label="新服务商成本价" rowKey="index" pagination={false} dataSource={pricing.scenarios.map((item, index) => ({ ...item, index }))} columns={[
          { title: '计费项', render: (_, item) => item.condition ? `${item.name}（${item.condition}）` : item.name },
          { title: '新服务商成本价', render: (_, item) => `${item.currency} ${catalogueMoneyDisplay(item.listPrice)} / ${item.unit}` },
        ]}/>
      </> : <form id={formId} className="ss-body" noValidate onSubmit={preview}>
        <ProcurementPriceFields state={state} ops={ops} scenarios={scenarios} disabled={blocked} onChange={set(setScenarios)}/>
      </form>}
      {ops.error && <Notice error>{ops.error}</Notice>}
    </div>
  </AdminSideSheet>;
}
