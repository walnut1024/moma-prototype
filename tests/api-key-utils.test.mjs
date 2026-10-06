import test from 'node:test';
import assert from 'node:assert/strict';
import { maskApiKey, parseIpAllowlist } from '../src/api-key-utils.mjs';
test('IP 白名单去重、支持 IPv4/CIDR，并拒绝无效输入', () => {
  assert.deepEqual(parseIpAllowlist('10.0.0.1，10.0.0.1\n192.168.0.0/24'), ['10.0.0.1','192.168.0.0/24']);
  assert.deepEqual(parseIpAllowlist(''), []);
  for (const value of ['256.1.1.1','1.2.3','1.2.3.4/33','1.2.3.4/','1.2.3.4/2/3','01.2.3.4']) assert.throws(() => parseIpAllowlist(value));
});

test('API Key masking retains only the agreed prefix and suffix', () => {
  assert.equal(maskApiKey('sk-abcdefghijklmnopqrstuvwxyz'), 'sk-abcde*****wxyz');
  assert.equal(maskApiKey('  sk-abcdefghijklmnopqrstuvwxyz  '), 'sk-abcde*****wxyz');
});

test('existing redacted previews normalize without revealing or inventing characters', () => {
  for (const [input, expected] of [['sk-demo*****0010', 'sk-demo*****0010'], ['sk-****001', 'sk-*****001'], ['sk-***8L2', 'sk-*****8L2'], ['••••••••0010', '*****0010']]) {
    assert.equal(maskApiKey(input), expected);
    assert.equal(maskApiKey(maskApiKey(input)), expected);
  }
});

test('missing and short API Keys never display a full credential', () => {
  for (const value of [undefined, null, '', '  ']) assert.equal(maskApiKey(value), '—');
  for (const value of ['secret', 'sk-123456789', '1234']) assert.equal(maskApiKey(value), '*****');
});
