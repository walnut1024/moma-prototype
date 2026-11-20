
import test from 'node:test';
import assert from 'node:assert/strict';
import { customerFlowSnapshot, flowPercent } from '../src/admin-v2/customer-flow-demo.js';
import { flash, idb } from '../src/admin-v2/customer-analysis-demo.js';

test('initial snapshot reproduces the reference TPM splits at both levels', () => {
  const { edges, calls, tpm } = customerFlowSnapshot(0);
  assert.equal(calls, 41200);
  assert.equal(tpm, 389022400);
  assert.deepEqual(edges.filter(edge => edge.from === 'VIP').map(edge => flowPercent(edge.tpm, edge.total)), ['88.98%', '11.02%']);
  assert.deepEqual(edges.filter(edge => edge.from === 'jinan').map(edge => flowPercent(edge.tpm, edge.total)), ['34.34%', '37.22%', '28.44%']);
});

test('refreshes and model filters derive consistent gateway, cluster, and instance totals', () => {
  assert.notEqual(customerFlowSnapshot(1).tpm, customerFlowSnapshot(0).tpm);
  const sum = nodes => nodes.reduce((total, node) => total + node.tpm, 0);
  for (const model of ['', flash, idb]) {
    for (let frame = 0; frame < 8; frame++) {
      const { clusters, gateways, edges, tpm } = customerFlowSnapshot(frame, model);
      assert.equal(sum(clusters), tpm);
      assert.equal(sum(gateways), tpm);
      assert.equal(sum(edges.filter(edge => edge.from === 'VIP')), tpm);
      assert.ok(edges.every(edge => edge.tpm > 0 && edge.tpm <= edge.total));
      for (const cluster of clusters.filter(cluster => cluster.instances.length)) {
        assert.equal(sum(cluster.instances), cluster.tpm);
      }
      if (model) assert.ok(edges.every(edge => edge.model === model));
    }
  }
  assert.deepEqual(customerFlowSnapshot(0, idb).edges, []);
});
