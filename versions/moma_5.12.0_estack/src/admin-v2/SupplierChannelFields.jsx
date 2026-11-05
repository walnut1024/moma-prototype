import ModelFieldLabel from './ModelFieldLabel';
import { useId } from 'react';
import { Input } from '../components/ui/input';
import { Field, Choice } from './ModelMetadataForm';
import SupplierPriceFields from './SupplierPriceFields';
import { SupplierKeyGroupField } from './SupplierKeyGroupField';
import { Button } from '../components/ui/button';
import { Notice } from './ModelOperationsUI';
import { CHANNEL_INTERFACES, suggestChannelRoot } from './channel-interface';

export default function SupplierChannelFields({ state, provider, models, value, rawKey, disabled, editing = false, currentKey = '', current, ops, onSharedKeySaved, onChange, onKeyChange, children }) {
  const keyModeId = useId();
  const interfaceType=CHANNEL_INTERFACES.find(row=>row.protocol===value.protocol)?.id;
  let suggestedRoot='';
  try { if(interfaceType && interfaceType!=='custom')suggestedRoot=suggestChannelRoot({interfaceType,baseUrl:value.baseUrl,allowHttp:provider?.sourceType==='selfHosted'}); } catch { /* Validate incomplete input on save. */ }
  return <>
    <div className="supplier-channel-fields"><Field label="模型 *"><Choice label="模型" value={value.modelId || 'unselected'} options={[[ 'unselected', models.length ? '请选择已有模型' : '请先添加模型' ], ...models.map(item => [editing && item.modelIds?.includes(value.modelId) ? value.modelId : item.modelId, item.name])]} disabled={disabled || editing} onChange={modelId => onChange({ modelId })}/></Field><Field label="渠道名称 *"><Input autoFocus aria-label="渠道名称" maxLength={60} value={value.name} disabled={disabled} onChange={event => onChange({ name: event.target.value })}/></Field></div>
    <Field label={<ModelFieldLabel name="上游模型标识" required/>}><Input aria-label="上游模型标识" maxLength={200} value={value.upstreamModelId} disabled={disabled} placeholder="例如 zhipu/glm-5.3-flash" onChange={event => onChange({ upstreamModelId: event.target.value })}/></Field>
    <Field label="上游协议 *"><Choice label="上游协议" value={value.protocol} options={[[ 'OpenAI','OpenAI 兼容' ],[ 'Anthropic','Anthropic' ],[ '其他','自定义任务接口' ]]} disabled={disabled} onChange={protocol=>onChange({protocol})}/></Field>
    <Field label="上游 API 地址 *"><Input aria-label="上游 API 地址" maxLength={2048} value={value.baseUrl} disabled={disabled} placeholder={interfaceType==='custom'?'https://api.example.com/完整任务路径':'https://api.example.com/v1'} onChange={event => onChange({ baseUrl: event.target.value })}/></Field>
    {suggestedRoot && <Notice>识别到完整任务地址。<Button type="button" variant="link" disabled={disabled} onClick={()=>onChange({baseUrl:suggestedRoot})}>使用根地址 {suggestedRoot}</Button></Notice>}
    {children}
    <section className="supplier-add-credentials"><h3>API密钥 *</h3><div className="mm-checkbox-row" role="radiogroup" aria-label="API密钥方式">{[[false, '共享API密钥'], [true, '独立API密钥']].map(([independent, label]) => <label key={label}><input type="radio" name={keyModeId} checked={value.independent === independent} disabled={disabled} onChange={() => { onChange({ independent }); onKeyChange(''); }}/>{label}</label>)}</div>{value.independent ? <Field label="API Key" hint={editing && currentKey ? '已配置；留空保留，输入新密钥替换' : undefined}><Input type="password" aria-label="独立API密钥" autoComplete="new-password" maxLength={512} value={rawKey} placeholder="请输入 API Key" disabled={disabled} onChange={event => onKeyChange(event.target.value)}/></Field> : provider && <SupplierKeyGroupField state={state} provider={provider} value={value.keyGroupId} disabled={disabled} current={current} ops={ops} label="共享API密钥组" actionLabel="添加共享 API 密钥" onSaved={onSharedKeySaved} onChange={keyGroupId => onChange({ keyGroupId })}/>}</section>
    <SupplierPriceFields state={state} scenarios={value.scenarios} disabled={disabled} separateCurrency batchOnly title="采购成本 *" onChange={scenarios => onChange({ scenarios })}/>
  </>;
}
