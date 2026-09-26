import test from 'node:test';
import assert from 'node:assert/strict';
import { parseIpAllowlist } from '../src/api-key-utils.mjs';
test('IP 白名单去重、支持 IPv4/CIDR，并拒绝无效输入', () => {
  assert.deepEqual(parseIpAllowlist('10.0.0.1，10.0.0.1\n192.168.0.0/24'), ['10.0.0.1','192.168.0.0/24']);
  assert.deepEqual(parseIpAllowlist(''), []);
  for (const value of ['256.1.1.1','1.2.3','1.2.3.4/33','1.2.3.4/','1.2.3.4/2/3','01.2.3.4']) assert.throws(() => parseIpAllowlist(value));
});
