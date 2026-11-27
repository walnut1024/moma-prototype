import assert from 'node:assert/strict';
import test from 'node:test';
import {
  alignedBenchmarkExportFields, benchmarkArchiveCapacity, benchmarkArchiveUsage, benchmarkBytesToGiB, benchmarkComparisonPoint,
  benchmarkDeploymentPreset, benchmarkEnvironmentSnapshot, benchmarkInstanceTree, benchmarkListMeasurements, benchmarkProfilePatch, benchmarkStageInspection, benchmarkTargets, cloneAlignedBenchmark, completeAlignedBenchmark,
  initialBenchmarkDraft, isBenchmarkTargetReady, saveAlignedBenchmark, updateBenchmarkDraft,
} from '../src/admin-v2/benchmark-alignment.js';

const startedAt = new Date('2026-11-26T04:00:00Z');
const deployment = {
  id: 'deployment-a', deploymentId: 'chat', name: '主模型', clusterId: 'cluster-a', status: '运行中',
  endpointId: 'endpoint-a', readyReplicas: 2, replicas: 2, modelId: 'model-a',
};
const second = { ...deployment, id: 'deployment-b', deploymentId: 'chat-b', name: '备用模型', endpointId: 'endpoint-b' };
const grouped = { ...deployment, id: 'deployment-pd', deploymentId: 'chat-pd', name: '分离部署', endpointId: 'endpoint-pd',
  readyReplicas: 3, replicas: 3, roles: { prefill: 1, decode: 1, router: 1 } };
const route = { id: 'route-a', name: '生产路由', status: '已启用', targets: [
  { endpointId: second.endpointId, weight: 20 }, { endpointId: deployment.endpointId, weight: 80 },
] };
const records = {
  clusters: [{ id: 'cluster-a', name: '生产集群', status: '运行中', isDefault: true }],
  deployments: [deployment, second, grouped],
  endpoints: [deployment, second, grouped].map(item => ({ id: item.endpointId, status: '运行中' })),
  routes: [route, { ...route, id: 'route-off', status: '已停用' }],
  deployableModels: [{ id: 'model-a', categories: ['语言模型'] }],
};
const draft = (patch = {}) => ({ ...initialBenchmarkDraft(records), ...benchmarkProfilePatch('自定义'),
  name: '基准任务', loadPattern: '单次', load: 0.25, requests: 25, duration: 60, ...patch });

test('selects healthy deployment instances and the main active route target without exposing PD workers', () => {
  const targetIds = benchmarkTargets(records, 'cluster-a', '模型实例').map(item => item.value);
  assert(targetIds.includes('deployment-a:1'));
  assert(targetIds.includes('deployment-pd:3'));
  assert(!targetIds.includes('deployment-pd:1'));
  const routes = benchmarkTargets(records, 'cluster-a', '路由');
  assert.deepEqual(routes.map(item => item.value), ['route-a']);
  assert.equal(routes[0].deployment.id, deployment.id);
  const row = saveAlignedBenchmark([], records, draft({ targetMode: '路由', targetSelection: route.id }))[0];
  assert.equal(row.routeName, route.name);
  assert.equal(row.targetId, deployment.id);
  assert.equal(isBenchmarkTargetReady(row, records), true);
  assert.equal(isBenchmarkTargetReady(row, { ...records, routes: [] }), false);
  assert.throws(() => saveAlignedBenchmark([], { ...records, routes: [] }, draft({ targetMode: '路由', targetSelection: route.id })), /可用路由/);
});

test('only defaults a sole usable route and requires a live pair of route and deployment at submission', () => {
  const secondRoute = { ...route, id: 'route-b' };
  const routeDraft = initialBenchmarkDraft(records, undefined, { targetMode: '路由' });
  assert.equal(routeDraft.targetSelection, route.id);
  assert.equal(routeDraft.targetId, deployment.id);
  assert.equal(initialBenchmarkDraft({ ...records, routes: [route, secondRoute] }, undefined, { targetMode: '路由' }).targetSelection, '');
  assert.deepEqual(benchmarkTargets({ ...records, endpoints: undefined }, 'cluster-a', '路由'), []);
  assert.deepEqual(benchmarkTargets({ ...records, endpoints: [{ id: deployment.endpointId, status: '停止' }] }, 'cluster-a', '路由'), []);
  assert.equal(isBenchmarkTargetReady({ targetMode: '路由', targetId: deployment.id, clusterId: 'cluster-a' }, records), false);
  const current = saveAlignedBenchmark([], records, routeDraft)[0];
  const changed = { ...records, routes: [{ ...route, targets: [
    { id: 2, endpointId: second.endpointId, weight: 50 }, { id: 11, endpointId: deployment.endpointId, weight: 50 },
  ] }] };
  assert.equal(benchmarkTargets(changed, 'cluster-a', '路由')[0].deployment.id, second.id);
  assert.equal(isBenchmarkTargetReady(current, changed), true);
  assert.equal(saveAlignedBenchmark([], changed, routeDraft)[0].targetId, deployment.id);
  assert.equal(cloneAlignedBenchmark(current, changed).targetSelection, route.id);
  assert.equal(cloneAlignedBenchmark(current, changed).targetId, second.id);
  const removed = { ...changed, routes: [{ ...changed.routes[0], targets: changed.routes[0].targets.slice(0, 1) }] };
  assert.equal(isBenchmarkTargetReady(current, removed), false);
  assert.throws(() => saveAlignedBenchmark([], removed, routeDraft), /可用路由/);
  assert.equal(cloneAlignedBenchmark(current, { ...changed, routes: [secondRoute] }).targetSelection, '');
});

test('editing a historical route benchmark changes only identity fields even when the route is unavailable', () => {
  const current = saveAlignedBenchmark([], records, draft({ targetMode: '路由', targetSelection: route.id,
    labels: [{ key:'scope', value:'production' }],
  }))[0];
  const saved = saveAlignedBenchmark([current], { ...records, routes: [] },
    { name: '新名称', description:'新描述', labels:[{ key:'scope', value:'' }], targetSelection:'removed' }, current, startedAt)[0];
  assert.deepEqual(saved, { ...current, name:'新名称', description:'新描述', updatedAt:startedAt.toISOString() });
});

test('deployment links and clones keep the exact replica and require reselection after replacement', () => {
  const url = new URLSearchParams({ clusterId: 'cluster-a', targetId: deployment.id, replica: '2' });
  const direct = initialBenchmarkDraft(records, undefined, url);
  assert.equal(direct.targetSelection, 'deployment-a:2');
  const source = saveAlignedBenchmark([], records, { ...draft(), targetSelection: direct.targetSelection })[0];
  const existing = { ...records, 'ops-benchmarks': [source, { name: `${source.name}-copy` }] };
  const cloned = cloneAlignedBenchmark(source, existing);
  assert.equal(cloned.targetSelection, source.targetSelection);
  assert.equal(cloned.name, '基准任务-copy-2');
  const replacement = { ...records, deployments: [{ ...deployment, instanceReplacements: { 2: { sequence: 1 } } }, second, grouped] };
  assert.equal(isBenchmarkTargetReady(source, replacement), false);
  const changed = cloneAlignedBenchmark(source, replacement);
  assert.equal(initialBenchmarkDraft(replacement, undefined, changed, { clone: true }).targetSelection, '');
});

test('the model shortcut defaults to its own first ready replica and the user can choose another', () => {
  const otherFirst = { ...records, deployments: [second, deployment, grouped] };
  const preset = benchmarkDeploymentPreset(deployment);
  assert.equal(preset.has('targetSelection'), false);
  const selected = initialBenchmarkDraft(otherFirst, undefined, preset);
  assert.equal(selected.clusterId, deployment.clusterId);
  assert.equal(selected.targetMode, '模型实例');
  assert.equal(selected.targetId, deployment.id);
  assert.equal(selected.targetSelection, 'deployment-a:1');
  const explicit = benchmarkDeploymentPreset(deployment, { id:'deployment-a:2' });
  assert.equal(initialBenchmarkDraft(otherFirst, undefined, explicit).targetSelection, 'deployment-a:2');
  const switched = saveAlignedBenchmark([], otherFirst, { ...selected, targetSelection:'deployment-a:2' })[0];
  assert.equal(switched.environment.targetInstanceId, 'deployment-a:2');
  assert.throws(() => saveAlignedBenchmark([], otherFirst, { ...selected, targetSelection:'deployment-b:1' }), /就绪的模型实例/);
  const rebuilding = { ...otherFirst, deployments: [second, { ...deployment, rebuildingInstances:[1], readyReplicas:1 }, grouped] };
  assert.equal(initialBenchmarkDraft(rebuilding, undefined, preset).targetSelection, 'deployment-a:2');
  const replaced = { ...otherFirst, deployments: [second, { ...deployment, instanceReplacements:{ 2:{ sequence:1 } } }, grouped] };
  assert.equal(initialBenchmarkDraft(replaced, undefined, explicit).targetSelection, '');
});

test('the PD shortcut and clone retain the model while a current router is resolved only when saving', () => {
  const pd = { ...grouped, readyReplicas:4, replicas:4, roles:{ ...grouped.roles, router:2 } };
  const before = { ...records, deployments:[deployment, second, pd] };
  const modelPreset = benchmarkDeploymentPreset(pd);
  const memberPreset = benchmarkDeploymentPreset(pd, { id:'deployment-pd:3' });
  assert.equal(memberPreset.toString(), modelPreset.toString());
  assert.equal(modelPreset.has('targetSelection'), false);
  const selected = initialBenchmarkDraft(before, undefined, modelPreset);
  assert.equal(selected.targetSelection, pd.id);
  const previous = saveAlignedBenchmark([], before, selected)[0];
  assert.equal(previous.targetSelection, 'deployment-pd:3');
  assert.equal(previous.targetName, pd.name);
  assert.equal(previous.environment.targetInstanceId, 'deployment-pd:3');
  const changed = { ...before, deployments:[deployment, second, { ...pd, rebuildingInstances:[3], readyReplicas:3 }] };
  assert.equal(isBenchmarkTargetReady(previous, changed), false);
  const clone = cloneAlignedBenchmark(previous, changed);
  assert.equal(clone.targetSelection, pd.id);
  const latest = saveAlignedBenchmark([], changed, selected)[0];
  assert.equal(latest.targetId, pd.id);
  assert.equal(latest.targetSelection, 'deployment-pd:4');
  assert.equal(latest.environment.targetInstanceId, 'deployment-pd:4');
  const unavailable = { ...before, deployments:[deployment, second, { ...pd, rebuildingInstances:[3,4], readyReplicas:2 }] };
  assert.equal(benchmarkInstanceTree(unavailable, pd.clusterId).find(item => item.value === pd.id).disabled,true);
  assert.equal(initialBenchmarkDraft(unavailable, undefined, modelPreset).targetSelection,'');
  assert.throws(() => saveAlignedBenchmark([], unavailable, selected), /就绪的模型实例/);
});

test('keeps model and instance choices distinct and shows unavailable models and instances as disabled', () => {
  const embedding = { ...deployment, id: 'embedding', modelId: 'embedding-model' };
  const pending = { ...second, readyReplicas: 1 };
  const next = { ...records, deployments: [deployment, pending, grouped, embedding],
    deployableModels: [...records.deployableModels, { id: embedding.modelId, categories: ['embedding'] }] };
  const tree = benchmarkInstanceTree(next, 'cluster-a');
  assert.deepEqual(tree[0].children.map(item => [item.value,item.disabled]), [['deployment-a:1', false], ['deployment-a:2', false]]);
  assert.deepEqual(tree[1].children.map(item => [item.value,item.disabled]), [['deployment-b:1', false], ['deployment-b:2', true]]);
  assert.equal(tree[2].target, grouped.id);
  assert.equal(tree[2].children, undefined);
  assert.equal(tree[3].reason, '仅支持语言模型');
  assert.equal(tree[3].disabled, true);
  const parentOnly = initialBenchmarkDraft(next, undefined, { targetId: deployment.id, targetSelection: '' });
  assert.equal(parentOnly.targetId, deployment.id);
  assert.equal(parentOnly.targetSelection, '');
  assert.throws(() => saveAlignedBenchmark([], next, { ...draft(), ...parentOnly, name: '必须选择实例' }), /就绪的模型实例/);
});

test('applies named preset defaults and checks decimal rates, integer concurrency, ranges and stages', () => {
  assert.deepEqual(benchmarkProfilePatch('满足延迟 SLO').sloTargets, { avgTtft: 500, avgTpot: 50 });
  assert.equal(benchmarkProfilePatch('最大吞吐量').maxPoints, 15);
  assert.equal(saveAlignedBenchmark([], records, draft())[0].load, 0.25);
  assert.throws(() => saveAlignedBenchmark([], records, draft({ load: 0.0001 })), /负载值超出/);
  assert.throws(() => saveAlignedBenchmark([], records, draft({ loadType: '并发数' })), /填写整数/);
  assert.throws(() => saveAlignedBenchmark([], records, draft({ loadPattern: '自动调优', minLoad: 4, maxLoad: 4 })), /必须小于/);
  assert.throws(() => saveAlignedBenchmark([], records, draft({ loadPattern: '手工分阶段', stagePlans: [] })), /添加 1–500/);
  const stages = [{ load: 0.01, requests: 100 }, { load: 4.5, duration: 30 }];
  const run = saveAlignedBenchmark([], records, draft({ loadPattern: '手工分阶段', stagePlans: stages }))[0];
  assert.deepEqual(run.stages.map(stage => stage.load), [0.01, 4.5]);
  assert.equal(run.stages[1].requests, null);
  assert.throws(() => saveAlignedBenchmark([], records, draft({ loadPattern: '手工分阶段', stagePlans: [{ load: 2, duration: 0 }] })), /阶段最大耗时/);
  assert.throws(() => saveAlignedBenchmark([], records, draft({ loadPattern: '手工分阶段', stagePlans: [...stages, { load: 2 }] })),
    /第 3 个阶段须填写最大请求数或最大耗时/);
});

test('named benchmarks keep their load type and Auto-tune mode while a legacy clone retains custom load', () => {
  const preset = initialBenchmarkDraft(records, undefined, { profile:'满足延迟 SLO' });
  assert.deepEqual(preset.sloTargets, { avgTtft:500, avgTpot:50 });
  assert.equal(saveAlignedBenchmark([],records,preset)[0].loadType,'并发数');
  assert.throws(() => saveAlignedBenchmark([],records,{...preset,loadType:'固定请求速率'}), /请选择自定义/);
  assert.throws(() => saveAlignedBenchmark([],records,{...preset,loadPattern:'单次'}), /请选择自定义/);
  const historical = { ...draft(), profile:'吞吐量', load:7, loadType:'并发数' };
  const clone = cloneAlignedBenchmark(historical, records);
  assert.equal(clone.profile, '自定义');
  assert.equal(saveAlignedBenchmark([],records,clone)[0].load, 7);
});

test('changing a custom stage axis resets its rows and keeps the workload and target', () => {
  const stagePlans = [{ load:0.25, requests:25 }, { load:1.5, duration:60 }];
  const original = draft({ loadPattern:'手工分阶段', stagePlans, sloTargets:{ p95Ttft:500 }, pinSeed:true, randomSeed:19 });
  const changed = updateBenchmarkDraft(records,original,{ loadType:'并发数' });
  assert.equal(changed.loadType,'并发数');
  assert.equal(changed.loadPattern,'手工分阶段');
  assert.deepEqual(changed.stagePlans,[{ load:'',requests:'',duration:'' }]);
  assert.deepEqual(changed.sloTargets,original.sloTargets);
  assert.equal(changed.targetSelection,original.targetSelection);
  assert.equal(changed.name,original.name);
  assert.equal(changed.randomSeed,19);
  assert.deepEqual(original.stagePlans,stagePlans);
  assert.throws(() => saveAlignedBenchmark([],records,changed), /请填写第 1 个阶段的负载/);
  assert.equal(saveAlignedBenchmark([],records,{...changed,stagePlans:[{load:3,requests:100} ]})[0].load,3);
});

test('switching the custom search strategy restores native budgets and leaves legacy single-run inputs intact', () => {
  const automatic = initialBenchmarkDraft(records,undefined,{profile:'自定义'});
  assert.equal(automatic.loadPattern,'自动调优');
  const configured = { ...automatic,minLoad:6,maxLoad:80,maxPoints:12,maxTotalSeconds:760 };
  const manual = updateBenchmarkDraft(records,configured,{loadPattern:'手工分阶段'});
  assert.deepEqual([manual.minLoad,manual.maxLoad,manual.maxPoints,manual.maxTotalSeconds],[null,null,null,null]);
  assert.deepEqual(manual.stagePlans,[{load:'',requests:'',duration:''}]);
  const restored = updateBenchmarkDraft(records,{...manual,stagePlans:[{load:5,requests:100}]},{loadPattern:'自动调优'});
  assert.deepEqual([restored.minLoad,restored.maxLoad,restored.maxPoints,restored.maxTotalSeconds],[4,8192,18,5400]);
  assert.deepEqual(restored.stagePlans,[]);
  const axisChanged = updateBenchmarkDraft(records,configured,{loadType:'并发数'});
  assert.deepEqual([axisChanged.minLoad,axisChanged.maxLoad,axisChanged.maxPoints,axisChanged.maxTotalSeconds],[4,8192,18,5400]);
  const legacy = updateBenchmarkDraft(records,draft({load:7}),{loadType:'并发数'});
  assert.equal(legacy.loadPattern,'单次');
  assert.deepEqual([legacy.load,legacy.requests,legacy.duration],[7,25,60]);
});

test('updates generated names when the target or preset changes and keeps a custom name', () => {
  const now = new Date(2026,10,26,12,0);
  const base = initialBenchmarkDraft(records,undefined,undefined,{now,random:0.5});
  assert.match(base.name,/^chat-max-throughput-1126-1200-[a-z0-9]{3}$/);
  const selection = benchmarkTargets(records,'cluster-a','模型实例').find(item=>item.deployment.id===second.id);
  const next = updateBenchmarkDraft(records,base,{targetSelection:selection.value,profile:'满足延迟 SLO'},now,0.5);
  assert.match(next.name,/^chat-b-meet-latency-slo-1126-1200-/);
  const custom = updateBenchmarkDraft(records,next,{name:'客户验收基线'});
  assert.equal(updateBenchmarkDraft(records,custom,{profile:'自定义'},now,0.5).name,'客户验收基线');
  assert.equal(saveAlignedBenchmark([],records,{...draft(),name:next.name,automaticName:next.name})[0].automaticName,undefined);
});

test('list measurements keep historical missing values blank and expose only saved completed observations', () => {
  const pending = saveAlignedBenchmark([],records,draft())[0];
  assert.deepEqual(benchmarkListMeasurements(pending),{});
  const historical = benchmarkListMeasurements({status:'已完成',throughput:100,ttft:200});
  assert.equal(historical.avgTtft,undefined);
  assert.equal(historical.failed,undefined);
  const done = completeAlignedBenchmark({...pending,load:20,loadPattern:'单次'},startedAt);
  const measured = benchmarkListMeasurements(done);
  assert.equal(measured.recommendedLoad,20);
  assert.equal(measured.avgTtft,done.stageResults[0].slo.avgTtft);
  assert.equal(measured.p99Tpot,done.stageResults[0].slo.p99Tpot);
  assert.equal(measured.failed,done.stageResults[0].failures);
  assert.equal(measured.incomplete,undefined);
});

test('captures the effective shared KV service name at benchmark submission for known engine roles', () => {
  const service = {id:'shared-cache',name:'运行缓存'};
  const deployment = {...grouped,kvCache:{enabled:true,mode:'shared',service},
    roleConfigs:{decode:{kvCache:{enabled:false}}}};
  const snapshot = benchmarkEnvironmentSnapshot(records,records.clusters[0],{deployment},startedAt);
  assert.deepEqual(snapshot.cacheServices,[{id:'shared-cache',name:'运行缓存',role:'prefill'}]);
  service.name='更新后显示名称';
  assert.equal(snapshot.cacheServices[0].name,'运行缓存');
});

test('persists nine thresholds, dataset knobs and percent execution values in YAML export shape', () => {
  const thresholds = { avgTtft: 300, p95Ttft: 400, p99Ttft: 500, avgTpot: 20, p95Tpot: 30, p99Tpot: 40, avgLatency: 2000, p95Latency: 3000, p99Latency: 4000 };
  const row = saveAlignedBenchmark([], records, draft({ sloTargets: thresholds, pinSeed: true, randomSeed: 19,
    tokenDistribution: true, inputMin: 120, inputMax: 1000, outputStdev: 1.25, turnsEnabled: true, turns: 3,
    prefixBuckets: [{ tokens: 64, count: 2, weight: 30 }], maxErrors: 0, maxErrorPercent: 5, executionWarmup: 25, executionCooldown: 10 }))[0];
  const exported = alignedBenchmarkExportFields(row);
  assert.deepEqual(Object.values(exported).slice(-9), Object.values(thresholds));
  assert.equal(exported.warmup, 0.25);
  assert.equal(exported.cooldown, 0.10);
  assert.equal(exported.max_errors, 0);
  assert.equal(exported.max_error_rate, 0.05);
  assert.equal(exported.dataset_input_min, 120);
  assert.equal(exported.dataset_seed_random, false);
  assert.deepEqual(exported.prefix_buckets, [{ prefix_tokens: 64, prefix_count: 2, bucket_weight: 30 }]);
  assert.throws(() => saveAlignedBenchmark([], records, draft({ tokenDistribution: true, inputMin: 4, inputMax: 2 })), /下限不能大于上限/);
  const edited = saveAlignedBenchmark([row], records, { ...initialBenchmarkDraft(records, row), name: '新名称', load: 99 }, row)[0];
  assert.equal(edited.name, '新名称');
  assert.equal(edited.load, row.load);
});

test('the simulator honors the time and error limits, and the archive only meters available completed samples', () => {
  const row = saveAlignedBenchmark([], records, draft({ loadPattern: '自动调优', minLoad: 4, maxLoad: 64, maxTotalSeconds: 3 }), undefined, startedAt)[0];
  const done = completeAlignedBenchmark(row, startedAt);
  assert.equal(done.benchmarkStopReason, '时长预算用尽');
  assert.equal(done.benchmarkAdaptiveSearch.stopReason, 'budget_seconds');
  assert.equal(done.stageResults[0].duration, 3);
  assert.equal(done.stageResults.length, 1);
  assert.equal(done.status, '已完成');
  assert.equal(done.resultSource, '模拟结果');
  const error = completeAlignedBenchmark({ ...row, loadPattern: '单次', load: 200, maxErrors: 0, maxTotalSeconds: null }, startedAt);
  assert.equal(error.benchmarkStopReason, '达到错误数上限');
  assert.equal(benchmarkArchiveUsage([row]), 0);
  const used = benchmarkArchiveUsage([done]);
  assert(used > 0);
  assert.equal(benchmarkArchiveCapacity(false, benchmarkBytesToGiB(1)), 1);
  assert.equal(benchmarkArchiveCapacity(true, 0), null);
  assert.throws(() => benchmarkArchiveCapacity(false, 0), /有效 GiB/);
});

const adaptiveConfig = { loadPattern: '自动调优', inputTokens: 128, outputTokens: 32,
  minLoad: 4, maxLoad: 200, maxPoints: 28, maxTotalSeconds: 3600 };

test('auto-tune doubles load then bisects the SLO bracket on the concurrency grid', () => {
  const run = completeAlignedBenchmark({ ...adaptiveConfig, loadType: '并发数',
    sloTargets: { p95Ttft: 444, p95Tpot: 60 } }, startedAt);
  assert.deepEqual(run.stageResults.filter(point => point.searchPhase === 'expand').map(point => point.load), [4,8,16,32,64,128]);
  assert(run.stageResults.some(point => point.searchPhase === 'refine'));
  assert(run.stageResults.every(point => Number.isInteger(point.load)));
  assert.equal(new Set(run.stageResults.map(point => point.load)).size,run.stageResults.length);
  assert.deepEqual(run.benchmarkAdaptiveSearch, {
    stopReason:'converged', bracketReason:'overloaded', sloBracket:{ passing:74, failing:75 },
  });
  const report = benchmarkStageInspection({ ...adaptiveConfig, ...run, sloTargets:{ p95Ttft:444,p95Tpot:60 } });
  assert.equal(run.benchmarkPrimaryLoad,74);
  assert.equal(report.recommended.load,74);
  assert.equal(benchmarkListMeasurements({ ...adaptiveConfig,...run,sloTargets:{ p95Ttft:444,p95Tpot:60 } }).recommendedLoad,74);
});

test('auto-tune reports the measured throughput peak and actual valid convergence window', () => {
  const config = { ...adaptiveConfig, loadType:'固定请求速率' };
  const run = completeAlignedBenchmark(config,startedAt);
  assert.deepEqual(completeAlignedBenchmark(config,startedAt),run);
  assert.equal(run.benchmarkPrimaryLoad,64);
  assert(run.totalThroughput > run.throughput);
  assert.equal(run.benchmarkAdaptiveSearch.stopReason,'throughput_gain_converged');
  const evidence = run.benchmarkAdaptiveSearch.throughputGain;
  assert.equal(evidence.pointIds.length,3);
  assert(evidence.gain < evidence.threshold && evidence.lower < evidence.bestLoad && evidence.bestLoad < evidence.upper);
  assert(run.stageResults.filter(point => evidence.pointIds.includes(point.id)).every(point => point.searchPhase === 'refine'));
  assert(run.stageResults.some(point => !Number.isInteger(point.load)));
});

test('auto-tune keeps partial SLO bounds and missing observations distinct from convergence', () => {
  const config = { ...adaptiveConfig, loadType:'并发数', sloTargets:{ p95Ttft:444 } };
  const limited = completeAlignedBenchmark({ ...config,maxPoints:7 },startedAt);
  assert.equal(limited.stageResults.length,7);
  assert.equal(limited.benchmarkAdaptiveSearch.stopReason,'budget_points');
  assert.equal(limited.benchmarkAdaptiveSearch.bracketReason,'overloaded');
  assert.deepEqual(limited.benchmarkAdaptiveSearch.sloBracket,{ passing:64,failing:96 });
  const within = completeAlignedBenchmark({ ...config,maxLoad:16 },startedAt);
  assert.deepEqual(within.benchmarkAdaptiveSearch.sloBracket,{ passing:16,failing:null });
  assert.equal(within.benchmarkAdaptiveSearch.stopReason,'upper_bound');
  const noPass = completeAlignedBenchmark({ ...config,sloTargets:{ p95Ttft:100 } },startedAt);
  assert.equal(noPass.benchmarkAdaptiveSearch.stopReason,'slo_failed');
  assert.equal(noPass.benchmarkPrimaryLoad,undefined);
  assert.equal(benchmarkListMeasurements({ ...config,...noPass,sloTargets:{ p95Ttft:100 } }).avgTtft,undefined);
  const noSample = completeAlignedBenchmark({ ...adaptiveConfig,loadType:'固定请求速率',minLoad:0.001,maxTotalSeconds:1 },startedAt);
  assert.equal(noSample.benchmarkAdaptiveSearch.stopReason,'budget_seconds');
  assert.equal(noSample.stageResults[0].requests,0);
  assert.equal(noSample.stageResults[0].totalThroughput,null);
  assert.equal(noSample.benchmarkPrimaryLoad,undefined);
  const noTotal = completeAlignedBenchmark({ ...adaptiveConfig,inputTokens:null },startedAt);
  assert.equal(noTotal.benchmarkAdaptiveSearch.stopReason,'point_failed');
  assert.equal(noTotal.stageResults[0].totalThroughput,null);
  assert.equal(noTotal.benchmarkPrimaryLoad,undefined);
});

test('stage detail keeps repeated loads separate and resolves baselines within the same workload', () => {
  const row = { sloTargets: { p95Ttft: 500, p99Tpot: 90 }, stageResults: [
    { id: 1, load: 8, inputTokens: 512, throughput: 800, ttft: 490, completed: 80, requests: 100, elapsed: 0, duration: 20, slo: { p99Tpot: 35 },
      request_errored: 5, request_incomplete: 15 },
    { id: 2, load: 4, inputTokens: 512, throughput: 400, ttft: 450, requests: 100, completed: 100, elapsed: 20, duration: 30, slo: { p99Tpot: 25 } },
    { id: 3, load: 8, inputTokens: 512, throughput: 790, ttft: 510, completed: 60, elapsed: 50, duration: 30 },
    { id: 4, load: 16, inputTokens: 1024, throughput: 1000, ttft: 400, completed: 2000 },
  ] };
  const report = benchmarkStageInspection(row);
  assert.deepEqual(report.points.map(point => [point.sequence, point.load, point.meetsSlo]), [
    [1,8,true], [2,4,true], [3,8,false], [4,16,null],
  ]);
  assert.equal(report.recommended.id, 2);
  assert.equal(report.peak, null);
  assert.equal(report.outputPeak.id, 4);
  assert.deepEqual(report.points[0].range, { from: 0, to: 20 });
  assert.equal(report.points[0].requestRate, 4);
  assert.equal(report.points[0].failureCount, 5);
  assert.equal(report.points[0].incompleteCount, 15);
  assert.equal(report.points[2].failureCount, null);
  assert.equal(report.points[2].incompleteCount, null);
  const results = benchmarkListMeasurements({status:'已完成',stageResults:[row.stageResults[0]]});
  assert.equal(results.failed,5);
  assert.equal(results.incomplete,15);
  assert.equal(report.points[2].limits[1].pass, null);
  assert.equal(report.points[3].range, null);
  assert.equal(report.points[3].lowSample, false);
  assert.equal(benchmarkComparisonPoint(report.points, report.points[2], 'adjacent')?.id, 2);
  assert.equal(benchmarkComparisonPoint(report.points, report.points[1], 'previous')?.id, 1);
  assert.equal(benchmarkComparisonPoint(report.points, report.points[2], 'custom', 1)?.id, 1);
  assert.equal(benchmarkComparisonPoint(report.points, report.points[2], 'custom', 4), undefined);
});

test('recommendation chooses the highest passing load in manual stages regardless of execution order', () => {
  const row = saveAlignedBenchmark([], records, draft({ sloTargets: { p95Ttft: 1000 }, loadPattern: '手工分阶段',
    stagePlans: [{ load: 8, requests: 300 }, { load: 4, duration: 40 }] }))[0];
  const completed = completeAlignedBenchmark(row, startedAt);
  assert.equal(completed.benchmarkRecommendedLoad, 8);
  assert.equal(benchmarkStageInspection({ ...row, ...completed }).recommended.load, 8);
});

test('stores an immutable point-in-time execution environment, excluding unassigned inventory and route guesswork', () => {
  const device = { id: 'gpu-0', clusterId: deployment.clusterId, nodeId: 'worker-1', name: 'NVIDIA H20', index: 0,
    vendor: 'NVIDIA', driver: '570.0', runtime: 'CUDA 12', vram: 96, utilization: 71 };
  const node = { id: 'worker-1', clusterId: deployment.clusterId, name: 'node one', os: 'Linux', cpuCores: 96, memoryGiB: 768 };
  const configured = { ...deployment, replicas: 1, readyReplicas: 1, placement: '指定 GPU', placementTargets: [device.id] };
  const pd = { ...grouped, placement: '指定节点', placementTargets: [node.id] };
  const source = { ...records, deployments: [configured, pd], 'ops-nodes': [node],
    'ops-gpus': [device, { ...device, id: 'gpu-unassigned', index: 1 }] };
  const stage = saveAlignedBenchmark([], source, draft(), undefined, startedAt)[0].environment;
  assert.equal(stage.capturedAt, startedAt.toISOString());
  assert.equal(stage.workers[0].name, 'node one');
  assert.equal(stage.workers[0].main, true);
  assert.deepEqual(stage.workers[0].devices.map(gpu => [gpu.id, gpu.driver]), [['gpu-0','570.0']]);
  assert.equal(stage.workers[0].devices[0].utilization, undefined);
  node.name = 'node renamed';
  device.driver = 'new driver';
  assert.equal(stage.workers[0].name, 'node one');
  assert.equal(stage.workers[0].devices[0].driver, '570.0');
  const pdStage = saveAlignedBenchmark([], source, draft({ targetSelection: grouped.id }), undefined, startedAt)[0].environment;
  assert.deepEqual(pdStage.members.map(member => member.role), ['prefill','decode','router']);
  assert.equal(pdStage.workers.length, 1);
  assert.equal(pdStage.workers[0].devices.length, 0);
  const routeStage = saveAlignedBenchmark([], source, draft({ targetMode: '路由', targetSelection: route.id }), undefined, startedAt)[0].environment;
  assert.deepEqual(routeStage.workers, []);
  assert.deepEqual(routeStage.members, []);
});
