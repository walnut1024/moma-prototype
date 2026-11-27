import assert from 'node:assert/strict';
import { test } from 'node:test';
import { deploymentCallTimeline, deploymentEndpointCalls, deploymentHardwareTimeline } from '../src/admin-v2/deployment-monitoring.js';
import { deploymentInstances } from '../src/admin-v2/deployments.js';

test('deployment service statistics come only from observed calls attributed to its own endpoint', () => {
  const start = Date.parse('2026-11-25T11:00:00+08:00');
  const request = (id, endpointId, offset, fields = {}) => ({
    id, requestId: id, endpointId, startedAt: new Date(start + offset).toISOString(),
    modelType: 'text', stream: true, usageConfirmed: true, httpStatus: 200, ...fields,
  });
  const calls = deploymentEndpointCalls({ endpointId: 'deployment-endpoint' }, {
    requests: [
      request('a', 'deployment-endpoint', 1000, { durationMs: 10, ttftMs: 0, evidenceSource: 'mock', usage: { input: 18, output: 0 } }),
      request('b', 'deployment-endpoint', 30000, { durationMs: 300, usage: { input: 2, output: 1 } }),
      request('cache', 'deployment-endpoint', 30000, { cacheHit: true, durationMs: 900 }),
      request('unrelated', 'other-endpoint', 1000, { durationMs: 999 }),
      request('outside', 'deployment-endpoint', -1000, { durationMs: 700 }),
      request('recent', 'deployment-endpoint', 180000, { durationMs: 60, stream: false, ttftMs: 99 }),
    ],
  });
  assert.equal(calls.length, 4);
  const report = deploymentCallTimeline(calls, start, start + 300000, ['p50', 'p95']);
  const chart = id => report.charts.find(item => item.key === id);
  assert.equal(report.latest, start + 180000);
  assert.equal(report.stepMinutes, 1);
  assert.deepEqual(report.sourceLabels, ['模拟请求']);
  assert.deepEqual(chart('duration').series.map(line => [line.label, line.values.slice(0, 4)]), [
    ['P50', [10, null, null, 60]], ['P95', [300, null, null, 60]],
  ]);
  assert.deepEqual(chart('ttft').series[0].values.slice(0, 4), [0, null, null, null]);
  assert.deepEqual(chart('tokens').series.map(line => line.values[0]), [20, 1]);
  assert.deepEqual(deploymentCallTimeline(calls, start + 600000, start + 900000, ['p95']), { latest: null, labels: [], charts: [] });
  assert.deepEqual(deploymentEndpointCalls({}, { requests: calls }), []);
});

test('deployment hardware monitoring uses only confirmed placement and deduplicates shared resources', () => {
  const start = Date.parse('2026-11-25T11:00:00+08:00');
  const worker = { id: 'node', name: '节点 1', clusterId: 'cluster', samples: [{ at: start, cpu: 0 }] };
  const gpu = { id: 'gpu', index: 0, nodeId: worker.id, clusterId: worker.clusterId, samples: [{ at: start, utilization: 45 }] };
  const spare = { ...gpu, id: 'spare', index: 1, samples: [{ at: start, utilization: 99 }] };
  const infrastructure = { 'ops-nodes': [worker], 'ops-gpus': [gpu, spare] };
  const deployment = { id: 'deployment', deploymentId: 'qa', clusterId: worker.clusterId, status: '运行中', replicas: 1, readyReplicas: 1,
    placement: '指定 GPU', placementTargets: [gpu.id] };
  const linked = deploymentInstances([deployment], infrastructure);
  const report = deploymentHardwareTimeline([...linked, ...linked], infrastructure, start, start + 300000);
  assert.equal(report.deviceCount, 1);
  assert.equal(report.workerCount, 1);
  assert.equal(report.gpu.latest, start);
  assert.deepEqual(report.gpu.charts[0].series, [{ label: '节点 1 · GPU 0', values: [45] }]);
  assert.deepEqual(report.host.charts[0].series, [{ label: '节点 1', values: [0] }]);
  assert.equal(deploymentHardwareTimeline(linked, infrastructure, start + 1, start + 300000).gpu.latest, null);
  const unassigned = deploymentInstances([{ ...deployment, placement: '自动调度' }], infrastructure);
  assert.equal(deploymentHardwareTimeline(unassigned, infrastructure, start, start + 300000).deviceCount, 0);
});
