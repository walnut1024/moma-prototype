import { withAdminSession } from './admin-session-fixture.mjs';
import { MOMA_BILLING_ITEMS } from '../src/admin-v2/moma-billing-items.js';
import test from 'node:test';
import assert from 'node:assert/strict';
import { createAdminSeed as baseCreateAdminSeed, commitAdminState, parseAdminState as baseParseAdminState } from '../src/admin-v2/store.js';
import { tariffDictionarySeed, tariffDictionaryEntries, tariffDictionaryId, tariffOptions, tariffScenarioUnit } from '../src/admin-v2/tariff-dictionary.js';
import { tariffMeteringDetails } from '../src/admin-v2/tariff-metering.js';


test('dictionary IDs are stable compact UUIDs without truncation or changes to stored references', async () => {
  const state = createAdminSeed(), before = JSON.stringify(state);
  // Expected UUIDv5 independently checked with Python uuid.NAMESPACE_URL.
  assert.equal(await tariffDictionaryId('tariff-scenario-1'), 'VHU_FVhoVLWOwg4zhhRmVQ');
  const entries = tariffDictionaryEntries(state), ids = await Promise.all(entries.map(item => tariffDictionaryId(item.id)));
  assert.equal(new Set(ids).size, entries.length);
  for (const id of ids) {
    assert.match(id, /^[A-Za-z0-9_-]{22}$/);
    const bytes = Buffer.from(id, 'base64url');
    assert.equal(bytes.length, 16);
    assert.equal(bytes[6] >> 4, 5);
    assert.equal(bytes[8] >> 6, 2);
  }
  assert.deepEqual(await Promise.all(tariffDictionaryEntries(parseAdminState(before)).map(item => tariffDictionaryId(item.id))), ids);
  assert.equal(JSON.stringify(state), before);
});

test('removed generic scenarios stay absent after restoring old records without changing saved prices', () => {
  const names = ['长视频生成', '输入', '输出', '缓存读取', '缓存写入', '图像生成', '视频生成', '语音识别', '语音合成', '向量生成', '重排'];
  const state = createAdminSeed();
  state.tariffDictionary = names.map((name, index) => ({ id: `tariff-scenario-${index + 1}`, kind: 'scenario', name, builtin: index !== 0, status: '已启用' }));
  const before = JSON.stringify(state), restored = parseAdminState(before);
  const choices = tariffOptions(restored, 'scenario');
  assert.ok(names.every(name => !choices.includes(name)));
  assert.ok(['输入 Token', '输出 Token', '缓存写入 Token（5 分钟）', '视频输出时长'].every(name => choices.includes(name)));
  assert.equal(tariffDictionaryEntries(restored).filter(item => item.kind === 'scenario').length, 25 + MOMA_BILLING_ITEMS.length);
  assert.equal(JSON.stringify(restored), before);
});

test('built-in billing quantities have stable IDs, descriptions and valid unit links', () => {
  const state = createAdminSeed(), items = state.tariffDictionary.filter(item => item.kind === 'scenario');
  assert.equal(items.length, 25 + MOMA_BILLING_ITEMS.length);
  assert.equal(new Set(items.map(item => item.id)).size, 25 + MOMA_BILLING_ITEMS.length);
  assert.equal(new Set(items.map(item => item.name)).size, 25 + MOMA_BILLING_ITEMS.length);
  for (const item of items) {
    assert.ok(item.description && item.englishName);
    assert.ok(state.tariffDictionary.some(unit => unit.kind === 'unit' && unit.id === item.unitId && unit.status === '已启用'));
    if (item.name.includes('Token')) assert.equal(tariffScenarioUnit(state, item.name), '百万 Token');
  }
  assert.equal(items.find(item => item.id === 'tariff-scenario-1').name, '输入 Token');
  assert.equal(items.find(item => item.id === 'tariff-scenario-11').name, '缓存写入 Token（5 分钟）');
  assert.equal(items.find(item => item.id === 'tariff-scenario-12').name, '缓存写入 Token（1 小时）');
});

test('the price selectors use only built-in entries and retain past custom data on reload', () => {
  const seeded = createAdminSeed();
  const old = structuredClone(seeded);
  old.tariffDictionary.push(
    { id: 'saved-unit', kind: 'unit', name: '自定义单位', status: '已启用', builtin: false },
    { id: 'saved-item', kind: 'scenario', name: '自定义计费项', builtin: false },
    { id: 'saved-currency', kind: 'currency', name: '自定义货币', code: 'XUA', status: '已启用', builtin: false },
  );
  const restored = parseAdminState(JSON.stringify(old));
  assert.deepEqual(tariffDictionaryEntries(restored), tariffDictionarySeed());
  for (const kind of ['scenario', 'unit', 'currency']) assert.deepEqual(tariffOptions(restored, kind), tariffOptions(seeded, kind));
  assert.deepEqual(restored.tariffDictionary, old.tariffDictionary);
  assert.deepEqual(restored.modelSalePrices, old.modelSalePrices);
});

test('read-only metering details cover the built-in dictionary without writing back to saved records', () => {
  const state = createAdminSeed(), before = JSON.stringify(state);
  const restored = parseAdminState(before);
  const entries = tariffDictionaryEntries(restored);
  const details = (kind, name) => tariffMeteringDetails(entries.find(row => row.kind === kind && row.name === name));
  for (const row of entries.filter(entry => entry.kind === 'scenario')) {
    const { usageMetric, meteringRule } = tariffMeteringDetails(row);
    assert.ok(usageMetric && meteringRule, row.name);
  }
  assert.match(details('scenario', '输入 Token').meteringRule, /包含单独计费的缓存命中.*已排除缓存命中/);
  assert.equal(details('scenario', '缓存读取 Token').usageMetric, '缓存命中 Token 数');
  assert.equal(details('scenario', '缓存写入 Token（5 分钟）').usageMetric, '缓存写入 Token 数');
  assert.match(details('scenario', '图像输入（按张）（每次第 6–9 张，最多 9 张）').meteringRule, /第 6–9 张/);
  assert.notEqual(details('scenario', '视频输入时长').usageMetric, details('scenario', '视频输出时长').usageMetric);
  assert.deepEqual(Object.fromEntries(entries.filter(row => row.kind === 'unit').map(row => [row.name, tariffMeteringDetails(row)])), {
    '百万 Token': { baseUnit: 'Token', multiplier: 1_000_000 },
    '张': { baseUnit: '张', multiplier: 1 },
    '秒': { baseUnit: '秒', multiplier: 1 },
    '分钟': { baseUnit: '秒', multiplier: 60 },
    '万字符': { baseUnit: '字符', multiplier: 10_000 },
    '千次': { baseUnit: '次', multiplier: 1_000 },
    '千 TPM·月': { baseUnit: 'TPM·月', multiplier: 1_000 },
    '包': { baseUnit: '包', multiplier: 1 },
  });
  assert.equal(tariffMeteringDetails({ kind: 'unit', name: '未知单位' }), undefined);
  assert.equal(tariffMeteringDetails({ kind: 'scenario', name: '未知计费项（按秒）' }), undefined);
  assert.equal(JSON.stringify(restored), before);
});

test('dictionary mutations are rejected without changing saved dictionaries', () => {
  const state = createAdminSeed(), before = JSON.stringify(state);
  for (const kind of ['scenario', 'unit', 'currency']) {
    for (const operation of ['save', 'delete', 'status']) {
      assert.throws(() => commitAdminState(state, { type: 'modelOperations', operation: 'tariffDictionary',
        data: { operation, kind, id: operation === 'save' ? undefined : state.tariffDictionary.find(item => item.kind === kind).id } }), /仅提供内置项/);
    }
  }
  assert.throws(() => commitAdminState(state, { type: 'add', collection: 'tariffDictionary', record: { id: 'fake', builtin: true } }), /仅提供内置项/);
  assert.equal(JSON.stringify(state), before);
});

function createAdminSeed(...args) { return withAdminSession(baseCreateAdminSeed(...args)); }
function parseAdminState(...args) { return withAdminSession(baseParseAdminState(...args)); }
