import { BUILTIN_MODEL_CATALOGUE, seedBuiltinModelCatalogue } from '../src/mock/builtin-model-catalogue.js';
import {initialWorkspace,applyModelDataset,systemModelData,systemModelOrigin, MODEL_DATASET } from '../src/mock/model-data.js';
import { initialApplicationData } from '../src/mock/application-data.js';
import { libraryRecord, modelLibrary } from '../src/admin-v2/model-library.js';
import {providerKeyGroups} from '../src/admin-v2/provider-key-groups.js';
import { createMockEngine } from '../src/admin-v2/mock-onboarding-core.js';

import { offerKey, offerStage, offerGrayTenants } from '../src/service-access.mjs';
import {storedModel,domainModelWorkspace} from '../src/mock/model-fields.js';
const j=JSON.stringify;
const at=value=>Number.isFinite(Date.parse(value))?Date.parse(value):0;
const bool=value=>Number(value===true || ['已启用','有效','已生效'].includes(value));
const offerId=(model,providerId,epoch=model.serviceModeRevision || 1)=>`${providerId?'provider:'+model.id+':'+providerId:'standard:'+model.id}${epoch>1?':epoch:'+epoch:''}`;
const pk={offers:['record_id'],key_group_members:['group_id','credential_id'],channel_keys:['channel_id','credential_id'],offer_channels:['offer_id','channel_model_id'],route_members:['route_version_id','channel_model_id'],simulation_records:['kind','id']};
const entityTables={models:'services',modelTemplates:'model_template_records',providers:'suppliers',endpoints:'channels',modelSupplies:'service_supply_records',modelVersions:'model_versions',validations:'model_validations',modelOnboardings:'onboarding_tasks',serviceRoutes:'service_route_records'};

export function initialModelWorkspace(){
  const initial=initialApplicationData(0),reference={};
  for(const [key,value]of Object.entries(initial))reference[key]=Array.isArray(value)?[]:value;
  for(const key of ['tenants','projects','apiKeys','grants','admins','users','memberships','organizations','orders','products'])reference[key]=initial[key];
  reference.requests=[];reference.audits=[];
  const composed=applyModelDataset(initialWorkspace({...initial,...systemModelData(),modelData:systemModelOrigin()}));
  const c=Object.fromEntries(Object.keys(MODEL_DATASET.collections).map(key=>[key,composed[key]]));
  composed.modelData.sourceScope='full-static-model-scope-v1';
  composed.modelData.importedPriceIds=[...c.modelSalePrices.map(v=>v.id),...c.supplyPrices.map(v=>v.id),...c.providers.flatMap(p=>(p.catalogConnections || []).flatMap(a=>(a.procurementVersions || []).map(v=>v.id)))];
  return seedBuiltinModelCatalogue({...reference,...c,tariffDictionary:initial.tariffDictionary,revision:0,updatedAt:initial.updatedAt,cloudOperations:true,
    modelData:composed.modelData,cloudMockState:createMockEngine().snapshot()});
}

// Reference materials retain their established IDs so a demo can use the same master records.
function initialReferenceWorkspace(){
  const initial=initialApplicationData(0);
  const reference=Object.fromEntries(Object.entries(initial).map(([key,value])=>[key,Array.isArray(value)?[]:value]));
  delete reference.initialData;
  const collections=Object.fromEntries(Object.keys(MODEL_DATASET.collections).map(key=>[key,[]]));
  const state=seedBuiltinModelCatalogue({...reference,...collections,admins:initial.admins,
    tariffDictionary:initial.tariffDictionary,revision:0,cloudOperations:true,
    modelData:{sourceScope:'reference-only-v1',builtinIds:{},userIds:{}},cloudMockState:createMockEngine().snapshot()});
  for(const template of state.modelTemplates){
    const spec=BUILTIN_MODEL_CATALOGUE.models.find(row=>row.id===template.id);
    template.id=spec.existingId || template.id;
  }
  state.modelData.builtinIds.modelTemplates=state.modelTemplates.map(row=>row.id);
  return state;
}

// Typed relational columns enforce ownership; the JSON extension preserves the existing page contract.
export function projectModelState(state){
  state.modelData ||= {};state.modelData.mappingIds ||= {};
  for(const p of state.providers)for(const a of p.catalogConnections || [])if(!state.modelData.mappingIds[a.id])state.modelData.mappingIds[a.id]=state.modelSupplies.find(s=>s.channelId===a.id && (s.providerId || state.endpoints.find(e=>e.id===s.endpointId)?.providerId)===p.id)?.id || a.id;
  const technicalId=s=>state.modelData.mappingIds[s.channelId] || s.id;
  const offerServiceKeys=new Map();
  const tables={},add=(table,row)=>{(tables[table]||=new Map()).set((pk[table]||['id']).map(k=>row[k]).join('\0'),row);};
  const master=id=>{const row=libraryRecord(state,id);if(!row)throw Error('模型资料引用不存在');return row;};
  for(const m of modelLibrary(state))add('materials',{id:m.id,canonical_slug:m.modelId,name:m.name,model_type:m.type,maker:m.maker || '',description:m.description || '',usage_unit:m.usageUnit || null,metadata_json:j(storedModel({profile:m.profile || {},capabilities:m.capabilities || {}})),origin:'seed',revision:m.revision || 1,created_at:at(m.createdAt),updated_at:at(m.updatedAt),deleted_at:null,record_collection:state.modelTemplates.some(x=>x.id===m.id)?'modelTemplates':'models',record_json:j(storedModel(m))});
  for(const m of state.modelTemplates)add('model_template_records',{id:m.id,material_id:master(m.id).id,record_json:j(storedModel(m)),removed_at:null});
  for(const p of state.providers){
    const profile={};for(const k of ['sourceType','integrationType','contact','contactInfo','description','contractEnd','logo','introduction','website','documentation'])if(p[k]!==undefined)profile[k]=p[k];
    add('suppliers',{id:p.id,code:p.code || p.id,name:p.name,profile_json:j(profile),builtin:Number(p.id==='provider-moma'),enabled:bool(p.status),origin:'seed',revision:p.revision || 1,created_at:at(p.createdAt),updated_at:at(p.updatedAt),deleted_at:p.deletedAt?at(p.deletedAt):null,record_json:j(p)});
    for(const k of [...(p.apiKeys || []),...state.endpoints.filter(e=>e.providerId===p.id).flatMap(e=>e.apiKeys || [])]){
      if(!k.fingerprint || !/^[a-f0-9]{64}$/i.test(k.fingerprint))continue;
      add('credentials',{id:k.id,supplier_id:p.id,name:k.name || k.id,masked_value:k.maskedKey || k.mask || '****',fingerprint:k.fingerprint,version:Number.isSafeInteger(k.version)?k.version:1,enabled:Number(!['disabled','已停用'].includes(k.status)),created_at:at(k.createdAt),revoked_at:k.revokedAt?at(k.revokedAt):null});
    }
    for(const entry of p.catalogModels || []){
      const material=entry.libraryId?master(entry.libraryId):null;
      if(!material)continue;
      add('supplier_models',{id:`supplier-model:${p.id}:${material.id}`,supplier_id:p.id,material_id:material.id,declaration_json:j(entry),revision:entry.revision || 1,created_at:at(entry.createdAt || p.createdAt),updated_at:at(entry.updatedAt || p.updatedAt),removed_at:entry.deletedAt?at(entry.deletedAt):null});
    }
    for(const group of providerKeyGroups(p)){
      const groupId=p.id+':'+group.id;
      add('key_groups',{id:groupId,supplier_id:p.id,name:group.name || group.id,revision:p.keyGroupRevisions?.[group.id] || 1,deleted_at:group.deletedAt?at(group.deletedAt):null});
      for(const [position,keyId]of (group.keyIds || []).entries())if(tables.credentials?.has(keyId))add('key_group_members',{group_id:groupId,supplier_id:p.id,credential_id:keyId,position,enabled:1});
    }
  }
  for(const e of state.endpoints){
    const mode=e.authMode==='none'?'none':e.authMode==='group'?'group':e.authMode==='pool' || e.apiKeys?.length?'pool':e.authMode==='inherit'?'default':'direct';
    const credentialId=e.authMode==='inherit'?state.providers.find(p=>p.id===e.providerId)?.defaultApiKeyId:e.apiKeyId || e.apiKeys?.[0]?.id;
    const group=e.providerId+':'+(e.keyGroupId || e.apiKeyGroupId || 'default');
    const validMode=mode==='group'&&tables.key_groups?.has(group)?'group':mode==='pool'?'pool':tables.credentials?.has(credentialId)?mode:'none';
    add('channels',{id:e.id,supplier_id:e.providerId,code:e.channelCode || e.endpointId || e.id,name:e.name,protocol:e.protocol || 'OpenAI',base_url:e.baseUrl || '',connection_json:j({interfaceType:e.interfaceType,timeoutSeconds:e.timeoutSeconds,adapterOptions:e.adapterOptions,taskUrls:e.taskUrls}),credential_mode:validMode,credential_id:['direct','default'].includes(validMode)?credentialId:null,key_group_id:validMode==='group'?group:null,enabled:bool(e.status),config_epoch:(e.configurationRevision || 0)+1,revision:e.revision || 1,created_at:at(e.createdAt),updated_at:at(e.updatedAt),deleted_at:e.deletedAt?at(e.deletedAt):null,record_json:j(e)});
    for(const [position,k]of (e.authMode==='pool'?(e.keyPool || []).map(row=>({...row,id:row.keyId})):(e.apiKeys || [])).entries())if(tables.credentials?.has(k.id))add('channel_keys',{channel_id:e.id,supplier_id:e.providerId,credential_id:k.id,priority:k.priority || 1,position,enabled:Number(k.enabled!==false && !k.revokedAt && k.status!=='disabled')});
  }
  for(const m of state.models){
    const material=master(m.id);
    add('services',{id:m.id,material_id:material.id,code:m.modelId,mode:['standard','provider'].includes(m.serviceMode)?m.serviceMode:null,mode_epoch:(m.serviceModeRevision || 1),listing_status:m.listingStatus==='已上架'?'listed':m.listingStatus==='已下架'?'withdrawn':'unlisted',calls_enabled:Number(m.listingStatus==='已上架' && m.callsEnabled===true),market_visible:Number(m.marketVisible!==false),stop_reason:m.lifecycleStopReason || null,scope_json:j({openScope:m.openScope,tenantIds:m.tenantIds || []}),revision:m.revision || 1,created_at:at(m.createdAt),updated_at:at(m.updatedAt),deleted_at:m.deletedAt?at(m.deletedAt):null,record_json:j(storedModel(m,true))});
    const offered=m.serviceMode==='standard'?[{providerId:null,callId:m.modelId}]:m.serviceMode==='provider'?(m.serviceProviders || []).filter(p=>p.status!=='已移除'):[];
    for(const o of offered) {
      const key=offerKey(o),recordId=offerId(m,key);
      offerServiceKeys.set(recordId,key?`provider:${m.id}:${key}`:`standard:${m.id}`);
      add('offers',{record_id:recordId,service_id:m.id,material_id:material.id,mode_epoch:m.serviceModeRevision || 1,mode:m.serviceMode,supplier_id:o.providerId,id:o.callId,channel_model_id:o.channelId ? state.modelData.mappingIds[o.channelId] : null,listing_stage:offerStage(m,o),gray_tenants_json:j(offerGrayTenants(m,o)),market_visible:Number(o.marketVisible!==false),calls_enabled:Number(o.callsEnabled!==false),revision:m.revision || 1,created_at:at(o.createdAt || m.createdAt),retired_at:null});
    }
  }
  for(const p of state.providers)for(const a of p.catalogConnections || []){
    const entry=p.catalogModels?.find(m=>m.modelId===a.modelId);if(!entry?.libraryId || !state.endpoints.some(e=>e.id===a.endpointId))continue;
    const material=master(entry.libraryId),rel=`supplier-model:${p.id}:${material.id}`;
    if(!tables.supplier_models?.has(rel))add('supplier_models',{id:rel,supplier_id:p.id,material_id:material.id,declaration_json:j(entry),revision:1,created_at:at(a.createdAt),updated_at:at(a.updatedAt),removed_at:null});
    add('channel_models',{id:state.modelData.mappingIds[a.id],channel_id:a.endpointId,supplier_id:p.id,supplier_model_id:rel,material_id:material.id,upstream_model_id:a.upstreamModelId || '',mapping_json:j({sourceAssociationId:a.id,sourceName:a.sourceName,capabilities:a.capabilities || {}}),enabled:Number(a.enabled===true),config_epoch:(a.revision || 0)+1,revision:a.revision || 1,created_at:at(a.createdAt),updated_at:at(a.updatedAt),removed_at:a.deletedAt?at(a.deletedAt):null,record_json:'{}'});
  }
  for(const s of state.modelSupplies){
    const m=state.models.find(m=>m.id===s.modelId),technical=technicalId(s);let row=tables.channel_models?.get(technical);
    if(!m)throw Error('供给的模型服务不存在');
    if(!row){const ep=state.endpoints.find(e=>e.id===s.endpointId),p=state.providers.find(p=>p.id===(s.providerId || ep?.providerId));if(!ep || !p)throw Error('历史供给的明确引用缺失');const material=master(m.id),rel=`supplier-model:${p.id}:${material.id}`;if(!tables.supplier_models?.has(rel))add('supplier_models',{id:rel,supplier_id:p.id,material_id:material.id,declaration_json:j({source:'historical-explicit-supply',supplyId:s.id}),revision:1,created_at:at(s.createdAt),updated_at:at(s.updatedAt),removed_at:null});row={id:technical,channel_id:ep.id,supplier_id:p.id,supplier_model_id:rel,material_id:material.id,upstream_model_id:s.upstreamModelId || '',mapping_json:j({source:'historical-explicit-supply',supplyId:s.id}),enabled:0,config_epoch:1,revision:1,created_at:at(s.createdAt),updated_at:at(s.updatedAt),removed_at:null,record_json:'{}'};add('channel_models',row);}
    add('service_supply_records',{id:s.id,channel_model_id:technical,service_id:m.id,record_json:j(s),removed_at:null});
    for(const o of tables.offers?.values() || [])if(o.service_id===m.id && (!o.supplier_id || o.supplier_id===row.supplier_id) && (!o.channel_model_id || o.channel_model_id===technical) && s.status!=='已移除')add('offer_channels',{offer_id:o.record_id,channel_model_id:technical,material_id:row.material_id,supplier_id:row.supplier_id,created_at:at(s.createdAt),removed_at:null});
  }
  for(const d of state.tariffDictionary){
    const row={id:d.id,name:d.name,name_en:d.englishName || '',builtin:Number(d.builtin===true),enabled:Number(d.kind==='scenario' || d.status==='已启用'),revision:d.revision || 1,deleted_at:null,record_json:j(d)};
    if(d.kind==='unit')add('billing_units',{...row,dimension:d.name});
    if(d.kind==='currency')add('currencies',{...row,code:d.code});
    if(d.kind==='scenario')add('billing_items',{...row,description:d.description || ''});
  }
  for(const collection of ['modelSalePrices','supplyPrices'])for(const v of state[collection])add('model_price_records',{id:v.id,record_collection:collection,record_json:j(v)});
  const actor='admin-001';
  const price=(v,kind,owner,items,collection)=>{
    add('price_versions',{id:v.id,kind,...(kind==='sale'?{offer_id:owner,channel_model_id:null}:{channel_model_id:owner,offer_id:null}),version:v.version,source_json:j({source:collection}),created_at:at(v.effectiveAt || v.publishedAt || v.createdAt),actor_id:actor,record_collection:collection,record_json:j(v)});
    for(const [position,item]of items.entries()){
      const billing=state.tariffDictionary.find(d=>d.kind==='scenario' && d.name===item.name),unit=state.tariffDictionary.find(d=>d.kind==='unit' && d.name===item.unit),currency=state.tariffDictionary.find(d=>d.kind==='currency' && d.code===(item.currency || 'CNY'));
      if(!billing || !unit || !currency){if(state.modelData.importedPriceIds?.includes(v.id))continue;throw Error('价格引用了不存在的计费项、单位或币种');}
      const amount=item.amount ?? item.listPrice;
      if(!Number.isSafeInteger(amount) || amount<0){if(state.modelData.importedPriceIds?.includes(v.id))continue;throw Error('已提交价格须为非负整数百万分位');}
      add('price_items',{id:`${v.id}:item:${position}`,price_version_id:v.id,billing_item_id:billing.id,unit_id:unit.id,currency_id:currency.id,amount_micros:amount,unit_quantity:1,condition_json:j({text:item.condition || ''}),condition_hash:j([item.condition || '',position]),labels_json:j({name:item.name,unit:item.unit,currency:item.currency || 'CNY',condition:item.condition || ''}),position});
    }
  };
  for(const p of state.providers)for(const a of p.catalogConnections || []){
    // Baseline 0 stays in the supplier snapshot; relational versions represent explicit publications.
    const id=state.modelData.mappingIds[a.id];if(!tables.channel_models?.has(id))continue;const versions=(a.procurementVersions || []).filter(v=>v.version>0);
    for(const v of versions)if(v.status==='已发布')price(v,'purchase',id,v.pricing?.scenarios || [],'channelProcurement');
    const latest=versions.filter(v=>v.status==='已发布' && at(v.effectiveAt)<=Date.now()).sort((a,b)=>b.version-a.version)[0];
    tables.channel_models.get(id).active_purchase_price_id=latest && (!latest.expiresAt || at(latest.expiresAt)>Date.now())?latest.id:null;
  }
  for(const v of state.modelSalePrices){if(!v.items?.length || v.supplyId)continue;const m=state.models.find(m=>m.id===v.modelId);if(!m)continue;const owner=offerId(m,offerKey(v),v.serviceModeRevision || 1);if(!tables.offers?.has(owner)){const historical=owner;if(!tables.offers?.has(historical))add('offers',{record_id:historical,service_id:m.id,material_id:master(m.id).id,mode_epoch:v.serviceModeRevision || 1,mode:v.providerId?'provider':'standard',supplier_id:v.providerId || null,id:'',channel_model_id:null,listing_stage:'withdrawn',gray_tenants_json:'[]',market_visible:0,calls_enabled:0,revision:1,created_at:at(v.createdAt),retired_at:1});price(v,'sale',historical,v.items || [],'modelSalePrices');}else price(v,'sale',owner,v.items || [],'modelSalePrices');}
  for(const v of state.supplyPrices){if(!v.items?.length)continue;const supply=state.modelSupplies.find(s=>s.id===v.supplyId);if(supply)price(v,'purchase',technicalId(supply),v.items || [],'supplyPrices');}
  for(const o of tables.offers?.values() || []){const prices=[...(tables.price_versions?.values() || [])].filter(v=>v.offer_id===o.record_id).sort((a,b)=>b.version-a.version);o.active_sale_price_id=prices[0]?.id || null;o.active_route_id=null;o.active_publication_id=null;}
  for(const r of state.serviceRoutes){
    const o=[...(tables.offers?.values() || [])].find(o=>!o.retired_at && offerServiceKeys.get(o.record_id)===r.serviceId);if(!o)continue;
    add('service_route_records',{id:r.id,offer_id:o.record_id,record_json:j(r),removed_at:null});
    const active=r.versions.find(v=>v.version===r.activeVersion);if(active)o.active_route_id=active.id || `${r.id}:v${active.version}`;
    for(const v of r.versions || []){
      add('route_versions',{id:v.id || `${r.id}:v${v.version}`,offer_id:o.record_id,version:v.version,strategy:v.config.strategy,config_json:j(v.config),created_at:at(v.publishedAt || r.createdAt),actor_id:actor,record_json:j(v)});
      for(const [position,row]of (v.config.channels || []).filter(x=>x.enabled).entries())if(tables.offer_channels?.has([o.record_id,technicalId(state.modelSupplies.find(s=>s.id===row.supplyId) || {id:row.supplyId})].join('\0')))add('route_members',{route_version_id:v.id || `${r.id}:v${v.version}`,offer_id:o.record_id,channel_model_id:technicalId(state.modelSupplies.find(s=>s.id===row.supplyId) || {id:row.supplyId}),weight:row.weight || 0,position});
    }
  }
  for(const v of state.modelVersions)add('model_versions',{id:v.id,service_id:v.modelId,record_json:j(v),removed_at:null});
  for(const v of state.validations)add('model_validations',{id:v.id,version_id:tables.model_versions?.has(v.modelVersionId)?v.modelVersionId:null,record_json:j(v),removed_at:null});
  for(const task of state.modelOnboardings)add('onboarding_tasks',{id:task.id,service_id:state.models.some(m=>m.id===task.modelId)?task.modelId:null,channel_model_id:null,goal:task.intent==='reserve'?'reserve':task.intent==='attach'?'attach':'first_publish',status:task.status==='已完成'?'completed':task.status==='已放弃'?'cancelled':'active',revision:task.draftRevision || 1,created_at:at(task.createdAt),updated_at:at(task.updatedAt),record_json:j(task)});
  for(const o of tables.offers?.values() || []){
    const m=state.models.find(m=>m.id===o.service_id),receipt=m.platformPublications?.find(p=>p.serviceId===offerServiceKeys.get(o.record_id));
    if(receipt && o.active_sale_price_id && o.active_route_id){
      const id=`publication:${o.record_id}:${receipt.publishedVersion}:${o.active_sale_price_id}:${o.active_route_id}:${m.materialPublication?.version || 0}:${m.commercialPublications?.scope?.version || 0}`;
      add('publications',{id,offer_id:o.record_id,mode_epoch:o.mode_epoch,sale_price_id:o.active_sale_price_id,route_version_id:o.active_route_id,material_revision:master(m.id).revision || 1,material_snapshot_json:j(master(m.id)),dependencies_json:j({receipt,scope:JSON.parse(tables.services.get(m.id).scope_json),id:o.id}),evidence_job_id:null,reason:'model-operations',created_at:at(receipt.publishedAt || m.updatedAt),actor_id:actor});o.active_publication_id=id;
    }
  }
  return tables;
}

function upsert(db,table,rows,insertOnly=false){
  if(!rows.length)return null;
  const columns=[...new Set(rows.flatMap(Object.keys))],keys=pk[table] || ['id'];
  const update=columns.filter(c=>!keys.includes(c)).map(c=>`${c}=${table==='offers' && c!=='retired_at'?`CASE WHEN excluded.retired_at IS NOT NULL THEN offers.${c} ELSE excluded.${c} END`:`excluded.${c}`}`).join(',');
  return db.prepare(`INSERT INTO ${table}(${columns.join(',')}) SELECT ${columns.map(c=>`json_extract(value,'$.${c}')`).join(',')} FROM json_each(?) WHERE true${insertOnly?'':` ON CONFLICT(${keys.join(',')}) DO UPDATE SET ${update}`}`).bind(j(rows));
}

export function modelChanges(db,before,after,{insertOnly=false}={}){
  const a=before?projectModelState(before):{},b=projectModelState(after),statements=[];
  for(const table of ['offers'])for(const [key,row]of a[table] || [])if(!b[table]?.has(key))statements.push(db.prepare('UPDATE offers SET retired_at=? WHERE record_id=?').bind(at(after.updatedAt)||Date.now(),row.record_id));
  for(const [table,rows]of Object.entries(b)){
    const changed=[...rows].filter(([key,row])=>j(a[table]?.get(key))!==j(row)).map(([,row])=>row);
    const statement=upsert(db,table,changed,insertOnly);if(statement)statements.push(statement);
  }
  for(const [table,rows]of Object.entries(a))for(const [key,row]of rows)if(!b[table]?.has(key) && !['offers','price_versions','price_items','route_versions','route_members'].includes(table)){
    if(['materials','services','suppliers','channels'].includes(table))statements.push(db.prepare(`UPDATE ${table} SET deleted_at=? WHERE id=?`).bind(at(after.updatedAt)||Date.now(),row.id));
    else if(['supplier_models','model_template_records','channel_models','service_supply_records','service_route_records','model_versions','model_validations'].includes(table))statements.push(db.prepare(`UPDATE ${table} SET removed_at=? WHERE id=?`).bind(at(after.updatedAt)||Date.now(),row.id));
    else if(['billing_items','billing_units','currencies'].includes(table))statements.push(db.prepare(`UPDATE ${table} SET deleted_at=? WHERE id=?`).bind(at(after.updatedAt)||Date.now(),row.id));
    else if(table==='offer_channels')statements.push(db.prepare('UPDATE offer_channels SET removed_at=? WHERE offer_id=? AND channel_model_id=?').bind(at(after.updatedAt)||Date.now(),row.offer_id,row.channel_model_id));
    else if(pk[table])statements.push(db.prepare(`DELETE FROM ${table} WHERE ${pk[table].map(k=>k+'=?').join(' AND ')}`).bind(...pk[table].map(k=>row[k])));
  }
  const meta={modelData:after.modelData,initialData:after.initialData,updatedAt:after.updatedAt};
  if(insertOnly && before){
    const existingTenantIds=new Set(before.tenants.map(row=>row.id));
    for(const tenant of after.tenants.filter(row=>!existingTenantIds.has(row.id))){
      statements.push(db.prepare("UPDATE model_workspace SET reference_json=json_insert(reference_json,'$.tenants[#]',json(?)) WHERE id=1").bind(j(tenant)));
    }
  }
  statements.push(db.prepare('UPDATE model_workspace SET meta_json=?,revision=? WHERE id=1').bind(j(meta),after.revision || 0));
  return statements;
}

export function simulatorRows(snapshot){
  const rows=[];for(const [kind,value]of Object.entries(snapshot)){
    if(['version','scenario','clock','operations'].includes(kind))continue;
    if(Array.isArray(value))for(const [i,item]of value.entries())rows.push({kind,id:String(item.id || i),payload_json:j(item)});
    else if(value && typeof value==='object')for(const [id,item]of Object.entries(value))rows.push({kind,id,payload_json:j(item)});
  }
  rows.push({kind:'meta',id:'state',payload_json:j({version:snapshot.version,scenario:snapshot.scenario,clock:snapshot.clock})});return rows;
}
export function simulatorChanges(db,before,after){
  const a=new Map(simulatorRows(before).map(r=>[r.kind+'\0'+r.id,r])),b=simulatorRows(after);
  const changed=b.filter(r=>a.get(r.kind+'\0'+r.id)?.payload_json!==r.payload_json);
  return changed.length?[upsert(db,'simulation_records',changed)]:[];
}

export async function initializeModelWorkspace(db,{demo=false}={}){
  if(await db.prepare('SELECT id FROM model_workspace WHERE id=1').first())return {initialized:false};
  const state=demo?initialModelWorkspace():initialReferenceWorkspace();
  const reference={...state};
  for(const key of [...Object.keys(entityTables),'admins','modelSalePrices','supplyPrices','tariffDictionary','cloudMockState','modelData'])delete reference[key];
  const meta={modelData:state.modelData,initialData:state.initialData,updatedAt:state.updatedAt};
  const statements=[db.prepare('PRAGMA defer_foreign_keys=ON'),
    db.prepare('INSERT INTO model_workspace(id,meta_json,reference_json) VALUES(1,?,?)').bind(j(meta),j(reference))];
  if(!demo){
    const occupied=await db.prepare('SELECT EXISTS(SELECT 1 FROM seed_runs) OR EXISTS(SELECT 1 FROM operations) AS occupied').first('occupied');
    if(occupied)throw Error('数据库已有模型运营记录，拒绝重新初始化');
    for(const account of state.admins)statements.push(db.prepare('INSERT INTO admin_accounts(id,name,role,enabled,revision) VALUES(?,?,?,?,?)').bind(account.id,account.name,account.role,bool(account.status),1));
  }
  statements.push(...modelChanges(db,null,state,{insertOnly:!demo}),...simulatorChanges(db,{version:1,scenario:'success',clock:0},state.cloudMockState));
  await db.batch(statements);
  return {initialized:true};
}

const arraySql=(query)=>`json(COALESCE((SELECT json_group_array(json(record_json)) FROM (${query})), '[]'))`;
async function workspacePayload(db,actor,command=false,simulation=true){
  const fields=[];
  for(const [collection,table]of Object.entries(entityTables)){
    const where=['services','suppliers','channels'].includes(table)?'deleted_at IS NULL':['model_template_records','service_supply_records','model_versions','model_validations','service_route_records'].includes(table)?'removed_at IS NULL':'1';
    fields.push(`'${collection}',${arraySql(`SELECT record_json FROM ${table} WHERE ${where} AND record_json!='{}'`)}`);
  }
  for(const collection of ['modelSalePrices','supplyPrices'])fields.push(`'${collection}',${arraySql(`SELECT record_json FROM model_price_records WHERE record_collection='${collection}'`)}`);
  fields.push(`'tariffDictionary',${arraySql("SELECT record_json FROM billing_items WHERE deleted_at IS NULL UNION ALL SELECT record_json FROM billing_units WHERE deleted_at IS NULL UNION ALL SELECT record_json FROM currencies WHERE deleted_at IS NULL")}`);
  fields.push(`'audits',${arraySql(`SELECT json_remove(record_json,'$.before','$.after') AS record_json FROM audit_events WHERE record_json!='{}' ORDER BY created_at DESC LIMIT ${command?1:200}`)}`);
  fields.push(`'admins',${arraySql("SELECT json_object('id',id,'name',name,'role',role,'status',CASE WHEN enabled THEN '已启用' ELSE '已停用' END) AS record_json FROM admin_accounts")}`);
  if(simulation){
    const snapshot=["'operations',json('{}')"];
    for(const kind of ['credentials','channels','batches','services','identities','clientKeys','usage','changes','audits'])snapshot.push(`'${kind}',${arraySql(`SELECT payload_json AS record_json FROM simulation_records WHERE kind='${kind}'`)}`);
    snapshot.push("'rateEvents',json(COALESCE((SELECT json_group_object(id,json(payload_json)) FROM simulation_records WHERE kind='rateEvents'),'{}'))");
    fields.push(`'cloudMockState',json_patch(COALESCE((SELECT payload_json FROM simulation_records WHERE kind='meta' AND id='state'),'{}'),json_object(${snapshot.join(',')}))`);
  }
  fields.push("'cloudOperations',json('true'),'revision',w.revision,'commitSeq',(SELECT commit_seq FROM db_state WHERE id=1),'adminSession',json_object('accountId',?),'currentRole',?");
  const reference=`json_object('tenants',COALESCE(json_extract(w.reference_json,'$.tenants'),json('[]')),
    'settings',json_extract(w.reference_json,'$.settings'),'orders',json('[]'),'products',json('[]'),'requests',json('[]'),
    'alerts',json('[]'),'deployments',json('[]'),'apiKeys',json('[]'),'users',json('[]'),'memberships',json('[]'),'projects',json('[]'),
    'grants',${command?"COALESCE(json_extract(w.reference_json,'$.grants'),json('[]'))":"json('[]')"})`;
  const payload=await db.prepare(`SELECT json_patch(json_patch(${reference},w.meta_json),json_object(${fields.join(',')})) AS payload FROM model_workspace w WHERE id=1`).bind(actor.id,actor.role).first('payload');
  if(!payload)throw Error('模型运营工作区尚未初始化');return payload;
}
export const modelWorkspacePayload=(db,actor)=>workspacePayload(db,actor);
export async function loadModelWorkspace(db,actor,{command=false,simulation=true}={}){return domainModelWorkspace(JSON.parse(await workspacePayload(db,actor,command,simulation)));}

// Simulator calls need live resource availability, not the full model editing workspace.
export async function loadSimulationWorkspace(db){
  const rows=await db.batch([
    db.prepare('SELECT revision FROM model_workspace WHERE id=1'),db.prepare('SELECT commit_seq FROM db_state WHERE id=1'),
    db.prepare("SELECT json_object('id',id,'status',json_extract(record_json,'$.status'),'apiKeys',json_extract(record_json,'$.apiKeys'),'catalogModels',json_extract(record_json,'$.catalogModels'),'catalogConnections',json_extract(record_json,'$.catalogConnections')) AS record_json FROM suppliers WHERE deleted_at IS NULL"),
    db.prepare("SELECT json_object('id',id,'providerId',supplier_id,'status',json_extract(record_json,'$.status'),'deletedAt',json_extract(record_json,'$.deletedAt'),'frozen',json_extract(record_json,'$.frozen'),'apiKeys',json_extract(record_json,'$.apiKeys')) AS record_json FROM channels WHERE deleted_at IS NULL"),
    db.prepare("SELECT json_object('id',id,'type',json_extract(record_json,'$.type'),'platformPublications',json_extract(record_json,'$.platformPublications')) AS record_json FROM services WHERE deleted_at IS NULL"),
    db.prepare("SELECT kind,id,payload_json FROM simulation_records WHERE kind!='operations'")]);
  const snapshot=createMockEngine().snapshot();
  for(const kind of new Set(rows[5].results.map(r=>r.kind))){const records=rows[5].results.filter(r=>r.kind===kind);if(kind==='meta')Object.assign(snapshot,JSON.parse(records[0].payload_json));else snapshot[kind]=kind==='rateEvents'?Object.fromEntries(records.map(r=>[r.id,JSON.parse(r.payload_json)])):records.map(r=>JSON.parse(r.payload_json));}
  return {cloudOperations:true,revision:rows[0].results[0].revision,commitSeq:rows[1].results[0].commit_seq,providers:rows[2].results.map(r=>JSON.parse(r.record_json)),endpoints:rows[3].results.map(r=>JSON.parse(r.record_json)),models:rows[4].results.map(r=>JSON.parse(r.record_json)),modelTemplates:[],cloudMockState:snapshot};
}
