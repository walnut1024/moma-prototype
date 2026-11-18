import test from 'node:test';
import assert from 'node:assert/strict';
import { MODEL_ORDER_BILLING_TYPES, MODEL_ORDER_BILLING_LABELS } from '../src/model-order-display.mjs';

test('customer order tabs rename display text without changing stored billing classifications',()=>{
  assert.deepEqual(MODEL_ORDER_BILLING_LABELS,{payg:'按量计费',plan:'套餐订阅',coding:'资源包'});
  assert.deepEqual(MODEL_ORDER_BILLING_TYPES,{payg:'按Token用量计费',plan:'Token Plan订阅',coding:'Coding Plan订阅'});
  assert.deepEqual(Object.keys(MODEL_ORDER_BILLING_LABELS),Object.keys(MODEL_ORDER_BILLING_TYPES));
});
