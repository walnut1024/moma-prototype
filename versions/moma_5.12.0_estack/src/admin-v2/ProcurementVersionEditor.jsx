import { useId, useState } from 'react';
import { Button, Input, Typography } from '@douyinfe/semi-ui';
import AdminStatus from './AdminStatus';
import Table from './AdminTable';
import { AdminSideSheet } from './AdminOverlay';
import { Field, Notice } from './ServiceUI';
import ProcurementPriceFields from './ProcurementPriceFields';
import { cataloguePriceDraft, cataloguePurchasePrice, catalogueMoneyDisplay } from './provider-catalogue-pricing';
import { normalizeProviderPrice } from './provider-management';
import { activeChannelProcurement } from './channel-change-management';
import { modelChannelName } from './model-channel-name.js';
import './procurement-cost.css';

const time = value => value && Number.isFinite(Date.parse(value)) ? new Date(value).toLocaleString('zh-CN', { timeZone: 'Asia/Shanghai' }) : '—';
const localTime = () => new Date(Date.now() + 8 * 60 * 60 * 1000).toISOString().slice(0, 16);

export default function ProcurementVersionEditor({ state, provider, association, modelName, ops, close, directory = false }) {
  const current = provider.catalogConnections?.find(row => row.id === association.id && !row.deletedAt) || association;
  const active = activeChannelProcurement(current);
  const quote = active === undefined ? current.pricing : active?.pricing;
  const draft = directory && !quote && current.procurementVersions?.find(row => row.status === '草稿')?.pricing;
  const initialQuote = quote || draft;
  const [scenarios, setScenarios] = useState(() => cataloguePriceDraft({ scenarios: (initialQuote?.scenarios || []).map(item => ({
    ...item, listPrice: cataloguePurchasePrice(item.listPrice, initialQuote.discountFactor, item.purchasePrice), purchasePrice: undefined,
  })) }).scenarios);
  const [expectedRevision] = useState(current.procurementRevision || 0);
  const [effectiveAt, setEffectiveAt] = useState(localTime), [expiresAt, setExpiresAt] = useState('');
  const [publishing, setPublishing] = useState(null), [history, setHistory] = useState(false), [busy, setBusy] = useState(false);
  const formId = useId();
  const versions = current.procurementVersions || [];
  const stale = expectedRevision !== (current.procurementRevision || 0);
  const blocked = !ops.can || busy || stale;
  const cancel = () => { if (!busy) ops.proceed(close); };
  const changed = callback => value => { callback(value); ops.dirty(true); ops.setError(''); };
  const args = { providerId: provider.id, endpointId: association.endpointId, associationId: association.id, expectedPriceRevision: expectedRevision };
  const save = event => {
    event.preventDefault();
    if (blocked) return;
    try {
      const pricing = normalizeProviderPrice(provider, { modelId: association.modelId, discountFactor: '1', scenarios });
      if (!pricing.scenarios.length || pricing.scenarios.some(item => item.listPrice == null)) throw new Error('请补齐计费项和服务商成本价，免费请明确填写 0');
      setPublishing({ ...args, scenarios: structuredClone(scenarios), pricing });
      ops.setError('');
    } catch (error) { ops.setError(error.message); }
  };
  const status = version => directory && version.status === '草稿' ? '历史未发布' : version.expiresAt && Date.parse(version.expiresAt) <= Date.now() ? '已到期'
    : Date.parse(version.effectiveAt) > Date.now() ? '待生效' : active?.id === version.id ? '生效中' : '历史';
  const publish = async () => {
    if (blocked || !publishing) return;
    try {
      const start = Date.parse(effectiveAt + '+08:00'), end = expiresAt ? Date.parse(expiresAt + '+08:00') : null;
      if (!Number.isFinite(start)) throw new Error('请填写有效的服务商成本价生效时间');
      if (expiresAt && (!Number.isFinite(end) || end <= start)) throw new Error('到期时间须晚于生效时间');
      setBusy(true);
      const saved = await ops.run('channelProcurementPublish', { ...publishing, pricing: undefined, effectiveAt: new Date(start).toISOString(), expiresAt: end == null ? null : new Date(end).toISOString(), confirmed: true });
      if (saved) close();
    } catch (error) { ops.setError(error.message); }
    finally { setBusy(false); }
  };
  const showHistory = value => { setHistory(value); ops.setError(''); };
  return <AdminSideSheet visible className="semi-services procurement-cost-sheet" title={modelChannelName(provider, association) + ' · 成本设置'}
    width="min(960px, 100vw)" onCancel={cancel} closeOnEsc footer={publishing ? <>
      <Button type="tertiary" disabled={busy} onClick={() => setPublishing(null)}>返回编辑</Button>
      <Button theme="solid" loading={busy} disabled={blocked} onClick={publish}>确认发布</Button>
    </> : history ? <Button onClick={() => showHistory(false)}>返回成本设置</Button> : <>
      <Button type="tertiary" onClick={cancel}>取消</Button>
      <Button theme="solid" form={formId} htmlType="submit" disabled={blocked || !scenarios.length}>下一步：预览发布</Button>
    </>}>
    <div className="procurement-cost-scope">
      <dl><div><dt>服务商</dt><dd>{provider.name}</dd></div><div><dt>模型</dt><dd>{modelName || association.modelId}</dd></div></dl>
      <AdminStatus value={quote?.scenarios?.length ? '已配置' : draft ? '报价草稿' : active === null ? '已失效' : '待配置'}/>
    </div>
    {stale && <Notice error>该连接服务商成本价已有新版本，当前输入保留，请关闭并重新打开。</Notice>}
    {publishing ? <section className="ss-body">
      <Typography.Title heading={5} component="h3">预览发布</Typography.Title>
      <div className="procurement-cost-dates">
        <Field label="生效时间（北京时间） *"><Input type="datetime-local" aria-label="服务商成本价生效时间" value={effectiveAt} disabled={blocked} onChange={changed(setEffectiveAt)}/></Field>
        <Field label="到期时间（选填，北京时间）"><Input type="datetime-local" aria-label="服务商成本价到期时间" value={expiresAt} disabled={blocked} onChange={changed(setExpiresAt)}/></Field>
      </div>
      <Table size="small" rowKey="index" pagination={false} dataSource={publishing.pricing.scenarios.map((item, index) => ({ ...item, index }))} columns={[
        { title: '计费项', render: (_, item) => <div>{item.name}{item.condition && <Typography.Paragraph type="tertiary">{item.condition}</Typography.Paragraph>}</div> },
        { title: '服务商成本价', render: (_, item) => item.currency + ' ' + catalogueMoneyDisplay(item.listPrice) },
        { title: '计费单位', dataIndex: 'unit' },
      ]}/>
    </section> : history ? <section className="ss-body">
      <Typography.Title heading={5} component="h3">历史版本</Typography.Title>
      <Table size="small" rowKey="id" pagination={false} scroll={{ x: 780 }} dataSource={versions.slice().reverse()} empty="尚无服务商成本价版本记录。" columns={[
        { title: '版本', dataIndex: 'version', width: 70 },
        { title: '生效 / 到期（北京时间）', width: 200, render: (_, version) => <div>{time(version.effectiveAt)}<Typography.Paragraph type="tertiary">{version.expiresAt ? time(version.expiresAt) : '未设置到期时间'}</Typography.Paragraph></div> },
        { title: '采购计费项', width: 300, render: (_, version) => version.pricing?.scenarios.map((item, index) => <Typography.Paragraph key={index}>
          {item.name}{item.condition ? '（' + item.condition + '）' : ''} · {item.currency} {catalogueMoneyDisplay(cataloguePurchasePrice(item.listPrice, version.pricing.discountFactor, item.purchasePrice))} / {item.unit}
        </Typography.Paragraph>) },
        { title: '状态', width: 90, render: (_, version) => <AdminStatus value={status(version)}/> },
        { title: '操作', width: 100, render: (_, version) => <Button theme="borderless" size="small" disabled={blocked || directory && !version.pricing?.scenarios?.length} onClick={() => {
          changed(setScenarios)(cataloguePriceDraft({ scenarios: version.pricing.scenarios.map(item => ({ ...item, listPrice: cataloguePurchasePrice(item.listPrice, version.pricing.discountFactor, item.purchasePrice), purchasePrice: undefined })) }).scenarios);
          setHistory(false);
        }}>沿用报价</Button> },
      ]}/>
    </section> : <form id={formId} className="ss-body" noValidate onSubmit={save}>
      <div className="procurement-cost-heading"><Typography.Title heading={5} component="h3">计费项</Typography.Title>
        {versions.length > 0 && <Button theme="borderless" size="small" onClick={() => showHistory(true)}>历史版本</Button>}
      </div>
      <ProcurementPriceFields state={state} ops={ops} scenarios={scenarios} disabled={blocked} onChange={changed(setScenarios)}/>
    </form>}
    {ops.error && <Notice error>{ops.error}</Notice>}
  </AdminSideSheet>;
}
