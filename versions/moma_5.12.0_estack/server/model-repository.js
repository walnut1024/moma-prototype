import { seedBuiltinModelCatalogue } from '../src/mock/builtin-model-catalogue.js';
import { referenceWorkspace } from '../src/mock/reference-workspace.js';
import {initialWorkspace,applyModelDataset,systemModelData,systemModelOrigin, MODEL_DATASET } from '../src/mock/model-data.js';
import { initialApplicationData } from '../src/mock/application-data.js';
import { libraryRecord, modelLibrary } from '../src/admin-v2/model-library.js';
import { providerCatalogueIds } from '../src/admin-v2/moma-provider.js';
import {providerKeyGroups} from '../src/admin-v2/provider-key-groups.js';
import { createMockEngine } from '../src/admin-v2/mock-onboarding-core.js';

import { offerKey, offerStage, offerGrayTenants } from '../src/service-access.mjs';
import { isResourceId, resourceId } from '../src/resource-id.mjs';
import { modelServiceKey } from '../src/model-identities.mjs';
import {storedModel,domainModelWorkspace} from '../src/mock/model-fields.js';
const j=JSON.stringify;
const at=value=>Number.isFinite(Date.parse(value))?Date.parse(value):0;
const bool=value=>Number(value===true || ['已启用','有效','已生效'].includes(value));
const offerId=modelServiceKey;
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

function initialReferenceWorkspace(){
  return {...referenceWorkspace(),cloudOperations:true,cloudMockState:createMockEngine().snapshot()};
}

// Typed relational columns enforce ownership; the JSON extension preserves the existing page contract.
export function projectModelState(state, previousTables){
  state.modelData ||= {};
  state.modelData.mappingIds ||= {};
  const ids = state.modelData.resourceIds ||= {};
  const identity = (table, legacy, type, recordId) => {
    const registered = ids[legacy];
    if (registered && type === 'model_service' && !isResourceId(registered, type)) throw Error('模型服务 ID 不符合规范，请先执行编号整改');
    if (registered || !previousTables || previousTables[table]?.has(legacy)) return registered || legacy;
    return ids[legacy] = recordId || resourceId(type);
  };
  const offerRecordId = (model, key, epoch) => identity('offers', offerId(model, key, epoch), 'model_service');
  const supplierModels = new Map();
  const supplierModelId = (provider, material, entry) => {
    const key = `supplier-model:${provider.id}:${material.id}`;
    if (!supplierModels.has(key)) {
      const id = ids[key] || (isResourceId(entry?.id, 'provider-model') && !previousTables?.supplier_models?.has(key)
        ? entry.id : identity('supplier_models', key, 'provider-model'));
      if (previousTables) ids[key] = id;
      supplierModels.set(key, id);
    }
    return supplierModels.get(key);
  };
  const groupIds = new Map();
  for(const p of state.providers)for(const a of p.catalogConnections || [])if(!state.modelData.mappingIds[a.id])state.modelData.mappingIds[a.id]=isResourceId(a.id, 'channel') ? a.id : state.modelSupplies.find(s=>s.channelId===a.id && (s.providerId || state.endpoints.find(e=>e.id===s.endpointId)?.providerId)===p.id)?.id || a.id;
  const technicalId=s=>state.modelData.mappingIds[s.channelId] || identity('channel_models', s.id, 'channel');
  const offerServiceKeys=new Map();
  const tables={},add=(table,row)=>{(tables[table]||=new Map()).set((pk[table]||['id']).map(k=>row[k]).join('\0'),row);};
  const master=id=>{const row=libraryRecord(state,id);if(!row)throw Error('模型资料引用不存在');return row;};
  for(const m of modelLibrary(state))add('materials',{id:m.id,canonical_slug:m.modelId,name:m.name,model_type:m.type,maker:m.maker || '',description:m.description || '',usage_unit:m.usageUnit || null,metadata_json:j(storedModel({profile:m.profile || {},capabilities:m.capabilities || {}})),origin:'seed',revision:m.revision || 1,created_at:at(m.createdAt),updated_at:at(m.updatedAt),deleted_at:null,record_collection:state.modelTemplates.some(x=>x.id===m.id)?'modelTemplates':'models',record_json:j(storedModel(m))});
  for(const m of state.modelTemplates)add('model_template_records',{id:m.id,material_id:master(m.id).id,record_json:j(storedModel(m)),removed_at:null});
  for(const p of state.providers){
    const profile={};for(const k of ['sourceType','integrationType','contact','contactInfo','description','contractEnd','logo','introduction','website','documentation'])if(p[k]!==undefined)profile[k]=p[k];
    add('suppliers',{id:p.id,code:p.code || p.id,name:p.name,profile_json:j(profile),builtin:Number(Boolean(p.builtinCatalogue) || p.id==='provider-moma'),enabled:bool(p.status),origin:'seed',revision:p.revision || 1,created_at:at(p.createdAt),updated_at:at(p.updatedAt),deleted_at:p.deletedAt?at(p.deletedAt):null,record_json:j(p)});
    for(const k of [...(p.apiKeys || []),...state.endpoints.filter(e=>e.providerId===p.id).flatMap(e=>e.apiKeys || [])]){
      if(!k.fingerprint || !/^[a-f0-9]{64}$/i.test(k.fingerprint))continue;
      add('credentials',{id:k.id,supplier_id:p.id,name:k.name || k.id,masked_value:k.maskedKey || k.mask || '****',fingerprint:k.fingerprint,version:Number.isSafeInteger(k.version)?k.version:1,enabled:Number(!['disabled','已停用'].includes(k.status)),created_at:at(k.createdAt),revoked_at:k.revokedAt?at(k.revokedAt):null});
    }
    const registeredCodes = new Set(providerCatalogueIds(p));
    for(const entry of p.catalogModels || []){
      const material=entry.libraryId?master(entry.libraryId):null;
      if(!material)continue;
      const id = supplierModelId(p, material, entry), removed = entry.deletedAt || !registeredCodes.has(entry.modelId);
      if (removed && tables.supplier_models?.get(id)?.removed_at === null) continue;
      add('supplier_models',{id,supplier_id:p.id,material_id:material.id,declaration_json:j(entry),revision:entry.revision || 1,created_at:at(entry.createdAt || p.createdAt),updated_at:at(entry.updatedAt || p.updatedAt),removed_at:removed?(at(entry.deletedAt || p.updatedAt || state.updatedAt) || 1):null});
    }
    for(const group of providerKeyGroups(p)){
      const legacyGroupId=p.id+':'+group.id;
      const groupId=identity('key_groups', legacyGroupId, 'key-group', isResourceId(group.id, 'key-group') ? group.id : undefined);
      groupIds.set(legacyGroupId, groupId);
      add('key_groups',{id:groupId,supplier_id:p.id,name:group.name || group.id,revision:p.keyGroupRevisions?.[group.id] || 1,deleted_at:group.deletedAt?at(group.deletedAt):null});
      for(const [position,keyId]of (group.keyIds || []).entries())if(tables.credentials?.has(keyId))add('key_group_members',{group_id:groupId,supplier_id:p.id,credential_id:keyId,position,enabled:1});
    }
  }
  for(const e of state.endpoints){
    const mode=e.authMode==='none'?'none':e.authMode==='group'?'group':e.authMode==='pool' || e.apiKeys?.length?'pool':e.authMode==='inherit'?'default':'direct';
    const credentialId=e.authMode==='inherit'?state.providers.find(p=>p.id===e.providerId)?.defaultApiKeyId:e.apiKeyId || e.apiKeys?.[0]?.id;
    const group=groupIds.get(e.providerId+':'+(e.keyGroupId || e.apiKeyGroupId || 'default'));
    const validMode=mode==='group'&&tables.key_groups?.has(group)?'group':mode==='pool'?'pool':tables.credentials?.has(credentialId)?mode:'none';
    add('channels',{id:e.id,supplier_id:e.providerId,code:e.channelCode || e.endpointId || e.id,name:e.name,protocol:e.protocol || 'OpenAI',base_url:e.baseUrl || '',connection_json:j({interfaceType:e.interfaceType,timeoutSeconds:e.timeoutSeconds,adapterOptions:e.adapterOptions,taskUrls:e.taskUrls}),credential_mode:validMode,credential_id:['direct','default'].includes(validMode)?credentialId:null,key_group_id:validMode==='group'?group:null,enabled:bool(e.status),config_epoch:(e.configurationRevision || 0)+1,revision:e.revision || 1,created_at:at(e.createdAt),updated_at:at(e.updatedAt),deleted_at:e.deletedAt?at(e.deletedAt):null,record_json:j(e)});
    for(const [position,k]of (e.authMode==='pool'?(e.keyPool || []).map(row=>({...row,id:row.keyId})):(e.apiKeys || [])).entries())if(tables.credentials?.has(k.id))add('channel_keys',{channel_id:e.id,supplier_id:e.providerId,credential_id:k.id,priority:k.priority || 1,position,enabled:Number(k.enabled!==false && !k.revokedAt && k.status!=='disabled')});
  }
  for(const m of state.models){
    const material=master(m.id);
    add('services',{id:m.id,material_id:material.id,code:m.modelId,mode:['standard','provider'].includes(m.serviceMode)?m.serviceMode:null,mode_epoch:(m.serviceModeRevision || 1),listing_status:m.listingStatus==='已上架'?'listed':m.listingStatus==='已下架'?'withdrawn':'unlisted',calls_enabled:Number(m.listingStatus==='已上架' && m.callsEnabled===true),market_visible:Number(m.marketVisible!==false),stop_reason:m.lifecycleStopReason || null,scope_json:j({openScope:m.openScope,tenantIds:m.tenantIds || []}),revision:m.revision || 1,created_at:at(m.createdAt),updated_at:at(m.updatedAt),deleted_at:m.deletedAt?at(m.deletedAt):null,record_json:j(storedModel(m,true))});
    const offered=m.deletedAt?[]:m.serviceMode==='standard'?[{providerId:null,callId:m.modelId}]:m.serviceMode==='provider'?(m.serviceProviders || []).filter(p=>p.status!=='已移除'):[];
    for(const o of offered) {
      const key=offerKey(o),recordId=offerRecordId(m,key);
      offerServiceKeys.set(recordId,key?`provider:${m.id}:${key}`:`standard:${m.id}`);
      add('offers',{record_id:recordId,service_id:m.id,material_id:material.id,mode_epoch:m.serviceModeRevision || 1,mode:m.serviceMode,supplier_id:o.providerId,id:o.callId,channel_model_id:o.channelId ? state.modelData.mappingIds[o.channelId] : null,listing_stage:offerStage(m,o),gray_tenants_json:j(offerGrayTenants(m,o)),market_visible:Number(o.marketVisible!==false),calls_enabled:Number(o.callsEnabled!==false),revision:m.revision || 1,created_at:at(o.createdAt || m.createdAt),retired_at:null});
    }
  }
  for(const p of state.providers)for(const a of p.catalogConnections || []){
    const entry=p.catalogModels?.find(m=>m.modelId===a.modelId);if(!entry?.libraryId || !state.endpoints.some(e=>e.id===a.endpointId))continue;
    const material=master(entry.libraryId),rel=supplierModelId(p, material, entry);
    if(!tables.supplier_models?.has(rel))add('supplier_models',{id:rel,supplier_id:p.id,material_id:material.id,declaration_json:j(entry),revision:1,created_at:at(a.createdAt),updated_at:at(a.updatedAt),removed_at:null});
    add('channel_models',{id:state.modelData.mappingIds[a.id],channel_id:a.endpointId,supplier_id:p.id,supplier_model_id:rel,material_id:material.id,upstream_model_id:a.upstreamModelId || '',mapping_json:j({sourceAssociationId:a.id,sourceName:a.sourceName,capabilities:a.capabilities || {}}),enabled:Number(a.enabled===true),config_epoch:(a.revision || 0)+1,revision:a.revision || 1,created_at:at(a.createdAt),updated_at:at(a.updatedAt),removed_at:a.deletedAt?at(a.deletedAt):null,record_json:'{}'});
  }
  for(const s of state.modelSupplies){
    const m=state.models.find(m=>m.id===s.modelId),technical=technicalId(s);let row=tables.channel_models?.get(technical);
    if(!m)throw Error('供给的模型服务不存在');
    if(!row){const ep=state.endpoints.find(e=>e.id===s.endpointId),p=state.providers.find(p=>p.id===(s.providerId || ep?.providerId));
      if(!ep || !p){
        // An archived channel leaves its existing supply history in D1 outside the live projection.
        if(s.status==='已移除')continue;
        throw Error('历史供给的明确引用缺失');
      }
      const material=master(m.id),rel=supplierModelId(p, material);if(!tables.supplier_models?.has(rel))add('supplier_models',{id:rel,supplier_id:p.id,material_id:material.id,declaration_json:j({source:'historical-explicit-supply',supplyId:s.id}),revision:1,created_at:at(s.createdAt),updated_at:at(s.updatedAt),removed_at:null});row={id:technical,channel_id:ep.id,supplier_id:p.id,supplier_model_id:rel,material_id:material.id,upstream_model_id:s.upstreamModelId || '',mapping_json:j({source:'historical-explicit-supply',supplyId:s.id}),enabled:0,config_epoch:1,revision:1,created_at:at(s.createdAt),updated_at:at(s.updatedAt),removed_at:null,record_json:'{}'};add('channel_models',row);}
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
  const actor=state.admins.find(account=>account.role==='平台管理员')?.id;
  const price=(v,kind,owner,items,collection)=>{
    add('price_versions',{id:v.id,kind,...(kind==='sale'?{offer_id:owner,channel_model_id:null}:{channel_model_id:owner,offer_id:null}),version:v.version,source_json:j({source:collection}),created_at:at(v.effectiveAt || v.publishedAt || v.createdAt),actor_id:actor,record_collection:collection,record_json:j(v)});
    for(const [position,item]of items.entries()){
      const billing=state.tariffDictionary.find(d=>d.kind==='scenario' && (item.billing_item_id ? d.id===item.billing_item_id : d.name===item.name)),unit=state.tariffDictionary.find(d=>d.kind==='unit' && (item.unit_id ? d.id===item.unit_id : d.name===item.unit)),currency=state.tariffDictionary.find(d=>d.kind==='currency' && (item.currency_id ? d.id===item.currency_id : d.code===(item.currency || 'CNY')));
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
  for(const v of state.modelSalePrices){if(!v.items?.length || v.supplyId)continue;const m=state.models.find(m=>m.id===v.modelId);if(!m)continue;const owner=offerRecordId(m,offerKey(v),v.serviceModeRevision || 1);if(!tables.offers?.has(owner)){const historical=owner;if(!tables.offers?.has(historical))add('offers',{record_id:historical,service_id:m.id,material_id:master(m.id).id,mode_epoch:v.serviceModeRevision || 1,mode:v.providerId?'provider':'standard',supplier_id:v.providerId || null,id:'',channel_model_id:null,listing_stage:'withdrawn',gray_tenants_json:'[]',market_visible:0,calls_enabled:0,revision:1,created_at:at(v.createdAt),retired_at:1});price(v,'sale',historical,v.items || [],'modelSalePrices');}else price(v,'sale',owner,v.items || [],'modelSalePrices');}
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
      const publicationKey=`publication:${o.record_id}:${receipt.publishedVersion}:${o.active_sale_price_id}:${o.active_route_id}:${m.materialPublication?.version || 0}:${m.commercialPublications?.scope?.version || 0}`;
      const id=identity('publications', publicationKey, 'publication');
      add('publications',{id,offer_id:o.record_id,mode_epoch:o.mode_epoch,sale_price_id:o.active_sale_price_id,route_version_id:o.active_route_id,material_revision:master(m.id).revision || 1,material_snapshot_json:j(master(m.id)),dependencies_json:j({receipt,scope:JSON.parse(tables.services.get(m.id).scope_json),id:o.id}),evidence_job_id:null,reason:'model-operations',created_at:at(receipt.publishedAt || m.updatedAt),actor_id:actor});o.active_publication_id=id;
    }
  }
  return tables;
}

export function modelSupplyRelations(state) {
  const tables = projectModelState(state);
  const suppliers = tables.suppliers || new Map(), materials = tables.materials || new Map(), connections = tables.channels || new Map();
  const models = [...(tables.supplier_models?.values() || [])].filter(row => !row.removed_at && !suppliers.get(row.supplier_id)?.deleted_at && !materials.get(row.material_id)?.deleted_at);
  const ids = new Set(models.map(row => row.id));
  return {
    models: models.map(row => ({ id: row.id, providerId: row.supplier_id, materialId: row.material_id,
      modelId: JSON.parse(row.declaration_json).modelId || materials.get(row.material_id).canonical_slug })).sort((a, b) => a.id < b.id ? -1 : a.id > b.id ? 1 : 0),
    channels: [...(tables.channel_models?.values() || [])].filter(row => !row.removed_at && ids.has(row.supplier_model_id) && !connections.get(row.channel_id)?.deleted_at)
      .map(row => ({ id: row.id, associationId: JSON.parse(row.mapping_json).sourceAssociationId || row.id,
        supplierModelId: row.supplier_model_id, providerId: row.supplier_id, materialId: row.material_id,
        endpointId: row.channel_id, upstreamModelId: row.upstream_model_id, enabled: Boolean(row.enabled) })).sort((a, b) => a.id < b.id ? -1 : a.id > b.id ? 1 : 0),
  };
}

function upsert(db,table,rows,insertOnly=false){
  if(!rows.length)return null;
  const columns=[...new Set(rows.flatMap(Object.keys))],keys=pk[table] || ['id'];
  const update=columns.filter(c=>!keys.includes(c)).map(c=>`${c}=${table==='offers' && c!=='retired_at'?`CASE WHEN excluded.retired_at IS NOT NULL THEN offers.${c} ELSE excluded.${c} END`:`excluded.${c}`}`).join(',');
  return db.prepare(`INSERT INTO ${table}(${columns.join(',')}) SELECT ${columns.map(c=>`json_extract(value,'$.${c}')`).join(',')} FROM json_each(?) WHERE true${insertOnly?'':` ON CONFLICT(${keys.join(',')}) DO UPDATE SET ${update}`}`).bind(j(rows));
}

export async function channelIndexPlan(db, state) {
  const tables = projectModelState(structuredClone(state));
  const versions = new Set([...(tables.offers?.values() || [])].map(row => row.active_route_id).filter(Boolean));
  const expectedChannels = [...(tables.channel_models?.values() || [])].filter(row => !row.removed_at && JSON.parse(row.mapping_json).sourceAssociationId);
  const expectedMembers = [...(tables.route_members?.values() || [])].filter(row => versions.has(row.route_version_id));
  const [{ results: channelRows }, { results: routeRows }] = await db.batch([
    db.prepare('SELECT cm.* FROM channel_models cm JOIN channels c ON cm.channel_id=c.id WHERE c.deleted_at IS NULL'),
    db.prepare('SELECT * FROM route_members WHERE route_version_id IN (SELECT value FROM json_each(?))').bind(j([...versions])),
  ]);
  const indexed = new Map(channelRows.map(row => [row.id, row]));
  const memberKey = row => row.route_version_id + '/' + row.channel_model_id;
  const members = new Map(routeRows.map(row => [memberKey(row), row]));
  const desiredMembers = new Set(expectedMembers.map(memberKey)), desiredChannels = new Set(expectedChannels.map(row => row.id));
  const issues = [];
  const fields = ['upstream_model_id', 'mapping_json', 'enabled', 'config_epoch', 'revision', 'removed_at'];
  for (const want of expectedChannels) {
    const have = indexed.get(want.id);
    const ownership = ['channel_id', 'supplier_id', 'supplier_model_id', 'material_id'];
    const unsafe = have && ownership.some(key => have[key] !== want[key]);
    if (!have || unsafe || fields.some(key => have[key] !== want[key])) {
      issues.push({ id: 'channel/' + want.id, type: '模型渠道索引', endpointId: want.channel_id,
        reference: want.id, reason: unsafe ? '索引归属和供应登记不一致' : have ? '索引字段与供应登记不一致' : '缺少模型渠道索引',
        repairable: !unsafe, before: have && Object.fromEntries([...ownership, ...fields].map(key => [key, have[key]])),
        row: have ? { ...have, ...Object.fromEntries(fields.map(key => [key, want[key]])) } : want });
    }
  }
  for (const have of channelRows) if (!have.removed_at && !desiredChannels.has(have.id) && JSON.parse(have.mapping_json).sourceAssociationId) {
    issues.push({ id: 'channel/' + have.id, type: '模型渠道索引', endpointId: have.channel_id, reference: have.id,
      reason: '找不到对应的当前供应登记', repairable: false, before: { channel_id: have.channel_id, supplier_id: have.supplier_id } });
  }
  for (const want of expectedMembers) {
    const key = memberKey(want), have = members.get(key);
    if (!have || ['offer_id', 'weight', 'position'].some(field => have[field] !== want[field])) {
      issues.push({ id: 'route/' + key, type: '生效路由索引', endpointId: tables.channel_models.get(want.channel_model_id)?.channel_id,
        reference: want.route_version_id, reason: have ? '索引成员与已发布版本不一致' : '缺少已发布路由成员',
        repairable: true, before: have, row: want });
    }
  }
  for (const have of routeRows) if (!desiredMembers.has(memberKey(have))) {
    issues.push({ id: 'route/' + memberKey(have), type: '生效路由索引', endpointId: indexed.get(have.channel_model_id)?.channel_id,
      reference: have.route_version_id, reason: '索引含有已发布版本未选中的成员', repairable: true, before: have, remove: true });
  }
  return issues.sort((left, right) => left.id.localeCompare(right.id));
}

export function channelIndexRepairStatements(db, issues) {
  const channelRows = issues.filter(issue => issue.type === '模型渠道索引').map(issue => issue.row);
  const routeRows = issues.filter(issue => issue.type === '生效路由索引' && !issue.remove).map(issue => issue.row);
  const extras = issues.filter(issue => issue.remove).map(issue => issue.before);
  return [
    upsert(db, 'channel_models', channelRows),
    upsert(db, 'route_members', routeRows),
    extras.length && db.prepare("DELETE FROM route_members WHERE EXISTS (SELECT 1 FROM json_each(?) WHERE route_members.route_version_id=json_extract(value,'$.route_version_id') AND route_members.channel_model_id=json_extract(value,'$.channel_model_id'))").bind(j(extras)),
  ].filter(Boolean);
}

export function modelChanges(db,before,after,{insertOnly=false}={}){
  const a=before?projectModelState(before):{};
  // Preserve internal relationship keys for non-service resources.
  if (before) {
    after.modelData ||= {};
    const ids = after.modelData.resourceIds ||= {};
    for (const [table, type] of [['offers', 'model_service'], ['publications', 'publication'], ['supplier_models', 'provider-model'], ['key_groups', 'key-group'], ['channel_models', 'channel']]) {
      for (const id of a[table]?.keys() || []) {
        if (table !== 'offers' && !isResourceId(id, type)) ids[id] ||= id;
      }
    }
  }
  const b=projectModelState(after,before && !insertOnly ? a : undefined),statements=[];
  const retired = [...(a.offers || [])].filter(([key]) => !b.offers?.has(key)).map(([,row]) => row.record_id);
  if (retired.length) statements.push(db.prepare('UPDATE offers SET retired_at=? WHERE record_id IN (SELECT value FROM json_each(?))').bind(at(after.updatedAt)||Date.now(),j(retired)));
  for(const [table,rows]of Object.entries(b)){
    const changed=[...rows].filter(([key,row])=>j(a[table]?.get(key))!==j(row)).map(([,row])=>row);
    const statement=upsert(db,table,changed,insertOnly);if(statement)statements.push(statement);
  }
  for (const [table, rows] of Object.entries(a)) {
    if (['offers','price_versions','price_items','route_versions','route_members'].includes(table)) continue;
    const missing = [...rows].filter(([key]) => !b[table]?.has(key)).map(([,row]) => row);
    if (!missing.length) continue;
    const column = ['materials','services','suppliers','channels','billing_items','billing_units','currencies'].includes(table) ? 'deleted_at'
      : ['supplier_models','model_template_records','channel_models','service_supply_records','service_route_records','model_versions','model_validations','offer_channels'].includes(table) ? 'removed_at' : null;
    const keys = table === 'offer_channels' ? ['offer_id','channel_model_id'] : column ? ['id'] : pk[table];
    if (!keys) continue;
    const matches = keys.map(key => `${table}.${key}=json_extract(value,'$.${key}')`).join(' AND ');
    statements.push(db.prepare(`${column ? `UPDATE ${table} SET ${column}=?` : `DELETE FROM ${table}`} WHERE EXISTS (SELECT 1 FROM json_each(?) WHERE ${matches})`)
      .bind(...(column ? [at(after.updatedAt)||Date.now()] : []),j(missing.map(row => Object.fromEntries(keys.map(key => [key,row[key]]))))));
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
    for(const account of state.admins)statements.push(db.prepare('INSERT INTO admin_accounts(id,login_code,name,role,enabled,revision) VALUES(?,?,?,?,?,?)').bind(account.id,account.loginCode,account.name,account.role,bool(account.status),1));
  }
  statements.push(...modelChanges(db,null,state,{insertOnly:!demo}),...simulatorChanges(db,{version:1,scenario:'success',clock:0},state.cloudMockState));
  await db.batch(statements);
  return {initialized:true};
}

const arraySql=(query)=>`json(COALESCE((SELECT json_group_array(json(record_json)) FROM (${query})), '[]'))`;
const supplyRelationsSql = `json_object('models',${arraySql(`SELECT json_object('id',sm.id,'providerId',sm.supplier_id,'materialId',sm.material_id,
  'modelId',COALESCE(json_extract(sm.declaration_json,'$.modelId'),m.canonical_slug)) AS record_json
  FROM supplier_models sm JOIN suppliers s ON s.id=sm.supplier_id JOIN materials m ON m.id=sm.material_id
  WHERE sm.removed_at IS NULL AND s.deleted_at IS NULL AND m.deleted_at IS NULL ORDER BY sm.id`)},
  'channels',${arraySql(`SELECT json_object('id',cm.id,'associationId',COALESCE(json_extract(cm.mapping_json,'$.sourceAssociationId'),cm.id),
  'supplierModelId',cm.supplier_model_id,'providerId',cm.supplier_id,'materialId',cm.material_id,'endpointId',cm.channel_id,
  'upstreamModelId',cm.upstream_model_id,'enabled',json(CASE WHEN cm.enabled THEN 'true' ELSE 'false' END)) AS record_json
  FROM channel_models cm JOIN supplier_models sm ON sm.id=cm.supplier_model_id AND sm.material_id=cm.material_id AND sm.supplier_id=cm.supplier_id
  JOIN suppliers s ON s.id=cm.supplier_id JOIN materials m ON m.id=cm.material_id JOIN channels c ON c.id=cm.channel_id AND c.supplier_id=cm.supplier_id
  WHERE cm.removed_at IS NULL AND sm.removed_at IS NULL AND s.deleted_at IS NULL AND m.deleted_at IS NULL AND c.deleted_at IS NULL ORDER BY cm.id`)})`;
async function workspacePayload(db,actor,command=false){
  const fields=[`'supplyRelations',${supplyRelationsSql}`];
  fields.push(`'marketProjects',${arraySql("SELECT json_object('id',json_extract(value,'$.id'),'tenantId',json_extract(value,'$.tenantId'),'name',json_extract(value,'$.name'),'status',json_extract(value,'$.status')) AS record_json FROM json_each(w.reference_json,'$.projects')")}`);
  if(command)fields.push("'lastSupplierChannelNumber',COALESCE((SELECT MAX(CAST(substr(code,4) AS INTEGER)) FROM channels WHERE code GLOB 'CH-[0-9]*' AND substr(code,4) NOT GLOB '*[^0-9]*'),0)");
  for(const [collection,table]of Object.entries(entityTables)){
    const where=['services','suppliers','channels'].includes(table)?'deleted_at IS NULL':['model_template_records','service_supply_records','model_versions','model_validations','service_route_records'].includes(table)?'removed_at IS NULL':'1';
    fields.push(`'${collection}',${arraySql(`SELECT record_json FROM ${table} WHERE ${where} AND record_json!='{}'`)}`);
  }
  for(const collection of ['modelSalePrices','supplyPrices'])fields.push(`'${collection}',${arraySql(`SELECT record_json FROM model_price_records WHERE record_collection='${collection}'`)}`);
  fields.push(`'tariffDictionary',${arraySql("SELECT record_json FROM billing_items WHERE deleted_at IS NULL UNION ALL SELECT record_json FROM billing_units WHERE deleted_at IS NULL UNION ALL SELECT record_json FROM currencies WHERE deleted_at IS NULL")}`);
  fields.push(`'audits',${arraySql(`SELECT json_remove(record_json,'$.before','$.after','$.platformAudit') AS record_json FROM audit_events WHERE record_json!='{}' ORDER BY created_at DESC LIMIT ${command?1:200}`)}`);
  fields.push(`'admins',${arraySql("SELECT json_object('id',id,'loginCode',COALESCE(login_code,id),'name',name,'role',role,'status',CASE WHEN enabled THEN '已启用' ELSE '已停用' END) AS record_json FROM admin_accounts")}`);
  const snapshot=["'operations',json('{}')"];
  for(const kind of ['credentials','channels','batches','services','identities','clientKeys','usage','changes','audits'])snapshot.push(`'${kind}',${arraySql(`SELECT payload_json AS record_json FROM simulation_records WHERE kind='${kind}'`)}`);
  snapshot.push("'rateEvents',json(COALESCE((SELECT json_group_object(id,json(payload_json)) FROM simulation_records WHERE kind='rateEvents'),'{}'))");
  fields.push(`'cloudMockState',json_patch(COALESCE((SELECT payload_json FROM simulation_records WHERE kind='meta' AND id='state'),'{}'),json_object(${snapshot.join(',')}))`);
  fields.push("'cloudOperations',json('true'),'revision',w.revision,'commitSeq',(SELECT commit_seq FROM db_state WHERE id=1),'adminSession',json_object('accountId',?),'currentRole',?");
  const reference="json_set(w.reference_json,'$.apiKeys',json('[]'),'$.users',json('[]'),'$.memberships',json('[]'),'$.grants',json('[]'),'$.projects',json('[]'))";
  const payload=await db.prepare(`SELECT json_patch(json_patch(${reference},w.meta_json),json_object(${fields.join(',')})) AS payload FROM model_workspace w WHERE id=1`).bind(actor.id,actor.role).first('payload');
  if(!payload)throw Error('模型运营工作区尚未初始化');return payload;
}
export const modelWorkspacePayload=(db,actor)=>workspacePayload(db,actor);
export async function loadModelWorkspace(db,actor,{command=false}={}){return domainModelWorkspace(JSON.parse(await workspacePayload(db,actor,command)));}

// Simulator calls need live resource availability, not the full model editing workspace.
export async function loadSimulationWorkspace(db){
  const rows=await db.batch([
    db.prepare('SELECT revision FROM model_workspace WHERE id=1'),db.prepare('SELECT commit_seq FROM db_state WHERE id=1'),
    db.prepare("SELECT json_object('id',id,'status',json_extract(record_json,'$.status'),'apiKeys',json_extract(record_json,'$.apiKeys'),'catalogModels',json_extract(record_json,'$.catalogModels'),'catalogConnections',json_extract(record_json,'$.catalogConnections')) AS record_json FROM suppliers WHERE deleted_at IS NULL"),
    db.prepare("SELECT json_object('id',id,'providerId',supplier_id,'status',json_extract(record_json,'$.status'),'deletedAt',json_extract(record_json,'$.deletedAt'),'frozen',json_extract(record_json,'$.frozen'),'apiKeys',json_extract(record_json,'$.apiKeys')) AS record_json FROM channels WHERE deleted_at IS NULL"),
    db.prepare("SELECT json_object('id',id,'type',json_extract(record_json,'$.type'),'platformPublications',json_extract(record_json,'$.platformPublications')) AS record_json FROM services WHERE deleted_at IS NULL"),
    db.prepare("SELECT kind,id,payload_json FROM simulation_records WHERE kind NOT IN ('operations','site-agreements','site-portal')")]);
  const snapshot=createMockEngine().snapshot();
  for(const kind of new Set(rows[5].results.map(r=>r.kind))){const records=rows[5].results.filter(r=>r.kind===kind);if(kind==='meta')Object.assign(snapshot,JSON.parse(records[0].payload_json));else snapshot[kind]=kind==='rateEvents'?Object.fromEntries(records.map(r=>[r.id,JSON.parse(r.payload_json)])):records.map(r=>JSON.parse(r.payload_json));}
  return {cloudOperations:true,revision:rows[0].results[0].revision,commitSeq:rows[1].results[0].commit_seq,providers:rows[2].results.map(r=>JSON.parse(r.record_json)),endpoints:rows[3].results.map(r=>JSON.parse(r.record_json)),models:rows[4].results.map(r=>JSON.parse(r.record_json)),modelTemplates:[],cloudMockState:snapshot};
}
