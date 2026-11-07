import { test } from 'node:test';
import assert from 'node:assert/strict';
import { supplyPickerGroups, supplyPickerName, supplyPickerSelectionSummary } from '../src/admin-v2/usage-supply-picker.js';

const options = {
  providers: [
    { id: 'p-ds', name: 'DeepSeek', code: 'deepseek' },
    { id: 'p-sf', name: '硅基流动', code: 'siliconflow' },
    { id: 'p-empty', name: '自建服务商', code: 'private' },
  ],
  channels: [
    { id: 'east-id', name: '华东生产', code: 'ds-east', groupId: 'p-ds' },
    { id: 'north-id', name: '华北备用', code: 'ds-north', groupId: 'p-ds' },
    { id: 'sf-id', name: '华东生产', code: 'sf-east', groupId: 'p-sf' },
  ],
};

test('known provider names use one-line bilingual labels without rewriting custom names or records', () => {
  const before = structuredClone(options);
  assert.equal(supplyPickerName(options.providers[0]), '深度求索（DeepSeek）');
  assert.equal(supplyPickerName(options.providers[1]), '硅基流动（SiliconFlow）');
  assert.equal(supplyPickerName({ name: 'SILICONFLOW' }), '硅基流动（SiliconFlow）');
  assert.equal(supplyPickerName({ name: '客户自建 DeepSeek', code: 'deepseek' }), '客户自建 DeepSeek');
  assert.equal(supplyPickerName({ name: 'constructor' }), 'constructor');
  assert.equal(supplyPickerName({ name: '深度求索（DeepSeek）' }), '深度求索（DeepSeek）');
  assert.deepEqual(options, before);
});

test('supplier search exposes every child while channel search keeps matching children under their own supplier', () => {
  const supplier = supplyPickerGroups(options, '深度求索');
  assert.deepEqual(supplier.map(row => row.id), ['p-ds']);
  assert.deepEqual(supplier[0].channels.map(row => row.id), ['east-id', 'north-id']);
  const channel = supplyPickerGroups(options, ' 华东 ');
  assert.deepEqual(channel.map(row => row.id), ['p-ds', 'p-sf']);
  assert.deepEqual(channel[0].channels.map(row => row.id), ['east-id']);
  assert.equal(channel[0].totalChannels, 2);
  assert.deepEqual(supplyPickerGroups(options, 'NORTH-ID')[0].channels.map(row => row.id), ['north-id']);
  assert.deepEqual(supplyPickerGroups(options, 'no-such-channel'), []);
});

test('empty-channel suppliers remain selectable and unfiltered groups retain their order', () => {
  const groups = supplyPickerGroups(options, '');
  assert.deepEqual(groups.map(row => row.id), ['p-ds', 'p-sf', 'p-empty']);
  assert.equal(groups[2].totalChannels, 0);
  assert.deepEqual(groups[2].channels, []);
  assert.equal(supplyPickerGroups(options, 'private')[0].id, 'p-empty');
});

test('selection summary distinguishes whole suppliers and individual channels, deduplicating overlaps', () => {
  assert.equal(supplyPickerSelectionSummary({ providers: [], channels: [] }, options.channels, true), '全部服务商');
  assert.equal(supplyPickerSelectionSummary({ providers: [], channels: [] }, options.channels, false), '未选择服务商或渠道');
  assert.equal(supplyPickerSelectionSummary({ providers: ['p-ds', 'p-ds'], channels: ['east-id', 'sf-id', 'sf-id'] }, options.channels, false), '已选 1 家全部渠道＋1 条渠道');
  assert.equal(supplyPickerSelectionSummary({ providers: [], channels: ['east-id', 'north-id'] }, options.channels, false), '已选 0 家全部渠道＋2 条渠道');
  assert.equal(supplyPickerSelectionSummary({ providers: ['p-empty'], channels: ['historical-id'] }, options.channels, false), '已选 1 家全部渠道＋1 条渠道');
});
