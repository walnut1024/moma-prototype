import { bundledCacheProviderCards, bundledLmCacheReleases } from './cache-provider-source-data.js';
import { readModelSourceSetting } from './infrastructure-source-settings.js';

const number = (key, label, constraints = {}) => ({ key, label, type: 'number', ...constraints });
const toggle = (key, label, defaultValue = false) => ({ key, label, type: 'switch', defaultValue });
const text = (key, label, config = {}) => ({ key, label, ...config });

const l1Fields = [
  number('memoryGiB', '内存容量（GiB）', { required: true, min: 1, step: 1, defaultValue: 20 }),
  { key: 'evictionPolicy', label: '淘汰策略', type: 'select', options: ['LRU', 'IsolatedLRU', 'noop'], defaultValue: 'LRU' },
  number('evictionWatermark', '淘汰触发水位', { min: 0, max: 1, step: 0.05, defaultValue: 0.85 }),
  number('evictionRatio', '淘汰比例', { min: 0, max: 1, step: 0.05, defaultValue: 0.1 }),
  number('chunkSize', '分块大小', { min: 1, step: 1 }),
];
const capacityFields = [
  number('maxCapacity', '最大容量（GiB）', { min: 0 }),
  toggle('autoCleanup', '自动清理', true),
];
const lmcacheReleases = Object.fromEntries(Object.entries(bundledLmCacheReleases)
  .map(([version,runtimeImages])=>[version,{
    frameworks:Object.keys(runtimeImages),plainImage:false,image:undefined,runtimeImages,
  }]));

// Field definitions follow GPUStack v2.3.1's gpustack/assets/cache-providers.yaml.
const builtinProviders = [
  {
    name: 'LMCache', detail: '在节点内共享 KV 缓存，可配置 L2 存储。', versions: [...Object.keys(lmcacheReleases),'自定义'],
    legacyVersions: ['0.4.2','0.4.1'], releases:lmcacheReleases, defaultVersion:Object.keys(lmcacheReleases)[0],
    topology: 'per_node', fields: [...l1Fields, toggle('enableP2P', 'P2P 读取')],
    components: [
      { key: 'coordinator', label: 'Coordinator', enabledBy: 'enableP2P', enabledWhen: true },
      { key: 'server', label: 'Server' },
    ],
    l2: {
      '本地文件系统': [text('basePath', '基础路径', { required: true, defaultValue: '/var/lib/gpustack/cache/lmcache/l2' }),
        ...capacityFields, number('ioWorkers', 'I/O 工作线程', { min: 1, step: 1 }), toggle('directIO', '直接 I/O（O_DIRECT）')],
      'Redis / Valkey': [text('host', '主机', { required: true }), number('port', '端口', { required: true, min: 1, max: 65535, step: 1 }),
        text('username', '用户名', { credential: true }), text('password', '密码', { credential: true }), ...capacityFields],
      S3: [text('endpoint', 'Bucket 地址', { required: true }), text('region', '区域', { required: true }),
        text('accessKeyId', 'Access Key ID', { credential: true }), text('secretAccessKey', 'Secret Access Key', { credential: true }),
        toggle('disableTLS', '禁用 TLS（HTTP 端点）'), ...capacityFields],
    },
  },
  { name: 'Mooncake', detail: 'GPUStack 企业版可用', unavailable: true, versions: ['外部服务'] },
  {
    name: 'XSKY MeshFusion', detail: '使用 MeshFusion Store 作为分布式 L2 存储。', versions: ['自定义'],
    topology: 'per_node', management: true, fields: l1Fields, l2: {
      'XSKY MeshFusion Store': [text('tenantId', '租户 ID', { defaultValue: 'nixl' })],
    },
  },
];

export const cacheProviderDefinition = name => cacheProviderCatalogue.find(provider => provider.name === name);

export function configuredCacheProviders() {
  try {
    const slot = readModelSourceSetting('cache-provider');
    return (slot?.mode === 'YAML 文件' || slot?.mode === 'URL' && slot.url) &&
      Array.isArray(slot.definitions) ? slot.definitions : undefined;
  } catch { return undefined; }
}

export function cacheCatalogueChangeIssue(definitions, services) {
  const missing = services.filter(row=>!definitions.some(provider=>provider.name===row.provider &&
    (provider.versions.includes(row.version) || provider.legacyVersions?.includes(row.version))));
  if (missing.length) return `配置会移除正在使用的提供方或版本。请先调整 ${missing.map(row=>row.name).join('、')}。`;
}

export function activeCacheProvider(name) {
  const builtin = cacheProviderDefinition(name);
  const configured = configuredCacheProviders()?.find(item => item.name === name);
  return configured ? { ...builtin, ...configured } : builtin;
}

const safeKey = value => typeof value === 'string' && /^[a-z][a-z\d_]{0,79}$/i.test(value) && !['constructor', 'prototype', '__proto__'].includes(value);
const localized = value => typeof value === 'string' ? value : String(value?.['zh-CN'] || value?.default || '');
const optionScalar = value => value != null && ['string', 'number', 'boolean'].includes(typeof value);
const mapping = value => value && typeof value === 'object' && !Array.isArray(value);
const frameworkFamily = value => String(value || '').toLowerCase().split(/[:/_]/,1)[0];
const imageReference = value => typeof value==='string' && /^[\w][\w./-]*(?::[\w.-]+)?(?:\/[\w./-]+)*(?::[\w.-]+|@sha256:[a-f\d]{64})?$/i.test(value) ?
  value : undefined;
const flagHints = value => Array.isArray(value) ? value.filter(parameter=>typeof parameter==='string' && /^--[\w-]+$/.test(parameter)) : undefined;

function providerLink(link) {
  try {
    const url = new URL(link.url);
    if (!['https:', 'http:'].includes(url.protocol) || url.username || url.password) return null;
    return { text:localized(link.label) || url.hostname, url:url.href };
  } catch { return null; }
}

function providerPresentation(item, releases = {}) {
  const integrations = Array.isArray(item.inference_backend_integrations) ? item.inference_backend_integrations
    .filter(entry=>typeof entry?.backend==='string').map(entry=>({
      backend:entry.backend,frameworks:Array.isArray(entry.frameworks) ? entry.frameworks.filter(family=>typeof family==='string') : undefined,
      versions:typeof entry.versions==='string' ? entry.versions : undefined,
    })) : [];
  const releaseFamilies = Object.values(releases).flatMap(release => release.frameworks);
  const frameworks = releaseFamilies.length ? releaseFamilies :
    Array.isArray(item.runner_frameworks) && item.runner_frameworks.length ? item.runner_frameworks :
      integrations.flatMap(integration => Array.isArray(integration.frameworks) ? integration.frameworks : []);
  return {
    displayName: localized(item.display_name) || item.name,
    detail: localized(item.description || item.detail),
    source: ['built_in','community','partner'].includes(item.source) ? item.source : 'community',
    icon: typeof item.icon === 'string' ? item.icon : undefined,
    links: Array.isArray(item.links) ? item.links.map(providerLink).filter(Boolean) : [],
    frameworks: [...new Set(frameworks.map(frameworkFamily).filter(family => family && family !== 'cpu'))],
    integrations,
    unavailableReason: localized(item.unavailable_reason),
  };
}

export const cacheProviderCatalogue = builtinProviders.map(provider => {
  const source = bundledCacheProviderCards.find(item => item.name === provider.name);
  const card = providerPresentation(source);
  return {
    ...provider,...card,
    ...(provider.name === 'XSKY MeshFusion' && { l2Adapters: {
      'XSKY MeshFusion Store': {
        label: localized(source.backends.xdfs.adapterLabel),
        defaultEnabled: source.backends.xdfs.enabled,
        detail: localized(source.backends.xdfs.description),
      },
    } }),
    ...(provider.components && { components: provider.components.map(role=>({ ...role,hints:source.components?.[role.key] })) }),
  };
});
export const cacheProviderFields = [...new Map(cacheProviderCatalogue.flatMap(item => item.fields || []).map(field => [field.key, field])).values()];

const declaredFields = (fields, label) => {
  if (!Array.isArray(fields) || fields.length > 40) throw Error(`${label}的字段须使用列表且最多 40 项。`);
  const seen = new Set();
  return fields.map(field => {
    const key = field?.name ?? field?.key;
    if (!safeKey(key) || seen.has(key)) throw Error(`${label}含重复或无效的字段名称。`);
    seen.add(key);
    const options = field.options;
    if (options != null && (!Array.isArray(options) || options.some(option =>
      !(typeof option==='string' || typeof option==='number' || mapping(option) && typeof option.value==='string')))) {
      throw Error(`${label}的字段选项格式错误。`);
    }
    const choices = options?.map(option => mapping(option) ? {
      value:option.value,label:localized(option.label) || option.value,description:localized(option.description),
    } : { value:option,label:String(option),description:'' });
    const kind = field.type || 'text';
    const type = options?.length ? 'select' : kind === 'boolean' || kind === 'switch' ? 'switch' : kind;
    if (!['text', 'input', 'number', 'select', 'switch', 'password', 'string'].includes(type)) throw Error(`${label}含不支持的字段类型 ${kind}。`);
    const credential = Boolean(field.credential) || type === 'password' || /(?:TOKEN|SECRET|PASSWORD|API_?KEY|CREDENTIAL|ACCESS_?KEY)/i.test(field.env_name || key);
    const defaultValue = field.default ?? field.defaultValue;
    return {
      key, label: localized(field.label) || key, type:credential ? 'password' : type, credential, required: Boolean(field.required) && !credential,
      description: localized(field.description), placeholder: localized(field.placeholder),
      ...(!credential && optionScalar(defaultValue) && { defaultValue }),
      ...(choices?.length && { options:choices.map(option=>option.value), choices }),
      ...(safeKey(field.visible_by) && { visibleBy:field.visible_by,visibleWhen:field.visible_when }),
      ...(!credential && optionScalar(field.gated_default) && { gatedDefault:field.gated_default }),
      ...(!credential && mapping(field.framework_defaults) && { frameworkDefaults:Object.fromEntries(
        Object.entries(field.framework_defaults).filter(([,value])=>optionScalar(value)),
      ) }),
      ...Object.fromEntries(['min', 'max', 'step'].filter(prop => Number.isFinite(field[prop])).map(prop => [prop,field[prop]])),
    };
  });
};

export function normalizeCacheProviderDocument(document, services) {
  const providers = Array.isArray(document) ? document : document?.providers;
  if (!Array.isArray(providers) || !providers.length || providers.length > 60) throw Error('请填写 1–60 个缓存提供方。');
  const seen = new Set();
  const definitions = providers.map(item => {
    const name = typeof item?.name === 'string' ? item.name.trim() : '';
    if (!name || seen.has(name.toLowerCase())) throw Error('每个缓存提供方都须有唯一的名称。');
    seen.add(name.toLowerCase());
    const builtin = cacheProviderDefinition(name);
    const runnerDependency = typeof item.runner_dependency==='string' ? item.runner_dependency.trim() : undefined;
    const runnerFrameworks = Array.isArray(item.runner_frameworks) ? item.runner_frameworks.map(frameworkFamily) : [];
    if (runnerDependency && ['versions','default_version','default_image','default_runtime_images'].some(key=>
      mapping(item[key]) || Array.isArray(item[key]) ? Object.keys(item[key]).length>0 : Boolean(item[key]))) {
      throw Error(`${name} 使用 runner_dependency 时不能同时指定版本或默认镜像。`);
    }
    const derived = runnerDependency==='lmcache' && (!runnerFrameworks.length || runnerFrameworks.includes('cuda'));
    const rawVersions = derived ? Object.keys(lmcacheReleases) : item.versions ??
      (runnerDependency ? [] : builtin?.versions ?? (item.custom_version === false ? [] : ['自定义']));
    const versionNames = mapping(rawVersions) ? Object.keys(rawVersions) : rawVersions;
    if (!Array.isArray(versionNames) || versionNames.some(version => typeof version !== 'string' || !version.trim())) {
      throw Error(`${name} 的版本须为版本列表或版本配置对象。`);
    }
    const releases = derived ? lmcacheReleases : mapping(rawVersions) ? Object.fromEntries(Object.entries(rawVersions).map(([version, release])=>{
      if (release != null && !mapping(release)) throw Error(`${name} 的 ${version} 版本格式无效。`);
      const image = imageReference(release?.image);
      const runtimeImages = mapping(release?.runtime_images) ? Object.fromEntries(Object.entries(release.runtime_images).map(([family,matrix])=>
        [family,Object.fromEntries(Object.entries(mapping(matrix) ? matrix : {}).flatMap(([runtime,reference])=>
          imageReference(reference) ? [[runtime,reference]] : []))])) : undefined;
      return [version,{
        frameworks:Object.keys(release?.runtime_images || {}).map(frameworkFamily),
        plainImage:Boolean(image),image,runtimeImages,
      }];
    })) : {};
    const versions = [...new Set([...versionNames, ...(item.custom_version ? ['custom'] : [])]
      .map(version => version.trim() === 'custom' ? '自定义' : version.trim()))];
    const l2Fields = item.l2_backends;
    if (l2Fields != null && (!l2Fields || typeof l2Fields !== 'object' || Array.isArray(l2Fields))) throw Error(`${name} 的 L2 后端定义格式错误。`);
    const l2 = l2Fields ? Object.fromEntries(Object.entries(l2Fields).map(([key, definition]) => {
      if (!safeKey(key) || !definition || typeof definition !== 'object') throw Error(`${name} 的 L2 后端定义格式错误。`);
      return [localized(definition.display_name) || key, declaredFields(definition.fields ?? [], key)];
    })) : undefined;
    const l2Adapters = l2Fields && Object.fromEntries(Object.entries(l2Fields).filter(([,definition])=>definition.adapter_flag_optional)
      .map(([key,definition])=>[localized(definition.display_name) || key,{
        label:localized(definition.adapter_flag_label) || '启用 L2 适配器参数',
        detail:localized(definition.description),defaultEnabled:definition.adapter_flag_default!==false,
      }]));
    const l2Keys = l2Fields && Object.fromEntries(Object.entries(l2Fields).map(([key,definition])=>[localized(definition.display_name) || key,key]));
    if (item.components != null && !mapping(item.components)) throw Error(`${name} 的组件定义格式错误。`);
    const components = item.components && Object.entries(item.components).map(([key,definition])=>{
      if (!safeKey(key) || !mapping(definition)) throw Error(`${name} 的组件定义格式错误。`);
      return { key,label:key,hints:flagHints(definition.common_parameters),
        ...(safeKey(definition.enabled_by) && { enabledBy:definition.enabled_by,enabledWhen:definition.enabled_when ?? true }),
      };
    });
    const ram = item.resource_profile?.ram_gib;
    const ramField = typeof ram === 'string' ? ram.match(/^\{\{\s*([a-z][a-z\d_]*)\s*\}\}$/i)?.[1] : undefined;
    return {
      name, ...providerPresentation(item,releases), versions,releases,legacyVersions:builtin?.legacyVersions,
      defaultVersion:derived ? Object.keys(lmcacheReleases)[0] : versions.includes(item.default_version) ? item.default_version : undefined,
      runnerDependency,runnerFrameworks,
      topology: item.topology || builtin?.topology || 'replicas', management: Boolean(item.management_url || builtin?.management),
      unavailable: Boolean(item.unavailable_reason || builtin?.unavailable),
      ...(Number.isFinite(ram) && ram >= 0 && { ramGiB: ram }),
      ...(ramField && { ramField }),
      ...(Array.isArray(item.fields) && { declaredFields: declaredFields(item.fields, name) }),
      ...(l2 && { l2,l2Adapters,l2Keys }),
      ...(components && { components }),
    };
  });
  const issue = cacheCatalogueChangeIssue(definitions,services);
  if (issue) throw Error(issue);
  return definitions;
}

export function cacheVersionsForProvider(provider, frameworks = [], selected) {
  const listed = provider?.versions || [];
  const upstream = listed.filter(version=>version !== '自定义');
  const runnable = upstream.filter(version=>{
    const release = provider?.releases?.[version];
    return !release?.frameworks.length || !frameworks.length || frameworks.some(family=>
      release.frameworks.includes(family) || family==='cpu' && release.plainImage);
  });
  const available = runnable.length ? runnable : upstream;
  const preferred = provider?.defaultVersion;
  const order = preferred && available.includes(preferred) ? [preferred,...available.filter(version=>version!==preferred)] : available;
  return [...new Set([...order,...(selected && (upstream.includes(selected) || provider?.legacyVersions?.includes(selected)) ? [selected] : []),
    ...(listed.includes('自定义') ? ['自定义'] : [])])];
}

function nativeField(field) {
  return {
    name:field.key,label:field.label,description:field.description || undefined,placeholder:field.placeholder || undefined,
    type:field.credential ? 'password' : field.type==='switch' ? 'boolean' : field.type==='select' ? 'string' : field.type,
    required:field.required || undefined,default:field.defaultValue,options:field.choices,
    framework_defaults:field.frameworkDefaults,min:field.min,max:field.max,step:field.step,
    visible_by:field.visibleBy,visible_when:field.visibleWhen,gated_default:field.gatedDefault,
  };
}

export function cacheProviderSourceDocument(definitions) {
  return definitions.map(provider=>{
    const available = provider.versions.filter(version=>version!=='自定义');
    return {
      name:provider.name,display_name:provider.displayName,source:provider.source,icon:provider.icon,
      description:provider.detail, topology:provider.topology==='single' ? 'replicas' : provider.topology,
      unavailable_reason:provider.unavailableReason || undefined,management_url:provider.management || undefined,
      links:provider.links.map(link=>({ label:link.text,url:link.url })),
      custom_version:provider.versions.includes('自定义') || undefined,
      runner_dependency:provider.runnerDependency || undefined,
      default_version:provider.runnerDependency ? undefined : provider.defaultVersion,
      versions:provider.runnerDependency ? undefined : Object.keys(provider.releases || {}).length > 0 ? Object.fromEntries(available.map(version=>[version,{
        image:provider.releases[version]?.image,runtime_images:provider.releases[version]?.runtimeImages,
      }])) : available,
      runner_frameworks:provider.runnerDependency ? provider.runnerFrameworks : undefined,
      inference_backend_integrations:provider.integrations,
      resource_profile:provider.ramField ? { ram_gib:`{{${provider.ramField}}}` } : provider.ramGiB!==undefined ? { ram_gib:provider.ramGiB } : undefined,
      fields:provider.declaredFields?.map(nativeField),
      components:provider.components && Object.fromEntries(provider.components.map(role=>[
        role.key,{ enabled_by:role.enabledBy,enabled_when:role.enabledWhen,common_parameters:role.hints },
      ])),
      l2_backends:provider.l2 && Object.fromEntries(Object.entries(provider.l2).map(([label,fields],position)=>{
        const adapter = provider.l2Adapters?.[label];
        return [provider.l2Keys?.[label] || 'tier_' + (position+1),{
          display_name:label,fields:fields.map(nativeField),
          ...(adapter && { adapter_flag_optional:true,adapter_flag_default:adapter.defaultEnabled,adapter_flag_label:adapter.label,
            description:adapter.detail || undefined }),
        }];
      })),
    };
  });
}

export function cacheL2Default(provider, type) {
  const definition = activeCacheProvider(provider);
  const fields = definition?.l2?.[type] || [];
  const adapter = definition?.l2Adapters?.[type];
  return { type, ...(adapter && { adapterEnabled: adapter.defaultEnabled }),
    ...Object.fromEntries(fields.filter(field => field.defaultValue !== undefined).map(field => [field.key, field.defaultValue])) };
}

export function cacheL2Values(entry) {
  if (!entry?.location) return entry;
  if (entry.type === '本地文件系统') return { ...entry, basePath: entry.basePath || entry.location };
  if (entry.type === 'Redis / Valkey' && !entry.host) {
    try {
      const url = new URL(entry.location);
      return { ...entry, host: url.hostname, port: Number(url.port) || 6379 };
    } catch { return entry; }
  }
  return entry.type === 'S3' ? { ...entry, endpoint: entry.endpoint || entry.location } : entry;
}

const safeAddress = value => /^https?:\/\/[^\s/@]+\.[^\s/@]+\/?$/i.test(value || '');
const isPath = value => /^\/[^\n\r]+$/.test(value || '') && !value.split('/').includes('..');

export function cacheL2Issue(provider, entries) {
  const definition = activeCacheProvider(provider);
  const types = new Set();
  for (const raw of entries) {
    const entry = cacheL2Values(raw);
    const fields = definition?.l2?.[entry.type];
    if (!fields || types.has(entry.type)) return '请选择提供方支持的 L2 存储后端，每种只可配置一次。';
    types.add(entry.type);
    const adapter = definition?.l2Adapters?.[entry.type];
    if (adapter && !(entry.adapterEnabled ?? adapter.defaultEnabled)) continue;
    for (const field of fields) {
      const value = entry[field.key];
      if (field.required && String(value ?? '').trim() === '') return `请填写 ${entry.type} 的${field.label}。`;
      if (field.options && value !== '' && value != null && !field.options.includes(value)) return `请选择有效的${field.label}。`;
      if (field.type === 'number' && value !== '' && value != null &&
          (!Number.isFinite(value) || value < (field.min ?? 0) || value > (field.max ?? Infinity) || field.step === 1 && !Number.isInteger(value))) {
        return `${entry.type} 的${field.label}超出允许范围。`;
      }
    }
    if (entry.type === '本地文件系统' && !isPath(entry.basePath)) return '基础路径须为节点上的绝对路径。';
    if (entry.type === 'Redis / Valkey' && !/^(?:[\w.-]+|\[[\da-f:]+\])$/i.test(entry.host)) return 'Redis / Valkey 主机不能包含协议、端口或凭证。';
    if (entry.type === 'S3' && !safeAddress(entry.endpoint)) return 'Bucket 地址须使用包含桶名的 HTTP(S) 主机名。';
  }
  return undefined;
}

const builtinAliases = {
  ram_size:'memoryGiB',eviction_policy:'evictionPolicy',eviction_trigger_watermark:'evictionWatermark',
  eviction_ratio:'evictionRatio',chunk_size:'chunkSize',enable_p2p:'enableP2P',
};

export function cacheFieldState(definition, values, framework, savedRow) {
  const fields = definition?.declaredFields || [];
  const byName = new Map(fields.map(field=>[field.key,field]));
  const resolved = new Map();
  const resolving = new Set();
  const resolve = field => {
    if (resolved.has(field.key)) return resolved.get(field.key);
    if (resolving.has(field.key)) return { visible:false };
    resolving.add(field.key);
    const legacy = cacheProviderDefinition(definition.name) && builtinAliases[field.key];
    const specified = values?.[field.key] ?? (legacy && savedRow ? savedRow[legacy] : undefined);
    const value = field.credential ? undefined : specified ?? field.frameworkDefaults?.[framework] ?? field.defaultValue;
    const parent = byName.get(field.visibleBy);
    const gate = parent ? resolve(parent) : { value:values?.[field.visibleBy],visible:true };
    const visible = !field.visibleBy || gate.visible && gate.value === field.visibleWhen;
    const state = { field,value,visible,effective:visible ? value : field.gatedDefault ?? value };
    resolving.delete(field.key);
    resolved.set(field.key,state);
    return state;
  };
  return fields.map(resolve);
}

export function cacheDeclaredValues(provider, values = {}, framework, savedRow) {
  const result = {};
  for (const { field,value,visible } of cacheFieldState(activeCacheProvider(provider),values,framework,savedRow)) {
    if (field.credential) continue;
    if (field.required && visible && String(value ?? '').trim() === '') throw Error(`请填写${field.label}。`);
    if (value === undefined || value === '') continue;
    if (field.options && !field.options.includes(value)) throw Error(`请选择有效的${field.label}。`);
    if (field.type === 'number' && (!Number.isFinite(value) || value < (field.min ?? -Infinity) || value > (field.max ?? Infinity) ||
      field.step === 1 && !Number.isInteger(value))) throw Error(`${field.label}超出允许范围。`);
    result[field.key] = value;
  }
  return result;
}

export function cacheRequestedMemory(draft, framework) {
  const provider = activeCacheProvider(draft.provider);
  if (provider?.ramField) {
    const state = cacheFieldState(provider,draft.providerValues,framework,draft).find(item=>item.field.key===provider.ramField);
    if (state?.effective !== undefined) return state.effective;
  }
  return Number.isFinite(draft.memoryGiB) ? draft.memoryGiB : provider?.ramGiB;
}
