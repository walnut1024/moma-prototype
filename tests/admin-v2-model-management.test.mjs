import { modelProfileDraft, modelKeySpecs, specificationFields } from '../src/admin-v2/model-profile.js';
import test from 'node:test';
import assert from 'node:assert/strict';
import { createAdminSeed, commitAdminState, parseAdminState, persistModelAction } from '../src/admin-v2/store.js';
import { activeModelPrice, activeSupplySalePrice, modelSaleSummary, activeSupplyPrice, availableSupplies, publicationChecks, hasOutputPrice, modelCode, modelSupplierRows } from '../src/admin-v2/model-management.js';
import { simulateRequest } from '../src/admin-v2/domain.js';
const glm = 'model-glm53';
const operate = (state, operation, data = {}, modelId = glm, actor) => commitAdminState(state, { type: 'modelOperation', operation, modelId, data }, actor);
const price = { unit: '元/百万 Token', inputPrice: '2', outputPrice: '8', cachedPrice: '', cacheWritePrice: '' };
const basic = { modelId: 'test-model', name: '测试模型', maker: '演示厂商', description: '测试模型接入', type: 'text', profile: { tasks: ['对话'], inputModalities: ['文本'], outputModalities: ['文本'] }, capabilities: { streaming: true, tools: true, context: 32768, output: 8192 } };

test('one public model has three supplies with independent capabilities and procurement costs', () => {
  const state = createAdminSeed();
  assert.equal(state.modelSupplies.filter(s => s.modelId === glm).length,3);
  assert.equal(availableSupplies(state,glm).length,2);
  assert.equal(availableSupplies(state,glm,{tools:true}).length,1);
  assert.equal(activeSupplyPrice(state,'supply-glm53-1').inputPrice,1000000);
  assert.equal(activeSupplyPrice(state,'supply-glm53-2').inputPrice,1500000);
  assert.equal(activeSupplyPrice(state,'supply-glm53-3'),undefined);
  assert.ok(publicationChecks(state,state.models.find(m => m.id === glm)).every(c => c.passed));
});

test('supplier verification gates enabling and editing clears validation', () => {
  let state = createAdminSeed();
  assert.throws(() => operate(state,'enableSupply',{id:'supply-glm53-3'}),/验证通过/);
  assert.throws(() => operate(state,'verify',{id:'supply-glm53-3',result:'通过'}), /连接测试/);
  state = commitAdminState(state, { type:'providerOperation', operation:'testConnection', objectId:'endpoint-kimi', data:{scenario:'成功'} });
  state = commitAdminState(state, { type:'providerOperation', operation:'enableConnection', objectId:'endpoint-kimi' });
  state = operate(state,'verify',{id:'supply-glm53-3',result:'通过'});
  state = operate(state,'enableSupply',{id:'supply-glm53-3'});
  assert.equal(availableSupplies(state,glm).length,3);
  state = operate(state,'verify',{id:'supply-glm53-3',result:'超时'});
  assert.equal(availableSupplies(state,glm).length,2);
  state = operate(state,'supply',{id:'supply-glm53-1',endpointId:'endpoint-ds',upstreamModelId:'glm-new',capabilities:basic.capabilities});
  assert.equal(state.modelSupplies.find(s => s.id === 'supply-glm53-1').validationStatus,'待验证');
  assert.equal(availableSupplies(state,glm,{tools:true}).length,0);
});

test('creation is atomic, Model ID is unique and supplier mapping cannot duplicate a channel', () => {
  const initial = createAdminSeed(), created = operate(initial,'create',basic), modelId = created.audits[0].objectId;
  assert.equal(created.models.find(m=>m.id===modelId).callsEnabled,false);
  assert.ok(created.modelVersions.some(v=>v.modelId===modelId));
  assert.throws(() => operate(created,'create',basic),/已存在/);
  assert.equal(initial.models.length+1,created.models.length);
  assert.throws(() => operate(initial,'supply',{endpointId:'endpoint-ds',upstreamModelId:'glm',capabilities:basic.capabilities}),/已关联/);
  const changed = operate(created,'basic',{...basic,modelId:'attempted-renaming'},modelId);
  assert.equal(changed.models.find(m=>m.id===modelId).modelId,'test-model');
});

test('prices preserve zero vs unknown, reject invalid input and persist draft and future versions', () => {
  let state = createAdminSeed();
  state = operate(state,'pricePublish',{...price,inputPrice:'0',outputPrice:'0'});
  assert.equal(activeModelPrice(state,glm).inputPrice,0);
  assert.equal(activeModelPrice(state,glm).cachedPrice,null);
  for (const bad of ['-1','1.0000001','Infinity']) assert.throws(() => operate(state,'pricePublish',{...price,inputPrice:bad}),/非负/);
  assert.throws(() => operate(state,'pricePublish',{...price,outputPrice:''}),/必填/);
  assert.throws(() => operate(state,'pricePublish',{...price,effectiveAt:'2020-01-01T00:00:00Z'}),/晚于/);
  state = operate(state,'priceDraft',{...price,inputPrice:'',outputPrice:''});
  assert.equal(activeModelPrice(state,glm).inputPrice,0);
  const future = new Date(Date.now()+86400000).toISOString();
  state = operate(state,'pricePublish',{...price,inputPrice:'3',effectiveAt:future});
  assert.equal(activeModelPrice(state,glm).inputPrice,0);
  assert.equal(activeModelPrice(state,glm,Date.parse(future)+1).inputPrice,3000000);
  assert.ok(state.modelSalePrices.filter(p=>p.modelId===glm).length>=4);
});

test('procurement versions remain scoped to supply and never change the model selling price', () => {
  let state = createAdminSeed(); const before = activeModelPrice(state,glm);
  state = operate(state,'procurement',{...price,supplyId:'supply-glm53-3',inputPrice:'1.2',outputPrice:'4.5'});
  assert.equal(activeSupplyPrice(state,'supply-glm53-3').inputPrice,1200000);
  assert.equal(activeSupplyPrice(state,'supply-glm53-1').inputPrice,1000000);
  assert.deepEqual(activeModelPrice(state,glm),before);
});

test('publication requires a verified source, matching declared capabilities, price and valid scope', () => {
  let state = createAdminSeed();
  state = operate(state,'disableSupply',{id:'supply-glm53-1'});
  assert.throws(() => operate(state,'publish'),/对外能力/);
  state = operate(state,'disableSupply',{id:'supply-glm53-2'});
  assert.throws(() => operate(state,'publish'),/至少一个/);
  assert.throws(() => operate(state,'scope',{openScope:'selected',tenantIds:[]}),/有效/);
  const missing = { ...createAdminSeed(), modelSalePrices: [] };
  assert.throws(() => operate(missing,'publish'),/销售价格/);
});

test('hide retains calls, pause and unlist reject calls, scope blocks unauthorized tenants', () => {
  let state = createAdminSeed(); const keyId = 'key-002';
  state = operate(state,'hide');
  let result = simulateRequest(state,{requestId:'hidden-ok',keyId,modelId:glm});
  assert.equal(result.request.httpStatus,200);
  state = operate(result.state,'pause');
  result = simulateRequest(state,{requestId:'paused',keyId,modelId:glm});
  assert.equal(result.request.attempts[0].error,'model_call_disabled'); assert.equal(result.request.httpStatus,403);
  state = operate(result.state,'resume');
  state = operate(state,'scope',{openScope:'selected',tenantIds:['tenant-nanjing']});
  assert.equal(simulateRequest(state,{requestId:'scope-reject',keyId,modelId:glm}).request.httpStatus,403);
  state = operate(state,'unlist');
  assert.equal(state.models.find(m=>m.id===glm).visibility,'内部');
  assert.equal(simulateRequest(state,{requestId:'down',keyId,modelId:glm}).request.httpStatus,403);
});

test('unsupported tool requests cannot use an incapable source or fallback', () => {
  const state=createAdminSeed();
  const result=simulateRequest(state,{requestId:'tools-no-fallback',keyId:'key-002',modelId:glm,requirements:{tools:true},forceTimeout:true});
  assert.equal(result.request.httpStatus,504);
  assert.equal(result.request.attempts[0].endpointId,'endpoint-ds');
  assert.ok(result.request.attempts.every(a=>a.endpointId==='endpoint-ds'));
});

test('request price snapshots retain the previous version after a price change', () => {
  let state=createAdminSeed(); const first=simulateRequest(state,{requestId:'snapshot-before',keyId:'key-002',modelId:glm});
  state=operate(first.state,'pricePublish',{...price,inputPrice:'4'});
  const second=simulateRequest(state,{requestId:'snapshot-after',keyId:'key-002',modelId:glm});
  assert.equal(first.request.priceSnapshot.inputPrice,2000000);
  assert.equal(second.request.priceSnapshot.inputPrice,4000000);
  assert.notEqual(first.request.priceVersionId,second.request.priceVersionId);
});

test('image, video and speech prices enforce applicable units and do not require a Token output price', () => {
  let state=createAdminSeed();
  for(const [modelId,unit] of [['model-4','元/秒'],['model-5','元/万字符'],['model-22','元/张']]) {
    state=operate(state,'pricePublish',{unit,inputPrice:'1.5',outputPrice:''},modelId);
    assert.equal(activeModelPrice(state,modelId).outputPrice,null);
  }
  assert.throws(()=>operate(state,'pricePublish',{...price, unit:'元/张'},'model-5'),/不匹配/);
  assert.equal(hasOutputPrice({type:'video'},'元/秒'),false);
  assert.equal(hasOutputPrice({type:'video'},'元/百万 Token'),true);
});

test('readonly writes are rejected, operator actions allowed, finance limited to prices and storage roundtrips', () => {
  let state=createAdminSeed();
  assert.throws(()=>operate(state,'hide',{},glm,'只读观察员'),/无权/);
  state=operate(state,'priceDraft',price,glm,'财务人员');
  assert.throws(()=>operate(state,'hide',{},glm,'财务人员'),/无权/);
  state=operate(state,'hide',{},glm,'运营人员');
  const restored=parseAdminState(JSON.stringify(state));
  assert.deepEqual(restored.modelSupplies,state.modelSupplies);
  assert.deepEqual(restored.modelSalePrices,state.modelSalePrices);
  assert.deepEqual(restored.tenants,state.tenants);
});

test('model persistence rejects stale revisions and write failures without committing state', () => {
  const state=createAdminSeed(), action={type:'modelOperation',operation:'hide',modelId:glm};
  assert.throws(()=>persistModelAction(state,action,{getItem:()=>JSON.stringify({...state,revision:state.revision+1}),setItem:()=>assert.fail('must not save')}),/数据已变化/);
  assert.throws(()=>persistModelAction(state,action,{getItem:()=>JSON.stringify(state),setItem:()=>{throw Error('storage full');}}),/storage full/);
  assert.equal(state.models.find(m=>m.id===glm).visibility,'公开');
  let saved;
  const next=persistModelAction(state,action,{getItem:()=>JSON.stringify(state),setItem:(_key,value)=>saved=value});
  const persisted=JSON.parse(saved);
  assert.equal(persisted.revision,next.revision);
  assert.deepEqual(persisted.audits,next.audits);
  assert.equal(persisted.models.find(m=>m.id===glm).visibility,'内部');
  assert.equal(next.models.find(m=>m.id===glm).visibility,'内部');
});

test('configured routes cannot silently send requests to an unconfigured supply', () => {
  let state=createAdminSeed();
  state=operate(state,'disableSupply',{id:'supply-endpoint-ds-model-1'},'model-1');
  state.routes=state.routes.map(route=>route.modelId==='model-1'?{...route,targets:[{endpointId:'endpoint-ds',weight:100}]}:route);
  assert.equal(availableSupplies(state,'model-1').length,1);
  assert.equal(simulateRequest(state,{requestId:'route-no-escape',keyId:'key-002',modelId:'model-1'}).request.httpStatus,503);
});


test('supplier selling quotes override defaults without changing procurement, including drafts and schedules', () => {
  let state = createAdminSeed();
  const beforeCost = activeSupplyPrice(state,'supply-glm53-1');
  state = operate(state,'pricePublish',{...price,supplyId:'supply-glm53-1',inputPrice:'1.8',outputPrice:'7'});
  assert.equal(activeSupplySalePrice(state,glm,'supply-glm53-1').inputPrice,1800000);
  assert.equal(activeModelPrice(state,glm).inputPrice,2000000);
  assert.deepEqual(activeSupplyPrice(state,'supply-glm53-1'),beforeCost);
  state = operate(state,'priceDraft',{...price,supplyId:'supply-glm53-1',inputPrice:''});
  assert.equal(activeSupplySalePrice(state,glm,'supply-glm53-1').inputPrice,1800000);
  const future = new Date(Date.now()+86400000).toISOString();
  state = operate(state,'pricePublish',{...price,supplyId:'supply-glm53-1',inputPrice:'3',effectiveAt:future});
  assert.equal(activeSupplySalePrice(state,glm,'supply-glm53-1').inputPrice,1800000);
  assert.equal(activeSupplySalePrice(state,glm,'supply-glm53-1',Date.parse(future)+1).inputPrice,3000000);
  assert.throws(()=>operate(state,'pricePublish',{...price,supplyId:'supply-other-model'}),/不存在/);
});

test('catalogue ranges exclude unavailable services, count missing quotes and keep units separate', () => {
  let state = createAdminSeed(); const model = state.models.find(m=>m.id===glm);
  const initial = modelSaleSummary(state,model);
  assert.deepEqual(initial.groups[0].input,[2000000,2500000]);
  state = operate(state,'pricePublish',{...price,supplyId:'supply-glm53-3',inputPrice:'0.1',outputPrice:'0.1'});
  assert.deepEqual(modelSaleSummary(state,model).groups[0].input,[2000000,2500000]);
  state.modelSalePrices = state.modelSalePrices.filter(p=>p.modelId!==glm || p.supplyId==='supply-glm53-2');
  const partial = modelSaleSummary(state,model);
  assert.equal(partial.missing,1);
  assert.equal(partial.priced,true);
  assert.equal(publicationChecks(state,model).find(c=>c.tab==='pricing').passed,false);
  const video = state.models.find(m=>m.type==='video');
  state.modelSupplies.push({...state.modelSupplies.find(s=>s.id==='supply-glm53-1'),id:'supply-video-1',modelId:video.id});
  state.modelSupplies.push({...state.modelSupplies.find(s=>s.id==='supply-glm53-2'),id:'supply-video-2',modelId:video.id});
  state = operate(state,'pricePublish',{unit:'元/秒',inputPrice:'1',outputPrice:'',supplyId:'supply-video-1'},video.id);
  state = operate(state,'pricePublish',{unit:'元/百万 Token',inputPrice:'2',outputPrice:'8',supplyId:'supply-video-2'},video.id);
  assert.deepEqual(modelSaleSummary(state,video).groups.map(g=>g.unit).sort(),['元/秒','元/百万 Token'].sort());
});

test('simulation records the fulfilled supplier selling-price version, including fallback', () => {
  let state = createAdminSeed();
  const key=state.apiKeys.find(k=>k.status==='有效'); key.modelIds.push(glm);
  state = operate(state,'pricePublish',{...price,supplyId:'supply-glm53-1',inputPrice:'1.8',outputPrice:'7'});
  state.routes.push({id:'route-glm',modelId:glm,status:'已生效',targets:[{endpointId:'endpoint-ds'}]});
  state.fallbacks.push({id:'fallback-glm',routeId:'route-glm',status:'已启用',chain:['endpoint-ds','endpoint-glm']});
  const first = simulateRequest(state,{requestId:'supplier-first',keyId:key.id,modelId:glm});
  assert.equal(first.request.httpStatus,200);
  assert.equal(first.request.supplyId,'supply-glm53-1');
  assert.equal(first.request.priceSnapshot.inputPrice,1800000);
  const fallback = simulateRequest(state,{requestId:'supplier-fallback',keyId:key.id,modelId:glm,forceTimeout:true});
  assert.equal(fallback.request.httpStatus,200);
  assert.equal(fallback.request.supplyId,'supply-glm53-2');
  assert.equal(fallback.request.priceSnapshot.inputPrice,2500000);
  assert.notEqual(fallback.request.priceVersionId,first.request.priceVersionId);
  assert.equal(first.request.priceSnapshot.inputPrice,1800000);
});

test('catalogue examples have linked suppliers, upstream IDs and model-specific price dimensions', () => {
  const state = createAdminSeed(), examples = state.models.filter(model => model.id.startsWith('catalog-demo-'));
  assert.equal(examples.length, 8);
  for (const model of examples) {
    const supplies = availableSupplies(state, model.id);
    assert.equal(supplies.length, 5);
    assert.equal(new Set(supplies.map(supply => supply.upstreamModelId)).size, 5);
    assert.ok(supplies.every(supply => supply.upstreamModelId !== model.modelId));
    assert.ok(publicationChecks(state, model).every(check => check.passed));
    assert.ok(state.modelVersions.some(version => version.id === model.defaultVersionId && version.modelId === model.id));
  }
  const summary = modelSaleSummary(state, examples.find(model => model.id === 'catalog-demo-kimi'));
  assert.deepEqual(summary.groups[0].cached, Array(5).fill(500000));
  assert.deepEqual(summary.groups[0].cacheWrite, Array(5).fill(2500000));
  const units = Object.fromEntries(examples.map(model => [model.id, activeModelPrice(state, model.id).unit]));
  assert.equal(units['catalog-demo-image'], '元/张');
  assert.equal(units['catalog-demo-video'], '元/秒');
  assert.equal(units['catalog-demo-tts'], '元/万字符');
  assert.equal(units['catalog-demo-asr'], '元/分钟');
  assert.equal(units['catalog-demo-rerank'], '元/千次');
});

test('new catalogue examples load into saved state once without replacing existing quotes or edits', () => {
  const initial = createAdminSeed();
  for (const collection of ['models', 'modelVersions', 'modelSupplies', 'modelSalePrices']) initial[collection] = initial[collection].filter(item => !(item.id.startsWith('catalog-') || item.modelId?.startsWith('catalog-')));
  initial.providers = initial.providers.filter(item => !item.id.startsWith('catalog-'));
  initial.endpoints = initial.endpoints.filter(item => !item.id.startsWith('catalog-'));
  const existingPrices = structuredClone(initial.modelSalePrices);
  let restored = parseAdminState(JSON.stringify(initial));
  assert.ok(publicationChecks(restored, restored.models.find(model => model.id === 'catalog-demo-asr')).every(check => check.passed));
  assert.deepEqual(restored.modelSalePrices.filter(price => !price.modelId.startsWith('catalog-')), existingPrices);
  restored.models.find(model => model.id === 'catalog-demo-asr').name = '运营已修改';
  restored.modelSupplies = restored.modelSupplies.filter(supply => supply.id !== 'catalog-supply-asr-huawei');
  restored = parseAdminState(JSON.stringify(restored));
  assert.equal(restored.models.find(model => model.id === 'catalog-demo-asr').name, '运营已修改');
  assert.equal(restored.modelSupplies.some(supply => supply.id === 'catalog-supply-asr-huawei'), false);
  assert.equal(restored.models.filter(model => model.id.startsWith('catalog-demo-')).length, 8);
  restored = operate(restored, 'pricePublish', { unit: '元/分钟', inputPrice: '0.08' }, 'catalog-demo-asr');
  assert.equal(activeModelPrice(restored, 'catalog-demo-asr').inputPrice, 80000);
  restored = operate(restored, 'pricePublish', { unit: '元/千次', inputPrice: '0.9' }, 'catalog-demo-rerank');
  assert.equal(activeModelPrice(restored, 'catalog-demo-rerank').inputPrice, 900000);
});

test('catalogue metadata persists without changing verified supply facts', () => {
  const initial = createAdminSeed();
  const changed = operate(initial, 'basic', { ...basic, profile: { family: 'GLM', version: '5.3', reasoning: 'unknown', structured: 'supported', maxInput: '32768', documentation: 'https://example.com/models' } });
  const profile = changed.models.find(model => model.id === glm).profile;
  assert.equal(profile.maxInput, 32768);
  assert.equal(profile.structured, 'supported');
  assert.equal(profile.reasoning, undefined);
  assert.deepEqual(changed.modelSupplies, initial.modelSupplies);
  assert.deepEqual(parseAdminState(JSON.stringify(changed)).models.find(model => model.id === glm).profile, profile);
});

test('type-specific catalogue validation rejects inconsistent limits and unsafe document URLs', () => {
  const initial = createAdminSeed();
  assert.throws(() => operate(initial, 'basic', { ...basic, type: 'video', profile: { minDuration: 10, maxDuration: 5 } }), /最短生成时长/);
  assert.throws(() => operate(initial, 'basic', { ...basic, type: 'rerank', profile: { documentLimit: 5, topN: 10 } }), /候选文档/);
  assert.throws(() => operate(initial, 'basic', { ...basic, type: 'embedding', profile: { dimensions: '1024、0' } }), /向量维度/);
  assert.throws(() => operate(initial, 'basic', { ...basic, profile: { documentation: 'javascript:alert(1)' } }), /http 或 https/);
  const changed = operate(initial, 'basic', { ...basic, type: 'image', profile: { family: 'Demo', imageLimit: '4', maxInput: 1000, reasoning: 'supported' } });
  assert.deepEqual(changed.models.find(model => model.id === glm).profile, { family: 'Demo', imageLimit: 4 });
});

test('input limit cannot exceed the platform context configuration', () => {
  assert.throws(() => operate(createAdminSeed(), 'basic', { ...basic, profile: { maxInput: 65536 } }), /最大输入不能超过/);
});


test('explicitly cleared catalogue metadata stays empty after loading a sourced example', () => {
  const state = operate(createAdminSeed(), 'basic', { ...basic, profile: {} });
  const model = parseAdminState(JSON.stringify(state)).models.find(item => item.id === glm);
  assert.deepEqual(modelProfileDraft(model), {});
});


test('basic control values persist fractional B counts and multiple languages', () => {
  const initial = createAdminSeed();
  const changed = operate(initial, 'basic', { ...basic, profile: { parameters: '7.5', architecture: 'MoE', license: 'Apache-2.0', languages: ['中文', '英文', '中文'] } });
  const profile = parseAdminState(JSON.stringify(changed)).models.find(model => model.id === glm).profile;
  assert.deepEqual(profile, { parameters: 7.5, architecture: 'MoE', license: 'Apache-2.0', languages: ['中文', '英文'] });
  for (const parameters of ['0', '-1', 'Infinity', '7B']) assert.throws(() => operate(initial, 'basic', { ...basic, profile: { parameters } }), /参数规模必须为正数/);
  assert.throws(() => operate(initial, 'basic', { ...basic, profile: { languages: '中文' } }), /支持语言/);
  const draft = modelProfileDraft({ profile: { parameters: '743B（总参数）', languages: '中文、英文', documentation: 'https://example.com/model' } });
  assert.equal(draft.parameters, 743);
  assert.deepEqual(draft.languages, ['中文', '英文']);
  assert.equal(draft.documentation, 'https://example.com/model');
});

test('basic edits and creation need no manufacturer and retain existing hidden metadata', () => {
  const initial = createAdminSeed();
  const data = { ...basic, maker: undefined, profile: {} };
  const changed = operate(initial, 'basic', data);
  assert.equal(changed.models.find(model => model.id === glm).maker, initial.models.find(model => model.id === glm).maker);
  const created = operate(initial, 'create', { ...data, profile: basic.profile });
  const model = created.models.find(model => model.modelId === basic.modelId);
  assert.equal(model.maker, '');
  assert.equal(publicationChecks(created, model).find(check => check.label === '展示内容完整').passed, true);
});

test('modalities persist as multiple selections and invalid values fail atomically', () => {
  const initial = createAdminSeed();
  const changed = operate(initial, 'basic', { ...basic, type: 'rerank', profile: { inputModalities: ['文本', '文本'], resultTypes: ['相关性分数', '排序结果'], documentLimit: '100', documentTokens: '8192' } });
  const model = parseAdminState(JSON.stringify(changed)).models.find(model => model.id === glm);
  assert.deepEqual(model.profile.inputModalities, ['文本']);
  assert.deepEqual(model.profile.resultTypes, ['相关性分数', '排序结果']);
  assert.equal(model.profile.documentLimit, 100);
  assert.equal(model.profile.documentTokens, 8192);
  for (const inputModalities of ['文本', [null], ['']]) assert.throws(() => operate(initial, 'basic', { ...basic, profile: { inputModalities } }), /输入模态/);
  const draft = modelProfileDraft({ profile: { inputModalities: '查询文本、候选文档', outputModalities: '相关性分数、排序结果' } });
  assert.deepEqual(draft.inputModalities, ['文本']);
  assert.deepEqual(draft.resultTypes, ['相关性分数', '排序结果']);
  for (const id of ['kimi', 'qwen', 'image', 'video', 'tts', 'asr', 'embedding', 'rerank']) assert.ok(Array.isArray(modelProfileDraft({ id: 'catalog-demo-' + id }).outputModalities));
});


test('supplier call IDs pair stable provider codes with model codes without changing upstream IDs', () => {
  const state = createAdminSeed(), model = state.models.find(item => item.id === 'catalog-demo-kimi');
  const supplies = state.modelSupplies.filter(s => s.modelId === model.id).map(s => ({ ...s, provider: state.providers.find(p => p.id === state.endpoints.find(e => e.id === s.endpointId).providerId) }));
  const before = JSON.stringify(supplies), rows = modelSupplierRows(model, [...supplies, { ...supplies[0], id: 'second-endpoint' }]);
  assert.equal(modelCode(model), 'kimi-k3');
  assert.equal(rows.length, 5);
  assert.deepEqual(rows.find(row => row.code === 'cmcc'), { key: 'catalog-provider-mobile', name: '中国移动', code: 'cmcc', callId: 'cmcc/kimi-k3' });
  assert.equal(rows.find(row => row.code === 'cucc').callId, 'cucc/kimi-k3');
  assert.equal(rows.find(row => row.code === 'ctcc').callId, 'ctcc/kimi-k3');
  assert.equal(rows.find(row => row.code === 'openrouter').callId, 'openrouter/kimi-k3');
  assert.equal(JSON.stringify(supplies), before);
  assert.equal(modelCode({ id: 'custom-model', modelId: 'custom/model-v2' }), 'custom/model-v2');
  assert.deepEqual(modelSupplierRows(model, []), []);
  assert.equal(modelSupplierRows(model, [{ endpointId: 'missing', upstreamModelId: 'private' }])[0].callId, null);
  assert.equal(modelSupplierRows(model, [{ provider: { id: 'provider-stable-code', name: '自定义供应商' } }])[0].callId, 'stable-code/kimi-k3');
});

test('carrier examples enrich saved catalogues once and preserve edited connections, mappings and prices', () => {
  const initial = createAdminSeed();
  const carrier = item => /-(mobile|unicom|telecom)$/.test(item.id);
  for (const key of ['providers', 'endpoints', 'modelSupplies']) initial[key] = initial[key].filter(item => !carrier(item));
  initial.models.find(model => model.id === 'catalog-demo-kimi').name = '运营配置名称';
  const before = JSON.parse(JSON.stringify(initial));
  const restored = parseAdminState(JSON.stringify(initial));
  assert.equal(restored.modelSupplies.filter(item => item.modelId === 'catalog-demo-kimi').length, 5);
  assert.ok(['中国移动', '中国联通', '中国电信'].every(name => restored.providers.some(item => item.name === name)));
  for (const key of ['models', 'modelSalePrices', 'endpoints', 'modelSupplies']) assert.deepEqual(restored[key].filter(item => !carrier(item)), before[key]);
  restored.modelSupplies.find(item => item.id === 'catalog-supply-kimi-mobile').status = '已移除';
  restored.endpoints.find(item => item.id === 'catalog-endpoint-kimi-unicom').baseUrl = 'https://operator.example.com/v1';
  const reloaded = parseAdminState(JSON.stringify(restored));
  for (const key of ['providers', 'endpoints', 'modelSupplies', 'modelSalePrices']) assert.deepEqual(reloaded[key], JSON.parse(JSON.stringify(restored[key])));
});

test('new model metadata requires tasks and input plus output or typed results; unknown limits stay unknown', () => {
  const initial = createAdminSeed();
  for (const profile of [{}, { tasks: ['对话'] }, { tasks: ['对话'], inputModalities: ['文本'] }]) assert.throws(() => operate(initial, 'create', { ...basic, profile }), /请选择/);
  const next = operate(initial, 'create', { ...basic, capabilities: { streaming: null, tools: null, context: '', output: '' } });
  const model = next.models.find(item => item.modelId === basic.modelId);
  assert.deepEqual(model.capabilities, { streaming: null, tools: null, context: null, output: null });
  assert.deepEqual(modelKeySpecs(model), []);
  assert.deepEqual(next.modelSupplies, initial.modelSupplies);
  for (const profile of [{ ...basic.profile, tasks: ['未知任务'] }, { ...basic.profile, inputModalities: ['PDF'] }, { ...basic.profile, outputModalities: ['向量'] }]) assert.throws(() => operate(initial, 'create', { ...basic, profile }), /不适用/);
});

test('task-specific audio metadata is independent of billing units and survives storage', () => {
  const initial = createAdminSeed();
  const data = { ...basic, type: 'audio', usageUnit: '秒', profile: { tasks: ['语音合成', '语音识别'], inputModalities: ['文本', '音频'], outputModalities: ['文本', '音频'], voices: '标准女声', maxCharacters: 500, maxDuration: 60, parameterRules: '实时模式使用 WAV', languages: ['中文'], author: '模型团队', documentation: 'https://example.com/model', benchmark: '识别字错率', benchmarkResult: '10%', benchmarkConditions: '固定测试集，16 kHz', benchmarkDataset: '测试集 v1', benchmarkDate: '2026-10-05' } };
  const state = parseAdminState(JSON.stringify(operate(initial, 'create', data)));
  const model = state.models.find(item => item.modelId === basic.modelId);
  assert.equal(model.profile.maxCharacters, 500); assert.equal(model.profile.maxDuration, 60);
  assert.equal(model.profile.benchmarkConditions, data.profile.benchmarkConditions);
  assert.ok(specificationFields('audio', '秒', model.profile).some(field => field.key === 'voices'));
  assert.ok(specificationFields('audio', '字符', { tasks: ['语音识别'] }).some(field => field.key === 'maxDuration'));
  assert.equal(hasOutputPrice(model, '元/百万 Token'), true);
});

test('technical metadata checks active parameters, version dates and task-specific catalogue summaries', () => {
  const initial = createAdminSeed();
  assert.throws(() => operate(initial, 'basic', { ...basic, profile: { parameters: 7, activeParameters: 8 } }), /激活参数/);
  assert.throws(() => operate(initial, 'basic', { ...basic, profile: { releaseDate: '2026-10-05', retirementDate: '2026-10-01' } }), /退役日期/);
  assert.throws(() => operate(initial, 'basic', { ...basic, profile: { logo: 'https://user:password@example.com/logo.png' } }), /无凭据/);
  const cases = [{ type: 'video', profile: { resolutions: '1080P', maxDuration: 10 } }, { type: 'embedding', profile: { dimensions: '1024', maxInput: 8192 } }, { type: 'rerank', profile: { documentLimit: 100, documentTokens: 8192 } }];
  assert.deepEqual(cases.map(model => modelKeySpecs(model).map(spec => spec.label)), [['分辨率', '最长生成'], ['向量维度', '最大输入'], ['候选文档', '单篇文档']]);
});

test('uploaded model logos validate format and size and survive an atomic save and storage readback', () => {
  const initial = createAdminSeed();
  const logo = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9Y9Zl1sAAAAASUVORK5CYII=';
  const state = parseAdminState(JSON.stringify(operate(initial, 'create', { ...basic, profile: { ...basic.profile, logo } })));
  assert.equal(state.models.find(model => model.modelId === basic.modelId).profile.logo, logo);
  for (const bad of ['data:image/svg+xml;base64,PHN2Zz4=', 'data:image/png;base64,aGVsbG8=', 'data:image/png;base64,' + Buffer.alloc(1048577).toString('base64')]) {
    assert.throws(() => operate(initial, 'create', { ...basic, profile: { ...basic.profile, logo: bad } }), /Logo/);
  }
});
