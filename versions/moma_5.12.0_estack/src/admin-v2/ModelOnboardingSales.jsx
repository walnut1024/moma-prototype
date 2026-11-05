import { useState } from 'react';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
import { Checkbox } from '../components/ui/checkbox';
import { Choice, Field } from './ModelMetadataForm';
import { Notice, ScopeFields } from './ModelOperationsUI';
import { RetailPriceFields } from './ServiceWorkspaceDialogs';
import { SERVICE_MODES, providerCode } from './model-operations';
import { catalogueAmountInput } from './provider-catalogue-pricing';
import { serviceChannelCosts, unifiedBillingDraft, activeProviderPrice, providerServices, modelSaleRevision, providerPriceRevision } from './service-workspace';

const priceDraft = rows => rows.map(({ name, unit, currency, condition, amount }) => ({ name, unit, currency, condition: condition || '', amount: catalogueAmountInput(amount) }));
function defaultCosts(model) {
  const pairs = ['text', 'multimodal'].includes(model.type) ? [['输入', '百万 Token'], ['输出', '百万 Token']] : model.type === 'embedding' ? [['输入', '百万 Token']] : model.type === 'video' ? [['视频输出时长', '秒']] : model.type === 'audio' ? model.profile.outputModalities?.includes('音频') ? [['语音合成字符数', '万字符']] : [['音频输入时长', '分钟']] : [['请求数', '次']];
  return pairs.map(([name, unit]) => ({ name, unit, currency: 'CNY', condition: '', listPrice: '' }));
}

export default function ModelOnboardingSales({ state, context, ops, onSaved, back }) {
  const { draft, provider, association, channel, model } = context;
  const [form, setForm] = useState(() => {
    const costs = serviceChannelCosts(channel).map(({ name, unit, currency, condition, amount }) => ({ name, unit, currency, condition: condition || '', listPrice: catalogueAmountInput(amount) }));
    const prices = model.serviceMode === 'provider' ? priceDraft(activeProviderPrice(state, model.id, provider.id)?.items || []) : unifiedBillingDraft(state, model);
    const initialCosts = costs.length ? costs : defaultCosts(model);
    return { serviceMode: model.serviceMode || 'unselected', callId: providerServices(model).find(row => row.providerId === provider.id)?.callId || `${providerCode(provider)}/${model.modelId}`, prices: prices.length ? prices : initialCosts.map(({ name, unit, currency, condition }) => ({ name, unit, currency, condition: condition || '', amount: '' })), openScope: context.supply ? model.openScope : 'selected', tenantIds: context.supply ? model.tenantIds || [] : [] };
  });
  const [confirmed, setConfirmed] = useState(false);
  const [revision] = useState(() => ({ expectedDraftRevision: draft.draftRevision, expectedUpdatedAt: model.updatedAt, expectedPriceRevision: association.procurementRevision || 0, expectedSaleVersion: modelSaleRevision(state, model.id), expectedProviderSaleVersion: providerPriceRevision(state, model.id, provider.id) }));
  const current = revision.expectedUpdatedAt === model.updatedAt && revision.expectedDraftRevision === draft.draftRevision && revision.expectedPriceRevision === (association.procurementRevision || 0) && revision.expectedSaleVersion === modelSaleRevision(state, model.id) && revision.expectedProviderSaleVersion === providerPriceRevision(state, model.id, provider.id);
  const change = patch => { setForm(value => ({ ...value, ...patch })); setConfirmed(false); ops.dirty(true); ops.setError(''); };

  return <form className="onboarding-sales" noValidate aria-label="配置对外服务" onSubmit={async event => {
    event.preventDefault();
    if (!confirmed) return;
    const next = await ops.run('guidedServiceConfigure', { ...form, ...revision, draftId: draft.id, confirmed }, model.id);
    if (next) onSaved();
  }}>
    <section className="onboarding-form-section"><h2>服务方式与调用 ID</h2><div className="supplier-channel-fields">
      <Field label="服务模式"><Choice label="接入服务模式" value={form.serviceMode} options={[[ 'unselected','请选择服务模式' ],...Object.entries(SERVICE_MODES).map(([id, row]) => [id, row.label])]} disabled={!ops.can || Boolean(model.serviceMode)} onChange={serviceMode => change({ serviceMode })}/><small>{SERVICE_MODES[form.serviceMode]?.description}</small></Field>
      <Field label="对外调用 ID"><Input aria-label="对外调用 ID" maxLength={200} readOnly={form.serviceMode === 'standard'} disabled={!ops.can} value={form.serviceMode === 'standard' ? model.modelId : form.callId} onChange={event => change({ callId: event.target.value })}/></Field>
    </div></section>

    <section className="onboarding-form-section"><div className="onboarding-section-title"><h2>平台售价</h2><span>向客户销售的价格</span></div><RetailPriceFields state={state} rows={form.prices} setRows={prices => change({ prices })} ops={ops} prefix="接入售价"/></section>
    <section className="onboarding-form-section"><h2>向哪些客户开放</h2><ScopeFields state={state} openScope={form.openScope} tenantIds={form.tenantIds} disabled={!ops.can} onChange={(openScope, tenantIds) => change({ openScope, tenantIds })}/></section>
    <div className="onboarding-review"><label><Checkbox checked={confirmed} disabled={!ops.can || !current} onCheckedChange={value => setConfirmed(value === true)}/>已核对平台售价和客户范围；上架前不对客户开放</label><p>保存后关联本次接入的渠道，下一项确认流量路由。完成验证并上架后，客户才能使用。</p></div>
    {!current && <Notice error>模型或价格已被修改，当前输入保留。<Button type="button" variant="link" onClick={() => ops.proceed(() => ops.go({ section: 'sales', refresh: String(Date.now()) }, { saved: true }))}>载入最新配置</Button></Notice>}
    {ops.error && <Notice error>{ops.error}</Notice>}
    <footer className="onboarding-footer"><Button type="button" variant="outline" onClick={back}>上一步：对外资料</Button><Button type="submit" disabled={!ops.can || !confirmed || !current}>确认保存，继续配置路由</Button></footer>
  </form>;
}
