import { useState } from 'react';
import { Button, Input, Space, TabPane, Tabs, TextArea } from '@douyinfe/semi-ui';
import { Notice } from './ModelOperationsUI';
import { Choice, Field } from './ServiceUI';
import { customForwarding, customTasks, emptyCustomAdapter, normalizeCustomAdapter, parseCustomManagement } from './channel-custom-adapter';

const json = value => JSON.stringify(value, null, 2);
const newRoute = () => ({ task: 'text', match: '', method: 'POST', path: '/v1/chat/completions', conversion: 'native', auth: 'connection' });
const templates = { models: { method: 'GET', path: '/partner/models', auth: 'connection', listPath: '$.data', idPath: '$.id', completePath: '$.complete' },
  balance: { method: 'GET', path: '/partner/balance', auth: 'connection', amountPath: '$.remaining', unitPath: '$.currency', usedPath: '$.used' } };
const responseTemplates = { models: { data: [{ id: 'sample-model' }], complete: true }, balance: { remaining: 125, currency: 'CNY', used: 4 } };
const managementFields = { models: [['listPath', '模型列表路径'], ['idPath', '模型 ID 路径'], ['completePath', '完整列表标志路径']],
  balance: [['amountPath', '金额路径'], ['unitPath', '币种或额度单位路径'], ['usedPath', '已用额度路径']] };

function RequestFields({ value, update, disabled, credentials }) {
  return <div className="channel-operation-fields">
    <Field label="请求方法"><Choice label="请求方法" value={value.method} disabled={disabled}
      options={[[ 'GET', 'GET' ], [ 'POST', 'POST' ]]} onChange={method => update({ method })}/></Field>
    <Field label="上游接口路径"><Input aria-label="上游接口路径" value={value.path || ''} disabled={disabled} onChange={path => update({ path })}/></Field>
    <Field label="认证方式"><Choice label="认证方式" value={value.auth || 'connection'} disabled={disabled}
      options={[[ 'connection', '连接凭证' ], [ 'header', '使用指定请求头' ], [ 'none', '无需认证' ],
        ...(credentials ? [['credential', '独立凭证']] : [])]} onChange={auth => update({ auth, credentialId: auth === 'credential' ? value.credentialId : undefined })}/></Field>
    {value.auth === 'header' && <Field label="认证头字段名"><Input aria-label="认证头字段名" value={value.header || ''} placeholder="x-api-key"
      disabled={disabled} onChange={header => update({ header })}/></Field>}
    {value.auth === 'credential' && <Field label="独立凭证"><Choice label="独立凭证" disabled={disabled}
      value={value.credentialId || 'unselected'} options={[[ 'unselected', '请选择已启用的服务商凭证' ],
        ...(credentials || []).map(key => [key.id, key.maskedKey])]}
      onChange={credentialId => update({ credentialId: credentialId === 'unselected' ? undefined : credentialId })}/></Field>}
  </div>;
}

export default function ChannelCustomAdapterEditor({ text, onChange, baseUrl, model, disabled, credentials = [] }) {
  const [tab, setTab] = useState('routes'), [error, setError] = useState(''), [preview, setPreview] = useState(null);
  const [sample, setSample] = useState(''), [modelName, setModelName] = useState(model || 'sample-model'), [task, setTask] = useState('text');
  let config;
  try {
    const parsed = JSON.parse(text) || emptyCustomAdapter;
    if (Array.isArray(parsed.routes) && parsed.routes.every(row => row && typeof row === 'object')) config = parsed;
  } catch { /* Invalid source remains available in the JSON tab. */ }
  const raw = value => { onChange(value); setError(''); setPreview(null); };
  const change = patch => raw(json({ ...config, ...patch }));
  const check = format => {
    try {
      const checked = normalizeCustomAdapter(JSON.parse(text));
      if (format) raw(json(checked || emptyCustomAdapter));
      else if (tab === 'routes') {
        const result = customForwarding(checked, { baseUrl }, task, modelName);
        if (!result) throw Error('没有匹配此模型和任务的转发规则');
        const { method, url, conversion, auth, header, idPath, statusPath, credentialId } = result;
        const key = credentials.find(item => item.id === credentialId);
        if (auth === 'credential' && !key) throw Error('接口独立凭证已不可用');
        setPreview({ method, url, conversion, authentication: auth === 'none' ? '无需认证' :
          { header: header || '连接默认认证', value: key?.maskedKey || '••••••••' }, idPath, statusPath });
      } else setPreview(parseCustomManagement(checked || emptyCustomAdapter, tab, JSON.parse(sample)));
      setError('');
    } catch (failure) { setError(failure.message); setPreview(null); }
  };
  const list = config?.routes || [];
  const switchTab = key => { setTab(key); setError(''); setPreview(null); setSample(responseTemplates[key] ? json(responseTemplates[key]) : ''); };
  return <section className="supplier-change-section">
    <Tabs activeKey={tab} onChange={switchTab}>
      <TabPane tab="请求转发" itemKey="routes">
        {config && <>
          <Button theme="light" disabled={disabled || list.length >= 30} onClick={() => change({ routes: [...list, newRoute()] })}>添加转发接口</Button>
          {list.map((row, index) => {
            const update = patch => change({ routes: list.map((item, at) => at === index ? { ...item, ...patch } : item) });
            const move = offset => {
              const copy = [...list];
              [copy[index + offset], copy[index]] = [copy[index], copy[index + offset]];
              change({ routes: copy });
            };
            return <section className="supplier-change-section" key={index} aria-label={'转发规则 ' + (index + 1)}>
              <Space wrap>
                <Button size="small" disabled={disabled || index === 0} onClick={() => move(-1)}>上移</Button>
                <Button size="small" disabled={disabled || index === list.length - 1} onClick={() => move(1)}>下移</Button>
                <Button size="small" type="danger" disabled={disabled} onClick={() => change({ routes: list.filter((_, at) => at !== index) })}>删除</Button>
              </Space>
              <div className="channel-operation-fields">
                <Field label="平台接口"><Choice label="平台接口" value={row.task} options={customTasks} disabled={disabled} onChange={task => update({ task })}/></Field>
                <Field label="模型匹配"><Input aria-label="模型匹配" value={row.match || ''} placeholder="例如 kimi-*，留空为最后兜底" disabled={disabled} onChange={match => update({ match })}/></Field>
                <Field label="适配方式"><Choice label="适配方式" value={row.conversion} options={[[ 'native', '原生转发' ], [ 'task', '异步任务' ]]}
                  disabled={disabled} onChange={conversion => update({ conversion })}/></Field>
              </div>
              <RequestFields value={row} update={update} disabled={disabled} credentials={credentials}/>
              {row.conversion === 'task' && <div className="channel-operation-fields">
                <Field label="返回任务 ID 路径"><Input aria-label="返回任务 ID 路径" value={row.idPath || ''} placeholder="$.id" disabled={disabled} onChange={idPath => update({ idPath })}/></Field>
                <Field label="任务状态查询路径"><Input aria-label="任务状态查询路径" value={row.statusPath || ''} placeholder="/api/jobs/{id}" disabled={disabled} onChange={statusPath => update({ statusPath })}/></Field>
              </div>}
            </section>;
          })}
        </>}
        <div className="channel-operation-fields">
          <Field label="预览任务"><Choice label="预览任务" value={task} options={customTasks} onChange={setTask}/></Field>
          <Field label="预览模型标识"><Input aria-label="预览模型标识" value={modelName} onChange={setModelName}/></Field>
        </div>
        <Button theme="light" onClick={() => check(false)}>预览转发请求</Button>
      </TabPane>
      {[['models', '模型列表'], ['balance', '余额查询']].map(([key, title]) => <TabPane key={key} tab={title} itemKey={key}>
        {config?.[key] ? <>
          <RequestFields value={config[key]} update={patch => change({ [key]: { ...config[key], ...patch } })} disabled={disabled}/>
          {managementFields[key].map(([field, label]) => <Field label={label} key={field}><Input aria-label={label} value={config[key][field] || ''}
            disabled={disabled} onChange={value => change({ [key]: { ...config[key], [field]: value } })}/></Field>)}
          <Button theme="light" disabled={disabled} onClick={() => change({ [key]: null })}>移除此管理接口</Button>
          <Field label="上游响应样例"><TextArea aria-label="上游响应样例" value={sample} autosize={{ minRows: 5, maxRows: 10 }} onChange={setSample}/></Field>
          <Button theme="light" onClick={() => check(false)}>检查示例响应</Button>
        </> : <Button theme="light" disabled={disabled || !config} onClick={() => change({ [key]: templates[key] })}>添加{title}接口</Button>}
      </TabPane>)}
      <TabPane tab="完整 JSON" itemKey="json">
        <Field label="自定义接口 JSON"><TextArea aria-label="自定义接口 JSON" value={text} autosize={{ minRows: 7, maxRows: 18 }} disabled={disabled} onChange={raw}/></Field>
        <Button theme="light" disabled={disabled} onClick={() => check(true)}>校验并格式化 JSON</Button>
      </TabPane>
    </Tabs>
    {!config && <Notice error>请在完整 JSON 页签修正自定义接口配置。</Notice>}
    {error && <Notice error>{error}</Notice>}
    {preview && <pre aria-label="自定义接口预览">{json(preview)}</pre>}
  </section>;
}
