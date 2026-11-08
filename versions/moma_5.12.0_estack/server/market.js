import { salesCustomer, lifecycleAccess, serviceReferences } from '../src/service-access.mjs';
import { domainModel } from '../src/mock/model-fields.js';
import { createMockEngine } from '../src/admin-v2/mock-onboarding-core.js';
import { platformPublicationFingerprint } from '../src/admin-v2/platform-publication-state.js';
import { platformPriceVersions } from '../src/admin-v2/platform-service-client.js';
import { activeSupplyPrice } from '../src/admin-v2/model-management.js';
import { loadModelWorkspace } from './model-repository.js';
import { listedPackages, packageOffer } from './market-packages.js';
import { experienceTasks } from '../src/service-directory.mjs';
import { billingPeriod } from '../src/admin-v2/mock-billing.js';
import samples from '../src/mock/catalogues.json' with { type: 'json' };

const fail = (status, code, message) => { throw Object.assign(new Error(message), { status, code }); };
const digest = async value => Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value))), byte => byte.toString(16).padStart(2, '0')).join('');
const activeStages = ['gray', 'formal'];
const selectOffers = `
  SELECT o.record_id,o.id AS call_id,o.mode,o.listing_stage,o.gray_tenants_json,o.market_visible,
         o.calls_enabled,s.id AS service_id,s.record_json AS service_json,m.id AS material_id,m.record_json AS material_json,
         p.name AS provider_name,COALESCE(json_extract(cm.mapping_json,'$.sourceName'),c.name) AS source_name,
         (o.channel_model_id IS NULL OR (p.enabled=1 AND p.deleted_at IS NULL AND cm.enabled=1 AND cm.removed_at IS NULL
           AND c.deleted_at IS NULL AND COALESCE(json_extract(c.record_json,'$.frozen'),0)=0
           AND json_extract(c.record_json,'$.status') IN ('运行中','需关注'))) AS source_ready,
         price.record_json AS sale_json,price.id AS sale_id,o.active_route_id,o.active_publication_id,
         purchase.id AS order_id,purchase.created_at AS order_created_at,(SELECT commit_seq FROM db_state WHERE id=1) AS commit_seq
    FROM offers o JOIN services s ON s.id=o.service_id JOIN materials m ON m.id=o.material_id
    LEFT JOIN suppliers p ON p.id=o.supplier_id
    LEFT JOIN channel_models cm ON cm.id=o.channel_model_id LEFT JOIN channels c ON c.id=cm.channel_id
    LEFT JOIN price_versions price ON price.id=o.active_sale_price_id
    LEFT JOIN market_orders purchase ON purchase.offer_id=o.record_id AND purchase.tenant_id=? AND purchase.cancelled_at IS NULL
    WHERE o.retired_at IS NULL AND s.deleted_at IS NULL AND o.id<>''`;

function marketOffer(row, tenant, at = Date.now()) {
  const model = domainModel(JSON.parse(row.service_json),true), sale = row.sale_json && JSON.parse(row.sale_json);
  const price = sale && Date.parse(sale.effectiveAt)<=at && (!sale.expiresAt || Date.parse(sale.expiresAt)>at) ? sale : null;
  const accessible=!tenant?.grant || tenant.grant.status==='生效中' && tenant.grant.modelIds?.includes(row.service_id);
  const allowed=Boolean(tenant && accessible && salesCustomer(model,tenant.id));
  const released=accessible && activeStages.includes(row.listing_stage) && !model.archivedAt &&
    (row.listing_stage!=='gray' || allowed && JSON.parse(row.gray_tenants_json).includes(tenant.id));
  return { model, price, released, allowed, ready: Boolean(model.visibility==='公开' && model.callsEnabled && row.calls_enabled && row.source_ready && row.active_route_id && row.active_publication_id && price) };
}

export async function marketCatalogue(db, session) {
  const tenant = session?.tenant || null;
  const { results } = await db.prepare(selectOffers + " AND o.listing_stage IN ('gray','formal') AND o.market_visible=1 AND s.market_visible=1 ORDER BY m.name,p.created_at,p.name,o.created_at,o.record_id").bind(tenant?.id || '').all();
  const services = results.flatMap(row => {
    const offer=marketOffer(row,tenant);
    if (!offer.released || !offer.ready) return [];
    const material=domainModel(JSON.parse(row.material_json));
    return [{
      id:row.record_id, callId:row.call_id, modelId:material.modelId, modelKey:row.material_id, serviceModelId:row.service_id, mode:row.mode, name:material.name,
      provider:row.source_name ? `${row.provider_name}（${row.source_name}）` : row.provider_name || 'MoMA',
      maker:material.profile?.author || material.maker || '', type:material.type, description:material.description || '',
      profile:material.profile || {}, capabilities:material.capabilities || {},
      salePrices:platformPriceVersions(offer.price,offer.model).map(({amount,currency,unit,effectiveAt,expiresAt})=>({amount,currency,unit,effectiveAt,expiresAt})),
      salePriceId:row.sale_id,canOrder:offer.allowed, ordered:Boolean(row.order_id), orderedAt:row.order_created_at, callable:Boolean(tenant && row.order_id), stage:row.listing_stage,
    }];
  });
  const orders=tenant?(await db.prepare(`SELECT purchase.id,purchase.offer_id AS offerId,offer.id AS callId,purchase.created_at AS createdAt,CASE WHEN purchase.cancelled_at IS NOT NULL THEN 'cancelled' WHEN offer.retired_at IS NULL THEN offer.listing_stage ELSE 'withdrawn' END AS stage
    FROM market_orders purchase JOIN offers offer ON offer.record_id=purchase.offer_id WHERE purchase.tenant_id=? ORDER BY purchase.created_at DESC`).bind(tenant.id).all()).results:[];
  const packages=tenant?(await listedPackages(db,tenant)).map(packageOffer).sort((a,b)=>Number(a.displayOrder || 0)-Number(b.displayOrder || 0)):[];
  return { tenant:tenant?{id:tenant.id,name:tenant.name,type:tenant.type}:null,
    account:session?{id:session.user.id,username:session.user.login,name:session.user.nickname || session.user.name}:null,
    spaces:session?.spaces || [],services,orders,packages };
}

async function checkedOffer(db, session, field, value, { ordering = false } = {}) {
  if (!session) fail(401,'TENANT_SESSION_REQUIRED','请先登录模型广场');
  const row=await db.prepare(selectOffers + (field==='recordId'?' AND o.record_id=?':' AND o.id=?')).bind(session.tenant.id,value).first();
  if (!row) fail(404,'MODEL_UNAVAILABLE','模型服务不存在或已下架');
  const offer=marketOffer(row,session.tenant);
  if (!activeStages.includes(row.listing_stage) || !offer.ready) fail(409,'MODEL_UNAVAILABLE','模型服务已下架或暂不可用');
  if (!offer.released || ordering && !offer.allowed) fail(403,'MODEL_FORBIDDEN','当前客户不在此服务的销售或灰度范围内');
  return { row, ...offer };
}

const guard = `(SELECT commit_seq FROM db_state WHERE id=1)=? AND
  EXISTS (SELECT 1 FROM market_sessions WHERE token_hash=? AND tenant_id=? AND expires_at>?)`;

export async function marketOrder(db, session, offerIds, { tenantId, salePriceIds } = {}) {
  if (tenantId && tenantId!==session.tenant.id) fail(409,'TENANT_CHANGED','客户空间已变化，请重新选择');

  if (!['个人用户','企业管理员','租户管理员'].includes(session.tenant.role)) fail(403,'FORBIDDEN','仅客户管理员可以订购服务');
  const offers=await Promise.all(offerIds.map(id=>checkedOffer(db,session,'recordId',id,{ordering:true})));
  const {tenant,hash}=session, seq=offers[0].row.commit_seq;
  if (offers.some(({row})=>row.commit_seq!==seq)) fail(409,'REVISION_CONFLICT','服务配置已变化，请刷新后重新订购');
  const at=Date.now();
  const pending=offers.filter(({row})=>!row.order_id).map(({row})=>({id:crypto.randomUUID(),offerId:row.record_id,priceId:row.sale_id}));
  if (salePriceIds && pending.some(row=>salePriceIds[row.offerId]!==row.priceId)) fail(409,'PRICE_CHANGED','售价已变化，请重新确认');
  if (pending.length) await db.prepare(`INSERT INTO market_orders(id,tenant_id,offer_id,sale_price_id,created_at)
    SELECT json_extract(value,'$.id'),?,json_extract(value,'$.offerId'),json_extract(value,'$.priceId'),?
    FROM json_each(?) WHERE ${guard} ON CONFLICT(tenant_id,offer_id) WHERE cancelled_at IS NULL DO NOTHING`).bind(tenant.id,at,JSON.stringify(pending),seq,hash,tenant.id,at).run();
  const {results}=await db.prepare('SELECT id,offer_id FROM market_orders WHERE tenant_id=? AND cancelled_at IS NULL AND offer_id IN (SELECT value FROM json_each(?))').bind(tenant.id,JSON.stringify(offerIds)).all();
  if (results.length!==offerIds.length) fail(409,'REVISION_CONFLICT','服务配置已变化，请刷新后重新订购');
  return {orders:results.map(row=>({id:row.id,offerId:row.offer_id,ordered:true}))};
}

function experienceOutput({task,imageCount=1,speechMode}) {
  if(task==='image' || task==='video'){
    const asset=task==='image'?'forthBg-982e3d97.png':'secondBg-c502c3d3.png';
    const url='/moma_5.12.0_estack/assets/'+asset;
    return {artifacts:Array.from({length:task==='image'?imageCount:1},()=>({url}))};
  }
  if(task==='voice')return speechMode==='tts'?{speakInput:true}:{answer:samples['ModelExperience.jsx'].response.asr};
  return {answer:'模拟调用已完成。',...(task==='text'?{points:samples['TextExperience.jsx'].response.points}:{})};
}

export async function marketCompletion(db, session, body) {
  if (body.tenantId && body.tenantId!==session.tenant.id) fail(409,'TENANT_CHANGED','客户空间已变化，请重新发送');
  const { row, model }=await checkedOffer(db,session,'callId',body.model);
  const material=domainModel(JSON.parse(row.material_json)), profile=model.profile || material.profile;
  if ((body.task && !experienceTasks({ ...material, profile }).includes(body.task)) || (body.images && !profile?.inputModalities?.includes('图片'))) {
    fail(422,'TASK_UNSUPPORTED','所选模型不支持当前任务');
  }
  const { tenant, hash }=session;
  if (!row.order_id) fail(403,'ORDER_REQUIRED','请先订购此渠道服务');
  const requestHash=await digest(JSON.stringify([session.user.id,body.model,body.task,body.images,body.imageCount,body.speechMode,body.simulateDenied,body.messages[0].content]));
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
    usage.userId=session.user.id;
    usage.publicAtCall=row.listing_stage==='formal' && Boolean(row.market_visible) && model.marketVisible!==false;
    response.choices[0].message.content='模拟调用已完成。';
    response.experience=experienceOutput(body);
    if (body.simulateDenied) {
      Object.assign(usage,{ status:'failed',code:'Model.AccessDenied',usage:null,attempts:[],cost:null,saleTrial:null,billingStatus:'not_billable' });
      Object.assign(response,{ choices:[],usage:null,httpStatus:403,experience:null,
        invocationError:{code:'Model.AccessDenied',message:'当前账号暂无该模型的调用权限，请订购模型或切换其他可用模型。'} });
    }
  } catch {
    fail(409,'CALL_UNAVAILABLE','当前渠道无法完成调用，请检查服务和价格状态');
  }
  const at=Date.now();
  const period=billingPeriod(at), charge=usage.saleTrial;
  const billable=usage.billingStatus==='billable' && charge?.currency==='CNY' && charge.unit==='micro' &&
    Number.isSafeInteger(charge.amount) && charge.amount>=0;
  const chargeWrites=billable ? [
    db.prepare('INSERT INTO market_charge_receipts(tenant_id,request_id,period) SELECT ?,?,? WHERE changes()=1')
      .bind(tenant.id,body.requestId,period),
    db.prepare(`INSERT INTO market_monthly_charges(period,tenant_id,amount_micros) SELECT ?,?,? WHERE changes()=1
      ON CONFLICT(period,tenant_id) DO UPDATE SET amount_micros=amount_micros+excluded.amount_micros`)
      .bind(period,tenant.id,charge.amount),
  ] : [];
  try {
    const [insert]=await db.batch([
      db.prepare(`INSERT INTO market_calls(tenant_id,request_id,request_hash,offer_id,sale_price_id,route_version_id,usage_id,response_json,created_at)
        SELECT ?,?,?,?,?,?,?,?,? WHERE ${guard}
        AND NOT EXISTS(SELECT 1 FROM market_charge_receipts WHERE tenant_id=? AND request_id=?)`)
        .bind(tenant.id,body.requestId,requestHash,row.record_id,row.sale_id,row.active_route_id,usage.id,JSON.stringify(response),at,row.commit_seq,hash,tenant.id,at,tenant.id,body.requestId),
      db.prepare("INSERT INTO simulation_records(kind,id,payload_json) SELECT 'usage',?,? WHERE EXISTS (SELECT 1 FROM market_calls WHERE usage_id=?)").bind(usage.id,JSON.stringify(usage),usage.id),
      ...chargeWrites,
    ]);
    if (insert.meta.changes) { await trimMarketActivity(db,at); return response; }
  } catch (error) {
    if (!/UNIQUE constraint/.test(String(error))) throw error;
  }
  await checkedOffer(db,session,'callId',body.model);
  const concurrent=await replay();
  if (concurrent) return concurrent;
  if(await db.prepare('SELECT 1 FROM market_charge_receipts WHERE tenant_id=? AND request_id=?').bind(tenant.id,body.requestId).first()) {
    fail(409,'CALL_RECEIPT_EXPIRED','此调用已计入月账单，明细已过期');
  }
  fail(409,'REVISION_CONFLICT','服务配置已变化，请重新调用');
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
    WHERE c.created_at>=? AND json_extract(f.payload_json,'$.publicAtCall')=1
      AND o.retired_at IS NULL AND o.listing_stage='formal' AND o.market_visible=1 AND s.market_visible=1 AND s.deleted_at IS NULL
    GROUP BY day,m.id ORDER BY day,m.name`).bind(Date.now()-7*86400000).all();
  return {rows:results};
}
