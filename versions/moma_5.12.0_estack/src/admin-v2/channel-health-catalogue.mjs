export function displayBaseUrl(value) {
  if (typeof value !== 'string' || !URL.canParse(value)) return undefined;
  const url = new URL(value);
  if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password || url.search || url.hash) return undefined;
  return value.trim();
}

export function channelHealthCatalogue(connections, includeCost) {
  return connections.flatMap(({ id, name, status, provider, endpoint, models }) => models.map(cost => {
    const upstreamModelId = cost.association.upstreamModelId;
    return { channelModel: JSON.stringify([provider.id, id, upstreamModelId ?? null]),
      provider: provider.id, providerName: provider.name, channel: id, channelName: name, endpoint: id, upstreamModelId,
      baseUrl: displayBaseUrl(endpoint?.baseUrl),
      enabled: status === '已启用' && cost.association.enabled === true,
      ...(includeCost && { cost: { key: cost.key, status: cost.status,
        items: cost.items.map(({ name, condition, amount, currency, unit }) => ({ name, condition, amount, currency, unit })) } }) };
  }));
}
