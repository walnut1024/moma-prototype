import { marketCardVisible } from '../src/market-cards.mjs';
import { servicePurpose } from '../src/admin-v2/service-purpose.js';
import { modelPresentation } from '../src/model-identities.mjs';
import { resourceId } from '../src/resource-id.mjs';
import { activeCustomer, salesCustomer, lifecycleAccess, serviceReferences, serviceCallsEnabled, offerKey } from '../src/service-access.mjs';
import { domainModel } from '../src/mock/model-fields.js';
import { createMockEngine } from '../src/admin-v2/mock-onboarding-core.js';
import { platformPublicationFingerprint } from '../src/admin-v2/platform-publication-state.js';
import { platformPriceVersions } from '../src/admin-v2/platform-service-client.js';
import { activeSupplyPrice } from '../src/admin-v2/model-management.js';
import { MOMA_PROVIDER } from '../src/admin-v2/moma-provider.js';
import { loadModelWorkspace } from './model-repository.js';

const fail = (status, code, message) => { throw Object.assign(new Error(message), { status, code }); };
const digest = async value => Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value))), byte => byte.toString(16).padStart(2, '0')).join('');
const activeStages = ['gray', 'formal'];
export const marketCookie = 'moma5120_market';

export async function marketTenant(db, tenantId) {
  const row = await db.prepare("SELECT customer.value FROM model_workspace w,json_each(w.reference_json,'$.tenants') customer WHERE w.id=1 AND json_extract(customer.value,'$.id')=?").bind(tenantId).first('value');
  const tenant = row && JSON.parse(row);
  return activeCustomer(tenant) ? { id: tenant.id, name: tenant.name } : null;
}

export async function marketSession(db, request) {
  const token = request.headers.get('cookie')?.split(';').map(part => part.trim()).find(part => part.startsWith(marketCookie+'='))?.slice(marketCookie.length+1);
  if (!token || !/^[a-f0-9]{64}$/.test(token)) return null;
  const hash = await digest(token);
  const session = await db.prepare('SELECT tenant_id FROM market_sessions WHERE token_hash=? AND expires_at>?').bind(hash,Date.now()).first();
  const tenant = session && await marketTenant(db,session.tenant_id);
  return tenant ? { tenant, hash } : null;
}

export async function createMarketSession(db, tenant) {
  const token = Array.from(crypto.getRandomValues(new Uint8Array(32)), byte=>byte.toString(16).padStart(2,'0')).join('');
  await db.prepare('INSERT INTO market_sessions(token_hash,tenant_id,expires_at) VALUES(?,?,?)').bind(await digest(token),tenant.id,Date.now()+28800000).run();
  return token;
}

const selectOffers = ({ includeCard = false } = {}) => `
  SELECT o.record_id,o.id AS call_id,o.mode,o.listing_stage,o.gray_tenants_json,o.market_visible,
         o.calls_enabled,
         ${includeCard ? "(SELECT mc.value FROM model_workspace w, json_each(w.meta_json,'$.modelData.marketCards') mc WHERE w.id=1 AND mc.key=m.id) AS market_card," : ''}
         s.id AS service_id,s.record_json AS service_json,m.id AS material_id,m.record_json AS material_json,
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
    LEFT JOIN market_orders purchase ON purchase.offer_id=o.record_id AND purchase.tenant_id=?
    WHERE o.retired_at IS NULL AND s.deleted_at IS NULL AND o.id<>''`;

function marketOffer(row, tenant, at = Date.now()) {
  const model = domainModel(JSON.parse(row.service_json),true), sale = row.sale_json && JSON.parse(row.sale_json);
  const price = sale && Date.parse(sale.effectiveAt)<=at && (!sale.expiresAt || Date.parse(sale.expiresAt)>at) ? sale : null;
  const route = row.route_json && JSON.parse(row.route_json);
  const supplyIds = (route?.channels || []).filter(channel => channel.enabled !== false &&
    (!['weighted','priority_weighted'].includes(route.strategy) || channel.weight > 0)).map(channel => channel.supplyId);
  const allowed = Boolean(tenant && salesCustomer(model,tenant.id));
  const released = activeStages.includes(row.listing_stage) && !model.archivedAt &&
    (row.listing_stage!=='gray' || allowed && JSON.parse(row.gray_tenants_json).includes(tenant.id));
  return { model, price, supplyIds, released, allowed, ready: Boolean(model.visibility==='公开' && model.callsEnabled && row.calls_enabled && row.source_ready && supplyIds.length && row.active_publication_id && price) };
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

export async function marketCatalogue(db, session) {
  const tenant = session?.tenant || null;
  const { results } = await db.prepare(selectOffers({ includeCard: true }) + " AND (market_card IS NOT NULL OR (o.listing_stage IN ('gray','formal') AND o.market_visible=1 AND s.market_visible=1)) ORDER BY m.name,p.created_at,p.name,o.created_at,o.record_id").bind(tenant?.id || '').all();
  const offers = results.flatMap(row => {
    const card = row.market_card && JSON.parse(row.market_card);
    const offer = marketOffer(row, tenant);
    if (!card) return offer.released && offer.ready ? [{ row, ...offer }] : [];
    const providerKey = offerKey(offer.model.serviceProviders?.find(entry => entry.callId === row.call_id));
    if (!marketCardVisible(card, row.record_id, tenant?.id) || !serviceCallsEnabled(offer.model) ||
      !row.calls_enabled || !row.source_ready || servicePurpose(offer.model, providerKey) === 'internal' ||
      (row.listing_stage === 'gray' && !offer.released)) return [];
    return [{ row, ...offer, card }];
  });
  const procurement = await loadMarketProcurement(db,offers.filter(offer => offer.released && offer.ready)), at = Date.now();
  const services = offers.flatMap(offer => {
    const { row, card } = offer;
    const prices = offer.released && offer.ready ? marketSalePrices(offer,procurement,at) : null;
    if (!card && !prices) return [];
    const material = modelPresentation(null, { ...domainModel(JSON.parse(row.material_json)),
      marketContent: card?.content || JSON.parse(row.service_json).marketContent });
    return [{
      id:row.record_id, model_service_id:row.record_id, model_id:row.material_id, canonical_slug:material.modelId, call_id:row.call_id, provider_id:row.provider_id || MOMA_PROVIDER.id, callId:row.call_id, modelId:material.modelId, modelKey:row.material_id, mode:row.mode, name:material.name,
      providerId:row.provider_id || MOMA_PROVIDER.id, provider:row.provider_name || MOMA_PROVIDER.name, channelName:row.source_name,
      maker:material.profile?.author || material.maker || '', type:material.type, description:material.description || '',
      profile:material.profile || {}, capabilities:material.capabilities || {},
      salePrices:(prices || []).map(({amount,currency,unit,effectiveAt,expiresAt})=>({amount,currency,unit,effectiveAt,expiresAt})),
      canOrder:Boolean(prices && offer.allowed), ordered:Boolean(row.order_id), orderedAt:row.order_created_at, callable:Boolean(prices && tenant && row.order_id), stage:row.listing_stage,
    }];
  });
  const orders=tenant?(await db.prepare(`SELECT purchase.id,purchase.offer_id AS offerId,offer.id AS callId,purchase.created_at AS createdAt,CASE WHEN offer.retired_at IS NULL THEN offer.listing_stage ELSE 'withdrawn' END AS stage
    FROM market_orders purchase JOIN offers offer ON offer.record_id=purchase.offer_id WHERE purchase.tenant_id=? ORDER BY purchase.created_at DESC`).bind(tenant.id).all()).results:[];
  return { tenant, services, orders };
}

async function checkedOffer(db, session, field, value, { ordering = false } = {}) {
  if (!session) fail(401,'TENANT_SESSION_REQUIRED','请先登录模型广场');
  const row=await db.prepare(selectOffers() + (field==='recordId'?' AND o.record_id=?':' AND o.id=?')).bind(session.tenant.id,value).first();
  if (!row) fail(404,'MODEL_UNAVAILABLE','模型服务不存在或已下架');
  const offer=marketOffer(row,session.tenant);
  if (!ordering && (!serviceCallsEnabled(offer.model) || !row.calls_enabled)) {
    fail(409, 'MODEL_UNAVAILABLE', '模型服务已停止');
  }
  if (!activeStages.includes(row.listing_stage) || !offer.ready) fail(409,'MODEL_UNAVAILABLE','模型服务已下架或暂不可用');
  if (!offer.released || ordering && !offer.allowed) fail(403,'MODEL_FORBIDDEN','当前客户不在此服务的销售或灰度范围内');
  return { row, ...offer };
}

const guard = `(SELECT commit_seq FROM db_state WHERE id=1)=? AND
  EXISTS (SELECT 1 FROM market_sessions WHERE token_hash=? AND tenant_id=? AND expires_at>?)`;

export async function marketOrder(db, session, offerIds) {
  const offers=await Promise.all(offerIds.map(id=>checkedOffer(db,session,'recordId',id,{ordering:true})));
  const {tenant,hash}=session, seq=offers[0].row.commit_seq;
  if (offers.some(({row})=>row.commit_seq!==seq)) fail(409,'REVISION_CONFLICT','服务配置已变化，请刷新后重新订购');
  const procurement=await loadMarketProcurement(db,offers);
  const at=Date.now();
  if (offers.some(offer=>!marketSalePrices(offer,procurement,at))) fail(409,'MODEL_UNAVAILABLE','模型服务暂不可订购');
  const pending=offers.filter(({row})=>!row.order_id).map(({row})=>({id:resourceId('order'),offerId:row.record_id,priceId:row.sale_id}));
  if (pending.length) await db.prepare(`INSERT INTO market_orders(id,tenant_id,offer_id,sale_price_id,created_at)
    SELECT json_extract(value,'$.id'),?,json_extract(value,'$.offerId'),json_extract(value,'$.priceId'),?
    FROM json_each(?) WHERE ${guard} ON CONFLICT(tenant_id,offer_id) DO NOTHING`).bind(tenant.id,at,JSON.stringify(pending),seq,hash,tenant.id,at).run();
  const {results}=await db.prepare('SELECT id,offer_id FROM market_orders WHERE tenant_id=? AND offer_id IN (SELECT value FROM json_each(?))').bind(tenant.id,JSON.stringify(offerIds)).all();
  if (results.length!==offerIds.length) fail(409,'REVISION_CONFLICT','服务配置已变化，请刷新后重新订购');
  return {orders:results.map(row=>({id:row.id,offerId:row.offer_id,ordered:true}))};
}

export async function marketCompletion(db, session, body) {
  const { row }=await checkedOffer(db,session,'callId',body.model);
  const { tenant, hash }=session;
  if (!row.order_id) fail(403,'ORDER_REQUIRED','请先订购此渠道服务');
  const requestHash=await digest(JSON.stringify([body.model,body.messages[0].content]));
  const replay=async()=>{
    const receipt=await db.prepare('SELECT request_hash,response_json FROM market_calls WHERE tenant_id=? AND request_id=?').bind(tenant.id,body.requestId).first();
    if (!receipt) return null;
    if (receipt.request_hash!==requestHash) fail(409,'REQUEST_ID_CONFLICT','调用标识已用于其他请求');
    return JSON.parse(receipt.response_json);
  };
  const existing=await replay();
  if (existing) return existing;
  const state=await loadModelWorkspace(db,{id:tenant.id,role:'客户'},{command:true});
  if (state.commitSeq!==row.commit_seq) fail(409,'REVISION_CONFLICT','服务配置已变化，请重新调用');
  const service=serviceReferences(state).find(item=>item.modelId===row.service_id && item.callId===body.model);
  const access=lifecycleAccess(state,service,tenant.id);
  if (!access.allowed) fail(403,access.code,access.reason);
  const proof=service.model.platformPublications?.find(item=>item.serviceId===service.id && item.source==='mock');
  if (!proof || proof.fingerprint!==platformPublicationFingerprint(state,service.model,service.id)) fail(409,'PUBLICATION_REQUIRED','当前渠道配置需要重新验证');
  const sale=state.modelSalePrices.find(item=>item.id===row.sale_id);
  const engine=createMockEngine({initialState:state.cloudMockState,localState:state});
  let response, usage;
  try {
    const snapshot=state.cloudMockState.services.find(item=>item.id===proof.mockServiceId && item.published?.version===proof.publishedVersion);
    if (!snapshot) throw Error('缺少当前服务的发布快照');
    const config={
      ...snapshot.published.config,
      salePrices:platformPriceVersions(sale,service.model),
      bindings:snapshot.published.config.bindings.map(binding=>({...binding,procurementPrices:platformPriceVersions(activeSupplyPrice(state,binding.id),service.model,'采购价格')})),
    };
    ({ response, usage }=engine.callForOrder(snapshot,config,{tenantId:tenant.id,orderId:row.order_id,messages:body.messages}));
    response.choices[0].message.content='模拟调用已完成。';
  } catch {
    fail(409,'CALL_UNAVAILABLE','当前渠道无法完成调用，请检查服务和价格状态');
  }
  Object.assign(usage,{platform_request_id:body.requestId,model_id:row.material_id,model_service_id:row.record_id,route_version_id:row.active_route_id,sale_price_id:row.sale_id});
  const at=Date.now();
  try {
    const [insert]=await db.batch([
      db.prepare(`INSERT INTO market_calls(tenant_id,request_id,request_hash,offer_id,sale_price_id,route_version_id,usage_id,response_json,created_at)
        SELECT ?,?,?,?,?,?,?,?,? WHERE ${guard}`).bind(tenant.id,body.requestId,requestHash,row.record_id,row.sale_id,row.active_route_id,usage.id,JSON.stringify(response),at,row.commit_seq,hash,tenant.id,at),
      db.prepare("INSERT INTO simulation_records(kind,id,payload_json) SELECT 'usage',?,? WHERE EXISTS (SELECT 1 FROM market_calls WHERE usage_id=?)").bind(usage.id,JSON.stringify(usage),usage.id),
    ]);
    if (insert.meta.changes) return response;
  } catch (error) {
    if (!/UNIQUE constraint/.test(String(error))) throw error;
  }
  await checkedOffer(db,session,'callId',body.model);
  const concurrent=await replay();
  if (concurrent) return concurrent;
  fail(409,'REVISION_CONFLICT','服务配置已变化，请重新调用');
}
