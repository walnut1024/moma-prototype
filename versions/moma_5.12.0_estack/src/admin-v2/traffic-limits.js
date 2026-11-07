import { enterpriseTenants } from './enterprise.js';
import { individualAccounts, individualName } from './individual-users.js';
import { modelCatalogue } from './model-library.js';

export const trafficSettings = state => state.settings?.trafficLimits ?? { global: null, models: [] };
export const accountTraffic = tenant => tenant.trafficPolicy ?? { limit: null, exceptions: [] };

export const trafficAccounts = state => [
  ...enterpriseTenants(state).map(tenant => ({ ...tenant, name: tenant.name, kind: '政企' })),
  ...individualAccounts(state).map(account => ({ ...account.tenant, name: individualName(account), kind: '个人' })),
];

export const trafficModels = state => modelCatalogue(state).filter(model => !model.archivedAt);

export const validTrafficLimit = limit => Number.isSafeInteger(limit?.rpm) && limit.rpm > 0
  && Number.isSafeInteger(limit?.tpm) && limit.tpm > 0;

export function effectiveTraffic(settings, policy, modelId) {
  const rules = [
    { id: 'exception', name: '模型特例', limit: policy.exceptions.find(row => row.modelId === modelId) },
    { id: 'account', name: '账号自定义', limit: policy.limit },
    { id: 'global', name: '全局默认', limit: settings.global },
  ];
  return {
    rules,
    hit: rules.find(row => validTrafficLimit(row.limit)),
    modelLimit: settings.models.find(row => row.modelId === modelId),
  };
}

function requireLimit(value) {
  if (!validTrafficLimit(value)) throw new Error('RPM 和 TPM 均须为正整数');
  return { rpm: value.rpm, tpm: value.tpm };
}

export function trafficTransaction(state, action) {
  if (state.cloudOperations) throw new Error('请在流量运营工作区维护限流');
  if (state.revision !== action.expectedRevision) throw new Error('数据已变化，请重新打开配置；当前输入保留');
  const { operation, data, id } = action;
  const settings = trafficSettings(state);
  const updateSettings = (changes, label) => ({
    type: 'setSettings', objectId: id || 'traffic-limits', label,
    changes: { trafficLimits: { ...settings, ...changes } },
  });
  if (operation === 'defaults') return updateSettings({
    global: requireLimit(data.global),
  }, '保存默认限流规则');
  const accountById = accountId => state.tenants.find(row => row.id === accountId && ['个人', '企业', '政府'].includes(row.type));
  if (operation === 'batchAccounts') {
    const { accountIds } = data;
    if (!Array.isArray(accountIds) || !accountIds.length || new Set(accountIds).size !== accountIds.length) throw new Error('请选择有效且不重复的账号');
    const limit = data.limit === null ? null : requireLimit(data.limit);
    const changes = accountIds.map(id => {
      const tenant = accountById(id);
      if (!tenant) throw new Error('所选账号已变化，请重新选择');
      return { type: 'update', collection: 'tenants', id, changes: { trafficPolicy: { ...accountTraffic(tenant), limit } } };
    });
    return { type: 'batch', label: limit ? '批量修改账号限流额度' : '批量恢复账号默认额度', changes };
  }
  const modelIds = new Set(trafficModels(state).map(row => row.id));
  if (operation === 'model') {
    if (!modelIds.has(id)) throw new Error('模型不存在');
    const models = [...settings.models.filter(row => row.modelId !== id), { modelId: id, ...requireLimit(data) }];
    return updateSettings({ models }, '保存模型共享上限');
  }
  if (operation === 'exceptions') {
    const tenant = accountById(id);
    if (!tenant) throw new Error('账号不存在');
    const existing = accountTraffic(tenant);
    if (!Array.isArray(data.exceptions) || new Set(data.exceptions.map(row => row.modelId)).size !== data.exceptions.length) throw new Error('同一模型只能设置一条特例');
    const exceptions = data.exceptions.map(row => {
      if (!modelIds.has(row.modelId) && !existing.exceptions.some(old => old.modelId === row.modelId && old.rpm === row.rpm && old.tpm === row.tpm)) throw new Error('特例关联的模型不存在');
      return { modelId: row.modelId, ...requireLimit(row) };
    });
    return { type: 'update', collection: 'tenants', id, label: '保存模型限流特例',
      changes: { trafficPolicy: { ...existing, exceptions } } };
  }
  throw new Error('未知的流量运营操作');
}
