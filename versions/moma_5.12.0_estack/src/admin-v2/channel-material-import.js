import { CHANNEL_LIST_TYPES, channelProtocolPaths, prepareListedChannelInterface } from './channel-connection-directory.js';
import { CHANNEL_INTERFACES } from './channel-interface.js';
import { OFFICIAL_CHANNEL_PRESETS } from './official-channel-presets.js';
import { OFFICIAL_SUPPLY_CATALOGUE } from './official-supply-catalogue.js';

export function channelMaterialOptions(provider) {
  if (!provider) return [];

  const allowHttp = provider.sourceType === 'selfHosted';
  const options = new Map();
  const add = (interfaceType, baseUrl, endpointPath) => {
    try {
      const config = prepareListedChannelInterface({ interfaceType, baseUrl, endpointPath, allowHttp });
      const option = { interfaceType, baseUrl: config.baseUrl, endpointPath: config.endpointPath };
      options.set(JSON.stringify(option), option);
    } catch { /* Skip references that cannot be represented by the channel form. */ }
  };
  const catalogue = OFFICIAL_SUPPLY_CATALOGUE.find(row => row.id === provider.id);
  for (const model of catalogue?.models ?? []) {
    for (const channel of model.channels) {
      for (const { baseUrl, protocol } of channel.addresses) {
        const url = new URL(baseUrl);
        const endpointPath = url.pathname.replace(/\/+$/, '');
        const type = CHANNEL_LIST_TYPES.find(row =>
          (CHANNEL_INTERFACES.find(adapter => adapter.id === row.id)?.protocol ??
            (row.id === 'openai-embeddings' ? 'OpenAI' : '其他')) === protocol &&
          row.paths.some(path => endpointPath.endsWith(path)));
        if (type) {
          const suffix = type.paths.find(path => endpointPath.endsWith(path));
          add(type.id, baseUrl.replace(/\/+$/, '').slice(0, -suffix.length), endpointPath);
        }
      }
    }
  }

  const preset = OFFICIAL_CHANNEL_PRESETS.find(row =>
    row.code === provider.code || row.existingProvider?.includes(provider.id));
  const defaults = provider.defaultProtocol ?? [];
  const interfaceType = defaults.length === 1
    ? CHANNEL_INTERFACES.find(row => row.protocol === defaults[0])?.id
    : defaults.length === 0 && preset ? 'openai' : '';
  const baseUrl = provider.baseUrl || preset?.baseUrl;
  if (interfaceType && baseUrl) {
    const endpointPath = channelProtocolPaths({ interfaceType, baseUrl, allowHttp })[0];
    if (endpointPath) add(interfaceType, baseUrl, endpointPath);
  }

  return [...options.values()];
}
