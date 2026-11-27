const modelScopeRepositories = {
  'catalog-glm52': 'ZhipuAI/GLM-5.2-FP8',
  'catalog-bge-m3': 'BAAI/BGE-M3',
  'catalog-qwen35-9b': 'Qwen/Qwen3.5-9B',
};

const qwenGGUF = {
  id: 'hub-qwen25-7b-gguf',
  name: 'Qwen2.5-7B-Instruct-GGUF',
  repository: 'Qwen/Qwen2.5-7B-Instruct-GGUF',
  description: 'Qwen2.5-7B 指令模型的官方 GGUF 仓库，提供多种量化规格及 FP16 权重。',
  categories: ['llm'],
  licenses: ['apache-2.0'],
  size: 7.61,
  format: 'GGUF',
  contextTokens: 32768,
};

// Identical published-file entries on the official Qwen Hugging Face and ModelScope repositories.
const qwenFileSizes = {
  'fp16-00001-of-00004': 3951521376,
  'fp16-00002-of-00004': 3864909312,
  'fp16-00003-of-00004': 3864894976,
  'fp16-00004-of-00004': 3556527872,
  q2_k: 3015940000,
  q3_k_m: 3808391072,
  'q4_0-00001-of-00002': 3983228352,
  'q4_0-00002-of-00002': 448162496,
  'q4_k_m-00001-of-00002': 3993201344,
  'q4_k_m-00002-of-00002': 689872288,
  'q5_0-00001-of-00002': 4001112160,
  'q5_0-00002-of-00002': 1314064416,
  'q5_k_m-00001-of-00002': 3989841792,
  'q5_k_m-00002-of-00002': 1454989568,
  'q6_k-00001-of-00002': 3950642464,
  'q6_k-00002-of-00002': 2303556416,
  'q8_0-00001-of-00003': 3980069248,
  'q8_0-00002-of-00003': 3942935680,
  'q8_0-00003-of-00003': 175520480,
};

const ggufFiles = Object.entries(qwenFileSizes).map(([suffix, sizeBytes]) => ({ path: `qwen2.5-7b-instruct-${suffix}.gguf`, sizeBytes }));
const gguf = /\.gguf$/i;
const shards = /^(.*)-(\d+)-of-(\d+)\.gguf$/i;
const quantization = /(?:^|[-_.])(FP16|F16|F32|BF16|(?:IQ|Q)\d+(?:_[\dA-Z]+)*)(?=(?:-\*)?(?:\.gguf)?$)/i;
const modelHubs = {
  'Hugging Face': { key: 'huggingface', root: 'https://huggingface.co/', revision: 'main' },
  ModelScope: { key: 'model_scope', root: 'https://modelscope.cn/models/', revision: 'master' },
};

const sampleHubActivity = {
  'Qwen/Qwen2.5-7B-Instruct-GGUF': { trendingScore: 87, likes: 514, downloads: 90600, lastModified: '2026-11-22' },
  'Qwen/Qwen3.5-9B': { trendingScore: 95, likes: 1110, downloads: 60700, lastModified: '2026-11-26' },
  'BAAI/bge-m3': { trendingScore: 72, likes: 1680, downloads: 118500, lastModified: '2026-11-15' },
};

const choice = ({ path, sizeBytes }, options = {}) => ({
  value: path, label: path, sizeBytes, quantization: (path.match(shards)?.[1] ?? path).match(quantization)?.[1].toUpperCase(), parts: [], ...options,
});

function repositoryFiles(files) {
  const byPath = new Map();
  for (const item of files || []) {
    const file = typeof item === 'string' ? { path: item } : item;
    if (typeof file?.path !== 'string' || !file.path || /(?:mmproj|imatrix)/i.test(file.path)) continue;
    if (!byPath.has(file.path) || file.sizeBytes !== undefined) byPath.set(file.path, file);
  }

  const options = [];
  const groups = new Map();
  for (const file of byPath.values()) {
    const match = file.path.match(shards);
    if (!match) {
      options.push(choice(file));
      continue;
    }
    const [, stem, part, total] = match;
    const group = groups.get(stem) ?? [];
    group.push({ ...file, part: Number(part), total: Number(total) });
    groups.set(stem, group);
  }

  for (const [stem, files] of groups) {
    const ordered = files.sort((left, right) => left.part - right.part);
    const complete = ordered.length === ordered[0].total && ordered.every((file, index) => file.part === index + 1 && file.total === ordered.length);
    if (!complete) {
      options.push(...ordered.map(file => choice(file)));
      continue;
    }
    const parts = ordered.map(({ path, sizeBytes }) => ({ path, sizeBytes }));
    const path = `${stem}-*.gguf`;
    const sizeBytes = parts.every(file => Number.isFinite(file.sizeBytes)) ? parts.reduce((bytes, part) => bytes + part.sizeBytes, 0) : undefined;
    const group = choice({ path, sizeBytes }, { label: stem, parts });
    const already = options.findIndex(item => item.value === path);
    if (already < 0) options.push(group);
    else options[already] = group;
  }

  return options.sort((left, right) => (left.sizeBytes ?? Infinity) - (right.sizeBytes ?? Infinity) || left.label.localeCompare(right.label));
}

export function modelHubCandidates(records, source) {
  if (!Object.hasOwn(modelHubs, source)) return [];
  const hub = modelHubs[source];
  const repositories = new Map();
  for (const row of records['ops-model-library'] || []) {
    const specs = (row.specs || []).filter(spec => spec.source === hub.key && spec.repository);
    if (!specs.length) {
      const repository = row.source === source ? row.repository : source === 'ModelScope' ? modelScopeRepositories[row.id] : '';
      if (repository && !repositories.has(repository)) repositories.set(repository, { ...row, repository });
    }
    for (const { repository, filename } of specs) {
      const known = repositories.get(repository) || { ...row, repository, files: [] };
      if (filename && !known.files?.includes(filename)) known.files = [...(known.files || []), filename];
      repositories.set(repository, known);
    }
  }
  const existing = repositories.get(qwenGGUF.repository);
  repositories.set(qwenGGUF.repository, { ...qwenGGUF, ...existing, files: [...(existing?.files || []), ...ggufFiles] });
  return Array.from(repositories.values(), row => {
    const fileOptions = repositoryFiles(row.files);
    return { ...sampleHubActivity[row.repository], ...row, source, revision: row.revision || hub.revision,
      repositoryUrl: hub.root + row.repository.split('/').map(encodeURIComponent).join('/'),
      format: row.format || (fileOptions.some(file => gguf.test(file.value)) ? 'GGUF' : undefined),
      files: fileOptions.map(file => file.value), fileOptions };
  });
}

export function searchModelHubCandidates(candidates, { query = '', quantization, sort = 'trendingScore' } = {}) {
  const keyword = query.trim().toLowerCase();
  const selected = quantization?.toLowerCase();
  const rank = row => sort === 'lastModified' ? Date.parse(row.lastModified || row.releaseDate) || 0 : row[sort] || 0;
  return candidates.filter(row => {
    if (!`${row.name} ${row.repository}`.toLowerCase().includes(keyword)) return false;
    if (!selected) return true;
    const encodings = (row.specs || []).filter(spec => spec.repository === row.repository).map(spec => spec.quantization);
    return [row.repository, ...encodings, ...(row.files || [])].some(value => String(value ?? '').toLowerCase().includes(selected));
  }).sort((left, right) => rank(right) - rank(left));
}
