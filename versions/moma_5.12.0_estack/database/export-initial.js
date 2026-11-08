import {writeFile} from 'node:fs/promises';
import {startLocalBackend} from './local-runtime.js';

// Offline release artifact only. This never reads a user's browser or QA database.
const local=await startLocalBackend({ presets:true });
try {
  const {results:schema}=await local.db.prepare("SELECT name,type,sql FROM sqlite_schema WHERE sql IS NOT NULL AND name NOT LIKE 'sqlite_%' AND name NOT LIKE '_cf_%' ORDER BY rowid").all();
  const quote=value=>value===null?'NULL':typeof value==='number'?String(value):"'"+String(value).replaceAll("'","''")+"'";
  const lines=['PRAGMA defer_foreign_keys=ON;',...schema.filter(r=>r.type==='table').map(r=>r.sql+';')];
  const counts={},pointers=[];let chunkId=0;
  lines.push('CREATE TABLE _initial_import_chunks(id INTEGER,seq INTEGER,value TEXT);');
  const field=value=>{if(typeof value!=='string' || Buffer.byteLength(value)<16000)return quote(value);const id=++chunkId;for(let i=0;i<value.length;i+=4000)lines.push(`INSERT INTO _initial_import_chunks VALUES(${id},${i},${quote(value.slice(i,i+4000))});`);return `(SELECT group_concat(value,'') FROM (SELECT value FROM _initial_import_chunks WHERE id=${id} ORDER BY seq))`;};
  for(const row of schema.filter(r=>r.type==='table')){
    const {results}=await local.db.prepare(`SELECT * FROM ${row.name}`).all();counts[row.name]=results.length;
    for(const item of results){
      for(const key of ['active_purchase_price_id','active_sale_price_id','active_route_id','active_publication_id'])if(item[key]!=null){pointers.push(`UPDATE ${row.name} SET ${key}=${quote(item[key])} WHERE id=${quote(item.id)};`);item[key]=null;}
      const values=Object.values(item).map(field);
      lines.push(`INSERT INTO ${row.name}(${Object.keys(item).join(',')}) VALUES(${values.join(',')});`);
    }
  }
  lines.push(...pointers,'DROP TABLE _initial_import_chunks;');
  if(lines.some(line=>Buffer.byteLength(line)>90000))throw Error('导入语句超出 D1 长度预算');
  lines.push(...schema.filter(r=>r.type!=='table').map(r=>r.sql+';'));
  if((await local.db.prepare('PRAGMA foreign_key_check').all()).results.length)throw Error('初始化引用不完整');
  const filename=new URL('./.local/initial-model-operations.sql',import.meta.url);
  await writeFile(filename,lines.join('\n'),{mode:0o600});
  console.log(JSON.stringify({file:filename.pathname,counts,bytes:Buffer.byteLength(lines.join('\n'))}));
}finally{await local.runtime.dispose();}
