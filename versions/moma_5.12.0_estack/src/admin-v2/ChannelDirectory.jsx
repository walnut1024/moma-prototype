import { useLayoutEffect, useRef, useState } from 'react';
import { Button, Card, Checkbox, CheckboxGroup, Dropdown, Empty, Input, Radio, RadioGroup, Space, Table, Tag, Toast, Typography } from '@douyinfe/semi-ui';
import { IconChevronDown, IconChevronRight, IconMore, IconPlus } from '@douyinfe/semi-icons';
import { AdminPagination } from './AdminTable';
import AdminStatus from './AdminStatus';
import ChannelCapacityEditor, { ChannelCapacityCell } from './ChannelCapacity';
import ChannelCostCell from './ChannelCostCell';
import ChannelDirectoryArchive from './ChannelDirectoryArchive';
import ChannelDirectoryBalance from './ChannelDirectoryBalance';
import ChannelDirectoryBatchTest from './ChannelDirectoryBatchTest';
import ChannelDirectoryConsistency from './ChannelDirectoryConsistency';
import ChannelDirectoryDiscovery from './ChannelDirectoryDiscovery';
import ChannelDirectoryRouteOrder from './ChannelDirectoryRouteOrder';
import ChannelDirectorySpecialty from './ChannelDirectorySpecialty';
import ChannelDirectoryTags from './ChannelDirectoryTags';
import ChannelDirectoryTagEdit from './ChannelDirectoryTagEdit';
import ChannelDirectoryCreation from './ChannelDirectoryCreation';
import ChannelManagementView, { ChannelDetails } from './ChannelManagementView';
import ChannelKeyPoolEditor from './ChannelKeyPoolEditor';
import { ChannelConnectionEditor, ChannelModelEditor } from './ChannelConnectionEditors';
import { CopyId, Disclosure, Modal, Notice, SearchBox, useOperations } from './ModelOperationsUI';
import ProcurementVersionEditor from './ProcurementVersionEditor';
import ProviderRemovalDialog from './ProviderRemovalDialog';
import { Choice, Field } from './ServiceUI';
import SupplierChannelBatchTest from './SupplierChannelBatchTest';
import SupplierChannelConfiguration from './SupplierChannelConfiguration';
import SupplierChannelLifecycleDialog from './SupplierChannelLifecycleDialog';
import { channelChangeImpact } from './channel-change-management';
import { channelServiceParameters } from './channel-service-context';
import { channelStatus } from './channel-selection';
import { channelCheckCurrent } from './provider-channels';
import { connectionRecoveryIssue, connectionTestPassed } from './connection-state';
import { downloadJsonFile } from './provider-files';
import { CONNECTION_STATUSES, connectionDirectoryRows, filterConnections } from './channel-connection-directory';
import { activeRouteVersion, routingChannels, routingServices, serviceRoute } from './service-routing';
import { supplierDirectory } from './moma-provider.js';
import { providerKeyGroups } from './provider-key-groups';
import { serviceReferences } from '../service-access.mjs';
import { workspaceStoragePrefix } from '../workspace-storage.mjs';
import './channel-directory.css';

const pageSize = 20;
const operationLabels = { enable: '启用连接', disable: '停用连接', tag: '添加运维标签', untag: '移除运维标签', replaceTags: '替换运维标签', clearTags: '清除运维标签' };
const labelActions = { ...operationLabels, renameTag: '重命名运维标签', dissolveTag: '解散运维标签' };
const configurableColumns = [['id', '连接 ID'], ['provider', '服务商'], ['protocol', '协议'], ['address', '上游 API 地址'],
  ['models', '已接入模型'], ['tags', '标签'], ['testTime', '最近测试'], ['testDuration', '最近测试耗时'],
  ['routeGroup', '可用分组'], ['priority', '优先级'], ['weight', '权重'], ['balance', '模拟余额'], ['instance', '上游实例状态']];
const sortOptions = [['default', '默认顺序'], ['name', '连接名称'], ['priority', '当前服务分组的优先级'], ['weight', '当前服务分组的权重']];
const defaultDisplay = { view: 'table', columns: ['id', 'provider', 'protocol', 'address', 'models', 'tags'], filters: true, sort: 'default', direction: 'asc' };
const displaySettings = key => {
  try {
    const saved = JSON.parse(localStorage.getItem(key));
    return {
      view: saved?.view === 'card' ? 'card' : 'table',
      columns: Array.isArray(saved?.columns) ? saved.columns.filter(key => configurableColumns.some(([column]) => key === column)) : defaultDisplay.columns,
      filters: saved?.filters !== false,
      sort: sortOptions.some(([key]) => key === saved?.sort) ? saved.sort : 'default',
      direction: saved?.direction === 'desc' ? 'desc' : 'asc',
    };
  } catch { return defaultDisplay; }
};

function ConnectionRouting({ state, connection, modelKey, order, close, embedded = false }) {
  const { id, name, provider } = connection;
  const models = modelKey ? connection.models.filter(row => row.key === modelKey) : connection.models;
  const identities = new Map(serviceReferences(state).map(service => [service.id, service]));
  const rows = routingServices(state).flatMap(service => {
    const reference = identities.get(service.id);
    const route = serviceRoute(state, service.id);
    const active = activeRouteVersion(route);
    return !reference ? [] : routingChannels(state, service).filter(channel => channel.endpointId === id).flatMap(channel => {
      const model = models.find(row => [row.association.id, row.association.relationId, row.channelId].includes(channel.channelId) ||
        row.association.modelId === (channel.catalogueModelId || channel.upstreamModelId) && row.association.upstreamModelId === channel.upstreamModelId);
      if (!model) return [];
      const live = active?.config?.channels?.find(row => row.supplyId === channel.id && row.enabled);
      const draft = route?.draft?.channels?.find(row => row.supplyId === channel.id && row.enabled);
      const membership = live || draft;
      const config = live ? active.config : route?.draft;
      const group = config?.groups?.find(row => row.id === membership?.groupId);
      const draftGroup = route?.draft?.groups?.find(row => row.id === draft?.groupId);
      const draftChanged = live && route?.draft && (!draft || ['groupId', 'priority', 'weight'].some(key => draft[key] !== live[key]));
      const draftSummary = draftChanged && (draft
        ? `待发布 · ${draftGroup?.name || draft.groupId} · 优先级 ${draft.priority} · 权重 ${draft.weight}`
        : '待发布 · 移出此连接');
      const orderGroupId = draft?.groupId || membership?.groupId;
      const input = channelServiceParameters({ providerId: provider.id, endpointId: id, associationIds: [model.association.id], origin: location.hash });
      const query = new URLSearchParams({ supplyProvider: input.supplyProvider, supplyEndpoint: input.supplyEndpoint,
        supplyAssociations: input.supplyAssociations, model: service.modelId, serviceRecord: reference.model_service_id, panel: 'routing', returnTo: location.hash });
      return [{ id: service.id + ':' + channel.id, service, model, href: '#/admin-2/listing?' + query.toString(),
        status: live ? '生效 · v' + active.version : draft ? '待发布' : '已关联',
        group: group?.name || membership?.groupId, groupId: orderGroupId, priority: membership?.priority, weight: membership?.weight, draftSummary }];
    });
  });
  const content = <>
    <Typography.Title heading={5}>关联模型服务</Typography.Title>
    <Table size="small" rowKey="id" pagination={false} dataSource={rows}
      empty={<Empty description="尚未关联模型服务"/>} columns={[
        { title: '服务与调用标识', render: (_, row) => <div className="channel-identity">
          <Typography.Text strong>{row.service.model.serviceName || row.service.model.name} · {row.service.name}</Typography.Text>
          <CopyId value={row.service.callId} label="模型调用标识"/></div> },
        { title: '状态', render: (_, row) => <div className="channel-identity">
          <Typography.Text>{row.status}</Typography.Text>
          {row.draftSummary && <Typography.Text type="tertiary" size="small">{row.draftSummary}</Typography.Text>}
        </div> },
        { title: '路由分组', render: (_, row) => row.group || '—' },
        { title: '优先级', render: (_, row) => row.priority ?? '—' },
        { title: '权重', render: (_, row) => row.weight ?? '—' },
        { title: '操作', render: (_, row) => <Space wrap>
          {row.groupId && <Button theme="borderless" size="small" onClick={event => order(event, row)}>调整组内顺序</Button>}
          <Button theme="borderless" size="small" onClick={() => window.open(row.href, '_blank', 'noopener')}>打开服务路由（新页签）</Button>
        </Space> },
      ]}/>
    {rows.length > 0 && <Disclosure title="查看映射 JSON"><pre>{JSON.stringify(rows.map(row => ({
      serviceId: row.service.id, model: row.service.callId, upstreamModel: row.model.association.upstreamModelId,
      associationId: row.model.association.id, groupId: row.groupId,
    })), null, 2)}</pre></Disclosure>}
  </>;
  return embedded ? content : <Modal drawer wide title="路由与映射" description={[name, modelKey && models[0]?.modelName].filter(Boolean).join(' / ')} onClose={close}
    footer={<Button onClick={close}>关闭</Button>}>{content}</Modal>;
}

function ConnectionOperation({ connections, action, initialTag = '', sourceTag, state, ops, close, retest, reference = false }) {
  const title = labelActions[action];
  const tagging = ['tag', 'untag', 'renameTag', 'dissolveTag', 'replaceTags', 'clearTags'].includes(action);
  const showTagInput = tagging && !['dissolveTag', 'clearTags'].includes(action);
  const impacts = connections.map(({ provider, endpoint }) => channelChangeImpact(state, provider.id, endpoint.id));
  const services = routingServices(state).filter(service => impacts.some(impact => impact.services.some(reference => reference.id === service.id)));
  const targets = connections.map(({ id, provider, endpoint }, index) => ({
    providerId: provider.id, endpointId: id, expectedUpdatedAt: endpoint.updatedAt,
    ...(tagging ? {} : { expectedImpactRevision: impacts[index].revision }),
  }));
  const [expected, setExpected] = useState(targets);
  const [tag, setTag] = useState(sourceTag || initialTag);
  const [confirmed, setConfirmed] = useState(false);
  const [associationIds, setAssociationIds] = useState([]);
  const [busy, setBusy] = useState(false);
  const [receipts, setReceipts] = useState(null);
  const report = !tagging && !sourceTag && connections.length > 1;
  const displayConnections = connections.filter(row => expected.some(target => target.endpointId === row.id));
  const stale = JSON.stringify(expected) !== JSON.stringify(targets.filter(row => expected.some(item => item.endpointId === row.endpointId)));
  const enabling = action === 'enable' && connections.length === 1 ? connections[0] : null;
  const recovery = enabling && connectionRecoveryIssue(enabling.endpoint);
  const issue = row => {
    if (tagging) return '';
    if (row.endpoint.frozen || row.endpoint.candidateConfiguration || row.endpoint.serverTestJobs?.some(job => !job.receivedAt && !job.canceledAt)) return '请先处理冻结、候选配置或未完成检测';
    if (action === 'disable') return '';
    if (row.provider.status !== '已启用') return '服务商停用';
    if (!row.models.length) return '请先接入模型';
    if (connectionRecoveryIssue(row.endpoint)) return connectionRecoveryIssue(row.endpoint);
    return connectionTestPassed(row.endpoint) ? '' : '当前配置待测试';
  };
  const exportScope = () => downloadJsonFile(displayConnections.map(row => ({
    connectionId: row.id, name: row.name, providerId: row.provider.id, status: row.status, action: title, issue: issue(row),
  })), 'channel-operation-review.json');
  const submit = async () => {
    setBusy(true);
    try {
      const next = await ops.run('channelDirectoryOperate', { targets: expected, action, tag, ...(sourceTag ? { sourceTag } : {}),
        ...(enabling ? { associationIds } : {}), report, confirmed });
      if (next && report) setReceipts(next.audits[0].directoryOperationResults || []);
      else if (next) close();
    } finally { setBusy(false); }
  };
  if (receipts) {
    const failed = new Set(receipts.filter(row => row.status !== '已完成').map(row => row.endpointId));
    return <Modal drawer wide title={'批量' + title + '结果'} onClose={close} footer={<Space>
      <Button onClick={close}>关闭</Button>
      <Button theme="light" onClick={() => downloadJsonFile(receipts, 'channel-operation-results.json')}>导出结果</Button>
      <Button theme="light" disabled={!ops.can || !targets.some(row => failed.has(row.endpointId))} onClick={() => {
        setExpected(targets.filter(row => failed.has(row.endpointId))); setReceipts(null); setConfirmed(false); ops.setError('');
      }}>重新核对未完成项</Button>
    </Space>}>
      <Typography.Paragraph>已完成 {receipts.length - failed.size} 条，跳过 {failed.size} 条。</Typography.Paragraph>
      <Table size="small" rowKey="endpointId" pagination={{ pageSize: 10, hideOnSinglePage: true }} dataSource={receipts} columns={[
        { title: '连接', render: (_, row) => connections.find(item => item.id === row.endpointId)?.name || row.endpointId },
        { title: '结果', dataIndex: 'status' }, { title: '原因', render: (_, row) => row.reason || '—' },
      ]}/>
    </Modal>;
  }
  return <Modal drawer wide title={connections.length > 1 ? '批量' + title : title}
    description={[sourceTag, connections.length === 1 ? connections[0].name : connections.length + ' 条连接'].filter(Boolean).join(' · ')} onClose={() => !busy && close()}
    footer={<Space><Button disabled={busy} onClick={close}>取消</Button>
      {connections.length > 1 && <Button disabled={busy} onClick={exportScope}>导出核对清单</Button>}
      <Button theme="solid" type={['disable', 'dissolveTag'].includes(action) ? 'danger' : 'primary'} loading={busy}
        disabled={busy || !ops.can || !confirmed || stale || Boolean(recovery) || showTagInput && (!tag.trim() || action === 'renameTag' && tag.trim() === sourceTag)}
        onClick={submit}>{associationIds.length ? '启用连接及所选模型' : '确认' + title}</Button></Space>}>
    <Typography.Paragraph>{action === 'dissolveTag' ? '解散后移除这些连接的当前标签，其他标签保留。' : tagging ? '运维标签用于查找和批量选择连接。' : action === 'enable' ? (reference ? '启用前需新增模型渠道并通过当前连接测试。' : '启用前需新增模型渠道并通过当前连接测试。模型渠道可在展开行单独启用。') : '停用后，以下模型无法通过所选连接调用。恢复连接后，保留各模型原有启停设置。'}</Typography.Paragraph>
    {showTagInput && <Field label={action === 'renameTag' ? '新标签名称 *' : action === 'replaceTags' ? '新标签（用逗号分隔）' : '运维标签 *'}><Input value={tag} aria-label="运维标签" maxLength={action === 'replaceTags' ? 330 : 32} disabled={busy}
      onChange={value => { setTag(value); setConfirmed(false); }}/></Field>}
    <Table size="small" rowKey="id" pagination={false} dataSource={displayConnections} columns={[
      { title: '连接名称', dataIndex: 'name' },
      { title: '服务商', render: (_, row) => row.provider.name },
      { title: '当前状态', render: (_, row) => <AdminStatus value={row.status}/> },
      { title: tagging ? '当前标签' : '已接入模型', render: (_, row) => (tagging ? row.endpoint.directoryTags || [] : row.models.map(model => model.modelName)).join('、') || '—' },
      !tagging && { title: '准备结果', render: (_, row) => issue(row) || '可提交' },
    ].filter(Boolean)}/>
    {!tagging && services.length > 0 && <Typography.Paragraph>涉及 {services.length} 项服务 · {services.map(service => service.name || service.callId || service.id).join('、')}</Typography.Paragraph>}
    {enabling?.endpoint.activationSource === 'automatic' && <Notice>
      {enabling.endpoint.activationReason || '自动停用'} · {enabling.endpoint.activationChangedAt &&
        new Date(enabling.endpoint.activationChangedAt).toLocaleString('zh-CN', { timeZone: 'Asia/Shanghai' })}
      {recovery && <Button theme="borderless" disabled={!ops.can || busy} onClick={event => retest(event, enabling.id)}>复测当前配置</Button>}
    </Notice>}
    {enabling && <Table size="small" rowKey="key" pagination={false} dataSource={enabling.models} columns={[
      { title: '模型', dataIndex: 'modelName' },
      { title: '状态', render: (_, row) => <AdminStatus value={channelStatus(enabling.provider, row.association)}/> },
      { title: '同时启用', render: (_, { association }) => <Checkbox aria-label={'同时启用 ' + association.upstreamModelId}
        checked={associationIds.includes(association.id)}
        disabled={!ops.can || busy || stale || Boolean(recovery) || association.enabled || !channelCheckCurrent(association) || association.health?.result !== '通过'}
        onChange={event => {
          setAssociationIds(ids => event.target.checked ? [...ids, association.id] : ids.filter(id => id !== association.id));
          setConfirmed(false);
        }}/> },
    ]}/>}
    {stale && <Notice error>连接或关联服务已变化，请关闭后重新核对。</Notice>}
    <Checkbox checked={confirmed} disabled={busy || stale || !ops.can}
      onChange={event => setConfirmed(event.target.checked)}>{tagging ? '我已核对标签及连接范围' : '我已核对模型及关联服务'}</Checkbox>
    {ops.error && <Notice error>{ops.error}</Notice>}
  </Modal>;
}

function ConnectionModels({ connection, ops, open, trigger }) {
  const { id, name, models, provider } = connection;
  const query = ops.params.get('modelQ') || '';
  const keyword = query.trim().toLowerCase();
  const matches = models.filter(model => [model.modelName, model.modelCode, model.association.upstreamModelId]
    .some(value => value?.toLowerCase().includes(keyword)));
  return <div className="channel-connection-details">
    <div className="channel-management-toolbar">
      <SearchBox placeholder="搜索模型名称、编码或上游调用标识" value={query}
        onChange={modelQ => ops.go({ modelQ: modelQ || null }, { replace: true })}/>
      <Space wrap spacing={8}>
        <Button disabled={!ops.can || !models.length} onClick={event => open(event, 'test', id)}>批量测试</Button>
        <Button theme="solid" icon={<IconPlus aria-hidden="true"/>}
          disabled={!ops.can || Boolean(connection.endpoint.candidateConfiguration) || Boolean(connection.endpoint.adapterDraft)}
          onClick={event => open(event, 'add', id)}>接入模型</Button>
      </Space>
    </div>
    <Table aria-label={name + '已接入模型'} rowKey="key" dataSource={matches} size="small" pagination={false}
      empty={<Empty description={keyword ? '没有匹配的模型' : '该渠道尚未接入模型'}/>}
      className="channel-model-table" scroll={{ x: 'max(100%, 1050px)' }}
      columns={[
        { title: '模型', width: 152, render: (_, model) => <div className="channel-identity">
          <Typography.Text strong>{model.modelName}</Typography.Text><CopyId copyAtStart ellipsis label="模型编码" value={model.modelCode}/>
        </div> },
        { title: '模型状态', width: 104, render: (_, { association }) => <AdminStatus value={channelStatus(provider, association)}/> },
        { title: '上游模型调用标识', width: 194, render: (_, { association }) =>
          <CopyId copyAtStart ellipsis value={association.upstreamModelId} label="上游模型调用标识"/> },
        { title: '容量', width: 146, render: (_, model) =>
          <ChannelCapacityCell provider={provider} channel={model.association} modelName={model.modelName}/> },
        { title: '采购成本', width: 220, render: (_, model) => <ChannelCostCell cost={model}/> },
        { title: '操作', width: 260, render: (_, model) => <Space wrap spacing={4} className="channel-model-actions">
          {[['model', '配置模型'], ['cost', '成本设置']].map(([type, label]) => (
            <Button key={type} theme="borderless" size="small" disabled={!ops.can}
              aria-label={label + ' ' + model.modelName + ' · ' + name}
              onClick={event => open(event, type, id, model.key)}>{label}</Button>))}
          <Dropdown clickToHide trigger="click" position="bottomRight" render={<Dropdown.Menu>
            <Dropdown.Item disabled={!ops.can} onClick={() => open(null, 'capacity', id, model.key)}>容量设置</Dropdown.Item>
            <Dropdown.Item disabled={!ops.can} onClick={() => open(null, 'test', id, model.key)}>测试模型</Dropdown.Item>
            <Dropdown.Item onClick={() => open(null, 'testHistory', id, model.key)}>查看测试记录</Dropdown.Item>
            <Dropdown.Item onClick={() => open(null, 'routing', id, model.key)}>查看关联服务</Dropdown.Item>
            <Dropdown.Item disabled={!ops.can} onClick={() => open(null, 'modelLifecycle', id, model.key)}>{model.association.enabled ? '停用模型渠道' : '启用模型渠道'}</Dropdown.Item>
            <Dropdown.Item disabled={!ops.can} onClick={() => open(null, 'remove', id, model.key)}>删除模型渠道</Dropdown.Item>
          </Dropdown.Menu>}>
            <Button theme="borderless" size="small" icon={<IconMore/>} aria-label={'模型更多操作 ' + model.modelName}
              onClick={event => { trigger.current = event.currentTarget; }}/>
          </Dropdown>
        </Space> },
      ]}/>
  </div>;
}

export function ChannelManagementNew(props) {
  const { state } = props;
  const ops = useOperations(props, 'providers-reference');
  const [operation, setOperation] = useState(null);
  const focusTarget = useRef(null), trigger = useRef(null);
  const providers = supplierDirectory(state).filter(row => !row.deletedAt && !row.id.startsWith('service-review-provider-'));
  const connections = connectionDirectoryRows(state, providers);
  const connection = operation && connections.find(row => row.id === operation.connectionId);
  const model = connection?.models.find(row => row.key === operation.modelKey);
  const open = (event, type, connectionId, modelKey, back) => ops.proceed(() => {
    if (event && !back) trigger.current = event.currentTarget;
    ops.setError('');
    setOperation({ type, connectionId, modelKey, back });
  });
  const finish = () => {
    setOperation(null);
    ops.setError('');
    ops.dirty(false);
    requestAnimationFrame(() => (trigger.current?.isConnected ? trigger.current : focusTarget.current?.querySelector('input'))?.focus({ preventScroll: true }));
  };
  const close = () => {
    if (!operation?.back) return finish();
    ops.setError('');
    ops.dirty(false);
    setOperation(operation.back);
  };
  const chooseModels = (_, connectionId, initialRows, selection) => ops.proceed(() => {
    setOperation({ type: 'add', connectionId, initialRows, back: { ...operation, selection } });
  });
  return <div className="admin-page-stack supplier-workbench channel-management-new">
    <ChannelManagementView state={state} connections={connections} ops={ops} open={open} focusTarget={focusTarget}/>
    {operation?.type === 'create' && <ChannelDirectoryCreation state={state} providers={providers} connections={connections} ops={ops} close={close} reference/>}
    {connection && operation.type === 'edit' && <ChannelConnectionEditor key={connection.id} state={state} connection={connection} ops={ops} close={close} reference/>}
    {connection && operation.type === 'discovery' && <ChannelDirectoryDiscovery state={state} connections={[connection]} ops={ops} close={close}
      append={chooseModels} initialSelection={operation.selection} reference/>}
    {connection && operation.type === 'add' && <SupplierChannelConfiguration state={state} provider={connection.provider}
      endpoint={connection.endpoint} initialRows={operation.initialRows} ops={ops} close={close} onConnected={finish} directory reference
      cancelLabel={operation.back ? '返回获取模型列表' : undefined}/>}
    {model && operation.type === 'model' && <ChannelModelEditor key={model.key} model={model} connection={connection} ops={ops} close={close} reference/>}
    {connection && operation.type === 'test' && (!operation.modelKey || model) && <SupplierChannelBatchTest state={state} provider={connection.provider}
      endpointId={connection.id} associationIds={(model ? [model] : connection.models).map(row => row.association.id)}
      title={model ? '测试模型' : '批量测试'} ops={ops} close={close} testOnly directory reference/>}
    {connection && ['enable', 'disable'].includes(operation.type) && <ConnectionOperation connections={[connection]} action={operation.type}
      state={state} ops={ops} close={close} retest={(event, id) => open(event, 'test', id, null, operation)} reference/>}
    {connection && operation.type === 'remove' && (!operation.modelKey || model) && <ProviderRemovalDialog state={state} ops={ops} close={close} removed={close}
      title={model ? '删除模型渠道' : '删除连接'}
      target={{ providerId: connection.provider.id, endpointId: connection.id, ...(model ? { associationId: model.association.id, keepEndpoint: true } : {}) }}/>}
    {ops.error && <Notice error>{ops.error}</Notice>}{ops.leaveDialog}
  </div>;
}

export default function ChannelDirectory({ state, providers, ops, reference = false }) {
  const { params, go } = ops;
  const detailId = reference ? '' : params.get('connection') || '';
  const [operation, setOperation] = useState(null);
  const [expandedTags, setExpandedTags] = useState([]);
  const [selecting, setSelecting] = useState(false);
  const [selected, setSelected] = useState([]);
  const [refreshing, setRefreshing] = useState(false);
  const displayKey = workspaceStoragePrefix + 'channel-directory-display:' + (state.adminSession?.accountId || state.currentRole);
  const [display, setDisplay] = useState(() => displaySettings(displayKey));
  const [displayDraft, setDisplayDraft] = useState(null);
  const [moreFilters, setMoreFilters] = useState(() => ['channelModel', 'channelKeyGroup', 'channelService', 'channelTag'].some(key => params.has(key)));
  const toolbar = useRef(null);
  const trigger = useRef(null);
  const detailBody = useRef(null);
  const listPosition = useRef(null);
  useLayoutEffect(() => {
    if (detailId) {
      detailBody.current?.focus({ preventScroll: true });
      return;
    }
    if (!listPosition.current) return;
    const { top, left, linkKey } = listPosition.current;
    const frame = requestAnimationFrame(() => {
      window.scrollTo(0, top);
      const tableBody = document.querySelector('.channel-directory-table .semi-table-body');
      if (tableBody) tableBody.scrollLeft = left;
      const link = Array.from(document.querySelectorAll('[data-channel-detail-link]'))
        .find(element => element.dataset.channelDetailLink === linkKey);
      (link || toolbar.current?.querySelector('input'))?.focus({ preventScroll: true });
    });
    return () => cancelAnimationFrame(frame);
  }, [detailId]);
  const query = params.get('modelListQ') || '';
  const status = params.get('channelStatus') || '';
  const providerId = params.get('channelProvider') || '';
  const protocol = params.get('channelProtocol') || '';
  const modelId = params.get('channelModel') || '';
  const group = params.get('channelKeyGroup') || '';
  const serviceId = params.get('channelService') || '';
  const routeGroup = params.get('channelRouteGroup') || '';
  const tag = params.get('channelTag') || '';
  const tagView = params.get('channelView') === 'tags';
  const connections = connectionDirectoryRows(state, providers);
  const detail = detailId && connections.find(row => row.id === detailId);
  const services = routingServices(state).filter(service => serviceRoute(state, service.id));
  const routeService = services.find(service => service.id === serviceId);
  const routeRecord = routeService && serviceRoute(state, routeService.id);
  const routeConfig = activeRouteVersion(routeRecord)?.config || routeRecord?.draft;
  const memberships = new Map();
  if (routeConfig && routeService) {
    const byId = new Map(routingChannels(state, routeService).map(row => [row.id, row]));
    for (const row of routeConfig.channels) {
      const endpointId = byId.get(row.supplyId)?.endpointId;
      if (row.enabled === false || !endpointId || routeGroup && row.groupId !== routeGroup) continue;
      const members = memberships.get(endpointId) || [];
      const groupName = routeConfig.groups?.find(group => group.id === row.groupId)?.name || row.groupId;
      memberships.set(endpointId, [...members, { ...row, groupName }].sort((left, right) => (left.priority ?? Infinity) - (right.priority ?? Infinity)));
    }
  }
  const matches = filterConnections(connections, { query, status, providerId, protocol, modelId, group, tag })
    .filter(row => !routeService || memberships.has(row.id));
  if (display.sort === 'name' || routeGroup && ['priority', 'weight'].includes(display.sort)) {
    const direction = display.direction === 'desc' ? -1 : 1;
    matches.sort((left, right) => {
      if (display.sort === 'name') return direction * left.name.localeCompare(right.name, 'zh-CN');
      const a = memberships.get(left.id)?.[0]?.[display.sort], b = memberships.get(right.id)?.[0]?.[display.sort];
      if (a == null || b == null) return Number(a == null) - Number(b == null);
      return direction * (a - b);
    });
  }
  const tags = [...new Set(connections.flatMap(row => row.endpoint.directoryTags || []))].sort((left, right) => left.localeCompare(right, 'zh-CN'));
  const protocols = [...new Set(connections.map(row => row.interfaceLabel).filter(Boolean))];
  const models = [...new Map(connections.flatMap(row => row.models.map(model => [model.modelKey, model.modelName])))];
  const groups = providers.filter(row => !providerId || row.id === providerId)
    .flatMap(row => providerKeyGroups(row).map(group => [row.id + '/' + group.id, row.name + ' · ' + group.name]));
  const page = Math.min(Math.max(1, Number.parseInt(params.get('modelListPage'), 10) || 1), Math.ceil(matches.length / pageSize) || 1);
  const rows = matches.slice((page - 1) * pageSize, page * pageSize);
  const current = operation && connections.find(row => row.id === operation.connectionId);
  const model = current && current.models.find(row => row.key === operation.modelKey);
  const selectedRows = matches.filter(row => selected.includes(row.id));
  const operationRows = operation?.ids ? operation.ids.map(id => connections.find(row => row.id === id)).filter(Boolean) : current ? [current] : [];

  const update = patch => go(patch, { replace: true, preserveScroll: true });
  const filter = (key, value, extra) => {
    setSelected([]);
    update({ [key]: value === 'all' ? null : value, modelListPage: null, ...extra });
  };
  const resetFilters = () => {
    setSelected([]);
    update({ modelListQ: null, channelProvider: null, channelStatus: null, channelProtocol: null,
      channelModel: null, channelKeyGroup: null, channelService: null, channelRouteGroup: null, channelTag: null, modelListPage: null });
  };
  const changeView = view => {
    setSelecting(false);
    setSelected([]);
    update({ channelView: view === 'tags' ? 'tags' : null });
  };
  const viewConnection = (id, tab = null, event) => {
    listPosition.current = {
      top: window.scrollY,
      left: document.querySelector('.channel-directory-table .semi-table-body')?.scrollLeft || 0,
      linkKey: event?.currentTarget.dataset.channelDetailLink,
    };
    go({ connection: id, tab, modelQ: null });
  };
  const backToList = () => go({ connection: null, tab: null, modelQ: null }, { preserveScroll: true });
  const open = (event, type, connectionId, modelKey, { tab, back } = {}) => ops.proceed(() => {
    if (event && !back) trigger.current = event.currentTarget;
    ops.setError('');
    setOperation({ type, connectionId, modelKey, tab, back });
  });
  const openBulk = action => ops.proceed(() => {
    ops.setError('');
    setOperation({ type: 'bulk', action, ids: selectedRows.map(row => row.id) });
  });
  const openTagAction = (button, action, sourceTag, members) => ops.proceed(() => {
    trigger.current = button;
    ops.setError('');
    setOperation({ type: action === 'tagEdit' ? 'tagEdit' : 'bulk', action, sourceTag, ids: members.map(row => row.id) });
  });
  const openScope = (event, type, planned, scope = 'all') => ops.proceed(() => {
    if (event) trigger.current = event.currentTarget;
    ops.setError('');
    setOperation({ type, scope, ids: planned.map(row => row.id) });
  });
  const openOrder = (row, back) => ops.proceed(() => {
    ops.setError('');
    setOperation({ type: 'routeOrder', service: row.service, groupId: row.groupId, href: row.href, back });
  });
  const openDiscovered = (connectionId, initialRows, selection) => ops.proceed(() => {
    setOperation({ type: 'add', connectionId, initialRows, back: { ...operation, activeId: connectionId, selection } });
  });
  const closeOperation = back => {
    setOperation(back || null);
    ops.setError('');
    ops.dirty(false);
    if (back) return;
    requestAnimationFrame(() => (trigger.current?.isConnected ? trigger.current : detailBody.current || toolbar.current?.querySelector('input'))?.focus({ preventScroll: true }));
  };
  const close = () => closeOperation(operation?.back);
  const added = () => {
    const back = operation?.back;
    closeOperation(reference ? null : back);
    if (!reference && !back && !detailId) viewConnection(current.id, 'models');
  };
  const locate = (id, newTab = false) => {
    if (newTab) {
      const base = reference ? 'providers-reference' : 'providers-new';
      window.open('#/admin-2/' + base + '?' + new URLSearchParams({ connection: id }), '_blank', 'noopener');
      return;
    }
    close();
    viewConnection(id);
  };
  const saveDisplay = value => {
    try {
      localStorage.setItem(displayKey, JSON.stringify(value));
      setDisplay(value);
      setDisplayDraft(null);
    } catch { Toast.error('显示偏好保存失败，请重试'); }
  };
  const refresh = () => ops.proceed(async () => {
    setRefreshing(true);
    try { await ops.reload(); }
    catch (error) { Toast.error(error.message); }
    finally { setRefreshing(false); }
  });

  const columns = [
        { key: 'name', title: display.columns.includes('id') ? '渠道名称 / 连接 ID' : '渠道名称', width: 206, render: (_, row) => <div className="channel-identity">
            <Button size="small" theme="borderless" className="channel-name-link" data-channel-detail-link={row.id + ':overview'}
              aria-label={'查看渠道 ' + row.name} onClick={event => viewConnection(row.id, null, event)}>
              <Typography.Text strong ellipsis={{ showTooltip: true }}>{row.name}</Typography.Text>
            </Button>
            {display.columns.includes('id') && <CopyId copyAtStart ellipsis value={row.id} label="连接 ID"/>}
            {display.columns.includes('tags') && row.endpoint.directoryTags?.length > 0 && <Space wrap spacing={4}>{row.endpoint.directoryTags.map(value =>
              <Tag size="small" key={value}>{value}</Tag>)}</Space>}
        </div> },
        { key: 'provider', title: '服务商', width: 145, render: (_, { provider }) => <Typography.Text ellipsis={{ showTooltip: true }}>{provider.name}</Typography.Text> },
        { key: 'protocol', title: '协议', width: 134, render: (_, { interfaceLabel }) => <Typography.Text ellipsis={{ showTooltip: true }}>{interfaceLabel || '—'}</Typography.Text> },
        { key: 'address', title: '上游 API 地址', width: 212, render: (_, { endpoint }) => <CopyId copyAtStart ellipsis value={endpoint.baseUrl} label="上游 API 地址"/> },
        { key: 'models', title: '已接入模型', width: 98, render: (_, row) =>
          <Button size="small" theme="borderless" data-channel-detail-link={row.id + ':models'}
            aria-label={row.name + '的' + row.modelCount + '款模型'} onClick={event => viewConnection(row.id, 'models', event)}>{row.modelCount} 款</Button> },
        { key: 'status', title: '启停状态', width: 90, render: (_, row) => <AdminStatus value={row.status}/> },
        { key: 'test', title: '连接检测', width: 118, render: (_, row) => <Space wrap spacing={4}>
          <AdminStatus value={row.testStatus}/>
          {row.endpoint.candidateConfiguration && <Tag size="small" color="amber">变更待验证</Tag>}
        </Space> },
        { key: 'testTime', title: '最近测试', width: 158, render: (_, row) => row.endpoint.connectionTest?.testedAt ?
          new Date(row.endpoint.connectionTest.testedAt).toLocaleString('zh-CN', { timeZone: 'Asia/Shanghai' }) : '—' },
        { key: 'testDuration', title: '最近测试耗时', width: 118, render: (_, row) => Number.isFinite(row.endpoint.connectionTest?.durationMs) ?
          row.endpoint.connectionTest.durationMs + ' ms' : '—' },
        ...[['routeGroup', '可用分组', 'groupName'], ['priority', '优先级', 'priority'], ['weight', '权重', 'weight']].map(([key, title, property]) => ({
          key, title, width: 112,
          render: (_, row) => [...new Set((memberships.get(row.id) || []).map(item => item[property]).filter(value => value != null))].join(' / ') || '—',
        })),
        { key: 'balance', title: '模拟余额', width: 120, render: (_, row) => {
          const balance = row.endpoint.directoryBalance?.lastSuccess;
          return balance ? balance.amount + ' ' + balance.unit : '—';
        } },
        { key: 'instance', title: '上游实例状态', width: 125, render: (_, row) => {
          const kind = row.endpoint.networkSettings?.runtimeKind;
          return ['vllm', 'sglang'].includes(kind) ? row.endpoint.directorySpecialties?.[kind]?.status || '待查询' : '—';
        } },
        { key: 'actions', title: '操作', width: 190, fixed: 'right', render: (_, row) => <Space spacing={2}>
          <Button theme="borderless" size="small" aria-label={(ops.can ? '编辑连接 ' : '查看连接 ') + row.name}
            onClick={event => open(event, 'edit', row.id)}>{ops.can ? '编辑连接' : '查看连接'}</Button>
          {row.models.length > 0
            ? <Button theme="borderless" size="small" disabled={!ops.can} aria-label={'测试连接 ' + row.name}
                onClick={event => open(event, 'test', row.id)}>测试</Button>
            : <Button theme="borderless" size="small" disabled={!ops.can || Boolean(row.endpoint.candidateConfiguration) || Boolean(row.endpoint.adapterDraft)}
                aria-label={'接入模型 ' + row.name} onClick={event => open(event, 'add', row.id)}>接入模型</Button>}
          <Dropdown clickToHide trigger="click" position="bottomRight" render={<Dropdown.Menu>
            <Dropdown.Title>配置</Dropdown.Title>
            <Dropdown.Item onClick={() => open(null, 'edit', row.id, null, { tab: 'credentials' })}>密钥管理</Dropdown.Item>
            <Dropdown.Item onClick={() => open(null, 'edit', row.id, null, { tab: 'routing' })}>路由与映射</Dropdown.Item>
            <Dropdown.Item onClick={() => open(null, 'edit', row.id, null, { tab: 'history' })}>配置历史</Dropdown.Item>
            <Dropdown.Divider/>
            <Dropdown.Title>检测</Dropdown.Title>
            <Dropdown.Item onClick={() => open(null, 'discovery', row.id)}>检查上游模型更新</Dropdown.Item>
            <Dropdown.Item onClick={() => open(null, 'balance', row.id)}>查询余额</Dropdown.Item>
            {row.endpoint.networkSettings?.runtimeKind && <Dropdown.Item onClick={() => open(null, 'specialty', row.id)}>
              {row.endpoint.networkSettings.runtimeKind === 'ollama' ? '管理上游模型' : row.endpoint.networkSettings.runtimeKind === 'plugin' ? '任务插件授权与额度' : '上游实例状态'}
            </Dropdown.Item>}
            <Dropdown.Divider/>
            <Dropdown.Title>连接操作</Dropdown.Title>
            <Dropdown.Item disabled={!ops.can} onClick={() => open(null, ['运行中', '需关注'].includes(row.endpoint.status) ? 'disable' : 'enable', row.id)}>{['运行中', '需关注'].includes(row.endpoint.status) ? '停用连接' : '启用连接'}</Dropdown.Item>
            <Dropdown.Item disabled={!ops.can} onClick={() => open(null, 'tag', row.id)}>添加运维标签</Dropdown.Item>
            <Dropdown.Item disabled={!ops.can || Boolean(row.endpoint.adapterDraft)} onClick={() => open(null, 'copy', row.id)}>复制连接</Dropdown.Item>
            <Dropdown.Item disabled={!ops.can} onClick={() => open(null, 'remove', row.id)}>删除连接</Dropdown.Item>
          </Dropdown.Menu>}>
            <Button theme="borderless" size="small" icon={<IconMore/>} aria-label={'更多操作 ' + row.name}
              onClick={event => { trigger.current = event.currentTarget; }}/>
          </Dropdown>
        </Space> },
  ].filter(column => ['name', 'status', 'test', 'actions'].includes(column.key) || display.columns.includes(column.key));
  const extraFilterCount = [modelId, group, serviceId, routeGroup, tag].filter(Boolean).length;
  const filterCount = [query.trim(), status, providerId, protocol].filter(Boolean).length + extraFilterCount;
  const empty = <Empty description={filterCount ? '没有匹配的连接' : '暂无渠道连接'}/>;
  return <>
    {reference ? <ChannelManagementView state={state} connections={connections} ops={ops} open={open} focusTarget={toolbar}/>
      : detailId ? <section className="admin-page-stack channel-management-detail" ref={detailBody} tabIndex={-1} aria-label={detail?.name || '渠道详情'}>
        {detail ? <ChannelDetails channel={detail} ops={ops} open={open}
          modelList={<ConnectionModels connection={detail} ops={ops} open={open} trigger={trigger}/>}/>
          : <Card><Empty description="该渠道不存在或已删除"><Button onClick={backToList}>返回渠道列表</Button></Empty></Card>}
      </section> : <>
    <div className="channel-directory-toolbar" ref={toolbar}>
      <Space wrap spacing={12}>
        <RadioGroup type="button" value={tagView ? 'tags' : 'connections'} aria-label="渠道查看方式" onChange={event => changeView(event.target.value)}>
          <Radio value="connections">连接列表</Radio>
          <Radio value="tags">运维标签</Radio>
        </RadioGroup>
        <Typography.Text type="tertiary" size="small" aria-live="polite">
          {tagView ? `共 ${tags.length} 个运维标签` : `共 ${matches.length} 条连接`}
        </Typography.Text>
      </Space>
      <Space wrap spacing={8} role="group" aria-label="渠道全局操作">
        {!tagView && <Button theme="light" aria-pressed={selecting} disabled={!selecting && (!ops.can || !matches.length)}
          onClick={() => { setSelecting(!selecting); setSelected([]); }}>{selecting ? '退出批量操作' : '批量操作'}</Button>}
        <Dropdown clickToHide trigger="click" position="bottomRight" render={<Dropdown.Menu>
          <Dropdown.Title>全部连接</Dropdown.Title>
          <Dropdown.Item disabled={!ops.can || !connections.length} onClick={() => openScope(null, 'tests', connections)}>测试全部连接</Dropdown.Item>
          <Dropdown.Item disabled={!connections.length} onClick={() => openScope(null, 'discovery', connections)}>检查全部上游模型更新</Dropdown.Item>
          <Dropdown.Item disabled={!connections.length} onClick={() => openScope(null, 'balance', connections)}>查询全部余额</Dropdown.Item>
          <Dropdown.Divider/>
          <Dropdown.Title>数据维护</Dropdown.Title>
          <Dropdown.Item onClick={() => open(null, 'consistency')}>核对并修复一致性</Dropdown.Item>
          <Dropdown.Item disabled={!ops.can} onClick={() => openScope(null, 'cleanup', connections)}>清理已停用连接</Dropdown.Item>
        </Dropdown.Menu>}>
          <Button theme="light" icon={<IconChevronDown aria-hidden="true"/>} iconPosition="right" onClick={event => { trigger.current = event.currentTarget; }}>全局维护</Button>
        </Dropdown>
        <Button theme="solid" icon={<IconPlus aria-hidden="true"/>} disabled={!ops.can} onClick={event => open(event, 'create')}>创建连接</Button>
      </Space>
    </div>
    {!tagView && <div className="channel-directory-filters">
      <div className="channel-directory-filter-row">
        {display.filters ? <Space wrap spacing={8} role="group" aria-label="渠道筛选">
          <SearchBox placeholder="搜索连接、模型、服务商或脱敏凭证" value={query}
            onChange={value => { setSelected([]); update({ modelListQ: value || null, modelListPage: null }); }}/>
          <Choice label="服务商" value={providerId || 'all'} style={{ minWidth: 130 }}
            options={[[ 'all', '全部服务商' ], ...providers.map(row => [row.id, row.name])]}
            onChange={value => filter('channelProvider', value, { channelKeyGroup: null })}/>
          <Choice label="启停状态" value={status || 'all'} style={{ minWidth: 110 }}
            options={[[ 'all', '全部状态' ], ...CONNECTION_STATUSES.map(value => [value, value])]}
            onChange={value => filter('channelStatus', value)}/>
          <Choice label="协议" value={protocol || 'all'} style={{ minWidth: 120 }}
            options={[[ 'all', '全部协议' ], ...protocols.map(value => [value, value])]} onChange={value => filter('channelProtocol', value)}/>
          <Button theme="light" aria-expanded={moreFilters} aria-controls="channel-directory-extra-filters"
            icon={moreFilters ? <IconChevronDown aria-hidden="true"/> : <IconChevronRight aria-hidden="true"/>} onClick={() => setMoreFilters(!moreFilters)}>
            更多筛选{extraFilterCount ? `（${extraFilterCount}）` : ''}
          </Button>
          {filterCount > 0 && <Button theme="borderless" onClick={resetFilters}>重置筛选</Button>}
        </Space> : filterCount > 0 && <Space wrap spacing={8} role="group" aria-label="当前筛选">
          <Typography.Text type="tertiary">{filterCount} 个筛选条件已应用</Typography.Text>
          <Button theme="borderless" size="small" onClick={resetFilters}>重置筛选</Button>
        </Space>}
        <Space wrap spacing={8} className="channel-directory-view-tools" role="group" aria-label="列表显示与刷新">
          <Button theme="borderless" size="small" onClick={() => setDisplayDraft(display)}>显示设置</Button>
          {ops.reload && <Button theme="borderless" size="small" loading={refreshing} onClick={refresh}>刷新</Button>}
        </Space>
      </div>
      {display.filters && <div id="channel-directory-extra-filters" hidden={!moreFilters}>
        <Space wrap spacing={8} role="group" aria-label="更多筛选条件">
          <Choice label="模型" value={modelId || 'all'} style={{ minWidth: 110 }}
            options={[[ 'all', '全部模型' ], ...models]} onChange={value => filter('channelModel', value)}/>
          <Choice label="API 密钥组" value={group || 'all'} style={{ minWidth: 126 }}
            options={[[ 'all', '全部密钥组' ], ...groups]} onChange={value => filter('channelKeyGroup', value)}/>
          <Choice label="模型服务" value={serviceId || 'all'} style={{ minWidth: 136 }}
            options={[[ 'all', '全部模型服务' ], ...services.map(service => [service.id, service.callId + ' · ' + service.name])]}
            onChange={value => filter('channelService', value, { channelRouteGroup: null })}/>
          {routeService && <Choice label="路由分组" value={routeGroup || 'all'} style={{ minWidth: 120 }}
            options={[[ 'all', '全部路由分组' ], ...(routeConfig?.groups || []).map(row => [row.id, row.name])]}
            onChange={value => filter('channelRouteGroup', value)}/>}
          <Choice label="标签" value={tag || ''} style={{ minWidth: 104 }}
            options={[[ '', '全部标签' ], ...tags.map(value => [value, value])]} onChange={value => { setSelected([]); update({ channelTag: value || null, modelListPage: null }); }}/>
        </Space>
      </div>}
    </div>}
    {selecting && !tagView && <div className="channel-directory-selection" role="group" aria-label="所选连接操作">
      <Typography.Text aria-live="polite">{selectedRows.length ? `已选 ${selectedRows.length} 条连接` : '请选择要操作的连接'}</Typography.Text>
      {selectedRows.length > 0 && <Space wrap spacing={8}>
        <Button size="small" theme="light" disabled={!ops.can} onClick={event => openScope(event, 'tests', selectedRows, 'selected')}>测试所选连接</Button>
        <Button size="small" theme="light" disabled={!ops.can || selectedRows.length > 100}
          onClick={event => { trigger.current = event.currentTarget; openBulk('enable'); }}>启用</Button>
        <Button size="small" theme="light" disabled={!ops.can || selectedRows.length > 100}
          onClick={event => { trigger.current = event.currentTarget; openBulk('disable'); }}>停用</Button>
        <Dropdown clickToHide trigger="click" position="bottomRight" render={<Dropdown.Menu>
          {Object.entries(operationLabels).filter(([action]) => action !== 'enable' && action !== 'disable').map(([action, label]) =>
            <Dropdown.Item key={action} disabled={!ops.can || selectedRows.length > 100} onClick={() => openBulk(action)}>{label}</Dropdown.Item>)}
          <Dropdown.Divider/>
          <Dropdown.Item onClick={() => openScope(null, 'discovery', selectedRows, 'selected')}>检查所选上游模型更新</Dropdown.Item>
          <Dropdown.Item onClick={() => openScope(null, 'balance', selectedRows, 'selected')}>查询所选余额</Dropdown.Item>
          <Dropdown.Item type="danger" disabled={!ops.can || selectedRows.length > 100}
            onClick={() => openScope(null, 'archive', selectedRows, 'selected')}>删除所选连接</Dropdown.Item>
        </Dropdown.Menu>}>
          <Button theme="light" size="small" icon={<IconChevronDown aria-hidden="true"/>} iconPosition="right"
            onClick={event => { trigger.current = event.currentTarget; }}>所选更多操作</Button>
        </Dropdown>
        <Button size="small" theme="borderless" onClick={() => setSelected([])}>清空选择</Button>
      </Space>}
    </div>}
    {tagView ? <ChannelDirectoryTags connections={connections} state={state} can={ops.can} onAction={openTagAction}
      expanded={expandedTags} setExpanded={setExpandedTags} onView={viewConnection}/>
      : display.view === 'table' ? <Table aria-label="渠道连接总表" className="supplier-directory-table channel-directory-table"
      rowKey="id" size="small" pagination={false} dataSource={rows}
      scroll={{ x: 'max(100%, ' + (columns.reduce((width, column) => width + column.width, 0) + (selecting ? 44 : 0)) + 'px)' }}
      rowSelection={selecting ? { selectedRowKeys: selectedRows.map(row => row.id), onChange: setSelected, width: 44 } : undefined}
      empty={empty} columns={columns}/> : rows.length ? <div className="channel-connection-cards" aria-label="渠道连接卡片">
      {rows.map(row => <Card key={row.id}
        title={columns[0].render(null, row)} headerExtraContent={columns.at(-1).render(null, row)}>
        {selecting && <Checkbox aria-label={'选中连接 ' + row.name} checked={selected.includes(row.id)}
          onChange={event => setSelected(keys => event.target.checked ? [...keys, row.id] : keys.filter(key => key !== row.id))}/>}
        <dl className="channel-card-fields">{columns.slice(1, -1).map(column => <div key={column.key}><dt>{column.title}</dt><dd>{column.render(null, row)}</dd></div>)}</dl>
      </Card>)}
    </div> : empty}
    {displayDraft && <Modal title="显示设置" onClose={() => setDisplayDraft(null)}
      footer={<Space><Button onClick={() => setDisplayDraft(defaultDisplay)}>恢复默认</Button>
        <Button theme="solid" onClick={() => saveDisplay(displayDraft)}>应用</Button></Space>}>
      <Field label="列表视图"><RadioGroup aria-label="列表视图" direction="horizontal" value={displayDraft.view}
        onChange={event => setDisplayDraft({ ...displayDraft, view: event.target.value })}>
        <Radio value="table">表格视图</Radio><Radio value="card">卡片视图</Radio>
      </RadioGroup></Field>
      <Checkbox checked={displayDraft.filters} onChange={event => setDisplayDraft({ ...displayDraft, filters: event.target.checked })}>显示筛选栏</Checkbox>
      <Field label="可显示字段"><CheckboxGroup aria-label="可显示字段" direction="horizontal" value={displayDraft.columns}
        onChange={columns => setDisplayDraft({ ...displayDraft, columns })}
        options={configurableColumns.map(([value, label]) => ({ label, value }))}/></Field>
      <Field label="排序依据"><Choice label="排序依据" value={displayDraft.sort} options={sortOptions}
        onChange={sort => setDisplayDraft({ ...displayDraft, sort })}/></Field>
      <Field label="方向"><Choice label="排序方向" value={displayDraft.direction} options={[[ 'asc', '升序' ], [ 'desc', '降序' ]]}
        onChange={direction => setDisplayDraft({ ...displayDraft, direction })}/></Field>
      {['priority', 'weight'].includes(displayDraft.sort) && !routeGroup && <Notice>选择模型服务和路由分组后应用此排序。</Notice>}
    </Modal>}
    {!tagView && matches.length > pageSize && <AdminPagination pageSize={pageSize} currentPage={page} total={matches.length}
      onPageChange={modelListPage => update({ modelListPage })}/>}
    </>}
    {(operation?.type === 'create' || current && operation.type === 'copy') &&
      <ChannelDirectoryCreation state={state} providers={providers} connections={connections} source={current} ops={ops} close={close} locate={locate} reference={reference}/>}
    {current && operation.type === 'edit' &&
      <ChannelConnectionEditor key={current.id} connection={current} state={state} ops={ops} close={close} initialTab={operation.tab} reference={reference}
        modelActions={{
          add: event => open(event, 'add', current.id, null, { back: { ...operation, tab: 'connection' } }),
          edit: (event, key) => open(event, 'model', current.id, key, { back: { ...operation, tab: 'connection' } }),
        }}
        manageKeys={event => open(event, 'credentials', current.id, null, { back: { ...operation, tab: 'credentials' } })}
        routing={<ConnectionRouting state={state} connection={current}
          order={(_, row) => openOrder(row, { ...operation, tab: 'routing' })} embedded/>}/>}
    {current && operation.type === 'add' && <SupplierChannelConfiguration state={state} provider={current.provider}
      endpoint={current.endpoint} initialRows={operation.initialRows} ops={ops} close={close} onConnected={added} directory reference={reference}
      cancelLabel={operation.back?.type === 'edit' ? '返回连接配置' : operation.back?.type === 'discovery' ? reference ? '返回获取模型列表' : '返回上游模型更新' : undefined}/>}
    {current && operation.type === 'test' && <SupplierChannelBatchTest state={state} provider={current.provider}
      endpointId={current.id} associationIds={(model ? [model] : current.models).map(row => row.association.id)} ops={ops} close={close} testOnly directory reference={reference}
      title={model ? '测试模型' : reference ? '批量测试' : detailId && params.get('tab') === 'models' ? '批量测试模型' : '测试连接'}
      onRemove={id => { const target = current.models.find(row => row.association.id === id); if (target) open(null, 'remove', current.id, target.key); }}/>}
    {operation?.type === 'tests' && <ChannelDirectoryBatchTest state={state} connections={operationRows}
      title={operation.scope === 'selected' ? '测试所选连接' : '测试全部连接'} ops={ops} close={close}/>}
    {operation?.type === 'discovery' && <ChannelDirectoryDiscovery state={state} connections={operationRows} ops={ops} close={close}
      scope={operation.scope} initialConnectionId={operation.activeId} initialSelection={operation.selection} append={openDiscovered} reference={reference}/>}
    {operation?.type === 'balance' && <ChannelDirectoryBalance state={state} connections={operationRows} scope={operation.scope} ops={ops} close={close}/>}
    {operation?.type === 'tagEdit' && <ChannelDirectoryTagEdit tag={operation.sourceTag}
      members={connections.filter(row => row.endpoint.directoryTags?.includes(operation.sourceTag))} state={state} ops={ops} close={close}/>}
    {current?.endpoint.networkSettings?.runtimeKind && operation.type === 'specialty' &&
      <ChannelDirectorySpecialty state={state} connection={current} ops={ops} close={close} append={(_, id, rows) => openDiscovered(id, rows)}/>}
    {operation?.type === 'consistency' && <ChannelDirectoryConsistency state={state} ops={ops} close={close}/>}
    {['archive', 'cleanup'].includes(operation?.type) && <ChannelDirectoryArchive state={state} connections={operationRows}
      mode={operation.type === 'cleanup' ? 'disabled' : 'selected'} ops={ops} close={close} inspect={(event, id) => open(event, 'remove', id, null, { back: operation })}/>}
    {(operation?.type === 'bulk' && operationRows.length === operation.ids.length || current && Object.hasOwn(operationLabels, operation.type)) &&
      <ConnectionOperation connections={operationRows} action={operation.action || operation.type} initialTag={tag} sourceTag={operation.sourceTag}
        state={state} ops={ops} close={close} retest={(event, id) => open(event, 'test', id, null, { back: operation })}/>}
    {current && operation.type === 'credentials' && <ChannelKeyPoolEditor state={state} provider={current.provider}
      endpoint={current.endpoint} ops={ops} close={close} directory closeLabel="返回连接配置"/>}
    {current && operation.type === 'routing' && <ConnectionRouting state={state} connection={current}
      modelKey={operation.modelKey} order={(_, row) => openOrder(row, operation)} close={close}/>}
    {operation?.type === 'routeOrder' && <ChannelDirectoryRouteOrder state={state} service={operation.service} groupId={operation.groupId}
      href={operation.href} ops={ops} close={close}/>}
    {current && operation.type === 'remove' && (!operation.modelKey || model) && <ProviderRemovalDialog state={state} ops={ops} close={close} removed={close}
      title={model ? '删除模型渠道' : '删除连接'}
      target={{ providerId: current.provider.id, endpointId: current.id, ...(model ? { associationId: model.association.id, keepEndpoint: true } : {}) }}/>}
    {model && operation.type === 'modelLifecycle' && <SupplierChannelLifecycleDialog state={state} provider={current.provider}
      associationIds={[model.association.id]} action={model.association.enabled ? 'disable' : 'enable'} ops={ops} close={close} modelOnly/>}
    {model && operation.type === 'model' && <ChannelModelEditor key={model.key} model={model} connection={current} ops={ops} close={close}
      cancelLabel={operation.back ? '返回连接配置' : '取消'} reference={reference}/>}
    {model && operation.type === 'testHistory' && <Modal wide drawer title="模型渠道测试记录" description={model.modelName + ' · ' + current.name}
      onClose={close} footer={<Button onClick={close}>关闭</Button>}>
      <Table size="small" rowKey="rowKey" empty={<Empty description="暂无测试记录"/>}
        dataSource={(model.association.testHistory?.length ? [...model.association.testHistory].reverse() :
          model.association.health ? [model.association.health] : []).map((row, index) => ({ ...row, rowKey: row.id || String(index) }))}
        pagination={{ pageSize: 10, hideOnSinglePage: true }} columns={[
          { title: '测试时间（北京时间）', render: (_, row) => row.testedAt ? new Date(row.testedAt).toLocaleString('zh-CN', { timeZone: 'Asia/Shanghai' }) : '—' },
          { title: '结果', render: (_, row) => <AdminStatus value={row.result}/> },
          { title: '结果来源', render: (_, row) => row.simulated || row.source === 'mock' ? '模拟测试' : row.source === 'server-receipt' ? '服务端回执' : '未记录' },
          { title: '耗时', render: (_, row) => row.durationMs == null ? '—' : row.durationMs + ' ms' },
          { title: '上游状态', render: (_, row) => row.statusCode ?? '—' },
          { title: '说明', render: (_, row) => row.message || '—' },
        ]}/>
    </Modal>}
    {model && operation.type === 'capacity' && <ChannelCapacityEditor key={model.key} provider={current.provider}
      association={model.association} modelName={model.modelName} ops={ops} close={close}/>}
    {model && operation.type === 'cost' && <ProcurementVersionEditor directory key={model.key} state={state} provider={current.provider}
      association={model.association} modelName={model.modelName} ops={ops} close={close}/>}
    {operation && !['create', 'tests', 'cleanup', 'archive', 'consistency', 'discovery', 'balance', 'routeOrder', 'tagEdit'].includes(operation.type) && (operation.type === 'bulk' ? operationRows.length !== operation.ids.length : !current || operation.modelKey && !model) &&
      <Notice error>该连接或模型已变化，请重新选择。<Button onClick={() => ops.proceed(close)}>关闭</Button></Notice>}
  </>;
}
