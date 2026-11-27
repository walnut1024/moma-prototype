import { deployableModels } from './deployments.js';

export const playgroundModes = {
  text: 'chat', multimodal: 'chat', embedding: 'embedding', rerank: 'rerank',
};
export const playgroundPaths = { chat: '/v1/chat/completions', embedding: '/v1/embeddings', rerank: '/v1/rerank' };

export const chatPlaygroundNumbers = [
  ['temperature', 'Temperature', 0, 2, 0.01],
  ['max_tokens', 'Max Tokens', 1, 16384, 1],
  ['top_p', 'Top P', 0, 1, 0.01],
  ['frequency_penalty', 'Frequency Penalty', -2, 2, 0.01],
  ['presence_penalty', 'Presence Penalty', -2, 2, 0.01],
  ['seed', 'Seed', 0, Number.MAX_SAFE_INTEGER, 1],
];
export const playgroundReasoningLevels = ['none', 'minimal', 'low', 'medium', 'high', 'xhigh', 'max'];
export const playgroundImageTypes = ['image/jpeg', 'image/jpg', 'image/png'];
export const playgroundCodeLanguages = ['cURL', 'Python', 'Node.js'];
const chatNumberDefaults = { temperature: 1, top_p: 1, frequency_penalty: 0, presence_penalty: 0 };

function deploymentCanServe({ status, readyReplicas, replicas, roles, rebuildingInstance }) {
  if (status !== '运行中' || !Number.isInteger(readyReplicas) || readyReplicas < 1) return false;
  // This workspace records total ready replicas, without readiness for each PD role.
  return !roles || readyReplicas === replicas && !rebuildingInstance;
}

export function deploymentPlaygroundTargets(state, deploymentId) {
  if (!['平台管理员', '运维人员'].includes(state.currentRole) || state.storageError) return [];
  const deployment = state.deployments.find(item => item.id === deploymentId);
  if (!deployment || deployment.retiredAt || !deploymentCanServe(deployment)) return [];
  const model = deployableModels(state).find(item => item.id === deployment.modelId);
  const mode = playgroundModes[model?.type];
  const endpoint = state.endpoints.find(item => item.id === deployment.endpointId && item.status === '运行中');
  if (!mode || !endpoint?.modelIds?.includes(model.id)) return [];
  return state.routes.flatMap(route => {
    if (route.status !== '已启用' || route.modelId !== model.id || !route.routeId?.trim() ||
        !route.targets?.some(target => target.endpointId === endpoint.id && target.weight > 0)) return [];
    return [{ route, deployment, model, mode, routeName: route.routeId, endpointId: endpoint.id }];
  });
}

function boundedNumber(value, label, min, max, step) {
  const number = Number(value);
  if (!Number.isFinite(number) || number < min || number > max || step === 1 && !Number.isInteger(number)) {
    throw Error(`${label} 超出允许范围（${min}–${max}）。`);
  }
  return number;
}

const nonemptyText = value => typeof value === 'string' ? value.trim() : '';
const localImage = /^data:image\/(?:jpe?g|png);base64,[a-z0-9+/]+=*$/i;
const documentText = item => nonemptyText(typeof item === 'string' ? item : item?.text);

export function chatPlaygroundDefaults(target) {
  const metadata = { ...target.model.meta, ...target.model.metadata };
  const values = Object.entries(chatNumberDefaults).map(([key, value]) => {
    const numeric = Number(metadata[key]);
    const [, , min, max] = chatPlaygroundNumbers.find(entry => entry[0] === key);
    return [key, metadata[key] != null && metadata[key] !== '' && numeric >= min && numeric <= max ? Math.round(numeric * 100) / 100 : value];
  });
  const knownMax = modelTokenLimit(target.model);
  const optionalSeed = metadata.seed != null && metadata.seed !== '' && Number.isSafeInteger(Number(metadata.seed)) && Number(metadata.seed) >= 0 ? Number(metadata.seed) : undefined;
  return { ...Object.fromEntries(values), max_tokens: knownMax ? Math.max(1, Math.floor(knownMax / 2)) : 1024, ...(optionalSeed === undefined ? {} : { seed: optionalSeed }) };
}

export function chatPlaygroundKey(event) {
  if (event.key !== 'Enter' || event.shiftKey || event.isComposing || event.keyCode === 229) return null;
  return event.altKey && (event.ctrlKey || event.metaKey) ? 'add' : 'send';
}

export function chatPlaygroundMessage(target, draft) {
  const text = nonemptyText(draft.prompt);
  const images = draft.images || [];
  const role = draft.role === 'assistant' ? 'assistant' : 'user';
  if (images.length && (role !== 'user' || target.model.type !== 'multimodal' || images.some(image => !localImage.test(image.url)))) {
    throw Error('请选择此模型支持的本地图片。');
  }
  if (!text && !images.length) return null;
  const content = images.length ? [...(text ? [{ type: 'text', text }] : []),
    ...images.map(image => ({ type: 'image_url', image_url: { url: image.url } }))] : text;
  return { role, content };
}

export function chatPlaygroundPayload(target, draft, history, { preview = false } = {}) {
  const message = chatPlaygroundMessage(target, draft);
  const messages = [...history.map(({ role, content }) => ({ role, content })), ...(message ? [message] : [])];
  if (!preview && !messages.length) throw Error('请输入消息。');
  const parameters = draft.parameters || {};
  const numeric = {};
  for (const [key, label, min, max, step] of chatPlaygroundNumbers) {
    if (parameters[key] == null || String(parameters[key]).trim() === '') continue;
    numeric[key] = boundedNumber(parameters[key], label, min, key === 'max_tokens' ? playgroundMaxTokens(target) : max, step);
  }
  const { reasoning_effort: effort, stop } = parameters;
  if (effort && !playgroundReasoningLevels.includes(effort)) throw Error('请选择有效的推理强度。');
  const system = nonemptyText(draft.system);
  return { model: target.routeName, messages: [...(system ? [{ role: 'system', content: system }] : []), ...messages],
    ...numeric, ...(effort ? { reasoning_effort: effort } : {}), ...(stop?.trim() ? { stop } : {}), stream: true,
    stream_options: { include_usage: true } };
}

export function playgroundSamples(mode, english = false) {
  if (mode === 'embedding') return { texts: english ? [
    'Where is a quiet library nearby?', 'Is there a good place nearby to read?', 'Can I borrow this book for a month?',
    'The afternoon train leaves at five.', 'Will it rain tomorrow?',
  ] : ['附近有安静的图书馆吗？', '附近哪里适合阅读？', '这本书可以借一个月吗？', '下午的火车五点出发。', '明天会下雨吗？'] };
  return english ? { query: 'How do I prepare for a long bike ride?', texts: [
    'For a long bike ride, check tire pressure and plan water stops.', 'Choose a comfortable saddle for your bike.', 'The library closes at five on weekdays.',
  ] } : { query: '长途骑行要做哪些准备？', texts: [
    '长途骑行前检查胎压，并安排补水停靠点。', '给自行车选一个合适的坐垫。', '图书馆工作日下午五点闭馆。',
  ] };
}

export function splitPlaygroundPaste(value, start, end, pasted) {
  if (!/[\r\n]/.test(pasted)) return null;
  const lines = pasted.split(/\r\n|\r|\n/).map(line => line.trim());
  lines[0] = `${value.slice(0, start)}${lines[0]}${value.slice(end)}`;
  return lines.filter(documentText);
}

export function playgroundDocumentRequest(target, draft) {
  const texts = (draft.texts || []).map(documentText).filter(Boolean);
  return target.mode === 'embedding'
    ? { model: target.routeName, input: texts, encoding_format: 'float' }
    : { model: target.routeName, query: nonemptyText(draft.query), documents: texts, top_n: draft.topN === '' ? undefined : draft.topN };
}

export function playgroundCodeExample(mode, request, language, origin) {
  const endpoint = origin + playgroundPaths[mode];
  const payload = JSON.stringify(request, null, 2);
  if (mode === 'chat' && language === 'Python') return `import json\nimport os\nfrom openai import OpenAI\n\nclient = OpenAI(base_url=${JSON.stringify(origin + '/v1')}, api_key=os.environ["MOMA_API_KEY"])\npayload = json.loads(${JSON.stringify(payload)})\nfor part in client.chat.completions.create(**payload):\n    if part.choices:\n        print(part.choices[0].delta.content or "", end="", flush=True)`;
  if (mode === 'chat' && language === 'Node.js') return `import OpenAI from "openai";\nconst client = new OpenAI({ baseURL: ${JSON.stringify(origin + '/v1')}, apiKey: process.env.MOMA_API_KEY });\nconst payload = ${payload};\n\nfor await (const part of await client.chat.completions.create(payload)) {\n  process.stdout.write(part.choices[0]?.delta.content ?? "");\n}`;
  if (language === 'Python') return `import json\nimport os\nimport requests\n\npayload = json.loads(${JSON.stringify(payload)})\nresponse = requests.post(${JSON.stringify(endpoint)}, json=payload,\n    headers={"Authorization": "Bearer " + os.environ["MOMA_API_KEY"]})\nresponse.raise_for_status()\nprint(response.json())`;
  if (language === 'Node.js') return `const payload = ${payload};\n\nconst response = await fetch(${JSON.stringify(endpoint)}, {\n  method: "POST",\n  headers: { "Content-Type": "application/json", Authorization: "Bearer " + process.env.MOMA_API_KEY },\n  body: JSON.stringify(payload)\n});\nconsole.log(await response.json());`;
  const quote = value => "'" + value.replaceAll("'", "'\"'\"'") + "'";
  return [ `curl${mode === 'chat' ? ' --no-buffer' : ''} ${quote(endpoint)} \\`, `  -H 'Content-Type: application/json' \\`,
    '  -H "Authorization: Bearer ${MOMA_API_KEY}" \\', `  --data-binary ${quote(payload)}` ].join('\n');
}

export function playgroundRequest(target, draft, history = []) {
  if (target.mode === 'chat') return chatPlaygroundPayload(target, draft, history);
  const documentRequest = playgroundDocumentRequest(target, draft);
  if (target.mode === 'embedding') {
    if (documentRequest.input.length < 2) throw Error('请至少输入两条文本。');
    return documentRequest;
  }
  if (!documentRequest.query) throw Error('请输入查询内容。');
  if (!documentRequest.documents.length) throw Error('请至少输入一条待排序文本。');
  if (draft.topN == null || draft.topN === '') throw Error('请填写 Top N。');
  const topN = boundedNumber(draft.topN, 'Top N', 1, Number.MAX_SAFE_INTEGER, 1);
  return { ...documentRequest, top_n: topN };
}

function modelTokenLimit(model) {
  const { n_ctx, n_slot, max_tokens, max_model_len, max_total_tokens } = { ...model.meta, ...model.metadata };
  return [Math.floor(Number(n_ctx) / Number(n_slot)), max_model_len, max_total_tokens, max_tokens]
    .map(Number).find(value => Number.isInteger(value) && value > 0);
}

export const playgroundMaxTokens = ({ model }) => modelTokenLimit(model) || 16384;

const segments = new Intl.Segmenter(undefined, { granularity: 'word' });
const words = value => [...segments.segment(value.toLowerCase())].filter(token => token.isWordLike).map(token => token.segment);

function vectorFor(value) {
  const vector = Array(8).fill(0);
  for (const token of words(value)) {
    let hash = 0;
    for (const letter of token) hash = Math.imul(hash, 31) + letter.codePointAt(0) >>> 0;
    vector[hash % vector.length] += 1;
  }
  const norm = Math.hypot(...vector) || 1;
  return vector.map(item => Number((item / norm).toFixed(6)));
}

export function projectPlaygroundEmbeddings(embeddings) {
  if (!embeddings.length) return [];
  const [first] = embeddings;
  const average = first.map((_, index) => embeddings.reduce((sum, vector) => sum + vector[index], 0) / embeddings.length);
  const centered = embeddings.map(vector => vector.map((value, index) => value - average[index]));
  const dot = (a, b) => a.reduce((sum, value, index) => sum + value * b[index], 0);
  const norm = vector => Math.hypot(...vector);
  const unit = vector => {
    const length = norm(vector);
    return length > 1e-9 ? vector.map(value => value / length) : vector.map(() => 0);
  };
  const component = rows => {
    let axis = unit(rows.reduce((largest, row) => norm(row) > norm(largest) ? row : largest, first.map(() => 0)));
    for (let iteration = 0; iteration < 30; iteration++) {
      const product = axis.map(() => 0);
      for (const row of rows) {
        const score = dot(row, axis);
        row.forEach((value, index) => { product[index] += score * value; });
      }
      axis = unit(product);
    }
    return axis;
  };
  const horizontal = component(centered);
  const vertical = component(centered.map(vector => {
    const componentValue = dot(vector, horizontal);
    return vector.map((value, index) => value - componentValue * horizontal[index]);
  }));
  return centered.map(vector => [dot(vector, horizontal), dot(vector, vertical)].map(value => Number(value.toFixed(6))));
}

export function orderPlaygroundDocuments(documents, results) {
  const ranked = results.map(result => documents[result.index]);
  const indices = new Set(results.map(result => result.index));
  return [...ranked, ...documents.filter((_, index) => !indices.has(index))];
}

export function playgroundRankProgress(results, score) {
  const values = results.map(item => item.relevance_score);
  const max = Math.max(...values);
  const min = Math.min(...values);
  return max === min ? 100 : 50 + 50 * (score - min) / (max - min);
}

const estimateUsage = texts => {
  const tokens = texts.reduce((total, text) => total + words(text).length, 0);
  return { prompt_tokens: tokens, total_tokens: tokens };
};

const messageText = message => typeof message.content === 'string' ? message.content : message.content?.filter(part => part.type === 'text').map(part => part.text).join(' ') || '';

export function chatPlaygroundUsage(request, content) {
  const input = estimateUsage(request.messages.map(messageText)).prompt_tokens;
  const output = estimateUsage([content]).prompt_tokens;
  return { prompt_tokens: input, completion_tokens: output, total_tokens: input + output };
}

export function chatPlaygroundChunks(text) {
  const parts = Array.from(text);
  const size = Math.max(2, Math.ceil(parts.length / 12));
  return Array.from({ length: Math.ceil(parts.length / size) }, (_, index) => parts.slice(index * size, (index + 1) * size).join(''));
}

export function simulatePlaygroundResponse(mode, request) {
  if (mode === 'chat') {
    const text = messageText(request.messages.at(-1));
    const reply = text ? `已收到消息：${Array.from(text).slice(0, 160).join('')}` : '已收到图片。';
    const stopAt = request.stop ? reply.indexOf(request.stop) : -1;
    const content = stopAt === -1 ? reply : reply.slice(0, stopAt);
    return { model: request.model, choices: [{ index: 0, message: { role: 'assistant', content } }], usage: chatPlaygroundUsage(request, content) };
  }
  if (mode === 'embedding') return { object: 'list', model: request.model, data: request.input.map((text, index) => ({ object: 'embedding', index, embedding: vectorFor(text) })), usage: estimateUsage(request.input) };
  const tokens = new Set(words(request.query));
  const ranked = request.documents.map((text, index) => {
    const matches = new Set(words(text).filter(word => tokens.has(word)));
    return { index, text, relevance_score: matches.size / (tokens.size || 1) };
  }).sort((left, right) => right.relevance_score - left.relevance_score || left.index - right.index);
  return { model: request.model, results: ranked.slice(0, request.top_n ?? ranked.length), usage: estimateUsage([request.query, ...request.documents]) };
}
