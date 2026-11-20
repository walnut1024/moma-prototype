import { useState } from 'react';
import { Button, Checkbox, CheckboxGroup, Input, Space, TextArea, Typography } from '@douyinfe/semi-ui';
import { Notice } from './ModelOperationsUI';
import { Choice, Field } from './ServiceUI';
import { channelDemoPlugins, channelFieldControls, emptyChannelRules, normalizeChannelRequestRules, previewChannelRequestRules, RULE_CONDITION_MODES, RULE_MODES } from './channel-request-rules';

const json = value => JSON.stringify(value, null, 2);
const shown = value => typeof value === 'string' ? value : JSON.stringify(value) ?? '';
const inputValue = value => { try { return JSON.parse(value); } catch { return value; } };
const newRule = () => ({ mode: 'set', path: '', value: '', logic: 'AND', conditions: [] });
const newCondition = () => ({ path: 'model', mode: 'full', value: '' });
const replaceAt = (rows, index, row) => rows.map((value, at) => at === index ? row : value);

function RulePairs({ title, names, values, disabled, onChange }) {
  const [name, setName] = useState(''), [value, setValue] = useState('');
  return <section className="supplier-change-section">
    <Typography.Title heading={5}>{title}</Typography.Title>
    {Object.entries(values).map(([field, configured]) => <div className="supplier-row-actions" key={field}>
      <Typography.Text code>{field} → {shown(configured)}</Typography.Text>
      <Button size="small" theme="borderless" disabled={disabled}
        aria-label={'移除 ' + field} onClick={() => onChange(Object.fromEntries(Object.entries(values).filter(([key]) => key !== field)))}>移除</Button>
    </div>)}
    <Space wrap>
      <Input aria-label={names[0]} placeholder={names[0]} value={name} maxLength={100} onChange={setName} disabled={disabled}/>
      <Input aria-label={names[1]} placeholder={names[1]} value={value} maxLength={500} onChange={setValue} disabled={disabled}/>
      <Button theme="light" disabled={disabled || !name.trim() || !value.trim()}
        onClick={() => { if (onChange({ ...values, [name.trim()]: value.trim() })) { setName(''); setValue(''); } }}>
        {Object.hasOwn(values, name.trim()) ? '更新' : '添加'}
      </Button>
    </Space>
  </section>;
}

export function ChannelAliasRules({ text, onChange, interfaceType, disabled }) {
  const [error, setError] = useState('');
  let rules;
  try { rules = JSON.parse(text) || emptyChannelRules; } catch { rules = null; }
  return <section className="supplier-change-section">
    {!rules ? <Notice error>请先修正「请求与响应」中的原始 JSON。</Notice> :
      <RulePairs title="模型重定向" names={['原模型调用标识', '目标上游模型调用标识']} values={rules.aliases || {}} disabled={disabled}
        onChange={aliases => {
          try {
            const next = normalizeChannelRequestRules({ ...rules, aliases }, interfaceType);
            onChange(json(next)); setError(''); return true;
          } catch (failure) { setError(failure.message); return false; }
        }}/>}
    <p>批量编辑可在「请求与响应」粘贴 <code>aliases</code> JSON。目标须是此连接已接入的上游模型。</p>
    {error && <Notice error>{error}</Notice>}
  </section>;
}

export default function ChannelRequestRulesEditor({ text, onChange, model, interfaceType, disabled }) {
  const [mode, setMode] = useState('visual');
  const [sampleScopes, setSampleScopes] = useState({ global: [], group: [] });
  const [sample, setSample] = useState(() => json({ model: model || 'example-model', stream: true, temperature: 0.8, metadata: { debug: true } }));
  const [preview, setPreview] = useState(null);
  const [error, setError] = useState('');
  let input, visual;
  try {
    input = JSON.parse(text);
    const rules = input || emptyChannelRules;
    if (!rules || Array.isArray(rules) || typeof rules !== 'object') throw Error('请选择 JSON 模式修正配置');
    const parameters = rules.parameters || {};
    visual = { ...rules, parameters: { operations: Array.isArray(parameters.operations) ? parameters.operations :
      Object.entries(parameters).map(([path, value]) => ({ mode: 'set', path, value, conditions: [], logic: 'OR' })) } };
    if (visual.parameters.operations.some(row => !row || typeof row !== 'object' || row.conditions && (!Array.isArray(row.conditions) || row.conditions.some(item => !item || typeof item !== 'object')))) visual = null;
    if (rules.processing && ['passHeaders', 'removeFields'].some(key => rules.processing[key] && !Array.isArray(rules.processing[key]))) visual = null;
  } catch { visual = null; }
  const updateText = text => { onChange(text); setPreview(null); setError(''); };
  const update = rules => updateText(json(rules));
  const writeOperations = operations => update({ ...visual, parameters: { operations } });
  const check = () => {
    try {
      setPreview(previewChannelRequestRules(JSON.parse(text), JSON.parse(sample), 429, { interfaceType, pluginScopes: sampleScopes, headers: {
        'x-request-id': 'sample-client-id', 'x-workspace': 'sample-workspace', 'accept-language': 'zh-CN',
      } }));
      setError('');
    }
    catch (failure) { setPreview(null); setError(failure.message); }
  };
  const format = () => {
    try { update(normalizeChannelRequestRules(JSON.parse(text), interfaceType) || emptyChannelRules); }
    catch (failure) { setError(failure.message); }
  };
  const savePairs = (key, value) => {
    try {
      const checked = normalizeChannelRequestRules({ [key]: value });
      update({ ...visual, [key]: checked[key] });
      return true;
    } catch (failure) { setError(failure.message); return false; }
  };
  const example = () => update({ headers: { 'X-Workspace': 'ops-demo' }, statusCodes: { 429: 503 }, parameters: { operations: [
    { mode: 'set', path: 'temperature', value: 0.2, logic: 'AND', conditions: [{ path: 'model', mode: 'full', value: model || 'example-model' }] },
  ] } });
  const operations = visual?.parameters.operations || [];
  const processing = visual?.processing || {};
  const plugins = Array.isArray(visual?.plugins) ? visual.plugins : [];
  const setProcessing = patch => update({ ...visual, processing: { ...processing, ...patch } });
  return <section className="supplier-change-section">
    <Space wrap>
      <Button theme={mode === 'visual' ? 'solid' : 'light'} onClick={() => setMode('visual')}>可视化</Button>
      <Button theme={mode === 'json' ? 'solid' : 'light'} onClick={() => setMode('json')}>原始 JSON</Button>
      <Button disabled={disabled || !visual || operations.length >= 50} onClick={() => writeOperations([...operations, newRule()])}>新增操作</Button>
      <Button disabled={disabled || operations.length > 0 || Boolean(Object.keys(visual?.headers || {}).length || Object.keys(visual?.statusCodes || {}).length)} onClick={example}>填入示例</Button>
      <Button disabled={disabled} onClick={format}>校验并格式化 JSON</Button>
    </Space>
    {(mode === 'json' || !visual) ? <Field label="请求规则 JSON"><TextArea aria-label="请求规则 JSON" autosize={{ minRows: 6, maxRows: 18 }} value={text} disabled={disabled} onChange={updateText}/></Field> : <>
      <Typography.Title heading={5}>参数覆盖</Typography.Title>
      {operations.map((rule, index) => {
        const updateRule = patch => writeOperations(replaceAt(operations, index, { ...rule, ...patch }));
        const conditions = rule.conditions || [];
        const move = offset => {
          const ordered = [...operations];
          [ordered[index + offset], ordered[index]] = [ordered[index], ordered[index + offset]];
          writeOperations(ordered);
        };
        const label = `规则 ${index + 1}`;
        return <section key={index} className="supplier-change-section" aria-label={label}>
          <Typography.Text strong>{label}</Typography.Text>
          <Space wrap>
            <Button size="small" disabled={disabled || index === 0} onClick={() => move(-1)} aria-label={'上移' + label}>上移</Button>
            <Button size="small" disabled={disabled || index === operations.length - 1} onClick={() => move(1)} aria-label={'下移' + label}>下移</Button>
            <Button size="small" disabled={disabled || operations.length >= 50} onClick={() => writeOperations([...operations.slice(0, index + 1), structuredClone(rule), ...operations.slice(index + 1)])}>复制规则</Button>
            <Button size="small" type="danger" disabled={disabled} onClick={() => writeOperations(operations.filter((_, at) => at !== index))}>删除规则</Button>
          </Space>
          <div className="channel-operation-fields">
            <Field label="操作"><Choice label={label + '操作'} options={RULE_MODES} value={rule.mode || 'set'} disabled={disabled} onChange={mode => updateRule({ mode, value: mode === 'return_error' ? { statusCode: 400, message: '' } : '', path: rule.path || '' })}/></Field>
            {rule.mode === 'return_error' ? <>
              <Field label="错误状态码"><Input aria-label={label + '错误状态码'} value={shown(rule.value?.statusCode)} disabled={disabled} onChange={statusCode => updateRule({ value: { ...rule.value, statusCode } })}/></Field>
              <Field label="错误提示"><Input aria-label={label + '错误提示'} value={rule.value?.message || ''} disabled={disabled} onChange={message => updateRule({ value: { ...rule.value, message } })}/></Field>
            </> : <>
              <Field label="请求字段"><Input aria-label={label + '请求字段'} value={rule.path || ''} placeholder="temperature" disabled={disabled} onChange={path => updateRule({ path })}/></Field>
              {rule.mode !== 'delete' && <Field label="设置值（支持 JSON）"><Input aria-label={label + '设置值'} value={shown(rule.value)} disabled={disabled} onChange={value => updateRule({ value: inputValue(value) })}/></Field>}
            </>}
          </div>
          <Field label="条件逻辑"><Choice label={label + '条件逻辑'} options={[[ 'AND', 'AND · 所有条件匹配' ], [ 'OR', 'OR · 任一条件匹配' ]]} value={rule.logic || 'OR'} disabled={disabled} onChange={logic => updateRule({ logic })}/></Field>
          {conditions.map((condition, at) => {
            const change = patch => updateRule({ conditions: replaceAt(conditions, at, { ...condition, ...patch }) });
            const conditionLabel = `${label}条件 ${at + 1}`;
            return <Space wrap key={at}>
              <Input aria-label={conditionLabel + '字段'} value={condition.path || ''} disabled={disabled} onChange={path => change({ path })}/>
              <Choice label={conditionLabel + '匹配方式'} options={RULE_CONDITION_MODES} value={condition.mode || 'full'} disabled={disabled} onChange={mode => change({ mode })}/>
              {condition.mode !== 'exists' && <Input aria-label={conditionLabel + '值'} value={shown(condition.value)} disabled={disabled} onChange={value => change({ value: inputValue(value) })}/>}
              <Button theme="borderless" disabled={disabled} onClick={() => updateRule({ conditions: conditions.filter((_, at2) => at2 !== at) })}>移除条件</Button>
            </Space>;
          })}
          <Button theme="light" disabled={disabled || conditions.length >= 10} onClick={() => updateRule({ conditions: [...conditions, newCondition()] })}>添加条件</Button>
        </section>;
      })}
      <RulePairs title="请求头覆盖" names={['请求头字段', '请求头值']} values={visual.headers || {}} disabled={disabled}
        onChange={value => savePairs('headers', value)}/>
      <p>请求头值可引用 <code>{'{{model}}'}</code> 或 <code>{'{{request_id}}'}</code>。</p>
      <RulePairs title="状态码映射" names={['原上游状态码', '转换后的状态码']} values={visual.statusCodes || {}} disabled={disabled}
        onChange={value => savePairs('statusCodes', value)}/>
      <Typography.Title heading={5}>请求处理插件</Typography.Title>
      <CheckboxGroup aria-label="配置连接插件" direction="horizontal" disabled={disabled} value={plugins}
        options={channelDemoPlugins.map(([value, label]) => ({ value, label }))}
        onChange={ids => update({ ...visual, plugins: [...plugins.filter(id => ids.includes(id)), ...ids.filter(id => !plugins.includes(id))] })}/>
      {plugins.length > 0 && <Space wrap>{plugins.map((plugin, index) => <span key={plugin}>
        {index + 1}. {channelDemoPlugins.find(([id]) => id === plugin)?.[1] || plugin}
        <Button theme="borderless" size="small" disabled={disabled || index === 0} onClick={() => {
          const ordered = [...plugins]; [ordered[index - 1], ordered[index]] = [ordered[index], ordered[index - 1]];
          update({ ...visual, plugins: ordered });
        }}>上移</Button>
      </span>)}</Space>}
      <Typography.Title heading={5}>请求与响应处理</Typography.Title>
      <Space wrap>{[
        ['passBody', '原样透传请求体'], ['forceOpenAI', '转换为 OpenAI 响应格式'], ['reasoningToContent', '将推理内容合入正文'],
        ...(interfaceType === 'openai-responses' ? [['responsesWebSocket', '使用 Responses WebSocket']] : []),
      ].map(([key, label]) => <Checkbox key={key} checked={Boolean(processing[key])} disabled={disabled}
        onChange={event => setProcessing({ [key]: event.target.checked })}>{label}</Checkbox>)}</Space>
      {processing.passBody && <Notice>原样透传需要核对上游模型标识。参数覆盖、提示词、字段过滤和格式转换须先关闭。</Notice>}
      {processing.responsesWebSocket && <Notice>本地样例可核对配置。建立连接、认证和流结束由上游联通验收确认。</Notice>}
      <Field label="允许透传的请求头"><CheckboxGroup aria-label="允许透传的请求头" direction="horizontal" value={processing.passHeaders || []}
        options={['x-request-id', 'x-workspace', 'accept-language', ...(interfaceType === 'anthropic' ? ['anthropic-beta'] : [])].map(value => ({ value, label: value }))}
        disabled={disabled} onChange={passHeaders => setProcessing({ passHeaders })}/></Field>
      {channelFieldControls[interfaceType] && <Field label="禁止发送的字段"><CheckboxGroup aria-label="禁止发送的字段" direction="horizontal" value={processing.removeFields || []}
        options={channelFieldControls[interfaceType].map(value => ({ value, label: value }))} disabled={disabled}
        onChange={removeFields => setProcessing({ removeFields })}/></Field>}
      <div className="channel-operation-fields">
        <Field label="系统提示词"><TextArea aria-label="系统提示词" value={processing.systemPrompt || ''} maxLength={4000} disabled={disabled}
          autosize={{ minRows: 2, maxRows: 8 }} onChange={systemPrompt => setProcessing({ systemPrompt })}/></Field>
        <Field label="客户端已有提示词时"><Choice label="客户端已有提示词时" value={processing.promptMode || 'default'} disabled={disabled}
          options={[[ 'default', '保留客户端提示词' ], [ 'prepend', '在客户端提示词前拼接' ]]} onChange={promptMode => setProcessing({ promptMode })}/></Field>
      </div>
    </>}
    <section className="supplier-change-section">
      <Typography.Title heading={6}>模拟请求的插件作用域</Typography.Title>
      {[[ 'global', '全局示例插件' ], [ 'group', '分组示例插件' ]].map(([scope, label]) => <Field key={scope} label={label}>
        <CheckboxGroup aria-label={label} direction="horizontal" value={sampleScopes[scope]}
          options={channelDemoPlugins.map(([value, name]) => ({ value, label: name }))}
          onChange={ids => { setSampleScopes(value => ({ ...value, [scope]: ids })); setPreview(null); }}/>
      </Field>)}
    </section>
    <Field label="样例请求（使用占位数据）"><TextArea aria-label="样例请求" value={sample} autosize={{ minRows: 4, maxRows: 10 }} onChange={value => { setSample(value); setPreview(null); }}/></Field>
    <Button theme="light" onClick={check}>检查示例请求</Button>
    {error && <Notice error>{error}</Notice>}
    {preview && <section aria-label="规则预览"><Typography.Title heading={6}>模拟预览</Typography.Title>
      <Typography.Paragraph>{preview.steps.map(step => `规则 ${step.index} ${step.matched ? '匹配' : '跳过'}${step.skipped ? '（' + step.skipped + '）' : ''}`).join(' · ') || '未配置参数覆盖'}</Typography.Paragraph>
      {preview.plugins?.length > 0 && <Typography.Paragraph>插件顺序 {preview.pluginOrder.map(({id, scope}) => scope + ' · ' + channelDemoPlugins.find(([key]) => key === id)?.[1]).join(' → ')}</Typography.Paragraph>}
      <pre>{json(preview.error ? { error: preview.error } : { ...preview.request, response: preview.response })}</pre>
    </section>}
  </section>;
}
