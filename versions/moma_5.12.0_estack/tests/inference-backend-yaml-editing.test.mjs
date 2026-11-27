import assert from 'node:assert/strict';
import test from 'node:test';
import { JSON_SCHEMA, load } from 'js-yaml';
import { backendYamlSyntax, formatBackendYaml } from '../src/admin-v2/inference-backend-yaml-editing.js';

test('YAML formatting normalizes simple mappings and preserves comments and configuration values', () => {
  const content = '# keep this comment\nversion_configs :\n    v1:\n        image_name :  example/test:v1\n        env : {PORT: "8000"}\n';
  const expected = '# keep this comment\nversion_configs:\n  v1:\n    image_name: example/test:v1\n    env: {PORT: "8000"}\n';
  const formatted = formatBackendYaml(content);
  assert.equal(formatted, expected);
  assert.equal(formatBackendYaml(formatted), expected);
  assert.deepEqual(load(formatted, { schema: JSON_SCHEMA }), load(content, { schema: JSON_SCHEMA }));
});

test('YAML formatting preserves multiline content and references and refuses malformed input', () => {
  const content = 'shared : &shared\n    command : |\n      gpu-server --flag: value\n    value : "two\n      lines"\nother : *shared\n';
  const formatted = formatBackendYaml(content);
  assert.match(formatted, /command: \|\n {6}gpu-server --flag: value/);
  const parsed = load(formatted, { schema: JSON_SCHEMA });
  assert.equal(parsed.shared, parsed.other);
  assert.deepEqual(parsed, load(content, { schema: JSON_SCHEMA }));
  assert.throws(() => formatBackendYaml('version_configs: [\n'), error => error.mark.line === 1);
});

test('YAML highlighting preserves the input and treats block scalar text and quoted hashes as strings', () => {
  const content = '# config\nversion: "v1#release"\nflag: false\ncount: 2\ncommand: |\n  echo # string\n';
  const tokens = backendYamlSyntax(content);
  assert.equal(tokens.map(([text]) => text).join(''), content);
  assert.deepEqual(tokens.filter(([, tone]) => tone && tone !== 'punctuation'), [
    ['# config', 'comment'], ['version', 'key'], ['"v1#release"', 'string'], ['flag', 'key'], ['false', 'keyword'],
    ['count', 'key'], ['2', 'number'], ['command', 'key'], ['  echo # string', 'string'],
  ]);
});
