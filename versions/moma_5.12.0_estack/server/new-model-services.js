import { effectiveRoutingStrategy, failoverError, failoverValues, globalRoutingStrategies } from '../src/admin-v2/global-routing-parameters.mjs';
import { isResourceId, resourceId } from '../src/resource-id.mjs';
import { MODEL_TYPES, SERVICE_MODEL_TYPES } from '../src/admin-v2/model-management.js';
import { registeredServiceUpstreams } from '../src/admin-v2/service-model-mappings.js';
import { channelFingerprint } from '../src/admin-v2/provider-channels.js';
import { commitAdminState } from '../src/admin-v2/state-transaction.js';
import { domainModel } from '../src/mock/model-fields.js';
import { offerKey, salesPaused } from '../src/service-access.mjs';
import { loadModelWorkspace, modelChanges } from './model-repository.js';
import { legacyModelServiceOfferId } from './model-service-sales.js';
import { marketCardsByModel, marketCardsForService } from '../src/market-cards.mjs';

const types = { ...MODEL_TYPES, ...SERVICE_MODEL_TYPES };
const editable = { name: 120, callId: 128, type: 32, note: 240, description: 300, tags: 160, tokenizer: 120 };
const channelText = { id: 200, channelId: 240, name: 240, provider: 240, upstreamId: 240, fingerprint: 32768 };
const fail = (status, code, message) => { throw Object.assign(new Error(message), { status, code }); };
const invalid = message => fail(400, 'INVALID_INPUT', message);
const conflict = () => fail(409, 'REVISION_CONFLICT', '其他页面已更新模型服务，请载入最新配置');
const object = value => value && typeof value === 'object' && !Array.isArray(value);
const positiveInteger = value => Number.isSafeInteger(value) && value > 0;
const exposedRow = row => {
  const { modelId: _modelId, modelName: _modelName, modelDetails: _modelDetails, ...service } = JSON.parse(row.record_json);
  return { ...service, revision: row.revision };
};

function serviceAudit(before, next, actor, label) {
  const service = next || before;
  const ref = (type, id, name, roles) => ({ type, id, name, roles });
  const value = input => ({ state: 'known', value: input });
  const changes = [];
  const resources = [ref('model_service', service.id, service.name, ['target'])];
  let action_code;
  if (label === '启动服务' || label === '停止服务') {
    action_code = next.listed ? 'model_service.start' : 'model_service.stop';
    resources[0].roles.push('changed');
    changes.push({ resource_ref: 'model_service:' + service.id, field: 'service_running', before: value(before.listed), after: value(next.listed) });
  }
  if (before && next) {
    const oldChannels = new Map(before.channels.map(channel => [channel.id, channel]));
    const currentChannels = new Map(next.channels.map(channel => [channel.id, channel]));
    const status = channel => channel ? channel.enabled ? '已启用' : '已停用' : null;
    for (const id of new Set([...oldChannels.keys(), ...currentChannels.keys()])) {
      const prior = oldChannels.get(id), current = currentChannels.get(id);
      if (status(prior) === status(current)) continue;
      action_code ||= 'service_mapping.update';
      resources.push(ref('service_mapping', id, (current || prior).name, ['related','changed']));
      changes.push({ resource_ref: 'service_mapping:' + id, field: 'status', before: value(status(prior)), after: value(status(current)) });
    }
  }
  return { result: '成功', actorName: actor.name, actor: actor.role, ...(action_code && { platformAudit: { action_code, resources, changes } }) };
}

function readFields(source, limits, previous = {}) {
  const result = {};
  for (const [key, limit] of Object.entries(limits)) {
    if (source[key] === undefined) continue;
    if (typeof source[key] !== 'string' || (source[key].length > limit && source[key] !== previous[key])) invalid('模型服务字段无效：' + key);
    result[key] = source[key];
  }
  return result;
}

export async function newModelServices(db) {
  const { results } = await db.prepare(`SELECT id,revision,CASE WHEN deleted_at IS NULL THEN record_json END AS record_json
    FROM new_model_services ORDER BY created_at DESC,id`).all();
  const stored = await db.prepare("SELECT json_extract(reference_json,'$.globalRoutingParameters') AS policy FROM model_workspace WHERE id=1").first('policy');
  const defaults = JSON.parse(stored ?? '{}');
  return {
    defaults: { ...failoverValues(defaults), strategy: effectiveRoutingStrategy(defaults.strategy) },
    rows: results.filter(row => row.record_json).map(exposedRow),
    deletedIds: results.filter(row => !row.record_json).map(row => row.id),
  };
}

async function lifecycleCheck(db, row) {
  const [workspace, sales, offers, references] = await db.batch([
    db.prepare("SELECT json_extract(meta_json,'$.modelData.marketCards') AS cards FROM model_workspace WHERE id=1"),
    db.prepare('SELECT revision,record_json FROM model_service_sales WHERE service_id=?').bind(row.id),
    db.prepare(`SELECT o.record_id, o.listing_stage, o.material_id, s.record_json,
      (o.listing_stage IN ('gray','formal') AND o.market_visible=1 AND s.market_visible=1) AS listed
      FROM offers o JOIN services s ON s.id=o.service_id
      WHERE o.record_id=? AND o.retired_at IS NULL AND s.deleted_at IS NULL`).bind(row.controlledOfferId || ''),
    db.prepare(`SELECT EXISTS (SELECT 1 FROM model_service_orders WHERE service_id=? AND cancelled_at IS NULL)
        OR EXISTS (SELECT 1 FROM market_orders WHERE offer_id=? AND cancelled_at IS NULL) AS ordered,
      EXISTS (SELECT 1 FROM token_package_records p, json_each(p.record_json,'$.modelIds') model
        WHERE p.collection='tokenPackages' AND model.value IN (?,?)) AS packaged,
      EXISTS (SELECT 1 FROM new_model_services s
        JOIN offers o ON o.record_id=${legacyModelServiceOfferId}
        JOIN services owner ON owner.id=o.service_id
        WHERE s.id=? AND o.retired_at IS NULL AND owner.deleted_at IS NULL
          AND (o.active_sale_price_id IS NOT NULL OR o.listing_stage <> 'unlisted')) AS legacySale`)
      .bind(row.id,row.controlledOfferId || '',row.id,row.controlledOfferId || '',row.id),
  ]);
  const cards = JSON.parse(workspace.results[0]?.cards || '{}');
  const offer = offers.results[0];
  const cardRefs = marketCardsForService(cards,row.id).map(({card}) => ({card,id:row.id}));
  if (offer) cardRefs.push(...marketCardsForService(cards,offer.record_id).map(({card}) => ({card,id:offer.record_id})));
  const legacyDefault = Boolean(offer?.listed && !marketCardsByModel(cards).has(offer.material_id));
  const marketLinked = cardRefs.length > 0 || legacyDefault;
  const marketListed = cardRefs.some(({card,id}) => card.status === 'listed' && card.shown?.includes(id))
    || legacyDefault && !cardRefs.some(({id}) => id === offer.record_id);
  const model = offer ? domainModel(JSON.parse(offer.record_json), true) : null;
  const key = model?.serviceMode === 'provider'
    ? offerKey(model.serviceProviders?.find(entry => entry.callId === row.callId && entry.status !== '已移除')) : '';
  const saleRow = sales.results[0];
  const modernStage = saleRow && JSON.parse(saleRow.record_json).stage;
  const legacyStage = offer && !salesPaused(model,key) ? offer.listing_stage : null;
  const stage = saleRow ? modernStage : legacyStage;
  const sale = ['gray','formal'].includes(stage)
    ? { id: saleRow ? row.id : offer.record_id, name: row.name, callId: row.callId,
      status: stage === 'gray' ? '灰度在售' : '在售', ...(saleRow && { revision:saleRow.revision }) }
    : null;
  const { ordered, packaged, legacySale } = references.results[0];
  return { marketLinked, marketListed, saleRow, sale, offer, model, key,
    stopIssue: marketListed ? '请先在模型广场取消展示该服务' : '',
    deleteIssue: row.listed ? '请先停止模型服务'
      : saleRow || legacySale ? '该模型服务已配置模型售卖，不能删除'
        : marketLinked ? '请先解除模型广场关联' : row.grants?.length ? '请先移除租户授权'
        : ordered ? '该模型服务仍有有效订单' : packaged ? '该模型服务仍被套餐引用' : '' };
}

export async function inspectNewModelService(db, id) {
  if (!isResourceId(id, 'model-service')) invalid('模型服务 ID 无效');
  const row = await db.prepare('SELECT record_json,revision FROM new_model_services WHERE id=? AND deleted_at IS NULL').bind(id).first();
  if (!row) fail(404, 'NOT_FOUND', '未找到模型服务');
  const { marketLinked, marketListed, stopIssue, deleteIssue, sale } = await lifecycleCheck(db, exposedRow(row));
  return { revision: row.revision, marketLinked, marketListed, stopIssue, deleteIssue, sale };
}

export async function changeNewModelService(db, actor, command, key) {
  const { action, id, revision, row, operationId, expectedSale = null } = command;
  if (!['save', 'import', 'delete'].includes(action) || !isResourceId(id, 'model-service')
    || !Number.isSafeInteger(revision) || revision < 0 || revision >= Number.MAX_SAFE_INTEGER
    || !isResourceId(operationId, 'operation') || key !== operationId
    || (action === 'delete' ? row !== undefined || revision === 0 : !object(row) || row.id !== id)
    || (action === 'import' && revision !== 0)) invalid('模型服务操作内容无效');

  const hash = Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',
    new TextEncoder().encode(JSON.stringify(command)))), byte => byte.toString(16).padStart(2, '0')).join('');
  const replay = async () => {
    const receipt = await db.prepare('SELECT request_hash,response_json FROM operations WHERE actor_id=? AND idempotency_key=?').bind(actor.id, key).first();
    if (!receipt) return null;
    if (receipt.request_hash !== hash) fail(409, 'IDEMPOTENCY_CONFLICT', '此操作已用于其他请求');
    return JSON.parse(receipt.response_json);
  };
  const committed = await replay();
  if (committed) return committed;

  const [state, rows] = await db.batch([
    db.prepare('SELECT commit_seq FROM db_state WHERE id=1'),
    db.prepare('SELECT * FROM new_model_services WHERE id=?').bind(id),
  ]);
  const seq = state.results[0].commit_seq, prior = rows.results[0];
  if (prior && action === 'import' && prior.imported) {
    return prior.deleted_at == null ? { id, row: exposedRow(prior) } : { id, row: null };
  }
  if (prior?.deleted_at != null || (prior?.revision ?? 0) !== revision) conflict();
  const before = prior ? JSON.parse(prior.record_json) : null;
  const at = Date.now();
  let next, write, label;
  const cascade = [];
  if (action === 'delete') {
    const check = await lifecycleCheck(db, before);
    if (check.deleteIssue) invalid(check.deleteIssue);
    write = db.prepare('UPDATE new_model_services SET deleted_at=?,revision=revision+1 WHERE id=?').bind(at, id);
    label = '删除模型服务';
  } else {
    const imported = action === 'import';
    if (!imported && Object.hasOwn(row, 'serviceMode')) invalid('模型服务不接受服务模式设置');
    if (!imported && (row.modelId || row.modelName || row.modelDetails !== undefined)) invalid('模型服务只关联上游模型');
    const config = readFields(row, imported ? { ...editable, description: 1200 } : editable, before || {});
    const routingStrategy = row.routingStrategy === undefined ? before?.routingStrategy : row.routingStrategy;
    if (routingStrategy !== undefined && routingStrategy !== before?.routingStrategy
      && !globalRoutingStrategies.includes(routingStrategy)) invalid('请选择有效的路由策略');
    const routingCustom = row.routingCustom ?? before?.routingCustom ?? false;
    const failoverCustom = row.failoverCustom ?? before?.failoverCustom ?? false;
    const failover = row.failover ?? before?.failover;
    if (typeof routingCustom !== 'boolean' || typeof failoverCustom !== 'boolean' ||
        (routingCustom && !routingStrategy) || ((failoverCustom || failover !== undefined) && failoverError(failover))) invalid('模型服务策略无效');
    if (!config.name?.trim() || !/^[A-Za-z0-9][A-Za-z0-9._:/-]{0,127}$/.test(config.callId || '')
      || (config.type && config.type !== 'other' && !Object.hasOwn(types, config.type)) || !Array.isArray(row.channels)
      || typeof row.listed !== 'boolean' || (row.contextPaused !== undefined && typeof row.contextPaused !== 'boolean')) invalid('模型服务基本信息无效');
    if (before && config.callId !== before.callId) invalid('模型 ID 创建后无法变更');
    if (!before) {
      const collision = await db.prepare(`SELECT 1 FROM new_model_services WHERE call_id=?
        UNION ALL SELECT 1 FROM offers WHERE id=? LIMIT 1`).bind(config.callId,config.callId).first();
      if (collision) fail(409,'DUPLICATE_CALL_ID','模型 ID已存在');
    }
    const statusChanged = before && before.listed !== row.listed;
    if (statusChanged) {
      const check = await lifecycleCheck(db, before);
      if (!row.listed && check.stopIssue) invalid(check.stopIssue);
      if (!row.listed) {
        const sale = check.sale;
        if ((sale?.id ?? null) !== (expectedSale?.id ?? null) || sale?.status !== expectedSale?.status
          || sale?.revision !== expectedSale?.revision) conflict();
        if (sale && check.saleRow) {
          const event = { id:resourceId('audit-event'), action:'因停服自动停售', objectId:sale.id, objectLabel:sale.name,
            actorId:actor.id, actorName:actor.name, actor:actor.role, result:'成功', sourceModelServiceId:id };
          cascade.push(
            db.prepare(`UPDATE model_service_sales SET revision=revision+1,
              record_json=json_set(record_json,'$.stage','paused','$.updatedAt',?) WHERE service_id=? AND revision=?`)
              .bind(new Date(at).toISOString(),id,sale.revision),
            db.prepare('INSERT INTO audit_events(id,operation_id,entity_type,entity_id,action,diff_json,created_at,record_json) VALUES(?,?,?,?,?,?,?,?)')
              .bind(event.id,operationId,'model-operations',sale.id,event.action,
                JSON.stringify({ before:sale.status, after:'已停售', sourceModelServiceId:id }),at,JSON.stringify(event)),
          );
        } else if (sale) {
          const workspace = await loadModelWorkspace(db, actor, { simulation: false });
          if (workspace.commitSeq !== seq) conflict();
          const stopped = commitAdminState(workspace, {
            type: 'modelOperations', operation: 'pauseSales', modelId: check.model.id,
            data: { offerKey: check.key, confirmed: true, expectedUpdatedAt: check.model.updatedAt },
          }, actor.role);
          const event = { ...stopped.audits[0], action: '因停服自动停售', objectId: sale.id, objectLabel: sale.name,
            actorId: actor.id, actorName: actor.name, sourceModelServiceId: id };
          cascade.push(...modelChanges(db, workspace, stopped),
            db.prepare('INSERT INTO audit_events(id,operation_id,entity_type,entity_id,action,diff_json,created_at,record_json) VALUES(?,?,?,?,?,?,?,?)')
              .bind(event.id, operationId, 'model-operations', sale.id, event.action,
                JSON.stringify({ before: sale.status, after: '已停售', sourceModelServiceId: id }), at, JSON.stringify(event)),
            db.prepare('INSERT INTO audit_models(audit_id,material_id,created_at) VALUES(?,?,?)').bind(event.id, check.offer.material_id, at));
        }
      }
    }
    if (!prior && !imported && (row.listed || row.channels.length)) invalid('请先创建模型服务');
    const channels = row.channels.map(channel => {
      if (!object(channel) || !isResourceId(channel.id, 'service-channel') || typeof channel.enabled !== 'boolean'
        || !Number.isSafeInteger(channel.priority) || channel.priority < 0 || !positiveInteger(channel.weight)
        || !channel.channelId || !channel.fingerprint
        || (channel.context != null && !positiveInteger(channel.context))
        || (channel.simulated !== undefined && typeof channel.simulated !== 'boolean')) invalid('上游模型配置无效');
      return { ...readFields(channel, channelText), enabled: channel.enabled, priority: channel.priority, weight: channel.weight,
        ...(channel.context !== undefined && { context: channel.context }),
        ...(channel.simulated && { simulated: true }) };
    });
    if (new Set(channels.map(channel => channel.id)).size !== channels.length
      || new Set(channels.map(channel => channel.channelId)).size !== channels.length) invalid('上游模型重复');
    if (!imported && config.tokenizer && !row.contextPaused && channels.some(channel => channel.enabled && !positiveInteger(channel.context))) {
      invalid('请为每条已启用的上游模型配置上下文长度');
    }
    const priorities = row.priorityGroups === undefined ? before?.priorityGroups : row.priorityGroups;
    if (priorities !== undefined && (!Array.isArray(priorities) || priorities.some(value => !Number.isSafeInteger(value) || value < 0)
      || new Set(priorities).size !== priorities.length)) invalid('优先级组需为不重复的非负整数');
    const previousChannels = new Map(before?.channels.map(channel => [channel.id, channel]));
    const verify = channels.filter(channel => {
      const saved = previousChannels.get(channel.id);
      return !saved || saved.channelId !== channel.channelId || saved.fingerprint !== channel.fingerprint
        || saved.simulated !== channel.simulated || !saved.enabled && channel.enabled;
    });
    const releaseChanged = row.listed && (!before?.listed || JSON.stringify(channels) !== JSON.stringify(before.channels));
    if (releaseChanged || (!imported && verify.length)) {
      const workspace = await loadModelWorkspace(db, actor, { simulation: false });
      const candidates = registeredServiceUpstreams(workspace);
      const usable = channel => !channel.simulated && candidates.some(candidate =>
        candidate.id === channel.channelId && !candidate.reason && channelFingerprint(candidate) === channel.fingerprint);
      for (const channel of imported ? [] : verify) {
        if (channel.simulated) {
          if (!['1', '2', '3'].some(index => channel.channelId === 'mock-service-channel:' + id + ':' + index)
            || channel.fingerprint !== channel.channelId) invalid('模拟连接无效');
        } else if (!usable(channel)) invalid('上游模型不可用，请更新连接配置');
      }
      if (releaseChanged && !channels.some(channel => channel.enabled && usable(channel))) invalid('请先关联并启用测试通过的上游模型');
    }
    if (imported && (!Number.isFinite(Date.parse(row.createdAt)) || typeof row.createdBy !== 'string' || !row.createdBy
      || (row.grants !== undefined && (!Array.isArray(row.grants) || row.grants.some(grant => !object(grant) || typeof grant.tenantId !== 'string')))
      || (row.limits !== undefined && !object(row.limits))
      || (row.batch != null && !object(row.batch)))) invalid('浏览器原有记录格式无效');
    const history = imported ? row : before;
    next = { id, ...config, listed: row.listed, channels,
      ...(priorities !== undefined && { priorityGroups: [...new Set([...priorities, ...channels.map(channel => channel.priority)])].sort((a,b) => a-b) }),
      ...(before?.controlledOfferId && { controlledOfferId:before.controlledOfferId }),
      routingCustom, failoverCustom, ...(failover && { failover: failoverValues(failover) }),
      ...(routingStrategy !== undefined && { routingStrategy }),
      ...(row.contextPaused !== undefined && { contextPaused: row.contextPaused }),
      ...Object.fromEntries(['grants','limits','batch','modelId','modelName','modelDetails']
        .filter(name => history && Object.hasOwn(history, name)).map(name => [name, history[name]])),
      createdBy: history?.createdBy || actor.name, createdAt: history?.createdAt || new Date(at).toISOString() };
    write = prior
      ? db.prepare('UPDATE new_model_services SET call_id=?,record_json=?,revision=revision+1 WHERE id=?').bind(next.callId, JSON.stringify(next), id)
      : db.prepare('INSERT INTO new_model_services (id,call_id,revision,record_json,created_at,imported) VALUES (?,?,1,?,?,?)')
        .bind(id, next.callId, JSON.stringify(next), Date.parse(next.createdAt), Number(imported));
    label = statusChanged ? row.listed ? '启动服务' : '停止服务'
      : imported ? '导入模型服务' : prior ? '保存模型服务' : '创建模型服务';
  }

  const response = { id, row: next ? exposedRow({ record_json:JSON.stringify(next), revision:revision+1 }) : null };
  try {
    await db.batch([
      db.prepare('INSERT INTO operations(id,actor_id,session_id,idempotency_key,command,request_hash,expected_commit_seq,http_status,response_json,created_at) VALUES(?,?,?,?,?,?,?,?,?,?)')
        .bind(operationId, actor.id, actor.session_id, key, 'new-model-service.' + action, hash, seq, 200, JSON.stringify(response), at),
      write,
      ...cascade,
      db.prepare('INSERT INTO audit_events(id,operation_id,entity_type,entity_id,action,diff_json,created_at,record_json) VALUES(?,?,?,?,?,?,?,?)')
        .bind(resourceId('audit-event'), operationId, 'new-model-service', id, label,
          JSON.stringify({ before: revision || null, after: next ? revision + 1 : null }), at, JSON.stringify(serviceAudit(before, next, actor, label))),
    ]);
  } catch (error) {
    if (String(error).includes('session_invalid')) fail(401, 'SESSION_EXPIRED', '会话已失效');
    if (String(error).includes('new_model_services.call_id')) fail(409, 'DUPLICATE_CALL_ID', '模型 ID已存在');
    if (/commit_conflict|UNIQUE constraint/.test(String(error))) {
      const result = await replay();
      if (result) return result;
      conflict();
    }
    throw error;
  }
  return response;
}
