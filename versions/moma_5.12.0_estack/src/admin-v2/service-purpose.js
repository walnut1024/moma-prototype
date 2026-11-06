export const SERVICE_PURPOSES = { internal: '内部使用', commercial: '对外经营' };

export function servicePurpose(model, providerId) {
  const entry = providerId && model.serviceProviders?.find(row => row.providerId === providerId && row.status !== '已移除');
  return (entry?.purpose ?? model.purpose) === 'internal' ? 'internal' : 'commercial';
}
