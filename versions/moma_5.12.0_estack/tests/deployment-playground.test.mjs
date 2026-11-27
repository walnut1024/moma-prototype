import assert from 'node:assert/strict';
import test from 'node:test';
import { deploymentPlaygroundTargets, orderPlaygroundDocuments, playgroundCodeExample, playgroundPaths,
  playgroundRankProgress, playgroundRequest, playgroundSamples, projectPlaygroundEmbeddings, simulatePlaygroundResponse, splitPlaygroundPaste } from '../src/admin-v2/deployment-playground.js';

const model = { id: 'model-a', type: 'text', name: 'Demo Model', metadata: { max_tokens: 4096 } };
const deployment = { id: 'deployment-a', modelId: model.id, endpointId: 'endpoint-a', status: '运行中', readyReplicas: 1, replicas: 1 };
const endpoint = { id: 'endpoint-a', modelIds: [model.id], status: '运行中' };
const route = { id: 'route-a', routeId: 'demo-model', modelId: model.id, status: '已启用', targets: [{ endpointId: endpoint.id, weight: 100 }] };
const state = { currentRole: '运维人员', models: [model], deployments: [deployment], endpoints: [endpoint], routes: [route] };
const open = overrides => deploymentPlaygroundTargets({ ...state, ...overrides }, deployment.id);

test('deployment Playground requires operations access, serving instances and a running linked endpoint on an enabled route', () => {
  assert.equal(open({})[0].routeName, 'demo-model');
  assert.equal(open({ currentRole: '平台管理员' }).length, 1);
  assert.deepEqual(open({ currentRole: '运营人员' }), []);
  assert.deepEqual(open({ deployments: [{ ...deployment, readyReplicas: 2, replicas: 3, roles: { prefill: 1, decode: 1, router: 1 } }] }), []);
  assert.deepEqual(open({ deployments: [{ ...deployment, retiredAt: 'yesterday' }] }), []);
  assert.deepEqual(open({ endpoints: [{ ...endpoint, status: '停止' }] }), []);
  assert.deepEqual(open({ endpoints: [{ ...endpoint, modelIds: ['other-model'] }] }), []);
  assert.deepEqual(open({ routes: [{ ...route, status: '已停用' }] }), []);
  assert.deepEqual(open({ routes: [{ ...route, targets: [{ endpointId: endpoint.id, weight: 0 }] }] }), []);
  assert.deepEqual(open({ routes: [{ ...route, modelId: 'other-model' }] }), []);
});

test('chat requests use the route identifier and preserve optional parameter and conversation validation', () => {
  const target = open({})[0];
  const history = [{ role: 'user', content: 'Previous input' }, { role: 'assistant', content: 'Previous response' }];
  const request = playgroundRequest(target, { prompt: ' Current input ', system: 'Be concise', parameters: { temperature: 0, top_p: 0.8 } }, history);
  assert.equal(playgroundPaths[target.mode], '/v1/chat/completions');
  assert.deepEqual(request, { model: 'demo-model', messages: [{ role: 'system', content: 'Be concise' }, ...history,
    { role: 'user', content: 'Current input' }], temperature: 0, top_p: 0.8, stream: true, stream_options: { include_usage: true } });
  assert.throws(() => playgroundRequest(target, { prompt: '   ' }), /请输入消息/);
  assert.throws(() => playgroundRequest(target, { prompt: 'hello', parameters: { max_tokens: 4097 } }), /4096/);
  assert.throws(() => playgroundRequest(target, { prompt: 'hello', parameters: { seed: 1.5 } }), /Seed/);
  assert.equal(simulatePlaygroundResponse('chat', request).choices[0].message.role, 'assistant');
});

test('only multimodal chat accepts a local image and embeds it in the native message shape', () => {
  const images = [{ url: 'data:image/png;base64,AAAA' }];
  const target = open({ models: [{ ...model, type: 'multimodal' }] })[0];
  assert.throws(() => playgroundRequest(open({})[0], { images }), /本地图片/);
  assert.throws(() => playgroundRequest(target, { images: [{ url: 'https://example.test/remote.jpg' }] }), /本地图片/);
  const request = playgroundRequest(target, { images });
  assert.deepEqual(request.messages[0].content, [{ type: 'image_url', image_url: { url: images[0].url } }]);
  assert.equal(simulatePlaygroundResponse('chat', request).model, 'demo-model');
});

test('embedding and reranking require their native inputs and return repeatable local samples', () => {
  const embedding = open({ models: [{ ...model, type: 'embedding' }] })[0];
  assert.throws(() => playgroundRequest(embedding, { texts: ['One', ''] }), /两条/);
  const request = playgroundRequest(embedding, { texts: ['Alpha', 'Alpha'] });
  assert.deepEqual(request, { model: 'demo-model', input: ['Alpha', 'Alpha'], encoding_format: 'float' });
  const { data } = simulatePlaygroundResponse('embedding', request);
  assert.deepEqual(data[0].embedding, data[1].embedding);
  const rank = open({ models: [{ ...model, type: 'rerank' }] })[0];
  assert.throws(() => playgroundRequest(rank, { query: '', texts: ['A'] }), /查询/);
  assert.throws(() => playgroundRequest(rank, { query: 'alpha', texts: ['A'], topN: '' }), /Top N/);
  const ranked = playgroundRequest(rank, { query: 'alpha', texts: ['beta', 'alpha beta'], topN: 1 });
  assert.deepEqual(simulatePlaygroundResponse('rerank', ranked).results.map(row => row.index), [1]);
});

test('batch paste supports Windows and Mac line breaks and preserves text outside the selected range', () => {
  assert.equal(splitPlaygroundPaste('当前内容', 0, 2, '单行文本'), null);
  assert.deepEqual(splitPlaygroundPaste('左文案右', 1, 3, ' 首行 \r\n\r第 二 行\n第三行 '), ['左首行右', '第 二 行', '第三行']);
  assert.deepEqual(splitPlaygroundPaste('', 0, 0, '\n\r\n '), []);
  assert.ok(playgroundSamples('embedding').texts.length >= 2);
  assert.ok(playgroundSamples('rerank', true).query);
});

test('embedding projection retains input order, handles coincident vectors and separates dissimilar vectors', () => {
  assert.deepEqual(projectPlaygroundEmbeddings([]), []);
  assert.deepEqual(projectPlaygroundEmbeddings([[1, 0], [1, 0]]), [[0, 0], [0, 0]]);
  const points = projectPlaygroundEmbeddings([[1, 0], [1, 0], [0, 1], [0, -1]]);
  assert.deepEqual(points[0], points[1]);
  assert.notDeepEqual(points[0], points[2]);
  assert.ok(points.flat().every(Number.isFinite));
});

test('reranking keeps unranked documents and produces a relative score scale independent from Top N', () => {
  const documents = [{ id: 'one', text: 'beta' }, { id: 'two', text: 'alpha' }, { id: 'three', text: 'alpha eta' }];
  const ranked = [{ index: 1, relevance_score: 1 }, { index: 0, relevance_score: 0 }];
  assert.deepEqual(orderPlaygroundDocuments(documents, ranked).map(row => row.id), ['two', 'one', 'three']);
  assert.equal(playgroundRankProgress(ranked, 0), 50);
  assert.equal(playgroundRankProgress(ranked, 1), 100);
  assert.equal(playgroundRankProgress(ranked.slice(0, 1), 1), 100);
});

test('code preview uses the correct action path, a placeholder environment variable and shell-quoted input', () => {
  const request = { model: 'demo-model', query: "What's up?", documents: ['a $HOME'], top_n: 1 };
  const origin = 'https://example.test';
  const curl = playgroundCodeExample('rerank', request, 'cURL', origin);
  assert.match(curl, /https:\/\/example.test\/v1\/rerank/);
  assert.ok(curl.includes("What'\"'\"'s up?"));
  assert.match(curl, /MOMA_API_KEY/);
  assert.match(playgroundCodeExample('embedding', { input: ['one', 'two'] }, 'Python', origin), /v1\/embeddings/);
  assert.match(playgroundCodeExample('rerank', request, 'Node.js', origin), /process\.env\.MOMA_API_KEY/);
});
