import test from 'node:test';
import assert from 'node:assert/strict';
import { orderedRouteModels, routeModels } from '../src/route-models.mjs';

test('route candidates keep at least 15 distinct Chinese models and follow the chosen sorting rule', () => {
  assert.ok(routeModels.length >= 15);
  assert.equal(new Set(routeModels.map(model => model.name)).size, routeModels.length);
  for (const [strategy, score] of [
    ['效果优先', model => -model.size],
    ['成本优先', model => model.price],
    ['平衡模式', model => -model.size / model.price],
  ]) {
    const ordered = orderedRouteModels(strategy);
    assert.deepEqual(ordered.map(model => model.name).sort(), routeModels.map(model => model.name).sort());
    assert.ok(ordered.every((model, index) => index === 0 || score(ordered[index - 1]) <= score(model)));
  }
});
