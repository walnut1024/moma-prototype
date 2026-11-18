import { offerKey, offerStage } from '../service-access.mjs';
import { callStateLabel, serviceReferenceStarted } from './service-directory';
import { IconPlus, IconSearch } from '@douyinfe/semi-icons';
import AdminStatus from './AdminStatus';
import Table from './AdminTable';
import AdminActionMenu from './AdminActionMenu';
import { ROUTING_POLICIES } from './routing-policy';
import {useLayoutEffect, useRef, useState} from 'react';
import { Button, Card, Collapse, Input, Space, Typography } from '@douyinfe/semi-ui';
import AdminCollapsePanel from './AdminCollapsePanel';
import {Choice, Field} from './ServiceUI';
import { FieldLabel as ModelFieldLabel } from './ServiceUI';
import { CopyId, Notice, Modal } from './ServiceUI';
import {ROUTING_STRATEGIES, serviceRoute, activeRouteVersion, lastRouteVersion, routeSourceVersion, routeGroupLabel, validateRouteConfig} from './service-routing';
import {routeTableGroups, changeRouteStrategy, routeStrategyChoices, routeEditConfig, sameRouteConfig, routeChangeRows, routeWeightShares, formatRouteShare} from './route-workspace';
import {routeEditorChannels, routeEditorPayload} from './service-route-editor';
import {operationsTransaction} from './model-operations';
import {forwardingTargets, mappingAddresses, mappingInterfaces, mappingPreview, mappingSourceVersion, mappingState, routeMappingAddresses} from './service-model-mappings';
import {forwardingChanges} from './service-route-forwarding';
import {RouteForwarding, RouteForwardingReview} from './ServiceRouteForwarding';
import {modelSupplies} from './model-management';
import {mappingOptions, MappingRowActions, MappingSummary, useServiceMappingActions} from './ServiceModelMappings';

const strategyName = id => id === 'fixed' ? '固定渠道' : ROUTING_STRATEGIES[id];
const enabledRows = config => config?.channels.filter(row => row.enabled && !row.backup) || [];
const weightedRow = data => data.config?.strategy === 'weighted' && data.row?.enabled && !data.row.backup;
const spannedCell = {children:null, props:{colSpan:0}};

export function RouteWorkbench({state, model, ops, draftOnly = false, serviceId, onAddProvider, onRemoveProvider, onProviderState, onIdentity}) {
  const [manualEditor,setEditor] = useState(null), [lifecycle,setLifecycle] = useState(null), [running,setRunning] = useState(false);
  const workbench = useRef(null), trigger = useRef(null);
  const supplies = new Map(modelSupplies(state,model.id).map(supply=>[supply.id,supply]));
  const withMappings = rows => rows.map(row=>{
    const supply = supplies.get(row.channel?.id);
    return {...row, supply, mapping:supply && mappingState(state,row.service,supply),
      addresses:supply ? routeMappingAddresses(row.service,row.channel,row.current?.config) : []};
  });
  const providerGroups = routeTableGroups(state,model,serviceId).map(group=>({...group,rows:withMappings(group.rows)}));
  const routeRows = providerGroups.flatMap(group=>group.rows);
  const serviceRows = routeRows.filter(row=>row.span>0);
  const services = serviceRows.map(row=>row.service);
  const mapping = useServiceMappingActions(state,services,ops,workbench);
  const explicit = model.serviceMode==='provider';
  const associationProvider = explicit && ops.params.get('providerChannels');
  const associatedService = associationProvider && services.find(service=>offerKey(service)===associationProvider);
  const editor = manualEditor || (associatedService ? {service:associatedService} : null);
  const inlineEditing = editor && !explicit;
  const blocked = !ops.can || Boolean(ops.conflict) || running || mapping.busy;
  const restoreFocus = () => requestAnimationFrame(()=>{
    const button = trigger.current;
    const fallback = workbench.current?.querySelector('[data-route-edit]:not(:disabled)') || workbench.current;
    (button?.isConnected && !button.disabled ? button : fallback)?.focus();
  });
  const open = (button, service, channelId) => ops.proceed(()=>{
    trigger.current = button;
    setEditor({service, channelId});
    ops.setError('');
  });
  const close = saved => {
    const finish = ()=>{
      setEditor(null);
      if (associationProvider) ops.go({providerChannels:null},{saved:true,preserveScroll:true});
      ops.dirty(false);
      ops.setError('');
      restoreFocus();
    };
    if (saved) finish(); else ops.proceed(finish);
  };
  const closeLifecycle = ()=>{
    setLifecycle(null);
    ops.setError('');
    restoreFocus();
  };
  const lifecycleOpen = (button, service) => ops.proceed(()=>{
    const route = serviceRoute(state,service.id);
    try {
      if (route?.draft) throw Error('请先处理路由草稿。');
      validateRouteConfig(state,service,lastRouteVersion(route)?.config);
    } catch (error) { ops.setError(error.message); return; }
    trigger.current = button;
    ops.setError('');
    setLifecycle({service,expectedVersion:route?.activeVersion || 0,sourceVersion:routeSourceVersion(state,service)});
  });
  const mappingEntry = service => {
    if (!service.callId || !mappingInterfaces(service.model).length) return null;
    const {available} = mappingOptions(state,service);
    if (available.length) return {node:'item',name:'新增映射',onClick:button=>mapping.open(button,service,undefined,'create')};
    return null;
  };
  const serviceActions = (data, addMapping) => {
    const {service,provider,current,last} = data;
    if (!ops.can) return [];
    const items = [];
    if (addMapping) items.push(addMapping);
    if (!draftOnly && !current && last) {
      items.push({node:'item',name:'恢复路由',onClick:button=>lifecycleOpen(button,service)});
    }
    const started = serviceReferenceStarted(model, service);
    if (service.providerId && service.callId && onProviderState) items.push({
      node:'item',name:started ? '停止服务' : '启动服务',
      onClick:button=>onProviderState(offerKey(service), !started, button),
    });
    if (service.providerId && onRemoveProvider && (service.channelId ? !['formal','gray'].includes(offerStage(model,provider)) : provider?.marketVisible===false)) {
      items.push({node:'item',name:'解绑',onClick:button=>onRemoveProvider(offerKey(service),button)});
    }
    return blocked ? items.map(item=>({...item,disabled:true})) : items;
  };
  const unified = !explicit && serviceRows[0];
  const addMapping = unified && mappingEntry(unified.service);
  const unifiedActions = unified ? serviceActions(unified) : [];
  const exposedInterfaces = unified && unified.service.callId ? [...new Set(routeRows
    .flatMap(({addresses})=>addresses.map(address=>address.label))
    .filter(Boolean))] : [];
  const renderTable = (rows, draft) => {
    const expanded = explicit && rows.findLast(row=>row.service.id===editor?.service.id);
    const weighted = !explicit && rows.some(data=>data.config?.strategy === 'weighted');
    const minWidth = draft ? (weighted ? 730 : 580) : (explicit ? 984 : weighted ? 1080 : 870);
    const upstreamAddressLabel = explicit ? '上游接口地址' : '上游请求地址';
    const externalInterface = {
      title:explicit ? '对外协议/接口路径' : '对外协议 / 接口路径', width:190,
      render:(_,data)=>data.group ? spannedCell : data.addresses.length ? <div className="ss-route-interface-lines">
        {data.addresses.map(({path,label})=><div key={path} className="ss-channel-name">
          {label && <Typography.Text strong>{label}</Typography.Text>}
          <Typography.Text size="small" type="secondary" ellipsis={{showTooltip:true}}>{'POST '+path}</Typography.Text>
        </div>)}
      </div> : '—',
    };
    return <Table className="ss-route-table"
      rowKey="id" pagination={false} scroll={{x:`max(100%, ${minWidth}px)`}}
      empty={model.serviceMode ? '添加渠道后配置模型映射与路由。' : '请先选择服务模式。'}
      dataSource={rows} onRow={draft?.focusChannel ? data=>({className:(data.channel?.id || data.row?.supplyId)===draft.focusChannel ? 'ss-focus-channel' : undefined}) : undefined}
      expandedRowKeys={expanded ? [expanded.id] : []} expandIcon={<span aria-hidden="true"/>} hideExpandedColumn
      expandedRowRender={expanded ? ()=><RouteEditor key={'route-editor:'+editor.service.id} state={state}
        service={editor.service} ops={ops} focusChannel={editor.channelId} close={close}/> : undefined}
      columns={[
      {title:explicit ? '渠道' : '路由渠道',width:explicit ? expanded ? 180 : 100 : 190,render:(_,data)=>data.group
        ? {children:draft ? draft.group(data.group) : <Space spacing={8}>
            <Typography.Text strong>{routeGroupLabel(data.group.order)}</Typography.Text>
            <Typography.Text type="secondary" size="small">{data.group.size} 条渠道</Typography.Text>
          </Space>,props:{colSpan:draft ? 5 : 7,className:'semi-table-row-cell ss-route-group-cell'}}
        : <RouteChannelCell data={data} explicit={explicit} editing={Boolean(draft)}/>},
      ...(explicit ? [
      {title:<ModelFieldLabel name="模型调用标识"/>,width:expanded ? undefined : 152,className:'ss-route-service-cell',render:(_,data)=>{
        const {service} = data;
        return {props:{rowSpan:data.span},children:<div className="ss-channel-name">
          {service.callId ? <CopyId value={service.callId} label="模型调用标识"/>
            : <Button size="small" theme="borderless" disabled={blocked || Boolean(draft)} onClick={event=>onIdentity?.(offerKey(service),event.currentTarget)}>配置模型调用标识</Button>}
          <AdminStatus value={callStateLabel(serviceReferenceStarted(model, service))}/>
        </div>};
      }},
      ...(!expanded ? [externalInterface] : []),
      {title:'路由策略',width:112,className:'ss-route-service-cell',render:(_,data)=>({
        props:{rowSpan:data.span},
        children:<div className="ss-channel-name">
          <Typography.Text>{strategyName(data.config?.strategy) || '尚未配置'}</Typography.Text>
          {!data.current && data.last && <AdminStatus value="已停用"/>}
          {ops.can && data.service.callId && <Button data-route-edit size="small" theme="borderless" disabled={blocked}
            aria-label={(editor?.service.id===data.service.id ? '收起配置 ' : '配置路由 ')+data.service.callId}
            aria-expanded={editor?.service.id===data.service.id}
            onClick={event=>editor?.service.id===data.service.id ? close() : open(event.currentTarget,data.service,data.channel?.id)}>
            {editor?.service.id===data.service.id ? '收起配置' : '配置路由'}</Button>}
        </div>,
      })}] : []),
      {title:<ModelFieldLabel name="上游模型调用标识"/>,
        width:draft ? undefined : 184,
        render:(_,data)=>data.group ? spannedCell : data.channel ? <Space wrap spacing={8}>
          {data.channel.upstreamModelId && <CopyId value={data.channel.upstreamModelId} label="上游模型调用标识"/>}
          {data.supply ? <MappingSummary supply={data.supply} status={data.mapping} compact={explicit}
            routed={Boolean(data.current?.config.channels.some(row=>row.enabled && row.supplyId===data.supply.id))}/>
            : <Typography.Text type="tertiary" size="small">待生效时建立映射</Typography.Text>}
        </Space> : '—',
      },
      ...(!draft && !expanded ? [
        ...(!explicit ? [externalInterface] : []),
        {title:upstreamAddressLabel,render:(_,data)=>data.group ? spannedCell : data.addresses.length ? <div className="ss-route-interface-lines">
          {data.addresses.map(({path,url})=>url ? <CopyId key={path} value={url} label={upstreamAddressLabel}
            alignCopy ellipsis={{showTooltip:true,pos:'middle'}}/> : <span key={path}>—</span>)}
        </div> : '—'},
      ] : []),
      ...(weighted ? [
        {title:'相对权重',width:110,align:'right',className:'ss-route-number',render:(_,data)=>data.group ? spannedCell : weightedRow(data) ? draft?.weight(data) ?? (data.row.weight ?? '—') : '—'},
        {title:'组内分流比例',width:114,align:'right',className:'ss-route-number',render:(_,data)=>data.group ? spannedCell : formatRouteShare(data.share)},
      ] : []),
      {title:'操作',width:132,fixed:'right',render:(_,data)=>{
        if (data.group) return spannedCell;
        if (draft) return draft.actions(data);
        const serviceItems = explicit && data.span && ops.can ? serviceActions(data,mappingEntry(data.service)) : [];
        if (!data.supply) {
          const configure = ops.can && !explicit && data.row;
          return configure || serviceItems.length ? <Space spacing={4}>
            {configure && <Button size="small" theme="borderless" disabled={blocked}
              onClick={event=>open(event.currentTarget,data.service,data.row?.supplyId)}>{data.row ? '修复路由' : '配置路由'}</Button>}
            {serviceItems.length>0 && <AdminActionMenu label={'更多操作 '+data.service.name} items={serviceItems} disabled={blocked}/>}
          </Space> : '—';
        }
        const canWrite = Boolean(ops.can && data.service.callId && mappingInterfaces(data.service.model).length);
        return <MappingRowActions supply={data.supply} service={data.service} status={data.mapping} actions={mapping}
          blocked={blocked} canWrite={canWrite} serviceItems={serviceItems}/>;
      }},
    ]}/>;
  };
  return <section ref={workbench} tabIndex={-1} className="ss-route-workbench" aria-label="渠道路由与映射">
    {unified && <div className="ss-route-section-heading">
      <Space wrap spacing={12}>
        <Space spacing={6}>
          <Typography.Text type="secondary">模型调用标识</Typography.Text>
          {unified.service.callId ? <CopyId value={unified.service.callId}/>
            : <Button size="small" theme="borderless" disabled={blocked || inlineEditing} onClick={()=>onIdentity?.(offerKey(unified.service))}>配置模型调用标识</Button>}
        </Space>
        {exposedInterfaces.length>0 && <Space spacing={6} wrap>
          <Typography.Text type="secondary">对外接口</Typography.Text>
          <Typography.Text>{exposedInterfaces.join('、')}</Typography.Text>
        </Space>}
      </Space>
    </div>}
    {!inlineEditing && <>
      {(unified || !draftOnly) && <div className="ss-route-section-heading"><Space wrap>
        {unified && <Button data-route-edit theme="solid" disabled={blocked} onClick={event=>open(event.currentTarget,unified.service)}>编辑路由</Button>}
        {!draftOnly && explicit && onAddProvider && <Button theme="light" disabled={blocked} icon={<IconPlus aria-hidden="true"/>}
          onClick={event=>onAddProvider(event.currentTarget)}>选择已有渠道</Button>}
        {ops.can && addMapping && <Button theme="light" disabled={blocked} icon={<IconPlus aria-hidden="true"/>}
          onClick={event=>addMapping.onClick(event.currentTarget)}>{addMapping.name}</Button>}
        {unifiedActions.length>0 && <AdminActionMenu label="更多路由操作" items={unifiedActions} disabled={running || mapping.busy}/>}
      </Space>
        {unified && <Space wrap>
          <Typography.Text type="secondary">路由策略</Typography.Text>
          <Typography.Text>{unified.config ? strategyName(unified.config.strategy) : '尚未配置'}</Typography.Text>
          {!unified.current && unified.last && <AdminStatus value="已停用"/>}
          {unified.current && !unified.status.good && <AdminStatus value="需调整"/>}
        </Space>}
      </div>}
      {explicit && providerGroups.length ? providerGroups.map(({providerId,providerName,rows})=>
        <Card key={providerId} className="ss-route-provider-card" headerLine title={
          <Typography.Title heading={6} component="h3" className="ss-route-provider-title">服务商：{providerName}</Typography.Title>
        }>
          {renderTable(rows)}
        </Card>
      ) : renderTable(routeRows)}
    </>}
    {ops.error && !editor && !mapping.active && !lifecycle && <Notice error>{ops.error}</Notice>}
    {lifecycle && <Modal title="恢复路由"
      description={model.name+' · '+lifecycle.service.name} onClose={()=>!running && closeLifecycle()} footer={<>
        <Button disabled={running} onClick={closeLifecycle}>取消</Button>
        <Button theme="solid" loading={running} disabled={blocked} onClick={async()=>{
          setRunning(true);
          try {
            if (await ops.run('serviceRouteRestore',{
              serviceId:lifecycle.service.id,expectedVersion:lifecycle.expectedVersion,sourceVersion:lifecycle.sourceVersion,confirmed:true,
            },model.id)) closeLifecycle();
          } finally { setRunning(false); }
        }}>确认恢复</Button>
      </>}>
      <Typography.Paragraph>恢复停用前的路由配置，重新检查渠道。</Typography.Paragraph>
      {ops.error && <Notice error>{ops.error}</Notice>}
    </Modal>}
    {inlineEditing && <RouteEditor key={'route-editor:'+editor.service.id} state={state} service={editor.service}
      ops={ops} focusChannel={editor.channelId} close={close} renderTable={draft=>
        renderTable(withMappings(routeTableGroups(state,model,serviceId,draft).flatMap(group=>group.rows)),draft)}/>}
    {mapping.overlay}
  </section>;
}

function RouteChannelCell({data,explicit,editing}) {
  const {channel,row,current,last,config,mapping} = data;
  if (!channel) return <Typography.Text type={row ? 'danger' : 'tertiary'}>{row ? '映射已失效' : '待选择渠道'}</Typography.Text>;
  const status = !row ? '未参与路由' : !editing && !current && last ? '上次路由' : row.backup ? '故障备用'
    : explicit ? '主渠道' : config.strategy==='weighted' ? null : editing ? '参与路由' : '当前使用';
  return <div className="ss-channel-name">
    <Typography.Text>{explicit ? (channel.channelName || '渠道缺失') :
      [channel.provider?.name || '服务商缺失',channel.channelName || '渠道缺失'].join(' · ')}</Typography.Text>
    {!channel.available && channel.reason!==mapping?.issue && <Typography.Text type="danger" size="small">{channel.reason}</Typography.Text>}
    {status && <Typography.Text type="secondary" size="small">{status}</Typography.Text>}
  </div>;
}

function RouteEditor({state, service, ops, focusChannel, close, renderTable}) {
  const explicit = service.mode === 'provider';
  const inline = Boolean(renderTable);
  const route = serviceRoute(state, service.id), current = activeRouteVersion(route);
  const [config, setConfig] = useState(() => routeEditConfig(service, route));
  const [baseline] = useState(() => routeEditConfig(service, route));
  const [expectedVersion] = useState(route?.activeVersion || 0), [sourceVersion] = useState(() => routeSourceVersion(state, service)), [mappingSource] = useState(() => mappingSourceVersion(state, service));
  const [query, setQuery] = useState(''), [removeIds, setRemoveIds] = useState([]), [review, setReview] = useState(null), [busy, setBusy] = useState(false);
  const [forwardDraft, setForwardDraft] = useState(null);
  const editToolbar = useRef(null), reviewHeading = useRef(null), focusGroup = useRef(null);
  const channels = routeEditorChannels(state, service), selected = enabledRows(config);
  const weighted = !explicit && config.strategy === 'weighted';
  const groupLabels = new Map(config.groups.map((group,index)=>[group.id, routeGroupLabel(index+1)]));
  const shares = routeWeightShares(config);
  const strategy = ROUTING_POLICIES[config.strategy];
  const strategyOptions = routeStrategyChoices(service).map(id => {
    const policy = ROUTING_POLICIES[id];
    return [id, policy ? `${policy.label}（${policy.code}）` : strategyName(id)];
  });
  const changed = sourceVersion !== routeSourceVersion(state, service) || mappingSource !== mappingSourceVersion(state, service) || expectedVersion !== (route?.activeVersion || 0);
  const blocked = !ops.can || Boolean(ops.conflict) || busy || changed;
  const primary = explicit ? channels.find(channel=>channel.id===selected[0]?.supplyId) : null;
  const preview = primary?.candidate && primary.available ? mappingPreview(state, service, primary.source) : null;
  const mappedPrimary = preview ? {...primary, url:preview.request.upstream.url, mapping:preview.check} : primary;
  const native = mappingAddresses(service, mappedPrimary);
  const resolved = forwardDraft?.targetPath ? {...config, forwarding:[
    ...(config.forwarding || []).filter(row => row.path !== forwardDraft.path),
    ...(!native.some(row => row.path === forwardDraft.path && row.forwarding === '原生转发' && forwardDraft.targetPath === row.path)
      ? [{path:forwardDraft.path, upstreamPath:forwardDraft.targetPath}] : []),
  ]} : config;
  const dirty = !sameRouteConfig(resolved, baseline) || removeIds.length > 0;
  const incomplete = Boolean(forwardDraft && !forwardDraft.targetPath);
  const set = (next, removals = removeIds, draft = forwardDraft) => {
    setConfig(next);
    setRemoveIds(removals);
    setForwardDraft(draft);
    setReview(null);
    ops.dirty(!sameRouteConfig(next, baseline) || removals.length > 0 ||
      Boolean(draft && (draft.adding || draft.direction !== draft.originalDirection || draft.targetPath !== draft.originalTarget)));
    ops.setError('');
  };
  const changeForwardDraft = draft => set(config, removeIds, draft);
  const openForwardDraft = draft => set(resolved, removeIds, {...draft, originalTarget:draft.targetPath, originalDirection:draft.direction});
  useLayoutEffect(() => {
    if (review) { reviewHeading.current?.focus(); return; }
    if (inline) {
      const row = editToolbar.current?.parentElement?.querySelector('.ss-focus-channel');
      const control = row?.querySelector('input:not(:disabled)') || row?.querySelector('button:not(:disabled)');
      (control || editToolbar.current)?.focus();
    } else editToolbar.current?.focus();
  }, [review, inline]);
  const addGroup = () => {
    const id = Array.from({length:10},(_,index)=>routeGroupLabel(index+1)).find(id=>!groupLabels.has(id));
    if (!id) return;
    focusGroup.current = id;
    set({...config, groups:[...config.groups,{id,name:id,strategy:'weighted'}]});
  };
  const removeGroup = id => {
    const groups = config.groups.filter(group=>group.id!==id);
    focusGroup.current = groups[Math.min(config.groups.findIndex(group=>group.id===id),groups.length-1)].id;
    set({...config,groups,channels:config.channels.map(row=>row.groupId===id ? {...row,groupId:groups[0].id} : row)});
  };
  const moveGroup = (index, offset) => {
    const groups = config.groups.slice();
    focusGroup.current = groups[index].id;
    [groups[index+offset],groups[index]] = [groups[index],groups[index+offset]];
    set({...config,groups});
  };
  const removeChannel = (id, removals) => set({...config,channels:config.channels.filter(row=>row.supplyId!==id)},removals);
  const pick = (channel, enabled, groupId = config.groups[0].id) => {
    const row = config.channels.find(item => item.supplyId === channel.id);
    if (!enabled && channel.candidate) removeChannel(channel.id);
    else if (explicit && enabled) {
      const fixed = changeRouteStrategy(config, 'fixed');
      const mapped = channel.candidate ? mappingPreview(state, service, channel.source) : null;
      const targets = forwardingTargets(service, mapped ? {...channel, url:mapped.request.upstream.url, mapping:mapped.check} : channel);
      set({...fixed, forwarding:config.forwarding?.filter(row=>targets.some(target=>target.path===row.upstreamPath)),
        channels: [{supplyId:channel.id, weight:0, groupId:'P1', enabled:true, priority:1}, ...config.channels.filter(item=>item.backup).map(item=>({...item, groupId:'P1'}))]});
    }
    else if (row) set({...config, channels: config.channels.map(item => item.supplyId === row.supplyId
      ? {...item, enabled, ...(weighted && enabled ? {groupId, weight:item.enabled || Number(item.weight) > 0 ? item.weight : 1} : {})}
      : item)});
    else set({...config, channels: [...config.channels, {supplyId:channel.id, enabled, groupId, weight:weighted ? 1 : 0, priority:config.channels.length + 1}]});
  };
  const prepare = () => {
    try {
      if (blocked) throw Error('配置或权限已变化，请关闭后载入最新配置；当前输入保留。');
      if (!routeStrategyChoices(service).includes(config.strategy)) throw Error(explicit ? '请选择一个主渠道。' : '请选择支持的路由策略。');
      if (!dirty && current && selected.every(row => channels.find(channel => channel.id === row.supplyId)?.available)) throw Error('配置未变化，无需保存。');
      const payload = {...routeEditorPayload(state, service, resolved, channels, removeIds), sourceVersion, mappingSource, expectedVersion};
      operationsTransaction(state, {operation: 'serviceRouteConfigure', modelId: service.modelId, data: payload});
      setReview(payload); ops.setError('');
    } catch (error) { ops.setError(error.message); }
  };
  const save = async () => {
    if (blocked) return;
    setBusy(true);
    try { if (await ops.run('serviceRouteConfigure', review, service.modelId)) close(true); }
    finally { setBusy(false); }
  };
  const channelLabel = channel => [channel.provider?.name,channel.channelName].filter(Boolean).join(' ');
  const changeChannel = (id, changes) => set({...config,channels:config.channels.map(row=>row.supplyId===id ? {...row,...changes} : row)});
  const available = channel => channel.available || channel.selectable;
  const channelActions = (channel, action) => <Space vertical align="start" spacing={4}>
    {action}
    {!available(channel) && <Button size="small" theme="borderless" disabled={busy}
      onClick={()=>ops.go({perspective:'suppliers',provider:channel.provider?.id,tab:'catalogue',origin:location.hash},{base:'providers'})}>维护接入</Button>}
  </Space>;
  const removeMapping = channel => <Button size="small" theme="borderless" disabled={blocked}
    onClick={()=>removeChannel(channel.id,[...removeIds,channel.id])}>解除映射</Button>;
  const actions = <Space>
    <Button theme="light" disabled={busy} onClick={()=>{
      if (review) { setReview(null); ops.setError(''); }
      else close();
    }}>{review ? '返回修改' : '取消'}</Button>
    <Button theme="solid" loading={busy} disabled={blocked || (!review && explicit && (incomplete || !primary || !dirty && current && primary.available))} onClick={review ? save : prepare}>
      {review ? '确认保存并生效' : explicit ? '预览并保存' : '核对配置'}
    </Button>
  </Space>;
  const status = <Typography.Text type="secondary" role="status">
    {review ? '请核对变更后确认生效' : dirty ? '有未保存的修改' : null}
  </Typography.Text>;
  const changedNotice = changed && <Notice error>模型或供应配置已变化，请关闭后载入最新配置，当前输入保留。</Notice>;
  const errorNotice = ops.error && <Notice error>{ops.error}</Notice>;
  const removedMappingNotice = removeIds.length > 0 && <Typography.Paragraph>
    将解除 {removeIds.length} 个备用映射。<Button theme="borderless" disabled={blocked}
      onClick={()=>set(config,[])}>撤销解除</Button>
  </Typography.Paragraph>;
  const reviewContent = review && <section className="ss-route-editor-section" aria-label="变更核对">
    <h3 className="ss-route-editor-review-title" tabIndex={-1} ref={reviewHeading}>变更核对</h3>
    <Table pagination={false} rowKey="id" scroll={{x:560}} empty="没有配置变更" columns={[
      {title:'配置项',dataIndex:'label'}, {title:'当前生效',dataIndex:'before'}, {title:'保存后',dataIndex:'after'},
    ]} dataSource={[
      ...routeChangeRows(current?.config,config,channels,explicit).map((row,index)=>({...row,id:index})),
      ...removeIds.map(id=>({id,label:'解除备用映射',before:channels.find(row=>row.id===id)?.channelName,after:'解除关联，保留供应配置和历史'})),
    ]}/>
    <Typography.Title heading={6}>调用关系</Typography.Title>
    <Table pagination={false} rowKey="id" scroll={{x:weighted ? 810 : 560}} empty="没有参与路由的渠道" columns={[
      {title:'模型调用标识',dataIndex:'callId'}, {title:'服务商 / 渠道',dataIndex:'channel'}, {title:'上游模型调用标识',dataIndex:'upstream'},
      ...(weighted ? [{title:'优先级组',dataIndex:'group',width:96}, {title:'相对权重',dataIndex:'weight',width:96},
        {title:'组内分流比例',dataIndex:'share',width:120}] : []),
    ]} dataSource={(weighted ? config.groups.flatMap(group=>selected.filter(row=>row.groupId===group.id)) : selected).map(row=>{
      const channel = channels.find(item=>item.id===row.supplyId);
      return {id:row.supplyId,callId:service.callId,channel:[channel?.provider?.name,channel?.channelName].filter(Boolean).join(' / '),
        upstream:channel?.upstreamModelId,group:groupLabels.get(row.groupId),
        weight:row.weight,share:formatRouteShare(shares.get(row.supplyId))};
    })}/>
    <Typography.Paragraph type="secondary">保存后新请求使用本次路由。仅检查已有供给检测结果，不发送测试请求。{route?.draft ? '本次保存将替换已保存的路由草稿。' : ''}</Typography.Paragraph>
  </section>;

  if (inline) {
    const visible = channels.filter(channel=>!removeIds.includes(channel.id));
    const assignments = new Map(config.channels.map(row=>[row.supplyId,row]));
    const channelPicker = (label, groupId) => {
      const choices = visible.filter(channel=>{
        const row = assignments.get(channel.id);
        return !row?.backup && (row?.enabled ? groupId && row.groupId!==groupId : available(channel));
      });
      return <Choice className="ss-route-add-choice" label={groupId ? `${groupLabels.get(groupId)} ${label}` : label} value={null} placeholder={label}
        size={groupId ? 'small' : undefined} filter searchPosition="dropdown" searchPlaceholder="搜索渠道"
        disabled={blocked || !choices.length} dropdownMatchSelectWidth={false}
        options={choices.map(channel=>{
          const row = assignments.get(channel.id);
          const origin = groupId && row?.enabled && groupLabels.get(row.groupId);
          return [channel.id,[channelLabel(channel),channel.upstreamModelId,origin && `来自 ${origin}`].filter(Boolean).join(' · ')];
        })}
        onChange={id=>{const channel = choices.find(item=>item.id===id); if (channel) pick(channel,true,groupId);}}/>;
    };
    const groupControl = ({id,order,size}) => {
      const label = routeGroupLabel(order);
      const emptyIssue = !size && ops.error;
      return <div className="ss-route-group-bar" data-route-group={id} tabIndex={-1} role="group" aria-label={'优先级组 '+label}
        ref={node=>{ if (node && focusGroup.current===id) { focusGroup.current = null; node.focus(); } }}>
        <Space spacing={8}>
          <Typography.Text strong>{label}</Typography.Text>
          <Typography.Text size="small" type={emptyIssue ? 'danger' : 'secondary'}>{size ? `${size} 条渠道` : emptyIssue ? '至少移入 1 条渠道' : '暂无渠道'}</Typography.Text>
        </Space>
        <Space spacing={4} wrap>
          {channelPicker('移入渠道',id)}
          <Button size="small" theme="borderless" type="tertiary" aria-label={label+' 上移'} disabled={blocked || order===1} onClick={()=>moveGroup(order-1,-1)}>上移</Button>
          <Button size="small" theme="borderless" type="tertiary" aria-label={label+' 下移'} disabled={blocked || order===config.groups.length} onClick={()=>moveGroup(order-1,1)}>下移</Button>
          {!size && config.groups.length>1 && <Button size="small" theme="borderless" type="danger" aria-label={label+' 删除空组'} disabled={blocked} onClick={()=>removeGroup(id)}>删除空组</Button>}
        </Space>
      </div>;
    };
    const strategyControl = <>
      <Choice label="路由策略" value={strategy ? config.strategy : undefined} placeholder="请选择策略"
        options={strategyOptions} renderSelectedItem={({value})=>strategyName(value)} disabled={blocked}
        dropdownMatchSelectWidth={false} onChange={id=>set(changeRouteStrategy(config,id))}/>
      {config.strategy==='latency' && <Field label="延迟统计窗口（秒）">
        <Input aria-label="延迟统计窗口（秒）" value={config.advanced.latencyWindowSeconds} disabled={blocked}
          onChange={value=>set({...config,advanced:{...config.advanced,latencyWindowSeconds:value}})}/>
      </Field>}
      {config.strategy==='cost' && <Field label="成本比较口径">
        <Choice label="成本比较口径" value={config.advanced.costBasis} options={[[ 'input','输入计费项'],['output','输出计费项'],['total','全部计费项合计']]}
          disabled={blocked} onChange={costBasis=>set({...config,advanced:{...config.advanced,costBasis}})}/>
      </Field>}
    </>;
    return <>
      <div className="ss-route-inline-toolbar" ref={editToolbar} tabIndex={-1}>
        {!review && <Space wrap>
          {weighted ? <Button theme="light" icon={<IconPlus aria-hidden="true"/>}
            disabled={blocked || config.groups.length>=10} onClick={addGroup}>添加优先级组</Button> : channelPicker('加入路由')}
          <Space className="ss-route-policy" wrap>
            <Typography.Text type="secondary">路由策略</Typography.Text>
            {strategyControl}
          </Space>
        </Space>}
        <Space wrap className="ss-route-inline-confirm">{status}{actions}</Space>
      </div>
      {changedNotice}
      {errorNotice}
      {!strategy && <Notice error>已有策略“{strategyName(config.strategy)}”不适用于当前模式，请重新选择。原路由历史保留。</Notice>}
      {reviewContent || renderTable({
        serviceId:service.id, config, channels:visible, focusChannel,
        group:groupControl,
        weight:({row,channel})=>channel && <Input className="ss-route-weight-input" aria-label={'相对权重 '+channelLabel(channel)}
          inputMode="decimal" disabled={blocked} value={row.weight} onChange={weight=>changeChannel(row.supplyId,{weight})}/>,
        actions:({channel,row})=>{
          if (!channel) return row && !row.backup ? <Button size="small" theme="borderless" disabled={blocked}
            onClick={()=>removeChannel(row.supplyId)}>移除失效引用</Button> : '—';
          if (row?.enabled && !row.backup) {
            const label = weighted ? '移出组' : '移出路由';
            return channelActions(channel,<Button size="small" theme="borderless" aria-label={label+' '+channelLabel(channel)}
              disabled={blocked} onClick={()=>pick(channel,false)}>{label}</Button>);
          }
          return channelActions(channel,!row && !channel.candidate && removeMapping(channel));
        },
      })}
      {!review && removedMappingNotice}
    </>;
  }

  const search = query.trim().toLowerCase();
  const visibleChannels = channels.filter(channel=>!removeIds.includes(channel.id));
  const choices = visibleChannels.filter(channel=>channel.id===primary?.id || available(channel) &&
    !config.channels.some(row=>row.supplyId===channel.id && row.backup));
  const addresses = routeMappingAddresses(service,mappedPrimary,resolved);
  const currentPrimary = channels.find(channel=>channel.id===enabledRows(current?.config)[0]?.supplyId);
  const interfaceChanges = forwardingChanges(routeMappingAddresses(service,currentPrimary,current?.config),addresses);
  const channelChanged = currentPrimary?.id !== primary?.id;
  const otherChannels = visibleChannels.filter(channel=>channel.id!==primary?.id || !available(channel));
  const channelRows = otherChannels.filter(channel=>
    [channelLabel(channel),channel.upstreamModelId].join(' ').toLowerCase().includes(search)).map(channel=>{
    const row = config.channels.find(item=>item.supplyId===channel.id);
    const enabled = Boolean(row?.enabled && !row.backup && config.strategy==='fixed');
    return {
      id:channel.id,
      channel:<div className="ss-channel-name">
        <Typography.Text strong>{channel.provider?.name || '服务商缺失'}</Typography.Text>
        <Typography.Text type="secondary" size="small">{channel.channelName}</Typography.Text>
        {!available(channel) && <Typography.Text type="danger" size="small">{channel.reason}</Typography.Text>}
      </div>,
      upstream:<CopyId value={channel.upstreamModelId || '待配置'} label="上游模型调用标识"/>,
      status:row?.backup ? '故障转移备用' : available(channel) ? enabled ? '已选择' : '可选择' : '需处理',
      actions:channelActions(channel,!channel.candidate && !row?.enabled && removeMapping(channel)),
    };
  });
  const missing = config.channels.filter(row=>!row.backup && !channels.some(channel=>channel.id===row.supplyId));
  const primaryControl = <div className="ss-route-primary-bar" ref={editToolbar} tabIndex={-1}>
      <Typography.Text type="secondary">主渠道</Typography.Text>
      {review ? <Typography.Text>{channelLabel(primary)}</Typography.Text>
        : <Choice className="ss-route-primary-choice" label="主渠道" placeholder="选择主渠道" value={primary?.id ?? null}
          options={choices.map(channel=>[channel.id,channel.channelName || channelLabel(channel)])}
          dropdownMatchSelectWidth={false} disabled={blocked || Boolean(forwardDraft) || !choices.length}
          onChange={id=>{const channel=choices.find(item=>item.id===id); if(channel) pick(channel,true);}}/>}
    </div>;
  return <section className="ss-route-inline-editor" aria-label={'路由配置 '+service.callId}>
    {review && primaryControl}
    {changedNotice}
    {review ? <section className="ss-route-editor-section" aria-label="变更核对">
      <h3 className="ss-route-editor-review-title" tabIndex={-1} ref={reviewHeading}>待保存变更</h3>
      {channelChanged && <Typography.Paragraph>主渠道：{currentPrimary ? channelLabel(currentPrimary) : '未配置'} → {channelLabel(primary)}</Typography.Paragraph>}
      <RouteForwardingReview rows={interfaceChanges}/>
      {!channelChanged && !interfaceChanges.length && <Typography.Text type="secondary">重新核验主渠道与现有映射。</Typography.Text>}
      {removedMappingNotice}
    </section> : <>
      <RouteForwarding controls={primaryControl} model={service.model} rows={addresses} changes={interfaceChanges} targets={forwardingTargets(service,mappedPrimary)}
        draft={forwardDraft} blocked={blocked || !primary} onEdit={openForwardDraft}
        removablePaths={(config.forwarding || []).filter(row=>!native.some(item=>item.path===row.path)).map(row=>row.path)}
        onRemove={path=>set({...config,forwarding:(config.forwarding || []).filter(row=>row.path!==path)})}
        onChange={changeForwardDraft} onCancel={()=>changeForwardDraft(null)} onDone={()=>set(resolved, removeIds, null)}/>
      {Boolean(otherChannels.length || missing.length || removeIds.length) && <Collapse motion={false} defaultActiveKey={primary?.available ? [] : ['channels']}>
        <AdminCollapsePanel itemKey="channels" header="其他渠道与映射">
          <div className="ss-route-editor-section">
            {otherChannels.length>4 && <Input prefix={<IconSearch aria-hidden="true"/>} aria-label="搜索路由渠道" placeholder="搜索服务商 / 渠道 / 上游模型调用标识"
              value={query} onChange={setQuery}/>}
            <Table pagination={false} rowKey="id" onRow={row=>({className:row.id===focusChannel ? 'ss-focus-channel' : undefined})}
              scroll={{x:'max(100%, 674px)'}}
              empty={search ? '没有匹配的上游渠道' : '没有可选渠道，请先在渠道管理中接入、检测并启用同一模型的渠道。'}
              columns={[
                {title:'服务商 / 渠道',dataIndex:'channel'},
                {title:'上游模型调用标识',dataIndex:'upstream'},
                {title:'状态',dataIndex:'status',width:104},
                {title:'操作',dataIndex:'actions',width:110},
              ]} dataSource={channelRows}/>
            {missing.map(row=><Notice error key={row.supplyId}>映射引用已失效：{row.supplyId}<Button theme="borderless"
              disabled={blocked} onClick={()=>removeChannel(row.supplyId)}>移除失效引用</Button></Notice>)}
            {removedMappingNotice}
          </div>
        </AdminCollapsePanel>
      </Collapse>}
    </>}
    <div className="ss-route-inline-footer">{errorNotice}<div className="ss-route-footer-bar">{status}{actions}</div></div>
  </section>;
}
