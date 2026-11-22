function beijingDay(timestamp) {
  const time = Date.parse(timestamp);
  return Number.isFinite(time) ? new Date(time + 8 * 3600000).toISOString().slice(0, 10) : null;
}

export function packageOrdersThrough(orders, end) {
  return orders.map(row => ({ ...row, day: beijingDay(row.createdAt), expires: beijingDay(row.expiresAt) }))
    .filter(row => row.day && row.day <= end);
}

export function summarizePackageOrders(orders, { start, end }, today) {
  const metered = orders.filter(row => row.entitlement > 0 && Number.isFinite(row.used));
  return {
    quantity: orders.filter(row => row.day >= start).length,
    expiredThroughEnd: orders.filter(row => row.expires && row.expires <= end).length,
    averageConsumptionRate: metered.length && end === today
      ? metered.reduce((sum, row) => sum + row.used / row.entitlement, 0) / metered.length : null,
  };
}
