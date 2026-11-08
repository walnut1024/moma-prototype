import { Miniflare } from 'miniflare';
import { build } from 'esbuild';
import {modelWorkerDataPlugin} from '../../../scripts/model-worker-build.mjs';
import { DatabaseSync } from 'node:sqlite';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { createSeed, initializeDatabase } from './seed.js';
import { initializeModelWorkspace } from '../server/model-repository.js';
import { initializeApplication } from '../server/application.js';
import { initializePrototypeCatalogue } from '../server/prototype-presets.js';

// Tooling only: SQLite parses the original migration, D1 executes every resulting DDL statement.
export async function migrateEmptyDatabase(db) {
  const [trafficDefaults, trafficRules, channelMarket, application, integrity, identity, access, history] = await Promise.all(['0009_user_traffic_defaults.sql', '0010_traffic_limits.sql','0011_channel_market.sql','0012_application_linkage.sql','0013_application_integrity.sql','0014_customer_identity.sql','0015_customer_access.sql','0016_experience.sql'].map(async file => {
    const sql = await readFile(new URL('./migrations/' + file, import.meta.url), 'utf8');
    return sql.trim().split('\n').map(line => db.prepare(line));
  }));
  const current = await db.prepare("SELECT name FROM sqlite_schema WHERE type='table' AND name='db_state'").first();
  if (current) {
    const state = await db.prepare('SELECT schema_version FROM db_state WHERE id=1').first();
    if(!Number.isInteger(state?.schema_version) || state.schema_version<1 || state.schema_version>16)throw Error('数据库结构版本不匹配');
    for(const [version,file]of [[2,'0002_domain_records.sql'],[3,'0003_full_model_scope.sql'],[4,'0004_model_metadata.sql'],[5,'0005_billing_item_units.sql'],[6,'0006_token_packages.sql'],[7,'0007_package_model_factors.sql'],[8,'0008_package_factor_rules.sql']])if(state.schema_version<version){const sql=await readFile(new URL('./migrations/'+file,import.meta.url),'utf8');await db.batch(sql.trim().split('\n').filter(Boolean).map(line=>db.prepare(line)));}
    if (state.schema_version < 9) await db.batch(trafficDefaults);
    if (state.schema_version < 10) await db.batch(trafficRules);
    if (state.schema_version < 11) await db.batch(channelMarket);
    if (state.schema_version < 12) await db.batch(application);
    if (state.schema_version < 13) await db.batch(integrity);
    if (state.schema_version < 14) await db.batch(identity);
    if (state.schema_version < 15) await db.batch(access);
    if (state.schema_version < 16) await db.batch(history);
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
    sqlite.exec(await readFile(new URL('./migrations/0005_billing_item_units.sql',import.meta.url),'utf8'));
    sqlite.exec(await readFile(new URL('./migrations/0006_token_packages.sql',import.meta.url),'utf8'));
    sqlite.exec(await readFile(new URL('./migrations/0007_package_model_factors.sql',import.meta.url),'utf8'));
    sqlite.exec(await readFile(new URL('./migrations/0008_package_factor_rules.sql',import.meta.url),'utf8'));
    const schema = sqlite.prepare('SELECT sql FROM sqlite_schema WHERE sql IS NOT NULL ORDER BY rowid').all();
    await db.batch([...schema.map(row => db.prepare(row.sql)), db.prepare('INSERT INTO db_state(id,schema_version,commit_seq) VALUES(1,8,0)'), ...trafficDefaults, ...trafficRules]);
    await db.batch(channelMarket);
    await db.batch(application);
    await db.batch(integrity);
    await db.batch(identity);
    await db.batch(access);
    await db.batch(history);
  } finally { sqlite.close(); }
}

export async function startLocalBackend({ persistPath, loginHashes, port = 0, log, demo = false, presets = false } = {}) {
  const source = fileURLToPath(new URL('../server/api.js', import.meta.url));
  const bundled = await build({ stdin: { contents: `import {handleModelOperations} from ${JSON.stringify(source)}; export default {fetch:handleModelOperations};`, resolveDir: process.cwd() },
    plugins:[modelWorkerDataPlugin], bundle: true, write: false, format: 'esm', platform: 'browser', target: 'es2022' });
  const runtime = new Miniflare({ modules: true, script: bundled.outputFiles[0].text, host: '127.0.0.1', port,
    // The installed local engine supports this date; production compatibility is verified at deployment.
    compatibilityDate: '2026-07-30', d1Databases: ['MODEL_OPS_DB'], d1Persist: persistPath || false,
    bindings: { MODEL_OPS_LOGIN_HASHES: JSON.stringify(loginHashes || {}), MODEL_OPS_DEMO_OTP:'1' }, ...(log ? { log } : {}) });
  try {
    const db = await runtime.getD1Database('MODEL_OPS_DB');
    await migrateEmptyDatabase(db);
    if (demo && !await db.prepare('SELECT id FROM model_workspace WHERE id=1').first()) {
      await initializeDatabase(db, await createSeed());
    }
    const initialization = await initializeModelWorkspace(db, { demo });
    if (presets) {
      await initializePrototypeCatalogue(db);
      await initializeApplication(db);
    }
    return { runtime, db, initialization, url: await runtime.ready };
  } catch (error) { await runtime.dispose(); throw error; }
}
