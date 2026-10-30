import test from 'node:test';
import assert from 'node:assert/strict';
import { appendCommonTariffScenarios, tariffDictionarySeed } from '../src/admin-v2/tariff-dictionary.js';
import { sections, pages, pageFromHash, pageWorkspace, canAccessPage } from '../src/admin-v2/navigation.mjs';

const unit = '百万 Token', currency = 'CNY', state = { tariffDictionary: tariffDictionarySeed() };
const blank = { name: '', unit: '', currency, listPrice: '' };

test('batch selection replaces an untouched starter row and adds multiple pending-price rows in dictionary order', () => {
  const rows = [blank], before = structuredClone(rows);
  const next = appendCommonTariffScenarios(rows, ['缓存读取 Token', '输入 Token', '输出 Token', '输入 Token'], state, currency);
  assert.deepEqual(next, ['输入 Token', '输出 Token', '缓存读取 Token'].map(name => ({ name, unit, currency, listPrice: '' })));
  assert.deepEqual(rows, before);
});

test('batch addition skips existing names and preserves their prices and all partially entered drafts', () => {
  const rows = [{ name: '输入 Token', unit, listPrice: '0' }, { name: '', unit, currency, listPrice: '2' }, { name: '', unit: '张', listPrice: '' }];
  const before = structuredClone(rows);
  const next = appendCommonTariffScenarios(rows, ['输入 Token', '输出 Token'], state, currency);
  assert.deepEqual(next.slice(0, 3), before);
  assert.deepEqual(next[3], { name: '输出 Token', unit, currency, listPrice: '' });
  assert.deepEqual(rows, before);
  assert.equal(appendCommonTariffScenarios([{ ...blank, name: ' INPUT ' }], ['input', '输出 Token'], { tariffDictionary: state.tariffDictionary.map(item => item.name === '输入 Token' ? { ...item, name: 'input' } : item) }, currency).length, 2);
});

test('empty, unavailable, duplicate-only and over-capacity selections never partially change drafts', () => {
  const rows = [{ ...blank, name: '输入 Token' }], before = structuredClone(rows);
  assert.throws(() => appendCommonTariffScenarios(rows, [], state, currency), /至少选择/);
  assert.throws(() => appendCommonTariffScenarios(rows, ['已停用'], state, currency), /已变化/);
  assert.throws(() => appendCommonTariffScenarios(rows, ['输入 Token'], state, currency), /均已添加/);
  assert.deepEqual(rows, before);
  const full = Array.from({ length: 100 }, (_, i) => ({ ...blank, name: `已有${i}` })), snapshot = structuredClone(full);
  assert.throws(() => appendCommonTariffScenarios(full, ['输入 Token'], state, currency), /最多配置 100/);
  assert.deepEqual(full, snapshot);
});

test('materials management keeps model-library and tariff routes with normal workspace permissions', () => {
  const models = sections.find(item => item.id === 'models');
  assert.deepEqual(models.items.map(item => item.children[0][0]), ['providers', 'listing', 'model-templates']);
  assert.deepEqual(models.items.find(item => item.id === 'materials').children, [['model-templates', '模型资料库'], ['tariff-dictionary', '计费项']]);
  for (const tab of ['scenario', 'unit', 'currency', 'invalid']) assert.equal(pageFromHash(`#/admin-2/tariff-dictionary?tab=${tab}`, '平台管理员'), 'tariff-dictionary');
  assert.equal(pages['tariff-dictionary'].label, '计费项');
  assert.equal(pageWorkspace('tariff-dictionary'), 'operations');
  for (const id of ['model-templates', 'tariff-dictionary']) {
    assert.equal(pages[id].area, 'materials');
    assert.equal(pages[id].areaLabel, '资料管理');
  }
  assert.equal(canAccessPage('平台管理员', 'tariff-dictionary'), true);
  assert.equal(canAccessPage('运营人员', 'tariff-dictionary'), true);
  for (const role of ['运维人员', '只读观察员', '财务人员']) assert.equal(canAccessPage(role, 'tariff-dictionary'), false);
});

test('batch addition retains a draft with only a changed currency', () => {
  const rows = [{ ...blank, currency: 'USD' }];
  assert.deepEqual(appendCommonTariffScenarios(rows, ['输入 Token'], state, currency), [...rows, { name: '输入 Token', unit, currency, listPrice: '' }]);
});

test('batch rows use each scene unit and leave absent or disabled unit links pending', () => {
  const rows = appendCommonTariffScenarios([blank], ['输入 Token', '图像输出（按张）', '视频输出时长'], state, currency);
  assert.deepEqual(rows.map(item => [item.name, item.unit]), [['输入 Token', '百万 Token'], ['图像输出（按张）', '张'], ['视频输出时长', '秒']]);
  const changed = { tariffDictionary: state.tariffDictionary.map(item => item.id === 'tariff-unit-2' ? { ...item, status: '已停用' } : item.name === '输入 Token' ? { ...item, unitId: undefined } : item) };
  assert.deepEqual(appendCommonTariffScenarios([blank], ['输入 Token', '图像输出（按张）'], changed, currency).map(item => item.unit), ['', '']);
});
