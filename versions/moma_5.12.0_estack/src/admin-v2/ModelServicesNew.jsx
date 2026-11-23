import { useChannelText } from './channel-language';
import { API_PREFIX } from '../../api-path';
import { callLogFieldHelp } from '../components/call-log-field-help';
import TableFieldHelp from '../components/TableFieldHelp';
import { useEffect, useId, useLayoutEffect, useRef, useState } from 'react';
import {
  Banner, Button, Card, Collapse, Descriptions, Empty, Input, InputNumber, RadioGroup, Radio, Select,
  Space, Tabs, Tag, TextArea, Toast, Tooltip, Typography,
} from '@douyinfe/semi-ui';
import { IconPlus, IconSearch } from '@douyinfe/semi-icons';
import AdminCollapsePanel from './AdminCollapsePanel';
import { resourceId } from '../resource-id.mjs';
import { cloudAdminRequest } from './admin-client.mjs';
import AdminPageHeading from './AdminPageHeading';
import FailoverFields from './FailoverFields';
import { failoverError, failoverValues, globalPolicyDefaults, initialRoutingParameters } from './global-routing-parameters.mjs';
import AdminStatus from './AdminStatus';
import Table from './AdminTable';
import { Choice, CopyId, Field, FieldLabel, Modal, Notice } from './ServiceUI';
import { displayTime } from './model-management';
import { channelFingerprint } from './provider-channels';
import { additionalMappingOptions, mappingCandidates, mappingInterfaces } from './service-model-mappings';
import { libraryRecord, modelCatalogue } from './model-library';
import { INPUT_MODALITY_OPTIONS, OUTPUT_MODALITY_OPTIONS, RESULT_TYPE_OPTIONS, TASK_OPTIONS } from './model-profile';
import { pages } from './navigation.mjs';
import { DEFAULT_ROUTING_STRATEGY, ROUTING_STRATEGIES } from './service-routing-strategies.mjs';
import {
  channelSetupIssue, contextRoutingEnabled, preferredServiceChannels, readNewServices, SERVICE_DESCRIPTION_LIMIT,
  MODEL_ID_LABEL, MODEL_SERVICE_TYPES, modelServiceType, serviceStatus,
  savedServiceModel, serviceChannelShares, serviceFormIssue, serviceModelFields, simulatedServiceChannels, validContextLength,
} from './model-services-new';
import './model-services-new.css';

const pageHref = '#/admin-2/listing-new';
const pageTitle = pages['listing-new'].label;
const { Text } = Typography;
const tabs = [['basic', '基本信息'], ['channels', '关联上游模型'], ['failover', '故障转移策略']];
const platformEndpoint = path => path.replace(/^\/v1(?=\/)/, '');
const chatEndpoints = ['/v1/chat/completions', '/v1/messages', '/v1/responses', '/v1/completions'];
const priorityHelp = <>
  <div><strong>组间顺序</strong>　数值越小，优先级越高。优先使用当前请求可用的最高优先级组；该组没有可用上游模型，或调用失败且满足故障转移条件时，再尝试下一组。</div>
  <div><strong>组内选择</strong>　同组上游模型按当前路由策略选择。使用「加权随机」时，按可用上游模型的权重比例分配请求。</div>
</>;
const endpointLabel = '接口端点';
const blank = { name: '', callId: '', modelId: '', type: '', note: '', description: '' };
const typeOptions = Object.entries(MODEL_SERVICE_TYPES).map(([value, [label]]) => ({ value, label }));
const pagination = { pageSize: 10, hideOnSinglePage: true };
const typeLabel = type => MODEL_SERVICE_TYPES[modelServiceType(type)]?.[0] || '—';
const detailHref = (id, tab) => pageHref + '?' + new URLSearchParams({ service: id, ...(tab !== 'basic' && { tab }) });
const searchMatches = (query, ...fields) => fields.join(' ').toLowerCase().includes(query.trim().toLowerCase());
const sourceFingerprint = source => source.simulated ? source.id : channelFingerprint(source);
const shareFormat = new Intl.NumberFormat('zh-CN', { style: 'percent', maximumFractionDigits: 1 });
const contextLabel = '上游模型上下文长度（Token）';
const fieldOptions = values => values.map(value => ({ value, label: value }));
const weightHelp = '仅在「加权随机」策略下生效，用于在同优先级的可用上游模型之间分配请求。';
const defaultChannelWeight = 100;
const numericValue = value => value === '' || value == null ? null : Number(value);

const validWeight = value => Number.isSafeInteger(value) && value > 0;

function groupPriorities(service) {
  return [...new Set([...(service.priorityGroups || []), ...service.channels.map(row => row.priority)])].sort((a, b) => a - b);
}

function channelKey(row) {
  return row.simulated ? row.id : JSON.stringify([row.provider.id, row.endpointId || row.endpoint.id]);
}

function BatchChannelFields({ candidates, linked, values, change }) {
  const t = useChannelText();
  const groups = Map.groupBy(candidates, channelKey);
  const options = Array.from(groups, ([value, [row]]) => ({
    value, label: row.simulated ? t(row.name) + ' · ' + t('模拟连接') : row.endpoint.name + ' · ' + row.provider.name,
  }));
  const models = candidates.filter(row => values.connections.includes(channelKey(row)));
  const reason = row => linked.some(link => link.channelId === row.id) ? '已关联' : row.reason;
  return <>
    <Field label="连接" required><Select multiple filter aria-label="选择连接" placeholder="先选择连接"
      optionList={options} value={values.connections} style={{ width: '100%' }}
      onChange={connections => change({ connections, ids: values.ids.filter(id =>
        candidates.some(row => row.id === id && connections.includes(channelKey(row)))) })}/></Field>
    <Table rowKey="id" dataSource={models} pagination={false} empty={values.connections.length ? '暂无匹配模型' : '请先选择连接'}
      rowSelection={{ selectedRowKeys: values.ids, getCheckboxProps: row => ({ disabled: Boolean(reason(row)) }),
        onChange: ids => change({ ids: ids.filter(id => models.some(row => row.id === id && !reason(row))) }) }}
      columns={[
        { title: '连接', render: (_, row) => row.simulated ? row.name : row.endpoint.name },
        { title: '上游模型 ID', dataIndex: 'upstreamModelId' },
        { title: '状态', render: (_, row) => reason(row) || '可添加' },
      ]}/>
    <Text type="secondary">已选 {values.ids.length} 个上游模型。添加后组内权重合计为 100。</Text>
  </>;
}

function groupWeights(rows) {
  if (rows.length > 100) throw Error('每组最多支持 100 个上游模型');
  const total = rows.reduce((sum, row) => sum + row.weight, 0);
  const shares = rows.map(row => row.weight * 100 / total);
  const weights = shares.map(value => Math.max(1, Math.floor(value)));
  let remaining = 100 - weights.reduce((sum, value) => sum + value, 0);
  while (remaining && rows.length) {
    const step = Math.sign(remaining);
    let best = -1;
    for (let index = 0; index < weights.length; index++) {
      if (step < 0 && weights[index] === 1) continue;
      if (best < 0 || step * (shares[index] - weights[index]) > step * (shares[best] - weights[best])) best = index;
    }
    weights[best] += step;
    remaining -= step;
  }
  return Object.fromEntries(rows.map((row, index) => [row.id, weights[index]]));
}

function routingNumberColumn(label, dataIndex, width, help, muted = false) {
  return {
    title: <TableFieldHelp name={label} description={help} sortable/>,
    dataIndex, width,
    ...(muted && { render: value => <Text type="tertiary">{value ?? '—'}</Text> }),
    sorter: (a, b) => a[dataIndex] - b[dataIndex],
    onHeaderCell: ({ sortOrder }) => ({
      'aria-sort': { ascend: 'ascending', descend: 'descending' }[sortOrder] || 'none',
    }),
  };
}

function changedChannelSettings(saved, current) {
  try {
    const previous = JSON.parse(saved);
    const next = JSON.parse(sourceFingerprint(current));
    const labels = ['关联模型', '上游模型 ID', '连接配置', '接口格式或地址'];
    return labels.filter((_, index) => JSON.stringify(previous[index]) !== JSON.stringify(next[index])).join('、') || '接入配置';
  } catch {
    return '接入配置';
  }
}

function ChannelWeightFields({ rows, values, change, disabled, total, valid }) {
  const draft = rows.filter(row => row.enabled && !row.reason).map(row => ({ ...row, weight: values[row.id] }));
  const shares = draft.every(row => validWeight(row.weight)) ? serviceChannelShares(draft) : new Map();
  const difference = 100 - total;
  return <>
    <Text role="status" aria-live="polite" type={valid ? 'secondary' : 'warning'}>组内权重合计 {total} / 100{
      difference > 0 ? '，还差 ' + difference : difference < 0 ? '，超出 ' + -difference : !valid ? '，请输入正整数' : ''
    }</Text>
    <Table className="new-service-weight-table" rowKey="id" pagination={false} scroll={{ x: 560 }} dataSource={rows}
      columns={[
        { title: '连接', width: 162, render: (_, row) => <Space vertical align="start" spacing={2}>
          <Text strong>{row.name}</Text><Text type="secondary">{row.provider}</Text>
        </Space> },
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

function GroupPriorityField({ value, onChange, hint }) {
  return <Field label="组优先级" hint={hint} required>
    <Input aria-label="组优先级" inputMode="numeric" pattern="[0-9]*" placeholder="请输入非负整数"
      value={value == null ? '' : String(value)} onChange={text => {
        if (text === '') onChange(null);
        else if (/^[0-9]+$/.test(text) && Number.isSafeInteger(Number(text))) onChange(Number(text));
      }}/>
  </Field>;
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
  const t = useChannelText();
  const fields = service.modelDetails;
  const { supported, endpoints } = serviceEndpoints(service, model, sources);
  const endpointList = endpoints.length ? <Space wrap>
    {endpoints.map(path => supported.has(path)
      ? <Tag key={path}><CopyId label={endpointLabel} value={platformEndpoint(path)}/></Tag>
      : <Tag key={path} type="ghost">{platformEndpoint(path)} · 未配置</Tag>)}
  </Space> : null;
  const details = [
    ['模型服务名称', service.name],
    ['模型服务 ID', <CopyId label="模型服务 ID" value={service.id}/>],
    [MODEL_ID_LABEL, <CopyId label={MODEL_ID_LABEL} value={service.callId}/>],
    ['服务地址', window.location.origin + API_PREFIX],
    [endpointLabel, endpointList],
    ['模型编码', fields.code && <CopyId label="模型编码" value={fields.code}/>],
    ['服务状态', <AdminStatus value={serviceStatus(service)} label={t(serviceStatus(service))}/>],
    ['标签', service.tags],
    ['备注', service.note],
    ['服务描述', service.description],
    ['创建人', service.createdBy],
    ['创建时间', displayTime(service.createdAt)],
  ];
  return <Descriptions align="left" data={details.map(([key, value]) => ({ key, value: value || '—' }))}/>;
}

function ChannelModels({ service, rows, canEdit, open }) {
  const t = useChannelText();
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
  const priorities = groupPriorities(service);
  const matchingGroups = Map.groupBy(filtered, row => row.priority);
  const visibleGroups = !input.trim() && status === 'all' ? priorities : priorities.filter(priority => matchingGroups.has(priority));
  const columns = [
    { title: t('上游模型 / 服务商'), width: 148, render: (_, row) => <div className="new-service-cell"><Text strong>{row.name}</Text><Text type="tertiary">{row.provider}</Text></div> },
    { title: '上游模型 ID', width: 220, render: (_, row) => <CopyId label="上游模型 ID" value={row.upstreamId}/> },
    { title: '模型类型', width: 96, render: () => <Tag color="blue">{typeLabel(service.type)}</Tag> },
    { title: t('关联上游模型状态'), width: 132, render: (_, row) => <div className="new-service-cell"><AdminStatus value={row.reason ? '不可用' : row.enabled ? '已启用' : '已停用'}/>{row.reason && <Text type="tertiary">{row.reason}</Text>}</div> },
    routingNumberColumn('权重', 'weight', 80, weightHelp, !weighted),
    { title: '操作', fixed: 'right', width: 160, render: (_, row) => <Space className="new-service-channel-actions" spacing={4}>
      {row.needsReview && <Button size="small" theme="borderless" disabled={!canEdit} onClick={() => open('channel', row)}>核对连接配置</Button>}
      <Button size="small" theme="borderless" disabled={!canEdit || !row.enabled && Boolean(row.reason)}
        onClick={() => open(row.enabled ? 'stopChannel' : 'startChannel', row)}>{row.enabled ? '停用' : '启用'}</Button>
      <Button size="small" theme="borderless" type="danger" disabled={!canEdit} onClick={() => open('removeChannel', row)}>移除</Button>
    </Space> },
  ];
  return <>
    <div className="new-service-routing-summary">
      <Space wrap><Text>路由策略</Text><Text strong>{ROUTING_STRATEGIES[strategy].label}</Text><Tag>继承全局</Tag></Space>
      <Space wrap><Text>模型 ID</Text><CopyId label={MODEL_ID_LABEL} value={service.callId}/></Space>
    </div>
    <div className="new-service-toolbar">
      <div className="new-service-filters">
        <Choice label={t('关联上游模型状态')} options={[['all', '全部状态'], ['enabled', '已启用'], ['disabled', '已停用'], ['unavailable', '不可用']]} value={status} onChange={setStatus}/>
        <Input className="new-service-search" prefix={<IconSearch aria-hidden="true"/>} value={input} onChange={setInput}
          showClear aria-label={t('搜索上游模型')} placeholder={t('搜索连接或模型')}/>
      </div>
      <Space wrap>
        <Button disabled={!canEdit || !service.modelId} theme="solid" icon={<IconPlus/>}
          onClick={() => open('newGroup', { priority: Math.max(-1, ...priorities) + 1 })}>新增优先级组</Button>
      </Space>
    </div>
    {visibleGroups.map(priority => {
      const matches = matchingGroups.get(priority) || [];
      const group = rows.filter(row => row.priority === priority);
      const total = group.reduce((sum, row) => sum + row.weight, 0);
      return <section key={priority} className="new-service-priority-group">
        <div className="new-service-toolbar">
          <Space wrap><h3 className="new-service-group-title"><TableFieldHelp name="优先级" description={priorityHelp}/> {priority}</h3><Text type="secondary">{group.length} 个上游模型</Text>
            {group.length > 0 && <Text type={total === 100 ? 'secondary' : 'warning'}>组内权重 {total} / 100</Text>}</Space>
          <Space wrap><Button size="small" disabled={!canEdit} onClick={() => open('weights', {
            priority, originalPriority: priority, ...Object.fromEntries(group.map(row => [row.id, row.weight]))
          })}>配置优先级与权重</Button>
          <Button size="small" disabled={!canEdit || group.length >= 100} onClick={() => open('addChannels', {
            ids: [], connections: [], priority
          })}>{t('添加关联上游模型')}</Button></Space>
        </div>
        <Table empty="本组暂无上游模型" columns={columns} dataSource={matches} rowKey="id" scroll={{ x: 762 }} pagination={matches.length > pagination.pageSize ? pagination : false}/>
      </section>;
    })}
    {!visibleGroups.length && <Empty description={service.modelId ? '暂无匹配的上游模型' : '请先在「编辑信息」中选择模型编码'}/>}
    {preview && <div className="new-service-toolbar new-service-route-preview">
      <InputNumber min={1} step={1} hideButtons value={tokens ?? ''} aria-label="预览请求 Token 数"
        placeholder={weighted ? '输入 Token 数预览分流' : '输入 Token 数预览候选上游模型'} onChange={value => {
          const count = numericValue(value);
          setTokens(validContextLength(count) ? count : null);
        }}/>
      <Text type="secondary" aria-live="polite">{preview.join('、') || '没有符合条件的上游模型'}</Text>
    </div>}
  </>;
}

function ServiceModelDetails({ values, change }) {
  const details = values.modelDetails || serviceModelFields();
  const update = (key, value) => change({ modelDetails: { ...details, [key]: value } });
  return <Collapse>
    <AdminCollapsePanel itemKey="model-fields" header="模型资料字段">
      <div className="new-service-fields">
        {[['name', '模型展示名称'], ['author', '模型作者'], ['family', '模型系列'], ['version', '模型版本']].map(([key, label]) =>
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
  const t = useChannelText();
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
  if (editState && (editState.serviceId !== serviceId || (editState.kind === 'failover' && params.get('tab') !== 'failover'))) setEditState(null);
  const withModelDetails = row => {
    if (!row || row.modelDetails) return row;
    const identity = libraryRecord(state, row.modelId);
    return { ...row, modelDetails: serviceModelFields(identity && { ...identity, name: row.modelName || identity.name }) };
  };
  const service = withModelDetails(data.rows.find(row => row.id === serviceId));
  const defaults = data.defaults ?? { ...initialRoutingParameters, ...globalPolicyDefaults };
  const routingStrategy = defaults.strategy;
  const failover = service?.failoverCustom ? service.failover : failoverValues(defaults);
  const weighted = routingStrategy === DEFAULT_ROUTING_STRATEGY;
  const requestedTab = params.get('tab');
  const activeTab = requestedTab === 'strategy' ? 'channels' : tabs.some(([id]) => id === requestedTab) ? requestedTab : 'basic';
  useEffect(() => {
    if (serviceId && requestedTab === 'strategy') location.replace(detailHref(serviceId, 'channels'));
  }, [requestedTab, serviceId]);
  const dialog = editState?.serviceId === serviceId ? editState : null;
  const canEdit = !data.loading && !data.error && !sourceConflict && ['平台管理员', '运营人员'].includes(state.currentRole);
  const models = modelCatalogue(state).filter(row => !row.archivedAt);
  const allowModelSelection = dialog?.kind === 'create' || (dialog?.kind === 'editDetails' && !service?.modelId);
  const model = savedServiceModel(service);
  const registeredChannels = model ? mappingCandidates(state, { modelId: model.id }) : [];
  const simulatedChannels = simulatedServiceChannels(model, registeredChannels, service?.channels);
  const candidates = [...registeredChannels, ...simulatedChannels];
  const candidatesById = new Map(candidates.map(channel => [channel.id, channel]));
  const channelGroups = Map.groupBy(service?.channels || [], row => row.priority);
  const normalizedWeights = Object.assign({}, ...Array.from(channelGroups.values(), group =>
    group.length <= 100 ? groupWeights(group) : {}));
  const channels = service?.channels.map(row => {
    const source = candidatesById.get(row.channelId);
    const needsReview = Boolean(source && !source.reason && row.fingerprint !== sourceFingerprint(source));
    const reason = !source ? '上游模型已不可用' : source.reason || (needsReview ? '连接配置已变更，请重新核对' : '');
    return { ...row, weight: normalizedWeights[row.id] ?? row.weight, reason, needsReview };
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
        if (kind === 'create' || (allowModelSelection && values.modelId)) {
          if (values.modelId && !models.some(row => row.id === values.modelId)) throw Error('请选择有效的模型资料');
          if (values.type && !Object.hasOwn(MODEL_SERVICE_TYPES, modelServiceType(values.type))) throw Error('请选择有效的模型类型');
          const modelDetails = values.modelDetails || serviceModelFields();
          if ([modelDetails.context, modelDetails.output].some(value => value != null && !validContextLength(value))) {
            throw Error('上下文长度和最大输出 Token 数须为正整数');
          }
          fields.modelId = values.modelId || '';
          fields.type = values.type || '';
          fields.modelDetails = modelDetails;
        }
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
          throw Error('请先添加并启用通过验证的已登记上游模型');
        }
        next.listed = kind === 'list';
      } else if (kind === 'failover') {
        if (values.custom && failoverError(values.policy)) throw Error(failoverError(values.policy));
        next.failoverCustom = values.custom;
        next.failover = values.custom ? values.policy : record.failover;
      } else if (kind === 'newGroup') {
        if (!Number.isSafeInteger(values.priority) || values.priority < 0) throw Error('优先级需为非负整数');
        const priorities = groupPriorities(service);
        if (priorities.includes(values.priority)) throw Error('该优先级已存在');
        next.priorityGroups = [...priorities, values.priority];
      } else if (kind === 'addChannels' || kind === 'channel') {
        const previous = service.channels.find(row => row.id === values.id);
        const ids = kind === 'channel' ? [values.channelId] : values.ids;
        if (!ids.length) throw Error('请选择上游模型');
        if (kind === 'addChannels' && contextRoutingEnabled(service) && !validContextLength(values.context)) throw Error('请输入正整数的上下文长度');
        const links = ids.map(id => {
          const source = candidatesById.get(id);
          if (!source || source.reason) throw Error(source?.reason || '上游模型不可用');
          if (service.channels.some(row => row.channelId === id && row.id !== values.id)) throw Error('该上游模型已关联');
          return {
            ...previous, id: previous?.id || resourceId('service-channel'), channelId: source.id,
            name: source.sourceName || source.name || source.endpoint.name, provider: source.provider.name,
            upstreamId: source.upstreamModelId, fingerprint: sourceFingerprint(source),
            ...(source.simulated && { simulated: true }), ...(!previous && values.context != null && { context: values.context }),
            priority: values.priority, weight: previous?.weight ?? defaultChannelWeight, enabled: previous?.enabled ?? true,
          };
        });
        next.channels = previous ? service.channels.map(row => row.id === previous.id ? links[0] : row) : [...service.channels, ...links];
      } else if (kind === 'weights') {
        const group = service.channels.filter(row => row.priority === values.originalPriority);
        if (!Number.isSafeInteger(values.priority) || values.priority < 0) throw Error('优先级需为非负整数');
        if (values.priority !== values.originalPriority && groupPriorities(service).includes(values.priority)) throw Error('该优先级已存在');
        if (group.length && weighted && (group.some(row => !validWeight(values[row.id])) || group.reduce((sum, row) => sum + values[row.id], 0) !== 100)) throw Error('组内权重须为正整数且合计为 100');
        next.priorityGroups = groupPriorities(service).map(priority => priority === values.originalPriority ? values.priority : priority);
        next.channels = service.channels.map(row => row.priority === values.originalPriority
          ? { ...row, priority: values.priority, weight: weighted ? values[row.id] : row.weight } : row);
      } else if (['stopChannel', 'startChannel', 'removeChannel'].includes(kind)) {
        if (kind === 'startChannel' && channels.find(row => row.id === values.id)?.reason) throw Error('请先核对上游模型配置');
        next.channels = kind === 'removeChannel' ? service.channels.filter(row => row.id !== values.id)
          : service.channels.map(row => row.id === values.id ? { ...row, enabled: kind === 'startChannel' } : row);
        if (kind === 'startChannel') {
          const issue = channelSetupIssue(next);
          if (issue) throw Error(issue);
        }
        if (next.listed && !values.simulated && !next.channels.some(row => row.enabled && !row.simulated && !channels.find(channel => channel.id === row.id)?.reason)) {
          throw Error('已启用的服务至少需要一个可用上游模型，请先停止服务');
        }
      } else if (kind === 'remove') {
        if (dialog.check?.revision !== record.revision || dialog.check.deleteIssue) {
          throw Error(dialog.check?.deleteIssue || '服务配置已变化，请重新检查');
        }
        if (await save(record, 'delete')) location.hash = pageHref;
        return;
      }
      if (kind === 'addChannels' || kind === 'removeChannel') {
        next.priorityGroups = groupPriorities(service);
        const group = next.channels.filter(row => row.priority === values.priority).map(row => ({ ...row, weight: normalizedWeights[row.id] ?? row.weight }));
        const weights = groupWeights(group);
        next.channels = next.channels.map(row => row.priority === values.priority ? { ...row, weight: weights[row.id] } : row);
      }
      if (await save(next) && (kind === 'list' || kind === 'unlist')) void reloadWorkspace();
    } catch (issue) {
      error(issue.code === 'DUPLICATE_CALL_ID' ? `${MODEL_ID_LABEL} 已存在` : issue.message);
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
    {
      title: <TableFieldHelp name={MODEL_ID_LABEL} description={callLogFieldHelp.callId}/>,
      width: 155, render: (_, row) => <CopyId label={MODEL_ID_LABEL} value={row.callId} ellipsis copyAtStart/>,
    },
    { title: endpointLabel, width: 200, render: (_, row) => {
      const paths = endpointValues(row);
      return paths.length ? <div className="new-service-cell">{paths.map(path => <CopyId key={path} label={endpointLabel} value={platformEndpoint(path)} ellipsis copyAtStart/>)}</div> : '—';
    } },
    { title: '模型类型', width: 110, render: (_, row) => {
      const type = MODEL_SERVICE_TYPES[modelServiceType(row.type)];
      return type ? <Tooltip content={type[1]}><Tag color="blue" tabIndex={0} aria-label={type.join('，')}>{type[0]}</Tag></Tooltip> : '—';
    } },
    { title: <TableFieldHelp name="服务状态" description="服务状态用于控制模型服务是否可在模型广场、项目授权和调用链路中使用。"/>,
      width: 110, render: (_, row) => <AdminStatus value={serviceStatus(row)} label={t(serviceStatus(row))}/> },
    { title: '创建人/时间', width: 155, render: (_, row) => <div className="new-service-cell"><Text>{row.createdBy}</Text><Text type="tertiary">{displayTime(row.createdAt)}</Text></div> },
    { title: '备注', dataIndex: 'note', width: 100, ellipsis: true, render: value => value || '—' },
    { title: '操作', width: 164, fixed: 'right', render: (_, row) => <Space spacing={2}>
      <Button theme="borderless" size="small" disabled={!canEdit} onClick={() => open(row.listed ? 'unlist' : 'list', { target: row.id })}>{t(row.listed ? '停止服务' : '启动服务')}</Button>
      <Button theme="borderless" size="small" disabled={!canEdit} onClick={() => open('edit', { name: row.name, target: row.id })}>编辑</Button>
      <Button theme="borderless" type="danger" size="small" disabled={!canEdit || row.listed} onClick={() => open('remove', { target: row.id })}>删除</Button>
    </Space> },
  ];

  const { kind, values } = dialog || {};
  const editingGroup = kind === 'weights' ? channels.filter(row => row.priority === values.originalPriority) : [];
  const draftTotal = editingGroup.reduce((sum, row) => sum + (values[row.id] || 0), 0);
  const weightsValid = draftTotal === 100 && editingGroup.every(row => validWeight(values[row.id]));
  const reviewSource = kind === 'channel' && values.id ? candidatesById.get(values.channelId) : null;
  const target = values?.target ? data.rows.find(row => row.id === values.target) : service;
  const requiresCheck = kind === 'unlist' || kind === 'remove';
  const checkIssue = kind === 'unlist' ? dialog?.check?.stopIssue : dialog?.check?.deleteIssue;
  const checkBlocked = requiresCheck && (!dialog.check || dialog.check.revision !== target?.revision || Boolean(checkIssue));
  const titles = {
    import: '导入浏览器记录', create: '添加模型服务', edit: '编辑模型服务名称', editDetails: '编辑信息', list: '启动服务', unlist: '停止服务',
    channel: '核对连接配置', newGroup: '新增优先级组', addChannels: '添加关联上游模型至优先级 ' + values?.priority, startChannel: '启用上游模型', stopChannel: '停用上游模型',
    removeChannel: '移除上游模型', weights: '配置优先级与权重', remove: '删除模型服务', failover: '配置故障转移策略',
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
            aria-label="搜索模型服务" placeholder={`搜索服务名称 / 服务 ID / ${MODEL_ID_LABEL}`} value={query} onChange={setQuery}/>
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
          {tabs.map(([id, label]) => <Tabs.TabPane key={id} itemKey={id} tab={t(label)}>
          {activeTab === id && <div className="new-service-tab">
          {activeTab === 'basic' && <BasicInformation service={service} model={model}
            sources={channels.filter(row => row.enabled && !row.reason && !row.simulated).map(row => candidatesById.get(row.channelId))}/>}
          {activeTab === 'failover' && <>
            <div className="new-service-toolbar">
              <Space><Text strong>策略来源</Text>{kind === 'failover'
                ? <RadioGroup aria-label="策略来源" disabled={saving || !canEdit} value={values.custom ? 'custom' : 'global'}
                    onChange={event => change({ custom: event.target.value === 'custom' })}>
                    <Radio value="global">继承全局</Radio><Radio value="custom">自定义</Radio>
                  </RadioGroup>
                : <Tag>{service.failoverCustom ? '自定义' : '继承全局'}</Tag>}</Space>
              {kind === 'failover' ? <Space>
                <Button disabled={saving} onClick={close}>取消</Button>
                <Button theme="solid" disabled={!canEdit || !dirty} loading={saving} onClick={apply}>保存</Button>
              </Space> : <Button theme="solid" disabled={!canEdit} onClick={() => open('failover', { custom: !!service.failoverCustom,
                policy: service.failover ?? failoverValues(defaults) })}>编辑</Button>}
            </div>
            {kind === 'failover' && dialog.error && <Notice error>{dialog.error}</Notice>}
            {kind === 'failover' && dialog.error.includes('其他页面') && <Button onClick={() => { reload(); close(); }}>放弃本次修改并载入最新配置</Button>}
            <FailoverFields values={kind === 'failover' ? (values.custom ? values.policy : defaults) : failover}
              disabled={kind !== 'failover' || !values.custom || saving || !canEdit}
              change={patch => change({ policy: { ...values.policy, ...patch } })}/>
          </>}
          {activeTab === 'channels' && <ChannelModels service={{ ...service, routingStrategy }} rows={channels} canEdit={canEdit}
            open={open}/>}
          </div>}
          </Tabs.TabPane>)}
        </Tabs>
      </Card>
    </> : <Card><Empty description="未找到指定模型服务"><Button onClick={() => { location.hash = pageHref; }}>返回{pageTitle}</Button></Empty></Card>}
    {dialog && kind !== 'failover' && <Modal title={titles[kind]} wide={kind === 'weights' || kind === 'addChannels'} onClose={() => {
      if (saving) return;
      if (dirty) setEditState(current => ({ ...current, discard: true }));
      else close();
    }}
      maskClosable={false} footer={<>
        <Button disabled={saving} onClick={() => dirty ? setEditState(current => ({ ...current, discard: true })) : close()}>取消</Button>
        <Button theme="solid" disabled={!canEdit || dialog.discard || checkBlocked || ((kind === 'weights' || kind === 'newGroup') && !Number.isSafeInteger(values.priority)) || (kind === 'addChannels' && !values.ids.length) || (kind === 'weights' && (!dirty || editingGroup.length > 0 && weighted && !weightsValid))} loading={saving} form={formId} htmlType="submit">{
          kind === 'import' ? '确认导入' : kind === 'create' ? '创建模型服务' : kind === 'list' ? '确认启动' : kind === 'unlist' ? '确认停服'
            : kind === 'remove' ? '确认删除' : kind === 'channel' && values.id ? '确认更新关联' : '保存'
        }</Button>
      </>}>
      <form id={formId} className="new-service-form" onSubmit={event => { event.preventDefault(); apply(); }}>
        {['create', 'edit', 'editDetails'].includes(kind) &&
          <Field label="模型服务名称" required><Input aria-label="模型服务名称" value={values.name} maxLength={120} onChange={value => change({ name: value })}/></Field>
        }
        {['create', 'editDetails'].includes(kind) && <>
          <Field label={<FieldLabel name={MODEL_ID_LABEL} description="调用方在 API 请求的 model 字段填写此值。"/>} required>
            <Input aria-label={MODEL_ID_LABEL} value={values.callId} disabled={Boolean(values.controlledOfferId)} maxLength={128} onChange={value => change({ callId: value })}/>
          </Field>
          {allowModelSelection && <Field label={kind === 'create' ? '从基础资料带入' : '模型编码'}>
            <Select filter showClear value={values.modelId || undefined} placeholder="选择模型资料"
              dropdownMatchSelectWidth dropdownClassName="service-model-select-dropdown"
              dropdownStyle={{ width: 'min-content' }}
              optionList={models.map(row => ({ value: row.id, label: row.name + '（' + row.modelId + '）' }))}
              onChange={id => {
                const record = models.find(row => row.id === id);
                change({ modelId: record?.id || '', type: record?.type || '', modelDetails: serviceModelFields(record) });
              }} style={{ width: '100%' }}/>
          </Field>}
          {kind === 'create' && <Field label="模型类型">
            <Select showClear value={values.type || undefined} placeholder="选择模型类型"
              optionList={values.type && modelServiceType(values.type) !== values.type
                ? typeOptions.map(option => option.value === modelServiceType(values.type) ? { ...option, value: values.type } : option)
                : typeOptions}
              onChange={type => change({ type: type || '' })} style={{ width: '100%' }}/>
          </Field>}
          {kind === 'editDetails' && <Field label="标签"><Input aria-label="标签" value={values.tags || ''} maxLength={160} onChange={value => change({ tags: value })}/></Field>}
          <Field label="备注"><Input aria-label="备注" value={values.note} maxLength={240} onChange={value => change({ note: value })}/></Field>
          <Field label="服务描述"><TextArea aria-label="服务描述" value={values.description}
            maxLength={SERVICE_DESCRIPTION_LIMIT} maxCount={SERVICE_DESCRIPTION_LIMIT}
            onChange={value => change({ description: value })}/></Field>
          {kind === 'create' && <ServiceModelDetails values={values} change={change}/>}
        </>}
        {kind === 'channel' && values.id && reviewSource && <>
          <Text strong>{values.name}</Text>
          <Text>上游接入配置已变更，请核对当前关联后确认。</Text>
          <Descriptions data={[
            { key: '变更项', value: changedChannelSettings(values.fingerprint, reviewSource) },
            { key: '服务商', value: reviewSource.provider.name },
            { key: '上游模型 ID', value: reviewSource.upstreamModelId === values.upstreamId ? values.upstreamId : values.upstreamId + ' → ' + reviewSource.upstreamModelId },
            { key: '模型连接', value: reviewSource.endpoint.name },
          ]}/>
        </>}
        {kind === 'newGroup' && <GroupPriorityField hint="数值越小越优先，例如 0 优先于 1" value={values.priority} onChange={priority => change({ priority })}/>}
        {kind === 'addChannels' && <>
          <BatchChannelFields candidates={candidates} linked={channels} values={values} change={change}/>
          {contextRoutingEnabled(service) && <NumberField label={t(contextLabel)} min={1} value={values.context} onChange={context => change({ context })}/>}
        </>}
        {kind === 'weights' && <><GroupPriorityField value={values.priority} onChange={priority => change({ priority })}/>
          {editingGroup.length > 0 && <ChannelWeightFields rows={editingGroup} total={draftTotal} valid={weightsValid} values={values} change={change} disabled={saving || !canEdit || !weighted}/>}</>}
        {kind === 'import' && <Text>将「{values.name}」导入共享列表，保留原服务 ID 和创建信息。</Text>}
        {['list', 'unlist', 'remove'].includes(kind) && <Text>{titles[kind] + '「' + target?.name + '」？'}</Text>}
        {requiresCheck && dialog.checking && <Text role="status">正在检查模型广场关联…</Text>}
        {requiresCheck && dialog.check && <div role="status" className="new-service-cell">
          <Text>{dialog.check.marketLinked
            ? dialog.check.marketListed ? '已关联模型卡片，正在展示该服务' : '已关联模型卡片，未展示该服务'
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
