import { resourceId } from '../src/resource-id.mjs';
import {modelBootstrap,modelCommand,packageBootstrap,packageCommand,packageFactorHistory,readTrafficLimits,simulationRequest,updateTrafficLimits,channelIndexCheck,channelCredentialAccess} from './model-commands.js';
import { commercialModelWrite, deploymentLicense, LICENSE_UNAVAILABLE } from '../src/deployment-license.mjs';
import { effectiveInstalledLicense, licenseDetails, readInstalledLicense, saveInstalledLicense, verifyDeploymentLicense } from './deployment-license.js';
import { marketReference, marketMember, createMarketSession, marketCatalogue, marketCompletion, marketCookie, marketOrder, marketSession, marketTenant } from './market.js';
import { internalEnterprise } from '../src/admin-v2/enterprise.js';
import { marketDemoModelIds } from '../src/mock/model-data.js';
import { auditLogDetail, auditLogPage } from './audit-log.js';
import { PRIVATE_SITE } from '../src/site-config.mjs';
import { readPublishedSiteSetting, savePublishedSiteSetting, validateAgreements } from './site-settings.js';
import { PORTAL_HOME_ENDPOINT, portalHomeUrl } from '../src/portal-home.mjs';
import { AUDIT_ACTIONS, AUDIT_RESOURCES, AUDIT_RESULTS, AUDIT_SOURCES } from '../src/admin-v2/platform-audit.mjs';
import { domainModel } from '../src/mock/model-fields.js';
import { serviceCallsEnabled, serviceReferences, offerKey, providerOffer } from '../src/service-access.mjs';
import { loadModelWorkspace } from './model-repository.js';
import { supplierDirectory } from '../src/admin-v2/moma-provider.js';
import { connectionDirectoryRows } from '../src/admin-v2/channel-connection-directory.js';
import { channelHealthCatalogue } from '../src/admin-v2/channel-health-observations.mjs';
const PREFIX = '/api/5120';
const COOKIE = 'moma5120_session';
const encoder = new TextEncoder();
const MAX_BODY = 256 * 1024;
const WRITE_ROLES = ['平台管理员', '运营人员'];
const LOGIN_FIELDS = new Map([['/auth/sign-in','identifier'], ['/auth/login','accountId'], ['/market/login','tenantId']]);

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

async function authenticate(request, db) {
  const token = request.headers.get('cookie')?.split(';').map(part => part.trim()).find(part => part.startsWith(COOKIE + '='))?.slice(COOKIE.length + 1);
  if (!token || !/^[a-f0-9]{64}$/.test(token)) fail(401, 'SESSION_EXPIRED', '请先登录后台测试账号');
  const row = await db.prepare(`SELECT a.id,a.name,a.role,COALESCE(a.login_code,a.id) AS loginCode,s.id AS session_id FROM admin_sessions s
    JOIN admin_accounts a ON a.id=s.actor_id WHERE s.token_hash=? AND s.expires_at>? AND s.revoked_at IS NULL AND a.enabled=1`).bind(await digest(token), Date.now()).first();
  if (!row) fail(401, 'SESSION_EXPIRED', '会话已失效，请重新登录');
  return row;
}

async function revokeSessions(request, db) {
  let actor;
  try { actor = await authenticate(request, db); } catch (error) { if (error.status !== 401) throw error; }
  if (actor) await db.prepare('UPDATE admin_sessions SET revoked_at=? WHERE id=?').bind(Date.now(), actor.session_id).run();
  const tenant = await marketSession(db, request);
  if (tenant) await db.prepare('DELETE FROM market_sessions WHERE token_hash=?').bind(tenant.hash).run();
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

async function route(request, env) {
  const url = new URL(request.url), method = request.method;
  let path;
  try { path = decodeURIComponent(url.pathname.slice(PREFIX.length)); } catch { fail(400, 'INVALID_INPUT', '路径编码无效'); }

  const resource = /^\/(materials|services|suppliers|channels|operations)\/([A-Za-z0-9:_.-]{1,200})(?:\/(workspace|visibility|history))?$/.exec(path);
  const dictionary = /^\/dictionary\/(items|units|currencies)$/.exec(path);
  const packagePath = ['/package-management', '/package-management/commands', '/package-management/factor-history'].includes(path);
  const trafficPath = path === '/traffic-limits';
  const trafficHistoryPath = path === '/traffic-limits/history';
  const auditPath = /^\/audit-logs(?:\/([A-Za-z0-9:_.-]{1,200}))?$/.exec(path);
  const credentialPath = /^\/channels\/([A-Za-z0-9:_.-]{1,200})\/verify-credential$/.exec(path);
  const marketPaths = ['/market/catalogue','/market/logout','/market/orders','/market/completions'];
  const loginField = LOGIN_FIELDS.get(path);
  const privateSite = PRIVATE_SITE || env.MOMA_PRIVATE_SITE === '1';
  const agreementPath = privateSite && path === '/site-agreements';
  const portalPath = privateSite && path === PORTAL_HOME_ENDPOINT;
  const known = path === '/channel-health' || path === '/deployment/license' || agreementPath || portalPath || loginField || marketPaths.includes(path) || trafficPath || trafficHistoryPath || auditPath || credentialPath || packagePath || ['/auth/logout','/auth/me','/materials','/services','/suppliers','/health','/model-market/visibility','/model-operations','/model-operations/commands','/channels/consistency'].includes(path) || path.startsWith('/simulation/') || resource || dictionary;
  if (!known) fail(404, 'NOT_FOUND', 'API 不存在');
  if (!env.MODEL_OPS_DB) fail(503, 'DATABASE_UNAVAILABLE', '模型运营数据库尚未绑定');
  const db = env.MODEL_OPS_DB;
  const installedLicense = await readInstalledLicense(db);
  const license = installedLicense ? effectiveInstalledLicense(installedLicense) : deploymentLicense(env);
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
  const requireCommerce = (write = false) => {
    if (write ? !license.commerceWritable : !license.commercial) fail(403, 'LICENSE_REQUIRED', LICENSE_UNAVAILABLE);
  };
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
  if (path === '/auth/logout' && method === 'POST') {
    await revokeSessions(request, db);
    const response = json({ loggedOut: true }, 200, { 'Set-Cookie': cookie('', 0) });
    response.headers.append('Set-Cookie', cookie('', 0).replace(COOKIE + '=', marketCookie + '='));
    return response;
  }
  if (loginField) {
    if (method !== 'POST') fail(405, 'METHOD_NOT_ALLOWED', '请求方法不支持');
    const body = await bodyJson(request, 4096); fields(body, [loginField,'accessCode']);
    const id = body[loginField], invalid = loginField === 'tenantId' ? '客户编号或密码无效' : '账号或密码无效';
    if (!identifier(id) || typeof body.accessCode !== 'string' || body.accessCode.length < 8 || body.accessCode.length > 128) fail(401, 'INVALID_LOGIN', invalid);
    let hashes;
    try { hashes = JSON.parse(env.MODEL_OPS_LOGIN_HASHES || '{}'); } catch { fail(503, 'LOGIN_UNAVAILABLE', '测试账号登录尚未配置'); }
    if (!hashes || typeof hashes !== 'object' || Array.isArray(hashes)) fail(503, 'LOGIN_UNAVAILABLE', '测试账号登录尚未配置');
    const expected = Object.hasOwn(hashes, id) ? hashes[id] : null;
    const valid = await secureEqual(await digest(body.accessCode), typeof expected === 'string' ? expected : '0'.repeat(64));
    if (!valid || typeof expected !== 'string') fail(401, 'INVALID_LOGIN', invalid);
    const account = loginField !== 'tenantId' && await db.prepare('SELECT id,name,role,COALESCE(login_code,id) AS loginCode FROM admin_accounts WHERE COALESCE(login_code,id)=? AND enabled=1').bind(id).first();
    const member = loginField !== 'accountId' && await marketMember(db, id);
    const tenant = loginField !== 'accountId' && await marketTenant(db, member?.tenantId || id);
    if ((!account && !tenant) || (account && tenant)) fail(401, 'INVALID_LOGIN', invalid);
    await revokeSessions(request, db);
    if (tenant) {
      if (!license.commercial && (!member || internalEnterprise(await marketReference(db))?.id !== tenant.id)) requireCommerce();
      const token = await createMarketSession(db, tenant, member);
      const response = json({tenant}, 200, {'Set-Cookie': cookie(token).replace(COOKIE+'=',marketCookie+'=')});
      response.headers.append('Set-Cookie', cookie('', 0));
      return response;
    }
    const token = randomToken(), at = Date.now();
    await db.prepare('INSERT INTO admin_sessions(id,token_hash,actor_id,created_at,expires_at) VALUES(?,?,?,?,?)').bind(crypto.randomUUID(), await digest(token), account.id, at, at + 28800000).run();
    const response = json({ account, expiresAt: at + 28800000 }, 200, { 'Set-Cookie': cookie(token) });
    response.headers.append('Set-Cookie', cookie('', 0).replace(COOKIE+'=',marketCookie+'='));
    return response;
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
    if (path === '/market/catalogue' && method === 'GET') {
      const projectId = url.searchParams.get('project');
      if (projectId && !identifier(projectId)) fail(400, 'INVALID_INPUT', '项目标识无效');
      return json(await marketCatalogue(db, await marketSession(db, request), { projectId, ...license }));
    }
    if (method !== 'POST' || path === '/market/catalogue') fail(405,'METHOD_NOT_ALLOWED','请求方法不支持');
    const session=await marketSession(db,request);
    if (path==='/market/logout') {
      if (session) await db.prepare('DELETE FROM market_sessions WHERE token_hash=?').bind(session.hash).run();
      return json({loggedOut:true},200,{'Set-Cookie':cookie('',0).replace(COOKIE+'=',marketCookie+'=')});
    }
    if (!session) fail(401,'TENANT_SESSION_REQUIRED','请先登录模型广场');
    requireCommerce(path === '/market/orders');
    if (session.member) fail(403, 'PROJECT_REQUIRED', '请在所属项目中订购或调用服务');
    const body=await bodyJson(request,8192);
    if (path==='/market/orders') {
      fields(body,['offerIds']);
      if (!Array.isArray(body.offerIds) || !body.offerIds.length || body.offerIds.length>20 || new Set(body.offerIds).size!==body.offerIds.length || body.offerIds.some(id=>typeof id!=='string' || !/^[A-Za-z0-9:_.-]{1,512}$/.test(id))) fail(400,'INVALID_INPUT','请选择 1–20 项不同的渠道服务');
      return json(await marketOrder(db,session,body.offerIds));
    }
    fields(body,['requestId','model','messages']);
    if (!identifier(body.requestId) || typeof body.model!=='string' || !/^[A-Za-z0-9][A-Za-z0-9._/-]{0,199}$/.test(body.model) ||
        !Array.isArray(body.messages) || body.messages.length!==1 || body.messages[0]?.role!=='user' ||
        typeof body.messages[0].content!=='string' || !body.messages[0].content.trim() || body.messages[0].content.length>2000 ||
        Object.keys(body.messages[0]).some(key=>!['role','content'].includes(key))) fail(400,'INVALID_INPUT','请填写当前调用标识和 1–2000 字的消息');
    return json(await marketCompletion(db,session,body));
  }
  const actor = await authenticate(request, db);
  if (credentialPath) {
    if (method !== 'POST') fail(405, 'METHOD_NOT_ALLOWED', '请求方法不支持');
    if (actor.role !== '平台管理员') fail(403, 'FORBIDDEN', '仅平台管理员可验证后查看凭证摘要');
    const body = await bodyJson(request, 4096);
    fields(body, ['keyId', 'accessCode']);
    if (!identifier(body.keyId) || typeof body.accessCode !== 'string' || body.accessCode.length < 8 || body.accessCode.length > 128) fail(400, 'INVALID_INPUT', '请输入当前账号访问码');
    let hashes;
    try { hashes = JSON.parse(env.MODEL_OPS_LOGIN_HASHES || '{}'); } catch { fail(503, 'LOGIN_UNAVAILABLE', '当前账号验证尚未配置'); }
    const expected = hashes && Object.hasOwn(hashes, actor.loginCode) ? hashes[actor.loginCode] : null;
    const verified = await secureEqual(await digest(body.accessCode), typeof expected === 'string' ? expected : '0'.repeat(64));
    const result = await channelCredentialAccess(db, actor, credentialPath[1], body.keyId, verified && typeof expected === 'string');
    if (!result.verified) fail(403, 'INVALID_CREDENTIAL_ACCESS_CODE', '当前账号访问码不正确');
    return json(result);
  }
  if (path === '/auth/me' && method === 'GET') return json({ account: { id: actor.id, name: actor.name, role: actor.role, loginCode: actor.loginCode } });
  const pageId = path === '/channel-health' ? 'providers-health' : auditPath ? 'audit-logs' : trafficPath || trafficHistoryPath ? 'traffic-limits' : packagePath ? 'package-production' : dictionary ? 'tariff-dictionary' : path.startsWith('/materials') ? 'model-templates'
    : path.startsWith('/suppliers') || path.startsWith('/channels') ? 'providers-reference' : 'listing-new';
  if (!canAccessPage(actor.role, pageId)) fail(403, 'FORBIDDEN', '当前账号无此页面访问权限');
  if (path === '/channel-health') {
    if (method !== 'GET') fail(405, 'METHOD_NOT_ALLOWED', '请求方法不支持');
    const state = await loadModelWorkspace(db, actor);
    const providers = supplierDirectory(state).filter(row => !row.deletedAt && !row.id.startsWith('service-review-provider-'));
    return json({ catalogue: channelHealthCatalogue(connectionDirectoryRows(state, providers), canAccessPage(actor.role, 'providers-reference')) });
  }
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
    if ((action && !Object.hasOwn(AUDIT_ACTIONS, action)) || (status && !Object.hasOwn(AUDIT_RESULTS, status)) ||
        (type && !Object.hasOwn(AUDIT_RESOURCES, type)) || (source && !Object.hasOwn(AUDIT_SOURCES, source))) fail(400, 'INVALID_INPUT', '审计筛选条件无效');
    if (eventId && !identifier(eventId)) fail(400, 'INVALID_INPUT', '事件 ID 格式无效');
    const account = (params.get('actor') || '').trim();
    if (account.length > 100) fail(400, 'INVALID_INPUT', '操作人搜索内容过长');
    const data = await auditLogPage(db, { limit, after, from, to, eventId, action, status, type, source, q: q.toLowerCase(), actor: account.toLowerCase() });
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
    const body = await bodyJson(request, 10 * 1024 * 1024 + 65536);
    if (commercialModelWrite(body.action)) requireCommerce(true);
    if (!license.commercial && body.action?.operation === 'marketCardSetStatus' && body.action.data?.listing_stage === 'gray') {
      const scope = body.action.data?.scope;
      const reference = await marketReference(db);
      const own = internalEnterprise(reference)?.id;
      if (scope?.tenantIds?.length || (Array.isArray(scope?.organizationIds) && scope.organizationIds.some(id =>
        !(reference.organizations || []).some(row => row.id === id && row.tenantId === own))) ||
        (Array.isArray(scope?.projectIds) && scope.projectIds.some(id =>
          !(reference.projects || []).some(row => row.id === id && row.tenantId === own)))) {
        requireCommerce();
      }
    }
    const auditSource = request.headers.get('sec-fetch-site') === 'same-origin' ? 'web' : undefined;
    return json(await modelCommand(db, actor, body, request.headers.get('idempotency-key'), license, { auditSource }));
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
    if (kind === 'operations' && !action && method === 'GET') {
      const row = await db.prepare('SELECT id,response_json FROM operations WHERE id=? AND actor_id=?').bind(id, actor.id).first();
      if (!row) fail(404, 'NOT_FOUND', '未查到已提交操作，请使用原标识核对或重试');
      return json(JSON.parse(row.response_json));
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

