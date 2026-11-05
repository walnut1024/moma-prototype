import { catalogueChannels, channelCheckCurrent, channelFingerprint, channelInterfaceIssue } from './provider-channels.js';
import { connectionCredentialsReady, connectionTestCurrent, connectionTestPassed } from './connection-state.js';
import { displayedCatalogueIds, providerCatalogueModel } from './moma-provider.js';
import { supplyModelRecord } from './supply-models.js';

export const channelSelectionId = row => JSON.stringify([row.providerId || row.provider?.id, row.associationId || row.association?.id]);

export function channelSelectionSnapshot(row) {
  if (!row.association?.endpointId) return null;
  return {
    providerId: row.provider.id, endpointId: row.association.endpointId, associationId: row.association.id,
    modelId: row.modelId, expectedFingerprint: channelFingerprint(row.association),
  };
}

export function catalogueMappingRows(state, provider, entries) {
  const models = entries || (provider ? displayedCatalogueIds(provider, state).map(modelId => ({ provider, modelId })) : []);
  const rows = models.flatMap(({ provider: owner, modelId }) => {
    const model = supplyModelRecord(state, owner, modelId) || providerCatalogueModel(owner, modelId);
    const mappings = catalogueChannels(state, owner, modelId).filter(row => row.endpointId);
    return (mappings.length ? mappings : [null]).map(association => {
      const row = { provider: owner, model, modelId, association };
      return { ...row, selectionId: association ? channelSelectionId(row) : JSON.stringify([owner.id, modelId, 'unconfigured']) };
    });
  });
  if (!entries) return rows;
  const configured = new Set(rows.filter(row => row.association).map(row => row.provider.id)), seen = new Set();
  return rows.filter(row => {
    if (!row.association && configured.has(row.provider.id)) return false;
    const key = row.association ? row.selectionId : row.provider.id;
    if (seen.has(key)) return false;
    seen.add(key); return true;
  });
}

export function filterChannelRows(rows, query) {
  const needle = query.trim().toLowerCase();
  return needle ? rows.filter(row => [row.provider.name, row.model?.name, row.model?.modelId, row.modelId, row.association?.name, row.association?.endpointId, row.association?.upstreamModelId].filter(Boolean).join(' ').toLowerCase().includes(needle)) : rows;
}

export function channelRowsPage(rows, page, size) {
  const current = Math.min(Math.max(1, page), Math.max(1, Math.ceil(rows.length / size)));
  return { page: current, rows: rows.slice((current - 1) * size, current * size) };
}

export function selectChannelRows(selection, rows, checked) {
  const snapshots = rows.map(channelSelectionSnapshot).filter(Boolean);
  const ids = new Set(snapshots.map(channelSelectionId));
  const retained = selection.filter(row => !ids.has(channelSelectionId(row)));
  return checked ? [...retained, ...snapshots] : retained;
}

export function channelStatus(provider, association) {
  if (!association) return '未配置渠道';
  if (provider.status !== '已启用') return '供应商已停用';
  if (association.endpoint?.frozen) return '已冻结';
  if (association.unlinked) return '未关联模型';
  if (!connectionCredentialsReady(association.endpoint, provider)) return '凭证待配置';
  if (channelInterfaceIssue(provider, association)) return '接口不匹配';
  if (connectionTestCurrent(association.endpoint) && association.endpoint.connectionTest.result !== '通过') return '测试失败';
  if (association.managed && channelCheckCurrent(association) && association.health?.result !== '通过') return '测试失败';
  if (!channelCheckCurrent(association) || association.endpoint.supplierChannel && !connectionTestPassed(association.endpoint)) return association.health || association.endpoint.connectionTest ? '待复测' : '未测试';
  if (association.endpoint.status === '停用' || association.endpoint.status === '已停用') return '已停用';
  if (!association.enabled || !['运行中', '需关注'].includes(association.endpoint.status)) return '未启用';
  return '可用';
}

export function redactDiagnostic(value) {
  const seen = new WeakSet();
  const redact = input => {
    if (typeof input === 'string') return input
      .replace(/\bBearer\s+[^\s"',;]+/gi, 'Bearer [已隐藏]')
      .replace(/\bsk-[a-z0-9_-]{6,}/gi, '[已隐藏]')
      .replace(/https?:\/\/[^\s"'<>]+/gi, text => {
        try {
          const url = new URL(text);
          url.username = ''; url.password = '';
          for (const key of url.searchParams.keys()) url.searchParams.set(key, '[已隐藏]');
          if (url.hash) url.hash = '[已隐藏]';
          return url.toString();
        } catch { return '[链接已隐藏]'; }
      });
    if (!input || typeof input !== 'object') return input;
    if (seen.has(input)) return '[循环引用]';
    seen.add(input);
    if (Array.isArray(input)) return input.map(redact);
    return Object.fromEntries(Object.entries(input).map(([key, item]) => [key, /^(?:api[_-]?key|key|authorization|password|secret|token|access[_-]?token|refresh[_-]?token|credentialValue|requestBody|responseBody)$/i.test(key) ? '[已隐藏]' : redact(item)]));
  };
  return redact(value);
}
