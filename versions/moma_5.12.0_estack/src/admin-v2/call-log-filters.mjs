import { filterObservations, observationFilters, observationWindow } from './call-observations.mjs';

const minute = 60_000;
const day = 24 * 60 * minute;

export function logFilters(params = new URLSearchParams()) {
  return { ...observationFilters(params, '7d'), request: params.get('request') || '', errorCode: params.get('errorCode') || '' };
}

export function logWindow(filters, now = Date.now()) {
  const { period } = filters;
  if (period !== '7d' && period !== '30d') return observationWindow(filters, now);
  const today = observationWindow({ period: 'today' }, now);
  return { start: today.start - (period === '7d' ? 6 : 29) * day, end: now };
}

export function logMinuteRange(start, end) {
  if (!Number.isFinite(start) || !Number.isFinite(end)) return null;
  const firstMinute = Math.floor(start / minute) * minute;
  const lastMinute = Math.floor(end / minute) * minute;
  if (lastMinute < firstMinute || lastMinute - firstMinute > 30 * day) return null;
  return { period: 'custom', start: new Date(firstMinute).toISOString(), end: new Date(lastMinute + minute).toISOString() };
}

export function filterCallLogs(rows, filters, window, upstream = false) {
  const query = upstream ? filters.query.trim().toLowerCase() : '';
  const matching = filterObservations(rows, upstream ? { ...filters, query: '' } : filters, window);
  return matching.filter(row => (!filters.request || filters.request.trim() === row.requestId)
    && (!filters.errorCode || filters.errorCode === row.code)
    && (!query || [row.requestId, row.upstreamRequestId].some(id => String(id ?? '').toLowerCase().includes(query))));
}
