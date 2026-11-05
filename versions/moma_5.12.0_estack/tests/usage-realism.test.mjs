import test from 'node:test';
import assert from 'node:assert/strict';
import { createAdminSeed, parseAdminState, serializeAdminState } from '../src/admin-v2/store.js';
import { usageFacts, usagePreset, usageBuckets } from '../src/admin-v2/usage-analysis.js';
import { usageDistributions, usageShare } from '../src/admin-v2/usage-distributions.js';

const now = Date.parse('2026-10-28T15:30:00+08:00');
const filters = { types: null, tenant: null, model: null };
const fixture = t => {
  t.mock.method(Date, 'now', () => now);
  const state = createAdminSeed();
  return { ...state, requests: state.requests.filter(row => row.id.startsWith('usage-demo-')) };
};

test('request traffic has office-hour peaks, quieter nights and distinct customer sizes', t => {
  const state = fixture(t), facts = usageFacts(state, usagePreset('yesterday', now), filters, now);
  const hours = usageBuckets(facts.current, [], facts.window).map(row => row.calls);
  assert.ok(new Set(hours).size >= 10, `hourly calls are too repetitive: ${hours}`);
  assert.ok(hours.slice(9, 18).reduce((a, b) => a + b, 0) / 9 > 2 * hours.slice(0, 6).reduce((a, b) => a + b, 0) / 6);
  assert.ok(usageDistributions(facts.current).customers.filter(row => row.value > 0).length >= 3);
  const tokenRows = facts.current.filter(row => row.unit === 'Token');
  const mean = tokenRows.reduce((sum, row) => sum + row.value.total, 0) / tokenRows.length;
  assert.ok(mean > 500 && mean < 20000, `implausible average Token count: ${mean}`);
  const segments = usageDistributions(facts.current);
  assert.ok(segments.tokens.filter(row => row.value > 0).length >= 5);
  assert.ok(segments.tokens.at(-1).value / segments.tokenCalls < 0.08);
});

test('all charts reconcile with the same complete, attributed request facts', t => {
  const state = fixture(t), facts = usageFacts(state, usagePreset('yesterday', now), filters, now);
  assert.equal(new Set(state.requests.map(row => row.requestId)).size, state.requests.length);
  for (const row of state.requests) {
    assert.ok(Date.parse(row.createdAt) < now);
    const endpoint = state.endpoints.find(item => item.id === row.endpointId);
    const project = state.projects.find(item => item.id === row.projectId);
    const key = state.apiKeys.find(item => item.id === row.keyId);
    assert.ok(endpoint?.modelIds.includes(row.modelId));
    assert.equal(project?.tenantId, row.tenantId);
    assert.equal(key?.projectId, row.projectId);
    assert.ok(key?.modelIds.includes(row.modelId));
  }
  const expectedToken = facts.current.filter(row => row.unit === 'Token').reduce((sum, row) => sum + row.value.total, 0);
  assert.equal(usageShare(facts.current, 'modelId', 'total').total, expectedToken);
  assert.equal(usageShare(facts.current, 'providerId', 'calls').total, facts.current.length);
  const distribution = usageDistributions(facts.current);
  assert.equal(distribution.tokens.reduce((sum, row) => sum + row.value, 0), distribution.tokenCalls);
});

test('derived history is stable within an hour and never expands persisted business records', t => {
  const state = fixture(t), before = JSON.stringify(state.requests.filter(row => Date.parse(row.createdAt) < Date.parse('2026-10-28T15:00:00+08:00')));
  t.mock.method(Date, 'now', () => now + 60000);
  const next = createAdminSeed().requests.filter(row => row.id.startsWith('usage-demo-') && Date.parse(row.createdAt) < Date.parse('2026-10-28T15:00:00+08:00'));
  assert.equal(JSON.stringify(next), before);
  t.mock.method(Date, 'now', () => now + 86400000);
  const yesterday = row => row.createdAt >= '2026-10-26T16:00:00.000Z' && row.createdAt < '2026-10-27T16:00:00.000Z';
  assert.deepEqual(createAdminSeed().requests.filter(row => row.id.startsWith('usage-demo-') && yesterday(row)), state.requests.filter(yesterday));
  const raw = serializeAdminState(state);
  assert.equal(JSON.parse(raw).requests.length, 0);
  assert.ok(raw.length < 1_000_000);
  assert.ok(parseAdminState(raw).requests.length > 3000);
});

test('user keys and edits never acquire or reassign initial synthetic request history',t=>{
 const state=fixture(t),before=state.requests;
 const template=state.apiKeys.find(row=>row.status==='有效');
 state.apiKeys.unshift({...template,id:'user-key',keyId:'user-key'});
 state.apiKeys.find(row=>row.id===template.id).status='停用';
 const loaded=parseAdminState(serializeAdminState(state));
 assert.deepEqual(loaded.requests,before);
 assert.equal(loaded.requests.some(row=>row.keyId==='user-key'),false);
 loaded.apiKeys=loaded.apiKeys.filter(row=>row.id!==template.id);
 const removed=parseAdminState(serializeAdminState(loaded));
 assert.equal(removed.requests.some(row=>row.keyId===template.id),false);
 assert.equal(removed.requests.some(row=>row.keyId==='user-key'),false);
});
