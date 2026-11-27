import { useId, useRef, useState } from 'react';
import { Button, Card, Checkbox, Dropdown, Input, Select, Table, Tabs, Tag } from '@douyinfe/semi-ui';
import { Activity, ArrowRight, ChartNoAxesCombined, Download, FileText, Flame, Image, KeyRound, Plus, Search, ShoppingCart, SlidersHorizontal, Video } from 'lucide-react';
import { AdminModal } from '../admin-v2/AdminOverlay';
import { ROLE_DEMO_CATALOGUE } from '../role-demo-catalogue.mjs';
import { roleDemoWorkspace } from '../role-demo-data.mjs';
import { shanghaiDate } from '../shanghai-date.mjs';
import { TimeSeriesChart } from './AnalyticsCharts';
import FrontPageHeader from './FrontPageHeader';
import './role-demo-business.css';

const number = value => Number.isFinite(value) ? value.toLocaleString('zh-CN', { maximumFractionDigits: 6 }) : '—';
const money = value => Number.isFinite(value) ? '¥' + number(value) : '—';
const all = [{ value: '', label: '全部' }];
const option = (value, label = value) => ({ value, label });
const column = (title, dataIndex, extra) => ({ title, dataIndex, ...extra });
const tags = value => <Tag color={['成功', '生效中', '使用中', '按量实例'].includes(value) ? 'green' : value === '失败' ? 'red' : undefined}>{value}</Tag>;
const types = ['语言模型', '视觉模型', '多模态模型', '语音模型', '向量模型'];
const modelType = { text: types[0], image: types[1], video: types[1], voice: types[3] };
const providerName = '移动云 MoMA';
const modalityIcons = { 文本: FileText, 图片: Image, 视频: Video, '→': ArrowRight };
const today = () => shanghaiDate(new Date());
const daysAgo = days => shanghaiDate(new Date(Date.now() - days * 86_400_000));
const usagePeriods = [['today', '今日', 0], ['yesterday', '昨日', 1], ['week', '近 7 天', 6], ['month', '近 30 天', 29], ['custom', '自定义']];
const matches = (query, values) => values.some(value => String(value || '').toLowerCase().includes(query.trim().toLowerCase()));

function orderCatalogue(experiences) {
  return [
    { id: 'glm', name: 'GLM-5.2', type: types[0], context: '200K', modality: '文本 → 文本', hot: true, task: 'text',
      desc: '面向复杂推理和程序设计的语言模型，支持多轮对话与长文分析。', provider: providerName },
    { id: 'kimi', name: 'Kimi-K3', type: types[0], context: '1M', modality: '文本 → 文本', hot: true, task: 'text',
      desc: '支持长上下文和工具调用，适合研发联调与客服检索。', provider: providerName },
    { id: 'qwen', name: 'Qwen3.7-Max', type: types[0], modality: '文本 → 文本', hot: true, task: 'text',
      desc: '支持长文理解、业务问答和结构化内容输出。', provider: providerName },
    ...Object.entries(experiences).map(([task, model]) => ({
      id: task, task, name: model.model, type: modelType[task], modality: model.tags,
      desc: model.description, provider: providerName, hot: task === 'text',
    })),
    { id: 'embedding', name: 'Text-Embedding-V4', type: types[4], context: '8K', modality: '文本 → 向量',
      desc: '通用文本向量模型，适合语义检索、分类和相似度匹配。', provider: providerName, preview: true },
  ];
}

function Header({ title, icon, description, actions }) {
  const Icon = icon;
  return <div className="demo-business-hero">
    <span className="demo-business-hero-icon"><Icon size={40} strokeWidth={1.5} aria-hidden="true" /></span>
    <FrontPageHeader title={title} description={description} actions={actions} />
  </div>;
}

function Filter({ label, value, onChange, options }) {
  const id = useId();
  return <div className="demo-business-filter"><span id={id}>{label}</span><Select aria-labelledby={id} value={value} onChange={onChange}
    optionList={options} /></div>;
}

function SearchInput({ label, value, onChange, placeholder }) {
  return <Input className="role-demo-page-search" aria-label={label} placeholder={placeholder || label} value={value}
    onChange={onChange} showClear suffix={<Search size={15} aria-hidden="true" />} />;
}

function DemoTable({ columns, rows, width, empty, rowSelection }) {
  return <Table columns={columns} dataSource={rows} rowKey="id" size="small" scroll={{ x: width }}
    pagination={{ pageSize: 10, showTotal: true, hideOnSinglePage: false }} empty={empty || '当前范围暂无记录'} rowSelection={rowSelection} />;
}

const catalogueLogoPositions = new Map(ROLE_DEMO_CATALOGUE.map(({name},index) =>
  [name,(index % 8 * 100 / 7) + '% ' + (Math.floor(index / 8) * 100 / 7) + '%']));

const modelTask = model => {
  const outputs = model.types.slice(model.types.indexOf('→') + 1);
  return outputs.includes('视频') ? 'video' : outputs.includes('图片') ? 'image' : 'text';
};

function DemoMarket({ workspace, onPage }) {
  const sortId = useId();
  const [query, setQuery] = useState('');
  const [featured, setFeatured] = useState(false);
  const [showFilters, setShowFilters] = useState(false);
  const [input, setInput] = useState('');
  const [output, setOutput] = useState('');
  const [provider, setProvider] = useState('');
  const [sort, setSort] = useState('latest');
  const [detail, setDetail] = useState(null);
  const providers = [...new Set(ROLE_DEMO_CATALOGUE.map(row => row.provider).filter(Boolean))];
  const rows = ROLE_DEMO_CATALOGUE.filter(row => {
    const separator = row.types.indexOf('→');
    return (!input || row.types.slice(0, separator).includes(input)) && (!output || row.types.slice(separator + 1).includes(output))
      && (!provider || row.provider === provider) && (!featured || row.badge === '热推') && matches(query, [row.name]);
  });
  if (sort === 'name') rows.sort((a, b) => a.name.localeCompare(b.name));
  if (sort === 'hot') rows.sort((a, b) => (b.score || 0) - (a.score || 0));
  return <>
    <FrontPageHeader title="模型广场" actions={<Checkbox aria-label="显示精选模型" checked={featured} onChange={event => setFeatured(event.target.checked)}>显示精选模型</Checkbox>} />
    <div className="role-demo-page-tools">
      <Button aria-expanded={showFilters} aria-controls="demo-market-filters" icon={<SlidersHorizontal size={15} />}
        onClick={() => setShowFilters(value => !value)}>{showFilters ? '收起筛选器' : '展开筛选器'}</Button>
      <SearchInput label="搜索模型" placeholder="请输入模型展示名称" value={query} onChange={setQuery} />
      <span id={sortId} className="sr-only">模型排序</span>
      <Select aria-labelledby={sortId} value={sort} onChange={setSort}
        optionList={[option('latest', '最近更新'), option('hot', '热门优先'), option('name', '模型名称')]} />
      <span className="role-demo-page-count" role="status">模型 {rows.length} 个</span>
    </div>
    <div className="demo-market-filter" id="demo-market-filters" hidden={!showFilters}>
      <Filter label="输入模态" value={input} onChange={setInput} options={[...all, ...['文本', '图片', '视频'].map(value => option(value))]} />
      <Filter label="输出模态" value={output} onChange={setOutput} options={[...all, ...['文本', '图片', '视频'].map(value => option(value))]} />
      <Filter label="服务商" value={provider} onChange={setProvider} options={[...all, ...providers.map(value => option(value))]} />
    </div>
    {rows.length ? <div className="role-demo-page-grid">{rows.map(model => <article className="demo-market-card" key={model.name}>
      <div className="role-demo-page-actions"><Tag color="green">{model.pricing}</Tag>
        {model.badge && <Tag color={model.badge === '热推' ? 'orange' : 'grey'}>{model.badge}</Tag>}
        {model.score != null && <span className="demo-market-score"><Flame size={13} aria-hidden="true" />{model.score}</span>}
      </div>
      <h2 className="role-demo-page-model"><span className="demo-market-model-logo" aria-hidden="true"
        style={{backgroundPosition:catalogueLogoPositions.get(model.name)}} />
        {model.badge === '敬请期待' ? model.name : <button type="button" onClick={() => setDetail(model)}>{model.name}</button>}
      </h2>
      <p>{model.description}</p><small>服务商：{model.provider}</small>
      <div className="role-demo-page-actions">
        <span role="img" className="demo-market-modalities" aria-label={model.types.join(' ')}>{model.types.map((value, index) => {
          const Icon = modalityIcons[value] || FileText;
          return <Icon key={value + index} size={14} aria-hidden="true" />;
        })}</span>
        {model.context && <span>上下文窗口：{model.context}</span>}
      </div>
    </article>)}</div> : <Card className="role-demo-page-panel">未找到符合条件的模型</Card>}
    {detail && <AdminModal title={detail.name} visible onCancel={() => setDetail(null)} width="min(560px, calc(100vw - 32px))" footer={
      <div className="role-demo-page-tools">
        {detail.actions.includes('立即体验') && <Button onClick={() => { setDetail(null); onPage(modelTask(detail)); }}>立即体验</Button>}
        {detail.actions.includes('API调用') && <Button onClick={() => { setDetail(null); onPage('api-keys'); }}>API 调用</Button>}
        {workspace.canOrder && detail.actions.includes('立即订购') && <Button theme="solid" onClick={() => { setDetail(null); onPage('model-order'); }}>立即订购</Button>}
        <Button theme="borderless" onClick={() => setDetail(null)}>关闭</Button>
      </div>}>
      <p>{detail.description}</p><p>{[detail.provider, detail.vendorType, detail.types.join(' ')].filter(Boolean).join(' · ')}</p>
    </AdminModal>}
  </>;
}

function initialKeys(workspace) {
  return workspace.keys.map((row, index) => ({
    ...row, category: row.billing === 'Token Plan' ? 'plan' : 'usage', description: '项目模型调用',
    created: (row.createdAt || daysAgo(24 + index * 7)).slice(0, 10),
    calls: workspace.records.filter(record => record.keyId === row.id).length,
    rpm: Math.max(20, 120 - index * 20), tpm: Math.max(8_000, 60_000 - index * 10_000),
  }));
}

function DemoKeys({ workspace, onPage }) {
  const [tab, setTab] = useState('usage');
  const [query, setQuery] = useState('');
  const [project, setProject] = useState('');
  const [creator, setCreator] = useState('');
  const [planFilter, setPlanFilter] = useState('');
  const [pendingDelete, setPendingDelete] = useState(null);
  const [edit, setEdit] = useState(null);
  const [targetId, setTargetId] = useState(workspace.project.id);
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [plan, setPlan] = useState('');
  const contexts = workspace.projects.map(row => row.id === workspace.project.id
    ? workspace : roleDemoWorkspace(workspace.actorId || workspace.role, row.id));
  const manageable = new Set(contexts.filter(item => item.canManageProject).map(item => item.project.id));
  const [changes, setChanges] = useState(() => contexts.flatMap(initialKeys));
  const actorName = workspace.actor?.name;
  const canEdit = row => manageable.has(row.projectId) || Boolean(actorName && row.user === actorName);
  const showCreator = workspace.canManageProject && !workspace.personal;
  const eligible = contexts.filter(item => tab === 'usage' || item.plans.length);
  const allPlans = contexts.filter(item => !project || item.project.id === project).flatMap(item=>item.plans);
  const activePlans = eligible.find(item => item.project.id === targetId)?.plans || [];
  const rows = changes.filter(row => row.category === tab && (!project || row.projectId === project) && (!creator || row.user === creator)
    && (tab !== 'plan' || !planFilter || row.plan === planFilter) && matches(query, [row.name, row.model]));
  const chooseTarget = id => {
    setTargetId(id);
    setPlan(eligible.find(item => item.project.id === id)?.plans[0]?.id || '');
  };
  const begin = row => {
    if (row && !canEdit(row)) return;
    setEdit(row || {});
    setName(row?.name || '');
    setDescription(row?.description || '');
    chooseTarget(row?.projectId || eligible.find(item => item.project.id === (project || workspace.project.id))?.project.id || eligible[0]?.project.id);
  };
  const validTarget = eligible.some(item => item.project.id === targetId)
    && (tab === 'usage' || activePlans.some(item => item.id === plan));
  const save = () => {
    if (!name.trim() || (edit.id ? !canEdit(edit) : !validTarget)) return;
    if (edit.id) setChanges(current => current.map(row => row.id === edit.id && canEdit(row) ? { ...row, name: name.trim(), description } : row));
    else setChanges(current => [...current, {
      id: 'demo-key-' + current.length, name: name.trim(), description, category: tab, plan, masked: 'sk-demo-*****' + String(current.length + 1).padStart(4, '0'),
      projectId: targetId, user: actorName,
      status: '生效中', created: today(), calls: 0,
    }]);
    setEdit(null);
  };
  const columns = [
    column('密钥名称', 'name', { width: 145 }), column('API 密钥', 'masked', { width: 145, render: value => <code>{value}</code> }),
    column('归属项目', 'projectId', { width: 125, render: value => workspace.projects.find(row => row.id === value)?.name }),
    ...(tab === 'plan' ? [column('归属套餐', 'plan', { width: 135, render: id => contexts.flatMap(item=>item.plans).find(item=>item.id===id)?.name || '—' })]
      : [...(showCreator ? [column('创建者', 'user', { width: 110 })] : []), column('描述', 'description', { width: 150 })]),
    column('状态', 'status', { width: 95, render: tags }), ...(tab === 'usage' ? [column('创建时间', 'created', { width: 115 })] : []),
    column('调用量', 'calls', { width: 80, render: number }), column('RPM', 'rpm', { width: 72, render: number }),
    column('TPM', 'tpm', { width: 80, render: number }), column('有效期（北京时间）', 'expiresAt', { width: 140, render: value => value || '—' }),
    { title: '操作', width: 126, render: (_, row) => canEdit(row) ? <div className="demo-inline-actions">
      <Button size="small" theme="borderless" onClick={() => begin(row)}>编辑</Button>
      <Dropdown trigger="click" clickToHide position="bottomRight" render={<Dropdown.Menu>
        <Dropdown.Item onClick={() => setChanges(current => current.map(item => item.id === row.id && canEdit(item)
          ? { ...item, status: item.status === '生效中' ? '已停用' : '生效中' } : item))}>{row.status === '生效中' ? '停用' : '启用'}</Dropdown.Item>
        <Dropdown.Item type="danger" onClick={()=>setPendingDelete(row)}>删除</Dropdown.Item>
      </Dropdown.Menu>}><Button size="small" theme="borderless">更多</Button></Dropdown>
    </div> : '—' },
  ];
  return <>
    <Header title="API 密钥管理" icon={KeyRound} description="管理可访问项目的按量 API 与 TokenPlan API 密钥。" />
    <Tabs className="demo-business-tabs" activeKey={tab} onChange={setTab} tabList={[{ itemKey: 'usage', tab: '按量 API' }, { itemKey: 'plan', tab: 'TokenPlan API' }]} />
    <Card className="role-demo-page-panel demo-business-tab-panel">
      <div className="role-demo-page-tools demo-business-toolbar">
        <Button theme="solid" icon={<Plus size={14} />} onClick={() => begin(null)}
          disabled={!eligible.length}>{tab === 'plan' ? '新建 TokenPlan 密钥' : '新建 API 密钥'}</Button>
        <div className="role-demo-page-tools demo-business-toolbar-end">
          {!workspace.personal && <Filter label="归属项目" value={project} onChange={setProject}
            options={[...all, ...workspace.projects.map(row => option(row.id, row.name))]} />}
          {showCreator && <Filter label="创建者" value={creator} onChange={setCreator}
            options={[...all, ...[...new Set(changes.map(row => row.user))].map(value => option(value))]} />}
          {tab === 'plan' && <Filter label="归属套餐" value={planFilter} onChange={setPlanFilter}
            options={[...all,...allPlans.map(item=>option(item.id,item.name))]} />}
          <SearchInput label="搜索密钥" placeholder="搜索密钥名称" value={query} onChange={setQuery} />
        </div>
      </div>
      <DemoTable columns={columns} rows={rows} width={workspace.canManageProject ? 1220 : 970} empty="没有符合条件的密钥" />
      {tab === 'plan' && eligible.length === 0 && workspace.canOrder && <Button theme="borderless" onClick={() => onPage('model-order', { tab: 'plan' })}>查看 Token Plan 订阅</Button>}
    </Card>
    {tab === 'usage' && <Card className="role-demo-page-panel" title="体验托管密钥">
      <p>在线体验由系统自动使用当前项目的托管密钥。</p>
      <DemoTable rows={[{id:workspace.project.id,name:'系统托管密钥',project:workspace.project.name,kind:'在线体验'}]}
        columns={[column('名称','name'),column('归属项目','project'),column('类型','kind'),
          {title:'操作',render:()=> <Button size="small" theme="borderless" onClick={() => onPage('text')}>进入体验</Button>}]} width={440} />
    </Card>}
    {pendingDelete && <AdminModal visible title="删除密钥" okText="删除" okType="danger"
      onCancel={()=>setPendingDelete(null)} onOk={()=>{
        if (canEdit(pendingDelete)) setChanges(rows=>rows.filter(row=>row.id!==pendingDelete.id));
        setPendingDelete(null);
      }}>删除后，演示密钥「{pendingDelete.name}」将从列表中移除。</AdminModal>}
    {edit && <AdminModal visible title={edit.id ? '编辑 API 密钥' : tab === 'plan' ? '新建 TokenPlan 密钥' : '新建 API 密钥'}
      okText={edit.id ? '保存' : '创建 API 密钥'} onCancel={() => setEdit(null)} onOk={save}
      okButtonProps={{ disabled: !name.trim() || !edit.id && !validTarget }}>
      <div className="demo-business-dialog-form">
        {!edit.id && <Filter label="归属项目" value={targetId} onChange={chooseTarget}
          options={eligible.map(item => option(item.project.id, item.project.name))} />}
        <label>密钥名称<Input aria-label="密钥名称" value={name} onChange={setName} maxLength={64} /></label>
        {workspace.canManageProject && <label>描述<Input aria-label="描述" value={description} onChange={setDescription} maxLength={140} /></label>}
        {tab === 'plan' && !edit.id && <Filter label="Token Plan" value={plan} onChange={setPlan} options={activePlans.map(item => option(item.id, item.name))} />}
      </div>
    </AdminModal>}
  </>;
}

function DemoOrder({ workspace, models, initialTab }) {
  const [tab, setTab] = useState(initialTab === 'plan' ? 'plan' : 'usage');
  const [query, setQuery] = useState('');
  const [checked, setChecked] = useState([]);
  const [action, setAction] = useState('');
  const [candidate, setCandidate] = useState('');
  const [orders, setOrders] = useState(() => models.filter(item => workspace.project.models.includes(item.name)));
  const [plans, setPlans] = useState(workspace.plans);
  if (!workspace.canOrder) return <Card className="role-demo-page-panel">请联系租户管理员订购模型服务。</Card>;
  const isPlan = tab === 'plan';
  const rows = (isPlan ? plans : orders).filter(row => matches(query, [row.name]));
  const available = isPlan
    ? [{ id: 'team', name: '通用模型增强包', used: 0, total: 1_000_000, expiresAt: daysAgo(-30) }].filter(row => !plans.some(item => item.id === row.id))
    : models.filter(row => !row.preview && !orders.some(item => item.id === row.id));
  const setItems = isPlan ? setPlans : setOrders;
  const remove = () => {
    setItems(items => items.filter(item => !checked.includes(item.id)));
    setChecked([]);
    setAction('');
  };
  const subscribe = () => {
    const item = available.find(row => row.id === candidate);
    if (!item) return;
    setItems(items => [...items, { ...item, created: today() }]);
    setAction('');
  };
  const common = [
    column('订购状态', 'status', { render: () => tags('使用中') }),
    column('到期时间', 'expiresAt', { render: value => value || '长期有效' }),
    { title: '操作', render: (_, row) => <Button size="small" theme="borderless" onClick={() => { setChecked([row.id]); setAction('remove'); }}>退订</Button> },
  ];
  const orderFields = [column('规格名称', 'name'), column('模型类别', 'type'), column('模型服务商', 'provider'),
    column('资费场景', 'billing', { render: () => '按调用量计费' }),
    column('目录价', 'price', { render: (_, row) => row.type === types[0] ? '输入 ¥2 / 百万 Token' : '—' }),
    column('订购时间', 'created', { render: value => value || daysAgo(25) })];
  const planFields = [column('套餐名称', 'name'), column('套餐额度', 'total', { render: value => number(value) + ' Token' }),
    column('已使用', 'used', { render: value => number(value) + ' Token' })];
  return <>
    <Header title="订购模型管理" icon={ShoppingCart} description="查看付费模型订购情况" />
    <Tabs className="demo-business-tabs" activeKey={tab} onChange={value => { setTab(value); setChecked([]); setQuery(''); }}
      tabList={[{ itemKey: 'usage', tab: '按Token用量计费' }, { itemKey: 'plan', tab: 'Token Plan订阅' }]} />
    <Card className="role-demo-page-panel demo-business-tab-panel">
      <div className="demo-business-notice">{isPlan ? `当前项目关联 ${plans.length} 个 Token Plan，可查看订阅额度和到期时间。`
        : `当前项目已订购 ${orders.length} 个按量模型服务。`}</div>
      <div className="role-demo-page-tools demo-business-toolbar">
        <Button theme="solid" icon={<ShoppingCart size={14} />} onClick={() => { setCandidate(available[0]?.id || ''); setAction('add'); }} disabled={!available.length}>立即订购</Button>
        <Button disabled={!checked.length} onClick={() => setAction('remove')}>批量退订</Button>
        <div className="role-demo-page-tools demo-business-toolbar-end"><SearchInput label="搜索规格名称" value={query} onChange={setQuery} /></div>
      </div>
      <DemoTable columns={[...(isPlan ? planFields : orderFields), ...common]} rows={rows} width={1100}
        rowSelection={{ selectedRowKeys: checked, onChange: setChecked }} />
    </Card>
    {action && <AdminModal visible title={action === 'add' ? '立即订购' : '确认退订'} onCancel={() => setAction('')}
      onOk={action === 'add' ? subscribe : remove} okButtonProps={{ disabled: action === 'add' ? !candidate : !checked.length }}>
      {action === 'add' ? <Filter label={isPlan ? '选择套餐' : '选择模型'} value={candidate} onChange={setCandidate}
        options={available.map(item => option(item.id, item.name))} /> : <p>退订选中的 {checked.length} 条演示订购记录。</p>}
    </AdminModal>}
  </>;
}

function recordRows(workspace) {
  const keys = new Map(workspace.keys.map(key => [key.id, key]));
  return workspace.records.map((row, index) => {
    const time = row.createdAt?.slice(0, 19).replace('T', ' ') || row.date;
    return { ...row, time, provider: providerName, type: types[0],
      keyName: keys.get(row.keyId)?.name, source: row.source,
      channel: row.billing === 'Token Plan' ? '订阅实例' : '按量实例',
      first: row.status === '成功' ? 110 + (index % 7) * 9 : null, latency: row.status === '成功' ? 440 + (index % 9) * 33 : null,
    };
  });
}

function useReportScope(workspace) {
  const id = useId();
  const [projectIds, setProjectIds] = useState([workspace.project.id]);
  const [user, setUser] = useState('');
  const contexts = workspace.projects.filter(row => projectIds.includes(row.id)).map(row =>
    row.id === workspace.project.id ? workspace : roleDemoWorkspace(workspace.actorId || workspace.role, row.id));
  const keys = contexts.flatMap(item => item.keys);
  const records = contexts.flatMap(recordRows);
  const users = [...new Set(records.map(row => row.user))];
  const chooseProjects = value => { setProjectIds(value); setUser(''); };
  const actions = workspace.personal ? null : <div className="demo-business-scope">
    <span id={id + '-projects'} className="sr-only">筛选项目</span>
    <Select multiple maxTagCount={1} aria-labelledby={id + '-projects'} placeholder="选择项目" value={projectIds} onChange={chooseProjects}
      optionList={workspace.projects.map(row => option(row.id, row.name))} />
    {users.length > 1 && <><span id={id + '-users'} className="sr-only">筛选用户</span>
      <Select aria-labelledby={id + '-users'} value={user} onChange={setUser}
        optionList={[option('', '全部用户'), ...users.map(value => option(value))]} /></>}
  </div>;
  return { keys, records: user ? records.filter(row => row.user === user) : records, actions };
}

function DateFields({ from, to, onChange }) {
  return <div className="demo-date-fields">
    <label>开始日期<input type="date" aria-label="开始日期" value={from} max={to} onChange={event => onChange({ from: event.target.value, to })} /></label>
    <label>结束日期<input type="date" aria-label="结束日期" value={to} min={from} onChange={event => onChange({ from, to: event.target.value })} /></label>
  </div>;
}

function selectRows(rows, values, type) {
  return rows.filter(row => (!type || row.type === type)
    && (!values.from || row.date >= values.from) && (!values.to || row.date <= values.to)
    && ['provider', 'model', 'source', 'keyId', 'user', 'status', 'type'].every(key => !values[key] || row[key] === values[key]));
}

function RecordFilters({ values, setValues, workspace, keys, rows, variant }) {
  const filter = (label, key, options) => <Filter label={label} value={values[key] || ''} onChange={value => setValues(current => ({ ...current, [key]: value }))}
    options={[...all, ...options]} />;
  const names = key => [...new Set(rows.map(row => row[key]).filter(Boolean))].map(value => option(value));
  const provider = filter('服务商', 'provider', names('provider'));
  const model = filter('模型名称', 'model', names('model'));
  const key = filter('API 密钥', 'keyId', keys.map(row => option(row.id, row.name)));
  const source = filter(variant === 'logs' ? '调用类型' : '调用来源', 'source', [option('API 调用'), option('在线体验')]);
  return variant === 'logs' ? <>{provider}{key}{model}{source}
    {filter('模型类型', 'type', types.map(value => option(value)))}
    {filter('请求状态', 'status', [option('成功'), option('失败')])}
  </> : <>{provider}{model}{source}{key}
    {workspace.canManageProject && !workspace.personal && filter('用户', 'user', names('user'))}
  </>;
}

function DemoUsage({ workspace, onPage }) {
  const [type, setType] = useState(types[0]);
  const [period, setPeriod] = useState('week');
  const [draft, setDraft] = useState(() => ({ from: daysAgo(6), to: today() }));
  const [values, setValues] = useState(draft);
  const [million, setMillion] = useState(false);
  const { keys, records: rows, actions } = useReportScope(workspace);
  const selected = selectRows(rows.filter(row => row.billing !== 'Token Plan'), values, type);
  const hour = values.granularity === 'hour';
  const bucket = row => hour ? row.time.slice(0, 13) + ':00' : row.date;
  const dates = [...new Set(selected.map(bucket))].sort();
  const inTotal = selected.reduce((sum, row) => sum + row.input, 0);
  const outTotal = selected.reduce((sum, row) => sum + row.output, 0);
  const successful = selected.filter(row => row.status === '成功').length;
  const divisor = million ? 1_000_000 : 1;
  const tokenUnits = million ? '百万 Token' : 'Token';
  const bucketTotal = (date, key) => selected.filter(row => bucket(row) === date).reduce((sum, row) => sum + row[key], 0) / divisor;
  const kpis = [
    ['调用模型数', new Set(selected.map(row => row.model)).size], ['调用成功次数', successful], ['调用失败次数', selected.length - successful],
    ['Token 总量', (inTotal + outTotal) / divisor], ['输入 Token 总量', inTotal / divisor], ['输出 Token 总量', outTotal / divisor],
    ['单次请求平均 Token', selected.length ? Number(((inTotal + outTotal) / divisor / selected.length).toFixed(2)) : null],
    ...(workspace.canOrder ? [['费用', money(selected.reduce((sum, row) => sum + row.cost, 0))]] : []),
    ['成功率', selected.length ? (successful / selected.length * 100).toFixed(1) + '%' : '—'],
  ];
  function choosePeriod(value) {
    setPeriod(value);
    const choice = usagePeriods.find(row => row[0] === value);
    if (choice[2] !== undefined) setDraft(current => ({ ...current, from: daysAgo(choice[2]), to: value === 'yesterday' ? daysAgo(1) : today() }));
  }
  return <>
    <Header title="用量统计" icon={ChartNoAxesCombined} description="观测模型的使用情况以及性能指标。"
      actions={<div className="demo-business-report-header">{actions}
        <small>快照更新时间 {rows.map(row => row.time).sort().at(-1) || '—'}（北京时间）</small>
      </div>} />
    {workspace.canOrder && <div className="demo-business-notice">Token Plan 用量在订阅页单独统计。
      <Button size="small" theme="borderless" onClick={() => onPage('model-order', { tab: 'plan' })}>查看 Token Plan</Button></div>}
    <Tabs className="demo-business-tabs" activeKey={type} onChange={setType} tabList={types.map(value => ({ itemKey: value, tab: value }))} />
    <Card className="role-demo-page-panel demo-business-tab-panel">
      <div className="demo-business-timebar">
        <div><span>时间范围</span><div className="demo-business-periods" aria-label="时间范围">
          {usagePeriods.map(([value, label]) => <Button key={value} size="small" aria-pressed={period === value}
            theme={period === value ? 'light' : 'borderless'} onClick={() => choosePeriod(value)}>{label}</Button>)}
        </div></div>
        <Checkbox checked={million} onChange={event => setMillion(event.target.checked)}>按百万 Token 显示用量</Checkbox>
      </div>
      {period === 'custom' && <DateFields from={draft.from} to={draft.to} onChange={range => setDraft(current => ({ ...current, ...range }))} />}
      <div className="demo-business-filters"><RecordFilters values={draft} setValues={setDraft} workspace={workspace} keys={keys} rows={rows} variant="usage" />
        <Filter label="时间精度" value={draft.granularity || 'day'}
          onChange={granularity => setDraft(current => ({ ...current, granularity }))} options={[option('day', '按日'), option('hour', '按小时')]} />
      </div>
      <div className="demo-business-actions">
        <Button theme="solid" onClick={() => setValues(draft)} disabled={!draft.from || !draft.to || draft.from > draft.to}>查询</Button>
        <Button onClick={() => { const defaults = { from: daysAgo(6), to: today() }; setDraft(defaults); setValues(defaults); setPeriod('week'); setMillion(false); }}>重置</Button>
      </div>
    </Card>
    <Card className="role-demo-page-panel" title="指标总览">
      <div className="demo-business-kpis">{kpis.map(([label, value]) => <div key={label}>
        <span>{label}</span><strong>{typeof value === 'string' ? value : number(value)}</strong>
      </div>)}</div>
    </Card>
    <Card className="role-demo-page-panel" title="用量趋势" headerExtraContent={<Button size="small" onClick={() => onPage('call-logs')}>查看调用日志</Button>}>
      {dates.length ? <TimeSeriesChart label="用量趋势" labels={dates.map(date => date.slice(5))} unit={tokenUnits} showData={false}
        series={[{ label: '输入', color: '#216bff', values: dates.map(date => bucketTotal(date, 'input')) },
          { label: '输出', color: '#6850ff', values: dates.map(date => bucketTotal(date, 'output')) }]} /> : <p className="role-demo-page-empty">当前范围暂无用量数据</p>}
    </Card>
  </>;
}

function downloadLogs(rows) {
  const cells = [
    ['请求ID', '创建时间', '服务商', '模型名称', '渠道', '调用类型', 'API 密钥名称', '输入 Token', '输出 Token', '状态', '首包延迟(ms)', '总耗时(ms)'],
    ...rows.map(row => [row.id, row.time, row.provider, row.model, row.channel, row.source, row.keyName, row.input, row.output, row.status, row.first, row.latency]),
  ];
  const csv = cells.map(line => line.map(value => '"' + String(value ?? '').replaceAll('"', '""') + '"').join(',')).join('\n');
  const url = URL.createObjectURL(new Blob(['\uFEFF', csv], { type: 'text/csv;charset=utf-8' }));
  const link = document.createElement('a');
  link.href = url;
  link.download = '角色演示-调用日志.csv';
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function DemoLogs({ workspace, requestId }) {
  const [draft, setDraft] = useState(() => ({ from: daysAgo(6), to: today() }));
  const [values, setValues] = useState(draft);
  const [record, setRecord] = useState(null);
  const [requested, setRequested] = useState(requestId || '');
  const opener = useRef(null);
  const { keys, records: rows, actions } = useReportScope(workspace);
  const selected = selectRows(rows, values).filter(row => !requested || row.id === requested)
    .sort((left, right) => right.time.localeCompare(left.time));
  const closeDetails = () => {
    setRecord(null);
    requestAnimationFrame(() => opener.current?.focus({ preventScroll: true }));
  };
  const columns = [
    column('请求ID', 'id', { width: 200 }), column('创建时间', 'time', { width: 145 }), column('服务商', 'provider', { width: 100 }),
    column('模型名称', 'model', { width: 145 }), column('渠道', 'channel', { width: 90, render: tags }),
    column('调用类型', 'source', { width: 90 }), column('API 密钥', 'keyName', { width: 135, render: value => value || '—' }),
    column('用量', 'input', { width: 158, render: (_, row) => <span className="demo-business-token"><span>总量 {number(row.input + row.output)} Token</span>
      <span>输入 {number(row.input)} · 输出 {number(row.output)}</span></span> }),
    column('状态', 'status', { width: 70, render: tags }), column('首包延迟', 'first', { width: 80, render: value => value === null ? '—' : value + ' ms' }),
    column('总耗时', 'latency', { width: 80, render: value => value === null ? '—' : value + ' ms' }),
    { title: '操作', width: 74, render: (_, row) => <Button size="small" theme="borderless" aria-label={'详情 ' + row.id}
      onClick={event => { opener.current = event.currentTarget; setRecord(row); }}>详情</Button> },
  ];
  const facts = record ? [['请求ID', record.id], ['创建时间', record.time], ['服务商', record.provider], ['模型名称', record.model],
    ['API 密钥名称', record.keyName], ['状态', record.status], ['输入 Token', record.input], ['输出 Token', record.output],
    ...(workspace.canManageProject && !workspace.personal ? [['调用用户', record.user]] : []),
    ...(workspace.canOrder ? [['费用', money(record.cost)]] : [])] : [];
  return <>
    <Header title="调用日志" icon={Activity} description="观测模型使用情况与性能指标，完整记录每次调用日志。"
      actions={actions} />
    <Card className="role-demo-page-panel">
      <div className="demo-business-filters"><RecordFilters values={draft} setValues={setDraft} workspace={workspace} keys={keys} rows={rows} variant="logs" /></div>
      <div className="demo-business-timebar">
        <DateFields from={draft.from} to={draft.to} onChange={range => setDraft(current => ({ ...current, ...range }))} />
        <div className="demo-business-actions">
          <Button onClick={() => setValues(draft)} disabled={!draft.from || !draft.to || draft.from > draft.to}>刷新</Button>
          <Button onClick={() => { const defaults = { from: daysAgo(6), to: today() }; setDraft(defaults); setValues(defaults); setRequested(''); }}>重置</Button>
        </div>
      </div>
      <div className="demo-business-section-title"><h2>日志列表</h2>
        <Button theme="solid" icon={<Download size={15} />} onClick={() => downloadLogs(selected)} disabled={!selected.length}>导出筛选项</Button>
      </div>
      {requested && <Button size="small" theme="borderless" onClick={() => setRequested('')}>清除请求 ID 筛选 · {requested}</Button>}
      <DemoTable columns={columns} rows={selected} width={1375} empty="没有符合条件的调用日志" />
    </Card>
    {record && <AdminModal visible title="调用详情" onCancel={closeDetails} closable={false} width="min(520px, calc(100vw - 32px))"
      footer={<Button onClick={closeDetails}>关闭</Button>}>
      <dl className="role-demo-page-details">{facts.map(([label, value]) => <div key={label}><dt>{label}</dt><dd>{value ?? '—'}</dd></div>)}</dl>
    </AdminModal>}
  </>;
}

export function DemoBusinessPage({ page, workspace, onPage, experiences, requestId, tab }) {
  return <section className="role-demo-page demo-business">
    {page === 'model-market' && <DemoMarket workspace={workspace} onPage={onPage} />}
    {page === 'api-keys' && <DemoKeys workspace={workspace} onPage={onPage} />}
    {page === 'model-order' && <DemoOrder key={tab || ''} workspace={workspace} models={orderCatalogue(experiences)} initialTab={tab} />}
    {page === 'usage-statistics' && <DemoUsage workspace={workspace} onPage={onPage} />}
    {page === 'call-logs' && <DemoLogs key={requestId || ''} workspace={workspace} requestId={requestId} />}
  </section>;
}
