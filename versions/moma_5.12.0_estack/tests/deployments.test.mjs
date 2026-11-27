import { withAdminSession } from './admin-session-fixture.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';
import { createAdminSeed as baseCreateAdminSeed, commitAdminState, persistAdminAction, STORAGE_KEY } from '../src/admin-v2/store.js';
import { canRecreateInstance, deploymentCanServe, deploymentInstances, deploymentPreflight, deploymentGpu, deploymentTablePage } from '../src/admin-v2/deployments.js';
import { compatibleDeploymentVersions, deploymentBackendVersion, deploymentCompatibilityWarnings, deploymentParameterSuggestions, deploymentSubmissionIssue,
  mergeDeploymentBackendDefaults } from '../src/admin-v2/deployment-options.js';
import { pdRoleRecipe, pdRouterCommand, pdRouterExample } from '../src/admin-v2/deployment-pd-recipes.js';
const values = { name:'知识问答服务', deploymentId:'qwen-test-prod', modelId:'model-1', runtimeId:'artifact-vllm', weightId:'', weightPath:'/models/deepseek', clusterId:'cluster-nj-a', namespace:'inference', replicas:2, gpuPerReplica:2, tensorParallel:2, pipelineParallel:1, maxModelLen:'', gpuMemoryUtilization:0.9, startupTimeout:600 };
const act = (state, operation, data={}, deploymentId) => commitAdminState(state,{type:'deploymentOperation',operation,data,deploymentId});
function created(){let state=act(createAdminSeed(),'create',values);return {state,id:state.deployments[0].id};}
function running(){let {state,id}=created();state=act(state,'check',{},id);return {state,id};}
const clusterGpu = state => state.clusters.find(item=>item.id===values.clusterId).allocatedGpu;

test('create atomically reserves resources and keeps model publishing and prices separate',()=>{
 const seed=createAdminSeed(),before=structuredClone(seed),state=act(seed,'create',values);
 assert.deepEqual(seed,before);assert.equal(state.deployments[0].status,'部署中');assert.equal(state.deployments[0].readyReplicas,0);assert.equal(state.deployments[0].endpointId,null);assert.equal(clusterGpu(state),clusterGpu(seed)+4);
 for(const key of ['models','modelSupplies','modelSalePrices','prices','orders','ledger'])assert.deepEqual(state[key],seed[key]);
});
test('preflight rejects wrong model, base images, broken weights, malformed paths and parallelism',()=>{
 const seed=createAdminSeed();
 for(const data of [{modelId:'missing'},{runtimeId:'artifact-ds'},{runtimeId:'artifact-base'},{weightId:'artifact-vllm'},{weightPath:'/models/../secrets'},{weightPath:'/models/name;curl'},{tensorParallel:1},{replicas:1.5},{replicas:-1},{gpuMemoryUtilization:0},{namespace:'Production!'},{startupTimeout:7201}]) assert.throws(()=>deploymentPreflight(seed,{...values,...data}));
 const unsupported=seed.models.find(model=>!['text','multimodal','embedding','rerank'].includes(model.type));assert.throws(()=>deploymentPreflight(seed,{...values,modelId:unsupported.id}),/不支持/);
 seed.artifacts.find(item=>item.id==='artifact-ds').modelId='another';assert.throws(()=>deploymentPreflight(seed,{...values,weightId:'artifact-ds'}),/不匹配/);
});

const modelFileValues = { ...values, modelFileId:'file-deepseek', placement:'指定节点', placementTargets:['worker-nj-a-01'] };

test('model file deployments may specify GPUs on their bound node', () => {
  const seed = createAdminSeed();
  const placementTargets = ['gpu-1','gpu-2'];
  const checked = deploymentPreflight(seed,{...modelFileValues,placement:'指定 GPU',placementTargets});
  assert.equal(checked.modelFileId,modelFileValues.modelFileId);
  assert.deepEqual(checked.placementTargets,placementTargets);
  assert.throws(()=>deploymentPreflight(seed,{...modelFileValues,placement:'指定 GPU',placementTargets:[]}),/调度目标/);
  for (const patch of [
    {placement:'自动调度'}, {placementTargets:['worker-nj-a-01','worker-nj-a-02']},
    {weightId:'artifact-ds'}, {modelFileId:'invalid file id'},
  ]) assert.throws(()=>deploymentPreflight(seed,{...modelFileValues,...patch}),/模型文件须关联所在节点/);
});

test('an unscheduled zero-replica file deployment stays stopped until explicitly started', () => {
  const seed = createAdminSeed();
  const allocatedBefore = clusterGpu(seed);
  assert.throws(()=>deploymentPreflight(seed,{...modelFileValues,replicas:''}),/副本数/);
  assert.throws(()=>deploymentPreflight(seed,{...modelFileValues,replicas:false}),/副本数/);

  let state = act(seed,'create',{...modelFileValues,replicas:'0'});
  const {id} = state.deployments[0];
  assert.equal(state.deployments[0].status,'停止');
  assert.equal(state.deployments[0].replicas,0);
  assert.equal(state.deployments[0].readyReplicas,0);
  assert.equal(state.deployments[0].endpointId,null);
  assert.equal(clusterGpu(state),allocatedBefore);
  assert.deepEqual(deploymentInstances([state.deployments[0]]),[]);
  const resumed = act(state,'start',{},id);
  assert.equal(resumed.deployments[0].replicas,1);
  assert.equal(resumed.deployments[0].status,'部署中');
  assert.equal(clusterGpu(resumed),allocatedBefore+modelFileValues.gpuPerReplica);
  assert.throws(()=>act(state,'restart',{},id),/仅运行中/);
  assert.throws(()=>act(state,'stop',{},id),/已经停止/);
  assert.throws(()=>act(state,'check',{},id),/没有待检查/);

  state = act(state,'update',{replicas:1,maxModelLen:1024},id);
  assert.equal(state.deployments[0].replicas,1);
  assert.equal(state.deployments[0].status,'停止');
  assert.equal(clusterGpu(state),allocatedBefore);
  state = act(state,'start',{},id);
  assert.equal(state.deployments[0].status,'部署中');
  assert.equal(clusterGpu(state),allocatedBefore+modelFileValues.gpuPerReplica);
  state = act(state,'check',{},id);
  const {endpointId} = state.deployments[0];
  assert.equal(state.endpoints.find(row=>row.id===endpointId)?.status,'运行中');

  state = act(state,'update',{replicas:0},id);
  assert.equal(state.deployments[0].status,'停止');
  assert.equal(state.deployments[0].readyReplicas,0);
  assert.equal(state.endpoints.find(row=>row.id===endpointId)?.status,'停用');
  assert.equal(clusterGpu(state),allocatedBefore);
});

test('ordinary deployments can save and scale to zero, with allocation restored only on start', () => {
  const seed = createAdminSeed();
  const allocated = clusterGpu(seed);
  const stopped = act(seed,'create',{...values,replicas:0});
  assert.equal(stopped.deployments[0].status,'停止');
  assert.equal(clusterGpu(stopped),allocated);
  const {id} = stopped.deployments[0];
  const active = act(act(stopped,'start',{},id),'check',{},id);
  assert.equal(active.deployments[0].replicas,1);
  assert.equal(clusterGpu(active),allocated+values.gpuPerReplica);
  const scaled = act(active,'scale',{replicas:'0'},id);
  assert.equal(scaled.deployments[0].status,'停止');
  assert.equal(scaled.deployments[0].replicas,0);
  assert.equal(clusterGpu(scaled),allocated);
  assert.equal(scaled.endpoints.find(endpoint=>endpoint.id===active.deployments[0].endpointId)?.status,'停用');
});

test('automatically resolves the preferred compatible backend version without replacing explicit selection', () => {
  const compatibleVersions = [{version:'0.25.0'},{version:'0.27.1'}];
  assert.equal(deploymentBackendVersion({version:'0.27.1',compatibleVersions},'')?.version,'0.27.1');
  assert.equal(deploymentBackendVersion({version:'0.24.0',compatibleVersions},'')?.version,'0.25.0');
  assert.equal(deploymentBackendVersion({version:'0.27.1',compatibleVersions},'0.25.0')?.version,'0.25.0');
  assert.equal(deploymentBackendVersion({version:'0.27.1',compatibleVersions},'0.24.0'),undefined);
  assert.equal(deploymentBackendVersion(undefined,''),undefined);
});

test('checks backend versions against known device frameworks without treating unknown vendors as unavailable', () => {
  const versions = [{version:'current',frameworks:['CUDA','ROCm']},{version:'ascend',frameworks:['CANN']},{version:'unknown',frameworks:[]}];
  assert.deepEqual(compatibleDeploymentVersions(versions,[{vendor:'NVIDIA'}]),[versions[0],versions[2]]);
  assert.deepEqual(compatibleDeploymentVersions(versions,[{vendor:'Huawei Ascend'}]),[versions[1],versions[2]]);
  assert.deepEqual(compatibleDeploymentVersions(versions,[{vendor:'unknown'}]),versions);
  assert.deepEqual(compatibleDeploymentVersions(versions,[]),versions);
  const old = {version:'historical',frameworks:['CUDA'],recordOnly:true};
  assert.deepEqual(compatibleDeploymentVersions([...versions,old],[]),versions);
  assert.deepEqual(compatibleDeploymentVersions([...versions,old],[{vendor:'NVIDIA'}]),[versions[0],versions[2]]);
  const hygon = {version:'hygon',frameworks:['DTK']};
  const thead = {version:'thead',frameworks:['HGGC']};
  assert.deepEqual(compatibleDeploymentVersions([...versions,hygon,thead],[{vendor:'Hygon'}]),[versions[2],hygon]);
  assert.deepEqual(compatibleDeploymentVersions([...versions,hygon,thead],[{vendor:'T-Head'}]),[versions[2],thead]);
});
test('switches backend defaults without losing configured values or offering duplicate parameter flags', () => {
  const old = mergeDeploymentBackendDefaults(['--gpu-memory-utilization 0.9','--max-num-seqs=16'], '--max-num-seqs 32\n--served-model-name original');
  assert.deepEqual(old.inserted,['--gpu-memory-utilization 0.9']);
  assert.equal(old.parameters,'--gpu-memory-utilization 0.9\n--max-num-seqs 32\n--served-model-name original');
  const edited = old.parameters.replace('0.9','0.72');
  const next = mergeDeploymentBackendDefaults(['--gpu-memory-utilization=0.6','--enforce-eager'],edited,old.inserted);
  assert.equal(next.parameters,'--enforce-eager\n--gpu-memory-utilization 0.72\n--max-num-seqs 32\n--served-model-name original');
  assert.equal(mergeDeploymentBackendDefaults([],old.parameters,old.inserted).parameters,'--max-num-seqs 32\n--served-model-name original');
  assert.deepEqual(deploymentParameterSuggestions(['--max-num-seqs=64','--max-model-len 2048','--enforce-eager'], next.parameters),['--max-model-len 2048']);
});
test('deployment advice follows the known backend and hardware signals without extrapolating missing data', () => {
  const devices = [{vendor:'NVIDIA',computeCapability:'7.5'},{vendor:'英伟达',compute_capability:'7.0'}];
  const gguf = {filename:'shards/model-*.gguf',backend:'SGLang'};
  assert.deepEqual(deploymentCompatibilityWarnings(gguf,devices).map(item=>item.code),
    ['gguf-backend','sglang-nvidia-architecture']);
  assert.deepEqual(deploymentCompatibilityWarnings(gguf,[...devices,{vendor:'NVIDIA'}]).map(item=>item.code),['gguf-backend']);
  for (const other of [{vendor:'NVIDIA',computeCapability:'8.0'},{vendor:'AMD',computeCapability:'7.5'}]) {
    assert.deepEqual(deploymentCompatibilityWarnings({backend:'SGLang'},[...devices,other]),[]);
  }
  assert.deepEqual(deploymentCompatibilityWarnings({backend:'llama.cpp',weightPath:'/models/a.gguf'},devices),[]);
  assert.deepEqual(deploymentCompatibilityWarnings({backend:'vLLM',weightPath:'/models/a.gguf'}).map(item=>item.code),['gguf-backend']);
});
test('warnings require current acknowledgement and hard validation still blocks resource reservation', () => {
  const state = createAdminSeed();
  const runtime = {runtimeMode:'推理后端版本',backend:'vLLM',backendVersion:'0.27.1',filename:'model.gguf'};
  const configuration = {...values,...runtime};
  const warnings = deploymentCompatibilityWarnings(configuration);
  const acknowledged = warnings.map(item=>item.code);
  assert.match(deploymentSubmissionIssue({warnings}),/仍然提交/);
  assert.equal(deploymentSubmissionIssue({warnings},acknowledged),'');
  assert.match(deploymentSubmissionIssue({warnings:[...warnings,{code:'new-fact'}]},acknowledged),/仍然提交/);
  assert.equal(deploymentSubmissionIssue({warnings,hardError:'目标集群必须处于运行中'},acknowledged),'目标集群必须处于运行中');
  assert.throws(()=>act(state,'create',{...configuration,name:' '}),/部署名称/);
  assert.throws(()=>act(state,'create',{...configuration,clusterId:'cluster-nj-test'}),/运行中/);
  assert.throws(()=>act(state,'create',{...configuration,replicas:100}),/容量不足/);
  assert.equal(clusterGpu(act(state,'create',configuration)),clusterGpu(state)+4);
});
test('PD claims only engine GPUs and validates role admission without writing partial deployment state', () => {
  const seed = createAdminSeed();
  const config = {...values,runtimeMode:'推理后端版本',backend:'vLLM',backendVersion:'0.27.1',replicas:3,
    roles:{prefill:1,decode:1,router:1},pdMode:'vllm-nixl',pdSettings:{vendor:'nvidia',readiness:'all'},
    roleConfigs:{prefill:{gpuPerReplica:1},decode:{gpuPerReplica:2},router:{resources:{cpu:1,memory:1073741824}}}};
  assert.throws(()=>deploymentPreflight(seed,{...config,backendVersion:'v0.26.0'}),/要求后端版本/);
  assert.throws(()=>deploymentPreflight(seed,{...config,pdSettings:{vendor:'ascend'}}),/厂商不兼容/);
  assert.throws(()=>deploymentPreflight(seed,{...config,filename:'model-*.gguf'}),/GGUF 模型不支持/);
  assert.throws(()=>deploymentPreflight(seed,{...config,replicas:4,roles:{...config.roles,router:2}}),/路由角色固定/);
  assert.throws(()=>deploymentPreflight(seed,{...config,roleConfigs:{router:{placement:'指定 GPU',placementTargets:['gpu-1']}}}),/调度方式无效/);
  assert.throws(()=>deploymentPreflight(seed,{...config,roleConfigs:{router:{parameters:'--decode=http://example.invalid'}}}),/由平台设置/);
  assert.throws(()=>deploymentPreflight(seed,{...config,roleConfigs:{router:{parameters:'--retry-max-retries -1'}}}),/不小于 0/);
  assert.throws(()=>deploymentPreflight(seed,{...config,roleConfigs:{router:{parameters:'--decode-policy bucket'}}}),/不支持此路由策略/);
  assert.throws(()=>deploymentPreflight(seed,{...config,pdMode:'custom',roleConfigs:{}}),/填写 Router 启动命令/);
  assert.throws(()=>deploymentPreflight(seed,{...config,roleConfigs:{prefill:{environment:'HF_TOKEN=demo'}}}),/凭证/);
  const sameGpu = {gpuPerReplica:1,placement:'指定 GPU',placementTargets:['gpu-1']};
  assert.throws(()=>deploymentPreflight(seed,{...config,roleConfigs:{prefill:sameGpu,decode:sameGpu}}),/互不重叠/);
  const created = act(seed,'create',config);
  const {id} = created.deployments[0];
  assert.equal(clusterGpu(created),clusterGpu(seed)+3);
  assert.equal(deploymentGpu(created.deployments[0]),3);
  let state = act(created,'check',{},id);
  assert.equal(deploymentCanServe(state.deployments[0]),true);
  assert.equal(deploymentCanServe({...state.deployments[0],readyReplicas:2}),false);
  state = act(state,'scale',{replicas:4,roles:{prefill:2,decode:1,router:1}},id);
  assert.equal(clusterGpu(state),clusterGpu(seed)+4);
  state = act(state,'stop',{},id);
  assert.equal(clusterGpu(state),clusterGpu(seed));
});
test('PD recipes differ by transport while user commands have priority and defaults stay out of saved roles', () => {
  const sglang = pdRoleRecipe('sglang-mooncake','prefill');
  assert.deepEqual(sglang.parameters.find(([flag])=>flag==='--disaggregation-transfer-backend'),['--disaggregation-transfer-backend','mooncake']);
  assert.equal(sglang.environment.MC_TCP_ENABLE_CONNECTION_POOL,'1');
  assert.deepEqual(pdRoleRecipe('vllm-nixl','router',true).parameters,[]);
  assert.deepEqual(pdRoleRecipe('vllm-nixl','router',true).owned,['--prefill','--decode']);
  assert.deepEqual(pdRoleRecipe('custom','prefill').parameters,[]);
  assert.match(pdRouterExample('vllm-mooncake'),/--prefill \{\{p\.url\}\} \{\{p\.ports\.bootstrap\}\}/);
  const backend = {name:'vLLM',version:'0.27.1',compatibleVersions:[{version:'0.27.1',command:'version-command'}],command:'backend-command'};
  assert.equal(pdRouterCommand({backend:'vLLM',containerCommand:'custom-command'},backend,'vllm-nixl').command,'custom-command');
  assert.equal(pdRouterCommand({backend:'vLLM'},backend,'vllm-nixl').source,'version');
  assert.equal(pdRouterCommand({backend:'vLLM',backendVersion:'latest'},backend,'vllm-nixl').source,'backend');
  assert.equal(pdRouterCommand({},backend,'vllm-nixl').source,'recipe');
  assert.equal(pdRouterCommand({},backend,'custom').source,'missing');
});
test('accepts a grouped GGUF filename with only the supported trailing wildcard', () => {
  const state = createAdminSeed();
  const remote = {...values,source:'Hugging Face',repository:'example/model',filename:'Q4/model-q4-*.gguf'};
  assert.equal(deploymentPreflight(state,remote).filename,'Q4/model-q4-*.gguf');
  for (const filename of ['../model-*.gguf','model-*-*.gguf','model-*.bin','*q4/model.gguf']) {
    assert.throws(()=>deploymentPreflight(state,{...remote,filename}),/模型文件名格式无效/);
  }
});
test('insufficient capacity and maintenance clusters never write partial reservations',()=>{
 const seed=createAdminSeed(),before=JSON.stringify(seed);assert.throws(()=>act(seed,'create',{...values,replicas:100}),/容量不足/);assert.throws(()=>act(seed,'create',{...values,clusterId:'cluster-nj-test'}),/运行中/);assert.equal(JSON.stringify(seed),before);
});
test('create checks unique DNS deployment codes and service names',()=>{
 const {state}=created();assert.throws(()=>act(state,'create',values),/已存在/);for(const data of [{deploymentId:'BAD_ID'},{deploymentId:''},{name:' '.repeat(5)}])assert.throws(()=>act(createAdminSeed(),'create',{...values,...data}));
});
test('readiness creates only one internal endpoint and records events without made-up metrics',()=>{
 let {state,id}=created();const count=state.endpoints.length;state=act(state,'check',{},id);const item=state.deployments.find(item=>item.id===id),endpoint=state.endpoints.find(ep=>ep.id===item.endpointId);assert.equal(item.readyReplicas,2);assert.equal(item.status,'运行中');assert.equal(state.endpoints.length,count+1);assert.equal(endpoint.capacity,null);assert.equal(endpoint.health,null);assert.equal(endpoint.providerId,'provider-self');assert.equal(item.events.length,2);assert.throws(()=>act(state,'check',{},id),/没有待检查/);
});
test('route opt-out leaves inference ready and creates no endpoint', () => {
  let state = createAdminSeed();
  assert.throws(()=>act(state,'create',{...values,enableInternalRoute:false,genericProxy:true}),/先启用模型路由/);
  const endpointCount = state.endpoints.length;
  state = act(state,'create',{...values,enableInternalRoute:false});
  state = act(state,'check',{},state.deployments[0].id);
  assert.equal(state.deployments[0].status,'运行中');
  assert.equal(state.deployments[0].readyReplicas,2);
  assert.equal(state.endpoints.length,endpointCount);
});
test('recreates selected instances atomically and rejects stale instance identities', () => {
  let {state, id} = running();
  const deployment = state.deployments.find(row => row.id === id);
  const selected = deploymentInstances([deployment]).map(row => ({id:row.id,ordinal:row.ordinal,deploymentId:id}));
  const before = structuredClone(state);
  assert.throws(() => act(state,'batchRestartInstances',{instances:[selected[0],{...selected[1],id:'stale'}]}), /状态已变化/);
  assert.deepEqual(state,before);
  state = act(state,'batchRestartInstances',{instances:selected});
  const rebuilding = state.deployments.find(row => row.id === id);
  const pending = deploymentInstances([rebuilding]);
  assert.deepEqual(pending.map(row => row.state), ['starting','starting']);
  assert.notDeepEqual(pending.map(row => row.id), selected.map(row => row.id));
  assert.ok(pending.every(row => !canRecreateInstance(row)));
  assert.equal(clusterGpu(state), clusterGpu(before));
  assert.equal(state.endpoints.find(row => row.id === deployment.endpointId).status, '停用');
  state = act(state,'check',{},id);
  assert.deepEqual(deploymentInstances([state.deployments.find(row => row.id === id)]).map(row => row.state), ['running','running']);
  assert.throws(() => act(state,'batchRestartInstances',{instances:selected}), /状态已变化/);
});

test('reports only unambiguous instance placement with the matching cluster', () => {
  const {state,id} = running();
  const deployment = state.deployments.find(row => row.id === id);
  const hosts = {'ops-nodes':[
    { id:'selected',name:'Worker 1',clusterId:deployment.clusterId },
    { id:'foreign',name:'Worker 2',clusterId:'another-cluster' },
  ]};
  assert.ok(deploymentInstances([deployment], hosts).every(row => !row.workerName));
  const pin = targets => deploymentInstances([{ ...deployment,placement:'指定节点',placementTargets:targets }], hosts);
  assert.ok(pin(['selected']).every(row => row.workerName === 'Worker 1' && row.allocatedVram == null));
  assert.ok(pin(['foreign']).every(row => !row.workerName));
  assert.ok(pin(['selected','foreign']).every(row => !row.workerName));
});
test('sorts all selected list records before taking a fixed-size page', () => {
  const rows = ['e','a','c','b','d'].map(name=>({name}));
  const columns = [{dataIndex:'name',sorter:(a,b)=>a.name.localeCompare(b.name)}];
  const pagination = {currentPage:2,pageSize:2};
  const page = sortOrder=>deploymentTablePage(rows,columns,{dataIndex:'name',sortOrder},pagination).map(row=>row.name);
  assert.deepEqual(page('ascend'),['c','d']);
  assert.deepEqual(page('descend'),['c','b']);
  assert.deepEqual(page(false),['c','b']);
  assert.deepEqual(rows.map(row=>row.name),['e','a','c','b','d']);
});
test('retired instance IDs do not reappear after a restart or scale down followed by scale up', () => {
  let {state,id} = running();
  const initial = deploymentInstances([state.deployments[0]]);
  state = act(state,'restartInstance',{instance:1,instanceId:initial[0].id},id);
  state = act(state,'check',{},id);
  const replacement = deploymentInstances([state.deployments[0]])[0];
  state = act(state,'restart',{},id);
  state = act(state,'check',{},id);
  const restarted = deploymentInstances([state.deployments[0]]);
  assert.notEqual(restarted[0].id,replacement.id);
  assert.notEqual(restarted[0].id,initial[0].id);
  state = act(state,'scale',{replicas:1},id);
  state = act(state,'check',{},id);
  state = act(state,'scale',{replicas:2},id);
  state = act(state,'check',{},id);
  assert.notEqual(deploymentInstances([state.deployments[0]])[1].id,restarted[1].id);
});
test('failed startup releases reservations exactly once and can retry after repair',()=>{
 let {state,id}=created();state.artifacts.find(item=>item.id==='artifact-vllm').validation='失败';state=act(state,'check',{},id);assert.equal(clusterGpu(state),36);assert.equal(state.deployments[0].status,'失败');assert.match(state.deployments[0].failureReason,/运行时/);assert.equal(state.deployments[0].endpointId,null);
 state=act(state,'stop',{},id);assert.equal(clusterGpu(state),36);assert.throws(()=>act(state,'stop',{},id),/已经停止/);state.artifacts.find(item=>item.id==='artifact-vllm').validation='通过';state=act(state,'start',{},id);assert.equal(clusterGpu(state),40);state=act(state,'check',{},id);assert.equal(state.deployments[0].status,'运行中');
});
test('stop and restart reuse endpoints and never double-release other cluster allocations',()=>{
 let {state,id}=running();const ep=state.deployments[0].endpointId,n=state.endpoints.length;state=act(state,'stop',{},id);assert.equal(clusterGpu(state),36);assert.equal(deploymentGpu(state.deployments[0]),0);assert.equal(state.endpoints.find(item=>item.id===ep).status,'停用');assert.throws(()=>act(state,'stop',{},id));state=act(state,'start',{},id);state=act(state,'check',{},id);assert.equal(state.endpoints.length,n);assert.equal(state.deployments[0].endpointId,ep);assert.equal(clusterGpu(state),40);
});
test('scale keeps readiness separate, enforces integer bounds and recomputes current capacity',()=>{
 let {state,id}=running();assert.throws(()=>act(state,'scale',{replicas:2},id),/未变化/);assert.throws(()=>act(state,'scale',{replicas:100},id),/容量不足/);assert.throws(()=>act(state,'scale',{replicas:-1},id));state=act(state,'scale',{replicas:3},id);assert.equal(state.deployments[0].status,'扩缩容中');assert.equal(state.deployments[0].readyReplicas,2);assert.equal(clusterGpu(state),42);assert.throws(()=>act(state,'scale',{replicas:4},id),/仅运行/);state=act(state,'check',{},id);assert.equal(state.deployments[0].readyReplicas,3);state=act(state,'scale',{replicas:1},id);assert.equal(clusterGpu(state),38);state=act(state,'check',{},id);assert.equal(state.deployments[0].readyReplicas,1);
});
test('update and rollback preserve stable configuration, endpoints and allocation',()=>{
 let {state,id}=running();const ep=state.deployments[0].endpointId;assert.throws(()=>act(state,'update',{},id),/未变化/);state=act(state,'update',{maxModelLen:4096},id);assert.equal(state.deployments[0].status,'更新中');assert.equal(state.deployments[0].previousConfig.maxModelLen,null);assert.equal(state.deployments[0].configRevision,2);assert.equal(state.endpoints.find(item=>item.id===ep).status,'停用');assert.equal(clusterGpu(state),40);state=act(state,'check',{},id);state=act(state,'rollback',{},id);assert.equal(state.deployments[0].maxModelLen,null);assert.equal(state.deployments[0].configRevision,3);state=act(state,'check',{},id);assert.equal(state.deployments[0].endpointId,ep);assert.equal(state.deployments[0].readyReplicas,2);
});
test('description edits keep serving instances and record the new revision', () => {
  let {state,id} = running();
  const instanceIds = deploymentInstances([state.deployments[0]]).map(row=>row.id);
  const endpointId = state.deployments[0].endpointId;
  state = act(state,'update',{description:'评审备注'},id);
  assert.equal(state.deployments[0].status,'运行中');
  assert.equal(state.deployments[0].configRevision,2);
  assert.equal(state.deployments[0].description,'评审备注');
  assert.equal(state.endpoints.find(row=>row.id===endpointId).status,'运行中');
  assert.deepEqual(deploymentInstances([state.deployments[0]]).map(row=>row.id),instanceIds);
});

test('YAML requires a stopped deployment and explicit overwrite of each changed item', () => {
  let {state,id} = running();
  const item = {...values,description:'从 YAML 更新'};
  assert.throws(()=>act(state,'import',{items:[item],overwrite:[item.deploymentId]}),/停止现有部署/);
  state = act(state,'stop',{},id);
  assert.throws(()=>act(state,'import',{items:[item]}),/确认覆盖/);
  state = act(state,'import',{items:[item],overwrite:[item.deploymentId]});
  assert.equal(state.deployments[0].id,id);
  assert.equal(state.deployments[0].description,'从 YAML 更新');
  assert.equal(state.deployments[0].status,'停止');
});

test('zero-replica YAML keeps the saved target and reserves no GPUs until started', () => {
  let state = createAdminSeed();
  const sourceGpu = clusterGpu(state);
  const moved = target => ({ ...values,clusterId:target,importStopped:true });
  state = act(state,'import',{items:[moved(values.clusterId)]});
  const {id} = state.deployments[0];
  assert.equal(state.deployments[0].status,'停止');
  assert.equal(state.deployments[0].replicas,values.replicas);
  assert.equal(clusterGpu(state),sourceGpu);
  const target = 'cluster-sz-a';
  const savedTargetGpu = state.clusters.find(row=>row.id===target).allocatedGpu;
  state = act(state,'import',{items:[moved(target)],overwrite:[values.deploymentId]});
  assert.equal(state.deployments[0].id,id);
  assert.equal(state.deployments[0].clusterId,target);
  assert.equal(state.deployments[0].status,'停止');
  assert.equal(state.clusters.find(row=>row.id===target).allocatedGpu,savedTargetGpu);
  state = act(state,'import',{items:[{...moved(target),importStopped:false}],overwrite:[values.deploymentId]});
  assert.equal(state.deployments[0].status,'更新中');
  assert.equal(state.clusters.find(row=>row.id===target).allocatedGpu,savedTargetGpu+4);
});

test('a zero-baseline schedule waits without claiming devices and resumes after manual stop', () => {
  const scalingSchedule = {enabled:true,paused:false,baseline_replicas:0,
    rules:[{start_cron:'0 0 1 1 *',duration_seconds:1,replicas:0,name:'演示计划'}]};
  let state = createAdminSeed();
  const before = clusterGpu(state);
  state = act(state,'create',{...values,replicas:0,scalingSchedule});
  const {id} = state.deployments[0];
  assert.equal(state.deployments[0].status,'等待定时计划');
  assert.equal(state.deployments[0].replicas,0);
  assert.equal(clusterGpu(state),before);
  assert.throws(()=>act(state,'scale',{replicas:2},id),/关闭定时伸缩/);
  state = act(state,'stop',{},id);
  assert.equal(state.deployments[0].scalingSchedule.paused,true);
  state = act(state,'start',{},id);
  assert.equal(state.deployments[0].scalingSchedule.paused,false);
  assert.equal(state.deployments[0].status,'等待定时计划');
  assert.equal(clusterGpu(state),before);
});

test('capacity checks use the currently applicable schedule and only reserve newly active target GPUs', () => {
  const scalingSchedule = {enabled:true,paused:false,baseline_replicas:0,rules:[{start_cron:'* * * * *',duration_seconds:120,replicas:2}]};
  let state = createAdminSeed();
  const before = clusterGpu(state);
  state = act(state,'create',{...values,replicas:0,scalingSchedule});
  assert.equal(state.deployments[0].replicas,2);
  assert.equal(state.deployments[0].scalingSchedule.baseline_replicas,0);
  assert.equal(clusterGpu(state),before+4);
  assert.throws(()=>deploymentPreflight(state,{...values,scalingSchedule:{...scalingSchedule,rules:[...scalingSchedule.rules,
    {...scalingSchedule.rules[0],replicas:3}]}},undefined,{enforceUniqueScheduleStarts:true}),/同一副本数/);
});

test('plan reconciliation releases and restores capacity and reuses the service endpoint', () => {
  let {state,id} = running();
  const endpointId = state.deployments[0].endpointId;
  const allocated = clusterGpu(state);
  state.deployments[0].scalingSchedule = {enabled:true,paused:false,baseline_replicas:0,
    rules:[{start_cron:'* * * * *',duration_seconds:120,replicas:0}]};
  state = act(state,'reconcileSchedule',{},id);
  assert.equal(state.deployments[0].status,'等待定时计划');
  assert.equal(clusterGpu(state),allocated-4);
  assert.equal(state.endpoints.find(row=>row.id===endpointId).status,'停用');
  assert.throws(()=>act(state,'reconcileSchedule',{},id),/暂无定时伸缩变更/);
  state.deployments[0].scalingSchedule.rules[0].replicas = 2;
  state = act(state,'reconcileSchedule',{},id);
  state = act(state,'check',{},id);
  assert.equal(state.deployments[0].status,'运行中');
  assert.equal(state.deployments[0].endpointId,endpointId);
  assert.equal(clusterGpu(state),allocated);
});
test('old records remain unchanged, require full configuration for startup, and allow safe stop/scale',()=>{
 const seed=createAdminSeed(),id='deployment-bge';let state=act(seed,'check',{},id);assert.equal(state.deployments.find(item=>item.id===id).status,'失败');assert.equal(clusterGpu(state),32);assert.equal(seed.deployments.find(item=>item.id===id).status,'部署中');assert.throws(()=>act(state,'start',{},id),/运行时/);
 state=act(seed,'update',{...values,modelId:'model-1',clusterId:'cluster-nj-a',replicas:4,gpuPerReplica:4,tensorParallel:4},'deployment-ds');assert.equal(state.deployments.find(item=>item.id==='deployment-ds').previousConfig,null);
});
test('deployments retain access to registered weights and runtime images for rollback', () => {
  let {state, id} = running();
  const artifacts = structuredClone(state.artifacts);
  state = act(state, 'update', {weightId:'artifact-ds', weightPath:''}, id);
  state = act(state, 'check', {}, id);
  state = act(state, 'update', {weightId:'', weightPath:'/models/new'}, id);
  state = act(state, 'check', {}, id);
  state = act(state, 'rollback', {}, id);
  state = act(state, 'check', {}, id);
  const deployment = state.deployments.find(row => row.id === id);
  assert.equal(deployment.status, '运行中');
  assert.equal(deployment.runtimeId, values.runtimeId);
  assert.equal(deployment.weightId, 'artifact-ds');
  assert.deepEqual(state.artifacts, artifacts);
  const update = {type:'update', collection:'artifacts', id:values.runtimeId, changes:{status:'不可运行'}};
  assert.throws(() => commitAdminState(state, update, '平台管理员'), /无权/);
  assert.throws(() => commitAdminState(state, {type:'batch', changes:[update]}, '运维人员'), /无权/);
});
test('role restrictions, revision conflicts and failed storage preserve all data',()=>{
 const seed=createAdminSeed();for(const role of ['运营人员','财务人员','只读观察员'])assert.throws(()=>commitAdminState(seed,{type:'deploymentOperation',operation:'create',data:values},role),/无权/);assert.equal(commitAdminState(seed,{type:'deploymentOperation',operation:'create',data:values},'运维人员').deployments[0].status,'部署中');
 const action={type:'deploymentOperation',operation:'create',data:values};assert.throws(()=>persistAdminAction(seed,action,{getItem:()=>JSON.stringify({...seed,revision:99}),setItem:()=>assert.fail('must not save')}),/数据已变化/);assert.throws(()=>persistAdminAction(seed,action,{getItem:key=>{assert.equal(key,STORAGE_KEY);return JSON.stringify(seed)},setItem:()=>{throw new Error('quota')}}),/quota/);assert.equal(seed.deployments.length,3);
});

test('failed and stopped deployments can repair configuration and reserve only the new target',()=>{
 for(const status of ['失败','停止']) {let {state,id}=running();state=act(state,'stop',{},id);state.deployments[0].status=status;state=act(state,'update',{maxModelLen:4096},id);assert.equal(state.deployments[0].status,'更新中');assert.equal(clusterGpu(state),40);state=act(state,'check',{},id);assert.equal(state.deployments[0].status,'运行中');assert.equal(state.deployments[0].readyReplicas,2);}
 const seed=createAdminSeed();let state=act(seed,'check',{},'deployment-bge');state=act(state,'update',{...values,modelId:seed.deployments.find(item=>item.id==='deployment-bge').modelId},'deployment-bge');assert.equal(state.deployments.find(item=>item.id==='deployment-bge').status,'更新中');assert.equal(clusterGpu(state),36);
});

function createAdminSeed(...args) { return withAdminSession(baseCreateAdminSeed(...args)); }
