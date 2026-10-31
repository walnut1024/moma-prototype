import { catalogueChannels, channelFingerprint, channelTestPending } from './provider-channels.js';
import { channelSelectionSnapshot, channelStatus } from './channel-selection.js';
import { channelSelectionServiceImpact } from './channel-selection-impact.js';
import { supplierChannelAssociations } from './supplier-resources.js';

const serviceScope = impact => JSON.stringify(impact.map(row => [row.id, row.routeVersion, [...row.affectedSupplyIds].sort()]).sort(([left], [right]) => left.localeCompare(right)));

export function channelDirectEnableIssue(state, providerId, endpointId, associationIds) {
  if(!Array.isArray(associationIds) || associationIds.length!==1)return '多模型启用须选择并确认完整范围。';
  const provider=state.providers.find(row=>row.id===providerId),endpoint=state.endpoints.find(row=>row.id===endpointId && row.providerId===providerId && !row.deletedAt);
  if(!provider || !endpoint || !['草稿','运行中','需关注'].includes(endpoint.status))return '历史停用恢复须确认影响。';
  const rows=supplierChannelAssociations(state,provider,endpointId),row=rows.find(item=>item.id===associationIds[0]);
  const firstChannel=endpoint.onboardingCreated===true && endpoint.status==='草稿' && !endpoint.activationChangedAt && rows.length===1;
  const addedModel=['运行中','需关注'].includes(endpoint.status) && row?.onboardingCreated===true;
  if((!firstChannel && !addedModel) || row?.enabled!==false || row.activationChangedAt)return '当前模型不是首次启用，请选择并确认范围。';
  const selection=channelSelectionSnapshot({provider,modelId:row.modelId,association:row});
  if(channelSelectionServiceImpact(state,[selection]).length)return '所选模型已有已发布服务引用，请核对启用影响。';
  return '';
}

export function prepareChannelDirectEnableConfirmation(state,providerId,endpointId,associationIds) {
  const issue=channelDirectEnableIssue(state,providerId,endpointId,associationIds);if(issue)throw new Error(issue);
  return {...prepareChannelEnableConfirmation(state,providerId,endpointId,associationIds),directActivation:true};
}

export function channelEnableConfirmationIssue(state, confirmation) {
  const selections = confirmation?.selections;
  if (!selections?.length || new Set(selections.map(row => row.associationId)).size !== selections.length) return '请选择有效且不重复的模型关联。';
  if(confirmation.directActivation){const first=selections[0],issue=channelDirectEnableIssue(state,first.providerId,first.endpointId,selections.map(row=>row.associationId));if(issue)return issue;}
  for (const selected of selections) {
    const provider = state.providers.find(row => row.id === selected.providerId), association = provider && catalogueChannels(state, provider, selected.modelId).find(row => row.id === selected.associationId && row.endpointId === selected.endpointId);
    if (!association || channelFingerprint(association) !== selected.expectedFingerprint || association.endpoint.status !== confirmation.endpointStatus) return '所选模型渠道已变化，本次不能启用。请重新选择。';
    if (channelTestPending(association) || !['可用', '未启用', '已停用'].includes(channelStatus(provider, association))) return '所选模型尚未全部通过当前配置验证，本次不能启用。请重新选择。';
  }
  if (serviceScope(channelSelectionServiceImpact(state, selections)) !== serviceScope(confirmation.serviceImpact)) return '所选模型的服务引用已变化，请重新选择并确认影响。';
  return '';
}

export function prepareChannelEnableConfirmation(state, providerId, endpointId, associationIds) {
  const provider = state.providers.find(row => row.id === providerId), endpoint = state.endpoints.find(row => row.id === endpointId && row.providerId === providerId && !row.deletedAt);
  if (!provider || !endpoint || !Array.isArray(associationIds) || !associationIds.length) throw new Error('请选择当前渠道的模型关联。');
  const rows = supplierChannelAssociations(state, provider, endpointId);
  const selections = associationIds.map(id => {
    const association = rows.find(row => row.id === id);
    if (!association) throw new Error('所选模型关联已变化，请重新选择。');
    return channelSelectionSnapshot({ provider, modelId: association.modelId, association });
  });
  const confirmation = { selections, endpointStatus: endpoint.status, restoring: ['停用', '已停用'].includes(endpoint.status), serviceImpact: channelSelectionServiceImpact(state, selections) };
  const issue = channelEnableConfirmationIssue(state, confirmation); if (issue) throw new Error(issue);
  return confirmation;
}
