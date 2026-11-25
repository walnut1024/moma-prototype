import { useEffect, useId, useState } from 'react';
import { Banner, Button, Checkbox, Input, InputNumber, Modal, RadioGroup, Select, Table, Tabs, Tag, TextArea, Toast } from '@douyinfe/semi-ui';
import { ArrowLeft, Route } from 'lucide-react';
import FrontPageHeader from './FrontPageHeader';
import ProjectRoutes from './ProjectRoutes';
import { displaySmartRouteName } from '../display-copy.mjs';
import { projectModelEnabled } from '../project-access.mjs';
import { activeTenantVersion, autoStrategies, providerSorts, routeConfiguration, routeModels, routeParameters, routeTargets, tenantRouteLabel } from '../tenant-routing.mjs';
import './smart-routing.css';

const empty = { models: [], providers: [], excludedProviders: [], excludedModels: [], allowProviderFallbacks: true,
  sort: 'default', fallbackModel: '', costTier: 'medium', preventOverrides: false, label: '', description: '', systemPrompt: '', parameters: {} };
const option = (value, label, disabled = false) => ({ value, label, disabled });
const title = row => row.kind ? tenantRouteLabel(row) : displaySmartRouteName(row);
const scopeType = project => project ? 'project' : 'preset';
const copy = async value => {
  try { await navigator.clipboard.writeText(value); Toast.success('已复制'); }
  catch { Toast.error('复制失败，请手动复制'); }
};

function OrderedSelection({ label, options, values, onChange, reorder = true, role }) {
  const labelId = useId();
  const move = (index, step) => {
    const next = [...values];
    [next[index], next[index + step]] = [next[index + step], next[index]];
    onChange(next);
  };
  return <div className="sr-order">
    <span className="sr-only" id={labelId}>{label}</span>
    <Select aria-labelledby={labelId} placeholder={label} value="" filter optionList={options.filter(row => !values.includes(row.value))}
      onChange={value => { if (value) onChange([...values, value]); }} />
    <ol>{values.map((value, index) => {
      const name = options.find(row => row.value === value)?.label || value;
      return <li key={value}><span>{role && <Tag size="small">{index ? `备用 ${index}` : '首选'}</Tag>}{name}</span>
        <div>
          {reorder && <><Button size="small" theme="borderless" disabled={index === 0} aria-label={`上移 ${name}`} onClick={() => move(index, -1)}>上移</Button>
            <Button size="small" theme="borderless" disabled={index === values.length - 1} aria-label={`下移 ${name}`} onClick={() => move(index, 1)}>下移</Button></>}
          <Button size="small" theme="borderless" aria-label={`移除 ${name}`} onClick={() => onChange(values.filter(id => id !== value))}>移除</Button>
        </div>
      </li>;
    })}</ol>
  </div>;
}

function RoutingConfig({ config, models, auto, callId, onChange, onOrder }) {
  const fieldId = useId();
  const offers = models.filter(model => config.models.includes(model.id)).flatMap(model => model.services).filter(row => row.callable);
  const providerOptions = [...new Map(offers.filter(row => row.providerId)
    .map(row => [row.providerId, option(row.providerId, row.providerName || row.provider)])).values()];
  const modelOptions = models.map(row => {
    const callable = row.services.some(service => service.callable);
    return option(row.id, row.name + (callable ? '' : row.services.some(service => service.ordered) ? ' · 暂不可用' : ' · 未订购'), !callable);
  });
  const changeModels = selected => {
    const available = new Set(models.filter(model => selected.includes(model.id)).flatMap(model =>
      model.services.filter(row => row.callable && row.providerId).map(row => row.providerId)));
    const providerOrder = config.providerOrder.filter(id => available.has(id));
    onChange({ models: selected, providers:config.providers.filter(id => available.has(id)),
      excludedProviders:config.excludedProviders.filter(id => available.has(id)), providerOrder,
      sort: !providerOrder.length && config.sort === 'manual' ? 'default' : config.sort,
      fallbackModel: selected.includes(config.fallbackModel) ? config.fallbackModel : '' });
  };
  return <>
    {callId === 'moma/auto' && <section><h3>成本偏好</h3>
      <RadioGroup type="button" aria-label="默认成本偏好" value={config.costTier}
        options={autoStrategies.map(row => option(row.costTier,row.name))}
        onChange={event => onChange({costTier:event.target.value})} />
      <Checkbox checked={config.preventOverrides} onChange={event => onChange({preventOverrides:event.target.checked})}>禁止请求覆盖成本偏好</Checkbox>
    </section>}
    <section><h3>{auto ? '模型范围' : '模型与回退'}</h3>
      <OrderedSelection label={auto ? '添加允许模型' : '添加模型'} options={modelOptions} values={config.models} onChange={changeModels} reorder={!auto} role={!auto} />
      {auto && <OrderedSelection label="添加排除模型" options={modelOptions} values={config.excludedModels} reorder={false}
        onChange={excludedModels => onChange({ excludedModels, ...(excludedModels.includes(config.fallbackModel) && {fallbackModel:''}) })} />}
      {models.some(model => model.services.some(row => !row.callable && (row.canOrder || row.ordered === false))) &&
        <Button size="small" theme="borderless" onClick={onOrder}>去订购</Button>}
      {auto && <div className="sr-field"><span id={fieldId + '-fallback'}>兜底模型</span><Select aria-labelledby={fieldId + '-fallback'} value={config.fallbackModel}
        optionList={[option('', '平台选择'), ...modelOptions.filter(row => config.models.includes(row.value) && !config.excludedModels.includes(row.value))]}
        onChange={value => onChange({ fallbackModel: value })} /></div>}
    </section>
    <section><h3>供应商路由</h3>
      {!auto && providerOptions.length > 0 && <>
        <OrderedSelection label="仅允许供应商" options={providerOptions} values={config.providers} reorder={false} onChange={providers => onChange({providers})} />
        <OrderedSelection label="排除供应商" options={providerOptions} values={config.excludedProviders} reorder={false}
          onChange={excludedProviders => onChange({excludedProviders})} />
      </>}
      <div className="sr-field"><span id={fieldId + '-sort'}>供应商排序</span><Select aria-labelledby={fieldId + '-sort'} value={config.sort} onChange={sort => onChange({ sort })}
        optionList={providerSorts.filter(row => !auto || row.value !== 'manual').map(row =>
          option(row.value, row.label + (row.disabled ? ' · 未采集' : ''), row.disabled || row.value === 'manual' && !providerOptions.length))} /></div>
      {!auto && config.sort === 'manual' && <OrderedSelection label="添加优先供应商" options={providerOptions} values={config.providerOrder}
        onChange={providerOrder => onChange({providerOrder})} />}
      {!auto && <Checkbox checked={config.allowProviderFallbacks}
        onChange={event => onChange({allowProviderFallbacks:event.target.checked})}>允许切换同一模型的供应商</Checkbox>}
    </section>
    {!auto && <section><h3>提示词与生成参数</h3>
      <label className="sr-field">系统提示词<TextArea aria-label="系统提示词" value={config.systemPrompt} maxCount={500} maxLength={500}
        onChange={systemPrompt => onChange({ systemPrompt })} /></label>
      <div className="sr-parameters">{routeParameters.map(field => {
        const enabled = Object.hasOwn(config.parameters, field.key);
        return <div key={field.key}>
          <Checkbox checked={enabled} onChange={event => {
            const parameters = { ...config.parameters };
            if (event.target.checked) parameters[field.key] = field.initial;
            else delete parameters[field.key];
            onChange({ parameters });
          }}>{field.label}</Checkbox>
          {enabled && <InputNumber aria-label={field.label} min={field.min} max={field.max} step={field.step}
            value={config.parameters[field.key]} onChange={value => onChange({ parameters: {
              ...config.parameters, [field.key]: value === '' ? value : Number(value),
            } })} />}
        </div>;
      })}</div>
    </section>}
  </>;
}

function ConfigSummary({ config, models }) {
  const modelName = id => models.find(row => row.id === id)?.name || id;
  const providers = new Map(models.flatMap(model => model.services).map(row => [row.providerId, row.providerName || row.provider]));
  return config ? <dl className="sr-summary">
    {config.label && <><dt>显示名称</dt><dd>{config.label}</dd></>}
    {config.description && <><dt>规则描述</dt><dd>{config.description}</dd></>}
    <dt>模型</dt><dd>{config.models.map(modelName).join(' → ') || '—'}</dd>
    {!!config.excludedModels?.length && <><dt>排除模型</dt><dd>{config.excludedModels.map(modelName).join('、')}</dd></>}
    {Object.hasOwn(config, 'fallbackModel') && <><dt>兜底模型</dt><dd>{config.fallbackModel ? modelName(config.fallbackModel) : '平台选择'}</dd></>}
    <dt>供应商排序</dt><dd>{providerSorts.find(row => row.value === config.sort)?.label}</dd>
    {config.providers.length > 0 && <><dt>供应商范围</dt><dd>{config.providers.map(id => providers.get(id) || id).join('、')}</dd></>}
    {!!config.excludedProviders?.length && <><dt>排除供应商</dt><dd>{config.excludedProviders.map(id => providers.get(id) || id).join('、')}</dd></>}
    {config.sort === 'manual' && <><dt>供应商顺序</dt><dd>{(config.providerOrder ?? config.providers).map(id => providers.get(id) || id).join(' → ')}</dd></>}
    {config.allowProviderFallbacks === false && <><dt>供应商回退</dt><dd>关闭</dd></>}
    {config.systemPrompt && <><dt>系统提示词</dt><dd>{config.systemPrompt}</dd></>}
    {Object.keys(config.parameters).length > 0 && <><dt>生成参数</dt><dd>{routeParameters.filter(row => Object.hasOwn(config.parameters, row.key))
      .map(row => `${row.label} ${config.parameters[row.key]}`).join(' · ')}</dd></>}
  </dl> : <p>暂无已保存配置。</p>;
}


function ApiExample({ route, apiUrl, openKeys, projectId }) {
  const [override, setOverride] = useState(false);
  const auto = activeTenantVersion(route)?.config;
  const mayOverride = route.callId === 'moma/auto' && (!auto || !auto.preventOverrides);
  const body = JSON.stringify({
    model: route.callId,
    messages: [{ role: 'user', content: '请总结这段文本' }],
    ...(route.hasUserRule && { metadata: { _user: 'YOUR_USER_LABEL' } }),
    ...(override && mayOverride && { routing: { cost_tier: 'low' } }),
  }, null, 2);
  const curl = `curl '${apiUrl}' \\\n  -H "Authorization: Bearer $MOMA_API_KEY" \\\n  -H 'Content-Type: application/json' \\\n  --data '${body}'`;
  return <div className="sr-stack">
    {!route.projectRoute && !route.enabled && <Banner type="info" description="请先启用该路由。" />}
    <p>使用当前项目的 API Key 发起文本请求。</p>
    {route.hasUserRule && <p>按用户标签匹配时，在 <code>metadata._user</code> 填入规则中的值。</p>}
    {mayOverride && <Checkbox checked={override} onChange={event => setOverride(event.target.checked)}>包含单次成本偏好</Checkbox>}
    <div className="sr-row"><Button size="small" onClick={() => openKeys(route.projectId || projectId)}>前往 API 密钥</Button>
      <Button size="small" onClick={() => copy(curl)}>复制示例</Button></div>
    <pre>{curl}</pre>
  </div>;
}

function RouteEditor({ route, services, models, revision, saveRoute, openOrders, close, setDirty }) {
  const auto = route?.kind === 'auto';
  const [expectedRevision, setExpectedRevision] = useState(revision);
  const [original] = useState(() => {
    const saved = auto && route.draft || activeTenantVersion(route)?.config;
    return { ...empty, ...saved, providerOrder:saved?.providerOrder ?? saved?.providers ?? [] };
  });
  const [config, setConfig] = useState(original);
  const [name, setName] = useState(route?.name || '');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const dirty = JSON.stringify(config) !== JSON.stringify(original) || name !== (route?.name || '');
  useEffect(() => {
    setDirty(dirty || busy);
    return () => setDirty(false);
  }, [dirty,busy,setDirty]);

  const change = patch => {
    setConfig(previous => ({...previous,...patch}));
    setError('');
  };
  async function save(action) {
    if (busy) return;
    setBusy(true);
    setError('');
    try {
      const kind = auto ? 'auto' : 'preset';
      routeConfiguration(config,services,kind,action === 'publish',route?.callId);
      await saveRoute({ action,kind,id:route?.id,callId:route?.callId,name,config },expectedRevision);
      setDirty(false);
      Toast.success(action === 'draft' ? '已保存草稿' : '已保存并生效');
      close(route?.callId || '@preset/' + name.trim());
    } catch (cause) { setError(cause.message); }
    finally { setBusy(false); }
  }
  const cancel = () => {
    if (!dirty) { close(route?.callId); return; }
    Modal.confirm({
      title:'放弃未保存的修改？', content:'返回后，本次修改将丢失。',
      okText:'放弃修改', cancelText:'继续编辑', okButtonProps:{type:'danger'},
      onOk:() => { setDirty(false); close(route?.callId); },
    });
  };
  return <div className="sr-editor">
    <Button className="sr-back" theme="borderless" icon={<ArrowLeft size={16}/>} disabled={busy} onClick={cancel}>
      {auto ? '返回路由设置' : route ? '返回预设详情' : '返回模型预设'}
    </Button>
    <div className="sr-heading"><div><h2>{auto ? route.name : route ? '编辑模型预设' : '新建模型预设'}</h2>
      {route && <code>{route.callId}</code>}</div></div>
    {!auto && <section className="sr-form-section">
      <div className="sr-editor-fields">
        <label className="sr-field">名称<Input aria-label="预设名称" value={config.label}
          placeholder={route?.name || '选填'} maxLength={50} onChange={label => change({label})} /></label>
        <label className="sr-field">调用标识<Input aria-label="调用标识" value={name} readonly={Boolean(route)} prefix="@preset/"
          placeholder="support-reply" maxLength={50} onChange={value => { setName(value); setError(''); }} /></label>
      </div>
      <label className="sr-field">说明（选填）<TextArea aria-label="预设说明" value={config.description} maxLength={200} rows={2}
        onChange={description => change({description})} /></label>
    </section>}
    {!models.length && <Banner type="info" description="当前项目暂无可配置的语言模型。" />}
    {revision !== expectedRevision && <div className="sr-stack">
      <Banner type="warning" description="工作区配置已更新，请核对最新配置再保存。" />
      <div className="sr-row">
        <Button disabled={busy} onClick={cancel}>查看最新配置</Button>
        <Button disabled={busy} onClick={() => { setExpectedRevision(revision); setError(''); }}>保留当前修改</Button>
      </div>
    </div>}
    <RoutingConfig config={config} models={models} auto={auto} callId={route?.callId} onOrder={openOrders} onChange={change} />
    {error && <Banner type="danger" description={error} />}
    <div className="sr-row sr-editor-actions">
      <Button onClick={cancel} disabled={busy}>取消</Button>
      {auto && <Button onClick={() => save('draft')} disabled={busy || revision !== expectedRevision}>保存草稿</Button>}
      <Button theme="solid" onClick={() => save('publish')} loading={busy}
        disabled={!config.models.length || !name.trim() || revision !== expectedRevision}>保存并生效</Button>
    </div>
  </div>;
}

function RouteHistory({ route, models, changeStatus, busy, canWrite }) {
  const [version, setVersion] = useState(route.activeVersion);
  const snapshot = route.versions.find(row => row.number === version);
  const columns = [
    { title:'版本', dataIndex:'number', render:number => <Button size="small" theme="borderless" aria-pressed={version === number}
      onClick={() => setVersion(number)}>v{number}</Button> },
    { title:'时间', dataIndex:'at', render:at => new Date(at).toLocaleString('zh-CN',{timeZone:'Asia/Shanghai',hour12:false}) },
    { title:'操作人', dataIndex:'actor' },
    { title:'状态', dataIndex:'number', render:number => number === route.activeVersion ? <Tag>当前版本</Tag> : '—' },
  ];
  return <div className="sr-stack">
    <Table rowKey="number" dataSource={route.versions.toReversed()} columns={columns} pagination={false} scroll={{ x: 450 }} />
    {snapshot && <section className="sr-stack"><h3>v{snapshot.number} 配置</h3><ConfigSummary config={snapshot.config} models={models} /></section>}
    {canWrite && snapshot && snapshot.number !== route.activeVersion &&
      <Button loading={busy} onClick={() => changeStatus(route,'switch',snapshot.number)}>设为当前版本</Button>}
  </div>;
}

export default function SmartRouting({ tenant, projectId, projectRules, embedded = false, view, navigate, setDirty, saveRoute,
  openKeys, openOrders, openExperience, apiUrl, projectCallId }) {
  const [query, setQuery] = useState('');
  const [api, setApi] = useState(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [awaiting, setAwaiting] = useState(null);
  const project = tenant.projects.find(row => row.id === projectId);
  const services = (tenant.routeServices || tenant.services).filter(service => !service.independentService).map(service => ({ ...service,
    callable: service.callable && Boolean(project) && projectModelEnabled(project,service.serviceModelId || service.modelKey) }));
  const models = routeModels(services);
  const routes = tenant.routes.filter(row => row.projectId === projectId);
  const canWrite = Boolean(tenant.identity) && Number.isSafeInteger(tenant.revision) && project?.status === '正常';
  const canManage = canWrite && project.canManage;
  const auto = autoStrategies.map(strategy => routes.find(row => row.kind === 'auto' && row.callId === strategy.callId) || {...strategy,kind:'auto'});
  const [router] = auto;
  const strategy = auto.find(row => row.callId === view.strategy);
  const preset = routes.find(row => row.kind === 'preset' && row.callId === view.preset);
  const tab = projectRules || view.type === 'preset' ? 'rules' : 'auto';
  const type = scopeType(projectRules);
  const validCount = row => {
    const config = activeTenantVersion(row)?.config;
    return config ? new Set(routeTargets(config,services,'').map(service => service.modelKey)).size : 0;
  };
  function status(row) {
    if (!row.kind) return <Tag>历史配置</Tag>;
    if (!row.enabled) return <Tag>未生效</Tag>;
    const config = activeTenantVersion(row)?.config;
    const count = validCount(row);
    const total = config?.models.filter(id => !config.excludedModels?.includes(id)).length;
    if (!count) return <Tag color="orange">无可用候选</Tag>;
    return count < total ? <Tag color="orange">部分不可用</Tag> : <Tag color="green">已生效</Tag>;
  }
  async function changeStatus(row,action,version) {
    if (busy) return;
    setBusy(true);
    setError('');
    try {
      await saveRoute({ action,kind:row.kind,id:row.id,callId:row.callId,...(version && {version}) },tenant.revision);
      Toast.success(action === 'stop' ? '已停用' : '已切换版本');
    } catch (cause) { setError(cause.message); }
    finally { setBusy(false); }
  }
  const stop = row => Modal.confirm({
    title:'停用路由？',content:'停用后，使用 ' + row.callId + ' 的新请求将无法调用该路由。',
    okText:'确认停用',cancelText:'取消',okButtonProps:{type:'danger'},onOk:() => changeStatus(row,'stop'),
  });
  const trial = row => {
    const config = activeTenantVersion(row)?.config;
    const candidates = project && config && routeTargets(config,
      services.filter(service => projectModelEnabled(project,service.serviceModelId || service.modelKey)),row.callId).length;
    const reason = !row.enabled ? '请先启用路由' : !project ? '请先选择项目' : !candidates ? '当前项目暂无可调用候选' : '';
    return <Button theme="solid" disabled={Boolean(reason)} title={reason || undefined} onClick={() => openExperience(row)}>对话试用</Button>;
  };
  const mainConfig = activeTenantVersion(router)?.config;
  const autoColumns = [
    { title:'策略', dataIndex:'name' },
    { title:'调用 ID', dataIndex:'callId', render:id => <code>{id}</code> },
    { title:'状态', render:(_,row) => status(row) },
    { title:'操作', render:(_,row) => <div className="sr-row">
      {canManage && <Button size="small" theme="borderless" onClick={() => navigate({routing:'settings',strategy:row.callId})}>{row.id ? '编辑' : '配置'}</Button>}
      <Button size="small" theme="borderless" onClick={() => setApi(row)}>API 示例</Button>
      {row.enabled && trial(row)}
      {canManage && row.enabled && <Button size="small" theme="borderless" type="tertiary" disabled={busy} onClick={() => stop(row)}>停用</Button>}
    </div> },
  ];
  const presets = routes.filter(row => row.kind !== 'auto' &&
    [title(row),row.callId || row.id].some(value => value?.toLowerCase().includes(query.trim().toLowerCase())));
  const presetColumns = [
    { title:'名称', render:(_,row) => row.kind === 'preset' ? <Button size="small" theme="borderless"
      onClick={() => navigate({routeType:'preset',preset:row.callId})}>{title(row)}</Button> : title(row) },
    { title:'版本', render:(_,row) => row.activeVersion ? 'v' + row.activeVersion : '—' },
    { title:'模型', render:(_,row) => activeTenantVersion(row)?.config.models.length ?? row.models?.length ?? 0 },
    { title:'状态', render:(_,row) => status(row) },
    { title:'调用 ID', render:(_,row) => <div className="sr-row"><code>{row.callId || row.id}</code>
      {row.callId && <Button size="small" theme="borderless" aria-label={'复制 ' + row.callId} onClick={() => copy(row.callId)}>复制</Button>}</div> },
  ];

  const editor = (row,close) => <RouteEditor key={row?.callId || 'new'} route={row} revision={tenant.revision}
    services={services} models={models} openOrders={openOrders} setDirty={setDirty} saveRoute={saveRoute} close={close} />;
  const openPreset = callId => {
    setAwaiting(callId ? {callId,revision:tenant.revision} : null);
    navigate({routeType:'preset',...(callId && {preset:callId})},true);
  };
  const detailTab = view.panel || 'config';
  if (projectRules) return <div className={embedded ? "smart-routing" : "route-page smart-routing"}>
    {!embedded && <FrontPageHeader title="项目分流" icon={Route} description={project?.name}
      actions={<Button theme="borderless" onClick={()=>navigate({})}>返回智能路由</Button>} />}
    <ProjectRoutes key={projectId} tenant={tenant} projectId={projectId} openApi={row=>setApi({...row,callId:projectCallId(row.code),projectRoute:true,
      hasUserRule:row.rules.some(rule=>rule.field==='metadata._user')})}/>
    {api && <Modal visible title="API 示例" footer={null} onCancel={()=>setApi(null)} width={660} className="smart-routing-dialog">
      <ApiExample route={api} apiUrl={apiUrl} openKeys={openKeys} projectId={projectId}/></Modal>}
  </div>;
  return <div className="route-page smart-routing">
    <FrontPageHeader title="智能路由" icon={Route} description={project ? `所属项目 · ${project.name}` : undefined}
      actions={project && <Button theme="borderless" onClick={()=>navigate({routeType:'project'})}>项目分流</Button>} />
    {tenant.error && type !== 'project' && <Banner type="warning" description={tenant.error} />}
    {error && <Banner type="danger" description={error} />}
    <Tabs activeKey={tab} onChange={key => navigate(key === 'auto' ? {} : {routeType:'preset'})} keepDOM={false} tabPaneMotion={false}>
      <Tabs.TabPane itemKey="auto" tab="智能匹配">
        {view.settings ? <div className="sr-page">
          {strategy && canManage ? editor(strategy,() => navigate({routing:'settings'},true)) : <>
            <Button className="sr-back" theme="borderless" icon={<ArrowLeft size={16}/>} onClick={() => navigate({})}>返回 Auto Router</Button>
            <div className="sr-heading"><h2>路由设置</h2></div>
            <Table rowKey="callId" columns={autoColumns} dataSource={auto} pagination={false} scroll={{ x: 560 }} />
          </>}
        </div> : <section className="sr-page" aria-label="Auto Router">
          <div className="sr-heading sr-auto-hero">
            <div><h2>Auto Router</h2><div className="sr-row"><code>{router.callId}</code>{status(router)}</div></div>
            <div className="sr-row"><Button onClick={() => navigate({routing:'settings'})}>路由设置</Button>
              <Button onClick={() => setApi(router)}>API 示例</Button>{trial(router)}</div>
          </div>
          <dl className="sr-inline">
            <div><dt>成本偏好</dt><dd>{autoStrategies.find(row => row.costTier === (mainConfig?.costTier || 'medium'))?.name}</dd></div>
            <div><dt>候选模型</dt><dd>{validCount(router)} 个</dd></div>
          </dl>
        </section>}
      </Tabs.TabPane>
      <Tabs.TabPane itemKey="rules" tab={projectRules ? "项目分流" : "模型预设"}>
        <div className="sr-toolbar">
          {type === 'preset' && !view.preset && !view.create && <div className="sr-row">
            <Input aria-label="搜索模型预设" placeholder="搜索名称或调用 ID" value={query} onChange={setQuery} />
            <Button theme="solid" disabled={!canWrite} onClick={() => navigate({routeType:'preset',edit:'new'})}>新建模型预设</Button>
          </div>}
        </div>
        {view.create && canWrite ? editor(null,openPreset) :
          preset && detailTab === 'edit' && canWrite ? editor(preset,openPreset) :
          preset ? <section className="sr-page">
            <Button className="sr-back" theme="borderless" icon={<ArrowLeft size={16}/>} onClick={() => navigate({routeType:'preset'})}>模型预设</Button>
            <div className="sr-heading">
              <div><h2>{title(preset)}</h2><div className="sr-row"><code>{preset.callId}</code>{status(preset)}</div></div>
              <div className="sr-row">{canWrite && <>
                <Button onClick={() => navigate({routeType:'preset',preset:preset.callId,panel:'edit'})}>编辑</Button>
                {preset.enabled && <Button type="tertiary" onClick={() => stop(preset)}>停用</Button>}
              </>}{trial(preset)}</div>
            </div>
            <Tabs activeKey={detailTab === 'edit' ? 'config' : detailTab} onChange={panel => navigate({routeType:'preset',preset:preset.callId,panel})}
              keepDOM={false} tabPaneMotion={false} className="sr-detail-tabs">
              <Tabs.TabPane itemKey="config" tab="配置"><ConfigSummary config={activeTenantVersion(preset)?.config} models={models} /></Tabs.TabPane>
              <Tabs.TabPane itemKey="api" tab="API 调用"><ApiExample route={preset} apiUrl={apiUrl} openKeys={openKeys} projectId={projectId} /></Tabs.TabPane>
              <Tabs.TabPane itemKey="history" tab="版本历史"><RouteHistory route={preset} models={models} changeStatus={changeStatus} busy={busy} canWrite={canWrite} /></Tabs.TabPane>
            </Tabs>
          </section> : view.preset ? <div className="sr-stack">
            <Button className="sr-back" theme="borderless" icon={<ArrowLeft size={16}/>} onClick={() => navigate({routeType:'preset'})}>返回模型预设</Button>
            <p role="status">{!tenant.identity || awaiting?.callId === view.preset && awaiting.revision === tenant.revision
              ? '正在载入模型预设…' : '该预设不存在或当前账号无权查看。'}</p>
          </div> : <Table rowKey="id" columns={presetColumns} dataSource={presets} pagination={false}
            scroll={{ x: 580 }} empty={query ? '没有匹配的预设' : '暂无模型预设'} />}
      </Tabs.TabPane>
    </Tabs>
    {api && <Modal visible title="API 示例" footer={null} onCancel={() => setApi(null)} width={660} className="smart-routing-dialog">
      <ApiExample route={api} apiUrl={apiUrl} openKeys={openKeys} projectId={projectId} />
    </Modal>}
  </div>;
}
