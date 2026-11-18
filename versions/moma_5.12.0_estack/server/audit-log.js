import { AUDIT_ACTIONS } from '../src/admin-v2/platform-audit.mjs';

const eventSource = `SELECT e.id, e.operation_id, e.entity_id, e.created_at, e.action, e.record_json, o.command, o.actor_id
  FROM audit_events e JOIN operations o ON o.id=e.operation_id
  WHERE e.entity_type='model-operations' AND (
    o.command IN ('serviceRouteConfigure','serviceRoutePublish','keyGroupCandidateApply','credentialReplace')
    OR (o.command='supplierSelection' AND e.action='批量停用所选模型')
  )`;
const ref = (type, id, role) => ({ type, id, roles: [role] });
const values = input => input === undefined ? { state: 'unrecorded' } : { state: 'known', value: input };
const field = (type, id, name, before, after) => ({ resource_ref: type + ':' + id, field: name, before: values(before), after: values(after) });

async function historicalEvidence(db, row, record) {
  if (row.command === 'credentialReplace') return null;
  const entries = Array.isArray(record.after) ? record.after : [];
  if (row.command === 'supplierSelection') {
    const targets = entries.flatMap(entry => {
      const item = entry.collection === 'providers' && entry.changes?.catalogConnections?.at(-1);
      return item?.enabled === false && typeof item.id === 'string' ? [item] : [];
    });
    return {
      action_code: 'model_supply.disable',
      resources: targets.map(item => ({ ...ref('model_supply', item.id, 'target'), name: item.sourceName || item.name })),
      item_results: targets.map(item => ({ resource_ref: 'model_supply:' + item.id, status: 'unknown' })),
    };
  }
  if (row.command === 'keyGroupCandidateApply') {
    const owner = entries.at(-1);
    const versions = owner?.changes?.keyGroupVersions;
    const current = versions?.at(-1);
    if (owner?.collection !== 'providers' || !current?.candidateId || current.rollbackOf != null || current.groupId !== row.entity_id) return null;
    // Older apply rows do not distinguish a new credential from an order change.
    const intent = await db.prepare(`SELECT 1 AS matched FROM audit_events e JOIN operations o ON o.id=e.operation_id
      JOIN json_each(e.record_json,'$.after') c JOIN json_each(c.value,'$.changes.keyGroupCandidates') k
      WHERE e.entity_type='model-operations' AND e.entity_id=? AND e.created_at<=?
      AND o.command IN ('keyGroupCandidatePrepare','keyGroupCandidateSave')
      AND json_extract(c.value,'$.id')=? AND json_extract(k.value,'$.id')=?
      AND COALESCE(json_extract(k.value,'$.priorityChange'),0)=0
      AND json_extract(k.value,'$.rollbackOf') IS NULL LIMIT 1`).bind(current.groupId, row.created_at, owner.id, current.candidateId).first();
    if (!intent) return null;
    const type = 'supplier_key_group', id = owner.id + ':' + current.groupId;
    const before = versions.slice(0, -1).findLast(item => item.groupId === current.groupId);
    return {
      action_code: 'supplier_key_group.rotate',
      resources: [{ ...ref(type, id, 'target'), name: owner.changes.apiKeyGroups?.find(group => group.id === current.groupId)?.name, roles: ['target', 'changed'] },
        ...entries.filter(entry => entry.collection === 'endpoints').map(entry => ref('supplier_connection', entry.id, 'related')),
        ...[...new Set([before?.keyIds?.[0], current.keyIds?.[0]].filter(Boolean))].map(key => ref('supplier_key', key, 'related'))],
      changes: [field(type, id, 'configuration_version', before?.version, current.version), field(type, id, 'active_key_id', before?.keyIds?.[0], current.keyIds?.[0])],
      links: { candidate_id: current.candidateId },
    };
  }
  const route = entries.find(entry => entry.collection === 'serviceRoutes');
  const current = route?.changes || route?.record;
  const id = route?.id || current?.id;
  const version = current?.versions?.find(item => item.version === current.activeVersion);
  const old = record.changes?.find(change => change.field === '生效路由')?.before;
  const previousVersion = /^\d+$/.test(String(old)) ? Number(old) : undefined;
  return {
    action_code: 'service_route.publish',
    resources: [...(id ? [{ ...ref('service_route', id, 'target'), name: record.objectLabel !== id ? record.objectLabel : undefined, roles: version ? ['target', 'changed'] : ['target'] }] : []),
      ...(current?.serviceId ? [ref('model_service', current.serviceId, 'related')] : []),
      ...(record.relatedEndpointIds || []).filter(id => typeof id === 'string').map(id => ref('supplier_connection', id, 'related'))],
    changes: id && version ? [field('service_route', id, 'active_version', previousVersion, version.version),
      field('service_route', id, 'strategy', undefined, version.config?.strategy)] : [],
  };
}

async function eventFromRow(db, row) {
  const record = JSON.parse(row.record_json);
  const evidence = record.platformAudit || await historicalEvidence(db, row, record);
  if (!evidence) return null;
  const occurred_at = new Date(row.created_at).toISOString();
  const status = { 成功: 'succeeded', 失败: 'failed' }[record.result] || 'unknown';
  return {
    schema_version: 1, event_id: row.id, operation_id: row.operation_id, action_code: evidence.action_code,
    domain: 'model_operations', occurred_at, recorded_at: occurred_at,
    actor: { type: 'admin_account', id: row.actor_id, name: evidence.actor_name || record.actorName, role: evidence.actor_role || record.actor },
    observer: 'model_operations_service', source: 'unknown', provenance: { environment: 'prototype', mode: 'actual' },
    scope: { type: 'platform' }, stage: 'commit', outcome: { status },
    resources: evidence.resources, changes: evidence.changes || [], item_results: evidence.item_results || [],
    ...(evidence.links && { links: evidence.links }), ...(status === 'succeeded' && { effect_scope: 'configuration' }),
  };
}

export async function auditLogDetail(db, id) {
  const row = await db.prepare(eventSource + ' AND e.id=?').bind(id).first();
  return row ? eventFromRow(db, row) : null;
}

function matches(event, { action, status, type, q, actor }) {
  const includes = (query, values) => values.some(value => typeof value === 'string' && value.toLowerCase().includes(query));
  return (!action || action === event.action_code) && (!status || status === event.outcome.status)
    && (!type || event.resources.some(resource => resource.type === type))
    && (!actor || includes(actor, [event.actor.id, event.actor.name]))
    && (!q || includes(q, [event.event_id, event.operation_id, AUDIT_ACTIONS[event.action_code],
      ...event.resources.flatMap(resource => [resource.id, resource.name, resource.type + ':' + resource.id])]));
}

export async function auditLogPage(db, filters) {
  const { limit, from, to, after } = filters;
  let cursor = after ? await db.prepare('SELECT id,created_at FROM audit_events WHERE id=?').bind(after).first() : null;
  if (after && !cursor) return null;
  const items = [];
  const statement = db.prepare(eventSource + ` AND e.created_at>=? AND e.created_at<=?
    AND (? IS NULL OR (e.created_at,e.id)<(?,?))
    ORDER BY e.created_at DESC,e.id DESC LIMIT 50`);
  while (items.length <= limit) {
    const { results } = await statement.bind(from, to, cursor?.created_at ?? null, cursor?.created_at ?? null, cursor?.id ?? null).all();
    for (const row of results) {
      const event = await eventFromRow(db, row);
      if (!event || !matches(event, filters)) continue;
      const { changes: _changes, resources, item_results: _items, links: _links, ...summary } = event;
      const targets = resources.filter(resource => resource.roles.includes('target'));
      const matched = filters.q && resources.find(resource => [resource.id, resource.name, resource.type + ':' + resource.id]
        .some(value => value?.toLowerCase().includes(filters.q)));
      items.push({ ...summary, target: targets[0], target_count: targets.length, ...(matched && { matched }) });
      if (items.length > limit) return { items: items.slice(0, limit), nextCursor: items[limit - 1].event_id };
    }
    if (results.length < 50) break;
    cursor = results.at(-1);
  }
  return { items, nextCursor: null };
}
