import { useId, useState } from 'react';
import { Banner, Button, Checkbox, Input, InputNumber, Modal, Select, Table, Tabs, Tag, TextArea } from '@douyinfe/semi-ui';
import { Route } from 'lucide-react';
import FrontPageHeader from './FrontPageHeader';
import { displaySmartRouteName } from '../display-copy.mjs';
import { projectModelEnabled } from '../project-access.mjs';
import { activeTenantVersion, autoStrategies, providerSorts, routeConfiguration, routeModels, routeParameters, routeTargets } from '../tenant-routing.mjs';
import './smart-routing.css';

const empty = { models: [], providers: [], sort: 'default', fallbackModel: '', description: '', systemPrompt: '', parameters: {} };
const option = (value, label, disabled = false) => ({ value, label, disabled });
const title = row => row.kind ? row.name : displaySmartRouteName(row);

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

function RoutingConfig({ config, models, auto, onChange, onOrder }) {
  const fieldId = useId();
  const offers = models.filter(model => config.models.includes(model.id)).flatMap(model => model.services).filter(row => row.callable);
  const providerOptions = [...new Map(offers.filter(row => row.mode === 'provider')
    .map(row => [row.providerId, option(row.providerId, row.providerName || row.provider)])).values()];
  const modelOptions = models.map(row => {
    const callable = row.services.some(service => service.callable);
    return option(row.id, row.name + (callable ? '' : row.services.some(service => service.ordered) ? ' · 暂不可用' : ' · 未订购'), !callable);
  });
  const changeModels = selected => {
    const available = new Set(models.filter(model => selected.includes(model.id)).flatMap(model =>
      model.services.filter(row => row.callable && row.mode === 'provider').map(row => row.providerId)));
    const providers = config.providers.filter(id => available.has(id));
    onChange({ models: selected, providers, sort: !providers.length && config.sort === 'manual' ? 'default' : config.sort,
      fallbackModel: selected.includes(config.fallbackModel) ? config.fallbackModel : '' });
  };
  return <>
    <section><h3>{auto ? '模型范围' : '模型与回退'}</h3>
      <OrderedSelection label="添加模型" options={modelOptions} values={config.models} onChange={changeModels} reorder={!auto} role={!auto} />
      {models.some(model => model.services.some(row => !row.callable && (row.canOrder || row.ordered === false))) &&
        <Button size="small" theme="borderless" onClick={onOrder}>去订购</Button>}
      {auto && <div className="sr-field"><span id={fieldId + '-fallback'}>兜底模型</span><Select aria-labelledby={fieldId + '-fallback'} value={config.fallbackModel}
        optionList={[option('', '平台选择'), ...modelOptions.filter(row => config.models.includes(row.value))]}
        onChange={value => onChange({ fallbackModel: value })} /></div>}
    </section>
    <section><h3>供应商偏好</h3>
      {offers.some(row => row.mode === 'standard') && <Tag size="small">统一模型服务 · 平台调度</Tag>}
      {!auto && providerOptions.length > 0 && <OrderedSelection label="限定供应商" options={providerOptions} values={config.providers}
        reorder={config.sort === 'manual'} onChange={providers => onChange({ providers,
          sort: !providers.length && config.sort === 'manual' ? 'default' : config.sort })} />}
      <div className="sr-field"><span id={fieldId + '-sort'}>供应商排序</span><Select aria-labelledby={fieldId + '-sort'} value={config.sort} onChange={sort => onChange({ sort })}
        optionList={providerSorts.filter(row => !auto || row.value !== 'manual').map(row =>
          option(row.value, row.label + (row.disabled ? ' · 暂无指标' : ''), row.disabled || row.value === 'manual' && !config.providers.length))} /></div>
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
    {config.description && <><dt>规则描述</dt><dd>{config.description}</dd></>}
    <dt>模型</dt><dd>{config.models.map(modelName).join(' → ') || '—'}</dd>
    {Object.hasOwn(config, 'fallbackModel') && <><dt>兜底模型</dt><dd>{config.fallbackModel ? modelName(config.fallbackModel) : '平台选择'}</dd></>}
    <dt>供应商排序</dt><dd>{providerSorts.find(row => row.value === config.sort)?.label}</dd>
    {config.providers.length > 0 && <><dt>供应商范围</dt><dd>{config.providers.map(id => providers.get(id) || id).join('、')}</dd></>}
    {config.systemPrompt && <><dt>系统提示词</dt><dd>{config.systemPrompt}</dd></>}
    {Object.keys(config.parameters).length > 0 && <><dt>生成参数</dt><dd>{routeParameters.filter(row => Object.hasOwn(config.parameters, row.key))
      .map(row => `${row.label} ${config.parameters[row.key]}`).join(' · ')}</dd></>}
  </dl> : <p>暂无已保存配置。</p>;
}

function RouteDialog({ dialog, close, services, models, saveRoute, project, openKeys, openOrders, apiUrl }) {
  const versionLabelId = useId();
  const { view, route } = dialog;
  const auto = route?.kind === 'auto';
  const active = activeTenantVersion(route);
  const original = { ...empty, ...active?.config, ...(auto ? route?.draft : null) };
  const [config, setConfig] = useState(original);
  const [name, setName] = useState(route?.name || '');
  const [version, setVersion] = useState(active?.number);
  const [error, setError] = useState('');
  const [copyState, setCopyState] = useState('');
  const [busy, setBusy] = useState(false);
  const [confirmDiscard, setConfirmDiscard] = useState(false);
  const [prompt, setPrompt] = useState('');
  const [targets, setTargets] = useState(null);
  const dirty = view === 'edit' && (config !== original && JSON.stringify(config) !== JSON.stringify(original) || name !== (route?.name || ''));
  const dismiss = () => { if (!busy) { if (dirty) setConfirmDiscard(true); else close(); } };
  const save = async action => {
    if (busy) return;
    setError('');
    setBusy(true);
    try {
      if (action === 'publish' || action === 'draft') routeConfiguration(config, services, auto ? 'auto' : 'preset', action === 'publish');
      await saveRoute({ action, kind: route?.kind || 'preset', id: route?.id, callId: route?.callId, name,
        ...(view === 'edit' ? { config } : {}), ...(action === 'switch' ? { version } : {}) }, dialog.revision);
      close();
    } catch (cause) { setError(cause.message); }
    finally { setBusy(false); }
  };
  const versionRow = route?.versions?.find(item => item.number === version);
  const dialogTitle = { edit: auto ? route.name : route ? '编辑模型预设' : '新建模型预设',
    history: '历史版本', details: route?.name, stop: '停用路由', api: 'API 示例', preview: '选路预览',
    guide: '操作引导' }[view];
  const body = view === 'api' && JSON.stringify({ model: route.callId, messages: [{ role: 'user', content: '你好，请介绍一下你自己' }],
    ...(route.hasUserRule ? { metadata: { _user: 'YOUR_USER_LABEL' } } : {}) }, null, 2);
  const curl = body && `curl '${apiUrl}' \\\n  -H "Authorization: Bearer $MOMA_API_KEY" \\\n  -H 'Content-Type: application/json' \\\n  --data '${body}'`;
  const copy = async value => {
    try { await navigator.clipboard.writeText(value); setCopyState('已复制'); }
    catch { setCopyState('复制失败，请手动复制'); }
  };
  return <Modal visible title={confirmDiscard ? '放弃未保存的修改？' : dialogTitle} onCancel={dismiss} maskClosable={false}
    closeOnEsc={!busy} closable={!busy && !confirmDiscard} width={660} className="smart-routing-dialog"
    footer={confirmDiscard ? <><Button onClick={() => setConfirmDiscard(false)}>继续编辑</Button><Button type="danger" onClick={close}>放弃修改</Button></> :
      view === 'edit' ? <><Button onClick={dismiss} disabled={busy}>取消</Button>{auto && <Button onClick={() => save('draft')} disabled={busy}>保存草稿</Button>}
        <Button theme="solid" onClick={() => save('publish')} loading={busy} disabled={!config.models.length || !name.trim()}>保存并生效</Button></> :
      view === 'stop' ? <><Button onClick={dismiss} disabled={busy}>取消</Button><Button type="danger" theme="solid" loading={busy} onClick={() => save('stop')}>确认停用</Button></> :
      view === 'history' ? <><Button onClick={close} disabled={busy}>关闭</Button><Button theme="solid" loading={busy}
        disabled={!versionRow || version === active?.number} onClick={() => save('switch')}>切换到此版本</Button></> : <Button onClick={close}>关闭</Button>}>
    {confirmDiscard ? <p>关闭后，本次修改将丢失。</p> : <div className="sr-dialog-content">
      {view === 'edit' && <>
        {!auto && <section><h3>基础信息</h3>
          <label className="sr-field">规则名称<Input aria-label="规则名称" value={name} maxLength={50} disabled={Boolean(route)} onChange={setName} /></label>
          {name.trim() && <p>路由 ID <code>{route?.callId || `@preset/${name.trim()}`}</code></p>}
          <label className="sr-field">规则描述<TextArea aria-label="规则描述" value={config.description} maxLength={200}
            onChange={description => setConfig({ ...config, description })} /></label>
        </section>}
        {!models.length && <Banner type="info" description="当前空间暂无可配置的文本模型。" />}
        <RoutingConfig config={config} models={models} auto={auto} onOrder={openOrders}
          onChange={patch => setConfig(previous => ({ ...previous, ...patch }))} />
      </>}
      {view === 'details' && <ConfigSummary config={active?.config || route.draft} models={models} />}
      {view === 'history' && <>
        <span className="sr-only" id={versionLabelId}>历史版本</span>
        <Select aria-labelledby={versionLabelId} value={version} onChange={setVersion} optionList={route.versions.toReversed().map(row =>
          option(row.number, `v${row.number}${row.number === active?.number ? ' · 当前版本' : ''} · ${new Date(row.at).toLocaleString('zh-CN', { timeZone: 'Asia/Shanghai' })} · ${row.actor}`))} />
        <ConfigSummary config={versionRow?.config} models={models} />
      </>}
      {view === 'stop' && <p>停用后，使用 <code>{route.callId}</code> 的新请求将无法调用该路由。</p>}
      {view === 'api' && <>
        {!route.projectRoute && !route.enabled && <Banner type="info" description="请先启用该路由。" />}
        <p>使用项目 API Key，在 <code>model</code> 中填写 <code>{route.callId}</code>。</p>
        {route.hasUserRule && <p>按用户标签匹配时，将 <code>metadata._user</code> 设为规则中的值。</p>}
        <div className="sr-row"><Button size="small" onClick={() => openKeys(route.projectId || project?.id)}>前往 API Key 管理</Button>
          <Button size="small" onClick={() => copy(curl)}>复制示例</Button></div>
        <pre>{curl}</pre><span role="status">{copyState}</span>
      </>}
      {view === 'preview' && <>
        <p><code>{route.callId}</code> · v{active.number}{project && ` · ${project.name}`}</p>
        <label className="sr-field">请求内容<TextArea aria-label="请求内容" value={prompt} maxLength={2000}
          onChange={value => { setPrompt(value); setTargets(null); }} /></label>
        <Button disabled={!prompt.trim()} onClick={() => setTargets(routeTargets(active.config,
          project ? services.filter(row => projectModelEnabled(project, row.serviceModelId || row.modelKey)) : services,
          route.callId, { inputTokens: Math.ceil(new TextEncoder().encode([active.config.systemPrompt, prompt].filter(Boolean).join('\n')).length / 4) }))}>预览候选顺序</Button>
        {targets && <div aria-live="polite">{targets.length ? <ol>{targets.map(row =>
          <li key={row.callId}>{row.name} · {row.mode === 'standard' ? '平台调度' : row.providerName || row.provider} · <code>{row.callId}</code></li>)}</ol>
          : <p>当前请求没有可用候选，请核对模型状态和项目权限。</p>}</div>}
      </>}
      {view === 'guide' && <ul><li>智能匹配按策略在所选模型范围内选路。</li>
        <li>模型预设按首选和备用模型顺序调用，可配置提示词和参数。</li>
        <li>项目分流按本项目的 API Key 或用户标签匹配模型服务。</li></ul>}
      {error && <Banner type="danger" description={error} />}
    </div>}
  </Modal>;
}

export default function SmartRouting({ tenant, projectId, saveRoute, openKeys, openOrders, apiUrl }) {
  const [tab, setTab] = useState('auto');
  const [query, setQuery] = useState('');
  const [dialog, setDialog] = useState(null);
  const services = tenant.routeServices || tenant.services;
  const models = routeModels(services);
  const project = tenant.projects.find(row => row.id === projectId);
  const configs = tenant.routes;
  const canWrite = Boolean(tenant.identity) && Number.isSafeInteger(tenant.revision);
  const open = (view, route) => setDialog({ view, route, revision: tenant.revision });
  const auto = autoStrategies.map(strategy => configs.find(row => row.kind === 'auto' && row.callId === strategy.callId) || { ...strategy, kind: 'auto' });
  const presets = configs.filter(row => row.kind !== 'auto' && [title(row), row.callId || row.id].some(value => value?.toLowerCase().includes(query.trim().toLowerCase())));
  const validCount = row => {
    const config = activeTenantVersion(row)?.config;
    return config ? new Set(routeTargets(config, services, '').map(service => service.modelKey)).size : 0;
  };
  const actions = (row, autoRow) => row.kind ? <div className="sr-row">
    {row.enabled && <Button theme="borderless" size="small" onClick={() => open('preview', row)}>选路预览</Button>}
    <Button theme="borderless" size="small" onClick={() => open('api', row)}>API 示例</Button>
    {canWrite && (!autoRow || tenant.canManage) && <>
      <Button theme="borderless" size="small" onClick={() => open('edit', row)}>{row.id ? '编辑' : '配置'}</Button>
      {row.enabled && <Button theme="borderless" type="tertiary" size="small" onClick={() => open('stop', row)}>停用</Button>}
    </>}
  </div> : null;
  const status = row => {
    const count = validCount(row), total = activeTenantVersion(row)?.config.models.length;
    if (!row.kind) return <Tag>历史配置</Tag>;
    if (!row.enabled) return <Tag>未生效</Tag>;
    if (!count) return <Tag color="orange">无可用候选</Tag>;
    return <Tag color={count < total ? 'orange' : 'green'}>{count < total ? '部分不可用' : '已生效'}</Tag>;
  };
  const common = [
    { title: '路由 ID', width: 200, render: (_, row) => <code>{row.callId || row.id}</code> },
    { title: '状态', width: 106, render: (_, row) => status(row) },
  ];
  const routeName = row => row.kind ? <Button theme="borderless" size="small" onClick={() => open('details', row)}>{title(row)}</Button> : title(row);
  const autoColumns = [
    { title: '策略', width: 120, render: (_, row) => routeName(row) }, common[0],
    { title: '可用模型', width: 105, render: (_, row) => `${validCount(row)} / ${models.length}` },
    { title: '供应商排序', width: 125, render: (_, row) => providerSorts.find(item =>
      item.value === (activeTenantVersion(row)?.config.sort || row.draft?.sort || 'default'))?.label },
    common[1], { title: '操作', width: 256, render: (_, row) => actions(row, true) },
  ];
  const presetColumns = [
    { title: '规则名称', width: 140, render: (_, row) => routeName(row) }, common[0],
    { title: '首选模型', width: 150, render: (_, row) => {
      const id = activeTenantVersion(row)?.config.models[0];
      return models.find(model => model.id === id)?.name || id || row.models?.[0] || '—';
    } },
    { title: '备用模型', width: 90, render: (_, row) => Math.max(0, (activeTenantVersion(row)?.config.models.length ?? row.models?.length ?? 0) - 1) },
    { title: '版本', width: 75, render: (_, row) => row.activeVersion
      ? <Button theme="borderless" size="small" onClick={() => open('history', row)}>v{row.activeVersion}</Button> : '—' },
    common[1], { title: '操作', width: 256, render: (_, row) => actions(row, false) },
  ];
  return <div className="route-page smart-routing">
    <FrontPageHeader title="智能路由" icon={Route} description="为请求选择模型和可用的模型服务。"
      actions={<Button theme="borderless" onClick={() => open('guide')}>操作引导</Button>} />
    {tenant.error && <Banner type="warning" description={tenant.error} />}
    <Tabs activeKey={tab} onChange={setTab} keepDOM tabPaneMotion={false}>
      <Tabs.TabPane itemKey="auto" tab="智能匹配">
        <Table rowKey="callId" columns={autoColumns} dataSource={auto} pagination={false} scroll={{ x: 912 }} />
      </Tabs.TabPane>
      <Tabs.TabPane itemKey="rules" tab="模型预设">
        <div className="sr-toolbar">
          <div className="sr-row"><Input aria-label="搜索路由规则" placeholder="搜索名称或路由 ID" value={query} onChange={setQuery} />
            <Button theme="solid" disabled={!canWrite} onClick={() => open('edit')}>新建模型预设</Button></div>
        </div>
        <Table rowKey="id" columns={presetColumns} dataSource={presets} pagination={false}
          scroll={{ x: 1017 }} empty={query ? '没有匹配的规则' : '暂无模型预设'} />
      </Tabs.TabPane>
    </Tabs>
    {dialog && <RouteDialog dialog={dialog} close={() => setDialog(null)} services={services} models={models}
      saveRoute={saveRoute} project={project} openKeys={openKeys} openOrders={openOrders} apiUrl={apiUrl} />}
  </div>;
}
