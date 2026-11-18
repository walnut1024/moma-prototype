import { defaultSpacePolicy } from '../src/operating-space.mjs';

const kind = 'project-space-policy';
const id = 'published';

export async function readProjectSpacePolicy(db) {
  const payload = await db.prepare('SELECT payload_json FROM simulation_records WHERE kind=? AND id=?').bind(kind,id).first('payload_json');
  return { ...defaultSpacePolicy, ...(payload && JSON.parse(payload)) };
}

export async function saveProjectSpacePolicy(db, expected, {personalEnabled,operatingMode,internalTenantId}, actor) {
  const current = await readProjectSpacePolicy(db);
  if (current.revision !== expected) return null;
  const value = { revision:expected + 1, personalEnabled,
    operatingMode:operatingMode ?? current.operatingMode, internalTenantId:internalTenantId ?? current.internalTenantId };
  const scope = await db.prepare(`SELECT commit_seq, EXISTS (
    SELECT 1 FROM model_workspace w, json_each(w.reference_json,'$.tenants') t WHERE w.id=1
      AND json_extract(t.value,'$.id')=? AND json_extract(t.value,'$.type') IN ('企业','政府')
      AND json_extract(t.value,'$.status')='正常') AS active FROM db_state WHERE id=1`).bind(value.internalTenantId).first();
  if ((value.internalTenantId && !scope?.active) || value.operatingMode==='internal' && !value.internalTenantId) {
    throw Object.assign(Error('请选择一个正常的本企业空间'), { status:422, code:'INVALID_INTERNAL_SPACE' });
  }
  const audit = { actorId:actor.id, actorName:actor.name, actorRole:actor.role, createdAt:Date.now(),
    before:current.personalEnabled, after:personalEnabled,
    beforeMode:current.operatingMode, afterMode:value.operatingMode,
    beforeInternalTenantId:current.internalTenantId, afterInternalTenantId:value.internalTenantId };
  const [written] = await db.batch([
    db.prepare(`INSERT INTO simulation_records(kind,id,payload_json)
      SELECT ?,?,? WHERE (SELECT commit_seq FROM db_state WHERE id=1)=?
        AND (?=0 OR EXISTS (SELECT 1 FROM simulation_records WHERE kind=? AND id=?))
      ON CONFLICT(kind,id) DO UPDATE SET payload_json=excluded.payload_json
      WHERE json_extract(simulation_records.payload_json,'$.revision')=?`)
      .bind(kind,id,JSON.stringify(value),scope.commit_seq,expected,kind,id,expected),
    db.prepare(`INSERT INTO simulation_records(kind,id,payload_json)
      SELECT 'project-policy-audit',?,? WHERE changes()=1`).bind(String(value.revision),JSON.stringify(audit)),
    db.prepare('UPDATE db_state SET commit_seq=commit_seq+1 WHERE id=1 AND changes()=1'),
  ]);
  return written.meta.changes ? value : null;
}
