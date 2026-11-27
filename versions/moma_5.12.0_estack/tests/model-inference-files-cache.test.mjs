import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { load } from 'js-yaml';
import { strFromU8, unzipSync } from 'fflate';
import { cacheFieldState, cacheL2Default, cacheL2Issue, cacheL2Values, cacheProviderSourceDocument, cacheVersionsForProvider, normalizeCacheProviderDocument } from '../src/admin-v2/cache-provider-fields.js';
import { cacheAttachedInstances, cacheAttachments, cacheCreateDefaults, cacheInstances, cacheLogAvailable, cachePlacement, cachePlacementChanged, cacheServiceLogAvailable, modelFileCreation, modelFileNodeIssue, MODEL_SERVICE_PAGES, reconcileModelOperation } from '../src/admin-v2/ops-models.js';
import { catalogueDocument, catalogueInitialRecipe, catalogueRecipeMatches, catalogueRecipes, readCatalogueDocument } from '../src/admin-v2/model-catalogue.js';
import { gpuStackCatalogue, gpuStackDraftRecipes } from '../src/admin-v2/model-catalogue-data.js';
import { modelHubCandidates } from '../src/admin-v2/model-hub-candidates.js';
import { changeInfrastructure, INFRASTRUCTURE_STORAGE, readInfrastructure } from '../src/admin-v2/infrastructure-state.js';
import { readModelSourceSetting } from '../src/admin-v2/infrastructure-source-settings.js';

const first = { id: 'worker-a', name: 'Node A', clusterId: 'cluster', status: '就绪', memoryGiB: 32, ram: 75 };
const second = { id: 'worker-b', name: 'Node B', clusterId: 'cluster', status: '就绪', memoryGiB: 128, ram: 10 };
const base = { clusters: [{ id: 'cluster', status: '运行中' }], 'ops-nodes': [first, second], 'ops-model-files': [] };
const filePage = MODEL_SERVICE_PAGES['ops-model-files'];
const cachePage = MODEL_SERVICE_PAGES['ops-cache-acceleration'];

test('cache providers that require their own image omit the version picker and save the custom version', () => {
  const versionField = cachePage.fields.find(field => field.key === 'version');
  const imageField = cachePage.fields.find(field => field.key === 'image');
  const meshFusion = cacheCreateDefaults('XSKY MeshFusion', base);
  assert.equal(meshFusion.version, '自定义');
  assert.equal(versionField.visible(meshFusion, base), false);
  assert.equal(imageField.visible(meshFusion), true);
  assert.equal(imageField.required, true);
  assert.equal(imageField.label, '容器镜像');

  // The shared form strips the hidden version from the submitted fields.
  const formValues = { provider: meshFusion.provider, clusterId: meshFusion.clusterId, name: 'cache-image',
    image: 'registry.example.com/meshfusion:latest' };
  assert.equal(cachePage.validate(formValues, base), undefined);
  const saved = cachePage.save(formValues, base);
  assert.equal(saved.version, '自定义');
  assert.equal(saved.image, formValues.image);

  const lmcache = cacheCreateDefaults('LMCache', base);
  assert.equal(versionField.visible(lmcache, base), true);
  assert.equal(imageField.visible(lmcache), false);
  assert.equal(imageField.visible({ ...lmcache, version: '自定义' }), true);
});

test('model file registration validates the source, chosen node, and source-specific paths independently', () => {
  const local = { source: '本地路径', workerId: first.id, mountPath: '/mnt/models/qwen/' };
  const selected = modelFileCreation(local, base);
  assert.equal(selected.mountPath, '/mnt/models/qwen');
  assert.equal(selected.localDir, null);
  assert.throws(() => modelFileCreation({ ...local, mountPath: '/mnt/../weights' }, base), /绝对文件路径/);
  assert.throws(() => modelFileCreation({ ...local, workerId: 'missing' }, base), /就绪状态/);
  const remote = modelFileCreation({ source: 'Hugging Face', workerId: first.id,
    repository: 'Qwen/Qwen2.5-7B-Instruct-GGUF', filename: 'model-q4.gguf', localDir: '/opt/models' }, base);
  const state = { ...base, 'ops-model-files': [remote] };
  assert.throws(() => modelFileCreation(remote, state), /相同来源和本地目录/);
  assert.equal(modelFileCreation({ ...remote, workerId: second.id }, state).workerId, second.id);
});

test('model file references check stable IDs and distinguish same-path files on different nodes', () => {
  const file = { id: 'file', source: '本地路径', workerId: first.id, clusterId: first.clusterId, mountPath: '/models/model.gguf' };
  const deployment = { name: 'Hosted Model', clusterId: first.clusterId, placement: '指定节点',
    placementTargets: [second.id], weightPath: file.mountPath };
  assert.equal(filePage.canDelete(file, { ...base, deployments: [deployment] }), undefined);
  assert.match(filePage.canDelete(file, { ...base, deployments: [{ ...deployment, modelFileId: file.id }] }), /Hosted Model/);
  assert.match(filePage.canDelete(file, { ...base, deployments: [{ ...deployment,
    previousConfig: { clusterId: first.clusterId, placement: '指定节点', placementTargets: [first.id], weightPath: file.mountPath } }] }), /Hosted Model/);
});

test('GGUF download keeps all selected shard paths and rejects an unrelated shard or duplicate path', () => {
  const filename = 'weights-q4-*.gguf';
  const parts = ['weights-q4-00001-of-00002.gguf', 'weights-q4-00002-of-00002.gguf'];
  const input = { source: 'Hugging Face', repository: 'owner/model-gguf', filename, downloadParts: parts,
    workerId: first.id, localDir: '/mnt/weights', sizeBytes: 4 * 1024 ** 3 };
  const row = modelFileCreation(input, base);
  const ready = reconcileModelOperation('ops-model-files', row, base, row.operationStartedAt + 4000);
  assert.deepEqual(ready.resolvedPaths, parts.map(path => '/mnt/weights/' + path));
  assert.equal(ready.sizeGiB, 4);
  assert.throws(() => modelFileCreation({ ...input, downloadParts: ['other-00001-of-00002.gguf'] }, base), /分片/);
  assert.throws(() => modelFileCreation({ ...input, filename: parts[0], downloadParts: [] },
    { ...base, 'ops-model-files': [ready] }), /相同来源/);
});

test('the same hub repository exposes each file once from model catalogue specs', () => {
  const groups = modelHubCandidates({ 'ops-model-library': [
    { id: 'one', repository: 'owner/repo', source: 'Hugging Face' },
    { id: 'two', specs: [
      { source: 'huggingface', repository: 'owner/repo', filename: 'model-q4.gguf' },
      { source: 'huggingface', repository: 'owner/repo', filename: 'model-q4.gguf' },
      { source: 'model_scope', repository: 'owner/repo-ms' },
    ] },
  ] }, 'Hugging Face');
  const target = groups.find(row => row.repository === 'owner/repo');
  assert.deepEqual(target.files, ['model-q4.gguf']);
  assert.equal(groups.some(row => row.repository === 'owner/repo-ms'), false);
  const builtin = MODEL_SERVICE_PAGES['ops-model-library'].seed;
  assert.equal(new Set(builtin.map(row => row.id)).size, builtin.length);
  assert.equal(builtin.find(row => row.id === 'catalog-qwen35-9b').releaseDate, '2026-03-02');
});

test('catalogue search matches name tokens without punctuation and excludes description-only matches', () => {
  const { searchRows } = MODEL_SERVICE_PAGES['ops-model-library'];
  const names = ['Qwen3-235B-A22B','Qwen3.5-VL-9B','Qwen3.5-9B','Qwen3.5-27B','FLUX.2-klein-9B'];
  const cards = names.map(name=>({ name, description:'vision assistant' }));
  assert.equal(searchRows(cards,'qwen35 9b')[0].name,'Qwen3.5-9B');
  assert.deepEqual(searchRows(cards,'9b qwen35'), searchRows(cards,'qwen35 9b'));
  assert.equal(searchRows(cards,'qwen 3.5').some(row=>row.name==='Qwen3-235B-A22B'),false);
  assert.equal(searchRows(cards,'vision').length,0);
  assert.deepEqual(searchRows(cards,'---'),cards);
  const curated = [{ name:'new', releaseDate:'2026-02-14' },{ name:'prioritized', order:2, releaseDate:'2024-01-01' }, { name:'old', releaseDate:'2026-02-01' }];
  assert.deepEqual(searchRows(curated).map(row=>row.name),['prioritized','new','old']);
});

test('catalogue deployment recipes rank available modes after choosing each first compatible spec', () => {
  const qwen = gpuStackCatalogue.find(row=>row.name==='Qwen3-14B');
  const devices = [{vendor:'NVIDIA',computeCapability:'9.0'}];
  const high = catalogueRecipes(qwen.specs,devices);
  assert.deepEqual(high.map(choice=>[choice.mode,choice.spec.backend]),[['throughput','SGLang'],['standard','vLLM']]);
  assert.equal(high[0].spec.parameters.some(parameter=>parameter.startsWith('--')),true);
  assert.equal(catalogueInitialRecipe(qwen.specs,[{vendor:'nvidia',computeCapability:'8.9'}]).spec.backend,'vLLM');
  assert.equal(catalogueInitialRecipe(qwen.specs,[{vendor:'NVIDIA'}]).mode,'standard');
  assert(catalogueRecipeMatches({gpuFilters:{vendor:'ascend',vendor_variant:'910b'}},[{vendor:'Huawei',arch_family:'Ascend910B'}]));

  const qwen36 = gpuStackCatalogue.find(row=>row.name==='Qwen3.6-27B');
  assert.equal(catalogueInitialRecipe(qwen36.specs, [{vendor:'NVIDIA',computeCapability:'8.9'}]).mode, 'throughput');
  assert.equal(catalogueInitialRecipe(qwen36.specs, [{vendor:'NVIDIA',computeCapability:'8.0'}]).mode, 'standard');
  assert.equal(catalogueInitialRecipe(qwen36.specs.filter(spec => spec.mode === 'throughput'),
    [{vendor:'NVIDIA',computeCapability:'8.0'}]), undefined);

  const specs = [
    { mode: 'standard', source: 'huggingface', size: 16 },
    { mode: 'z-custom', source: 'model_scope' },
    { mode: 'latency', source: 'model_scope', size: 16 },
    { mode: 'latency', source: 'huggingface', size: 8 },
    { mode: 'throughput', source: 'huggingface', gpuFilters: { vendor: 'ascend' } },
    { mode: 'a-custom', source: 'huggingface' },
  ];
  const options = catalogueRecipes(specs, devices);
  assert.deepEqual(options.map(option => option.index), [2, 0, 5, 1]);
  assert.equal(catalogueInitialRecipe(specs, devices).index, 2);
  assert.equal(options.find(option => option.mode === 'standard').index, 0);
  assert.equal(options.find(option => option.spec.source === 'huggingface').index, 0);
  assert.equal(options.find(option => option.spec.source === 'model_scope').index, 2);
  assert.equal(high.some(option => option.spec.source === 'model_scope'), false);
  assert.equal(catalogueInitialRecipe([], []), undefined);
});

test('cache detail lists current running model instances without treating retained history as current activity', () => {
  const row = { id: 'cache', name: 'demo-cache', provider: 'LMCache', clusterId: first.clusterId };
  const shared = { enabled: true, service: { id: row.id } };
  const deployment = { id: 'model', deploymentId: 'model', clusterId: first.clusterId, status: '运行中', replicas: 3, readyReplicas: 3,
    roles: { prefill: 1, decode: 1, router: 1 }, roleConfigs: { prefill: { kvCache: shared }, decode: { kvCache: { enabled: false } } } };
  const former = { ...deployment, id: 'former', roleConfigs: {}, previousConfig: { kvCache: shared } };
  const records = { ...base, deployments: [deployment, former] };
  assert.deepEqual(cacheAttachments(row, records).map(item => item.id), ['model', 'former']);
  assert.deepEqual(cacheAttachedInstances(row, records).map(item => item.id), ['model:1']);
  assert.equal(cacheServiceLogAvailable({ ...row, workerId: first.id, status: '运行中' }), false);
  assert.equal(cacheLogAvailable('启动中'), true);
  assert.equal(cacheLogAvailable('待检查'), false);
});

test('catalogue source export retains platform recipes and validates YAML imports', () => {
  const exported = catalogueDocument(gpuStackCatalogue,gpuStackDraftRecipes);
  const parsed = readCatalogueDocument(exported,[{name:gpuStackCatalogue[0].name,id:'persisted'}]);
  assert.equal(parsed.rows[0].id,'persisted');
  assert.equal(parsed.rows[0].icon,'/static/catalog_icons/qwen.png');
  assert.equal(parsed.rows.reduce((sum,row)=>sum+row.specs.length,0),434);
  assert.deepEqual(parsed.draftRecipes,gpuStackDraftRecipes.map(draft=>({...draft,description:undefined})));
  assert.deepEqual(readCatalogueDocument({draft_models:parsed.draftRecipes},[]).rows,[]);
  const recipe = exported.model_sets[0].specs[0];
  const bad = overrides=>({model_sets:[{ ...exported.model_sets[0],specs:[{...recipe,...overrides}] }]});
  assert.throws(()=>readCatalogueDocument(bad({env:{'HF_TOKEN':'test'}}),[]),/凭证/);
  assert.throws(()=>readCatalogueDocument(bad({gpu_filters:{compute_capability:'???'}}),[]),/算力范围/);
});

test('the downloadable GPUStack catalog imports the official models and recipes', () => {
  const document = load(readFileSync(new URL('../public/assets/model-catalog.yaml', import.meta.url), 'utf8'));
  const result = readCatalogueDocument(document, []);
  assert.equal(result.rows.length, 133);
  assert.equal(result.rows.flatMap(row => row.specs).length, 219);
  assert.equal(result.draftRecipes.length, 4);
});

test('source settings and catalog live records share one save and retain the previous source on failure', async t => {
  const oldCache = { mode: 'URL', url: 'https://cache.example.test/providers.yaml' };
  const saved = new Map([[`${INFRASTRUCTURE_STORAGE}:model-sources`, JSON.stringify({ 'cache-provider': oldCache })]]);
  const descriptor = Object.getOwnPropertyDescriptor(globalThis, 'localStorage');
  const navigatorDescriptor = Object.getOwnPropertyDescriptor(globalThis, 'navigator');
  let writes = 0, quotaExceeded = false;
  Object.defineProperty(globalThis, 'navigator', { configurable: true, value: {
    locks: { request: (name, update) => {
      assert.equal(name, INFRASTRUCTURE_STORAGE);
      return Promise.resolve().then(update);
    } },
  } });
  Object.defineProperty(globalThis, 'localStorage', { configurable: true, value: {
    getItem: key => saved.get(key) ?? null,
    setItem(key, value) {
      if (quotaExceeded) throw Error('quota exceeded');
      writes += 1;
      saved.set(key, value);
    },
  } });
  t.after(() => {
    if (descriptor) Object.defineProperty(globalThis, 'localStorage', descriptor);
    else delete globalThis.localStorage;
    if (navigatorDescriptor) Object.defineProperty(globalThis, 'navigator', navigatorDescriptor);
    else delete globalThis.navigator;
  });
  const page = 'ops-model-library';
  const previous = readInfrastructure()[page];
  const uploaded = [{ id: 'model-source-upload', name: 'Source Upload' }];
  const source = { mode: 'YAML 文件', content: 'model_sets: []' };
  quotaExceeded = true;
  await assert.rejects(changeInfrastructure(page, () => ({ rows: uploaded, modelSource: source })), /quota exceeded/);
  assert.deepEqual(readInfrastructure()[page], previous);
  assert.equal(readModelSourceSetting('catalog'), undefined);
  quotaExceeded = false;
  await changeInfrastructure(page, (latest, _, before) => {
    assert.deepEqual(latest, previous);
    assert.equal(before, undefined);
    return { rows: uploaded, modelSource: source };
  });
  assert.equal(writes, 1);
  assert.deepEqual(readInfrastructure()[page], uploaded);
  assert.deepEqual(readModelSourceSetting('catalog'), source);
  assert.deepEqual(readModelSourceSetting('cache-provider'), oldCache);
});

test('cache deletion respects active and revision-level KV cache references using stable IDs', () => {
  const cache = {id:'cache-one',name:'name',provider:'LMCache',clusterId:'other'};
  const service = {id:cache.id,name:'former name',provider:'LMCache',clusterId:'other'};
  const deployments = [
    {id:'default',kvCache:{enabled:true,service}},
    {id:'role',roleConfigs:{decode:{kvCache:{enabled:true,service}}}},
    {id:'old',configHistory:[{revision:1,config:{roleConfigs:{prefill:{kvCache:{enabled:true,service}}}}}]},
    {id:'disabled',kvCache:{enabled:false,service}},
    {id:'same-name',kvCache:{enabled:true,service:{...service,id:'different',name:cache.name}}},
  ];
  assert.deepEqual(cacheAttachments(cache,{deployments}).map(row=>row.id),['default','role','old']);
});

test('benchmark list export writes selected columns and keeps the single report in YAML', () => {
  const page = MODEL_SERVICE_PAGES['ops-benchmarks'];
  const row = { id: 'test', name: '=1+1', status: '已完成', requests: 11 };
  const selected = page.columns.filter(column => ['name', 'requests'].includes(column.key));
  const batch = page.batchActions.find(action => action.label === '导出选中结果').download([row], {}, selected);
  assert.equal(batch.name, 'benchmark.xlsx');
  const sheet = strFromU8(unzipSync(batch.content)['xl/worksheets/sheet1.xml']);
  assert.match(sheet, /测试名称/);
  assert.match(sheet, /请求总数/);
  assert.doesNotMatch(sheet, /输出吞吐量/);
  assert.match(sheet, /inlineStr[^<]*><is><t[^>]*>=1\+1<\/t>/);
  assert.match(sheet, /<v>11<\/v>/);
  const report = page.actions.find(action => action.label === '导出结果').download(row, {});
  assert.equal(report.name, 'benchmark-test.yml');
  assert.match(report.content, /benchmarks:/);
});

test('cache save preflight distinguishes no candidates and resource warnings and verifies provider-specific storage', () => {
  const config = { clusterId: 'cluster', provider: 'LMCache', memoryGiB: 20, workerId: first.id };
  assert.match(cachePlacement(config, base).warning, /可用内存不足/);
  assert.match(cachePlacement({ ...config, memoryGiB: 1000 }, base).warning, /物理内存/);
  assert.match(cachePlacement(config, { ...base, 'ops-nodes': [] }).blocking, /没有可调度/);
  assert.equal(cachePlacement({ ...config, workerId: second.id }, base).warning, undefined);
  const fromSaved = cacheL2Values({ type: 'Redis / Valkey', location: 'redis://internal.example:6380' });
  assert.equal(fromSaved.port, 6380);
  assert.equal(cacheL2Issue('LMCache', [fromSaved]), undefined);
  assert.match(cacheL2Issue('XSKY MeshFusion', [fromSaved]), /支持的 L2 存储/);
  assert.match(cacheL2Issue('LMCache', [{ ...fromSaved, port: 70000 }]), /端口/);
  assert.match(cacheL2Issue('LMCache', [{ type: '本地文件系统', basePath: '/../tmp' }]), /绝对路径/);
});

test('cache placement checks target runtime support independently of worker readiness and available memory', () => {
  const inventory = { ...base, 'ops-nodes':[
    { ...first, gpuCount:1, labels:{ pool:'rocm' } }, { ...second, gpuCount:1, labels:{ pool:'cuda' } },
  ], 'ops-gpus':[{ nodeId:first.id, vendor:'AMD' }, { nodeId:second.id, vendor:'NVIDIA' }] };
  const draft = { name:'cache', clusterId:'cluster', provider:'LMCache', version:'0.5.6', memoryGiB:8 };
  assert.equal(cacheCreateDefaults('LMCache',inventory).workerId,undefined);
  assert.equal(cachePage.submitLabel(draft,inventory), '确定');
  assert.equal(cachePage.validate(draft,inventory), undefined);
  assert.match(cachePlacement(draft,inventory).warning, /1\/2.*rocm/);
  assert.match(cachePlacement({ ...draft,selector:{ pool:'cuda' } },inventory).success, /在 1 个节点/);
  assert.match(cachePlacement({ ...draft,selector:{ pool:'nothing' } },inventory).blocking, /所选节点和标签/);
  assert.match(cachePlacement(draft,{ ...inventory,'ops-nodes':[] }).blocking, /当前集群/);
  const unknown = { ...inventory,'ops-nodes':[{ ...first, name:'Node A', gpuCount:1, ram:null }], 'ops-gpus':[] };
  assert.equal(cachePlacement(draft,unknown).warning,undefined);
  assert.equal(cachePlacement(draft,unknown).success,undefined);
  const saved = { ...draft,...cachePage.save(draft,inventory) };
  const result = reconcileModelOperation('ops-cache-acceleration',saved,inventory,saved.operationStartedAt+5000);
  assert.equal(result.ready,'1 / 2');
  assert.deepEqual(cacheInstances(result,inventory).map(instance=>instance.state),['异常','运行中']);
});

test('cache edits request a placement override only when placement settings change', () => {
  const current = { id:'cache', name:'original', clusterId:'cluster', workerId:first.id, provider:'LMCache', version:'0.5.6', memoryGiB:8,
    parameters:{ server:['--quiet'] }, selector:{} };
  const parameters = { ...current, parameters:{ server:['--verbose'] } };
  const moreMemory = { ...current, memoryGiB:16 };
  assert.equal(cachePlacementChanged(current,parameters,base),false);
  assert.equal(cachePage.submitLabel(parameters,base,current),'确定');
  assert.equal(cachePlacementChanged(current,moreMemory,base),true);
  assert.equal(cachePage.submitLabel(moreMemory,base,current),'仍然提交');
  assert.equal(cachePage.save({ ...moreMemory,workerId:undefined },base,current).workerId,first.id);
});

test('cache configuration edits leave live memory and status in use until instance recreation', () => {
  const current = { name: 'cache', provider: 'LMCache', clusterId: 'cluster', version: '0.4.2', memoryGiB: 16,
    ready: '2 / 2', status: '运行中', l2Entries: [], selector: '', workerId: '', configRevision: 1, image: '' };
  const draft = { ...current, memoryGiB: 24 };
  const after = { ...current, ...draft, ...cachePage.save(draft, base, current) };
  assert.equal(after.status, '运行中');
  assert.equal(after.configRevision, 2);
  assert.equal(after.operationStartedAt, undefined);
  assert.deepEqual(cacheInstances(after, base).map(item => [item.memoryGiB, item.configPending]), [[16, true], [16, true]]);
  const rebuilt = { ...after, instanceStatus: { revisions: { [first.id]: 2 } } };
  assert.deepEqual(cacheInstances(rebuilt, base).map(item => [item.memoryGiB, item.configPending]), [[24, false], [16, true]]);
});

test('provider-source import preserves declared fields and rejects dropping an in-use provider version', () => {
  const providers = [{ name: 'Test Cache', versions: ['latest'], topology: 'per_node',
    resource_profile: { ram_gib: '{{memory}}' },
    fields: [
      { name: 'memory', type: 'number', label: { 'zh-CN': '内存' }, min: 1, default: 16 },
      { name: 'api_key', type: 'password', default: 'transient' },
    ],
    l2_backends: { shared: { display_name: '共享存储', fields: [{ name: 'directory', required: true }] } },
  }];
  const [normalized] = normalizeCacheProviderDocument(providers, []);
  assert.equal(normalized.ramField, 'memory');
  assert.equal(normalized.declaredFields[0].label, '内存');
  assert.equal(normalized.declaredFields[1].credential, true);
  assert.equal(normalized.declaredFields[1].defaultValue, undefined);
  assert.equal(normalized.l2['共享存储'][0].required, true);
  assert.throws(() => normalizeCacheProviderDocument(providers, [{ name: 'Legacy', provider: 'Test Cache', version: 'v1' }]), /正在使用/);
});

test('GPUStack cache-provider native YAML restores schema, links, versions and optional L2 adapter state', () => {
  const document=load(readFileSync(new URL('../public/assets/cache-providers.yaml',import.meta.url),'utf8'));
  const definitions=normalizeCacheProviderDocument(document,cachePage.seed);
  assert.equal(definitions.find(row=>row.name==='Mooncake').unavailable,true);
  assert.deepEqual(definitions.find(row=>row.name==='LMCache').frameworks,['cuda']);
  assert.deepEqual(definitions[0].versions,['0.5.6','0.5.4','自定义']);
  assert.deepEqual(cacheVersionsForProvider(definitions[0],['cuda'],'0.4.1'),['0.5.6','0.5.4','0.4.1','自定义']);
  const safe=cacheProviderSourceDocument(definitions);
  assert.equal(safe[0].l2_backends.fs_native.fields.some(field=>field.name==='base_path'),true);
  assert.deepEqual(normalizeCacheProviderDocument(safe,cachePage.seed),definitions);
  const adapter=cacheL2Default('XSKY MeshFusion','XSKY MeshFusion Store');
  assert.equal(adapter.adapterEnabled,false);
  assert.equal(adapter.tenantId,'nixl');
  assert.equal(cacheL2Issue('XSKY MeshFusion',[adapter]),undefined);
});

test('cache catalogue keeps installed version choices, applies hardware defaults and gates hidden fields', () => {
  const [{name,...provider}]=normalizeCacheProviderDocument([{
    name:'Metadata provider',default_version:'2.0',custom_version:true,
    versions:{'2.0':{runtime_images:{cuda:{'12':'registry.example/cache:2.0'}}},
      '1.1':{runtime_images:{cann_910b:{'8':'registry.example/cache:1.1'}}}},
    fields:[
      {name:'transport',type:'string',default:'tcp',framework_defaults:{cann:'rdma'},
        options:[{value:'rdma',label:{'zh-CN':'RDMA 传输'}},'tcp']},
      {name:'device',type:'number',required:true,visible_by:'transport',visible_when:'rdma',gated_default:1},
      {name:'secret_token',type:'password',default:'demo-do-not-store'},
    ],
  }],[]);
  const state=cacheFieldState({name,...provider},{ device:7 },'cuda');
  assert.deepEqual(state.map(item=>[item.field.key,item.visible,item.effective]),[
    ['transport',true,'tcp'],['device',false,1],['secret_token',true,undefined],
  ]);
  assert.equal(cacheFieldState({name,...provider},{ device:7 },'cann')[1].value,7);
  assert.deepEqual(cacheVersionsForProvider(provider,['cann'],'2.0'),['1.1','2.0','自定义']);
  assert.equal(provider.declaredFields[0].choices[0].label,'RDMA 传输');
  assert.doesNotMatch(JSON.stringify(cacheProviderSourceDocument([{name,...provider}])),/demo-do-not-store/);
});

test('cache selectors and model file preflight retain exact saved node and revision references', () => {
  const labelRecords={ ...base,'ops-nodes':[{ ...first,labels:{pool:'a,b=c'} },{ ...second,labels:'pool=a' }] };
  const cache={clusterId:'cluster',name:'cache',provider:'LMCache',version:'0.5.6',memoryGiB:8,selector:[['pool','a,b=c']]};
  assert.deepEqual(cachePlacement(cache,labelRecords).workers.map(worker=>worker.value),[first.id]);
  const saved=cachePage.save(cache,labelRecords);
  assert.deepEqual(saved.selector,{pool:'a,b=c'});
  assert.match(cachePage.validate({ ...cache,selector:[['pool','x'],['pool','y']] },labelRecords),/重复/);
  const record={ id:'file-one',source:'本地路径',workerId:first.id,clusterId:'cluster',mountPath:'/models/demo' };
  const data={...base,'ops-model-files':[record]};
  assert.match(modelFileNodeIssue({ ...record,mountPath:'/models/demo/' },data),/已登记/);
  assert.equal(modelFileNodeIssue({ ...record,workerId:second.id },data),undefined);
  assert.match(filePage.canDelete(record,{
    ...data,deployments:[{ name:'撤回版本',configHistory:[{revision:1,config:{modelFileId:record.id}}] }],
  }),/撤回版本/);
});
