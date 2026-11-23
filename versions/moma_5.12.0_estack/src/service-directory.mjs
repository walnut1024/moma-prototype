import { modelPresentation } from './model-identities.mjs';
import { serviceGuideRequest } from './admin-v2/service-guide.js';
import { MODEL_TYPE_LABELS as MODEL_CATEGORIES, modelCategory } from './model-types.mjs';
import { IDENTITY_FIELDS, TECHNICAL_FIELDS, INTERFACE_FIELDS, FEATURE_FIELDS, ARCHITECTURE_OPTIONS, LICENSE_OPTIONS, specificationFields, normalizeModelLogo, modelProfileDraft } from './admin-v2/model-profile.js';

export function servicePresentation(model) {
  model = modelPresentation(null, model);
  const profile = modelProfileDraft(model), support = value => value == null ? '' : value ? '支持' : '暂无';
  const cardLabels = typeof model.preview === 'boolean' ? { precision: '模型精度', parameters: '参数量' } : {};
  const facts = descriptors => descriptors.map(({ key, label, kind, unit }) => {
    const value = profile[key], choices = kind === 'architecture' ? ARCHITECTURE_OPTIONS : kind === 'license' ? LICENSE_OPTIONS : kind === 'lifecycle' ? [['stable', '稳定版'], ['preview', '预览版'], ['deprecated', '已退役']] : [];
    return { label: cardLabels[key] || label, value: value == null || value === '' || value === 'unknown' ? '' : kind === 'support' ? (value === 'supported' ? '支持' : '暂无') : Array.isArray(value) ? value.join('、') : (choices.find(([id]) => id === value)?.[1] || String(value)) + (unit ? ` ${unit}` : '') };
  }).filter(row => row.value !== '');
  let logo = ''; try { if (profile.logo) logo = normalizeModelLogo(profile.logo); } catch { /* Invalid stored images are not rendered. */ }
  const sections = [
    { title: '模型资料', facts: [...facts(IDENTITY_FIELDS.filter(row => !['retirementDate', 'replacement'].includes(row.key))), ...['scenarios', 'languages'].map((key, index) => ({ label: ['适用场景', '支持语言'][index], value: profile[key]?.join('、') || '' }))] },
    { title: '能力与规格', facts: [{ label: '最大输出', value: model.capabilities?.output == null ? '' : `${model.capabilities.output} Token` }, ...['streaming', 'tools'].map((key, index) => ({ label: ['流式响应', '工具调用'][index], value: support(model.capabilities?.[key]) })), ...facts(FEATURE_FIELDS.filter(row => ['text', 'multimodal'].includes(model.type) || row.key === 'batch')), ...facts(specificationFields(model.type, model.usageUnit, profile))] },
    { title: '技术与接口', facts: facts([...TECHNICAL_FIELDS.filter(row => row.key !== 'knowledgeCutoff'), ...INTERFACE_FIELDS]) },
  ].map(section => ({ ...section, facts: section.facts.filter(row => row.value !== '') })).filter(section => section.facts.length);
  return { logo, modelId: model.modelId || '', typeLabel: MODEL_CATEGORIES[modelCategory(model.type)] || '', detailDescription: profile.detailDescription || '', detailSections: sections, releaseDate: profile.releaseDate || '' };
}

export function experienceTasks(model) {
  const tasks = model.profile?.tasks || [], inputs = model.profile?.inputModalities || [], outputs = model.profile?.outputModalities || [];
  return [
    inputs.includes('文本') && outputs.includes('文本') && tasks.some(task => ['对话', '文本生成', '代码生成', '图像理解'].includes(task)) && 'text',
    tasks.includes('文生图') && 'image',
    tasks.includes('文生视频') && 'video',
    tasks.includes('语音识别') && 'voice',
  ].filter(Boolean);
}
export function cloudMarketPresentation(record) {
  const offer = { ...record, modelId: record.canonical_slug, modelKey: record.model_id || record.card_id };
  const profile=modelProfileDraft(offer), inputs=profile.inputModalities || [];
  const outputs=[...new Set([...(profile.outputModalities || []), ...(profile.resultTypes || [])])];
  return {...servicePresentation(offer),...offer,desc:offer.description,context:offer.capabilities?.context ? Number(offer.capabilities.context).toLocaleString('zh-CN')+' Token' : '未填写',
    maker: offer.maker || profile.author, hot: offer.heat > 0, score: offer.heat,
    contextTokens:offer.capabilities?.context ?? null,series:profile.family || '',input:inputs,outputModalities:outputs,
    businessTasks:profile.tasks || [],tasks:experienceTasks(offer),inputModalities:inputs.map(item=>({文本:'text',图片:'image',音频:'audio',视频:'video'}[item] || item)),
    output:offer.capabilities?.output ?? '未填写',icon:1,billing:offer.internal ? '内部使用' : '按量计费',reason:offer.callable ? '' : '请先订购此模型服务',documentation:profile.documentation || '',
    date:profile.releaseDate || '',guideRequest:serviceGuideRequest(offer,offer.callId)};
}

export function marketModels(services, scope = 'showcase', cards = []) {
  const rows = services.filter(row => row.marketVisible !== false && (scope === 'all' || row.defaultCatalogue !== false));
  const groups = new Map(cards.map(card => [card.modelKey, { ...card, services: [] }]));
  for (const row of rows) {
    const group = groups.get(row.modelKey);
    if (group) group.services.push(row);
    else groups.set(row.modelKey, { ...row, services: [row] });
  }
  return [...groups.values()].map(row => {
    const providers = new Map(row.services.map(service => [service.providerId, service.providerName]));
    return { ...row, providers, provider: [...providers.values()].join('、'), callable: row.services.some(service => service.callable) };
  });
}
export function customerPriceRows(prices, at = Date.now()) {
  const labels = { million_input_tokens: ['输入 Token', '百万 Token'], million_output_tokens: ['输出 Token', '百万 Token'], million_tokens: ['总 Token', '百万 Token'], request: ['请求数', '次'], second: ['时长', '秒'], character: ['字符数', '字符'] };
  return prices.filter(row => Number.isSafeInteger(row.amount) && row.amount >= 0 && labels[row.unit] && Date.parse(row.effectiveAt) <= at && (!row.expiresAt || Date.parse(row.expiresAt) > at)).map(row => ({ name: labels[row.unit][0], unit: labels[row.unit][1], amount: row.amount / 1000000, currency: row.currency }));
}
