export function readModelDetail(search) {
  const query = new URLSearchParams(search);
  return query.get('page') === 'model-detail' ? { modelKey: query.get('model') || '', id: query.get('service') || '' } : null;
}

export function modelDetailLocation(href, service) {
  const url = new URL(href);
  for (const key of ['page', 'model', 'service', 'task']) url.searchParams.delete(key);
  if (service) {
    url.searchParams.set('page', 'model-detail');
    url.searchParams.set('model', service.modelKey);
    url.searchParams.set('service', service.id);
  }
  return url.pathname + url.search + url.hash;
}
