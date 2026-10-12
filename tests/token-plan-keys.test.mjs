import test from 'node:test';
import assert from 'node:assert/strict';
import { apiKeyOptions } from '../src/api-key-data.mjs';
import { tokenPlanSubscriptions } from '../src/token-plan-data.mjs';
import { apiKeyOptions as versionKeyOptions } from '../versions/moma_5.12.0_estack/src/api-key-data.mjs';
import { tokenPlanSubscriptions as versionSubscriptions } from '../versions/moma_5.12.0_estack/src/token-plan-data.mjs';

for (const [version, keyOptions, subscriptions] of [
  ['5.11.0', apiKeyOptions, tokenPlanSubscriptions],
  ['5.12.0', versionKeyOptions, versionSubscriptions],
]) test(`${version} 同名套餐的重复订阅持有独立 Key，修改一份不影响其他订阅和按量 Key`, () => {
  const [first, second] = subscriptions.filter(plan => plan.name === '办公团队套餐');
  assert.notEqual(first.id, second.id);
  const firstKeys = keyOptions('Token Plan', first);
  const secondKeys = keyOptions('Token Plan', second);
  const paygKeys = keyOptions('按量付费');
  const allKeys = [...firstKeys, ...secondKeys, ...paygKeys];
  assert.equal(new Set(allKeys.map(key => key.id)).size, allKeys.length);
  assert.equal(new Set(allKeys.map(key => key.key)).size, allKeys.length);
  assert.ok(firstKeys.every(key => key.subscriptionId === first.id));
  assert.ok(secondKeys.every(key => key.subscriptionId === second.id));
  firstKeys[0].enabled = false;
  firstKeys[0].name = '订阅独立编辑';
  assert.equal(secondKeys[0].enabled, true);
  assert.equal(paygKeys[0].name, 'test');
  assert.equal(keyOptions('Token Plan', first)[0].name, 'test');
});


test('5.11.0 按量 Key 默认多数不限额度，两个每日限额独立保存', () => {
  const keys = apiKeyOptions('按量付费');
  assert.equal(keys.filter(key => key.quota === null).length, 5);
  const limited = keys.filter(key => key.quota !== null);
  assert.deepEqual(limited.map(key => [key.name, key.quota]), [
    ['生产环境', { type: '日', limit: 10000, used: 3200 }],
    ['测试环境', { type: '日', limit: 5000, used: 1800 }],
  ]);
  limited[0].quota.limit = 20000;
  assert.equal(apiKeyOptions('按量付费').find(key => key.name === '生产环境').quota.limit, 10000);
  assert.equal(apiKeyOptions('Token Plan', tokenPlanSubscriptions[0]).find(key => key.name === '生产环境').quota.limit, 10000);
});
