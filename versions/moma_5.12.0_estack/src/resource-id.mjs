const uuidV4 = '[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}';

export function resourceId(type) {
  return `${type}-${crypto.randomUUID()}`;
}

export function isResourceId(value, type) {
  return typeof value === 'string' && new RegExp(`^${type}-${uuidV4}$`).test(value);
}
