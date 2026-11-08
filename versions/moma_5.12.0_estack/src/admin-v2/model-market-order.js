export function orderedMarketModels(state) {
  const ranks = new Map((state.modelData?.marketOrder || []).map((id, index) => [id, index]));
  const rank = id => ranks.get(id) ?? ranks.size;
  return state.models.filter(model => !model.archivedAt && model.serviceMode)
    .sort((a, b) => rank(a.id) - rank(b.id) || a.name.localeCompare(b.name, 'zh-CN') || a.id.localeCompare(b.id));
}

export function marketOrderTransaction(state, { modelId, data }) {
  if (data?.expectedRevision !== state.revision) throw new Error('模型广场已有修订，请载入最新数据后重试');
  const ids = orderedMarketModels(state).map(model => model.id);
  const from = ids.indexOf(modelId), position = data?.position;
  if (from < 0) throw new Error('模型不在广场管理列表中');
  if (!Number.isSafeInteger(position) || position < 1 || position > ids.length) {
    throw new Error(`序号须为 1 到 ${ids.length} 的整数`);
  }
  ids.splice(from, 1);
  ids.splice(position - 1, 0, modelId);
  return { type: 'batch', label: '调整模型广场序号', objectId: modelId, changes: [], marketOrder: ids, marketPosition: { before: from + 1, after: position } };
}
