import {useRef, useState} from 'react';
import {ArrowRight, Plus} from 'lucide-react';
import {Button} from '../components/ui/button';
import {Input} from '../components/ui/input';
import {Checkbox} from '../components/ui/checkbox';
import {Popover, PopoverContent, PopoverTrigger} from '../components/ui/popover';
import {Choice, Field} from './ModelMetadataForm';
import ModelFieldLabel from './ModelFieldLabel';
import {GridTable, Row, Cell, Status, CopyId, Notice, Modal, MoreActions} from './ModelOperationsUI';
import {MOMA_PROVIDER} from './moma-provider';
import {ROUTING_STRATEGIES, routingServices, routingChannels, serviceRoute, activeRouteVersion, lastRouteVersion, routeStopReason, routeSourceVersion, validateRouteConfig, routingStatus} from './service-routing';
import {changeRouteStrategy, routeStrategyChoices, routeEditConfig, sameRouteConfig, routeChangeRows} from './route-workspace';
import {routeEditorChannels, routeEditorPayload} from './service-route-editor';
import {operationsTransaction} from './model-operations';
import {mappingSourceVersion} from './service-model-mappings';
import ServiceModelMappings from './ServiceModelMappings';
import './service-routing.css';

const strategyName = id => id === 'fixed' ? '固定渠道' : ROUTING_STRATEGIES[id];
const enabledRows = config => config?.channels.filter(row => row.enabled) || [];

export function RouteWorkbench({state, model, ops, draftOnly = false, serviceId, onAddProvider, onRemoveProvider, onProviderState, onIdentity}) {
  const services = routingServices(state).filter(service => service.modelId === model.id && (!serviceId || service.id === serviceId));
  const [editor, setEditor] = useState(null), [maintenance, setMaintenance] = useState(null), [servicePicker, setServicePicker] = useState(false), trigger = useRef(null), routeTrigger = useRef(null);
  const blocked = !ops.can || Boolean(ops.conflict);
  const open = (event, service, channelId, returnTrigger) => ops.proceed(() => {
    trigger.current = returnTrigger || event.currentTarget;
    const box = trigger.current.getBoundingClientRect();
    setEditor({service, channelId, side: box.left + box.width / 2 < window.innerWidth / 2 ? 'right' : 'left'});
    ops.setError('');
  });
  const close = saved => {
    const finish = () => { setEditor(null); ops.dirty(false); ops.setError(''); requestAnimationFrame(() => trigger.current?.isConnected && trigger.current.focus()); };
    if (saved) finish(); else ops.proceed(finish);
  };
  return <div className="sr-workbench">
    <div className="sr-table-toolbar">{model.serviceMode === 'provider' && !draftOnly && <Button variant="outline" disabled={blocked} onClick={onAddProvider}><Plus/>关联供应商</Button>}{services.length===1?<Button className="sr-edit-route" variant="outline" disabled={blocked} onClick={event=>open(event,services[0])}>编辑路由</Button>:services.length>1 && <Popover open={servicePicker} onOpenChange={setServicePicker}><PopoverTrigger asChild><Button ref={routeTrigger} className="sr-edit-route" variant="outline" disabled={blocked}>编辑路由</Button></PopoverTrigger><PopoverContent className="sr-service-picker" align="end"><p>选择服务提供方</p>{services.map(service=><Button key={service.id} variant="ghost" onClick={event=>{setServicePicker(false);open(event,service,undefined,routeTrigger.current);}}>{service.name}</Button>)}</PopoverContent></Popover>}</div>
    <GridTable className={`sr-mapping-table sr-${model.serviceMode}-table`} headings={['服务提供方', <ModelFieldLabel key="call" tooltipClassName="sr-route-tooltip" name="对外调用标识" description="用户调用左侧的模型。平台将请求转发给右侧的上游模型。"/>, '路由策略', '上游渠道', <ModelFieldLabel key="upstream" tooltipClassName="sr-route-tooltip" name="上游模型标识"/>, '操作']} empty={!services.length} emptyMessage="先关联供应商，再配置模型映射与路由。">
      {services.flatMap(service => {
        const route = serviceRoute(state, service.id), current = activeRouteVersion(route), last = lastRouteVersion(route), config = (current || last)?.config, channels = routingChannels(state, service), status = routingStatus(state, service);
        const rows = enabledRows(config), displayed = rows.length ? rows : [null];
        const provider = service.providerId ? model.serviceProviders?.find(row => row.providerId === service.providerId) : null;
        const providerName = service.providerId ? service.name : state.providers.find(row => row.id === MOMA_PROVIDER.id)?.name || MOMA_PROVIDER.name;
        return displayed.map((row, index) => {
          const channel = row && channels.find(item => item.id === row.supplyId);
          return <Row key={`${service.id}:${row?.supplyId || 'empty'}`} className={index === 0 ? 'sr-group-start' : ''}>
            {index === 0 && <><Cell rowSpan={displayed.length}><div className="sr-provider-name"><strong>{providerName}</strong>{!service.providerId && <small>平台统一服务</small>}{provider?.marketVisible === false && <Status>已下架</Status>}{provider?.callsEnabled === false && <Status>已停服</Status>}</div></Cell>
              <Cell rowSpan={displayed.length}>{service.callId ? <CopyId value={service.callId} label="对外调用标识"/> : <Button variant="link" disabled={blocked} onClick={() => onIdentity?.(service.providerId)}>配置对外调用标识</Button>}</Cell>
              <Cell rowSpan={displayed.length}><div className="sr-table-strategy"><div><strong>{config ? strategyName(config.strategy) : '尚未配置'}</strong>{config?.strategy === 'weighted' && <small>合计 {rows.reduce((sum, item) => sum + Number(item.weight), 0)}%</small>}{!current && last && <small>已停用</small>}{current && !status.good && <small className="sr-error-text">需调整</small>}</div><ArrowRight aria-hidden="true"/></div></Cell></>}
            <Cell>{row ? <div className="sr-table-channel"><div>{service.mode === 'standard' && <strong>{channel?.provider?.name || '供应商缺失'}</strong>}<span>{channel?.channelName || '映射已失效'}</span>{channel && !channel.available && <small className="sr-error-text">{channel.reason}</small>}</div>{config.strategy === 'weighted' && <span className="sr-weight-badge">{row.weight}%</span>}</div> : <span className="sr-muted">待选择渠道</span>}</Cell>
            <Cell>{channel?.upstreamModelId ? <CopyId value={channel.upstreamModelId} label="上游模型标识"/> : <span className="sr-muted">—</span>}</Cell>
            <Cell><Button variant="link" disabled={blocked} aria-label={`编辑${service.name}${channel ? ' · ' + channel.channelName : ''}路由及映射`} onClick={event => open(event, service, channel?.id)}>编辑</Button></Cell>
          </Row>;
        });
      })}
    </GridTable>
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
  return <Modal drawer wide drawerSide={side} className="sr-editor" title="编辑路由及映射" description={`${service.model.name} · ${service.name}`} onClose={() => !busy && close()} footer={<><Button variant="outline" disabled={busy} onClick={() => review ? setReview(null) : close()}>{review ? '返回修改' : '取消'}</Button><Button disabled={blocked} onClick={review ? save : prepare}>{busy ? '保存中…' : review ? '确认保存并生效' : '核对并保存'}</Button></>}>
    {changed && <Notice error>模型或供应配置已变化，请关闭后载入最新配置，当前输入保留。</Notice>}
    <section className="sr-editor-identity"><div><small>对外调用标识</small><CopyId value={service.callId || '待配置'} label="对外调用标识"/></div><ArrowRight aria-hidden="true"/><div><small>转发到上游</small><strong>{selected.length} 条渠道</strong></div></section>
    {review ? <section className="sr-review"><h3>变更核对</h3><GridTable className="sr-diff-table" headings={['配置项', '当前生效', '保存后']} empty={false}>{routeChangeRows(current?.config, config, channels).map((row, index) => <Row key={index}><Cell>{row.label}</Cell><Cell>{row.before}</Cell><Cell>{row.after}</Cell></Row>)}{removeIds.map(id => <Row key={id}><Cell>解除备用映射</Cell><Cell>{channels.find(row => row.id === id)?.channelName}</Cell><Cell>解除关联，保留供应配置和历史</Cell></Row>)}</GridTable><h3>调用关系</h3><GridTable headings={['对外调用标识', '供应商 / 渠道', '上游模型标识']} empty={false}>{selected.map(row => {const channel = channels.find(item => item.id === row.supplyId); return <Row key={row.supplyId}><Cell>{service.callId}</Cell><Cell>{channel?.provider?.name} / {channel?.channelName}</Cell><Cell>{channel?.upstreamModelId}</Cell></Row>;})}</GridTable><p>保存后新请求使用本次路由。仅检查已有供给检测结果，不发送测试请求。{route?.draft ? '本次保存将替换已保存的路由草稿。' : ''}</p></section> : <>
      <div className="sr-editor-strategy"><Field label="路由策略"><Choice label="路由策略" value={config.strategy} options={[...routeStrategyChoices(service).map(id => [id, strategyName(id)]), ...(!routeStrategyChoices(service).includes(config.strategy) ? [[config.strategy, `${strategyName(config.strategy)}（已有配置）`]] : [])]} disabled={blocked} onChange={strategy => set(changeRouteStrategy(config, strategy))}/></Field>{config.strategy === 'weighted' && <p className={Math.round(selected.reduce((sum, row) => sum + Number(row.weight || 0), 0) * 100) === 10000 ? '' : 'sr-error-text'}>权重合计 {selected.reduce((sum, row) => sum + Number(row.weight || 0), 0)}%，必须为 100%</p>}{config.strategy === 'fixed' && <p>选择一条渠道承接调用。</p>}{config.strategy === 'latency' && <Field label="延迟统计窗口（秒）"><Input aria-label="延迟统计窗口（秒）" value={config.advanced.latencyWindowSeconds} disabled={blocked} onChange={event => set({...config, advanced: {...config.advanced, latencyWindowSeconds: event.target.value}})}/></Field>}</div>
      <div className="sr-editor-channel-heading"><h3>选择上游渠道</h3>{channels.length > 4 && <Input aria-label="搜索路由渠道" placeholder="搜索供应商 / 渠道 / 上游模型标识" value={query} onChange={event => setQuery(event.target.value)}/>}</div>
      <GridTable className="sr-editor-table" headings={['选择', '供应商 / 渠道', '上游模型标识', config.strategy === 'weighted' ? '权重' : '状态', '操作']} empty={!visible.length} emptyMessage="没有可选渠道，请先在模型接入中接入、检测并启用同一模型的渠道。">
        {visible.map(channel => {
          const row = config.channels.find(item => item.supplyId === channel.id), enabled = Boolean(row?.enabled);
          const available = channel.available || channel.selectable;
          return <Row key={channel.id} className={channel.id === focusChannel ? 'sr-focus-row' : ''}><Cell>{config.strategy === 'fixed' ? <input type="radio" name="route-target" aria-label={`选择 ${channel.provider?.name} ${channel.channelName}`} checked={enabled} disabled={blocked || !available && !enabled} onChange={() => pick(channel, true)}/> : <Checkbox aria-label={`参与路由 ${channel.provider?.name} ${channel.channelName}`} checked={enabled} disabled={blocked || !available && !enabled} onCheckedChange={value => pick(channel, value === true)}/>}</Cell><Cell><strong>{channel.provider?.name || '供应商缺失'}</strong><small>{channel.channelName}</small>{!available && <small className="sr-error-text">{channel.reason}</small>}</Cell><Cell><CopyId value={channel.upstreamModelId || '待配置'} label="上游模型标识"/></Cell><Cell>{config.strategy === 'weighted' ? <label className="sr-weight-input"><Input aria-label={`权重 ${channel.channelId}`} inputMode="decimal" disabled={blocked || !enabled} value={row?.weight ?? 0} onChange={event => set({...config, channels: config.channels.map(item => item.supplyId === channel.id ? {...item, weight: event.target.value} : item)})}/>%</label> : <span>{available ? enabled ? '已选择' : '可选择' : '需处理'}</span>}</Cell><Cell>{!channel.candidate && !enabled && <Button variant="link" disabled={blocked} onClick={() => {setRemoveIds([...removeIds, channel.id]); set({...config, channels: config.channels.filter(item => item.supplyId !== channel.id)});}}>解除映射</Button>}{!available && <Button variant="link" onClick={() => ops.go({perspective: 'suppliers', provider: channel.provider?.id, tab: 'catalogue', origin: location.hash}, {base: 'providers'})}>维护接入</Button>}</Cell></Row>;
        })}
      </GridTable>
      {missing.map(row => <Notice error key={row.supplyId}>映射引用已失效：{row.supplyId}<Button variant="link" disabled={blocked} onClick={() => set({...config, channels: config.channels.filter(item => item.supplyId !== row.supplyId)})}>移除失效引用</Button></Notice>)}
      {removeIds.length > 0 && <p>将解除 {removeIds.length} 个备用映射。<Button variant="link" disabled={blocked} onClick={() => {setRemoveIds([]); ops.dirty(true);}}>撤销解除</Button></p>}
      {dirty && <p className="sr-edit-hint">修改尚未生效，当前调用仍使用原配置。</p>}
      {!draftOnly && <div className="sr-route-lifecycle"><Status good={Boolean(current)}>{current ? '路由已生效' : last ? '路由已停用' : '尚未配置路由'}</Status>{(current || route?.draft) && <Button variant="outline" disabled={blocked || dirty} onClick={() => lifecycleCheck('serviceRouteStop')}>停用路由</Button>}{!current && last && <Button variant="outline" disabled={blocked || dirty} onClick={() => lifecycleCheck('serviceRouteRestore')}>恢复路由</Button>}</div>}
    </>}
    {!draftOnly && !review && <MoreActions label="服务维护" disabled={blocked || dirty}>
      {onIdentity && <Button variant="ghost" onClick={() => ops.proceed(() => {close(true);onIdentity(service.providerId);})}>编辑对外调用标识</Button>}
      <Button variant="ghost" onClick={onMaintenance}>维护备用映射</Button>
      {service.providerId && <><Button variant="ghost" onClick={() => ops.proceed(() => {close(true);onProviderState?.(service.providerId,'serviceProviderListing',provider?.marketVisible===false);})}>{provider?.marketVisible===false?'上架供应商':'下架供应商'}</Button><Button variant="ghost" onClick={() => ops.proceed(() => {close(true);onProviderState?.(service.providerId,'serviceProviderServing',provider?.callsEnabled===false);})}>{provider?.callsEnabled===false?'恢复此供应商服务':'停用此供应商服务'}</Button>{provider?.marketVisible===false && <Button variant="ghost" onClick={() => ops.proceed(() => {close(true);onRemoveProvider?.(service.providerId);})}>解绑</Button>}</>}
    </MoreActions>}
    {ops.error && <Notice error>{ops.error}</Notice>}
    {lifecycle && <Modal title={lifecycle === 'serviceRouteStop' ? '停用路由' : '恢复路由'} description={`${service.model.name} · ${service.name}`} onClose={() => !busy && setLifecycle(null)} footer={<><Button variant="outline" disabled={busy} onClick={() => setLifecycle(null)}>取消</Button><Button disabled={blocked} onClick={runLifecycle}>确认{lifecycle === 'serviceRouteStop' ? '停用' : '恢复'}</Button></>}><p>{lifecycle === 'serviceRouteStop' ? '停用当前服务路由并清空路由草稿，保留映射、供应配置和历史。' : '重新检查并恢复停用前配置，不自动恢复服务或上架。'}</p>{ops.error && <Notice error>{ops.error}</Notice>}</Modal>}
  </Modal>;
}
