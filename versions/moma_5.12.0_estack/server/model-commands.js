import { commitAdminState } from '../src/admin-v2/state-transaction.js';
import { createMockEngine } from '../src/admin-v2/mock-onboarding-core.js';
import { prepareMockOnboardingSync } from '../src/admin-v2/mock-onboarding-sync.js';
import { assertNewMockPublications } from '../src/admin-v2/mock-publication-gate.js';
import { modelWorkspacePayload, loadModelWorkspace, loadSimulationWorkspace, modelChanges, simulatorChanges } from './model-repository.js';
import { storedModel, domainModel } from '../src/mock/model-fields.js';

const collections=['models','modelTemplates','providers','endpoints','modelSupplies','modelSalePrices','supplyPrices','modelVersions','validations','modelOnboardings','serviceRoutes','tariffDictionary','audits'];
const canonical=value=>value && typeof value==='object'?Array.isArray(value)?value.map(canonical):Object.fromEntries(Object.keys(value).sort().map(k=>[k,canonical(value[k])])):value;
const digest=async value=>Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(JSON.stringify(canonical(value))))),b=>b.toString(16).padStart(2,'0')).join('');
const issue=(status,code,message)=>{throw Object.assign(new Error(message),{status,code});};
const rejectSecrets=value=>{if(!value || typeof value!=='object')return;for(const [key,item]of Object.entries(value)){if(/^(secret|password|authorization|cookie|keyInputs|keyInput)$/i.test(key) && item && (!Array.isArray(item) || item.length))issue(400,'INVALID_INPUT','请先在浏览器生成密钥掩码和指纹，明文不得提交');rejectSecrets(item);}};
const validId=value=>typeof value==='string' && /^[A-Za-z0-9:_.-]{1,200}$/.test(value);

function patches(before,after){
  return Object.fromEntries(collections.flatMap(key=>{
    const a=new Map((before[key] || []).map(r=>[r.id,JSON.stringify(r)])),rows=after[key] || [],ids=new Set(rows.map(r=>r.id));
    const changed=rows.filter(r=>a.get(r.id)!==JSON.stringify(r)),remove=[...a.keys()].filter(id=>!ids.has(id));
    // Revision signatures must see the same field order in command patches and D1 reads.
    const upsert=['models','modelTemplates'].includes(key)?changed.map(row=>domainModel(storedModel(row,key==='models'),key==='models')):changed;
    return upsert.length || remove.length?[[key,{upsert:key==='audits'?upsert.map(row=>Object.fromEntries(Object.entries(row).filter(([field])=>!['before','after'].includes(field)))):upsert,remove}]]:[];
  }));
}

async function receipt(db,actor,key,hash,id){
  const row=await db.prepare('SELECT id,request_hash,response_json FROM operations WHERE actor_id=? AND idempotency_key=?').bind(actor.id,key).first();
  if(!row)return null;
  if(row.request_hash!==hash || row.id!==id)issue(409,'IDEMPOTENCY_CONFLICT','同一操作标识不能提交不同内容');
  return JSON.parse(row.response_json);
}

async function save(db,actor,state,key,id,hash,command,response,statements,audit){
  const time=Date.now();
  const operation=db.prepare('INSERT INTO operations(id,actor_id,session_id,idempotency_key,command,request_hash,expected_commit_seq,http_status,response_json,created_at) VALUES(?,?,?,?,?,?,?,?,?,?)').bind(id,actor.id,actor.session_id,key,command,hash,state.commitSeq,200,JSON.stringify(response),time);
  const auditId=audit?.id || crypto.randomUUID(),event=audit || {id:auditId,action:command,objectId:id,result:'成功',createdAt:new Date(time).toISOString(),actor:actor.role,actorId:actor.id};
  const write=[db.prepare('PRAGMA defer_foreign_keys=ON'),operation,...statements,
    db.prepare('INSERT INTO audit_events(id,operation_id,entity_type,entity_id,action,diff_json,created_at,record_json) VALUES(?,?,?,?,?,?,?,?)').bind(auditId,id,'model-operations',event.objectId || id,event.action,JSON.stringify({result:event.result}),time,JSON.stringify(event))];
  for(const modelId of event.relatedModelIds || []){
    const model=state.models.find(m=>m.id===modelId),materialId=model?.templateId || modelId;
    if(state.models.some(m=>m.id===modelId) || state.modelTemplates.some(m=>m.id===modelId))write.push(db.prepare('INSERT OR IGNORE INTO audit_models(audit_id,material_id,created_at) VALUES(?,?,?)').bind(auditId,materialId,time));
  }
  if(write.length>26)issue(413,'SCOPE_TOO_LARGE','本次原子修改范围过大，请减少批量数量');
  try{await db.batch(write);}catch(error){
    if(String(error).includes('session_invalid'))issue(401,'SESSION_EXPIRED','会话已失效');
    if(/commit_conflict|UNIQUE constraint/.test(String(error))){const replay=await receipt(db,actor,key,hash,id);if(replay)return replay;console.warn('Model transaction constraint:',String(error).slice(0,250));issue(409,'REVISION_CONFLICT','数据已有并发提交，请重新核对；当前输入保留');}
    throw error;
  }
  return response;
}

export async function modelBootstrap(db,actor){return modelWorkspacePayload(db,actor);}

export async function modelCommand(db,actor,body,key){
  if(!['平台管理员','运营人员'].includes(actor.role))issue(403,'FORBIDDEN','当前账号无模型运营修改权限');
  if(!validId(key) || !validId(body?.operationId) || !Number.isSafeInteger(body.expectedRevision) || !body.action || !['modelOperations','modelOperation','providerOperation'].includes(body.action.type) || typeof body.action.operation!=='string')issue(400,'INVALID_INPUT','业务命令、操作标识或修订号无效');
  if(Object.keys(body.action).some(k=>!['type','operation','modelId','data'].includes(k)))issue(400,'INVALID_INPUT','不允许提交身份或底层集合写入');
  rejectSecrets(body.action);
  const hash=await digest(body),prior=await receipt(db,actor,key,hash,body.operationId);if(prior)return prior;
  const before=await loadModelWorkspace(db,actor,{command:true});
  if(before.revision!==body.expectedRevision)issue(409,'REVISION_CONFLICT','模型运营已有修订，请载入最新数据；当前输入保留');
  const engine=createMockEngine({initialState:before.cloudMockState,localState:before});engine.setMockRuntimeState(before);engine.invoke('/audits');before.cloudMockState=engine.snapshot();
  const action=structuredClone(body.action);
  if(action.data?.batch){const actual=engine.snapshot().batches.find(b=>b.id===action.data.batch.id);if(!actual)issue(422,'BUSINESS_BLOCKED','检测任务回执不存在');action.data.batch=actual;}
  let next;
  try{
    next=commitAdminState(before,action,actor.role);
    if(next.audits[0])next.audits[0].actorId=actor.id;
    const sync=prepareMockOnboardingSync(before,next,action);
    assertNewMockPublications(before,next,action,sync?.after);
    next.cloudMockState=sync?.after || engine.snapshot();next.cloudMockState.operations={};
  }catch(error){issue(422,'BUSINESS_BLOCKED',error.message);}
  const result={operationId:body.operationId,revision:next.revision,patches:patches(before,next),modelData:next.modelData,mockState:next.cloudMockState,updatedAt:next.updatedAt};
  const statements=[...modelChanges(db,before,next),...simulatorChanges(db,before.cloudMockState,next.cloudMockState)];
  return save(db,actor,before,key,body.operationId,hash,action.operation,result,statements,next.audits[0]);
}

export async function simulationRequest(db,actor,path,method,body,key){
  if(!['平台管理员','运营人员'].includes(actor.role))issue(403,'FORBIDDEN','当前账号无模型运营权限');
  if(!/^\/(scenario|health|credentials|channels|discover|tests|services|configuration-changes|usage|audits)(\/|\?|$)/.test(path))issue(404,'NOT_FOUND','模拟接口不在管理端范围');
  rejectSecrets(body);
  if(method!=='GET' && (!validId(key) || !validId(body?.operationId)))issue(400,'INVALID_INPUT','模拟操作须提供稳定操作标识');
  const hash=method==='GET'?null:await digest([path,method,body]),id=body?.operationId;
  if(method!=='GET'){const prior=await receipt(db,actor,key,hash,id);if(prior)return prior;}
  const dispatch=method==='POST' && (/^\/services\/[^/]+\/trial$/.test(path) || path==='/client/completions');
  const state=dispatch?await loadModelWorkspace(db,actor):await loadSimulationWorkspace(db),engine=createMockEngine({initialState:state.cloudMockState,localState:state});engine.setMockRuntimeState(state);
  if(body?.clientChannelId && !state.endpoints.some(e=>e.providerId===body.providerId && (e.id===body.clientChannelId || body.clientChannelId.startsWith(e.id+'-temporary-'))))issue(422,'BUSINESS_BLOCKED','模拟渠道必须关联当前服务商的实际渠道');
  if(method==='GET' && path.startsWith('/tests?operationId=')){const operationId=new URL('https://simulation.test'+path).searchParams.get('operationId'),prior=await db.prepare('SELECT response_json FROM operations WHERE actor_id=? AND id=?').bind(actor.id,operationId).first();if(!prior)issue(404,'submission_not_found','未找到此操作 ID 的测试提交');const batchId=JSON.parse(prior.response_json).result?.id;if(!batchId)issue(404,'submission_not_found','未找到此操作 ID 的测试提交');path='/tests/'+batchId;}
  let result;
  try{if(path==='/scenario'){engine.setMockScenario(body.scenario);result={scenario:body.scenario};}else result=engine.invoke(path,{method,body});}catch(error){
    if(!error.persistMockState)issue(422,error.code || 'BUSINESS_BLOCKED',error.message);
    const failure={error:{code:error.code || 'BUSINESS_BLOCKED',message:error.message},mockState:engine.snapshot(),revision:state.revision};
    return save(db,actor,state,key,id,hash,`simulation.failed.${path}`,failure,simulatorChanges(db,state.cloudMockState,engine.snapshot()));
  }
  const snapshot=engine.snapshot();snapshot.operations={};
  const response={result,mockState:snapshot,revision:state.revision};
  if(method==='GET')return response;
  return save(db,actor,state,key,id,hash,`simulation.${method}.${path}`,response,simulatorChanges(db,state.cloudMockState,snapshot));
}
