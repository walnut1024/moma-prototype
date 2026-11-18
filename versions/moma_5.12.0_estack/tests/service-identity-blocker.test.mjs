import assert from 'node:assert/strict';
import test from 'node:test';
import { serviceIdentityBlockingMessage } from '../src/admin-v2/service-identity-blocker.mjs';

const model = (callsEnabled, listingStage, parentCalls = true) => ({ callsEnabled: parentCalls, serviceProviders: [{ providerId: 'provider-a', channelId: 'channel-a', callsEnabled, listingStage }] });

test('stopped gray service only asks to withdraw, not stop again', () => {
  assert.equal(serviceIdentityBlockingMessage(model(false, 'gray'), 'channel-a'), '当前服务已停止，仍处于灰度上架状态。请先下架，再修改模型调用标识。');
});
test('formal listing and running service each explain their own blocker', () => {
  assert.equal(serviceIdentityBlockingMessage(model(false, 'formal'), 'channel-a'), '当前服务已停止，仍处于正式上架状态。请先下架，再修改模型调用标识。');
  assert.equal(serviceIdentityBlockingMessage(model(true, 'withdrawn'), 'channel-a'), '当前服务尚未停止，已下架。请先停止服务，再修改模型调用标识。');
  assert.equal(serviceIdentityBlockingMessage(model(true, 'gray'), 'channel-a'), '当前服务尚未停止，仍处于灰度上架状态。请先停止服务并下架，再修改模型调用标识。');
});
test('never-listed service is not described as withdrawn', () => {
  assert.equal(serviceIdentityBlockingMessage(model(true, 'unlisted'), 'channel-a'), '当前服务尚未停止，未上架。请先停止服务，再修改模型调用标识。');
});
test('stopped parent does not imply the channel stop requirement is satisfied', () => {
  for (const value of [true, undefined]) assert.equal(serviceIdentityBlockingMessage(model(value, 'unlisted', false), 'channel-a'), '当前服务已停止调用，但该渠道仍保留启用配置，未上架。请先停止该渠道服务，再修改模型调用标识。');
});
test('unified service and satisfied blockers keep existing lifecycle semantics', () => {
  assert.equal(serviceIdentityBlockingMessage({ callsEnabled: true, listingStatus: '未上架' }), '当前服务尚未停止，未上架。请先停止服务，再修改模型调用标识。');
  assert.equal(serviceIdentityBlockingMessage({ callsEnabled: false, listingStatus: '已上架', releaseStage: 'gray' }), '当前服务已停止，仍处于灰度上架状态。请先下架，再修改模型调用标识。');
  assert.equal(serviceIdentityBlockingMessage(model(false, 'withdrawn'), 'channel-a'), '');
  assert.equal(serviceIdentityBlockingMessage(model(false, 'unlisted'), 'channel-a'), '');
});
