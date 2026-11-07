import { withAdminSession } from './admin-session-fixture.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';
import {createAdminSeed as baseCreateAdminSeed,commitAdminState,persistModelAction,STORAGE_KEY,parseAdminState as baseParseAdminState} from '../src/admin-v2/store.js';
import {modelSupplies,activeSupplyPrice,activeSupplySalePrice,availableSupplies,priceItems,procurementVersion,latestSaleRevision,publicationChecks} from '../src/admin-v2/model-management.js';
import {salesSelectionVersion} from '../src/admin-v2/model-operations.js';
import {normalizeModelProfile,requireModelBasics} from '../src/admin-v2/model-profile.js';
const op=(state,operation,data={},modelId)=>commitAdminState(state,{type:'modelOperations',operation,data,modelId});
const legacy=(state,operation,data,modelId)=>commitAdminState(state,{type:'modelOperation',operation,data,modelId});
const modelInput={modelId:'new-language',name:'测试语言模型',description:'用于文本生成。',type:'text',profile:{author:'模型作者',tasks:['对话'],inputModalities:['文本'],outputModalities:['文本']},capabilities:{context:8192,output:1024,streaming:false,tools:false}};
const newProvider={catalogModelIds:['upstream-v1'],name:'测试服务商',code:'test-provider',sourceType:'thirdParty',integrationType:'其他兼容服务',contact:'',description:''};
const connection={name:'测试接入',protocol:'OpenAI',baseUrl:'https://test.example.invalid/v1',credentialRef:'env:TEST_API_KEY',timeoutSeconds:60,capacity:''};
function connected(){
 let state=op(createAdminSeed(),'providerRegistration',{provider:newProvider,connections:[connection]});
 const provider=state.providers.find(item=>item.code===newProvider.code),endpoint=state.endpoints.find(item=>item.providerId===provider.id);
 state=op(state,'provider',{operation:'cataloguePrice',objectId:provider.id,values:{modelId:'upstream-v1',scenarios:[{name:'输入',unit:'百万 Token',currency:'CNY',listPrice:'1'},{name:'输出',unit:'百万 Token',currency:'CNY',listPrice:'2'}]}});
 state=op(state,'templateSave',modelInput);const libraryId=state.audits[0].objectId;
 state=op(state,'saveOnboarding',{providerId:provider.id,catalogueModelId:'upstream-v1',endpointId:endpoint.id,libraryId,confirmedIdentity:true,model:modelInput,step:'metadata'});
 const draftId=state.audits[0].objectId;
 state=op(state,'onboardModel',{draftId});
 const id=state.audits[0].objectId,supply=modelSupplies(state,id)[0];state=op(state,'verifySupply',{id:supply.id},id);
 return {state,id,supply:modelSupplies(state,id)[0],draftId};
}
const priced=(state,id,supply,amount='3')=>({supplyId:supply.id,items:priceItems(activeSupplyPrice(state,supply.id),state.models.find(m=>m.id===id)).map(item=>({...item,amount})),sourceVersion:procurementVersion(activeSupplyPrice(state,supply.id)),expectedSaleVersion:latestSaleRevision(state,supply.id)});

test('template creation is metadata-only and importing does not add operating models',()=>{let s=createAdminSeed(),n=s.models.length,c=s.modelSupplies.length;s=op(s,'templateSave',modelInput);assert.equal(s.models.length,n);assert.equal(s.modelSupplies.length,c);assert.equal(s.modelTemplates[0].profile.author,'模型作者');assert.equal(s.modelTemplates[0].listingStatus,undefined);assert.throws(()=>op(s,'templateSave',modelInput),/已存在/);});
test('model library edits the same operating record without a template copy or manual synchronization',async()=>{const {modelLibrary,libraryRecord}=await import('../src/admin-v2/model-operations.js');let s=createAdminSeed();const model=s.models.find(m=>m.id==='catalog-demo-kimi'),template=s.modelTemplates.find(t=>t.modelId===model.modelId),prices=structuredClone(s.modelSalePrices),supplies=structuredClone(s.modelSupplies);s=op(s,'templateSave',{...model,id:template.id,name:'统一模型名称'});assert.equal(s.models.find(m=>m.id===model.id).name,'统一模型名称');assert.equal(s.models.find(m=>m.id===model.id).id,model.id);assert.equal(s.models.find(m=>m.id===model.id).modelId,model.modelId);assert.deepEqual(s.modelOnboardings,createAdminSeed().modelOnboardings);assert.equal(libraryRecord(s,template.id).id,model.id);assert.equal(modelLibrary(s).filter(m=>m.modelId===model.modelId).length,1);assert.equal(s.modelTemplates.find(t=>t.id===template.id).name,template.name);assert.deepEqual(s.modelSalePrices,prices);assert.deepEqual(s.modelSupplies,supplies);assert.throws(()=>op(s,'applyTemplate',{},model.id),/未知/);});
test('supplier code collision is rejected across existing seeded providers',()=>{assert.throws(()=>op(createAdminSeed(),'providerRegistration',{provider:{...newProvider,code:'bailian'}}),/不可重复/);});
test('editing shared endpoint invalidates all model validations and keeps costs',()=>{let {state,id,supply}=connected();const ep=state.endpoints.find(ep=>ep.id===supply.endpointId),cost=structuredClone(state.supplyPrices);state=op(state,'provider',{operation:'connection',objectId:ep.id,values:{...ep,baseUrl:'https://changed.example.invalid/v1'}});assert.equal(state.modelSupplies.find(s=>s.id===supply.id).validationStatus,'待验证');assert.equal(availableSupplies(state,id).length,0);assert.deepEqual(state.supplyPrices,cost);});
test('permission, stale revision and storage errors prevent commits without resetting data',()=>{const s=createAdminSeed();assert.throws(()=>commitAdminState({...s,currentRole:'运维人员'},{type:'modelOperations',operation:'templateSave',data:modelInput}),/无权/);const storage={getItem:()=>JSON.stringify({...s,revision:s.revision+1}),setItem:()=>assert.fail('must not write')};assert.throws(()=>persistModelAction(s,{type:'modelOperations',operation:'templateSave',data:modelInput},storage),/数据已变化/);const broken={getItem:()=>JSON.stringify(s),setItem:()=>{throw new Error('quota');}};assert.throws(()=>persistModelAction(s,{type:'modelOperations',operation:'templateSave',data:modelInput},broken),/quota/);assert.ok(!s.modelTemplates.some(t=>t.modelId===modelInput.modelId));});
test('old saved data keeps IDs, pricing and user edits without inventing absent template records',()=>{const s=createAdminSeed();delete s.modelTemplates;s.models[0].name='用户自定义名称';const restored=parseAdminState(JSON.stringify(s));assert.equal(restored.models[0].name,'用户自定义名称');assert.deepEqual(restored.modelSalePrices,s.modelSalePrices);assert.equal(restored.modelTemplates.length,0);assert.match(STORAGE_KEY,/5120/);});

test('metadata modality change invalidates existing verification without altering prices',()=>{let {state,id,supply}=connected();const model=state.models.find(item=>item.id===id),before=structuredClone(state.supplyPrices);state=legacy(state,'basic',{...model,profile:{...model.profile,inputModalities:['文本','图片']}},id);assert.equal(state.modelSupplies.find(item=>item.id===supply.id).validationStatus,'待验证');assert.deepEqual(state.supplyPrices,before);});
test('saving a missing library record gives a recoverable domain error',()=>assert.throws(()=>op(createAdminSeed(),'templateSave',{...modelInput,id:'missing'}),/模型资料不存在/));

test('model templates are a dedicated operations page with matching role boundaries', async()=>{const {sections,canAccessPage,pageFromHash}=await import('../src/admin-v2/navigation.mjs');const group=sections.find(item=>item.id==='models');assert.deepEqual(group.items.map(item=>item.label),['渠道接入','模型服务','模型成本','模型售价','模型资料']);assert.equal(pageFromHash('#/admin-2/model-templates?view=template','运营人员'),'model-templates');assert.equal(canAccessPage('运营人员','model-templates'),true);assert.equal(canAccessPage('运维人员','model-templates'),false);});

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
  state.modelTemplates.push({id:'test-custom',modelId:'custom-model',name:'Custom',type:'text',capabilities:{}});
  const provider=state.providers.find(item=>item.code==='deepseek');
  assert.deepEqual(provider.catalogModelIds,['deepseek-flash','deepseek-v4-pro']);
  assert.ok(provider.catalogueSource.startsWith('https://'));
  state=op(state,'provider',{operation:'catalogueImport',objectId:provider.id,values:{mode:'batch',text:' deepseek-flash \ndeepseek-flash\n\ndeepseek-v4-pro\ncustom-model'}});
  assert.deepEqual(state.providers.find(item=>item.id===provider.id).catalogModelIds,['deepseek-flash','deepseek-v4-pro','custom-model']);
  const cleared={...state,modelSupplies:[]};
  assert.deepEqual(cleared.providers.find(item=>item.id===provider.id).catalogModelIds,['deepseek-flash','deepseek-v4-pro','custom-model']);
  assert.throws(()=>op(state,'provider',{operation:'catalogueImport',objectId:provider.id,values:{mode:'batch',text:'bad model'}}),/有效 Model ID/);
  assert.throws(()=>op(state,'provider',{operation:'catalogueImport',objectId:provider.id,values:{mode:'batch',text:['deepseek-flash']}}),/请输入/);
});

test('real supplier fixtures use official URLs and accept OpenAI, Anthropic and dedicated protocols',()=>{
  const state=createAdminSeed();
  assert.equal(new Set(state.providers.map(provider=>provider.code)).size,state.providers.length);
  assert.ok(state.providers.some(provider=>provider.name==='硅基流动'));
  for(const endpoint of state.endpoints){
    const provider=state.providers.find(item=>item.id===endpoint.providerId);
    if (provider.baseUrl) assert.equal(endpoint.baseUrl,provider.baseUrl);
    assert.ok(['OpenAI','Anthropic','其他'].includes(endpoint.protocol));
    assert.doesNotMatch(endpoint.baseUrl,/invalid/);
  }
  const endpoint=state.endpoints[0];
  assert.doesNotThrow(()=>op(state,'provider',{operation:'connection',objectId:endpoint.id,values:{...endpoint,protocol:'Anthropic',timeoutSeconds:60}}));
  assert.throws(()=>op(state,'provider',{operation:'connection',objectId:endpoint.id,values:{...endpoint,protocol:'unknown',timeoutSeconds:60}}),/接入协议/);
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
  assert.deepEqual(MODEL_CATEGORIES, { text: '语言模型', multimodal: '视觉理解', visual: '视觉生成', audio: '语音模型', embedding: '向量模型', rerank: '重排模型' });
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

test('catalogue onboarding references complete costs without creating a second procurement record',()=>{
 const {state,id,supply}=connected();assert.equal(supply.callId,'test-provider/new-language');assert.equal(supply.catalogueModelId,'upstream-v1');assert.equal(supply.salesEnabled,false);assert.equal(state.models.find(m=>m.id===id).listingStatus,'已下架');assert.equal(availableSupplies(state,id).length,1);assert.deepEqual(priceItems(activeSupplyPrice(state,supply.id),state.models.find(m=>m.id===id)).map(i=>i.amount),[1000000,2000000]);assert.ok(!state.supplyPrices.some(p=>p.supplyId===supply.id));
});
test('same catalogue model and relation are reused across entry points',()=>{
 let {state,id,supply,draftId}=connected();const counts=[state.models.length,state.modelSupplies.length];state=op(state,'saveOnboarding',{...state.modelOnboardings.find(d=>d.id===draftId),targetRevision:state.models.find(m=>m.id===id).updatedAt});state=op(state,'onboardModel',{draftId,model:state.models.find(m=>m.id===id)});assert.deepEqual([state.models.length,state.modelSupplies.length],counts);assert.equal(state.modelOnboardings.find(d=>d.id===draftId).supplyId,supply.id);
});
test('blank and zero stay distinct; missing procurement never means zero cost',()=>{
 let {state,id,supply}=connected();assert.throws(()=>op(state,'reprice',priced(state,id,supply,''),id),/必填/);state=op(state,'reprice',priced(state,id,supply,'0'),id);assert.ok(activeSupplySalePrice(state,id,supply.id).items.every(item=>item.amount===0));const provider=supply.provider;state=op(state,'provider',{operation:'cataloguePrice',objectId:provider.id,values:{modelId:'upstream-v1',scenarios:[{name:'输入',unit:'百万 Token',currency:'CNY',listPrice:''}]}});assert.throws(()=>op(state,'reprice',priced(state,id,supply),id),/采购价缺失/);
});
test('repricing changes only prices, preserving sales, listing, scope and immutable history',()=>{
 let {state,id,supply}=connected();const before=structuredClone({models:state.models,supplies:state.modelSupplies,costs:state.supplyPrices,providers:state.providers});state=op(state,'reprice',priced(state,id,supply),id);const first=structuredClone(activeSupplySalePrice(state,id,supply.id));state=op(state,'reprice',{...priced(state,id,supply,'4'),effectiveAt:new Date(Date.now()+86400000).toISOString()},id);assert.deepEqual({models:state.models,supplies:state.modelSupplies,costs:state.supplyPrices,providers:state.providers},before);assert.equal(activeSupplySalePrice(state,id,supply.id).id,first.id);assert.deepEqual(state.modelSalePrices.find(p=>p.id===first.id),first);assert.equal(activeSupplySalePrice(state,id,supply.id,Date.now()+86400001).items[0].amount,4000000);assert.throws(()=>op(state,'reprice',{...priced(state,id,supply),selected:[supply.id]},id),/只允许/);
});
test('all tier, condition, unit, currency, spec, night and cache rows survive repricing',()=>{
 let {state,id,supply}=connected();const scenarios=[['输入 0–32K','白天','百万 Token','CNY'],['输入 32K–128K','夜间 00:00–08:00','百万 Token','CNY'],['缓存读取','缓存命中','百万 Token','USD'],['图片生成 1024×1024','规格 A','张','CNY']].map(([name,condition,unit,currency],index)=>({name,condition,unit,currency,listPrice:String(index)}));state=op(state,'provider',{operation:'cataloguePrice',objectId:supply.provider.id,values:{modelId:'upstream-v1',scenarios}});const data=priced(state,id,supply);state=op(state,'reprice',data,id);assert.deepEqual(activeSupplySalePrice(state,id,supply.id).items.map(({amount,...item})=>item),scenarios.map(({listPrice,...item})=>item));assert.throws(()=>op(state,'reprice',{...priced(state,id,supply),items:data.items.slice(1)},id),/完整计费项/);
});
test('supplier changes prompt review without changing published sale versions',()=>{
 let {state,id,supply}=connected();state=op(state,'reprice',priced(state,id,supply),id);const sales=structuredClone(state.modelSalePrices),stale=priced(state,id,supply);state=op(state,'provider',{operation:'catalogueDiscount',objectId:supply.provider.id,values:{modelId:'upstream-v1',discountFactor:'0.8'}});assert.deepEqual(state.modelSalePrices,sales);assert.equal(activeSupplyPrice(state,supply.id).items[0].amount,800000);assert.throws(()=>op(state,'reprice',stale,id),/报价已变化/);
});
test('concurrent sale revisions are rejected even after loading the latest store',()=>{
 let {state,id,supply}=connected();const draft=priced(state,id,supply);state=op(state,'reprice',draft,id);assert.throws(()=>op(state,'reprice',draft,id),/并发修订/);
});
test('partial progress survives refresh and cannot accidentally publish',()=>{
 let {state,id,supply,draftId}=connected();const draft=state.modelOnboardings.find(d=>d.id===draftId);state=op(state,'saveOnboarding',{...draft,prices:priced(state,id,supply,'').items,sourceVersion:procurementVersion(activeSupplyPrice(state,supply.id)),expectedSaleVersion:latestSaleRevision(state,supply.id),step:'price'});const restored=parseAdminState(JSON.stringify(state));assert.equal(restored.modelOnboardings.find(d=>d.id===draftId).prices[0].amount,'');assert.throws(()=>op(restored,'completeOnboarding',{draftId,publish:true}),/必填/);assert.equal(restored.models.find(m=>m.id===id).listingStatus,'已下架');
});
test('onboarding can save the selected supply and prices but cannot publish before choosing a service mode',()=>{
 let {state,id,supply,draftId}=connected();state.modelSupplies.push({...supply,id:'unused-backup',endpointId:state.endpoints.find(ep=>ep.providerId!==supply.provider.id).id,salesEnabled:false,status:'已停用'});const data=priced(state,id,supply);state=op(state,'saveOnboarding',{...state.modelOnboardings.find(d=>d.id===draftId),prices:data.items,sourceVersion:data.sourceVersion,expectedSaleVersion:data.expectedSaleVersion,salesVersion:salesSelectionVersion(state,id),step:'review'});
 const before=structuredClone(state);assert.throws(()=>op(state,'completeOnboarding',{draftId,publish:true}),/服务模式/);assert.deepEqual(state,before);
 state=op(state,'completeOnboarding',{draftId,publish:false});assert.equal(state.models.find(m=>m.id===id).listingStatus,'已下架');assert.equal(state.modelSupplies.find(s=>s.id===supply.id).salesEnabled,true);assert.equal(state.modelSupplies.find(s=>s.id==='unused-backup').salesEnabled,false);assert.deepEqual(activeSupplySalePrice(state,id,supply.id).items.map(item=>item.amount),[3000000,3000000]);assert.equal(state.modelOnboardings.find(item=>item.id===draftId).status,'已完成');assert.ok(publicationChecks(state,state.models.find(m=>m.id===id)).some(check=>check.tab==='serviceMode' && !check.passed));
});
test('uncertain identity requires explicit confirmation; missing connection retains saved progress',()=>{
 let {state,id}=connected();state=op(state,'providerRegistration',{provider:{...newProvider,name:'第二家',code:'second-provider'},connections:[connection]});const provider=state.providers.find(p=>p.code==='second-provider'),ep=state.endpoints.find(e=>e.providerId===provider.id);state=op(state,'saveOnboarding',{providerId:provider.id,catalogueModelId:'upstream-v1',endpointId:ep.id,targetModelId:id,targetRevision:state.models.find(m=>m.id===id).updatedAt});let draftId=state.audits[0].objectId;assert.throws(()=>op(state,'onboardModel',{draftId,model:state.models.find(m=>m.id===id)}),/身份和版本/);state=op(state,'saveOnboarding',{...state.modelOnboardings.find(d=>d.id===draftId),confirmedIdentity:true});state=op(state,'onboardModel',{draftId,model:state.models.find(m=>m.id===id)});assert.equal(modelSupplies(state,id).length,2);assert.equal(state.models.filter(m=>m.id===id).length,1);
 const draft={providerId:provider.id,catalogueModelId:'upstream-v1',endpointId:''};state=op(state,'saveOnboarding',draft);draftId=state.audits[0].objectId;assert.throws(()=>op(state,'onboardModel',{draftId,model:modelInput}),/连接/);assert.ok(state.modelOnboardings.some(d=>d.id===draftId));
});
test('diagnostic failure retains online qualification but blocks new onboarding; stale metadata never partially changes models or prices',()=>{
 let {state,id,supply,draftId}=connected();state=op(state,'verifySupply',{id:supply.id,scenario:'鉴权失败'},id);assert.equal(availableSupplies(state,id).length,1);assert.equal(state.endpoints.find(row=>row.id===supply.endpointId).connectionTest.result,'失败');const data=priced(state,id,supply);state=op(state,'saveOnboarding',{...state.modelOnboardings.find(d=>d.id===draftId),prices:data.items,sourceVersion:data.sourceVersion});const before=JSON.stringify(state);assert.throws(()=>op(state,'completeOnboarding',{draftId,publish:true}),/验证/);assert.equal(JSON.stringify(state),before);state=op(state,'saveOnboarding',{...state.modelOnboardings.find(d=>d.id===draftId),targetRevision:'outdated'});assert.throws(()=>op(state,'onboardModel',{draftId,model:state.models.find(m=>m.id===id)}),/资料已有并发修订/);
});

test('same platform model keeps each supplier sale independent',()=>{
 let {state,id,supply:first}=connected();state=op(state,'reprice',priced(state,id,first,'3'),id);const firstPrice=structuredClone(activeSupplySalePrice(state,id,first.id));
 state=op(state,'providerRegistration',{provider:{...newProvider,name:'独立服务商',code:'independent'},connections:[connection]});const provider=state.providers.find(p=>p.code==='independent'),endpoint=state.endpoints.find(e=>e.providerId===provider.id);
 state=op(state,'provider',{operation:'cataloguePrice',objectId:provider.id,values:{modelId:'upstream-v1',scenarios:[{name:'输入',unit:'百万 Token',currency:'CNY',listPrice:'0'}]}});
 state=op(state,'saveOnboarding',{providerId:provider.id,catalogueModelId:'upstream-v1',endpointId:endpoint.id,targetModelId:id,targetRevision:state.models.find(m=>m.id===id).updatedAt,confirmedIdentity:true});const draftId=state.audits[0].objectId;state=op(state,'onboardModel',{draftId,model:state.models.find(m=>m.id===id)});const second=modelSupplies(state,id).find(s=>s.provider.id===provider.id);state=op(state,'reprice',priced(state,id,second,'9'),id);assert.deepEqual(activeSupplySalePrice(state,id,first.id),firstPrice);assert.equal(activeSupplySalePrice(state,id,second.id).items[0].amount,9000000);assert.equal(state.models.filter(m=>m.id===id).length,1);
});
test('concurrent sales selection and incomplete selected supplies block final confirmation atomically',()=>{
 let {state,id,supply,draftId}=connected();const price=priced(state,id,supply);state=op(state,'saveOnboarding',{...state.modelOnboardings.find(d=>d.id===draftId),prices:price.items,sourceVersion:price.sourceVersion,expectedSaleVersion:price.expectedSaleVersion});
 state.modelSupplies.find(s=>s.id===supply.id).salesEnabled=true;const before=JSON.stringify(state);assert.throws(()=>op(state,'completeOnboarding',{draftId,publish:true}),/销售供给已有并发修订/);assert.equal(JSON.stringify(state),before);
});
test('new onboarding and repricing preserve permissions and failed persistence without mutating input',()=>{
 const {state,id,supply,draftId}=connected(),before=JSON.stringify(state);const actions=[{type:'modelOperations',operation:'reprice',modelId:id,data:priced(state,id,supply)},{type:'modelOperations',operation:'saveOnboarding',data:{...state.modelOnboardings.find(d=>d.id===draftId),step:'review'}}];
 for(const action of actions){assert.throws(()=>commitAdminState(state,action,'运维人员'),/无权/);assert.throws(()=>persistModelAction(state,action,{getItem:()=>JSON.stringify(state),setItem:()=>{throw Error('write failed');}}),/write failed/);assert.equal(JSON.stringify(state),before);}
});
test('catalogue quote versions identify the source of published sale snapshots',()=>{
 let {state,id,supply}=connected();state=op(state,'reprice',priced(state,id,supply),id);const sale=activeSupplySalePrice(state,id,supply.id);assert.match(sale.sourceLabel,/测试服务商 \/ upstream-v1/);assert.equal(JSON.parse(sale.sourceVersion).discountFactor,1000000);const old=structuredClone(sale);state=op(state,'provider',{operation:'catalogueDiscount',objectId:supply.provider.id,values:{modelId:'upstream-v1',discountFactor:'0.8'}});assert.equal(JSON.parse(procurementVersion(activeSupplyPrice(state,supply.id))).discountFactor,800000);assert.deepEqual(state.modelSalePrices.find(p=>p.id===sale.id),old);
});
test('markup preserves precision, zero and missing cost; change percentage handles free rates',async()=>{
 const {markedUpItems,saleChange,billingItemKey}=await import('../src/admin-v2/provider-catalogue-pricing.js');const cost=[{name:'夜间输入',condition:'32K–128K',unit:'百万 Token',currency:'CNY',amount:1},{name:'缓存读取',unit:'百万 Token',currency:'USD',amount:0}];const draft=markedUpItems(cost,'50');assert.equal(draft[0].amount,'0.000002');assert.equal(draft[1].amount,'0');assert.equal(billingItemKey(draft[0]),billingItemKey(cost[0]));assert.throws(()=>markedUpItems([{...cost[0],amount:null}],'20'),/不能按零成本/);assert.throws(()=>markedUpItems(cost,''),/加价比例/);assert.throws(()=>markedUpItems(cost,'10001'),/范围/);assert.equal(saleChange(0,'1'),'免费 → 收费');assert.equal(saleChange(0,'0'),'0.00%');assert.equal(saleChange(null,'0'),'—');
});

test('new supplier publication requires a service mode while existing listed supply retains unlist and stop behavior',()=>{
 let {state,id,supply}=connected();
 state=op(state,'reprice',priced(state,id,supply),id);
 const prices=structuredClone(state.modelSalePrices),endpoints=structuredClone(state.endpoints);
 const before=structuredClone(state);assert.throws(()=>op(state,'publishSupply',{id:supply.id},id),/服务模式/);assert.deepEqual(state,before);
 Object.assign(state.models.find(item=>item.id===id),{listingStatus:'已上架',visibility:'公开',callsEnabled:true,status:'运行中',openScope:'all'});
 state.modelSupplies.find(item=>item.id===supply.id).salesEnabled=true;
 state=op(state,'unlistSupply',{id:supply.id},id);
 assert.equal(state.modelSupplies.find(s=>s.id===supply.id).salesEnabled,false);
 assert.equal(availableSupplies(state,id).length,1);
 assert.equal(state.models.find(m=>m.id===id).listingStatus,'已下架');
 assert.equal(state.models.find(m=>m.id===id).callsEnabled,true);
 state=op(state,'stopSupply',{id:supply.id},id);
 assert.equal(availableSupplies(state,id).length,0);
 assert.equal(state.models.find(m=>m.id===id).callsEnabled,false);
 assert.equal(state.modelSupplies.find(s=>s.id===supply.id).status,'已停用');
 state=op(state,'startSupply',{id:supply.id},id);
 assert.equal(state.models.find(m=>m.id===id).callsEnabled,true);
 assert.equal(state.models.find(m=>m.id===id).listingStatus,'已下架');assert.equal(state.modelSupplies.find(item=>item.id===supply.id).salesEnabled,false);
 assert.deepEqual(state.modelSalePrices,prices);
 assert.deepEqual(state.endpoints,endpoints);
});

test('supplier lifecycle affects only its own supply and keeps other suppliers selling',()=>{
 let state=createAdminSeed();const model=state.models.find(m=>m.id==='catalog-demo-kimi'),supplies=modelSupplies(state,model.id),target=supplies[0];
 const others=state.modelSupplies.filter(s=>s.id!==target.id),prices=structuredClone(state.modelSalePrices);
 state=op(state,'stopSupply',{id:target.id},model.id);
 assert.deepEqual(state.modelSupplies.filter(s=>s.id!==target.id),others);
 assert.equal(state.models.find(m=>m.id===model.id).listingStatus,'已上架');
 assert.equal(state.models.find(m=>m.id===model.id).callsEnabled,true);
 assert.ok(availableSupplies(state,model.id).length>0);
 assert.deepEqual(state.modelSalePrices,prices);
});

test('supplier listing rejects missing price, unverified supply, foreign IDs and read-only role atomically',()=>{
 let {state,id,supply}=connected();const before=structuredClone(state);
 assert.throws(()=>op(state,'publishSupply',{id:supply.id},id),/完整/);
 assert.deepEqual(state,before);
 state=op(state,'reprice',priced(state,id,supply),id);
 state=legacy(state,'verify',{id:supply.id,result:'失败'},id);
 assert.throws(()=>op(state,'publishSupply',{id:supply.id},id),/验证通过/);
 assert.throws(()=>op(state,'stopSupply',{id:supply.id},'model-1'),/不存在/);
 assert.throws(()=>commitAdminState({...state,currentRole:'运维人员'},{type:'modelOperations',operation:'stopSupply',data:{id:supply.id},modelId:id}),/无权/);
});

test('supplier connectivity preview never enables a stopped service or changes saved records',async()=>{
 const {supplyConnectivityTest,supplySalesStatus}=await import('../src/admin-v2/model-operations.js');
 let {state,id,supply}=connected();state=op(state,'stopSupply',{id:supply.id},id);const before=structuredClone(state);
 for(const [scenario,status] of [['success',200],['unauthorized',401],['unavailable',404],['timeout',null]]){
  const result=supplyConnectivityTest(state,{modelId:id,supplyId:supply.id,prompt:'OK',scenario});assert.equal(result.status,status);assert.equal(result.simulated,true);
 }
 assert.deepEqual(state,before);assert.equal(supplySalesStatus(modelSupplies(state,id)[0]),'停止服务');
 assert.throws(()=>supplyConnectivityTest(state,{modelId:id,supplyId:supply.id,prompt:' ',scenario:'success'}),/测试内容/);
 const noKey=structuredClone(state);noKey.endpoints.find(ep=>ep.id===supply.endpointId).credentialRef='';
 assert.throws(()=>supplyConnectivityTest(noKey,{modelId:id,supplyId:supply.id,prompt:'OK',scenario:'success'}),/凭证/);
 assert.equal(supplySalesStatus({status:'已启用',salesEnabled:true}),'上架售卖');
 assert.equal(supplySalesStatus({status:'已启用',salesEnabled:false}),'下架停售');
});

test('unlisting the final sale service blocks existing subscriber calls',async()=>{
 const {simulateRequest}=await import('../src/admin-v2/domain.js');
 let {state,id,supply}=connected();state=op(state,'reprice',priced(state,id,supply),id);
 Object.assign(state.models.find(item=>item.id===id),{listingStatus:'已上架',visibility:'公开',callsEnabled:true,status:'运行中',openScope:'all'});state.modelSupplies.find(item=>item.id===supply.id).salesEnabled=true;
 const key=state.apiKeys.find(k=>k.status==='有效'&&state.grants.some(g=>g.subjectId===k.id));key.modelIds.push(id);state.limits=state.limits.filter(l=>l.scopeId!==key.id);
 const call=()=>simulateRequest(state,{requestId:crypto.randomUUID(),keyId:key.id,modelId:id}).request;
 assert.equal(call().httpStatus,200);
 state=op(state,'unlistSupply',{id:supply.id},id);assert.equal(call().httpStatus,403);
 state=op(state,'stopSupply',{id:supply.id},id);assert.notEqual(call().httpStatus,200);
});

test('floor discount is one versioned percentage per supplier and never changes prices or other sales settings',async()=>{
 const {floorDiscountDisplay,parseFloorDiscount,supplyModelUrl}=await import('../src/admin-v2/model-management.js');
 let {state,id,supply}=connected();const modelBefore=structuredClone(state.models.find(m=>m.id===id)),suppliesBefore=structuredClone(state.modelSupplies),costsBefore=structuredClone(state.supplyPrices);
 state=op(state,'reprice',{...priced(state,id,supply),floorDiscountPercent:'40'},id);
 const first=activeSupplySalePrice(state,id,supply.id);assert.equal(first.floorDiscountBps,4000);assert.equal(floorDiscountDisplay(first),'40%');
 state=op(state,'reprice',priced(state,id,supply,'4'),id);assert.equal(activeSupplySalePrice(state,id,supply.id).floorDiscountBps,4000);
 state=op(state,'reprice',{...priced(state,id,supply,'4'),floorDiscountPercent:'0'},id);assert.equal(floorDiscountDisplay(activeSupplySalePrice(state,id,supply.id)),'0%');
 state=op(state,'reprice',{...priced(state,id,supply,'4'),floorDiscountPercent:''},id);assert.equal(floorDiscountDisplay(activeSupplySalePrice(state,id,supply.id)),'—');
 assert.equal(state.modelSalePrices.find(p=>p.id===first.id).floorDiscountBps,4000);
 assert.deepEqual(state.models.find(m=>m.id===id),modelBefore);assert.deepEqual(state.modelSupplies,suppliesBefore);assert.deepEqual(state.supplyPrices,costsBefore);
 for(const value of ['-1','100.01','40.123','Infinity','40%'])assert.throws(()=>op(state,'reprice',{...priced(state,id,supply),floorDiscountPercent:value},id),/底线折扣/);
 assert.equal(parseFloorDiscount('100'),10000);assert.equal(parseFloorDiscount('40.25'),4025);
 assert.equal(supplyModelUrl(supply,{type:'text'}),supply.endpoint.baseUrl+'/chat/completions');
});

test('supplier model URLs use explicit endpoints and the OpenAI chat request path',async()=>{
 const {supplyModelUrl}=await import('../src/admin-v2/model-management.js');
 const supply={upstreamModelId:'model-v1',endpoint:{baseUrl:'https://service.example.invalid/api/v3'},provider:{catalogModels:[{modelId:'model-v1',endpoint:'/api/v3/chat/completions?variant=V1'}]}};
 assert.equal(supplyModelUrl(supply),'https://service.example.invalid/api/v3/chat/completions?variant=V1');
 supply.provider.catalogModels[0].endpoint='https://other.example.invalid/Models/Invoke?mode=Chat';assert.equal(supplyModelUrl(supply),'https://other.example.invalid/Models/Invoke?mode=Chat');
 supply.provider.catalogModels=[];assert.equal(supplyModelUrl(supply),'');
 supply.endpoint.protocol='OpenAI';assert.equal(supplyModelUrl(supply,{type:'text'}),supply.endpoint.baseUrl+'/chat/completions');
 supply.endpoint.baseUrl+='/' ;assert.equal(supplyModelUrl(supply,{type:'text'}),'https://service.example.invalid/api/v3/chat/completions');
 supply.endpoint.baseUrl='https://service.example.invalid/v1/chat/completions';assert.equal(supplyModelUrl(supply,{type:'text'}),supply.endpoint.baseUrl);
 assert.equal(supplyModelUrl(supply,{type:'video'}),'');
 assert.equal(supplyModelUrl({upstreamModelId:'missing'}),'');
});

test('library capability changes require confirmation, while supplier and price records stay independent',()=>{
 let {state,id,supply}=connected();const model=state.models.find(m=>m.id===id),before=structuredClone(state),data={...model,id,capabilities:{...model.capabilities,context:16384}};
 assert.throws(()=>op(state,'templateSave',data),/请确认能力变更/);assert.deepEqual(state,before);
 state=op(state,'templateSave',{...data,confirmCapabilities:true});
 assert.equal(state.models.find(m=>m.id===id).capabilities.context,16384);
 assert.equal(state.modelSupplies.find(s=>s.id===supply.id).validationStatus,'待验证');
 assert.equal(state.modelSupplies.find(s=>s.id===supply.id).status,'已停用');
 assert.deepEqual(state.modelSalePrices,before.modelSalePrices);assert.deepEqual(state.supplyPrices,before.supplyPrices);assert.deepEqual(state.endpoints,before.endpoints);
 assert.equal(state.models.find(m=>m.id===id).openScope,model.openScope);
});

test('a library record remains one editable authority after supplier onboarding',async()=>{
 const {libraryRecord,modelLibrary}=await import('../src/admin-v2/model-operations.js');let {state,id}=connected();const model=state.models.find(m=>m.id===id),libraryId=model.templateId;
 assert.ok(libraryId);assert.equal(libraryRecord(state,libraryId).id,libraryId);assert.equal(libraryRecord(state,id).id,libraryId);assert.equal(modelLibrary(state).filter(m=>m.modelId===model.modelId).length,1);
 state=op(state,'templateSave',{...model,id:libraryId,description:'统一维护后的模型介绍'});
 assert.equal(state.models.find(m=>m.id===id).description,'统一维护后的模型介绍');
 assert.equal(libraryRecord(state,libraryId).description,'统一维护后的模型介绍');
 assert.equal(state.modelTemplates.find(m=>m.id===libraryId).description,'统一维护后的模型介绍');
 const draft=state.modelOnboardings.find(d=>d.modelId===id);state=op(state,'saveOnboarding',{...draft,libraryId:id,step:'price'});
 assert.equal(state.modelOnboardings.find(d=>d.id===draft.id).supplyId,draft.supplyId);
 assert.equal(state.modelOnboardings.find(d=>d.id===draft.id).modelId,id);
});

test('onboarding cannot bypass the library with a standalone editable metadata payload',()=>{
 let {state,id,draftId}=connected();const draft=state.modelOnboardings.find(d=>d.id===draftId),model=state.models.find(m=>m.id===id);
 state=op(state,'saveOnboarding',{...draft,targetRevision:model.updatedAt,step:'metadata'});const before=structuredClone(state);
 assert.throws(()=>op(state,'onboardModel',{draftId,model:{...model,name:'独立副本'} }),/资料库维护/);assert.deepEqual(state,before);
 assert.throws(()=>op(state,'templateSave',{...modelInput,modelId:model.modelId}),/已存在/);
 assert.throws(()=>op(state,'templateFromModel',{},id),/未知/);
});

test('saving a master from onboarding atomically retains its reference and draft progress',()=>{
 let {state,id,draftId}=connected();const model=state.models.find(m=>m.id===id),draft=state.modelOnboardings.find(d=>d.id===draftId);
 state=op(state,'templateSave',{...model,id,description:'上架期间更新资料',onboardingId:draftId});
 const saved=state.modelOnboardings.find(d=>d.id===draftId);assert.equal(saved.libraryId,model.templateId);assert.equal(saved.modelId,id);assert.equal(saved.supplyId,draft.supplyId);
 const before=structuredClone(state);assert.throws(()=>op(state,'templateSave',{...modelInput,modelId:'another-master',onboardingId:'missing'}),/上架进度/);assert.deepEqual(state,before);
});

function createAdminSeed(...args) { return withAdminSession(baseCreateAdminSeed(...args)); }
function parseAdminState(...args) { return withAdminSession(baseParseAdminState(...args)); }
