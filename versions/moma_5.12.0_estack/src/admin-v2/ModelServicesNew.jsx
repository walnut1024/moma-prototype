import { useId, useLayoutEffect, useRef, useState } from 'react';
import {
  Banner, Button, Card, Descriptions, Empty, Input, InputNumber, RadioGroup, Select,
  Space, Switch, Tabs, Tag, TextArea, Toast, Typography,
} from '@douyinfe/semi-ui';
import { IconPlus, IconSearch } from '@douyinfe/semi-icons';
import { resourceId } from '../resource-id.mjs';
import AdminActionMenu from './AdminActionMenu';
import AdminPageHeading from './AdminPageHeading';
import AdminStatus from './AdminStatus';
import Table from './AdminTable';
import { Choice, CopyId, Field, Modal, Notice } from './ServiceUI';
import { displayTime, SERVICE_MODEL_TYPES } from './model-management';
import { channelFingerprint } from './provider-channels';
import { additionalMappingOptions, mappingCandidates, mappingInterfaces } from './service-model-mappings';
import { modelLibrary } from './model-library';
import {
  channelSetupIssue, contextRoutingEnabled, rateIssue, readNewServices, saveNewServices, serviceChannelShares,
  serviceIdentityIssue, serviceLevels, serviceMetrics, tenantServiceRates,
} from './model-services-new';
import './model-services-new.css';

const pageHref = '#/admin-2/listing-new';
const channelHref = '#/admin-2/providers-reference';
const { Text, Title } = Typography;
const tabs = [['basic', '基本信息'], ['limits', '限流策略'], ['channels', '渠道模型'], ['grants', '开通管理'], ['batch', '批处理配置']];
const batchModes = [
  { label: 'Batch → Batch', value: 'batch', description: '使用独立批处理资源，需要上游渠道支持原生 Batch 接口。' },
  { label: 'Batch → Chat', value: 'chat', description: '与在线调用共用资源，通过并发余量占比控制批处理可用并发。' },
];
const chatEndpoints = ['/v1/chat/completions', '/v1/messages', '/v1/responses', '/v1/completions'];
const blank = { name: '', callId: '', modelId: '', note: '', description: '', tags: '' };
const pagination = { pageSize: 10, hideOnSinglePage: true };
const listingStatus = row => row.listed ? '已上架' : '未上架';
const typeLabel = type => SERVICE_MODEL_TYPES[type] || type;
const detailHref = (id, tab) => pageHref + '?' + new URLSearchParams({ service: id, ...(tab !== 'basic' && { tab }) });
const searchMatches = (query, ...fields) => fields.join(' ').toLowerCase().includes(query.trim().toLowerCase());
const formatNumber = value => value == null ? '—' : value.toLocaleString('zh-CN');

function NumberField({ label, value, onChange, min = 0, max, required, placeholder }) {
  return <Field label={label} required={required}><InputNumber min={min} max={max} step={1} hideButtons
    value={value ?? ''} placeholder={placeholder} aria-label={label}
    onChange={next => onChange(next === '' || next == null ? null : Number(next))}/></Field>;
}

function LimitFields({ metrics, rates, onChange, placeholder }) {
  return metrics.map(metric => <NumberField key={metric} label={metric.toUpperCase()} value={rates[metric]}
    onChange={value => onChange({ ...rates, [metric]: value })} placeholder={placeholder}/>);
}

function BasicInformation({ service, model, sources }) {
  const supported = new Set(model ? [
    ...mappingInterfaces(model).map(([path]) => path),
    ...sources.flatMap(source => additionalMappingOptions(model, source).map(({ path }) => path)),
  ] : []);
  const endpoints = ['text', 'multimodal'].includes(service.type) ? chatEndpoints : [...supported];
  const endpointList = endpoints.length ? <Space wrap>
    {endpoints.map(path => supported.has(path)
      ? <Tag key={path}><CopyId label="端点" value={path}/></Tag>
      : <Tag key={path} type="ghost">{path} · 未配置</Tag>)}
  </Space> : null;
  const list = value => Array.isArray(value) ? value.join('、') : value;
  const details = [
    ['模型服务名称', service.name],
    ['模型服务 ID', <CopyId label="模型服务 ID" value={service.id}/>],
    ['模型调用标识', <CopyId value={service.callId}/>],
    ['服务地址', '待接入网关'],
    ['端点', endpointList],
    ['模型名称', model?.name || service.modelName],
    ['模型厂商', model?.profile?.author || model?.maker],
    ['模型类型', typeLabel(service.type)],
    ['输入类型', list(model?.profile?.inputModalities || model?.inputModalities)],
    ['上下文长度', formatNumber(model?.capabilities?.context)],
    ['模型规格', list(model?.profile?.specifications || model?.profile?.size)],
    ['特性能力', [model?.capabilities?.streaming && '流式响应', model?.capabilities?.tools && '工具调用'].filter(Boolean).join('、')],
    ['上架状态', <AdminStatus value={listingStatus(service)}/>],
    ['标签', service.tags],
    ['备注', service.note],
    ['描述', service.description],
    ['创建人', service.createdBy],
    ['创建时间', displayTime(service.createdAt)],
  ];
  return <Descriptions align="left" data={details.map(([key, value]) => ({ key, value: value || '—' }))}/>;
}

function ChannelModels({ service, rows, canEdit, open, openContext, toggleContext }) {
  const [input, setInput] = useState('');
  const [status, setStatus] = useState('all');
  const [tokens, setTokens] = useState(null);
  const enabled = contextRoutingEnabled(service);
  const shares = serviceChannelShares(rows, enabled ? tokens : null);
  const filtered = rows.filter(row => searchMatches(input, row.provider, row.name, row.upstreamId)
    && (status === 'all' || (status === 'enabled') === (row.enabled && !row.reason)));
  const columns = [
    { title: '渠道名称', width: 148, render: (_, row) => <div className="new-service-cell"><Text strong>{row.name}</Text><Text type="tertiary">{row.provider}</Text></div> },
    { title: '模型名称 / 模型标识', width: 170, render: (_, row) => <div className="new-service-cell">
      <Text strong>{service.name}</Text><Text type="tertiary">{row.upstreamId}</Text></div> },
    { title: '模型类型', width: 96, render: () => <Tag color="blue">{typeLabel(service.type)}</Tag> },
    { title: '状态', width: 108, render: (_, row) => <div className="new-service-cell"><AdminStatus value={row.reason ? '不可用' : row.enabled ? '已启用' : '已停用'}/>{row.reason && <Text type="tertiary">{row.reason}</Text>}</div> },
    { title: '优先级', width: 80, dataIndex: 'priority' },
    { title: '权重', width: 64, dataIndex: 'weight' },
    { title: '操作', fixed: 'right', width: 160, render: (_, row) => <Space className="new-service-channel-actions" spacing={4}>
      <Button size="small" theme="borderless" disabled={!canEdit} onClick={() => open('channel', row)}>编辑</Button>
      <Button size="small" theme="borderless" disabled={!canEdit || !row.enabled && Boolean(row.reason)}
        onClick={() => open(row.enabled ? 'stopChannel' : 'startChannel', row)}>{row.enabled ? '停用' : '启用'}</Button>
      <Button size="small" theme="borderless" type="danger" disabled={!canEdit} onClick={() => open('removeChannel', row)}>移除</Button>
    </Space> },
  ];
  return <>
    <div className="new-service-toolbar new-service-route-bar">
      <Space wrap>
        <Text strong>上下文长度路由</Text>
        <Switch aria-label="上下文长度路由" size="small" checked={enabled} disabled={!canEdit || !rows.length} onChange={toggleContext}/>
        <Text type="secondary">{enabled ? '已开启 · ' + service.tokenizer : '已关闭 · 按优先级分组，同优先级按权重分流'}</Text>
      </Space>
      <Button theme="borderless" size="small" disabled={!canEdit || !enabled} onClick={openContext}>配置 Tokenizer 及上下文长度</Button>
    </div>
    <div className="new-service-toolbar">
      <div className="new-service-filters">
        <Choice label="渠道模型状态" options={[['all', '全部状态'], ['enabled', '已启用'], ['disabled', '不可用或已停用']]} value={status} onChange={setStatus}/>
        <Input className="new-service-search" prefix={<IconSearch aria-hidden="true"/>} value={input} onChange={setInput}
          showClear aria-label="搜索渠道模型" placeholder="搜索渠道或模型"/>
      </div>
      <Space wrap>
        <Button disabled={!canEdit || !rows.length} onClick={() => open('weights', Object.fromEntries(rows.map(row => [row.id, row.weight])))}>批量设置权重</Button>
        <Button disabled={!canEdit} theme="solid" icon={<IconPlus/>} onClick={() => open('channel', { channelId: '', priority: 0, weight: 100, context: null })}>添加渠道模型</Button>
      </Space>
    </div>
    <Table columns={columns} dataSource={filtered} rowKey="id" scroll={{ x: 826 }} pagination={pagination} empty="暂无匹配的渠道模型"/>
    {enabled && <div className="new-service-toolbar new-service-route-preview">
      <InputNumber min={1} step={1} hideButtons value={tokens ?? ''} aria-label="预览请求 Token 数" placeholder="输入 Token 数预览分流"
        onChange={value => setTokens(typeof value === 'number' && Number.isSafeInteger(value) && value > 0 ? value : null)}/>
      <Text type="secondary" aria-live="polite">{rows.filter(row => shares.has(row.id)).map(row => row.name + ' ' +
        new Intl.NumberFormat('zh-CN', { style: 'percent', maximumFractionDigits: 1 }).format(shares.get(row.id))).join('、') || '没有符合条件的渠道'}</Text>
    </div>}
  </>;
}

function ServiceGrants({ service, tenants, canEdit, open }) {
  const [query, setQuery] = useState('');
  const metrics = serviceMetrics(service.type);
  const rows = service.grants.map(grant => {
    const tenant = tenants.find(row => row.id === grant.tenantId);
    return { ...grant, tenant, ratesShown: tenantServiceRates(service, grant) };
  }).filter(row => searchMatches(query, row.tenant?.name, row.tenantId));
  const columns = [
    { title: '租户名称', width: 200, render: (_, row) => row.tenant?.name || row.tenantId },
    { title: '服务等级', dataIndex: 'level', width: 100 },
    { title: '租户简介', width: 240, render: (_, row) => row.tenant?.description || '—' },
    ...metrics.map(metric => ({ title: metric.toUpperCase(), width: 125, render: (_, row) => <div className="new-service-cell">
      <Text>{formatNumber(row.ratesShown[metric])}</Text>
      {row.ratesShown[metric] != null && <Text type="tertiary">{row.rates[metric] == null ? '继承服务等级' : '租户自定义'}</Text>}
    </div> })),
    { title: '操作', width: 160, fixed: 'right', render: (_, row) => <Space spacing={4}>
      <Button size="small" theme="borderless" disabled={!canEdit} onClick={() => open('grant', row)}>限流设置</Button>
      <Button size="small" theme="borderless" type="danger" disabled={!canEdit} onClick={() => open('removeGrant', row)}>移除</Button>
    </Space> },
  ];
  return <>
    <div className="new-service-toolbar">
      <Input className="new-service-search" prefix={<IconSearch aria-hidden="true"/>} value={query} onChange={setQuery}
        showClear aria-label="搜索已开通租户" placeholder="搜索租户名称或 ID"/>
      <Button disabled={!canEdit || !service.listed} theme="solid" icon={<IconPlus/>}
        onClick={() => open('grant', { tenantId: '', level: '', rates: {} })}>添加租户权限</Button>
    </div>
    {!service.listed && <Text type="secondary">模型服务上架后可给租户开通。</Text>}
    <Table columns={columns} dataSource={rows} rowKey="tenantId" scroll={{ x: 780 }} pagination={pagination} empty="暂无匹配的租户"/>
  </>;
}

function loadServices() {
  try { return { rows: readNewServices(localStorage), error: '' }; }
  catch (error) { return { rows: [], error: error.message }; }
}

export default function ModelServicesNew({ state, params, dirtyRef, sourceConflict }) {
  const [data, setData] = useState(loadServices);
  const [query, setQuery] = useState('');
  const [editState, setEditState] = useState(null);
  const formId = useId();
  const opener = useRef(null);
  const serviceId = params.get('service');
  if (editState && editState.serviceId !== serviceId) setEditState(null);
  const service = data.rows.find(row => row.id === serviceId);
  const activeTab = tabs.some(([id]) => id === params.get('tab')) ? params.get('tab') : 'basic';
  const dialog = editState?.serviceId === serviceId ? editState : null;
  const canEdit = !data.error && !sourceConflict && ['平台管理员', '运营人员'].includes(state.currentRole);
  const models = modelLibrary(state).filter(row => !row.archivedAt && !state.modelData?.archivedCatalogueIds?.includes(row.id));
  const model = models.find(row => row.id === service?.modelId);
  const candidates = model ? mappingCandidates(state, { modelId: model.id }) : [];
  const candidatesById = new Map(candidates.map(channel => [channel.id, channel]));
  const channels = service?.channels.map(row => {
    const source = candidatesById.get(row.channelId);
    const reason = !source ? '渠道模型已不可用' : source.reason || (row.fingerprint !== channelFingerprint(source) ? '渠道配置已变更，请重新核对' : '');
    return { ...row, reason };
  }) || [];
  const metrics = serviceMetrics(service?.type);
  const dirty = Boolean(dialog?.dirty);
  useLayoutEffect(() => {
    dirtyRef.current = dirty;
    return () => { dirtyRef.current = false; };
  }, [dirty, dirtyRef]);
  const close = () => {
    dirtyRef.current = false;
    setEditState(null);
    const button = opener.current;
    requestAnimationFrame(() => { if (button?.isConnected && document.activeElement === document.body) button.focus({ preventScroll: true }); });
  };
  const open = (kind, values = {}) => {
    if (!dialog) opener.current = document.activeElement;
    setEditState({ kind, values, serviceId, error: '' });
  };
  const change = patch => setEditState(current => ({ ...current, values: { ...current.values, ...patch }, error: '', dirty: true }));
  const error = message => setEditState(current => ({ ...current, error: message }));
  const updateRows = rows => {
    saveNewServices(localStorage, data.rows, rows);
    setData({ rows, error: '' });
    close();
    Toast.success('已保存');
  };
  const openContext = () => open('context', {
    tokenizer: service.tokenizer || model?.profile?.tokenizer || '',
    contexts: Object.fromEntries(service.channels.map(row => [row.id, row.context])),
  });
  const toggleContext = enabled => {
    if (!canEdit) return;
    const next = { ...service, contextPaused: !enabled };
    if (enabled && (!next.tokenizer || channelSetupIssue(next))) {
      openContext();
      return;
    }
    try {
      updateRows(data.rows.map(row => row.id === next.id ? next : row));
    } catch (issue) {
      Toast.error(issue.message);
    }
  };
  const apply = () => {
    if (!canEdit || !dialog || dialog.discard) return;
    const { kind, values } = dialog;
    const record = values.target ? data.rows.find(row => row.id === values.target) : service;
    try {
      if (kind === 'create' || kind === 'edit') {
        const fields = Object.fromEntries(Object.keys(blank).map(key => [key, values[key].trim()]));
        const issue = serviceIdentityIssue(fields, data.rows, service?.id);
        if (issue) throw Error(issue);
        if (kind === 'create') {
          const source = models.find(row => row.id === fields.modelId);
          if (!source) throw Error('请选择有效的模型资料');
          const actor = state.admins.find(row => row.id === state.adminSession.accountId);
          const initial = {
            ...fields, id: resourceId('model-service'), modelName: source.name, type: source.type, listed: false,
            createdBy: actor?.name || state.adminSession.accountId, createdAt: new Date().toISOString(),
            limits: {}, channels: [], grants: [], tokenizer: '', batch: null,
          };
          updateRows([initial, ...data.rows]);
          location.hash = detailHref(initial.id, 'basic');
          return;
        }
        updateRows(data.rows.map(row => row.id === service.id ? { ...row, ...fields } : row));
        return;
      }
      if (!record) throw Error('未找到指定模型服务');
      const next = { ...record };
      if (kind === 'list' || kind === 'unlist') {
        const sources = mappingCandidates(state, { modelId: record.modelId });
        if (kind === 'list' && !record.channels.some(row => row.enabled && sources.some(source =>
          source.id === row.channelId && !source.reason && channelFingerprint(source) === row.fingerprint))) {
          throw Error('请先添加并启用可用的渠道模型');
        }
        next.listed = kind === 'list';
      } else if (kind === 'limits') {
        const issue = Object.values(values).map(rateIssue).find(Boolean);
        if (issue) throw Error(issue);
        next.limits = values;
      } else if (kind === 'channel') {
        const source = candidatesById.get(values.channelId);
        if (!source || source.reason) throw Error(source?.reason || '请选择可用的渠道模型');
        if (service.channels.some(row => row.channelId === source.id && row.id !== values.id)) throw Error('该渠道模型已关联');
        if (!Number.isSafeInteger(values.priority) || values.priority < 0 || !Number.isSafeInteger(values.weight) || values.weight < 1) {
          throw Error('优先级需为非负整数，权重需为正整数');
        }
        if (values.context != null && (!Number.isSafeInteger(values.context) || values.context < 1)) throw Error('上下文长度需为正整数');
        const link = {
          id: values.id || resourceId('service-channel'), channelId: source.id, name: source.sourceName || source.name || source.endpoint.name,
          provider: source.provider.name, upstreamId: source.upstreamModelId, fingerprint: channelFingerprint(source),
          priority: values.priority, weight: values.weight, context: values.context, enabled: values.enabled ?? true,
        };
        next.channels = values.id ? service.channels.map(row => row.id === values.id ? link : row) : [...service.channels, link];
      } else if (kind === 'weights') {
        if (Object.values(values).some(value => !Number.isSafeInteger(value) || value < 1)) throw Error('权重需为正整数');
        next.channels = service.channels.map(row => ({ ...row, weight: values[row.id] }));
      } else if (['stopChannel', 'startChannel', 'removeChannel'].includes(kind)) {
        if (kind === 'startChannel' && channels.find(row => row.id === values.id)?.reason) throw Error('请先核对渠道模型配置');
        next.channels = kind === 'removeChannel' ? service.channels.filter(row => row.id !== values.id)
          : service.channels.map(row => row.id === values.id ? { ...row, enabled: kind === 'startChannel' } : row);
        if (next.listed && !next.channels.some(row => row.enabled && !channels.find(channel => channel.id === row.id)?.reason)) {
          throw Error('上架中的服务至少需要一个可用渠道，请先下架服务');
        }
      } else if (kind === 'context') {
        const tokenizer = values.tokenizer.trim();
        if (!tokenizer) throw Error('请填写 Tokenizer 名称');
        if (tokenizer.length > 120) throw Error('Tokenizer 名称最多 120 个字符');
        if (Object.values(values.contexts).some(value => value != null && (!Number.isSafeInteger(value) || value < 1))) {
          throw Error('上下文长度需为正整数');
        }
        next.tokenizer = tokenizer;
        next.contextPaused = false;
        next.channels = service.channels.map(row => ({ ...row, context: values.contexts[row.id] }));
      } else if (kind === 'grant') {
        const existing = service.grants.some(row => row.tenantId === values.originalTenant);
        if (!existing && !service.listed) throw Error('请先上架模型服务');
        if (!existing && !state.tenants.some(row => row.id === values.tenantId)) throw Error('请选择有效的租户');
        if (service.grants.some(row => row.tenantId === values.tenantId) && !existing) throw Error('该租户已开通此服务');
        if (!serviceLevels.includes(values.level)) throw Error('请选择服务等级');
        const issue = rateIssue(values.rates);
        if (issue) throw Error(issue);
        const grant = { tenantId: values.tenantId, level: values.level, rates: values.rates };
        next.grants = existing ? service.grants.map(row => row.tenantId === values.originalTenant ? grant : row) : [...service.grants, grant];
      } else if (kind === 'removeGrant') {
        next.grants = service.grants.filter(row => row.tenantId !== values.tenantId);
      } else if (kind === 'batch') {
        if (!['batch', 'chat'].includes(values.mode)) throw Error('请选择批处理模式');
        if (values.mode === 'chat' && (!Number.isInteger(values.reserve) || values.reserve < 1 || values.reserve > 100)) {
          throw Error('并发余量占比需为 1–100 的整数');
        }
        next.batch = { mode: values.mode, reserve: values.mode === 'chat' ? values.reserve : null };
      } else if (kind === 'stopBatch') {
        next.batch = null;
      } else if (kind === 'remove') {
        if (record.listed || record.grants.length) throw Error('请先下架服务并移除租户授权');
        updateRows(data.rows.filter(row => row.id !== record.id));
        location.hash = pageHref;
        return;
      }
      const issue = channelSetupIssue(next);
      if (issue) throw Error(issue);
      updateRows(data.rows.map(row => row.id === next.id ? next : row));
    } catch (issue) {
      error(issue.message);
    }
  };

  const serviceActions = row => [
    { node: 'item', name: row.listed ? '下架' : '上架', disabled: !canEdit, onClick: () => open(row.listed ? 'unlist' : 'list', { target: row.id }) },
    { node: 'item', name: '删除', disabled: !canEdit || row.listed || row.grants.length > 0, onClick: () => open('remove', { target: row.id }) },
  ];
  const columns = [
    { title: '模型服务名称 / ID', width: 290, fixed: 'left', render: (_, row) => <div className="new-service-cell">
      <Text strong link={{ href: detailHref(row.id, 'basic') }}>{row.name}</Text><CopyId label="模型服务 ID" value={row.id} ellipsis={{ pos: 'middle', showTooltip: true }}/>
    </div> },
    { title: '模型类型', width: 110, render: (_, row) => <Tag color="blue">{typeLabel(row.type)}</Tag> },
    { title: '上架状态', width: 100, render: (_, row) => <AdminStatus value={listingStatus(row)}/> },
    { title: '备注', dataIndex: 'note', width: 175, ellipsis: true },
    { title: '创建人 / 时间', width: 175, render: (_, row) => <div className="new-service-cell"><Text>{row.createdBy}</Text><Text type="tertiary">{displayTime(row.createdAt)}</Text></div> },
    { title: '操作', width: 140, fixed: 'right', render: (_, row) => <Space spacing={4}>
      <Button theme="borderless" size="small" onClick={() => { location.hash = detailHref(row.id, 'basic'); }}>查看</Button>
      <AdminActionMenu label={'更多：' + row.name} items={serviceActions(row)}>更多</AdminActionMenu>
    </Space> },
  ];

  const { kind, values } = dialog || {};
  const target = values?.target ? data.rows.find(row => row.id === values.target) : service;
  const grantOpen = (action, row) => open(action, action === 'grant' && row.tenantId ? { ...row, originalTenant: row.tenantId } : row);
  const titles = {
    create: '添加模型', edit: '编辑信息', limits: '编辑限流策略', list: '上架模型服务', unlist: '下架模型服务',
    channel: values?.id ? '编辑渠道模型' : '添加渠道模型', startChannel: '启用渠道模型', stopChannel: '停用渠道模型',
    removeChannel: '移除渠道模型', weights: '批量设置权重', context: '配置 Tokenizer 及上下文长度',
    grant: values?.originalTenant ? '限流设置' : '添加租户权限', removeGrant: '移除租户权限',
    batch: '批处理配置', stopBatch: '停用批处理', remove: '删除模型服务',
  };
  return <div className="admin-page-stack new-model-services">
    {data.error && <Banner type="danger" description={data.error} closeIcon={null}/>}
    {!serviceId ? <>
      <AdminPageHeading title="模型服务"/>
      <Card>
        <div className="new-service-toolbar">
          <Input className="new-service-search" prefix={<IconSearch aria-hidden="true"/>} showClear
            aria-label="搜索模型服务" placeholder="搜索模型服务名称 / ID" value={query} onChange={setQuery}/>
          <Button theme="solid" icon={<IconPlus/>} disabled={!canEdit} onClick={() => open('create', blank)}>添加模型</Button>
        </div>
        <Table columns={columns} dataSource={data.rows.filter(row => searchMatches(query, row.name, row.id, row.callId))}
          rowKey="id" scroll={{ x: 950 }} pagination={pagination} empty="暂无匹配的模型服务"/>
      </Card>
    </> : service ? <>
      <AdminPageHeading title={service.name}>
        {activeTab === 'basic' && <Button disabled={!canEdit} onClick={() => open('edit', service)}>编辑信息</Button>}
        {activeTab === 'limits' && <Button disabled={!canEdit} onClick={() => open('limits', service.limits)}>编辑限流策略</Button>}
      </AdminPageHeading>
      <Card>
        <Tabs activeKey={activeTab} keepDOM={false} onChange={tab => { location.hash = detailHref(service.id, tab); }}>
          {tabs.map(([id, label]) => <Tabs.TabPane key={id} itemKey={id} tab={label}>
          {activeTab === id && <div className="new-service-tab">
          {activeTab === 'basic' && <BasicInformation service={service} model={model}
            sources={channels.filter(row => row.enabled && !row.reason).map(row => candidatesById.get(row.channelId))}/>}
          {activeTab === 'limits' && <Table columns={[{ title: '服务等级', dataIndex: 'level' }, ...metrics.map(metric => ({
              title: metric.toUpperCase(), render: (_, row) => formatNumber(service.limits[row.level]?.[metric]),
            }))]} dataSource={serviceLevels.map(level => ({ level }))} rowKey="level" pagination={false}/>}
          {activeTab === 'channels' && <ChannelModels service={service} rows={channels} canEdit={canEdit} open={open}
            openContext={openContext} toggleContext={toggleContext}/>}
          {activeTab === 'grants' && <ServiceGrants service={service} tenants={state.tenants} canEdit={canEdit} open={grantOpen}/>}
          {activeTab === 'batch' && (service.batch ? <>
            <div className="new-service-toolbar"><Title heading={5}>批处理模式</Title><Space wrap>
              <Button disabled={!canEdit} onClick={() => open('batch', service.batch)}>编辑配置</Button>
              <Button disabled={!canEdit} onClick={() => open('stopBatch')}>停用批处理</Button>
            </Space></div>
            <Descriptions align="left" data={[
              { key: '模式', value: batchModes.find(row => row.value === service.batch.mode)?.label },
              ...(service.batch.mode === 'chat' ? [{ key: '并发余量占比', value: service.batch.reserve + '%' }] : []),
            ]}/>
          </> : <section className="new-service-empty">
            <Title heading={5} component="h2">尚未启用批处理模式</Title>
            <Text type="secondary">配置批处理模式及对应的接口能力。参考端点 <code>/v1/batch</code></Text>
            <div className="new-service-batch-modes">
              {batchModes.map(mode => <div key={mode.value}><Text strong>{mode.label}</Text> <Text type="secondary">{mode.description}</Text></div>)}
            </div>
            <Button theme="solid" disabled={!canEdit} onClick={() => open('batch', { mode: '', reserve: null })}>开始配置</Button>
          </section>)}
          </div>}
          </Tabs.TabPane>)}
        </Tabs>
      </Card>
    </> : <Card><Empty description="未找到指定模型服务"><Button onClick={() => { location.hash = pageHref; }}>返回模型服务</Button></Empty></Card>}
    {dialog && <Modal title={titles[kind]} wide={kind === 'context'} onClose={() => dirty ? setEditState(current => ({ ...current, discard: true })) : close()}
      maskClosable={false} footer={<>
        <Button onClick={() => dirty ? setEditState(current => ({ ...current, discard: true })) : close()}>取消</Button>
        <Button theme="solid" disabled={!canEdit || dialog.discard} form={formId} htmlType="submit">{
          kind === 'create' ? '创建模型服务' : kind === 'list' ? '确认上架' : kind === 'unlist' ? '确认下架'
            : kind === 'remove' ? '确认删除' : '保存'
        }</Button>
      </>}>
      <form id={formId} className="new-service-form" onSubmit={event => { event.preventDefault(); apply(); }}>
        {(kind === 'create' || kind === 'edit') && <>
          {kind === 'create' && <Field label="模型资料" required><Select filter value={values.modelId || undefined}
            placeholder="选择模型资料" optionList={models.map(row => ({ value: row.id, label: row.name + ' · ' + row.modelId }))}
            onChange={value => change({ modelId: value })} style={{ width: '100%' }}/></Field>}
          <Field label="模型服务名称" required><Input aria-label="模型服务名称" value={values.name} maxLength={120} onChange={value => change({ name: value })}/></Field>
          <Field label="模型调用标识" required hint="调用方在 API 请求的 model 字段填写此值。">
            <Input aria-label="模型调用标识" value={values.callId} maxLength={128} onChange={value => change({ callId: value })}/>
          </Field>
          <Field label="标签"><Input aria-label="标签" value={values.tags} maxLength={160} onChange={value => change({ tags: value })}/></Field>
          <Field label="备注"><Input aria-label="备注" value={values.note} maxLength={240} onChange={value => change({ note: value })}/></Field>
          <Field label="描述"><TextArea aria-label="描述" value={values.description} maxLength={1600} onChange={value => change({ description: value })}/></Field>
        </>}
        {kind === 'limits' && <>
          <Text type="secondary">留空表示未配置，填写 0 表示该指标禁止调用。</Text>
          {serviceLevels.map(level => <div className="new-service-level" key={level}>
            <Text strong>{level}</Text>
            <LimitFields metrics={metrics} rates={values[level] || {}} placeholder="未配置" onChange={rates => change({ [level]: rates })}/>
          </div>)}
        </>}
        {kind === 'channel' && <>
          <Field label="渠道模型" required><Select filter value={values.channelId || undefined} disabled={Boolean(values.id)}
            placeholder="选择已登记的渠道模型" style={{ width: '100%' }}
            optionList={candidates.map(row => {
              const reason = row.reason || (service.channels.some(link => link.channelId === row.id && link.id !== values.id) ? '已关联' : '');
              return { value: row.id, disabled: Boolean(reason), label: [row.provider.name, row.sourceName || row.endpoint.name, row.upstreamModelId, reason].filter(Boolean).join(' · ') };
            })} onChange={value => change({ channelId: value })}/></Field>
          {(!candidates.some(row => !row.reason) || values.id && candidatesById.get(values.channelId)?.reason) &&
            <Text link={{ href: channelHref, target: '_blank', rel: 'noopener noreferrer' }}>前往渠道管理</Text>}
          <div className="new-service-fields">
            <NumberField label="优先级" value={values.priority} onChange={value => change({ priority: value })} required/>
            <NumberField label="权重" min={1} value={values.weight} onChange={value => change({ weight: value })} required/>
            {!values.id && contextRoutingEnabled(service) &&
              <NumberField label="上下文长度（Tokens）" min={1} required value={values.context} onChange={value => change({ context: value })}/>}
          </div>
          <Text type="secondary">优先级数值越小越优先，同优先级按权重分流。</Text>
        </>}
        {kind === 'context' && <>
          <Field label="Tokenizer" required>
            <Select filter allowCreate showClear style={{ width: '100%' }} value={values.tokenizer || undefined}
              placeholder="选择或输入分词器名称"
              optionList={[...new Set([values.tokenizer, ...models.map(row => row.profile?.tokenizer)].filter(value => typeof value === 'string' && value))]
                .map(value => ({ value, label: value }))}
              onSelect={value => change({ tokenizer: String(value) })} onClear={() => change({ tokenizer: '' })}/>
          </Field>
          <Table rowKey="id" pagination={false} dataSource={channels} scroll={{ x: 680 }} columns={[
            { title: '渠道名称', render: (_, row) => row.provider + ' · ' + row.name },
            { title: '上游模型调用标识', dataIndex: 'upstreamId' },
            { title: '上下文长度（Tokens）', width: 215, render: (_, row) =>
              <InputNumber min={1} step={1} hideButtons value={values.contexts[row.id] ?? ''} aria-label={row.name + '上下文长度（Tokens）'}
                onChange={value => change({ contexts: { ...values.contexts, [row.id]: value === '' || value == null ? null : Number(value) } })}/> },
          ]}/>
        </>}
        {kind === 'weights' && channels.map(row => <NumberField key={row.id} label={row.provider + ' · ' + row.name}
          min={1} required value={values[row.id]} onChange={value => change({ [row.id]: value })}/>)}
        {kind === 'grant' && <>
          <Field label="租户" required><Select value={values.tenantId || undefined} filter disabled={Boolean(values.originalTenant)}
            style={{ width: '100%' }} optionList={state.tenants.map(row => ({ value: row.id, label: row.name,
              disabled: service.grants.some(grant => grant.tenantId === row.id && grant.tenantId !== values.originalTenant),
            }))} onChange={value => change({ tenantId: value })}/></Field>
          <Field label="服务等级" required><Select value={values.level || undefined} style={{ width: '100%' }}
            optionList={serviceLevels.map(value => ({ value, label: value }))} onChange={value => change({ level: value })}/></Field>
          <div className="new-service-fields"><LimitFields metrics={metrics} rates={values.rates} placeholder="继承该服务等级"
            onChange={rates => change({ rates })}/></div>
        </>}
        {kind === 'batch' && <>
          <RadioGroup aria-label="批处理模式" direction="vertical" value={values.mode} options={batchModes}
            onChange={event => change({ mode: event.target.value })}/>
          {values.mode && <Text type="secondary">{batchModes.find(mode => mode.value === values.mode)?.description}</Text>}
          {values.mode === 'chat' && <NumberField label="并发余量占比（%）" min={1} max={100} required
            value={values.reserve} onChange={value => change({ reserve: value })}/>}
        </>}
        {['list', 'unlist', 'remove'].includes(kind) && <Text>{titles[kind] + '「' + target?.name + '」？'}</Text>}
        {['startChannel', 'stopChannel', 'removeChannel', 'removeGrant', 'stopBatch'].includes(kind)
          && <Text>{'确认' + titles[kind] + (values.name || values.tenant?.name ? '「' + (values.name || values.tenant.name) + '」' : '') + '？'}</Text>}
        {dialog.error && <Notice error>{dialog.error}</Notice>}
        {dialog.error.includes('其他页面') && <Button onClick={() => {
          const latest = loadServices();
          setData(latest);
          close();
        }}>放弃本次修改并载入最新配置</Button>}
        {dialog.discard && <Banner type="warning" closeIcon={null} description={<Space wrap>
          <Text>放弃本次未保存的修改？</Text><Button onClick={() => setEditState(current => ({ ...current, discard: false }))}>继续编辑</Button>
          <Button type="danger" onClick={close}>放弃修改</Button>
        </Space>}/>}
      </form>
    </Modal>}
  </div>;
}
