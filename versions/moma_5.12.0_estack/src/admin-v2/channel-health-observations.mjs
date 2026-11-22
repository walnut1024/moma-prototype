import { attemptsForMetric, observationGroups, observationKey, observationTime, filterObservations } from './call-observations.mjs';
import { percentile } from './observability.js';

const minuteMs = 60_000;
const dayMs = 86_400_000;
export const availabilityDefinition = '最近3天内服务成功响应请求的平均比例。';

const successPercent = ({ success, count }) => count ? success * 100 / count : null;

export function channelHealthPerformance(rows) {
  const cacheSamples = rows.filter(row => row.input > 0 && Number.isFinite(row.cached));
  const input = cacheSamples.reduce((total, row) => total + row.input, 0);
  const cached = cacheSamples.reduce((total, row) => total + row.cached, 0);
  return {
    ttft: percentile(attemptsForMetric(rows, 'ttft').map(row => row.ttft), 0.5),
    otps: percentile(attemptsForMetric(rows, 'otps').map(row => row.output * 1000 / row.generationDuration), 0.5),
    cacheRate: input ? cached * 100 / input : null,
  };
}

function displayBaseUrl(value) {
  if (typeof value !== 'string' || !URL.canParse(value)) return undefined;
  const url = new URL(value);
  if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password || url.search || url.hash) return undefined;
  return value.trim();
}

function availabilityByChannel(attempts, filters, now) {
  const start = now - 3 * dayMs;
  const healthStart = Math.floor(now / dayMs) * dayMs - 2 * dayMs;
  const groups = observationGroups(filterObservations(attempts, filters, { start, end: now }), 'channelModel');
  return new Map(groups.map(({ id, rows }) => {
    const minutes = new Map();
    const periods = Array.from({ length: 3 }, (_, index) => ({
      label: observationTime(start + index * dayMs).slice(5, 16) + ' 至 ' + observationTime(start + (index + 1) * dayMs).slice(5, 16),
      success: 0, count: 0,
    }));
    let hasHealthObservations = false;
    for (const row of rows) {
      if (row.outcome === 'success' || row.outcome === 'failed') {
        const period = periods[Math.floor((row.at - start) / dayMs)];
        period.count++;
        if (row.outcome === 'success') period.success++;
      }
      if (row.at < healthStart) continue;
      hasHealthObservations = true;
      if ((row.status >= 400 && row.status < 500) ||
          row.code === 'upstream_rate_limit' ||
          (row.outcome !== 'success' && row.outcome !== 'failed')) continue;
      const minute = Math.floor(row.at / minuteMs);
      const bucket = minutes.get(minute) ?? { total: 0, success: 0 };
      bucket.total++;
      if (row.outcome === 'success') bucket.success++;
      minutes.set(minute, bucket);
    }
    let eligible = 0, healthy = 0;
    for (const bucket of minutes.values()) {
      if (bucket.total < 10) continue;
      eligible++;
      if (bucket.success / bucket.total >= 0.8) healthy++;
    }
    const totals = periods.reduce((total, period) => ({ success: total.success + period.success, count: total.count + period.count }),
      { success: 0, count: 0 });
    const health = !hasHealthObservations ? '暂无观测' : !eligible ? '样本不足' : healthy === eligible ? '健康' : '异常';
    return [id, { available: successPercent(totals), health,
      periods: periods.map(period => ({ ...period, rate: successPercent(period) })) }];
  }));
}

export function channelHealthCatalogue(connections, includeCost) {
  return connections.flatMap(({ id, name, status, provider, endpoint, models }) => models.map(cost => {
    const upstreamModelId = cost.association.upstreamModelId;
    return { channelModel: JSON.stringify([provider.id, id, upstreamModelId ?? null]),
      provider: provider.id, providerName: provider.name, channel: id, channelName: name, endpoint: id, upstreamModelId,
      baseUrl: displayBaseUrl(endpoint?.baseUrl),
      enabled: status === '已启用' && cost.association.enabled === true,
      ...(includeCost && { cost: { key: cost.key, status: cost.status,
        items: cost.items.map(({ name, condition, amount, currency, unit }) => ({ name, condition, amount, currency, unit })) } }) };
  }));
}

export function channelHealthRows(catalogue, groups, filters, attempts, now = Date.now()) {
  const availability = availabilityByChannel(attempts, filters, now);
  const rows = new Map(groups.map(group => [group.id, { ...group.rows[0], id: group.id, attempts: group.rows }]));
  for (const item of catalogue) {
    if (filters.supply && !filters.supply.some(([provider, channel]) =>
      (provider === null || provider === item.provider) && (channel === null || channel === item.channel))) continue;
    if (['upstreamModelId', 'endpoint'].some(key => filters[key] && !filters[key].includes(observationKey(item, key)))) continue;
    const row = rows.get(item.channelModel);
    rows.set(item.channelModel, { ...item, id: item.channelModel, attempts: row?.attempts ?? [],
      costs: item.cost ? [...(row?.costs ?? []), item.cost] : undefined, enabled: item.enabled || row?.enabled === true });
  }
  return [...rows.values()].map(row => {
    const uptime = availability.get(row.id);
    return { ...row, ...channelHealthPerformance(row.attempts), count: row.attempts.length,
      baseUrl: row.baseUrl || displayBaseUrl(row.endpointBaseUrl), health: uptime?.health ?? '暂无观测', uptime,
      enabledLabel: row.enabled == null ? null : row.enabled ? '已启用' : '已停用' };
  }).sort((a, b) => Number(b.health === '异常') - Number(a.health === '异常') || b.count - a.count);
}
