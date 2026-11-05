import mockConfig from './mock/catalogues.json' with { type: 'json' };
export const apiKeySamples = mockConfig["api-key-data.mjs"]["apiKeySamples"];

export function apiKeyOptions(billing, subscription) {
 const scope = subscription?.id ?? ["按量付费", "Token Plan"].indexOf(billing);
 return apiKeySamples.map((key, index) => ({ ...key, id: subscription ? `ak-${scope}-${index + 1}` : `${key.id}-${scope}`, key: `${key.key}-${scope}`, ...(subscription ? { subscriptionId: subscription.id, created: `${subscription.startAt} ${key.created.slice(11)}` } : {}) }));
}
