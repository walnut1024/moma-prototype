import { createHash, randomBytes } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { startLocalBackend } from './local-runtime.js';

const persistPath=fileURLToPath(new URL('./.local/',import.meta.url));
const loginFile=fileURLToPath(new URL('./.local/demo-logins.json',import.meta.url));
let loginHashes;
if (process.env.MODEL_OPS_LOGIN_HASHES) {
  loginHashes=JSON.parse(process.env.MODEL_OPS_LOGIN_HASHES);
  if (!Object.keys(loginHashes).length || Object.values(loginHashes).some(value=>!/^[a-f0-9]{64}$/.test(value))) {
    throw Error('MODEL_OPS_LOGIN_HASHES 须为账号到 SHA-256 摘要的映射');
  }
} else {
  await mkdir(persistPath,{recursive:true,mode:0o700});
  try {
    const accounts=Object.fromEntries(['yyg','zqzh','grzh'].map(id=>[id,randomBytes(16).toString('base64url')]));
    await writeFile(loginFile,JSON.stringify(accounts,null,2)+'\n',{mode:0o600,flag:'wx'});
  } catch (error) { if (error.code!=='EEXIST') throw error; }
  const accounts=JSON.parse(await readFile(loginFile,'utf8'));
  loginHashes=Object.fromEntries(Object.entries(accounts).map(([id,password])=>[id,createHash('sha256').update(password).digest('hex')]));
  console.log('演示账号密码文件（仅限本机）：'+loginFile);
}
const local=await startLocalBackend({persistPath,loginHashes,port:Number(process.env.MOMA_5120_BACKEND_PORT || 8787),presets:true});
console.log(`5.12.0 原型 API: ${local.url}api/5120/health`);
for (const signal of ['SIGINT','SIGTERM']) process.once(signal,async()=>{await local.runtime.dispose();process.exit(0);});
