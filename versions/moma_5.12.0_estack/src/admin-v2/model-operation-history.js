const names = { models: '模型', modelTemplates: '模型资料', providers: '服务商', endpoints: '渠道', modelSupplies: '模型渠道关联', serviceRoutes: '模型路由', modelSalePrices: '平台售价', modelOnboardings: '接入任务' };
export const MODEL_OPERATION_NAMES = {startSales:'上架销售',salesSettings:'保存销售设置',enableService:'启用技术服务',disableService:'停用技术服务',stopSales:'停止销售',servicePurpose:'变更服务用途',serviceRouteConfigure:'保存模型映射与路由',guidedRouteConfigure:'保存接入路由',serviceArchive:'归档模型服务',serviceRestore:'恢复已归档服务',configureServiceModelIdentity:'修改对外调用标识', serviceMappingCreate:"新增模型映射", serviceMappingSave:"保存模型映射", serviceMappingValidate:"验证模型映射", serviceMappingApply:"应用模型映射", serviceMappingDiscard:"放弃映射变更", serviceMappingEnable:"启用模型映射", serviceMappingDisable:"停用模型映射", serviceMappingRemove:"解除模型映射", serviceProviderListing:'修改渠道服务展示', serviceProviderServing:'修改渠道服务技术状态', marketVisibility: '修改模型广场可见性', templateDraft: '保存资料草稿', templatePublish: '发布模型资料', templateDiscard: '丢弃资料草稿', commercialDraft: '保存销售配置草稿', commercialPublish: '发布销售配置', commercialDiscard: '丢弃销售配置草稿', serviceMode: '切换服务模式', configureServiceIdentity: '保存对外调用标识', configureServiceProvider: '配置服务商服务', associateServiceProvider: '关联服务商', removeServiceProvider: '移除服务商关联', removeServiceChannel: '移除渠道关联', associateServiceChannels: '关联供应渠道', associateServiceChannelsBatch: '批量关联供应渠道', serviceRouteDraft: '保存路由草稿', serviceRoutePublish: '发布路由', serviceRouteRollback: '回滚路由', serviceRouteStop: '停用路由', serviceRouteRestore:'恢复路由', serviceFailoverConfigure:'保存故障转移', recordPlatformPublication: '保存平台验证结果', publish: '模型上架', unlist: '模型下架' };

export function modelOperationTarget(state, modelId, data) {
  const direct = [modelId, data.id].find(id => id && (state.models.some(row => row.id === id) || state.modelTemplates.some(row => row.id === id)));
  return direct || state.models.find(model => data.serviceId === `standard:${model.id}` || typeof data.serviceId === 'string' && data.serviceId.startsWith(`provider:${model.id}:`))?.id;
}

export function modelAuditContext(state, action) {
  const changes = action.type === 'batch' ? action.changes : [action];
  const references = new Set([action.objectId, action.modelId, action.record?.id, action.id].filter(Boolean));
  const related = new Set(), endpoints = new Set();
  for (const change of changes) {
    const record = change.record || state[change.collection]?.find(row => row.id === change.id);
    if(change.collection==='endpoints' && (change.id || record?.id))endpoints.add(change.id || record.id);
    if(change.collection==='providers' && change.changes?.catalogConnections){
      const before=state.providers.find(row=>row.id===change.id)?.catalogConnections || [],after=change.changes.catalogConnections;
      for(const row of [...before,...after])if(JSON.stringify(before.find(item=>item.id===row.id))!==JSON.stringify(after.find(item=>item.id===row.id)))if(row.endpointId)endpoints.add(row.endpointId);
    }
    if (change.id || record?.id) references.add(change.id || record.id);
    if (record?.modelId && ['modelSupplies', 'modelSalePrices', 'modelOnboardings'].includes(change.collection)) related.add(record.modelId);
    if (change.collection === 'serviceRoutes') {
      const service = record?.serviceId || '';
      for (const model of state.models) if (service === `standard:${model.id}` || service.startsWith(`provider:${model.id}:`)) related.add(model.id);
    }
  }
  for (const model of state.models) {
    if (references.has(model.id) || references.has(model.templateId)) related.add(model.id);
    for (const supply of state.modelSupplies || []) if (supply.modelId === model.id) {
      const endpoint = state.endpoints.find(row => row.id === supply.endpointId);
      if ([supply.id, supply.endpointId, endpoint?.providerId].some(id => id && references.has(id))) related.add(model.id);
    }
  }
  let objectLabel = action.objectId || action.record?.id || action.id || '批量操作';
  for (const [collection, label] of Object.entries(names)) {
    const object = state[collection]?.find(row => row.id === objectLabel);
    if(object && collection==='serviceRoutes'){const model=state.models.find(row=>object.serviceId===`standard:${row.id}` || object.serviceId.startsWith(`provider:${row.id}:`));objectLabel='模型路由：'+(model?.name || object.serviceId);break;}
    if (object) { objectLabel = `${label}：${object.name || object.modelId || object.id} · ${object.id}`; break; }
  }
  return { relatedModelIds: [...related], relatedEndpointIds:[...endpoints], objectLabel };
}

export function modelOperationHistory(state, model) {
  const masterId = model.templateId || model.id;
  const serviceMatches = id => id === `standard:${model.id}` || typeof id === 'string' && id.startsWith(`provider:${model.id}:`);
  const historicalMatch = record => {
    if (record.objectId === model.id || record.objectId === masterId) return true;
    const changes = Array.isArray(record.after) ? record.after : record.after ? [record.after] : [];
    return changes.some(change => {
      const value = change.record || change;
      return change.collection === 'models' && (change.id === model.id || value.id === model.id)
        || change.collection === 'modelTemplates' && (change.id === masterId || value.id === masterId)
        || value.modelId === model.id || serviceMatches(value.serviceId);
    });
  };
  return state.audits.filter(record => record.relatedModelIds ? record.relatedModelIds.includes(model.id) : historicalMatch(record))
    .sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt)));
}

const auditFields={name:'名称',modelId:'模型标识',callId:'调用标识',upstreamModelId:'上游模型标识',status:'状态',listingStatus:'上架状态',releaseStage:'上架阶段',releaseTenantIds:'灰度客户范围',callsEnabled:'调用开关',marketVisible:'广场可见',salesScope:'销售对象范围',purpose:'服务用途',archivedAt:'归档时间',baseUrl:'API 地址',protocol:'协议',openScope:'开放范围',tenantIds:'客户范围',enabled:'启用状态',amount:'价格',currency:'货币',unit:'单位',condition:'条件',listPrice:'采购价',purchasePrice:'采购价',strategy:'策略',supplyId:'映射',activeVersion:'生效路由',salesEnabled:'销售开关'};
function auditValue(value,key,state) {
  if(key==='tenantIds' && Array.isArray(value))return value.map(id=>{const tenant=state.tenants?.find(row=>row.id===id);return tenant?tenant.name+' · '+id:id;});
  if(key==='openScope')return {all:'全部有效客户',selected:'指定客户'}[value] || value;
  if(key==='strategy')return {fixed:'固定渠道',weighted:'加权分流',latency:'最低延迟'}[value] || value;
  if(['amount','purchasePrice','listPrice'].includes(key) && typeof value==='number')return String(value/1000000);
  if(value===undefined || value===null)return '未设置';
  if(typeof value==='boolean')return value?'是':'否';
  if(typeof value==='string' || typeof value==='number')return String(value).slice(0,500);
  if(Array.isArray(value))return value.map(row=>typeof row==='object'?Object.fromEntries(Object.entries(row).filter(([field])=>auditFields[field]).map(([field,item])=>[auditFields[field],auditValue(item,field,state)])):auditValue(row,key,state)).slice(0,100);
  return Object.fromEntries(Object.entries(value).filter(([field])=>auditFields[field]).map(([field,item])=>[auditFields[field],auditValue(item,field,state)]));
}
export function modelAuditChanges(state,action) {
  if (action.marketPosition) {
    return [{ object: state.models.find(model => model.id === action.objectId)?.name, field: '序号', ...action.marketPosition }];
  }
  return (action.type==='batch'?action.changes:action.collection?[action]:[]).flatMap(change=>{
    const old=state[change.collection]?.find(row=>row.id===change.id),value=change.changes || change.record || {};
    return Object.entries(value).filter(([key])=>auditFields[key] || ['items','scenarios','config','serviceProviders'].includes(key)).filter(([key,next])=>JSON.stringify(old?.[key])!==JSON.stringify(next)).map(([key,next])=>({object:value.name || old?.name || change.id || value.id,field:auditFields[key] || {items:'计费项',scenarios:'计费项',config:'路由配置',serviceProviders:'服务商服务'}[key],before:auditValue(old?.[key],key,state),after:auditValue(next,key,state)}));
  });
}
