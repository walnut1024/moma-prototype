import { useState } from 'react';
import { Plus, Trash2 } from 'lucide-react';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from '../components/ui/table';
import SupplierCreationDialog from './SupplierCreationDialog';
import { Choice, Field } from './ModelMetadataForm';
import { Notice } from './ModelOperationsUI';
import { supplierDirectory } from './moma-provider';
import { libraryRecord } from './model-library';
import SupplyModelPicker from './SupplyModelPicker';
import SupplierPriceFields from './SupplierPriceFields';
import { SupplierKeyGroupField } from './SupplierKeyGroupField';
import { CHANNEL_INTERFACES, prepareChannelInterface } from './channel-interface';
import SupplierChannelBatchTest from './SupplierChannelBatchTest';

const modelRow = (state, libraryId = '') => ({ id: crypto.randomUUID(), libraryId, upstreamModelId: libraryRecord(state, libraryId)?.modelId || '', scenarios: [] });

export default function SupplierChannelConfiguration({ state, provider: initialProvider, libraryId = '', endpoint, ops, close }) {
  const [value, setValue] = useState({ providerId: initialProvider?.id || 'unselected', name: '', interfaceType: initialProvider?.defaultProtocol?.includes('Anthropic') ? 'anthropic' : initialProvider?.defaultProtocol?.includes('OpenAI') ? 'openai' : 'unselected', baseUrl: '', keyGroupId: 'default' });
  const [rows, setRows] = useState(() => [modelRow(state, endpoint ? '' : libraryId)]);
  const [step, setStep] = useState(endpoint ? 1 : 0), [saved, setSaved] = useState(null), [priceRow, setPriceRow] = useState(null), [suggestedRoot, setSuggestedRoot] = useState('');
  const providers = supplierDirectory(state).filter(row => !row.id.startsWith('service-review-provider-'));
  const provider = providers.find(row => row.id === (endpoint?.providerId || value.providerId));
  const set = patch => { setValue(current => ({ ...current, ...patch })); ops.dirty(true); ops.setError(''); setSuggestedRoot(''); };
  const setRow = (id, patch) => { setRows(current => current.map(row => row.id === id ? { ...row, ...patch } : row)); ops.dirty(true); ops.setError(''); };
  const cancel = () => ops.proceed(close);
  const connection = () => prepareChannelInterface({ interfaceType: value.interfaceType, baseUrl: value.baseUrl, allowHttp: provider?.sourceType === 'selfHosted' });
  const next = () => {
    try {
      if (!provider) throw new Error('请选择供应商');
      if (!value.name.trim()) throw new Error('请填写渠道名称');
      connection(); setStep(1); ops.setError('');
    } catch (error) { ops.setError(error.message); setSuggestedRoot(error.suggestedBaseUrl || ''); }
  };
  const save = () => {
    try {
      if (!provider) throw new Error('供应商已变化，请重新选择');
      for (const [index, row] of rows.entries()) {
        if (!libraryRecord(state, row.libraryId) || !row.upstreamModelId.trim()) throw new Error(`第 ${index + 1} 行：请选择模型资料并填写上游模型 ID`);
      }
      const models = rows.map(({ libraryId, upstreamModelId, scenarios }) => ({ libraryId, upstreamModelId, scenarios }));
      const values = endpoint ? { endpointId: endpoint.id, models } : { ...value, ...connection(), models };
      const result = ops.run('provider', { operation: endpoint ? 'supplierModelsAdd' : 'supplierChannelCreate', objectId: provider.id, values });
      if (!result) return;
      const channel = endpoint || result.endpoints.find(row => row.providerId === provider.id && row.name === value.name.trim() && !row.deletedAt);
      const owner = result.providers.find(row => row.id === provider.id);
      const upstreamIds = new Set(models.map(row => row.upstreamModelId.trim()));
      setSaved({ endpointId: channel.id, associationIds: owner.catalogConnections.filter(row => row.endpointId === channel.id && !row.deletedAt && upstreamIds.has(row.upstreamModelId)).map(row => row.id) });
      setStep(2); setPriceRow(null);
    } catch (error) { ops.setError(error.message); }
  };
  if (saved) return <SupplierChannelBatchTest state={state} provider={provider} endpointId={saved.endpointId} associationIds={saved.associationIds} ops={ops} close={() => close(libraryId)} />;
  return <SupplierCreationDialog title={endpoint ? '添加关联模型' : '添加渠道'} description="配置连接、选择模型并测试，确认后单独启用。" cancel={cancel} disabled={!ops.can || !provider} action={step === 0 ? '下一步' : '保存并测试'} submit={step === 0 ? next : save} footer={step === 1 && !endpoint ? <Button type="button" variant="outline" onClick={() => { setStep(0); ops.setError(''); }}>上一步</Button> : null}>
    <ol className="supplier-onboarding-steps" aria-label="接入步骤">{['配置连接', '选择模型', '测试与启用'].map((label, index) => <li key={label} aria-current={index === step ? 'step' : undefined}><span>{index + 1}</span>{label}</li>)}</ol>
    {step === 0 ? <>
      <div className="supplier-channel-fields"><Field label="供应商 *"><Choice label="供应商" value={value.providerId} options={[[ 'unselected', '请选择供应商' ], ...providers.map(row => [row.id, row.name])]} disabled={!ops.can} onChange={providerId => ops.proceed(() => { setValue(current => ({ ...current, providerId, name: '', interfaceType: 'unselected', baseUrl: '', keyGroupId: 'default' })); setRows(current => current.map(row => ({ ...row, upstreamModelId: libraryRecord(state, row.libraryId)?.modelId || '', scenarios: [] }))); ops.dirty(true); ops.setError(''); })}/></Field><Field label="渠道名称 *"><Input aria-label="渠道名称" value={value.name} placeholder="请输入新渠道名称" maxLength={60} disabled={!ops.can} onChange={event => set({ name: event.target.value })}/></Field></div>
      <div className="supplier-channel-fields"><Field label="接口类型 *"><Choice label="接口类型" value={value.interfaceType} options={[[ 'unselected', '请选择接口类型' ], ...CHANNEL_INTERFACES.map(item => [item.id, item.label])]} disabled={!ops.can} onChange={interfaceType => value.baseUrl ? ops.proceed(() => set({ interfaceType, baseUrl: '' })) : set({ interfaceType, baseUrl: '' })}/></Field><Field label="渠道 ID"><Input aria-label="渠道 ID" value="保存后自动生成" readOnly/></Field></div>
      <Field label={value.interfaceType === 'custom' ? '完整任务地址 *' : '服务根地址 *'}><Input aria-label="渠道 API 地址" maxLength={2048} placeholder={value.interfaceType === 'custom' ? 'https://gateway.example.com/完整接口路径' : 'https://gateway.example.com/v1'} value={value.baseUrl} disabled={!ops.can} onChange={event => set({ baseUrl: event.target.value })}/></Field>
      {suggestedRoot && <Notice>识别到完整任务地址。<Button type="button" variant="link" onClick={() => set({ baseUrl: suggestedRoot })}>使用根地址 {suggestedRoot}</Button></Notice>}
      {provider && <SupplierKeyGroupField ops={ops} state={state} provider={provider} value={value.keyGroupId} disabled={!ops.can} onChange={keyGroupId => set({ keyGroupId })}/>}
    </> : <>
      <div className="supplier-onboarding-context"><strong>{provider?.name}</strong><span>{endpoint?.name || value.name}</span><code>{endpoint?.baseUrl || value.baseUrl}</code></div>
      <div className="mo-table-scroll"><Table className="supplier-onboarding-models"><TableHeader><TableRow><TableHead>模型资料</TableHead><TableHead>上游模型 ID</TableHead><TableHead>采购价</TableHead><TableHead>操作</TableHead></TableRow></TableHeader><TableBody>{rows.map((row, index) => <TableRow key={row.id}><TableCell><SupplyModelPicker ops={ops} state={state} value={row.libraryId} disabled={!ops.can} onChange={libraryId => setRow(row.id, { libraryId, upstreamModelId: libraryRecord(state, libraryId)?.modelId || '', scenarios: [] })}/></TableCell><TableCell><Input aria-label={`第 ${index + 1} 行上游模型 ID`} value={row.upstreamModelId} maxLength={200} disabled={!ops.can} onChange={event => setRow(row.id, { upstreamModelId: event.target.value })}/></TableCell><TableCell>{row.scenarios.length ? `${row.scenarios.length} 个计费项` : '待配置'}</TableCell><TableCell><div className="supplier-row-actions"><Button type="button" variant="link" disabled={!ops.can} onClick={() => setPriceRow(priceRow === row.id ? null : row.id)}>配置采购价</Button><Button type="button" variant="ghost" size="icon-sm" aria-label={`移除模型行 ${index + 1}`} disabled={!ops.can || rows.length === 1} onClick={() => { setRows(current => current.filter(item => item.id !== row.id)); ops.dirty(true); }}><Trash2/></Button></div></TableCell></TableRow>)}</TableBody></Table></div>
      <div className="supplier-row-actions"><Button type="button" variant="outline" disabled={!ops.can || rows.length >= 50} onClick={() => { setRows(current => [...current, modelRow(state)]); ops.dirty(true); }}><Plus/>添加模型行</Button><span className="supplier-price-hint">已选 {rows.length} 个模型；采购价可稍后配置。</span></div>
      {rows.filter(row => row.id === priceRow).map(row => <SupplierPriceFields key={row.id} ops={ops} state={state} scenarios={row.scenarios} disabled={!ops.can} onChange={scenarios => setRow(row.id, { scenarios })}/>)}
    </>}
    {ops.error && <Notice error>{ops.error}</Notice>}
  </SupplierCreationDialog>;
}
