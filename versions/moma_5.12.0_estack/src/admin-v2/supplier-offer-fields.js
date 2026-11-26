import { CHANNEL_LIST_TYPES } from './channel-connection-directory.js';
import { prepareChannelInterface } from './channel-interface.js';
import { channelAddresses } from './provider-channels.js';
import { MODEL_TASK_LABELS } from '../model-types.mjs';

export const protocolLabels = CHANNEL_LIST_TYPES.map(type => type.label);
export function offerFields(group, provider) {
  if (group.entry?.offerFields) return group.entry.offerFields;
  const bindings = group.channels.flatMap(channel => channelAddresses(provider, channel).map(address => {
    const url = address.baseUrl;
    const protocol = CHANNEL_LIST_TYPES.find(type => type.paths.some(path => url?.replace(/\/$/, '').endsWith(path)))?.label || address.protocol;
    return { protocol, url, upstream: channel.upstreamModelId || '' };
  }));
  return { name: group.master.name, code: group.master.modelId, type: group.master.type, bindings };
}
export function validateOffer(offer, provider) {
  if (!offer || typeof offer.name !== 'string' || !offer.name.trim() || offer.name.length > 100 ||
    (offer.type !== 'other' && !Object.hasOwn(MODEL_TASK_LABELS, offer.type))) throw Error('请核对模型展示名称和类型');
  if (!Array.isArray(offer.bindings) || !offer.bindings.length || offer.bindings.length > 100) throw Error('每个模型须填写 1–100 条接口格式地址');
  const seen = new Set();
  for (const { protocol, url, upstream } of offer.bindings) {
    if (typeof upstream !== 'string' || !upstream.trim() || upstream.length > 256 || /\s/.test(upstream)) throw Error('请填写有效的上游模型 ID');
    const type = CHANNEL_LIST_TYPES.find(item => item.label === protocol);
    if (!type || typeof url !== 'string' || !type.paths.some(path => url.replace(/\/$/, '').endsWith(path))) throw Error('请填写与连接接口格式匹配的完整 URL');
    prepareChannelInterface({ interfaceType:'custom', baseUrl:url, allowHttp:provider.sourceType === 'selfHosted' });
    const key = JSON.stringify([upstream, protocol, url]);
    if (seen.has(key)) throw Error('上游模型 ID、接口格式及端点重复');
    seen.add(key);
  }
}
