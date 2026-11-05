export function providerKeyGroups(provider, keys = provider.apiKeys || []) {
  keys = keys.filter(key => key.scope !== 'channel');
  const known = new Set(keys.map(key => key.id));
  const assigned = new Set();
  const groups = (provider.apiKeyGroups || []).filter(group => group.id !== 'default').map(group => ({ ...group, keyIds: (group.keyIds || []).filter(id => {
    if (!known.has(id) || assigned.has(id)) return false;
    assigned.add(id); return true;
  }) }));
  const saved = provider.apiKeyGroups?.find(group => group.id === 'default');
  const keyIds = [...new Set([...(saved?.keyIds || []), ...keys.map(key => key.id)])].filter(id => known.has(id) && !assigned.has(id));
  if (!saved && keyIds.includes(provider.defaultApiKeyId)) keyIds.splice(0, 0, ...keyIds.splice(keyIds.indexOf(provider.defaultApiKeyId), 1));
  return [{ id: 'default', name: '默认 API 密钥组', keyIds }, ...groups];
}

export function providerKeyGroupKeys(provider, groupId, includeDisabled = false, keys = provider.apiKeys || []) {
  const group = providerKeyGroups(provider, keys).find(row => row.id === groupId);
  return (group?.keyIds || []).map(id => keys.find(key => key.id === id)).filter(key => key && (includeDisabled || key.status !== 'disabled'));
}
