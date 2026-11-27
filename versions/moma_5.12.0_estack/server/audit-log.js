import { AUDIT_ACTIONS, PROJECT_AUDIT_ACTIONS } from '../src/admin-v2/platform-audit.mjs';

const eventSource = `WITH events AS (
  SELECT e.id, e.operation_id, e.entity_id, e.created_at, e.action, e.record_json, o.command, o.actor_id,
    NULL AS tenant_id, NULL AS project_id, 'model_operations' AS domain
  FROM audit_events e JOIN operations o ON o.id=e.operation_id
  WHERE (e.entity_type='model-operations' AND (
    o.command IN ('serviceRouteConfigure','serviceRoutePublish','keyGroupCandidateApply','credentialReplace')
    OR (o.command IN ('serviceMappingDiscard','serviceMappingEnable','serviceMappingDisable','serviceMappingRemove')
      AND json_type(e.record_json,'$.platformAudit')='object')
    OR (o.command='supplierSelection' AND e.action='批量停用所选模型')
    OR (o.command='new-model-service.save' AND e.action='因停服自动停售')
  )) OR (e.entity_type='new-model-service' AND (e.action IN ('启动服务','停止服务')
    OR json_type(e.record_json,'$.platformAudit')='object'))
  UNION ALL
  SELECT 'project:' || json_extract(a.value,'$.id'), json_extract(a.value,'$.id'), json_extract(a.value,'$.objectId'),
    CAST(ROUND((julianday(json_extract(a.value,'$.createdAt'))-2440587.5)*86400000) AS INTEGER),
    json_extract(a.value,'$.action'), a.value, NULL, json_extract(a.value,'$.actorId'),
    json_extract(a.value,'$.tenantId'), json_extract(a.value,'$.projectId'), 'projects'
  FROM model_workspace w, json_each(w.reference_json,'$.audits') a
  WHERE w.id=1 AND json_type(a.value,'$.projectId')='text' AND json_type(a.value,'$.tenantId')='text'
  UNION ALL
  SELECT e.id, e.operation_id, json_extract(e.record_json,'$.projectAudit.objectId'), e.created_at,
    json_extract(e.record_json,'$.projectAudit.action'), e.record_json, o.command, o.actor_id,
    json_extract(e.record_json,'$.projectAudit.tenantId'), json_extract(e.record_json,'$.projectAudit.projectId'), 'projects'
  FROM audit_events e JOIN operations o ON o.id=e.operation_id
  WHERE e.entity_type='application' AND json_type(e.record_json,'$.projectAudit.projectId')='text'
  UNION ALL
  SELECT e.id, e.operation_id, e.entity_id, e.created_at, e.action, e.record_json, o.command,
    o.actor_id, NULL, NULL, 'site'
  FROM audit_events e JOIN operations o ON o.id=e.operation_id
  WHERE e.entity_type='announcement' AND o.command IN ('announcement.publish','announcement.withdraw')
  UNION ALL
  SELECT 'space-policy:' || s.id, 'space-policy:' || s.id, 'published',
    json_extract(s.payload_json,'$.createdAt'), '变更个人空间开关', s.payload_json, NULL,
    json_extract(s.payload_json,'$.actorId'), NULL, NULL, 'site'
  FROM simulation_records s WHERE s.kind='project-policy-audit'
)`;
const projectCodes = new Map(Object.entries(PROJECT_AUDIT_ACTIONS).map(([code, label]) => [label, code]));
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
  if (row.domain !== 'model_operations') return scopedEvent(row, record);
  const serviceState = row.command === 'new-model-service.save' && ['启动服务','停止服务'].includes(row.action);
  if (serviceState && !record.platformAudit) {
    const name = await db.prepare(`SELECT json_extract(response_json,'$.row.name') AS name
      FROM operations WHERE id=?`).bind(row.operation_id).first('name');
    const started = row.action === '启动服务';
    record.result = '成功';
    record.platformAudit ??= {
      action_code: started ? 'model_service.start' : 'model_service.stop',
      resources: [{ ...ref('model_service', row.entity_id, 'target'), name, roles: ['target','changed'] }],
      changes: [field('model_service', row.entity_id, 'service_running', !started, started)],
    };
  }
  if (row.action === '因停服自动停售' && record.sourceModelServiceId) {
    const diff = await db.prepare('SELECT diff_json FROM audit_events WHERE id=?').bind(row.id).first('diff_json');
    const { before, after } = JSON.parse(diff);
    record.platformAudit = {
      action_code: 'model_sale.stop_with_service',
      resources: [{ ...ref('model_sale', row.entity_id, 'target'), name: record.objectLabel, roles: ['target','changed'] },
        ref('model_service', record.sourceModelServiceId, 'related')],
      changes: [field('model_sale', row.entity_id, 'sale_status', before, after)],
    };
  }
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

function scopedEvent(row, record) {
  const site = row.domain === 'site';
  const announcement = site && ['announcement.publish','announcement.withdraw'].includes(row.command);
  const action = announcement ? row.command : site ? 'site.personal_space.configure' : projectCodes.get(row.action);
  if (!action || !row.entity_id || !Number.isFinite(row.created_at)) return null;
  const type = announcement ? 'announcement' : site ? 'site' : action.startsWith('project.key.') ? 'project_key'
    : action.startsWith('project.route.') ? 'project_route' : action.startsWith('project.member.') ? 'project_member' : 'project';
  const resources = [{ ...ref(type, row.entity_id, 'target'), ...(announcement && { name:record.objectLabel }) }];
  if (row.project_id && type !== 'project') resources.push(ref('project', row.project_id, 'related'));
  const at = new Date(row.created_at).toISOString();
  return {
    schema_version:1, event_id:row.id, operation_id:row.operation_id, action_code:action,
    domain:row.domain, occurred_at:at, recorded_at:at,
    actor:{ type:site || row.command ? 'admin_account' : 'customer_user', id:row.actor_id,
      name:record.actorName || (!row.command ? record.actor : undefined), role:record.actorRole },
    observer:row.domain, source:announcement ? 'web' : 'unknown', provenance:{ environment:'prototype', mode:'actual' },
    scope:site ? { type:'platform' } : { type:'project', tenant_id:row.tenant_id, project_id:row.project_id },
    stage:'commit', outcome:{ status:record.result === '失败' ? 'failed' : 'succeeded' },
    resources, changes:announcement ? [field(type,row.entity_id,'announcement_status',record.before,record.after)] : site ? [
      field(type,row.entity_id,'personal_space_enabled',record.before,record.after),
      ...(record.beforeMode!==record.afterMode ? [field(type,row.entity_id,'operating_mode',record.beforeMode,record.afterMode)] : []),
      ...(record.beforeInternalTenantId!==record.afterInternalTenantId ? [field(type,row.entity_id,'internal_tenant_id',record.beforeInternalTenantId,record.afterInternalTenantId)] : []),
    ] : [],
    item_results:[], effect_scope:'configuration',
  };
}

export async function auditLogDetail(db, id) {
  const row = await db.prepare(eventSource + ' SELECT * FROM events WHERE id=?').bind(id).first();
  return row ? eventFromRow(db, row) : null;
}

function matches(event, { action, status, type, q, actor }) {
  const includes = (query, values) => values.some(value => typeof value === 'string' && value.toLowerCase().includes(query));
  const changed = (type, field) => event.changes.some(change => change.resource_ref.startsWith(type + ':') && change.field === field);
  const matchesType = type === 'model_supply_status' ? changed('model_supply', 'enabled')
    : type === 'service_mapping_status' ? changed('service_mapping', 'status')
    : !type || event.resources.some(resource => resource.type === type);
  return (!action || action === event.action_code) && (!status || status === event.outcome.status)
    && matchesType
    && (!actor || includes(actor, [event.actor.id, event.actor.name]))
    && (!q || includes(q, [event.event_id, event.operation_id, AUDIT_ACTIONS[event.action_code],
      ...event.resources.flatMap(resource => [resource.id, resource.name, resource.type + ':' + resource.id])]));
}

export async function auditLogPage(db, filters) {
  const { limit, from, to, after, tenant, project } = filters;
  let cursor = after ? await db.prepare(eventSource + ' SELECT id,created_at FROM events WHERE id=?').bind(after).first() : null;
  if (after && !cursor) return null;
  const items = [];
  const statement = db.prepare(eventSource + ` SELECT * FROM events WHERE created_at>=? AND created_at<=?
    AND (? IS NULL OR tenant_id=?) AND (? IS NULL OR project_id=?)
    AND (? IS NULL OR (created_at,id)<(?,?))
    ORDER BY created_at DESC,id DESC LIMIT 50`);
  while (items.length <= limit) {
    const { results } = await statement.bind(from, to, tenant || null, tenant || null, project || null, project || null,
      cursor?.created_at ?? null, cursor?.created_at ?? null, cursor?.id ?? null).all();
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
