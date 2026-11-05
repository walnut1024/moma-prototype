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
import {ROUTING_STRATEGIES, routingServices, routingChannels, serviceRoute, activeRouteVersion, routeSourceVersion, validateRouteConfig, routeGroups, routingStatus, comparableRouteCosts} from './service-routing';
import {platformRouteInterface} from './service-route-mapping';
import {changeRouteStrategy, routeStrategyChoices, routeEditConfig, sameRouteConfig, routeChangeRows} from './route-workspace';
import './service-routing.css';

const describe = config => config ? `${ROUTING_STRATEGIES[config.strategy]} · ${config.channels.filter(row=>row.enabled).length} 个参与渠道` : '尚未配置';

export function RouteWorkbench({state, model, ops, draftOnly=false, serviceId, onAssociate, onAddProvider, onRemoveProvider, onProviderState, onIdentity}) {
  const services = routingServices(state).filter(item=>item.modelId===model.id), [epoch,setEpoch] = useState(0), [editingId,setEditingId]=useState(null);
  const selected = services.find(item=>item.id===serviceId) || services.find(item=>item.providerId===(ops.params.get('routeProvider') || ops.params.get('providerChannels'))) || services[0];
  const reload = ()=>ops.proceed(()=>{ops.reload();setEpoch(value=>value+1);});
  const dialogKey = ['providerAssociate','identityProvider','providerAdd'].map(key=>ops.params.get(key)).join(':') + ':' + ops.params.get('panel');
  return <div className="sr-workbench">
    {model.serviceMode==='provider' && !draftOnly && <div className="sr-provider-toolbar"><span>{services.length} 个供应商服务</span><Button variant="outline" disabled={!ops.can} onClick={onAddProvider}><Plus/>关联供应商</Button></div>}
    {!selected ? <div className="sm-empty"><h2>尚未配置路由</h2><p>{model.serviceMode==='provider'?'先关联供应商，再选择该供应商的渠道。':'先选择服务模式，再关联渠道。'}</p></div> : services.filter(service=>!serviceId || service.id===selected.id).map(service=>{
      const entry=model.serviceProviders?.find(row=>row.providerId===service.providerId), active = service.id===selected.id, current=activeRouteVersion(serviceRoute(state,service.id)), channels=routingChannels(state,service), status=routingStatus(state,service);
      return <section className={`sr-service${active?' is-editing':''}`} key={service.id} aria-label={`${service.name}路由`}>
        <div className="sr-service-heading"><h2>{service.name}</h2>{entry?.marketVisible===false && <Status>已下架</Status>}{entry?.callsEnabled===false && <Status>已停服</Status>}
          <div className="sr-heading-actions">{!draftOnly && service.providerId && <><Button variant="link" disabled={!ops.can || Boolean(ops.conflict) || ops.hasUnsaved?.()} onClick={()=>onProviderState?.(service.providerId,'serviceProviderListing',entry?.marketVisible===false)}>{entry?.marketVisible===false?'上架供应商':'下架供应商'}</Button><Button variant="link" disabled={!ops.can || Boolean(ops.conflict) || ops.hasUnsaved?.()} onClick={()=>onProviderState?.(service.providerId,'serviceProviderServing',entry?.callsEnabled===false)}>{entry?.callsEnabled===false?'恢复服务':'停服供应商'}</Button>{entry?.marketVisible===false && <Button variant="link" disabled={!ops.can || Boolean(ops.conflict) || ops.hasUnsaved?.()} onClick={()=>onRemoveProvider?.(service.providerId)}>解绑</Button>}{!active && <Button variant="outline" aria-label={`编辑${service.name}路由`} onClick={()=>ops.go({panel:'routing',routeProvider:service.providerId,providerChannels:service.providerId},{preserveScroll:true})}>展开<ChevronDown/></Button>}</>}{active && editingId!==service.id && <Button type="button" variant="outline" disabled={!ops.can || Boolean(ops.conflict)} onClick={()=>ops.proceed(()=>setEditingId(service.id))}>编辑</Button>}</div>
        </div>
        {active ? <RoutingConfiguration key={`${service.id}:${epoch}:${dialogKey}`} state={state} service={service} ops={ops} reload={reload} editing={editingId===service.id} onCloseEdit={()=>setEditingId(null)} draftOnly={draftOnly} onAssociate={onAssociate} onIdentity={onIdentity}/> : <div className="sr-service-summary"><div><small>对外调用标识</small><code>{service.callId || '待配置'}</code></div><ArrowRight aria-hidden="true"/><div><small>路由策略</small><span>{describe(current?.config)}</span></div><ArrowRight aria-hidden="true"/><div><small>供应渠道</small><span>{channels.length} 个已关联 · {status.label}</span></div></div>}
      </section>;
    })}
  </div>;
}

function RoutingConfiguration({state, service, ops, reload, draftOnly, onAssociate, onIdentity, editing, onCloseEdit}) {
  const route=serviceRoute(state,service.id), current=activeRouteVersion(route), channels=routingChannels(state,service), platform=platformRouteInterface(service.model);
  const [config,setConfig]=useState(()=>routeEditConfig(service,route,channels)), [baseline,setBaseline]=useState(()=>routeEditConfig(service,route,channels)), [expectedVersion,setExpectedVersion]=useState(route?.activeVersion ?? 0), [dirty,setDirty]=useState(false);
  const [confirmation,setConfirmation]=useState(null), [removing,setRemoving]=useState(null), [query,setQuery]=useState(''), [detailId,setDetailId]=useState(null);
  const selected=config.channels.filter(row=>row.enabled), groups=routeGroups(config), changed=(route?.activeVersion || 0)!==expectedVersion, blocked=!ops.can || changed || !editing;
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
  const publish=async ()=>{
    const next=await ops.run('serviceRoutePublish',{serviceId:service.id,...confirmation});
    if(next){const saved=serviceRoute(next,service.id),value=routeEditConfig(service,saved,channels);setConfig(value);setBaseline(structuredClone(value));setExpectedVersion(saved.activeVersion);setDirty(false);onCloseEdit();ops.dirty(false);setConfirmation(null);}
  };
  const pick=(channel,enabled)=>{
    const old=config.channels.find(row=>row.supplyId===channel.id);
    if(config.strategy==='fixed' && enabled){set({...config,channels:[{...(old || {supplyId:channel.id,weight:0,groupId:'P1'}),enabled:true,priority:1},...config.channels.filter(row=>row.supplyId!==channel.id).map((row,index)=>({...row,enabled:false,priority:index+2}))]});return;}
    if(old)update(channel.id,{enabled});
    else set({...config,channels:[...config.channels,{supplyId:channel.id,enabled,groupId:groups[0].id,weight:0,priority:config.channels.length+1}]});
  };
  const maintain=channel=>ops.go({provider:channel.provider.id,resource:channel.endpoint.id,tab:'channels',perspective:'suppliers',origin:location.hash},{base:'providers'});
  const options=routeStrategyChoices(service).map(id=>[id,ROUTING_STRATEGIES[id]]);
  const visible=channels.filter(channel=>[channel.channelName,channel.provider?.name,channel.channelId,channel.upstreamModelId].join(' ').toLowerCase().includes(query.trim().toLowerCase()));
  const differences=confirmation?routeChangeRows(current?.config,confirmation.config,channels):[];
  return <>
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
        <section className="sr-channels"><div className="sr-column-heading"><h3>供应渠道</h3>{!draftOnly && <Button type="button" variant="outline" disabled={blocked} onClick={()=>onAssociate?.(service.providerId)}><Plus/>关联渠道</Button>}</div><div className="sr-channel-meta"><span>{channels.length} 个已关联 · {selected.length} 个参与</span>{channels.length>4 && <Input aria-label="搜索路由渠道" placeholder="搜索渠道 / 供应商" value={query} onChange={event=>setQuery(event.target.value)}/>}</div>
          {!visible.length && <div className="sr-empty">{query?'没有匹配的渠道。':'尚未关联渠道。'}{!channels.length && !draftOnly && <Button type="button" variant="link" disabled={blocked} onClick={()=>onAssociate?.(service.providerId)}>选择已有供应渠道</Button>}</div>}
          <div className="sr-channel-list">{visible.map(channel=>{
            const row=config.channels.find(item=>item.supplyId===channel.id), enabled=Boolean(row?.enabled), algorithm=config.strategy==='priority_weighted'?groups.find(group=>group.id===(row?.groupId || groups[0].id))?.strategy:config.strategy;
            const active=current?.config.channels.find(item=>item.supplyId===channel.id), planned=Boolean(active?.enabled)!==enabled;
            let metric='';
            if(algorithm==='latency')metric=channel.p95LatencyMs==null?'暂无延迟数据':`${channel.p95LatencyMs} ms`;
            if(algorithm==='load')metric=channel.activeRequests==null?'暂无并发数据':`${channel.activeRequests} 并发`;
            if(algorithm==='cost'){try{const pool=channels.filter(item=>selected.some(value=>value.supplyId===item.id && (config.strategy!=='priority_weighted' || value.groupId===row?.groupId)));const cost=comparableRouteCosts(pool,config.advanced.costBasis).find(item=>item.supplyId===channel.id);metric=cost?`${cost.amount/1000000} ${channel.costItems[0]?.currency || 'CNY'} / ${channel.costItems[0]?.unit}`:'未参与';}catch{metric='成本不可比较';}}
            return <div className="sr-channel" key={channel.id}>
              <div className="sr-channel-main"><Checkbox aria-label={`参与路由 ${channel.channelName} ${channel.channelId}`} checked={enabled} disabled={blocked || !enabled && !channel.available || !row && config.channels.length>=20} onCheckedChange={value=>pick(channel,value===true)}/><div className="sr-channel-name"><strong>{service.mode==='standard'?`${channel.provider?.name || '供应商缺失'} · `:''}{channel.channelName}</strong>{!channel.available && <Status>需处理</Status>}</div>
                {algorithm==='weighted'?<label className="sr-weight"><Input aria-label={`权重 ${channel.channelId}`} inputMode="decimal" value={row?.weight ?? 0} disabled={blocked || !enabled} onChange={event=>update(channel.id,{weight:event.target.value})}/>%</label>:<span className="sr-metric">{metric || (enabled?'参与':'未参与')}</span>}
              </div>
              <div className="sr-channel-sub"><span>上游模型标识：</span><code>{channel.upstreamModelId || '待配置'}</code>{planned && <span className="sr-planned">{enabled?'将加入':'将移出'}</span>}</div>
              {!channel.available && <p className="sr-channel-error">{channel.reason}</p>}
              {config.strategy==='priority_weighted' && enabled && <Field label="所属组"><Choice label={`所属组 ${channel.channelId}`} value={row.groupId} options={groups.map(group=>[group.id,`${group.id} · ${group.name}`])} disabled={blocked} onChange={groupId=>update(channel.id,{groupId})}/></Field>}
              <Button type="button" variant="outline" size="sm" className="sr-channel-detail-trigger" onClick={()=>setDetailId(channel.id)}>渠道详情</Button>{!draftOnly && <Button type="button" variant="link" disabled={blocked || dirty} title={dirty?'请先保存或取消当前修改':undefined} onClick={()=>setRemoving(channel)}>解除关联</Button>}{detailId===channel.id && <Modal drawer drawerSide="left" title="渠道详情" description={`${channel.provider?.name || '供应商缺失'} · ${channel.channelName}`} onClose={()=>setDetailId(null)}><div className="sr-channel-details"><dl><div><dt>供应商</dt><dd>{channel.provider?.name}</dd></div><div><dt>渠道 ID</dt><dd><CopyId value={channel.channelId} label="渠道 ID"/></dd></div><div><dt>上游请求地址</dt><dd>{channel.url?<CopyId value={channel.url} label="上游请求地址"/>:'待配置'}</dd></div><div><dt>上游模型标识</dt><dd>{channel.upstreamModelId}</dd></div><div><dt>协议映射</dt><dd>{channel.mapping?.platformProtocol || '待配置'} → {channel.mapping?.upstreamProtocol || '待配置'} · {channel.mapping?.status}</dd></div><div><dt>采购价</dt><dd>{channel.costItems.length?channel.costItems.map((item,index)=><div key={index}>{item.name}{item.condition?`（${item.condition}）`:''}：{itemMoney(item)} / {item.unit}</div>):'待配置'}</dd></div><div><dt>路由供给检查</dt><dd>{channel.available?'检查通过':channel.reason}</dd></div><div><dt>最近验证</dt><dd>{channel.verifiedAt?displayTime(channel.verifiedAt):'暂无验证记录'}</dd></div></dl><div className="sr-channel-actions"><Button type="button" variant="link" disabled={!ops.can || !channel.provider || !channel.endpoint} onClick={()=>maintain(channel)}>维护供给</Button>{row && !enabled && <Button type="button" variant="link" disabled={blocked} onClick={()=>set({...config,channels:config.channels.filter(item=>item.supplyId!==row.supplyId)})}>移出本次配置</Button>}</div></div></Modal>}
            </div>;
          })}</div>
          {config.strategy==='weighted' && <div className={`sr-weight-total${Math.round(selected.reduce((sum,row)=>sum+Number(row.weight || 0),0)*100)===10000?' good':' invalid'}`}>权重合计必须为 100%</div>}
          {config.strategy==='priority_weighted' && groups.map(group=><div className="sr-weight-total" key={group.id}>{group.name} · {ROUTING_STRATEGIES[group.strategy]}{group.strategy==='weighted'?' · 权重合计必须为 100%':''}</div>)}
        </section>
      </div>
      {dirty && <p className="sr-scope">{current?'修改尚未生效，当前调用仍使用原配置。':'尚未发布路由。'}{service.providerId?' 本次仅修改当前供应商服务。':''}</p>}
      {ops.error && <Notice error>{ops.error}</Notice>}
      {editing && <footer className="sr-footer"><span>{dirty?'未保存修改':current?'当前配置已生效':'尚未配置'}</span><Button type="button" variant="outline" onClick={reset}>取消</Button><Button type="submit" disabled={blocked}>保存并生效</Button></footer>}
    </form>
    {removing && <Modal title="解除渠道关联" description={`${service.name} · ${removing.channelName}`} onClose={()=>setRemoving(null)}><p>仅解除当前服务的关联，供应渠道和历史记录保留。生效路由仍引用此渠道时，请先将其移出路由并保存生效，再解除关联。</p>{ops.error && <Notice error>{ops.error}</Notice>}<div className="mo-footer"><Button variant="outline" onClick={()=>setRemoving(null)}>取消</Button><Button disabled={blocked} onClick={async ()=>{if(await ops.run('removeServiceChannel',{supplyId:removing.id,expectedUpdatedAt:service.model.updatedAt},service.modelId))setRemoving(null);}}>确认解除关联</Button></div></Modal>}
    {confirmation && <Modal wide title="保存并生效前核对" description={`${service.model.name} / ${service.name}`} onClose={()=>setConfirmation(null)}><div className="sr-publication-review"><h3>变更内容</h3><GridTable className="sr-diff-table" headings={['配置项','当前生效','本次发布']} empty={!differences.length} emptyMessage="与当前生效配置一致。">{differences.map((row,index)=><Row key={index}><Cell>{row.label}</Cell><Cell>{row.before}</Cell><Cell>{row.after}</Cell></Row>)}</GridTable><h3>发布校验</h3><div className="sr-review-checks">{['对外调用标识 已配置','渠道与模型映射检查通过','策略参数检查通过','确认时再次校验依赖配置'].map(label=><Status good key={label}>{label}</Status>)}</div><h3>生效范围</h3><p>仅发布「{service.name}」的路由。新发起调用使用本次配置，已开始请求保留原配置。</p><p>此次不发布售价、模型资料，也不改变上架状态。</p>{ops.error && <Notice error>{ops.error}</Notice>}</div><div className="mo-footer"><Button variant="outline" onClick={()=>setConfirmation(null)}>返回修改</Button><Button disabled={blocked || !differences.length} onClick={publish}>确认保存并生效</Button></div></Modal>}
  </>;
}
