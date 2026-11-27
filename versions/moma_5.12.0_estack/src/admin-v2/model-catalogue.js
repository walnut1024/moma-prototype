// Search behavior follows GPUStack v2.3.1's gpustack/utils/search.py (Apache-2.0).
import { resourceId } from '../resource-id.mjs';

const letterOrNumber = /[\p{L}\p{N}]/u;
const digit = /[\p{Nd}\p{No}]/u;
const squash = text => text.toLowerCase().replace(/[^\p{L}\p{N}]/gu, '');

function searchableName(name) {
  let text = '';
  let wasDigit;
  const boundaries = new Set();
  for (const character of name.toLowerCase()) {
    if (!letterOrNumber.test(character)) {
      wasDigit = undefined;
      continue;
    }
    const isDigit = digit.test(character);
    if (isDigit !== wasDigit) boundaries.add(text.length);
    text += character;
    wasDigit = isDigit;
  }
  boundaries.add(text.length);
  return { text, boundaries };
}

function tokenMatch(token, text, boundaries) {
  let best;
  for (let position = text.indexOf(token); position !== -1; position = text.indexOf(token, position + 1)) {
    const starts = boundaries.has(position);
    const ends = boundaries.has(position + token.length);
    const score = starts ? ends ? 10 : 6 : ends ? 3 : 1;
    if (!best || score > best.score) best = { position, score, token };
    if (score === 10) break;
  }
  return best;
}

function scoreName(name, tokens) {
  const { text, boundaries } = searchableName(name);
  const matches = tokens.map(token => tokenMatch(token, text, boundaries));
  if (matches.some(match => !match)) return null;
  matches.sort((left, right) => left.position - right.position || (left.token < right.token ? -1 : +(left.token > right.token)));
  const combined = matches.map(match => match.token).join('');
  return matches.reduce((sum, match) => sum + match.score, 0) +
    (matches.length > 1 && text.includes(combined) ? 25 : 0) +
    (text.startsWith(combined) ? 15 : 0) +
    (text === combined ? 40 : 0);
}

export const catalogueCategoryLabels = {
  llm: 'LLM',
  embedding: 'Embedding',
  reranker: 'Reranker',
  image: 'Image',
  text_to_speech: 'Text-to-Speech',
  speech_to_text: 'Speech-to-Text',
  decision: 'Decision',
};

export function browseCatalogue(rows, query = '') {
  const curated = [...rows].sort((left, right) => (left.order ?? Infinity) - (right.order ?? Infinity) ||
    String(right.releaseDate ?? '').localeCompare(String(left.releaseDate ?? '')));
  const tokens = query.split(/\s+/).map(squash).filter(Boolean);
  if (!tokens.length) return curated;
  const ranked = curated.map(row => ({ row, score: scoreName(row.name, tokens) }))
    .filter(item => item.score !== null)
    .sort((left, right) => right.score - left.score);
  const floor = tokens.length > 1 && ranked.length ? ranked[0].score * 0.4 : 0;
  return ranked.filter(item => item.score >= floor).map(item => item.row);
}

const comparison = /^(===|==|!=|~=|[<>]=?)\s*(\d+(?:\.\d+)*(?:\.\*)?)$/;
const release = /^\d+(?:\.\d+)*$/;
const selectors = value => String(value).split(',').map(rule => rule.trim().match(comparison));

export function validCatalogueCapability(value) {
  return typeof value === 'string' && selectors(value).every(rule => rule &&
    (!rule[2].endsWith('.*') || ['==', '!='].includes(rule[1])) &&
    (rule[1] !== '~=' || rule[2].includes('.')));
}

function compareRelease(left, right) {
  for (let index = 0; index < Math.max(left.length, right.length); index++) {
    const difference = (left[index] ?? 0) - (right[index] ?? 0);
    if (difference) return difference;
  }
  return 0;
}

function matchesCapability(filter, actual) {
  if (!release.test(actual ?? '') || !validCatalogueCapability(filter)) return false;
  const device = String(actual).split('.').map(Number);
  return selectors(filter).every(([, operator, version]) => {
    const target = version.split('.').filter(part => part !== '*').map(Number);
    const matchesPrefix = length => target.slice(0, length).every((part, index) => part === (device[index] ?? 0));
    if (version.endsWith('.*')) return matchesPrefix(target.length) === (operator === '==');
    const order = compareRelease(device, target);
    switch (operator) {
      case '~=': return order >= 0 && matchesPrefix(target.length - 1);
      case '===': return String(actual) === version;
      case '==': return order === 0;
      case '!=': return order !== 0;
      case '>': return order > 0;
      case '>=': return order >= 0;
      case '<': return order < 0;
      case '<=': return order <= 0;
      default: return false;
    }
  });
}

const vendorAliases = { huawei: 'ascend', '华为': 'ascend', '昇腾': 'ascend', '海光': 'hygon', '英伟达': 'nvidia' };
const vendorKey = value => {
  const name = String(value || '').trim().toLowerCase();
  return vendorAliases[name] ?? name;
};
const asList = value => Array.isArray(value) ? value : value ? [value] : [];

export function catalogueRecipeMatches(spec, devices) {
  const filters = spec?.gpuFilters;
  if (!filters) return true;
  const wanted = asList(filters.vendor).map(vendorKey);
  const variants = asList(filters.vendor_variant).map(variant => variant.toLowerCase());
  if (wanted.length && !devices.some(device => wanted.includes(vendorKey(device.vendor)))) return false;
  if (variants.length && !devices.some(device => {
    if (vendorKey(device.vendor) !== 'ascend') return false;
    const variant = device.vendorVariant || device.vendor_variant ||
      String(device.archFamily || device.arch_family || device.name || '').match(/\b(?:ascend|ascend\s+)?(910b|910c|310p)\b/i)?.[1];
    return variant && variants.includes(variant.toLowerCase());
  })) return false;
  return !filters.compute_capability || devices.some(device =>
    matchesCapability(filters.compute_capability, device.computeCapability ?? device.compute_capability));
}

const catalogueModePriority = new Map([['throughput', 0], ['latency', 1], ['standard', 2]]);

export function catalogueRecipes(specs, devices) {
  const available = new Map();
  for (const [index, spec] of specs.entries()) {
    const mode = spec.mode ?? 'standard';
    if (!available.has(mode) && catalogueRecipeMatches(spec, devices)) {
      available.set(mode, { index, spec, mode });
    }
  }
  return [...available.values()].sort((left, right) => {
    const priority = (catalogueModePriority.get(left.mode) ?? 3) - (catalogueModePriority.get(right.mode) ?? 3);
    if (priority || left.mode === right.mode) return priority;
    return left.mode < right.mode ? -1 : 1;
  });
}

export function catalogueInitialRecipe(specs, devices) {
  return catalogueRecipes(specs, devices)[0];
}

const sourceFields = {
  huggingface: ['Hugging Face','huggingface_repo_id','huggingface_filename'],
  model_scope: ['ModelScope','model_scope_model_id','model_scope_file_path'],
  local_path: ['本地路径','local_path',null],
};
const knownIcon = /^\/static\/catalog_icons\/[a-z\d_.-]+\.(?:png|jpe?g|webp)$/i;
const rasterData = /^data:image\/(?:png|jpeg|webp|gif);base64,[a-z\d+/=]+$/i;
const sensitiveName = /(?:password|secret|authorization|credential|access[_-]?token|(?:hf|hub|modelscope)[_-]?token|api[_-]?key)/i;
const object = value => value && typeof value === 'object' && !Array.isArray(value) && !(value instanceof Date);

function webUrl(value) {
  try {
    const url = new URL(value);
    return (url.protocol === 'https:' || url.protocol === 'http:') && !url.username && !url.password;
  } catch { return false; }
}

export function catalogueIconSource(icon, base) {
  if (!icon) return undefined;
  if (knownIcon.test(icon)) return base + 'assets/model-catalog-icons/' + icon.split('/').at(-1);
  if (rasterData.test(icon) || webUrl(icon)) return icon;
}

function readModelSource(value, name) {
  if (!object(value) || !Object.hasOwn(sourceFields,value.source)) throw Error(`${name} 缺少有效的模型来源。`);
  const [,repositoryKey,filenameKey] = sourceFields[value.source];
  const repository = value[repositoryKey];
  const filename = filenameKey ? value[filenameKey] : undefined;
  if (typeof repository !== 'string' || !repository.trim() || filename != null && typeof filename !== 'string') {
    throw Error(`${name} 缺少有效的仓库或路径。`);
  }
  return { source:value.source, repository:repository.trim(), filename };
}

function exportModelSource(spec) {
  const [,repositoryKey,filenameKey] = sourceFields[spec.source];
  return { source:spec.source,[repositoryKey]:spec.repository,...(filenameKey && spec.filename ? { [filenameKey]:spec.filename } : {}) };
}

function readText(value, label) {
  if (value == null) return undefined;
  if (typeof value !== 'string') throw Error(`${label}须为文本。`);
  return value;
}

function readList(value, label) {
  if (value == null) return undefined;
  if (!Array.isArray(value) || value.some(item=>typeof item!=='string')) throw Error(`${label}须为文本列表。`);
  return value;
}

function readEnvironment(value, label) {
  if (value == null) return undefined;
  if (!object(value) || Object.entries(value).some(([key,item]) => !/^[a-z_]\w*$/i.test(key) ||
      sensitiveName.test(key) || typeof item!=='string' || /[\n\r]/.test(item))) throw Error(`${label}包含无效环境变量或凭证。`);
  return value;
}

function readFilter(value, label) {
  if (value == null) return undefined;
  if (!object(value) || Object.keys(value).some(key=>!['vendor','vendor_variant','compute_capability'].includes(key))) {
    throw Error(`${label}的 GPU 过滤条件无效。`);
  }
  for (const key of ['vendor','vendor_variant']) {
    if (value[key] != null && typeof value[key] !== 'string') readList(value[key], label + '的 GPU 过滤条件');
  }
  if (value.compute_capability != null && !validCatalogueCapability(value.compute_capability)) throw Error(`${label}的 GPU 算力范围无效。`);
  return value;
}

export function readCatalogueRecipe(value, label) {
  const source = readModelSource(value,label);
  const backend = readText(value.backend,label + '的推理后端');
  const imageName = readText(value.image_name,label + '的容器镜像');
  const backendVersion = readText(value.backend_version,label + '的后端版本');
  if (imageName && backendVersion) throw Error(`${label}不能同时配置容器镜像和后端版本。`);
  const parameters = readList(value.backend_parameters,label + '的后端参数');
  if (parameters?.some(item=>sensitiveName.test(item.split(/[= ]/,1)[0]) || /[\n\r]/.test(item))) {
    throw Error(`${label}包含无效后端参数或凭证。`);
  }
  return {
    ...source,backend,backendVersion,imageName,parameters,environment:readEnvironment(value.env,label),
    mode:readText(value.mode,label + '的模式') || 'standard', quantization:readText(value.quantization,label + '的量化类型'),
    gpuFilters:readFilter(value.gpu_filters,label), categories:readList(value.categories,label + '的类别'),
    speculativeConfig: object(value.speculative_config) ? Object.fromEntries(
      ['enabled','algorithm','draft_model','num_draft_tokens','ngram_min_match_length','ngram_max_match_length']
        .filter(key=>['string','number','boolean'].includes(typeof value.speculative_config[key]))
        .map(key=>[key,value.speculative_config[key]])
    ) : undefined,
  };
}

export function catalogueDocument(rows, drafts = []) {
  return { model_sets: rows.map(row => ({
    name:row.name,description:row.description,home:row.home,icon:row.icon,order:row.order,categories:row.categories,
    release_date:row.releaseDate,capabilities:row.capabilities,size:row.size,size_unit:row.sizeUnit,activated_size:row.activatedSize,
    experimental:row.experimental,licenses:row.licenses || row.license?.split('、'),specs:(row.specs ?? []).map(spec=>({
      ...exportModelSource(spec),mode:spec.mode,backend:spec.backend,backend_version:spec.backendVersion,image_name:spec.imageName,
      backend_parameters:spec.parameters,env:spec.environment,categories:spec.categories,
      gpu_filters:spec.gpuFilters,quantization:spec.quantization,speculative_config:spec.speculativeConfig,
    })),
  })), draft_models:drafts };
}

export function readCatalogueDocument(document, previous) {
  if (!object(document)) throw Error('模型库 YAML 须为配置对象。');
  const cards = document.model_sets ?? [];
  const drafts = document.draft_models ?? [];
  if (!Array.isArray(cards) || !Array.isArray(drafts)) throw Error('model_sets 和 draft_models 须为列表。');
  const existing = new Map(previous.map(row=>[row.name.toLowerCase(),row]));
  const seen = new Set();
  const rows = cards.map(entry => {
    const name = typeof entry?.name === 'string' ? entry.name.trim() : '';
    const key = name.toLowerCase();
    if (!name || seen.has(key) || !Array.isArray(entry.specs)) throw Error('模型名称必须唯一，specs 须为列表。');
    seen.add(key);
    const previousRow = existing.get(key);
    const specs = entry.specs.map((recipe,index)=>readCatalogueRecipe(recipe,`${name} 的规格 ${index+1}`));
    const spec = specs[0];
    const lists = Object.fromEntries(['capabilities','categories','licenses'].map(key=>[key,readList(entry[key],name + ' 的 ' + key)]));
    const icon = readText(entry.icon, name + ' 的图标');
    if (icon && !catalogueIconSource(icon,'/') && !/^\/(?!\/)[^\s]*$/.test(icon)) throw Error(`${name} 的图标地址无效。`);
    const home = readText(entry.home, name + ' 的主页');
    const date = entry.release_date instanceof Date ? entry.release_date.toISOString().slice(0,10) : entry.release_date;
    if (date != null && (typeof date!=='string' || !/^\d{4}-\d{2}-\d{2}$/.test(date) ||
      !Number.isFinite(Date.parse(date)) || new Date(date).toISOString().slice(0,10)!==date)) throw Error(`${name} 的发布日期无效。`);
    if (entry.size_unit != null && !['B','M','T'].includes(entry.size_unit)) throw Error(`${name} 的参数单位无效。`);
    if (entry.order != null && !Number.isInteger(entry.order)) throw Error(`${name} 的排序值须为整数。`);
    if (['size','activated_size'].some(field=>entry[field] != null && !Number.isFinite(entry[field]))) throw Error(`${name} 的参数规模须为数字。`);
    return {
      ...previousRow,id:previousRow?.id || resourceId('catalog'),name,description:readText(entry.description,name + ' 的描述'),
      home,icon,order:entry.order,releaseDate:date,size:entry.size,sizeUnit:entry.size_unit,activatedSize:entry.activated_size,
      ...lists,category:lists.categories?.[0],license:lists.licenses?.join('、'),experimental:entry.experimental === true,
      source:spec ? sourceFields[spec.source][0] : undefined,repository:spec?.repository,backend:spec?.backend,spec:spec?.mode,specs,
    };
  });
  const draftRecipes = drafts.map(draft => {
    const source = readModelSource(draft,'草稿模型');
    const name = readText(draft.name,'草稿模型名称')?.trim();
    const algorithm = readText(draft.algorithm,'草稿模型算法')?.trim();
    if (!name || !algorithm) throw Error('请填写草稿模型名称及算法。');
    return { ...exportModelSource(source),name,algorithm,description:readText(draft.description,'草稿模型描述') };
  });
  return { rows,draftRecipes };
}
