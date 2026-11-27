import assert from 'node:assert/strict';
import test from 'node:test';
import { applyInferencePracticeAction, changeInferencePracticeInfrastructure, createInferencePractice } from '../src/admin-v2/inference-practice.js';

const role = '运维人员';
const deploymentId = 'deployment-ds';
const clusterId = 'cluster-nj-a';
const deployment = practice => practice.state.deployments.find(row => row.id === deploymentId);
const cluster = practice => practice.state.clusters.find(row => row.id === clusterId);
const lifecycle = (practice, operation, id = deploymentId) =>
  applyInferencePracticeAction(practice, { type: 'deploymentOperation', operation, deploymentId: id });

test('interactive inference practice stops, starts and checks the deployment against an isolated cluster and endpoint', () => {
  const initial = createInferencePractice(role);
  const active = deployment(initial);
  const stopped = lifecycle(initial, 'stop');
  const gpu = active.replicas * active.gpuPerReplica;
  assert.equal(deployment(stopped).status, '停止');
  assert.equal(cluster(stopped).allocatedGpu, cluster(initial).allocatedGpu - gpu);
  assert.equal(stopped.state.endpoints.find(row => row.id === active.endpointId).status, '停用');

  const booting = lifecycle(stopped, 'start');
  const ready = lifecycle(booting, 'check');
  assert.equal(deployment(booting).status, '部署中');
  assert.equal(deployment(ready).readyReplicas, active.replicas);
  assert.equal(cluster(ready).allocatedGpu, cluster(initial).allocatedGpu);
  assert.equal(deployment(initial).status, '运行中');

  const firstCheck = lifecycle(initial, 'check', 'deployment-qwen-06b-smoke');
  const checked = firstCheck.state.deployments.find(row => row.id === 'deployment-qwen-06b-smoke');
  const endpoint = firstCheck.state.endpoints.find(row => row.id === checked.endpointId);
  assert.match(endpoint.baseUrl, /^https:\/\/inference\.demo\.invalid\//);
});

test('interactive inference practice keeps changes after blocked operations and confines writes to demo resources', () => {
  const initial = createInferencePractice(role);
  const stopped = lifecycle(initial, 'stop');
  const maintenance = applyInferencePracticeAction(stopped, {
    type: 'update', collection: 'clusters', id: clusterId, changes: { status: '维护中' },
  });
  assert.throws(() => lifecycle(maintenance, 'start'), /请选择运行中的集群|集群.*运行/);
  assert.equal(deployment(maintenance).status, '停止');
  assert.equal(maintenance.state.revision, stopped.state.revision + 1);
  assert.throws(() => applyInferencePracticeAction(maintenance, {
    type: 'batch', changes: [{ type: 'update', collection: 'clusters', id: clusterId, changes: {} },
      { type: 'add', collection: 'orders', record: { id: 'external' } }],
  }), /演示的范围/);

  const added = changeInferencePracticeInfrastructure(maintenance, 'ops-nodes', rows => [...rows, { id: 'practice-node' }]);
  assert(added.infrastructure['ops-nodes'].some(row => row.id === 'practice-node'));
  assert(!initial.infrastructure['ops-nodes'].some(row => row.id === 'practice-node'));
  assert.throws(() => changeInferencePracticeInfrastructure(added, 'ops-nodes', rows => ({
    rows, related: { 'ops-model-files': [] },
  })), /更新范围/);
  assert.throws(() => lifecycle(createInferencePractice('只读观察员'), 'stop'), /无权/);
  assert.equal(cluster(createInferencePractice(role)).status, cluster(initial).status);
});
