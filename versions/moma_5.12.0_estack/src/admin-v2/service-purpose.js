import { providerOffer } from '../service-access.mjs';

export const SERVICE_PURPOSES = { internal: '内部使用', commercial: '对外经营' };

export function servicePurpose(model, providerId) {
  const entry = providerId && providerOffer(model, providerId);
  return (entry?.purpose ?? model.purpose) === 'internal' ? 'internal' : 'commercial';
}
