import { createHash, randomUUID } from 'node:crypto';
import { API_PREFIX } from '../api-path.js';
import { completeServiceShowcase } from '../src/admin-v2/service-showcase-client.js';
import { configureOnboardingTransport } from '../src/admin-v2/onboarding-client.js';
import { useCloudMockSnapshot, clearCloudMockSnapshot } from '../src/admin-v2/mock-onboarding-service.js';
import { maskApiKey } from '../src/api-key-utils.mjs';
import { domainModelWorkspace } from '../src/mock/model-fields.js';
import { PROJECT_MEMBER } from '../src/project-access.mjs';
import { initializeApplication } from '../server/application.js';
import { startLocalBackend } from './local-runtime.js';

const tenantId = 'zqzh', departmentId = 'org-civic-services';
const staff = [['gu.ning', '顾宁'], ['zhou.jing', '周婧'], ['xu.mingyuan', '许明远']];
const password = 'moma-tenant-demo-5120';
const digest = value => createHash('sha256').update(value).digest('hex');

// This fixture runs in a new, in-memory D1 workspace created by this launcher.
async function seedStaff(db) {
  const state = JSON.parse(await db.prepare('SELECT reference_json FROM model_workspace WHERE id=1').first('reference_json'));
  const at = new Date().toISOString();
  const fields = { status:'正常', demo:true, createdAt:at, updatedAt:at };
  state.tenants.find(row => row.id === tenantId).modelRules = [];
  state.organizations.push({ ...fields, id:departmentId, tenantId, parentId:'org-zqzh', name:'数字政务部' });
  for (const [login, name] of staff) {
    state.users.push({ ...fields, id:login, login, name, email:login+'@civic.example', initialized:true, source:'内置演示' });
    state.memberships.push({ ...fields, id:'member-'+login, tenantId, userId:login, name, organizationId:departmentId, role:'普通成员', projectIds:[] });
  }
  await db.batch([
    db.prepare('UPDATE model_workspace SET reference_json=?,application_revision=application_revision+1 WHERE id=1').bind(JSON.stringify(state)),
    db.prepare('UPDATE db_state SET commit_seq=commit_seq+1 WHERE id=1'),
  ]);
}

async function startTenantDemo(port) {
  const loginHashes = Object.fromEntries(['admin-001', tenantId, ...staff.map(([login])=>login)].map(login=>[login,digest(password)]));
  const local = await startLocalBackend({ port, loginHashes, demo:true });
  const request = async (path, { method = 'GET', body, cookie, operationId } = {}) => {
    const response = await fetch(new URL(API_PREFIX + path, local.url), { method, headers:{
      ...(cookie && { cookie }),
      ...(method !== 'GET' && { origin:local.url.origin, 'x-moma-request':'1', 'content-type':'application/json' }),
      ...(operationId && { 'idempotency-key':operationId }),
    }, ...(body === undefined ? {} : { body:JSON.stringify(body) }) });
    const data = await response.json();
    if (!response.ok) throw Error(path + ' · ' + (data.error?.message || response.status));
    return { data, cookie:response.headers.get('set-cookie')?.split(';')[0] };
  };
  const login = (path, fields) => request(path, { method:'POST', body:{ ...fields, accessCode:password } });
  try {
    await initializeApplication(local.db);
    await seedStaff(local.db);
    const { cookie:admin } = await login('/auth/login', { accountId:'admin-001' });
    const getModels = async () => {
      const { data } = await request('/model-operations', { cookie:admin });
      const state = domainModelWorkspace(data);
      useCloudMockSnapshot(state,state.cloudMockState);
      return state;
    };
    let models = await getModels();
    configureOnboardingTransport(async (path, options) => {
      const method = options.method || 'GET';
      const operationId = method === 'GET' ? undefined : options.body?.operationId || randomUUID();
      const { data } = await request('/simulation'+path, { method, cookie:admin, operationId,
        body:operationId ? {...options.body,operationId} : undefined });
      useCloudMockSnapshot(models,data.mockState);
      return data.result;
    });
    models = await completeServiceShowcase(models, async (previous, action) => {
      const operationId = randomUUID();
      await request('/model-operations/commands', { method:'POST', cookie:admin, operationId,
        body:{ operationId, expectedRevision:previous.revision, action } });
      models = await getModels();
      return models;
    });

    const primaryModel = models.models.find(model => model.serviceShowcase && model.modelId === 'deepseek-v4-flash-0731');
    if (!primaryModel) throw Error('政企演示租户缺少 DeepSeek 模型服务');
    const { data:application } = await request('/application', { cookie:admin });
    const operationId = randomUUID();
    await request('/application/commands', { method:'POST', cookie:admin, operationId, body:{
      operationId, expectedRevision:application.revision,
      action:{ type:'tenantServiceSettings', operation:'open-models', tenantId, data:{modelIds:[primaryModel.id]} },
    } });
    const { cookie:customer } = await login('/market/login', { username:tenantId, accountType:'enterprise' });
    const { data:catalogue } = await request('/market/catalogue', { cookie:customer });
    const offer = catalogue.services.find(row=>row.serviceModelId===primaryModel.id && row.canOrder);
    if (!offer) throw Error('政企演示租户缺少可订购的 DeepSeek 模型服务');
    await request('/market/orders', { method:'POST', cookie:customer, body:{offerIds:[offer.id]} });

    const workspace = '/tenants/'+tenantId;
    const tenantCommand = async (action,data) => {
      const current = await request(workspace+'/workspace',{cookie:admin});
      const { data:result } = await request(workspace+'/commands', { method:'POST', cookie:admin,
        body:{operationId:randomUUID(),expectedRevision:current.data.revision,tenantId,action,data} });
      return result.operationId;
    };
    const projectId = 'project-' + await tenantCommand('projectCreate', { name:'政务热线知识助手',
      description:'为热线坐席检索办事指南与常见问题，辅助生成答复草稿。', departmentId, administratorId:'member-gu.ning' });
    const updateProject = (type,input) => tenantCommand('projectUpdate',{projectId,type,input});
    await updateProject('members',{memberId:'member-zhou.jing',role:PROJECT_MEMBER});
    await updateProject('tokenBudget',{period:'month',limit:'30',rpm:'120',tpm:'120000'});
    await updateProject('models',[{modelId:primaryModel.id,rpm:90,tpm:90000}]);
    const key = 'sk-demo-'+randomUUID();
    await tenantCommand('keys',{projectId,billing:'按量付费',rows:[{id:randomUUID(),name:'热线知识助手 · 后端服务',
      enabled:true,models:[primaryModel.id],credentialDigest:digest(key),secretPreview:maskApiKey(key)}]});
    return local;
  } catch (error) {
    await local.runtime.dispose();
    throw error;
  } finally {
    configureOnboardingTransport(null);
    clearCloudMockSnapshot();
  }
}

const local = await startTenantDemo(Number(process.env.MOMA_5120_BACKEND_PORT || 15120));
console.log('5.12.0 政企演示 API：'+new URL(API_PREFIX,local.url));
for (const signal of ['SIGINT','SIGTERM']) process.once(signal,async()=>{await local.runtime.dispose();process.exit(0);});
