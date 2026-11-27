import assert from 'node:assert/strict';
import { test } from 'node:test';
import { loadAll } from 'js-yaml';
import { deploymentPreflight } from '../src/admin-v2/deployments.js';
import { deploymentYamlText, readDeploymentYaml, yamlDeploymentDocument } from '../src/admin-v2/deployment-gpustack-yaml.js';

const retainedFields = {
  id: 'dep-1', deploymentId: 'stable-code', name: 'qwen-8b', modelId: 'model-1', clusterId: 'c1', status: '运行中',
  source: 'Hugging Face', repository: 'Qwen/Qwen-8B', filename: 'model.safetensors', weightId: '', weightPath: '/models/Qwen-8B',
  namespace: 'inference-prod', runtimeMode: '推理后端版本', backend: 'vLLM', backendVersion: '0.23.0', runtimeId: '',
  replicas: 2, gpuPerReplica: 2, tensorParallel: 2, pipelineParallel: 1, maxModelLen: 8192, gpuMemoryUtilization: .9, startupTimeout: 55,
  placement: '指定 GPU', placementTargets: ['demo-gpu-1', 'demo-gpu-2'], environment: 'LOG_LEVEL=debug', parameters: '--disable-log-stats',
  description: 'portable', roles: null, scalingRules: [], cacheAcceleration: null, loraAdapters: [{ name: 'qa', path: '/adapters/qa' }],
  speculative: { algorithm: 'N-gram', tokens: 2, min: 2, max: 5 },
  offloading: true, distributedInference: false, restartOnError: true, nativeAnthropic: true, enableInternalRoute: false,
};
const state = {
  clusters: [{ id: 'c1', name: 'production', totalGpu: 32, allocatedGpu: 4, status: '运行中' }, { id: 'c2', name: 'staging' }],
  artifacts: [], models: [{ id: 'model-1', modelId: 'Qwen-8B', name: 'Qwen 8B', type: 'text' }], deployments: [retainedFields],
};
const infra = {
  'ops-nodes': [{ id: 'node-x', name: 'worker-a', clusterId: 'c1', labels: 'zone=central, availability=qa' },
    { id: 'node-y', name: 'worker-b', clusterId: 'c1', labels: 'zone=north, availability=qa' }],
  'ops-gpus': [{ id: 'demo-gpu-1', index: 0, nodeId: 'node-x', clusterId: 'c1', vendor: 'NVIDIA' },
    { id: 'demo-gpu-2', index: 1, nodeId: 'node-x', clusterId: 'c1', vendor: 'NVIDIA' }],
  'ops-inference-backends': [{ name: 'vLLM', version: '0.23.0' }],
  'ops-cache-acceleration': [{ id:'moma-cache', name:'shared-cache', provider:'LMCache', clusterId:'c1', gpustackId:31 }],
};

test('exports GPUStack native fields and roundtrips a typed deployment without leaking MoMA record IDs', () => {
  const yaml = deploymentYamlText([retainedFields], state, infra);
  const [entry] = loadAll(yaml);
  assert.equal(entry.cluster_name, 'production');
  assert.deepEqual(entry.gpu_selector, { gpu_ids: ['worker-a:cuda:0', 'worker-a:cuda:1'], gpus_per_replica: 2 });
  assert.deepEqual(entry.lora_list, [{ lora_name: 'qa', source: 'local_path', local_path: '/adapters/qa' }]);
  assert.equal(entry.enable_model_route, false);
  assert.doesNotMatch(yaml, /modelId:|runtimeId:|clusterId:|deploymentId:|ready_replicas:|artifactId:/);
  const [decoded] = readDeploymentYaml([entry], state, undefined, infra);
  const prepared = deploymentPreflight(state, decoded, retainedFields);
  for (const key of ['clusterId', 'modelId', 'weightPath', 'backendVersion', 'parameters', 'tensorParallel', 'gpuPerReplica', 'maxModelLen',
    'startupTimeout', 'environment', 'placementTargets', 'loraAdapters', 'speculative', 'enableInternalRoute', 'nativeAnthropic']) assert.deepEqual(prepared[key], retainedFields[key], key);
  assert.equal(decoded.deploymentId, 'stable-code');
});

test('maps worker label selection and GPU selector to devices scoped to the selected destination', () => {
  const input = { name: 'qwen-import', cluster_name: 'production', source: 'model_scope', model_scope_model_id: 'Qwen/Qwen-8B',
    model_scope_file_path: 'weights.safetensors', worker_selector: { availability: 'qa' },
    gpu_selector: { gpus_per_replica: 2 }, backend: 'vLLM' };
  const [decoded] = readDeploymentYaml([input], state, undefined, infra);
  assert.equal(decoded.source, 'ModelScope');
  assert.equal(decoded.filename, 'weights.safetensors');
  assert.deepEqual(decoded.placementTargets, ['node-x', 'node-y']);
  assert.equal(decoded.backendVersion, '0.23.0');
  assert.deepEqual(yamlDeploymentDocument(decoded, state, infra).worker_selector, { availability: 'qa' });
  const pinned = { ...input, worker_selector: { zone: 'north' }, gpu_selector: { gpu_ids: ['worker-a:cuda:1'] } };
  assert.throws(() => readDeploymentYaml([pinned], state, undefined, infra), /与节点标签冲突/);
  assert.throws(() => readDeploymentYaml([input], state, 'c2', infra), /没有匹配项/);
});

test('normalizes native defaults and preserves explicit placement and custom runtime engine', () => {
  const input = { name: 'qwen-import', cluster_name: 'production', source: 'huggingface', huggingface_repo_id: 'Qwen/Qwen-8B' };
  const [defaults] = readDeploymentYaml([input], state, undefined, infra);
  assert.equal(defaults.backend, 'vLLM');
  assert.equal(defaults.distributedInference, true);
  assert.equal(defaults.restartOnError, true);
  assert.equal(defaults.enableInternalRoute, false);
  assert.equal(defaults.placementStrategy, undefined);
  assert.equal(yamlDeploymentDocument(defaults, state, infra).placement_strategy, 'spread');
  const image = 'registry.example.test/inference/vllm:latest';
  const [custom] = readDeploymentYaml([{ ...input, backend: 'SGLang', placement_strategy: 'binpack', image_name: image,
    restart_on_error: null, distributed_inference_across_workers: false }], state, undefined, infra);
  assert.equal(custom.backend, 'SGLang');
  assert.equal(custom.runtimeMode, '自定义镜像');
  assert.equal(custom.restartOnError, false);
  assert.equal(custom.distributedInference, false);
  const exported = yamlDeploymentDocument(custom, state, infra);
  assert.equal(exported.backend, 'SGLang');
  assert.equal(exported.image_name, image);
  assert.equal(exported.placement_strategy, 'binpack');
  assert.throws(() => readDeploymentYaml([{ ...input, placement_strategy: 'round-robin' }], state, undefined, infra), /spread 或 binpack/);
  assert.throws(() => readDeploymentYaml([{ ...input, image_name: image, backend_version: 'stable' }], state, undefined, infra), /不能同时设置/);
});

test('GPUStack PD encodes replicas as an enable switch while MoMA stores the role counts', () => {
  const row = { ...retainedFields, name: 'qwen-pd', replicas: 4, roles: { prefill: 1, decode: 2, router: 1 }, pdMode: 'vllm-nixl', status: '停止',
    placement: '自动调度', placementTargets: [] };
  const stopped = yamlDeploymentDocument(row, state, infra);
  assert.equal(stopped.replicas, 0);
  assert.deepEqual(stopped.disaggregation, { mode: 'vllm-nixl' });
  assert.deepEqual(stopped.roles, [{ name: 'prefill', replicas: 1 }, { name: 'decode', replicas: 2 }, { name: 'router', replicas: 1 }]);
  const [decoded] = readDeploymentYaml([stopped], state, undefined, infra);
  assert.equal(decoded.replicas, 4);
  assert.equal(decoded.importStopped, true);
  assert.equal(decoded.pdMode, 'vllm-nixl');
  assert.equal(yamlDeploymentDocument({ ...row, status: '运行中' }, state, infra).replicas, 1);
});

test('retains PD role overrides, exact portable device selectors and group locality on import and export', () => {
  const document = {
    ...yamlDeploymentDocument({...retainedFields,backendVersion:'0.27.1',loraAdapters:[]},state,infra),
    name:'qwen-roles',replicas:1,disaggregation:{mode:'vllm-nixl',vendor:'nvidia',readiness:'all',kv_load_failure_policy:'recompute'},
    gather:{strategy:'MustGather',layer:'builtin-000004'},
    roles:[
      {name:'prefill',replicas:1,gpu_selector:{gpu_ids:['worker-a:cuda:0'],gpus_per_replica:1},
        backend:'vLLM',backend_version:'0.27.1',backend_parameters:['--max-num-seqs 8'],env:{HCCL_BUFFSIZE:'2560'},
        extended_kv_cache:{enabled:true,mode:'shared',cache_service_id:31},
        speculative_config:{enabled:true,algorithm:'mtp',num_draft_tokens:1}},
      {name:'decode',replicas:1,gpu_selector:{gpu_ids:['worker-a:cuda:1'],gpus_per_replica:1},
        backend:'vLLM',image_name:'inference.example.invalid/vllm:0.27.1',run_command:'vllm serve',backend_parameters:[],env:{},
        speculative_config:{enabled:true,algorithm:'mtp',num_draft_tokens:3}},
      {name:'router',replicas:1,dependencies:['prefill','decode'],worker_selector:{'worker-name':'worker-a'},
        resources:{cpu:1.5,memory:1073741824}},
    ],
  };
  const [decoded] = readDeploymentYaml([document],state,undefined,infra);
  const checked = deploymentPreflight(state,decoded);
  assert.equal(checked.required,2);
  assert.deepEqual(checked.roleConfigs.router.resources,{cpu:1.5,memory:1073741824});
  assert.deepEqual(checked.roleConfigs.prefill.placementTargets,['demo-gpu-1']);
  assert.equal(checked.roleConfigs.decode.environment,'');
  assert.equal(checked.roleConfigs.prefill.kvCache.service.id,'moma-cache');
  const encoded = yamlDeploymentDocument({...checked,name:document.name},state,infra);
  assert.deepEqual(encoded.roles,document.roles);
  assert.deepEqual(encoded.disaggregation,document.disaggregation);
  assert.deepEqual(encoded.gather,document.gather);
  assert.throws(()=>readDeploymentYaml([document],state, 'c2',infra),/目标集群/);
});

test('normalizes local KV size and requires mapped GPUStack IDs for portable shared caches', () => {
  const base = yamlDeploymentDocument(retainedFields,state,infra);
  const local = {enabled:true,mode:'local',ram_ratio:1.7,ram_size:16,chunk_size:64};
  const [decoded] = readDeploymentYaml([{...base,extended_kv_cache:local}],state,undefined,infra);
  const checked = deploymentPreflight(state,decoded,retainedFields);
  assert.deepEqual(checked.kvCache,{enabled:true,mode:'local',ram_size:16,chunk_size:64});
  assert.deepEqual(yamlDeploymentDocument({...checked,name:base.name},state,infra).extended_kv_cache,checked.kvCache);
  const shared = {enabled:true,mode:'shared',cache_service_id:99};
  assert.throws(()=>readDeploymentYaml([{...base,extended_kv_cache:shared}],state,undefined,infra),/没有唯一/);
  assert.throws(()=>yamlDeploymentDocument({...retainedFields,kvCache:{enabled:true,mode:'shared',
    service:{id:'moma-cache',name:'shared-cache',clusterId:'c1',provider:'LMCache'}}},state,infra),/GPUStack ID/);
});

test('exports role merge as effective native env and preserves explicit replace and template JSON argv', () => {
  const row = {...retainedFields,name:'qwen-role-overrides',backendVersion:'0.27.1',
    loraAdapters:[],replicas:3,pdMode:'vllm-nixl',roles:{prefill:1,decode:1,router:1},
    environment:'LOG_LEVEL=info\nTHREADS=2',
    roleConfigs:{prefill:{environmentMode:'merge',environment:'LOG_LEVEL=debug\nEXTRA=',
      parameters:'--kv-transfer-config {"kv_connector":"NixlConnector"}'},decode:{environment:''}},
  };
  const document = yamlDeploymentDocument(row,state,infra);
  assert.deepEqual(document.roles[0].env,{LOG_LEVEL:'debug',THREADS:'2',EXTRA:''});
  assert.deepEqual(document.roles[0].backend_parameters,['--kv-transfer-config','{"kv_connector":"NixlConnector"}']);
  assert.deepEqual(document.roles[1].env,{});
  assert.equal(document.roles[2].env,undefined);
  const [clean] = readDeploymentYaml([document],{...state,deployments:[row]},undefined,infra);
  assert.equal(clean.roleConfigs.prefill.environmentMode,'merge');
  const prepared = deploymentPreflight(state,clean,row);
  assert.deepEqual(prepared.roleConfigs,row.roleConfigs);
  const [newModel] = readDeploymentYaml([{...document,name:'fresh-role-override'}],state,undefined,infra);
  assert.equal(newModel.roleConfigs.prefill.environmentMode,undefined);
  assert.deepEqual(yamlDeploymentDocument({...newModel,name:'fresh-role-override'},state,infra).roles,document.roles);
});

test('exports scheduled replicas as the baseline and omits portable pause state', () => {
  const plan = { enabled: true, paused: true, baseline_replicas: 0,
    rules: [{ start_cron: '0 9 * * *', duration_seconds: 32400, replicas: 4, name: 'Office hours' }] };
  const paused = { ...retainedFields, scalingSchedule: plan, status: '停止' };
  const doc = yamlDeploymentDocument(paused, state, infra);
  assert.equal(doc.replicas, 0);
  assert.deepEqual(doc.scaling_schedule, { enabled: true, baseline_replicas: 0, rules: plan.rules });
  const [overwritten] = readDeploymentYaml([doc], { ...state, deployments: [paused] }, undefined, infra);
  assert.equal(overwritten.replicas, 0);
  assert.equal(overwritten.importStopped, true);
  assert.deepEqual(overwritten.scalingSchedule, plan);
  const [newSchedule] = readDeploymentYaml([{ ...doc, name: 'qwen-scheduled' }], state, undefined, infra);
  assert.equal(newSchedule.importStopped, false);
  assert.equal(newSchedule.scalingSchedule.paused, false);
  const prepared = deploymentPreflight(state, newSchedule, undefined, { evaluatedAt: new Date('2026-11-26T03:00:00Z') });
  assert.equal(prepared.replicas, 4);
  const [disabled] = readDeploymentYaml([{ ...doc, name: 'qwen-disabled', replicas: 1,
    scaling_schedule: { enabled: false, rules: [{ start_cron: '', replicas: 0 }] } }], state, undefined, infra);
  assert.deepEqual(disabled.scalingSchedule, { enabled: false, paused: false, baseline_replicas: null,
    rules: [{ start_cron: '', duration_seconds: null, replicas: 0, name: null }] });
  assert.throws(() => readDeploymentYaml([{ ...doc, scaling_schedule: { ...doc.scaling_schedule, unexpected: true } }], state, undefined, infra), /unexpected/);
});

test('rejects managed, unsupported and incompatible nested fields instead of silently changing deployment', () => {
  const base = { name: 'qwen-8b', cluster_name: 'production', source: 'huggingface', huggingface_repo_id: 'Qwen/Qwen-8B', backend: 'vLLM' };
  assert.throws(() => readDeploymentYaml([{ ...base, ready_replicas: 2 }], state), /ready_replicas/);
  assert.throws(() => readDeploymentYaml([{ ...base, gpu_selector: { gpu_per_replica: 2 } }], state), /gpu_per_replica/);
  assert.throws(() => readDeploymentYaml([{ ...base, gpu_type_selector: { type: 'gpu-sliced' } }], state), /gpu_type_selector/);
  assert.throws(() => readDeploymentYaml([{ ...base, env: { HF_TOKEN: 'example' } }], state, undefined, infra), /凭证字段/);
  assert.throws(() => readDeploymentYaml([{ ...base, backend_parameters: ['--tp-size=2', '--tensor-parallel-size=4'] }], state, undefined, infra), /不得重复/);
  assert.throws(() => yamlDeploymentDocument({ ...retainedFields, source: '本地路径', weightPath: '' }, state, infra), /缺少可导出/);
});
