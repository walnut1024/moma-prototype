import { activeRouteVersion, serviceRoute } from '../src/admin-v2/service-routing.js';
import { catalogueChannels } from '../src/admin-v2/provider-channels.js';
import { libraryRecord } from '../src/admin-v2/model-library.js';

const ref = (type, id, name, ...roles) => ({ type, id, ...(name && { name }), roles });
const value = input => input === undefined ? { state: 'unrecorded' } : { state: 'known', value: input };
const byId = (rows, id) => rows?.find(row => row.id === id);
const fieldsChanged = (resources, changes, resource, fields) => {
  for (const [field, before, after] of fields) {
    if (JSON.stringify(before) === JSON.stringify(after)) continue;
    if (!resource.roles.includes('changed')) resource.roles.push('changed');
    changes.push({ resource_ref: resource.type + ':' + resource.id, field, before: value(before), after: value(after) });
  }
  if (resource.roles.length) resources.push(resource);
};
const weights = version => version && Object.fromEntries((version.config?.channels || [])
  .filter(row => row.enabled === true && typeof row.supplyId === 'string' && Number.isFinite(row.weight))
  .map(row => [row.supplyId, row.weight]).sort(([a], [b]) => a.localeCompare(b)));

function publishEvidence(before, next, { modelId, data }) {
  const route = serviceRoute(next, data.serviceId), previous = serviceRoute(before, data.serviceId);
  const current = activeRouteVersion(route), old = activeRouteVersion(previous);
  if (!current || current.version === old?.version) return null;
  const model = byId(next.models, modelId) || next.models.find(row => data.serviceId === 'standard:' + row.id || data.serviceId.startsWith('provider:' + row.id + ':'));
  const resources = [], changes = [];
  fieldsChanged(resources, changes, ref('service_route', route.id, model?.name, 'target'), [
    ['active_version', previous?.activeVersion ?? null, current.version],
    ['strategy', old?.config?.strategy ?? null, current.config.strategy],
    ['channel_weights', weights(old) ?? {}, weights(current)],
  ]);
  resources.push(ref('model_service', route.serviceId, model?.name, 'related'));
  const ids = new Set([...current.config.channels.map(row => row.supplyId), ...old?.config.channels.map(row => row.supplyId) || [], ...data.removeIds || []]);
  for (const id of ids) {
    const prior = byId(before.modelSupplies, id), mapping = byId(next.modelSupplies, id);
    if (mapping?.serviceMapping || prior?.serviceMapping) {
      fieldsChanged(resources, changes, ref('service_mapping', id, mapping?.mappingName, 'related'), [
        ['status', prior?.status ?? null, mapping?.status ?? null],
      ]);
    }
    const supply = mapping || prior;
    if (!supply) continue;
    if (supply.channelId) resources.push(ref('model_supply', supply.channelId, null, 'related'));
    if (supply.endpointId) resources.push(ref('supplier_connection', supply.endpointId, byId(next.endpoints, supply.endpointId)?.name, 'related'));
  }
  return { action_code: 'service_route.publish', resources, changes,
    request_parameters: { service_id: data.serviceId, expected_version: data.expectedVersion } };
}

function rotateEvidence(before, next, data) {
  const { providerId, groupId, candidateId } = data;
  const previous = byId(before.providers, providerId), provider = byId(next.providers, providerId);
  const candidate = byId(previous?.keyGroupCandidates, candidateId);
  if (!candidate || candidate.priorityChange || candidate.rollbackOf != null) return null;
  const versions = provider?.keyGroupVersions?.filter(row => row.groupId === groupId);
  const current = versions?.at(-1), old = versions?.at(-2);
  if (!old || current.candidateId !== candidateId || current.keyIds[0] === old.keyIds[0]) return null;
  const resources = [], changes = [];
  fieldsChanged(resources, changes, ref('supplier_key_group', providerId + ':' + groupId, byId(provider.apiKeyGroups, groupId)?.name, 'target'), [
    ['configuration_version', old.version, current.version],
    ['active_key_id', old.keyIds[0] ?? null, current.keyIds[0] ?? null],
  ]);
  resources.push(ref('supplier', providerId, provider.name, 'related'));
  for (const id of [old.keyIds[0], current.keyIds[0]].filter(Boolean)) resources.push(ref('supplier_key', id, null, 'related'));
  for (const id of Object.keys(candidate.configs || {})) {
    const prior = byId(before.endpoints, id), endpoint = byId(next.endpoints, id);
    if (!endpoint) continue;
    fieldsChanged(resources, changes, ref('supplier_connection', id, endpoint.name, 'related'), [
      ['configuration_version', prior?.configurationRevision ?? 0, endpoint.configurationRevision],
    ]);
    const previousAssociations = new Map((previous.catalogConnections || []).filter(row => row.endpointId === id).map(row => [row.id, row]));
    for (const row of (provider.catalogConnections || []).filter(row => row.endpointId === id && row.id && !row.deletedAt)) {
      const priorAssociation = previousAssociations.get(row.id);
      fieldsChanged(resources, changes, ref('model_supply', row.id, row.name, 'related'), [
        ['enabled', priorAssociation?.enabled, row.enabled],
        ['validation_id', priorAssociation?.health?.id ?? null, row.health?.id ?? null],
      ]);
    }
  }
  const validationIds = [...new Set((candidate.tests || []).map(row => row.batchId).filter(Boolean))];
  return { action_code: 'supplier_key_group.rotate', resources, changes, links: { candidate_id: candidateId, validation_batch_ids: validationIds },
    request_parameters: { provider_id: providerId, key_group_id: groupId, candidate_id: candidateId } };
}

function disableEvidence(before, next, selections) {
  const resources = [], changes = [], item_results = [];
  for (const { providerId, modelId, endpointId, associationId } of selections) {
    const provider = byId(next.providers, providerId);
    const prior = byId(catalogueChannels(before, byId(before.providers, providerId), modelId), associationId);
    const current = byId(catalogueChannels(next, provider, modelId), associationId);
    if (!current || !prior) continue;
    fieldsChanged(resources, changes, ref('model_supply', associationId, current.name, 'target'), [['enabled', prior.enabled, current.enabled]]);
    item_results.push({ resource_ref: 'model_supply:' + associationId, status: prior.enabled === current.enabled ? 'unchanged' : 'succeeded' });
    const libraryId = provider.catalogModels?.find(row => row.modelId === modelId)?.libraryId;
    const model = libraryId && libraryRecord(next, libraryId);
    if (model?.id) resources.push(ref('model_material', model.id, model.name, 'related'));
    resources.push(ref('supplier', providerId, provider.name, 'related'),
      ref('supplier_connection', endpointId, current.endpoint?.name, 'related'));
  }
  return { action_code: 'model_supply.disable', resources, changes, item_results,
    request_parameters: { action: 'disable', selected_count: selections.length } };
}

export function auditEvidence(before, next, action, actor, expectedRevision) {
  let evidence;
  if (['serviceRouteConfigure', 'serviceRoutePublish'].includes(action.operation)) evidence = publishEvidence(before, next, action);
  if (action.operation === 'keyGroupCandidateApply') evidence = rotateEvidence(before, next, action.data);
  if (action.operation === 'credentialReplace') {
    const { keyId, providerId, expectedEndpointIds } = action.data;
    const resources = [ref('supplier_key', keyId, null, 'target', 'changed'),
      ref('supplier', providerId, byId(next.providers, providerId)?.name, 'related')];
    const changes = [];
    for (const id of expectedEndpointIds) {
      const endpoint = byId(next.endpoints, id);
      fieldsChanged(resources, changes, ref('supplier_connection', id, endpoint.name, 'related'), [
        ['configuration_version', byId(before.endpoints, id)?.configurationRevision ?? 0, endpoint.configurationRevision],
      ]);
    }
    evidence = { action_code: 'supplier_key.replace', resources, changes,
      request_parameters: { provider_id: providerId, key_id: keyId, expected_connection_count: expectedEndpointIds.length } };
  }
  if (action.operation === 'supplierSelection' && action.data.action === 'disable') evidence = disableEvidence(before, next, action.data.selections);
  if (!evidence) return null;
  evidence.resources = [...new Map(evidence.resources.map(resource => [resource.type + ':' + resource.id, resource])).values()];
  return { ...evidence, request_parameters: { expected_revision: expectedRevision, ...evidence.request_parameters },
    actor_name: actor.name, actor_role: actor.role };
}
