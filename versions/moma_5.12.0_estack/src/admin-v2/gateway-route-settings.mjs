import { gatewayRouteHeaderIssue } from './gateway-route-headers.mjs';

const modelCode = (state, id) => state.models.find(model => model.id === id)?.modelId || id || '';

function endpointLabel(state, endpoint) {
  const provider = state.providers.find(row => row.id === endpoint.providerId ||
    row.catalogConnections?.some(item => item.endpointId === endpoint.id && !item.deletedAt));
  return provider?.name || endpoint.name || endpoint.endpointId || endpoint.id;
}

export function gatewayRouteEndpoints(state) {
  const endpoints = state.endpoints.filter(endpoint => !endpoint.deletedAt);
  const names = endpoints.map(endpoint => endpointLabel(state, endpoint));
  const labels = endpoints.map((endpoint, index) => names.indexOf(names[index]) === names.lastIndexOf(names[index])
    ? names[index] : `${names[index]} · ${endpoint.name || endpoint.endpointId || endpoint.id}`);
  return endpoints.map((endpoint, index) => ({
    value: endpoint.id, label: labels.indexOf(labels[index]) === labels.lastIndexOf(labels[index])
      ? labels[index] : `${labels[index]}（${endpoint.endpointId || endpoint.id}）`,
  }));
}

export function gatewayRouteRows(state) {
  const providerName = id => {
    const endpoint = state.endpoints.find(row => row.id === id);
    return endpoint ? endpointLabel(state, endpoint) : id;
  };
  return state.routes.map(route => {
    const providers = route.targets.map(target => {
      const name = providerName(target.endpointId);
      return route.targets.length === 1 ? name : `${name}: ${target.weight}%`;
    });
    if (route.degrade) providers.push('→ ' + providerName(route.degrade.endpointId));
    return {
      id: route.id,
      name: route.name || route.routeId,
      pathMatch: route.pathMatch,
      modelMatch: route.modelMatch ?? { mode: 'exact', value: modelCode(state, route.modelId) },
      providerNames: providers,
    };
  });
}

export function routeTarget(formKey) {
  return { formKey, endpointId: '', weight: '', mapping: '', passMultimodal: false, passPath: '' };
}

export function gatewayRouteDraft(state, route) {
  const model = modelCode(state, route?.modelId);
  return {
    name: route?.name || route?.routeId || '',
    path: route?.pathMatch?.value ?? (route ? '' : '/'),
    targets: route?.targets.map((target, index) => ({
      ...routeTarget(String(index)), ...target,
      mapping: target.mapping ?? (model ? model + '=' + model : ''),
    })) ?? [routeTarget('0')],
    headersEnabled: Boolean(route?.requestHeaders),
    headers: route?.requestHeaders?.entries?.map((entry, index) => ({ ...entry, formKey: String(index) })) ?? [],
    degradeEnabled: Boolean(route?.degrade),
    degradeCodes: route?.degrade?.codes ?? [],
    degradeEndpointId: route?.degrade?.endpointId ?? '',
    degradeMapping: route?.degrade?.mapping ?? '',
  };
}

function parseMappings(text) {
  const mappings = text.trim().split(/[\n,，]+/u).map(line => line.split('=').map(word => word.trim()));
  if (mappings.some(parts => parts.length !== 2 || parts.some(part => !part || /\s/u.test(part)))) {
    throw Error('请设置完整的模型 ID 映射规则。');
  }
  return mappings.map(([source, target]) => ({ source, target }));
}

export const gatewayRouteNameHint = '包含小写字母、数字以及特殊字符(- .)，且不能以特殊字符开头和结尾';
export const validGatewayRouteName = name => /^[a-z0-9](?:[a-z0-9.-]{0,61}[a-z0-9])?$/.test(name.trim());

export function gatewayRouteRecord(state, draft, previous, id) {
  const name = draft.name.trim();
  const path = draft.path.trim();
  if (!previous && !validGatewayRouteName(name)) throw Error(gatewayRouteNameHint);
  if (state.routes.some(route => route.id !== previous?.id && (route.name || route.routeId) === name)) {
    throw Error('路由名称已存在。');
  }
  if (!path.startsWith('/') || /\s/u.test(path)) throw Error('请填写以 / 开头的路径。');
  const targets = draft.targets.map(({ endpointId, weight, mapping, passMultimodal, passPath }) => ({
    ...previous?.targets.find(target => target.endpointId === endpointId),
    endpointId, weight: weight === '' ? NaN : Number(weight), mapping: mapping.trim(), passMultimodal,
    passPath: passMultimodal ? passPath.trim() : '',
  }));
  if (!targets.length || targets.some(target => !target.endpointId || !Number.isInteger(target.weight) || target.weight < 0 || target.weight > 100) ||
      targets.reduce((sum, target) => sum + target.weight, 0) !== 100) {
    throw Error('请选择目标服务商，各项请求比例须为整数且合计 100%。');
  }
  if (targets.some(target => target.passMultimodal && (!target.passPath.startsWith('/') || /\s/u.test(target.passPath)))) {
    throw Error('请填写以 / 开头的透传路径前缀。');
  }
  if (new Set(targets.map(target => target.endpointId)).size !== targets.length) throw Error('目标服务端点不能重复。');
  const mappings = targets.flatMap(target => parseMappings(target.mapping));
  const aliases = [...new Set(mappings.map(mapping => mapping.target))];
  if (aliases.length !== 1) throw Error('各目标服务须使用同一个映射后的模型 ID。');
  const codes = [aliases[0], ...mappings.map(mapping => mapping.source)];
  const candidateIds = codes.map(code => state.models.find(model => model.modelId === code)?.id);
  if (previous && codes.includes(modelCode(state, previous.modelId))) candidateIds.push(previous.modelId);
  const modelId = candidateIds.find(id => id && targets.every(target => {
    const endpoint = state.endpoints.find(row => !row.deletedAt && row.id === target.endpointId);
    const legacyTarget = previous?.modelId === id && previous.targets.some(row => row.endpointId === target.endpointId);
    return endpoint && (legacyTarget || endpoint.modelIds?.includes(id));
  }));
  if (!modelId) throw Error('目标端点须关联同一个已登记的请求模型。');
  let requestHeaders = null;
  if (draft.headersEnabled) {
    const entries = draft.headers.map(({ name, value }) => ({ name, value }));
    const issue = gatewayRouteHeaderIssue(entries);
    if (issue) throw Error(issue);
    requestHeaders = { entries: entries.map(({ name, value }) => ({ name: name.trim(), value: value.trim() })) };
  }
  let degrade = null;
  if (draft.degradeEnabled) {
    const endpoint = state.endpoints.find(row => !row.deletedAt && row.id === draft.degradeEndpointId);
    const codes = [...new Set(draft.degradeCodes)];
    if (!endpoint?.modelIds?.includes(modelId) || !codes.length ||
        codes.some(code => code !== '4xx' && code !== '5xx') ||
        parseMappings(draft.degradeMapping).some(mapping => mapping.target !== aliases[0])) {
      throw Error('请补全降级响应码、服务商及对应目标模型。');
    }
    degrade = { endpointId: endpoint.id, codes, mapping: draft.degradeMapping.trim() };
  }
  return {
    ...(previous ?? { id, routeId: name, mode: '加权', status: '已启用', releaseId: null }),
    name, modelId, targets, requestHeaders, degrade,
    pathMatch: { mode: 'prefix', value: path },
    modelMatch: { mode: 'exact', value: aliases[0] },
  };
}
