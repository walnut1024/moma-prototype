const referenceTypes = [
  [2,"Midjourney"],
  [4,"Ollama"],
  [5,"MidjourneyPlus"],
  [6,"OpenAIMax"],
  [7,"OhMyGPT"],
  [8,"Custom"],
  [9,"AILS"],
  [10,"AIProxy"],
  [11,"PaLM"],
  [12,"API2GPT"],
  [13,"AIGC2D"],
  [15,"Baidu"],
  [16,"Zhipu"],
  [17,"Ali"],
  [18,"Xunfei"],
  [19,"360"],
  [20,"OpenRouter"],
  [21,"AIProxyLibrary"],
  [22,"FastGPT"],
  [23,"Tencent"],
  [25,"Moonshot"],
  [26,"ZhipuV4"],
  [27,"Perplexity"],
  [31,"LingYiWanWu"],
  [34,"Cohere"],
  [35,"MiniMax"],
  [36,"SunoAPI"],
  [37,"Dify"],
  [38,"Jina"],
  [39,"Cloudflare"],
  [40,"SiliconFlow"],
  [42,"Mistral"],
  [43,"DeepSeek"],
  [44,"MokaAI"],
  [45,"VolcEngine"],
  [46,"BaiduV2"],
  [47,"Xinference"],
  [48,"xAI"],
  [49,"Coze"],
  [50,"Kling"],
  [51,"Jimeng"],
  [52,"Vidu"],
  [53,"Submodel"],
  [54,"Doubao"],
  [55,"Sora"],
  [56,"Replicate"],
  [59,"Sub2API"],
  [60,"New API"],
  [61,"Task Plugin"],
  [62,"vLLM"],
  [63,"SGLang"],
];

export const adapterDraftTypes = [
  { id: 'azure', number: 3, name: 'Azure OpenAI', fields: [['deployment', '部署名称'], ['apiVersion', 'API 版本'], ['credentialProfile', '凭证配置引用']] },
  { id: 'gemini', number: 24, name: 'Gemini 原生 API', fields: [['credentialProfile', '凭证配置引用']] },
  { id: 'bedrock', number: 33, name: 'AWS Bedrock', fields: [['region', 'AWS 区域'], ['credentialProfile', '凭证配置引用']] },
  { id: 'vertex', number: 41, name: 'Vertex AI', fields: [['region', '区域'], ['project', '项目 ID'], ['credentialProfile', '服务账号配置引用']] },
  { id: 'codex', number: 57, name: 'Codex 授权账号', fields: [['credentialProfile', '授权配置引用']] },
  ...referenceTypes.map(([number, name]) => ({ id: 'type-' + number, number, name, fields: [['credentialProfile', '凭证配置引用']] })),
  { id: 'unrecognized', number: 0, name: '其他待适配类型', fields: [['label', '适配器名称'], ['credentialProfile', '凭证配置引用']] },
];

export function normalizeAdapterDraft(input) {
  const adapter = adapterDraftTypes.find(row => row.id === input?.kind);
  const fields = adapter?.fields.map(([key]) => key) || [];
  const values = input?.values;
  if (!adapter || !values || typeof values !== 'object' || Array.isArray(values) || Object.keys(values).some(key => !fields.includes(key))) throw Error('请选择有效的待适配类型');
  const filtered = Object.fromEntries(Object.entries(values).filter(([, value]) => value !== ''));
  if (Object.values(filtered).some(value => typeof value !== 'string' || !/^[\p{L}\p{N}_. -]{1,100}$/u.test(value) || /\bsk-/i.test(value))) throw Error('适配器参数只能填写名称、格式化标识或凭证引用');
  if (input.kind === 'unrecognized' && !filtered.label) throw Error('请输入待适配类型名称');
  return { kind: adapter.id, label: filtered.label || adapter.name, values: filtered };
}
