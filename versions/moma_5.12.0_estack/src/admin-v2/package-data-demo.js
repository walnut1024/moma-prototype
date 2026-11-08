const demoCustomers = {
  'DEMO-C01': { name: '个人客户 A', type: 'individual' },
  'DEMO-C02': { name: '个人客户 B', type: 'individual' },
  'DEMO-C03': { name: '政企客户 C', type: 'enterprise' },
  'DEMO-C04': { name: '政企客户 D', type: 'enterprise' },
};

export const PACKAGE_DEMO_RECORDS = [
  {
    id: 'DEMO-SUB-01', kind: 'subscription', name: '个人月度订阅', tier: '个人版', status: 'listed',
    orders: [
      { id: 'SUB-101', day: '2026-10-02', time: '09:24:16', buyer: 'DEMO-C01', repeat: false, quantity: 1, paid: 2900, refund: 0, quota: 10000000, expires: '2026-11-02' },
      { id: 'SUB-102', day: '2026-10-31', time: '16:08:35', buyer: 'DEMO-C01', repeat: true, quantity: 1, paid: 2900, refund: 200, quota: 10000000, starts: '2026-11-02', expires: '2026-12-02' },
    ],
    usage: [
      { id: 'USE-101', order: 'SUB-101', day: '2026-10-12', model: 'Qwen3.6-Plus', item: '输入 Token', input: 200000, tokens: 200000, lower: null, upper: 256000, factor: 1.5, supplier: '演示供应商 A', channel: '渠道 01', version: 'v2', cost: 140 },
      { id: 'USE-102', order: 'SUB-101', day: '2026-10-31', model: 'Qwen3.6-Plus', item: '输入 Token', input: 300000, tokens: 300000, lower: 256000, upper: 1000000, factor: 5, supplier: '演示供应商 A', channel: '渠道 01', version: 'v2', cost: 420 },
    ],
    revenue: [
      { order: 'SUB-101', day: '2026-10-15', amount: 1300 },
      { order: 'SUB-101', day: '2026-10-31', amount: 1500 },
    ],
  },
  {
    id: 'DEMO-SUB-02', kind: 'subscription', name: '团队季度订阅', tier: '团队版', status: 'unlisted',
    orders: [
      { id: 'SUB-201', day: '2026-10-18', time: '14:30:05', buyer: 'DEMO-C03', repeat: false, quantity: 2, paid: 39800, refund: 0, quota: 100000000, expires: '2027-01-18' },
    ],
    usage: [
      { id: 'USE-201', order: 'SUB-201', day: '2026-10-22', model: 'GLM-5.3', item: '输入 Token', input: 160000, tokens: 160000, lower: null, upper: null, factor: 1.5, supplier: '演示供应商 B', channel: '渠道 02', version: null, cost: null },
      { id: 'USE-202', order: 'SUB-201', day: '2026-10-25', model: 'GLM-5.3', item: '输出 Token', input: 80000, tokens: 40000, lower: null, upper: null, factor: 3, supplier: '演示供应商 B', channel: '渠道 03', version: 'v1', cost: 180 },
    ],
    revenue: [{ order: 'SUB-201', day: '2026-10-31', amount: 6200 }],
  },
  {
    id: 'DEMO-PACK-01', kind: 'pack', name: '通用 Token 资源包', tier: '通用版', status: 'listed',
    orders: [
      { id: 'PACK-101', day: '2026-10-03', time: '11:07:28', buyer: 'DEMO-C02', repeat: false, quantity: 1, paid: 5900, refund: 0, quota: 20000000, expires: '2026-11-03' },
      { id: 'PACK-102', day: '2026-10-31', time: '10:12:42', buyer: 'DEMO-C02', repeat: true, quantity: 2, paid: 11800, refund: 0, quota: 40000000, expires: '2026-12-01' },
    ],
    usage: [
      { id: 'USE-301', order: 'PACK-101', day: '2026-10-13', model: 'DeepSeek-V4-Flash', item: '输入 Token', input: 150000, tokens: 150000, lower: null, upper: null, factor: 0.6, supplier: '演示供应商 C', channel: '渠道 01', version: 'v1', cost: 60 },
      { id: 'USE-302', order: 'PACK-102', copy: 2, day: '2026-10-31', model: 'DeepSeek-V4-Flash', item: '缓存读取 Token', input: 250000, tokens: 200000, lower: null, upper: null, factor: 0.2, supplier: '演示供应商 C', channel: '渠道 01', version: 'v1', cost: 20 },
    ],
    revenue: [
      { order: 'PACK-101', day: '2026-10-31', amount: 5200 },
      { order: 'PACK-102', day: '2026-10-31', amount: 2000 },
    ],
  },
  {
    id: 'DEMO-PACK-02', kind: 'pack', name: '短期体验资源包', tier: '体验版', status: 'unlisted',
    orders: [
      { id: 'PACK-201', day: '2026-10-08', time: '08:40:10', buyer: 'DEMO-C02', repeat: false, quantity: 1, paid: 500, refund: 0, quota: 200000, expires: '2026-10-15' },
      { id: 'PACK-202', day: '2026-10-17', time: '13:26:51', buyer: 'DEMO-C04', repeat: false, quantity: 1, paid: 500, refund: 0, quota: 200000, expires: '2026-10-24' },
    ],
    usage: [
      { id: 'USE-401', order: 'PACK-201', day: '2026-10-10', model: 'GLM-5.3', item: '输入 Token', input: 100000, tokens: 100000, lower: null, upper: null, factor: 1.5, supplier: '演示供应商 B', channel: '渠道 02', version: 'v1', cost: 1210 },
    ],
    revenue: [
      { order: 'PACK-201', day: '2026-10-15', amount: 500 },
      { order: 'PACK-202', day: '2026-10-24', amount: 500 },
    ],
  },
];

const sum = (items, value) => items.reduce((total, item) => total + value(item), 0);
const dayMillis = 86400000;
const addDays = (day, days) => new Date(Date.parse(day) + days * dayMillis).toISOString().slice(0, 10);

export function packageDemoWindow(today) {
  const offset = (Date.parse(today) - Date.parse('2026-11-01')) / dayMillis;
  const shift = day => addDays(day, offset);
  const shiftEvent = entry => ({ ...entry, day: shift(entry.day) });
  return {
    start: shift('2026-10-01'),
    end: today,
    records: PACKAGE_DEMO_RECORDS.map(record => ({
      ...record,
      orders: record.orders.map(order => ({
        ...shiftEvent(order), expires: shift(order.expires), starts: order.starts && shift(order.starts),
      })),
      usage: record.usage.map(shiftEvent),
      revenue: record.revenue.map(shiftEvent),
    })),
  };
}

const entitlementId = (orderId, copy) => `${orderId}-${String(copy).padStart(2, '0')}`;

export function filterPackageDemo(record, { start, end }, customerType = 'all') {
  const inPeriod = day => day >= start && day <= end;
  const orders = record.orders
    .filter(order => order.day <= end && (customerType === 'all' || demoCustomers[order.buyer].type === customerType))
    .map(order => ({ ...order, customer: demoCustomers[order.buyer] }));
  const orderIds = new Set(orders.map(order => order.id));
  const usageThroughEnd = record.usage
    .filter(entry => entry.day <= end && orderIds.has(entry.order))
    .map(entry => ({ ...entry, deducted: entry.tokens * entry.factor }));
  const deductions = new Map();
  for (const entry of usageThroughEnd) {
    const id = entitlementId(entry.order, entry.copy ?? 1);
    const amounts = deductions.get(id) ?? { deducted: 0, cost: 0 };
    amounts.deducted += entry.deducted;
    amounts.cost = amounts.cost === null || entry.cost === null ? null : amounts.cost + entry.cost;
    deductions.set(id, amounts);
  }
  const active = orders.filter(order => (order.starts ?? order.day) <= end && order.expires > end);
  const entitlements = orders.flatMap(order => {
    const starts = order.starts ?? order.day;
    if (!inPeriod(order.day) && (starts > end || order.expires < start)) return [];
    return Array.from({ length: order.quantity }, (_, index) => {
      const id = entitlementId(order.id, index + 1);
      const { deducted, cost } = deductions.get(id) ?? { deducted: 0, cost: 0 };
      const quota = order.quota / order.quantity;
      const remaining = order.expires <= end ? 0 : Math.max(0, quota - deducted);
      let status = '生效中';
      if (order.expires <= end) status = '已到期';
      else if (starts > end) status = '待生效';
      else if (remaining === 0) status = '已用完';
      return { id, orderId: order.id, orderedAt: `${order.day} ${order.time}`, packageId: record.id,
        userId: order.buyer, accountName: order.customer.name, accountType: order.customer.type, tier: record.tier,
        quota, expires: order.expires, status, deducted, remaining, cost };
    });
  }).reverse();
  return {
    orders: orders.filter(order => inPeriod(order.day)),
    usage: usageThroughEnd.filter(entry => inPeriod(entry.day)),
    revenue: record.revenue.filter(entry => inPeriod(entry.day) && orderIds.has(entry.order)),
    remaining: sum(entitlements.filter(row => row.status === '生效中'), row => row.remaining),
    expiring: sum(active.filter(order => order.expires <= addDays(end, 7)), order => order.quantity),
    expired: sum(orders.filter(order => inPeriod(order.expires)), order => order.quantity),
    expiredThroughEnd: sum(orders.filter(order => order.expires <= end), order => order.quantity),
    entitlements,
  };
}

export function packageDemoSummary(reports) {
  const orders = reports.flatMap(report => report.orders);
  const usage = reports.flatMap(report => report.usage);
  const revenue = reports.flatMap(report => report.revenue);
  const rated = reports.flatMap(report => report.entitlements).filter(row => row.status !== '待生效' && row.quota > 0);
  const paid = sum(orders, order => order.paid);
  const refunds = sum(orders, order => order.refund);
  const income = sum(revenue, entry => entry.amount);
  const settled = usage.filter(entry => entry.cost !== null);
  const pending = usage.length - settled.length;
  const cost = usage.length && !settled.length ? null : sum(settled, entry => entry.cost);
  const profit = pending ? null : income - cost;
  return {
    buyers: new Set(orders.map(order => order.buyer)).size,
    orderCount: orders.length,
    quantity: sum(orders, order => order.quantity),
    paid, refunds, netPaid: paid - refunds,
    tokens: sum(usage, entry => entry.tokens),
    deducted: sum(usage, entry => entry.deducted),
    remaining: sum(reports, report => report.remaining),
    expiring: sum(reports, report => report.expiring),
    expired: sum(reports, report => report.expired),
    expiredThroughEnd: sum(reports, report => report.expiredThroughEnd),
    averageConsumptionRate: rated.length ? sum(rated, row => row.deducted / row.quota) / rated.length : null,
    cost, pending, income, profit,
    margin: profit === null || !income ? null : profit / income,
  };
}
