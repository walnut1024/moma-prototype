import assert from "node:assert/strict";
import test from "node:test";
import { canMutate, commitAdminState, createAdminSeed, parseAdminState } from "../src/admin-v2/store.js";

test("admin v2 seed has stable linked entities, 200 enterprise keys and personal keys", () => {
  const state = createAdminSeed();
  assert.equal(state.apiKeys.filter(key => key.id.startsWith("key-")).length, 200);
  assert.equal(new Set(state.apiKeys.map(key => key.keyId)).size, state.apiKeys.length);
  assert.ok(state.apiKeys.every(key => state.projects.some(project => project.id === key.projectId && project.tenantId === key.tenantId)));
  assert.ok(state.endpoints.every(endpoint => endpoint.modelIds.every(id => state.models.some(model => model.id === id))));
});

test("admin v2 mutations are atomic, audited and reject duplicate ids", () => {
  const state = createAdminSeed();
  const next = commitAdminState(state, { type: "add", collection: "tenants", record: { id: "tenant-new", name: "新租户", status: "正常" } });
  assert.equal(next.tenants.length, state.tenants.length + 1);
  assert.equal(next.audits[0].objectId, "tenant-new");
  assert.throws(() => commitAdminState(next, { type: "add", collection: "tenants", record: { id: "tenant-new" } }), /已存在/);
  assert.equal(parseAdminState(JSON.stringify(next)).revision, next.revision);
  assert.throws(() => parseAdminState('{"version":2}'), /不兼容/);
});

test("deployment allocation updates deployment and cluster atomically", () => {
  const state = createAdminSeed(), cluster = state.clusters[0], before = cluster.allocatedGpu;
  const next = commitAdminState(state, { type: "batch", objectId: "deploy-test", changes: [{ type: "add", collection: "deployments", record: { id: "deployment-test", deploymentId: "deploy-test", clusterId: cluster.id, replicas: 2, gpuPerReplica: 2, status: "部署中" } }, { type: "update", collection: "clusters", id: cluster.id, changes: { allocatedGpu: before + 4 } }] });
  assert.equal(next.deployments[0].deploymentId, "deploy-test");
  assert.equal(next.clusters.find(item => item.id === cluster.id).allocatedGpu, before + 4);
  assert.equal(state.clusters.find(item => item.id === cluster.id).allocatedGpu, before);
  assert.equal(next.audits[0].objectId, "deploy-test");
});

test("admin v2 seed covers operations, commerce and system entities", () => {
  const seed = createAdminSeed();
  for (const key of ["requests", "alerts", "incidents", "products", "prices", "orders", "bills", "settlements", "adjustments", "admins", "approvals", "integrations"]) assert.ok(seed[key].length, `${key} should have demo data`);
  assert.equal(Object.hasOwn(seed, "securityPolicies"), false);
  assert.equal(Object.hasOwn(seed, "securityEvents"), false);
  const next = commitAdminState(seed, { type: "setSettings", objectId: "settings", changes: { retentionDays: 30 } });
  assert.equal(next.settings.retentionDays, 30);
  assert.equal(next.audits[0].objectId, "settings");
});

test("role permissions reject direct writes outside the role domain", () => {
  const seed = createAdminSeed();
  assert.equal(canMutate("财务人员", { type: "update", collection: "bills" }), true);
  assert.equal(canMutate("财务人员", { type: "update", collection: "deployments" }), false);
  assert.throws(() => commitAdminState({ ...seed, currentRole: "只读观察员" }, { type: "update", collection: "apiKeys", id: "key-001", changes: { status: "停用" } }), /无权/);
});

test("removing governance does not erase saved browser records or audits", () => {
  const saved = { ...createAdminSeed(), securityPolicies: [{ id: "saved-policy", name: "saved" }], securityEvents: [{ id: "saved-event" }], audits: [{ id: "saved-audit" }] };
  const restored = parseAdminState(JSON.stringify(saved));
  assert.deepEqual(restored.securityPolicies, saved.securityPolicies);
  assert.deepEqual(restored.securityEvents, saved.securityEvents);
  assert.deepEqual(restored.audits, saved.audits);
  assert.equal(canMutate("安全管理员", { type: "update", collection: "securityPolicies" }), false);
  assert.equal(canMutate("安全管理员", { type: "update", collection: "apiKeys" }), true);
});
