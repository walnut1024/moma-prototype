import { accountTraffic, effectiveTraffic } from '../src/admin-v2/traffic-limits.js';

// Web and API calls share a limit counter keyed by model service.
export async function trafficAdmission(db, { callId, serviceId, userId, usage, at }) {
  const minute = new Date(at).toISOString(), since = new Date(at - 60_000).toISOString();
  const target = serviceId ? {meterId:serviceId,ruleId:serviceId} : await db.prepare(`SELECT o.record_id AS meterId, n.id AS ruleId
    FROM offers o JOIN services s ON s.id=o.service_id
    LEFT JOIN new_model_services n ON n.deleted_at IS NULL AND n.call_id=o.id
      AND json_extract(n.record_json,'$.controlledOfferId')=o.record_id
    WHERE o.id=? AND o.retired_at IS NULL AND s.deleted_at IS NULL AND o.mode_epoch=s.mode_epoch`).bind(callId).first();
  if (!target) return {};
  const [defaults, rules, counters] = await db.batch([
    db.prepare('SELECT rpm,tpm,model_rpm,model_tpm FROM traffic_limit_defaults WHERE id=1'),
    db.prepare(`SELECT scope,object_id AS objectId,model_id AS modelId,rpm,tpm FROM traffic_limit_rules
      WHERE scope IN ('model','policy') OR (scope='account' AND object_id=?)`).bind(userId ?? null),
    db.prepare(`SELECT COUNT(*) AS rpm,COALESCE(SUM(json_extract(f.payload_json,'$.trafficTokens')),0) AS tpm,
        COALESCE(SUM(json_extract(f.payload_json,'$.trafficUserId') IS ?),0) AS userRpm,
        COALESCE(SUM(CASE WHEN json_extract(f.payload_json,'$.trafficUserId') IS ?
          THEN json_extract(f.payload_json,'$.trafficTokens') ELSE 0 END),0) AS userTpm
      FROM simulation_records f WHERE f.kind='project-usage'
        AND json_extract(f.payload_json,'$.trafficServiceId')=?
        AND json_extract(f.payload_json,'$.admittedAt')>? AND json_extract(f.payload_json,'$.admittedAt')<=?`)
      .bind(userId ?? null, userId ?? null, target.meterId, since, minute),
  ]);
  const config = defaults.results[0];
  if (!config) return {};
  const metrics = counters.results[0];
  const tokens = (usage?.input ?? 0) + (usage?.output ?? 0);
  const settings = { global: { rpm: config.rpm, tpm: config.tpm },
    modelDefault: { rpm: config.model_rpm, tpm: config.model_tpm }, rules: rules.results };
  const { model, hit } = effectiveTraffic(settings, accountTraffic(settings, userId), target.ruleId || target.meterId);
  if (metrics.rpm >= model.limit.rpm || metrics.tpm + tokens > model.limit.tpm) return { error: 'model_service_rate_limit_exceeded' };
  if (userId && (metrics.userRpm >= hit.limit.rpm || metrics.userTpm + tokens > hit.limit.tpm)) {
    return { error: 'user_model_rate_limit_exceeded' };
  }
  return { evidence: { trafficServiceId: target.meterId, trafficUserId: userId || null, trafficTokens: tokens } };
}
