import { resolve } from 'node:path';
import { startLocalBackend } from './local-runtime.js';

const loginHashes = JSON.parse(process.env.MODEL_OPS_LOGIN_HASHES || '{}');
if (!Object.keys(loginHashes).length || Object.values(loginHashes).some(value => !/^[a-f0-9]{64}$/.test(value))) {
  throw Error('请通过 MODEL_OPS_LOGIN_HASHES 配置测试账号访问码的 SHA-256 摘要；不要把访问码写入源码');
}
const local = await startLocalBackend({ persistPath: resolve('versions/moma_5.12.0_estack/database/.local'), loginHashes, port: 8787 });
console.log(`5.12.0 模型运营 API: ${local.url}api/5120/health`);
console.log(`初始化：${local.initialization.initialized ? '首次导入' : '保留已有数据'}；配置来源：${local.seed.manifest.sourceId}`);
for (const signal of ['SIGINT','SIGTERM']) process.once(signal, async () => { await local.runtime.dispose(); process.exit(0); });
