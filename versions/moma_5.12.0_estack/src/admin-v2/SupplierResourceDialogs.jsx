import SupplierCreationDialog from './SupplierCreationDialog';
import { supplierDirectory } from './moma-provider';
import SupplyModelPicker from './SupplyModelPicker';
import { useState } from 'react';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
import { Choice, Field } from './ModelMetadataForm';
import { Modal, Notice, Status } from './ModelOperationsUI';
import { supplierChannelAssociations, supplierChannelCode, supplierChannelName } from './supplier-resources';
import { connectionCredentialsReady, connectionTestPassed } from './connection-state';
import { cataloguePriceDraft } from './provider-catalogue-pricing';
import { PROTOCOLS } from './provider-management';
import { modelApiExample } from './provider-channels';
import SupplierPriceFields from './SupplierPriceFields';
import { SupplierKeyGroupField } from './SupplierKeyGroupField';

export function SupplierModelEditor({ state, provider, ops, close, onBatch }) {
  const [libraryId, setLibraryId] = useState(''), [providerId, setProviderId] = useState(provider?.id || 'unselected');
  const providers = supplierDirectory(state).filter(row => !row.id.startsWith('service-review-provider-'));
  const change = setter => value => { setter(value); ops.dirty(true); ops.setError(''); };
  return <SupplierCreationDialog title="添加模型" description="从统一模型资料库选择模型，并关联供应商。" cancel={() => ops.proceed(close)} disabled={!ops.can || !libraryId || !providers.some(row => row.id === providerId)} action="登记模型" submit={() => { if (ops.run('provider', { operation: 'supplierModelAdd', objectId: providerId, values: { libraryId } })) close(libraryId); }}>
    <div className="supplier-channel-fields"><Field label="模型 *"><SupplyModelPicker ops={ops} state={state} value={libraryId} disabled={!ops.can} onChange={change(setLibraryId)}/></Field><Field label="供应商 *"><Choice label="供应商" value={providerId} options={[[ 'unselected', '请选择供应商' ], ...providers.map(row => [row.id, row.name])]} disabled={!ops.can} onChange={change(setProviderId)}/></Field></div>
    <p className="supplier-price-hint">登记该供应商提供的模型，可稍后添加渠道。接入调用可直接使用「添加渠道」。{onBatch && <Button type="button" variant="link" disabled={!ops.can || !providers.some(row => row.id === providerId)} onClick={() => ops.proceed(() => onBatch(providerId))}>批量添加模型</Button>}</p>
    {ops.error && <Notice error>{ops.error}</Notice>}
  </SupplierCreationDialog>;
}

export function SupplierChannelDialog({ state, provider, endpoint, ops, close, done = close, mode = 'all' }) {
  const all = mode === 'all', info = all || mode === 'info', address = all || mode === 'address', credentials = all || mode === 'credentials';
  const [value, setValue] = useState(() => ({ name: endpoint ? supplierChannelName(provider, endpoint) : '', protocol: endpoint?.protocol || 'OpenAI', baseUrl: endpoint?.baseUrl || '', authMode: endpoint?.authMode || (endpoint?.apiKeys?.length ? 'specific' : 'inherit'), apiKeyId: endpoint?.apiKeyId || endpoint?.apiKeys?.[0]?.id || '', keyGroupId: endpoint?.keyGroupId || 'default' }));
  const [confirming, setConfirming] = useState(false), [deleting, setDeleting] = useState(false);
  const refs = endpoint ? supplierChannelAssociations(state, provider, endpoint.id) : [];
  const set = patch => { setValue({ ...value, ...patch }); ops.dirty(true); ops.setError(''); };
  const changed = endpoint && (address && (endpoint.baseUrl !== value.baseUrl.trim() || endpoint.protocol !== value.protocol) || credentials && (endpoint.authMode !== value.authMode || (endpoint.apiKeyId || '') !== (value.authMode === 'specific' ? value.apiKeyId : '') || credentials && endpoint.keyGroupId !== (value.authMode === 'group' ? value.keyGroupId : endpoint.keyGroupId)));
  const save = confirmed => { const next = ops.run('provider', { operation: 'supplierChannelSave', objectId: provider.id, values: { ...value, mode, endpointId: endpoint?.id, confirmed } }); if (next) { const saved = endpoint ? next.endpoints.find(row => row.id === endpoint.id) : next.endpoints.find(row => row.providerId === provider.id && row.name === value.name.trim() && row.supplierChannel); done(saved); } else if (confirmed) setConfirming(false); };
  const title = all ? endpoint ? `编辑渠道 · ${supplierChannelCode(endpoint)}` : '添加渠道' : { info: '渠道信息', address: 'API 地址', credentials: 'API 密钥' }[mode];
  return <><Modal drawer={mode !== 'info'} wide={mode !== 'info'} title={title} description={`${provider.name}${endpoint ? ` · ${supplierChannelCode(endpoint)}` : ''}`} onClose={() => ops.proceed(close)}><form className="supplier-resource-form" noValidate onSubmit={event => { event.preventDefault(); event.stopPropagation(); if (changed && refs.length) setConfirming(true); else save(false); }}>
    {mode === 'info' && <Field label="渠道 ID"><Input aria-label="渠道 ID" value={supplierChannelCode(endpoint)} readOnly/></Field>}
    {(info || address) && <div className={all ? 'supplier-channel-fields' : undefined}>
      {info && <Field label="渠道名称 *"><Input aria-label="渠道名称" value={value.name} maxLength={60} disabled={!ops.can} onChange={event => set({ name: event.target.value })}/></Field>}
      {address && <Field label="协议 *"><Choice label="渠道协议" value={value.protocol} options={PROTOCOLS.map(id => [id, id === 'OpenAI' ? 'OpenAI 兼容接口' : id])} disabled={!ops.can} onChange={protocol => set({ protocol })}/></Field>}
    </div>}
    {address && <Field label="API 地址 *" hint="填写完整调用地址。"><Input aria-label="渠道 API 地址" value={value.baseUrl} maxLength={2048} placeholder={modelApiExample(provider.catalogModels?.find(row => row.modelId === refs[0]?.modelId)?.type)} disabled={!ops.can} onChange={event => set({ baseUrl: event.target.value })}/></Field>}
    {credentials && <SupplierKeyGroupField ops={ops} state={state} provider={provider} value={value.authMode === 'group' ? value.keyGroupId : 'current'} current={value.authMode !== 'group' ? { name: value.authMode === 'none' ? '无需认证' : value.authMode === 'inherit' ? '当前供应商默认密钥' : '当前指定密钥 · ' + (value.apiKeyId || '凭证引用'), ready: connectionCredentialsReady(endpoint, provider) } : null} disabled={!ops.can} onChange={keyGroupId => set({ authMode: 'group', keyGroupId })}/>} 
    {all && <section><h3>引用此渠道的供应模型（{refs.length}）</h3>{refs.length ? <ul className="supplier-reference-list">{refs.map(row => <li key={row.id}><strong>{row.modelId}</strong><span>上游 ID：{row.upstreamModelId}</span></li>)}</ul> : <p className="supplier-price-hint">暂未关联模型。渠道保存后，可在模型及渠道中建立关联。</p>}<p className="supplier-price-hint">上游 Model ID 和供应商售价在模型与渠道的关联中维护。</p></section>}
    {changed && <Notice>当前渠道配置尚未保存，请保存后再测试连接。</Notice>}
    {all && endpoint && <section className="supplier-resource-test"><Status good={!changed && connectionTestPassed(endpoint)}>{changed ? '配置待保存' : connectionTestPassed(endpoint) ? '连接测试通过' : connectionCredentialsReady(endpoint, provider) ? '待测试' : '凭证未配置'}</Status><Button type="button" variant="outline" disabled={!ops.can || changed || !connectionCredentialsReady(endpoint, provider)} onClick={() => ops.run('provider', { operation: 'supplierChannelTest', objectId: provider.id, values: { endpointId: endpoint.id } })}>测试连接</Button>{endpoint.status !== '运行中' && <Button type="button" variant="outline" disabled={!ops.can || changed || !connectionTestPassed(endpoint)} onClick={() => ops.run('provider', { operation: 'supplierChannelEnable', objectId: provider.id, values: { endpointId: endpoint.id } })}>启用渠道</Button>}</section>}
    {ops.error && <Notice error>{ops.error}</Notice>}
    <footer className="supplier-channel-footer">{all && endpoint && <Button type="button" variant="destructive" disabled={!ops.can} onClick={() => setDeleting(true)}>删除渠道</Button>}<span/><Button type="button" variant="outline" onClick={() => ops.proceed(close)}>取消</Button><Button type="submit" disabled={!ops.can}>{all ? '保存渠道' : mode === 'info' ? '保存渠道信息' : `保存 ${title}`}</Button></footer>
  </form></Modal>
    {confirming && <Modal title="确认共享渠道变更" description="所有引用此渠道的模型都将需要重新测试。" onClose={() => setConfirming(false)}><p>影响 {refs.length} 条模型关联：{refs.map(row => row.modelId).join('、')}。服务售价和路由配置保留。</p><div className="supplier-key-actions"><Button variant="outline" onClick={() => setConfirming(false)}>继续编辑</Button><Button disabled={!ops.can} onClick={() => save(true)}>确认保存</Button></div></Modal>}
    {deleting && <Modal title="删除供应渠道" description={endpoint.name} onClose={() => setDeleting(false)}><p>有关联模型或服务时不能删除；请先解除关联。</p>{ops.error && <Notice error>{ops.error}</Notice>}<div className="supplier-key-actions"><Button variant="outline" onClick={() => setDeleting(false)}>取消删除</Button><Button variant="destructive" disabled={!ops.can} onClick={() => { if (ops.run('provider', { operation: 'supplierChannelDelete', objectId: provider.id, values: { endpointId: endpoint.id, confirmed: true } })) close(); }}>确认删除</Button></div></Modal>}
  </>;
}

export function SupplierAssociationDialog({ state, provider, modelId, association, ops, close }) {
  const [scenarios, setScenarios] = useState(() => cataloguePriceDraft(association.pricing).scenarios);
  return <Modal drawer wide title="渠道售价" description={provider.name + ' · ' + modelId + ' · ' + supplierChannelName(provider, association.endpoint)} onClose={() => ops.proceed(close)}><form className="supplier-resource-form" noValidate onSubmit={event => { event.preventDefault(); if (ops.run('provider', { operation: 'supplierAssociationSave', objectId: provider.id, values: { modelId, endpointId: association.endpointId, associationId: association.id, upstreamModelId: association.upstreamModelId, scenarios } })) close(); }}>
    <SupplierPriceFields ops={ops} state={state} scenarios={scenarios} disabled={!ops.can} onChange={next => { setScenarios(next); ops.dirty(true); ops.setError(''); }}/>
    {ops.error && <Notice error>{ops.error}</Notice>}
    <footer className="supplier-channel-footer"><Button type="button" variant="outline" onClick={() => ops.proceed(close)}>取消</Button><Button type="submit" disabled={!ops.can}>保存渠道售价</Button></footer>
  </form></Modal>;
}

