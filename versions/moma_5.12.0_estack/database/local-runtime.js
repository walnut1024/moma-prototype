import { Miniflare } from 'miniflare';
import { build } from 'esbuild';
import {modelWorkerDataPlugin} from '../../../scripts/model-worker-build.mjs';
import { DatabaseSync } from 'node:sqlite';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { createSeed, initializeDatabase } from './seed.js';
import { initializeModelWorkspace } from '../server/model-repository.js';

// Tooling only: SQLite parses the original migration, D1 executes every resulting DDL statement.
export async function migrateEmptyDatabase(db) {
  const current = await db.prepare("SELECT name FROM sqlite_schema WHERE type='table' AND name='db_state'").first();
  if (current) {
    const state = await db.prepare('SELECT schema_version FROM db_state WHERE id=1').first();
    if(![1,2,3,4].includes(state?.schema_version))throw Error('数据库结构版本不匹配');
    for(const [version,file]of [[2,'0002_domain_records.sql'],[3,'0003_full_model_scope.sql'],[4,'0004_model_metadata.sql']])if(state.schema_version<version){const sql=await readFile(new URL('./migrations/'+file,import.meta.url),'utf8');await db.batch(sql.trim().split('\n').filter(Boolean).map(line=>db.prepare(line)));}
    return;
  }
  const existing = await db.prepare("SELECT name FROM sqlite_schema WHERE type='table' AND name NOT LIKE 'sqlite_%' AND name NOT LIKE '_cf_%'").all();
  if (existing.results.length) throw Error('非空数据库缺少结构版本，拒绝初始化');
  const sqlite = new DatabaseSync(':memory:');
  try {
    sqlite.exec(await readFile(new URL('./migrations/0001_model_operations.sql', import.meta.url), 'utf8'));
    sqlite.exec(await readFile(new URL('./migrations/0002_domain_records.sql', import.meta.url), 'utf8'));
    sqlite.exec(await readFile(new URL('./migrations/0003_full_model_scope.sql',import.meta.url),'utf8'));
    sqlite.exec(await readFile(new URL('./migrations/0004_model_metadata.sql',import.meta.url),'utf8'));
    const schema = sqlite.prepare('SELECT sql FROM sqlite_schema WHERE sql IS NOT NULL ORDER BY rowid').all();
    await db.batch([...schema.map(row => db.prepare(row.sql)), db.prepare('INSERT INTO db_state(id,schema_version,commit_seq) VALUES(1,4,0)')]);
  } finally { sqlite.close(); }
}

export async function startLocalBackend({ persistPath, loginHashes, port = 0, log } = {}) {
  const source = fileURLToPath(new URL('../server/api.js', import.meta.url));
  const bundled = await build({ stdin: { contents: `import {handleModelOperations} from ${JSON.stringify(source)}; export default {fetch:handleModelOperations};`, resolveDir: process.cwd() },
    plugins:[modelWorkerDataPlugin], bundle: true, write: false, format: 'esm', platform: 'browser', target: 'es2022' });
  const runtime = new Miniflare({ modules: true, script: bundled.outputFiles[0].text, host: '127.0.0.1', port,
    // The installed local engine supports this date; production compatibility is verified at deployment.
    compatibilityDate: '2026-07-30', d1Databases: ['MODEL_OPS_DB'], d1Persist: persistPath || false,
    bindings: { MODEL_OPS_LOGIN_HASHES: JSON.stringify(loginHashes || {}) }, ...(log ? { log } : {}) });
  try {
    const db = await runtime.getD1Database('MODEL_OPS_DB');
    await migrateEmptyDatabase(db);
    const seed = await createSeed();
    const initialization = await initializeDatabase(db, seed);
    await initializeModelWorkspace(db);
    return { runtime, db, seed, initialization, url: await runtime.ready };
  } catch (error) { await runtime.dispose(); throw error; }
}
