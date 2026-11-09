import { activeCustomer } from '../src/service-access.mjs';
import { authPhone, encodeAuthPassword, matchesAuthPassword } from '../src/auth-state.mjs';

export const marketCookie = 'moma5120_market';
export const customerSecretHash = async value => Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(value))),
  byte=>byte.toString(16).padStart(2,'0')).join('');
const fail=(status,code,message)=>{throw Object.assign(new Error(message),{status,code});};

export async function verifiedCustomerCredential(db,userId,password) {
  const credential=await db.prepare('SELECT salt,digest FROM customer_credentials WHERE user_id=?').bind(userId).first();
  return await matchesAuthPassword(password,credential) ? credential.digest : null;
}

function signupPhone(value) {
  try { return authPhone(value); }
  catch { fail(400,'INVALID_INPUT','请填写有效的中国大陆手机号'); }
}

export async function issueCustomerChallenge(db,phone,purpose) {
  const username=signupPhone(phone), id=crypto.randomUUID(), now=Date.now(), expiresAt=now+300000;
  const code=String(crypto.getRandomValues(new Uint32Array(1))[0]%1000000).padStart(6,'0');
  const [written]=await db.batch([
    db.prepare(`INSERT INTO customer_signup_challenges(username,challenge_id,digest,issued_at,expires_at,purpose) VALUES(?,?,?,?,?,?)
      ON CONFLICT(username) DO UPDATE SET challenge_id=excluded.challenge_id,digest=excluded.digest,issued_at=excluded.issued_at,
        expires_at=excluded.expires_at,purpose=excluded.purpose,attempts=0 WHERE issued_at<=?`)
      .bind(username,id,await customerSecretHash(id+':'+code),now,expiresAt,purpose,now-60000),
    db.prepare('DELETE FROM customer_signup_challenges WHERE username IN (SELECT username FROM customer_signup_challenges WHERE expires_at<=? LIMIT 100)').bind(now),
  ]);
  if(!written.meta.changes)fail(429,'CHALLENGE_COOLDOWN','请等待 60 秒后重新获取验证码');
  return {id,code,expiresAt};
}

async function verifyCustomerChallenge(db,username,purpose,challengeId,code) {
  if(typeof challengeId!=='string' || !/^[a-f0-9-]{36}$/.test(challengeId) || typeof code!=='string' || !/^\d{6}$/.test(code))
    fail(400,'INVALID_INPUT','请填写有效验证码');
  const challenge=await db.prepare('SELECT digest FROM customer_signup_challenges WHERE username=? AND purpose=? AND challenge_id=? AND expires_at>? AND attempts<5')
    .bind(username,purpose,challengeId,Date.now()).first();
  const proof=await customerSecretHash(challengeId+':'+code);
  if(!challenge || challenge.digest!==proof){
    if(challenge)await db.prepare('UPDATE customer_signup_challenges SET attempts=attempts+1 WHERE username=? AND challenge_id=? AND attempts<5')
      .bind(username,challengeId).run();
    fail(422,'INVALID_VERIFICATION','验证码错误或已过期');
  }
  return proof;
}

export async function customerCredential(password) {
  if(typeof password!=='string')fail(400,'INVALID_INPUT','请填写密码');
  try {return await encodeAuthPassword(password);}
  catch (error) { fail(422,'INVALID_INPUT',error.message); }
}

export async function registerCustomer(db,{phone,challengeId,code,password,consent}) {
  const username=signupPhone(phone), at=Date.now();
  if(consent!==true)fail(400,'INVALID_INPUT','请确认协议');
  const proof=await verifyCustomerChallenge(db,username,'signup',challengeId,code);
  const credential=await customerCredential(password);
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
        AND EXISTS (SELECT 1 FROM customer_signup_challenges WHERE username=? AND purpose='signup' AND challenge_id=? AND digest=? AND expires_at>? AND attempts<5)`)
      .bind(JSON.stringify(user),JSON.stringify(tenant),JSON.stringify(project),username,username,username,challengeId,proof,Date.now()),
    db.prepare('INSERT INTO customer_credentials(user_id,salt,digest) SELECT ?,?,? WHERE changes()=1')
      .bind(userId,credential.salt,credential.digest),
    db.prepare('DELETE FROM customer_signup_challenges WHERE changes()=1 AND username=? AND challenge_id=?').bind(username,challengeId),
    db.prepare('UPDATE db_state SET commit_seq=commit_seq+1 WHERE id=1 AND changes()=1'),
  ]);
  if(!written.meta.changes)fail(409,'REGISTRATION_CONFLICT','该手机号可能已注册，或当前验证码已失效，请登录或重新获取验证码');
  return {userId,tenant:{id:tenant.id,name:tenant.name,type:tenant.type}};
}

export async function resetCustomerPassword(db,{phone,challengeId,code,password}) {
  const phoneNumber=signupPhone(phone);
  const proof=await verifyCustomerChallenge(db,phoneNumber,'reset',challengeId,code);
  const {results}=await db.prepare(`SELECT c.user_id FROM model_workspace w,json_each(w.reference_json,'$.users') u
    JOIN customer_credentials c ON c.user_id=json_extract(u.value,'$.id') WHERE w.id=1
      AND json_extract(u.value,'$.status')='正常' AND json_extract(u.value,'$.phone')=? LIMIT 2`).bind(phoneNumber).all();
  if(results.length!==1)fail(422,'PASSWORD_UNAVAILABLE','该手机号未关联可找回密码的客户账号');
  const {user_id:userId}=results[0], credential=await customerCredential(password);
  const [updated]=await db.batch([
    db.prepare(`UPDATE customer_credentials SET salt=?,digest=? WHERE user_id=?
      AND EXISTS (SELECT 1 FROM customer_signup_challenges WHERE username=? AND purpose='reset' AND challenge_id=? AND digest=? AND expires_at>? AND attempts<5)
      AND EXISTS (SELECT 1 FROM model_workspace w,json_each(w.reference_json,'$.users') u WHERE w.id=1
        AND json_extract(u.value,'$.id')=? AND json_extract(u.value,'$.phone')=? AND json_extract(u.value,'$.status')='正常')`)
      .bind(credential.salt,credential.digest,userId,phoneNumber,challengeId,proof,Date.now(),userId,phoneNumber),
    db.prepare('DELETE FROM customer_signup_challenges WHERE changes()=1 AND username=? AND challenge_id=?').bind(phoneNumber,challengeId),
    db.prepare('DELETE FROM market_sessions WHERE changes()=1 AND user_id=?').bind(userId),
  ]);
  if(!updated.meta.changes)fail(409,'PASSWORD_CONFLICT','验证码或账号已变化，请重新获取验证码');
}

export async function changeCustomerPassword(db,session,{currentPassword,password}) {
  const oldDigest=await verifiedCustomerCredential(db,session.user.id,currentPassword);
  if(!oldDigest)fail(403,'PASSWORD_UNAVAILABLE','当前密码错误或该账号使用内置密码');
  const credential=await customerCredential(password);
  const [updated]=await db.batch([
    db.prepare(`UPDATE customer_credentials SET salt=?,digest=? WHERE user_id=? AND digest=?
      AND EXISTS (SELECT 1 FROM market_sessions WHERE token_hash=? AND user_id=? AND expires_at>?)`)
      .bind(credential.salt,credential.digest,session.user.id,oldDigest,session.hash,session.user.id,Date.now()),
    db.prepare('DELETE FROM market_sessions WHERE changes()=1 AND user_id=?').bind(session.user.id),
  ]);
  if(!updated.meta.changes)fail(409,'PASSWORD_CONFLICT','密码或会话已变化，请重新登录');
}

export async function customerIdentity(db, value, field = 'id', tenantId = null) {
  const {results}=await db.prepare(`SELECT u.value AS user_json,
    EXISTS(SELECT 1 FROM customer_credentials WHERE user_id=json_extract(u.value,'$.id')) AS password_managed,
    (SELECT commit_seq FROM db_state WHERE id=1) AS commit_seq,
    (SELECT g.value FROM json_each(w.reference_json,'$.grants') g
      WHERE json_extract(g.value,'$.subjectType')='tenant' AND json_extract(g.value,'$.subjectId')=?) AS grant_json,
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
      AND json_extract(u.value,'$.status')='正常' LIMIT 2`).bind(tenantId,value).all();
  if(results.length!==1)return null;
  const row=results[0], user=JSON.parse(row.user_json), memberships=JSON.parse(row.memberships_json);
  const spaces=JSON.parse(row.tenants_json).filter(activeCustomer).flatMap(tenant=>{
    const membership=memberships.find(item=>item.tenantId===tenant.id);
    if(tenant.type==='个人' ? tenant.ownerId!==user.id : !membership)return [];
    return [{id:tenant.id,name:tenant.name,type:tenant.type,role:tenant.type==='个人'?'个人用户':membership.role}];
  });
  return {user,spaces,passwordManaged:Boolean(row.password_managed),commitSeq:row.commit_seq,grant:JSON.parse(row.grant_json || 'null')};
}

export async function marketSession(db, request) {
  const token=request.headers.get('cookie')?.split(';').map(part=>part.trim()).find(part=>part.startsWith(marketCookie+'='))?.slice(marketCookie.length+1);
  if(!token || !/^[a-f0-9]{64}$/.test(token))return null;
  const hash=await customerSecretHash(token);
  const session=await db.prepare('SELECT user_id,tenant_id FROM market_sessions WHERE token_hash=? AND expires_at>?').bind(hash,Date.now()).first();
  if(!session?.user_id)return null;
  const identity=await customerIdentity(db,session.user_id,'id',session.tenant_id);
  const tenant=identity?.spaces.find(space=>space.id===session.tenant_id);
  return tenant ? {...identity,tenant:{...tenant,grant:identity.grant},hash} : null;
}

export async function createMarketSession(db, userId, tenantId, credentialDigest = null) {
  const token=Array.from(crypto.getRandomValues(new Uint8Array(32)),byte=>byte.toString(16).padStart(2,'0')).join('');
  const now=Date.now();
  const [inserted]=await db.batch([
    db.prepare(`INSERT INTO market_sessions(token_hash,tenant_id,expires_at,user_id) SELECT ?,?,?,?
      WHERE ? IS NULL OR EXISTS (SELECT 1 FROM customer_credentials WHERE user_id=? AND digest=?)`)
      .bind(await customerSecretHash(token),tenantId,now+28800000,userId,credentialDigest,userId,credentialDigest),
    db.prepare('INSERT INTO tenant_login_events(id,user_id,created_at) SELECT ?,?,? WHERE changes()=1').bind(crypto.randomUUID(),userId,now),
    db.prepare(`INSERT INTO customer_last_login(user_id,logged_at) SELECT ?,? WHERE changes()=1
      ON CONFLICT(user_id) DO UPDATE SET logged_at=excluded.logged_at WHERE excluded.logged_at>customer_last_login.logged_at`).bind(userId,now),
    db.prepare('DELETE FROM market_sessions WHERE token_hash IN (SELECT token_hash FROM market_sessions WHERE expires_at<=? LIMIT 100)').bind(now),
    db.prepare(`DELETE FROM tenant_login_events WHERE created_at<? OR id IN
      (SELECT id FROM tenant_login_events ORDER BY created_at DESC LIMIT 100 OFFSET 200)`).bind(now-7*86400000),
  ]);
  if(!inserted.meta.changes)fail(409,'PASSWORD_CONFLICT','密码已变化，请重新登录');
  return token;
}
