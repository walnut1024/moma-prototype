import { AGREEMENTS, MAX_AGREEMENT_TEXT, siteUrl } from '../src/site-config.mjs';

const id = 'published';

export async function readPublishedSiteSetting(db, key) {
  const payload = await db.prepare('SELECT payload_json FROM simulation_records WHERE kind=? AND id=?').bind(key, id).first('payload_json');
  return payload ? JSON.parse(payload) : null;
}

export function validateAgreements(body) {
  const { expectedRevision, agreements } = body;
  if (!Number.isSafeInteger(expectedRevision) || expectedRevision < 0 || !agreements || typeof agreements !== 'object' ||
    Object.keys(agreements).length !== AGREEMENTS.length) return null;
  const values = {};
  for (const [kind] of AGREEMENTS) {
    const value = agreements[kind];
    if (!value || typeof value.text !== 'string' || typeof value.url !== 'string' ||
      Object.keys(value).length !== 2 || value.text.length > MAX_AGREEMENT_TEXT) return null;
    const text = value.text.trim(), url = siteUrl(value.url);
    if (value.url.trim() && (!url || text)) return null;
    values[kind] = { text, url };
  }
  return { revision: expectedRevision + 1, agreements: values };
}

export async function savePublishedSiteSetting(db, key, next) {
  const expected = next.revision - 1;
  // shortcut: keep one namespaced record in the prototype store until site settings have a dedicated table
  const saved = await db.prepare(`
    INSERT INTO simulation_records(kind,id,payload_json)
    SELECT ?,?,? WHERE ?=0 OR EXISTS (SELECT 1 FROM simulation_records WHERE kind=? AND id=?)
    ON CONFLICT(kind,id) DO UPDATE SET payload_json=excluded.payload_json
    WHERE json_extract(simulation_records.payload_json,'$.revision')=?
    RETURNING payload_json
  `).bind(key, id, JSON.stringify(next), expected, key, id, expected).first('payload_json');
  return saved ? JSON.parse(saved) : null;
}
