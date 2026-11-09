import { libraryRecord, modelLibrary } from '../src/admin-v2/model-library.js';
import { SHOWCASE_ZHIPU_PROVIDER_ID } from '../src/admin-v2/service-showcase.js';
import { loadModelWorkspace, modelChanges } from './model-repository.js';
import { save } from './model-commands.js';

export function addPrototypeAccounts(state) {
  state.admins.push({ id:'yyg', account:'yyg', name:'系统管理员', role:'平台管理员', status:'已启用' });
  for (const [id, name, type] of [['zqzh','政企演示账号','企业'],['grzh','个人演示账号','个人']]) {
    const projectId='project-'+id, organizationId='org-'+id;
    const record={ createdAt:state.updatedAt, updatedAt:state.updatedAt, status:'正常', demo:true };
    state.tenants.push({ ...record, id, name, type, ownerId:id, source:'内置演示' });
    state.users.push({ ...record, id, name, nickname:name, login:id, initialized:true, registeredAt:state.updatedAt });
    state.projects.push({ ...record, id:projectId, name:'默认项目', ownerId:id, tenantId:id, budget:0 });
    if (type === '企业') {
      state.organizations.push({ ...record, id:organizationId, parentId:null, name, tenantId:id, ownerId:id });
      state.memberships.push({ ...record, id:'member-'+id, name, userId:id, tenantId:id, projectIds:[projectId], organizationId, role:'租户管理员' });
    }
  }
}

export async function initializePrototypeCatalogue(db, actor) {
  if(await db.prepare("SELECT json_extract(meta_json,'$.modelData.prototypeCatalogueInstalled') AS installed FROM model_workspace WHERE id=1").first('installed'))return;
  const before=await loadModelWorkspace(db,actor || {id:'yyg',role:'平台管理员'},{simulation:false});
  if (before.modelData.prototypeCatalogueInstalled) return;
  const after=structuredClone(before), now=new Date().toISOString();
  const stamp={ createdAt:now, updatedAt:now, revision:1 };
  const addMaterial=(modelId,name,maker,type,profile) => {
    if (!modelLibrary(after).some(row=>row.modelId===modelId)) after.modelTemplates.push({
      ...stamp,id:modelId==='deepseek-v4-pro' && !libraryRecord(after,'model-1')?'model-1':'preset-'+modelId,modelId,name,maker,type,description:'用于原型模拟',profile:{ author:maker, ...profile },capabilities:{},
    });
  };
  const text={ inputModalities:['文本'],outputModalities:['文本'],tasks:['对话','文本生成'] };
  addMaterial('deepseek-v4-pro','DeepSeek V4 Pro','深度求索','text',text);
  addMaterial('seedance-2.5','Seedance 2.5','字节跳动','video',{
    inputModalities:['文本','图片'],outputModalities:['视频'],tasks:['文生视频'],
  });
  for (const [code, name, sources] of [
    ['mobile','移动云',[['direct','glm-5.3'],['resale','deepseek-flash']]],
    ['aliyun','阿里云',[['direct','deepseek-v4-pro'],['resale','seedance-2.5']]],
    ['deepseek','深度求索',[['direct','deepseek-v4-pro']]],
    ['zhipu','智谱',[['direct','glm-5.3']]],
  ]) {
    const id=code==='zhipu'?SHOWCASE_ZHIPU_PROVIDER_ID:code==='mobile'?'provider-self':'preset-supplier-'+code;
    const providerCode=code==='zhipu'?'zhipu-direct':'preset-'+code;
    if (after.providers.some(row=>row.id===id || row.name.trim().toLowerCase()===name.toLowerCase() || row.code?.toLowerCase()===providerCode)) continue;
    const provider={ ...stamp,id,name,code:providerCode,description:'原型模拟服务商',status:'已启用',
      sourceType:code==='mobile'?'selfHosted':'thirdParty',onboardingPresetId:'prototype-linkage',catalogModelIds:sources.map(([,slug])=>slug),catalogModels:[],catalogConnections:[],apiKeys:[] };
    for (const [origin, slug] of sources) {
      const match=modelLibrary(after).find(row=>row.modelId===slug), material=match && libraryRecord(after,match.id);
      if (!material) throw Error('演示渠道缺少模型资料：'+slug);
      const endpointId='preset-connection-'+code+'-'+origin, sourceName=origin==='direct'?'自营':'原厂转售';
      const video=slug==='seedance-2.5';
      after.endpoints.push({ ...stamp,id:endpointId,providerId:id,channelCode:endpointId,name:sourceName,
        baseUrl:'https://'+code+'-'+origin+'.example.invalid/v1'+(video?'/videos/generations':''),
        protocol:video?'其他':'OpenAI',interfaceType:video?'custom':'openai',addressMode:video?'task':'base',taskUrls:{},
        authMode:'none',timeoutSeconds:60,configurationRevision:0,supplierChannel:true,status:'草稿',apiKeys:[] });
      provider.catalogModels.push({ ...stamp,modelId:slug,name:material.name,type:material.type,libraryId:material.id });
      provider.catalogConnections.push({ ...stamp,id:'preset-source-'+code+'-'+origin,modelId:slug,
        endpointId,name:sourceName,sourceName,origin,upstreamModelId:slug,enabled:false,health:null });
    }
    after.providers.push(provider);
  }
  after.modelData.prototypeCatalogueInstalled=true;
  after.revision=before.revision+1;
  after.updatedAt=now;
  const statements=modelChanges(db,before,after);
  if(actor) {
    const id='prototype-catalogue-v1';
    await save(db,actor,before,id,id,id,'prototype.initialize',{initialized:true},statements);
  } else await db.batch([db.prepare('PRAGMA defer_foreign_keys=ON'),...statements,
    db.prepare('UPDATE db_state SET commit_seq=commit_seq+1 WHERE id=1')]);
}
