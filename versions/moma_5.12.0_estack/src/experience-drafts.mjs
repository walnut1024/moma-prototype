const drafts = new Map();
export function readExperienceDraft(owner, kind) {
  if (!owner) return {};
  const key = `moma-5120-draft:${owner}:${kind}`;
  if (drafts.has(key)) return drafts.get(key);
  const raw = globalThis.localStorage?.getItem(key);
  return raw ? JSON.parse(raw) : {};
}
export function saveExperienceDraft(owner, kind, draft) {
  if (!owner) return;
  const key = `moma-5120-draft:${owner}:${kind}`;
  drafts.set(key, draft);
  // shortcut: local files survive account switches in this tab; reattach after a browser reload.
  globalThis.localStorage?.setItem(key, JSON.stringify(draft, (key, value) => ['file', 'images'].includes(key) ? undefined : value));
}
