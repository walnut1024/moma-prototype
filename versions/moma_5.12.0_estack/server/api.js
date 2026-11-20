import { domainModel } from '../src/mock/model-fields.js';
import { serviceCallsEnabled, serviceReferences, offerKey, providerOffer } from '../src/service-access.mjs';
import { resourceId } from '../src/resource-id.mjs';
import {modelBootstrap,modelCommand,packageBootstrap,packageCommand,packageFactorHistory,readTrafficLimits,simulationRequest,updateTrafficLimits, channelIndexCheck, channelCredentialAccess} from './model-commands.js';
import { initializePrototypeCatalogue } from './prototype-presets.js';
import { experienceOptions, marketCatalogue, marketRanking, marketCompletion, marketOrder, textConversations } from './market.js';
import { changeCustomerPassword, createMarketSession, customerIdentity, dualDemoAdminLogin, dualDemoUserId, issueCustomerChallenge, marketCookie, marketSession,
  resetCustomerPassword, verifiedCustomerCredential } from './customer-identity.js';
import { acceptCustomerInvitation, applicationBootstrap, applicationCommand, customerInvocation, dualDemoIdentity, initializeApplication, inspectCustomerInvitation,
  adminTenantSession, issueCustomerInvitation, tenantCommand, tenantWorkspace, validCallMetadata, validCallModel } from './application.js';
import { API_PREFIX, isApiPath } from '../api-path.js';
import { commercialModelWrite, deploymentLicense, LICENSE_UNAVAILABLE } from '../src/deployment-license.mjs';
import { effectiveInstalledLicense, licenseDetails, readInstalledLicense, saveInstalledLicense, verifyDeploymentLicense } from './deployment-license.js';
import { auditLogDetail, auditLogPage } from './audit-log.js';
import { PRIVATE_SITE } from '../src/site-config.mjs';
import { isTenantRouteCall, validRouteOptions } from '../src/tenant-routing.mjs';
import { readPublishedSiteSetting, savePublishedSiteSetting, validateAgreements } from './site-settings.js';
import { PORTAL_HOME_ENDPOINT, portalHomeUrl } from '../src/portal-home.mjs';
import { readProjectSpacePolicy, saveProjectSpacePolicy } from './project-space-policy.js';
import { AUDIT_ACTIONS, AUDIT_RESOURCES, AUDIT_RESULTS, AUDIT_SOURCES } from '../src/admin-v2/platform-audit.mjs';
const COOKIE = 'moma5120_v2_session';
const encoder = new TextEncoder();
const MAX_BODY = 256 * 1024;
const WRITE_ROLES = ['平台管理员', '运营人员'];
const LOGIN_FIELDS = new Map([['/auth/sign-in', 'identifier'], ['/auth/login', 'accountId'], ['/market/login', 'username']]);
const CHAT_COMPLETIONS = '/chat/completions';

class ApiError extends Error {
  constructor(status, code, message) { super(message); this.status = status; this.code = code; }
}
const fail = (status, code, message) => { throw new ApiError(status, code, message); };
const digest = async value => Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', encoder.encode(value))), b => b.toString(16).padStart(2, '0')).join('');
const randomToken = () => Array.from(crypto.getRandomValues(new Uint8Array(32)), b => b.toString(16).padStart(2, '0')).join('');
const json = (value, status = 200, fields = {}) => {
  const headers=new Headers(fields);
  headers.set('Cache-Control','no-store');
  headers.set('X-Content-Type-Options','nosniff');
  return Response.json(value,{status,headers});
};
const cookie = (token, age = 28800) => `${COOKIE}=${token}; HttpOnly; Secure; SameSite=Lax; Path=${API_PREFIX}; Max-Age=${age}`;
const fields = (body, allowed) => {
  if (!body || typeof body !== 'object' || Array.isArray(body) || Object.keys(body).some(key => !allowed.includes(key))) fail(400, 'INVALID_INPUT', '请求字段无效');
};
const identifier = value => typeof value === 'string' && /^[A-Za-z0-9:_.-]{1,200}$/.test(value);
const decode = row => row ? Object.fromEntries(Object.entries(row).map(([key, value]) => [key.endsWith('_json') ? key.slice(0, -5) : key, key.endsWith('_json') ? JSON.parse(value) : value])) : null;
const material = row => row && ({ ...JSON.parse(row.metadata_json), record_id:row.id,canonical_slug:row.canonical_slug,name:row.name,type:row.model_type,maker:row.maker,description:row.description,revision:row.revision,created:Math.floor(row.created_at/1000),updated_at:row.updated_at });
const service = row => {
  if (!row) return row;
  const model = domainModel(JSON.parse(row.record_json), true);
  const callsEnabled = serviceReferences({ models: [model] }).some(reference =>
    Boolean(reference.callId) && serviceCallsEnabled(model, providerOffer(model, offerKey(reference))));
  return { id: row.id, templateId: row.material_id, modelId: row.code, name: row.name, type: row.model_type,
    serviceMode: row.mode, serviceModeRevision: row.mode_epoch, listingStatus: { unlisted: '未上架', listed: '已上架', withdrawn: '已下架' }[row.listing_status],
    callsEnabled, marketVisible: Boolean(row.market_visible), scope: JSON.parse(row.scope_json), revision: row.revision, updatedAt: row.updated_at };
};

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

async function adminLoginAccount(db, username, received, hashes) {
  const saved = await db.prepare('SELECT id,name,role,login_name,access_hash FROM admin_accounts WHERE (id=? OR login_name=?) AND enabled=1 LIMIT 2')
    .bind(username, username).all();
  const account = saved.results.length === 1 ? saved.results[0] : null;
  const expected = account && (account.access_hash || (Object.hasOwn(hashes, account.login_name || account.id) && hashes[account.login_name || account.id]));
  const valid = await secureEqual(received, typeof expected === 'string' ? expected : '0'.repeat(64));
  return valid && typeof expected === 'string' ? { id:account.id, name:account.name, role:account.role, loginName:account.login_name } : null;
}

async function customerLoginAccount(db, username, accessCode, received, hashes, accountType, license) {
  const field = accountType ? 'username' : 'login';
  let identity = await customerIdentity(db, username, field, null, license);
  if (!identity && Object.hasOwn(hashes, username) && typeof hashes[username] === 'string' && await secureEqual(received, hashes[username])) {
    await initializeApplication(db, username);
    identity = await customerIdentity(db, username, field, null, license);
  }
  if (!identity) return null;
  const expected = Object.hasOwn(hashes, identity.user.id) && hashes[identity.user.id];
  const credential = typeof expected !== 'string' ? await verifiedCustomerCredential(db, identity.user.id, accessCode) : null;
  const valid = typeof expected === 'string' ? await secureEqual(received, expected) : Boolean(credential);
  const spaces = accountType ? identity.spaces.filter(space => (space.type === '个人') === (accountType === 'personal')) : identity.spaces;
  const tenant = accountType ? spaces[0] : spaces.find(space => space.type === '个人') || spaces[0];
  return valid && tenant ? { userId:identity.user.id, tenant, credential, spaces } : null;
}

async function authenticate(request, db) {
  const token = request.headers.get('cookie')?.split(';').map(part => part.trim()).find(part => part.startsWith(COOKIE + '='))?.slice(COOKIE.length + 1);
  if (!token || !/^[a-f0-9]{64}$/.test(token)) fail(401, 'SESSION_EXPIRED', '请先登录后台测试账号');
  const row = await db.prepare(`SELECT a.id,a.name,a.role,a.login_name,s.id AS session_id FROM admin_sessions s
    JOIN admin_accounts a ON a.id=s.actor_id WHERE s.token_hash=? AND s.expires_at>? AND s.revoked_at IS NULL AND a.enabled=1`).bind(await digest(token), Date.now()).first();
  if (!row) fail(401, 'SESSION_EXPIRED', '会话已失效，请重新登录');
  return row;
}

async function revokeSessions(request,db) {
  let actor;
  try {actor=await authenticate(request,db);}catch(error){if(error.status!==401)throw error;}
  if(actor)await db.prepare('UPDATE admin_sessions SET revoked_at=? WHERE id=?').bind(Date.now(),actor.session_id).run();
  const customer=await marketSession(db,request);
  if(customer)await db.prepare('DELETE FROM market_sessions WHERE token_hash=?').bind(customer.hash).run();
}

function pagination(url, maxQueryBytes = 50) {
  const raw = url.searchParams.get('limit') || '20';
  if (!/^\d{1,3}$/.test(raw) || Number(raw) < 1 || Number(raw) > 100) fail(400, 'INVALID_INPUT', '分页大小须为 1—100');
  const after = url.searchParams.get('after') || '';
  if (after && !identifier(after)) fail(400, 'INVALID_INPUT', '分页游标无效');
  const q = (url.searchParams.get('q') || '').trim(), pattern = '%' + q.replace(/[\\%_]/g, '\\$&') + '%';
  if (encoder.encode(pattern).byteLength > maxQueryBytes) fail(400, 'INVALID_INPUT', '搜索内容过长');
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
  const header = service(result[0].results[0]);
  const offers = result[2].results.map(row => decode({
    ...row, calls_enabled: Number(header.callsEnabled && Boolean(row.id) && Boolean(row.calls_enabled)),
  }));
  return { service: header, material: material(result[1].results[0]), offers,
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
  const at = Date.now(), auditId = resourceId('audit-event');
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

async function route(request, env, requestId) {
  const url = new URL(request.url), method = request.method;
  if (!isApiPath(url.pathname)) fail(404, 'NOT_FOUND', 'API 不存在');
  let path;
  try { path = decodeURIComponent(url.pathname.slice(API_PREFIX.length)); } catch { fail(400, 'INVALID_INPUT', '路径编码无效'); }
  const resource = /^\/(materials|services|suppliers|channels|operations)\/([A-Za-z0-9:_.-]{1,200})(?:\/(workspace|visibility|history))?$/.exec(path);
  const dictionary = /^\/dictionary\/(items|units|currencies)$/.exec(path);
  const packagePath = ['/package-management', '/package-management/commands', '/package-management/factor-history'].includes(path);
  const trafficPath = path === '/traffic-limits';
  const trafficHistoryPath = path === '/traffic-limits/history';
  const auditPath = /^\/audit-logs(?:\/([A-Za-z0-9:_.-]{1,200}))?$/.exec(path);
  const marketPaths = ['/market/catalogue','/market/ranking',
    '/market/password-code','/market/password-reset','/market/password','/market/logout','/market/switch',
    '/market/invitations','/market/invitations/inspect','/market/invitations/accept',
    '/market/orders','/market/completions','/market/conversations','/market/experience-options','/market/workspace','/market/commands'];
  const tenantResources = /^\/tenants\/([A-Za-z0-9:_.-]{1,200})\/(workspace|commands|invitations)$/.exec(path);
  const applicationPaths = ['/application','/application/open','/application/commands'];
  const loginField = LOGIN_FIELDS.get(path);
  const agreementPath = path === '/site-agreements' && (PRIVATE_SITE || env.MOMA_PRIVATE_SITE === '1');
  const portalPath = path === PORTAL_HOME_ENDPOINT && (PRIVATE_SITE || env.MOMA_PRIVATE_SITE === '1');
  const spacePolicyPath = path === '/project-space-policy' && (PRIVATE_SITE || env.MOMA_PRIVATE_SITE === '1');
  const credentialPath = /^\/channels\/([A-Za-z0-9:_.-]{1,200})\/verify-credential$/.exec(path);
  const known = path===CHAT_COMPLETIONS || agreementPath || portalPath || spacePolicyPath || loginField || marketPaths.includes(path) || applicationPaths.includes(path) || tenantResources || trafficPath || trafficHistoryPath || auditPath || credentialPath || packagePath || ['/deployment/license','/auth/logout','/auth/me','/materials','/services','/suppliers','/health','/model-operations','/model-operations/commands','/channels/consistency'].includes(path) || path.startsWith('/simulation/') || resource || dictionary;
  if (!known) fail(404, 'NOT_FOUND', 'API 不存在');
  if (!env.MODEL_OPS_DB) fail(503, 'DATABASE_UNAVAILABLE', '模型运营数据库尚未绑定');
  const db = env.MODEL_OPS_DB;
  const installedLicense = await readInstalledLicense(db);
  const boundLicense = installedLicense ? effectiveInstalledLicense(installedLicense) : deploymentLicense(env);
  const license = !boundLicense.managed && (await readProjectSpacePolicy(db)).operatingMode === 'internal'
    ? { ...boundLicense, edition:'internal', commercial:false, commerceWritable:false } : boundLicense;
  const requireCommerce = (write = false) => {
    if (write ? !license.commerceWritable : !license.commercial) fail(403,'LICENSE_REQUIRED',LICENSE_UNAVAILABLE);
  };
  if (path === '/deployment/license') {
    if (method === 'GET' && url.searchParams.get('details') !== '1') return json(license);
    if (!['GET','POST'].includes(method)) fail(405,'METHOD_NOT_ALLOWED','请求方法不支持');
    const actor = await authenticate(request, db);
    if (actor.role !== '平台管理员') fail(403,'FORBIDDEN','仅平台管理员可管理 License');
    if (method === 'GET') return json(licenseDetails(license, installedLicense));
    if (request.headers.get('origin') !== url.origin || request.headers.get('x-moma-request') !== '1') {
      fail(403,'FORBIDDEN','请求来源无效');
    }
    const body = await bodyJson(request, 9 * 1024);
    fields(body,['license','expectedRevision','confirmReduction']);
    const expected = body.expectedRevision;
    if (!Number.isSafeInteger(expected) || expected < 0 || expected >= Number.MAX_SAFE_INTEGER ||
        typeof body.license !== 'string' || body.license.length > 8192 ||
        body.confirmReduction !== undefined && typeof body.confirmReduction !== 'boolean') {
      fail(400,'INVALID_INPUT','License 提交内容无效');
    }
    if (expected !== (installedLicense?.revision ?? 0)) {
      fail(409,'REVISION_CONFLICT','当前授权已变更，请核对后重试。');
    }
    const verified = await verifyDeploymentLicense(body.license.trim(), env);
    if (license.commercial && verified.edition === 'internal' && !body.confirmReduction) {
      fail(409,'LICENSE_SCOPE_REDUCTION','当前部署的授权范围将缩小。');
    }
    const saved = await saveInstalledLicense(db, expected, verified, actor.id);
    if (!saved) fail(409,'REVISION_CONFLICT','当前授权已变更，请核对后重试。');
    return json(licenseDetails(effectiveInstalledLicense(saved), saved));
  }
  if (path===CHAT_COMPLETIONS) {
    if (method!=='POST') fail(405,'METHOD_NOT_ALLOWED','请求方法不支持');
    const credential=/^Bearer (sk-[0-9a-f]{32})$/i.exec(request.headers.get('authorization') || '')?.[1];
    if (!credential) fail(401,'auth_rejected','请使用项目 API Key');
    const sentId=request.headers.get('x-request-id');
    if (sentId!==null && !identifier(sentId)) fail(400,'INVALID_INPUT','请求 ID 无效');
    const body=await bodyJson(request,32*1024);
    fields(body,['model','messages','metadata','stream','routing']);
    if (!validCallModel(body.model) || !validCallMetadata(body.metadata) || !validRouteOptions(body.model,body.routing) ||
        body.stream!==undefined && body.stream!==false ||
        !Array.isArray(body.messages) || !body.messages.length || body.messages.length>20 ||
        body.messages.some(item=>!item || !['system','user','assistant'].includes(item.role) ||
          typeof item.content!=='string' || !item.content.trim() || Object.keys(item).some(field=>!['role','content'].includes(field))) ||
        body.messages.at(-1).role!=='user' || body.messages.reduce((sum,item)=>sum+item.content.length,0)>6000) {
      fail(400,'INVALID_INPUT','请填写模型与文本消息，模拟接口仅支持非流式文本请求');
    }
    return json(await customerInvocation(db,await digest(credential),{...body,requestId},
      request.headers.get('cf-connecting-ip'),PRIVATE_SITE || env.MOMA_PRIVATE_SITE==='1'));
  }
  if (!['GET','POST','PATCH','DELETE'].includes(method)) fail(405, 'METHOD_NOT_ALLOWED', '请求方法不支持');
  if (method !== 'GET') {
    if (request.headers.get('origin') !== url.origin || request.headers.get('x-moma-request') !== '1') fail(403, 'FORBIDDEN', '请求来源无效');
  }
  if (agreementPath) {
    const key = 'site-agreements';
    if (method === 'GET') return json(await readPublishedSiteSetting(db, key) || { revision: 0, agreements: {} });
    if (method !== 'POST') fail(405, 'METHOD_NOT_ALLOWED', '请求方法不支持');
    const actor = await authenticate(request, db);
    if (actor.role !== '平台管理员') fail(403, 'FORBIDDEN', '仅系统管理员可保存站点协议');
    const body = await bodyJson(request);
    fields(body, ['expectedRevision', 'agreements']);
    const next = validateAgreements(body);
    if (!next) fail(400, 'INVALID_INPUT', '协议正文或链接无效');
    const saved = await savePublishedSiteSetting(db, key, next);
    if (!saved) fail(409, 'REVISION_CONFLICT', '协议已更新，请载入当前版本');
    return json(saved);
  }
  if (portalPath) {
    const key = 'site-portal';
    if (method === 'GET') return json(await readPublishedSiteSetting(db, key) || { revision: 0, url: '' });
    if (method !== 'POST') fail(405, 'METHOD_NOT_ALLOWED', '请求方法不支持');
    const actor = await authenticate(request, db);
    if (actor.role !== '平台管理员') fail(403, 'FORBIDDEN', '仅平台管理员可保存门户首页地址');
    const body = await bodyJson(request, 16 * 1024);
    fields(body, ['expectedRevision', 'url']);
    const { expectedRevision, url: value } = body;
    const address = portalHomeUrl(value, url.origin);
    if (!Number.isSafeInteger(expectedRevision) || expectedRevision < 0 || expectedRevision >= Number.MAX_SAFE_INTEGER ||
        typeof value !== 'string' || (value.trim() && !address)) {
      fail(400, 'INVALID_INPUT', '请填写有效的 HTTP 或 HTTPS 门户首页地址，或留空。门户地址不能指向 MoMA 首页。');
    }
    const saved = await savePublishedSiteSetting(db, key, { revision: expectedRevision + 1, url: address });
    if (!saved) fail(409, 'REVISION_CONFLICT', '门户首页地址已更新，请载入已保存地址。');
    return json(saved);
  }
  if (spacePolicyPath) {
    const actor = await authenticate(request, db);
    if (actor.role !== '平台管理员') fail(403,'FORBIDDEN','仅系统管理员可配置站点使用空间');
    if (method === 'GET') return json(await readProjectSpacePolicy(db));
    if (method !== 'POST') fail(405,'METHOD_NOT_ALLOWED','请求方法不支持');
    const body = await bodyJson(request,4096);
    fields(body,['expectedRevision','personalEnabled','operatingMode','internalTenantId']);
    if (!Number.isSafeInteger(body.expectedRevision) || body.expectedRevision < 0 || typeof body.personalEnabled !== 'boolean' ||
        body.operatingMode!==undefined && !['internal','factory'].includes(body.operatingMode) ||
        body.internalTenantId!==undefined && body.internalTenantId!=='' && !identifier(body.internalTenantId)) fail(400,'INVALID_INPUT','使用空间配置无效');
    const saved = await saveProjectSpacePolicy(db,body.expectedRevision,body,actor);
    if (!saved) fail(409,'REVISION_CONFLICT','使用空间配置已更新，请刷新');
    return json(saved);
  }
  if(path==='/auth/logout'&&method==='POST') {
    await revokeSessions(request,db);
    const headers=new Headers({'Set-Cookie':cookie('',0)});
    headers.append('Set-Cookie',cookie('',0).replace(COOKIE+'=',marketCookie+'='));
    return json({loggedOut:true},200,headers);
  }
  if (loginField) {
    if (method !== 'POST') fail(405, 'METHOD_NOT_ALLOWED', '请求方法不支持');
    const customerOnly = loginField === 'username', adminOnly = loginField === 'accountId';
    const body = await bodyJson(request, 4096);
    fields(body, customerOnly ? ['username','accountType','accessCode'] : adminOnly ? [loginField,'accessCode'] : [loginField,'accessCode','tenantId']);
    const login = body[loginField];
    if (typeof login !== 'string' || !login.trim() || login.length > 254 || typeof body.accessCode !== 'string' ||
        body.accessCode.length < 8 || body.accessCode.length > 128 ||
        (customerOnly && !['enterprise','personal'].includes(body.accountType))) fail(401, 'INVALID_LOGIN', '账号或密码无效');
    let hashes;
    try { hashes = JSON.parse(env.MODEL_OPS_LOGIN_HASHES || '{}'); } catch { fail(503, 'LOGIN_UNAVAILABLE', '测试账号登录尚未配置'); }
    if (!hashes || typeof hashes !== 'object' || Array.isArray(hashes)) fail(503, 'LOGIN_UNAVAILABLE', '测试账号登录尚未配置');
    const username = login.trim().toLowerCase(), received = await digest(body.accessCode);
    const account = customerOnly ? null : await adminLoginAccount(db, username, received, hashes);
    const customer = adminOnly ? null : await customerLoginAccount(db, username, body.accessCode, received, hashes, body.accountType, license);
    if ((!account && !customer) || (account && customer)) fail(401, 'INVALID_LOGIN', '账号或密码无效');
    let linked;
    if (!adminOnly && account?.loginName===dualDemoAdminLogin && account.role==='平台管理员' &&
        (PRIVATE_SITE || env.MOMA_PRIVATE_SITE==='1')) {
      await initializeApplication(db);
      linked=await dualDemoIdentity(db,license);
    }
    const spaces = linked?.spaces || [];
    const tenant = body.tenantId === undefined ? spaces[0] : spaces.find(space=>space.id===body.tenantId);
    if (body.tenantId !== undefined && !tenant) fail(403,'FORBIDDEN','请选择当前账号可管理的企业空间');
    if (spaces.length > 1 && body.tenantId === undefined) return json({spaces,selectEnterprise:true});
    await revokeSessions(request,db);
    if (customer) {
      const {userId, tenant, credential, spaces} = customer;
      const token = await createMarketSession(db, userId, tenant.id, credential);
      const headers=new Headers({'Set-Cookie':cookie(token).replace(COOKIE+'=',marketCookie+'=')});
      headers.append('Set-Cookie',cookie('',0));
      return json(customerOnly ? {tenant} : {tenant, spaces},200,headers);
    }
    const token=randomToken(),at=Date.now(),sessionId=resourceId('admin-session');
    await db.batch([
      db.prepare('DELETE FROM admin_sessions WHERE id IN (SELECT id FROM admin_sessions WHERE expires_at<=? LIMIT 100)').bind(at),
      db.prepare('INSERT INTO admin_sessions(id,token_hash,actor_id,created_at,expires_at) VALUES(?,?,?,?,?)').bind(sessionId,await digest(token),account.id,at,at+28800000),
    ]);
    if(account.id==='yyg' && account.role==='平台管理员') {
      await initializePrototypeCatalogue(db,{...account,session_id:sessionId});
      await initializeApplication(db);
    }
    const sessionHeaders=new Headers({'Set-Cookie':cookie(token)});
    if (tenant) {
      const marketToken=await createMarketSession(db,linked.user.id,tenant.id);
      sessionHeaders.append('Set-Cookie',cookie(marketToken).replace(COOKIE+'=',marketCookie+'='));
    }
    if(!tenant)sessionHeaders.append('Set-Cookie',cookie('',0).replace(COOKIE+'=',marketCookie+'='));
    const { id, name, role } = account;
    return json({account:{id,name,role},expiresAt:at+28800000,...(tenant && {tenant,spaces:[tenant]})},200,sessionHeaders);
  }
  if (path === '/health' && method === 'GET') {
    const state = await db.prepare('SELECT schema_version FROM db_state WHERE id=1').first();
    return json({ status: 'ok', version: '5.12.0', schemaVersion: state.schema_version });
  }
  if (marketPaths.includes(path)) {
    if(path==='/market/experience-options'){
      if(method!=='GET')fail(405,'METHOD_NOT_ALLOWED','请求方法不支持');
      return json(await experienceOptions(db,url.searchParams.get('task')));
    }
    if(path==='/market/ranking' && method==='GET')return json(await marketRanking(db));
    if (path === '/market/catalogue' && method === 'GET') {
      const projectId = url.searchParams.get('project');
      if (projectId && !identifier(projectId)) fail(400,'INVALID_INPUT','项目标识无效');
      return json(await marketCatalogue(db,await marketSession(db,request,license),{ projectId, display:true, license }));
    }
    if (['/market/workspace','/market/conversations'].includes(path) && method === 'GET') {
      const session = await marketSession(db,request,license);
      if (!session) fail(401,'TENANT_SESSION_REQUIRED','请先登录客户账号');
      return json(await (path==='/market/workspace'?tenantWorkspace(db,session):textConversations(db,session)));
    }
    if (method !== 'POST' || ['/market/catalogue','/market/workspace','/market/ranking','/market/conversations'].includes(path)) fail(405,'METHOD_NOT_ALLOWED','请求方法不支持');
    if(['/market/password-code','/market/password-reset'].includes(path)){
      if(env.MODEL_OPS_DEMO_OTP!=='1')fail(403,'DEMO_OTP_UNAVAILABLE','当前环境未开启演示验证码');
      const body=await bodyJson(request,4096);
      if(path==='/market/password-code'){
        fields(body,['phone']);
        return json(await issueCustomerChallenge(db,body.phone,'reset'));
      }
      fields(body,['phone','challengeId','code','password']);
      await resetCustomerPassword(db,body);
      return json({updated:true},200,{'Set-Cookie':cookie('',0).replace(COOKIE+'=',marketCookie+'=')});
    }
    const session=await marketSession(db,request,license);
    if (path==='/market/logout') {
      if (session) await db.prepare('DELETE FROM market_sessions WHERE token_hash=?').bind(session.hash).run();
      return json({loggedOut:true},200,{'Set-Cookie':cookie('',0).replace(COOKIE+'=',marketCookie+'=')});
    }
    if(path==='/market/invitations/inspect' || path==='/market/invitations/accept'){
      const body=await bodyJson(request,4096);
      if(path.endsWith('/inspect')){
        fields(body,['token']);
        return json(await inspectCustomerInvitation(db,body.token));
      }
      fields(body,['token','password','consent']);
      const {userId,tenant}=await acceptCustomerInvitation(db,session,body);
      const token=await createMarketSession(db,userId,tenant.id);
      return json({tenant},200,{'Set-Cookie':cookie(token).replace(COOKIE+'=',marketCookie+'=')});
    }
    if (!session) fail(401,'TENANT_SESSION_REQUIRED','请先登录模型广场');
    if(path==='/market/invitations'){
      const body=await bodyJson(request,4096);
      fields(body,['membershipId']);
      return json(await issueCustomerInvitation(db,session,body.membershipId),201);
    }
    if(path==='/market/password'){
      const body=await bodyJson(request,4096);
      fields(body,['currentPassword','password']);
      await changeCustomerPassword(db,session,body);
      return json({updated:true},200,{'Set-Cookie':cookie('',0).replace(COOKIE+'=',marketCookie+'=')});
    }
    if (path==='/market/switch') {
      const body=await bodyJson(request,4096);
      fields(body,['tenantId']);
      const tenant=session.spaces.find(space=>space.id===body.tenantId);
      if(!tenant)fail(403,'FORBIDDEN','当前账号无权进入该空间');
      const written=await db.prepare(`UPDATE market_sessions SET tenant_id=? WHERE token_hash=? AND user_id=? AND tenant_id=? AND expires_at>?
        AND (SELECT commit_seq FROM db_state WHERE id=1)=?`)
        .bind(tenant.id,session.hash,session.user.id,session.tenant.id,Date.now(),session.commitSeq).run();
      if(!written.meta.changes)fail(409,'TENANT_CHANGED','当前空间已变化，请刷新后重试');
      return json({tenant});
    }
    if (path === '/market/commands') {
      const body = await bodyJson(request);
      fields(body,['operationId','tenantId','expectedRevision','action','data']);
      if (body.action === 'subscribe') requireCommerce(true);
      return json(await tenantCommand(db,session,body));
    }
    const body=await bodyJson(request,path==='/market/completions'?32*1024:8192);
    if (path==='/market/orders') {
      requireCommerce(true);
      fields(body,['offerIds','tenantId','salePriceIds']);
      if (!Array.isArray(body.offerIds) || !body.offerIds.length || body.offerIds.length>20 || new Set(body.offerIds).size!==body.offerIds.length || body.offerIds.some(id=>typeof id!=='string' || !/^[A-Za-z0-9:_.-]{1,512}$/.test(id))) fail(400,'INVALID_INPUT','请选择 1–20 项不同的渠道服务');
      if ((body.tenantId!==undefined && !identifier(body.tenantId)) || (body.salePriceIds!==undefined &&
          (!body.salePriceIds || Array.isArray(body.salePriceIds) || Object.keys(body.salePriceIds).length!==body.offerIds.length || body.offerIds.some(id=>!Object.hasOwn(body.salePriceIds,id) || !identifier(body.salePriceIds[id]))))) fail(400,'INVALID_INPUT','订单售价或客户无效');
      return json(await marketOrder(db,session,body.offerIds,body));
    }
    fields(body,['requestId','model','messages','tenantId','projectId','task','images','imageCount','speechMode','simulateDenied','textTurn','routing']);
    if (!identifier(body.projectId) || (body.tenantId!==undefined && !identifier(body.tenantId)) ||
        (body.task!==undefined && !['text','image','video','voice'].includes(body.task)) ||
        ['images','simulateDenied'].some(field=>body[field]!==undefined && typeof body[field]!=='boolean') ||
        (body.imageCount!==undefined && (body.task!=='image' || ![1,2,3,4].includes(body.imageCount))) ||
        (body.speechMode!==undefined && (body.task!=='voice' || !['asr','tts'].includes(body.speechMode)))) fail(400,'INVALID_INPUT','体验参数无效');
    if (!identifier(body.requestId) || !validCallModel(body.model) || body.model.startsWith('project@') ||
        !validRouteOptions(body.model,body.routing) || isTenantRouteCall(body.model) && (body.task !== 'text' || body.images) ||
        !Array.isArray(body.messages) || body.messages.length!==1 || body.messages[0]?.role!=='user' ||
        typeof body.messages[0].content!=='string' || !body.messages[0].content.trim() || body.messages[0].content.length>2000 ||
        Object.keys(body.messages[0]).some(key=>!['role','content'].includes(key))) fail(400,'INVALID_INPUT','请填写当前调用标识和 1–2000 字的消息');
    if(body.textTurn!==undefined){
      const turn=body.textTurn;
      fields(turn,['conversationId','messageId','question','images','temperature','topP','deepThinking']);
      if(body.task!=='text' || !identifier(turn.conversationId) || !identifier(turn.messageId) ||
        typeof turn.question!=='string' || turn.question.length>6000 ||
        !Array.isArray(turn.images) || turn.images.length>8 ||
        turn.images.some(name=>typeof name!=='string' || !name || name.length>255) ||
        typeof turn.deepThinking!=='boolean' || !Number.isFinite(turn.temperature) || turn.temperature<0 || turn.temperature>2 ||
        !Number.isFinite(turn.topP) || turn.topP<0 || turn.topP>1)fail(400,'INVALID_INPUT','文本对话记录无效');
    }
    return json(await marketCompletion(db,session,body));
  }
  const actor = await authenticate(request, db);
  if (tenantResources) {
    if (actor.role !== '平台管理员') fail(403,'FORBIDDEN','只有系统管理员可以管理指定租户的资源');
    const [,tenantId,resource] = tenantResources;
    const session = await adminTenantSession(db,actor,tenantId,license);
    if (resource === 'workspace' && method === 'GET') return json(await tenantWorkspace(db,session));
    if (resource === 'workspace' || method !== 'POST') fail(405,'METHOD_NOT_ALLOWED','请求方法不支持');
    const body = await bodyJson(request);
    if (resource === 'invitations') {
      fields(body,['membershipId']);
      return json(await issueCustomerInvitation(db,session,body.membershipId),201);
    }
    fields(body,['operationId','tenantId','expectedRevision','action','data']);
    if (!['organization','projectCreate','projectUpdate','projectRoute','keys'].includes(body.action)) {
      fail(403,'FORBIDDEN','此入口仅支持组织及项目管理');
    }
    if (body.action === 'projectUpdate' && body.data?.type === 'exit') fail(403,'FORBIDDEN','当前身份没有项目成员关系');
    return json(await tenantCommand(db,session,body));
  }
  if (credentialPath) {
    if (method !== 'POST') fail(405, 'METHOD_NOT_ALLOWED', '请求方法不支持');
    if (actor.role !== '平台管理员') fail(403, 'FORBIDDEN', '仅平台管理员可验证后查看凭证摘要');
    const body = await bodyJson(request, 4096);
    fields(body, ['keyId', 'accessCode']);
    if (!identifier(body.keyId) || typeof body.accessCode !== 'string' || body.accessCode.length < 8 || body.accessCode.length > 128) fail(400, 'INVALID_INPUT', '请输入当前账号访问码');
    let hashes;
    try { hashes = JSON.parse(env.MODEL_OPS_LOGIN_HASHES || '{}'); } catch { fail(503, 'LOGIN_UNAVAILABLE', '当前账号验证尚未配置'); }
    if (!hashes || typeof hashes !== 'object' || Array.isArray(hashes)) fail(503, 'LOGIN_UNAVAILABLE', '当前账号验证尚未配置');
    const account = await adminLoginAccount(db, actor.id, await digest(body.accessCode), hashes);
    const result = await channelCredentialAccess(db, actor, credentialPath[1], body.keyId, account?.id === actor.id);
    if (!result.verified) fail(403, 'INVALID_CREDENTIAL_ACCESS_CODE', '当前账号访问码不正确');
    return json(result);
  }
  if (path === '/auth/me' && method === 'GET') {
    const session = actor.login_name===dualDemoAdminLogin && actor.role==='平台管理员'
      ? await marketSession(db,request,license) : null;
    const {id, name} = session?.user.id===dualDemoUserId ? session.tenant : {};
    return json({ account: { id: actor.id, name: actor.name, role: actor.role, ...(id && {selectedEnterprise:{id,name}}) } });
  }
  if (applicationPaths.includes(path)) {
    if (!['平台管理员','运营人员','运维人员'].includes(actor.role)) fail(403,'FORBIDDEN','当前账号无业务工作区权限');
    const configured=Object.entries(JSON.parse(env.MODEL_OPS_LOGIN_HASHES || '{}'))
      .filter(([,value])=>typeof value==='string' && /^[a-f0-9]{64}$/.test(value)).map(([id])=>id);
    if (path === '/application' && method === 'GET') return json(await applicationBootstrap(db,actor,configured));
    if (path === '/application/open' && method === 'POST') {
      await initializeApplication(db);
      return json(await applicationBootstrap(db,actor,configured));
    }
    if (path === '/application/commands' && method === 'POST') {
      const body = await bodyJson(request);
      fields(body,['operationId','expectedRevision','action']);
      return json(await applicationCommand(db,actor,body,request.headers.get('idempotency-key'),configured,license));
    }
    fail(405,'METHOD_NOT_ALLOWED','请求方法不支持');
  }
  if (resource?.[1]==='operations' && !resource[3] && method==='GET') {
      const row = await db.prepare('SELECT id,response_json FROM operations WHERE id=? AND actor_id=?').bind(resource[2], actor.id).first();
      if (!row) fail(404, 'NOT_FOUND', '未查到已提交操作，请使用原标识核对或重试');
      return json(JSON.parse(row.response_json));
    }
  const pageId = auditPath ? 'audit-logs' : trafficPath || trafficHistoryPath ? 'traffic-limits' : packagePath ? 'package-production' : dictionary ? 'tariff-dictionary' : path.startsWith('/materials') ? 'model-templates'
    : path.startsWith('/suppliers') || path.startsWith('/channels') ? 'providers' : 'listing';
  if (!canAccessPage(actor.role, pageId)) fail(403, 'FORBIDDEN', '当前账号无此页面访问权限');
  if (auditPath) {
    if (method !== 'GET') fail(405, 'METHOD_NOT_ALLOWED', '请求方法不支持');
    if (auditPath[1]) {
      const event = await auditLogDetail(db, auditPath[1]);
      if (!event) fail(404, 'NOT_FOUND', '审计记录不存在');
      return json({ accountId: actor.id, event });
    }
    const params = url.searchParams, now = Date.now(), { limit, after, q } = pagination(url, 1200);
    const from = Number(params.get('from') ?? now - 7 * 86400000);
    const to = Number(params.get('to') ?? now);
    if (!Number.isSafeInteger(from) || !Number.isSafeInteger(to) || from < 0 || to > 8.64e15 || from > to) fail(400, 'INVALID_INPUT', '时间范围无效');
    const action = params.get('action'), status = params.get('status'), type = params.get('type'), source = params.get('source');
    const eventId = (params.get('event_id') || '').trim();
    const tenant=params.get('tenant') || '', project=params.get('project') || '';
    if ((tenant && !identifier(tenant)) || (project && !identifier(project))) fail(400,'INVALID_INPUT','空间或项目筛选无效');
    if ((action && !Object.hasOwn(AUDIT_ACTIONS, action)) || (status && !Object.hasOwn(AUDIT_RESULTS, status)) ||
        (type && !Object.hasOwn(AUDIT_RESOURCES, type)) || (source && !Object.hasOwn(AUDIT_SOURCES, source))) fail(400, 'INVALID_INPUT', '审计筛选条件无效');
    if (eventId && !identifier(eventId)) fail(400, 'INVALID_INPUT', '事件 ID 格式无效');
    const account = (params.get('actor') || '').trim();
    if (account.length > 100) fail(400, 'INVALID_INPUT', '操作人搜索内容过长');
    const data = await auditLogPage(db, { limit, after, from, to, eventId, action, status, type, source, tenant, project, q:q.toLowerCase(), actor:account.toLowerCase() });
    if (!data) fail(400, 'INVALID_INPUT', '分页游标无效');
    return json({ accountId: actor.id, ...data });
  }
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
  if (packagePath) requireCommerce(path === '/package-management/commands');
  if (path === '/package-management' && method === 'GET') return json(await packageBootstrap(db, actor));
  if (path === '/package-management/factor-history' && method === 'GET') return json(await packageFactorHistory(db, url.searchParams.get('model')));
  if (path === '/package-management/commands' && method === 'POST') return json(await packageCommand(db, actor, await bodyJson(request, 16 * 1024), request.headers.get('idempotency-key')));
  if(path==='/model-operations' && method==='GET')return new Response(await modelBootstrap(db,actor),{headers:{'content-type':'application/json; charset=utf-8','cache-control':'no-store','x-content-type-options':'nosniff'}});
  if (path === '/channels/consistency') {
    if (method !== 'GET') fail(405, 'METHOD_NOT_ALLOWED', '请求方法不支持');
    return json(await channelIndexCheck(db, actor));
  }
  if (path === '/model-operations/commands' && method === 'POST') {
    const body = await bodyJson(request,10*1024*1024+65536);
    if (commercialModelWrite(body.action)) requireCommerce(true);
    if (!license.commercial && body.action?.operation === 'marketCardList') {
      const scope = body.action.data?.scope;
      const { internalTenantId } = await readProjectSpacePolicy(db);
      const reference = JSON.parse(await db.prepare('SELECT reference_json FROM model_workspace WHERE id=1').first('reference_json'));
      if (scope?.tenantIds?.length || Object.entries({ organizationIds:'organizations', projectIds:'projects' }).some(([key, collection]) =>
        Array.isArray(scope?.[key]) && scope[key].some(id => !(reference[collection] || []).some(row => row.id === id && row.tenantId === internalTenantId)))) requireCommerce();
    }
    const auditSource = request.headers.get('sec-fetch-site') === 'same-origin' ? 'web' : undefined;
    return json(await modelCommand(db,actor,body,request.headers.get('idempotency-key'),license,auditSource));
  }
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
      const p = pagination(url), rows = await db.prepare(`SELECT e.id,e.operation_id,e.entity_type,e.entity_id,e.action,e.diff_json,e.created_at,
        json_remove(e.record_json,'$.platformAudit') AS record_json FROM audit_events e JOIN audit_models a ON a.audit_id=e.id
        JOIN services s ON s.material_id=a.material_id WHERE s.id=? AND e.id>? ORDER BY e.id LIMIT ?`).bind(id, p.after, p.limit + 1).all();
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
  const sentId=request.headers.get('x-request-id');
  const requestId=new URL(request.url).pathname===API_PREFIX+CHAT_COMPLETIONS && identifier(sentId) ? sentId : resourceId('request');
  try { const response = await route(request,env,requestId); response.headers.set('X-Request-Id', requestId); return response; }
  catch (error) {
    const known=error instanceof ApiError || Number.isInteger(error.status) && typeof error.code==='string';
    const status=known?error.status:503;
    if (!known) console.error(JSON.stringify({ requestId, code: 'DATABASE_UNAVAILABLE', reason:String(error.cause?.message || error.message).slice(0,300) }));
    return json({ error: { code: known ? error.code : 'DATABASE_UNAVAILABLE', message: known ? error.message : '数据库暂不可用，请稍后核对原操作结果', requestId } }, status, { 'X-Request-Id': requestId });
  }
}
import { canAccessPage } from '../src/admin-v2/navigation.mjs';

