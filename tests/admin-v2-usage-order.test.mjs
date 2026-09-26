import { test } from 'node:test';
import assert from 'node:assert/strict';
import { defaultCardOrder, moveCard, normalizeCardOrder } from '../src/admin-v2/usage-card-order.js';

test('图表顺序仅在同组内移动，并修复旧存储中的缺失或未知卡片', () => {
  const saved = normalizeCardOrder({ rankings: ['usage-model-call-rank', 'unknown', 'usage-model-call-rank'] });
  assert.deepEqual(saved.rankings, [defaultCardOrder.rankings[3], ...defaultCardOrder.rankings.slice(0, 3)]);
  assert.deepEqual(saved.categories, defaultCardOrder.categories);
  const moved = moveCard(saved, 'rankings', 'usage-model-call-rank', 'usage-model-token-rank');
  assert.deepEqual(moved.rankings, ['usage-customer-token-rank', 'usage-model-token-rank', 'usage-model-call-rank', 'usage-customer-call-rank']);
  assert.deepEqual(moved.categories, defaultCardOrder.categories);
  assert.equal(moveCard(moved, 'rankings', 'usage-token-trend', 'usage-model-token-rank'), moved);
});
