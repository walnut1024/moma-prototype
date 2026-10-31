import test from 'node:test';
import assert from 'node:assert/strict';
import { clearServiceSessionReference, consumeServiceSessionDraft, leaveServiceForSupply, readServiceSessionDraft, saveServiceSessionDraft, serviceSupplyNavigation } from '../src/admin-v2/service-session-drafts.js';

const setup = () => {
  const rows = new Map(), storage = { getItem: key => rows.get(key) ?? null, setItem: (key, value) => rows.set(key, value), removeItem: key => rows.delete(key) };
  return { rows, storage, state: { currentRole: '运营人员' }, model: { id: 'service-model', updatedAt: '2026-10-31T00:00:00Z', serviceMode: 'standard', serviceModeRevision: 2 } };
};
const paramsFor = (id, kind) => new URLSearchParams({ serviceSession: id, serviceSessionKind: kind });

test('consuming a return removes only its exact session reference while retaining the service location',()=>{
 const origin='#/admin-2/listing?model=service-model&panel=routing&serviceSession=return-1&serviceSessionKind=route&q=keep';
 assert.equal(clearServiceSessionReference(origin,'return-1'),'#/admin-2/listing?model=service-model&panel=routing&q=keep');
 assert.equal(clearServiceSessionReference(origin,'another-return'),origin);
});

test('supply return keeps exact selected IDs and filters through an explicit session reference without auto submission', () => {
  const env = setup(), values = { selected: ['["supplier-a","catalogue-a","mapping-a"]'], query: 'Vendor / model', providerId: 'supplier-a', catalogueId: 'catalogue-a', expectedUpdatedAt: env.model.updatedAt, apiKey: 'must-not-persist' };
  const id = saveServiceSessionDraft(env.state, env.model, { kind: 'unified-association', values }, env.storage);
  const navigation = serviceSupplyNavigation('#/admin-2/listing?model=service-model&panel=associate&q=search', id, 'unified-association', { providerId: 'supplier-a', endpointId: 'endpoint-a' });
  assert.deepEqual(navigation.options, { base: 'providers', saved: true }); assert.equal(navigation.patch.resource, 'endpoint-a');
  const origin = new URLSearchParams(navigation.patch.origin.split('?')[1]);
  assert.equal(origin.get('panel'), 'associate'); assert.equal(origin.get('q'), 'search'); assert.equal(origin.get('serviceSession'), id);
  const restored = readServiceSessionDraft(env.state, env.model, origin, { kind: 'unified-association' }, env.storage);
  assert.equal(restored.error, ''); assert.deepEqual(restored.values.selected, values.selected); assert.equal(restored.values.query, values.query);
  assert.equal('confirmed' in restored.values, false); assert.equal([...env.rows.values()].join('').includes('must-not-persist'), false);
});

test('a new entry, another model, another scope or a consumed return never restores an old draft', () => {
  const env = setup(), id = saveServiceSessionDraft(env.state, env.model, { kind: 'provider-association', scope: 'supplier-a', values: { providerId: 'supplier-a', catalogueId: 'catalogue-a', selected: ['mapping-a'] } }, env.storage);
  assert.equal(readServiceSessionDraft(env.state, env.model, new URLSearchParams(), { kind: 'provider-association', scope: 'supplier-a' }, env.storage), null);
  assert.equal(readServiceSessionDraft(env.state, { ...env.model, id: 'other-model' }, paramsFor(id, 'provider-association'), { kind: 'provider-association', scope: 'supplier-a' }, env.storage), null);
  assert.equal(readServiceSessionDraft(env.state, env.model, paramsFor(id, 'provider-association'), { kind: 'provider-association', scope: 'supplier-b' }, env.storage), null);
  consumeServiceSessionDraft(id, env.storage);
  assert.equal(readServiceSessionDraft(env.state, env.model, paramsFor(id, 'provider-association'), { kind: 'provider-association', scope: 'supplier-a' }, env.storage), null);
});

test('role, model revision and route revision changes retain input with a conflict instead of silently rebasing', () => {
  const env = setup(), kind = 'unified-association', id = saveServiceSessionDraft(env.state, env.model, { kind, values: { selected: ['mapping-a'], query: 'preserve' }, sourceVersion: 3 }, env.storage);
  const read = (state, model, sourceVersion = 3) => readServiceSessionDraft(state, model, paramsFor(id, kind), { kind, sourceVersion }, env.storage);
  assert.match(read({ currentRole: '平台管理员' }, env.model).error, /角色已变化/);
  assert.match(read(env.state, { ...env.model, updatedAt: '2026-11-01' }).error, /版本已变化/);
  assert.match(read(env.state, env.model, 4).error, /版本已变化/);
  assert.deepEqual(read(env.state, env.model, 4).values.selected, ['mapping-a']);
});

test('unsaved route inputs preserve weights, group order, allowed IDs and the participant cancel baseline', () => {
  const env = setup(), config = { strategy: 'priority_weighted', groups: [{ id: 'P2', name: 'Primary', strategy: 'weighted' }, { id: 'P1', name: 'Backup', strategy: 'weighted' }], channels: [{ supplyId: 'supply-a', enabled: true, groupId: 'P2', weight: '33.', priority: 2 }, { supplyId: 'supply-b', enabled: false, groupId: 'P1', weight: 0, priority: 1 }], autoFailover: false, advanced: { timeoutSeconds: '45', costBasis: 'input', authorization: 'private' }, headers: { authorization: 'private' } };
  const id = saveServiceSessionDraft(env.state, env.model, { kind: 'route', scope: 'standard:service-model', sourceVersion: 7, values: { config, baseline: config, expectedVersion: 7, dirty: true, query: 'supply-a', participantGroup: 'P2', participants: { config, dirty: false } } }, env.storage);
  const restored = readServiceSessionDraft(env.state, env.model, paramsFor(id, 'route'), { kind: 'route', scope: 'standard:service-model', sourceVersion: 7 }, env.storage);
  assert.deepEqual(restored.values.config.channels, config.channels); assert.deepEqual(restored.values.config.groups, config.groups);
  assert.equal(restored.values.config.autoFailover, false); assert.equal(restored.values.config.channels[0].weight, '33.');
  assert.equal(restored.values.participants.dirty, false); assert.deepEqual(restored.values.participants.config.channels, config.channels);
  assert.equal([...env.rows.values()].join('').includes('private'), false);
});

test('expired and malformed session snapshots do not destroy current input or require a business write', t => {
  const env = setup(); let now = Date.now(); t.mock.method(Date, 'now', () => now);
  const id = saveServiceSessionDraft(env.state, env.model, { kind: 'unified-association', values: { selected: ['mapping-a'] } }, env.storage);
  now += 25 * 60 * 60 * 1000;
  const expired = readServiceSessionDraft(env.state, env.model, paramsFor(id, 'unified-association'), { kind: 'unified-association' }, env.storage);
  assert.match(expired.error, /超过24小时/); assert.deepEqual(expired.values.selected, ['mapping-a']);
  env.rows.set([...env.rows.keys()][0], '{bad-json');
  const invalid = readServiceSessionDraft(env.state, env.model, paramsFor(id, 'unified-association'), { kind: 'unified-association' }, env.storage);
  assert.equal(invalid.values, null); assert.match(invalid.error, /仍可继续操作/);
});

test('unavailable session storage cannot crash an ordinary new service entry or navigate away with lost input', t => {
  const descriptor = Object.getOwnPropertyDescriptor(globalThis, 'sessionStorage');
  Object.defineProperty(globalThis, 'sessionStorage', { configurable: true, get: () => { throw new Error('storage blocked'); } });
  t.after(() => descriptor ? Object.defineProperty(globalThis, 'sessionStorage', descriptor) : delete globalThis.sessionStorage);
  const env = setup(); assert.equal(readServiceSessionDraft(env.state, env.model, new URLSearchParams(), { kind: 'route' }), null);
  let navigated = false, message = '';
  const ops = { go: () => { navigated = true; }, setError: value => { message = value; } };
  assert.equal(leaveServiceForSupply(env.state, env.model, ops, { kind: 'unified-association', values: { selected: ['mapping-a'] } }, { providerId: 'supplier-a', endpointId: 'endpoint-a' }), false);
  assert.equal(navigated, false); assert.match(message, /当前输入保留/);
  assert.throws(() => serviceSupplyNavigation('https://elsewhere.invalid', 'id', 'route', { providerId: 'supplier-a' }), /返回位置无效/);
});
