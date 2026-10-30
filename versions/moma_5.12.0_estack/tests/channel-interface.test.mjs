import test from 'node:test';
import assert from 'node:assert/strict';
import { CHANNEL_INTERFACES, prepareChannelInterface, suggestChannelRoot, modelTaskUrl } from '../src/admin-v2/channel-interface.js';

const openai = { interfaceType: 'openai', baseUrl: 'https://api.example.com/v1' };

test('presets keep explicitly supplied roots and append only the selected task', () => {
  assert.deepEqual(CHANNEL_INTERFACES.map(row => row.id), ['openai', 'anthropic', 'custom']);
  assert.deepEqual(prepareChannelInterface({ ...openai, baseUrl: `${openai.baseUrl}/` }), { ...openai, protocol: 'OpenAI', addressMode: 'base', taskUrls: {} });
  assert.equal(modelTaskUrl(openai, 'text'), 'https://api.example.com/v1/chat/completions');
  assert.equal(modelTaskUrl(openai, 'multimodal'), 'https://api.example.com/v1/chat/completions');
  assert.equal(modelTaskUrl(openai, 'embedding'), 'https://api.example.com/v1/embeddings');
  assert.equal(modelTaskUrl({ ...openai, baseUrl: 'https://api.example.com/gateway' }, 'text'), 'https://api.example.com/gateway/chat/completions');
  assert.equal(modelTaskUrl({ interfaceType: 'anthropic', baseUrl: 'https://api.example.com/v1/' }, 'text'), 'https://api.example.com/v1/messages');
  assert.throws(() => modelTaskUrl(openai, 'rerank'), /尚不支持/);
  assert.throws(() => modelTaskUrl(openai, 'image'), /尚不支持/);
  assert.throws(() => modelTaskUrl({ interfaceType: 'anthropic', baseUrl: openai.baseUrl }, 'embedding'), /尚不支持/);
});

test('complete standard task URLs require explicit confirmation instead of silent truncation', () => {
  for (const [interfaceType, suffix] of [['openai', '/chat/completions'], ['openai', '/embeddings'], ['anthropic', '/messages']]) {
    const input = { interfaceType, baseUrl: `https://api.example.com/gateway/v1${suffix}/` };
    assert.equal(suggestChannelRoot(input), 'https://api.example.com/gateway/v1');
    assert.throws(() => prepareChannelInterface(input), error => error.code === 'full_task_url' && error.suggestedBaseUrl === 'https://api.example.com/gateway/v1');
  }
  assert.equal(suggestChannelRoot(openai), null);
  assert.throws(() => prepareChannelInterface({ ...openai, taskUrls: { text: 'https://api.example.com/a' } }), /不能覆盖/);
});

test('custom task endpoints retain complete paths and isolate host boundaries', () => {
  const custom = { interfaceType: 'custom', baseUrl: 'https://api.example.com/tasks/chat', taskUrls: { rerank: 'https://api.example.com/tasks/rerank' } };
  assert.equal(prepareChannelInterface(custom).protocol, '其他');
  assert.equal(prepareChannelInterface(custom).addressMode, 'task');
  assert.equal(modelTaskUrl(custom, 'text'), custom.baseUrl);
  assert.equal(modelTaskUrl(custom, 'rerank'), custom.taskUrls.rerank);
  assert.throws(() => prepareChannelInterface({ ...custom, baseUrl: 'https://api.example.com/v1' }), /完整任务/);
  assert.throws(() => prepareChannelInterface({ ...custom, taskUrls: { text: 'https://other.example.com/task' } }), /不同渠道/);
  assert.throws(() => prepareChannelInterface({ ...custom, taskUrls: { text: 'https://api.example.com:8443/task' } }), /不同渠道/);
  assert.throws(() => prepareChannelInterface({ ...custom, taskUrls: { unknown: custom.baseUrl } }), /未支持/);
});

test('address validation rejects credentials, query data, fragments and control characters', () => {
  for (const baseUrl of ['https://user:secret@api.example.com/v1', 'https://api.example.com/v1?key=secret', 'https://api.example.com/v1?', 'https://api.example.com/v1#', 'https://api.example.com/v1\n', 'https://api.example.com/v1/%0A', 'ftp://api.example.com/v1', '//api.example.com/v1', 'https://api.example.com/a b']) assert.throws(() => prepareChannelInterface({ ...openai, baseUrl }));
  assert.throws(() => prepareChannelInterface({ ...openai, interfaceType: 'unknown' }), /接口类型/);
  assert.throws(() => prepareChannelInterface({ ...openai, baseUrl: 'http://localhost:8000/v1' }), /HTTPS/);
  assert.equal(modelTaskUrl({ ...openai, baseUrl: 'http://localhost:8000/v1', allowHttp: true }, 'text'), 'http://localhost:8000/v1/chat/completions');
  assert.throws(() => prepareChannelInterface({ ...openai, baseUrl: `https://api.example.com/${'a'.repeat(2048)}` }), /2048/);
});

test('validation signatures cover interface semantics without invalidating untouched saved connections', async () => {
  const { connectionFingerprint, connectionTestCurrent } = await import('../src/admin-v2/connection-state.js');
  const endpoint = { baseUrl: 'https://api.example.com/v1', protocol: 'OpenAI', credentialRef: 'vault:key', capacity: 10, timeoutSeconds: 30 };
  assert.equal(connectionFingerprint(endpoint), JSON.stringify([endpoint.baseUrl, endpoint.protocol, endpoint.credentialRef, endpoint.capacity, endpoint.timeoutSeconds]));
  const current = { ...endpoint, ...prepareChannelInterface(openai) };
  current.connectionTest = { result: '通过', fingerprint: connectionFingerprint(current) };
  assert.equal(connectionTestCurrent(current), true);
  for (const patch of [{ interfaceType: 'anthropic' }, { addressMode: 'task' }, { taskUrls: { text: 'https://api.example.com/tasks/chat' } }]) assert.equal(connectionTestCurrent({ ...current, ...patch }), false);
  const tasks = { text: 'https://api.example.com/a', embedding: 'https://api.example.com/b' };
  assert.equal(connectionFingerprint({ ...current, taskUrls: tasks }), connectionFingerprint({ ...current, taskUrls: { embedding: tasks.embedding, text: tasks.text } }));
  assert.equal(connectionTestCurrent({ ...current, name: '显示名称变更' }), true);
});
