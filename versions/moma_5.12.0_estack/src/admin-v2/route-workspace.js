import { MOMA_PROVIDER } from './moma-provider.js';
import { routingServices, routingChannels, serviceRoute, routingStatus, activeRouteVersion, lastRouteVersion, emptyRouteConfig, normalizeRouteConfig, routeGroups, ROUTE_ADVANCED_DEFAULTS, ROUTING_STRATEGIES } from './service-routing.js';

export const routeStrategyChoices = () => ['fixed', 'weighted', 'latency'];

export function routeEditConfig(service, route) {
  const saved = (activeRouteVersion(route) || lastRouteVersion(route))?.config;
  // Existing runtime settings survive this UI change; new routes do not enable deferred failover.
  const config = structuredClone(saved || emptyRouteConfig(service));
  return {...config, groups: routeGroups(config), channels: config.channels.map(row => ({...row, groupId: row.groupId || 'P1'})), advanced: {...ROUTE_ADVANCED_DEFAULTS, ...config.advanced}};
}

export function sameRouteConfig(left, right) {
  if (!left || !right) return left === right;
  try { return JSON.stringify(normalizeRouteConfig(left)) === JSON.stringify(normalizeRouteConfig(right)); }
  catch { return false; }
}

export function routeChangeRows(before, after, channels) {
  const rows = [];
  const add = (label, previous, next) => { if (previous !== next) rows.push({label, before: previous ?? '未配置', after: next ?? '未配置'}); };
  add('路由策略', ROUTING_STRATEGIES[before?.strategy], ROUTING_STRATEGIES[after?.strategy]);
  const describe = (row, config) => {
    if (!row) return '未加入';
    if (!row.enabled) return '未参与';
    const group = routeGroups(config).find(item => item.id === row.groupId);
    const strategy = config.strategy === 'priority_weighted' ? group?.strategy : config.strategy;
    return [config.strategy === 'priority_weighted' ? `${group?.name || row.groupId} · ${ROUTING_STRATEGIES[strategy]}` : '', strategy === 'weighted' ? `${row.weight}%` : '参与', `顺序 ${row.priority}`].filter(Boolean).join(' · ');
  };
  const previous = before ? normalizeRouteConfig(before) : null, next = normalizeRouteConfig(after);
  for (const id of new Set([...(previous?.channels || []).map(row => row.supplyId), ...next.channels.map(row => row.supplyId)])) {
    const channel = channels.find(item => item.id === id);
    add(channel ? `${channel.provider?.name || ''} · ${channel.channelName || channel.channelId}` : id, describe(previous?.channels.find(row => row.supplyId === id), previous), describe(next.channels.find(row => row.supplyId === id), next));
  }
  if (previous) {
    add('优先级组顺序', previous.groups.map(row => row.id).join(' → '), next.groups.map(row => row.id).join(' → '));
    for (const [key, label] of [['autoFailover','故障转移'],['excludeAbnormal','排除异常渠道'],['autoRecover','自动恢复']]) add(label, previous[key] ? '开启' : '关闭', next[key] ? '开启' : '关闭');
    for (const [key,label] of [['timeoutSeconds','超时（秒）'],['maxRetries','重试次数'],['failureThreshold','连续失败阈值'],['recoverySeconds','恢复间隔（秒）'],['latencyWindowSeconds','延迟窗口（秒）'],['costBasis','成本口径']]) add(label, String(previous.advanced[key]), String(next.advanced[key]));
  }
  return rows;
}

export function changeRouteStrategy(config, strategy) {
  const selected = config.channels.find(row => row.enabled)?.supplyId;
  return {...config, strategy, channels: config.channels.map(row => ({...row, groupId:'P1', enabled: strategy === 'fixed' ? row.supplyId === selected : row.enabled})), groups:[{id:'P1',name:'默认组',strategy}]};
}

export function routeTableRows(state, model, serviceId) {
  return routingServices(state).filter(service => service.modelId === model.id && (!serviceId || service.id === serviceId)).flatMap(service => {
    const route=serviceRoute(state,service.id),current=activeRouteVersion(route),last=lastRouteVersion(route),config=(current || last)?.config,channels=routingChannels(state,service),status=routingStatus(state,service);
    const rows=config?.channels.filter(row=>row.enabled) || [],displayed=rows.length ? rows : [null];
    const provider=service.providerId ? model.serviceProviders?.find(row=>row.providerId===service.providerId) : null;
    const providerName=service.providerId ? service.name : state.providers.find(row=>row.id===MOMA_PROVIDER.id)?.name || MOMA_PROVIDER.name;
    return displayed.map((row,index)=>({id:service.id+':'+(row?.supplyId || 'empty'),service,config,current,last,status,provider,providerName,rows,row,channel:row && channels.find(item=>item.id===row.supplyId),span:index===0 ? displayed.length : 0}));
  });
}
