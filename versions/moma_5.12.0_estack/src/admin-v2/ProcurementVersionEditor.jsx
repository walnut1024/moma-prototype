import { useRef, useState } from 'react';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
import { Field } from './ModelMetadataForm';
import { GridTable, Row, Cell, Modal, Notice } from './ModelOperationsUI';
import SupplierPriceFields from './SupplierPriceFields';
import { cataloguePriceDraft, cataloguePurchasePrice, catalogueMoneyDisplay } from './provider-catalogue-pricing';
import { activeChannelProcurement } from './channel-change-management';
import { supplierChannelName } from './supplier-resources';
import './supplier-change-dialogs.css';

const time = value => value && Number.isFinite(Date.parse(value)) ? new Date(value).toLocaleString('zh-CN') : '—';
const localTime = () => new Date(Date.now() - new Date().getTimezoneOffset() * 60000).toISOString().slice(0, 23);

export default function ProcurementVersionEditor({ state, provider, association, ops, close }) {
  const current = provider.catalogConnections?.find(row => row.id === association.id && !row.deletedAt) || association;
  const [scenarios, setScenarios] = useState(() => cataloguePriceDraft({ scenarios: (current.pricing?.scenarios || []).map(item => ({ ...item, listPrice: cataloguePurchasePrice(item.listPrice, current.pricing.discountFactor, item.purchasePrice), purchasePrice: undefined })) }).scenarios);
  const [effectiveAt, setEffectiveAt] = useState(localTime), [expiresAt, setExpiresAt] = useState(''), [publishing, setPublishing] = useState(null);
  const unsavedDraft = useRef(false);
  const revision = current.procurementRevision || 0, versions = current.procurementVersions || [], active = activeChannelProcurement(current);
  const cancel = () => ops.proceed(close);
  const changed = callback => value => { callback(value); setPublishing(null); unsavedDraft.current = true; ops.dirty(true); ops.setError(''); };
  const args = { providerId: provider.id, endpointId: association.endpointId, associationId: association.id, expectedPriceRevision: revision };
  const save = event => {
    event.preventDefault();
    try {
      if (!effectiveAt || !Number.isFinite(Date.parse(effectiveAt))) throw new Error('请填写有效的采购价生效时间');
      if (expiresAt && (!Number.isFinite(Date.parse(expiresAt)) || Date.parse(expiresAt) <= Date.parse(effectiveAt))) throw new Error('到期时间须晚于生效时间');
      setPublishing({ ...args, scenarios: structuredClone(scenarios), effectiveAt: new Date(effectiveAt).toISOString(), expiresAt: expiresAt ? new Date(expiresAt).toISOString() : null, version: Math.max(0, ...versions.map(row => row.version)) + 1 });
    } catch (error) { ops.setError(error.message); }
  };
  const status = version => version.status === '草稿' ? '历史未发布' : version.expiresAt && Date.parse(version.expiresAt) <= Date.now() ? '已到期' : Date.parse(version.effectiveAt) > Date.now() ? '待生效' : active?.id === version.id ? '生效中' : '历史';
  const quote = active === undefined ? current.pricing : active?.pricing;
  return <Modal drawer wide title="采购价版本" description={`${provider.name} · ${supplierChannelName(provider, association.endpoint)} · ${association.upstreamModelId}`} onClose={cancel} footer={<Button variant="outline" onClick={cancel}>关闭</Button>}>
    <div className="supplier-change-dialog">
      <dl className="supplier-test-facts"><div><dt>报价修订</dt><dd>{revision}</dd></div><div><dt>当前采购价</dt><dd>{quote?.scenarios?.length ? `${quote.scenarios.length} 个计费项${active ? ` · 版本 ${active.version}` : ''}` : '待配置'}</dd></div></dl>
      {active === null && <Notice error>当前没有有效采购价，成本保持待核算；经营上架须补齐成本。技术验证与内部启用可继续，已发起请求保留原采购版本。</Notice>}
      <form className="supplier-change-form" noValidate onSubmit={save}>
        <h3>新建采购价</h3>
        <div className="supplier-change-time-fields"><Field label="生效时间 *"><Input type="datetime-local" step="0.001" aria-label="采购价生效时间" value={effectiveAt} disabled={!ops.can} onChange={event => changed(setEffectiveAt)(event.target.value)}/></Field><Field label="到期时间（选填）"><Input type="datetime-local" step="0.001" aria-label="采购价到期时间" value={expiresAt} disabled={!ops.can} onChange={event => changed(setExpiresAt)(event.target.value)}/></Field></div>
        <SupplierPriceFields state={state} ops={ops} scenarios={scenarios} disabled={!ops.can} onChange={changed(setScenarios)}/>
        <div className="supplier-change-actions"><Button type="submit" variant="outline" disabled={!ops.can}>预览并发布采购价</Button></div>
      </form>
      <section className="supplier-change-section"><h3>报价版本</h3><GridTable headings={['版本', '生效 / 到期', '采购计费项', '状态', '操作']} empty={!versions.length} emptyMessage="尚无采购价版本记录。">
        {versions.slice().reverse().map(version => <Row key={version.id}><Cell>{version.version}</Cell><Cell>{time(version.effectiveAt)}<small>{version.expiresAt ? `到期 ${time(version.expiresAt)}` : '未设置到期时间'}</small></Cell><Cell>{version.pricing.scenarios.length ? version.pricing.scenarios.map((item, index) => <small key={index}>{item.name}{item.condition ? `（${item.condition}）` : ''}：{item.listPrice == null ? '待配置' : `${item.currency} ${catalogueMoneyDisplay(cataloguePurchasePrice(item.listPrice, version.pricing.discountFactor, item.purchasePrice))}`} / {item.unit}</small>) : '待配置'}</Cell><Cell>{status(version)}</Cell><Cell><Button variant="link" disabled={!ops.can} onClick={() => { setScenarios(cataloguePriceDraft(version.pricing).scenarios); setPublishing(null); ops.dirty(true); }}>沿用报价</Button></Cell></Row>)}
      </GridTable></section>
      {publishing && <section className="supplier-change-confirmation" aria-label="确认发布采购价"><Notice>确认发布采购价版本 {publishing.version}，于 {time(publishing.effectiveAt)} 生效{publishing.expiresAt ? `，于 ${time(publishing.expiresAt)} 到期` : ''}。客户售价不变，已完成请求不追溯重算。</Notice>{publishing.expectedPriceRevision !== revision && <Notice error>采购报价已更新，请取消后重新选择版本。</Notice>}<div className="supplier-change-actions"><Button variant="outline" onClick={() => setPublishing(null)}>取消发布</Button><Button disabled={!ops.can || publishing.expectedPriceRevision !== revision} onClick={async () => { if (await ops.run('channelProcurementPublish', { ...publishing, confirmed: true })) { setPublishing(null); unsavedDraft.current = false; ops.dirty(false); } }}>确认发布采购价</Button></div></section>}
      {ops.error && <Notice error>{ops.error}</Notice>}
    </div>
  </Modal>;
}
