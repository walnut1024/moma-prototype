import ModelFieldLabel from './ModelFieldLabel';
import {useState} from 'react';
import {ArrowRight, ChevronDown, Plus} from 'lucide-react';
import {Button} from '../components/ui/button';
import {Input} from '../components/ui/input';
import {Checkbox} from '../components/ui/checkbox';
import {Choice, Field} from './ModelMetadataForm';
import {GridTable, Row, Cell, Status, CopyId, Notice, Modal} from './ModelOperationsUI';
import {displayTime} from './model-management';
import {itemMoney} from './SupplyPriceEditor';
import {ROUTING_STRATEGIES, routingServices, routingChannels, serviceRoute, activeRouteVersion, lastRouteVersion, routeStopReason, routeSourceVersion, validateRouteConfig, routeGroups, routingStatus, comparableRouteCosts} from './service-routing';
import {platformRouteInterface} from './service-route-mapping';
import {changeRouteStrategy, routeStrategyChoices, routeEditConfig, sameRouteConfig, routeChangeRows} from './route-workspace';
import './service-routing.css';
import ServiceModelMappings from './ServiceModelMappings';

const strategyName = id => id==='fixed'?'固定渠道':ROUTING_STRATEGIES[id];
const describe = config => config ? `${strategyName(config.strategy)} · ${config.channels.filter(row=>row.enabled).length} 个参与渠道` : '尚未配置';

export function RouteWorkbench({state, model, ops, draftOnly=false, serviceId, onAddProvider, onRemoveProvider, onProviderState, onIdentity}) {
  const services = routingServices(state).filter(item=>item.modelId===model.id), [epoch,setEpoch] = useState(0), [editingId,setEditingId]=useState(null);
  const selected = services.find(item=>item.id===serviceId) || services.find(item=>item.providerId===(ops.params.get('routeProvider') || ops.params.get('providerChannels'))) || services[0];
  const reload = ()=>ops.proceed(()=>{ops.reload();setEpoch(value=>value+1);});
  const dialogKey = ['providerAssociate','identityProvider','providerAdd'].map(key=>ops.params.get(key)).join(':') + ':' + ops.params.get('panel');
  return <div className="sr-workbench">
    {model.serviceMode==='provider' && !draftOnly && <div className="sr-provider-toolbar"><span>{services.length} 个供应商服务</span><Button variant="outline" disabled={!ops.can} onClick={onAddProvider}><Plus/>关联供应商</Button></div>}
    {!selected ? <div className="sm-empty"><h2>尚未配置路由</h2><p>{model.serviceMode==='provider'?'先关联供应商，再选择该供应商的渠道。':'先选择服务模式，再新增模型映射。'}</p></div> : services.filter(service=>!serviceId || service.id===selected.id).map(service=>{
      const entry=model.serviceProviders?.find(row=>row.providerId===service.providerId), active = service.id===selected.id, current=activeRouteVersion(serviceRoute(state,service.id)), channels=routingChannels(state,service), status=routingStatus(state,service);
      return <section className={`sr-service${active?' is-editing':''}`} key={service.id} aria-label={`${service.name}路由`}>
        <div className="sr-service-heading"><h2>{service.name}</h2>{entry?.marketVisible===false && <Status>已下架</Status>}{entry?.callsEnabled===false && <Status>已停服</Status>}
          <div className="sr-heading-actions">{!draftOnly && service.providerId && <><Button variant="link" disabled={!ops.can || Boolean(ops.conflict) || ops.hasUnsaved?.()} onClick={()=>onProviderState?.(service.providerId,'serviceProviderListing',entry?.marketVisible===false)}>{entry?.marketVisible===false?'上架供应商':'下架供应商'}</Button><Button variant="link" disabled={!ops.can || Boolean(ops.conflict) || ops.hasUnsaved?.()} onClick={()=>onProviderState?.(service.providerId,'serviceProviderServing',entry?.callsEnabled===false)}>{entry?.callsEnabled===false?'恢复服务':'停服供应商'}</Button>{entry?.marketVisible===false && <Button variant="link" disabled={!ops.can || Boolean(ops.conflict) || ops.hasUnsaved?.()} onClick={()=>onRemoveProvider?.(service.providerId)}>解绑</Button>}{!active && <Button variant="outline" aria-label={`编辑${service.name}路由`} onClick={()=>ops.go({panel:'routing',routeProvider:service.providerId,providerChannels:service.providerId},{preserveScroll:true})}>展开<ChevronDown/></Button>}</>}</div>
        </div>
        {active && !draftOnly && <ServiceModelMappings state={state} service={service} ops={ops}/>}

        {active ? <RoutingConfiguration key={`${service.id}:${epoch}:${dialogKey}`} state={state} service={service} ops={ops} reload={reload} editing={editingId===service.id} onCloseEdit={()=>setEditingId(null)} onStartEdit={()=>ops.proceed(()=>setEditingId(service.id))} draftOnly={draftOnly} onIdentity={onIdentity}/> : <div className="sr-service-summary"><div><small>对外调用标识</small><code>{service.callId || '待配置'}</code></div><ArrowRight aria-hidden="true"/><div><small>路由策略</small><span>{describe(current?.config)}</span></div><ArrowRight aria-hidden="true"/><div><small>供应渠道</small><span>{channels.length} 个已关联 · {status.label}</span></div></div>}
      </section>;
    })}
  </div>;
}

function RoutingConfiguration({state, service, ops, reload, draftOnly, onIdentity, editing, onCloseEdit, onStartEdit}) {
  const route=serviceRoute(state,service.id), current=activeRouteVersion(route), last=lastRouteVersion(route), routeState=routingStatus(state,service), channels=routingChannels(state,service), platform=platformRouteInterface(service.model);
  const [config,setConfig]=useState(()=>routeEditConfig(service,route,channels)), [baseline,setBaseline]=useState(()=>routeEditConfig(service,route,channels)), [expectedVersion,setExpectedVersion]=useState(route?.activeVersion ?? 0), [dirty,setDirty]=useState(false);
  const [lifecycle,setLifecycle]=useState(null),[busy,setBusy]=useState(false);
  const [confirmation,setConfirmation]=useState(null), [query,setQuery]=useState(''), [detailId,setDetailId]=useState(null);
  const selected=config.channels.filter(row=>row.enabled), groups=routeGroups(config), changed=(route?.activeVersion || 0)!==expectedVersion, blocked=!ops.can || Boolean(ops.conflict) || busy || changed || !editing;
  const stale=config.channels.filter(row=>!channels.some(channel=>channel.id===row.supplyId));
  const set=next=>{setConfig(next);setDirty(true);ops.dirty(true);ops.setError('');};
  const update=(id,patch)=>set({...config,channels:config.channels.map(row=>row.supplyId===id?{...row,...patch}:row)});
  const reset=()=>ops.proceed(()=>{setConfig(structuredClone(baseline));setDirty(false);onCloseEdit();ops.dirty(false);ops.setError('');});
  const prepare=()=>{
    try {
      if(blocked || ops.conflict)throw Error('配置或权限已变化，请载入最新配置后核对；当前输入保留。');
      if (sameRouteConfig(config,current?.config)) { ops.setError('配置未变化，无需保存。'); return; }
      if (!routeStrategyChoices(service).includes(config.strategy)) throw Error('请选择当前支持的分流策略。');
      const proposed=validateRouteConfig(state,service,config);
      if(!service.callId)throw Error('请先配置对外调用标识。');
      setConfirmation({config:proposed,expectedVersion,sourceVersion:routeSourceVersion(state,service)});ops.setError('');
    }catch(error){ops.setError(error.message);}
  };
  const accept=next=>{
    const saved=serviceRoute(next,service.id),fresh=routingServices(next).find(row=>row.id===service.id),value=routeEditConfig(fresh,saved);
    setConfig(value);setBaseline(structuredClone(value));setExpectedVersion(saved.activeVersion);setDirty(false);onCloseEdit();ops.dirty(false);setConfirmation(null);setLifecycle(null);
  };
  const publish=async ()=>{if(blocked)return;setBusy(true);try{const next=await ops.run('serviceRoutePublish',{serviceId:service.id,...confirmation});if(next)accept(next);}finally{setBusy(false);}};
  const reviewLifecycle=operation=>{
    let issue=operation==='serviceRouteStop'?routeStopReason(service):route?.draft?'当前有已保存的路由草稿，请用“修改路由”核对后发布。':'';
    if(operation==='serviceRouteRestore' && !issue)try{validateRouteConfig(state,service,last.config);}catch(error){issue=error.message;}
    setLifecycle({operation,expectedVersion:route?.activeVersion || 0,sourceVersion:routeSourceVersion(state,service),issue});ops.setError('');
  };
  const runLifecycle=async()=>{if(busy)return;setBusy(true);try{const next=await ops.run(lifecycle.operation,{...lifecycle,serviceId:service.id,confirmed:true});if(next)accept(next);}finally{setBusy(false);}};
  const pick=(channel,enabled)=>{
    const old=config.channels.find(row=>row.supplyId===channel.id);
    if(config.strategy==='fixed' && enabled){set({...config,channels:[{...(old || {supplyId:channel.id,weight:0,groupId:groups[0].id}),enabled:true,priority:1}]});return;}
    if(old)update(channel.id,{enabled});
    else set({...config,channels:[...config.channels,{supplyId:channel.id,enabled,groupId:groups[0].id,weight:0,priority:config.channels.length+1}]});
  };
  const maintain=channel=>ops.go({provider:channel.provider.id,resource:channel.endpoint.id,tab:'channels',perspective:'suppliers',origin:location.hash},{base:'providers'});
  const options=routeStrategyChoices(service).map(id=>[id,strategyName(id)]);
  const choices=channels.filter(channel=>channel.available || selected.some(row=>row.supplyId===channel.id));
  const visible=channels.filter(channel=>(config.strategy!=='fixed' || selected.some(row=>row.supplyId===channel.id)) && [channel.channelName,channel.provider?.name,channel.channelId,channel.upstreamModelId].join(' ').toLowerCase().includes(query.trim().toLowerCase()));
  const differences=confirmation?routeChangeRows(current?.config,confirmation.config,channels):[];
  return <>
    <div className="sr-route-heading"><h3>路由配置 <Status good={Boolean(current) && routeState.good}>{current?routeState.good?'已生效':'需调整':last?'已停用':'尚未配置'}</Status></h3><div>{!editing && <Button variant="outline" disabled={!ops.can || Boolean(ops.conflict) || busy} onClick={onStartEdit}>{current?(current.config.strategy==='fixed'?'替换渠道':'编辑路由'):last?'修改路由':'配置路由'}</Button>}{!draftOnly && !editing && <>{(current || route?.draft) && <Button variant="outline" disabled={!ops.can || Boolean(ops.conflict) || busy || ops.hasUnsaved?.()} onClick={()=>reviewLifecycle('serviceRouteStop')}>停用路由</Button>}{!current && last && <Button variant="outline" disabled={!ops.can || Boolean(ops.conflict) || busy || ops.hasUnsaved?.()} onClick={()=>reviewLifecycle('serviceRouteRestore')}>恢复路由</Button>}</>}</div></div>
    {!current && last && <p className="sr-scope">以下为停用前配置，当前不接收请求。恢复路由后，仍需另行恢复服务或上架。</p>}
    <form id="service-route-config" noValidate onSubmit={event=>{event.preventDefault();prepare();}}>
      {(changed || ops.conflict) && <Notice error>配置已更新，当前输入保留。<Button type="button" variant="link" onClick={reload}>载入最新配置</Button></Notice>}
      {stale.length>0 && <Notice error>有 {stale.length} 条渠道引用已失效。<Button type="button" variant="link" disabled={blocked} onClick={()=>set({...config,channels:config.channels.filter(row=>!stale.some(item=>item.supplyId===row.supplyId))})}>移除失效引用</Button></Notice>}
      <div className="sr-flow">
        <section className="sr-call"><div className="sr-column-heading"><h3>对外调用</h3><ArrowRight aria-hidden="true"/></div><div className="sr-column-body">
          <dl className="sr-call-facts"><div><dt><ModelFieldLabel name="对外调用标识"/></dt><dd>{service.callId?<CopyId value={service.callId} label="对外调用标识"/>:<><span>待配置</span>{!draftOnly && <Button type="button" variant="link" disabled={blocked} onClick={()=>onIdentity?.(service.providerId)}>配置调用 ID</Button>}</>}</dd></div><div><dt>平台 API 地址</dt><dd>由平台提供</dd><small>调用示例中的 MOMA_BASE_URL 包含 /v1</small></div><div><dt>接口路径</dt><dd>{platform.path?<CopyId value={platform.path} label="接口路径"/>:'待配置'}</dd></div><div><dt>协议</dt><dd>{platform.protocol || '待配置'}</dd></div></dl>
        </div></section>
        <section className="sr-strategy"><div className="sr-column-heading"><h3>路由策略</h3><ArrowRight aria-hidden="true"/></div><div className="sr-column-body">
          {!routeStrategyChoices(service).includes(config.strategy) && <Notice>当前配置：{ROUTING_STRATEGIES[config.strategy]}。修改时请选择支持的分流策略；当前生效配置保持不变。</Notice>}
          <Field label="分流策略"><Choice label="路由策略" value={routeStrategyChoices(service).includes(config.strategy)?config.strategy:''} options={options} disabled={blocked} onChange={strategy=>set(changeRouteStrategy(config,strategy))}/></Field>
          <p className="sr-strategy-hint">{{fixed:'选择一条渠道承接调用。',weighted:'权重合计必须为 100%',random:'在参与渠道之间随机分配。',cost:'比较供应采购成本，不使用平台售价。',latency:'根据渠道 P95 延迟选择。',load:'根据渠道并发请求数选择。'}[config.strategy] || '保留已有分组配置；本轮不调整故障转移规则。'}</p>
          {config.strategy==='cost' && <Field label="成本口径"><Choice label="最低成本口径" value={config.advanced.costBasis} options={[[ 'input','输入费用'],['output','输出费用'],['total','同单位计费项合计']]} disabled={blocked} onChange={costBasis=>set({...config,advanced:{...config.advanced,costBasis}})}/></Field>}
          {config.strategy==='latency' && <Field label="延迟统计窗口（秒）"><Input aria-label="延迟统计窗口（秒）" inputMode="numeric" disabled={blocked} value={config.advanced.latencyWindowSeconds} onChange={event=>set({...config,advanced:{...config.advanced,latencyWindowSeconds:event.target.value}})}/></Field>}
        </div></section>
        <section className="sr-channels"><div className="sr-column-heading"><h3>供应渠道</h3></div><div className="sr-channel-meta"><span>{channels.length} 个映射 · {selected.length} 个已选择</span>{channels.length>4 && <Input aria-label="搜索路由渠道" placeholder="搜索渠道 / 供应商" value={query} onChange={event=>setQuery(event.target.value)}/>}</div>
          {config.strategy==='fixed' && <div className="sr-fixed-picker"><Field label="目标模型映射"><Choice label="单渠道路由映射" value={selected[0]?.supplyId || 'none'} options={[[ 'none','请选择已启用且验证通过的映射' ],...choices.map(channel=>[channel.id,`${channel.mappingName || channel.channelName} · ${channel.provider?.name || '供应商缺失'} · ${channel.upstreamModelId}${channel.available?'':'（需处理）'}`])]} disabled={blocked} onChange={id=>{if(id==='none')set({...config,channels:[]});else{const channel=channels.find(row=>row.id===id);if(channel?.available)pick(channel,true);}}}/></Field></div>}
          {!visible.length && <div className="sr-empty">{query?'没有匹配的渠道。':config.strategy==='fixed'?'请先选择目标模型映射。':'尚未关联渠道。'}{!channels.length && !draftOnly && <p>请先在上方新增并启用模型映射。</p>}</div>}
          <div className="sr-channel-list">{visible.map(channel=>{
            const row=config.channels.find(item=>item.supplyId===channel.id), enabled=Boolean(row?.enabled), algorithm=config.strategy==='priority_weighted'?groups.find(group=>group.id===(row?.groupId || groups[0].id))?.strategy:config.strategy;
            const active=current?.config.channels.find(item=>item.supplyId===channel.id), planned=Boolean(active?.enabled)!==enabled;
            let metric='';
            if(algorithm==='latency')metric=channel.p95LatencyMs==null?'暂无延迟数据':`${channel.p95LatencyMs} ms`;
            if(algorithm==='load')metric=channel.activeRequests==null?'暂无并发数据':`${channel.activeRequests} 并发`;
            if(algorithm==='cost'){try{const pool=channels.filter(item=>selected.some(value=>value.supplyId===item.id && (config.strategy!=='priority_weighted' || value.groupId===row?.groupId)));const cost=comparableRouteCosts(pool,config.advanced.costBasis).find(item=>item.supplyId===channel.id);metric=cost?`${cost.amount/1000000} ${channel.costItems[0]?.currency || 'CNY'} / ${channel.costItems[0]?.unit}`:'未参与';}catch{metric='成本不可比较';}}
            return <div className="sr-channel" key={channel.id}>
              <div className="sr-channel-main">{config.strategy!=='fixed' && <Checkbox aria-label={`参与路由 ${channel.channelName} ${channel.channelId}`} checked={enabled} disabled={blocked || !enabled && !channel.available || !row && config.channels.length>=20} onCheckedChange={value=>pick(channel,value===true)}/>}<div className="sr-channel-name"><strong>{service.mode==='standard'?`${channel.provider?.name || '供应商缺失'} · `:''}{channel.channelName}</strong>{!channel.available && <Status>需处理</Status>}</div>
                {algorithm==='weighted'?<label className="sr-weight"><Input aria-label={`权重 ${channel.channelId}`} inputMode="decimal" value={row?.weight ?? 0} disabled={blocked || !enabled} onChange={event=>update(channel.id,{weight:event.target.value})}/>%</label>:<span className="sr-metric">{metric || (enabled?current?'参与':'停用前目标':'未参与')}</span>}
              </div>
              <div className="sr-channel-sub"><span>上游模型标识：</span><code>{channel.upstreamModelId || '待配置'}</code>{planned && editing && <span className="sr-planned">{enabled?'将加入':'将移出'}</span>}</div>
              {!channel.available && <p className="sr-channel-error">{channel.reason}</p>}
              {config.strategy==='priority_weighted' && enabled && <Field label="所属组"><Choice label={`所属组 ${channel.channelId}`} value={row.groupId} options={groups.map(group=>[group.id,`${group.id} · ${group.name}`])} disabled={blocked} onChange={groupId=>update(channel.id,{groupId})}/></Field>}
              <Button type="button" variant="outline" size="sm" className="sr-channel-detail-trigger" onClick={()=>setDetailId(channel.id)}>渠道详情</Button>{detailId===channel.id && <Modal drawer drawerSide="left" title="渠道详情" description={`${channel.provider?.name || '供应商缺失'} · ${channel.channelName}`} onClose={()=>setDetailId(null)}><div className="sr-channel-details"><dl><div><dt>供应商</dt><dd>{channel.provider?.name}</dd></div><div><dt>渠道 ID</dt><dd><CopyId value={channel.channelId} label="渠道 ID"/></dd></div><div><dt>上游请求地址</dt><dd>{channel.url?<CopyId value={channel.url} label="上游请求地址"/>:'待配置'}</dd></div><div><dt>上游模型标识</dt><dd>{channel.upstreamModelId}</dd></div><div><dt>协议映射</dt><dd>{channel.mapping?.platformProtocol || '待配置'} → {channel.mapping?.upstreamProtocol || '待配置'} · {channel.mapping?.status}</dd></div><div><dt>采购价</dt><dd>{channel.costItems.length?channel.costItems.map((item,index)=><div key={index}>{item.name}{item.condition?`（${item.condition}）`:''}：{itemMoney(item)} / {item.unit}</div>):'待配置'}</dd></div><div><dt>路由供给检查</dt><dd>{channel.available?'检查通过':channel.reason}</dd></div><div><dt>最近验证</dt><dd>{channel.verifiedAt?displayTime(channel.verifiedAt):'暂无验证记录'}</dd></div></dl><div className="sr-channel-actions"><Button type="button" variant="link" disabled={!ops.can || !channel.provider || !channel.endpoint} onClick={()=>maintain(channel)}>维护供给</Button>{row && !enabled && <Button type="button" variant="link" disabled={blocked} onClick={()=>set({...config,channels:config.channels.filter(item=>item.supplyId!==row.supplyId)})}>移出本次配置</Button>}</div></div></Modal>}
            </div>;
          })}</div>
          {config.strategy==='weighted' && <div className={`sr-weight-total${Math.round(selected.reduce((sum,row)=>sum+Number(row.weight || 0),0)*100)===10000?' good':' invalid'}`}>权重合计必须为 100%</div>}
          {config.strategy==='priority_weighted' && groups.map(group=><div className="sr-weight-total" key={group.id}>{group.name} · {ROUTING_STRATEGIES[group.strategy]}{group.strategy==='weighted'?' · 权重合计必须为 100%':''}</div>)}
        </section>
      </div>
      {dirty && <p className="sr-scope">{current?'修改尚未生效，当前调用仍使用原配置。':last?'当前路由已停用；确认发布后生效。':'尚未发布路由。'}{service.providerId?' 本次仅修改当前供应商服务。':''}</p>}
      {ops.error && <Notice error>{ops.error}</Notice>}
      {editing && <footer className="sr-footer"><span>{dirty?'未保存修改':current?'当前配置已生效':last?'当前路由已停用':'尚未配置'}</span><Button type="button" variant="outline" onClick={reset}>取消</Button><Button type="submit" disabled={blocked}>预览变更</Button></footer>}
    </form>
    {lifecycle && <Modal wide title={lifecycle.operation==='serviceRouteStop'?'停用路由':'恢复路由'} description={`${service.model.name} · ${service.name}`} onClose={()=>setLifecycle(null)}><p>{lifecycle.operation==='serviceRouteStop'?'停用后不再选择渠道，并清空已保存的路由草稿；保留映射、历史及供应配置。':'按停用前的配置恢复路由；不自动恢复服务、上架或修改售价。'}</p><GridTable headings={['映射名称','供应商 / 渠道','上游模型标识']} empty={!(current || last)?.config.channels.some(row=>row.enabled)}>{((current || last)?.config.channels || []).filter(row=>row.enabled).map(row=>{const channel=channels.find(item=>item.id===row.supplyId);return <Row key={row.supplyId}><Cell>{channel?.mappingName || channel?.channelName || row.supplyId}</Cell><Cell>{channel?.provider?.name} / {channel?.channelName || '映射已不存在'}</Cell><Cell>{channel?.upstreamModelId || '待处理'}</Cell></Row>;})}</GridTable>{lifecycle.issue && <Notice error>{lifecycle.issue}</Notice>}{ops.error && <Notice error>{ops.error}</Notice>}<div className="mo-footer"><Button variant="outline" disabled={busy} onClick={()=>setLifecycle(null)}>取消</Button><Button disabled={busy || !ops.can || Boolean(ops.conflict) || Boolean(lifecycle.issue)} onClick={runLifecycle}>{lifecycle.operation==='serviceRouteStop'?'确认停用路由':'确认恢复路由'}</Button></div></Modal>}
    {confirmation && <Modal wide title="保存并生效前核对" description={`${service.model.name} / ${service.name}`} onClose={()=>setConfirmation(null)}><div className="sr-publication-review"><h3>变更内容</h3><GridTable className="sr-diff-table" headings={['配置项','当前生效','本次发布']} empty={!differences.length} emptyMessage="与当前生效配置一致。">{differences.map((row,index)=><Row key={index}><Cell>{row.label}</Cell><Cell>{row.before}</Cell><Cell>{row.after}</Cell></Row>)}</GridTable><h3>发布校验</h3><div className="sr-review-checks">{['对外调用标识 已配置','渠道与模型映射检查通过','策略参数检查通过','确认时再次校验依赖配置'].map(label=><Status good key={label}>{label}</Status>)}</div><h3>生效范围</h3><p>仅发布「{service.name}」的路由。新发起调用使用本次配置，已开始请求保留原配置。</p><p>此次不发布售价、模型资料，也不改变上架或停服状态。{route?.draft?'确认后将替换当前已保存的路由草稿。':''}</p>{ops.error && <Notice error>{ops.error}</Notice>}</div><div className="mo-footer"><Button variant="outline" onClick={()=>setConfirmation(null)}>返回修改</Button><Button disabled={blocked || !differences.length} onClick={publish}>确认保存并生效</Button></div></Modal>}
  </>;
}
