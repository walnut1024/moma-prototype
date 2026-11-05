import assert from 'node:assert/strict';
import{readFile,writeFile}from'node:fs/promises';
import{completeServiceShowcase}from'../src/admin-v2/service-showcase-client.js';
import{configureOnboardingTransport}from'../src/admin-v2/onboarding-client.js';
import{useCloudMockSnapshot}from'../src/admin-v2/mock-onboarding-service.js';
const base='https://5120-d1-preview.moma-prototype.pages.dev/api/5120';
const codes=JSON.parse(await readFile(new URL('./.local/cloud-access.json',import.meta.url),'utf8'));
let cookie,state;const timings=[];console.log('验收开始',new Date().toISOString());
async function api(path,{method='GET',body,operationId}={}){
  const at=new Date().toISOString(),start=performance.now();
  const r=await fetch(base+path,{method,headers:{...(cookie?{cookie}:{}),...(method==='GET'?{}:{origin:new URL(base).origin,'x-moma-request':'1','content-type':'application/json'}),...(operationId?{'idempotency-key':operationId}:{})},...(body?{body:JSON.stringify(body)}:{})});
  const raw=await r.text();let data;try{data=JSON.parse(raw)}catch{throw Error(`${path}: HTTP ${r.status} ${raw.match(/<title>([\s\S]*?)<\/title>/)?.[1] || raw.slice(0,100)}`)}
  timings.push({at,path:path.split('?')[0],status:r.status,ms:Math.round(performance.now()-start),bytes:Buffer.byteLength(raw)});
  if(!r.ok || data.error)throw Error(`${path}: HTTP ${r.status} ${data.error?.message}`);return{data,headers:r.headers};
}
try{
  const auth=await api('/auth/login',{method:'POST',body:{accountId:'admin-001',accessCode:codes['admin-001']}});cookie=auth.headers.get('set-cookie').split(';')[0];
  state=(await api('/model-operations')).data;assert.equal(state.models.length,32);assert(state.providers.length>=26);assert.equal(state.endpoints.length,76);useCloudMockSnapshot(state,state.cloudMockState);
  configureOnboardingTransport(async(path,options={})=>{const id=options.body?.operationId;const{data}=await api('/simulation'+path,{method:options.method,body:options.body,operationId:id});state.cloudMockState=data.mockState;useCloudMockSnapshot(state,data.mockState);return data.result;});
  const save=async(previous,action)=>{const id=crypto.randomUUID(),{data:r}=await api('/model-operations/commands',{method:'POST',operationId:id,body:{operationId:id,expectedRevision:previous.revision,action}});const next={...previous,revision:r.revision,modelData:r.modelData,cloudMockState:r.mockState};for(const[key,p]of Object.entries(r.patches)){const remove=new Set([...p.remove,...p.upsert.map(x=>x.id)]);next[key]=[...p.upsert,...previous[key].filter(x=>!remove.has(x.id))]}state=next;useCloudMockSnapshot(next,next.cloudMockState);return next;};
  for(const endpoint of state.endpoints)for(const job of endpoint.serverTestJobs || [])if(!job.receivedAt){let batch=await (await import('../src/admin-v2/onboarding-client.js')).onboardingApi('/tests',{method:'POST',body:job.request});await save(state,{type:'modelOperations',operation:'channelTestEvidenceJob',data:{...job,providerId:endpoint.providerId,endpointId:endpoint.id,batchId:batch.id}});while(['queued','running'].includes(batch.status)){await new Promise(resolve=>setTimeout(resolve,200));batch=await(await import('../src/admin-v2/onboarding-client.js')).onboardingApi('/tests/'+batch.id);}await save(state,{type:'modelOperations',operation:'channelTestEvidenceReceipt',data:{providerId:endpoint.providerId,endpointId:endpoint.id,batch}});}
  state=await completeServiceShowcase(state,save,{onProgress:message=>console.log(message)});
  const fresh=(await api('/model-operations')).data,current=fresh.models.filter(m=>m.serviceShowcase);assert.equal(current.length,2);assert(current.every(m=>m.listingStatus==='已上架' && m.callsEnabled));
  const model=current.find(m=>m.serviceMode==='provider'),history=JSON.stringify(fresh.modelSalePrices);
  state=await save(fresh,{type:'modelOperation',operation:'unlist',modelId:model.id,data:{}});assert.equal(state.models.find(m=>m.id===model.id).listingStatus,'已下架');assert.equal(JSON.stringify(state.modelSalePrices),history);
  if(!state.providers.some(p=>p.code==='remote-d1-qa'))state=await save(state,{type:'modelOperations',operation:'provider',data:{operation:'create',values:{name:'云端 D1 验收',code:'remote-d1-qa',sourceType:'thirdParty'}}});
  if(!state.tariffDictionary.some(p=>p.name==='云端验收单位'))state=await save(state,{type:'modelOperations',operation:'tariffDictionary',data:{operation:'save',kind:'unit',name:'云端验收单位',englishName:'Cloud QA unit'}});
  const reloaded=(await api('/model-operations')).data;assert(reloaded.providers.some(p=>p.code==='remote-d1-qa'));assert(reloaded.tariffDictionary.some(p=>p.name==='云端验收单位'));
  await writeFile(new URL('./.local/remote-verification.json',import.meta.url),JSON.stringify({success:true,timings},null,2),{mode:0o600});console.log(JSON.stringify({success:true,requests:timings.length,maxWallMs:Math.max(...timings.map(t=>t.ms)),bootstrapBytes:timings.find(t=>t.path==='/model-operations').bytes}));
}finally{configureOnboardingTransport(null);}
