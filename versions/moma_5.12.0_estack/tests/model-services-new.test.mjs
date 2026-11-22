import assert from 'node:assert/strict';
import test from 'node:test';
import { adminBreadcrumbs } from '../src/admin-v2/breadcrumbs.mjs';
import { adminSections, canAccessPage, pageFromHash } from '../src/admin-v2/navigation.mjs';
import {
  channelSetupIssue, contextRoutingEnabled, readNewServices, saveNewServices, savedServiceModel, serviceModelFields,
  serviceChannelShares, serviceFormIssue, simulatedServiceChannels,
} from '../src/admin-v2/model-services-new.js';

test('the new service catalogue and detail have independent routes', () => {
  const params = new URLSearchParams({ service: 'new-service', tab: 'channels' });
  assert.equal(pageFromHash('#/admin-2/listing-new?' + params), 'listing-new');
  assert.equal(canAccessPage('平台管理员', 'listing-new'), true);
  assert.equal(canAccessPage('运维人员', 'listing-new'), false);
  const visibleServices = adminSections.find(section => section.id === 'models').items.filter(item => item.label === '模型服务');
  assert.deepEqual(visibleServices.map(item => item.id), ['warehouse-new']);
  assert.deepEqual(adminBreadcrumbs('listing-new', params).slice(1), [
    { label: '模型服务', href: '#/admin-2/listing-new' }, { label: '服务详情' },
  ]);
});

test('simulated channel options use the selected model and retain saved choices when registered supply becomes usable', () => {
  const model = { id: 'model-a', modelId: 'glm-5.3' };
  const simulated = simulatedServiceChannels(model, [{ id: 'channel-a', reason: '渠道未启用' }]);
  assert.deepEqual(simulated.map(row => row.name), ['渠道 A', '渠道 B', '备用渠道']);
  assert.ok(simulated.every(row => row.simulated && row.upstreamModelId === 'mock/glm-5.3'));
  assert.notEqual(simulatedServiceChannels({ ...model, id: 'model-b' }, [])[0].id, simulated[0].id);
  const registered = [{ id: 'channel-a', reason: '' }];
  assert.deepEqual(simulatedServiceChannels(model, registered), []);
  assert.deepEqual(simulatedServiceChannels(model, registered, [{ channelId: simulated[1].id }]), [simulated[1]]);
  assert.deepEqual(simulatedServiceChannels(null, []), []);
});

test('context routing filters incompatible channels before grouping by priority and normalizing weights', () => {
  const channels = [
    { id: 'short', enabled: true, priority: 0, weight: 80, context: 32000 },
    { id: 'long', enabled: true, priority: 0, weight: 20, context: 128000 },
    { id: 'backup', enabled: true, priority: 1, weight: 50, context: 256000 },
    { id: 'unavailable', enabled: true, reason: '验证失效', priority: 0, weight: 80, context: 256000 },
    { id: 'disabled', enabled: false, priority: 0, weight: 80, context: 256000 },
  ];
  assert.deepEqual([...serviceChannelShares(channels)], [['short', 0.8], ['long', 0.2]]);
  assert.deepEqual([...serviceChannelShares(channels, 32000)], [['short', 0.8], ['long', 0.2]]);
  assert.deepEqual([...serviceChannelShares(channels, 60000)], [['long', 1]]);
  assert.deepEqual([...serviceChannelShares(channels, 160000)], [['backup', 1]]);
  assert.deepEqual([...serviceChannelShares(channels, 300000)], []);
  assert.equal(channelSetupIssue({ tokenizer: 'test', channels }), '');
  assert.match(channelSetupIssue({ tokenizer: 'test', channels: [{ enabled: true, context: null }] }), /上下文长度/);
});

test('paused context settings remain stored and only enabled channels require lengths on resume', () => {
  const service = { tokenizer: 'test', channels: [{ enabled: true, context: 32000 }, { enabled: false }] };
  const paused = { ...service, contextPaused: true };
  assert.equal(contextRoutingEnabled({ channels: [] }), false);
  assert.equal(contextRoutingEnabled(paused), false);
  assert.equal(channelSetupIssue({ ...paused, channels: [{ enabled: true }] }), '');
  const resumed = { ...paused, contextPaused: false };
  assert.equal(contextRoutingEnabled(resumed), true);
  assert.equal(channelSetupIssue(resumed), '');
  assert.equal(resumed.channels[0].context, 32000);
});

test('local persistence supports simplified services while preserving previous configuration and rejecting a stale save', () => {
  const values = new Map([['old-workspace', 'unchanged']]);
  const storage = { getItem: key => values.get(key), setItem: (key, value) => values.set(key, value) };
  const original = readNewServices(storage);
  const previous = {
    id: 'service-a', callId: 'sample/a', channels: [{ id: 'channel-a', context: 32000 }],
    grants: [{ tenantId: 'tenant-a', level: 'L3' }], limits: { L3: { rpm: 120 } },
    tokenizer: 'test', batch: { mode: 'chat', reserve: 10 },
  };
  saveNewServices(storage, original, [previous]);
  const rows = [{ id: 'service-b', callId: 'sample/b', channels: [] }, previous];
  saveNewServices(storage, readNewServices(storage), rows);
  assert.deepEqual(readNewServices(storage), rows);
  assert.throws(() => saveNewServices(storage, original, []), /其他页面/);
  assert.equal(values.get('old-workspace'), 'unchanged');
  assert.match(serviceFormIssue({ name: 'Service', callId: 'sample/a' }, rows), /已存在/);
});

test('service creation permits an unlinked record and limits new or updated descriptions to 300 characters', () => {
  const draft = { name: '模型服务', callId: 'example/model', description: '字'.repeat(300) };
  const longer = { ...draft, description: draft.description + '字' };
  assert.match(serviceFormIssue({ ...draft, callId: '' }, []), /请填写模型调用标识/);
  assert.equal(serviceFormIssue(draft, []), '');
  assert.match(serviceFormIssue(longer, []), /不能超过 300 字/);
  assert.equal(serviceFormIssue({ ...longer, name: '更名' }, [{ ...longer, id: 'old' }], 'old'), '');
  assert.match(serviceFormIssue({ ...longer, description: longer.description + '字' }, [{ ...longer, id: 'old' }], 'old'), /不能超过 300 字/);
});

test('a saved service uses its own model metadata for details and route previews after the source changes', () => {
  const material = { id: 'record-1', modelId: 'speech', name: '语音参考', type: 'audio',
    profile: { author: '作者', tasks: ['语音合成'] }, capabilities: { context: 32768 } };
  const details = serviceModelFields(material);
  const record = { id: 'service-1', modelId: material.id, type: material.type, modelDetails: details, channels: [], listed: true };
  material.name = '编辑后的参考';
  material.profile.tasks[0] = '语音识别';
  material.capabilities.context = 65536;
  const saved = savedServiceModel(record);
  assert.equal(saved.name, '语音参考');
  assert.deepEqual(saved.profile.tasks, ['语音合成']);
  assert.equal(saved.profile.context, 32768);
  assert.equal(record.listed, true);
});
