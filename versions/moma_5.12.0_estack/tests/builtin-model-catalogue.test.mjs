import test from 'node:test';
import assert from 'node:assert/strict';
import { BUILTIN_MODEL_CATALOGUE, builtinModelCatalogueChanges } from '../src/mock/builtin-model-catalogue.js';
import { initialModelWorkspace } from '../server/model-repository.js';
import { modelLibrary } from '../src/admin-v2/model-library.js';
import { commitAdminState } from '../src/admin-v2/state-transaction.js';
import { supplyModelDirectory } from '../src/admin-v2/supply-models.js';
import { normalizeModelProfile } from '../src/admin-v2/model-profile.js';

const rows = BUILTIN_MODEL_CATALOGUE.models;
test('seventeen configured domestic models share one canonical directory and preserve month precision', () => {
  const state = initialModelWorkspace(), library = modelLibrary(state);
  assert.equal(rows.length, 17);
  assert.ok(supplyModelDirectory(state).every(row => row.entries.length));
  assert.ok(!supplyModelDirectory(state).some(row => row.name === 'PP-OCRv6'));
  for (const spec of rows) {
    const matches = library.filter(row => row.id === spec.existingId || row.modelId === spec.modelId);
    assert.equal(matches.length, 1, spec.name);
    const record = matches[0];
    assert.equal(record.name, spec.name); assert.equal(record.type, spec.type); assert.equal(record.profile.releaseDate, spec.releaseDate);
    const registered = supplyModelDirectory(state).find(row => row.id === record.id);
    if (registered) assert.equal(registered.master, record);
  }
  assert.equal(library.find(row => row.name === 'Kimi K3.1 Pro').profile.releaseDate, '2026-10');
  assert.equal(normalizeModelProfile({releaseDate:'2026-10'}, 'multimodal').releaseDate, '2026-10');
  assert.throws(() => normalizeModelProfile({releaseDate:'2026-13'}, 'multimodal'), /日期/);
  assert.equal(state.models.length, 32);
});
test('explicit catalogue installation never overwrites manual data, references or a removed installed entry', () => {
  const state = initialModelWorkspace();
  state.modelData.catalogueIds = [];
  const master = state.models.find(row => row.id === 'model-2');
  master.name = '用户自定义名称'; master.materialDraft = {name:'待发布草稿'};
  const before = structuredClone(state), spec = rows.find(row => row.existingId === master.id);
  const transaction = builtinModelCatalogueChanges(state,[spec.id]);
  assert.deepEqual(transaction.changes, []); assert.deepEqual(state,before);
  const next = commitAdminState(state,{type:'modelOperations',operation:'installModelCatalogue',data:{catalogueIds:[spec.id]}},'平台管理员');
  assert.deepEqual(next.models,state.models); assert.deepEqual(next.providers,state.providers); assert.deepEqual(next.endpoints,state.endpoints);
  assert.ok(!next.modelData.userIds.modelTemplates?.includes(spec.id));
  const removed = rows.find(row => !row.existingId);
  next.modelTemplates = next.modelTemplates.filter(row => row.id !== removed.id);
  next.modelData.catalogueIds.push(removed.id);
  assert.deepEqual(builtinModelCatalogueChanges(next,[removed.id]).changes,[]);
  assert.throws(() => builtinModelCatalogueChanges(state,['foreign']),/有效/);
  assert.throws(() => commitAdminState(state,{type:'modelOperations',operation:'installModelCatalogue',data:{catalogueIds:[spec.id]}},'运营人员'),/无权/);
});

test('catalogue cleanup leaves exactly the requested seventeen in order while retaining every business record', async () => {
  const { modelCatalogue, libraryRecord } = await import('../src/admin-v2/model-library.js');
  const { onboardingModelOptions } = await import('../src/admin-v2/onboarding-presets.js');
  const { supplierModelRegistration } = await import('../src/admin-v2/supplier-model-registration.js');
  const state = initialModelWorkspace();
  state.modelTemplates.push({id:'manual-test-material',modelId:'manual-test',name:'旧验收记录',type:'text',materialDraft:{name:'未保存草稿'}});
  delete state.modelData.archivedCatalogueIds;
  const before = structuredClone(state);
  const action = {type:'modelOperations',operation:'cleanModelCatalogue',data:{}};
  const next = commitAdminState(state,action,'平台管理员');
  assert.deepEqual(modelCatalogue(next).map(row => row.name),rows.map(row => row.name));
  assert.ok(supplyModelDirectory(next).every(row => row.entries.length));
  assert.ok(!supplyModelDirectory(next).some(row => row.name === 'PP-OCRv6'));
  assert.deepEqual(onboardingModelOptions(next).map(row => row.name),rows.map(row => row.name));
  for (const key of ['models','modelTemplates','providers','endpoints','modelSupplies','serviceRoutes','modelSalePrices','supplyPrices','modelOnboardings']) assert.deepEqual(next[key],state[key],key);
  assert.deepEqual(libraryRecord(next,'manual-test-material').materialDraft,{name:'未保存草稿'});
  assert.throws(() => supplierModelRegistration(next,next.providers[0],['manual-test-material']),/变化/);
  assert.throws(() => commitAdminState(state,action,'运营人员'),/无权/);
  const replay = commitAdminState(next,action,'平台管理员');
  assert.deepEqual(replay.modelData.archivedCatalogueIds,next.modelData.archivedCatalogueIds);
  const reloaded = JSON.parse(JSON.stringify(next));
  assert.deepEqual(modelCatalogue(reloaded).map(row => row.name),rows.map(row => row.name));
  assert.deepEqual(state,before);
  reloaded.modelTemplates.push({id:'future-model',modelId:'future-model',name:'后续手工登记',type:'text'});
  assert.ok(modelCatalogue(reloaded).some(row => row.id==='future-model'));
});
