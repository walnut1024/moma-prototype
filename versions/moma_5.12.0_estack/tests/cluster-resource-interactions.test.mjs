import assert from 'node:assert/strict';
import { test } from 'node:test';
import { clusterLabels, finishClusterRegistration, nodeSelectorIssues, validateClusterYaml } from '../src/admin-v2/ops-cluster-domain.js';
import { deploymentInstances } from '../src/admin-v2/deployments.js';
import { defaultTopologyLayers, deviceDeployments, gpuMemoryUtilization, groupResourceModels, hostMemoryUsed, labelMap, labelPairIssues,
  resourceLoad, resourceMetricHistory, resourceObservations, RESOURCE_PAGES, resourceScopeFromParams, resourceTimeRangeIssue, topologyLocation,
  validateTopologyLayers, workerDeployments, workerGpuInventory, workerLabelOptions, workerLabelsMatch } from '../src/admin-v2/ops-resources.js';

test('node and GPU assignments protect a selected node and resolve its actual deployments', () => {
  const node = { id: 'different-node', clusterId: 'cluster-1' };
  const gpu = { id: 'gpu-on-node', nodeId: node.id, clusterId: node.clusterId };
  const deployment = { id: 'deployment', clusterId: node.clusterId, status: '运行中' };
  const nodeTarget = { ...deployment, placement: '指定节点', placementTargets: [node.id] };
  const gpuTarget = { ...deployment, id: 'gpu-deployment', placement: '指定 GPU', placementTargets: [gpu.id] };
  const records = { 'ops-gpus': [gpu], deployments: [nodeTarget, gpuTarget, { ...gpuTarget, clusterId: 'other' }, { ...gpuTarget, retiredAt: 'retired' }] };
  const actions = RESOURCE_PAGES['ops-nodes'];

  assert.deepEqual(workerDeployments(node, records), [nodeTarget, gpuTarget]);
  assert.deepEqual(deviceDeployments(gpu, records), [gpuTarget]);
  assert.match(actions.canDelete(node, records), /先停止/);
  assert.throws(() => actions.batchActions[0].apply([node], records), /先停止/);
  assert.equal(actions.canDelete(node, { ...records, deployments: [{ ...gpuTarget, status: '停止' }] }), undefined);
});

test('active PD role targets block node removal even when replica assignment is unresolved', () => {
  const node = { id: 'node', clusterId: 'cluster' };
  const other = { id: 'unmatched', clusterId: 'cluster' };
  const gpu = { id: 'gpu', nodeId: node.id, clusterId: node.clusterId };
  const roleConfigs = {
    prefill: { placement: '指定 GPU', placementTargets: [gpu.id] },
    decode: { placement: '自动调度', placementTargets: [] },
    router: { placement: '指定节点', placementTargets: [other.id] },
  };
  const deployment = {
    id: 'pd', clusterId: node.clusterId, status: '运行中', replicas: 2, readyReplicas: 1,
    placement: '自动调度', roles: { prefill: 1, decode: 1, router: 0 }, roleConfigs,
  };
  const records = { 'ops-nodes': [node, other], 'ops-gpus': [gpu], deployments: [deployment] };
  const actions = RESOURCE_PAGES['ops-nodes'];
  const [prefill, decode] = deploymentInstances(records.deployments, records);
  assert.deepEqual([prefill.workerId, prefill.devices[0]?.id, decode.workerId], [node.id, gpu.id, undefined]);
  assert.deepEqual(deviceDeployments(gpu, records), [deployment]);
  assert.deepEqual(workerDeployments(node, records), [deployment]);
  assert.match(actions.canDelete(node, records), /先停止/);
  assert.equal(actions.canDelete(other, records), undefined);
  const scaling = { ...deployment, readyReplicas: 0, replicas: 3, roles: { prefill: 2, decode: 1, router: 0 } };
  assert.ok(deploymentInstances([scaling], records).every(instance => !instance.devices.length));
  assert.match(actions.canDelete(node, { ...records, deployments: [scaling] }), /先停止/);
});

test('resource instances group by model identity across deployments and filter only matching rows', () => {
  const instances = [
    { id: 'a1', name: 'main-1', state: 'running', deployment: { id: 'east', modelId: 'model-a', name: '东区' } },
    { id: 'a2', name: 'backup-1', state: 'error', deployment: { id: 'west', modelId: 'model-a', name: '西区' } },
    { id: 'b1', name: 'aux-1', state: 'running', deployment: { id: 'backup', modelId: 'model-b', name: '备用' } },
  ];
  const records = {
    models: [{ id: 'model-a', name: '同名模型' }],
    modelTemplates: [{ id: 'model-a', name: '旧资料名称' }, { id: 'model-b', name: '同名模型' }],
  };
  assert.deepEqual(groupResourceModels(instances, records).map(group => [group.id, group.name, group.instances.map(row => row.id)]), [
    ['model:model-a', '同名模型', ['a1', 'a2']], ['model:model-b', '同名模型', ['b1']],
  ]);
  assert.deepEqual(groupResourceModels(instances, records, { query: ' 同名 ', state: 'error' })[0].instances, [instances[1]]);
  assert.deepEqual(groupResourceModels(instances, records, { query: '西区' })[0].instances, [instances[1]]);
  assert.deepEqual(groupResourceModels(instances, records, { query: 'OLD' }), []);
  assert.equal(groupResourceModels(instances, { deployableModels: records.models })[0].name, '同名模型');
});

test('a fixed resource monitoring range requires both endpoints and accepts only 5 minutes to 7 days in the past', () => {
  const now = Date.parse('2026-11-27T12:00:00+08:00');
  assert.match(resourceTimeRangeIssue(undefined, now, now), /请选择/);
  assert.match(resourceTimeRangeIssue(now, now - 1, now), /晚于开始/);
  assert.match(resourceTimeRangeIssue(now, now + 300000, now), /当前时间/);
  assert.match(resourceTimeRangeIssue(now - 299999, now, now), /至少/);
  assert.match(resourceTimeRangeIssue(now - 604800001, now, now), /最长/);
  assert.equal(resourceTimeRangeIssue(now - 300000, now, now), '');
  assert.equal(resourceTimeRangeIssue(now - 604800000, now, now), '');
});

test('switching a device keeps only a valid time range and only lists its confirmed siblings', () => {
  const end = Date.now() - 600000, start = end - 300000;
  assert.deepEqual(resourceScopeFromParams(new URLSearchParams({ monitorStart: start, monitorEnd: end })), { range: [start, end] });
  assert.deepEqual(resourceScopeFromParams(new URLSearchParams({ monitorStart: end, monitorEnd: start, monitorPeriod: 3600000 })), { period: 3600000 });
  assert.deepEqual(resourceScopeFromParams(new URLSearchParams({ monitorPeriod: 123 })), {});
  const worker = { id: 'worker', clusterId: 'cluster' };
  const first = { id: 'gpu-a', nodeId: worker.id, clusterId: worker.clusterId, index: 0 };
  const second = { ...first, id: 'gpu-b', index: 2 };
  const records = [second, { ...first, clusterId: 'other' }, { ...first, nodeId: 'another' }, first];
  assert.deepEqual(workerGpuInventory(worker, records), [first, second]);
  assert.deepEqual(workerGpuInventory({ id: 'worker' }, [{ nodeId: 'worker' }]), []);
});

test('resource monitoring includes exact historical endpoints, preserves zero and never treats inventory as telemetry', () => {
  const at = Date.parse('2026-11-25T09:20:00+08:00');
  const worker = resourceMetricHistory({ heartbeat: '2026-11-25T10:00:00+08:00', cpu: 99, samples: [
    { at: at + 120000, cpu: 4 }, { at, cpu: 0, ram: 25, memoryGiB: 80 },
    { at: at + 60000, cpu: 3 }, { at: at + 180000, diskGiB: 300 }, { at: 'invalid', cpu: 7 },
  ] });
  const gpu = resourceMetricHistory({ sampledAt: '2026-11-25T09:20:00+08:00', vram: 80, vramAllocated: 20 }, true);
  assert.equal(gpu.size, 0);
  assert.equal(resourceMetricHistory({ sampledAt: '2026-11-25T09:20:00+08:00', utilization: 0 }, true).get(at).utilization, 0);
  assert.equal(resourceMetricHistory({ samples: [], heartbeat: '2026-11-25T09:20:00+08:00', cpu: 90 }).size, 0);
  const source = { label: 'worker', samples: worker };
  const selection = resourceObservations([source], at, at + 60000);
  assert.equal(selection.latest, at + 60000);
  assert.equal(selection.sampleStep, 60000);
  assert.equal(selection.sources[0].samples.get(at).cpu, 0);
  assert.equal(selection.sources[0].samples.get(at).memoryUsedGiB, 20);
  assert.equal(selection.sources[0].samples.has(at + 120000), false);
  assert.equal(resourceObservations([source], at + 180000, at + 3600000).latest, null);
  assert.equal(resourceObservations([source], at, at).sampleStep, null);
  const second = { label: 'gpu', samples: new Map([[at, {}], [at + 120000, {}]]) };
  assert.equal(resourceObservations([source, second], at, at + 120000).irregular, true);
});

test('GPU utilization preserves a zero observation and falls back only when usage is missing', () => {
  assert.equal(gpuMemoryUtilization({ vram: 80, vramUsed: 0, vramAllocated: 50 }), 0);
  assert.equal(gpuMemoryUtilization({ vram: 80, vramUsed: null, vramAllocated: 40 }), 50);
  assert.equal(gpuMemoryUtilization({ vram: 80, vramUsed: null }), null);
});

test('resource aggregates only count measured signals and distinguish zero usage from allocation', () => {
  const nodes = [{ cpu: 0, ram: 45 }, { cpu: 50 }, { cpu: null, ram: 5 }];
  const devices = [{ utilization: 20, vram: 80, vramUsed: 0 }, { vram: 40, vramAllocated: 40, vramUsed: null },
    { utilization: 0, vram: 100, vramUsed: 50 }];
  assert.deepEqual(resourceLoad(nodes, devices), { cpu: 25, ram: 25, gpu: 10, vram: 25 });
  assert.deepEqual(resourceLoad([{}], [{ vram: 80, vramAllocated: 0 }]), { cpu: null, ram: null, gpu: null, vram: null });
  assert.equal(hostMemoryUsed({ memoryGiB: 768, ram: 16 }), 122.9);
  assert.equal(hostMemoryUsed({ memoryUsedGiB: 0, memoryGiB: 768, ram: 16 }), 0);
  assert.equal(hostMemoryUsed({ memoryGiB: 768, ram: null }), null);
});

test('node label rows validate keys and preserve structured values with delimiters', () => {
  const page = RESOURCE_PAGES['ops-nodes'];
  const current = { id: 'worker-a', name: 'worker-a', clusterId: 'cluster-1', ip: '192.0.2.21', labels: 'note=a=b' };
  assert.equal(labelMap(current.labels).get('note'), 'a=b');
  const [valid, duplicate, blank, ambiguous] = labelPairIssues([['note', 'a=b'], [' note ', 'new'], ['', ''], ['site=zone', 'north,east']]);
  assert.deepEqual(valid, { key: '', text: '' });
  assert.match(duplicate.key, /重复/);
  assert.match(blank.text, /标签值/);
  assert.match(ambiguous.key, /等号/);
  assert.equal(page.validate({ labels: [['note', 'x=y']] }, {}, current), undefined);
  const saved = page.save({ labels: [['note', '  x=y,z=b\nnext  ']] }, {}, current);
  assert.equal(labelMap(saved.labels).get('note'), '  x=y,z=b\nnext  ');
  assert.equal(page.searchMatches({ ...current, ...saved }, 'z=b'), true);
  assert.deepEqual(page.save({ labels: [] }, {}, current), { labels: {} });
  assert.deepEqual(page.save({ labels: current.labels }, {}, current), {});
  assert.equal(page.validate({ labels: { unset: '' }, kvTransferNic: 'eth1' }, {}, current), undefined);
});

test('node filters match any value for a given label key and require each distinct key', () => {
  const labels = { pool: 'East', note: 'a=b,y=c', empty: '' };
  assert.equal(workerLabelsMatch(labels, ['pool=West', 'pool=East', 'note=a=b,y=c', 'empty=']), true);
  assert.equal(workerLabelsMatch(labels, ['pool=east', 'note=a=b,y=c']), false);
  assert.equal(workerLabelsMatch(labels, ['pool=East', 'note=a=b']), false);
  assert.equal(workerLabelsMatch('pool=East, env=x=y', ['pool=West', 'pool=East', 'env=x=y']), true);
  assert.deepEqual(workerLabelOptions([{ labels }, { labels: { 'invalid=key': 'a', pool: 'East' } }]).map(item => item.value), [
    'empty=', 'note=a=b,y=c', 'pool=East',
  ]);
});

test('topology maps by priority and keeps discovered labels visible after the written label is cleared', () => {
  const [zone, rack] = defaultTopologyLayers;
  const labels = 'topology.gpustack.ai/zone=north, topology.kubernetes.io/zone=central';
  assert.deepEqual(topologyLocation({ labels }, zone), { value: 'north', key: zone.labelKey, discovered: false });
  assert.equal(topologyLocation({ labels: labels.split(', ')[1] }, zone).value, 'central');
  assert.deepEqual(topologyLocation({ topologyFacts: { [rack.labelKey]: 'rack-a' } }, rack), { value: 'rack-a', key: rack.labelKey, discovered: true });
  const legacy = { id: 'rack', name: '机架', labelKey: 'topology.moma.io/rack' };
  const [normalized] = validateTopologyLayers([legacy]);
  assert.equal(normalized.labelKey, rack.labelKey);
  assert.equal(topologyLocation({ labels: 'topology.moma.io/rack=rack-b' }, normalized).value, 'rack-b');
  assert.throws(() => validateTopologyLayers([rack, zone]), /位于机架/);
  assert.throws(() => validateTopologyLayers([{ ...zone, fallbackLabelKeys: [rack.labelKey] }, rack]), /重复/);
});

test('cluster registration retries completion without creating another browser-side node', async () => {
  const clusters = [{ id: 'cluster-1', status: '待注册' }, { id: 'cluster-2', status: '运行中' }];
  const row = { id: 'already-saved', clusterId: 'cluster-1' };
  const records = { clusters, 'ops-nodes': [row] };
  const commands = [];
  const dispatch = async command => {
    commands.push(command);
    return commands.length > 1 ? { clusters: [{ ...clusters[0], ...command.changes }, clusters[1]] } : undefined;
  };

  await assert.rejects(() => finishClusterRegistration({ row, records, dispatch }), /待|未能确认/);
  assert.equal(await finishClusterRegistration({ row, records, dispatch }), true);
  assert.deepEqual(records['ops-nodes'], [row]);
  assert.equal(await finishClusterRegistration({ row: { clusterId: 'cluster-2' }, records, dispatch }), false);
  assert.equal(commands.length, 2);
  assert.equal(commands[1].id, row.clusterId);
  assert.equal(commands[1].changes.status, '运行中');
});

test('cluster YAML validates shape, provider-specific values and stored credential boundaries', () => {
  assert.doesNotThrow(() => validateClusterYaml('debug: false\nworker_port: 10150\nresources:\n  cpu: 4', 'Docker'));
  assert.doesNotThrow(() => validateClusterYaml('gateway_mode: gateway\nproxy_mode: system', 'Kubernetes'));
  assert.doesNotThrow(() => validateClusterYaml('gpustack-operator:\n  worker:\n    replicas: 2', 'Kubernetes', 'chart'));
  assert.throws(() => validateClusterYaml('gateway_mode: gateway', 'Docker'), /gateway_mode/);
  assert.throws(() => validateClusterYaml('worker_port: 65536', 'Docker'), /worker_port/);
  assert.throws(() => validateClusterYaml('service_port_range: 200-100', 'Docker'), /service_port_range/);
  assert.throws(() => validateClusterYaml('debug: false\ndebug: true', 'Docker'), /第 2 行/);
  assert.throws(() => validateClusterYaml('resources:\n  nested:\n    password: placeholder', 'Docker'), /凭证字段/);
  assert.throws(() => validateClusterYaml('- not-a-mapping', 'Kubernetes', 'chart'), /键值结构/);
  assert.throws(() => validateClusterYaml('worker: {enabled: false}\nimage: {tag: v2}', 'Kubernetes', 'chart'), /image\.tag.*worker\.enabled/);
  assert.throws(() => validateClusterYaml('image: replacement', 'Kubernetes', 'chart'), /image\.repository.*image\.tag/);
  assert.throws(() => validateClusterYaml('gpustack-operator: {worker: null}', 'Kubernetes', 'chart'), /gpustack-operator\.worker\.image/);
  assert.throws(() => validateClusterYaml('imagePullSecret: {create: false}', 'Kubernetes', 'chart'), /imagePullSecret\.create/);
  assert.doesNotThrow(() => validateClusterYaml('worker: {nodeSelector: {accelerator: nvidia}}\nimage: {pullPolicy: IfNotPresent}', 'Kubernetes', 'chart'));
});

test('cloud pool labels and Kubernetes selectors edit keyed rows without delimiting values', () => {
  const savedPoolLabels = { pool: 'region=west,east' };
  assert.equal(clusterLabels(savedPoolLabels), savedPoolLabels);
  assert.deepEqual(clusterLabels([[' pool ', savedPoolLabels.pool], ['stage', 'test=stable']]), {
    pool: 'region=west,east', stage: 'test=stable',
  });
  assert.deepEqual(clusterLabels([]), {});
  assert.throws(() => clusterLabels([['pool', 'first'], ['pool', 'second']]), /重复/);
  assert.throws(() => clusterLabels([['pool', '']]), /标签值/);
  assert.deepEqual(clusterLabels([['topology.kubernetes.io/zone', 'south'], ['accelerated', '']], nodeSelectorIssues), {
    'topology.kubernetes.io/zone': 'south', accelerated: '',
  });
  assert.throws(() => clusterLabels([['Invalid.Prefix/zone', 'south']], nodeSelectorIssues), /Kubernetes 标签键/);
  assert.throws(() => clusterLabels([['zone', 'region=west,east']], nodeSelectorIssues), /Kubernetes 标签值/);
});
