import { useContext, useEffect, useId, useRef, useState } from 'react';
import { Banner, Button, Card, Checkbox, Empty, Input, InputNumber, Progress, RadioGroup, Select, Space, Tabs, Tag, TextArea, Toast, Tooltip, Typography } from './xa24/HaloUI.jsx';
import { Slider } from './xa24/HaloUI.jsx';
import { IconClose, IconPlus } from './xa24/HaloIcons.jsx';
import { use as registerChart } from 'echarts/core';
import { ScatterChart } from 'echarts/charts';
import { Chart } from '../components/AnalyticsCharts';
import { AdminModal } from './AdminOverlay';
import AdminPageHeading from './AdminPageHeading';
import {
  chatPlaygroundChunks, chatPlaygroundDefaults, chatPlaygroundKey, chatPlaygroundMessage, chatPlaygroundNumbers, chatPlaygroundPayload,
  deploymentPlaygroundTargets, orderPlaygroundDocuments, playgroundCodeExample, playgroundCodeLanguages,
  playgroundDocumentRequest, playgroundImageTypes, playgroundMaxTokens, playgroundPaths, playgroundRankProgress, playgroundReasoningLevels,
  playgroundRequest, playgroundSamples, projectPlaygroundEmbeddings, simulatePlaygroundResponse, splitPlaygroundPaste,
} from './deployment-playground';
import { ChannelLanguageContext, useChannelText } from './channel-language';
import './deployment-playground.css';

registerChart(ScatterChart);

const { Paragraph, Text } = Typography;
function PlaygroundField({ label, children, help }) {
  const id = useId();
  return <div className="deployment-playground-field"><label id={id}>
    {help ? <Tooltip content={help}><span tabIndex={0} className="deployment-playground-parameter-label">{label}</span></Tooltip> : label}
  </label>{children(id)}</div>;
}

const chatParameterHelp = {
  temperature: '调整生成的随机性。数值越低，结果越稳定。',
  max_tokens: '限制一次回复最多生成的 Token 数。',
  top_p: '限制采样时考虑的累计概率范围。',
  frequency_penalty: '降低重复使用已出现词汇的可能性。',
  presence_penalty: '降低使用已出现内容的可能性。',
  seed: '指定随机种子，便于重复同一组设置。',
};

function ChatParameters({ draft, update, target, busy, t }) {
  const change = (key, value) => update({ parameters: { ...draft.parameters, [key]: value } });
  return <>
    {chatPlaygroundNumbers.map(([key, label, min, limit, step]) => {
      const max = key === 'max_tokens' ? playgroundMaxTokens(target) : limit;
      const value = draft.parameters[key];
      const numericValue = value == null || value === '' ? min : Number(value);
      return <PlaygroundField key={key} label={label} help={t(chatParameterHelp[key])}>{id =>
        <div className="deployment-playground-parameter">
          {key !== 'seed' && <Slider aria-label={label} value={Number.isFinite(numericValue) ? numericValue : min} min={min} max={max} step={step} disabled={busy}
            onChange={value => change(key, value)}/>}
          <InputNumber aria-labelledby={id} name={key} value={value ?? ''} min={min} step={step}
            max={max} onChange={value => change(key, value)} disabled={busy}/>
        </div>
      }</PlaygroundField>;
    })}
    <PlaygroundField label="Reasoning Effort">{id => <Select aria-labelledby={id} value={draft.parameters.reasoning_effort} showClear disabled={busy}
      optionList={playgroundReasoningLevels.map(value => ({ value, label: value[0].toUpperCase() + value.slice(1) }))} onChange={value => change('reasoning_effort', value)}/>}</PlaygroundField>
    <PlaygroundField label="Stop Sequence" help={t('遇到指定内容时结束生成。')}>{id => <Input name="stop" aria-labelledby={id} value={draft.parameters.stop ?? ''} disabled={busy}
      onChange={value => change('stop', value)}/>}</PlaygroundField>
  </>;
}

function useLocalImages(append, setError, t) {
  const [pending, setPending] = useState(false);
  const reading = useRef(false);
  const add = async files => {
    if (!files.length || reading.current) return;
    if (files.some(file => !playgroundImageTypes.includes(file.type))) { setError(t('请选择 JPEG 或 PNG 图片。')); return; }
    reading.current = true;
    setPending(true);
    try {
      const selected = await Promise.all(files.map(file => new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve({ name: file.name, url: reader.result });
        reader.onerror = reject;
        reader.readAsDataURL(file);
      })));
      append(selected);
    } catch { setError(t('无法读取图片。')); }
    finally { reading.current = false; setPending(false); }
  };
  return { pending, add };
}

function LocalImages({ images, onRemove, onAdd, busy, pending, t }) {
  const picker = useRef(null);
  const pick = event => {
    const files = [...event.currentTarget.files];
    event.currentTarget.value = '';
    onAdd(files);
  };
  return <Space wrap>
    <input ref={picker} type="file" hidden multiple accept={playgroundImageTypes.join(',')} onChange={pick}/>
    <Button htmlType="button" onClick={() => picker.current?.click()} loading={pending} disabled={busy}>{t('添加图片')}</Button>
    {images.map((image, index) => <div key={index} className="deployment-playground-image">
      <img src={image.url} alt={image.name || t('输入图片')}/>
      <Button htmlType="button" size="small" theme="borderless" disabled={busy} icon={<IconClose aria-hidden="true"/>}
        aria-label={`${t('删除图片')} ${index + 1}`} onClick={() => onRemove(index)}/>
    </div>)}
  </Space>;
}

const chatText = message => typeof message.content === 'string' ? message.content : message.content.filter(part => part.type === 'text').map(part => part.text).join('\n');
const chatImages = message => typeof message.content === 'string' ? [] : message.content.filter(part => part.type === 'image_url').map(part => ({ url: part.image_url.url }));
const chatRole = role => role === 'user' ? '用户' : 'AI 助手';

function ChatMessage({ message, index, busy, onEdit, onRemove, target, t }) {
  const [edit, setEdit] = useState(false);
  const [prompt, setPrompt] = useState('');
  const [images, setImages] = useState([]);
  const [error, setError] = useState('');
  const { pending, add } = useLocalImages(selected => setImages(current => [...current, ...selected]), setError, t);
  const title = `${t(chatRole(message.role))} ${index + 1}`;
  const allowImages = message.role === 'user' && target.model.type === 'multimodal';
  const save = () => {
    try {
      const replacement = chatPlaygroundMessage(target, { role: message.role, prompt, images });
      if (!replacement) throw Error('请输入消息。');
      onEdit(replacement);
      setEdit(false);
    } catch (issue) { setError(t(issue.message)); }
  };
  const copy = async () => {
    try { await navigator.clipboard.writeText(chatText(message)); Toast.success(t('已复制')); }
    catch { Toast.error(t('复制失败')); }
  };
  return <article className="deployment-playground-message" aria-label={title}>
    <div className="deployment-playground-message-heading">
      <Text strong>{t(chatRole(message.role))}</Text>
      {!edit && <Space wrap>
        <Button htmlType="button" size="small" theme="borderless" aria-label={`${t('复制')} ${title}`} disabled={!chatText(message)} onClick={copy}>{t('复制')}</Button>
        <Button htmlType="button" size="small" theme="borderless" aria-label={`${t('编辑')} ${title}`} disabled={busy}
          onClick={() => { setPrompt(chatText(message)); setImages(chatImages(message)); setError(''); setEdit(true); }}>{t('编辑')}</Button>
        <Button htmlType="button" size="small" type="danger" theme="borderless" aria-label={`${t('删除')} ${title}`} disabled={busy} onClick={onRemove}>{t('删除')}</Button>
      </Space>}
    </div>
    {edit ? <div className="deployment-playground-fields">
      <TextArea rows={3} autoFocus aria-label={`${t('编辑')} ${title}`} value={prompt} onChange={value => { setPrompt(value); setError(''); }} disabled={busy}/>
      {allowImages && <LocalImages images={images} onRemove={index => setImages(current => current.filter((_, i) => i !== index))}
        onAdd={add} {...{ busy, pending, t }}/>}
      {error && <Banner type="danger" closeIcon={null} description={error}/>}
      <Space wrap>
        <Button htmlType="button" size="small" onClick={() => setEdit(false)} disabled={pending}>{t('取消')}</Button>
        <Button htmlType="button" size="small" theme="solid" onClick={save} disabled={busy || pending}>{t('保存')}</Button>
      </Space>
    </div> : <>
      {chatText(message) && <p>{chatText(message)}</p>}
      {chatImages(message).map((image, index) => <img key={index} src={image.url} alt={t('输入图片')}/>)}
    </>}
  </article>;
}

function TextBatch({ texts, update, makeRows, busy, ranks, t }) {
  const [batch, setBatch] = useState(true);
  const paste = (event, index) => {
    if (!batch || busy) return;
    const { value, selectionStart, selectionEnd } = event.currentTarget;
    const split = splitPlaygroundPaste(value, selectionStart, selectionEnd, event.clipboardData.getData('text/plain'));
    if (!split) return;
    event.preventDefault();
    const existing = texts[index];
    const rows = split.length ? [{ ...existing, text: split[0] }, ...makeRows(split.slice(1))] : [];
    update([...texts.slice(0, index), ...rows, ...texts.slice(index + 1)].filter(item => item.text.trim()));
  };
  return <>
    <Space wrap>
      <Tooltip content={t('粘贴多行时，每行生成一条文本。')}>
        <span><Checkbox name="multiplePaste" checked={batch} onChange={event => setBatch(event.target.checked)} disabled={busy}>{t('批量输入')}</Checkbox></span>
      </Tooltip>
      <Button htmlType="button" icon={<IconPlus aria-hidden="true"/>} disabled={busy} onClick={() => update([...texts, ...makeRows([''])])}>
        {t('添加文本')}
      </Button>
    </Space>
    {texts.map((item, index) => {
      const rank = ranks?.get(item.id);
      return <div key={item.id} className="deployment-playground-input-row">
        <PlaygroundField label={`${t('文本')} ${index + 1}`}>{id =>
          <TextArea aria-labelledby={id} name="documents" rows={2} value={item.text} placeholder={t('输入你的文本')}
            onChange={text => update(texts.map(row => row.id === item.id ? { ...row, text } : row))}
            onPaste={event => paste(event, index)} disabled={busy}/>
        }</PlaygroundField>
        <Button htmlType="button" theme="borderless" disabled={busy} icon={<IconClose aria-hidden="true"/>}
          aria-label={`${t('移除')} ${index + 1}`} onClick={() => update(texts.filter(row => row.id !== item.id))}/>
        {rank && <div className="deployment-playground-rank">
          <Progress percent={rank.percent} size="small" aria-label={t('相对排名')}/>
          <Space><Tag color="blue">{t('排序')} {rank.rank}</Tag><Tag color="amber">{t('分数')} {rank.relevance_score.toFixed(2)}</Tag></Space>
        </div>}
      </div>;
    })}
  </>;
}

function CodePreview({ target, draft, messages = [], onClose, t }) {
  const [language, setLanguage] = useState(playgroundCodeLanguages[0]);
  let error = '';
  let code = '';
  let localImage = false;
  try {
    const request = target.mode === 'chat' ? chatPlaygroundPayload(target, draft, messages, { preview: true }) : playgroundDocumentRequest(target, draft);
    if (request.messages) request.messages = request.messages.map(message => ({ ...message, content: Array.isArray(message.content) ? message.content.map(part => {
      if (part.type !== 'image_url') return part;
      localImage = true;
      return { type: 'image_url', image_url: { url: 'YOUR_IMAGE_DATA_URL' } };
    }) : message.content }));
    code = playgroundCodeExample(target.mode, request, language, window.location.origin);
  } catch (issue) { error = t(issue.message); }
  return <AdminModal title={t('查看代码')} width="min(760px, calc(100vw - 32px))" visible onCancel={onClose} closeOnEsc
    footer={<Button onClick={onClose}>{t('关闭')}</Button>}>
    {error && <Banner type="danger" closeIcon={null} description={error}/>}
    {localImage && <Banner type="info" closeIcon={null} description={t('请在代码中替换本地图片占位符。')}/>}
    <Tabs activeKey={language} onChange={setLanguage}>
      {playgroundCodeLanguages.map(item => <Tabs.TabPane key={item} tab={item} itemKey={item}>
        {item === language && code && <Paragraph component="pre" className="deployment-playground-code" aria-label={t('请求示例')}
          copyable={{ content: code, successTip: t('已复制'), copyTip: t('复制') }}>{code}</Paragraph>}
      </Tabs.TabPane>)}
    </Tabs>
  </AdminModal>;
}

function EmbeddingOutput({ result, request, busy, t }) {
  const [view, setView] = useState('chart');
  const [height, setHeight] = useState(230);
  const vectors = result?.data ?? [];
  const summary = result ? JSON.stringify(result, null, 2) : '';
  const points = projectPlaygroundEmbeddings(vectors.map(item => item.embedding));
  return <Card title={<Space>
    <Text strong>{t('输出')}</Text>
    {view === 'chart' && <Tooltip content={t('图表使用主成分分析投影模拟向量。点靠得越近，在该投影中的向量越相似。')}>
      <Button aria-label={t('图表说明')} size="small" theme="borderless">?</Button>
    </Tooltip>}
  </Space>} headerExtraContent={<RadioGroup aria-label={t('输出格式')} name="outputFormat" type="button" value={view}
    options={[{ value: 'chart', label: t('图表') }, { value: 'json', label: 'JSON' }]} onChange={event => setView(event.target.value)}/>}
  className="deployment-playground-output">
    {!result ? <Empty description={t(busy ? '正在生成嵌入向量。' : '提交文本后查看输出。')}/> : <>
      {view === 'chart' ? <>
        <Chart height={height} label={t('嵌入向量散点图')} option={{
          animation: false,
          grid: { top: 18, left: 50, right: 41, bottom: 35 },
          tooltip: { formatter: point => `${t('文本')} ${point.dataIndex + 1}`, renderMode: 'richText', confine: true },
          xAxis: { type: 'value', name: 'PC1', scale: true },
          yAxis: { type: 'value', name: 'PC2', scale: true },
          series: [{ type: 'scatter', symbolSize: 16, data: points, itemStyle: { color: 'var(--xa24-primary)' },
            label: { show: true, position: 'top', formatter: point => String(point.dataIndex + 1) } }],
        }}/>
        <details><summary>{t('查看图表数据')}</summary>
          <ol>{request.input.map((text, index) => <li key={index}>{text} · PC1 {points[index][0]} · PC2 {points[index][1]}</li>)}</ol>
        </details>
      </> : <Paragraph component="pre" className="deployment-playground-code" style={{ maxHeight: height }} aria-label={t('模拟响应')}
        copyable={{ content: summary, successTip: t('已复制'), copyTip: t('复制') }}>{summary}</Paragraph>}
      <div className="deployment-playground-height">
        <Text type="secondary">{t('输出高度')}</Text>
        <Slider aria-label={t('输出高度')} min={180} max={400} step={10} value={height} onChange={setHeight}/>
      </div>
    </>}
  </Card>;
}

const waitForResponse = () => new Promise(resolve => setTimeout(resolve, 600));

const waitForChatChunk = signal => new Promise(resolve => {
  const finish = () => { signal.removeEventListener('abort', cancel); resolve(); };
  const cancel = () => { clearTimeout(timer); finish(); };
  const timer = setTimeout(finish, 135);
  signal.addEventListener('abort', cancel, { once: true });
});
const unavailableRoute = '部署或路由已不可用，请返回部署。';

async function refreshPlaygroundRoute(target, validateRoute, refreshRead, signal) {
  const refreshed = await refreshRead?.(signal);
  if (signal.aborted) return false;
  if (!validateRoute(target.route.id, refreshed)) throw Error(unavailableRoute);
  return true;
}

function ChatPlayground({ target, validateRoute, refreshRead, t }) {
  const id = useId();
  const [draft, setDraft] = useState(() => ({ role: 'user', system: '', prompt: '', images: [], parameters: chatPlaygroundDefaults(target) }));
  const [messages, setMessages] = useState([]);
  const [stream, setStream] = useState('');
  const [lastRequest, setLastRequest] = useState(null);
  const [showRequest, setShowRequest] = useState(false);
  const [showCode, setShowCode] = useState(false);
  const [settings, setSettings] = useState(true);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [usage, setUsage] = useState(null);
  const [stopped, setStopped] = useState(false);
  const running = useRef(null);
  const nextMessage = useRef(0);
  const composer = useRef(null);
  const errorSummary = useRef(null);
  const identify = message => ({ ...message, id: nextMessage.current++ });
  const { pending: imagePending, add: addImages } = useLocalImages(images => {
    setDraft(current => ({ ...current, images: [...current.images, ...images] }));
    setError('');
  }, setError, t);
  const update = patch => { setError(''); setDraft(current => ({ ...current, ...patch })); };
  useEffect(() => () => { running.current?.controller.abort(); running.current = null; }, []);
  useEffect(() => { if (error) errorSummary.current?.focus(); }, [error]);
  useEffect(() => {
    const focus = event => {
      if (event.key !== '/' || event.ctrlKey || event.metaKey || event.altKey || event.isComposing || busy || showCode ||
          event.target.closest?.('input, textarea, select, [contenteditable="true"], [role="combobox"], [role="dialog"]')) return;
      event.preventDefault();
      composer.current?.focus();
    };
    document.addEventListener('keydown', focus);
    return () => document.removeEventListener('keydown', focus);
  }, [busy, showCode]);
  const clearMessages = () => { setMessages([]); setLastRequest(null); setUsage(null); setStopped(false); setError(''); };
  const addMessage = () => {
    if (busy || imagePending) return;
    try {
      const message = chatPlaygroundMessage(target, draft);
      if (!message) throw Error('请输入消息。');
      const newMessage = identify(message);
      setMessages(current => [...current, newMessage]);
      update({ prompt: '', images: [] });
      composer.current?.focus();
    } catch (issue) { setError(t(issue.message)); }
  };
  const send = async event => {
    event.preventDefault();
    if (running.current || imagePending) return;
    const task = { controller: new AbortController(), output: '' };
    const signal = task.controller.signal;
    try {
      const request = playgroundRequest(target, draft, messages);
      const current = chatPlaygroundMessage(target, draft);
      running.current = task;
      setBusy(true);
      setError('');
      setStopped(false);
      setUsage(null);
      if (!await refreshPlaygroundRoute(target, validateRoute, refreshRead, signal)) return;
      if (!validateRoute(target.route.id)) throw Error(unavailableRoute);
      if (current) {
        const submitted = identify(current);
        setMessages(previous => [...previous, submitted]);
        update({ prompt: '', images: [] });
      }
      setLastRequest(request);
      const response = simulatePlaygroundResponse('chat', request);
      for (const chunk of chatPlaygroundChunks(response.choices[0].message.content)) {
        await waitForChatChunk(signal);
        if (signal.aborted) return;
        if (!validateRoute(target.route.id)) throw Error(unavailableRoute);
        task.output += chunk;
        setStream(task.output);
      }
      setUsage(response.usage);
    } catch (issue) { if (!signal.aborted) setError(t(issue.message)); }
    finally {
      if (running.current === task) {
        if (task.output) {
          const reply = identify({ role: 'assistant', content: task.output });
          setMessages(previous => [...previous, reply]);
        }
        running.current = null;
        setStream('');
        setBusy(false);
      }
    }
  };
  const stop = () => {
    const task = running.current;
    if (!task) return;
    running.current = null;
    task.controller.abort();
    if (task.output) {
      const reply = identify({ role: 'assistant', content: task.output, stopped: true });
      setMessages(previous => [...previous, reply]);
    }
    setStream('');
    setStopped(true);
    setBusy(false);
  };
  const keyboard = event => {
    const action = chatPlaygroundKey(event.nativeEvent);
    if (!action) return;
    event.preventDefault();
    if (action === 'add') addMessage();
    else if (!busy && !imagePending && (draft.prompt.trim() || draft.images.length || messages.length)) event.currentTarget.form?.requestSubmit();
  };
  const multimodal = target.model.type === 'multimodal' && draft.role === 'user';
  const pasteImage = event => {
    if (!multimodal || busy || imagePending || event.clipboardData.getData('text/plain')) return;
    const images = [...event.clipboardData.files].filter(file => file.type.startsWith('image/'));
    if (images.length) { event.preventDefault(); addImages(images); }
  };
  const removeMessage = id => setMessages(current => current.filter(message => message.id !== id));
  const editMessage = (id, replacement) => setMessages(current => current.map(message => message.id === id ? { ...replacement, id } : message));
  const name = `${id}-title`;
  const hasDraft = Boolean(draft.prompt.trim() || draft.images.length);
  return <form className={`deployment-playground-grid${settings ? '' : ' deployment-playground-wide'}`} aria-labelledby={name} noValidate onSubmit={send}>
    <Card title={<span id={name}>{t('对话')}</span>} headerExtraContent={<Space wrap>
      <Button htmlType="button" theme="borderless" onClick={() => setShowCode(true)}>{t('查看代码')}</Button>
      <Button htmlType="button" theme="borderless" aria-expanded={settings} aria-controls={`${id}-settings`}
        onClick={() => setSettings(value => !value)}>{t('参数设置')}</Button>
    </Space>}>
      <div className="deployment-playground-fields">
        <div className="deployment-playground-system">
          <PlaygroundField label={t('系统消息')}>{label => <TextArea aria-labelledby={label} name="system" value={draft.system} rows={1}
            autosize={{ minRows: 1, maxRows: 4 }} placeholder={t('在这里输入系统消息')} onChange={system => update({ system })} disabled={busy}/>}</PlaygroundField>
          {draft.system && <Button htmlType="button" theme="borderless" onClick={() => update({ system: '' })} disabled={busy}
            aria-label={t('清空系统消息')} icon={<IconClose aria-hidden="true"/>}/>}
        </div>
        <div className="deployment-playground-conversation">
          {messages.map((message, index) => <ChatMessage key={message.id} {...{ message, index, busy, target, t }}
            onEdit={replacement => editMessage(message.id, replacement)} onRemove={() => removeMessage(message.id)}/>)}
          {busy && <article className="deployment-playground-message" aria-label={t('正在生成回复')}>
            <Text strong>{t('AI 助手')}</Text><p>{stream || t('正在生成回复')}</p>
          </article>}
        </div>
        {usage && <Text type="secondary" role="status">{t('模拟 Token 用量')} · {t('输入')} {usage.prompt_tokens} · {t('输出')} {usage.completion_tokens} · {t('合计')} {usage.total_tokens}</Text>}
        {stopped && <Text type="secondary" role="status">{t('已停止生成')}</Text>}
        <Space wrap>
          <Button htmlType="button" disabled={busy || imagePending || draft.images.length > 0}
            aria-label={t('切换消息角色')} onClick={() => update({ role: draft.role === 'user' ? 'assistant' : 'user' })}>{t(chatRole(draft.role))}</Button>
          {multimodal && <LocalImages images={draft.images} onRemove={index => update({ images: draft.images.filter((_, i) => i !== index) })}
            onAdd={addImages} pending={imagePending} {...{ busy, t }}/>}
          <Button htmlType="button" theme="borderless" disabled={busy || !messages.length} onClick={clearMessages}>{t('清空消息')}</Button>
        </Space>
        <PlaygroundField label={t('消息')}>{label => <TextArea ref={composer} aria-labelledby={label} name="prompt" value={draft.prompt} rows={4}
          placeholder={t('按 / 开始输入')} onChange={prompt => update({ prompt })} onKeyDown={keyboard} onPaste={pasteImage} disabled={busy}/>}</PlaygroundField>
        {error && <div ref={errorSummary} tabIndex={-1}><Banner type="danger" closeIcon={null} description={error}/></div>}
        <Space wrap>
          <Tooltip content={t('Alt + Ctrl 或 Command + Enter 可添加消息。')}>
            <span><Button htmlType="button" disabled={busy || imagePending || !hasDraft} onClick={addMessage}>{t('添加消息')}</Button></span>
          </Tooltip>
          {busy ? <Button htmlType="button" theme="solid" onClick={stop}>{t('停止')}</Button>
            : <Button htmlType="submit" theme="solid" disabled={imagePending || !hasDraft && !messages.length}>{t('发送')}</Button>}
          <Button htmlType="button" disabled={!lastRequest} aria-expanded={showRequest} onClick={() => setShowRequest(value => !value)}>{t('查看请求')}</Button>
        </Space>
        {showRequest && lastRequest && <pre aria-label={t('请求参数')}>{JSON.stringify(lastRequest, (key, value) =>
          key === 'url' && typeof value === 'string' && value.startsWith('data:image/') ? t('本地图片') : value, 2)}</pre>}
      </div>
    </Card>
    <Card id={`${id}-settings`} hidden={!settings} title={t('参数设置')}>
      <div className="deployment-playground-fields"><ChatParameters {...{ draft, update, target, busy, t }}/></div>
    </Card>
    {showCode && <CodePreview {...{ target, draft, messages, t }} onClose={() => setShowCode(false)}/>}
  </form>;
}

function DocumentPlayground({ target, validateRoute, refreshRead, t }) {
  const english = useContext(ChannelLanguageContext);
  const embedding = target.mode === 'embedding';
  const id = useId();
  const nextRow = useRef(0);
  const makeRows = texts => texts.map(text => ({ id: nextRow.current++, text }));
  const withSamples = () => {
    const sample = playgroundSamples(target.mode, english);
    return { query: sample.query || '', topN: 3, texts: makeRows(sample.texts) };
  };
  const [draft, setDraft] = useState(withSamples);
  const [lastRequest, setLastRequest] = useState(null);
  const [result, setResult] = useState(null);
  const [showCode, setShowCode] = useState(false);
  const [settings, setSettings] = useState(true);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const running = useRef(null);
  const errorSummary = useRef(null);
  useEffect(() => () => running.current?.abort(), []);
  useEffect(() => { if (error) errorSummary.current?.focus(); }, [error]);
  const resetResult = () => { setResult(null); setLastRequest(null); setError(''); };
  const update = patch => { setError(''); setDraft(current => ({ ...current, ...patch })); };
  const updateDocuments = texts => {
    update({ texts });
    if (!embedding) resetResult();
  };
  const stop = () => { running.current?.abort(); running.current = null; setBusy(false); };
  const clear = () => {
    update({ texts: makeRows(['', '']) });
    resetResult();
  };
  const submit = async event => {
    event.preventDefault();
    if (running.current) return;
    const controller = new AbortController();
    try {
      const request = playgroundRequest(target, draft);
      const documents = draft.texts.filter(item => item.text.trim());
      running.current = controller;
      setBusy(true);
      setError('');
      if (!await refreshPlaygroundRoute(target, validateRoute, refreshRead, controller.signal)) return;
      await waitForResponse();
      if (controller.signal.aborted) return;
      if (!validateRoute(target.route.id)) throw Error(unavailableRoute);
      const response = simulatePlaygroundResponse(target.mode, request);
      setLastRequest(request);
      setDraft(current => ({ ...current, texts: embedding ? documents : orderPlaygroundDocuments(documents, response.results) }));
      setResult({ response, ranks: embedding ? null : new Map(response.results.map((item, index) => [documents[item.index].id,
        { ...item, rank: index + 1, percent: playgroundRankProgress(response.results, item.relevance_score) }])) });
    } catch (issue) { if (!controller.signal.aborted) setError(t(issue.message)); }
    finally {
      if (running.current === controller) { running.current = null; setBusy(false); }
    }
  };
  const context = target.model.metadata ?? target.model.meta;
  const maxTokens = Number(context?.n_ctx) > 0 && Number(context?.n_slot) > 0 ? Math.floor(context.n_ctx / context.n_slot) : null;
  const hasSettings = !embedding || maxTokens !== null;
  const errorBlock = error && <div ref={errorSummary} tabIndex={-1}><Banner type="danger" closeIcon={null} description={error}/></div>;
  const submitButton = busy ? <Button htmlType="button" theme="solid" onClick={stop}>{t('停止')}</Button>
    : <Button theme="solid" htmlType="submit" disabled={embedding && draft.texts.length < 2}>
      {t('提交')}
    </Button>;
  const activeSettings = settings && hasSettings;
  return <form className={`deployment-playground-grid${activeSettings ? '' : ' deployment-playground-wide'}`} noValidate onSubmit={submit} aria-labelledby={id}>
    <div className="deployment-playground-main">
      <Card title={<span id={id}>{t('文档')}</span>} headerExtraContent={<Space wrap>
          <Button htmlType="button" theme="borderless" disabled={busy} onClick={() => { setDraft(withSamples()); resetResult(); }}>{t('载入样例')}</Button>
          <Button htmlType="button" theme="borderless" onClick={clear} disabled={busy}>{t('清空')}</Button>
          <Button htmlType="button" theme="borderless" onClick={() => setShowCode(true)}>{t('查看代码')}</Button>
          {hasSettings && <Button htmlType="button" theme="borderless" aria-expanded={settings} aria-controls={`${id}-settings`}
            onClick={() => setSettings(value => !value)}>{t('参数设置')}</Button>}
        </Space>}>
        <div className="deployment-playground-fields">
          {!embedding && <div className="deployment-playground-query">
            <PlaygroundField label={t('查询')}>{label => <Input name="query" aria-labelledby={label} aria-required="true"
              aria-invalid={error === t('请输入查询内容。') || undefined} showClear placeholder={t('输入查询')} value={draft.query}
              onChange={query => { update({ query }); resetResult(); }} disabled={busy}/>}</PlaygroundField>
            {submitButton}
          </div>}
          <TextBatch texts={draft.texts} update={updateDocuments} ranks={result?.ranks} {...{ makeRows, busy, t }}/>
          {embedding && <div>{submitButton}</div>}
          {errorBlock}
          {result?.response.usage && <Text type="secondary" role="status">
            {t('模拟 Token 用量')} · {t('输入')} {result.response.usage.prompt_tokens} · {t('合计')} {result.response.usage.total_tokens}
          </Text>}
        </div>
      </Card>
      {embedding && <EmbeddingOutput t={t} result={result?.response} request={lastRequest} busy={busy}/>}
    </div>
    {hasSettings && <Card id={`${id}-settings`} hidden={!activeSettings} title={t('参数设置')}>
      <div className="deployment-playground-fields">
        {!embedding && <PlaygroundField label="Top N">{label => <InputNumber name="top_n" aria-labelledby={label} aria-required="true"
          aria-invalid={error.includes('Top N') || undefined} value={draft.topN} min={1} step={1}
          onChange={topN => { update({ topN }); resetResult(); }} disabled={busy}/>}</PlaygroundField>}
        {maxTokens !== null && <PlaygroundField label="Max Tokens">{label => <InputNumber aria-labelledby={label} value={maxTokens} disabled/>}</PlaygroundField>}
      </div>
    </Card>}
    {showCode && <CodePreview {...{ target, draft, t }} onClose={() => setShowCode(false)}/>}
  </form>;
}

export default function DeploymentPlayground({ state, deploymentId, routeId, onRoute, onBack, refreshRead }) {
  const t = useChannelText();
  const latest = useRef(state);
  latest.current = state;
  const targets = deploymentPlaygroundTargets(state, deploymentId);
  const target = routeId ? targets.find(item => item.route.id === routeId) : targets[0];
  const Playground = target?.mode === 'chat' ? ChatPlayground : DocumentPlayground;
  return <>
    <AdminPageHeading title="Playground">
      <Button onClick={onBack}>{t('返回部署')}</Button>
    </AdminPageHeading>
    {!target ? <Banner type="warning" closeIcon={null} description={t('部署或路由已不可用，请返回部署。')}/> : <>
      <Card>
        <Space wrap>
          <PlaygroundField label={t('模型路由')}>{id => <Select aria-labelledby={id} value={target.route.id} filter
            optionList={targets.map(item => ({ value: item.route.id, label: item.routeName }))} onChange={onRoute}/>}</PlaygroundField>
          <Tag>{t('模拟请求')}</Tag>
          <Text code>{playgroundPaths[target.mode]}</Text>
        </Space>
      </Card>
      <Playground key={target.route.id} {...{ target, refreshRead, t }}
        validateRoute={(id, snapshot = latest.current) => deploymentPlaygroundTargets(snapshot, deploymentId)
          .some(item => item.route.id === id && item.endpointId === target.endpointId && item.routeName === target.routeName && item.mode === target.mode)}/>
    </>}
  </>;
}
