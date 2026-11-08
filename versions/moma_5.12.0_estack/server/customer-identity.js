import { activeCustomer } from '../src/service-access.mjs';
import { authPhone, encodeAuthPassword, matchesAuthPassword } from '../src/auth-state.mjs';

export const marketCookie = 'moma5120_market';
const digest = async value => Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(value))),
  byte=>byte.toString(16).padStart(2,'0')).join('');
const fail=(status,code,message)=>{throw Object.assign(new Error(message),{status,code});};

export async function customerPasswordMatches(db,userId,password) {
  const credential=await db.prepare('SELECT salt,digest FROM customer_credentials WHERE user_id=?').bind(userId).first();
  return matchesAuthPassword(password,credential);
}

function signupPhone(value) {
  try { return authPhone(value); }
  catch { fail(400,'INVALID_INPUT','请填写有效的中国大陆手机号'); }
}

export async function issueSignupChallenge(db,phone) {
  const username=signupPhone(phone), id=crypto.randomUUID(), now=Date.now(), expiresAt=now+300000;
  const code=String(crypto.getRandomValues(new Uint32Array(1))[0]%1000000).padStart(6,'0');
  const [written]=await db.batch([
    db.prepare(`INSERT INTO customer_signup_challenges(username,challenge_id,digest,issued_at,expires_at) VALUES(?,?,?,?,?)
      ON CONFLICT(username) DO UPDATE SET challenge_id=excluded.challenge_id,digest=excluded.digest,issued_at=excluded.issued_at,
        expires_at=excluded.expires_at,attempts=0 WHERE issued_at<=?`).bind(username,id,await digest(id+':'+code),now,expiresAt,now-60000),
    db.prepare('DELETE FROM customer_signup_challenges WHERE username IN (SELECT username FROM customer_signup_challenges WHERE expires_at<=? LIMIT 100)').bind(now),
  ]);
  if(!written.meta.changes)fail(429,'CHALLENGE_COOLDOWN','请等待 60 秒后重新获取验证码');
  return {id,code,expiresAt};
}

export async function registerCustomer(db,{phone,challengeId,code,password,consent}) {
  const username=signupPhone(phone), at=Date.now();
  if(typeof challengeId!=='string' || !/^[a-f0-9-]{36}$/.test(challengeId) || typeof code!=='string' || !/^\d{6}$/.test(code) ||
      typeof password!=='string' || consent!==true)fail(400,'INVALID_INPUT','请填写验证码和密码并确认协议');
  const challenge=await db.prepare('SELECT digest FROM customer_signup_challenges WHERE username=? AND challenge_id=? AND expires_at>? AND attempts<5')
    .bind(username,challengeId,at).first();
  const proof=await digest(challengeId+':'+code);
  if(!challenge || challenge.digest!==proof){
    if(challenge)await db.prepare('UPDATE customer_signup_challenges SET attempts=attempts+1 WHERE username=? AND challenge_id=? AND attempts<5')
      .bind(username,challengeId).run();
    fail(422,'INVALID_VERIFICATION','验证码错误或已过期');
  }
  let credential;
  try { credential=await encodeAuthPassword(password); }
  catch (error) { fail(422,'INVALID_INPUT',error.message); }
  const userId=crypto.randomUUID(), tenantId=crypto.randomUUID(), now=new Date(at).toISOString(), name='用户'+username.slice(-4);
  const stamp={status:'正常',createdAt:now,updatedAt:now};
  const user={...stamp,id:userId,login:username,phone:username,name,nickname:name,initialized:true,registeredAt:now};
  const tenant={...stamp,id:tenantId,name,type:'个人',ownerId:userId,source:'手机号注册'};
  const project={...stamp,id:crypto.randomUUID(),tenantId,ownerId:userId,name:'默认项目',budget:0};
  const [written]=await db.batch([
    db.prepare(`UPDATE model_workspace SET reference_json=json_insert(reference_json,
        '$.users[#]',json(?),'$.tenants[#]',json(?),'$.projects[#]',json(?)),application_revision=application_revision+1
      WHERE id=1 AND application_revision>0 AND length(CAST(reference_json AS BLOB))<1498000
        AND NOT EXISTS (SELECT 1 FROM json_each(reference_json,'$.users') WHERE json_extract(value,'$.login')=? OR json_extract(value,'$.phone')=?)
        AND EXISTS (SELECT 1 FROM customer_signup_challenges WHERE username=? AND challenge_id=? AND digest=? AND expires_at>? AND attempts<5)`)
      .bind(JSON.stringify(user),JSON.stringify(tenant),JSON.stringify(project),username,username,username,challengeId,proof,Date.now()),
    db.prepare('INSERT INTO customer_credentials(user_id,salt,digest) SELECT ?,?,? WHERE changes()=1')
      .bind(userId,credential.salt,credential.digest),
    db.prepare('DELETE FROM customer_signup_challenges WHERE changes()=1 AND username=? AND challenge_id=?').bind(username,challengeId),
    db.prepare('UPDATE db_state SET commit_seq=commit_seq+1 WHERE id=1 AND changes()=1'),
  ]);
  if(!written.meta.changes)fail(409,'REGISTRATION_CONFLICT','该手机号可能已注册，或当前验证码已失效，请登录或重新获取验证码');
  return {userId,tenant:{id:tenant.id,name:tenant.name,type:tenant.type}};
}

export async function customerIdentity(db, value, field = 'id') {
  const {results}=await db.prepare(`SELECT u.value AS user_json,
    (SELECT json_group_array(json(t.value)) FROM json_each(w.reference_json,'$.tenants') t
      WHERE json_extract(t.value,'$.ownerId')=json_extract(u.value,'$.id') OR EXISTS (
        SELECT 1 FROM json_each(w.reference_json,'$.memberships') m
        WHERE json_extract(m.value,'$.tenantId')=json_extract(t.value,'$.id')
          AND json_extract(m.value,'$.userId')=json_extract(u.value,'$.id')
          AND json_extract(m.value,'$.status')='正常')) AS tenants_json,
    (SELECT json_group_array(json(m.value)) FROM json_each(w.reference_json,'$.memberships') m
      WHERE json_extract(m.value,'$.userId')=json_extract(u.value,'$.id') AND json_extract(m.value,'$.status')='正常') AS memberships_json
    FROM model_workspace w,json_each(w.reference_json,'$.users') u
    WHERE w.id=1 AND ${field==='username'?"LOWER(json_extract(u.value,'$.login'))":"json_extract(u.value,'$.id')"}=?
      AND json_extract(u.value,'$.status')='正常' LIMIT 2`).bind(value).all();
  if(results.length!==1)return null;
  const row=results[0], user=JSON.parse(row.user_json), memberships=JSON.parse(row.memberships_json);
  const spaces=JSON.parse(row.tenants_json).filter(activeCustomer).flatMap(tenant=>{
    const membership=memberships.find(item=>item.tenantId===tenant.id);
    if(tenant.type==='个人' ? tenant.ownerId!==user.id : !membership)return [];
    return [{id:tenant.id,name:tenant.name,type:tenant.type,role:tenant.type==='个人'?'个人用户':membership.role}];
  });
  return {user,spaces};
}

export async function marketSession(db, request) {
  const token=request.headers.get('cookie')?.split(';').map(part=>part.trim()).find(part=>part.startsWith(marketCookie+'='))?.slice(marketCookie.length+1);
  if(!token || !/^[a-f0-9]{64}$/.test(token))return null;
  const hash=await digest(token);
  const session=await db.prepare(`SELECT s.user_id,s.tenant_id,
    (SELECT g.value FROM model_workspace w,json_each(w.reference_json,'$.grants') g
      WHERE w.id=1 AND json_extract(g.value,'$.subjectType')='tenant' AND json_extract(g.value,'$.subjectId')=s.tenant_id) AS grant_json
    FROM market_sessions s WHERE s.token_hash=? AND s.expires_at>?`).bind(hash,Date.now()).first();
  if(!session?.user_id)return null;
  const identity=await customerIdentity(db,session.user_id);
  const tenant=identity?.spaces.find(space=>space.id===session.tenant_id);
  return tenant ? {...identity,tenant:{...tenant,grant:JSON.parse(session.grant_json || 'null')},hash} : null;
}

export async function createMarketSession(db, userId, tenantId) {
  const token=Array.from(crypto.getRandomValues(new Uint8Array(32)),byte=>byte.toString(16).padStart(2,'0')).join('');
  const now=Date.now();
  await db.batch([
    db.prepare('DELETE FROM market_sessions WHERE token_hash IN (SELECT token_hash FROM market_sessions WHERE expires_at<=? LIMIT 100)').bind(now),
    db.prepare('INSERT INTO market_sessions(token_hash,tenant_id,expires_at,user_id) VALUES(?,?,?,?)').bind(await digest(token),tenantId,now+28800000,userId),
    db.prepare('INSERT INTO tenant_login_events(id,user_id,created_at) VALUES(?,?,?)').bind(crypto.randomUUID(),userId,now),
    db.prepare(`DELETE FROM tenant_login_events WHERE created_at<? OR id IN
      (SELECT id FROM tenant_login_events ORDER BY created_at DESC LIMIT 100 OFFSET 200)`).bind(now-7*86400000),
  ]);
  return token;
}
