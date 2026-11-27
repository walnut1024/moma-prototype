import { dayOf } from './analytics.js';
import { usageWindow } from './usage-analysis.js';

const HOUR = 60 * 60 * 1000;
const DAY = 24 * HOUR;
const knownNumber = value => Number.isFinite(value) && value >= 0 ? value : null;

function completeTotal(rows, field) {
  return rows.every(row => row[field] !== null) ? rows.reduce((sum, row) => sum + row[field], 0) : null;
}

export function packageReport(orders, packages, range, now = Date.now()) {
  const window = usageWindow(range, now);
  const current = range.end === dayOf(now);
  const names = new Map(packages.map(item => [item.id, item.displayName || item.name]));
  const rows = [];
  const distribution = new Map();
  const individualAccounts = new Set();
  const enterpriseAccounts = new Set();
  const totals = { individual: 0, enterprise: 0 };
  const step = window?.hourly ? HOUR : DAY;
  const slots = window?.hourly ? Math.min(24, Math.floor((window.end - window.start) / HOUR) + 1) : window?.days ?? 0;
  const trend = Array.from({ length: slots }, (_, index) => {
    const beijing = new Date(window.start + index * step + 8 * HOUR).toISOString();
    return { label: beijing.slice(5, window.hourly ? 16 : 10).replace('T', ' '), individual: 0, enterprise: 0 };
  });

  if (window) for (const order of orders) {
    const acquired = Date.parse(order.createdAt);
    if (!Number.isFinite(acquired) || acquired < window.start || acquired >= window.start + window.days * DAY || acquired > now) continue;

    const expiry = Date.parse(order.expiresAt);
    const expired = current ? expiry <= now : expiry < window.end;
    const tier = order.tier || names.get(order.packageId) || '未记录';
    const entitlement = knownNumber(order.entitlement);
    const used = current ? knownNumber(order.used) : null;
    const remaining = entitlement === null || used === null ? null : expired ? 0 : Math.max(0, entitlement - used);
    const active = ['生效中', '已开通'].includes(order.status);
    const status = active && expired ? '已过期' : active && remaining === 0 ? '已用完' : order.status;
    const cost = current ? knownNumber(order.cost) : null;
    const usage = current && Array.isArray(order.usage) ? order.usage : null;
    rows.push({ ...order, tier, entitlement, used, remaining, status, cost, usage });
    distribution.set(tier, (distribution.get(tier) || 0) + 1);

    const bucket = trend[Math.floor((acquired - window.start) / step)];
    if (order.accountType === 'individual') {
      totals.individual += 1;
      bucket.individual += 1;
      if (order.userId) individualAccounts.add(order.userId);
    } else if (order.accountType === 'enterprise') {
      totals.enterprise += 1;
      bucket.enterprise += 1;
      if (order.tenantId) enterpriseAccounts.add(order.tenantId);
    }
  }

  return {
    rows: rows.sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt)),
    trend,
    distribution: [...distribution].map(([label, value]) => ({ label, value })),
    totals: { ...totals, individualAccounts: individualAccounts.size, enterpriseAccounts: enterpriseAccounts.size,
      tokens: completeTotal(rows, 'entitlement'), cost: completeTotal(rows, 'cost') },
  };
}
