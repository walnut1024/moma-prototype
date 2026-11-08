import {modelBootstrap,modelCommand,packageBootstrap,packageCommand,packageFactorHistory,readTrafficLimits,simulationRequest,updateTrafficLimits} from './model-commands.js';
import { initializePrototypeCatalogue } from './prototype-presets.js';
import { createMarketSession, marketCatalogue, marketRanking, marketCompletion, marketCookie, marketOrder, marketSession, marketTenant } from './market.js';
import { applicationBootstrap, applicationCommand, initializeApplication, tenantCommand, tenantWorkspace } from './application.js';
import { marketDemoModelIds } from '../src/mock/model-data.js';
const PREFIX = '/api/5120';
const COOKIE = 'moma5120_session';
const encoder = new TextEncoder();
const MAX_BODY = 256 * 1024;
const WRITE_ROLES = ['平台管理员', '运营人员'];

class ApiError extends Error {
  constructor(status, code, message) { super(message); this.status = status; this.code = code; }
}
const fail = (status, code, message) => { throw new ApiError(status, code, message); };
const digest = async value => Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', encoder.encode(value))), b => b.toString(16).padStart(2, '0')).join('');
const randomToken = () => Array.from(crypto.getRandomValues(new Uint8Array(32)), b => b.toString(16).padStart(2, '0')).join('');
const json = (value, status = 200, headers = {}) => Response.json(value, { status, headers: { 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff', ...headers } });
const cookie = (token, age = 28800) => `${COOKIE}=${token}; HttpOnly; Secure; SameSite=Lax; Path=${PREFIX}; Max-Age=${age}`;
const fields = (body, allowed) => {
  if (!body || typeof body !== 'object' || Array.isArray(body) || Object.keys(body).some(key => !allowed.includes(key))) fail(400, 'INVALID_INPUT', '请求字段无效');
};
const identifier = value => typeof value === 'string' && /^[A-Za-z0-9:_.-]{1,200}$/.test(value);
const decode = row => row ? Object.fromEntries(Object.entries(row).map(([key, value]) => [key.endsWith('_json') ? key.slice(0, -5) : key, key.endsWith('_json') ? JSON.parse(value) : value])) : null;
const material = row => row && ({ ...JSON.parse(row.metadata_json), record_id:row.id,canonical_slug:row.canonical_slug,name:row.name,type:row.model_type,maker:row.maker,description:row.description,revision:row.revision,created:Math.floor(row.created_at/1000),updated_at:row.updated_at });
const service = row => row && ({ id: row.id, templateId: row.material_id, modelId: row.code, name: row.name, type: row.model_type,
  serviceMode: row.mode, serviceModeRevision: row.mode_epoch, listingStatus: { unlisted: '未上架', listed: '已上架', withdrawn: '已下架' }[row.listing_status],
  callsEnabled: Boolean(row.calls_enabled), marketVisible: Boolean(row.market_visible), scope: JSON.parse(row.scope_json), revision: row.revision, updatedAt: row.updated_at });

async function bodyJson(request,maxBody=MAX_BODY) {
  if (request.headers.get('content-type')?.split(';')[0] !== 'application/json') fail(400, 'INVALID_INPUT', '请求须使用 JSON');
  const reader = request.body?.getReader();
  if (!reader) fail(400, 'INVALID_INPUT', '请求内容缺失');
  let length = 0;
  const chunks = [];
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    length += value.byteLength;
    if (length > maxBody) { await reader.cancel(); fail(413, 'SCOPE_TOO_LARGE', '请求内容过大'); }
    chunks.push(value);
  }
  const bytes = new Uint8Array(length);
  let offset = 0;
  for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.byteLength; }
  try { return JSON.parse(new TextDecoder().decode(bytes)); } catch { fail(400, 'INVALID_INPUT', 'JSON 格式无效'); }
}

async function secureEqual(a, b) {
  const key = await crypto.subtle.importKey('raw', crypto.getRandomValues(new Uint8Array(32)), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign','verify']);
  const signature = await crypto.subtle.sign('HMAC', key, encoder.encode(b));
  return crypto.subtle.verify('HMAC', key, signature, encoder.encode(a));
}

async function authenticate(request, db) {
  const token = request.headers.get('cookie')?.split(';').map(part => part.trim()).find(part => part.startsWith(COOKIE + '='))?.slice(COOKIE.length + 1);
  if (!token || !/^[a-f0-9]{64}$/.test(token)) fail(401, 'SESSION_EXPIRED', '请先登录后台测试账号');
  const row = await db.prepare(`SELECT a.id,a.name,a.role,s.id AS session_id FROM admin_sessions s
    JOIN admin_accounts a ON a.id=s.actor_id WHERE s.token_hash=? AND s.expires_at>? AND s.revoked_at IS NULL AND a.enabled=1`).bind(await digest(token), Date.now()).first();
  if (!row) fail(401, 'SESSION_EXPIRED', '会话已失效，请重新登录');
  return row;
}

function pagination(url) {
  const raw = url.searchParams.get('limit') || '20';
  if (!/^\d{1,3}$/.test(raw) || Number(raw) < 1 || Number(raw) > 100) fail(400, 'INVALID_INPUT', '分页大小须为 1—100');
  const after = url.searchParams.get('after') || '';
  if (after && !identifier(after)) fail(400, 'INVALID_INPUT', '分页游标无效');
  const q = (url.searchParams.get('q') || '').trim(), pattern = '%' + q.replace(/[\\%_]/g, '\\$&') + '%';
  if (encoder.encode(pattern).byteLength > 50) fail(400, 'INVALID_INPUT', '搜索内容过长');
  return { limit: Number(raw), after, q, pattern };
}
function page(rows, limit, map = decode) { return { items: rows.slice(0, limit).map(map), nextCursor: rows.length > limit ? rows[limit - 1].id : null }; }
async function trafficHistory(db, actor, url) {
  const { limit, after } = pagination(url);
  const { results } = await db.prepare(`SELECT e.id,e.entity_id,e.action,e.record_json,e.created_at,o.actor_id,a.name AS actor_name
    FROM audit_events e JOIN operations o ON o.id=e.operation_id LEFT JOIN admin_accounts a ON a.id=o.actor_id
    WHERE e.entity_type='traffic-limits' AND COALESCE(json_array_length(e.record_json,'$.trafficChanges'),1)>0
      AND (?='' OR (e.created_at,e.id) < (SELECT created_at,id FROM audit_events
        WHERE id=? AND entity_type='traffic-limits'))
    ORDER BY e.created_at DESC,e.id DESC LIMIT ?`).bind(after, after, limit + 1).all();
  const history = page(results, limit, row => {
    const { before, after, actorName, trafficChanges } = JSON.parse(row.record_json);
    const changes = trafficChanges ?? [{ scope: 'user-default', objectId: row.entity_id, action: row.action, before, after }];
    return changes.map((change, index) => ({ ...change, id: index ? row.id + ':' + index : row.id,
      actorId: row.actor_id, actorName: actorName || row.actor_name, createdAt: new Date(row.created_at).toISOString() }));
  });
  return { accountId: actor.id, items: history.items.flat(), nextCursor: history.nextCursor };
}

async function list(db, url, kind) {
  const p = pagination(url);
  const queries = {
    materials: `SELECT * FROM materials WHERE deleted_at IS NULL AND id>? AND (name LIKE ? ESCAPE '\\' OR canonical_slug=?) ORDER BY id LIMIT ?`,
    suppliers: `SELECT id,code,name,profile_json,builtin,enabled,revision,updated_at FROM suppliers WHERE deleted_at IS NULL AND id>? AND (name LIKE ? ESCAPE '\\' OR code=?) ORDER BY id LIMIT ?`,
    services: `SELECT s.*,m.name,m.model_type FROM services s JOIN materials m ON m.id=s.material_id WHERE s.deleted_at IS NULL AND s.id>? AND (m.name LIKE ? ESCAPE '\\' OR s.code=?) ORDER BY s.id LIMIT ?`,
  };
  const result = await db.prepare(queries[kind]).bind(p.after, p.pattern, p.q, p.limit + 1).all();
  return page(result.results, p.limit, kind === 'materials' ? material : kind === 'services' ? service : decode);
}

async function workspace(db, id) {
  const result = await db.batch([
    db.prepare('SELECT s.*,m.name,m.model_type FROM services s JOIN materials m ON m.id=s.material_id WHERE s.id=? AND s.deleted_at IS NULL').bind(id),
    db.prepare('SELECT m.* FROM materials m JOIN services s ON s.material_id=m.id WHERE s.id=?').bind(id),
    db.prepare('SELECT record_id,id,service_id,material_id,mode_epoch,mode,supplier_id,market_visible,calls_enabled,active_sale_price_id,active_route_id,active_publication_id,revision FROM offers WHERE service_id=? AND retired_at IS NULL').bind(id),
    db.prepare(`SELECT cm.*,c.name AS channel_name,p.name AS supplier_name FROM channel_models cm JOIN channels c ON c.id=cm.channel_id
      JOIN suppliers p ON p.id=cm.supplier_id JOIN services s ON s.material_id=cm.material_id WHERE s.id=? AND cm.removed_at IS NULL ORDER BY cm.id LIMIT 101`).bind(id),
  ]);
  if (!result[0].results.length) fail(404, 'NOT_FOUND', '模型服务不存在');
  return { service: service(result[0].results[0]), material: material(result[1].results[0]), offers: result[2].results.map(decode),
    channelModels: result[3].results.slice(0, 100).map(decode), hasMoreChannels: result[3].results.length > 100 };
}

async function visibility(request, db, actor, id) {
  if (!WRITE_ROLES.includes(actor.role)) fail(403, 'FORBIDDEN', '当前账号无模型运营修改权限');
  const body = await bodyJson(request);
  fields(body, ['operationId','expectedRevision','visible']);
  const key = request.headers.get('idempotency-key');
  if (!identifier(body.operationId) || !identifier(key) || !Number.isSafeInteger(body.expectedRevision) || body.expectedRevision < 1 || typeof body.visible !== 'boolean') fail(400, 'INVALID_INPUT', '操作 ID、修订号或可见状态无效');
  const requestHash = await digest(JSON.stringify([id, body.operationId, body.expectedRevision, body.visible]));
  const replay = await db.prepare('SELECT id,request_hash,response_json FROM operations WHERE actor_id=? AND idempotency_key=?').bind(actor.id, key).first();
  if (replay) {
    if (replay.request_hash !== requestHash || replay.id !== body.operationId) fail(409, 'IDEMPOTENCY_CONFLICT', '同一操作标识不能用于不同请求');
    return json(JSON.parse(replay.response_json));
  }
  const read = await db.batch([db.prepare('SELECT commit_seq FROM db_state WHERE id=1'), db.prepare('SELECT * FROM services WHERE id=? AND deleted_at IS NULL').bind(id)]);
  const seq = read[0].results[0].commit_seq, before = read[1].results[0];
  if (!before) fail(404, 'NOT_FOUND', '模型服务不存在');
  if (before.revision !== body.expectedRevision) fail(409, 'REVISION_CONFLICT', '模型服务已变化，请重新核对；当前输入保留');
  const at = Date.now(), auditId = crypto.randomUUID();
  const response = { operationId: body.operationId, serviceId: id, revision: before.revision + 1, commitSeq: seq + 1, marketVisible: body.visible, effectiveAt: at, invalidate: [`services:${id}`, 'services'] };
  try {
    await db.batch([
      db.prepare('INSERT INTO operations(id,actor_id,session_id,idempotency_key,command,request_hash,expected_commit_seq,http_status,response_json,created_at) VALUES(?,?,?,?,?,?,?,?,?,?)')
        .bind(body.operationId, actor.id, actor.session_id, key, 'service.visibility', requestHash, seq, 200, JSON.stringify(response), at),
      db.prepare("UPDATE services SET market_visible=?,revision=revision+1,updated_at=?,record_json=json_set(record_json,'$.marketVisible',json(?),'$.revision',revision+1,'$.updatedAt',?) WHERE id=?").bind(Number(body.visible), at, JSON.stringify(body.visible),new Date(at).toISOString(), id),
      db.prepare('INSERT INTO audit_events(id,operation_id,entity_type,entity_id,action,diff_json,created_at) VALUES(?,?,?,?,?,?,?)')
        .bind(auditId, body.operationId, 'service', id, body.visible ? '用户可见' : '用户不可见', JSON.stringify({ marketVisible: { before: Boolean(before.market_visible), after: body.visible } }), at),
      db.prepare('UPDATE model_workspace SET revision=revision+1 WHERE id=1'),
      db.prepare('INSERT INTO audit_models(audit_id,material_id,created_at) VALUES(?,?,?)').bind(auditId, before.material_id, at),
    ]);
  } catch (error) {
    if (String(error).includes('session_invalid')) fail(401, 'SESSION_EXPIRED', '会话已失效');
    if (/commit_conflict|UNIQUE constraint/.test(String(error))) {
      const committed = await db.prepare('SELECT id,request_hash,response_json FROM operations WHERE actor_id=? AND idempotency_key=?').bind(actor.id, key).first();
      if (committed) {
        if (committed.request_hash !== requestHash || committed.id !== body.operationId) fail(409, 'IDEMPOTENCY_CONFLICT', '同一操作标识不能用于不同请求');
        return json(JSON.parse(committed.response_json));
      }
      fail(409, 'REVISION_CONFLICT', '数据已有并发提交，请核对原操作结果');
    }
    throw error;
  }
  return json(response);
}

async function route(request, env) {
  const url = new URL(request.url), method = request.method;
  let path;
  try { path = decodeURIComponent(url.pathname.slice(PREFIX.length)); } catch { fail(400, 'INVALID_INPUT', '路径编码无效'); }
  const resource = /^\/(materials|services|suppliers|channels|operations)\/([A-Za-z0-9:_.-]{1,200})(?:\/(workspace|visibility|history))?$/.exec(path);
  const dictionary = /^\/dictionary\/(items|units|currencies)$/.exec(path);
  const packagePath = ['/package-management', '/package-management/commands', '/package-management/factor-history'].includes(path);
  const trafficPath = path === '/traffic-limits';
  const trafficHistoryPath = path === '/traffic-limits/history';
  const marketPaths = ['/market/catalogue','/market/ranking','/market/login','/market/logout','/market/orders','/market/completions','/market/workspace','/market/commands'];
  const applicationPaths = ['/application','/application/open','/application/commands'];
  const known = marketPaths.includes(path) || applicationPaths.includes(path) || trafficPath || trafficHistoryPath || packagePath || ['/auth/login','/auth/logout','/auth/me','/materials','/services','/suppliers','/health','/model-market/visibility','/model-operations','/model-operations/commands'].includes(path) || path.startsWith('/simulation/') || resource || dictionary;
  if (!known) fail(404, 'NOT_FOUND', 'API 不存在');
  if (!env.MODEL_OPS_DB) fail(503, 'DATABASE_UNAVAILABLE', '模型运营数据库尚未绑定');
  const db = env.MODEL_OPS_DB;
  if (!['GET','POST','PATCH','DELETE'].includes(method)) fail(405, 'METHOD_NOT_ALLOWED', '请求方法不支持');
  if (method !== 'GET') {
    if (request.headers.get('origin') !== url.origin || request.headers.get('x-moma-request') !== '1') fail(403, 'FORBIDDEN', '请求来源无效');
  }
  if (path === '/auth/login' && method === 'POST') {
    const body = await bodyJson(request); fields(body, ['accountId','accessCode']);
    if (typeof body.accountId!=='string' || !body.accountId.trim() || body.accountId.length>254 || typeof body.accessCode!=='string' || body.accessCode.length<8 || body.accessCode.length>128) fail(401,'INVALID_LOGIN','账号或密码无效');
    let hashes;
    try { hashes = JSON.parse(env.MODEL_OPS_LOGIN_HASHES || '{}'); } catch { fail(503, 'LOGIN_UNAVAILABLE', '测试账号登录尚未配置'); }
    const login=body.accountId.trim().toLowerCase();
    const saved=await db.prepare('SELECT id,name,role,access_hash FROM admin_accounts WHERE (id=? OR login_name=?) AND enabled=1').bind(login,login).first();
    const expected=saved?.access_hash || hashes[saved?.id];
    const valid=await secureEqual(await digest(body.accessCode),typeof expected==='string'?expected:'0'.repeat(64));
    if(!valid || !expected || !saved)fail(401,'INVALID_LOGIN','账号或密码无效');
    const {access_hash:_hash,...account}=saved;
    const token=randomToken(),at=Date.now(),sessionId=crypto.randomUUID();
    await db.batch([
      db.prepare('DELETE FROM admin_sessions WHERE id IN (SELECT id FROM admin_sessions WHERE expires_at<=? LIMIT 100)').bind(at),
      db.prepare('INSERT INTO admin_sessions(id,token_hash,actor_id,created_at,expires_at) VALUES(?,?,?,?,?)').bind(sessionId,await digest(token),account.id,at,at+28800000),
    ]);
    if(account.id==='yyg' && account.role==='平台管理员') {
      await initializePrototypeCatalogue(db,{...account,session_id:sessionId});
      await initializeApplication(db);
    }
    return json({ account, expiresAt: at + 28800000 }, 200, { 'Set-Cookie': cookie(token) });
  }
  if (path === '/health' && method === 'GET') {
    const state = await db.prepare('SELECT schema_version FROM db_state WHERE id=1').first();
    return json({ status: 'ok', version: '5.12.0', schemaVersion: state.schema_version });
  }
  if (path === '/model-market/visibility') {
    if (method !== 'GET') fail(405, 'METHOD_NOT_ALLOWED', '模型广场展示仅可读取');
    // shortcut: expose display flags only for models already shipped in the browser demo until tenant catalogue data moves to D1.
    const { results } = await db.prepare(`SELECT id, market_visible, deleted_at FROM services
      WHERE id IN (SELECT value FROM json_each(?))`).bind(JSON.stringify(marketDemoModelIds())).all();
    return json({ visibility: Object.fromEntries(results.map(row => [row.id, row.deleted_at == null && Boolean(row.market_visible)])) });
  }
  if (marketPaths.includes(path)) {
    if(path==='/market/ranking' && method==='GET')return json(await marketRanking(db));
    if (path === '/market/catalogue' && method === 'GET') return json(await marketCatalogue(db,await marketSession(db,request)));
    if (path === '/market/workspace' && method === 'GET') {
      const session = await marketSession(db,request);
      if (!session) fail(401,'TENANT_SESSION_REQUIRED','请先登录客户账号');
      return json(await tenantWorkspace(db,session));
    }
    if (method !== 'POST' || ['/market/catalogue','/market/workspace','/market/ranking'].includes(path)) fail(405,'METHOD_NOT_ALLOWED','请求方法不支持');
    if (path === '/market/login') {
      const body=await bodyJson(request,4096);
      fields(body,['tenantId','accessCode']);
      if (!identifier(body.tenantId) || typeof body.accessCode!=='string' || body.accessCode.length<8 || body.accessCode.length>128) fail(401,'INVALID_LOGIN','客户编号或密码无效');
      let hashes;
      try { hashes=JSON.parse(env.MODEL_OPS_LOGIN_HASHES || '{}'); } catch { fail(503,'LOGIN_UNAVAILABLE','客户登录尚未配置'); }
      const expected=hashes[body.tenantId];
      const valid=await secureEqual(await digest(body.accessCode),typeof expected==='string'?expected:'0'.repeat(64));
      if (valid && expected) await initializeApplication(db,body.tenantId);
      const tenant=valid && expected && await marketTenant(db,body.tenantId);
      if (!tenant) fail(401,'INVALID_LOGIN','客户编号或密码无效');
      const token=await createMarketSession(db,tenant);
      return json({tenant:{id:tenant.id,name:tenant.name,type:tenant.type}},200,{'Set-Cookie':cookie(token).replace(COOKIE+'=',marketCookie+'=')});
    }
    const session=await marketSession(db,request);
    if (path==='/market/logout') {
      if (session) await db.prepare('DELETE FROM market_sessions WHERE token_hash=?').bind(session.hash).run();
      return json({loggedOut:true},200,{'Set-Cookie':cookie('',0).replace(COOKIE+'=',marketCookie+'=')});
    }
    if (!session) fail(401,'TENANT_SESSION_REQUIRED','请先登录模型广场');
    if (path === '/market/commands') {
      const body = await bodyJson(request);
      fields(body,['operationId','tenantId','expectedRevision','action','data']);
      return json(await tenantCommand(db,session,body));
    }
    const body=await bodyJson(request,8192);
    if (path==='/market/orders') {
      fields(body,['offerIds','tenantId','salePriceIds']);
      if (!Array.isArray(body.offerIds) || !body.offerIds.length || body.offerIds.length>20 || new Set(body.offerIds).size!==body.offerIds.length || body.offerIds.some(id=>typeof id!=='string' || !/^[A-Za-z0-9:_.-]{1,512}$/.test(id))) fail(400,'INVALID_INPUT','请选择 1–20 项不同的渠道服务');
      if ((body.tenantId!==undefined && !identifier(body.tenantId)) || (body.salePriceIds!==undefined &&
          (!body.salePriceIds || Array.isArray(body.salePriceIds) || Object.keys(body.salePriceIds).length!==body.offerIds.length || body.offerIds.some(id=>!Object.hasOwn(body.salePriceIds,id) || !identifier(body.salePriceIds[id]))))) fail(400,'INVALID_INPUT','订单售价或客户无效');
      return json(await marketOrder(db,session,body.offerIds,body));
    }
    fields(body,['requestId','model','messages','tenantId','task','images','simulateDenied']);
    if ((body.tenantId!==undefined && !identifier(body.tenantId)) ||
        (body.task!==undefined && !['text','image','video','voice'].includes(body.task)) ||
        ['images','simulateDenied'].some(field=>body[field]!==undefined && typeof body[field]!=='boolean')) fail(400,'INVALID_INPUT','体验参数无效');
    if (!identifier(body.requestId) || typeof body.model!=='string' || !/^[A-Za-z0-9][A-Za-z0-9._/-]{0,199}$/.test(body.model) ||
        !Array.isArray(body.messages) || body.messages.length!==1 || body.messages[0]?.role!=='user' ||
        typeof body.messages[0].content!=='string' || !body.messages[0].content.trim() || body.messages[0].content.length>2000 ||
        Object.keys(body.messages[0]).some(key=>!['role','content'].includes(key))) fail(400,'INVALID_INPUT','请填写当前调用标识和 1–2000 字的消息');
    return json(await marketCompletion(db,session,body));
  }
  const actor = await authenticate(request, db);
  if (path === '/auth/me' && method === 'GET') return json({ account: { id: actor.id, name: actor.name, role: actor.role } });
  if (path === '/auth/logout' && method === 'POST') {
    await db.prepare('UPDATE admin_sessions SET revoked_at=? WHERE id=?').bind(Date.now(), actor.session_id).run();
    return json({ loggedOut: true }, 200, { 'Set-Cookie': cookie('', 0) });
  }
  if (applicationPaths.includes(path)) {
    if (!['平台管理员','运营人员','运维人员'].includes(actor.role)) fail(403,'FORBIDDEN','当前账号无业务工作区权限');
    if (path === '/application' && method === 'GET') return json(await applicationBootstrap(db,actor));
    if (path === '/application/open' && method === 'POST') {
      await initializeApplication(db);
      return json(await applicationBootstrap(db,actor));
    }
    if (path === '/application/commands' && method === 'POST') {
      const body = await bodyJson(request);
      fields(body,['operationId','expectedRevision','action']);
      const configured = Object.keys(JSON.parse(env.MODEL_OPS_LOGIN_HASHES || '{}'));
      return json(await applicationCommand(db,actor,body,request.headers.get('idempotency-key'),configured));
    }
    fail(405,'METHOD_NOT_ALLOWED','请求方法不支持');
  }
  if (resource?.[1]==='operations' && !resource[3] && method==='GET') {
      const row = await db.prepare('SELECT id,response_json FROM operations WHERE id=? AND actor_id=?').bind(resource[2], actor.id).first();
      if (!row) fail(404, 'NOT_FOUND', '未查到已提交操作，请使用原标识核对或重试');
      return json(JSON.parse(row.response_json));
    }
  const pageId = trafficPath || trafficHistoryPath ? 'traffic-limits' : packagePath ? 'package-production' : dictionary ? 'tariff-dictionary' : path.startsWith('/materials') ? 'model-templates'
    : path.startsWith('/suppliers') || path.startsWith('/channels') ? 'providers' : 'listing';
  if (!canAccessPage(actor.role, pageId)) fail(403, 'FORBIDDEN', '当前账号无此页面访问权限');
  if (trafficHistoryPath) {
    if (method !== 'GET') fail(405, 'METHOD_NOT_ALLOWED', '请求方法不支持');
    return json(await trafficHistory(db, actor, url));
  }
  if (trafficPath) {
    if (method === 'GET') return json(await readTrafficLimits(db, actor));
    if (method !== 'POST') fail(405, 'METHOD_NOT_ALLOWED', '请求方法不支持');
    const body = await bodyJson(request, 32 * 1024);
    fields(body, ['operationId', 'expectedRevision', 'accountId', 'operation', 'id', 'data']);
    return json(await updateTrafficLimits(db, actor, body, request.headers.get('idempotency-key')));
  }
  if (path === '/package-management' && method === 'GET') return json(await packageBootstrap(db, actor));
  if (path === '/package-management/factor-history' && method === 'GET') return json(await packageFactorHistory(db, url.searchParams.get('model')));
  if (path === '/package-management/commands' && method === 'POST') return json(await packageCommand(db, actor, await bodyJson(request, 16 * 1024), request.headers.get('idempotency-key')));
  if(path==='/model-operations' && method==='GET')return new Response(await modelBootstrap(db,actor),{headers:{'content-type':'application/json; charset=utf-8','cache-control':'no-store','x-content-type-options':'nosniff'}});
  if(path==='/model-operations/commands' && method==='POST')return json(await modelCommand(db,actor,await bodyJson(request,1024*1024),request.headers.get('idempotency-key')));
  if(path.startsWith('/simulation/')){const result=await simulationRequest(db,actor,path.slice('/simulation'.length)+url.search,method,method==='GET'?{}:await bodyJson(request),request.headers.get('idempotency-key'));return json(result,result.error?422:200);}
  if (['/materials','/services','/suppliers'].includes(path) && method === 'GET') return json(await list(db, url, path.slice(1)));
  if (dictionary && method === 'GET') {
    const table = { items: 'billing_items', units: 'billing_units', currencies: 'currencies' }[dictionary[1]];
    const p = pagination(url), rows = await db.prepare(`SELECT * FROM ${table} WHERE deleted_at IS NULL AND id>? ORDER BY id LIMIT ?`).bind(p.after, p.limit + 1).all();
    return json(page(rows.results, p.limit));
  }
  if (resource) {
    const [, kind, id, action] = resource;
    if (kind === 'services' && action === 'visibility' && method === 'POST') return visibility(request, db, actor, id);
    if (kind === 'services' && action === 'workspace' && method === 'GET') return json(await workspace(db, id));
    if (kind === 'materials' && !action && method === 'GET') {
      const row = await db.prepare('SELECT * FROM materials WHERE id=? AND deleted_at IS NULL').bind(id).first();
      if (!row) fail(404, 'NOT_FOUND', '模型资料不存在');
      return json({ material: material(row) });
    }
    if (kind === 'services' && action === 'history' && method === 'GET') {
      const p = pagination(url), rows = await db.prepare(`SELECT e.* FROM audit_events e JOIN audit_models a ON a.audit_id=e.id JOIN services s ON s.material_id=a.material_id WHERE s.id=? AND e.id>? ORDER BY e.id LIMIT ?`).bind(id, p.after, p.limit + 1).all();
      return json(page(rows.results, p.limit));
    }
    if (kind === 'suppliers' && action === 'workspace' && method === 'GET') {
      const p = pagination(url), result = await db.batch([
        db.prepare('SELECT id,code,name,profile_json,builtin,enabled,revision FROM suppliers WHERE id=? AND deleted_at IS NULL').bind(id),
        db.prepare('SELECT * FROM supplier_models WHERE supplier_id=? AND removed_at IS NULL AND id>? ORDER BY id LIMIT ?').bind(id, p.after, p.limit + 1),
      ]);
      if (!result[0].results.length) fail(404, 'NOT_FOUND', '服务商不存在');
      return json({ supplier: decode(result[0].results[0]), models: page(result[1].results, p.limit) });
    }
    if (kind === 'channels' && method === 'GET') {
      const p = pagination(url), result = await db.batch([
        db.prepare('SELECT * FROM channels WHERE id=? AND deleted_at IS NULL').bind(id),
        db.prepare('SELECT * FROM channel_models WHERE channel_id=? AND removed_at IS NULL AND id>? ORDER BY id LIMIT ?').bind(id, p.after, p.limit + 1),
      ]);
      if (!result[0].results.length) fail(404, 'NOT_FOUND', '渠道不存在');
      if (action) fail(404, 'NOT_FOUND', '此动作尚未接入');
      return json({ channel: decode(result[0].results[0]), models: page(result[1].results, p.limit) });
    }
  }
  fail(404, 'NOT_FOUND', 'API 不存在或此动作尚未接入');
}

export async function handleModelOperations(request, env) {
  const requestId = crypto.randomUUID();
  try { const response = await route(request, env); response.headers.set('X-Request-Id', requestId); return response; }
  catch (error) {
    const known=error instanceof ApiError || Number.isInteger(error.status) && typeof error.code==='string';
    const status=known?error.status:503;
    if (!known) console.error(JSON.stringify({ requestId, code: 'DATABASE_UNAVAILABLE', reason:String(error.cause?.message || error.message).slice(0,300) }));
    return json({ error: { code: known ? error.code : 'DATABASE_UNAVAILABLE', message: known ? error.message : '数据库暂不可用，请稍后核对原操作结果', requestId } }, status, { 'X-Request-Id': requestId });
  }
}
import { canAccessPage } from '../src/admin-v2/navigation.mjs';

