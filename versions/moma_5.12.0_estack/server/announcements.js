import { resourceId } from '../src/resource-id.mjs';
import { customerSecretHash } from './customer-identity.js';
import { receipt, save } from './model-commands.js';

const validId = value => typeof value === 'string' && /^[A-Za-z0-9:_.-]{1,200}$/.test(value);
const validIds = value => Array.isArray(value) && value.every(validId);
const issue = (status, code, message) => { throw Object.assign(Error(message), { status, code }); };
const invalid = message => issue(400, 'INVALID_INPUT', message);
const conflict = () => issue(409, 'REVISION_CONFLICT', '当前数据已变化，请核对后重试');
const denied = () => issue(403, 'FORBIDDEN', '当前登录账号已变化或无权操作');
const clock = () => new Date().toISOString();

function date(value) {
  if (value === undefined || value === null) return null;
  if (typeof value !== 'string' || !/^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d\.\d{3}Z$/.test(value)) {
    invalid('展示时间格式无效');
  }
  const parsed = new Date(value);
  if (!Number.isFinite(+parsed) || parsed.toISOString() !== value) invalid('展示时间格式无效');
  return value;
}

function statusOf(record, now) {
  if (record.publication === 'withdrawn') return 'withdrawn';
  if (record.publication !== 'published') return 'draft';
  if (record.endsAt <= now) return 'expired';
  if (record.scope !== 'all' || !record.startsAt || !record.endsAt) return 'inactive';
  if (record.startsAt > now) return 'scheduled';
  return 'active';
}

function adminView(record, now) {
  return { id: record.id, title: record.title, body: record.body ?? '', scope: record.scope ?? null,
    startsAt: record.startsAt ?? null, endsAt: record.endsAt ?? null,
    status: statusOf(record, now), publisher: record.publisher ?? null, revision: record.revision ?? 0 };
}

async function workspace(db, actor) {
  const row = await db.prepare(`SELECT json_extract(reference_json,'$.announcements') AS announcements,
    application_revision AS applicationRevision,
    length(CAST(reference_json AS BLOB)) AS size, (SELECT commit_seq FROM db_state WHERE id=1) AS commitSeq,
    EXISTS (SELECT 1 FROM admin_accounts WHERE id=? AND role='平台管理员' AND enabled=1) AS permitted
    FROM model_workspace WHERE id=1`).bind(actor.id).first();
  if (!row) issue(503, 'DATABASE_UNAVAILABLE', '业务工作区尚未初始化');
  if (!row.permitted) denied();
  return { records: JSON.parse(row.announcements ?? '[]'),
    size: row.size - new TextEncoder().encode(row.announcements ?? '').length,
    applicationRevision: row.applicationRevision, commitSeq: row.commitSeq };
}

export async function adminAnnouncements(db, actor) {
  const { records } = await workspace(db, actor);
  const now = clock();
  return { accountId: actor.id, announcements: records.map(record => adminView(record, now)) };
}

function draftFields(body, now) {
  const { title, body: content = '' } = body;
  if (typeof title !== 'string' || !title.trim() || title.trim().length > 64 ||
      typeof content !== 'string' || content.trim().length > 1200) invalid('请填写有效的公告标题和正文');
  const startsAt = date(body.startsAt), endsAt = date(body.endsAt);
  if (body.action === 'publish') {
    if (!content.trim()) invalid('请填写公告正文');
    if ((startsAt && startsAt <= now) || !endsAt || endsAt <= (startsAt ?? now)) invalid('请设置有效的公告生效和到期时间');
  }
  return { title: title.trim(), body: content.trim(), scope: 'all', startsAt, endsAt };
}

export async function changeAnnouncement(db, actor, body, idempotencyKey) {
  if (!['draft', 'publish', 'withdraw'].includes(body.action) || body.id !== undefined && !validId(body.id) ||
      (body.id === undefined ? body.revision !== undefined && body.revision !== 0 :
        !Number.isSafeInteger(body.revision) || body.revision < 0) ||
      (idempotencyKey !== null && !validId(idempotencyKey))) invalid('公告操作或修订号无效');
  if (body.accountId !== undefined && body.accountId !== actor.id) denied();
  const key = idempotencyKey ?? resourceId('announcement-request');
  const operationId = 'announcement-operation-' + await customerSecretHash(JSON.stringify([actor.id, key]));
  const digest = await customerSecretHash(JSON.stringify(body));
  const replay = await receipt(db, actor, key, digest, operationId);
  if (replay) return replay;
  const state = await workspace(db, actor);
  const now = clock();
  const current = state.records.find(record => record.id === body.id);
  if (body.id && !current) issue(404, 'NOT_FOUND', '公告不存在');
  if (current && (current.revision ?? 0) !== body.revision) conflict();
  const previousStatus = current ? statusOf(current, now) : null;
  const withdrawing = body.action === 'withdraw';
  if (withdrawing ? !['scheduled','active'].includes(previousStatus) : previousStatus && previousStatus !== 'draft') conflict();
  const record = { ...current, id: current?.id ?? resourceId('announcement'), createdAt: current?.createdAt ?? now,
    updatedAt: now, revision: (current?.revision ?? 0) + 1 };
  if (withdrawing) {
    record.publication = 'withdrawn';
  } else {
    Object.assign(record, draftFields(body, now));
    record.publication = body.action === 'publish' ? 'published' : 'draft';
    if (record.publication === 'published') {
      record.startsAt ??= now;
      record.publisher = actor.name;
    }
  }
  const records = [record, ...state.records.filter(item => item.id !== record.id)];
  const serialized = JSON.stringify(records);
  if (state.size + new TextEncoder().encode(serialized).length > 1_499_900) {
    issue(413, 'SCOPE_TOO_LARGE', '后台工作区容量不足，当前公告尚未保存');
  }
  const event = { action: { draft:'保存公告草稿', publish:'发布公告', withdraw:'撤回公告' }[body.action],
    objectId: record.id, objectLabel: record.title, actorName: actor.name, actorRole: actor.role, result:'成功',
    before: previousStatus, after: statusOf(record, now), audience: record.scope,
    startsAt: record.startsAt, endsAt: record.endsAt };
  const statement = db.prepare(`UPDATE model_workspace SET reference_json=json_set(reference_json,'$.announcements',json(?)),
    application_revision=application_revision+? WHERE id=1`).bind(serialized, Number(state.applicationRevision > 0));
  return save(db, actor, state, key, operationId, digest, 'announcement.' + body.action,
    { accountId: actor.id, announcement: adminView(record, now) }, [statement], event, 'announcement');
}

const activeSession = `EXISTS (SELECT 1 FROM market_sessions WHERE token_hash=? AND user_id=? AND expires_at>?)`;

function requireCurrentSession(current, session) {
  if (!current?.active) issue(401, 'TENANT_SESSION_REQUIRED', '当前登录会话已失效');
  if (current.commitSeq !== session.commitSeq) conflict();
}

export async function tenantAnnouncements(db, session, body) {
  const { user: { id: accountId }, hash, commitSeq } = session;
  if (body !== undefined) {
    if (!validId(body.accountId) || !validIds(body.ids) || !body.ids.length) {
      invalid('公告或当前账号标识无效');
    }
    if (accountId !== body.accountId) denied();
  }
  const sessionInput = [hash, accountId, Date.now()];
  const now = clock();
  const row = await db.prepare(`SELECT ${activeSession} AS active, (SELECT commit_seq FROM db_state WHERE id=1) AS commitSeq,
    (SELECT json_group_array(json_object('id',json_extract(a.value,'$.id'),'title',json_extract(a.value,'$.title'),
        'body',json_extract(a.value,'$.body'))) FROM json_each(w.reference_json,'$.announcements') a
      WHERE json_extract(a.value,'$.publication')='published'
        AND json_extract(a.value,'$.startsAt')<=? AND json_extract(a.value,'$.endsAt')>?
        AND json_extract(a.value,'$.scope')='all'
        AND NOT EXISTS (SELECT 1 FROM simulation_records s WHERE s.kind='announcement-dismissal'
          AND s.id=?||char(1)||json_extract(a.value,'$.id'))
    ) AS announcements FROM model_workspace w WHERE w.id=1`).bind(...sessionInput, now, now, accountId).first();
  requireCurrentSession(row, session);
  const visible = JSON.parse(row.announcements);
  const requested = new Set(body?.ids);
  const dismissed = visible.filter(record => requested.has(record.id)).map(record => record.id);
  if (dismissed.length) {
    const [, guard] = await db.batch([
      db.prepare(`INSERT OR IGNORE INTO simulation_records(kind,id,payload_json)
        SELECT 'announcement-dismissal',?||char(1)||value,json_quote(value) FROM json_each(?)
        WHERE (SELECT commit_seq FROM db_state WHERE id=1)=? AND ${activeSession}`)
        .bind(accountId, JSON.stringify(dismissed), commitSeq, ...sessionInput),
      db.prepare(`SELECT ${activeSession} AS active, commit_seq AS commitSeq FROM db_state WHERE id=1`).bind(...sessionInput),
    ]);
    requireCurrentSession(guard.results[0], session);
  }
  return { accountId, announcements: visible.filter(record => !requested.has(record.id)) };
}
