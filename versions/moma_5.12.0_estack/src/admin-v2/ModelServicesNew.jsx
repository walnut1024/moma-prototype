import { useEffect, useId, useLayoutEffect, useRef, useState } from 'react';
import {
  Banner, Button, Card, Collapse, Descriptions, Empty, Input, InputNumber, Select,
  Space, Tabs, Tag, TextArea, Toast, Tooltip, Typography,
} from '@douyinfe/semi-ui';
import { IconPlus, IconSearch } from '@douyinfe/semi-icons';
import AdminCollapsePanel from './AdminCollapsePanel';
import { resourceId } from '../resource-id.mjs';
import { cloudAdminRequest } from './admin-client.mjs';
import AdminPageHeading from './AdminPageHeading';
import AdminStatus from './AdminStatus';
import Table from './AdminTable';
import { Choice, CopyId, Field, FieldLabel, Modal, Notice } from './ServiceUI';
import { displayTime } from './model-management';
import { channelProcurementSnapshot } from './channel-change-management';
import { channelFingerprint } from './provider-channels';
import { additionalMappingOptions, mappingCandidates, mappingInterfaces } from './service-model-mappings';
import { libraryRecord, modelCatalogue } from './model-library';
import { INPUT_MODALITY_OPTIONS, OUTPUT_MODALITY_OPTIONS, RESULT_TYPE_OPTIONS, TASK_OPTIONS } from './model-profile';
import { pages } from './navigation.mjs';
import { DEFAULT_ROUTING_STRATEGY, ROUTING_STRATEGIES } from './service-routing-strategies.mjs';
import {
  channelSetupIssue, contextRoutingEnabled, preferredServiceChannels, readNewServices, SERVICE_DESCRIPTION_LIMIT,
  MODEL_SERVICE_TYPES, modelServiceType, serviceStatus,
  savedServiceModel, serviceChannelShares, serviceFormIssue, serviceModelFields, simulatedServiceChannels, validContextLength,
} from './model-services-new';
import './model-services-new.css';

const pageHref = '#/admin-2/listing-new';
const pageTitle = pages['listing-new'].label;
const channelHref = '#/admin-2/providers-reference';
const { Text } = Typography;
const tabs = [['basic', '基本信息'], ['channels', '渠道模型']];
const chatEndpoints = ['/v1/chat/completions', '/v1/messages', '/v1/responses', '/v1/completions'];
const blank = { name: '', callId: '', modelId: '', type: '', note: '', description: '' };
const typeOptions = Object.entries(MODEL_SERVICE_TYPES).map(([value, [label]]) => ({ value, label }));
const strategyOptions = Object.entries(ROUTING_STRATEGIES).map(([value, { label }]) => [value, label]);
const pagination = { pageSize: 10, hideOnSinglePage: true };
const typeLabel = type => MODEL_SERVICE_TYPES[modelServiceType(type)]?.[0] || '—';
const detailHref = (id, tab) => pageHref + '?' + new URLSearchParams({ service: id, ...(tab !== 'basic' && { tab }) });
const searchMatches = (query, ...fields) => fields.join(' ').toLowerCase().includes(query.trim().toLowerCase());
const formatNumber = value => value == null ? '—' : value.toLocaleString('zh-CN');
const sourceFingerprint = source => source.simulated ? source.id : channelFingerprint(source);
const shareFormat = new Intl.NumberFormat('zh-CN', { style: 'percent', maximumFractionDigits: 1 });
const contextLabel = '渠道上下文长度（Token）';
const fieldOptions = values => values.map(value => ({ value, label: value }));
const capabilityLabel = value => value === true ? '支持' : value === false ? '不支持' : '未填写';
const weightHelp = '仅在「加权随机」策略下生效，用于在同优先级的可用渠道模型之间分配请求。';
const defaultChannelWeight = 100;
const numericValue = value => value === '' || value == null ? null : Number(value);

const validWeight = value => Number.isSafeInteger(value) && value > 0;

function routingNumberColumn(label, dataIndex, width, help, muted = false) {
  return {
    title: <Tooltip content={help} closeOnEsc>
      <Button className="new-service-sort-title" size="small" theme="borderless" type="tertiary"
        aria-description={help} onKeyPress={event => event.stopPropagation()}>{label}</Button>
    </Tooltip>,
    dataIndex, width,
    ...(muted && { render: value => <Text type="tertiary">{value ?? '—'}</Text> }),
    sorter: (a, b) => a[dataIndex] - b[dataIndex],
    onHeaderCell: ({ sortOrder }) => ({
      'aria-sort': { ascend: 'ascending', descend: 'descending' }[sortOrder] || 'none',
    }),
  };
}

function ChannelWeightFields({ rows, values, change, disabled }) {
  const groups = Map.groupBy(rows, row => row.priority);
  const shares = new Map();
  for (const group of groups.values()) {
    const draft = group.filter(row => row.enabled && !row.reason).map(row => ({ ...row, weight: values[row.id] }));
    if (draft.every(row => validWeight(row.weight))) {
      for (const [id, share] of serviceChannelShares(draft)) shares.set(id, share);
    }
  }
  return <>
    <Text type="secondary">权重为正整数。分流比例按同优先级的可用渠道计算。</Text>
    <Table className="new-service-weight-table" rowKey="id" pagination={false} scroll={{ x: 600 }}
      dataSource={[...groups.entries()].sort(([a], [b]) => a - b).flatMap(([, group]) => group)}
      columns={[
        { title: '渠道', width: 162, render: (_, row) => <Space vertical align="start" spacing={2}>
          <Text strong>{row.name}</Text><Text type="secondary">{row.provider}</Text>
        </Space> },
        { title: '优先级', dataIndex: 'priority', width: 72 },
        { title: '当前权重', dataIndex: 'weight', width: 86 },
        { title: '新权重', width: 120, render: (_, row) => {
          const invalid = !validWeight(values[row.id]);
          return <InputNumber size="small" step={1} hideButtons disabled={disabled}
            value={values[row.id] ?? ''} validateStatus={invalid ? 'error' : undefined} aria-invalid={invalid}
            aria-label={row.provider + ' · ' + row.name + ' 新权重'} onChange={value => change({ [row.id]: numericValue(value) })}/>;
        } },
        { title: '组内分流（预览）', width: 140, render: (_, row) =>
          row.reason ? '不可用' : !row.enabled ? '已停用' : shares.has(row.id) ? shareFormat.format(shares.get(row.id)) : '—' },
      ]}/>
  </>;
}

function NumberField({ label, value, onChange, min = 0, disabled = false }) {
  return <Field label={label} required={!disabled}><InputNumber min={min} step={1} hideButtons disabled={disabled}
    value={value ?? ''} aria-label={label}
    onChange={next => onChange(numericValue(next))}/></Field>;
}

function serviceEndpoints(service, model, sources) {
  const supported = new Set(model ? [
    ...mappingInterfaces(model).map(([path]) => path),
    ...sources.flatMap(source => additionalMappingOptions(model, source).map(({ path }) => path)),
  ] : []);
  return { supported, endpoints: ['text', 'multimodal'].includes(service.type) ? chatEndpoints : [...supported] };
}

function BasicInformation({ service, model, sources }) {
  const fields = service.modelDetails;
  const { supported, endpoints } = serviceEndpoints(service, model, sources);
  const endpointList = endpoints.length ? <Space wrap>
    {endpoints.map(path => supported.has(path)
      ? <Tag key={path}><CopyId label="平台 API 路径" value={path}/></Tag>
      : <Tag key={path} type="ghost">{path} · 未配置</Tag>)}
  </Space> : null;
  const list = value => Array.isArray(value) ? value.join('、') : value;
  const details = [
    ['模型服务名称', service.name],
    ['模型服务 ID', <CopyId label="模型服务 ID" value={service.id}/>],
    ['模型调用标识', <CopyId value={service.callId}/>],
    ['平台 API 地址', '待接入网关'],
    ['平台 API 路径', endpointList],
    ['模型资料名称', fields.name],
    ['模型编码', fields.code && <CopyId label="模型编码" value={fields.code}/>],
    ['模型作者', fields.author],
    ['模型系列', fields.family],
    ['模型版本', fields.version],
    ['模型类型', typeLabel(service.type)],
    ['输入模态', list(fields.inputModalities)],
    ['输出模态', list(fields.outputModalities)],
    ['结果类型', list(fields.resultTypes)],
    ['支持任务', list(fields.tasks)],
    ['上下文长度', fields.context != null ? formatNumber(fields.context) + ' Token' : '—'],
    ['最大输出 Token 数', formatNumber(fields.output)],
    ['流式响应', capabilityLabel(fields.streaming)],
    ['工具调用', capabilityLabel(fields.tools)],
    ['服务状态', <AdminStatus value={serviceStatus(service)}/>],
    ['标签', service.tags],
    ['备注', service.note],
    ['服务描述', service.description],
    ['创建人', service.createdBy],
    ['创建时间', displayTime(service.createdAt)],
  ];
  return <Descriptions align="left" data={details.map(([key, value]) => ({ key, value: value || '—' }))}/>;
}

function ChannelModels({ service, rows, canEdit, open }) {
  const [input, setInput] = useState('');
  const [status, setStatus] = useState('all');
  const [tokens, setTokens] = useState(null);
  const contextEnabled = contextRoutingEnabled(service);
  const strategy = service.routingStrategy ?? DEFAULT_ROUTING_STRATEGY;
  const weighted = strategy === DEFAULT_ROUTING_STRATEGY;
  const shares = contextEnabled && weighted ? serviceChannelShares(rows, tokens) : null;
  const preview = contextEnabled && (shares
    ? rows.filter(row => shares.has(row.id)).map(row => row.name + ' ' + shareFormat.format(shares.get(row.id)))
    : preferredServiceChannels(rows, tokens).map(row => row.name));
  const filtered = rows.filter(row => searchMatches(input, row.provider, row.name, row.upstreamId)
    && (status === 'all' || status === (row.reason ? 'unavailable' : row.enabled ? 'enabled' : 'disabled')));
  const columns = [
    { title: '渠道模型 / 服务商', width: 148, render: (_, row) => <div className="new-service-cell"><Text strong>{row.name}</Text><Text type="tertiary">{row.provider}</Text></div> },
    { title: '上游模型调用标识', width: 220, render: (_, row) => <CopyId label="上游模型调用标识" value={row.upstreamId}/> },
    { title: '模型类型', width: 96, render: () => <Tag color="blue">{typeLabel(service.type)}</Tag> },
    { title: '渠道模型状态', width: 132, render: (_, row) => <div className="new-service-cell"><AdminStatus value={row.reason ? '不可用' : row.enabled ? '已启用' : '已停用'}/>{row.reason && <Text type="tertiary">{row.reason}</Text>}</div> },
    routingNumberColumn('优先级', 'priority', 90, '优先级数值越小越优先。'),
    routingNumberColumn('权重', 'weight', 80, weightHelp, !weighted),
    { title: '操作', fixed: 'right', width: 160, render: (_, row) => <Space className="new-service-channel-actions" spacing={4}>
      <Button size="small" theme="borderless" disabled={!canEdit} onClick={() => open('channel', row)}>编辑</Button>
      <Button size="small" theme="borderless" disabled={!canEdit || !row.enabled && Boolean(row.reason)}
        onClick={() => open(row.enabled ? 'stopChannel' : 'startChannel', row)}>{row.enabled ? '停用' : '启用'}</Button>
      <Button size="small" theme="borderless" type="danger" disabled={!canEdit} onClick={() => open('removeChannel', row)}>移除</Button>
    </Space> },
  ];
  return <>
    <div className="new-service-toolbar new-service-route-bar">
      <Space wrap><Text strong>路由策略</Text><Text>{ROUTING_STRATEGIES[strategy].label}</Text></Space>
      <Button theme="borderless" size="small" disabled={!canEdit}
        onClick={() => open('strategy', { strategy })}>配置策略</Button>
    </div>
    <div className="new-service-toolbar">
      <div className="new-service-filters">
        <Choice label="渠道模型状态" options={[['all', '全部状态'], ['enabled', '已启用'], ['disabled', '已停用'], ['unavailable', '不可用']]} value={status} onChange={setStatus}/>
        <Input className="new-service-search" prefix={<IconSearch aria-hidden="true"/>} value={input} onChange={setInput}
          showClear aria-label="搜索渠道模型" placeholder="搜索渠道或模型"/>
      </div>
      <Space wrap>
        <Tooltip content={weightHelp} condition={!weighted} closeOnEsc>
          <span tabIndex={weighted ? undefined : 0} aria-description={weighted ? undefined : weightHelp}>
            <Button disabled={!weighted || !canEdit || !rows.length}
              onClick={() => open('weights', Object.fromEntries(rows.map(row => [row.id, row.weight])))}>批量设置权重</Button>
          </span>
        </Tooltip>
        <Button disabled={!canEdit || !service.modelId} theme="solid" icon={<IconPlus/>}
          onClick={() => open('channel', { channelId: '', priority: 0, weight: defaultChannelWeight })}>添加渠道模型</Button>
      </Space>
    </div>
    <Table columns={columns} dataSource={filtered} rowKey="id" scroll={{ x: 852 }} pagination={pagination}
      empty={service.modelId ? '暂无匹配的渠道模型' : '请先在基本信息中从基础资料带入模型'}/>
    {preview && <div className="new-service-toolbar new-service-route-preview">
      <InputNumber min={1} step={1} hideButtons value={tokens ?? ''} aria-label="预览请求 Token 数"
        placeholder={weighted ? '输入 Token 数预览分流' : '输入 Token 数预览候选渠道'} onChange={value => {
          const count = numericValue(value);
          setTokens(validContextLength(count) ? count : null);
        }}/>
      <Text type="secondary" aria-live="polite">{preview.join('、') || '没有符合条件的渠道'}</Text>
    </div>}
  </>;
}

function RoutingStrategyFields({ current, selected, rows, sources, change, disabled }) {
  const available = rows.filter(row => row.enabled && !row.reason);
  const missingCosts = selected === 'cost-based-routing' ? available.filter(row => {
    const source = sources.get(row.channelId);
    const association = source?.provider.catalogConnections?.find(item => item.id === source.id && !item.deletedAt);
    const scenarios = association && channelProcurementSnapshot(association)?.pricing?.scenarios;
    return !scenarios?.length || scenarios.some(item => item.listPrice == null);
  }) : [];
  return <>
    <Field label="路由策略" required>
      <Choice label="路由策略" options={strategyOptions} value={selected} disabled={disabled}
        onChange={strategy => change({ strategy })} style={{ width: '100%' }}/>
    </Field>
    <Text aria-live="polite">{ROUTING_STRATEGIES[selected].description}</Text>
    {current !== selected && <Text type="secondary">
      {ROUTING_STRATEGIES[current].label} → {ROUTING_STRATEGIES[selected].label}
    </Text>}
    {available.length === 1 && <Text type="secondary">当前仅有 1 个可用渠道。</Text>}
    {selected === 'usage-based-routing-v2' && available.length > 0 &&
      <Table size="small" rowKey="id" pagination={false} dataSource={available} columns={[
        { title: '渠道', dataIndex: 'name' },
        { title: 'RPM 上限', render: (_, row) => formatNumber(sources.get(row.channelId)?.capacityLimits?.rpm) },
        { title: 'TPM 上限', render: (_, row) => formatNumber(sources.get(row.channelId)?.capacityLimits?.tpm) },
      ]}/>}
    {missingCosts.map(row => {
      const connection = sources.get(row.channelId)?.endpoint?.id;
      return <Space key={row.id} wrap>
        <Text type="warning">{row.name}缺少有效采购价</Text>
        {connection && <Text link={{
          href: channelHref + '?' + new URLSearchParams({ connection, tab: 'model-costs' }),
          target: '_blank', rel: 'noopener noreferrer',
        }}>去配置</Text>}
      </Space>;
    })}
  </>;
}

function ServiceModelDetails({ values, change }) {
  const details = values.modelDetails || serviceModelFields();
  const update = (key, value) => change({ modelDetails: { ...details, [key]: value } });
  return <Collapse>
    <AdminCollapsePanel itemKey="model-fields" header="模型资料字段">
      <div className="new-service-fields">
        {[['name', '模型资料名称'], ['author', '模型作者'], ['family', '模型系列'], ['version', '模型版本']].map(([key, label]) =>
          <Field key={key} label={label}><Input aria-label={label} value={details[key]} maxLength={100} onChange={value => update(key, value)}/></Field>)}
        {[
          ['inputModalities', '输入模态', INPUT_MODALITY_OPTIONS], ['outputModalities', '输出模态', OUTPUT_MODALITY_OPTIONS],
          ['resultTypes', '结果类型', RESULT_TYPE_OPTIONS], ['tasks', '支持任务', TASK_OPTIONS[values.type] || []],
        ].map(([key, label, choices]) => <Field key={key} label={label}>
          <Select multiple showClear value={details[key]} optionList={fieldOptions([...new Set([...choices, ...details[key]])])}
            onChange={value => update(key, value)}/>
        </Field>)}
        {[['context', '上下文长度（Token）'], ['output', '最大输出 Token 数']].map(([key, label]) => <Field key={key} label={label}>
          <InputNumber aria-label={label} min={1} hideButtons value={details[key] ?? ''} onChange={value => update(key, numericValue(value))}/>
        </Field>)}
        {[['streaming', '流式响应'], ['tools', '工具调用']].map(([key, label]) => <Field key={key} label={label}>
          <Choice label={label} options={[[ 'unknown', '未填写'], ['true', '支持'], ['false', '不支持']]}
            value={details[key] == null ? 'unknown' : String(details[key])}
            onChange={value => update(key, value === 'unknown' ? null : value === 'true')}/>
        </Field>)}
      </div>
    </AdminCollapsePanel>
  </Collapse>;
}

function loadLocalServices() {
  try { return { rows: readNewServices(localStorage), error: '' }; }
  catch (error) { return { rows: [], error: error.message }; }
}

export default function ModelServicesNew({ state, params, dirtyRef, sourceConflict, reloadWorkspace }) {
  const [data, setData] = useState({ rows: [], deletedIds: [], error: '', loading: true });
  const [legacy] = useState(loadLocalServices);
  const [saving, setSaving] = useState(false);
  const [attempt, setAttempt] = useState(0);
  const pending = useRef(false);
  useEffect(() => {
    const request = new AbortController();
    cloudAdminRequest('/model-services-new', { signal: request.signal })
      .then(result => { if (!request.signal.aborted) setData({ ...result, error: '', loading: false }); })
      .catch(issue => {
        if (!request.signal.aborted) setData(current => ({ ...current, loading: false, error: issue.message }));
      });
    return () => request.abort();
  }, [attempt]);
  const reload = () => {
    setData(current => ({ ...current, loading: true, error: '' }));
    setAttempt(current => current + 1);
  };
  const importable = legacy.rows.filter(row => !data.rows.some(current => current.id === row.id) && !data.deletedIds.includes(row.id));
  const [query, setQuery] = useState('');
  const [editState, setEditState] = useState(null);
  const formId = useId();
  const opener = useRef(null);
  const serviceId = params.get('service');
  if (editState && editState.serviceId !== serviceId) setEditState(null);
  const withModelDetails = row => {
    if (!row || row.modelDetails) return row;
    const identity = libraryRecord(state, row.modelId);
    return { ...row, modelDetails: serviceModelFields(identity && { ...identity, name: row.modelName || identity.name }) };
  };
  const service = withModelDetails(data.rows.find(row => row.id === serviceId));
  const routingStrategy = service?.routingStrategy ?? DEFAULT_ROUTING_STRATEGY;
  const weighted = routingStrategy === DEFAULT_ROUTING_STRATEGY;
  const activeTab = tabs.some(([id]) => id === params.get('tab')) ? params.get('tab') : 'basic';
  const dialog = editState?.serviceId === serviceId ? editState : null;
  const canEdit = !data.loading && !data.error && !sourceConflict && ['平台管理员', '运营人员'].includes(state.currentRole);
  const models = modelCatalogue(state).filter(row => !row.archivedAt);
  const allowModelSelection = dialog?.kind === 'create' || (dialog?.kind === 'editDetails' && !service?.modelId);
  const model = savedServiceModel(service);
  const registeredChannels = model ? mappingCandidates(state, { modelId: model.id }) : [];
  const simulatedChannels = simulatedServiceChannels(model, registeredChannels, service?.channels);
  const candidates = [...registeredChannels, ...simulatedChannels];
  const candidatesById = new Map(candidates.map(channel => [channel.id, channel]));
  const channels = service?.channels.map(row => {
    const source = candidatesById.get(row.channelId);
    const reason = !source ? '渠道模型已不可用' : source.reason || (row.fingerprint !== sourceFingerprint(source) ? '渠道配置已变更，请重新核对' : '');
    return { ...row, reason };
  }) || [];
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
    const checking = kind === 'unlist' || kind === 'remove';
    setEditState({ kind, values, serviceId, error: '', checking });
    if (checking) {
      const query = new URLSearchParams({ inspect: values.target });
      cloudAdminRequest('/model-services-new?' + query)
        .then(check => setEditState(current => current?.values === values ? { ...current, check, checking: false } : current))
        .catch(issue => setEditState(current => current?.values === values ? { ...current, error: issue.message, checking: false } : current));
    }
  };
  const change = patch => setEditState(current => ({ ...current, values: { ...current.values, ...patch }, error: '', dirty: true }));
  const error = message => setEditState(current => ({ ...current, error: message }));
  const save = async (record, action = 'save') => {
    if (pending.current) return false;
    pending.current = true;
    setSaving(true);
    const operationId = resourceId('operation');
    const body = { action, id: record.id, revision: record.revision ?? 0, operationId,
      ...(action !== 'delete' && { row: record }) };
    try {
      let result;
      try {
        result = await cloudAdminRequest('/model-services-new', { method: 'POST', body, operationId });
      } catch (issue) {
        if (issue.status && issue.status < 500) throw issue;
        result = await cloudAdminRequest('/operations/' + operationId).catch(() => { throw issue; });
      }
      setData(current => {
        const rows = current.rows.filter(row => row.id !== result.id);
        if (result.row) rows.push(result.row);
        rows.sort((left, right) => Date.parse(right.createdAt) - Date.parse(left.createdAt) || left.id.localeCompare(right.id));
        return { ...current, rows, deletedIds: result.row ? current.deletedIds : [...current.deletedIds, result.id] };
      });
      close();
      Toast.success(action === 'import' ? '已导入' : action === 'delete' ? '已删除' : '已保存');
      return true;
    } finally {
      pending.current = false;
      setSaving(false);
    }
  };
  const apply = async () => {
    if (!canEdit || !dialog || dialog.discard || pending.current) return;
    const { kind, values } = dialog;
    const record = values.target ? data.rows.find(row => row.id === values.target) : service;
    try {
      if (kind === 'import') { await save(values, 'import'); return; }
      if (kind === 'edit') {
        if (!record) throw Error('未找到指定模型服务');
        const name = values.name.trim();
        if (!name) throw Error('请填写模型服务名称');
        await save({ ...record, name });
        return;
      }
      if (kind === 'create' || kind === 'editDetails') {
        const fields = Object.fromEntries(['name', 'callId', 'note', 'description'].map(key => [key, values[key]?.trim() || '']));
        const issue = serviceFormIssue(fields, data.rows, service?.id);
        if (issue) throw Error(issue);
        if (allowModelSelection && values.modelId && !models.some(row => row.id === values.modelId)) throw Error('请选择有效的模型资料');
        if (values.type && !Object.hasOwn(MODEL_SERVICE_TYPES, modelServiceType(values.type))) throw Error('请选择有效的模型类型');
        const modelDetails = values.modelDetails || serviceModelFields();
        if ([modelDetails.context, modelDetails.output].some(value => value != null && !validContextLength(value))) {
          throw Error('上下文长度和最大输出 Token 数须为正整数');
        }
        fields.modelId = values.modelId || '';
        fields.type = values.type || '';
        fields.modelDetails = modelDetails;
        if (kind === 'create') {
          const initial = { ...fields, id: values.id, listed: false, channels: [] };
          if (await save(initial)) location.hash = detailHref(initial.id, 'basic');
        } else {
          await save({ ...service, ...fields, tags: values.tags?.trim() || '' });
        }
        return;
      }
      if (!record) throw Error('未找到指定模型服务');
      const next = { ...record };
      if (kind === 'list' || kind === 'unlist') {
        if (kind === 'unlist' && (dialog.check?.revision !== record.revision || dialog.check.stopIssue)) {
          throw Error(dialog.check?.stopIssue || '服务配置已变化，请重新检查');
        }
        const sources = mappingCandidates(state, { modelId: record.modelId });
        if (kind === 'list' && !record.channels.some(row => row.enabled && sources.some(source =>
          source.id === row.channelId && !source.reason && channelFingerprint(source) === row.fingerprint))) {
          throw Error('请先添加并启用通过验证的已登记渠道');
        }
        next.listed = kind === 'list';
      } else if (kind === 'strategy') {
        if (!Object.hasOwn(ROUTING_STRATEGIES, values.strategy)) throw Error('请选择有效的路由策略');
        if (values.strategy === routingStrategy) { close(); return; }
        next.routingStrategy = values.strategy;
      } else if (kind === 'channel') {
        const source = candidatesById.get(values.channelId);
        if (!source || source.reason) throw Error(source?.reason || '请选择可用的渠道模型');
        if (service.channels.some(row => row.channelId === source.id && row.id !== values.id)) throw Error('该渠道模型已关联');
        const previous = service.channels.find(row => row.id === values.id);
        const weight = weighted ? values.weight : (previous?.weight ?? defaultChannelWeight);
        if (!Number.isSafeInteger(values.priority) || values.priority < 0 || !validWeight(weight)) {
          throw Error('优先级需为非负整数，权重需为正整数');
        }
        if (!values.id && contextRoutingEnabled(service) && !validContextLength(values.context)) {
          throw Error('请输入正整数的上下文长度');
        }
        const link = {
          ...previous,
          id: values.id || resourceId('service-channel'), channelId: source.id, name: source.sourceName || source.name || source.endpoint.name,
          provider: source.provider.name, upstreamId: source.upstreamModelId, fingerprint: sourceFingerprint(source),
          ...(source.simulated && { simulated: true }),
          ...(!previous && values.context != null && { context: values.context }),
          priority: values.priority, weight, enabled: previous?.enabled ?? true,
        };
        next.channels = values.id ? service.channels.map(row => row.id === values.id ? link : row) : [...service.channels, link];
      } else if (kind === 'weights') {
        if (!weighted) throw Error(weightHelp);
        if (service.channels.some(row => !validWeight(values[row.id]))) throw Error('权重需为正整数');
        next.channels = service.channels.map(row => ({ ...row, weight: values[row.id] }));
      } else if (['stopChannel', 'startChannel', 'removeChannel'].includes(kind)) {
        if (kind === 'startChannel' && channels.find(row => row.id === values.id)?.reason) throw Error('请先核对渠道模型配置');
        next.channels = kind === 'removeChannel' ? service.channels.filter(row => row.id !== values.id)
          : service.channels.map(row => row.id === values.id ? { ...row, enabled: kind === 'startChannel' } : row);
        if (kind === 'startChannel') {
          const issue = channelSetupIssue(next);
          if (issue) throw Error(issue);
        }
        if (next.listed && !values.simulated && !next.channels.some(row => row.enabled && !row.simulated && !channels.find(channel => channel.id === row.id)?.reason)) {
          throw Error('已启用的服务至少需要一个可用渠道，请先停止服务');
        }
      } else if (kind === 'remove') {
        if (dialog.check?.revision !== record.revision || dialog.check.deleteIssue) {
          throw Error(dialog.check?.deleteIssue || '服务配置已变化，请重新检查');
        }
        if (await save(record, 'delete')) location.hash = pageHref;
        return;
      }
      if (await save(next) && (kind === 'list' || kind === 'unlist')) void reloadWorkspace();
    } catch (issue) {
      error(issue.message);
    }
  };

  const endpointValues = row => {
    const master = savedServiceModel(withModelDetails(row));
    const sources = master && row.channels.some(channel => channel.enabled && !channel.simulated)
      ? mappingCandidates(state, { modelId: master.id }).filter(source => !source.reason && row.channels.some(channel =>
        channel.enabled && !channel.simulated && channel.channelId === source.id && channel.fingerprint === sourceFingerprint(source)))
      : [];
    return [...serviceEndpoints(row, master, sources).supported];
  };
  const columns = [
    { title: '模型服务名称 / 模型服务 ID', width: 230, fixed: 'left', render: (_, row) => <div className="new-service-cell">
      <Space spacing={4}><Text strong link={{ href: detailHref(row.id, 'basic') }}>{row.name}</Text><CopyId label="模型服务名称" value={row.name} displayValue="" copyAtStart/></Space>
      <CopyId label="模型服务 ID" value={row.id} ellipsis copyAtStart/>
    </div> },
    { title: '模型调用标识', width: 155, render: (_, row) => <CopyId label="模型调用标识" value={row.callId} ellipsis copyAtStart/> },
    { title: '平台 API 路径', width: 200, render: (_, row) => {
      const paths = endpointValues(row);
      return paths.length ? <div className="new-service-cell">{paths.map(path => <CopyId key={path} label="平台 API 路径" value={path} ellipsis copyAtStart/>)}</div> : '—';
    } },
    { title: '模型类型', width: 110, render: (_, row) => {
      const type = MODEL_SERVICE_TYPES[modelServiceType(row.type)];
      return type ? <Tooltip content={type[1]}><Tag color="blue" tabIndex={0} aria-label={type.join('，')}>{type[0]}</Tag></Tooltip> : '—';
    } },
    { title: <FieldLabel name="服务状态" description="服务状态用于控制模型服务是否可在模型广场、项目授权和调用链路中使用。"/>,
      width: 110, render: (_, row) => <AdminStatus value={serviceStatus(row)}/> },
    { title: '创建人/时间', width: 155, render: (_, row) => <div className="new-service-cell"><Text>{row.createdBy}</Text><Text type="tertiary">{displayTime(row.createdAt)}</Text></div> },
    { title: '备注', dataIndex: 'note', width: 100, ellipsis: true, render: value => value || '—' },
    { title: '操作', width: 164, fixed: 'right', render: (_, row) => <Space spacing={2}>
      <Button theme="borderless" size="small" disabled={!canEdit} onClick={() => open(row.listed ? 'unlist' : 'list', { target: row.id })}>{row.listed ? '停止' : '启用'}</Button>
      <Button theme="borderless" size="small" disabled={!canEdit} onClick={() => open('edit', { name: row.name, target: row.id })}>编辑</Button>
      <Button theme="borderless" type="danger" size="small" disabled={!canEdit || row.listed} onClick={() => open('remove', { target: row.id })}>删除</Button>
    </Space> },
  ];

  const { kind, values } = dialog || {};
  const target = values?.target ? data.rows.find(row => row.id === values.target) : service;
  const requiresCheck = kind === 'unlist' || kind === 'remove';
  const checkIssue = kind === 'unlist' ? dialog?.check?.stopIssue : dialog?.check?.deleteIssue;
  const checkBlocked = requiresCheck && (!dialog.check || dialog.check.revision !== target?.revision || Boolean(checkIssue));
  const titles = {
    import: '导入浏览器记录', create: '添加模型服务', edit: '编辑模型服务名称', editDetails: '编辑信息', list: '启用模型服务', unlist: '停止模型服务',
    channel: values?.id ? '编辑渠道模型' : '添加渠道模型', startChannel: '启用渠道模型', stopChannel: '停用渠道模型',
    removeChannel: '移除渠道模型', weights: '批量设置权重', remove: '删除模型服务', strategy: '配置路由策略',
  };
  return <div className="admin-page-stack new-model-services">
    {data.error && <Banner type="danger" closeIcon={null} description={<Space>{data.error}
      <Button onClick={reload}>重新加载</Button></Space>}/>}
    {data.loading ? <Card>正在读取模型服务…</Card> : !serviceId ? <>
      <AdminPageHeading title={pageTitle}/>
      {canEdit && importable.length > 0 && <Banner type="info" closeIcon={null} description={<Space wrap>
        <Text>检测到此浏览器保存的模型服务</Text>
        {importable.map(row => <Button key={row.id} size="small" onClick={() => open('import', row)}>导入 {row.name}</Button>)}
      </Space>}/>}
      {legacy.error && <Banner type="warning" description={legacy.error} closeIcon={null}/>}
      <Card>
        <div className="new-service-toolbar">
          <Input className="new-service-search" prefix={<IconSearch aria-hidden="true"/>} showClear
            aria-label="搜索模型服务" placeholder="搜索服务名称 / 服务 ID / 调用标识" value={query} onChange={setQuery}/>
          <Button theme="solid" icon={<IconPlus/>} disabled={!canEdit} onClick={() => open('create', { ...blank, id: resourceId('model-service') })}>添加模型服务</Button>
        </div>
        <Table columns={columns} dataSource={data.rows.filter(row => searchMatches(query, row.name, row.id, row.callId))}
          rowKey="id" scroll={{ x: columns.reduce((width, column) => width + column.width, 0) }} pagination={pagination} empty="暂无匹配的模型服务"/>
      </Card>
    </> : service ? <>
      <AdminPageHeading title={service.name}>
        {activeTab === 'basic' && <Button disabled={!canEdit} onClick={() => open('editDetails', service)}>编辑信息</Button>}
      </AdminPageHeading>
      <Card>
        <Tabs activeKey={activeTab} keepDOM={false} onChange={tab => { location.hash = detailHref(service.id, tab); }}>
          {tabs.map(([id, label]) => <Tabs.TabPane key={id} itemKey={id} tab={label}>
          {activeTab === id && <div className="new-service-tab">
          {activeTab === 'basic' && <BasicInformation service={service} model={model}
            sources={channels.filter(row => row.enabled && !row.reason && !row.simulated).map(row => candidatesById.get(row.channelId))}/>}
          {activeTab === 'channels' && <ChannelModels service={service} rows={channels} canEdit={canEdit}
            open={open}/>}
          </div>}
          </Tabs.TabPane>)}
        </Tabs>
      </Card>
    </> : <Card><Empty description="未找到指定模型服务"><Button onClick={() => { location.hash = pageHref; }}>返回{pageTitle}</Button></Empty></Card>}
    {dialog && <Modal title={titles[kind]} wide={kind === 'weights'} onClose={() => {
      if (saving) return;
      if (dirty) setEditState(current => ({ ...current, discard: true }));
      else close();
    }}
      maskClosable={false} footer={<>
        <Button disabled={saving} onClick={() => dirty ? setEditState(current => ({ ...current, discard: true })) : close()}>取消</Button>
        <Button theme="solid" disabled={!canEdit || dialog.discard || checkBlocked || (kind === 'weights' && (!weighted || !dirty || channels.some(row => !validWeight(values[row.id]))))} loading={saving} form={formId} htmlType="submit">{
          kind === 'import' ? '确认导入' : kind === 'create' ? '创建模型服务' : kind === 'list' ? '确认启用' : kind === 'unlist' ? '确认停止'
            : kind === 'remove' ? '确认删除' : '保存'
        }</Button>
      </>}>
      <form id={formId} className="new-service-form" onSubmit={event => { event.preventDefault(); apply(); }}>
        {['create', 'edit', 'editDetails'].includes(kind) &&
          <Field label="模型服务名称" required><Input aria-label="模型服务名称" value={values.name} maxLength={120} onChange={value => change({ name: value })}/></Field>
        }
        {['create', 'editDetails'].includes(kind) && <>
          <Field label={<FieldLabel name="模型调用标识" description="调用方在 API 请求的 model 字段填写此值。"/>} required>
            <Input aria-label="模型调用标识" value={values.callId} disabled={Boolean(values.controlledOfferId)} maxLength={128} onChange={value => change({ callId: value })}/>
          </Field>
          {allowModelSelection && <Field label="从基础资料带入">
            <Select filter showClear value={values.modelId || undefined} placeholder="选择模型资料"
              dropdownMatchSelectWidth dropdownClassName="service-model-select-dropdown"
              dropdownStyle={{ width: 'min-content' }}
              optionList={models.map(row => ({ value: row.id, label: row.name + '（' + row.modelId + '）' }))}
              onChange={id => {
                const record = models.find(row => row.id === id);
                change({ modelId: record?.id || '', type: record?.type || '', modelDetails: serviceModelFields(record) });
              }} style={{ width: '100%' }}/>
          </Field>}
          <Field label="模型类型">
            <Select showClear value={values.type || undefined} placeholder="选择模型类型"
              disabled={Boolean(service?.channels.length)}
              optionList={values.type && modelServiceType(values.type) !== values.type
                ? typeOptions.map(option => option.value === modelServiceType(values.type) ? { ...option, value: values.type } : option)
                : typeOptions}
              onChange={type => change({ type: type || '' })} style={{ width: '100%' }}/>
          </Field>
          {kind === 'editDetails' && <Field label="标签"><Input aria-label="标签" value={values.tags || ''} maxLength={160} onChange={value => change({ tags: value })}/></Field>}
          <Field label="备注"><Input aria-label="备注" value={values.note} maxLength={240} onChange={value => change({ note: value })}/></Field>
          <Field label="服务描述"><TextArea aria-label="服务描述" value={values.description}
            maxLength={SERVICE_DESCRIPTION_LIMIT} maxCount={SERVICE_DESCRIPTION_LIMIT}
            onChange={value => change({ description: value })}/></Field>
          <ServiceModelDetails values={values} change={change}/>
        </>}
        {kind === 'channel' && <>
          <Field label="渠道模型" required><Select filter value={values.channelId || undefined} disabled={Boolean(values.id)}
            placeholder="选择渠道模型" style={{ width: '100%' }}
            optionList={candidates.map(row => {
              const reason = row.reason || (service.channels.some(link => link.channelId === row.id && link.id !== values.id) ? '已关联' : '');
              return { value: row.id, disabled: Boolean(reason), label: [row.provider.name, row.sourceName || row.name || row.endpoint.name, row.upstreamModelId, reason].filter(Boolean).join(' · ') };
            })} onChange={value => change({ channelId: value })}/></Field>
          {(!registeredChannels.some(row => !row.reason) || values.id && candidatesById.get(values.channelId)?.reason) &&
            <Space wrap spacing={8}>
              {simulatedChannels.length > 0 && !values.id && <Text type="secondary">模拟渠道可用于演练优先级和权重。</Text>}
              <Text link={{ href: channelHref, target: '_blank', rel: 'noopener noreferrer' }}>前往渠道管理</Text>
            </Space>}
          <div className="new-service-fields">
            <NumberField label="优先级" value={values.priority} onChange={value => change({ priority: value })}/>
            <Tooltip content={weightHelp} condition={!weighted} closeOnEsc>
              <div role="group" aria-label="权重设置" tabIndex={weighted ? undefined : 0} aria-description={weighted ? undefined : weightHelp}>
                <NumberField label="路由权重" min={1} value={values.weight} disabled={!weighted} onChange={value => change({ weight: value })}/>
              </div>
            </Tooltip>
            {!values.id && contextRoutingEnabled(service) &&
              <NumberField label={contextLabel} min={1} value={values.context} onChange={context => change({ context })}/>}
          </div>
          <Text type="secondary">优先级数值越小越优先。</Text>
        </>}
        {kind === 'strategy' && <RoutingStrategyFields current={routingStrategy} selected={values.strategy}
          rows={channels} sources={candidatesById} change={change} disabled={saving}/>}
        {kind === 'weights' && <ChannelWeightFields rows={channels} values={values} change={change} disabled={saving || !canEdit || !weighted}/>}
        {kind === 'import' && <Text>将「{values.name}」导入共享列表，保留原服务 ID 和创建信息。</Text>}
        {['list', 'unlist', 'remove'].includes(kind) && <Text>{titles[kind] + '「' + target?.name + '」？'}</Text>}
        {requiresCheck && dialog.checking && <Text role="status">正在检查模型广场关联…</Text>}
        {requiresCheck && dialog.check && <div role="status" className="new-service-cell">
          <Text>{dialog.check.marketLinked
            ? dialog.check.marketListed ? '已关联模型广场，关联模型已上架' : '已关联模型广场，关联模型未上架'
            : '未关联模型广场'}</Text>
          {checkIssue ? <Notice error>{checkIssue}</Notice>
            : dialog.check.revision === target?.revision ? <Text>检查通过</Text> : <Notice error>其他页面已更新模型服务，请载入最新配置</Notice>}
        </div>}
        {['startChannel', 'stopChannel', 'removeChannel'].includes(kind)
          && <Text>{'确认' + titles[kind] + '「' + values.name + '」？'}</Text>}
        {dialog.error && <Notice error>{dialog.error}</Notice>}
        {dialog.error.includes('其他页面') && <Button onClick={() => {
          reload();
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
