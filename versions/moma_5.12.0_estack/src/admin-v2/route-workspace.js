import { offerKey, providerOffer } from '../service-access.mjs';
import { unifiedRouteStrategies } from './routing-policy.js';
import { MOMA_PROVIDER } from './moma-provider.js';
import { routingServices, routingChannels, serviceRoute, routingStatus, activeRouteVersion, lastRouteVersion, emptyRouteConfig, normalizeRouteConfig, routeGroups, routeGroupLabel, relativeWeightShares, ROUTE_ADVANCED_DEFAULTS, ROUTING_STRATEGIES } from './service-routing.js';

export const routeStrategyChoices = service => service.mode==='standard' ? unifiedRouteStrategies : ['fixed'];

const shareFormat = new Intl.NumberFormat('zh-CN', {maximumFractionDigits:2});
export const formatRouteShare = share => share == null ? '—' : `${shareFormat.format(share)}%`;

export function routeWeightShares(config) {
  if (config?.strategy !== 'weighted') return new Map();
  const groups = routeGroups(config);
  const selected = config.channels.filter(row => row.enabled !== false && !row.backup);
  return new Map(groups.flatMap(group => [...relativeWeightShares(
    selected.filter(row => (row.groupId ?? groups[0].id) === group.id),
  )]));
}

export function routeEditConfig(service, route) {
  const saved = (activeRouteVersion(route) || lastRouteVersion(route))?.config;
  const config = structuredClone(saved || emptyRouteConfig(service));
  return {...config, groups: routeGroups(config), channels: config.channels.map(row => ({...row, groupId: row.groupId || 'P1'})), advanced: {...ROUTE_ADVANCED_DEFAULTS, ...config.advanced}};
}

export function sameRouteConfig(left, right) {
  if (!left || !right) return left === right;
  try { return JSON.stringify(normalizeRouteConfig(left)) === JSON.stringify(normalizeRouteConfig(right)); }
  catch { return false; }
}

export function routeChangeRows(before, after, channels, explicit = false) {
  const rows = [];
  const add = (label, previous, next) => { if (previous !== next) rows.push({label, before: previous ?? '未配置', after: next ?? '未配置'}); };
  if (!explicit) add('路由策略', ROUTING_STRATEGIES[before?.strategy], ROUTING_STRATEGIES[after?.strategy]);
  const describe = (row, config, shares) => {
    if (!row) return '未加入';
    if (!row.enabled) return '未参与';
    const priority = config.groups.findIndex(item => item.id === row.groupId) + 1;
    if (config.strategy === 'weighted') {
      return `${routeGroupLabel(priority)} · 权重 ${row.weight} · 组内 ${formatRouteShare(shares.get(row.supplyId))}`;
    }
    return `参与 · 顺序 ${row.priority}`;
  };
  const primary = input => normalizeRouteConfig({...input, channels:input.channels.filter(row=>!row.backup)});
  const previous = before ? primary(before) : null, next = primary(after);
  const previousShares = routeWeightShares(previous), nextShares = routeWeightShares(next);
  const ordered = next.strategy === 'weighted' ? next.groups.flatMap(group=>next.channels.filter(row=>row.enabled && row.groupId===group.id)) : [];
  for (const id of new Set([...ordered,...(previous?.channels || []),...next.channels].map(row => row.supplyId))) {
    const channel = channels.find(item => item.id === id);
    add(channel ? `${channel.provider?.name || ''} · ${channel.channelName || channel.channelId}` : id, describe(previous?.channels.find(row => row.supplyId === id), previous, previousShares), describe(next.channels.find(row => row.supplyId === id), next, nextShares));
  }
  if (previous && !explicit) {
    for (const [key,label] of [['timeoutSeconds','超时（秒）'],['maxRetries','重试次数'],['failureThreshold','连续失败阈值'],['recoverySeconds','恢复间隔（秒）'],['latencyWindowSeconds','延迟窗口（秒）'],['costBasis','成本口径']]) add(label, String(previous.advanced[key]), String(next.advanced[key]));
  }
  return rows;
}

export function changeRouteStrategy(config, strategy) {
  const selected = config.channels.find(row => row.enabled)?.supplyId;
  return {...config, strategy, channels: config.channels.map(row => ({...row, groupId:'P1', enabled: strategy === 'fixed' ? row.supplyId === selected : row.enabled})), groups:[{id:'P1',name:'默认组',strategy}]};
}

export function routeTableGroups(state, model, serviceId, draft) {
  const groups = new Map();
  for (const service of routingServices(state).filter(service => service.modelId === model.id && (!serviceId || service.id === serviceId))) {
    const providerId = service.providerId || MOMA_PROVIDER.id;
    if (!groups.has(providerId)) {
      const providerName = state.providers.find(row=>row.id===providerId)?.name
        || (service.providerId ? '服务商已不存在' : MOMA_PROVIDER.name);
      groups.set(providerId, {providerId, providerName, rows:[]});
    }
    const route=serviceRoute(state,service.id),current=activeRouteVersion(route),last=lastRouteVersion(route),status=routingStatus(state,service);
    const editing = draft?.serviceId === service.id;
    const config = editing ? draft.config : (current || last)?.config;
    const channels = editing ? draft.channels : routingChannels(state, service);
    const channelsById = new Map(channels.map(channel => [channel.id, channel]));
    const rows = config?.channels.filter(row => {
      const exists = channelsById.has(row.supplyId);
      return (row.enabled && (editing || current || exists)) || (editing && !row.backup && !exists);
    }) || [];
    const shares = routeWeightShares(config);
    const routeGroupIds = config?.strategy === 'weighted' ? routeGroups(config).map(group => group.id) : [];
    const order = row => routeGroupIds.indexOf(row.groupId ?? routeGroupIds[0]) + 1;
    if (routeGroupIds.length) rows.sort((first, second) => order(first) - order(second));
    const routedIds = new Set(rows.map(row => row.supplyId));
    let displayed = [
      ...rows.map(row => ({row, channel:channelsById.get(row.supplyId)})),
      ...channels.filter(channel => !channel.candidate && !routedIds.has(channel.id)).map(channel => ({row:null, channel})),
    ];
    if (service.mode === 'standard' && routeGroupIds.length) {
      const primary = entry => entry.row?.enabled && !entry.row.backup && order(entry.row) > 0;
      displayed = [...routeGroupIds.flatMap((id,index)=>{
        const members = displayed.filter(entry=>primary(entry) && order(entry.row) === index + 1);
        return [{group:{id, order:index + 1, size:members.length}}, ...members];
      }), ...displayed.filter(entry=>!primary(entry))];
    }
    if (!displayed.length) displayed.push({row:null, channel:null});
    const provider=service.providerId ? providerOffer(model,offerKey(service)) : null;
    groups.get(providerId).rows.push(...displayed.map(({row,channel,group},index)=>({
      id:group ? `route-group:${service.id}:${group.id}` : service.id+':'+(row?.supplyId || channel?.id || 'empty'),
      service,config,current,last,status,provider,row,channel,group,
      groupOrder:row && order(row),share:row && shares.get(row.supplyId),
      span:index===0 ? displayed.length : 0,
    })));
  }
  return [...groups.values()];
}
