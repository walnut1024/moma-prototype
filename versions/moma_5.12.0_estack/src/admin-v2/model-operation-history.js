const names = { models: '模型', modelTemplates: '模型资料', providers: '供应商', endpoints: '渠道', modelSupplies: '模型渠道关联', serviceRoutes: '模型路由', modelSalePrices: '平台售价', modelOnboardings: '接入任务' };
export const MODEL_OPERATION_NAMES = { serviceProviderListing:'修改供应商上架状态', serviceProviderServing:'修改供应商服务状态', marketVisibility: '修改模型广场可见性', templateDraft: '保存资料草稿', templatePublish: '发布模型资料', templateDiscard: '丢弃资料草稿', commercialDraft: '保存销售配置草稿', commercialPublish: '发布销售配置', commercialDiscard: '丢弃销售配置草稿', serviceMode: '切换服务模式', configureServiceIdentity: '保存对外调用 ID', configureServiceProvider: '配置供应商服务', associateServiceProvider: '关联供应商', removeServiceProvider: '移除供应商关联', removeServiceChannel: '移除渠道关联', associateServiceChannels: '关联供应渠道', associateServiceChannelsBatch: '批量关联供应渠道', serviceRouteDraft: '保存路由草稿', serviceRoutePublish: '发布路由', serviceRouteRollback: '回滚路由', serviceRouteStop: '停用路由', recordPlatformPublication: '保存平台验证结果', publish: '模型上架', unlist: '模型下架' };

export function modelOperationTarget(state, modelId, data) {
  const direct = [modelId, data.id].find(id => id && (state.models.some(row => row.id === id) || state.modelTemplates.some(row => row.id === id)));
  return direct || state.models.find(model => data.serviceId === `standard:${model.id}` || typeof data.serviceId === 'string' && data.serviceId.startsWith(`provider:${model.id}:`))?.id;
}

export function modelAuditContext(state, action) {
  const changes = action.type === 'batch' ? action.changes : [action];
  const references = new Set([action.objectId, action.modelId, action.record?.id, action.id].filter(Boolean));
  const related = new Set();
  for (const change of changes) {
    const record = change.record || state[change.collection]?.find(row => row.id === change.id);
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
    if (object) { objectLabel = `${label}：${object.name || object.modelId || object.id} · ${object.id}`; break; }
  }
  return { relatedModelIds: [...related], objectLabel };
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
