import { useState } from 'react';
import { Button, Input } from '@douyinfe/semi-ui';
import { Check, ExternalLink, Plug, Search } from 'lucide-react';
import FrontPageHeader from './FrontPageHeader';
import { apiHost, apiKey, baseUrl, chatEndpoint, ExampleCopy, modelId, toolGuides } from './tool-access-guides';
import './tool-access.css';

const translations = {
  zh: {
    title: '工具接入', subtitle: '将 MoMA 的模型接入常用客户端和智能体。',
    search: '搜索工具或用途', empty: '没有匹配的工具', tools: '选择工具', official: '官方文档',
    prepare: '接入准备', market: '模型广场', keys: 'API 密钥', parameters: '接入参数',
    modelPreparation: '开通模型服务，并从模型详情的调用示例中获取模型调用名。',
    keyPreparation: '在 API 密钥中获取具有该模型调用权限的密钥。',
    exampleNote: '下方地址、模型调用名和 API Key 用于说明填写格式。接入时请换成你的服务参数。',
    endpoint: '完整请求地址', host: '根地址', model: '模型调用名', protocol: '接口协议',
    steps: '配置步骤', verify: '验证接入', faq: '常见问题', toc: '本页目录',
    verifyNote: '接入后，在客户端选择所配置的模型并发送一条消息。排查接口时，也可以使用以下 cURL 格式。成功时应返回 HTTP 200，并在 choices[0].message.content 中看到模型回复。',
    addressQuestion: '根地址、Base URL 和完整请求地址怎么区分？',
    addressAnswer: 'Cherry Studio 填根地址，DeepSeek Harness 填 Base URL。WorkBuddy、TRAE 和 CC Switch 按本指南开启完整地址相关选项，填写完整请求地址。',
    authorizationQuestion: '返回 401 / 403，或提示没有模型权限？',
    authorizationAnswer: '检查密钥是否有效、模型服务是否开通，以及当前项目的 API Key 是否有该模型的调用权限。',
    modelQuestion: '返回 404 / 405，或提示模型不存在？',
    modelAnswer: '核对协议、请求路径和模型调用名。此处使用 OpenAI Chat Completions，最终路径应为 /v1/chat/completions。模型调用名需保留大小写和前缀。',
    capabilityQuestion: '对话正常，为什么智能体无法执行任务？',
    capabilityAnswer: '检查所选模型和服务是否支持工具调用、流式输出及所需的上下文长度。先用简短对话检查连通，再验证工具调用。',
  },
  en: {
    title: 'Tool Setup', subtitle: 'Connect MoMA models to your AI tools and agents.',
    search: 'Search tools or use cases', empty: 'No matching tools', tools: 'Choose a tool', official: 'Official docs',
    prepare: 'Before you start', market: 'Model Marketplace', keys: 'API Key Management', parameters: 'Connection settings',
    modelPreparation: 'Enable a model service and find its model ID in the request example on the model details page.',
    keyPreparation: 'In API Key Management, get a key with access to the model.',
    exampleNote: 'The address, model ID, and API key below show the required formats. Replace them with your own settings when connecting.',
    endpoint: 'Full request URL', host: 'API host', model: 'Model ID', protocol: 'API protocol',
    steps: 'Setup steps', verify: 'Verify the connection', faq: 'FAQ', toc: 'On this page',
    verifyNote: 'Select the model in the client and send a message. To troubleshoot the endpoint, use the cURL format below. A successful response returns HTTP 200 and a reply in choices[0].message.content.',
    addressQuestion: 'When should I use the API host, Base URL, or full request URL?',
    addressAnswer: 'Use the API host in Cherry Studio and the Base URL in DeepSeek Harness. In WorkBuddy, TRAE, and CC Switch, turn on the relevant full URL option and enter the full request URL.',
    authorizationQuestion: 'What if I get 401 / 403 or a model permission error?',
    authorizationAnswer: 'Check that your model is enabled and that the API key is valid and has access to that model in the current project.',
    modelQuestion: 'What if I get 404 / 405 or a model not found error?',
    modelAnswer: 'Check the protocol, request path, and model ID. This guide uses OpenAI Chat Completions with the final path /v1/chat/completions. Preserve the case and prefix of the model ID.',
    capabilityQuestion: 'Why does chat work while the agent fails to run tools?',
    capabilityAnswer: 'Check tool calling, streaming, and context length support for the model and service. Test a simple chat message first, then a tool call.',
  },
};

export default function ToolConnection({ onModels, onKeys }) {
  const [language, setLanguage] = useState('zh');
  const [query, setQuery] = useState('');
  const [selected, setSelected] = useState('workbuddy');
  const english = language === 'en';
  const t = translations[language];
  const visibleTools = toolGuides.filter(tool => {
    const searchText = [tool.name, tool.keywords, tool.zh.description, tool.en.description].join(' ').toLowerCase();
    return searchText.includes(query.trim().toLowerCase());
  });
  const active = visibleTools.find(tool => tool.id === selected) || visibleTools[0];
  const guide = active?.[language];
  const parameters = [
    [t.protocol, 'OpenAI Chat Completions'], [t.host, apiHost],
    ['Base URL', baseUrl], [t.endpoint, chatEndpoint], ['API Key', apiKey], [t.model, modelId],
  ];
  const sections = ['prepare', 'parameters', 'steps', 'verify', 'faq'];
  const message = english ? 'Hello, please introduce yourself.' : '你好，请简单介绍一下自己';
  const curl = [
    "curl '" + chatEndpoint + "' \\",
    "  -H 'Content-Type: application/json' \\",
    "  -H 'Authorization: Bearer " + apiKey + "' \\",
    "  -d '" + JSON.stringify({ model: modelId, messages: [{ role: 'user', content: message }], stream: false }) + "'",
  ].join('\n');

  return <div className="tool-access-page" lang={english ? 'en' : 'zh-CN'}>
    <FrontPageHeader title={t.title} description={t.subtitle} icon={Plug}
      actions={<Button theme="outline" lang={english ? 'zh-CN' : 'en'} onClick={() => setLanguage(english ? 'zh' : 'en')}>
        {english ? '简体中文' : 'English'}
      </Button>} />
    <section aria-labelledby="tool-access-tools" className="tool-access-picker">
      <div className="tool-access-row">
        <h2 id="tool-access-tools">{t.tools}</h2>
        <Input type="search" prefix={<Search size={16} aria-hidden="true" />} aria-label={t.search}
          placeholder={t.search} value={query} onChange={setQuery} showClear />
      </div>
      <div className="tool-access-options" role="group" aria-label={t.tools}>
        {visibleTools.map(tool => <Button key={tool.id} theme="outline" type="tertiary"
          aria-pressed={active.id === tool.id} onClick={() => setSelected(tool.id)}>
          <span className="tool-access-option">
            <span className="tool-access-mark" aria-hidden="true">{tool.mark}</span>
            <strong>{tool.name}</strong>
            {active.id === tool.id && <Check className="tool-access-check" size={16} aria-hidden="true" />}
            <span className="tool-access-description">{tool[language].description}</span>
          </span>
        </Button>)}
      </div>
      {!guide && <p role="status">{t.empty}</p>}
    </section>
    {guide && <div className="tool-access-layout">
      <article aria-labelledby="tool-access-guide-title" className="tool-access-guide">
        <div className="tool-access-row">
          <div>
            <h2 id="tool-access-guide-title">{english ? 'Use MoMA in ' + active.name : '在 ' + active.name + ' 中使用 MoMA'}</h2>
            <p>{guide.intro}</p>
          </div>
          <Button theme="outline" href={guide.url} target="_blank" rel="noopener noreferrer"
            icon={<ExternalLink size={14} aria-hidden="true" />}>{t.official}</Button>
        </div>
        <section id="tool-access-prepare" aria-labelledby="tool-access-prepare-title">
          <h3 id="tool-access-prepare-title">{t.prepare}</h3>
          <ul className="tool-access-preparation">
            <li>{t.modelPreparation} <Button size="small" theme="borderless" onClick={onModels}>{t.market}</Button></li>
            <li>{t.keyPreparation} <Button size="small" theme="borderless" onClick={onKeys}>{t.keys}</Button></li>
          </ul>
        </section>
        <section id="tool-access-parameters" aria-labelledby="tool-access-parameters-title">
          <h3 id="tool-access-parameters-title">{t.parameters}</h3>
          <p>{t.exampleNote}</p>
          <dl className="tool-access-parameters">
            {parameters.map(([label, value]) => <div key={label}>
              <dt>{label}</dt>
              <dd><code>{value}</code><ExampleCopy value={value} english={english}
                label={english ? 'Copy ' + label : '复制' + label} /></dd>
            </div>)}
          </dl>
        </section>
        <section id="tool-access-steps" aria-labelledby="tool-access-steps-title">
          <h3 id="tool-access-steps-title">{t.steps}</h3>
          <div key={active.id + language}>{guide.steps}</div>
        </section>
        <section id="tool-access-verify" aria-labelledby="tool-access-verify-title">
          <h3 id="tool-access-verify-title">{t.verify}</h3>
          <p>{t.verifyNote}</p>
          <div className="code-box">
            <div className="code-header"><span>cURL</span><ExampleCopy value={curl} english={english} /></div>
            <pre tabIndex={0} aria-label="cURL"><code>{curl}</code></pre>
          </div>
        </section>
        <section id="tool-access-faq" className="faq" aria-labelledby="tool-access-faq-title">
          <h3 id="tool-access-faq-title">{t.faq}</h3>
          {['address', 'authorization', 'model', 'capability'].map(topic => <details key={topic}>
            <summary>{t[topic + 'Question']}</summary>
            <p>{t[topic + 'Answer']}</p>
          </details>)}
        </section>
      </article>
      <nav className="tool-access-toc" aria-label={t.toc}>
        <strong>{t.toc}</strong>
        {sections.map(section => <Button key={section} size="small" theme="borderless" type="tertiary"
          onClick={() => document.getElementById('tool-access-' + section)?.scrollIntoView()}>{t[section]}</Button>)}
      </nav>
    </div>}
  </div>;
}
