import {test} from 'node:test';
import assert from 'node:assert/strict';
import {normalizeCardOrder,moveCard} from '../src/admin-v2/usage-card-order.js';

test('removed category and ranking cards cannot return from saved layouts while trend order is retained',()=>{
  const saved=normalizeCardOrder({overview:['usage-call-trend','usage-user-share','usage-token-trend'],categories:['usage-text','usage-image'],rankings:['usage-model-call-rank','unknown','usage-model-call-rank']});
  assert.deepEqual(Object.keys(saved),['overview']);
  assert.deepEqual(saved.overview,['usage-call-trend','usage-token-trend','usage-model-share','usage-volume-share','usage-distribution']);
  assert.equal(Object.hasOwn(saved,'rankings'),false);
  const moved=moveCard(saved,'overview','usage-call-trend','usage-token-trend');
  assert.deepEqual(moved.overview,['usage-token-trend','usage-call-trend','usage-model-share','usage-volume-share','usage-distribution']);

  assert.equal(moveCard(moved,'rankings','usage-token-trend','usage-model-call-rank'),moved);
});
