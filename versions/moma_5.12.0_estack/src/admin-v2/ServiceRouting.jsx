import {useRef, useState} from 'react';
import {ArrowRight, Plus} from 'lucide-react';
import { Button, Input, Checkbox, Radio, Table, Dropdown, Typography } from '@douyinfe/semi-ui';
import {Choice, Field} from './ServiceUI';
import { FieldLabel as ModelFieldLabel } from './ServiceUI';
import {Status, CopyId, Notice, Modal} from './ServiceUI';
import {ROUTING_STRATEGIES, serviceRoute, activeRouteVersion, lastRouteVersion, routeStopReason, routeSourceVersion, validateRouteConfig} from './service-routing';
import {routeTableRows, changeRouteStrategy, routeStrategyChoices, routeEditConfig, sameRouteConfig, routeChangeRows} from './route-workspace';
import {routeEditorChannels, routeEditorPayload} from './service-route-editor';
import {operationsTransaction} from './model-operations';
import {mappingSourceVersion} from './service-model-mappings';
import ServiceModelMappings from './ServiceModelMappings';

const strategyName = id => id === 'fixed' ? '固定渠道' : ROUTING_STRATEGIES[id];
const enabledRows = config => config?.channels.filter(row => row.enabled) || [];

export function RouteWorkbench({state, model, ops, draftOnly = false, serviceId, onAddProvider, onRemoveProvider, onProviderState, onIdentity}) {
  const [editor, setEditor] = useState(null), [maintenance, setMaintenance] = useState(null), trigger = useRef(null);
  const blocked = !ops.can || Boolean(ops.conflict);
  const open = (event, service, channelId) => {
    const returnTrigger = event.currentTarget;
    ops.proceed(() => {
      trigger.current = returnTrigger;
      const box = trigger.current.getBoundingClientRect();
      setEditor({service, channelId, side: box.left + box.width / 2 < window.innerWidth / 2 ? 'right' : 'left'});
      ops.setError('');
    });
  };
  const close = saved => {
    const finish = () => { setEditor(null); ops.dirty(false); ops.setError(''); requestAnimationFrame(() => trigger.current?.isConnected && trigger.current.focus()); };
    if (saved) finish(); else ops.proceed(finish);
  };
  return <div className="ss-route-workbench">
    {model.serviceMode === 'provider' && !draftOnly && <div className="ss-route-table-toolbar"><Button theme="light" disabled={blocked} onClick={onAddProvider}><Plus/>关联服务商</Button></div>}
    <Table rowKey="id" pagination={false} scroll={{x:900}} empty="先关联服务商，再配置模型映射与路由。" dataSource={routeTableRows(state,model,serviceId)} columns={[
      {title:'服务商',width:150,render:(_,data)=>({children:<div className="ss-channel-name"><Typography.Text strong>{data.providerName}</Typography.Text>{!data.service.providerId && <Typography.Text type="tertiary">平台统一服务</Typography.Text>}{data.provider?.marketVisible===false && <Status>已下架</Status>}{data.provider?.callsEnabled===false && <Status>已停服</Status>}</div>,props:{rowSpan:data.span}})},
      {title:<ModelFieldLabel name="对外调用标识" description="用户调用左侧的模型。平台将请求转发给右侧的上游模型。"/>,width:180,render:(_,data)=>({children:data.service.callId ? <CopyId value={data.service.callId} label="对外调用标识"/> : <Button theme="borderless" disabled={blocked} onClick={()=>onIdentity?.(data.service.providerId)}>配置对外调用标识</Button>,props:{rowSpan:data.span}})},
      {title:'路由策略',width:160,render:(_,data)=>({children:<Button theme="borderless" disabled={blocked} aria-label={`${data.service.name}：${data.config ? strategyName(data.config.strategy) : '尚未配置'}，编辑路由`} onClick={event=>open(event,data.service)}><span className="ss-field-stack"><strong>{data.config ? strategyName(data.config.strategy) : '尚未配置'}</strong>{data.config?.strategy==='weighted' && <Typography.Text type="tertiary">合计 {data.rows.reduce((sum,item)=>sum+Number(item.weight),0)}%</Typography.Text>}{!data.current && data.last && <Typography.Text type="tertiary">已停用</Typography.Text>}{data.current && !data.status.good && <Typography.Text type="danger">需调整</Typography.Text>}</span><ArrowRight aria-hidden="true"/></Button>,props:{rowSpan:data.span}})},
      {title:'上游渠道',width:160,render:(_,data)=>data.row ? <div className="ss-channel-name">{data.service.mode==='standard' && <Typography.Text strong>{data.channel?.provider?.name || '服务商缺失'}</Typography.Text>}<Typography.Text>{data.channel?.channelName || '映射已失效'}</Typography.Text>{data.channel && !data.channel.available && <Typography.Text type="danger">{data.channel.reason}</Typography.Text>}{data.config.strategy==='weighted' && <Status>{data.row.weight}%</Status>}</div> : <Typography.Text type="tertiary">待选择渠道</Typography.Text>},
      {title:<ModelFieldLabel name="上游模型标识"/>,width:160,render:(_,data)=>data.channel?.upstreamModelId ? <CopyId value={data.channel.upstreamModelId} label="上游模型标识"/> : '—'},
      {title:'操作',width:90,fixed:'right',render:(_,data)=><Button theme="borderless" disabled={blocked} aria-label={`编辑${data.service.name}${data.channel ? ' · '+data.channel.channelName : ''}渠道与路由`} onClick={event=>open(event,data.service,data.channel?.id)}>编辑</Button>},
    ]}/>

    {editor && <RouteEditor key={editor.service.id} state={state} service={editor.service} ops={ops} side={editor.side} focusChannel={editor.channelId} close={close} draftOnly={draftOnly} onIdentity={onIdentity} onRemoveProvider={onRemoveProvider} onProviderState={onProviderState} onMaintenance={() => ops.proceed(() => {close(true);setMaintenance(editor.service);})}/>}
    {maintenance && <Modal drawer wide drawerSide="left" title="备用映射维护" description={`${model.name} · ${maintenance.name}`} onClose={() => ops.proceed(() => setMaintenance(null))}><ServiceModelMappings state={state} service={maintenance} ops={ops} onRoute={() => ops.proceed(() => setMaintenance(null))}/></Modal>}
  </div>;
}

function RouteEditor({state, service, ops, side, focusChannel, close, draftOnly, onIdentity, onRemoveProvider, onProviderState, onMaintenance}) {
  const route = serviceRoute(state, service.id), current = activeRouteVersion(route), last = lastRouteVersion(route);
  const [config, setConfig] = useState(() => routeEditConfig(service, route));
  const [baseline] = useState(() => routeEditConfig(service, route));
  const [expectedVersion] = useState(route?.activeVersion || 0), [sourceVersion] = useState(() => routeSourceVersion(state, service)), [mappingSource] = useState(() => mappingSourceVersion(state, service));
  const [query, setQuery] = useState(''), [removeIds, setRemoveIds] = useState([]), [review, setReview] = useState(null), [busy, setBusy] = useState(false), [lifecycle, setLifecycle] = useState(null);
  const channels = routeEditorChannels(state, service), selected = enabledRows(config), provider = service.model.serviceProviders?.find(row => row.providerId === service.providerId);
  const changed = sourceVersion !== routeSourceVersion(state, service) || mappingSource !== mappingSourceVersion(state, service) || expectedVersion !== (route?.activeVersion || 0);
  const blocked = !ops.can || Boolean(ops.conflict) || busy || changed;
  const dirty = !sameRouteConfig(config, baseline) || removeIds.length > 0;
  const set = next => { setConfig(next); setReview(null); ops.dirty(true); ops.setError(''); };
  const pick = (channel, enabled) => {
    const row = config.channels.find(item => item.supplyId === channel.id);
    if (config.strategy === 'fixed' && enabled) set({...config, channels: [{...(row || {supplyId: channel.id, weight: 0, groupId: 'P1'}), enabled: true, priority: 1}]});
    else if (row) set({...config, channels: config.channels.map(item => item.supplyId === row.supplyId ? {...item, enabled} : item)});
    else set({...config, channels: [...config.channels, {supplyId: channel.id, enabled, groupId: 'P1', weight: 0, priority: config.channels.length + 1}]});
  };
  const prepare = () => {
    try {
      if (blocked) throw Error('配置或权限已变化，请关闭后载入最新配置；当前输入保留。');
      if (!routeStrategyChoices(service).includes(config.strategy)) throw Error('请选择支持的路由策略。');
      if (!dirty && current && selected.every(row => channels.find(channel => channel.id === row.supplyId)?.available)) throw Error('配置未变化，无需保存。');
      const payload = {...routeEditorPayload(state, service, config, channels, removeIds), sourceVersion, mappingSource, expectedVersion};
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
  const lifecycleCheck = operation => {
    try {
      if (dirty) throw Error('请先保存或取消本次修改。');
      if (operation === 'serviceRouteStop') { const issue = routeStopReason(service); if (issue) throw Error(issue); }
      else { if (route?.draft) throw Error('已有路由草稿，请核对后保存，避免覆盖草稿。'); validateRouteConfig(state, service, last.config); }
      setLifecycle(operation); ops.setError('');
    } catch (error) { ops.setError(error.message); }
  };
  const runLifecycle = async () => {
    if (blocked) return;
    setBusy(true);
    try { if (await ops.run(lifecycle, {serviceId: service.id, expectedVersion, sourceVersion, confirmed: true}, service.modelId)) close(true); }
    finally { setBusy(false); }
  };
  const visible = channels.filter(channel => !removeIds.includes(channel.id) && [channel.provider?.name, channel.channelName, channel.upstreamModelId].join(' ').toLowerCase().includes(query.trim().toLowerCase()));
  const missing = config.channels.filter(row => !channels.some(channel => channel.id === row.supplyId));
  return <Modal drawer wide drawerSide={side} className="ss-route-editor" title="编辑渠道与路由" description={`${service.model.name} · ${service.name}`} onClose={() => !busy && close()} footer={<><Button theme="light" disabled={busy} onClick={() => review ? setReview(null) : close()}>{review ? '返回修改' : '取消'}</Button><Button disabled={blocked} onClick={review ? save : prepare}>{busy ? '保存中…' : review ? '确认保存并生效' : '核对并保存'}</Button></>}>
    {changed && <Notice error>模型或供应配置已变化，请关闭后载入最新配置，当前输入保留。</Notice>}
    <section className="ss-route-editor-identity"><div><small>对外调用标识</small><CopyId value={service.callId || '待配置'} label="对外调用标识"/></div><ArrowRight aria-hidden="true"/><div><small>转发到上游</small><strong>{selected.length} 条渠道</strong></div></section>
    {review ? <section className="ss-route-review"><Typography.Title heading={6}>变更核对</Typography.Title><Table pagination={false} rowKey="id" scroll={{x:640}} empty="没有符合条件的记录" columns={['配置项', '当前生效', '保存后'].map((title,index)=>({title,render:(_,row)=>row['c'+index]}))} dataSource={[...routeChangeRows(current?.config, config, channels).map((row, index) => ({id:index,c0: <>{row.label}</>,c1: <>{row.before}</>,c2: <>{row.after}</>})),...removeIds.map(id => ({id:id,c0: <>解除备用映射</>,c1: <>{channels.find(row => row.id === id)?.channelName}</>,c2: <>解除关联，保留供应配置和历史</>}))]}/><Typography.Title heading={6}>调用关系</Typography.Title><Table pagination={false} rowKey="id" scroll={{x:640}} empty="没有符合条件的记录" columns={['对外调用标识', '服务商 / 渠道', '上游模型标识'].map((title,index)=>({title,render:(_,row)=>row['c'+index]}))} dataSource={selected.map(row => {const channel = channels.find(item => item.id === row.supplyId); return ({id:row.supplyId,c0: <>{service.callId}</>,c1: <>{channel?.provider?.name} / {channel?.channelName}</>,c2: <>{channel?.upstreamModelId}</>});})}/><Typography.Paragraph>保存后新请求使用本次路由。仅检查已有供给检测结果，不发送测试请求。{route?.draft ? '本次保存将替换已保存的路由草稿。' : ''}</Typography.Paragraph></section> : <>
      <div className="ss-route-editor-strategy"><Field label="路由策略"><Choice label="路由策略" value={config.strategy} options={[...routeStrategyChoices(service).map(id => [id, strategyName(id)]), ...(!routeStrategyChoices(service).includes(config.strategy) ? [[config.strategy, `${strategyName(config.strategy)}（已有配置）`]] : [])]} disabled={blocked} onChange={strategy => set(changeRouteStrategy(config, strategy))}/></Field>{config.strategy === 'weighted' && <Typography.Paragraph className={Math.round(selected.reduce((sum, row) => sum + Number(row.weight || 0), 0) * 100) === 10000 ? '' : 'ss-route-error-text'}>权重合计 {selected.reduce((sum, row) => sum + Number(row.weight || 0), 0)}%，必须为 100%</Typography.Paragraph>}{config.strategy === 'fixed' && <Typography.Paragraph>选择一条渠道承接调用。</Typography.Paragraph>}{config.strategy === 'latency' && <Field label="延迟统计窗口（秒）"><Input aria-label="延迟统计窗口（秒）" value={config.advanced.latencyWindowSeconds} disabled={blocked} onChange={(_value,event) => set({...config, advanced: {...config.advanced, latencyWindowSeconds: event.target.value}})}/></Field>}</div>
      <div className="ss-route-editor-channel-heading"><Typography.Title heading={6}>选择上游渠道</Typography.Title>{channels.length > 4 && <Input aria-label="搜索路由渠道" placeholder="搜索服务商 / 渠道 / 上游模型标识" value={query} onChange={(_value,event) => setQuery(event.target.value)}/>}</div>
      <Table pagination={false} rowKey="id" onRow={row=>({className:row.id===focusChannel?"ss-focus-channel":undefined})} scroll={{x:750}} empty="没有可选渠道，请先在渠道接入中接入、检测并启用同一模型的渠道。" columns={['选择', '服务商 / 渠道', '上游模型标识', config.strategy === 'weighted' ? '权重' : '状态', '操作'].map((title,index)=>({title,render:(_,row)=>row['c'+index]}))} dataSource={visible.map(channel => {
          const row = config.channels.find(item => item.supplyId === channel.id), enabled = Boolean(row?.enabled);
          const available = channel.available || channel.selectable;
          return ({id:channel.id,c0: <>{config.strategy === 'fixed' ? <Radio name="route-target" aria-label={`选择 ${channel.provider?.name} ${channel.channelName}`} checked={enabled} disabled={blocked || !available && !enabled} onChange={() => pick(channel, true)}/> : <Checkbox aria-label={`参与路由 ${channel.provider?.name} ${channel.channelName}`} checked={enabled} disabled={blocked || !available && !enabled} onChange={event => { const value=event.target.checked; return pick(channel, value === true)}}/>}</>,c1: <><strong>{channel.provider?.name || '服务商缺失'}</strong><small>{channel.channelName}</small>{!available && <small className="ss-route-error-text">{channel.reason}</small>}</>,c2: <><CopyId value={channel.upstreamModelId || '待配置'} label="上游模型标识"/></>,c3: <>{config.strategy === 'weighted' ? <label className="ss-route-weight-input"><Input aria-label={`权重 ${channel.channelId}`} inputMode="decimal" disabled={blocked || !enabled} value={row?.weight ?? 0} onChange={(_value,event) => set({...config, channels: config.channels.map(item => item.supplyId === channel.id ? {...item, weight: event.target.value} : item)})}/>%</label> : <span>{available ? enabled ? '已选择' : '可选择' : '需处理'}</span>}</>,c4: <>{!channel.candidate && !enabled && <Button theme="borderless" disabled={blocked} onClick={() => {setRemoveIds([...removeIds, channel.id]); set({...config, channels: config.channels.filter(item => item.supplyId !== channel.id)});}}>解除映射</Button>}{!available && <Button theme="borderless" onClick={() => ops.go({perspective: 'suppliers', provider: channel.provider?.id, tab: 'catalogue', origin: location.hash}, {base: 'providers'})}>维护接入</Button>}</>});
        })}/>
      {missing.map(row => <Notice error key={row.supplyId}>映射引用已失效：{row.supplyId}<Button theme="borderless" disabled={blocked} onClick={() => set({...config, channels: config.channels.filter(item => item.supplyId !== row.supplyId)})}>移除失效引用</Button></Notice>)}
      {removeIds.length > 0 && <Typography.Paragraph>将解除 {removeIds.length} 个备用映射。<Button theme="borderless" disabled={blocked} onClick={() => {setRemoveIds([]); ops.dirty(true);}}>撤销解除</Button></Typography.Paragraph>}
      {dirty && <Typography.Paragraph className="ss-route-edit-hint">修改尚未生效，当前调用仍使用原配置。</Typography.Paragraph>}
      {!draftOnly && <div className="ss-route-route-lifecycle"><Status good={Boolean(current)}>{current ? '路由已生效' : last ? '路由已停用' : '尚未配置路由'}</Status>{(current || route?.draft) && <Button theme="light" disabled={blocked || dirty} onClick={() => lifecycleCheck('serviceRouteStop')}>停用路由</Button>}{!current && last && <Button theme="light" disabled={blocked || dirty} onClick={() => lifecycleCheck('serviceRouteRestore')}>恢复路由</Button>}</div>}
    </>}
    {!draftOnly && !review && <Dropdown clickToHide trigger="click" position="bottomRight" className="semi-services" menu={[
      ...(onIdentity?[{node:'item',name:'编辑对外调用标识',onClick:()=>ops.proceed(()=>{close(true);onIdentity(service.providerId);})}]:[]),
      {node:'item',name:'维护备用映射',onClick:onMaintenance},
      ...(service.providerId?[{node:'item',name:provider?.callsEnabled===false?'恢复此服务商服务':'停用此服务商服务',onClick:()=>ops.proceed(()=>{close(true);onProviderState?.(service.providerId,'serviceProviderServing',provider?.callsEnabled===false);})},...(provider?.marketVisible===false?[{node:'item',name:'解绑',onClick:()=>ops.proceed(()=>{close(true);onRemoveProvider?.(service.providerId);})}]:[])]:[]),
    ]}><Button disabled={blocked || dirty}>服务维护</Button></Dropdown>}
    {ops.error && <Notice error>{ops.error}</Notice>}
    {lifecycle && <Modal title={lifecycle === 'serviceRouteStop' ? '停用路由' : '恢复路由'} description={`${service.model.name} · ${service.name}`} onClose={() => !busy && setLifecycle(null)} footer={<><Button theme="light" disabled={busy} onClick={() => setLifecycle(null)}>取消</Button><Button disabled={blocked} onClick={runLifecycle}>确认{lifecycle === 'serviceRouteStop' ? '停用' : '恢复'}</Button></>}><Typography.Paragraph>{lifecycle === 'serviceRouteStop' ? '停用当前服务路由并清空路由草稿，保留映射、供应配置和历史。' : '重新检查并恢复停用前配置，不自动恢复服务或上架。'}</Typography.Paragraph>{ops.error && <Notice error>{ops.error}</Notice>}</Modal>}
  </Modal>;
}
