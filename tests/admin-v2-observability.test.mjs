import test from "node:test";
import assert from "node:assert/strict";
import { groupRequests, percentile, usageTotal } from "../src/admin-v2/observability.js";

test("观测聚合保留独立系列并正确计算用量与分位数", () => {
  const rows = [{ modelId: "a", usage: { input: 2, output: 3 }, durationMs: 10 }, { modelId: "b", usage: { images: 2 }, durationMs: 30 }, { modelId: "a", usage: { input: 4 }, durationMs: 20 }];
  assert.deepEqual(groupRequests(rows, "modelId", ["a", "b"]).map(x => [x.key, x.requests.length]), [["a", 2], ["b", 1]]);
  assert.deepEqual(groupRequests(rows, "modelId", []).map(x => x.key), []);
  assert.deepEqual(groupRequests(rows, "modelId").map(x => x.key), ["a", "b"]);
  assert.equal(usageTotal(rows[0].usage), 5);
  assert.equal(percentile(rows.map(x => x.durationMs), .95), 30);
});
