import { enterpriseTenants } from './enterprise.js';
import { individualAccounts, individualName } from './individual-users.js';
import { validTrafficLimit } from './traffic-rates.js';

export function accountTraffic(settings, accountId) {
  const rules = settings?.rules.filter(row => row.objectId === accountId) ?? [];
  return { limit: rules.find(row => row.scope === 'account') ?? null, exceptions: rules.filter(row => row.scope === 'policy') };
}

export const trafficAccounts = state => [
  ...enterpriseTenants(state).map(tenant => ({ ...tenant, name: tenant.name, kind: '政企' })),
  ...individualAccounts(state).map(account => ({ ...account.tenant, name: individualName(account), kind: '个人' })),
];

export function modelTraffic(settings, modelId) {
  const override = settings?.rules.find(row => row.scope === 'model' && row.objectId === modelId);
  return { limit: override ?? settings?.modelDefault, custom: Boolean(override) };
}

export function effectiveTraffic(settings, policy, modelId) {
  const hit = [
    { id: 'exception', name: '一客一策', limit: policy.exceptions.find(row => row.modelId === modelId) },
    { id: 'account', name: '账号自定义', limit: policy.limit },
    { id: 'global', name: '全局默认', limit: settings?.global },
  ].find(row => validTrafficLimit(row.limit));
  const model = modelId ? modelTraffic(settings, modelId) : null;
  const accountLimit = hit?.limit;
  const modelLimit = model?.limit;
  const finalLimit = !modelId ? accountLimit : accountLimit && modelLimit ? {
    rpm: Math.min(accountLimit.rpm, modelLimit.rpm),
    tpm: Math.min(accountLimit.tpm, modelLimit.tpm),
  } : undefined;
  return { hit, model, finalLimit };
}
