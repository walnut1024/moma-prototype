import { modelIdentity, modelServiceIdentity, modelDisplayName } from '../model-identities.mjs';
import { serviceReferences, offerKey } from '../service-access.mjs';
import { modelIdentityCatalogue } from './model-library.js';
import { registeredResourceModels } from './model-resource-registration.js';

export const RESOURCE_SCHEMA = 'moma.model-operations/v2';
export const resourceKey = row => JSON.stringify([row.type, row.provider_id || '', row.id]);

export function validateResourceTarget(state, scope, target) {
  const fields = { module: [], provider: ['provider_id'], model: ['model_id'], provider_model: ['provider_id', 'model_id'], model_service: ['model_service_id'] };
  if (!target || !Object.hasOwn(fields, target.level) || Object.keys(target).sort().join() !== ['level', ...fields[target.level]].sort().join()
    || fields[target.level].some(key => typeof target[key] !== 'string' || !target[key])) throw Error('JSON 对象范围无效');
  if (target.provider_id && !state.providers.some(row => row.id === target.provider_id && !row.deletedAt)) throw Error('指定服务商不存在');
  if (target.model_id && !modelIdentityCatalogue(state).some(row => row.id === target.model_id)) throw Error('指定模型不存在或模型关联不明确');
  if (scope === 'channels') {
    if (target.level === 'model_service') throw Error('模型接入不支持模型服务范围');
    if (target.model_id && !state.providers.filter(row => !row.deletedAt && (!target.provider_id || row.id === target.provider_id)).some(provider => registeredResourceModels(state, provider).some(row => row.model_id === target.model_id))) throw Error('指定模型不属于当前服务商或尚未登记');
  } else {
    if (['provider', 'provider_model'].includes(target.level)) throw Error('当前模块不支持服务商范围');
    const services = serviceReferences(state).filter(row => !row.model.deletedAt && !row.model.archivedAt);
    if (target.model_id && !services.some(row => modelIdentity(state, row.model).id === target.model_id)) throw Error('指定模型没有可维护的服务');
    if (target.model_service_id && !services.some(row => modelServiceIdentity(state, row.model, offerKey(row)) === target.model_service_id)) throw Error('指定模型服务不存在或已归档');
  }
  return target;
}

// URL model values can identify the existing technical configuration; exported targets always use permanent model identities.
export function resourcePageTarget(state, scope, params) {
  if (params.get('resourceJson') === '1' && params.has('resourceTarget')) {
    let target;
    try { target = JSON.parse(params.get('resourceTarget')); } catch { throw Error('JSON 对象范围无效'); }
    validateResourceTarget(state, scope, target);
    const origin = new URLSearchParams(params);
    origin.delete('resourceJson'); origin.delete('resourceTarget');
    const source = resourcePageTarget(state, scope, origin);
    if (source.level !== 'module' && JSON.stringify(Object.entries(source).sort()) !== JSON.stringify(Object.entries(target).sort())) throw Error('JSON 对象范围与来源页面不一致');
    return target;
  }
  const modelId = value => {
    const service = state.models.find(row => row.id === value);
    return service ? modelIdentity(state, service).id : value;
  };
  let target = { level: 'module' };
  if (scope === 'channels') {
    if (params.get('perspective') === 'models' && params.has('supplyModel')) {
      target = { level: 'model', model_id: params.get('supplyModel') };
    } else if (params.has('provider')) target = { level: 'provider', provider_id: params.get('provider') };
  } else if (scope === 'prices' && params.has('service')) {
    const selected = serviceReferences(state).find(row => row.id === params.get('service') || modelServiceIdentity(state, row.model, offerKey(row)) === params.get('service'));
    if (!selected) throw Error('指定模型服务不存在');
    target = { level: 'model_service', model_service_id: modelServiceIdentity(state, selected.model, offerKey(selected)) };
  } else if (params.has('model') && (scope !== 'market' || params.get('resourceJson') === '1')) target = { level: 'model', model_id: modelId(params.get('model')) };
  return validateResourceTarget(state, scope, target);
}

export function resourceTargetLabel(state, scope, target) {
  const module = { channels: '模型接入', services: '模型服务', market: '模型广场', prices: '模型销售' }[scope];
  const provider = target.provider_id && state.providers.find(row => row.id === target.provider_id)?.name;
  const model = target.model_id && modelDisplayName(state, target.model_id);
  const service = target.model_service_id && serviceReferences(state).find(row => modelServiceIdentity(state, row.model, offerKey(row)) === target.model_service_id);
  return target.level === 'module' ? module : [provider, model, service && (service.callId || target.model_service_id)].filter(Boolean).join(' · ');
}

export function selectResourceRows(rows, target) {
  return rows.filter(row => {
    if (target.level === 'module') return true;
    if (target.level === 'provider') return row.type === 'provider' ? row.id === target.provider_id : row.provider_id === target.provider_id;
    if (target.level === 'model_service') return row.id === target.model_service_id && row.type !== 'market_model';
    return row.model_id === target.model_id && (!target.provider_id || row.provider_id === target.provider_id);
  });
}
