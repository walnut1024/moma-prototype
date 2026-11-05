import mockConfig from './mock/catalogues.json' with { type: 'json' };
// Purchased subscriptions are distinct even when their product names match.
export const tokenPlanSubscriptions = mockConfig["token-plan-data.mjs"]["tokenPlanSubscriptions"];
