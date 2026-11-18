import test from 'node:test';
import assert from 'node:assert/strict';
import { initialModelWorkspace } from '../server/model-repository.js';
import { commitAdminState, parseAdminState } from '../src/admin-v2/store.js';
import { withAdminSession } from './admin-session-fixture.mjs';
import { CAPACITY_METRICS, capacityEntries, channelCapacityDraft, parseChannelCapacityDraft, normalizeChannelCapacity } from '../src/admin-v2/channel-capacity.js';
import { channelFingerprint } from '../src/admin-v2/provider-channels.js';
import { supplierChannelAssociations } from '../src/admin-v2/supplier-resources.js';

const owner = state => state.providers.find(row => row.id === 'provider-moma');
const save = (state, association, limits, expectedCapacityRevision = 0, role) => commitAdminState(state, { type: 'modelOperations', operation: 'channelCapacitySave',
  data: { providerId: owner(state).id, endpointId: association.endpointId, associationId: association.id, expectedCapacityRevision, limits } }, role);
const fixture = () => withAdminSession(initialModelWorkspace());

test('million Token inputs round-trip stored quotas exactly, including fractions and the safe integer boundary', () => {
  const stored = { rpm: 1000, tpm: 2000000, inputTpm: 500000, outputTpm: 1, concurrency: 50 };
  const draft = channelCapacityDraft(stored);
  assert.deepEqual(draft, { rpm: '1000', tpm: '2', inputTpm: '0.5', outputTpm: '0.000001', concurrency: '50' });
  assert.deepEqual(parseChannelCapacityDraft(draft), stored);
  assert.deepEqual(parseChannelCapacityDraft(channelCapacityDraft({ tpm: Number.MAX_SAFE_INTEGER })), { tpm: Number.MAX_SAFE_INTEGER });
  assert.deepEqual(parseChannelCapacityDraft({ rpm: '', tpm: '', inputTpm: null }), {});
  for (const key of ['tpm', 'inputTpm', 'outputTpm']) assert.equal(CAPACITY_METRICS.find(metric => metric.key === key).unit, '百万 Token/分钟');
});

test('million Token input rejects invalid precision, zero and overflow without changing integer metrics', () => {
  for (const raw of ['0', '-1', '0.0000001', '1.1234567', '1e6', '9007199254.740992', true]) assert.throws(() => parseChannelCapacityDraft({ tpm: raw }), /正数/);
  assert.throws(() => parseChannelCapacityDraft({ rpm: '0.5' }), /正整数/);
  assert.throws(() => parseChannelCapacityDraft({ unknown: '1' }), /指标无效/);
});

test('capacity values are separate positive integer metrics; missing values stay unknown', () => {
  assert.deepEqual(normalizeChannelCapacity({ rpm: ' 1000 ', tpm: '', concurrency: '50', rpd: null }), { rpm: 1000, concurrency: 50 });
  assert.deepEqual(capacityEntries({ tpm: 2000000, concurrency: 50 }).map(row => row.key), ['tpm', 'concurrency']);
  assert.deepEqual(normalizeChannelCapacity(Object.fromEntries(CAPACITY_METRICS.map(metric => [metric.key, '1']))), Object.fromEntries(CAPACITY_METRICS.map(metric => [metric.key, 1])));
  for (const raw of [0, -1, 1.5, true, [], {}, '1e3', '1,000', '1.5', 'Infinity', Number.MAX_SAFE_INTEGER + 1]) assert.throws(() => normalizeChannelCapacity({ rpm: raw }), /正整数/);
  for (const raw of [null, [], '1', { unknown: 1 }]) assert.throws(() => normalizeChannelCapacity(raw), /指标无效/);
});

test('each channel persists its capacity without affecting the same model or shared connection', () => {
  const state = fixture(), before = structuredClone(state), [first, second, shared] = owner(state).catalogConnections;
  assert.equal(first.modelId, second.modelId);
  assert.equal(first.endpointId, shared.endpointId);
  const projected = supplierChannelAssociations(state, owner(state), first.endpointId).find(row => row.id === first.id);
  const fingerprint = channelFingerprint(projected);
  const next = save(state, first, { rpm: 1000, tpm: 2000000, concurrency: 50, rpd: 100000, tpd: 2000000000 });
  assert.deepEqual(owner(next).catalogConnections.slice(1), owner(state).catalogConnections.slice(1));
  assert.equal(owner(next).catalogConnections[0].capacityRevision, 1);
  assert.equal(channelFingerprint(supplierChannelAssociations(next, owner(next), first.endpointId).find(row => row.id === first.id)), fingerprint);
  const last = save(next, second, { rpm: 600, tpm: 1000000 });
  assert.equal(owner(last).catalogConnections[0].capacityLimits.rpm, 1000);
  assert.equal(owner(last).catalogConnections[1].capacityLimits.rpm, 600);
  assert.equal(owner(last).catalogConnections[2].capacityLimits, undefined);
  assert.deepEqual(parseAdminState(JSON.stringify(last)).providers.find(row => row.id === owner(last).id).catalogConnections, owner(last).catalogConnections);
  for (const key of ['endpoints', 'models', 'modelSupplies', 'modelSalePrices', 'supplyPrices', 'serviceRoutes']) assert.deepEqual(last[key], state[key], key);
  assert.deepEqual(state, before);
  assert.equal(last.audits[0].action, '保存渠道容量');
});

test('stale, mismatched, deleted and unauthorized channel saves are rejected without writes', () => {
  const state = fixture(), [first] = owner(state).catalogConnections;
  const next = save(state, first, { rpm: 1000 });
  const before = structuredClone(next);
  assert.throws(() => save(next, first, { rpm: 2 }), /已有修订/);
  assert.throws(() => save(next, { ...first, endpointId: owner(state).catalogConnections[1].endpointId }, { rpm: 2 }), /不属于当前模型渠道/);
  assert.throws(() => save(next, { ...first, endpointId: 'missing' }, { rpm: 2 }), /不存在/);
  assert.throws(() => save(next, first, { rpm: 2 }, 1, '财务人员'), /无权/);
  assert.throws(() => save(next, first, { rpm: 2 }, 1, '运维人员'), /无权/);
  assert.throws(() => save(next, first, { tpm: -1 }, 1), /正整数/);
  assert.deepEqual(next, before);
  owner(next).catalogConnections[0].deletedAt = new Date().toISOString();
  assert.throws(() => save(next, first, { rpm: 2 }, 1), /不属于当前模型渠道/);
});

test('clearing configured limits only clears the selected channel', () => {
  const state = fixture(), [first, second] = owner(state).catalogConnections;
  const a = save(state, first, { rpm: 1000, concurrency: 50 });
  const b = save(a, second, { rpm: 600 });
  const cleared = save(b, first, { rpm: '', tpm: null }, 1);
  assert.deepEqual(owner(cleared).catalogConnections[0].capacityLimits, {});
  assert.equal(owner(cleared).catalogConnections[1].capacityLimits.rpm, 600);
  assert.equal(owner(cleared).catalogConnections[0].capacityRevision, 2);
});

test('saving capacity preserves an unrecorded upstream model identifier', () => {
  const state = fixture(), first = owner(state).catalogConnections[0];
  delete first.upstreamModelId;
  const next = save(state, first, { rpm: 1000 });
  const { capacityLimits, capacityRevision, ...unchanged } = owner(next).catalogConnections[0];
  assert.deepEqual(unchanged, first);
  assert.deepEqual(capacityLimits, { rpm: 1000 });
  assert.equal(capacityRevision, 1);
});
