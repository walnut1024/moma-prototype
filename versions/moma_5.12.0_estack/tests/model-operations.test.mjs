import test from 'node:test';
import assert from 'node:assert/strict';
import {createAdminSeed,commitAdminState,persistModelAction,STORAGE_KEY,parseAdminState} from '../src/admin-v2/store.js';
import {modelSupplies,activeSupplyPrice,activeSupplySalePrice,availableSupplies} from '../src/admin-v2/model-management.js';
import {parseSupplyImport,SUPPLY_HEADERS} from '../src/admin-v2/supply-import.js';
import {normalizeModelProfile,requireModelBasics} from '../src/admin-v2/model-profile.js';
const op=(state,operation,data={},modelId)=>commitAdminState(state,{type:'modelOperations',operation,data,modelId});
const legacy=(state,operation,data,modelId)=>commitAdminState(state,{type:'modelOperation',operation,data,modelId});
const modelInput={modelId:'new-language',name:'测试语言模型',description:'用于文本生成。',type:'text',profile:{author:'模型作者',tasks:['对话'],inputModalities:['文本'],outputModalities:['文本']},capabilities:{context:8192,output:1024,streaming:false,tools:false}};
const newProvider={name:'测试供应商',code:'test-provider',sourceType:'thirdParty',integrationType:'其他兼容服务',contact:'',description:''};
const connection={name:'测试接入',protocol:'OpenAI',baseUrl:'https://test.example.invalid/v1',credentialRef:'env:TEST_API_KEY',timeoutSeconds:60,capacity:''};
function connected(){let state=op(createAdminSeed(),'addModel',{model:modelInput}),id=state.audits[0].objectId;state=op(state,'connectSupply',{provider:newProvider,connection,upstreamModelId:'upstream-v1',capabilities:modelInput.capabilities,procurement:{unit:'元/百万 Token',inputPrice:'1',outputPrice:'2'},verify:true},id);return {state,id,supply:modelSupplies(state,id)[0]};}
test('template creation is metadata-only and importing does not add operating models',()=>{let s=createAdminSeed(),n=s.models.length,c=s.modelSupplies.length;s=op(s,'templateSave',modelInput);assert.equal(s.models.length,n);assert.equal(s.modelSupplies.length,c);assert.equal(s.modelTemplates[0].profile.author,'模型作者');assert.equal(s.modelTemplates[0].listingStatus,undefined);assert.throws(()=>op(s,'templateSave',modelInput),/已存在/);});
test('template-based creation is unlisted, linked, and rejects duplicate catalogue codes',()=>{let s=createAdminSeed();s=op(s,'addModel',{templateId:'template-glm-5'});assert.equal(s.models[0].listingStatus,'已下架');assert.equal(s.models[0].templateRevision,1);assert.throws(()=>op(s,'addModel',{templateId:'template-glm-5'}),/已添加/);assert.throws(()=>op(s,'addModel',{templateId:'template-kimi-k3'}),/已添加/);});
test('template update requires explicit apply and never overwrites sale prices',()=>{let s=op(createAdminSeed(),'addModel',{templateId:'template-glm-5'}),model=s.models[0],template=s.modelTemplates.find(t=>t.id===model.templateId);const before=structuredClone(s.modelSalePrices);s=op(s,'templateSave',{...template,name:'更新模板名称'});assert.equal(s.models.find(m=>m.id===model.id).name,model.name);s=op(s,'applyTemplate',{},model.id);assert.equal(s.models.find(m=>m.id===model.id).name,'更新模板名称');assert.deepEqual(s.modelSalePrices,before);});
test('inline provider + endpoint + supply + cost commits as one operation and registers call ID',()=>{const {state,id,supply}=connected();assert.equal(supply.callId,'test-provider/new-language');assert.equal(availableSupplies(state,id).length,1);assert.equal(supply.salesEnabled,false);assert.equal(activeSupplyPrice(state,supply.id).inputPrice,1000000);assert.equal(activeSupplySalePrice(state,id,supply.id),undefined);assert.equal(state.revision,3);});
test('invalid inline connection cannot partially create a provider or mapping',()=>{const s=op(createAdminSeed(),'addModel',{model:modelInput}),before=JSON.stringify(s);assert.throws(()=>op(s,'connectSupply',{provider:newProvider,connection:{...connection,baseUrl:'http://public.example.com'},upstreamModelId:'a',capabilities:modelInput.capabilities},s.models[0].id),/HTTPS/);assert.equal(JSON.stringify(s),before);});
test('supplier code collision is rejected across existing seeded providers',()=>{assert.throws(()=>op(createAdminSeed(),'providerRegistration',{provider:{...newProvider,code:'bailian'}}),/不可重复/);});
test('failed connection verification preserves configuration but cannot enable supply',()=>{let {state,id,supply}=connected();state=op(state,'verifySupply',{id:supply.id,scenario:'鉴权失败'},id);assert.equal(availableSupplies(state,id).length,0);assert.ok(state.modelSupplies.find(s=>s.id===supply.id));assert.throws(()=>op(state,'saveSales',{prices:[{supplyId:supply.id,unit:'元/百万 Token',inputPrice:'3',outputPrice:'4'}],selected:[supply.id],publish:true},id),/验证/);});
test('sale price and procurement remain independent, explicit free price works',()=>{let {state,id,supply}=connected();const before=structuredClone(state.supplyPrices);state=op(state,'saveSales',{prices:[{supplyId:supply.id,unit:'元/百万 Token',inputPrice:'0',outputPrice:'0'}],selected:[supply.id],publish:true},id);assert.equal(state.models.find(m=>m.id===id).listingStatus,'已上架');assert.deepEqual(state.supplyPrices,before);assert.equal(activeSupplySalePrice(state,id,supply.id).inputPrice,0);const sale=structuredClone(state.modelSalePrices);state=legacy(state,'procurement',{supplyId:supply.id,unit:'元/百万 Token',inputPrice:'2',outputPrice:'3'},id);assert.deepEqual(state.modelSalePrices,sale);});
test('price unit mismatch and blank values are rejected atomically',()=>{const {state,id,supply}=connected();const before=JSON.stringify(state);for(const price of [{unit:'元/张',inputPrice:'1',outputPrice:'2'},{unit:'元/百万 Token',inputPrice:'',outputPrice:'2'}])assert.throws(()=>op(state,'saveSales',{prices:[{...price,supplyId:supply.id}],selected:[supply.id]},id));assert.equal(JSON.stringify(state),before);});
test('partial price saves preserve draft, exclude unfinished supply, and keep model unlisted',()=>{let {state,id,supply}=connected();state=op(state,'saveSales',{prices:[{supplyId:supply.id,unit:'元/百万 Token',inputPrice:'1.5',outputPrice:''}],selected:[supply.id],allowIncomplete:true},id);assert.equal(state.models.find(m=>m.id===id).listingStatus,'已下架');assert.equal(state.modelSupplies.find(s=>s.id===supply.id).salesEnabled,false);assert.equal(state.modelSalePrices[0].status,'草稿');});
test('scheduled repricing keeps current price until effective time and creates immutable versions',()=>{let {state,id,supply}=connected();state=op(state,'saveSales',{prices:[{supplyId:supply.id,unit:'元/百万 Token',inputPrice:'2',outputPrice:'4'}],selected:[supply.id]},id);const first=activeSupplySalePrice(state,id,supply.id);const when=new Date(Date.now()+86400000).toISOString();state=op(state,'saveSales',{prices:[{supplyId:supply.id,unit:'元/百万 Token',inputPrice:'3',outputPrice:'6',effectiveAt:when}],selected:[supply.id]},id);assert.equal(activeSupplySalePrice(state,id,supply.id).id,first.id);assert.equal(activeSupplySalePrice(state,id,supply.id,Date.parse(when)+1).inputPrice,3000000);});
test('editing shared endpoint invalidates all model validations and keeps costs',()=>{let {state,id,supply}=connected();const ep=state.endpoints.find(ep=>ep.id===supply.endpointId),cost=structuredClone(state.supplyPrices);state=op(state,'provider',{operation:'connection',objectId:ep.id,values:{...ep,baseUrl:'https://changed.example.invalid/v1'}});assert.equal(state.modelSupplies.find(s=>s.id===supply.id).validationStatus,'待验证');assert.equal(availableSupplies(state,id).length,0);assert.deepEqual(state.supplyPrices,cost);});
test('same provider cannot have two active mappings for same platform model',()=>{const {state,id,supply}=connected();assert.throws(()=>op(state,'connectSupply',{providerId:supply.provider.id,endpointId:supply.endpointId,upstreamModelId:'other',capabilities:modelInput.capabilities},id),/已关联/);});
test('procurement import identifies in-batch duplicate without overwriting saved mappings',()=>{let s=op(createAdminSeed(),'addModel',{model:modelInput});s=op(s,'providerRegistration',{provider:newProvider,connection});const p=s.providers.find(p=>p.code==='test-provider');const row=['new-language','测试接入','upstream','元/百万 Token','1','2','8192','1024'];const text=[SUPPLY_HEADERS,row,row].map(r=>r.join('\t')).join('\n');const rows=parseSupplyImport(s,p.id,text);assert.equal(rows[0].error,null);assert.match(rows[1].error,/已关联/);assert.equal(modelSupplies(s,s.models[0].id).length,0);});
test('permission, stale revision and storage errors prevent commits without resetting data',()=>{const s=createAdminSeed();assert.throws(()=>commitAdminState({...s,currentRole:'运维人员'},{type:'modelOperations',operation:'templateSave',data:modelInput}),/无权/);const storage={getItem:()=>JSON.stringify({...s,revision:s.revision+1}),setItem:()=>assert.fail('must not write')};assert.throws(()=>persistModelAction(s,{type:'modelOperations',operation:'templateSave',data:modelInput},storage),/数据已变化/);const broken={getItem:()=>JSON.stringify(s),setItem:()=>{throw new Error('quota');}};assert.throws(()=>persistModelAction(s,{type:'modelOperations',operation:'templateSave',data:modelInput},broken),/quota/);assert.ok(!s.modelTemplates.some(t=>t.modelId===modelInput.modelId));});
test('old saved data keeps IDs, pricing and user edits; new template collection is separate',()=>{const s=createAdminSeed();delete s.modelTemplates;s.models[0].name='用户自定义名称';const restored=parseAdminState(JSON.stringify(s));assert.equal(restored.models[0].name,'用户自定义名称');assert.deepEqual(restored.modelSalePrices,s.modelSalePrices);assert.equal(restored.modelTemplates.length,createAdminSeed().modelTemplates.length);assert.match(STORAGE_KEY,/5120/);});

test('metadata modality change invalidates existing verification without altering prices',()=>{let {state,id,supply}=connected();const model=state.models.find(item=>item.id===id),before=structuredClone(state.supplyPrices);state=legacy(state,'basic',{...model,profile:{...model.profile,inputModalities:['文本','图片']}},id);assert.equal(state.modelSupplies.find(item=>item.id===supply.id).validationStatus,'待验证');assert.deepEqual(state.supplyPrices,before);});
test('saving a missing model as template gives a recoverable domain error',()=>assert.throws(()=>op(createAdminSeed(),'templateFromModel',{},'missing'),/模型不存在/));

test('model templates are a dedicated operations page with matching role boundaries', async()=>{const {sections,canAccessPage,pageFromHash}=await import('../src/admin-v2/navigation.mjs');const group=sections.find(item=>item.id==='models');assert.deepEqual(group.items.map(item=>item.label),['模型管理','模型资料','供应商']);assert.equal(pageFromHash('#/admin-2/model-templates?view=template','运营人员'),'model-templates');assert.equal(canAccessPage('运营人员','model-templates'),true);assert.equal(canAccessPage('运维人员','model-templates'),false);});

test('real model catalogue has unique codes and editable sourced metadata without invented shared limits',()=>{
  const state=createAdminSeed();
  assert.equal(new Set(state.models.map(model=>model.modelId)).size,state.models.length);
  for(const model of [...state.models,...state.modelTemplates]){
    assert.doesNotMatch(model.name,/通用语言模型|测试|厂商 [A-Z]/);
    assert.doesNotMatch(model.modelId,/^demo\//);
    assert.ok(model.profile.documentation.startsWith('https://'));
    requireModelBasics(normalizeModelProfile(model.profile,model.type,model.usageUnit));
  }
  assert.equal(state.models.find(model=>model.modelId==='kimi-k3').capabilities.context,1048576);
  assert.equal(state.models.find(model=>model.modelId==='kimi-k3').capabilities.output,null);
  assert.equal(state.models.find(model=>model.type==='image').capabilities.context,null);
  assert.equal(state.models.find(model=>model.modelId==='bge-m3').capabilities.context,8192);
  for(const supply of state.modelSupplies){
    const model=state.models.find(model=>model.id===supply.modelId);
    assert.ok(supply.callId.endsWith('/'+model.modelId));
    assert.equal(supply.upstreamModelId,model.modelId);
  }
});

test('supplier catalogue is independent of platform mappings and persists normalized IDs',()=>{
  let state=createAdminSeed();
  const provider=state.providers.find(item=>item.code==='deepseek');
  assert.deepEqual(provider.catalogModelIds,['deepseek-flash','deepseek-v4-pro']);
  assert.ok(provider.catalogueSource.startsWith('https://'));
  state=op(state,'provider',{operation:'profile',objectId:provider.id,values:{...provider,catalogModelIds:[' deepseek-flash ','deepseek-flash','','deepseek-v4-pro']}});
  assert.deepEqual(state.providers.find(item=>item.id===provider.id).catalogModelIds,['deepseek-flash','deepseek-v4-pro']);
  const cleared={...state,modelSupplies:[]};
  assert.deepEqual(cleared.providers.find(item=>item.id===provider.id).catalogModelIds,provider.catalogModelIds);
  assert.throws(()=>op(state,'provider',{operation:'profile',objectId:provider.id,values:{...provider,catalogModelIds:['bad model']}}),/有效 Model ID/);
  assert.throws(()=>op(state,'provider',{operation:'profile',objectId:provider.id,values:{...provider,catalogModelIds:'deepseek-flash'}}),/Model ID 列表/);
});

test('real supplier fixtures use official URLs and connection transactions accept only OpenAI',()=>{
  const state=createAdminSeed();
  assert.equal(new Set(state.providers.map(provider=>provider.code)).size,state.providers.length);
  assert.ok(state.providers.some(provider=>provider.name==='硅基流动'));
  for(const endpoint of state.endpoints){
    const provider=state.providers.find(item=>item.id===endpoint.providerId);
    assert.equal(endpoint.baseUrl,provider.baseUrl);
    assert.equal(endpoint.protocol,'OpenAI');
    assert.doesNotMatch(endpoint.baseUrl,/invalid/);
  }
  const endpoint=state.endpoints[0];
  assert.throws(()=>op(state,'provider',{operation:'connection',objectId:endpoint.id,values:{...endpoint,protocol:'Anthropic'}}),/接入协议/);
  for(const supply of state.modelSupplies){
    const endpoint=state.endpoints.find(item=>item.id===supply.endpointId);
    const provider=state.providers.find(item=>item.id===endpoint.providerId);
    assert.ok(supply.callId.startsWith(provider.code+'/'));
  }
});

test('carrier providers have independent catalogues and unverified connections without prices or mappings',()=>{
  const state=createAdminSeed();
  for(const [code,name,url,count] of [['cmcc','移动云','https://moma.cmecloud.cn/v1',3],['ctyun','天翼云','https://wishub-x1.ctyun.cn/v1',1]]){
    const provider=state.providers.find(item=>item.code===code);
    assert.equal(provider.name,name);
    assert.equal(provider.catalogModelIds.length,count);
    const connection=state.endpoints.find(item=>item.providerId===provider.id);
    assert.equal(connection.baseUrl,url);
    assert.equal(connection.protocol,'OpenAI');
    assert.equal(connection.credentialRef,'');
    assert.equal(connection.status,'停用');
    assert.equal(connection.connectionTest,null);
    assert.deepEqual(connection.modelIds,[]);
    assert.ok(!state.modelSupplies.some(item=>item.endpointId===connection.id));
    assert.ok(!state.supplyPrices.some(item=>item.providerId===provider.id));
  }
  assert.match(state.providers.find(item=>item.code==='ctyun').catalogueNote,/停止维护/);
});

test('tenant model categories separate multimodal understanding from visual generation and keep type-specific fields', async () => {
  const { MODEL_TYPES, MODEL_CATEGORIES, modelCategory, priceUnits } = await import('../src/admin-v2/model-management.js');
  const { specificationFields } = await import('../src/admin-v2/model-profile.js');
  assert.deepEqual(MODEL_CATEGORIES, { text: '语言模型', multimodal: '多模态理解', visual: '视觉模型', audio: '语音模型', embedding: '向量模型', rerank: '重排模型' });
  assert.equal(modelCategory('multimodal'), 'multimodal');
  assert.equal(modelCategory('image'), 'visual');
  assert.equal(modelCategory('video'), 'visual');
  for (const type of Object.keys(MODEL_TYPES)) assert.ok(MODEL_CATEGORIES[modelCategory(type)]);
  const keys = type => specificationFields(type, '秒', {}).map(field => field.key);
  assert.ok(keys('multimodal').includes('maxInput'));
  assert.ok(!keys('multimodal').includes('resolutions'));
  assert.ok(keys('image').includes('resolutions'));
  assert.ok(!keys('image').includes('maxInput'));
  assert.ok(keys('video').includes('maxDuration'));
  assert.ok(keys('embedding').includes('dimensions'));
  assert.ok(keys('rerank').includes('topN'));
  assert.ok(priceUnits({ type: 'image' }).includes('元/张'));
  assert.ok(!priceUnits({ type: 'multimodal' }).includes('元/张'));
});


test('recent templates have sourced release dates and K3 remains vision-capable in the language category', async () => {
  const { MODEL_RELEASES, RECENT_TEMPLATE_CODES, REAL_MODELS } = await import('../src/admin-v2/real-model-catalogue.js');
  const state = createAdminSeed();
  assert.equal(RECENT_TEMPLATE_CODES.length, 12);
  assert.equal(new Set(state.modelTemplates.map(item => item.modelId)).size, state.modelTemplates.length);
  for (const code of RECENT_TEMPLATE_CODES) {
    const template = state.modelTemplates.find(item => item.modelId === code);
    assert.ok(template, code);
    assert.equal(template.profile.releaseDate, MODEL_RELEASES[code].date);
    assert.ok(template.profile.releaseDate >= '2026-07-11' && template.profile.releaseDate <= '2026-10-11');
    assert.ok(MODEL_RELEASES[code].source.startsWith('https://'));
    const added = op(state, 'templateImport', { models: [{ ...template, modelId: 'verify-' + code }] });
    assert.equal(added.models.length, state.models.length);
    assert.deepEqual(added.supplyPrices, state.supplyPrices);
  }
  for (const item of REAL_MODELS.filter(item => item.id.startsWith('template-') && item.id !== 'template-glm-5')) {
    assert.ok(!state.models.some(model => model.modelId === item.modelId));
  }
  const k3 = state.modelTemplates.find(item => item.modelId === 'kimi-k3');
  assert.equal(k3.type, 'text');
  assert.equal(k3.profile.releaseDate, '2026-07-16');
  assert.deepEqual(k3.profile.inputModalities, ['文本', '图片', '视频']);
  assert.equal(state.modelTemplates.find(item => item.modelId === 'SenseVoiceSmall').profile.releaseDate, undefined);
});
