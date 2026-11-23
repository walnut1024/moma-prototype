import assert from 'node:assert/strict';
import test from 'node:test';
import { normalizeChannelRequestRules, previewChannelRequestRules } from '../src/admin-v2/channel-request-rules.js';

const match = (path, mode, value) => ({ path, mode, value });

test('rules run in order, match AND/OR and preserve the original upstream status', () => {
  const rules = { parameters: { operations: [
    { mode: 'set', path: 'temperature', value: 0.2, logic: 'AND', conditions: [match('model', 'prefix', 'kimi/'), match('stream', 'full', true)] },
    { mode: 'delete', path: 'metadata.debug', logic: 'OR', conditions: [match('temperature', 'full', 0.2), match('model', 'full', 'other')] },
    { mode: 'return_error', value: { message: '当前模型不可用', statusCode: 422 }, conditions: [match('metadata.disabled', 'exists')] },
  ] }, headers: { 'X-Workspace': 'ops-demo' }, statusCodes: { 429: 503 } };
  const sample = { model: 'kimi/k3', stream: true, metadata: { debug: true } };
  const result = previewChannelRequestRules(rules, sample, 429);
  assert.deepEqual(result.request, { body: { model: 'kimi/k3', stream: true, metadata: {}, temperature: 0.2 }, headers: { 'x-workspace': 'ops-demo' } });
  assert.deepEqual(result.response, { upstreamStatus: 429, status: 503 });
  assert.deepEqual(result.steps.map(step => step.matched), [true, true, false]);
  assert.equal(sample.metadata.debug, true);
  const error = previewChannelRequestRules(rules, { ...sample, metadata: { disabled: false } });
  assert.equal(error.error.statusCode, 422);
  assert.equal(error.request, null);
});

test('simple JSON and visual rules normalize together and reject protected fields', () => {
  const configured = normalizeChannelRequestRules({ parameters: { temperature: 0.2 } });
  assert.deepEqual(configured.parameters.operations, [{ mode: 'set', path: 'temperature', value: 0.2, logic: 'OR', conditions: [] }]);
  assert.deepEqual(normalizeChannelRequestRules(configured), configured);
  for (const path of ['stream', 'model', 'a.constructor.prototype', 'metadata.api_key']) {
    assert.throws(() => normalizeChannelRequestRules({ parameters: { [path]: 'unsafe' } }), /受保护/);
  }
  assert.throws(() => normalizeChannelRequestRules({ headers: { Authorization: 'example' } }), /非敏感/);
  assert.throws(() => normalizeChannelRequestRules({ headers: { 'X-Workspace': 'Bearer demo-value' } }), /非敏感/);
  assert.throws(() => normalizeChannelRequestRules({ statusCodes: { 429: 200 } }), /400–599/);
  assert.throws(() => previewChannelRequestRules(configured, { authorization: 'sample' }), /占位/);
});

test('request processing filters fields, respects client prompts and rejects incompatible passthrough', () => {
  const rules = { processing: { systemPrompt: '连接提示', promptMode: 'prepend', passHeaders: ['X-Request-ID'],
    removeFields: ['store'], forceOpenAI: true, reasoningToContent: true }, headers: { 'x-workspace': '{{model}}' } };
  const sample = { model: 'kimi/k3', store: true, messages: [{ role: 'system', content: '客户端提示' }] };
  const result = previewChannelRequestRules(rules, sample, 200, { interfaceType: 'openai',
    headers: { 'X-Request-ID': 'client-id', Authorization: 'Bearer dummy' } });
  assert.equal(result.request.body.messages[0].content, '连接提示\n客户端提示');
  assert.equal(Object.hasOwn(result.request.body, 'store'), false);
  assert.deepEqual(result.request.headers, { 'x-request-id': 'client-id', 'x-workspace': 'kimi/k3' });
  assert.match(result.response.sample.choices[0].message.content, /<think>/);
  assert.throws(() => normalizeChannelRequestRules({ processing: { passBody: true, systemPrompt: '冲突' } }, 'openai'), /透传.*冲突/);
  assert.throws(() => normalizeChannelRequestRules({ processing: { responsesWebSocket: true } }, 'openai'), /仅适用于 Responses/);
  assert.throws(() => normalizeChannelRequestRules({ processing: { removeFields: ['store'] } }, 'anthropic'), /当前接口/);
});

test('installed demo plugins preserve configured order and aliases drive subsequent rules', () => {
  const rules = {
    aliases: { 'customer-model': 'upstream-model' },
    plugins: ['strip_client_identifier', 'drop_empty_metadata'],
    parameters: { operations: [{ mode: 'set', path: 'temperature', value: 0.1, conditions: [match('model', 'full', 'upstream-model')] }] },
  };
  const sample = { model: 'customer-model', user: 'demo', metadata: { client_id: 'demo-tenant' } };
  assert.deepEqual(previewChannelRequestRules(rules, sample).request.body, { model: 'upstream-model', temperature: 0.1 });
  assert.deepEqual(previewChannelRequestRules({ ...rules, plugins: [...rules.plugins].reverse() }, sample).request.body,
    { model: 'upstream-model', metadata: {}, temperature: 0.1 });
  assert.throws(() => previewChannelRequestRules({ plugins: ['uninstalled-plugin'] }, sample), /未安装/);
});

test('scoped preview executes global then group then channel and deduplicates across scopes', () => {
  const preview = previewChannelRequestRules({ plugins: ['strip_client_identifier'] },
    { model: 'demo', user: 'sample', metadata: { client_id: 'demo' } }, 200,
    { pluginScopes: { global: ['strip_client_identifier'], group: ['drop_empty_metadata'] } });
  assert.deepEqual(preview.pluginOrder, [
    { id: 'strip_client_identifier', scope: '全局' }, { id: 'drop_empty_metadata', scope: '分组' },
  ]);
  assert.deepEqual(preview.request.body, { model: 'demo' });
  assert.throws(() => previewChannelRequestRules({ processing: { passBody: true } }, { model: 'demo' }, 200,
    { pluginScopes: { global: ['strip_client_identifier'] } }), /样例插件冲突/);
});
