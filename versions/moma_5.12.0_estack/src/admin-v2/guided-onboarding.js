import { libraryRecord } from './model-library.js';
import { catalogueChannels, channelBlockReason } from './provider-channels.js';
import { modelSupplies, publicationChecks } from './model-management.js';
import { serviceChannelCosts } from './service-workspace.js';
import { activeChannelProcurement } from './channel-change-management.js';
import { serviceMetadataReady } from './model-profile.js';
import { routingServices, serviceRoute, activeRouteVersion } from './service-routing.js';

export const ONBOARDING_STEPS = ['选择模型', '接通供应', '配置销售', '验证并上架'];
export const onboardingStepLabels = intent => intent==='reserve'?ONBOARDING_STEPS.slice(0,2):intent==='activate'?['选择模型','接通供应','投入服务','验证并发布']:ONBOARDING_STEPS;

export function guidedOnboarding(state, id) {
  const draft = state.modelOnboardings.find(row => row.id === id && row.guided && row.kind === 'supplier-channel' && row.status !== '已放弃');
  if (!draft) return null;
  const endpoint = state.endpoints.find(row => row.id === draft.createdEndpointId && !row.deletedAt);
  const provider = endpoint && state.providers.find(row => row.id === endpoint.providerId);
  const association = provider?.catalogConnections?.find(row => draft.createdAssociationIds?.includes(row.id) && row.endpointId === endpoint.id && !row.deletedAt);
  const channel = association && catalogueChannels(state, provider, association.modelId).find(row => row.id === association.id);
  const reference = provider?.catalogModels?.find(row => row.modelId === association?.modelId);
  const source = draft.rows[0];
  const master = reference ? libraryRecord(state, reference.libraryId) : source?.libraryId ? libraryRecord(state,source.libraryId) : null;
  const model = master && state.models.find(row => row.id === master.id || row.templateId === master.id);
  const supply = model && modelSupplies(state, model.id).find(row => row.channelId === association?.id && row.endpointId === endpoint?.id);
  const connectionIssue = endpoint ? !channel ? '接入模型已变化，请在供应管理中核对。' : channelBlockReason(provider, channel) : '';
  const service = model && routingServices(state).find(row => row.modelId === model.id && (row.mode === 'standard' || row.providerId === provider?.id));
  const candidateState=state, routeTransaction=null, candidateIssue='';
  const checks = model ? publicationChecks(candidateState, model) : [];
  const active=service && activeRouteVersion(serviceRoute(candidateState,service.id));
  const routed = service && supply && active?.config.channels.some(row => row.supplyId === supply.id && row.enabled !== false && (!['weighted','priority_weighted'].includes(active.config.strategy) || row.weight > 0));
  const costs=channel ? serviceChannelCosts(channel) : [];
  const supplyReady=Boolean(channel && !connectionIssue && costs.length && costs.every(row=>Number.isSafeInteger(row.amount) && row.amount>=0) && activeChannelProcurement(channel));
  const serviceReady = Boolean(!candidateIssue && supplyReady && model && serviceMetadataReady(model) && routed && checks.filter(row => row.tab !== 'platform').every(row => row.passed));
  const step = !endpoint ? draft.step || 0 : draft.intent==='reserve' || connectionIssue || !supplyReady ? 1 : !serviceReady ? 2 : 3;
  const completed = Boolean(draft.completion);
  return { candidateState, routeTransaction, candidateIssue, completed, supplyReady, routed: Boolean(routed), service, draft, endpoint, provider, association, channel, master, model, supply, checks, serviceReady, connectionIssue, step, listed: Boolean(model?.listingStatus === '已上架' && serviceReady && checks.every(row => row.passed)) };
}

export function pendingGuidedOnboardings(state) {
  return state.modelOnboardings.filter(row => row.guided && row.status !== '已放弃').map(row => guidedOnboarding(state, row.id)).filter(row => row?.endpoint && !row.completed).sort((a, b) => String(b.draft.updatedAt).localeCompare(String(a.draft.updatedAt)));
}

