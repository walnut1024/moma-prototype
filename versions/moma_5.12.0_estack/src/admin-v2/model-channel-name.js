import { supplierChannelName } from './supplier-resources.js';

export const modelChannelName = (provider, channel) => channel?.sourceName || (channel?.endpointId ? supplierChannelName(provider, channel.endpoint) : '待添加连接');
