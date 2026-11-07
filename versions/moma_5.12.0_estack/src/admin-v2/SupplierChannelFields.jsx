import ModelFieldLabel from './ModelFieldLabel';
import { useId } from 'react';
import { Button, Input, Radio, RadioGroup, Typography } from '@douyinfe/semi-ui';
import { Field, Choice } from './ModelMetadataForm';
import { SupplierKeyGroupField } from './SupplierKeyGroupField';
import { Notice } from './ModelOperationsUI';
import { CHANNEL_INTERFACES, suggestChannelRoot } from './channel-interface';

export default function SupplierChannelFields({ state, provider, models, value, rawKey, disabled, editing = false, connectionReadOnly = false, currentKey = '', current, ops, onSharedKeySaved, onChange, onKeyChange, children }) {
  const keyModeId = useId();
  const interfaceType=CHANNEL_INTERFACES.find(row=>row.protocol===value.protocol)?.id;
  let suggestedRoot='';
  try { if(interfaceType && interfaceType!=='custom')suggestedRoot=suggestChannelRoot({interfaceType,baseUrl:value.baseUrl,allowHttp:provider?.sourceType==='selfHosted'}); } catch { /* Validate incomplete input on save. */ }
  return <>
    <div className="supplier-channel-fields"><Field label="模型 *"><Choice label="模型" value={value.modelId || 'unselected'} options={[[ 'unselected', models.length ? '请选择已有模型' : '请先添加模型' ], ...models.map(item => [editing && item.modelIds?.includes(value.modelId) ? value.modelId : item.modelId, item.name])]} disabled={disabled || editing} onChange={modelId => onChange({ modelId })}/></Field><Field label="渠道名称 *"><Input autoFocus aria-label="渠道名称" maxLength={60} value={value.name} disabled={disabled || connectionReadOnly} onChange={value => onChange({ name: value })}/></Field></div>
    <Field label={<ModelFieldLabel name="上游模型标识" required/>}><Input aria-label="上游模型标识" maxLength={200} value={value.upstreamModelId} disabled={disabled} placeholder="例如 zhipu/glm-5.3-flash" onChange={value => onChange({ upstreamModelId: value })}/></Field>
    <Field label="上游协议 *"><Choice label="上游协议" value={value.protocol} options={[[ 'OpenAI','OpenAI 兼容' ],[ 'Anthropic','Anthropic' ],[ '其他','自定义任务接口' ]]} disabled={disabled || connectionReadOnly} onChange={protocol=>onChange({protocol})}/></Field>
    <Field label="上游 API 地址 *"><Input aria-label="上游 API 地址" maxLength={2048} value={value.baseUrl} disabled={disabled || connectionReadOnly} placeholder={interfaceType==='custom'?'https://api.example.com/完整任务路径':'https://api.example.com/v1'} onChange={value => onChange({ baseUrl: value })}/></Field>
    {!connectionReadOnly && suggestedRoot && <Notice>识别到完整任务地址。<Button type="tertiary" theme="borderless" disabled={disabled} onClick={()=>onChange({baseUrl:suggestedRoot})}>使用根地址 {suggestedRoot}</Button></Notice>}
    {children}
    {!connectionReadOnly && <section className="supplier-add-credentials"><Typography.Title heading={5} component="h3">API密钥 *</Typography.Title><div role="radiogroup" aria-label="API密钥方式"><RadioGroup name={keyModeId} value={value.independent} disabled={disabled} direction="horizontal"
      onChange={event => { onChange({ independent: event.target.value }); onKeyChange(''); }}>
      <Radio value={false}>共享API密钥</Radio>
      <Radio value={true}>独立API密钥</Radio>
    </RadioGroup></div>{value.independent ? <Field label="API Key" hint={editing && currentKey ? '已配置；留空保留，输入新密钥替换' : undefined}><Input mode="password" aria-label="独立API密钥" autoComplete="new-password" maxLength={512} value={rawKey} placeholder="请输入 API Key" disabled={disabled} onChange={value => onKeyChange(value)}/></Field> : provider && <SupplierKeyGroupField state={state} provider={provider} value={value.keyGroupId} disabled={disabled} current={current} ops={ops} label="共享API密钥组" actionLabel="添加共享 API 密钥" onSaved={onSharedKeySaved} onChange={keyGroupId => onChange({ keyGroupId })}/>}</section>}
  </>;
}
