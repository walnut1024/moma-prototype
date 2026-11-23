const record = value => value && typeof value === 'object' && !Array.isArray(value) && Object.getPrototypeOf(value) === Object.prototype;
const secretName = /^(?:authorization|cookie|set-cookie|api[-_]?key|x-api-key|token|access[-_]?token|secret|password|credential|__proto__|prototype|constructor)$/i;
const secretValue = /(?:\bsk-[\w-]{6,}|\bBearer\s+\S+|-----BEGIN .*PRIVATE KEY-----)/i;
const pathPattern = /^[a-z][\w-]*(?:\.[a-z][\w-]*){0,7}$/i;
const parameterPath = path => typeof path === 'string' && pathPattern.test(path) && !path.split('.').some(part => secretName.test(part));
const scalar = value => value === null || ['string', 'number', 'boolean'].includes(typeof value);
const ruleValue = (value, depth = 0) => {
  if (depth > 8) return false;
  if (typeof value === 'string') return value.length <= 4000 && !secretValue.test(value);
  if (scalar(value)) return typeof value !== 'number' || Number.isFinite(value);
  if (Array.isArray(value)) return value.length <= 100 && value.every(item => ruleValue(item, depth + 1));
  return record(value) && Object.entries(value).length <= 100 && Object.entries(value).every(([key, item]) => !secretName.test(key) && ruleValue(item, depth + 1));
};
const statusCode = value => /^[45][0-9]{2}$/.test(String(value));
const allowedHeader = name => /^(?:x-[a-z0-9][a-z0-9-]*|anthropic-beta|accept-language)$/i.test(name) &&
  !/(?:cookie|authorization|auth-|secret|credential|api-key|token|forwarded|signature)/i.test(name);
const exactFields = (value, fields) => record(value) && Object.keys(value).every(key => fields.includes(key));
export const RULE_MODES = [['set', '设置'], ['delete', '删除字段'], ['return_error', '返回自定义错误']];
export const RULE_CONDITION_MODES = [['full', '等于'], ['prefix', '开头为'], ['suffix', '结尾为'], ['contains', '包含'], ['exists', '存在']];
export const emptyChannelRules = { parameters: { operations: [] }, headers: {}, statusCodes: {} };
export const channelDemoPlugins = [['strip_client_identifier', '清除客户端识别字段'], ['drop_empty_metadata', '移除空元数据']];
export const channelFieldControls = {
  openai: ['service_tier', 'store', 'safety_identifier', 'include', 'inference_geo'],
  'openai-responses': ['service_tier', 'store', 'safety_identifier', 'include', 'inference_geo'],
  anthropic: ['speed'],
};

export function normalizeChannelRequestRules(input, interfaceType) {
  if (input === null) return null;
  if (!exactFields(input, ['parameters', 'headers', 'statusCodes', 'processing', 'aliases', 'plugins'])) throw Error('请求规则包含不支持的配置项');
  const { parameters = {}, headers = {}, statusCodes = {}, processing = {}, aliases = {}, plugins = [] } = input;
  if (!record(parameters) || !record(headers) || !record(statusCodes)) throw Error('参数、请求头和状态码须为 JSON 对象');
  const modelName = name => typeof name === 'string' && /^[\w./:-]{1,200}$/.test(name) && !secretName.test(name) && !secretValue.test(name);
  if (!record(aliases) || Object.keys(aliases).length > 50 || Object.entries(aliases).some(([from, to]) => !modelName(from) || !modelName(to) || from === to)) {
    throw Error('重定向最多配置 50 条，须填写不同且有效的模型 ID');
  }
  if (!Array.isArray(plugins) || new Set(plugins).size !== plugins.length ||
    plugins.some(key => !channelDemoPlugins.some(([id]) => id === key))) throw Error('请求处理插件未安装或重复');
  if (Object.keys(headers).length > 30 || Object.keys(statusCodes).length > 30) throw Error('请求头和状态码各最多配置 30 项');
  const namedHeaders = Object.entries(headers).map(([name, value]) => {
    if (!allowedHeader(name) || typeof value !== 'string' || value.length > 500 || /[\r\n]/.test(value) || secretValue.test(value)) throw Error('请求头只能配置允许的非敏感字段和单行值');
    if (value.replace(/\{\{(?:model|request_id)\}\}/g, '').includes('{{')) throw Error('请求头只可引用 {{model}} 或 {{request_id}}');
    return [name.toLowerCase(), value];
  });
  if (new Set(namedHeaders.map(([name]) => name)).size !== namedHeaders.length) throw Error('请求头重复');
  const codes = Object.fromEntries(Object.entries(statusCodes).map(([from, to]) => {
    if (!statusCode(from) || !statusCode(to)) throw Error('状态码映射只接受 400–599');
    return [from, Number(to)];
  }));
  const operations = Object.hasOwn(parameters, 'operations') ? parameters.operations : Object.entries(parameters)
    .map(([path, value]) => ({ path, mode: 'set', value }));
  if (Object.hasOwn(parameters, 'operations') && Object.keys(parameters).length !== 1 || !Array.isArray(operations) || operations.length > 50) throw Error('参数覆盖须为普通对象或最多 50 条操作的 operations 列表');
  const normalized = operations.map((rule, index) => {
    const invalid = message => { throw Error(`第 ${index + 1} 条参数规则：${message}`); };
    if (!exactFields(rule, ['mode', 'path', 'value', 'conditions', 'logic']) || !RULE_MODES.some(([mode]) => rule.mode === mode)) invalid('操作类型或字段无效');
    const { mode, path, value, conditions = [], logic = 'OR' } = rule;
    if (mode !== 'return_error' && (!parameterPath(path) || ['model', 'stream'].includes(path.split('.')[0]))) invalid('字段无效；模型 ID、stream 和敏感字段受保护');
    if (mode === 'set' && !ruleValue(value)) invalid('设置值须为安全、有限大小的 JSON');
    if (mode === 'return_error' && (!exactFields(value, ['message', 'statusCode']) || typeof value.message !== 'string' || !value.message.trim() || value.message.length > 300 || secretValue.test(value.message) || !statusCode(value.statusCode))) invalid('错误须包含 400–599 状态码和非敏感提示');
    if (!['AND', 'OR'].includes(logic) || !Array.isArray(conditions) || conditions.length > 10) invalid('请指定 AND 或 OR，每条规则最多 10 项条件');
    const tests = conditions.map(test => {
      if (!exactFields(test, ['path', 'mode', 'value']) || !parameterPath(test.path) || !RULE_CONDITION_MODES.some(([mode]) => test.mode === mode) ||
        test.mode !== 'exists' && (!scalar(test.value) || !ruleValue(test.value) || test.mode !== 'full' && typeof test.value !== 'string')) invalid('条件字段、匹配方式或比较值无效');
      return { path: test.path, mode: test.mode, ...(test.mode === 'exists' ? {} : { value: test.value }) };
    });
    return { mode, ...(mode === 'return_error' ? {} : { path }), ...(mode === 'delete' ? {} : { value: mode === 'return_error' ? { ...value, statusCode: Number(value.statusCode) } : value }), logic, conditions: tests };
  });
  const flags = ['passBody', 'forceOpenAI', 'reasoningToContent', 'responsesWebSocket'];
  if (!exactFields(processing, [...flags, 'systemPrompt', 'promptMode', 'passHeaders', 'removeFields']) ||
    flags.some(key => Object.hasOwn(processing, key) && typeof processing[key] !== 'boolean')) throw Error('请求处理选项无效');
  const { systemPrompt = '', promptMode = 'default', passHeaders = [], removeFields = [] } = processing;
  if (typeof systemPrompt !== 'string' || !ruleValue(systemPrompt) || !['default', 'prepend'].includes(promptMode)) throw Error('系统提示词或拼接方式无效');
  if (!Array.isArray(passHeaders) || passHeaders.length > 20 || !passHeaders.every(name => typeof name === 'string' && allowedHeader(name))) throw Error('透传清单含敏感或不支持的请求头');
  const supported = interfaceType ? channelFieldControls[interfaceType] || [] : Object.values(channelFieldControls).flat();
  if (!Array.isArray(removeFields) || !removeFields.every(field => supported.includes(field))) throw Error('禁用字段不适用于当前接口');
  if (interfaceType && interfaceType !== 'openai-responses' && processing.responsesWebSocket) throw Error('WebSocket 仅适用于 Responses 接口');
  if (processing.passBody && (normalized.length || Object.keys(aliases).length || plugins.length || systemPrompt || removeFields.length || processing.forceOpenAI || processing.reasoningToContent)) {
    throw Error('请求体透传与模型重定向、参数覆盖、系统提示词、禁用字段或格式转换冲突');
  }
  const rules = {
    parameters: { operations: normalized }, headers: Object.fromEntries(namedHeaders), statusCodes: codes,
    ...(Object.hasOwn(input, 'aliases') ? { aliases } : {}),
    ...(Object.hasOwn(input, 'plugins') ? { plugins } : {}),
    ...(Object.hasOwn(input, 'processing') ? { processing: {
      ...Object.fromEntries(flags.filter(key => processing[key]).map(key => [key, true])),
      ...(systemPrompt ? { systemPrompt, promptMode } : {}),
      ...(passHeaders.length ? { passHeaders: [...new Set(passHeaders.map(name => name.toLowerCase()))] } : {}),
      ...(removeFields.length ? { removeFields: [...new Set(removeFields)] } : {}),
    } } : {}),
  };
  if (JSON.stringify(rules).length > 16000) throw Error('规则配置过长，最多 16000 字符');
  return rules;
}

function pathValue(input, path) {
  return path.split('.').reduce((node, part) => record(node) && Object.hasOwn(node, part) ? node[part] : undefined, input);
}

function conditionMatches(body, condition) {
  const { path, mode, value } = condition;
  const actual = pathValue(body, path);
  if (mode === 'exists') return actual !== undefined;
  if (mode === 'full') return actual === value;
  return typeof actual === 'string' && (mode === 'prefix' ? actual.startsWith(value) : mode === 'suffix' ? actual.endsWith(value) : actual.includes(value));
}

export function previewChannelRequestRules(input, sample, upstreamStatus = 200, { interfaceType, headers = {}, pluginScopes } = {}) {
  const rules = normalizeChannelRequestRules(input, interfaceType) || emptyChannelRules;
  if (!record(sample) || !ruleValue(sample)) throw Error('样例应为有界的 JSON 对象，请使用占位数据');
  const body = structuredClone(sample), steps = [];
  const pluginOrder = [];
  for (const [scope, ids] of [['全局', pluginScopes?.global || []], ['分组', pluginScopes?.group || []], ['连接', rules.plugins || []]]) {
    for (const id of ids) {
      if (!pluginOrder.some(row => row.id === id)) pluginOrder.push({ id, scope });
    }
  }
  if (pluginOrder.some(({ id }) => !channelDemoPlugins.some(([plugin]) => id === plugin))) throw Error('请求处理插件未安装');
  if (pluginOrder.length && rules.processing?.passBody) throw Error('请求体原样透传与样例插件冲突');
  for (const { id: plugin } of pluginOrder) {
    if (plugin === 'strip_client_identifier') {
      delete body.user;
      if (record(body.metadata)) delete body.metadata.client_id;
    } else if (plugin === 'drop_empty_metadata' && record(body.metadata) && !Object.keys(body.metadata).length) delete body.metadata;
  }
  if (rules.aliases && typeof body.model === 'string' && Object.hasOwn(rules.aliases, body.model)) body.model = rules.aliases[body.model];
  const handling = rules.processing || {};
  if (handling.systemPrompt) {
    const prompt = handling.systemPrompt;
    const combine = current => !current ? prompt : handling.promptMode === 'prepend' ? prompt + '\n' + current : current;
    if (interfaceType === 'openai-responses') body.instructions = combine(body.instructions);
    else if (interfaceType === 'anthropic') body.system = combine(body.system);
    else {
      body.messages = Array.isArray(body.messages) ? body.messages : [];
      const first = body.messages.find(item => item?.role === 'system');
      if (first && typeof first.content === 'string') first.content = combine(first.content);
      else if (!first) body.messages.unshift({ role: 'system', content: prompt });
    }
  }
  for (const field of handling.removeFields || []) delete body[field];
  let error = null;
  for (const [index, rule] of rules.parameters.operations.entries()) {
    const conditions = rule.conditions.map(test => conditionMatches(body, test));
    const matched = !conditions.length || (rule.logic === 'AND' ? conditions.every(Boolean) : conditions.some(Boolean));
    const step = { index: index + 1, matched, mode: rule.mode, path: rule.path, conditions };
    steps.push(step);
    if (!matched) continue;
    if (rule.mode === 'return_error') { error = rule.value; break; }
    const parts = rule.path.split('.'), field = parts.pop();
    let parent = body;
    for (const part of parts) {
      if (!record(parent[part])) {
        if (rule.mode === 'delete' || Object.hasOwn(parent, part)) { parent = null; break; }
        parent[part] = {};
      }
      parent = parent[part];
    }
    if (!parent) { step.skipped = '父字段不存在或不是对象'; continue; }
    if (rule.mode === 'delete') delete parent[field];
    else parent[field] = structuredClone(rule.value);
  }
  const forwarded = Object.fromEntries(Object.entries(headers).filter(([name, value]) =>
    handling.passHeaders?.includes(name.toLowerCase()) && typeof value === 'string' && value.length <= 500 && !/[\r\n]/.test(value) && !secretValue.test(value))
    .map(([name, value]) => [name.toLowerCase(), value]));
  for (const [name, value] of Object.entries(rules.headers)) {
    const model = typeof sample.model === 'string' && /^[\w./:-]{1,200}$/.test(sample.model) ? sample.model : '';
    forwarded[name] = value.replaceAll('{{model}}', model).replaceAll('{{request_id}}', 'example-request');
  }
  const response = { upstreamStatus, status: rules.statusCodes[upstreamStatus] ?? upstreamStatus };
  if (handling.forceOpenAI || handling.reasoningToContent) {
    const content = handling.reasoningToContent ? '<think>示例推理</think>\n示例回答' : '示例回答';
    response.sample = handling.forceOpenAI ? { object: 'chat.completion', choices: [{ message: { role: 'assistant', content } }] } : { content };
  }
  return { steps, ...(pluginOrder.length ? { plugins: pluginOrder.map(row => row.id), pluginOrder } : {}),
    request: error ? null : { body, headers: forwarded }, error, response: error ? null : response };
}
