import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { randomUUID } from 'node:crypto';
import { readFileSync, writeFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';

export const identityTables = [['suppliers', 'id', 'provider'], ['channels', 'id', 'connection'], ['channel_models', 'id', 'channel'], ['materials', 'id', 'model'], ['offers', 'record_id', 'model_service']];
const uuid = '[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}';
const quote = value => "'" + String(value).replaceAll("'", "''") + "'";
const ident = value => '"' + value.replaceAll('"', '""') + '"';
const tables = db => db.prepare("SELECT name FROM sqlite_schema WHERE type='table' AND name NOT LIKE 'sqlite_%' AND name NOT LIKE '_cf_%' ORDER BY name").all().map(row => row.name);
const rows = (db, table) => db.prepare(`SELECT * FROM ${ident(table)}`).all();
export function inventory(db) {
  return identityTables.map(([table, column, prefix]) => ({ table, total: rows(db, table).length,
    invalid: rows(db, table).filter(row => !new RegExp(`^${prefix}-${uuid}$`).test(row[column])).map(row => row[column]) }));
}
export function planNormalization(db) {
  assert.deepEqual(db.prepare('PRAGMA foreign_key_check').all(), []);
  const mapping = Object.fromEntries(inventory(db).flatMap(({ table, invalid }) => invalid.map(id => {
    const prefix = identityTables.find(row => row[0] === table)[2];
    const suffix = id.match(new RegExp(`${uuid}$`))?.[0];
    return [id, `${prefix}-${suffix || randomUUID()}`];
  })));
  assert.equal(new Set(Object.values(mapping)).size, Object.keys(mapping).length);
  for (const [table, column] of identityTables) for (const id of Object.values(mapping))
    assert.equal(db.prepare(`SELECT count(*) AS n FROM ${ident(table)} WHERE ${ident(column)}=?`).get(id).n, 0, 'New ID already exists');
  const revision = db.prepare('SELECT revision FROM model_workspace WHERE id=1').get().revision;
  const sql = ['PRAGMA defer_foreign_keys=ON;', 'CREATE TABLE _identity_migration_guard(valid INTEGER NOT NULL CHECK(valid=1));',
    `INSERT INTO _identity_migration_guard VALUES((SELECT revision=${revision} FROM model_workspace WHERE id=1));`];
  const affected = [];
  for (const table of tables(db)) {
    const columns = db.prepare(`PRAGMA table_info(${ident(table)})`).all().map(row => row.name);
    for (const column of columns) {
      const values = rows(db, table).map(row => row[column]).filter(value => typeof value === 'string');
      const entries = Object.entries(mapping).filter(([old]) => values.some(value => value.includes(old)));
      if (!entries.length) continue;
      let expr = ident(column);
      for (const [old, id] of entries) expr = `replace(${expr},${quote(old)},${quote(id)})`;
      sql.push(`UPDATE ${ident(table)} SET ${ident(column)}=${expr} WHERE ${entries.map(([old]) => `instr(${ident(column)},${quote(old)})>0`).join(' OR ')};`);
      affected.push({ table, column, ids: entries.length });
    }
  }
  if (Object.keys(mapping).length) sql.push('UPDATE model_workspace SET revision=revision+1 WHERE id=1;');
  // Database guards reject reintroduced IDs even through an alternate writer.
  for (const [table, column, prefix] of identityTables.filter(row => row[0] === 'offers')) {
    const value = `NEW.${ident(column)}`, hex = `replace(substr(${value},${prefix.length + 2}),'-','')`;
    const valid = `length(${value})=${prefix.length + 37} AND substr(${value},1,${prefix.length + 1})=${quote(prefix + '-')} AND substr(${value},${prefix.length + 16},1)='4' AND substr(${value},${prefix.length + 21},1) IN ('8','9','a','b') AND substr(${value},${prefix.length + 10},1)='-' AND substr(${value},${prefix.length + 15},1)='-' AND substr(${value},${prefix.length + 20},1)='-' AND substr(${value},${prefix.length + 25},1)='-' AND length(${hex})=32 AND ${hex} NOT GLOB '*[^0-9a-f]*'`;
    for (const event of ['INSERT', `UPDATE OF ${ident(column)}`]) sql.push(`CREATE TRIGGER IF NOT EXISTS canonical_${table}_${event.startsWith('INSERT') ? 'insert' : 'update'} BEFORE ${event} ON ${ident(table)} WHEN NOT (${valid}) BEGIN SELECT RAISE(ABORT,'model_service ID must use model_service UUID v4'); END;`);
  }
  sql.push('INSERT INTO _identity_migration_guard SELECT count(*)=0 FROM pragma_foreign_key_check;', 'DROP TABLE _identity_migration_guard;');
  return { mapping, affected, revision, sql: sql.join('\n') + '\n' };
}
export function verifyNormalization(db, before, mapping) {
  assert.deepEqual(inventory(db).flatMap(row => row.invalid), []);
  assert.deepEqual(db.prepare('PRAGMA foreign_key_check').all(), []);
  const replace = value => typeof value === 'string' ? Object.entries(mapping).reduce((text, [old, id]) => text.replaceAll(old, id), value) : value;
  for (const table of tables(db)) {
    const expected = before[table].map(row => Object.fromEntries(Object.entries(row).map(([key, value]) => [key, table === 'model_workspace' && key === 'revision' && Object.keys(mapping).length ? value + 1 : replace(value)])));
    const canonical = records => records.map(row => JSON.stringify(row)).sort();
    assert.deepEqual(canonical(rows(db, table)), canonical(expected), `Unrelated data changed: ${table}`);
    for (const row of rows(db, table)) for (const value of Object.values(row)) if (typeof value === 'string') for (const old of Object.keys(mapping)) assert(!value.includes(old), `Old ID remains in ${table}`);
  }
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const [input, output] = process.argv.slice(2); assert(input && output, 'Usage: node normalize-identities.mjs backup.sql migration.sql');
  const db = new DatabaseSync(':memory:'); db.exec('PRAGMA foreign_keys=OFF'); db.exec(readFileSync(input, 'utf8')); db.exec('PRAGMA foreign_keys=ON');
  const before = Object.fromEntries(tables(db).map(table => [table, rows(db, table)]));
  const plan = planNormalization(db);
  db.exec('BEGIN'); try { db.exec(plan.sql); db.exec('COMMIT'); } catch (error) { db.exec('ROLLBACK'); throw error; }
  verifyNormalization(db, before, plan.mapping);
  writeFileSync(output, plan.sql, { mode: 0o600 });
  writeFileSync(output + '.json', JSON.stringify({ mapping: plan.mapping, affected: plan.affected, revisionBefore: plan.revision, inventoryAfter: inventory(db), fullContentComparison: true }, null, 2));
  console.log({ normalized: Object.keys(plan.mapping).length, affectedColumns: plan.affected.length, allRowsAndReferencesVerified: true });
}
