import assert from 'node:assert/strict';
import test from 'node:test';
import { startLocalBackend } from '../database/local-runtime.js';
import { initializeInferenceDemo } from '../database/inference-demo.js';
import { loadModelWorkspace } from '../server/model-repository.js';
import { deploymentInstances } from '../src/admin-v2/deployments.js';
import { deploymentPlaygroundTargets } from '../src/admin-v2/deployment-playground.js';
import { createInferenceDemoState } from '../src/admin-v2/inference-demo-data.js';
import { infrastructurePages } from '../src/admin-v2/infrastructure-state.js';
import { deviceDeployments, workerDeployments } from '../src/admin-v2/ops-resources.js';

test('the isolated inference demo links deployments, physical placement, repository files, caches and routes', async t => {
  const { db, runtime } = await startLocalBackend({ demo: true, presets: true, inferenceDemo: true });
  t.after(() => runtime.dispose());
  const reference = await db.prepare('SELECT reference_json, application_revision FROM model_workspace WHERE id=1').first();
  const data = JSON.parse(reference.reference_json);
  const actor = { id: 'admin-001', role: '平台管理员' };
  const workspace = await loadModelWorkspace(db, actor, { simulation: false });
  const state = { ...workspace, ...data, currentRole: actor.role };
  const infrastructure = Object.fromEntries(Object.entries(infrastructurePages).map(([id, page]) => [id, page.seed]));
  const records = { ...infrastructure, deployments: data.deployments };
  const instances = deploymentInstances(data.deployments, infrastructure);
  const findDeployment = id => data.deployments.find(row => row.id === id);
  assert.deepEqual(instances.map(row => row.state).reduce((count, state) =>
    ({ ...count, [state]: (count[state] || 0) + 1 }), {}), { running: 7, pending: 2, starting: 1, error: 1 });

  const deepseek = instances.find(row => row.id === 'deployment-ds:3');
  assert.equal(deepseek.workerId, 'worker-nj-a-02');
  assert.equal(deepseek.devices.length, 4);
  assert.equal(deepseek.allocatedVram, 328);
  assert.deepEqual(workerDeployments(infrastructure['ops-nodes'].find(row => row.id === deepseek.workerId), records)
    .filter(row => row.id === 'deployment-ds').map(row => row.id), ['deployment-ds']);
  assert(deviceDeployments(deepseek.devices[0], records).some(row => row.id === 'deployment-ds'));
  const recreated = deploymentInstances([{ ...deepseek.deployment, instanceGeneration: 1 }], infrastructure);
  assert.equal(recreated[2].workerId, undefined);

  const usedGpus = instances.flatMap(row => row.devices.map(device => device.id));
  assert.equal(new Set(usedGpus).size, usedGpus.length);
  for (const id of ['deployment-glm', 'deployment-bge-nj-online']) {
    const deployment = findDeployment(id);
    const file = infrastructure['ops-model-files'].find(row => row.id === deployment.modelFileId);
    assert.equal(file.workerId, deployment.placementTargets[0]);
    assert.equal(file.clusterId, deployment.clusterId);
    assert.equal(file.modelId, deployment.modelId);
  }
  const loading = findDeployment('deployment-qwen-06b-smoke');
  const loadingFile = infrastructure['ops-model-files'].find(row => row.id === 'file-qwen3-06b-nj');
  assert.equal(loadingFile.repository, loading.repository);
  assert.equal(loadingFile.mountPath, loading.weightPath);
  assert.equal(loadingFile.workerId, instances.find(row => row.deployment.id === loading.id).workerId);
  for (const id of ['deployment-ds', 'deployment-glm', 'deployment-bge-nj-online']) {
    const targets = deploymentPlaygroundTargets(state, id);
    assert.equal(targets.length, 1);
    assert.match(workspace.endpoints.find(row => row.id === targets[0].endpointId).baseUrl, /^https:\/\/inference\.demo\.invalid\//);
  }
  assert.equal(deploymentPlaygroundTargets(state, 'deployment-bge-nj-online')[0].mode, 'embedding');
  assert.equal(findDeployment('deployment-glm').kvCache.service.id, 'cache-suzhou-glm');
  for (const benchmark of infrastructure['ops-benchmarks'].filter(row => ['bench-ds-throughput-nj', 'bench-glm-latency-sz'].includes(row.id))) {
    const target = instances.find(row => row.id === benchmark.targetSelection);
    assert(target && target.state === 'running' && benchmark.targetName.includes(target.name));
  }
  await initializeInferenceDemo(db);
  assert.equal(await db.prepare('SELECT application_revision FROM model_workspace WHERE id=1').first('application_revision'), reference.application_revision);
});

test('the model inference demo cannot be seeded into a persistent workspace', async () => {
  await assert.rejects(startLocalBackend({ demo: true, presets: true, inferenceDemo: true, persistPath: 'existing-workspace' }), /独立内存工作区/);
});

test('the browser demo builds isolated repeatable deployment, instance log and Playground records', () => {
  const now = Date.parse('2026-11-27T02:00:00Z');
  const state = { ...createInferenceDemoState(now), currentRole: '运维人员' };
  const instances = deploymentInstances(state.deployments);
  assert.equal(state.deployments.length, 6);
  assert.equal(instances.length, 11);
  for (const [stateName, log] of [['starting', /权重下载进度 47%/], ['error', /可用显存不足/]]) {
    const instance = instances.find(row => row.state === stateName);
    const events = instance.deployment.events;
    assert(events.every(event => event.instanceId === instance.id && Date.parse(event.at) <= now));
    assert(events.some(event => log.test(event.message)));
  }
  const ready = state.deployments.filter(row => row.status === '运行中');
  assert.deepEqual(ready.map(row => deploymentPlaygroundTargets(state, row.id).map(target => target.mode)),
    [['chat'], ['chat'], ['embedding']]);
  assert(state.endpoints.every(endpoint => new URL(endpoint.baseUrl).hostname === 'inference.demo.invalid'));
  const next = createInferenceDemoState(now);
  assert.deepEqual(next, createInferenceDemoState(now));
  state.deployments[0].demoInstances[0].gpuIds.length = 0;
  assert.equal(next.deployments[0].demoInstances[0].gpuIds.length, 4);
});
