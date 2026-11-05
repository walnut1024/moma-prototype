import mockConfig from '../mock/catalogues.json' with { type: 'json' };
import { libraryRecord, modelLibrary } from './model-library.js';

export const MODEL_OPERATIONS_EXAMPLE_ID = 'model-operations-examples-20261101';
export const MODEL_OPERATIONS_EXAMPLES = mockConfig["admin-v2/model-operations-examples.js"]["MODEL_OPERATIONS_EXAMPLES"];
export const MODEL_OPERATIONS_SUPPLIERS = mockConfig["admin-v2/model-operations-examples.js"]["MODEL_OPERATIONS_SUPPLIERS"];

// Explicit fixture preparation only; replay preserves subsequent edits and removals.
export function modelOperationsExamplesTransaction(source) {
  if (source.audits.some(row => row.objectId === MODEL_OPERATIONS_EXAMPLE_ID)) return { type: 'batch', changes: [], objectId: MODEL_OPERATIONS_EXAMPLE_ID, label: '核对模型运营 Mock 数据' };
  const state = structuredClone(source), changes = [], at = new Date().toISOString();
  const add = (collection, record) => {
    if (state[collection].some(row => row.id === record.id)) throw new Error(`Mock 数据 ID 已被占用：${record.id}`);
    state[collection].push(record); changes.push({ type: 'add', collection, record }); return record;
  };
  const update = (collection, row, fields) => {
    const values = { ...fields, updatedAt: at };
    Object.assign(row, values); changes.push({ type: 'update', collection, id: row.id, changes: values });
  };
  const record = (id, value) => ({ id, createdAt: at, updatedAt: at, ...value });
  const models = new Map();
  for (const spec of MODEL_OPERATIONS_EXAMPLES) {
    const matches = modelLibrary(state).filter(row => row.modelId?.toLowerCase() === spec.code);
    if (matches.length > 1) throw new Error(`${spec.name} 存在多份同编码主档，请先明确身份`);
    let master = matches[0];
    if (master?.materialDraft) throw new Error(`${spec.name} 存在未发布资料草稿，请先处理后准备 Mock 数据`);
    const profile = { ...master?.profile, author: spec.author, releaseDate: spec.date, sourceStatus: 'pending', ...(spec.note ? { detailDescription: [master?.profile?.detailDescription, spec.note].filter(Boolean).join('\n') } : {}), ...(spec.parameters ? { parameters: spec.parameters, activeParameters: spec.activeParameters } : {}) };
    if (profile.detailDescription?.length > 1000) throw new Error(`${spec.name} 的详细介绍过长，请先整理后准备 Mock 数据`);
    if (!master) master = add('modelTemplates', record(`mock-material-${spec.code}`, { modelId: spec.code, name: spec.name, maker: spec.author, type: 'text', description: '', usageUnit: '', capabilities: { context: null, output: null, streaming: null, tools: null }, profile, revision: 1 }));
    else {
      const collection = state.models.some(row => row.id === master.id) ? 'models' : 'modelTemplates';
      update(collection, master, { name: spec.name, maker: spec.author, profile, revision: (master.revision || 0) + 1 });
      for (const model of state.models.filter(row => row.id !== master.id && libraryRecord(state, row.id)?.id === master.id)) update('models', model, { name: spec.name, maker: spec.author, profile: { ...model.profile, author: spec.author, releaseDate: spec.date, sourceStatus: 'pending', ...(spec.note ? { detailDescription: profile.detailDescription } : {}) } });
    }
    let service = state.models.find(row => row.id === master.id || row.templateId === master.id);
    if (!service) {
      const id = `mock-service-${spec.code}`, versionId = `mock-version-${spec.code}`;
      service = add('models', record(id, { ...structuredClone(master), id, templateId: master.id, serviceManaged: true, defaultVersionId: versionId, serviceMode: null, serviceModeRevision: 0, serviceProviders: [], listingStatus: '已下架', status: '草稿', callsEnabled: false, visibility: '内部', openScope: 'selected', tenantIds: [] }));
      add('modelVersions', record(versionId, { modelId: id, version: 'v1.0', capabilities: structuredClone(master.capabilities), validationStatus: '未验证', status: '草稿', isDefault: true }));
    } else if (!service.serviceManaged) update('models', service, { serviceManaged: true });
    models.set(spec.code, master);
  }
  for (const spec of MODEL_OPERATIONS_SUPPLIERS) {
    let provider = state.providers.find(row => row.id === spec.id);
    if (provider && provider.code !== spec.code) throw new Error(`${spec.name} 的供应商 ID 已被其他编码占用`);
    if (!provider) {
      if (state.providers.some(row => row.code === spec.code || row.name === spec.name)) throw new Error(`${spec.name} 已存在其他身份，请先核对，不能按名称合并`);
      provider = add('providers', record(spec.id, { name: spec.name, code: spec.code, sourceType: 'thirdParty', integrationType: '云厂商模型服务', status: '已启用', catalogModelIds: [], catalogModels: [], catalogConnections: [], apiKeys: [], catalogueScope: 'managed' }));
    }
    const ids = [...(provider.catalogModelIds || [])], catalogue = [...(provider.catalogModels || [])], connections = [...(provider.catalogConnections || [])];
    const offered = MODEL_OPERATIONS_EXAMPLES.filter(model => spec.key === 'moma' || model.supplier === spec.key);
    const channels = spec.key === 'moma' ? [{ key: 'self', name: '自营渠道', origin: 'direct' }, { key: 'resale', name: '转售渠道', origin: 'resale' }] : [{ key: 'official', name: '原厂渠道', origin: 'direct' }];
    for (const channel of channels) {
      const endpointId = `mock-channel-${spec.key}-${channel.key}`;
      add('endpoints', record(endpointId, { endpointId, providerId: provider.id, channelCode: `${spec.key}-${channel.key}`, supplierChannel: true, name: channel.name, protocol: 'OpenAI', baseUrl: '', authMode: 'specific', apiKeyId: '', apiKeys: [], credentialRef: '', modelIds: [], timeoutSeconds: 60, status: '草稿', connectionTest: null }));
      for (const model of offered.filter(model => channel.key !== 'self' || !model.resaleOnly)) {
        const master = models.get(model.code);
        let entry = catalogue.find(row => row.libraryId && libraryRecord(state, row.libraryId)?.id === master.id || row.modelId?.toLowerCase() === model.code);
        if (entry?.libraryId && libraryRecord(state, entry.libraryId)?.id !== master.id) throw new Error(`${spec.name} 的 ${model.name} 主档引用冲突`);
        if (!entry) { entry = { modelId: model.code, name: model.name, type: master.type, libraryId: master.id }; catalogue.push(entry); }
        else entry = { ...entry, libraryId: master.id, name: model.name, type: master.type };
        const index = catalogue.findIndex(row => row.modelId === entry.modelId); catalogue[index] = entry;
        if (!ids.includes(entry.modelId)) ids.push(entry.modelId);
        connections.push(record(`mock-association-${spec.key}-${channel.key}-${model.code}`, { modelId: entry.modelId, endpointId, upstreamModelId: '', name: channel.name, origin: channel.origin, upstreamProvider: '', pricing: { modelId: entry.modelId, discountFactor: 1000000, scenarios: [] }, enabled: false, health: null }));
      }
    }
    update('providers', provider, { name: spec.name, catalogModelIds: ids, catalogModels: catalogue, catalogConnections: connections });
  }
  return { type: 'batch', changes, objectId: MODEL_OPERATIONS_EXAMPLE_ID, label: '准备模型运营 Mock 数据' };
}
