import test from 'node:test';
import assert from 'node:assert/strict';
import { createAdminSeed, parseAdminState } from '../src/admin-v2/store.js';
import { initialModelWorkspace } from '../server/model-repository.js';
import { prepareSupplierReviewCases } from '../src/admin-v2/supplier-review-cases.js';
import { legacySupplierState } from './legacy-supplier-fixture.mjs';

const ids = new Set(['supplier-review-CH-001','supplier-review-CH-002']);
test('fresh local and D1 workspaces and review preparation never recreate the two retired sample channels', () => {
  for (const state of [parseAdminState(null),initialModelWorkspace(),prepareSupplierReviewCases(createAdminSeed())]) {
    assert.ok(state.endpoints.every(row=>!ids.has(row.id)));
    assert.ok(state.providers.every(row=>(row.catalogConnections||[]).every(item=>!ids.has(item.endpointId))));
  }
});
test('removing sample defaults preserves explicitly saved historical or manually edited channels on reload', () => {
  const state=legacySupplierState(),endpoint=state.endpoints.find(row=>ids.has(row.id));
  endpoint.name='手工维护的已有渠道';endpoint.baseUrl='https://manual.example.invalid/v1';
  const before=structuredClone(state),restored=parseAdminState(JSON.stringify(state));
  assert.deepEqual(restored.endpoints.find(row=>row.id===endpoint.id),endpoint);
  assert.deepEqual(state,before);
});
