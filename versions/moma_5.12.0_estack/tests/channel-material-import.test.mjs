import assert from 'node:assert/strict';
import test from 'node:test';
import { channelMaterialOptions } from '../src/admin-v2/channel-material-import.js';
import { prepareListedChannelInterface } from '../src/admin-v2/channel-connection-directory.js';
import { modelTaskUrl } from '../src/admin-v2/channel-interface.js';

test('service-provider references keep each API format paired with its full endpoint path', () => {
  const options = channelMaterialOptions({ id: 'provider-deepseek-official', code: 'deepseek-official', sourceType: 'thirdParty' });
  assert.deepEqual(options.map(option => option.interfaceType), ['openai', 'anthropic']);
  assert.deepEqual(options.map(option => modelTaskUrl(prepareListedChannelInterface(option), 'text')), [
    'https://api.deepseek.com/chat/completions',
    'https://api.deepseek.com/anthropic/v1/messages',
  ]);
});

test('provider references retain distinct addresses and omit unsupported task interfaces', () => {
  const kimi = channelMaterialOptions({ id: 'provider-kimi-official', sourceType: 'thirdParty' });
  assert.deepEqual(kimi.map(option => option.baseUrl), ['https://api.moonshot.cn/v1', 'https://api.moonshot.ai/v1']);
  const ark = channelMaterialOptions({ id: 'provider-ark-official', sourceType: 'thirdParty' });
  assert.deepEqual(ark.map(option => option.interfaceType), ['ark-video']);
  assert.equal(modelTaskUrl(prepareListedChannelInterface(ark[0]), 'video'),
    'https://ark.cn-beijing.volces.com/api/v3/contents/generations/tasks');
});

test('a known provider preset fills the interface, while an unconfigured provider has no interface reference', () => {
  const preset = channelMaterialOptions({ id: 'provider-moma', code: 'moma', sourceType: 'thirdParty' });
  assert.deepEqual(preset, [{
    interfaceType: 'openai', baseUrl: 'https://moma.cmecloud.cn/v1', endpointPath: '/chat/completions',
  }]);
  assert.deepEqual(channelMaterialOptions({ id: 'manual-provider', sourceType: 'selfHosted' }), []);
});
