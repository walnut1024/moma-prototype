import { MODEL_SERVICE_PAGES } from './ops-models.js';
import { RESOURCE_PAGES } from './ops-resources.js';

export const infrastructurePages = { ...MODEL_SERVICE_PAGES, ...RESOURCE_PAGES };
export const INFRASTRUCTURE_STORAGE = 'moma-5.12.0-estack:infrastructure';

function readSaved() {
  const saved = JSON.parse(localStorage.getItem(INFRASTRUCTURE_STORAGE) ?? '{}');
  if (!saved || typeof saved !== 'object' || Array.isArray(saved)) throw Error('运维演示数据格式不正确');
  return saved;
}

function withSeeds(saved) {
  return Object.fromEntries(Object.entries(infrastructurePages).map(([key, page]) => {
    const records = saved[key] ?? page.seed;
    if (!Array.isArray(records) || records.some(row => typeof row?.id !== 'string') ||
        new Set(records.map(row => row.id)).size !== records.length) {
      throw Error('运维演示数据格式不正确');
    }
    return [key, records];
  }));
}

export function readInfrastructure() {
  return withSeeds(readSaved());
}

export async function changeInfrastructure(pageId, change) {
  const update = () => {
    const saved = readSaved();
    const records = withSeeds(saved);
    const result = change(records[pageId], records);
    const updates = Array.isArray(result) ? { [pageId]: result } : { ...result.related, [pageId]: result.rows };
    if (Object.entries(updates).some(([key, rows]) => !Object.hasOwn(records, key) || !Array.isArray(rows))) {
      throw Error('运维演示数据更新范围无效');
    }
    const next = { ...saved, ...updates };
    const validated = withSeeds(next);
    localStorage.setItem(INFRASTRUCTURE_STORAGE, JSON.stringify(next));
    return validated;
  };
  return navigator.locks ? navigator.locks.request(INFRASTRUCTURE_STORAGE, update) : update();
}
