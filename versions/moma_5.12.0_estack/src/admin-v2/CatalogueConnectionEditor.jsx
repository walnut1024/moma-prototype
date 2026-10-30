import { useState } from 'react';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
import { Checkbox } from '../components/ui/checkbox';
import { Choice, Field } from './ModelMetadataForm';
import { Modal, Notice } from './ModelOperationsUI';
import { catalogueConnections, connectionCatalogueIds } from './provider-model-connections';
import { PROTOCOLS } from './provider-management';
import { connectionCredentialsReady } from './connection-state';

export default function CatalogueConnectionEditor({ state, provider, modelId, ops, close }) {
  const existing = catalogueConnections(state, provider, modelId);
  const [selected, setSelected] = useState(existing.length === 1 ? existing[0].id : 'choose');
  const endpoints = state.endpoints.filter(item => item.providerId === provider.id);
  const endpoint = endpoints.find(item => item.id === selected);
  const [protocol, setProtocol] = useState(existing.length === 1 ? existing[0].protocol : 'OpenAI');
  const [baseUrl, setBaseUrl] = useState(existing.length === 1 ? existing[0].baseUrl : '');
  const [confirmed, setConfirmed] = useState(false);
  const related = endpoint ? connectionCatalogueIds(state, provider, endpoint.id).filter(id => id !== modelId) : [];
  const supplies = state.modelSupplies.filter(item => item.status !== '已移除' && endpoints.some(ep => ep.id === item.endpointId) && (item.catalogueModelId === modelId || item.upstreamModelId === modelId));
  const changed = endpoint && (protocol !== endpoint.protocol || baseUrl.trim().replace(/\/$/, '') !== endpoint.baseUrl);
  const impact = existing.length > 1 || supplies.some(item => item.endpointId !== endpoint?.id) || changed && (related.length > 0 || supplies.length > 0 || state.modelSupplies.some(item => item.endpointId === endpoint.id && item.status !== '已移除'));
  const dirty = () => { ops.dirty(true); ops.setError(''); setConfirmed(false); };
  const cancel = () => ops.proceed(close);
  return <Modal title="配置模型接入" description={modelId} onClose={cancel}><form className="supplier-key-form" noValidate onSubmit={event => {
    event.preventDefault();
    if (selected === 'choose') { ops.setError('请选择已有接入地址或新建接入地址'); return; }
    if (impact && !confirmed) { ops.setError('请确认接入变更对关联模型的影响'); return; }
    if (ops.run('provider', { operation: 'catalogueConnection', objectId: provider.id, values: { modelId, endpointId: endpoint?.id, protocol, baseUrl, confirmed } })) close();
  }}>
    <Field label="接入地址配置 *"><Choice label="接入地址配置" value={selected} disabled={!ops.can} options={[[ 'choose', '请选择接入地址'], ['new', '新建接入地址'], ...endpoints.map(item => [item.id, item.protocol + ' · ' + item.baseUrl])]} onChange={id => { const next = endpoints.find(item => item.id === id); setSelected(id); setProtocol(next?.protocol || 'OpenAI'); setBaseUrl(next?.baseUrl || ''); dirty(); }}/></Field>
    {selected !== 'choose' && <>
      <Field label="协议 *"><Choice label="协议" value={protocol} options={PROTOCOLS.map(value => [value, value])} disabled={!ops.can} onChange={value => { setProtocol(value); dirty(); }}/></Field>
      <Field label="接入地址（Base URL）*" hint={provider.sourceType === 'selfHosted' ? '填写完整 HTTP / HTTPS 服务地址。' : '填写完整 HTTPS 服务地址。'}><Input aria-label="接入地址（Base URL）" value={baseUrl} disabled={!ops.can} placeholder="https://api.example.com/v1" onChange={event => { setBaseUrl(event.target.value); dirty(); }}/></Field>
      <Notice>{connectionCredentialsReady(endpoint, provider) ? '此接入已配置凭证，保存后可在目录检查并启用。' : provider.sourceType === 'selfHosted' ? '自有推理服务可不配置 API 密钥。' : '保存后请前往 API 密钥页签配置凭证，再检查并启用。'}</Notice>
    </>}
    {related.length > 0 && <Notice>此地址还被 {related.length} 个目录模型使用：{related.join('、')}。修改协议或地址会影响这些模型。</Notice>}
    {impact && <label className="supplier-check"><Checkbox checked={confirmed} onCheckedChange={checked => setConfirmed(checked === true)}/>我已确认接入变更及关联模型需要重新验证</label>}
    {ops.error && <p role="alert" className="supplier-key-error">{ops.error}</p>}
    <div className="supplier-key-actions"><Button type="button" variant="outline" onClick={cancel}>取消</Button><Button type="submit" disabled={!ops.can}>保存接入地址</Button></div>
  </form></Modal>;
}
