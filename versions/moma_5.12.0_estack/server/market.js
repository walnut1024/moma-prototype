import { modelPresentation } from '../src/model-identities.mjs';
import { resourceId } from '../src/resource-id.mjs';
import { salesCustomer, lifecycleAccess, serviceReferences, serviceCallsEnabled, offerKey, salesPaused } from '../src/service-access.mjs';
import { marketAudience, marketCardCatalogueEntry, marketCardModelId, marketCardsByModel, marketCardVisible } from '../src/market-cards.mjs';
import { servicePurpose } from '../src/admin-v2/service-purpose.js';
import { domainModel } from '../src/mock/model-fields.js';
import { createMockEngine } from '../src/admin-v2/mock-onboarding-core.js';
import { platformPublicationFingerprint } from '../src/admin-v2/platform-publication-state.js';
import { platformPriceVersions } from '../src/admin-v2/platform-service-client.js';
import { activeSupplyPrice } from '../src/admin-v2/model-management.js';
import { MOMA_PROVIDER } from '../src/admin-v2/moma-provider.js';
import { classificationIndex, existingClassification, modelClassificationFor } from '../src/admin-v2/model-classification.js';
import { loadModelWorkspace, stoppedOfferSql } from './model-repository.js';
import { listedPackages, packageOffer } from './market-packages.js';
import { experienceTasks } from '../src/service-directory.mjs';
import { billingPeriod } from '../src/admin-v2/mock-billing.js';
import { tenantModelAllowed, tenantQuotaEnabled, tenantQuotaError } from '../src/tenant-service-policy.mjs';
import { enterpriseGrant, enterpriseTokenUsage } from '../src/admin-v2/enterprise.js';
import { mockTextUsage, projectAccessError, projectCallError, projectCallErrors } from '../src/project-call.mjs';
import { marketProjectFact, projectCallContext, projectChargeWrites, projectFactWrite, readProjectFact } from './project-facts.js';
import { activeTenantVersion, isTenantRouteCall, routeTargets, tenantRouteVisible } from '../src/tenant-routing.mjs';

const fail = (status, code, message) => { throw Object.assign(new Error(message), { status, code }); };
const digest = async value => Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value))), byte => byte.toString(16).padStart(2, '0')).join('');
const activeStages = ['gray', 'formal'];
const selectOffers = `
  SELECT o.record_id,o.id AS call_id,o.listing_stage,o.gray_tenants_json,o.market_visible,
         o.calls_enabled,${stoppedOfferSql} AS stopped,s.id AS service_id,s.record_json AS service_json,m.id AS material_id,m.record_json AS material_json,
         EXISTS (SELECT 1 FROM model_workspace w, json_each(w.meta_json,'$.modelData.marketCards') card,
           json_each(card.value,'$.linked') linked WHERE w.id=1 AND linked.value=o.record_id
           AND json_extract(card.value,'$.status') IN ('draft','withdrawn','preview')) AS card_stops_sales,
         o.supplier_id AS provider_id,p.name AS provider_name,COALESCE(json_extract(cm.mapping_json,'$.sourceName'),c.name) AS source_name,
         (o.channel_model_id IS NULL OR (p.enabled=1 AND p.deleted_at IS NULL AND cm.enabled=1 AND cm.removed_at IS NULL
           AND c.deleted_at IS NULL AND COALESCE(json_extract(c.record_json,'$.frozen'),0)=0
           AND json_extract(c.record_json,'$.status') IN ('运行中','需关注'))) AS source_ready,
         price.record_json AS sale_json,price.id AS sale_id,o.active_route_id,o.active_publication_id,route.config_json AS route_json,
         purchase.id AS order_id,purchase.created_at AS order_created_at,(SELECT commit_seq FROM db_state WHERE id=1) AS commit_seq
    FROM offers o JOIN services s ON s.id=o.service_id JOIN materials m ON m.id=o.material_id
    LEFT JOIN suppliers p ON p.id=COALESCE(o.supplier_id,'${MOMA_PROVIDER.id}')
    LEFT JOIN channel_models cm ON cm.id=o.channel_model_id LEFT JOIN channels c ON c.id=cm.channel_id
    LEFT JOIN price_versions price ON price.id=o.active_sale_price_id
    LEFT JOIN route_versions route ON route.id=o.active_route_id AND route.offer_id=o.record_id
    LEFT JOIN market_orders purchase ON purchase.offer_id=o.record_id AND purchase.tenant_id=? AND purchase.cancelled_at IS NULL
    WHERE o.retired_at IS NULL AND s.deleted_at IS NULL AND o.id<>''`;

function marketOffer(row, tenant, at = Date.now()) {
  const model = domainModel(JSON.parse(row.service_json),true), sale = row.sale_json && JSON.parse(row.sale_json);
  const price = sale && Date.parse(sale.effectiveAt)<=at && (!sale.expiresAt || Date.parse(sale.expiresAt)>at) ? sale : null;
  const route = row.route_json && JSON.parse(row.route_json);
  const supplyIds = (route?.channels || []).filter(channel => channel.enabled !== false &&
    (!['weighted','priority_weighted'].includes(route.strategy) || channel.weight > 0)).map(channel => channel.supplyId);
  const accessible=tenantModelAllowed(tenant,tenant?.grant,row.service_id);
  const allowed=Boolean(tenant && accessible && salesCustomer(model,tenant.id));
  const released=accessible && activeStages.includes(row.listing_stage) && !model.archivedAt &&
    (row.listing_stage!=='gray' || tenant && JSON.parse(row.gray_tenants_json).includes(tenant.id));
  const key = offerKey(model.serviceProviders?.find(entry => entry.callId === row.call_id));
  return { model, price, supplyIds, released, allowed, key, paused:Boolean(row.card_stops_sales) || salesPaused(model,key),
    ready: Boolean(model.visibility==='公开' && model.callsEnabled && row.calls_enabled && row.source_ready && supplyIds.length && row.active_publication_id && price) };
}

async function loadMarketProcurement(db, offers) {
  // The active purchase pointer is updated on writes, while price validity changes with time.
  const state = { modelSupplies: [], endpoints: [], providers: [], supplyPrices: [] };
  const supplyIds = [...new Set(offers.flatMap(offer => offer.supplyIds))];
  if (!supplyIds.length) return state;
  const { results } = await db.prepare(`
    WITH supplies AS (
      SELECT id,record_json FROM service_supply_records WHERE removed_at IS NULL AND id IN (SELECT value FROM json_each(?))
    ), endpoints AS (
      SELECT id,supplier_id,record_json FROM channels WHERE deleted_at IS NULL AND
        id IN (SELECT json_extract(record_json,'$.endpointId') FROM supplies)
    )
    SELECT 'modelSupplies' AS collection,record_json FROM supplies
    UNION ALL SELECT 'endpoints',record_json FROM endpoints
    UNION ALL SELECT 'providers',record_json FROM suppliers WHERE deleted_at IS NULL AND id IN (SELECT supplier_id FROM endpoints)
    UNION ALL SELECT 'supplyPrices',record_json FROM model_price_records WHERE record_collection='supplyPrices' AND
      json_extract(record_json,'$.supplyId') IN (SELECT id FROM supplies)
  `).bind(JSON.stringify(supplyIds)).all();
  for (const { collection, record_json } of results) state[collection].push(JSON.parse(record_json));
  return state;
}

function marketSalePrices(offer, procurement, at) {
  try {
    const prices = platformPriceVersions(offer.price,offer.model,'销售价格',at);
    for (const supplyId of offer.supplyIds) {
      platformPriceVersions(activeSupplyPrice(procurement,supplyId,at),offer.model,'采购价格',at);
    }
    return prices;
  } catch {
    return null;
  }
}

export async function marketCatalogue(db, session, { display = false, projectId, license } = {}) {
  const tenant = session?.tenant || null, internal = tenant?.internal === true;
  if (display && license?.commercial === false && !internal) return { tenant:null, account:null, spaces:[], cards:[], services:[], orders:[], packages:[], projects:[] };
  const workspace = await db.prepare(display
    ? 'SELECT meta_json, reference_json FROM model_workspace WHERE id=1'
    : 'SELECT meta_json FROM model_workspace WHERE id=1').first();
  const modelData = workspace && JSON.parse(workspace.meta_json).modelData;
  const cards = display ? modelData?.marketCards || {} : {};
  const cardsByModel = marketCardsByModel(cards);
  const reference = display && workspace && session ? JSON.parse(workspace.reference_json) : {};
  const member = reference.memberships?.find(row => row.tenantId === tenant?.id && row.userId === session.user.id && row.status === '正常');
  const audience = marketAudience(reference, { tenantId:tenant?.id, member, projectId });
  if (projectId && !audience.projectId) fail(403,'PROJECT_FORBIDDEN','当前成员无权查看此项目');
  const legacy = "(o.listing_stage IN ('gray','formal') AND o.market_visible=1 AND s.market_visible=1)";
  const conditions = display ? '(' + legacy + ' OR m.id IN (SELECT value FROM json_each(?)))' : legacy;
  const { results } = await db.prepare(selectOffers + ' AND NOT ' + stoppedOfferSql + ' AND ' + conditions + ' ORDER BY m.name,p.created_at,p.name,o.created_at,o.record_id')
    .bind(tenant?.id || '', ...(display ? [JSON.stringify([...cardsByModel.keys()])] : [])).all();
  const materials = new Map();
  for (const row of results) if (!materials.has(row.material_id)) {
    materials.set(row.material_id, domainModel(JSON.parse(row.material_json)));
  }
  const visibleCards = Object.entries(cards).filter(([, card]) => ['preview', 'listed'].includes(card.status));
  const modelIds = visibleCards.map(([cardId, card]) => marketCardModelId(cardId, card)).filter(Boolean);
  const { results: cardMaterials } = modelIds.length ? await db.prepare(
    'SELECT id,canonical_slug FROM materials WHERE deleted_at IS NULL AND id IN (SELECT value FROM json_each(?))'
  ).bind(JSON.stringify(modelIds)).all() : { results: [] };
  const classification = classificationIndex(modelData?.modelClassification || existingClassification(materials.values()));
  const slugs = new Map(cardMaterials.map(row => [row.id, row.canonical_slug]));
  const catalogueCards = visibleCards.flatMap(([cardId, record]) => {
    const modelId = marketCardModelId(cardId, record);
    if (modelId && !slugs.has(modelId)) return [];
    const card = marketCardCatalogueEntry(record, modelId, slugs.get(modelId) || '', audience, cardId);
    if (!card) return [];
    const { author, series } = modelClassificationFor(classification, card);
    return [{ ...card, classification: { authorId: author?.id, author: author?.name, seriesId: series?.id, series: series?.name } }];
  });
  const offers = results.map(row => ({ row, ...marketOffer(row,tenant), card:cardsByModel.get(row.material_id) || null }))
    .filter(offer => {
      const { row, card, allowed, released } = offer;
      const grayVisible = row.listing_stage !== 'gray' || (released && (allowed || row.order_id));
      if (!card) return grayVisible && released && offer.ready && (!internal || allowed);
      return marketCardVisible(card,row.record_id,audience) && serviceCallsEnabled(offer.model) &&
        row.calls_enabled && row.source_ready && (internal || (grayVisible && servicePurpose(offer.model,offer.key) !== 'internal'));
    });
  const procurement = await loadMarketProcurement(db,offers.filter(offer => offer.ready && offer.released)), at = Date.now();
  const services = offers.flatMap(offer => {
    const { row, card } = offer;
    const prices = offer.ready && offer.released ? marketSalePrices(offer,procurement,at) : null;
    if (!prices && !card) return [];
    const master = materials.get(row.material_id);
    const material = modelPresentation(null, { ...master, marketContent: card?.content || JSON.parse(row.service_json).marketContent });
    const { author, series } = modelClassificationFor(classification, card ? material : master);
    return [{
      id:row.record_id, model_service_id:row.record_id, model_id:row.material_id, canonical_slug:material.modelId, call_id:row.call_id, provider_id:row.provider_id || MOMA_PROVIDER.id, callId:row.call_id, modelId:material.modelId, modelKey:row.material_id, serviceModelId:row.service_id, name:material.name,
      providerId:row.provider_id || MOMA_PROVIDER.id, providerName:row.provider_name || MOMA_PROVIDER.name,
      provider:row.source_name ? `${row.provider_name}（${row.source_name}）` : row.provider_name || 'MoMA',
      maker:material.profile?.author || material.maker || '', type:material.type, description:material.description || '',
      classification: { authorId: author?.id, author: author?.name, seriesId: series?.id, series: series?.name },
      profile:{...offer.model.profile,...material.profile}, capabilities:material.capabilities || {},
      ...(card && { features: card.content.features, description_en: card.content.description_en, heat: card.content.heat, tags: card.content.tags }),
      salePrices:internal ? [] : (prices || []).map(({amount,currency,unit,effectiveAt,expiresAt})=>({amount,currency,unit,effectiveAt,expiresAt})),
      ...(internal && {internal:true}),
      salePriceId:internal || !prices ? undefined : row.sale_id,
      canOrder:!internal && license?.commerceWritable !== false && !offer.paused && Boolean(prices) && offer.allowed,
      ordered:!internal && Boolean(row.order_id), orderedAt:internal ? null : row.order_created_at,
      callable:Boolean(prices && (internal && offer.allowed || tenant && row.order_id)), stage:row.listing_stage,
      projectServiceId:serviceReferences({models:[offer.model]}).find(service => service.callId === row.call_id)?.id,
    }];
  });
  const orders=tenant && !internal?(await db.prepare(`SELECT purchase.id,purchase.offer_id AS offerId,offer.id AS callId,purchase.created_at AS createdAt,CASE WHEN purchase.cancelled_at IS NOT NULL THEN 'cancelled' WHEN offer.retired_at IS NULL THEN offer.listing_stage ELSE 'withdrawn' END AS stage
    FROM market_orders purchase JOIN offers offer ON offer.record_id=purchase.offer_id WHERE purchase.tenant_id=? ORDER BY purchase.created_at DESC`).bind(tenant.id).all()).results:[];
  const packages=tenant && !internal?(await listedPackages(db,tenant)).map(packageOffer).sort((a,b)=>Number(a.displayOrder || 0)-Number(b.displayOrder || 0)):[];
  return { tenant:tenant?{id:tenant.id,name:tenant.name,type:tenant.type,...(internal && {internal:true})}:null,
    account:session?{id:session.user.id,username:session.user.login,name:session.user.nickname || session.user.name}:null,
    spaces:session?.spaces || [],services,orders,packages,
    ...(display && { cards:catalogueCards, projects:audience.projects.map(({id,name})=>({id,name})) }) };
}

async function checkedOffer(db, session, field, value, { ordering = false } = {}) {
  if (!session) fail(401,'TENANT_SESSION_REQUIRED','请先登录模型广场');
  const row=await db.prepare(selectOffers + (field==='recordId'?' AND o.record_id=?':' AND o.id=?')).bind(session.tenant.id,value).first();
  if (!row) fail(404,'MODEL_UNAVAILABLE','模型服务不存在或已下架');
  if(row.commit_seq!==session.commitSeq)fail(409,'REVISION_CONFLICT','客户权限或服务配置已变化，请重试');
  if (row.stopped) fail(409,'MODEL_UNAVAILABLE','模型服务已停止');
  const offer=marketOffer(row,session.tenant);
  if (!ordering && (!serviceCallsEnabled(offer.model) || !row.calls_enabled)) {
    fail(409, 'MODEL_UNAVAILABLE', '模型服务已停止');
  }
  if (!activeStages.includes(row.listing_stage) || !offer.ready) fail(409,'MODEL_UNAVAILABLE','模型服务已下架或暂不可用');
  if (ordering && offer.paused) fail(409,'MODEL_UNAVAILABLE','此模型服务已停售');
  if (!offer.released || (ordering || session.tenant.internal) && !offer.allowed) fail(403,'MODEL_FORBIDDEN','当前客户不在此服务的销售或灰度范围内');
  return { row, ...offer };
}

const guard = `(SELECT commit_seq FROM db_state WHERE id=1)=? AND
  EXISTS (SELECT 1 FROM market_sessions WHERE token_hash=? AND tenant_id=? AND expires_at>?)`;

export async function marketOrder(db, session, offerIds, { tenantId, salePriceIds } = {}) {
  if (tenantId && tenantId!==session.tenant.id) fail(409,'TENANT_CHANGED','客户空间已变化，请重新选择');

  if (session.tenant.internal) fail(403,'INTERNAL_SPACE','企业内用空间通过项目授权使用模型');
  if (!['个人用户','企业管理员','租户管理员'].includes(session.tenant.role)) fail(403,'FORBIDDEN','仅客户管理员可以订购服务');
  const offers=await Promise.all(offerIds.map(id=>checkedOffer(db,session,'recordId',id,{ordering:true})));
  const {tenant,hash}=session, seq=offers[0].row.commit_seq;
  if (offers.some(({row})=>row.commit_seq!==seq)) fail(409,'REVISION_CONFLICT','服务配置已变化，请刷新后重新订购');
  const procurement=await loadMarketProcurement(db,offers);
  const at=Date.now();
  if (offers.some(offer=>!marketSalePrices(offer,procurement,at))) fail(409,'MODEL_UNAVAILABLE','模型服务暂不可订购');
  const pending=offers.filter(({row})=>!row.order_id).map(({row})=>({id:resourceId('order'),offerId:row.record_id,priceId:row.sale_id}));
  if (salePriceIds && pending.some(row=>salePriceIds[row.offerId]!==row.priceId)) fail(409,'PRICE_CHANGED','售价已变化，请重新确认');
  if (pending.length) await db.prepare(`INSERT INTO market_orders(id,tenant_id,offer_id,sale_price_id,created_at)
    SELECT json_extract(value,'$.id'),?,json_extract(value,'$.offerId'),json_extract(value,'$.priceId'),?
    FROM json_each(?) WHERE ${guard} ON CONFLICT(tenant_id,offer_id) WHERE cancelled_at IS NULL DO NOTHING`).bind(tenant.id,at,JSON.stringify(pending),seq,hash,tenant.id,at).run();
  const {results}=await db.prepare('SELECT id,offer_id FROM market_orders WHERE tenant_id=? AND cancelled_at IS NULL AND offer_id IN (SELECT value FROM json_each(?))').bind(tenant.id,JSON.stringify(offerIds)).all();
  if (results.length!==offerIds.length) fail(409,'REVISION_CONFLICT','服务配置已变化，请刷新后重新订购');
  return {orders:results.map(row=>({id:row.id,offerId:row.offer_id,ordered:true}))};
}

export async function experienceOptions(db,task){
  if(!['text','image','video','voice'].includes(task))fail(400,'INVALID_INPUT','体验任务无效');
  const settings=await db.prepare('SELECT options_json FROM experience_settings WHERE task=?').bind(task).first('options_json');
  if(!settings)fail(503,'EXPERIENCE_UNAVAILABLE','体验配置尚未初始化');
  return JSON.parse(settings);
}

async function experienceOutput(db,{task,imageCount=1,speechMode}) {
  if(!task)return {answer:'模拟调用已完成。'};
  const record=await db.prepare('SELECT result_json FROM experience_settings WHERE task=?').bind(task).first('result_json');
  if(!record)fail(503,'EXPERIENCE_UNAVAILABLE','体验配置尚未初始化');
  const result=JSON.parse(record);
  if(task==='image' || task==='video'){
    return {artifacts:Array.from({length:task==='image'?imageCount:1},()=>({url:result.asset}))};
  }
  return task==='voice' && speechMode==='tts'?{speakInput:true}:result;
}

export async function marketCompletion(db, session, body) {
  if (body.tenantId && body.tenantId!==session.tenant.id) fail(409,'TENANT_CHANGED','客户空间已变化，请重新发送');
  const { tenant, hash }=session;
  const requestHash=await digest(JSON.stringify([session.user.id,body.projectId,body.model,body.task,body.images,body.imageCount,body.speechMode,
    body.simulateDenied,body.messages[0].content,...(body.textTurn?[body.textTurn]:[]),...(body.routing?[body.routing]:[])]));
  const replay=async()=>{
    const receipt=await db.prepare('SELECT request_hash,response_json FROM market_calls WHERE tenant_id=? AND request_id=?').bind(tenant.id,body.requestId).first();
    if (!receipt) return null;
    if (receipt.request_hash!==requestHash) fail(409,'REQUEST_ID_CONFLICT','调用标识已用于其他请求');
    return JSON.parse(receipt.response_json);
  };
  const routed=isTenantRouteCall(body.model);
  const [{ project, state:projectState }, existing, state, catalogue] = await Promise.all([
    projectCallContext(db, session, body.projectId, session.commitSeq), replay(),
    loadModelWorkspace(db,{id:tenant.id,role:'客户'},{command:true}),
    routed ? marketCatalogue(db,session) : null,
  ]);
  const route=routed && (projectState.tenantRoutes || []).find(item=>item.callId===body.model && item.enabled &&
    tenantRouteVisible(item,tenant.id,project.id,session.user.id,project.canManage));
  const version=activeTenantVersion(route);
  if (routed && !version) fail(403,'tenant_route_forbidden','当前路由未生效或不可用');
  const messages=version?.config.systemPrompt
    ? [{role:'system',content:version.config.systemPrompt},...body.messages] : body.messages;
  const eligible=service=>experienceTasks(service).includes('text') && !projectAccessError(project,service.serviceModelId,null,Date.now());
  const targets=routed ? routeTargets(version.config,catalogue.services.filter(eligible),body.model,{
    inputTokens:mockTextUsage(messages.map(item=>item.content).join('\n'),'').input, costTier:body.routing?.cost_tier,
  }) : [];
  if (routed && !targets.length) fail(503,'tenant_route_unavailable','当前项目没有符合权限和订购条件的可调用候选');
  if (routed && existing) {
    const selected=targets.find(item=>item.callId===existing.model);
    if (!selected) fail(403,'tenant_route_unavailable','该次调用的模型服务当前不可用');
    return existing;
  }
  const callIds=routed ? targets.map(item=>item.callId) : [body.model];
  const offers=await Promise.all(callIds.map(callId=>checkedOffer(db,session,'callId',callId)));
  let [{row,model}]=offers;
  let material=domainModel(JSON.parse(row.material_json));
  const profile=model.profile || material.profile;
  if ((body.task && !experienceTasks({ ...material, profile }).includes(body.task)) || (body.images && !profile?.inputModalities?.includes('图片'))) {
    fail(422,'TASK_UNSUPPORTED','所选模型不支持当前任务');
  }
  if (!tenant.internal && !row.order_id) fail(403,'ORDER_REQUIRED','请先订购此模型服务');
  projectState.models=offers.map(offer=>offer.model);
  const savedFact = projectState.requests.find(request => request.requestId === body.requestId);
  function replayFact(fact) {
    if (!fact) return;
    if (fact.requestHash && (fact.requestHash !== requestHash || fact.source !== '网页端调用')) {
      fail(409,'REQUEST_ID_CONFLICT','调用标识已用于其他请求');
    }
    if (fact.rejection) fail(fact.httpStatus,fact.error,fact.rejection);
    fail(409,'CALL_RECEIPT_EXPIRED','此调用已保存，调用响应已过期');
  }
  const reject = async (status,code,message,attempts = []) => {
    const at = Date.now(), timestamp = new Date(at).toISOString();
    const fact = {
      id:body.requestId, requestId:body.requestId, requestHash, rejection:message,
      tenantId:tenant.id, projectId:project.id, keyId:'experience:'+project.id, userId:session.user.id, actorUserId:session.user.id,
      modelId:model.id, modelType:model.type, publicModelId:row.call_id, createdAt:timestamp, updatedAt:timestamp, httpStatus:status,
      source:'网页端调用', billingType:'按量付费', purpose:'customer', billingStatus:'not_billable', error:code,
      ...(tenant.internal && { settlement:'internal', departmentId:project.organizationId || null }),
      attempts:attempts.length ? attempts : [{dispatched:false,startedAt:timestamp,error:code}],
    };
    if (attempts.some(item=>item.dispatched)) fact.admittedAt=attempts.find(item=>item.dispatched).startedAt;
    try {
      const [insert] = await db.batch([
        projectFactWrite(db,fact,guard,row.commit_seq,hash,tenant.id,at),
        db.prepare('UPDATE db_state SET commit_seq=commit_seq+1 WHERE id=1 AND changes()=1'),
      ]);
      if (insert.meta.changes) fail(status,code,message);
    } catch (error) {
      if (!/UNIQUE constraint/.test(String(error))) throw error;
    }
    replayFact(await readProjectFact(db,tenant.id,body.requestId));
    fail(409,'REVISION_CONFLICT','项目配置或调用已变化，请重试');
  };
  const projectAccessCode = projectAccessError(project, model.id, null, Date.now());
  if (projectAccessCode) {
    if (existing) fail(projectCallErrors[projectAccessCode][0],projectAccessCode,projectCallErrors[projectAccessCode][1]);
    replayFact(savedFact);
    return reject(projectCallErrors[projectAccessCode][0],projectAccessCode,projectCallErrors[projectAccessCode][1]);
  }
  if (existing) return existing;
  replayFact(savedFact);
  if (state.commitSeq!==row.commit_seq) fail(409,'REVISION_CONFLICT','服务配置已变化，请重新调用');
  const references=serviceReferences(state);
  const engine=createMockEngine({initialState:state.cloudMockState,localState:state});
  let response, usage, service;
  const failedAttempts=[];
  for (const offer of offers) {
    ({ row, model }=offer);
    material=domainModel(JSON.parse(row.material_json));
    service=references.find(item=>item.modelId===row.service_id && item.callId===row.call_id);
    const access=lifecycleAccess(state,service,tenant.id);
    if (!access.allowed) {
      if (routed) {
        failedAttempts.push({dispatched:false,startedAt:new Date().toISOString(),serviceId:service?.id,modelId:model.id,error:access.code});
        continue;
      }
      fail(403,access.code,access.reason);
    }
    const proof=service.model.platformPublications?.find(item=>item.serviceId===service.id && item.source==='mock');
    if (!proof || proof.fingerprint!==platformPublicationFingerprint(state,service.model,service.id)) {
      if (routed) {
        failedAttempts.push({dispatched:false,startedAt:new Date().toISOString(),serviceId:service.id,modelId:model.id,error:'PUBLICATION_REQUIRED'});
        continue;
      }
      fail(409,'PUBLICATION_REQUIRED','当前连接配置需要重新验证');
    }
    const sale=state.modelSalePrices.find(item=>item.id===row.sale_id);
    try {
      const snapshot=state.cloudMockState.services.find(item=>item.id===proof.mockServiceId && item.published?.version===proof.publishedVersion);
      if (!snapshot) throw Error('缺少当前服务的发布快照');
      const config={
        ...snapshot.published.config,
        salePrices:platformPriceVersions(sale,service.model),
        bindings:snapshot.published.config.bindings.map(binding=>({...binding,procurementPrices:platformPriceVersions(activeSupplyPrice(state,binding.id),service.model,'采购价格')})),
      };
      ({ response, usage }=engine.callForOrder(snapshot,config,{tenantId:tenant.id,orderId:tenant.internal ? null : row.order_id,messages}));
      break;
    } catch (error) {
      const attempts=(error.attempts || []).map(({dispatched,startedAt,endpointId,channelId,bindingId,code}) =>
        ({dispatched,startedAt,endpointId,channelId,supplyId:bindingId,serviceId:service.id,modelId:model.id,error:code}));
      if (!routed) return reject(409,'CALL_UNAVAILABLE','当前连接无法完成调用，请检查服务和价格状态',attempts);
      failedAttempts.push(...(attempts.length ? attempts : [
        {dispatched:false,startedAt:new Date().toISOString(),serviceId:service.id,modelId:model.id,error:error.code || 'CALL_UNAVAILABLE'},
      ]));
    }
  }
  if (!response) return reject(409,'CALL_UNAVAILABLE','当前路由的候选服务均无法完成调用',failedAttempts);
  usage.userId=session.user.id;
  if (tenant.internal) Object.assign(usage,{settlement:'internal',priceSnapshot:null,saleTrial:null});
  usage.publicAtCall=!tenant.internal && row.listing_stage==='formal' && Boolean(row.market_visible) && model.marketVisible!==false;
  response.choices[0].message.content='模拟调用已完成。';
  if (body.simulateDenied) {
    Object.assign(usage,{ status:'failed',code:'Model.AccessDenied',usage:null,attempts:[],cost:null,saleTrial:null,billingStatus:'not_billable' });
    Object.assign(response,{ choices:[],usage:null,httpStatus:403,experience:null,
      invocationError:{code:'Model.AccessDenied',message:'当前账号暂无该模型的调用权限，请订购模型或切换其他可用模型。'} });
  }
  if (routed) {
    const reason=failedAttempts[0]?.error;
    const first=targets[0];
    const provider=row.source_name ? row.provider_name + '（' + row.source_name + '）' : row.provider_name || 'MoMA';
    const skippedModel=route.kind==='preset' && version.config.models[0]!==row.material_id;
    response.routing={id:route.callId,version:version.number,modelName:material.name,provider,
      ...(row.call_id!==first.callId || skippedModel || reason ? {
        fallback:skippedModel || row.material_id!==first.modelKey ? 'model' : 'provider',
        reason:reason || 'model_unavailable',
      } : {})};
  }
  if(!body.simulateDenied){
    response.experience=await experienceOutput(db,body);
    if(response.experience.answer)response.choices[0].message.content=response.experience.answer;
  }
  Object.assign(usage,{platform_request_id:body.requestId,model_id:row.material_id,model_service_id:row.record_id,route_version_id:row.active_route_id,sale_price_id:row.sale_id});
  const at=Date.now();
  const projectFact = { ...marketProjectFact({project,user:session.user,usage,response,request:body,service,at,internal:tenant.internal}), requestHash };
  if (routed) {
    Object.assign(projectFact,{tenantRouteId:route.id,tenantRouteVersion:version.number});
    if (!body.simulateDenied) projectFact.attempts=[...failedAttempts,...projectFact.attempts];
  }
  const grant = enterpriseGrant(projectState,tenant.id);
  const grantIndex = grant ? projectState.grants.indexOf(grant) : -1;
  const quantity = body.simulateDenied ? 0 : enterpriseTokenUsage(service.model,projectFact.usage);
  if (!body.simulateDenied) {
    const quotaError = tenantQuotaError(grant,quantity,at,tenant.internal);
    if (quotaError) return reject(projectCallErrors[quotaError][0],quotaError,projectCallErrors[quotaError][1]);
    const code = projectCallError(projectState, project, service.model, null, projectFact.usage, projectFact.internalCost || projectFact.charge, at, tenant.internal);
    if (code) return reject(projectCallErrors[code][0],code,projectCallErrors[code][1]);
  }
  const history=body.textTurn?JSON.stringify({...body.textTurn,modelName:material.name,
    provider:response.routing?.provider || (row.source_name?`${row.provider_name}（${row.source_name}）`:row.provider_name || 'MoMA')}):null;
  const marketCallInserted = 'EXISTS (SELECT 1 FROM market_calls WHERE usage_id=?)';
  const grantWrite = tenantQuotaEnabled(grant,tenant.internal) && quantity ? [
    db.prepare(`UPDATE model_workspace SET reference_json=json_set(reference_json,?,?),
      application_revision=application_revision+1 WHERE id=1 AND ${marketCallInserted}`)
      .bind('$.grants['+grantIndex+'].used',grant.used+quantity,usage.id),
  ] : [];
  try {
    const [insert]=await db.batch([
      db.prepare(`INSERT INTO market_calls(tenant_id,request_id,request_hash,offer_id,sale_price_id,route_version_id,usage_id,response_json,created_at,history_user_id,history_json)
        SELECT ?,?,?,?,?,?,?,?,?,?,? WHERE ${guard}
        AND NOT EXISTS(SELECT 1 FROM market_charge_receipts WHERE tenant_id=? AND request_id=?)`)
        .bind(tenant.id,body.requestId,requestHash,row.record_id,row.sale_id,row.active_route_id,usage.id,JSON.stringify(response),at,
          history?session.user.id:null,history,row.commit_seq,hash,tenant.id,at,tenant.id,body.requestId),
      db.prepare("INSERT INTO simulation_records(kind,id,payload_json) SELECT 'usage',?,? WHERE EXISTS (SELECT 1 FROM market_calls WHERE usage_id=?)").bind(usage.id,JSON.stringify(usage),usage.id),
      ...grantWrite,
      projectFactWrite(db, projectFact, marketCallInserted, usage.id),
      ...projectChargeWrites(db,projectFact,at),
      db.prepare('UPDATE db_state SET commit_seq=commit_seq+1 WHERE id=1 AND changes()=1'),
    ]);
    if (insert.meta.changes) { await trimMarketActivity(db,at); return response; }
  } catch (error) {
    if (!/UNIQUE constraint/.test(String(error))) throw error;
  }
  const concurrent=await replay();
  if (concurrent) return concurrent;
  replayFact(await readProjectFact(db,tenant.id,body.requestId));
  if(await db.prepare('SELECT 1 FROM market_charge_receipts WHERE tenant_id=? AND request_id=?').bind(tenant.id,body.requestId).first()) {
    fail(409,'CALL_RECEIPT_EXPIRED','此调用已计入月账单，明细已过期');
  }
  fail(409,'REVISION_CONFLICT','服务配置已变化，请重新调用');
}

export async function textConversations(db,session) {
  const {results}=await db.prepare(`SELECT request_id,offer_id,history_json,response_json,created_at FROM market_calls
    WHERE tenant_id=? AND history_user_id=? AND created_at>=? ORDER BY created_at DESC,request_id DESC LIMIT 400`)
    .bind(session.tenant.id,session.user.id,Date.now()-7*86400000).all();
  const conversations=new Map();
  for(const row of results){
    const turn=JSON.parse(row.history_json), response=JSON.parse(row.response_json);
    if(!conversations.has(turn.conversationId)){
      if(conversations.size>=20)continue;
      conversations.set(turn.conversationId,{id:turn.conversationId,serviceId:response.routing?.id || row.offer_id,modelName:turn.modelName,
        deepThinking:turn.deepThinking,temperature:turn.temperature,topP:turn.topP,messages:new Map()});
    }
    const conversation=conversations.get(turn.conversationId);
    const original=conversation.messages.get(turn.messageId);
    if(original){original.at=row.created_at;continue;}
    const denied=response.invocationError;
    conversation.messages.set(turn.messageId,{at:row.created_at,id:turn.messageId,requestId:row.request_id,question:turn.question,modelName:turn.modelName,
      provider:turn.provider,callId:response.model,routing:response.routing,images:turn.images.map(name=>({name})),
      ...(denied?{status:'error',code:response.httpStatus,error:denied.code,message:denied.message,raw:JSON.stringify(denied)}:
        {status:'success',answer:response.experience?.answer,points:response.experience?.points})});
  }
  return {conversations:[...conversations.values()].map(row=>{
    const messages=[...row.messages.values()].sort((a,b)=>a.at-b.at).map(({at:_at,...message})=>message);
    return {...row,messages,title:messages[0]?.question.slice(0,22) || messages[0]?.images[0]?.name || '新对话'};
  })};
}

async function trimMarketActivity(db, now) {
  const expired = `SELECT usage_id FROM market_calls WHERE created_at<?
    UNION SELECT usage_id FROM (SELECT usage_id FROM market_calls ORDER BY created_at DESC, usage_id DESC LIMIT 100 OFFSET 400)`;
  const cutoff=now-7*86400000;
  await db.batch([
    db.prepare(`DELETE FROM simulation_records WHERE kind='usage' AND id IN (${expired})`).bind(cutoff),
    db.prepare(`DELETE FROM market_calls WHERE usage_id IN (${expired})`).bind(cutoff),
    db.prepare('DELETE FROM market_charge_receipts WHERE rowid IN (SELECT rowid FROM market_charge_receipts WHERE period<? LIMIT 100)')
      .bind(billingPeriod(now)),
  ]);
}

export async function marketRanking(db) {
  const {results}=await db.prepare(`SELECT date(c.created_at/1000,'unixepoch','+8 hours') AS day,
    m.id,m.name,m.maker,COUNT(*) AS calls,
    SUM(COALESCE(json_extract(f.payload_json,'$.usage.total_tokens'),0)) AS tokens,
    SUM(json_extract(f.payload_json,'$.status')='passed') AS successes,
    SUM(MAX(0,(julianday(json_extract(f.payload_json,'$.endedAt'))-julianday(json_extract(f.payload_json,'$.startedAt')))*86400000)) AS duration
    FROM market_calls c JOIN offers o ON o.record_id=c.offer_id JOIN services s ON s.id=o.service_id
    JOIN materials m ON m.id=o.material_id JOIN simulation_records f ON f.kind='usage' AND f.id=c.usage_id
    LEFT JOIN json_each((SELECT meta_json FROM model_workspace WHERE id=1),'$.modelData.marketCards') card ON card.key=m.id
    WHERE c.created_at>=? AND json_extract(f.payload_json,'$.publicAtCall')=1
      AND o.retired_at IS NULL AND o.listing_stage='formal' AND o.market_visible=1 AND s.market_visible=1 AND s.deleted_at IS NULL
      AND (card.key IS NULL OR (json_extract(card.value,'$.status')='listed' AND json_extract(card.value,'$.scope.type')='all'
        AND EXISTS(SELECT 1 FROM json_each(card.value,'$.shown') WHERE value=o.record_id)))
    GROUP BY day,m.id ORDER BY day,m.name`).bind(Date.now()-7*86400000).all();
  return {rows:results};
}
