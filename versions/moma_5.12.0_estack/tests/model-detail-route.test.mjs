import test from 'node:test';
import assert from 'node:assert/strict';
import { readModelDetail, modelDetailLocation } from '../src/model-detail-route.mjs';

test('detail URL round-trips stable model and provider-service identities without model-name guessing', () => {
  const row = { modelKey: '模型&a', id: 'provider:模型&a:p2' };
  const path = modelDetailLocation('https://local.test/moma_5.12.0_estack/?page=experience&task=text&service=old&keep=1', row);
  const url = new URL(path, 'https://local.test');
  assert.deepEqual(readModelDetail(url.search), row);
  assert.equal(url.searchParams.get('keep'), '1');
  assert.equal(url.searchParams.has('task'), false);
  assert.equal(modelDetailLocation(url.href), '/moma_5.12.0_estack/?keep=1');
});

test('missing details remain an explicit unavailable route; other pages do not accidentally open details', () => {
  assert.deepEqual(readModelDetail('?page=model-detail'), { modelKey: '', id: '' });
  assert.equal(readModelDetail('?page=experience&service=provider:x:y'), null);
  assert.equal(readModelDetail('?page=api-keys'), null);
});
