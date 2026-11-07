import assert from 'node:assert/strict';
import {test} from 'node:test';
import {readFile} from 'node:fs/promises';
import {DatabaseSync} from 'node:sqlite';
import {Miniflare} from 'miniflare';
import {migrateEmptyDatabase} from '../database/local-runtime.js';
import {initialModelWorkspace,projectModelState,loadModelWorkspace,modelChanges} from '../server/model-repository.js';
import {domainModel} from '../src/mock/model-fields.js';

test('v3 to current schema migration preserves every business record and foreign key, then writes only canonical metadata',async()=>{
  const runtime=new Miniflare({modules:true,script:'export default {fetch(){return new Response("test")}}',compatibilityDate:'2026-07-30',d1Databases:['MODEL_OPS_DB']});
  const sqlite=new DatabaseSync(':memory:');
  try{
    const db=await runtime.getD1Database('MODEL_OPS_DB');
    for(const file of ['0001_model_operations.sql','0002_domain_records.sql','0003_full_model_scope.sql'])sqlite.exec(await readFile(new URL('../database/migrations/'+file,import.meta.url),'utf8'));
    const schema=sqlite.prepare('SELECT sql FROM sqlite_schema WHERE sql IS NOT NULL ORDER BY rowid').all();
    await db.batch([...schema.map(row=>db.prepare(row.sql)),db.prepare('INSERT INTO db_state VALUES(1,3,42)'),db.prepare("INSERT INTO admin_accounts VALUES('admin-001','管理员','平台管理员',1,1)")]);
    const state=initialModelWorkspace();state.revision=19;
    const tables=projectModelState(state),statements=[db.prepare('PRAGMA defer_foreign_keys=ON')];
    for(const [table,rows]of Object.entries(tables)){
      const records=[...rows.values()].map(original=>{
        const row={...original};
        if(['materials','model_template_records','services'].includes(table))row.record_json=JSON.stringify(domainModel(JSON.parse(row.record_json),table==='services'));
        if(table==='materials'){row.code=row.canonical_slug;delete row.canonical_slug;const metadata=domainModel(JSON.parse(row.metadata_json));row.profile_json=JSON.stringify(metadata.profile);row.capabilities_json=JSON.stringify(metadata.capabilities);delete row.metadata_json;}
        if(table==='billing_items')row.unit_id=JSON.parse(row.record_json).unitId;
        if(table==='offers'){row.call_id=row.id;row.id=row.record_id;delete row.record_id;}
        return row;
      });
      if(!records.length)continue;
      const keys=[...new Set(records.flatMap(Object.keys))];
      statements.push(db.prepare(`INSERT INTO ${table}(${keys.join(',')}) SELECT ${keys.map(key=>`json_extract(value,'$.${key}')`).join(',')} FROM json_each(?)`).bind(JSON.stringify(records)));
    }
    const reference={...state};for(const key of [...Object.keys(tables),'models','modelTemplates','providers','endpoints','modelSupplies','modelVersions','validations','modelOnboardings','serviceRoutes','modelSalePrices','supplyPrices','tariffDictionary','cloudMockState','modelData'])delete reference[key];
    statements.push(db.prepare('INSERT INTO model_workspace VALUES(1,?,?,?)').bind(state.revision,JSON.stringify({modelData:state.modelData,updatedAt:state.updatedAt}),JSON.stringify(reference)));
    await db.batch(statements);
    await migrateEmptyDatabase(db);
    assert.equal((await db.prepare('SELECT schema_version FROM db_state').first()).schema_version,5);
    assert.equal((await db.prepare('PRAGMA foreign_key_check').all()).results.length,0);
    const restored=await loadModelWorkspace(db,{id:'admin-001',role:'平台管理员'});
    for(const key of ['models','modelTemplates','providers','endpoints','modelSupplies','modelSalePrices','supplyPrices','serviceRoutes'])assert.deepEqual([...restored[key]].sort((a,b)=>a.id.localeCompare(b.id)),[...state[key]].sort((a,b)=>a.id.localeCompare(b.id)),key);
    assert.deepEqual([...restored.tariffDictionary].sort((a,b)=>a.id.localeCompare(b.id)),[...state.tariffDictionary].sort((a,b)=>a.id.localeCompare(b.id)));
    assert.equal((await db.prepare('PRAGMA table_info(billing_items)').all()).results.some(row=>row.name==='unit_id'),false);
    assert.equal(restored.revision,19);assert.equal(restored.commitSeq,42);
    const columns=(await db.prepare('PRAGMA table_info(materials)').all()).results.map(row=>row.name);assert(columns.includes('canonical_slug'));assert(!columns.includes('code'));assert(!columns.includes('capabilities_json'));
    const offers=await db.prepare('SELECT record_id,id FROM offers').all();assert(offers.results.some(row=>row.record_id!==row.id));
    const next=structuredClone(restored);next.modelTemplates[0].profile.supportedParameters=['temperature'];next.modelTemplates[0].profile.defaultParameters={temperature:0};next.revision++;
    await db.batch(modelChanges(db,restored,next));
    const raw=JSON.parse((await db.prepare('SELECT record_json FROM model_template_records WHERE id=?').bind(next.modelTemplates[0].id).first()).record_json);
    assert.equal(raw.default_parameters.temperature,0);assert(!Object.hasOwn(raw.profile,'defaultParameters'));
    assert.deepEqual((await loadModelWorkspace(db,{id:'admin-001',role:'平台管理员'})).modelTemplates,next.modelTemplates);
    await migrateEmptyDatabase(db);assert.equal((await db.prepare('SELECT revision FROM model_workspace').first()).revision,20);
  }finally{sqlite.close();await runtime.dispose();}
});
