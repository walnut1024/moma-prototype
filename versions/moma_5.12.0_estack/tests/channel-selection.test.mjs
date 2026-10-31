import test from 'node:test';
import assert from 'node:assert/strict';
import { channelRowsPage, channelSelectionId, filterChannelRows, selectChannelRows, redactDiagnostic } from '../src/admin-v2/channel-selection.js';

const row = (index, overrides = {}) => ({
  provider: { id: `provider-${index % 2}`, name: `供应商 ${index % 2}` }, modelId: `model-${index}`, model: { name: `模型 ${index}`, modelId: `model-${index}` },
  association: { id: `mapping-${index}`, endpointId: `channel-${index % 3}`, upstreamModelId: `vendor/model-${index}`, name: `渠道 ${index % 3}`, endpoint: { baseUrl: `https://example.invalid/${index}`, protocol: 'OpenAI' } },
  ...overrides,
});

test('current-page selection is fixed, preserves other pages, and never expands when filter results change', () => {
  const rows = Array.from({ length: 45 }, (_, index) => row(index));
  const firstPage = channelRowsPage(rows, 1, 20), secondPage = channelRowsPage(rows, 2, 20);
  let selected = selectChannelRows([], firstPage.rows, true);
  assert.equal(selected.length, 20);
  assert.equal(selected.some(item => item.associationId === 'mapping-20'), false);
  selected = selectChannelRows(selected, secondPage.rows, true);
  assert.equal(selected.length, 40);
  selected = selectChannelRows(selected, firstPage.rows, false);
  assert.deepEqual(new Set(selected.map(item => item.associationId)), new Set(secondPage.rows.map(item => item.association.id)));
  const before = structuredClone(selected);
  filterChannelRows([...rows, row(46)], 'model');
  assert.deepEqual(selected, before);
  assert.equal(channelRowsPage(rows, 20, 20).page, 3);
  assert.equal(channelRowsPage(rows, 3, 20).rows.length, 5);
});

test('select-all-filtered is explicit, deduplicates exact provider/mapping identities and ignores unconfigured rows', () => {
  const rows = [row(1), row(2), row(3), row(4, { association: null })];
  let selected = selectChannelRows([], filterChannelRows(rows, 'vendor/model-1'), true);
  assert.equal(selected.length, 1);
  selected = selectChannelRows(selected, rows, true);
  assert.equal(selected.length, 3);
  assert.equal(new Set(selected.map(channelSelectionId)).size, 3);
  assert.ok(selected.every(item => item.providerId && item.endpointId && item.associationId && item.expectedFingerprint));
  assert.deepEqual(selectChannelRows(selected, rows, false), []);
});

test('selection snapshots retain the selected fingerprint until the user explicitly selects the changed row again', () => {
  const original = row(5), selected = selectChannelRows([], [original], true), before = structuredClone(selected);
  original.association.endpoint.baseUrl = 'https://changed.invalid/v1';
  assert.deepEqual(selected, before);
  const refreshed = selectChannelRows(selected, [original], true);
  assert.equal(refreshed.length, 1);
  assert.notEqual(refreshed[0].expectedFingerprint, selected[0].expectedFingerprint);
});

test('diagnostic JSON removes nested credentials, inline bearer values and all URL access parameters without modifying records', () => {
  const input = { keyId: 'key-id', authorization: 'Bearer abcdefghijk', response: { api_key: 'private-key', message: 'invalid Bearer hidden-value and sk-secretvalue123', url: 'https://user:password@example.com/path?token=access-value&signed=other-value#access-fragment' }, credentialIds: ['key-id'] };
  const before = structuredClone(input), result = redactDiagnostic(input), serialized = JSON.stringify(result);
  for (const secret of ['abcdefghijk', 'private-key', 'hidden-value', 'sk-secretvalue123', 'password', 'access-value', 'other-value', 'access-fragment']) assert.equal(serialized.includes(secret), false, secret);
  assert.equal(result.keyId, 'key-id'); assert.deepEqual(result.credentialIds, ['key-id']);
  assert.deepEqual(input, before);
});
