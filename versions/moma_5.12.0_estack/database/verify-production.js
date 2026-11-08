import { API_PREFIX } from '../api-path.js';
import assert from 'node:assert/strict';
import{readFile,writeFile}from'node:fs/promises';
const base='https://moma-prototype.pages.dev'+API_PREFIX,codes=JSON.parse(await readFile(new URL('./.local/cloud-access.json',import.meta.url),'utf8'));
let cookie;
async function api(path,{method='GET',body,id}={}){
  const r=await fetch(base+path,{method,headers:{...(cookie?{cookie}:{}),...(method==='GET'?{}:{origin:new URL(base).origin,'x-moma-request':'1','content-type':'application/json'}),...(id?{'idempotency-key':id}:{})},...(body?{body:JSON.stringify(body)}:{})});const raw=await r.text();let data;try{data=JSON.parse(raw)}catch{throw Error(`${path}: HTTP ${r.status}`)}if(!r.ok)throw Error(`${path}: HTTP ${r.status} ${data.error?.message}`);return{data,headers:r.headers,bytes:Buffer.byteLength(raw)};
}
const health=(await api('/health')).data;assert.equal(health.schemaVersion,14);
const auth=await api('/auth/login',{method:'POST',body:{accountId:'admin-001',accessCode:codes['admin-001']}});assert.match(auth.headers.get('set-cookie'),/HttpOnly; Secure; SameSite=Lax/);cookie=auth.headers.get('set-cookie').split(';')[0];
const initial=await api('/model-operations'),model=initial.data.models.find(m=>m.id==='model-glm53'),visible=model.marketVisible!==false;
assert.equal(initial.data.models.length,32);assert.equal(initial.data.providers.length,26);assert.equal(initial.data.endpoints.length,76);assert(initial.data.models.filter(m=>m.serviceShowcase).every(m=>m.listingStatus==='已下架' && !m.callsEnabled));
async function visibility(state,target){const m=state.models.find(m=>m.id===model.id),id=crypto.randomUUID();await api('/model-operations/commands',{method:'POST',id,body:{operationId:id,expectedRevision:state.revision,action:{type:'modelOperations',operation:'marketVisibility',modelId:m.id,data:{visible:target,expectedUpdatedAt:m.updatedAt}}}});return(await api('/model-operations')).data;}
// Reversible presentation-only verification; no test model is published or made callable.
let current;
try{current=await visibility(initial.data,!visible);assert.equal(current.models.find(m=>m.id===model.id).marketVisible,!visible);}finally{const latest=(await api('/model-operations')).data;current=latest.models.find(m=>m.id===model.id).marketVisible!==visible?await visibility(latest,visible):latest;}
assert.equal(current.models.find(m=>m.id===model.id).marketVisible,visible);assert(current.models.filter(m=>m.serviceShowcase).every(m=>m.listingStatus==='已下架' && !m.callsEnabled));
const report={success:true,at:new Date().toISOString(),health,counts:{models:current.models.length,providers:current.providers.length,endpoints:current.endpoints.length},bootstrapBytes:initial.bytes,revision:current.revision,visibilityRestored:true};
await writeFile(new URL('./.local/production-verification.json',import.meta.url),JSON.stringify(report,null,2),{mode:0o600});console.log(JSON.stringify(report));
