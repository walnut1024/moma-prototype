import { useState } from 'react';
import { Button, CheckboxGroup, Dropdown, Input, Modal, RadioGroup, Select, Table, Tag, TextArea } from '@douyinfe/semi-ui';
import { ArrowRight, ExternalLink, GitBranch, Info, RotateCcw, Search, Trophy } from 'lucide-react';
import { shanghaiDate } from '../shanghai-date.mjs';
import { ROLE_DEMOS } from '../role-demo-data.mjs';
import { TimeSeriesChart } from './AnalyticsCharts';
import { ExampleCopy, toolGuides } from './tool-access-guides';
import './role-demo-tools.css';

const DAY = 86_400_000;
const number = new Intl.NumberFormat('zh-CN');
const compactNumber = new Intl.NumberFormat('zh-CN', { notation: 'compact', maximumFractionDigits: 1 });
const apiRoot = 'https://api.example.invalid/v1';
const chatEndpoint = apiRoot + '/chat/completions';
const modelId = 'moma/example-model';
const strategies = ['平衡模式', '成本优先', '效果优先'];
const strategyEnglish = { 平衡模式: 'Balanced', 成本优先: 'Cost First', 效果优先: 'Quality First' };
const routeModels = ['DeepSeek-R1', 'Qwen2.5-72B-Instruct'];

function SmartRoutes({ workspace, onPage, english }) {
  const t = (zh, en) => english ? en : zh;
  const { personal, project, projects, role } = workspace;
  const [routes, setRoutes] = useState(() => (personal ? [['个人通用问答', 0, 0]]
    : [['通用问答', 0, 0], ['文档摘要', 1, 1], ['客服助手', 2, 2], ['代码补全', 2, 0]])
    .map(([name, strategy, index], row) => ({
      id: 'route-' + (row + 1), name, strategy: strategies[strategy], projectId: projects[index]?.id || project.id,
      models: routeModels, creator: ROLE_DEMOS[role].name,
      created: shanghaiDate(new Date(Date.now() - (6 + row * 4) * DAY)) + ' 09:30:00',
    })));
  const [projectFilter, setProjectFilter] = useState('');
  const [query, setQuery] = useState('');
  const [dialog, setDialog] = useState(null);
  const [error, setError] = useState('');
  const rows = routes.filter(row => (!projectFilter || row.projectId === projectFilter)
    && row.name.toLowerCase().includes(query.trim().toLowerCase()));
  const projectName = id => projects.find(row => row.id === id)?.name || '—';
  const projectOptions = projects.map(({id, name}) => ({value: id, label: name}));
  function open(kind, row) {
    setError('');
    setDialog({ kind, row: row || { name: '', strategy: strategies[0], projectId: projectFilter || project.id, models: routeModels } });
  }
  function update(key, value) {
    setDialog({ ...dialog, row: { ...dialog.row, [key]: value } });
  }
  function save() {
    const name = dialog.row.name.trim();
    if (!name) { setError(t('请输入智能路由名称', 'Enter a route name')); return; }
    if (!dialog.row.models.length) { setError(t('至少选择一个备选模型', 'Select at least one candidate model')); return; }
    if (routes.some(row => row.id !== dialog.row.id && row.projectId === dialog.row.projectId && row.name === name)) {
      setError(t('此项目已有同名路由', 'This project already has a route with that name')); return;
    }
    const row = { ...dialog.row, name };
    setRoutes(previous => row.id ? previous.map(item => item.id === row.id ? row : item) : [{
      ...row, id: 'route-' + Date.now(), creator: ROLE_DEMOS[role].name,
      created: shanghaiDate(new Date()) + ' ' + new Date().toLocaleTimeString('zh-CN', { timeZone: 'Asia/Shanghai', hour12: false }),
    }, ...previous]);
    setDialog(null);
  }
  function confirm() {
    if (dialog.kind !== 'remove') { save(); return; }
    setRoutes(previous => previous.filter(row => row.id !== dialog.row.id));
    setDialog(null);
  }
  const columns = [
    { title: t('智能路由名称', 'Route Name'), dataIndex: 'name', width: 180 },
    { title: t('路由策略', 'Strategy'), dataIndex: 'strategy', width: 110, render: value => t(value, strategyEnglish[value]) },
    { title: t('状态', 'Status'), width: 85, render: () => <Tag color="green">{t('正常', 'Active')}</Tag> },
    ...(!personal ? [{ title: t('归属项目', 'Project'), width: 135, render: (_, row) => projectName(row.projectId) }] : []),
    { title: t('创建人', 'Created By'), dataIndex: 'creator', width: 116 },
    { title: t('创建时间', 'Created At'), dataIndex: 'created', width: 160 },
    { title: t('操作', 'Actions'), width: 195, render: (_, row) => <div className="role-tools-row-actions">
      <Button theme="borderless" size="small" onClick={() => open('api', row)}>{t('API调用', 'API Call')}</Button>
      <Dropdown trigger="click" clickToHide position="bottomRight" render={<Dropdown.Menu>
        <Dropdown.Item onClick={() => open('edit', row)}>{t('编辑', 'Edit')}</Dropdown.Item>
        <Dropdown.Item type="danger" onClick={() => open('remove', row)}>{t('删除', 'Delete')}</Dropdown.Item>
      </Dropdown.Menu>}>
        <Button theme="borderless" size="small" aria-label={t('更多操作：', 'More actions: ') + row.name}>{t('更多', 'More')}</Button>
      </Dropdown>
    </div> },
  ];
  const title = {
    create: t('新建智能路由', 'New Smart Route'), edit: t('编辑智能路由', 'Edit Smart Route'),
    remove: t('删除智能路由', 'Delete Smart Route'), api: t('API调用', 'API Call'), guide: t('操作引导', 'Quick Guide'),
  }[dialog?.kind];
  const apiExample = dialog?.row?.id && JSON.stringify({model: 'moma/' + dialog.row.id,
    messages: [{role: 'user', content: '请总结这段材料'}]}, null, 2);
  return <>
    <header className="role-tools-panel role-tools-route-heading">
      <span className="role-tools-route-icon"><GitBranch size={32} aria-hidden="true" /></span>
      <div><h1>{t('智能路由', 'Smart Routing')}</h1><p>{t('根据请求内容、上下文、性能需求或成本选择模型。',
        'Choose a model based on the request, context, performance requirements, or cost.')}</p></div>
      <Button theme="borderless" onClick={() => open('guide')}>{t('操作引导', 'Quick Guide')}</Button>
    </header>
    <section className="role-tools-panel role-tools-route-table" aria-label={t('智能路由列表', 'Smart routes')}>
      <div className="role-tools-row">
        <Button theme="solid" onClick={() => open('create')}>{t('＋ 新建智能路由', '＋ New Smart Route')}</Button>
        <div className="role-tools-filters">
          {!personal && <label><span id="role-tools-route-project">{t('归属项目', 'Project')}</span><Select aria-labelledby="role-tools-route-project"
            value={projectFilter} onChange={setProjectFilter} optionList={[{value:'',label:t('全部', 'All')}, ...projectOptions]} /></label>}
          <Input aria-label={t('按名称搜索', 'Search by name')} placeholder={t('按名称搜索', 'Search by name')} suffix={<Search size={15} aria-hidden="true" />}
            value={query} onChange={setQuery} showClear />
          <Button theme="borderless" icon={<RotateCcw size={15} aria-hidden="true" />}
            aria-label={t('重置条件', 'Reset filters')} onClick={() => { setQuery(''); setProjectFilter(''); }} />
        </div>
      </div>
      <Table columns={columns} dataSource={rows} rowKey="id" size="small" pagination={{ pageSize: 10, showTotal: true }}
        scroll={{ x: personal ? 760 : 900 }} empty={t('未找到智能路由', 'No routes found')} />
    </section>
    {dialog && <Modal title={title} visible onCancel={() => setDialog(null)}
      footer={['api','guide'].includes(dialog.kind) ? null : <>
        <Button onClick={() => setDialog(null)}>{t('取消', 'Cancel')}</Button>
        <Button theme="solid" type={dialog.kind === 'remove' ? 'danger' : 'primary'} onClick={confirm}>
          {dialog.kind === 'remove' ? t('删除', 'Delete') : t('保存', 'Save')}
        </Button>
      </>}>
      {dialog.kind === 'api' ? <>
        <p><strong>OpenAI Chat Completions</strong></p>
        <p><code>{chatEndpoint}</code></p>
        <pre className="role-tools-example"><code>{apiExample}</code></pre>
        <ExampleCopy value={apiExample} label={t('复制请求示例', 'Copy request example')} english={english} />
      </> : dialog.kind === 'guide' ? <ol className="role-tools-guide-list">
        <li>{t('新建路由并选择归属项目和路由策略。', 'Create a route and choose its project and strategy.')}</li>
        <li>{t('打开「API调用」，复制请求中的路由模型名。', 'Open API Call and copy the model ID in the request.')}</li>
        <li>{t('获取该项目的密钥。', 'Get a key for this project.')} <Button size="small" theme="borderless" onClick={() => onPage('api-keys')}>{t('API 密钥管理', 'API Key Management')}</Button></li>
      </ol> : dialog.kind === 'remove' ? <p>{t('确认删除「' + dialog.row.name + '」？', 'Delete ' + dialog.row.name + '?')}</p> : <div className="role-tools-route-form">
        <label>{t('路由名称', 'Route Name')}<Input value={dialog.row.name} onChange={value => update('name', value)} maxLength={50} /></label>
        <label><span id="role-tools-edit-strategy">{t('路由策略', 'Strategy')}</span><RadioGroup type="button" aria-labelledby="role-tools-edit-strategy"
          value={dialog.row.strategy} onChange={event => update('strategy', event.target.value)}
          options={strategies.map(value => ({value,label:t(value,strategyEnglish[value])}))} /></label>
        {!personal && <label><span id="role-tools-edit-project">{t('归属项目', 'Project')}</span><Select aria-labelledby="role-tools-edit-project"
          value={dialog.row.projectId} onChange={value => update('projectId', value)} optionList={projectOptions} /></label>}
        <div><span id="role-tools-edit-models">{t('模型备选集', 'Candidate Models')}</span><CheckboxGroup aria-labelledby="role-tools-edit-models"
          value={dialog.row.models} onChange={value => update('models', value)} options={routeModels} /></div>
        {error && <p role="alert">{error}</p>}
      </div>}
    </Modal>}
  </>;
}

const rankModels = [
  ['DeepSeek-R1','移动云-震泽',200100,99.1], ['Qwen2.5-72B-Instruct','移动云-MoMA',199100,98.6],
  ['BGE-M3','移动云-MoMA',197200,99.6], ['Qwen3-Omni-Flash','移动云-震泽',195900,98.4],
  ['Kimi-K3','移动云-MoMA',195000,99.3], ['Agnes-Image-2.5-Flash','移动云-震泽',194900,97.8],
  ['BGE-Reranker-V2-M3','移动云-MoMA',194800,99.5], ['HappyHorse-1.0-Video-Edit','移动云-MoMA',194200,97.4],
  ['SenseVoice','移动云-MoMA',193600,98.8], ['CosyVoice','移动云-震泽',186900,98.2],
];
const rankColors = ['#5689fb','#ffab41','#fb78a0','#5bd5bc','#8e9bfa','#f4a0e9','#8edc67','#417bf8','#ffb853','#f97ca7'];
const rankPeriods = [{value:'today',label:'今天'},{value:'week',label:'本周'},{value:'month',label:'本月'}];
const rankNames = rankModels.map(([name]) => name);

function ModelRanking({ english }) {
  const t = (zh, en) => english ? en : zh;
  const [metric, setMetric] = useState('usage');
  const [period, setPeriod] = useState('week');
  const [shownModels, setShownModels] = useState(rankNames);
  const stability = metric === 'stability';
  const weights = {today:[0.04,0.08,0.05,0.03,0.06,0.08],week:[0.158,0.151,0.145,0.143,0.139,0.127,0.137],
    month:[0.64,0.52,0.53,0.47]}[period];
  const labels = period === 'today' ? ['00:00','04:00','08:00','12:00','16:00','20:00']
    : weights.map((_, index) => period === 'month' ? t('第 ' + (index + 1) + ' 周', 'Week ' + (index + 1))
      : shanghaiDate(new Date(Date.now() - (weights.length - 1 - index) * DAY)).slice(5));
  const series = rankModels.map(([label,, tokens, success], index) => ({
    label, color: rankColors[index],
    values: weights.map((weight, bucket) => stability
      ? Math.min(100, Math.round((success + (((bucket + index) % 5) - 2) * 0.08) * 10) / 10)
      : Math.round(tokens * weight)),
  }));
  const rows = rankModels.map(([name, provider,, success], index) => ({
    name, provider, value: stability ? success : series[index].values.reduce((sum, value) => sum + value, 0),
  })).sort((left, right) => right.value - left.value);
  return <section className="role-tools-rank role-tools-panel">
    <header className="role-tools-rank-heading">
      <h1>{t('模型', 'Model ')}<span>{t('排行榜', 'Leaderboard')}</span> <Trophy size={25} color="#d89625" aria-hidden="true" /></h1>
      <RadioGroup type="button" value={metric} aria-label={t('排行榜类型', 'Ranking metric')}
        options={[{value:'usage',label:t('模型调用量', 'Model Usage')},{value:'stability',label:t('模型稳定性', 'Model Stability')}]}
        onChange={event => setMetric(event.target.value)} />
    </header>
    <div className="role-tools-rank-content">
      <div className="role-tools-row">
        <h2>{stability ? t('稳定性表现', 'Stability Overview') : t('Token调用情况', 'Token Usage')}</h2>
        <span className="sr-only" id="role-tools-rank-period">{t('排行时间', 'Ranking period')}</span>
        <Select aria-labelledby="role-tools-rank-period" value={period} onChange={setPeriod}
          optionList={rankPeriods.map((entry,index) => ({...entry,label:t(entry.label,['Today','This Week','This Month'][index])}))} />
      </div>
      <TimeSeriesChart labels={labels} series={series} height={256} unit={stability ? '%' : 'Token'} compact
        type={stability ? 'line' : 'bar'} stacked={!stability} domain={stability ? [94,100] : undefined}
        selectedNames={shownModels} onSelectNames={setShownModels}
        label={stability ? t('模型成功率趋势', 'Model Success Rate') : t('模型 Token 调用量', 'Model Token Usage')} showData={false} />
      <h2>{stability ? t('稳定性最高模型', 'Most Stable Models') : t('热门模型', 'Popular Models')}</h2>
      <ol className="role-tools-rank-list">{rows.map(({ name, provider, value }, index) => <li key={name}>
        <span className="role-tools-rank-position">{index + 1}</span>
        <span className="role-tools-rank-monogram" aria-hidden="true">{name[0]}</span>
        <div><strong>{name}</strong><small>{provider}</small></div>
        <b>{stability ? value.toFixed(1) + '%' : compactNumber.format(value) + ' Tokens'}</b>
      </li>)}</ol>
    </div>
  </section>;
}

const calculatorModels = [
  {value:'deepseek',label:'DeepSeek-R1',letters:4}, {value:'qwen',label:'Qwen2.5-72B-Instruct',letters:3},
  {value:'glm',label:'GLM-5.3',letters:4},
];
const samples = [
  '一站式模型服务平台汇聚优质模型、智能体，提供模型体验、API 调用和用量统计等功能，帮助团队快速验证 AI 应用。',
  '请将下面的客户留言归类为售前咨询、订单问题或技术支持，并提取最关键的问题。',
  'Summarize the latest meeting notes in three bullet points and list the owners for each action.',
];

function TokenCalculator({ english }) {
  const t = (zh, en) => english ? en : zh;
  const [sample, setSample] = useState(0);
  const [text, setText] = useState(samples[0]);
  const [model, setModel] = useState(calculatorModels[0].value);
  const { letters } = calculatorModels.find(item => item.value === model);
  const units = text.match(/[\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}]|[A-Za-z0-9]+|[^\s]/gu) || [];
  const tokens = units.flatMap(unit => Array.from({length:Math.ceil(unit.length / letters)}, (_, index) =>
    unit.slice(index * letters, (index + 1) * letters)));
  return <>
    <header className="role-tools-panel role-tools-calc-heading">
      <h1>{t('欢迎使用 ', 'Welcome to the ')}<span>{t('Token计算器', 'Token Calculator')}</span></h1>
      <p>{t('估算输入文本的 Token 消耗。实际值以调用返回的用量为准。',
        'Estimate token usage for your text. Check the model response for actual usage.')}</p>
    </header>
    <div className="role-tools-calculator">
      <section className="role-tools-panel role-tools-calc-input" aria-labelledby="role-tools-input">
        <div className="role-tools-row">
          <h2 id="role-tools-input">{t('文本输入', 'Text Input')}</h2>
          <span className="sr-only" id="role-tools-calc-model">{t('选择模型', 'Select model')}</span>
          <Select aria-labelledby="role-tools-calc-model" value={model} onChange={setModel}
            optionList={calculatorModels.map(({value,label}) => ({value,label}))} />
          <Button theme="borderless" icon={<RotateCcw size={14} aria-hidden="true" />} onClick={() => {
            const next = (sample + 1) % samples.length;
            setSample(next);
            setText(samples[next]);
          }}>{t('换个示例', 'Try Another Example')}</Button>
        </div>
        <TextArea aria-labelledby="role-tools-input" value={text} onChange={setText} maxCount={5000} autosize={{ minRows: 8, maxRows: 25 }}
          placeholder={t('输入或粘贴文本', 'Enter or paste text')} />
      </section>
      <section className="role-tools-calc-results" aria-labelledby="role-tools-results">
        <h2 id="role-tools-results">{t('Tokenize结果', 'Tokenization Results')}</h2>
        <dl className="role-tools-panel" aria-live="polite">
          <div><dt>{t('总 Tokens 数量', 'Total Tokens')}</dt><dd>{number.format(tokens.length)}</dd></div>
          <div><dt>{t('字符数', 'Characters')}</dt><dd>{number.format([...text].length)}</dd></div>
        </dl>
        <div className="role-tools-panel role-tools-token-preview">
          <p>{t('文本 Tokens', 'Text Tokens')}　{number.format(tokens.length)}</p>
          {tokens.length ? <div className="role-tools-token-chips">{tokens.slice(0, 250).map((token, index) =>
            <span key={index}>{token}</span>)}</div> : <p className="role-tools-muted">{t('输入文本后显示分词结果', 'Enter text to view tokens')}</p>}
          {tokens.length > 250 && <small>{t('显示前 250 个分词', 'Showing the first 250 tokens')}</small>}
        </div>
      </section>
    </div>
  </>;
}

const toolTags = { workbuddy:'自定义 API 接入', ccswitch:'需开启本地路由', trae:'自定义模型接入', dsh:'OpenAI 兼容接入' };
const englishToolTags = { workbuddy:'Custom API', ccswitch:'Local routing', trae:'Custom model', dsh:'OpenAI compatible' };
const guideSections = [['prepare','接入准备','Before You Start'],['parameters','平台接入参数','Connection Settings'],
  ['steps','配置步骤','Setup Steps'],['verify','验证接入','Verify the Connection'],['faq','常见问题','FAQ']];
const setup = {
  workbuddy: ['设置 → 模型 → 添加模型', '提供商选择「自定义」，勾选自定义协议并填写完整请求地址。'],
  ccswitch: ['Claude Code → 供应商 → 添加供应商', '选择 OpenAI 兼容协议，配置模型及完整请求地址，并开启本地路由接管。'],
  trae: ['设置 → 模型 → 添加模型', '选择自定义模型，填写完整请求地址、API 密钥和模型调用名。'],
  dsh: ['打开模型供应商配置', '为 OpenAI 兼容供应商填写 Base URL、API 密钥及模型调用名。'],
};

function ToolAccess({ onPage, english }) {
  const t = (zh, en) => english ? en : zh;
  const [query, setQuery] = useState('');
  const [selected, setSelected] = useState('workbuddy');
  const visible = toolGuides.filter(tool => Object.hasOwn(toolTags, tool.id)
    && [tool.name, tool.zh.description, tool.en.description, tool.keywords].join(' ').toLowerCase().includes(query.trim().toLowerCase()));
  const active = visible.find(tool => tool.id === selected) || visible[0];
  const guide = active?.[english ? 'en' : 'zh'];
  return <>
    <header className="role-tools-row role-tools-access-heading">
      <div><h1>{t('工具接入', 'Tool Access')}</h1><p>{t('将平台模型接入常用客户端和智能体。', 'Connect platform models to your tools and agents.')}</p></div>
      <Input type="search" prefix={<Search size={16} aria-hidden="true" />} aria-label={t('搜索工具或使用场景', 'Search tools or use cases')}
        placeholder={t('搜索工具或使用场景', 'Search tools or use cases')} value={query} onChange={setQuery} showClear />
    </header>
    <div className="role-tools-protocol"><Info size={16} aria-hidden="true" /><strong>{t('协议说明', 'API Protocol')}</strong>
      <span>{t('平台支持 OpenAI Chat Completions，Claude Code 通过 CC Switch 本地路由接入。',
        'The platform supports OpenAI Chat Completions. Use local routing through CC Switch for Claude Code.')}</span>
    </div>
    <section aria-labelledby="role-tools-choose">
      <div className="role-tools-row"><h2 id="role-tools-choose">{t('选择接入工具', 'Choose a Tool')}</h2>
        <small>{visible.length} {t('个工具', visible.length === 1 ? 'tool' : 'tools')}</small></div>
      <div className="role-tools-access-choices">{visible.map(tool => <button key={tool.id} type="button"
        className="role-tools-panel" aria-pressed={active.id === tool.id} onClick={() => setSelected(tool.id)}>
        <span className="role-tools-tool-icon">{tool.mark}</span><strong>{tool.name}</strong>
        <span className="role-tools-tool-description">{t(tool.zh.description, tool.en.description)}</span>
        <small>{t(toolTags[tool.id], englishToolTags[tool.id])}</small><ArrowRight size={15} aria-hidden="true" />
      </button>)}</div>
      {!active && <p role="status">{t('未找到匹配的工具。', 'No matching tools.')}</p>}
    </section>
    {active && <div className="role-tools-access-layout">
      <article className="role-tools-panel role-tools-access-guide">
        <header className="role-tools-row">
          <span className="role-tools-tool-icon">{active.mark}</span>
          <div><h2>{t('在 ' + active.name + ' 中使用平台模型', 'Use Platform Models in ' + active.name)}</h2><p>{guide.intro}</p></div>
          <Button theme="borderless" href={guide.url} target="_blank" rel="noopener noreferrer"
            icon={<ExternalLink size={14} aria-hidden="true" />}>{t('官方文档', 'Official Docs')}</Button>
        </header>
        <section id="role-tools-guide-prepare"><h2>{t('接入准备', 'Before You Start')}</h2>
          <ol className="role-tools-prepare">
            <li><strong>{t('开通模型服务', 'Enable a model service')}</strong><Button size="small" theme="borderless" onClick={() => onPage('model-market')}>{t('前往模型广场', 'Model Marketplace')}</Button></li>
            <li><strong>{t('获取 API 密钥', 'Get an API key')}</strong><Button size="small" theme="borderless" onClick={() => onPage('api-keys')}>{t('API 密钥管理', 'API Key Management')}</Button></li>
            <li><strong>{t('确认调用模型名', 'Find the model ID')}</strong><span>{t('从模型详情的调用示例复制 model 字段。', 'Copy the model field from the request example.')}</span></li>
          </ol>
        </section>
        <section id="role-tools-guide-parameters"><h2>{t('平台接入参数', 'Connection Settings')}</h2>
          <dl className="role-tools-parameters">{[
            [t('接口协议', 'API protocol'),'OpenAI Chat Completions'], [t('完整请求地址', 'Full request URL'),chatEndpoint],
            ['Base URL',apiRoot], [t('API 密钥', 'API key'),t('使用当前项目有调用权限的 API 密钥', 'Use a project API key with model access')],
            [t('模型名称 / ID', 'Model name / ID'),modelId],
          ].map(([label,value], index) => <div key={label}><dt>{label}</dt><dd><code>{value}</code>
            {[1,2,4].includes(index) && <ExampleCopy value={value} label={t('复制', 'Copy ') + label} english={english} />}</dd></div>)}</dl>
        </section>
        <section id="role-tools-guide-steps"><h2>{t('配置步骤', 'Setup Steps')}</h2><ol className="role-tools-guide-list">
          {(english ? ['Open the tool’s custom model settings.', 'Enter the endpoint, API key, and model ID from Connection Settings.']
            : setup[active.id]).map(step => <li key={step}>{step}</li>)}
          <li>{t('保存配置，在客户端选中刚添加的模型。', 'Save and select the model you added.')}</li>
        </ol></section>
        <section id="role-tools-guide-verify"><h2>{t('验证接入', 'Verify the Connection')}</h2>
          <p>{t('发送一条简短的对话请求。成功时返回 HTTP 200，并在 ', 'Send a short chat request. A successful response returns HTTP 200 and a reply in ')}
            <code>choices[0].message.content</code>{t(' 中返回模型回复。', '.')}</p>
        </section>
        <section id="role-tools-guide-faq"><h2>{t('常见问题', 'FAQ')}</h2>
          <details><summary>Base URL 和完整请求地址应该填哪个？</summary><p>DeepSeek Harness 使用 Base URL；其余工具按配置步骤填写完整请求地址。</p></details>
          <details><summary>如何排查 401 或 403？</summary><p>检查 API 密钥是否有效，以及所属项目是否可调用配置的模型。</p></details>
          <details><summary>返回模型不存在怎么办？</summary><p>从模型详情复制完整模型调用名，保留前缀及大小写。</p></details>
        </section>
      </article>
      <nav aria-label={t('本页目录', 'On This Page')} className="role-tools-toc"><strong>{t('本页目录', 'On This Page')}</strong>
        {guideSections.map(([id,zh,en]) => <Button key={id} theme="borderless" type="tertiary"
          onClick={() => document.getElementById('role-tools-guide-' + id)?.scrollIntoView()}>{t(zh,en)}</Button>)}
      </nav>
    </div>}
  </>;
}

export function RoleDemoTools({ page, workspace, onPage, english }) {
  return <div className="role-tools">
    {page === 'smart-route' && (workspace.personal || workspace.canManageTenant)
      && <SmartRoutes workspace={workspace} onPage={onPage} english={english} />}
    {page === 'model-ranking' && <ModelRanking english={english} />}
    {page === 'token-calculator' && <TokenCalculator english={english} />}
    {page === 'tool-connection' && <ToolAccess onPage={onPage} english={english} />}
  </div>;
}
