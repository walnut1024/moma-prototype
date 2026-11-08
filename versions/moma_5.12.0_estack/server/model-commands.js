import { commitAdminState } from '../src/admin-v2/state-transaction.js';
import { createMockEngine } from '../src/admin-v2/mock-onboarding-core.js';
import { prepareMockOnboardingSync } from '../src/admin-v2/mock-onboarding-sync.js';
import { assertNewMockPublications } from '../src/admin-v2/mock-publication-gate.js';
import { modelWorkspacePayload, loadModelWorkspace, loadSimulationWorkspace, modelChanges, simulatorChanges } from './model-repository.js';
import { storedModel, domainModel } from '../src/mock/model-fields.js';
import { canManagePackages, packageFactorVersion, tokenPackageTransaction } from '../src/admin-v2/token-packages.js';
import { validTrafficLimit } from '../src/admin-v2/traffic-rates.js';

const collections=['models','modelTemplates','providers','endpoints','modelSupplies','modelSalePrices','supplyPrices','modelVersions','validations','modelOnboardings','serviceRoutes','tariffDictionary','tenants','audits'];
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

async function save(db,actor,state,key,id,hash,command,response,statements,audit,entityType='model-operations'){
  const time=Date.now();
  const operation=db.prepare('INSERT INTO operations(id,actor_id,session_id,idempotency_key,command,request_hash,expected_commit_seq,http_status,response_json,created_at) VALUES(?,?,?,?,?,?,?,?,?,?)').bind(id,actor.id,actor.session_id,key,command,hash,state.commitSeq,200,JSON.stringify(response),time);
  const auditId=audit?.id || crypto.randomUUID(),event=audit || {id:auditId,action:command,objectId:id,result:'成功',createdAt:new Date(time).toISOString(),actor:actor.role,actorId:actor.id};
  const write=[db.prepare('PRAGMA defer_foreign_keys=ON'),operation,...statements,
    db.prepare('INSERT INTO audit_events(id,operation_id,entity_type,entity_id,action,diff_json,created_at,record_json) VALUES(?,?,?,?,?,?,?,?)').bind(auditId,id,entityType,event.objectId || id,event.action,JSON.stringify({result:event.result}),time,JSON.stringify(event))];
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

async function loadTrafficLimits(db) {
  const [defaults, rules, catalogue] = await db.batch([
    db.prepare('SELECT t.*,d.commit_seq AS commitSeq FROM traffic_limit_defaults t JOIN db_state d ON d.id=1 WHERE t.id=1'),
    db.prepare('SELECT scope,object_id AS objectId,model_id AS modelId,rpm,tpm FROM traffic_limit_rules ORDER BY scope,object_id,model_id'),
    db.prepare(`SELECT m.id,m.name,m.canonical_slug AS modelId FROM materials m
      WHERE m.deleted_at IS NULL AND json_extract(m.record_json,'$.archivedAt') IS NULL
        AND NOT EXISTS (SELECT 1 FROM model_workspace w, json_each(w.meta_json,'$.modelData.archivedCatalogueIds') archived WHERE archived.value=m.id)
      ORDER BY m.name,m.id`),
  ]);
  const row = defaults.results[0];
  if (!row) issue(503, 'DATABASE_UNAVAILABLE', '限流配置未初始化');
  return { commitSeq: row.commitSeq, revision: row.revision,
    global: { rpm: row.rpm, tpm: row.tpm }, modelDefault: { rpm: row.model_rpm, tpm: row.model_tpm },
    rules: rules.results, catalogue: catalogue.results };
}

export async function readTrafficLimits(db, actor) {
  const { commitSeq: _commitSeq, ...settings } = await loadTrafficLimits(db);
  return { ...settings, accountId: actor.id };
}

const ratePair = value => value ? { rpm: value.rpm, tpm: value.tpm } : null;
const sameRate = (a, b) => a?.rpm === b?.rpm && a?.tpm === b?.tpm;

function trafficChanges(current, { operation, id, data }) {
  const changes = [];
  const add = (scope, objectId, before, after, action, modelId = '') => {
    if (!sameRate(before, after)) changes.push({ scope, objectId, modelId, before: ratePair(before), after: ratePair(after), action });
  };
  const requireLimit = (value, allowed = ['rpm', 'tpm']) => {
    if (!validTrafficLimit(value) || Object.keys(value).some(field => !allowed.includes(field))) {
      issue(400, 'INVALID_INPUT', 'RPM 和 TPM 须为有效正整数');
    }
  };
  const hasModel = id => current.catalogue.some(row => row.id === id);
  if ((operation === 'defaults' || operation === 'modelDefaults') && id === '') {
    requireLimit(data);
    if (operation === 'defaults') add('user-default', 'user-traffic-defaults', current.global, data, '保存全局默认限流');
    else add('model-default', 'model-traffic-defaults', current.modelDefault, data, '保存模型默认限流');
  } else if (operation === 'batchAccounts') {
    const { accountIds, limit } = data || {};
    if (!Array.isArray(accountIds) || !accountIds.length || !accountIds.every(validId) || new Set(accountIds).size !== accountIds.length
      || (id && (accountIds.length !== 1 || id !== accountIds[0])) || Object.keys(data).some(field => !['accountIds','limit'].includes(field))) {
      issue(400, 'INVALID_INPUT', '请选择有效且不重复的账号');
    }
    if (limit !== null) requireLimit(limit);
    const action = (id ? '' : '批量') + (limit ? '修改账号限流额度' : '恢复账号默认额度');
    for (const accountId of accountIds) add('account', accountId,
      current.rules.find(rule => rule.scope === 'account' && rule.objectId === accountId), limit, action);
  } else if (operation === 'model' && validId(id)) {
    if (!hasModel(id)) issue(404, 'NOT_FOUND', '模型资料不存在');
    if (data !== null) requireLimit(data);
    add('model', id, current.rules.find(rule => rule.scope === 'model' && rule.objectId === id), data,
      data ? '保存模型共享上限' : '恢复模型默认额度');
  } else if (operation === 'exceptions' && validId(id)) {
    const exceptions = data?.exceptions;
    if (!Array.isArray(exceptions) || exceptions.some(row => !validId(row?.modelId))
      || new Set(exceptions.map(row => row.modelId)).size !== exceptions.length || Object.keys(data).length !== 1) {
      issue(400, 'INVALID_INPUT', '同一模型只能配置一条额度');
    }
    const previous = new Map(current.rules.filter(rule => rule.scope === 'policy' && rule.objectId === id).map(rule => [rule.modelId, rule]));
    const next = new Map(exceptions.map(row => [row.modelId, row]));
    for (const [modelId, row] of next) {
      requireLimit(row, ['modelId', 'rpm', 'tpm']);
      if (!sameRate(previous.get(modelId), row) && !hasModel(modelId)) issue(404, 'NOT_FOUND', '模型资料不存在，无法修改其额度');
    }
    for (const modelId of new Set([...previous.keys(), ...next.keys()])) {
      const before = previous.get(modelId), after = next.get(modelId);
      add('policy', id, before, after, !before ? '新增一客一策' : after ? '修改一客一策' : '移除一客一策', modelId);
    }
  } else {
    issue(400, 'INVALID_INPUT', '未知的限流配置操作');
  }
  return changes;
}

export async function updateTrafficLimits(db, actor, body, key) {
  const { operationId, expectedRevision, accountId, id } = body;
  if (!validId(key) || !validId(operationId) || !validId(accountId) || !Number.isSafeInteger(expectedRevision)
    || expectedRevision < 1 || (id !== '' && !validId(id))) issue(400, 'INVALID_INPUT', '账号、操作标识或修订号无效');
  if (accountId !== actor.id) issue(403, 'ACCOUNT_MISMATCH', '请使用当前后台账号登录');
  const hash = await digest(['traffic.update', body]);
  const previous = await receipt(db, actor, key, hash, operationId);
  if (previous) return previous;
  const current = await loadTrafficLimits(db);
  if (current.revision !== expectedRevision) issue(409, 'REVISION_CONFLICT', '限流配置已更新，请载入最新值；当前输入保留');
  const changes = trafficChanges(current, body);
  const global = changes.find(change => change.scope === 'user-default')?.after || current.global;
  const model = changes.find(change => change.scope === 'model-default')?.after || current.modelDefault;
  const rules = changes.filter(change => ['account', 'model', 'policy'].includes(change.scope));
  const remove = rules.filter(change => change.after === null);
  const upsert = rules.filter(change => change.after !== null);
  const statements = [db.prepare('UPDATE traffic_limit_defaults SET rpm=?,tpm=?,model_rpm=?,model_tpm=?,revision=revision+1 WHERE id=1')
    .bind(global.rpm, global.tpm, model.rpm, model.tpm)];
  if (remove.length) statements.push(db.prepare(`DELETE FROM traffic_limit_rules WHERE (scope,object_id,model_id) IN
    (SELECT json_extract(value,'$.scope'),json_extract(value,'$.objectId'),json_extract(value,'$.modelId') FROM json_each(?))`).bind(JSON.stringify(remove)));
  if (upsert.length) statements.push(db.prepare(`INSERT INTO traffic_limit_rules(scope,object_id,model_id,rpm,tpm)
    SELECT json_extract(value,'$.scope'),json_extract(value,'$.objectId'),json_extract(value,'$.modelId'),
      json_extract(value,'$.after.rpm'),json_extract(value,'$.after.tpm') FROM json_each(?) WHERE 1
    ON CONFLICT(scope,object_id,model_id) DO UPDATE SET rpm=excluded.rpm,tpm=excluded.tpm`).bind(JSON.stringify(upsert)));
  const result = { revision: current.revision + 1, accountId };
  const audit = { id: crypto.randomUUID(), objectId: id || 'traffic-limits', action: changes[0]?.action || '保存限流配置',
    result: '成功', actor: actor.role, actorId: actor.id, actorName: actor.name, createdAt: new Date().toISOString(), trafficChanges: changes };
  return save(db, actor, current, key, operationId, hash, 'traffic.update', result, statements, audit, 'traffic-limits');
}

async function loadPackageWorkspace(db) {
  const [sequence, records, models, items] = await db.batch([
    db.prepare('SELECT commit_seq, (SELECT revision FROM model_workspace WHERE id=1) AS model_revision FROM db_state WHERE id=1'),
    db.prepare(`SELECT collection, workspace_revision, record_json,
        collection='tokenPackages' AND EXISTS (
          SELECT 1 FROM audit_events WHERE entity_type='token-package' AND entity_id=record.id AND action='发布套餐'
        ) AS ever_published
      FROM token_package_records AS record
      UNION ALL SELECT 'tokenPackageFactors', workspace_revision, record_json, 0 FROM token_package_model_factors ORDER BY workspace_revision DESC`),
    db.prepare(`SELECT m.id, COALESCE(json_extract(s.record_json, '$.name'), m.name) AS name, s.code, s.id AS serviceId,
        (SELECT json_group_array(DISTINCT p.billing_item_id)
          FROM offers o JOIN price_items p ON p.price_version_id=o.active_sale_price_id
          WHERE o.service_id=s.id AND o.mode_epoch=s.mode_epoch AND o.retired_at IS NULL) AS billing_items
      FROM services s JOIN materials m ON m.id=s.material_id
      WHERE s.deleted_at IS NULL AND m.deleted_at IS NULL AND json_extract(s.record_json, '$.archivedAt') IS NULL
      ORDER BY name, m.id`),
    db.prepare('SELECT id, name FROM billing_items WHERE deleted_at IS NULL ORDER BY builtin DESC, name, id'),
  ]);
  const state = { commitSeq: sequence.results[0].commit_seq, modelRevision: sequence.results[0].model_revision,
    revision: records.results[0]?.workspace_revision ?? 0, tokenPackages: [], tokenPackageTypes: [], tokenPackageFactors: [],
    packageModels: models.results.map(({ billing_items, ...model }) => ({ ...model, billingItemIds: JSON.parse(billing_items) })),
    packageBillingItems: items.results };
  for (const row of records.results) {
    const record = JSON.parse(row.record_json);
    if (row.ever_published) record.everPublished = true;
    if (!record.deletedAt) state[row.collection].push(record);
  }
  const referenced = new Set(state.tokenPackages.flatMap(record => record.modelIds ?? []));
  for (const config of state.tokenPackageFactors) {
    if (config.enabled === undefined && config.rules.length && referenced.has(config.id)) config.enabled = true;
  }
  return state;
}

export async function packageBootstrap(db, actor) {
  const [{ commitSeq: _commitSeq, ...state }, accounts] = await Promise.all([
    loadPackageWorkspace(db),
    db.prepare("SELECT id, name, role, '已启用' AS status FROM admin_accounts WHERE enabled=1 ORDER BY id").all(),
  ]);
  return { ...state, cloudOperations: true, currentRole: actor.role, adminSession: { accountId: actor.id }, admins: accounts.results,
    alerts: [], requests: [], modelOnboardings: [], deployments: [] };
}

export async function packageFactorHistory(db, modelId) {
  if (!validId(modelId)) issue(400, 'INVALID_INPUT', '模型标识无效');
  const { results } = await db.prepare(`SELECT e.record_json, a.name AS actor_name FROM audit_events e
    JOIN operations o ON o.id=e.operation_id LEFT JOIN admin_accounts a ON a.id=o.actor_id
    WHERE e.entity_type='token-package-factor' AND e.entity_id=? AND o.command IN ('package.publishFactorRules','package.setFactorRules')
    ORDER BY e.created_at DESC, o.expected_commit_seq DESC`).bind(modelId).all();
  return { history: results.map(({ record_json, actor_name }) => {
    const { id, before, after, createdAt, actorId, billingItemNames } = JSON.parse(record_json);
    const snapshot = config => ({
      version: packageFactorVersion(config), enabled: config?.enabled === true,
      rules: (config?.rules ?? []).map(rule => ({ ...rule, billingItem: billingItemNames?.[rule.billingItemId] })),
    });
    return { id, actor: actor_name || actorId, createdAt, version: after.version, changeNote: after.changeNote,
      before: snapshot(before), after: snapshot(after) };
  }) };
}

export async function packageCommand(db, actor, body, key) {
  const { operationId, expectedRevision, action } = body ?? {};
  if (!validId(key) || !validId(operationId) || !Number.isSafeInteger(expectedRevision) || expectedRevision < 0
    || action?.type !== 'tokenPackage' || !['save', 'publishPackage', 'list', 'unlist', 'deletePackage', 'addType', 'deleteType', 'saveFactorDraft', 'publishFactorRules'].includes(action.operation)
    || Object.keys(action).some(field => !['type', 'operation', 'id', 'revision', 'values'].includes(field))
    || (action.id !== undefined && (!validId(action.id) || !Number.isSafeInteger(action.revision) || action.revision < 1))) {
    issue(400, 'INVALID_INPUT', '套餐命令、操作标识或修订号无效');
  }
  if (!canManagePackages(actor.role, action.operation)) issue(403, 'FORBIDDEN', '当前账号无此套餐操作权限');
  rejectSecrets(action);
  const hash = await digest(['package-management', body]);
  const prior = await receipt(db, actor, key, hash, operationId);
  if (prior) return prior;
  const state = await loadPackageWorkspace(db);
  if (state.revision !== expectedRevision) issue(409, 'REVISION_CONFLICT', '套餐管理已有修订，请载入最新数据；当前输入保留');
  let change;
  try { change = tokenPackageTransaction(state, action); }
  catch (error) { issue(422, 'BUSINESS_BLOCKED', error.message); }
  const { collection, label } = change;
  const removing = change.type === 'remove';
  const before = change.type === 'add' ? null : state[collection].find(row => row.id === change.id);
  const timestamp = new Date().toISOString();
  const record = { createdAt: timestamp, ...before, ...change.record, ...change.changes, updatedAt: timestamp };
  if (action.operation === 'publishFactorRules') record.publishedAt = timestamp;
  if (removing) record.deletedAt = timestamp;
  const revision = state.revision + 1;
  const patch = removing ? { upsert: [], remove: [record.id] } : { upsert: [record], remove: [] };
  const result = { operationId, revision, objectId: record.id, patches: { [collection]: patch }, updatedAt: timestamp };
  const stored = JSON.stringify(record);
  const statement = collection === 'tokenPackageFactors'
    ? db.prepare('INSERT INTO token_package_model_factors(id,workspace_revision,record_json) VALUES(?,?,?) ON CONFLICT(id) DO UPDATE SET workspace_revision=excluded.workspace_revision, record_json=excluded.record_json').bind(record.id, revision, stored)
    : before
      ? db.prepare('UPDATE token_package_records SET workspace_revision=?, record_json=? WHERE collection=? AND id=?').bind(revision, stored, collection, record.id)
      : db.prepare('INSERT INTO token_package_records(workspace_revision,record_json,collection,id) VALUES(?,?,?,?)').bind(revision, stored, collection, record.id);
  const audit = { id: crypto.randomUUID(), actor: actor.role, actorId: actor.id, objectId: record.id, action: label,
    result: '成功', createdAt: timestamp, before, after: record };
  if (action.operation === 'publishFactorRules') {
    const itemIds = new Set([...before.rules, ...record.rules].map(rule => rule.billingItemId));
    audit.billingItemNames = Object.fromEntries(state.packageBillingItems.filter(item => itemIds.has(item.id)).map(item => [item.id, item.name]));
  }
  const entityTypes = { tokenPackages: 'token-package', tokenPackageTypes: 'token-package-type', tokenPackageFactors: 'token-package-factor' };
  return save(db, actor, state, key, operationId, hash, 'package.' + action.operation, result, [statement], audit, entityTypes[collection]);
}

export async function modelCommand(db,actor,body,key){
  if(!['平台管理员','运营人员'].includes(actor.role))issue(403,'FORBIDDEN','当前账号无模型运营修改权限');
  if(!validId(key) || !validId(body?.operationId) || !Number.isSafeInteger(body.expectedRevision) || !body.action || !['modelOperations','modelOperation','providerOperation'].includes(body.action.type) || typeof body.action.operation!=='string')issue(400,'INVALID_INPUT','业务命令、操作标识或修订号无效');
  if(Object.keys(body.action).some(k=>!['type','operation','modelId','data'].includes(k)))issue(400,'INVALID_INPUT','不允许提交身份或底层集合写入');
  const importingDemo=body.action.operation==='prepareServiceShowcase';
  if(importingDemo && actor.role!=='平台管理员')issue(403,'FORBIDDEN','当前账号无演示包导入权限');
  rejectSecrets(body.action);
  const hash=await digest(body),prior=await receipt(db,actor,key,hash,body.operationId);if(prior)return prior;
  const before=await loadModelWorkspace(db,actor,{command:true});
  if(before.revision!==body.expectedRevision)issue(409,'REVISION_CONFLICT','模型运营已有修订，请载入最新数据；当前输入保留');
  const dictionaryChange = body.action.operation === 'tariffDictionary' ? body.action.data : null;
  if (body.action.operation === 'serviceArchive' && typeof body.action.modelId === 'string') {
    const reference = await db.prepare(`SELECT 1 FROM token_package_records p, json_each(p.record_json, '$.modelIds') model
      JOIN services s ON s.material_id=model.value
      WHERE p.collection='tokenPackages' AND json_extract(p.record_json, '$.deletedAt') IS NULL AND s.id=? LIMIT 1`)
      .bind(body.action.modelId).first();
    if (reference) issue(422, 'BUSINESS_BLOCKED', '该模型服务仍被套餐引用，请先调整套餐的支持模型再归档');
  }
  if (dictionaryChange?.operation === 'delete' && typeof dictionaryChange.id === 'string') {
    const reference = await db.prepare(`SELECT 1 FROM token_package_model_factors f
      WHERE EXISTS (SELECT 1 FROM json_each(f.record_json, '$.rules') WHERE json_extract(value, '$.billingItemId')=?1)
         OR EXISTS (SELECT 1 FROM json_each(f.record_json, '$.draft.rules') WHERE json_extract(value, '$.billingItemId')=?1)
      LIMIT 1`).bind(dictionaryChange.id).first();
    if (reference) issue(422, 'BUSINESS_BLOCKED', '该计费项仍被套餐抵扣规则引用，请先调整规则再删除');
  }
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
  const statements=[...modelChanges(db,before,next,{insertOnly:importingDemo}),...simulatorChanges(db,before.cloudMockState,next.cloudMockState)];
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
