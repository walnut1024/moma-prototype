import { serviceReferences, offerKey } from '../service-access.mjs';
import ModelResourceTransfer from './ModelResourceTransfer';
import { modelIdentity } from '../model-identities.mjs';
import AdminStatus from './AdminStatus';
import Table from './AdminTable';
import AdminActionMenu from './AdminActionMenu';
import { operationsReturn } from './model-pricing-workspace';
import { pendingGuidedOnboardings } from './guided-onboarding';
import ChannelServiceContext from './ChannelServiceContext';
import { useEffect, useRef, useState } from 'react';
import { Button, Card, Descriptions, Empty, Input, Space, Popover, Tooltip, Typography } from '@douyinfe/semi-ui';
import { IconSearch } from '@douyinfe/semi-icons';
import { Choice, CopyId, Notice, Modal } from './ServiceUI';
import ModelFieldLabel from './ModelFieldLabel';
import { displayTime, SERVICE_MODEL_TYPES } from './model-management';
import { SERVICE_MODES } from './model-operations';
import { serviceDisplayName, serviceIndexModels, selectServiceModel } from './service-workspace';
import { callStateLabel, modelServiceStarted, serviceDirectoryRows, serviceReferenceStarted } from './service-directory';
import { ServiceMappingsContent } from './ServiceContent';
import { ServiceIdentityDialog } from './ServiceConfigurationDialogs';
import { SERVICE_PANEL_LABELS, serviceDrawerTarget, serviceWorkspacePanel } from './service-workspace-panels';
import ServiceFailover from './ServiceFailover';
import { modelOperationHistory } from './model-operation-history';
import { AdminSideSheet } from './AdminOverlay';

function ModelStatusSummary({ state, model, ops }) {
  const task = pendingGuidedOnboardings(state).find(row => row.model?.id === model.id);
  return task ? <Notice>本模型有接入任务待完成。<Button theme="borderless" onClick={() => ops.go({ view:'onboarding', draft:task.draft.id, step:String(task.step), model:null, panel:null })}>继续接入</Button></Notice> : null;
}
export function ModelOperationRecords({ state, model }) {
  const [query, setQuery] = useState(''), [operation, setOperation] = useState('all'), [detail, setDetail] = useState(null);
  const all = modelOperationHistory(state, model);
  const records = all.filter(row => (operation === 'all' || row.action === operation) && [row.action, row.objectLabel, row.actorName, row.actor, row.reason].join(' ').toLowerCase().includes(query.trim().toLowerCase()));
  const value = row => Array.isArray(row) ? row.length ? row.map(item => typeof item === 'object' ? Object.entries(item).map(([key,v]) => key+'：'+v).join('，') : item).join('；') : '无' : typeof row === 'object' ? Object.entries(row || {}).map(([key,v]) => key+'：'+v).join('；') : String(row);
  const columns = [
    { title:'时间', dataIndex:'createdAt', width:180, render:displayTime },
    { title:'操作', dataIndex:'action', width:180 },
    { title:'操作对象', width:200, render:(_, row) => row.objectLabel || row.objectId },
    { title:'操作人', width:140, render:(_, row) => row.actorName || row.actor },
    { title:'结果', width:100, render:(_, row) => <AdminStatus value={row.result}/> },
    { title:'详情', width:110, fixed:'right', render:(_, row) => <Button theme="borderless" onClick={() => setDetail(row)}>查看详情</Button> },
  ];
  return <div className="ss-body"><div className="ss-filters"><Input prefix={<IconSearch aria-hidden="true"/>} aria-label="搜索操作记录" placeholder="搜索动作 / 对象 / 操作人" value={query} onChange={text => { setQuery(text); }}/><Choice label="操作类型" value={operation} options={[[ 'all','全部操作' ], ...[...new Set(all.map(row => row.action))].map(name => [name,name])]} onChange={name => { setOperation(name); }}/></div>
    <Table rowKey="id" columns={columns} dataSource={records} scroll={{x:910,y:480}} empty="没有匹配的操作记录。" pagination={false}/>
    {detail && <Modal wide drawer title="操作详情" description={detail.action+' · '+displayTime(detail.createdAt)} onClose={() => setDetail(null)}><Descriptions data={[{key:'操作对象',value:detail.objectLabel || detail.objectId},{key:'操作人',value:detail.actorName || detail.actor},{key:'结果',value:detail.result}]}/>{detail.reason && <Notice error>{detail.reason}</Notice>}<Table pagination={false} dataSource={detail.changes || []} rowKey="field" empty="此记录未保留字段变更摘要。" columns={[{title:'字段 / 对象',render:(_,row) => <div className="ss-field-stack">{row.field}<Typography.Text type="tertiary">{row.object}</Typography.Text></div>},{title:'修改前',dataIndex:'before',render:value},{title:'修改后',dataIndex:'after',render:value}]}/></Modal>}
  </div>;
}

const isModelPickerOption = model => model.id !== 'model-6280a6a9-e32d-4ac0-a2ec-001d330556d3';
const modelFilters = [
  {key:'type', label:'模型类型', options:[['all','全部类型'], ...Object.entries(SERVICE_MODEL_TYPES)]},
  {key:'mode', label:'服务模式', options:[['all','全部模式'], ...Object.entries(SERVICE_MODES).map(([key,item])=>[key,item.label]), ['unset','待配置']]},
  {key:'status', label:'服务状态', options:[['all','全部服务状态'], ['started','已启动'], ['stopped','已停止']]},
];
const callStatusFilter = value => ['started', 'stopped'].includes(value) ? value : 'all';

const serviceBatchSize = 20;

function serviceActions(model, { started, callId, providerKey, model_service_id }, ops, act) {
  const action = (name, kind, target = null, serviceId) => ({
    node:'item', name, disabled:!ops.can, onClick:button => act(model,kind,target,button,serviceId),
  });
  return [
    ...(model.archivedAt
      ? [action('恢复','serviceRestore')]
      : [
        ...(model.serviceMode !== 'provider' || providerKey && callId
          ? [action(started ? '停止服务' : '启动服务', started ? 'disableService' : 'enableService', providerKey)] : []),
        action('归档','serviceArchive',null,model_service_id),
      ]),
    action('删除','serviceDelete',providerKey,model_service_id),
  ];
}

export function ServiceModelList({ state, sourceState = state, ops, open, act }) {
  const { params, go } = ops;
  const query = params.get('q') || '', status = callStatusFilter(params.get('status'));
  const modelParams = new URLSearchParams(params);
  modelParams.delete('q'); modelParams.delete('status');
  const models = serviceIndexModels(state, modelParams).filter(isModelPickerOption);
  const needle = query.trim().toLowerCase();
  const allRows = serviceDirectoryRows(models, sourceState, status).filter(row => !needle ||
    [row.name, row.model_service_id, row.callId, row.canonical_slug, ...row.channels.flatMap(channel => [channel.providerName, channel.name, channel.id])].join(' ').toLowerCase().includes(needle));
  const requested = Number(params.get('shown'));
  const shown = Math.min(allRows.length, Math.max(serviceBatchSize, Number.isSafeInteger(requested) ? requested : 0));
  const rows = allRows.slice(0, shown), hasMore = shown < allRows.length, loadTarget = useRef(null);
  const update = patch => go(patch, { preserveScroll: true });
  const loadMore = () => update({ shown: Math.min(allRows.length, shown + serviceBatchSize) });
  useEffect(() => {
    if (!hasMore || !loadTarget.current || typeof IntersectionObserver === 'undefined') return;
    const observer = new IntersectionObserver(entries => { if (entries.some(entry => entry.isIntersecting)) loadMore(); }, { rootMargin: '240px' });
    observer.observe(loadTarget.current);
    return () => observer.disconnect();
  }, [hasMore, loadMore]);
  const hasFilters = Boolean(query || status !== 'all' || params.has('type') || params.has('mode'));
  const tasks = pendingGuidedOnboardings(state).filter(task => !task.model);
  const address = endpoint => new URL(endpoint.path, location.origin).href;
  const channelContent = channel => <div className="ss-service-channel" key={channel.key}>
    <span>{channel.providerName}（{channel.name}）</span>
    {channel.id ? <CopyId value={channel.id} label="渠道 ID" alignCopy ellipsis={{ showTooltip: true, pos: 'middle' }}/> : <Typography.Text type="tertiary">渠道 ID 未配置</Typography.Text>}
  </div>;
  const columns = [
    { title: '模型服务名称 / ID', width: 240, fixed: 'left', render: (_, row) => <div className="ss-service-identity">
      <Typography.Text strong>{row.name}</Typography.Text>
      {row.model_service_id ? <CopyId value={row.model_service_id} label="模型服务 ID" alignCopy ellipsis={{ showTooltip: true, pos: 'middle' }}/> : <Typography.Text type="tertiary">待配置</Typography.Text>}
    </div> },
    { title: <ModelFieldLabel name="模型调用标识"/>, width: 190, render: (_, row) => row.callId ? <CopyId value={row.callId} label="模型调用标识" alignCopy ellipsis={{ showTooltip: true, pos: 'middle' }}/> : '待配置' },
    { title: 'API 路径', width: 260, render: (_, row) => row.endpoints.length ? <div className="ss-field-stack">{row.endpoints.map(endpoint => <span key={endpoint.path}>{endpoint.method} <code>{endpoint.path}</code></span>)}</div> : '—' },
    { title: 'API 协议', width: 160, render: (_, row) => row.endpoints.length ? <div className="ss-field-stack">{row.endpoints.map(endpoint => <span key={endpoint.path}>{endpoint.protocol}</span>)}</div> : '—' },
    { title: '关联的渠道', width: 300, render: (_, row) => row.channels.length ? <div className="ss-field-stack">
      {channelContent(row.channels[0])}
      {row.channels.length > 1 && <Popover trigger="click" position="bottomLeft" content={<div className="ss-service-list-popover">{row.channels.map(channelContent)}</div>}>
        <Button theme="borderless" size="small" aria-label={`查看 ${row.model_service_id || row.name} 的全部关联渠道`}>+{row.channels.length - 1} 个渠道</Button>
      </Popover>}
    </div> : '—' },
    { title: '模型编码', width: 160, render: (_, row) => row.canonical_slug ? <CopyId value={row.canonical_slug} label="模型编码" alignCopy ellipsis={{ showTooltip: true, pos: 'middle' }}/> : '—' },
    { title: '模型服务状态', width: 115, render: (_, row) => <div><AdminStatus value={callStateLabel(row.started)}/>{row.stopReason && <Typography.Paragraph type="tertiary" size="small">{row.stopReason}</Typography.Paragraph>}</div> },
    { title: 'API 端点', width: 280, render: (_, row) => row.endpoints.length ? <div className="ss-field-stack">
      <CopyId value={address(row.endpoints[0])} label="API 端点" alignCopy ellipsis={{ showTooltip: true, pos: 'middle' }}/>
      {row.endpoints.length > 1 && <Popover trigger="click" position="bottomLeft" content={<div className="ss-service-list-popover">{row.endpoints.map(endpoint => <div className="ss-field-stack" key={endpoint.path}><span>{endpoint.protocol} · {endpoint.method} {endpoint.path}</span><CopyId value={address(endpoint)} label="API 端点" alignCopy/></div>)}</div>}>
        <Button theme="borderless" size="small" aria-label={`查看 ${row.model_service_id || row.name} 的全部 API 端点`}>+{row.endpoints.length - 1} 个端点</Button>
      </Popover>}
    </div> : '—' },
    { title: '操作', width: 296, fixed: 'right', render: (_, row) => {
      const failoverReason = row.channelId ? '当前服务固定绑定单一渠道，不支持故障转移。'
        : !row.model_service_id ? '请先在「路由及映射」中配置服务。' : '';
      return <Space spacing={4} className="ss-service-list-actions">
        <Button theme="borderless" size="small" onClick={event => open(row,'routing',event.currentTarget)}>路由及映射</Button>
        {failoverReason
          ? <Tooltip content={failoverReason}><span tabIndex={0} aria-label={`故障转移配置不可用：${failoverReason}`}><Button theme="borderless" size="small" disabled>故障转移配置</Button></span></Tooltip>
          : <Button theme="borderless" size="small" onClick={event => open(row,'failover',event.currentTarget)}>故障转移配置</Button>}
        <AdminActionMenu label={`更多：${row.callId || row.name}`} items={[
          {node:'item',name:'操作记录',onClick:button => open(row,'history',button)},
          ...serviceActions(row.model,row,ops,act),
        ]}>更多</AdminActionMenu>
      </Space>;
    } },
  ];
  const serviceCount = allRows.filter(row => row.model_service_id).length, pendingCount = allRows.length - serviceCount;
  return <section aria-label="模型服务列表">
    <Card><div className="ss-body">
      <div className="ss-filters">
        <Input prefix={<IconSearch aria-hidden="true"/>} showClear aria-label="搜索模型服务" placeholder="服务名称 / 服务 ID / 模型调用标识 / 模型编码 / 渠道"
          value={query} onChange={q => update({ q: q || null, shown: null })}/>
        {modelFilters.map(({ key, label, options }) => <Choice key={key} label={label} options={options} value={key === 'status' ? status : params.get(key) || 'all'} onChange={value => update({ [key]: value === 'all' ? null : value, shown: null })}/>)}
        {hasFilters && <Button theme="borderless" onClick={() => update({ q: null, type: null, mode: null, status: null, shown: null })}>重置筛选</Button>}
      </div>
      <Table className="ss-service-list-table" rowKey="id" columns={columns} dataSource={rows} scroll={{ x: 'max(100%, 2001px)' }} empty="没有符合条件的模型服务" pagination={false}/>
      <div ref={loadTarget} className="ss-section-bar">
        <Typography.Text type="tertiary" role="status">{hasMore ? `已显示 ${shown} / ${allRows.length} 项` : `共 ${serviceCount} 个模型服务${pendingCount ? ` · ${pendingCount} 项待配置` : ''}`}</Typography.Text>
        {hasMore && <Button size="small" theme="borderless" onClick={loadMore}>加载更多</Button>}
      </div>
      {tasks.length > 0 && <Space wrap><Typography.Text type="secondary">未建服务的接入任务</Typography.Text>{tasks.map(task => <Button key={task.draft.id} size="small" theme="borderless" onClick={() => go({ view: 'onboarding', draft: task.draft.id, step: String(task.step) })}>{task.master?.name || task.draft.rows[0]?.newModel?.name || '待选择模型'} · 继续任务</Button>)}</Space>}
    </div></Card>
  </section>;
}

function ServiceCallIdentity({ model, service, ops }) {
  const [editing, setEditing] = useState(false), trigger = useRef(null);
  const close = () => ops.proceed(() => {
    setEditing(false);
    ops.dirty(false);
    ops.setError('');
    requestAnimationFrame(() => { if (trigger.current?.isConnected) trigger.current.focus(); });
  });
  return <>
    <Space wrap spacing={4}>
      <CopyId value={service.callId} label="模型调用标识"/>
      {ops.can && !model.archivedAt && <Button theme="borderless" size="small" disabled={Boolean(ops.conflict)}
        aria-label={'编辑模型调用标识 ' + service.callId} onClick={event => {
          trigger.current = event.currentTarget;
          ops.proceed(() => { ops.setError(''); setEditing(true); });
        }}>编辑模型调用标识</Button>}
    </Space>
    {editing && <ServiceIdentityDialog model={model} providerId={service.providerId ? offerKey(service) : undefined}
      ops={{...ops, can:ops.can && !model.archivedAt}} close={close}/>}
  </>;
}

export default function ServiceManagementWorkspace({state,sourceState=state,ops,act,close}) {
  const {params,go} = ops;
  const selected = selectServiceModel(state.models, params.get('model'));
  const panel = serviceWorkspacePanel(params);
  const service = selected && serviceDrawerTarget(sourceState,selected,params);
  const missing = !selected || selected.deletedAt || !service && (params.has('serviceRecord') || params.has('routeProvider') || panel === 'failover');
  const started = selected && (service ? serviceReferenceStarted(selected,service) : modelServiceStarted(selected));
  const identities = !selected ? [] : service ? [service] : serviceReferences({...sourceState,models:[selected]});
  const configOps = { ...ops, can:ops.can && !selected?.archivedAt };
  const switchPanel = next => go({panel:next},{preserveScroll:true,replace:true});
  const title = [SERVICE_PANEL_LABELS[panel], selected && serviceDisplayName(selected), service?.callId].filter(Boolean).join(' · ');
  return <AdminSideSheet visible className="semi-services ss-service-sheet" title={title}
    width="min(1280px, 100vw)" closeOnEsc onCancel={event => {
      if (event?.key === 'Escape' && !event.target.closest?.('[role="dialog"]')?.closest('.ss-service-sheet')) return;
      close();
    }}>
    {missing ? <Empty className="ss-empty" title="未找到指定模型服务"/> : <section className="ss-service-panel">
      <ChannelServiceContext state={state} ops={ops}/>{params.has('returnOnboarding') && <Notice><Button theme="borderless" onClick={() => go({view:'onboarding',draft:params.get('returnOnboarding'),step:'2',panel:null,model:null,serviceRecord:null,routeProvider:null,returnOnboarding:null,providerAdd:null,providerEdit:null})}>返回接入任务</Button></Notice>}
      <div className="ss-heading">
        <AdminStatus value={callStateLabel(started)}/>
        <Space wrap>
          {panel === 'routing' && <ModelResourceTransfer state={sourceState} ops={ops} scope="services"/>}
          {operationsReturn(params.get('returnTo')) && <Button onClick={() => ops.proceed(() => {location.hash=params.get('returnTo');})}>返回来源页面</Button>}
          {selected.archivedAt && <AdminActionMenu label="服务操作" items={[
            {node:'item',name:panel === 'history' ? '路由及映射' : '操作记录',onClick:() => switchPanel(panel === 'history' ? 'routing' : 'history')},
            ...serviceActions(selected,{started,providerKey:offerKey(service),model_service_id:service?.model_service_id},ops,act),
          ]}>服务操作</AdminActionMenu>}
        </Space>
      </div>
      {panel === 'routing' && <>
        <div className="ss-identity-summary" aria-label="模型与服务标识">
          <div className="ss-identity-fields">
            <Descriptions align="left" data={[{key:'模型编码',value:<CopyId value={modelIdentity(state,selected).canonical_slug} label="模型编码"/>}]}/>
            <Descriptions align="left" data={[{key:'模型 ID',value:<CopyId value={modelIdentity(state,selected).id} label="模型 ID"/>}]}/>
          </div>
          {identities.map(service=><div className="ss-identity-fields" key={service.model_service_id}>
            <Descriptions align="left" data={[{key:'模型调用标识',value:service.callId ? <ServiceCallIdentity model={selected} service={service} ops={ops}/> : '待配置'}]}/>
            <Descriptions align="left" data={[{key:'模型服务 ID',value:<CopyId value={service.model_service_id} label="模型服务 ID"/>}]}/>
          </div>)}
        </div>
        <ModelStatusSummary state={state} model={selected} ops={ops}/>
        <ServiceMappingsContent key={selected.id} state={state} sourceState={sourceState} model={selected} ops={configOps} act={act} service={service}/>
      </>}
      {panel === 'failover' && <ServiceFailover state={state} service={{...service,mode:selected.serviceMode}} ops={configOps}
        openRouting={() => switchPanel('routing')}/>}
      {panel === 'history' && <ModelOperationRecords key={selected.id} state={state} model={selected}/>}
      {ops.conflict && <Notice error>其他页面的数据已变化，当前输入保留。<Button theme="borderless" onClick={ops.reload}>载入最新数据</Button></Notice>}
    </section>}
  </AdminSideSheet>;
}
