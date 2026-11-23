// Generate guarded forward and rollback SQL from a pre-upgrade D1 SQLite snapshot.
import { DatabaseSync } from 'node:sqlite';
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { CHANNEL_LIST_TYPES } from '../src/admin-v2/channel-connection-directory.js';
import { connectionRequestUrl } from '../src/admin-v2/channel-interface.js';

const quote = value => "'" + String(value).replaceAll("'", "''") + "'";

export function splitOldAddress(record) {
  if (record.candidateConfiguration || record.customAdapter || record.adapterDraft || Object.keys(record.taskUrls || {}).length)
    return { review: '存在候选配置、任务地址或自定义转发' };
  let base;
  try { base = new URL(record.baseUrl); } catch { return { review: '缺少有效服务地址' }; }
  if (base.search || base.hash || base.username || base.password) return { review: '服务地址含额外参数或认证信息' };
  const oldPath = record.endpointPath;
  const protocol = CHANNEL_LIST_TYPES.find(type => type.id === (record.modelProtocol || record.interfaceType));
  if (!oldPath) {
    if (['openai', 'openai-responses'].includes(record.interfaceType)) return { unchanged: true };
    return { review: '旧记录未单独声明端点，需核对实际任务及格式' };
  }
  const path = protocol?.paths.find(suffix => oldPath.endsWith(suffix));
  if (!path) return { review: '无法确认服务商前缀' };
  const url = base.origin + oldPath;
  const baseUrl = url.slice(0, -path.length);
  if (base.pathname !== '/' && baseUrl !== record.baseUrl.replace(/\/+$/, ''))
    return { review: '原服务地址路径与实际请求的前缀不一致' };
  if (connectionRequestUrl(baseUrl, path) !== url) return { review: '请求地址不一致' };
  if (baseUrl === record.baseUrl && path === oldPath) return { unchanged: true };
  return { baseUrl, endpointPath: path };
}

function updateSql(row, before, after) {
  const set = ['base_url', 'record_json', 'connection_json'].map(key => key + '=' + quote(after[key])).join(',');
  const guard = ['base_url', 'record_json', 'connection_json'].map(key => key + '=' + quote(before[key])).join(' AND ');
  return 'UPDATE channels SET ' + set + ' WHERE id=' + quote(row.id) + ' AND ' + guard + ';\n' +
    'INSERT INTO connection_address_guard VALUES(changes());';
}

export function planAddressMigration(db) {
  const forward = [], rollback = [], review = [], changed = [];
  let unchanged = 0;
  for (const row of db.prepare('SELECT id,base_url,record_json,connection_json FROM channels ORDER BY id').all()) {
    const record = JSON.parse(row.record_json);
    const split = splitOldAddress(record);
    if (split.unchanged) { unchanged++; continue; }
    const linked = db.prepare("SELECT 1 FROM simulation_records WHERE kind='channels' AND json_extract(payload_json,'$.clientChannelId')=? LIMIT 1").get(row.id);
    const hasEvidence = record.connectionTest || record.connectionQualification || record.serverTestJobs?.length || record.configurationVersions?.length;
    if (split.review || linked || hasEvidence || record.baseUrl !== row.base_url) {
      review.push({ id: row.id, reason: split.review || '有测试凭据、关联快照或存储副本差异，需联查' });
      continue;
    }
    const associated = db.prepare('SELECT 1 FROM channel_models WHERE channel_id=? LIMIT 1').get(row.id);
    if (associated) {
      review.push({ id: row.id, reason: '已有上游模型关联，需核对关联验证记录' });
      continue;
    }
    const connection = JSON.parse(row.connection_json);
    const next = { base_url: split.baseUrl, record_json: JSON.stringify({ ...record, ...split }),
      connection_json: JSON.stringify({ ...connection, endpointPath: split.endpointPath }) };
    forward.push(updateSql(row, row, next));
    rollback.unshift(updateSql(row, next, row));
    changed.push(row.id);
  }
  const guarded = statements => statements.length ? ['CREATE TABLE connection_address_guard (n INTEGER CHECK(n=1));',
    ...statements, 'DROP TABLE connection_address_guard;'].join('\n') + '\n' : '-- No changes\n';
  return { forward: guarded(forward), rollback: guarded(rollback), report: { changed, unchanged, review } };
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const [, , snapshot, directory] = process.argv;
  if (!snapshot || !directory) throw Error('Usage: node connection-address-migration.mjs <pre-upgrade.sqlite> <new-output-dir>');
  const db = new DatabaseSync(snapshot, { readOnly: true });
  const { forward, rollback, report } = planAddressMigration(db);
  db.close();
  mkdirSync(directory, { mode: 0o700 });
  for (const [file, contents] of [['forward.sql', forward], ['rollback.sql', rollback], ['report.json', JSON.stringify(report,null,2)]])
    writeFileSync(join(directory, file), contents, { mode: 0o600, flag: 'wx' });
}
