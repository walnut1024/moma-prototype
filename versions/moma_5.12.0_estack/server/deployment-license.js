import { deploymentLicense, LICENSE_NAMES } from '../src/deployment-license.mjs';

const kind = 'deployment-license';
const id = 'installed';
const encoder = new TextEncoder();
const decoder = new TextDecoder('utf-8', { fatal:true });
const decode = value => Uint8Array.from(atob(value.replaceAll('-', '+').replaceAll('_', '/')), char => char.charCodeAt(0));
const parse = value => JSON.parse(decoder.decode(decode(value)));
const problem = (status, code, message) => Object.assign(Error(message), { status, code });
const licenseTime = value => Number.isSafeInteger(value) && value >= 0 && value < 253402300800;

export async function verifyDeploymentLicense(token, env, now = Date.now()) {
  if (!env.MOMA_LICENSE_PUBLIC_KEY || !env.MOMA_LICENSE_DEPLOYMENT_ID) {
    throw problem(503, 'LICENSE_INSTALL_UNAVAILABLE', '当前部署尚未配置 License 校验，请联系部署管理员。');
  }
  if (typeof token !== 'string' || !/^[\w-]+\.[\w-]+\.[\w-]+$/.test(token)) {
    throw problem(422, 'INVALID_LICENSE', 'License 格式无效，请粘贴完整内容。');
  }
  let key;
  try {
    key = await crypto.subtle.importKey('jwk', JSON.parse(env.MOMA_LICENSE_PUBLIC_KEY),
      { name:'ECDSA', namedCurve:'P-256' }, false, ['verify']);
  } catch {
    throw problem(503, 'LICENSE_INSTALL_UNAVAILABLE', '当前部署的 License 校验配置无效，请联系部署管理员。');
  }
  let claims;
  try {
    const [header, payload, signature] = token.split('.');
    const { alg, crit, b64 } = parse(header);
    if (alg === 'ES256' && crit === undefined && b64 !== false &&
        await crypto.subtle.verify({ name:'ECDSA', hash:'SHA-256' }, key,
          decode(signature), encoder.encode(header + '.' + payload))) claims = parse(payload);
  } catch { /* Invalid encoding or signature. */ }
  if (!claims || !Object.hasOwn(LICENSE_NAMES, claims.edition) || typeof claims.jti !== 'string' ||
      !/^[A-Za-z0-9._-]{1,128}$/.test(claims.jti) || typeof claims.sub !== 'string' ||
      !claims.sub.trim() || claims.sub.length > 120 || !licenseTime(claims.nbf) ||
      !licenseTime(claims.exp) || claims.exp <= claims.nbf) {
    throw problem(422, 'INVALID_LICENSE', 'License 签名或内容无效，请核对后重试。');
  }
  if (claims.aud !== env.MOMA_LICENSE_DEPLOYMENT_ID) {
    throw problem(422, 'LICENSE_DEPLOYMENT_MISMATCH', '此 License 不适用于当前部署。');
  }
  if (claims.nbf * 1000 > now || claims.exp * 1000 <= now) {
    throw problem(422, 'LICENSE_OUTSIDE_VALIDITY', claims.exp * 1000 <= now ? '此 License 已到期。' : '此 License 尚未生效。');
  }
  return {
    edition:claims.edition, licenseId:claims.jti, licensedTo:claims.sub.trim(),
    startsAt:new Date(claims.nbf * 1000).toISOString(), expiresAt:new Date(claims.exp * 1000).toISOString(),
  };
}

export async function readInstalledLicense(db) {
  const payload = await db.prepare('SELECT payload_json FROM simulation_records WHERE kind=? AND id=?')
    .bind(kind, id).first('payload_json');
  return payload ? JSON.parse(payload) : null;
}

export function effectiveInstalledLicense(installed) {
  return deploymentLicense({ MOMA_LICENSE_EDITION:installed.edition, MOMA_LICENSE_EXPIRES_AT:installed.expiresAt });
}

export function licenseDetails(license, installed) {
  return {
    license, revision:installed?.revision ?? 0,
    licenseId:installed?.licenseId, licensedTo:installed?.licensedTo, startsAt:installed?.startsAt,
  };
}

export async function saveInstalledLicense(db, expected, verified, actorId) {
  const next = { ...verified, revision:expected + 1, installedAt:Date.now(), installedBy:actorId };
  // shortcut: reuse the prototype's namespaced settings store until deployment configuration has its own table
  const payload = await db.prepare(`
    INSERT INTO simulation_records(kind,id,payload_json)
    SELECT ?,?,? WHERE ?=0 OR EXISTS (SELECT 1 FROM simulation_records WHERE kind=? AND id=?)
    ON CONFLICT(kind,id) DO UPDATE SET payload_json=excluded.payload_json
    WHERE json_extract(simulation_records.payload_json,'$.revision')=?
    RETURNING payload_json
  `).bind(kind,id,JSON.stringify(next),expected,kind,id,expected).first('payload_json');
  return payload ? next : null;
}
