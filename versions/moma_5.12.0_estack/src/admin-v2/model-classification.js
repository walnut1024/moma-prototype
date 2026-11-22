import { resourceId } from '../resource-id.mjs';
import { modelLibrary } from './model-library.js';

export const CLASSIFICATION_KINDS = { authors: '模型作者', series: '模型系列' };
export const classificationKind = params => params.get('tab') === 'series' ? 'series' : 'authors';
export const classificationQuery = kind => kind === 'series' ? { view: 'classification', tab: kind } : { view: 'classification' };
export const classificationHref = kind => '#/admin-2/model-templates?' + new URLSearchParams(classificationQuery(kind));
export const classificationKey = name => String(name ?? '').normalize('NFKC').trim().replace(/\s+/gu, ' ').toLowerCase();
const scopedKey = (author, name) => JSON.stringify([author, classificationKey(name)]);
const names = entry => [entry.name, ...entry.aliases, ...(entry.formerNames || [])];
const text = value => typeof value === 'string' ? value.trim() : '';

export function existingClassification(models) {
  const authors = new Map(), series = new Map();
  for (const model of models) {
    const name = text(model.profile?.author) || text(model.maker);
    if (!name) continue;
    const key = classificationKey(name);
    if (!authors.has(key)) authors.set(key, { id: 'existing-author:' + key, name, aliases: [], active: true });
    const family = text(model.profile?.family);
    if (!family) continue;
    const authorId = authors.get(key).id, familyKey = scopedKey(authorId, family);
    if (!series.has(familyKey)) series.set(familyKey, { id: 'existing-series:' + familyKey, authorId, name: family, aliases: [], active: true });
  }
  return { authors: [...authors.values()], series: [...series.values()] };
}

export const modelClassification = state => state.modelData?.modelClassification || existingClassification(modelLibrary(state));

export function classificationIndex({ authors, series }) {
  return {
    authors: new Map(authors.map(row => [row.id, row])),
    series: new Map(series.map(row => [row.id, row])),
    authorNames: new Map(authors.flatMap(row => names(row).map(name => [classificationKey(name), row]))),
    seriesNames: new Map(series.flatMap(row => names(row).map(name => [scopedKey(row.authorId, name), row]))),
  };
}

export function modelClassificationFor(index, model) {
  const { profile = {}, maker } = model;
  const authorName = profile.author || maker || '', seriesName = profile.family || '';
  const author = profile.authorId ? index.authors.get(profile.authorId) : index.authorNames.get(classificationKey(authorName));
  const candidate = profile.familyId ? index.series.get(profile.familyId) : index.seriesNames.get(scopedKey(author?.id, seriesName));
  const series = candidate?.authorId === author?.id ? candidate : undefined;
  return { author, series, authorName, seriesName };
}

export function classifiedProfile(index, profile, { strict = false, existing } = {}) {
  if (!profile) return profile;
  const { author, series, authorName, seriesName } = modelClassificationFor(index, { profile });
  const previous = existing && modelClassificationFor(index, existing);
  if ((strict || profile.authorId) && (authorName || profile.authorId) &&
      (!author || !author.active && previous?.author?.id !== author.id)) throw Error('请选择已启用的模型作者');
  if ((strict || profile.familyId) && (seriesName || profile.familyId) &&
      (!series || !series.active && previous?.series?.id !== series.id)) throw Error('请选择该作者下已启用的模型系列');
  return { ...profile, ...(author && { author: author.name, authorId: author.id }), ...(series && { family: series.name, familyId: series.id }) };
}

export function saveClassification(dictionary, data) {
  const { kind, id, active } = data;
  const authorId = kind === 'series' ? data.authorId : undefined;
  if (!['authors', 'series'].includes(kind) || typeof active !== 'boolean') throw Error('分类及状态无效');
  const rows = dictionary[kind], current = rows.find(row => row.id === id);
  if (id && !current) throw Error('分类已变化，请重新核对');
  if (kind === 'series') {
    const owner = dictionary.authors.find(row => row.id === authorId);
    if (!owner || current && current.authorId !== authorId || active && !owner.active && current?.active !== true) throw Error('请选择已启用的所属作者');
  }
  const name = text(data.name);
  if (!name || name.length > 100) throw Error('分类名称必填，最多 100 字');
  if (!Array.isArray(data.aliases) || data.aliases.length > 20 || data.aliases.some(alias => typeof alias !== 'string' || !alias.trim() || alias.length > 100)) {
    throw Error('别名最多 20 个，每个最多 100 字');
  }
  const aliases = new Map(data.aliases.map(alias => [classificationKey(alias), alias.trim()]));
  aliases.delete(classificationKey(name));
  // Keep former standard names resolvable for records that predate dictionary references.
  const formerNames = [...new Set([...(current?.formerNames || []), ...(current ? [current.name] : [])])]
    .filter(value => classificationKey(value) !== classificationKey(name));
  const values = new Set([classificationKey(name), ...aliases.keys(), ...formerNames.map(classificationKey)]);
  if (rows.some(row => row.id !== id && row.authorId === authorId && names(row).some(value => values.has(classificationKey(value))))) {
    throw Error('名称或别名已存在');
  }
  const entry = { id: current?.id || resourceId(kind === 'authors' ? 'model-author' : 'model-series'), name, aliases: [...aliases.values()], formerNames, active, ...(kind === 'series' && { authorId }) };
  return { entry, dictionary: { ...dictionary, [kind]: current ? rows.map(row => row.id === id ? entry : row) : [...rows, entry] } };
}
