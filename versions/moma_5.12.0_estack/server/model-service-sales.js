import { isResourceId, resourceId } from '../src/resource-id.mjs';
import { activeModelServiceSalePrice, matchingModelServicePrices, modelServiceSaleActive } from '../src/admin-v2/model-service-sale.mjs';
import { registeredServiceUpstreams } from '../src/admin-v2/service-model-mappings.js';
import { channelBlockReason, channelFingerprint } from '../src/admin-v2/provider-channels.js';
import { activeChannelProcurement, channelProcurementSnapshot } from '../src/admin-v2/channel-change-management.js';
import { serviceChannelCosts } from '../src/admin-v2/service-workspace.js';
import { validContextLength } from '../src/admin-v2/model-services-new.js';
import { activeSupplyPrice } from '../src/admin-v2/model-management.js';
import { platformPriceVersions } from '../src/admin-v2/platform-service-client.js';
import { retailItems, serviceScope } from '../src/admin-v2/service-commercial.js';
import { loadModelWorkspace } from './model-repository.js';
import { receipt, save } from './model-commands.js';

const fail = (status, code, message) => { throw Object.assign(new Error(message), { status, code }); };
const invalid = message => fail(400, 'INVALID_INPUT', message);
const conflict = () => fail(409, 'REVISION_CONFLICT', '售卖配置已更新，请核对最新配置');
const canonical = value => value && typeof value === 'object' && !Array.isArray(value)
  ? Object.fromEntries(Object.keys(value).sort().map(key => [key, canonical(value[key])]))
  : Array.isArray(value) ? value.map(canonical) : value;

export const legacyModelServiceOfferId = `COALESCE(NULLIF(json_extract(s.record_json,'$.controlledOfferId'),''),
    (SELECT record_id FROM offers WHERE record_id=s.id),
    (SELECT record_id FROM offers WHERE id=s.call_id ORDER BY retired_at IS NOT NULL,record_id LIMIT 1))`;
const serviceSaleColumns = `s.record_json AS service_json, s.id AS service_id,
  p.record_json, p.revision, ${legacyModelServiceOfferId} AS legacy_offer_id`;
const serviceProjection = ({ id, name, callId, type, listed }) => ({ id, name, callId, type, listed });
const savedSale = row => row?.record_json ? { ...JSON.parse(row.record_json), revision: row.revision } : null;
const unlistedSale = serviceId => ({ id: serviceId, serviceId, stage: 'unlisted', grayTenantIds: [], prices: [] });

function usablePrices(price, service, label, at) {
  try { return platformPriceVersions(price, service, label, at); } catch { return null; }
}

function channelCost(workspace, channel, at) {
  const version = activeChannelProcurement(channel, at);
  if (version) {
    return {
      costPrice: {
        id: version.id, items: serviceChannelCosts(channel, at),
        effectiveAt: version.effectiveAt, expiresAt: version.expiresAt,
      },
      procurementSnapshot: channelProcurementSnapshot(channel, at),
    };
  }
  if (version === undefined) {
    const explicitSupply = workspace.modelSupplies.find(row => row.channelId === channel.id && row.status === '已启用');
    const costPrice = explicitSupply && activeSupplyPrice(workspace, explicitSupply.id, at);
    if (costPrice?.id) return { costPrice, procurementSnapshot: {
      versionId: costPrice.id, version: costPrice.version ?? null, selectedAt: new Date(at).toISOString(),
      effectiveAt: costPrice.effectiveAt, expiresAt: costPrice.expiresAt || null,
    } };
  }
  return { costPrice: null, procurementSnapshot: null };
}

// This is the same registered upstream and configuration fingerprint used to save a model service.
export function modelServiceSupply(workspace, service, at = Date.now(), contextTokens = null, { runtime = false, upstreams } = {}) {
  const byId = upstreams || new Map(registeredServiceUpstreams(workspace).map(row => [row.id, row]));
  return (service.channels || []).flatMap(configuration => {
    if (!configuration.enabled || configuration.simulated
      || (contextTokens !== null && (!validContextLength(configuration.context) || configuration.context < contextTokens))) return [];
    const channel = byId.get(configuration.channelId);
    if (!channel || (runtime ? channelBlockReason(channel.provider, channel, { runtime }) : channel.reason)
      || channelFingerprint(channel) !== configuration.fingerprint) return [];
    const { costPrice, procurementSnapshot } = channelCost(workspace, channel, at);
    return [{
      ...configuration, channel, costPrice, procurementSnapshot,
      costPrices: usablePrices(costPrice, service, '服务商成本价', at),
    }];
  }).sort((a, b) => a.priority - b.priority);
}

function saleChecks(workspace, service, sale, at, upstreams) {
  const salePrices = usablePrices(activeModelServiceSalePrice(sale, at), service, '模型刊例价', at);
  const supply = modelServiceSupply(workspace, service, at, null, { upstreams });
  const missingCosts = supply.filter(row => !row.costPrices);
  const differentMeasures = salePrices && supply.find(row => row.costPrices && !matchingModelServicePrices(row.costPrices, salePrices));
  return [
    { label: '模型服务为服务中', passed: service.listed === true, target: 'service' },
    { label: '模型刊例价已发布且生效', passed: Boolean(salePrices), target: 'pricing' },
    { label: '存在已启用且检测通过的上游模型', passed: supply.length > 0, target: 'service' },
    ...missingCosts.map(({ channel }) => ({
      label: `缺少有效服务商成本价：${channel.modelSnapshot?.name || channel.provider.catalogModels?.find(row => row.modelId === channel.modelId)?.name || channel.upstreamModelId}（${channel.upstreamModelId}）`,
      passed: false, warning: true, target: 'cost', connectionId: channel.endpointId, upstreamId: channel.id,
    })),
    ...(salePrices && supply.some(row => row.costPrices) ? [{
      label: '成本价与模型刊例价的计量字段和币种一致', passed: !differentMeasures,
      target: 'cost', connectionId: differentMeasures?.channel.endpointId, upstreamId: differentMeasures?.channel.id,
    }] : []),
  ];
}

export async function loadModelServiceSale(db, serviceId) {
  return savedSale(await db.prepare('SELECT record_json,revision FROM model_service_sales WHERE service_id=?').bind(serviceId).first());
}

export async function readModelServiceSales(db, actor) {
  const { results } = await db.prepare(`SELECT ${serviceSaleColumns}
    FROM new_model_services s LEFT JOIN model_service_sales p ON p.service_id=s.id
    WHERE s.deleted_at IS NULL ORDER BY s.created_at DESC,s.id`).all();
  if (!results.length) return { rows: [] };
  const workspace = await loadModelWorkspace(db, actor, { command: true, simulation: false });
  const upstreams = new Map(registeredServiceUpstreams(workspace).map(row => [row.id, row]));
  const at = Date.now();
  const rows = results.map(row => {
    const service = JSON.parse(row.service_json);
    const sale = savedSale(row) || { ...unlistedSale(row.service_id), revision: 0 };
    const legacy = sale.revision === 0 && row.legacy_offer_id;
    return { ...sale, service: serviceProjection(service),
      ...(legacy && { legacyOfferId: legacy }),
      checks: legacy ? [] : saleChecks(workspace, service, sale, at, upstreams),
    };
  });
  return { rows };
}

const labels = { price: '发布模型刊例价', start: '开售', pause: '停售', scope: '修改灰度租户' };
const actionFields = { price: ['items'], start: ['stage', 'grayTenantIds'], pause: [], scope: ['grayTenantIds'] };
const saleCommandFields = ['action', 'serviceId', 'revision', 'operationId'];

function selectedTenants(workspace, ids) {
  if (!Array.isArray(ids) || ids.length > 1000) invalid('请选择有效的灰度租户');
  try { return serviceScope(workspace, { openScope: 'selected', tenantIds: ids }).tenantIds; }
  catch (error) { invalid(error.message); }
}

export async function changeModelServiceSale(db, actor, body, key) {
  const { action, serviceId, revision, operationId } = body;
  if (typeof action !== 'string' || !Object.hasOwn(actionFields, action) || !isResourceId(serviceId, 'model-service')
    || !Number.isSafeInteger(revision) || revision < 0 || revision >= Number.MAX_SAFE_INTEGER
    || !isResourceId(operationId, 'operation') || key !== operationId
    || Object.keys(body).some(field => !saleCommandFields.includes(field) && !actionFields[action].includes(field))) invalid('模型售卖操作内容无效');

  const hash = Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',
    new TextEncoder().encode(JSON.stringify(canonical(body))))), byte => byte.toString(16).padStart(2, '0')).join('');
  const committed = () => receipt(db, actor, key, hash, operationId);
  const conflictOrReplay = async () => (await committed()) || conflict();
  const replay = await committed();
  if (replay) return replay;

  const [state, services] = await db.batch([
    db.prepare('SELECT commit_seq FROM db_state WHERE id=1'),
    db.prepare(`SELECT ${serviceSaleColumns} FROM new_model_services s
      LEFT JOIN model_service_sales p ON p.service_id=s.id WHERE s.id=? AND s.deleted_at IS NULL`).bind(serviceId),
  ]);
  const row = services.results[0], before = savedSale(row), commitSeq = state.results[0].commit_seq;
  if (!row) fail(404, 'NOT_FOUND', '未找到模型服务');
  if (!before && row.legacy_offer_id) fail(409, 'SALE_EXISTS', '该模型服务已有售卖记录，请维护现有售卖配置');
  if ((before?.revision ?? 0) !== revision) return conflictOrReplay();
  if (!before && action !== 'price') {
    if (action === 'start') fail(409, 'SALE_NOT_READY', '请先发布模型刊例价');
    fail(404, 'NOT_FOUND', '未找到模型售卖');
  }

  const service = JSON.parse(row.service_json), at = Date.now(), time = new Date(at).toISOString();
  const next = before
    ? { ...before, revision: revision + 1, updatedAt: time }
    : { ...unlistedSale(serviceId), revision: 1, createdAt: time, updatedAt: time };
  const workspace = ['price', 'start', 'scope'].includes(action)
    ? await loadModelWorkspace(db, actor, { command: true, simulation: false }) : { commitSeq };
  if (workspace.commitSeq !== commitSeq) return conflictOrReplay();
  if (action === 'price') {
    try {
      const current = activeModelServiceSalePrice(before, at);
      const items = retailItems(workspace, body.items, current?.items);
      const price = { id: resourceId('sale-price'), version: (next.prices.at(-1)?.version || 0) + 1, effectiveAt: time, items };
      if (modelServiceSaleActive(before)) {
        const sold = platformPriceVersions(price, service, '模型刊例价', at);
        const supply = modelServiceSupply(workspace, service, at);
        if (supply.some(route => route.costPrices && !matchingModelServicePrices(route.costPrices, sold))) throw Error('请与可用上游的成本价使用相同计量字段和币种');
      }
      next.prices = [...next.prices, price];
    } catch (error) { invalid(error.message); }
  }
  if (action === 'start') {
    if (!['gray', 'formal'].includes(body.stage)) invalid('请选择有效的开售方式');
    const issues = saleChecks(workspace, service, before, at).filter(check => !check.passed && !check.warning);
    if (issues.length) fail(409, 'SALE_NOT_READY', '请先满足开售条件：' + issues.map(check => check.label).join('、'));
    next.stage = body.stage;
    next.grayTenantIds = body.stage === 'gray' ? selectedTenants(workspace, body.grayTenantIds) : [];
  }
  if (action === 'pause') {
    if (!modelServiceSaleActive(before)) invalid('当前模型服务未在售');
    next.stage = 'paused';
  }
  if (action === 'scope') {
    if (before.stage !== 'gray') invalid('仅灰度在售可修改销售租户');
    next.grayTenantIds = selectedTenants(workspace, body.grayTenantIds);
  }
  const { revision: nextRevision, ...record } = next;
  const write = before
    ? db.prepare('UPDATE model_service_sales SET revision=?,record_json=? WHERE service_id=? AND revision=?')
      .bind(nextRevision, JSON.stringify(record), serviceId, revision)
    : db.prepare('INSERT INTO model_service_sales(service_id,revision,record_json) VALUES(?,?,?)')
      .bind(serviceId, nextRevision, JSON.stringify(record));
  const label = action === 'start' && next.stage === 'gray' ? '灰度开售' : labels[action];
  const audit = {
    id: resourceId('audit-event'), action: label, objectId: serviceId, objectName: service.name,
    actorId: actor.id, actorName: actor.name, actor: actor.role, result: '成功', createdAt: time,
    before: before && { stage: before.stage, grayTenantIds: before.grayTenantIds, priceId: before.prices.at(-1)?.id },
    after: { stage: next.stage, grayTenantIds: next.grayTenantIds, priceId: next.prices.at(-1)?.id },
  };
  return save(db, actor, workspace, key, operationId, hash, 'modelServiceSale.' + action,
    { id: serviceId, revision: nextRevision }, [write], audit, 'model-service-sale');
}
