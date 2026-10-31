import { Input } from '../components/ui/input';
import { Choice, Field } from './ModelMetadataForm';
import { MODEL_TYPES } from './model-management';

export default function ChannelAdvancedFields({ value, onChange, disabled = false }) {
  const options = value.adapterOptions || {};
  const set = (key, input) => onChange({ adapterOptions: { ...options, [key]: input } });
  const setTask = (type, input) => { const taskUrls = { ...value.taskUrls }; if (input.trim()) taskUrls[type] = input; else delete taskUrls[type]; onChange({ taskUrls }); };
  return <details><summary>高级连接设置</summary><div className="supplier-channel-fields">
    <Field label="请求超时（秒）"><Input aria-label="请求超时" type="number" min={1} max={600} value={value.timeoutSeconds ?? 60} disabled={disabled} onChange={event => onChange({ timeoutSeconds: event.target.value })}/></Field>
    <Field label="账号请求上限（RPM）"><Input aria-label="账号请求上限" type="number" min={1} placeholder="未配置" value={value.capacity ?? ''} disabled={disabled} onChange={event => onChange({ capacity: event.target.value })}/></Field>
    {value.interfaceType === 'anthropic' && <><Field label="接口版本"><Input aria-label="接口版本" placeholder="使用接口预设版本" value={options.apiVersion || ''} disabled={disabled} onChange={event => set('apiVersion', event.target.value)}/></Field><Field label="工作区 ID"><Input aria-label="工作区 ID" value={options.workspaceId || ''} disabled={disabled} onChange={event => set('workspaceId', event.target.value)}/></Field></>}
    {value.interfaceType === 'openai' && <Field label="输出上限字段"><Choice label="输出上限字段" value={options.tokenLimitField || 'max_completion_tokens'} options={[[ 'max_completion_tokens', 'max_completion_tokens' ], [ 'max_tokens', 'max_tokens' ]]} disabled={disabled} onChange={input => set('tokenLimitField', input)}/></Field>}
    <Field label="图片测试尺寸"><Choice label="图片测试尺寸" value={options.imageSize || '1024x1024'} options={['auto', '256x256', '512x512', '1024x1024', '1536x1024', '1024x1536'].map(size => [size, size])} disabled={disabled} onChange={input => set('imageSize', input)}/></Field>
    <Field label="语音测试音色"><Input aria-label="语音测试音色" value={options.voice || ''} placeholder="使用接口预设音色" disabled={disabled} onChange={event => set('voice', event.target.value)}/></Field>
    {value.interfaceType === 'custom' && <Field label="视频状态查询路径"><Input aria-label="视频状态查询路径" placeholder="/tasks/{id}" value={options.statusPath || ''} disabled={disabled} onChange={event => set('statusPath', event.target.value)}/></Field>}
  </div>{value.interfaceType === 'custom' && <div className="supplier-channel-fields">{Object.entries(MODEL_TYPES).map(([type, label]) => <Field label={`${label}任务地址`} key={type}><Input aria-label={`${label}任务地址`} value={value.taskUrls?.[type] || ''} placeholder="使用完整任务地址" disabled={disabled} onChange={event => setTask(type, event.target.value)}/></Field>)}</div>}</details>;
}
