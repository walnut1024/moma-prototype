import { failoverError, failoverValues, initialRoutingParameters, globalPolicyDefaults } from '../src/admin-v2/global-routing-parameters.mjs';
import { isResourceId, resourceId } from '../src/resource-id.mjs';
import { MODEL_TYPES, SERVICE_MODEL_TYPES } from '../src/admin-v2/model-management.js';
import { mappingCandidates } from '../src/admin-v2/service-model-mappings.js';
import { channelFingerprint } from '../src/admin-v2/provider-channels.js';
import { modelLibrary, modelMaterial } from '../src/admin-v2/model-library.js';
import { serviceModelFields } from '../src/admin-v2/model-services-new.js';
import { ROUTING_STRATEGIES } from '../src/admin-v2/service-routing-strategies.mjs';
import { loadModelWorkspace } from './model-repository.js';
import { marketCardsByModel } from '../src/market-cards.mjs';

const types = { ...MODEL_TYPES, ...SERVICE_MODEL_TYPES };
const editable = { name: 120, callId: 128, modelId: 200, modelName: 240, type: 32, note: 240, description: 300, tags: 160, tokenizer: 120 };
const channelText = { id: 200, channelId: 240, name: 240, provider: 240, upstreamId: 240, fingerprint: 32768 };
const fail = (status, code, message) => { throw Object.assign(new Error(message), { status, code }); };
const invalid = message => fail(400, 'INVALID_INPUT', message);
const conflict = () => fail(409, 'REVISION_CONFLICT', '其他页面已更新模型服务，请载入最新配置');
const object = value => value && typeof value === 'object' && !Array.isArray(value);
const positiveInteger = value => Number.isSafeInteger(value) && value > 0;
const exposedRow = row => ({ ...JSON.parse(row.record_json), revision: row.revision });

function readFields(source, limits, previous = {}) {
  const result = {};
  for (const [key, limit] of Object.entries(limits)) {
    if (source[key] === undefined) continue;
    if (typeof source[key] !== 'string' || (source[key].length > limit && source[key] !== previous[key])) invalid('模型服务字段无效：' + key);
    result[key] = source[key];
  }
  return result;
}

function validatedModelDetails(input, previous) {
  if (input === undefined) return previous;
  if (!object(input)) invalid('模型资料字段无效');
  const text = { name: 240, code: 200, author: 200, family: 200, version: 200 };
  const lists = ['tasks', 'inputModalities', 'outputModalities', 'resultTypes'];
  const counts = ['context', 'output'];
  const switches = ['streaming', 'tools'];
  if (Object.keys(input).some(key => !Object.hasOwn(text, key) && !lists.includes(key)
    && !counts.includes(key) && !switches.includes(key))) invalid('模型资料字段无效');
  const fields = readFields(input, text, previous);
  for (const key of lists) {
    if (input[key] === undefined) continue;
    if (!Array.isArray(input[key]) || input[key].length > 64
      || input[key].some(value => typeof value !== 'string' || !value.trim() || value.length > 200)) invalid('模型资料选项无效');
    fields[key] = input[key];
  }
  for (const key of counts) {
    if (input[key] === undefined) continue;
    if (input[key] !== null && !positiveInteger(input[key])) invalid('上下文长度和最大输出 Token 数须为正整数');
    fields[key] = input[key];
  }
  for (const key of switches) {
    if (input[key] === undefined) continue;
    if (input[key] !== null && typeof input[key] !== 'boolean') invalid('模型资料能力字段无效');
    fields[key] = input[key];
  }
  return { ...serviceModelFields(), ...previous, ...fields };
}

export async function newModelServices(db) {
  const { results } = await db.prepare(`SELECT id,revision,CASE WHEN deleted_at IS NULL THEN record_json END AS record_json
    FROM new_model_services ORDER BY created_at DESC,id`).all();
  const stored = await db.prepare("SELECT json_extract(reference_json,'$.globalRoutingParameters') AS policy FROM model_workspace WHERE id=1").first('policy');
  const defaults = { ...initialRoutingParameters, ...globalPolicyDefaults, ...JSON.parse(stored ?? '{}') };
  return {
    defaults: { ...failoverValues(defaults), strategy: defaults.strategy },
    rows: results.filter(row => row.record_json).map(exposedRow),
    deletedIds: results.filter(row => !row.record_json).map(row => row.id),
  };
}

async function lifecycleCheck(db, row) {
  const [workspace, offers] = await db.batch([
    db.prepare("SELECT json_extract(meta_json,'$.modelData.marketCards') AS cards FROM model_workspace WHERE id=1"),
    db.prepare(`SELECT o.record_id, (o.listing_stage IN ('gray','formal') AND o.market_visible=1 AND s.market_visible=1) AS listed
      FROM offers o JOIN services s ON s.id=o.service_id
      WHERE o.material_id=? AND o.id=? AND o.retired_at IS NULL AND s.deleted_at IS NULL`).bind(row.modelId || '', row.callId),
  ]);
  const cards = JSON.parse(workspace.results[0]?.cards || '{}');
  const card = marketCardsByModel(cards).get(row.modelId);
  const offer = offers.results[0];
  const ids = [row.id, ...offers.results.map(item => item.record_id)];
  const shown = card?.shown?.some(id => ids.includes(id));
  const marketLinked = Boolean(card ? shown || card.linked?.some(id => ids.includes(id)) : offer);
  const marketListed = Boolean(card ? card.status === 'listed' && shown : offers.results.some(item => item.listed));
  return { marketLinked, marketListed, offerId: offer?.record_id,
    stopIssue: marketListed ? '请先在模型广场取消展示该服务' : '',
    deleteIssue: row.listed ? '请先停止模型服务'
      : marketLinked ? '请先解除模型广场关联' : row.grants?.length ? '请先移除租户授权' : '' };
}

export async function inspectNewModelService(db, id) {
  if (!isResourceId(id, 'model-service')) invalid('模型服务 ID 无效');
  const row = await db.prepare('SELECT record_json,revision FROM new_model_services WHERE id=? AND deleted_at IS NULL').bind(id).first();
  if (!row) fail(404, 'NOT_FOUND', '未找到模型服务');
  const { marketLinked, marketListed, stopIssue, deleteIssue } = await lifecycleCheck(db, exposedRow(row));
  return { revision: row.revision, marketLinked, marketListed, stopIssue, deleteIssue };
}

export async function changeNewModelService(db, actor, command, key) {
  const { action, id, revision, row, operationId } = command;
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
  if (action === 'delete') {
    const check = await lifecycleCheck(db, before);
    if (check.deleteIssue) invalid(check.deleteIssue);
    write = db.prepare('UPDATE new_model_services SET deleted_at=?,revision=revision+1 WHERE id=?').bind(at, id);
    label = '删除模型服务';
  } else {
    const imported = action === 'import';
    if (!imported && Object.hasOwn(row, 'serviceMode')) invalid('模型服务不接受服务模式设置');
    const config = readFields(row, imported ? { ...editable, description: 1200 } : editable, before || {});
    const routingStrategy = row.routingStrategy === undefined ? before?.routingStrategy : row.routingStrategy;
    if (routingStrategy !== undefined && (typeof routingStrategy !== 'string'
      || !Object.hasOwn(ROUTING_STRATEGIES, routingStrategy))) invalid('请选择有效的路由策略');
    const routingCustom = row.routingCustom ?? before?.routingCustom ?? false;
    const failoverCustom = row.failoverCustom ?? before?.failoverCustom ?? false;
    const failover = row.failover ?? before?.failover;
    if (typeof routingCustom !== 'boolean' || typeof failoverCustom !== 'boolean' ||
        (routingCustom && !routingStrategy) || ((failoverCustom || failover !== undefined) && failoverError(failover))) invalid('模型服务策略无效');
    if (!config.name?.trim() || !/^[A-Za-z0-9][A-Za-z0-9._:/-]{0,127}$/.test(config.callId || '')
      || (config.type && config.type !== 'other' && !Object.hasOwn(types, config.type)) || !Array.isArray(row.channels)
      || typeof row.listed !== 'boolean' || (row.contextPaused !== undefined && typeof row.contextPaused !== 'boolean')) invalid('模型服务基本信息无效');
    if (before?.modelId && config.modelId !== before.modelId) invalid('已关联的模型资料无法变更');
    const statusChanged = before && before.listed !== row.listed;
    let controlledOfferId = before?.controlledOfferId;
    if ((controlledOfferId || statusChanged) && config.callId !== before.callId) invalid('启停时和关联后无法变更模型标识');
    if (statusChanged) {
      const check = await lifecycleCheck(db, before);
      if (!row.listed && check.stopIssue) invalid(check.stopIssue);
      controlledOfferId = check.offerId ?? controlledOfferId;
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
    const linkingModel = config.modelId && config.modelId !== before?.modelId;
    let details = validatedModelDetails(row.modelDetails, before?.modelDetails);
    const releaseChanged = row.listed && (!before?.listed || JSON.stringify(channels) !== JSON.stringify(before.channels));
    if (releaseChanged || (!imported && (verify.length || linkingModel))) {
      const workspace = await loadModelWorkspace(db, actor, { simulation: false });
      const model = modelLibrary(workspace).find(record => record.id === config.modelId && !record.archivedAt);
      if (!model) invalid('请选择有效的模型资料');
      if (!imported && linkingModel) {
        const material = modelMaterial(workspace, model.id);
        if (!material) invalid('请选择有效的模型资料');
        const defaults = serviceModelFields(material);
        details = validatedModelDetails(row.modelDetails, defaults);
        config.type ||= material.type;
      }
      const candidates = mappingCandidates(workspace, { modelId: model.id });
      const usable = channel => !channel.simulated && candidates.some(candidate =>
        candidate.id === channel.channelId && !candidate.reason && channelFingerprint(candidate) === channel.fingerprint);
      for (const channel of imported ? [] : verify) {
        if (channel.simulated) {
          if (!['1', '2', '3'].some(index => channel.channelId === 'mock-service-channel:' + model.id + ':' + index)
            || channel.fingerprint !== channel.channelId) invalid('模拟连接无效');
        } else if (!usable(channel)) invalid('上游模型不可用，请更新连接配置');
      }
      if (releaseChanged && !channels.some(channel => channel.enabled && usable(channel))) invalid('请先添加并启用通过验证的已登记上游模型');
    }
    if (imported && (!Number.isFinite(Date.parse(row.createdAt)) || typeof row.createdBy !== 'string' || !row.createdBy
      || (row.grants !== undefined && (!Array.isArray(row.grants) || row.grants.some(grant => !object(grant) || typeof grant.tenantId !== 'string')))
      || (row.limits !== undefined && !object(row.limits))
      || (row.batch != null && !object(row.batch)))) invalid('浏览器原有记录格式无效');
    if (details) {
      config.modelDetails = details;
      config.modelName = details.name;
    } else if (before?.modelName !== undefined) config.modelName = before.modelName;
    const history = imported ? row : before;
    next = { id, ...config, listed: row.listed, channels,
      ...(priorities !== undefined && { priorityGroups: [...new Set([...priorities, ...channels.map(channel => channel.priority)])].sort((a,b) => a-b) }),
      ...(controlledOfferId && { controlledOfferId }),
      routingCustom, failoverCustom, ...(failover && { failover: failoverValues(failover) }),
      ...(routingStrategy !== undefined && { routingStrategy }),
      ...(row.contextPaused !== undefined && { contextPaused: row.contextPaused }),
      ...Object.fromEntries(['grants', 'limits', 'batch'].filter(name => history && Object.hasOwn(history, name)).map(name => [name, history[name]])),
      createdBy: history?.createdBy || actor.name, createdAt: history?.createdAt || new Date(at).toISOString() };
    write = prior
      ? db.prepare('UPDATE new_model_services SET call_id=?,record_json=?,revision=revision+1 WHERE id=?').bind(next.callId, JSON.stringify(next), id)
      : db.prepare('INSERT INTO new_model_services (id,call_id,revision,record_json,created_at,imported) VALUES (?,?,1,?,?,?)')
        .bind(id, next.callId, JSON.stringify(next), Date.parse(next.createdAt), Number(imported));
    label = statusChanged ? row.listed ? '启用模型服务' : '停止模型服务'
      : imported ? '导入模型服务' : prior ? '保存模型服务' : '创建模型服务';
  }

  const response = { id, row: next ? { ...next, revision: revision + 1 } : null };
  try {
    await db.batch([
      db.prepare('INSERT INTO operations(id,actor_id,session_id,idempotency_key,command,request_hash,expected_commit_seq,http_status,response_json,created_at) VALUES(?,?,?,?,?,?,?,?,?,?)')
        .bind(operationId, actor.id, actor.session_id, key, 'new-model-service.' + action, hash, seq, 200, JSON.stringify(response), at),
      write,
      db.prepare('INSERT INTO audit_events(id,operation_id,entity_type,entity_id,action,diff_json,created_at) VALUES(?,?,?,?,?,?,?)')
        .bind(resourceId('audit-event'), operationId, 'new-model-service', id, label,
          JSON.stringify({ before: revision || null, after: next ? revision + 1 : null }), at),
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
