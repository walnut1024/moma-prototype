import { withAdminSession } from './admin-session-fixture.mjs';
import { MOMA_BILLING_ITEMS } from '../src/admin-v2/moma-billing-items.js';
import test from 'node:test';
import assert from 'node:assert/strict';
import { createAdminSeed as baseCreateAdminSeed, commitAdminState, parseAdminState as baseParseAdminState, persistModelAction } from '../src/admin-v2/store.js';
import { tariffDictionarySeed, tariffDictionaryEntries, tariffDictionaryId, tariffOptions, normalizeTariffName, normalizeCurrency, tariffScenarioUnit, tariffDictionaryTransaction } from '../src/admin-v2/tariff-dictionary.js';
import { normalizeCataloguePrice } from '../src/admin-v2/provider-catalogue-pricing.js';

const action = data => ({ type: 'modelOperations', operation: 'tariffDictionary', data: data.operation === 'save' ? { englishName: 'Custom item', unitId: 'tariff-unit-1', ...data } : data });
const save = (state, data) => commitAdminState(state, action({ operation: 'save', ...data }));
const status = (state, id, value) => commitAdminState(state, action({ operation: 'status', id, status: value }));
const remove = (state, id) => commitAdminState(state, action({ operation: 'delete', id }));
const find = (state, name) => state.tariffDictionary.find(item => item.name === name);
const quoteAction = (name, unit, currency = 'CNY') => ({ type: 'modelOperations', operation: 'provider', data: { operation: 'cataloguePrice', objectId: 'provider-moma', values: { modelId: 'ZHIPU/GLM-5.1', discountFactor: '0.8', scenarios: [{ name, unit, currency, listPrice: '0' }] } } });

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

test('automatically generated custom IDs survive editing, status changes and reload', async () => {
  let state = save(createAdminSeed(), { kind: 'unit', name: '小时' });
  const id = find(state, '小时').id, compactId = await tariffDictionaryId(id);
  state = save(state, { kind: 'scenario', name: '定制输入时长', unitId: id });
  const scene = find(state, '定制输入时长'), sceneId = await tariffDictionaryId(scene.id);
  state = save(state, { id, name: '计费小时' });
  state = status(state, id, '已停用');
  state = parseAdminState(JSON.stringify(state));
  assert.equal(await tariffDictionaryId(find(state, '计费小时').id), compactId);
  assert.equal(await tariffDictionaryId(find(state, '定制输入时长').id), sceneId);
  assert.equal(find(state, '定制输入时长').unitId, undefined);
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
  for (const name of names) assert.throws(() => save(restored, { kind: 'scenario', name }), /旧计费项已移除/);
});

test('shared choices restore without resetting custom edits, disabled items or empty dictionaries', () => {
  const state = createAdminSeed();
  assert.deepEqual(tariffDictionaryEntries(state), tariffDictionarySeed());
  assert.ok(tariffOptions(state, 'scenario').includes('输入 Token'));
  const existing = structuredClone(state); delete existing.tariffDictionary;
  const restored = parseAdminState(JSON.stringify(existing));
  assert.deepEqual(restored.tariffDictionary, []);
  assert.deepEqual(restored.providers, existing.providers);
  let edited = save(state, { kind: 'unit', name: '小时' });
  const id = find(edited, '小时').id;
  edited = save(status(edited, id, '已停用'), { id, name: '计费小时' });
  assert.deepEqual(parseAdminState(JSON.stringify(edited)).tariffDictionary, edited.tariffDictionary);
  assert.deepEqual(parseAdminState(JSON.stringify({ ...state, tariffDictionary: [] })).tariffDictionary, []);
});

test('custom additions persist and share choices without rewriting business data', () => {
  const initial = createAdminSeed(), before = JSON.stringify(initial);
  let saved = before;
  const storage = { getItem: () => saved, setItem: (_, value) => { saved = value; } };
  let state = persistModelAction(initial, action({ operation: 'save', kind: 'scenario', name: ' 高清图像生成 ' }), storage);
  state = persistModelAction(state, action({ operation: 'save', kind: 'unit', name: '小时' }), storage);
  state = parseAdminState(saved);
  assert.ok(tariffOptions(state, 'scenario').includes('高清图像生成'));
  assert.ok(tariffOptions(state, 'unit').includes('小时'));
  assert.equal(state.tariffDictionary.filter(item => !item.builtin).length, 2);
  for (const key of ['providers', 'endpoints', 'modelSupplies', 'supplyPrices', 'modelSalePrices', 'apiKeys']) assert.deepEqual(state[key], initial[key]);
  assert.equal(JSON.stringify(initial), before);
});

test('referenced dictionary names cannot change; disabling preserves snapshots and saved quote editing', () => {
  let state = save(createAdminSeed(), { kind: 'unit', name: '千 Token' });
  const unitId = find(state, '千 Token').id;
  state = save(state, { kind: 'scenario', name: '定制输入 Token', unitId });
  const id = find(state, '定制输入 Token').id, price = quoteAction('定制输入 Token', '千 Token');
  state = commitAdminState(state, price);
  const providers = structuredClone(state.providers);
  assert.throws(()=>save(state,{id,name:'定制标准输入',unitId}),/价格或草稿引用/);
  assert.throws(()=>save(state,{id:unitId,name:'千个 Token'}),/价格或草稿引用/);
  assert.throws(()=>status(state, id, '已停用'),/计费项不设/);
  state = status(state, unitId, '已停用');
  assert.ok(tariffOptions(state, 'scenario').includes('定制输入 Token'));
  assert.deepEqual(state.providers, providers);
  assert.deepEqual(commitAdminState(state, price).providers.find(item => item.id === 'provider-moma').catalogPricing, providers.find(item => item.id === 'provider-moma').catalogPricing);
  state = status(state, unitId, '已启用');
  assert.ok(tariffOptions(state, 'unit').includes('千 Token'));
  assert.equal(normalizeCataloguePrice({ modelId: 'm', discountFactor: '', scenarios: [{ name: '定制规格', unit: '小时', currency: 'CNY', listPrice: '2' }] }).scenarios[0].unit, '小时');
});

test('invalid custom edits and duplicates reject atomically including disabled names and invalid kinds', () => {
  let state = save(createAdminSeed(), { kind: 'scenario', name: '自定义输入' });
  const id = find(state, '自定义输入').id;
  const before = JSON.stringify(state);
  for (const kind of ['wrong', 'constructor', '__proto__']) assert.throws(() => save(state, { kind, name: 'bad' }), /计费项、计价单位或货币/);
  for (const name of ['', 'x'.repeat(81), '输入\n输出']) assert.throws(() => save(state, { kind: 'scenario', name }), /计费项/);
  for (const name of ['', '计量\n单位', 'x'.repeat(41)]) assert.throws(() => save(state, { kind: 'unit', name }), /计价单位/);
  for (const name of [' 自定义输入 ', ' 输入 Token ']) assert.throws(() => save(state, { kind: 'scenario', name }), /已存在/);
  assert.throws(() => save(state, { kind: 'unit', name: '百万 TOKEN' }), /已存在/);
  assert.throws(() => save(state, { id: 'missing', kind: 'scenario', name: '场景' }), /不存在/);
  assert.throws(() => status(state, 'missing', '已启用'), /无效/);
  assert.throws(() => status(state, id, '已删除'), /计费项不设/);
  assert.equal(JSON.stringify(state), before);
  assert.equal(normalizeTariffName('unit', ' 百万  Token '), '百万 Token');
  const full = { ...state, tariffDictionary: [...state.tariffDictionary.filter(item => item.kind !== 'scenario'), ...Array.from({ length: 200 }, (_, i) => ({ id: `limit-${i}`, kind: 'scenario', name: `场景${i}`, status: '已启用' }))] };
  assert.throws(() => save(full, { kind: 'scenario', name: '超出容量' }), /最多维护 200/);
});

test('dictionary saves retain permission, revision and storage protections', () => {
  const state = createAdminSeed(), before = JSON.stringify(state), input = action({ operation: 'save', kind: 'scenario', name: '长文本输入' });
  for (const role of ['运维人员', '只读观察员', '财务人员']) assert.throws(() => commitAdminState({ ...state, currentRole: role }, input), /无权/);
  assert.throws(() => persistModelAction(state, input, { getItem: () => JSON.stringify({ ...state, revision: state.revision + 1 }), setItem: () => assert.fail('must not save') }), /数据已变化/);
  assert.throws(() => persistModelAction(state, input, { getItem: () => before, setItem: () => { throw new Error('quota'); } }), /quota/);
  assert.equal(JSON.stringify(state), before);
});

test('English names and ISO currencies validate while old records remain unchanged', () => {
  const seed = createAdminSeed(), before = JSON.stringify(seed);
  assert.ok(seed.tariffDictionary.every(item => item.englishName));
  assert.deepEqual(tariffOptions(seed, 'currency'), ['CNY', 'USD']);
  let state = save(seed, { kind: 'currency', name: '欧元', englishName: 'Euro', code: 'EUR' });
  const eur = find(state, '欧元');
  assert.equal(find(parseAdminState(JSON.stringify(state)), '欧元').englishName, 'Euro');
  state = status(state, eur.id, '已停用');
  assert.ok(!tariffOptions(state, 'currency').includes('EUR'));
  assert.throws(() => save(state, { kind: 'currency', name: '重复欧元', code: 'EUR' }), /已存在/);
  for (const englishName of ['', '中文', '123', 'Input\nOutput', 'x'.repeat(81)]) assert.throws(() => save(seed, { kind: 'unit', name: '测试', englishName }), /英文名称/);
  for (const code of ['', 'usd', 'ZZZ', 'US', '__proto__']) assert.throws(() => normalizeCurrency(code), /货币代码/);
  const old = structuredClone(seed); old.tariffDictionary = [{ id: 'saved', kind: 'unit', name: '元/小时', status: '已停用', builtin: false }];
  old.providers.find(item => item.id === 'provider-moma').catalogPricing = [{ modelId: 'ZHIPU/GLM-5.1', discountFactor: 0, scenarios: [{ name: '旧输入', unit: '元/小时', listPrice: 0 }] }];
  const loaded = parseAdminState(JSON.stringify(old));
  assert.deepEqual(loaded.tariffDictionary, old.tariffDictionary);
  assert.deepEqual(loaded.providers, old.providers);
  assert.equal(JSON.stringify(seed), before);
});

test('billing items require a name without English, unit or status fields and preserve existing records', () => {
  let state=createAdminSeed();
  const snapshot=JSON.stringify(state);
  assert.ok(tariffDictionaryEntries(state).filter(item=>item.kind==='scenario').every(item=>!Object.hasOwn(item,'status')));
  assert.equal(JSON.stringify(state),snapshot);
  state=commitAdminState(state,{type:'modelOperations',operation:'tariffDictionary',data:{operation:'save',kind:'scenario',name:'定制视频'}});
  const item=find(state,'定制视频');
  assert.equal(item.unitId,undefined);assert.equal(item.status,undefined);assert.equal(item.englishName,undefined);
  state=save(state,{id:item.id,name:'定制视频时长'});
  assert.equal(find(parseAdminState(JSON.stringify(state)),'定制视频时长').id,item.id);
  assert.throws(()=>status(state,item.id,'已停用'),/计费项不设/);
  const old={...state,tariffDictionary:[...state.tariffDictionary,{id:'old-custom',kind:'scenario',name:'旧自定义',englishName:'Old item',status:'已停用',unitId:'tariff-unit-1'}]};
  assert.ok(tariffOptions(old,'scenario').includes('旧自定义'));
  assert.equal(tariffScenarioUnit(old,'旧自定义'),'百万 Token');
  assert.equal(old.tariffDictionary.at(-1).status,'已停用');
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

test('custom billing descriptions persist and invalid text never commits partially', () => {
  const state = save(createAdminSeed(), { kind: 'scenario', name: '定制输入 Token' }), id = find(state, '定制输入 Token').id, before = JSON.stringify(state);
  for (const description of ['x'.repeat(161), '输入\n输出', 123, {}]) assert.throws(() => save(state, { id, name: '定制输入 Token', description }), /计费说明/);
  const changed = save(state, { id, name: '定制输入 Token', description: '  服务商输入计费口径  ' });
  assert.equal(find(parseAdminState(JSON.stringify(changed)), '定制输入 Token').description, '服务商输入计费口径');
  assert.deepEqual(changed.providers, state.providers);
  assert.equal(JSON.stringify(state), before);
});

test('all built-in kinds reject edit, status and deletion even with a forged custom flag', () => {
  const state = createAdminSeed(), before = JSON.stringify(state);
  for (const item of state.tariffDictionary) for (const operation of ['save', 'status', 'delete']) assert.throws(() => tariffDictionaryTransaction(state, { operation, id: item.id, builtin: false, name: 'changed', status: '已停用' }), /内置字典项只读/);
  assert.throws(() => save(state, { id: 'tariff-scenario-1', name: 'changed', builtin: false }), /内置字典项只读/);
  for (const input of [{ type: 'update', collection: 'tariffDictionary', id: 'tariff-unit-1', changes: { name: 'bad' } }, { type: 'batch', changes: [{ type: 'remove', collection: 'tariffDictionary', id: 'tariff-currency-1' }] }, { type: 'add', collection: 'tariffDictionary', record: { id: 'fake', builtin: true } }]) assert.throws(() => commitAdminState(state, input), /须通过字典维护/);
  assert.equal(JSON.stringify(state), before);
});

test('custom deletions persist, block referenced units including disabled items and preserve price snapshots', () => {
  let state = save(createAdminSeed(), { kind: 'unit', name: '小时' });
  const unit = find(state, '小时').id;
  state = save(state, { kind: 'scenario', name: '定制时长', unitId: unit });
  const scene = find(state, '定制时长').id;
  state = save(state, { kind: 'currency', name: '欧元', code: 'EUR' });
  const currency = find(state, '欧元').id;
  state = commitAdminState(state, quoteAction('定制时长', '小时', 'EUR'));
  const providers = structuredClone(state.providers), builtins = state.tariffDictionary.filter(item => item.builtin), before = JSON.stringify(state);
  assert.throws(() => remove(state, unit), /仍被.*引用/);
  assert.equal(JSON.stringify(state), before);
  assert.throws(()=>status(state,scene,'已停用'),/计费项不设/);
  assert.throws(() => remove(state, unit), /仍被.*引用/);
  let saved = JSON.stringify(state);
  const storage = { getItem: () => saved, setItem: (_, next) => { saved = next; } };
  for(const id of [scene,currency])assert.throws(()=>remove(state,id),/仍被.*引用/);
  state=save(state,{kind:'unit',name:'无引用单位'});const unused=find(state,'无引用单位').id;saved=JSON.stringify(state);
  state=persistModelAction(state,action({operation:'delete',id:unused}),storage);
  state = parseAdminState(saved);
  assert.ok([scene,unit,currency].every(id=>state.tariffDictionary.some(item=>item.id===id)));
  assert.equal(state.tariffDictionary.some(item=>item.id===unused),false);
  assert.deepEqual(state.tariffDictionary.filter(item => item.builtin), builtins);
  assert.deepEqual(state.providers, providers);
  assert.ok(state.audits[0].action.startsWith('删除自定义'));
  assert.throws(() => remove(state, unused), /不存在/);
});

test('custom deletion retains role, revision and storage failure protections', () => {
  const state = save(createAdminSeed(), { kind: 'unit', name: '小时' }), id = find(state, '小时').id, before = JSON.stringify(state), input = action({ operation: 'delete', id });
  for (const role of ['运维人员', '只读观察员', '财务人员']) assert.throws(() => commitAdminState({ ...state, currentRole: role }, input), /无权/);
  assert.throws(() => persistModelAction(state, input, { getItem: () => JSON.stringify({ ...state, revision: state.revision + 1 }), setItem: () => assert.fail('must not save') }), /数据已变化/);
  assert.throws(() => persistModelAction(state, input, { getItem: () => before, setItem: () => { throw new Error('quota'); } }), /quota/);
  assert.equal(JSON.stringify(state), before);
});

function createAdminSeed(...args) { return withAdminSession(baseCreateAdminSeed(...args)); }
function parseAdminState(...args) { return withAdminSession(baseParseAdminState(...args)); }
