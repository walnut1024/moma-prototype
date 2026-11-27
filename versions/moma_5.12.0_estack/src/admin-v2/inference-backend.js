import { dump, JSON_SCHEMA, load } from 'js-yaml';
import { resourceId } from '../resource-id.mjs';
import { communityBackendCatalogue } from './inference-backend-catalogue.js';
import { communityBackendDescriptions } from './inference-backend-community-descriptions.js';
import { gpuStackRunnerImages, gpuStackRunnerSnapshotDate } from './inference-runner-catalogue.js';

const customSuffix = '-custom';
const backendVersionPattern = /^[A-Za-z0-9._-]+$/;
const backendSources = ['内置', '社区', '自定义'];
const sourceKeys = { 内置: 'built_in', 社区: 'community', 自定义: 'custom' };
const field = (key, label, options) => ({ key, label, ...options });
const text = value => value == null ? '' : String(value).trim();
const removeSuffix = value => text(value).replace(/-custom$/, '');
const optionList = list => list.map(value => ({ value, label: value }));
const parameterLines = value => (Array.isArray(value) ? value : text(value).split(/\r?\n/)).map(text).filter(Boolean);
const protectedBackend = row => row?.source === '内置' || row?.source === '社区';
const officialRow = row => row?.ownerPrincipalId == null && row?.owner_principal_id == null;
const platformCommunity = row => row.source === '社区' && officialRow(row);
const removableBackend = row => !platformCommunity(row) && (row.source !== '内置' || !officialRow(row));
const isEnabled = row => row.status !== '已停用';
const scalar = value => ['string', 'number', 'boolean'].includes(typeof value);
const isObject = value => Boolean(value) && typeof value === 'object' && !Array.isArray(value);
const frameworksOf = entry => (Array.isArray(entry.frameworks) ? entry.frameworks : text(entry.framework).split(/\s*\/\s*/)).filter(Boolean);
const referenceNames = rows => [...new Set(rows.map(row => row.name || row.id))].join('、');

export const backendFrameworks = ['CUDA', 'ROCm', 'CANN', 'CPU', 'DTK', 'MUSA', 'CoreX', 'MACA', 'Neuware', 'HGGC', 'DCU', 'GCU', 'HYGON', 'METAX'];
export const backendFormFrameworks = [
  ['CUDA', 'NVIDIA'], ['ROCm', 'AMD'], ['CANN', '昇腾'], ['DTK', '海光'], ['MACA', '沐曦'],
  ['CoreX', '天数智芯'], ['MUSA', '摩尔线程'], ['Neuware', '寒武纪'], ['HGGC', '平头哥'], ['CPU', ''],
];
const commandArguments = '{{model_path}} --host {{worker_ip}} --port {{port}} --served-model-name {{model_name}}';
export const backendCommandPresets = {
  vLLM: { entrypoint: 'vllm serve', command: commandArguments },
  SGLang: { entrypoint: 'sglang serve', command: `--model-path ${commandArguments}` },
};
const backendSourceBase = 'https://ota.gpustack.ai/latest/';
export const backendSourceSlots = [
  { key: 'built-in-backend', label: '内置后端', url: backendSourceBase + 'runner.py.json' },
  { key: 'community-backend', label: '社区后端', url: backendSourceBase + 'community-inference-backends.yaml' },
];
export const backendSourceStorageKey = 'moma-5.12.0-estack:infrastructure:model-sources';
const noSourceSnapshot = '此 URL 没有可用的本地快照。';

export function backendSourceDraft(slot, previous) {
  return {
    url: text(previous?.url) || slot.url,
    remoteEnabled: previous?.remoteEnabled ?? previous?.mode !== '内置',
    officialHours: previous?.officialHours ?? (previous?.mode === '官方' && previous.autoUpdate === false ? 0 : 12),
    customHours: previous?.customHours ?? (previous?.mode === 'URL' && previous.autoUpdate ? 12 : 0),
    updatedAt: previous?.updatedAt || '',
    checkedAt: previous?.checkedAt || '',
    snapshotUrl: previous?.snapshotUrl || '',
    snapshotCount: previous?.snapshotCount ?? null,
    snapshotDate: previous?.snapshotDate || '',
    snapshotHash: previous?.snapshotHash || '',
    syncError: previous?.syncError || null,
  };
}

export function usesOfficialBackendSource(slot, draft) {
  const url = draft.url.trim();
  return !url || url.replace(/\/+$/, '') === slot.url;
}

export function backendSourceChanged(slot, draft, saved) {
  const sourceUrl = state => usesOfficialBackendSource(slot, state) ? '' : state.url.trim();
  return draft.remoteEnabled !== saved.remoteEnabled || sourceUrl(draft) !== sourceUrl(saved);
}

export function backendSourceHours(value) {
  return Math.min(168, Math.max(1, Math.round(Number(value) || 1)));
}

export function backendSourceUrlError(slot, draft) {
  if (usesOfficialBackendSource(slot, draft)) return '';
  let address;
  try { address = new URL(draft.url.trim()); }
  catch { return '请输入有效的 HTTP(S) 来源 URL。'; }
  if (!['http:', 'https:'].includes(address.protocol) || !address.hostname) return '请输入有效的 HTTP(S) 来源 URL。';
  const credentialKeys = /(?:^|[-_])(?:token|secret|credential|password|signature|api[-_]?key|access[-_]?key)(?:$|[-_])/i;
  if (address.username || address.password || [...address.searchParams.keys()].some(key => credentialKeys.test(key))) {
    return '来源 URL 不可包含访问凭证。';
  }
  return '';
}

export function backendSourceConfiguration(slot, draft) {
  const custom = !usesOfficialBackendSource(slot, draft);
  const urlError = backendSourceUrlError(slot, draft);
  if (urlError) throw Object.assign(Error(urlError), { field: 'url' });
  for (const hours of [draft.officialHours, draft.customHours]) {
    if (!Number.isInteger(hours) || hours < 0 || hours > 168) throw Error('更新间隔须为 1–168 小时的整数。');
  }
  return { ...draft, url: custom ? draft.url.trim() : '', mode: !draft.remoteEnabled ? '内置' : custom ? 'URL' : '官方',
    autoUpdate: Boolean(draft.remoteEnabled && (custom ? draft.customHours : draft.officialHours)) };
}

export function saveBackendSourceConfiguration(slot, draft) {
  const settings = backendSourceConfiguration(slot, draft);
  if (settings.mode === 'URL') throw Error(noSourceSnapshot);
  return settings;
}

export function backendSourceSnapshot(slot) {
  if (slot.key === 'built-in-backend') return {
    release: 'gpustack-runner 0.1.32.post5', date: gpuStackRunnerSnapshotDate, count: runnerVersionCount,
    entries: [...runnersByBackend.entries()].map(([name, versions]) => ({ name, versions: [...versions.keys()] })),
  };
  return {
    release: 'GPUStack 2.3.1', date: '', count: communityBackendCatalogue.length,
    entries: communityBackendCatalogue.map(({ name, versions }) => ({ name, versions: versions.map(entry => entry.version) })),
  };
}

export async function replayBackendSource(slot, draft, now = new Date()) {
  const settings = backendSourceConfiguration(slot, draft);
  if (!settings.remoteEnabled) throw Error('使用内置目录时无需同步。');
  const checkedAt = now.toISOString();
  if (settings.mode === 'URL') return { status: 'failed', settings: {
    ...settings, syncError: { url: settings.url, checkedAt, message: noSourceSnapshot },
  } };

  const snapshot = backendSourceSnapshot(slot);
  const content = slot.key === 'built-in-backend' ? gpuStackRunnerImages : [communityBackendCatalogue, communityBackendDescriptions];
  const digest = await globalThis.crypto.subtle.digest('SHA-256', new TextEncoder().encode(JSON.stringify(content)));
  const snapshotHash = Array.from(new Uint8Array(digest), byte => byte.toString(16).padStart(2, '0')).join('');
  const changed = settings.snapshotHash !== snapshotHash || settings.snapshotUrl !== slot.url;
  return { status: changed ? 'changed' : 'unchanged', settings: {
    ...settings, checkedAt, updatedAt: changed ? checkedAt : settings.updatedAt, snapshotUrl: slot.url,
    snapshotCount: snapshot.count, snapshotDate: snapshot.date || snapshot.release, snapshotHash, syncError: null,
  } };
}
const frameworkName = name => backendFrameworks.find(item => item.toLowerCase() === text(name).toLowerCase()) || text(name);

function normalizeEntry(entry) {
  const frameworks = [...new Set(frameworksOf(entry).map(frameworkName))];
  return { ...entry, version: text(entry.version), framework: frameworks.join(' / '), frameworks };
}

export function backendVersions(row) {
  if (!row) return [];
  const entries = Array.isArray(row.versionEntries) ? row.versionEntries : text(row.versions || row.version).split(/[、,，]/).map(text).filter(Boolean).map(version => ({
    version,
    framework: row.framework,
    image: version === row.version ? row.image : '',
    command: version === row.version ? row.command : '',
    entrypoint: version === row.version ? row.entrypoint : '',
  }));
  return entries.filter(entry => entry?.version).map(entry => ({
    ...normalizeEntry(entry),
    sourceManaged: entry.sourceManaged ?? (protectedBackend(row) && !entry.version.endsWith(customSuffix)),
  }));
}

const runnersByBackend = new Map();
for (const { service, version, ...image } of gpuStackRunnerImages) {
  const versions = runnersByBackend.get(service) ?? new Map();
  const variants = versions.get(version) ?? [];
  variants.push({ ...image, framework: frameworkName(image.framework) });
  versions.set(version, variants);
  runnersByBackend.set(service, versions);
}
const runnerVersionCount = [...runnersByBackend.values()].reduce((total, versions) => total + versions.size, 0);

export function backendAvailableVersions(row) {
  const saved = backendVersions(row);
  if (row?.source !== '内置' || !officialRow(row)) return saved;
  const runnerVersions = runnersByBackend.get(row.name);
  if (!runnerVersions) return saved;
  const versions = new Map(saved.map(entry => [entry.version, { ...entry, recordOnly: entry.sourceManaged }]));
  for (const [version, runnerImages] of runnerVersions.entries()) {
    const current = versions.get(version);
    if (current && !current.sourceManaged) continue;
    const frameworks = [...new Set(runnerImages.map(image => image.framework))];
    versions.set(version, { ...current, version, runnerImages, recordOnly: false, sourceManaged: true,
      frameworks, framework: frameworks.join(' / ') });
  }
  return [...versions.values()];
}

export function backendVersionRuntime(row, entry) {
  const preset = backendCommandPresets[row.name];
  return {
    command: entry.command || row.command || (row.source === '内置' ? preset?.command : undefined),
    entrypoint: entry.entrypoint || row.entrypoint || (row.source === '内置' ? preset?.entrypoint : undefined),
    commandInherited: !entry.command,
    entrypointInherited: !entry.entrypoint,
  };
}

export function backendFrameworkIndex(row, entries = backendVersions(row)) {
  const index = new Map();
  for (const entry of entries) {
    for (const framework of entry.frameworks) {
      if (!index.has(framework)) index.set(framework, []);
      index.get(framework).push(entry.version);
    }
  }
  return Object.fromEntries(index);
}

function storedEnv(value, path) {
  if (value == null || value === '') return {};
  const entries = (typeof value === 'string' ? value.split(/\r?\n/).filter(line => line.trim()).map(line => {
    const equals = line.indexOf('=');
    return equals > 0 ? [line.slice(0, equals), line.slice(equals + 1)] : [line, undefined];
  }) : isObject(value) ? Object.entries(value) : value);
  if (!Array.isArray(entries)) throw Error(`${path}须包含变量名和值。`);
  const result = {};
  for (const pair of entries) {
    const [key, value] = Array.isArray(pair) ? pair : [pair?.key, pair?.value];
    const name = text(key);
    if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(name) || !scalar(value)) throw Error(`${path}须包含有效的变量名和值。`);
    if (/(?:^|_)(?:TOKEN|SECRET|PASSWORD|API_KEY|CREDENTIAL|PRIVATE_KEY)(?:_|$)/i.test(name)) throw Error(`${path}不可保存访问密钥。`);
    if (Object.hasOwn(result, name)) throw Error(`${path}中的变量名不能重复。`);
    Object.defineProperty(result, name, { value: String(value), enumerable: true, configurable: true });
  }
  return result;
}

export function backendEnvironmentRows(value) {
  if (isObject(value)) return Object.entries(value).map(([key, value]) => ({ key, value }));
  return text(value).split(/\r?\n/).filter(Boolean).map(line => {
    const equals = line.indexOf('=');
    return { key: equals > 0 ? line.slice(0, equals) : line, value: equals > 0 ? line.slice(equals + 1) : '' };
  });
}

const storedFormat = value => value === 'equals' ? 'equal' : value || null;
const backendName = (name, current, mode) => {
  if (current) return mode === 'yaml' && name && name !== current.name ? name : current.name;
  return mode === 'form' && name ? `${removeSuffix(name)}${customSuffix}` : name;
};

export function initialBackendDraft(row, preset = {}) {
  const source = row?.source || '自定义';
  return {
    name: source === '自定义' ? removeSuffix(row?.name) : text(row?.name),
    description: row?.description || '', version: source === '社区' ? removeSuffix(row?.version) : text(row?.version),
    command: row?.command || '', entrypoint: row?.entrypoint || '', healthPath: row?.healthPath || '',
    parameterFormat: storedFormat(row?.parameterFormat), parameters: parameterLines(row?.parameters),
    commonParameters: parameterLines(row?.commonParameters), env: backendEnvironmentRows(row?.env),
    versionEntries: backendVersions(row).filter(entry => !entry.sourceManaged).map(entry => ({
      ...entry,
      version: protectedBackend(row) ? removeSuffix(entry.version) : entry.version,
      env: backendEnvironmentRows(entry.env),
    })),
    ...preset,
  };
}

export function updateBackendVersionDraft(draft, index, changes) {
  const previous = draft.versionEntries[index];
  const versionEntries = draft.versionEntries.map((entry, position) => index === position ? { ...entry, ...changes } : entry);
  const version = draft.version && previous.version === draft.version && changes.version != null
    ? changes.version : draft.version;
  return { versionEntries, version };
}

function editableVersionName(value, source, mode) {
  const version = text(value);
  return version && source !== '自定义' && mode === 'form' ? `${removeSuffix(version)}${customSuffix}` : version;
}

function versionFieldIssue(index, field, message) {
  return Object.assign(Error(message), { versionIndex: index, versionField: field });
}

const yamlFieldIssue = (message, ...yamlPath) => Object.assign(Error(message), { yamlPath: yamlPath.filter(key => key != null) });

export function validateBackendVersionEntries(entries, source = '自定义', mode = 'form') {
  if (!Array.isArray(entries)) throw Error('版本配置须包含版本列表。');
  const versions = new Set();
  for (const [index, entry] of entries.entries()) {
    const label = `版本 ${index + 1}`;
    const version = editableVersionName(entry?.version, source, mode);
    if (!version || version === customSuffix) throw versionFieldIssue(index, 'version', `请填写${label}的版本号。`);
    if (!backendVersionPattern.test(version)) throw versionFieldIssue(index, 'version', `${label}仅可使用字母、数字、点、下划线和连字符。`);
    if (source !== '自定义' && !version.endsWith(customSuffix)) throw versionFieldIssue(index, 'version', `${label}须以 -custom 结尾。`);
    if (versions.has(version)) throw versionFieldIssue(index, 'version', `版本号 ${version} 已存在。`);
    if (!text(entry.image) || /\s/.test(text(entry.image))) throw versionFieldIssue(index, 'image', `请填写${label}的镜像名称。`);
    if (mode === 'form' && !frameworkName(entry.framework)) throw versionFieldIssue(index, 'framework', `请选择${label}的支持框架。`);
    try { storedEnv(entry.env, `${label}的环境变量`); }
    catch (issue) { throw versionFieldIssue(index, 'env', issue.message); }
    versions.add(version);
  }
}

function backendReferences(records, row, version) {
  return (records.deployments || []).filter(record => [record, record.previousConfig].some(config =>
    (config?.backend === row.name || config?.inferenceBackend === row.name) &&
    (!version || (config.backendVersion || config.inferenceBackendVersion || row.version) === version)));
}

function deleteIssue(row, records) {
  const references = backendReferences(records, row);
  if (references.length) return `推理后端仍由以下部署或回滚配置引用：${referenceNames(references)}。`;
}

function withVersions(row, entries, version) {
  const active = entries.find(entry => entry.version === version) || entries[0];
  return {
    ...row, version, versionEntries: entries, versions: entries.map(entry => entry.version).join('、'),
    image: active?.image || '', framework: [...new Set(entries.flatMap(frameworksOf))].join(' / '),
  };
}

function prepareBackendDraft(draft, previous, mode) {
  const source = previous?.source || '自定义';
  const name = backendName(text(draft.name), previous, mode);
  if (!name || name === customSuffix || !previous && !name.endsWith(customSuffix)) throw yamlFieldIssue('请输入以 -custom 结尾的自定义后端名称。', 'backend_name');
  if (previous && name !== previous.name) throw yamlFieldIssue('推理后端名称无法修改。', 'backend_name');
  if (draft.healthPath && (!text(draft.healthPath).startsWith('/') || /\s/.test(text(draft.healthPath)))) throw yamlFieldIssue('健康检查路径须以 / 开头且不能包含空格。', 'health_check_path');
  if (![null, 'space', 'equal'].includes(storedFormat(draft.parameterFormat))) throw yamlFieldIssue('参数格式须为 space 或 equal。', 'parameter_format');
  try { validateBackendVersionEntries(draft.versionEntries, source, mode); }
  catch (issue) {
    const entry = draft.versionEntries?.[issue.versionIndex];
    const yamlKey = { image: 'image_name', framework: 'custom_framework', env: 'env' }[issue.versionField];
    issue.yamlPath = ['version_configs', entry?.version, yamlKey].filter(Boolean);
    throw issue;
  }
  if (source === '自定义' && !draft.versionEntries.length) throw yamlFieldIssue('请至少添加一个后端版本。', 'version_configs');

  const previousVersions = backendVersions(previous);
  const locked = previousVersions.filter(entry => entry.sourceManaged);
  const custom = draft.versionEntries.map(entry => normalizeEntry({
    version: editableVersionName(entry.version, source, mode), image: text(entry.image), framework: frameworkName(entry.framework),
    command: text(entry.command), entrypoint: text(entry.entrypoint), env: storedEnv(entry.env, `版本 ${entry.version} 的环境变量`), sourceManaged: false,
  }));
  const nextEntries = [...locked, ...custom];
  const versionNames = new Set(nextEntries.map(entry => entry.version));
  if (versionNames.size !== nextEntries.length) {
    throw yamlFieldIssue('自定义版本不能覆盖来源维护的版本。', 'version_configs', custom.find(entry => locked.some(saved => saved.version === entry.version))?.version);
  }
  const selected = text(draft.version);
  const version = source === '内置' ? previous.version : versionNames.has(selected) ? selected : editableVersionName(selected, source, mode);
  if (source === '内置' && mode === 'yaml' && selected && selected !== previous.version) throw yamlFieldIssue('内置后端的默认版本由系统管理。', 'default_version');
  if (version && !versionNames.has(version)) throw yamlFieldIssue(`默认版本 ${version} 不在版本列表中。`, 'default_version');
  const removedVersions = previousVersions.filter(entry => !versionNames.has(entry.version));
  let env;
  try { env = storedEnv(draft.env, '默认环境变量'); }
  catch (issue) { throw Object.assign(issue, { yamlPath: ['default_env'] }); }
  return { source, name, nextEntries, version, removedVersions, env };
}

export function saveInferenceBackend(latest, records, draft, { current, mode = 'form', now = new Date() } = {}) {
  const previous = current && latest.find(row => row.id === current.id);
  if (current && (!previous || JSON.stringify(previous) !== JSON.stringify(current))) throw Error('后端已更新，请重新打开后编辑。');
  const { name, source, nextEntries, version, removedVersions, env } = prepareBackendDraft(draft, previous, mode);
  if (!previous && latest.some(row => row.name.toLowerCase() === name.toLowerCase())) throw yamlFieldIssue(`已存在同名后端 ${name}。`, 'backend_name');
  for (const removed of removedVersions) {
    const references = backendReferences(records, previous, removed.version);
    if (references.length) throw yamlFieldIssue(`版本 ${removed.version} 仍由以下部署或回滚配置引用：${referenceNames(references)}。`, 'version_configs', removed.version);
  }

  const updated = withVersions({
    ...(previous || { id: resourceId('backend'), status: '已启用', createdAt: now.toISOString() }),
    name, source, description: text(draft.description), healthPath: text(draft.healthPath),
    command: text(draft.command), entrypoint: text(draft.entrypoint),
    parameterFormat: storedFormat(draft.parameterFormat), parameters: parameterLines(draft.parameters),
    commonParameters: parameterLines(draft.commonParameters), env,
    updatedAt: now.toISOString(),
  }, nextEntries, version);
  return previous ? latest.map(row => row.id === previous.id ? updated : row) : [updated, ...latest];
}

function yamlFields(version, { sourceManaged, frameworks, framework, image, entrypoint, command, env }) {
  return [version, {
    image_name: image || undefined,
    built_in_frameworks: sourceManaged ? frameworks.map(item => item.toLowerCase()) : undefined,
    custom_framework: sourceManaged ? undefined : text(framework).toLowerCase() || null,
    run_command: command || null, entrypoint: entrypoint || undefined,
    env: isObject(env) ? env : Object.fromEntries(backendEnvironmentRows(env).map(row => [row.key, row.value])),
  }];
}

export function backendYaml(row, { forEditor = false } = {}) {
  const definitions = forEditor ? backendVersions(row) : backendAvailableVersions(row);
  const managed = definitions.filter(entry => entry.sourceManaged);
  const managedYaml = entry => yamlFields(entry.version, entry.runnerImages
    ? { frameworks: entry.frameworks, sourceManaged: true } : entry);
  return dump({
    backend_name: forEditor ? undefined : row.name,
    backend_source: forEditor ? undefined : sourceKeys[row.source],
    enabled: forEditor ? undefined : isEnabled(row),
    built_in_version_configs: !forEditor && managed.length ? Object.fromEntries(managed.map(managedYaml)) : undefined,
    default_version: forEditor && row.source === '内置' ? undefined : row.version || '',
    version_configs: Object.fromEntries(definitions.filter(entry => !entry.sourceManaged).map(entry => yamlFields(entry.version, entry))),
    description: row.description || undefined,
    health_check_path: row.healthPath || undefined,
    default_run_command: row.command || undefined,
    default_entrypoint: forEditor ? undefined : row.entrypoint || undefined,
    default_backend_param: parameterLines(row.parameters), common_parameters: parameterLines(row.commonParameters),
    default_env: isObject(row.env) ? row.env : Object.fromEntries(backendEnvironmentRows(row.env).map(item => [item.key, item.value])),
    parameter_format: storedFormat(row.parameterFormat) || undefined,
  }, { noRefs: true, lineWidth: 100 });
}

export const backendYamlTemplate = `# 版本、容器镜像和运行框架配置示例\nbackend_name: example-custom\nversion_configs:\n  v1.0.0:\n    image_name: registry.example.com/inference/example:v1.0.0\n    run_command: null\n    custom_framework: cuda\ndefault_version: v1.0.0\nhealth_check_path: /health\n`;

export function decodeBackendYaml(content) {
  if (typeof content !== 'string' || !content.trim()) throw yamlFieldIssue('请输入 YAML 配置。');
  if (new TextEncoder().encode(content).length > 4 * 1024 * 1024) throw Error('YAML 文件不能超过 4 MiB。');
  const document = load(content, { schema: JSON_SCHEMA });
  if (!isObject(document)) throw yamlFieldIssue('YAML 须为推理后端配置对象。');
  return document;
}

const isString = value => typeof value === 'string';
const isOptionalString = value => value === null || isString(value);
const isStringArray = value => Array.isArray(value) && value.every(isString);
const isOptionalStringMap = value => value === null || isObject(value) && Object.values(value).every(isString);
const exportedBackendSources = Object.values(sourceKeys);
const yamlParameterFormats = ['space', 'equal', null];
const yamlCommonFields = {
  description: ['description', isOptionalString, '字符串或 null', false, [null]],
  health_check_path: ['healthPath', isOptionalString, '以 / 开头的路径或 null', false, [null]],
  default_run_command: ['command', isOptionalString, '字符串或 null', false, [null]],
  parameter_format: ['parameterFormat', value => yamlParameterFormats.includes(value), 'space、equal 或 null', false, yamlParameterFormats],
  default_backend_param: ['parameters', isStringArray, '字符串数组'],
  common_parameters: ['commonParameters', isStringArray, '字符串数组'],
  default_env: ['env', isOptionalStringMap, '字符串键值对或 null', false, [null]],
};
const yamlVersionFields = {
  image_name: [isString, '字符串', true],
  run_command: [isOptionalString, '字符串或 null', true, [null]],
  entrypoint: [isOptionalString, '字符串或 null', false, [null]],
  custom_framework: [isOptionalString, '字符串或 null', false, [null]],
};
const yamlWritableVersionFields = { ...yamlVersionFields, env: [isOptionalStringMap, '字符串键值对或 null', false, [null]] };
const yamlManagedVersionFields = { ...yamlVersionFields, built_in_frameworks: [isStringArray, '字符串数组'] };

function yamlBackendFields(row) {
  const builtInEditor = row?.source === '内置';
  return {
    ...(!row && { backend_name: ['name', isString, '以 -custom 结尾的字符串', true] }),
    ...(!builtInEditor && { default_version: ['version', isString, '已有版本号或空字符串', true] }),
    version_configs: [null, isObject, builtInEditor ? '以 -custom 结尾的版本号为键' : '以版本号为键的映射', true],
    ...yamlCommonFields,
    ...(!row && {
      default_entrypoint: ['entrypoint', isOptionalString, '字符串或 null', false, [null]],
      is_built_in: [null, value => typeof value === 'boolean', '布尔值', false, [true, false]],
      built_in_version_configs: [null, isObject, '由来源维护的版本映射'],
      framework_index_map: [null, value => isObject(value) && Object.entries(value).every(([key, versions]) =>
        backendVersionPattern.test(key) && isStringArray(versions)), '框架到版本数组的映射'],
    }),
  };
}

export function backendYamlFieldHints(row) {
  const versionHints = fields => Object.entries(fields).map(([key, [, type, required = false, values]]) => ({ key, type, required, values }));
  return {
    fields: Object.entries(yamlBackendFields(row)).map(([key, [, , type, required = false, values]]) => ({ key, type, required, values })),
    versionFields: versionHints(yamlWritableVersionFields),
    managedVersionFields: row ? [] : versionHints(yamlManagedVersionFields),
  };
}

// GPUStack backend editor schemas: create.json, update-custom.json and update-builtin.json.
function validateYamlVersions(configs, fieldName, { managed = false, builtInEditor = false } = {}) {
  if (!isObject(configs)) throw yamlFieldIssue(`${fieldName} 须包含以版本号为键的配置对象。`, fieldName);
  const fields = managed ? yamlManagedVersionFields : yamlWritableVersionFields;
  for (const [version, definition] of Object.entries(configs)) {
    const path = [fieldName, version];
    if (!backendVersionPattern.test(version)) throw yamlFieldIssue(`版本 ${version} 仅可使用字母、数字、点、下划线和连字符。`, ...path);
    if (builtInEditor && !version.endsWith(customSuffix)) throw yamlFieldIssue(`版本 ${version} 须以 -custom 结尾。`, ...path);
    if (!isObject(definition)) throw yamlFieldIssue(`版本 ${version} 的 YAML 配置须为对象。`, ...path);
    if (!Object.hasOwn(definition, 'image_name')) throw yamlFieldIssue(`版本 ${version} 须包含 image_name。`, ...path, 'image_name');
    if (!Object.hasOwn(definition, 'run_command')) throw yamlFieldIssue(`版本 ${version} 须包含 run_command，可填写 null 以使用默认执行命令。`, ...path, 'run_command');
    for (const [key, value] of Object.entries(definition)) {
      if (!Object.hasOwn(fields, key)) throw yamlFieldIssue(`版本 ${version} 包含不支持的字段 ${key}。`, ...path, key);
      if (!fields[key][0](value)) throw yamlFieldIssue(`版本 ${version} 的 ${key} 值类型无效。`, ...path, key);
    }
  }
}

export function backendYamlEditorDraft(content, row) {
  const document = decodeBackendYaml(content);
  const create = !row;
  const builtInEditor = row?.source === '内置';
  const fields = yamlBackendFields(row);
  const draft = { ...initialBackendDraft(row), name: row?.name || '', version: row?.version || '' };
  if (create && (!isString(document.backend_name) || !/^.+-custom$/.test(document.backend_name))) {
    throw yamlFieldIssue('请输入以 -custom 结尾的自定义后端名称。', 'backend_name');
  }
  if (!builtInEditor && !isString(document.default_version)) throw yamlFieldIssue('YAML 须包含字符串类型的 default_version。', 'default_version');
  if (row && Object.hasOwn(document, 'backend_name') && document.backend_name !== row.name) throw yamlFieldIssue('推理后端名称无法修改。', 'backend_name');
  for (const [key, value] of Object.entries(document)) {
    if (key === 'version_configs') continue;
    // A YAML export describes the original backend; the save action owns its source and enabled state.
    if (key === 'backend_source' || key === 'enabled') {
      const valid = key === 'backend_source' ? exportedBackendSources.includes(value) : typeof value === 'boolean';
      if (value !== null && !valid) throw yamlFieldIssue(`${key} 的值类型无效。`, key);
      continue;
    }
    if (!Object.hasOwn(fields, key)) throw yamlFieldIssue(`YAML 包含不支持的字段 ${key}。`, key);
    const [property, valid] = fields[key];
    if (key === 'built_in_version_configs') validateYamlVersions(value, key, { managed: true });
    else if (!valid(value)) throw yamlFieldIssue(`${key} 的值类型无效。`, key);
    if (property) draft[property] = value;
  }
  validateYamlVersions(document.version_configs, 'version_configs', { builtInEditor });
  draft.versionEntries = Object.entries(document.version_configs).map(([version, definition]) => ({
    version, image: definition.image_name, framework: definition.custom_framework, command: definition.run_command,
    entrypoint: definition.entrypoint, env: definition.env,
  }));
  prepareBackendDraft(draft, row, 'yaml');
  return draft;
}

function yamlNodeAtPath(content, path) {
  // js-yaml's listener gives source marks for block and flow keys, including quoted keys.
  const stack = [];
  let root;
  load(content, { schema: JSON_SCHEMA, listener(event, state) {
    if (event === 'open') {
      stack.push({ start: state.position, children: [] });
      return;
    }
    const node = stack.pop();
    Object.assign(node, { end: state.position, kind: state.kind, key: state.kind === 'scalar' ? String(state.result) : '' });
    if (stack.length) stack.at(-1).children.push(node);
    else root = node;
  } });
  let mapping = root;
  let closest;
  for (const key of path) {
    while (mapping?.children.length === 1 && mapping.children[0].kind === 'mapping') mapping = mapping.children[0];
    if (mapping?.kind !== 'mapping') break;
    const index = mapping.children.findIndex((node, offset) => offset % 2 === 0 && node.kind === 'scalar' && node.key === key);
    if (index < 0) break;
    closest = mapping.children[index];
    mapping = mapping.children[index + 1];
  }
  return closest;
}

export function backendYamlIssueLocation(content, issue) {
  const mark = issue?.mark;
  if (!mark && !issue?.yamlPath) return null;
  const node = !mark && issue.yamlPath.length ? yamlNodeAtPath(content, issue.yamlPath) : null;
  const bom = content.charCodeAt(0) === 0xfeff ? 1 : 0;
  const start = Math.min((mark?.position ?? node?.start ?? 0) + bom, content.length);
  const end = Math.min(node ? node.end + bom : start, content.length);
  const prefix = content.slice(bom, start).split(/\r\n|[\n\r]/);
  return { start, end, line: prefix.length, column: prefix.at(-1).length + 1 };
}

function candidateId(name) { return `community:${name}`; }

export function communityBackendCandidates(rows) {
  const names = new Set(communityBackendCatalogue.map(row => row.name));
  const known = communityBackendCatalogue.map(definition => {
    const current = rows.find(row => row.name === definition.name && platformCommunity(row));
    const frameworkVersions = backendFrameworkIndex({ versionEntries: definition.versions });
    return { id: candidateId(definition.name), name: definition.name, description: definition.description, repository: definition.repository,
      markdownDescription: communityBackendDescriptions[definition.name],
      frameworks: Object.keys(frameworkVersions), frameworkVersions, enabled: Boolean(current && isEnabled(current)) };
  });
  return [...known, ...rows.filter(row => platformCommunity(row) && !names.has(row.name)).map(row => {
    const frameworkVersions = backendFrameworkIndex({ versionEntries: backendVersions(row).filter(entry => entry.sourceManaged) });
    return { id: candidateId(row.name), name: row.name, description: row.description, repository: row.repository,
      frameworks: Object.keys(frameworkVersions), frameworkVersions, enabled: isEnabled(row) };
  })];
}

export function enableCommunityBackend(latest, candidate, now = new Date()) {
  const current = latest.find(row => candidateId(row.name) === candidate.id && platformCommunity(row));
  const definition = communityBackendCatalogue.find(row => candidateId(row.name) === candidate.id);
  if (current) {
    const entries = backendVersions(current);
    const { versions = [], version: sourceDefault, ...sourceFields } = definition || {};
    const available = new Map(versions.map(entry => [entry.version, normalizeEntry({ ...entry, sourceManaged: true })]));
    const existingDefault = entries.find(entry => entry.version === current.version);
    const outdatedDefault = existingDefault?.sourceManaged && available.size > 0 && !available.has(existingDefault.version);
    const useSourceDefault = current.version == null || (outdatedDefault && available.has(sourceDefault));
    const normalized = new Map(entries.map(entry => [entry.version, entry.sourceManaged
      ? available.get(entry.version) ?? { ...entry, ...(available.size ? { recordOnly: true } : {}) } : entry]));
    for (const [version, entry] of available) if (!normalized.has(version)) normalized.set(version, entry);
    const missingFields = Object.fromEntries(Object.entries(sourceFields).filter(([key]) => current[key] == null));
    const enabled = withVersions({ ...current, ...missingFields, status: '已启用', updatedAt: now.toISOString() },
      [...normalized.values()], useSourceDefault ? sourceDefault || '' : current.version);
    return latest.map(row => row.id === current.id ? enabled : row);
  }
  if (!definition) throw Error('社区后端已不存在，请刷新后重试。');
  if (latest.some(row => row.name.toLowerCase() === definition.name.toLowerCase())) throw Error(`已存在同名后端 ${definition.name}。`);
  const { versions, version = '', ...fields } = definition;
  return [withVersions({ ...fields, id: resourceId('backend'), source: '社区', status: '已启用', createdAt: now.toISOString() },
    versions.map(entry => normalizeEntry({ ...entry, sourceManaged: true })), version), ...latest];
}

export const INFERENCE_BACKEND_PAGE = {
  title: '推理后端',
  createLabel: '添加后端',
  searchPlaceholder: '名称查询', searchKeys: ['name', 'description'],
  views: ['cards'], loadMore: true, loadOnScroll: true, initialPageSize: 24, actionsInToolbar: true, hideResetFilter: true,
  actionMenu: true, detailModal: '版本列表', detailWidth: 'min(600px, calc(100vw - 32px))',
  columns: [field('name', '名称')],
  filters: [field('source', '来源', { options: optionList(backendSources) })],
  fields: [field('name', '名称')],
  editable: true, deletable: removableBackend, canDelete: deleteIssue,
  showRow: row => row.source !== '社区' || isEnabled(row),
  actions: [
    { label: '导出 YAML', download: row => ({ name: `${row.name.replace(/[\\/]/g, '-')}.yaml`, content: backendYaml(row), type: 'application/yaml' }) },
    { label: '删除', danger: true, when: platformCommunity,
      confirm: row => `删除「${row.name}」？可在社区市场重新启用。`,
      apply: (row, records) => {
        const issue = deleteIssue(row, records);
        if (issue) throw Error(issue);
        return { status: '已停用' };
      } },
  ],
  seed: [
    { id: 'backend-vllm', name: 'vLLM', source: '内置', version: '0.23.0', versions: '0.23.0、0.21.0', framework: 'CUDA / ROCm / CANN', status: '已启用', description: '通用高吞吐语言模型推理。', healthPath: '/health' },
    { id: 'backend-sglang', name: 'SGLang', source: '内置', version: '0.5.10', versions: '0.5.10、0.5.9', framework: 'CUDA / ROCm / CANN', status: '已启用', description: '支持结构化生成与前缀缓存。', healthPath: '/health' },
    { id: 'backend-mindie', name: 'MindIE', source: '内置', version: '2.3', versions: '2.3、2.2', framework: 'CANN', status: '已启用', description: '用于昇腾设备上的模型推理。' },
    { id: 'backend-voxbox', name: 'VoxBox', source: '内置', version: '0.1.0', versions: '0.1.0', framework: 'CUDA / CPU', status: '已启用', description: '支持语音类模型推理。' },
    { id: 'backend-llamacpp', name: 'llama.cpp', source: '社区', version: 'b7500', versions: 'b7500', framework: 'CUDA', status: '已停用', description: '用于部署 GGUF 权重。' },
    { id: 'backend-rerank-custom', name: 'rerank-custom', source: '自定义', version: 'v1.6.2', versions: 'v1.6.2', framework: 'CUDA', status: '已启用', image: 'registry.example.com/inference/rerank:v1.6.2', command: 'serve {{model_path}} --port {{port}}', healthPath: '/health', createdAt: '2026-11-23 11:42:00' },
  ],
};
