import { API_PREFIX } from '../api-path.js';
import { fileURLToPath } from 'node:url';
import { startLocalBackend } from './local-runtime.js';

const persistPath = fileURLToPath(new URL('./.local/', import.meta.url));
const demoAccountIds = ['yyg', 'zqzh', 'grzh', 'admin-001', 'admin-002', 'admin-003'];
// The shared demo password is scoped to this local launcher.
const demoPasswordHash = '1624061227710f3d1407747cafae82bb6e0c387614575e8ca017ebc1fe5c454b';
const extraLoginHashes = JSON.parse(process.env.MODEL_OPS_LOGIN_HASHES || '{}');
if (!extraLoginHashes || typeof extraLoginHashes !== 'object' || Array.isArray(extraLoginHashes)
    || Object.values(extraLoginHashes).some(value => typeof value !== 'string' || !/^[a-f0-9]{64}$/.test(value))) {
  throw new Error('MODEL_OPS_LOGIN_HASHES 须为账号到 SHA-256 摘要的映射');
}
const loginHashes = { ...extraLoginHashes, ...Object.fromEntries(demoAccountIds.map(id => [id, demoPasswordHash])) };
const local=await startLocalBackend({persistPath,loginHashes,port:Number(process.env.MOMA_5120_BACKEND_PORT || 8787),presets:true});
// A password reset during a demo applies until the next local startup.
await local.db.batch([
  local.db.prepare("INSERT OR IGNORE INTO admin_accounts(id,name,role,enabled) VALUES('admin-003','模型运营','运营人员',1)"),
  local.db.prepare("UPDATE admin_accounts SET access_hash=NULL WHERE access_hash IS NOT NULL AND id IN (SELECT value FROM json_each(?))")
    .bind(JSON.stringify(demoAccountIds)),
]);
console.log(`5.12.0 原型 API: ${new URL(API_PREFIX + '/health', local.url)}`);
for (const signal of ['SIGINT','SIGTERM']) process.once(signal,async()=>{await local.runtime.dispose();process.exit(0);});
