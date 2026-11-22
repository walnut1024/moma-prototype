import { CHANNEL_LIST_TYPES } from './channel-connection-directory.js';
import { prepareChannelInterface } from './channel-interface.js';
import { channelAddresses } from './provider-channels.js';
import { MODEL_TASK_LABELS, MODEL_TYPE_LABELS } from '../model-types.mjs';
import { workbenchProtocolLabel } from './workbench-protocol.js';

export const offerHeaders = ['模型展示名', '模型标识', '模型编码', '模型类型', '协议', 'URL'];
const offerTypes = { text:'文本', multimodal:'多模态', image:'图像', video:'视频', audio:'语音', embedding:'向量', rerank:'重排', other:MODEL_TYPE_LABELS.other };
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
  if (!offer || typeof offer.name !== 'string' || !offer.name.trim() || offer.name.length > 100 || !Object.hasOwn(offerTypes, offer.type)) throw Error('请核对模型展示名和类型');
  if (!Array.isArray(offer.bindings) || !offer.bindings.length || offer.bindings.length > 100) throw Error('每个模型须填写 1–100 条协议地址');
  const seen = new Set();
  for (const { protocol, url, upstream } of offer.bindings) {
    if (typeof upstream !== 'string' || !upstream.trim() || upstream.length > 256 || /\s/.test(upstream)) throw Error('请填写有效的模型标识');
    const type = CHANNEL_LIST_TYPES.find(item => item.label === protocol);
    if (!type || typeof url !== 'string' || !type.paths.some(path => url.replace(/\/$/, '').endsWith(path))) throw Error('请填写与渠道协议匹配的完整 URL');
    prepareChannelInterface({ interfaceType:'custom', baseUrl:url, allowHttp:provider.sourceType === 'selfHosted' });
    const key = JSON.stringify([upstream, protocol, url]);
    if (seen.has(key)) throw Error('模型标识、协议及端点重复');
    seen.add(key);
  }
}
export function excelOffers(cells, provider) {
  const [headers = [], ...rows] = cells;
  if (headers.length !== offerHeaders.length || !offerHeaders.every(h => headers.includes(h))) throw Error('Excel 表头须与模板一致');
  const groups = new Map();
  rows.forEach((row, index) => {
    const [name, upstream, code, typeName, protocolName, url] = offerHeaders.map(h => String(row[headers.indexOf(h)] ?? '').trim());
    const protocol = protocolLabels.find(label => label === protocolName || workbenchProtocolLabel(label) === protocolName);
    if (![name, upstream, code, typeName, protocolName, url].some(Boolean)) return;
    const type = Object.keys(offerTypes).find(id => id === typeName || MODEL_TASK_LABELS[id] === typeName || offerTypes[id] === typeName);
    if (!/^[a-z0-9][a-z0-9._:/-]{0,79}$/.test(code)) throw Error('第 ' + (index+2) + ' 行模型编码无效');
    const offer = groups.get(code) || { name, code, type, bindings:[] };
    if (offer.name !== name || offer.type !== type) throw Error('同一模型编码的名称和类型须一致');
    offer.bindings.push({ upstream, protocol, url });
    groups.set(code, offer);
  });
  if (!groups.size) throw Error('表格没有模型数据');
  for (const offer of groups.values()) validateOffer(offer, provider);
  return [...groups.values()];
}
