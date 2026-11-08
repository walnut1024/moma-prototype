import test from 'node:test';
import assert from 'node:assert/strict';
import { materialImportRows, previewMaterialRows, submitMaterialRows } from '../src/admin-v2/material-batch-import.js';
import { modelMaterialProviders, providerMaterialModels } from '../src/admin-v2/provider-materials.js';

const provider = { id: 'provider-alpha', code: 'alpha', name: '甲服务商', sourceType: 'thirdParty', catalogModels: [], catalogModelIds: [] };
const model = { id: 'template-x', modelId: 'model-x', name: '模型 X', type: 'text', profile: {}, capabilities: {} };
const initial = { providers: [provider], models: [], modelTemplates: [], endpoints: [], modelSupplies: [], modelData: {} };

test('relationship preview distinguishes valid, repeated, unknown and registered rows by stable IDs', () => {
  const state = { ...initial, modelTemplates: [model, { ...model, id: 'template-y', modelId: 'model-y' }] };
  const rows = materialImportRows('relation', [
    ['服务商编码', '规范模型标识', '原文件行', '处理结果'],
    ['alpha', 'model-x', '3', '请重试'], ['unknown', 'model-x'], [], ['alpha', 'model-x'], ['alpha', 'model-y'],
  ]);
  const preview = previewMaterialRows(state, 'relation', rows);
  assert.deepEqual(preview.map(row => [row.rowNumber, row.status]), [[2, 'ready'], [3, 'error'], [5, 'skip'], [6, 'ready']]);
  assert.equal(preview[0].providerId, provider.id);
  assert.equal(preview[0].modelId, model.id);
});

test('retry only registers a model whose material was already committed', async () => {
  let state = structuredClone(initial), fail = true;
  const actions = [], outcomes = [];
  const transact = async ({ operation, data }) => {
    actions.push(operation);
    if (operation === 'templateImport') state.modelTemplates.push(model);
    if (operation === 'supplierModelsRegister') {
      if (fail) throw Error('模拟登记失败');
      const row = state.providers[0];
      row.catalogModels.push({ modelId: model.modelId, libraryId: data.libraryIds[0] });
      row.catalogModelIds.push(model.modelId);
    }
    return state;
  };
  const rows = materialImportRows('model', [['模型名称', '规范模型标识', '模型类型'], [model.name, model.modelId, '文本']]);
  const submit = async retry => {
    const preview = previewMaterialRows(state, 'model', rows, { providerId: provider.id, retry });
    assert.equal(preview[0].status, 'ready');
    await submitMaterialRows({
      state, kind: 'model', providerId: provider.id, rows: preview, transact, active: () => true,
      onResult: rows => outcomes.push(...rows),
    });
  };
  await submit(false);
  assert.deepEqual(actions, ['templateImport', 'supplierModelsRegister']);
  assert.equal(outcomes.at(-1).status, 'failed');
  assert.equal(outcomes.at(-1).masterCreated, true);
  assert.equal(state.modelTemplates.length, 1);
  fail = false;
  await submit(true);
  assert.deepEqual(actions, ['templateImport', 'supplierModelsRegister', 'supplierModelsRegister']);
  assert.equal(outcomes.at(-1).status, 'done');
  assert.equal(providerMaterialModels(state, state.providers[0])[0].channels.length, 0);
  assert.equal(modelMaterialProviders(state, model.id)[0].owner.id, provider.id);
  assert.equal(previewMaterialRows(state, 'model', rows, { providerId: provider.id })[0].status, 'skip');
});

test('one failed registration batch leaves later valid rows able to commit', async () => {
  const models = Array.from({ length: 6 }, (_, index) => ({ ...model, id: 'template-' + index, modelId: 'model-' + index }));
  const state = { ...initial, modelTemplates: models };
  const rows = materialImportRows('relation', [['服务商编码', '规范模型标识'], ...models.map(row => [provider.code, row.modelId])]);
  const sizes = [], outcomes = [];
  await submitMaterialRows({
    state, kind: 'relation', rows: previewMaterialRows(state, 'relation', rows), active: () => true,
    onResult: rows => outcomes.push(...rows),
    transact: async ({ data }) => {
      sizes.push(data.libraryIds.length);
      if (sizes.length === 1) throw Error('模拟小批提交失败');
      return state;
    },
  });
  assert.deepEqual(sizes, [5, 1]);
  assert.deepEqual(outcomes.map(row => row.status), ['failed', 'failed', 'failed', 'failed', 'failed', 'done']);
  assert.equal(outcomes.at(-1).rowNumber, 7);
});
