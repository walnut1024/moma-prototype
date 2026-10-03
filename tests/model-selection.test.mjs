import assert from 'node:assert/strict';
import { test } from 'node:test';
import { filterModels, chooseModel } from '../src/model-selection.mjs';

const models = Array.from({ length: 120 }, (_, index) => ({
  name: `${index % 2 ? 'Qwen' : 'ZHIPU'}/Model-${index}`,
  type: index % 3 ? 'text' : 'multimodal',
  subscribed: index % 4 !== 0,
  billing: index % 5 ? '按量计费' : 'Token Plan',
}));

test('large catalog defaults to subscribed, and filters compose without losing unavailable discovery', () => {
  assert.equal(filterModels(models).length, 90);
  assert.equal(filterModels(models, { subscribedOnly: false }).length, 120);
  const result = filterModels(models, { query: ' qwen/model- ', provider: 'Qwen', category: '多模态', billing: 'Token Plan' });
  assert.deepEqual(result.map(model => model.name), ['Qwen/Model-15', 'Qwen/Model-45', 'Qwen/Model-75', 'Qwen/Model-105']);
  assert.deepEqual(filterModels(models, { query: 'does-not-exist' }), []);
  assert.equal(filterModels(models, { provider: 'ZHIPU', subscribedOnly: false }).length, 60);
});

test('unavailable models cannot be selected; multi-selection supports replacing at max and disabling apply below min', () => {
  assert.deepEqual(chooseModel(['Qwen/Model-1'], models[0], false, 1), ['Qwen/Model-1']);
  assert.deepEqual(chooseModel(['Qwen/Model-1'], models[3], false, 1), ['Qwen/Model-3']);
  const selected = ['Qwen/Model-1', 'Qwen/Model-3', 'Qwen/Model-5'];
  assert.deepEqual(chooseModel(selected, models[7], true, 3), selected);
  const removed = chooseModel(selected, models[3], true, 3);
  assert.deepEqual(chooseModel(removed, models[7], true, 3), ['Qwen/Model-1', 'Qwen/Model-5', 'Qwen/Model-7']);
  assert.deepEqual(chooseModel(['Qwen/Model-1'], models[1], true, 3), []);
});
