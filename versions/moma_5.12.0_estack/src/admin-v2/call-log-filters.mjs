import { filterObservations, observationFilters } from './call-observations.mjs';

export function logFilters(params = new URLSearchParams()) {
  return { ...observationFilters(params, '24h'), request: params.get('request') || '', errorCode: params.get('errorCode') || '' };
}

export function filterCallLogs(rows, filters, window, upstream = false) {
  const query = upstream ? filters.query.trim().toLowerCase() : '';
  const matching = filterObservations(rows, upstream ? { ...filters, query: '' } : filters, window);
  return matching.filter(row => (!filters.request || filters.request.trim() === row.requestId)
    && (!filters.errorCode || filters.errorCode === row.code)
    && (!query || [row.requestId, row.upstreamRequestId].some(id => String(id ?? '').toLowerCase().includes(query))));
}
