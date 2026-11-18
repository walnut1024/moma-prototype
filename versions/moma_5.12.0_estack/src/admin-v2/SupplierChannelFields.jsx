import ModelFieldLabel from './ModelFieldLabel';
import { useId } from 'react';
import { Button, Input, Radio, RadioGroup, Typography } from '@douyinfe/semi-ui';
import { Field, Choice } from './ServiceUI';
import { SupplierKeyGroupField } from './SupplierKeyGroupField';
import { Notice } from './ModelOperationsUI';
import { CHANNEL_INTERFACES, suggestChannelRoot, modelTaskUrl } from './channel-interface';
import { supplierBaseUrls } from './supplier-resources';

export default function SupplierChannelFields({ state, provider, models, value, rawKey, disabled, editing = false, hideModel = false, nameLabel = '渠道名称', allowSharedKey = true, currentKey = '', current, ops, onChange, onKeyChange, children }) {
  const keyModeId = useId();
  const addresses = [...new Set([...supplierBaseUrls(state, provider), value.baseUrl].filter(Boolean))];
  const interfaceType=value.interfaceType || CHANNEL_INTERFACES.find(row=>row.protocol===value.protocol)?.id;
  const model=models?.find(row=>row.modelId===value.modelId || row.id===value.modelId || row.modelIds?.includes(value.modelId));
  const modelType=model?.master?.type || model?.type;
  const options=modelType && !['text','multimodal'].includes(modelType) ? CHANNEL_INTERFACES.filter(row=>row.id==='openai').map(row=>({...row,label:'OpenAI 兼容 API'})) : CHANNEL_INTERFACES;
  let taskUrl=''; try { if(modelType && interfaceType) taskUrl=modelTaskUrl({interfaceType,baseUrl:value.baseUrl,allowHttp:provider?.sourceType==='selfHosted'},modelType); } catch { /* Incomplete fields are validated on save. */ }
  let suggestedRoot='';
  try { if(interfaceType && interfaceType!=='custom')suggestedRoot=suggestChannelRoot({interfaceType,baseUrl:value.baseUrl,allowHttp:provider?.sourceType==='selfHosted'}); } catch { /* Validate incomplete input on save. */ }
  return <>
    <div className={hideModel ? undefined : 'supplier-channel-fields'}>
      {!hideModel && <Field label="模型 *"><Choice label="模型" value={value.modelId || 'unselected'} options={[[ 'unselected', models.length ? '请选择已有模型' : '请先添加模型' ], ...models.map(item => [editing && item.modelIds?.includes(value.modelId) ? value.modelId : item.modelId, item.name])]} disabled={disabled || editing} onSelect={modelId => onChange({ modelId: modelId==='unselected' ? '' : modelId })}/></Field>}
      <Field label={nameLabel + ' *'}>{nameLabel === '渠道名称'
        ? <Choice label="渠道名称" filter allowCreate value={value.name || undefined} placeholder="选择或自定义渠道名称" inputProps={{ maxLength: 60 }}
          renderCreateItem={name => <span className="semi-select-option">添加自定义渠道名称：{name}</span>}
          options={[...new Set(['官方', '自营', '转售', value.name].filter(Boolean))].map(name => [name, name])}
          disabled={disabled} onChange={name => onChange({ name })}/>
        : <Input autoFocus aria-label={nameLabel} maxLength={60} value={value.name} disabled={disabled} onChange={value => onChange({ name: value })}/>}</Field>
    </div>
    <Field required label={<ModelFieldLabel name="上游模型调用标识"/>}><Input aria-label="上游模型调用标识" maxLength={200} value={value.upstreamModelId} disabled={disabled} placeholder="例如 zhipu/glm-5.3-flash" onChange={value => onChange({ upstreamModelId: value })}/></Field>
    <Field label="上游协议 *"><Choice label="上游协议" value={interfaceType} options={options.map(({ id, label }) => [id, label])} disabled={disabled} onChange={id=>onChange({interfaceType:id,protocol:CHANNEL_INTERFACES.find(row=>row.id===id).protocol})}/></Field>
    <Field label="上游 API 地址 *"><Choice label="上游 API 地址" filter allowCreate value={value.baseUrl || undefined} options={addresses.map(url => [url, url])} disabled={disabled} placeholder={interfaceType==='custom'?'选择或输入完整任务地址':'选择或输入服务商 Base URL'} onChange={baseUrl => onChange({ baseUrl })}/></Field>
    {taskUrl && <Typography.Text type="tertiary" className="supplier-task-url">接口地址：{taskUrl}</Typography.Text>}
    {suggestedRoot && <Notice>识别到完整任务地址。<Button type="tertiary" theme="borderless" disabled={disabled} onClick={()=>onChange({baseUrl:suggestedRoot})}>使用根地址 {suggestedRoot}</Button></Notice>}
    {children}
    <section className="supplier-add-credentials"><Typography.Title heading={5} component="h3">API 密钥来源 *</Typography.Title><div role="radiogroup" aria-label="API 密钥来源"><RadioGroup name={keyModeId} value={value.independent} disabled={disabled} direction="horizontal"
      onChange={event => { onChange({ independent: event.target.value }); onKeyChange(''); }}>
      <Radio value={false} disabled={!allowSharedKey}>服务商 API 密钥池</Radio>
      <Radio value={true}>渠道专属密钥</Radio>
    </RadioGroup></div>{value.independent ? <Field label="渠道专属密钥" hint={editing && currentKey ? '已配置；留空保留，输入新密钥替换' : undefined}><Input mode="password" aria-label="渠道专属密钥" autoComplete="new-password" maxLength={512} value={rawKey} placeholder="请输入 API 密钥" disabled={disabled} onChange={value => onKeyChange(value)}/></Field> : provider && <SupplierKeyGroupField state={state} provider={provider} value={value.keyGroupId} disabled={disabled} current={current} ops={ops} channelId={current?.endpointId} onChange={keyGroupId => onChange({ keyGroupId })}/>}</section>
  </>;
}
