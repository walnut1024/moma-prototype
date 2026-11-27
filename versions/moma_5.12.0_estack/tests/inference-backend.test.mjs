import assert from 'node:assert/strict';
import test from 'node:test';
import {
  backendAvailableVersions, backendEditableVersionName, backendFrameworkIndex, backendSourceChanged, backendSourceConfiguration, backendSourceDraft, backendSourceHours, backendSourceSlots, backendSourceSnapshot,
  backendVersionRuntime, backendVersions, backendYaml, backendYamlEditorDraft, backendYamlFieldHints, backendYamlIssueLocation, backendYamlTemplate, communityBackendCandidates,
  decodeBackendYaml, enableCommunityBackend, INFERENCE_BACKEND_PAGE, initialBackendDraft, replayBackendSource,
  saveBackendSourceConfiguration, saveInferenceBackend, updateBackendVersionDraft, validateBackendVersionEntries,
} from '../src/admin-v2/inference-backend.js';
import { communityProjectUrl, parseCommunityMarkdown } from '../src/admin-v2/inference-backend-community-markdown.js';
import { backendYamlCompletion, backendYamlNewline, backendYamlPair } from '../src/admin-v2/inference-backend-yaml-completion.js';

const seed = INFERENCE_BACKEND_PAGE.seed;
const byName = (rows, name) => rows.find(row => row.name === name);
const version = (name, patch = {}) => ({
  version: name, image: `registry.example.org/inference/example:${name}`, framework: 'CUDA',
  command: 'serve {{model_path}} --port {{port}}', env: [], ...patch,
});

test('backend form and YAML create equivalent custom rows and reject bad versions without saving', () => {
  const parameters = ['--max-model-len=1024', '--served-model-name example'];
  const commonParameters = ['--max-model-len', '--served-model-name'];
  const draft = { ...initialBackendDraft(), name: 'form-created', parameters, commonParameters, parameterFormat: 'equal',
    version: 'v2', versionEntries: [version('v1'), version('v2', { env: [{ key: 'WORKERS', value: '3' }] })] };
  const formRow = saveInferenceBackend(seed, {}, draft)[0];
  assert.equal(formRow.name, 'form-created-custom');
  const decoded = backendYamlEditorDraft(backendYaml(formRow, { forEditor: true }), formRow);
  assert.deepEqual(decoded.parameters, parameters);
  assert.deepEqual(decoded.commonParameters, commonParameters);
  assert.equal(decoded.parameterFormat, 'equal');
  assert.equal(decoded.version, 'v2');
  assert.deepEqual(decoded.versionEntries[1].env, { WORKERS: '3' });
  assert.equal(saveInferenceBackend(seed, {}, backendYamlEditorDraft(backendYamlTemplate), { mode: 'yaml' })[0].name, 'example-custom');
  assert.throws(() => saveInferenceBackend(seed, {}, { ...draft, version: 'unknown' }), /不在版本列表/);
  assert.throws(() => saveInferenceBackend(seed, {}, { ...draft, versionEntries: [version('v2'), version('v2')] }), /版本号 v2 已存在/);
  assert.throws(() => saveInferenceBackend(seed, {}, { ...draft, versionEntries: [version('v 2')] }), /仅可使用/);
  assert.throws(() => saveInferenceBackend(seed, {}, { ...draft, versionEntries: [version('v2', { framework: '' })] }), /支持框架/);
  assert.throws(() => saveInferenceBackend(seed, {}, { ...draft, versionEntries: [version('v2', { image: '' })] }), /镜像名称/);
  assert.throws(() => saveInferenceBackend(seed, {}, { ...draft, env: [{ key: 'OPENAI_API_KEY', value: 'example' }] }), /不可保存访问密钥/);
  assert.throws(() => backendYamlEditorDraft('backend_name: broken-custom\ndefault_version: ""\nversion_configs: []'), /配置对象/);
  assert.throws(() => backendYamlEditorDraft(`${backendYamlTemplate}\ndefault_env:\n  WORKERS: 3\n`), /default_env 的值类型无效/);
});

test('built-in versions remain read-only and added versions receive the suffix in form mode', () => {
  const original = byName(seed, 'vLLM');
  const options = { current: original };
  const draft = { ...initialBackendDraft(original), versionEntries: [version('lab')] };
  const row = byName(saveInferenceBackend(seed, {}, draft, options), 'vLLM');
  assert.equal(row.id, original.id);
  assert.equal(row.version, original.version);
  assert.deepEqual(backendVersions(row).map(entry => [entry.version, entry.sourceManaged]), [
    ['0.23.0', true], ['0.21.0', true], ['lab-custom', false],
  ]);
  assert.deepEqual(backendFrameworkIndex(row).ROCm, ['0.23.0', '0.21.0']);
  assert.throws(() => saveInferenceBackend(seed, {}, { ...draft, name: 'rename' }, { ...options, mode: 'yaml' }), /名称无法修改/);
  assert.throws(() => saveInferenceBackend(seed, {}, { ...draft, version: 'lab-custom', versionEntries: [version('lab-custom')] }, { ...options, mode: 'yaml' }), /默认版本由系统管理/);
  assert.throws(() => saveInferenceBackend(seed, {}, draft, { ...options, mode: 'yaml' }), /须以 -custom/);
  assert.equal(INFERENCE_BACKEND_PAGE.deletable(original), false);
  const builtInEditorYaml = backendYaml(row, { forEditor: true });
  assert.doesNotMatch(builtInEditorYaml, /backend_name|default_version|built_in_version_configs/);
  assert.deepEqual(backendYamlEditorDraft(builtInEditorYaml, row).versionEntries.map(entry => entry.version), ['lab-custom']);
});

test('YAML editor reports syntax locations and configuration errors before any write', () => {
  const builtIn = byName(seed, 'vLLM');
  assert.equal(backendYamlEditorDraft(backendYamlTemplate).name, 'example-custom');
  assert.throws(() => backendYamlEditorDraft('backend_name: [invalid'), issue => issue.mark.line === 1);
  assert.throws(() => backendYamlEditorDraft(backendYamlTemplate.replace('default_version: v1.0.0', 'default_version: unknown')), /不在版本列表/);
  assert.throws(() => backendYamlEditorDraft(backendYamlTemplate.replace('example-custom', 'example')), /以 -custom/);
  assert.throws(() => backendYamlEditorDraft(backendYamlTemplate, builtIn), /名称无法修改/);
  assert.equal(backendYamlEditorDraft(backendYaml(builtIn, { forEditor: true }), builtIn).name, builtIn.name);
  assert.throws(() => backendYamlEditorDraft(backendYamlTemplate.replace('    run_command: null\n', '')), /须包含 run_command/);
  assert.throws(() => backendYamlEditorDraft(backendYamlTemplate.replace('default_version: v1.0.0\n', '')), /须包含字符串类型的 default_version/);
  assert.throws(() => backendYamlEditorDraft(backendYamlTemplate + 'model_source: example\n'), /不支持的字段 model_source/);
  assert.throws(() => backendYamlEditorDraft(backendYamlTemplate.replace('    run_command: null', '    run_command: null\n    customImage: bogus')), /不支持的字段 customImage/);
});

test('YAML field hints follow the current create, built-in and custom schemas', () => {
  const create = backendYamlFieldHints();
  assert.deepEqual(create.fields.filter(field => field.required).map(field => field.key), [
    'backend_name', 'default_version', 'version_configs',
  ]);
  assert.deepEqual(create.versionFields.filter(field => field.required).map(field => field.key), ['image_name', 'run_command']);
  assert(create.fields.some(field => field.key === 'built_in_version_configs'));
  assert(create.managedVersionFields.some(field => field.key === 'built_in_frameworks'));
  const builtIn = backendYamlFieldHints(byName(seed, 'vLLM'));
  assert.deepEqual(builtIn.fields.filter(field => field.required).map(field => field.key), ['version_configs']);
  assert.match(builtIn.fields.find(field => field.key === 'version_configs').type, /-custom/);
  assert.deepEqual(builtIn.managedVersionFields, []);
  const user = backendYamlFieldHints({ source: '自定义' });
  assert.deepEqual(user.fields.filter(field => field.required).map(field => field.key), ['default_version', 'version_configs']);
  assert(!user.fields.some(field => field.key === 'backend_name'));
});

test('YAML completion follows each schema, ignores siblings and preserves the rest of an edited key', () => {
  const hints = backendYamlFieldHints();
  const builtIn = backendYamlFieldHints(byName(seed, 'vLLM'));
  const createText = 'def~\ndefault_env: {}\ndefault_backend_param: []';
  // Use a separate caret marker so the completion engine sees the document as the editor does.
  const at = (content, schema = hints, explicit = false) => {
    const caret = content.indexOf('~');
    return backendYamlCompletion(content.replace('~', ''), caret, schema, { explicit });
  };
  assert.deepEqual(at(createText).options.map(option => option.label), ['default_version', 'default_run_command', 'default_entrypoint']);
  assert.deepEqual(at(createText, builtIn).options.map(option => option.label), ['default_run_command']);
  assert.equal(at('backend_na~: custom-custom').options[0].insert, 'backend_name');
  assert.equal(at('backend_name~').options[0].insert, 'backend_name: ');
  assert.equal(at('backend_na~', backendYamlFieldHints({ source: '自定义' })), null);
  assert.equal(at('~'), null);
  assert(at('~', hints, true).options.some(option => option.label === 'backend_name'));

  const version = at('version_configs:\n  "v1.0":\n    ima~\n    run_command: null');
  assert.equal(version.options[0].insert, 'image_name: ');
  assert.deepEqual(at('built_in_version_configs:\n  v1:\n    buil~').options.map(option => option.label), ['built_in_frameworks']);
  assert.equal(at('built_in_version_configs:\n  v1:\n    buil~', builtIn), null);
  assert.equal(at('version_configs:\n  v1:\n    env:\n      ima~'), null);
  assert.equal(at('version_configs:\n  v1:\n    run_command: |\n      ima~'), null);
  assert.equal(at('# backend_na~'), null);
});

test('YAML completion inserts declared scalars and edits indentation and paired characters locally', () => {
  const hints = backendYamlFieldHints();
  const at = (content, caret = content.length) => backendYamlCompletion(content, caret, hints);
  const choices = at('parameter_format:');
  assert.deepEqual(choices.options.map(option => option.insert), [' space', ' equal', ' null']);
  assert.deepEqual(at('parameter_format: eq # keep', 'parameter_format: eq'.length).options.map(option => option.insert), ['equal']);
  assert.deepEqual(at('is_built_in: ').options.map(option => option.insert), ['true', 'false']);
  assert.deepEqual(at('version_configs:\n  v1:\n    run_command: n').options.map(option => option.insert), ['null']);
  assert.equal(at('version_configs:\n  v1:\n    image_name: n'), null);
  assert.equal(backendYamlNewline('version_configs:\n  v1:', 22), '\n    ');
  assert.equal(backendYamlNewline('  image_name: image', 19), '\n  ');
  assert.deepEqual(backendYamlPair('env: ', 5, 5, '{'), { insert: '{}', selection: [6, 6] });
  assert.deepEqual(backendYamlPair('description: text', 13, 17, '"'), { insert: '"text"', selection: [14, 18] });
  assert.equal(backendYamlPair("description: user", 17, 17, "'"), null);
});

test('YAML locations select the failing field or its nearest parent with the correct line offsets', () => {
  const check = (content, classify) => assert.throws(() => backendYamlEditorDraft(content), issue => {
    const position = backendYamlIssueLocation(content, issue);
    classify(issue, position, content.slice(position.start, position.end));
    return true;
  });
  const quoted = '\uFEFF# backend_name: ignore\r\nbackend_name: legal-custom\r\nversion_configs:\r\n  v1: {image_name: image, run_command: null, entrypoint: serve}\r\n  "v2.0": {image_name: image, run_command: null, "entrypoint": 3}\r\ndefault_version: v1\r\n';
  check(quoted, (issue, position, selected) => {
    assert.deepEqual(issue.yamlPath, ['version_configs', 'v2.0', 'entrypoint']);
    assert.equal(position.line, 5);
    assert.equal(position.column, quoted.split('\r\n')[4].indexOf('"entrypoint"') + 1);
    assert.equal(selected, '"entrypoint"');
  });
  const flow = '{backend_name: legal-custom, default_version: v1, version_configs: {v1: {image_name: image}}}';
  check(flow, (issue, position, selected) => {
    assert.deepEqual(issue.yamlPath, ['version_configs', 'v1', 'run_command']);
    assert.equal(position.line, 1);
    assert.equal(selected, 'v1');
  });
  check(backendYamlTemplate.replace('default_version: v1.0.0', 'default_version: missing'), (issue, position, selected) => {
    assert.deepEqual(issue.yamlPath, ['default_version']);
    assert.equal(selected, 'default_version');
  });
  check('backend_name: [invalid', (issue, position) => {
    assert.equal(issue.mark.line, 1);
    assert.equal(position.start, 'backend_name: [invalid'.length);
    assert.equal(position.end, position.start);
  });
});

test('YAML uses schema-specific nullable types and keeps form-only framework validation', () => {
  const nullable = backendYamlTemplate.replace('custom_framework: cuda', 'custom_framework: null\n    entrypoint:\n    env:') +
    'default_env:\ndescription: null\nparameter_format: null\ndefault_run_command: null\n';
  const draft = backendYamlEditorDraft(nullable);
  assert.equal(draft.versionEntries[0].framework, null);
  const [saved] = saveInferenceBackend(seed, {}, draft, { mode: 'yaml' });
  assert.deepEqual(backendVersions(saved)[0].frameworks, []);
  assert.deepEqual(saved.env, {});
  assert.deepEqual(backendVersions(saved)[0].env, {});
  assert.equal(backendVersions(saved)[0].entrypoint, '');
  assert.equal(backendYamlEditorDraft(backendYaml(saved, { forEditor: true }), saved).versionEntries[0].framework, null);
  assert.throws(() => validateBackendVersionEntries(draft.versionEntries), /请选择.*支持框架/);

  for (const name of ['image_name', 'entrypoint', 'env']) {
    const config = name === 'image_name' ? backendYamlTemplate.replace(/image_name: .+/, 'image_name: null')
      : backendYamlTemplate.replace('custom_framework: cuda', `custom_framework: cuda\n    ${name}: 3`);
    assert.throws(() => backendYamlEditorDraft(config), new RegExp(`${name} 值类型无效`));
  }
  for (const [field, value] of [['default_env', '[]'], ['default_backend_param', 'null'], ['common_parameters', '[2]'], ['parameter_format', 'equals']]) {
    assert.throws(() => backendYamlEditorDraft(`${backendYamlTemplate}${field}: ${value}\n`), new RegExp(`${field} 的值类型无效`));
  }
  assert.throws(() => backendYamlEditorDraft(backendYamlTemplate.replace(/    image_name: .+\n/, '')), /须包含 image_name/);
  assert.throws(() => backendYamlEditorDraft(`${backendYamlTemplate}default_env:\n  OPENAI_API_KEY: example\n`), /不可保存访问密钥/);
});

test('YAML distinguishes create, built-in edit and user edit without promoting exported metadata', () => {
  const create = `${backendYamlTemplate}is_built_in: true\nframework_index_map:\n  cuda: [v2]\nbuilt_in_version_configs:\n  v2:\n    image_name: registry.example.org/image:v2\n    run_command: null\n    built_in_frameworks: [cuda]\n`;
  const [saved] = saveInferenceBackend(seed, {}, backendYamlEditorDraft(create), { mode: 'yaml' });
  assert.equal(saved.source, '自定义');
  assert.deepEqual(backendVersions(saved).map(entry => entry.version), ['v1.0.0']);
  assert.throws(() => backendYamlEditorDraft(create.replace('built_in_frameworks: [cuda]', 'env: {}')), /不支持的字段 env/);
  assert.throws(() => backendYamlEditorDraft(create.replace('is_built_in: true', 'is_built_in: null')), /is_built_in 的值类型无效/);
  assert.throws(() => backendYamlEditorDraft(create.replace('cuda: [v2]', 'cuda: [2]')), /framework_index_map 的值类型无效/);
  assert.throws(() => backendYamlEditorDraft(`${backendYamlTemplate}backend_source: invalid\n`), /backend_source 的值类型无效/);
  assert.throws(() => backendYamlEditorDraft(`${backendYamlTemplate}enabled: "true"\n`), /enabled 的值类型无效/);

  const customized = { ...saved, entrypoint: 'my entrypoint' };
  const userYaml = backendYaml(customized, { forEditor: true });
  assert.doesNotMatch(userYaml, /default_entrypoint/);
  const draft = backendYamlEditorDraft(userYaml, customized);
  assert.equal(saveInferenceBackend([customized], {}, draft, { current: customized, mode: 'yaml' })[0].entrypoint, customized.entrypoint);
  assert.throws(() => backendYamlEditorDraft(`${userYaml}default_entrypoint: serve\n`, saved), /不支持的字段 default_entrypoint/);
  assert.throws(() => backendYamlEditorDraft(`${userYaml}backend_name: ${saved.name}\n`, saved), /不支持的字段 backend_name/);
  assert.throws(() => backendYamlEditorDraft(`${userYaml}is_built_in: true\n`, saved), /不支持的字段 is_built_in/);

  const builtIn = byName(seed, 'vLLM');
  const builtInYaml = backendYaml(builtIn, { forEditor: true });
  assert.throws(() => backendYamlEditorDraft(`${builtInYaml}default_version: ${builtIn.version}\n`, builtIn), /不支持的字段 default_version/);
  const customVersionSpec = `version_configs:\n  lab:\n    image_name: registry.example.org/image:lab\n    run_command: null\n`;
  assert.throws(() => backendYamlEditorDraft(customVersionSpec, builtIn), /须以 -custom 结尾/);
  assert.equal(backendYamlEditorDraft(customVersionSpec.replace('  lab:', '  lab-custom:'), builtIn).versionEntries[0].version, 'lab-custom');
  const community = byName(seed, 'llama.cpp');
  assert.equal(backendYamlEditorDraft(backendYaml(community, { forEditor: true }), community).version, community.version);
});

test('exported custom backend YAML can create a copy and leaves source and status under action control', () => {
  const original = { ...byName(seed, 'rerank-custom'), status: '已停用', entrypoint: '/bin/sh -c' };
  const exported = backendYaml(original).replace('backend_source: custom', 'backend_source: community');
  const [copy] = saveInferenceBackend([], {}, backendYamlEditorDraft(exported), { mode: 'yaml' });
  assert.equal(copy.name, original.name);
  assert.equal(copy.source, '自定义');
  assert.equal(copy.status, '已启用');
  assert.equal(copy.version, original.version);
  assert.equal(copy.entrypoint, original.entrypoint);

  const edit = `${backendYaml(original, { forEditor: true })}backend_source: built_in\nenabled: true\n`;
  const [edited] = saveInferenceBackend([original], {}, backendYamlEditorDraft(edit, original), { current: original, mode: 'yaml' });
  assert.equal(edited.source, original.source);
  assert.equal(edited.status, original.status);
});

test('version validation pinpoints the first incomplete row for both add and submit controls', () => {
  assert.throws(() => validateBackendVersionEntries([version('v1'), version('v2', { image: '' })]),
    error => error.versionIndex === 1 && error.versionField === 'image');
  assert.throws(() => validateBackendVersionEntries([version('v1'), version('v1')]),
    error => error.versionIndex === 1 && error.versionField === 'version');
  assert.throws(() => validateBackendVersionEntries([version('v1', { env: [{ key: 'ACCESS_TOKEN', value: 'example' }] })]),
    error => error.versionIndex === 0 && error.versionField === 'env');
});

test('editing a version number only carries forward an explicitly selected default', () => {
  const blank = { ...initialBackendDraft(), versionEntries: [{ ...version(''), version: '' }] };
  const first = updateBackendVersionDraft(blank, 0, { version: 'v1' });
  assert.equal(first.version, '');
  assert.equal(first.versionEntries[0].version, 'v1');
  const saved = saveInferenceBackend(seed, {}, { ...blank, ...first, name: 'optional-default' })[0];
  assert.equal(saved.version, '');
  assert.equal(backendYamlEditorDraft(backendYaml(saved, { forEditor: true }), saved).version, '');
  const selected = updateBackendVersionDraft({ ...first, version: 'v1' }, 0, { version: 'v2' });
  assert.equal(selected.version, 'v2');
});

test('community defaults distinguish a managed version from the custom version sharing its base name', () => {
  const row = {
    ...byName(seed, 'llama.cpp'),
    version: 'cuda-custom',
    versionEntries: [
      { ...version('cuda'), sourceManaged: true },
      { ...version('cuda-custom'), sourceManaged: false },
    ],
  };
  const draft = initialBackendDraft(row);
  assert.equal(draft.versionEntries[0].version, 'cuda');
  assert.equal(backendEditableVersionName(draft.versionEntries[0].version, row.source), 'cuda-custom');
  assert.equal(draft.version, 'cuda-custom');
  assert.equal(saveInferenceBackend([row], {}, draft, { current: row })[0].version, 'cuda-custom');
  const renamed = updateBackendVersionDraft(draft, 0, { version: 'cuda-lab' }, row.source);
  assert.equal(renamed.version, 'cuda-lab-custom');
  const selectManaged = { ...draft, version: 'cuda' };
  const renamedWithManagedDefault = updateBackendVersionDraft(selectManaged, 0, { version: 'cuda-lab' }, row.source);
  assert.equal(renamedWithManagedDefault.version, 'cuda');
  assert.equal(saveInferenceBackend([row], {}, { ...selectManaged, ...renamedWithManagedDefault }, { current: row })[0].version, 'cuda');
  assert.deepEqual(INFERENCE_BACKEND_PAGE.searchKeys, ['name']);
});

test('pinned runner variants report per-version frameworks without overwriting stored custom or legacy versions', () => {
  const original = byName(seed, 'vLLM');
  const sourceVersion = backendAvailableVersions(original).find(entry => entry.version === '0.23.0');
  assert.deepEqual(sourceVersion.frameworks, ['CANN', 'HGGC']);
  assert.equal(sourceVersion.image, undefined);
  assert(sourceVersion.runnerImages.some(item => item.variant === 'a3' && item.image === 'gpustack/runner:cann9.1-a3-vllm0.23.0'
    && item.platforms.includes('linux/arm64')));
  const sglang = byName(seed, 'SGLang');
  assert.match(backendVersionRuntime(sglang, backendAvailableVersions(sglang)[0]).command, /^--model-path /);
  assert.match(backendVersionRuntime(original, sourceVersion).command, /^\{\{model_path\}\}/);
  const customOverride = { ...version('lab-custom'), entrypoint: 'vllm bench', command: '--max-model-len 4096', sourceManaged: false };
  const current = { ...original, versionEntries: [customOverride, ...backendVersions(original)] };
  assert.equal(backendVersionRuntime(current, backendAvailableVersions(current)[0]).command, '--max-model-len 4096');
  assert.equal(backendVersionRuntime(current, backendAvailableVersions(current)[0]).entrypoint, 'vllm bench');
  assert.equal(backendAvailableVersions(byName(seed, 'VoxBox')).find(entry => entry.version === '0.1.0').recordOnly, true);
});

test('export includes every displayed runner version in the protected section without turning images into overrides', () => {
  const original = byName(seed, 'vLLM');
  const saved = byName(saveInferenceBackend(seed, {}, { ...initialBackendDraft(original), versionEntries: [version('lab')] },
    { current: original }), 'vLLM');
  const available = backendAvailableVersions(saved);
  const document = decodeBackendYaml(backendYaml(saved));
  assert.deepEqual(new Set(Object.keys(document.built_in_version_configs)),
    new Set(available.filter(entry => entry.sourceManaged).map(entry => entry.version)));
  assert.deepEqual(Object.keys(document.version_configs), ['lab-custom']);
  assert.deepEqual(document.built_in_version_configs['0.23.0'].built_in_frameworks, ['cann', 'hggc']);
  assert.equal(document.built_in_version_configs['0.23.0'].image_name, undefined);
  assert.equal(document.built_in_version_configs['0.23.0'].runnerImages, undefined);
  assert.throws(() => backendYamlEditorDraft(backendYaml(saved), saved), /不支持的字段 backend_name/);
  const draft = backendYamlEditorDraft(backendYaml(saved, { forEditor: true }), saved);
  assert.deepEqual(draft.versionEntries.map(entry => entry.version), ['lab-custom']);
  const edited = byName(saveInferenceBackend([saved], {}, draft, { current: saved, mode: 'yaml' }), 'vLLM');
  assert.deepEqual(backendVersions(edited).map(entry => entry.version), ['0.23.0','0.21.0','lab-custom']);
});

test('edits use the latest record and cannot remove a version pinned by a deployment or rollback', () => {
  const draft = { ...initialBackendDraft(), name: 'versioned', version: 'old', versionEntries: [version('old'), version('new')] };
  const rows = saveInferenceBackend(seed, {}, draft);
  const current = rows[0];
  const next = { ...initialBackendDraft(current), version: 'new', versionEntries: [version('new')] };
  const records = { deployments: [{ id: 'dep', name: '生产模型', backend: 'another', previousConfig: { inferenceBackend: current.name, backendVersion: 'old' } }] };
  assert.throws(() => saveInferenceBackend(rows, records, next, { current }), /版本 old.*生产模型/);
  assert.match(INFERENCE_BACKEND_PAGE.canDelete(current, records), /生产模型/);
  assert.equal(INFERENCE_BACKEND_PAGE.deletable(current), true);
  const changed = [ { ...current, description: 'Updated elsewhere' }, ...seed ];
  assert.throws(() => saveInferenceBackend(changed, {}, next, { current }), /已更新/);
});

test('community marketplace enables a candidate and the list disables it without deleting its record', () => {
  const candidates = communityBackendCandidates(seed);
  assert.equal(candidates.length, 10);
  const llama = byName(candidates, 'llama.cpp');
  assert.deepEqual(llama.frameworks, ['CUDA', 'CPU', 'ROCm', 'MUSA']);
  assert.equal(llama.enabled, false);
  const rows = enableCommunityBackend(seed, llama);
  const enabled = byName(rows, llama.name);
  assert.equal(enabled.id, byName(seed, llama.name).id);
  assert.equal(enabled.version, 'cpu');
  assert.equal(enabled.healthPath, '/v1/models');
  assert.match(enabled.command, /^-m \{\{model_path\}\}/);
  assert.equal(backendVersions(enabled).find(entry => entry.version === 'b7500').recordOnly, true);
  assert.equal(enabled.status, '已启用');
  assert.equal(INFERENCE_BACKEND_PAGE.showRow(enabled), true);
  const action = INFERENCE_BACKEND_PAGE.actions.find(action => action.label === '删除');
  assert.equal(INFERENCE_BACKEND_PAGE.deletable(enabled), false);
  assert.equal(action.when(enabled), true);
  const removedFromView = { ...enabled, ...action.apply(enabled, {}) };
  assert.equal(INFERENCE_BACKEND_PAGE.showRow(removedFromView), false);
  assert.equal(byName(communityBackendCandidates([removedFromView]), llama.name).enabled, false);
  const recovered = enableCommunityBackend([removedFromView], llama)[0];
  assert.equal(recovered.id, enabled.id);
  assert.deepEqual(backendVersions(recovered).map(entry => entry.version), backendVersions(enabled).map(entry => entry.version));
  const miner = byName(candidates, 'MinerU');
  assert.equal(enableCommunityBackend(seed, miner)[0].version, '3.0.5');
});

test('enabling a community backend refreshes source-managed versions and preserves user settings', () => {
  const original = byName(seed, 'llama.cpp');
  const customized = { ...original, version: 'lab-custom', description: 'Owned description', healthPath: '', command: 'override',
    env: { WORKERS: '4' }, commonParameters: [], versionEntries: [
      { ...version('cuda', { image: 'registry.example.org/outdated:1' }), sourceManaged: true },
      { ...version('lab-custom', { command: 'local command' }), sourceManaged: false },
    ] };
  const requested = communityBackendCandidates([customized]).find(candidate => candidate.name === customized.name);
  const saved = enableCommunityBackend([customized], requested)[0];
  assert.equal(saved.description, customized.description);
  assert.equal(saved.command, customized.command);
  assert.equal(saved.healthPath, '');
  assert.deepEqual(saved.env, customized.env);
  assert.deepEqual(saved.commonParameters, []);
  assert.equal(saved.version, 'lab-custom');
  assert.equal(backendVersions(saved).find(entry => entry.version === 'lab-custom').command, 'local command');
  assert.equal(backendVersions(saved).find(entry => entry.version === 'cuda').image, 'ghcr.io/ggml-org/llama.cpp:server-cuda');
  assert.equal(enableCommunityBackend([{ ...saved, version: '', status: '已停用' }], requested)[0].version, '');
});

test('packaged market descriptions keep the upstream model names, voices, code and links', () => {
  const candidates = communityBackendCandidates(seed);
  assert(candidates.every(candidate => candidate.markdownDescription));
  const kokoro = byName(candidates, 'Kokoro-FastAPI');
  const blocks = parseCommunityMarkdown(kokoro.markdownDescription);
  assert.deepEqual(blocks.find(block => block.type === 'list').items.map(([token]) => token.text), ['kokoro', 'tts-1', 'tts-1-hd']);
  assert.match(blocks.at(-1).content[0].text, /zm_yunyang$/);
  assert.deepEqual(blocks[0].content.filter(token => token.type === 'link').map(token => token.href), [
    'https://github.com/remsky/Kokoro-FastAPI', 'https://huggingface.co/hexgrad/Kokoro-82M',
  ]);

  const modular = byName(candidates, 'Modular MAX');
  const tokens = parseCommunityMarkdown(modular.markdownDescription).flatMap(block => block.content);
  assert.deepEqual(tokens.find(token => token.type === 'code'), { type: 'code', text: 'max serve' });
  assert.equal(tokens.filter(token => token.type === 'link').at(-1).href, 'https://docs.modular.com/models/');
  const stored = enableCommunityBackend(seed, kokoro).find(row => row.name === kokoro.name);
  assert.equal(stored.markdownDescription, undefined);
});

test('community text cannot turn markup or credential-bearing URLs into active content', () => {
  const description = '<img src="https://example.org/image.png"> javascript:alert(1) https://user:password@example.org/ `https://example.org/code`';
  const [paragraph] = parseCommunityMarkdown(description);
  assert.deepEqual(paragraph.content, [
    { type: 'text', text: description.slice(0, description.indexOf('`')) },
    { type: 'code', text: 'https://example.org/code' },
  ]);
  assert.equal(communityProjectUrl('https://example.org/docs'), 'https://example.org/docs');
  assert.equal(communityProjectUrl('javascript:alert(1)'), undefined);
  assert.equal(communityProjectUrl('https://example.org@different.example'), undefined);
  const imported = { id: 'a-custom-source', name: '外部社区后端', source: '社区', description, versionEntries: [] };
  const candidate = byName(communityBackendCandidates([imported]), imported.name);
  assert.equal(candidate.markdownDescription, undefined);
  assert.equal(candidate.description, description);
});

test('URL-only source tabs preserve distinct official addresses and independently validate cadence', () => {
  const [builtIn, community] = backendSourceSlots;
  assert.match(builtIn.url, /runner\.py\.json$/);
  assert.match(community.url, /community-inference-backends\.yaml$/);
  const official = backendSourceDraft(builtIn);
  assert.equal(backendSourceConfiguration(builtIn, { ...official, url: '' }).mode, '官方');
  const value = backendSourceConfiguration(community, { ...backendSourceDraft(community), url: 'https://models.example/api/catalog', customHours: 6 });
  assert.equal(value.mode, 'URL');
  assert.equal(value.customHours, 6);
  assert.equal(value.officialHours, 12);
  assert.equal(backendSourceConfiguration(community, { ...value, remoteEnabled: false }).mode, '内置');
  assert.equal(backendSourceDraft(community, { ...value, remoteEnabled: false }).url, value.url);
  assert.throws(() => backendSourceConfiguration(community, { ...value, url: 'file:///tmp/source.yaml' }), /HTTP\(S\)/);
  assert.throws(() => backendSourceConfiguration(community, { ...value, url: 'https://test:example@models.example/f' }), /访问凭证/);
  assert.throws(() => backendSourceConfiguration(community, { ...value, customHours: 169 }), /1–168/);
  assert.throws(() => backendSourceConfiguration(community, { ...value, url: 'https://catalog.example/api?access_token=secret' }), /访问凭证/);
  assert.equal(backendSourceHours(''), 1);
  assert.equal(backendSourceHours(999), 168);
  assert.equal(backendSourceHours(6.8), 7);
  assert.equal(backendSourceChanged(builtIn, { ...official, url: `${builtIn.url}/`, officialHours: 0 }, official), false);
  assert.equal(backendSourceChanged(builtIn, { ...official, url: 'https://models.example/runner.json' }, official), true);
});

test('bundled source replay uses a real fingerprint and preserves the last content update when unchanged', async () => {
  const [builtIn, community] = backendSourceSlots;
  const official = backendSourceDraft(builtIn);
  const first = await replayBackendSource(builtIn, official, new Date('2026-11-27T04:00:00Z'));
  assert.equal(first.status, 'changed');
  assert.equal(first.settings.snapshotCount, 58);
  assert.equal(first.settings.snapshotUrl, builtIn.url);
  assert.equal(first.settings.updatedAt, '2026-11-27T04:00:00.000Z');
  assert.match(first.settings.snapshotHash, /^[a-f0-9]{64}$/);
  const repeated = await replayBackendSource(builtIn, first.settings, new Date('2026-11-27T05:00:00Z'));
  assert.equal(repeated.status, 'unchanged');
  assert.equal(repeated.settings.updatedAt, first.settings.updatedAt);
  assert.equal(repeated.settings.checkedAt, '2026-11-27T05:00:00.000Z');
  assert.equal(repeated.settings.snapshotHash, first.settings.snapshotHash);
  const external = await replayBackendSource(community, backendSourceDraft(community));
  assert.equal(external.settings.snapshotCount, 10);
  assert.notEqual(external.settings.snapshotHash, repeated.settings.snapshotHash);
  assert(backendSourceSnapshot(builtIn).entries.find(item => item.name === 'vLLM').versions.includes('0.23.0'));
  assert.deepEqual(backendSourceSnapshot(community).entries.find(item => item.name === 'Kokoro-FastAPI').versions, ['latest-gpu', 'latest-cpu']);
});

test('unavailable URL writes are atomic while historical custom settings can retry and be parked', async () => {
  const [, slot] = backendSourceSlots;
  const original = (await replayBackendSource(slot, backendSourceDraft(slot))).settings;
  const unsupported = { ...original, url: 'https://models.example/api/catalog', customHours: 6, officialHours: 24 };
  assert.throws(() => saveBackendSourceConfiguration(slot, unsupported), /没有可用的本地快照/);
  assert.equal(original.url, '');
  assert.equal(original.officialHours, 12);
  const historical = backendSourceConfiguration(slot, unsupported);
  const retry = await replayBackendSource(slot, historical, new Date('2026-11-27T04:00:00Z'));
  assert.equal(retry.status, 'failed');
  assert.equal(retry.settings.syncError.url, historical.url);
  assert.equal(retry.settings.syncError.checkedAt, '2026-11-27T04:00:00.000Z');
  assert.equal(retry.settings.snapshotHash, original.snapshotHash);
  assert.equal(retry.settings.updatedAt, original.updatedAt);
  assert.equal(backendSourceDraft(slot, retry.settings).syncError.message, '此 URL 没有可用的本地快照。');
  const parked = saveBackendSourceConfiguration(slot, { ...retry.settings, remoteEnabled: false });
  assert.equal(parked.mode, '内置');
  assert.equal(parked.url, historical.url);
  assert.equal(parked.customHours, 6);
  assert.throws(() => saveBackendSourceConfiguration(slot, { ...parked, url: 'https://account:credential@models.example/catalog' }), /不可包含访问凭证/);
  await assert.rejects(() => replayBackendSource(slot, parked), /使用内置目录时无需同步/);
  const restored = saveBackendSourceConfiguration(slot, { ...parked, url: slot.url, remoteEnabled: true });
  assert.equal(restored.mode, '官方');
  const replayed = await replayBackendSource(slot, restored);
  assert.equal(replayed.status, 'unchanged');
  assert.equal(replayed.settings.syncError, null);
});
