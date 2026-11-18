import test from 'node:test';
import assert from 'node:assert/strict';
import { serviceCallIdentifiers } from '../src/admin-v2/service-workspace.js';
import { modelAuditChanges } from '../src/admin-v2/model-operation-history.js';

test('call identifiers use actual channel services without substituting the parent model identifier', () => {
  assert.deepEqual(serviceCallIdentifiers({ serviceMode: 'standard', modelId: 'platform/unified' }), ['platform/unified']);
  const model = { serviceMode: 'provider', modelId: 'parent-not-callable', serviceProviders: [
    { callId: 'platform/direct-a' }, { callId: 'platform/direct-b' }, { callId: 'platform/direct-a' },
    { callId: 'removed', status: '已移除' }, { name: '未配置调用标识' },
  ] };
  const before = structuredClone(model);
  assert.deepEqual(serviceCallIdentifiers(model), ['platform/direct-a', 'platform/direct-b']);
  assert.deepEqual(serviceCallIdentifiers({serviceMode:'provider',modelId:'parent-not-callable'}), []);
  assert.deepEqual(model, before);
});

test('audit labels distinguish canonical, platform and relation identifiers without altering stored records', () => {
  const state = { modelTemplates: [{id:'material',modelId:'canonical/old'}], models: [{id:'service',modelId:'platform/old'}], modelSupplies: [{id:'supply',modelId:'old-service-id'}], audits: [{diff:[{field:'模型标识',after:'historic-original'}]}] };
  const before = structuredClone(state);
  const action = { type: 'batch', changes: [
    {collection:'modelTemplates',id:'material',changes:{modelId:'canonical/new'}},
    {collection:'models',id:'service',changes:{modelId:'platform/new'}},
    {collection:'modelSupplies',id:'supply',changes:{modelId:'new-service-id',upstreamModelId:'supplier/api-model'}},
  ] };
  assert.deepEqual(modelAuditChanges(state,action).map(({field,after})=>({field,after})), [
    {field:'模型编码',after:'canonical/new'}, {field:'模型调用标识',after:'platform/new'},
    {field:'模型关联 ID',after:'new-service-id'}, {field:'上游模型调用标识',after:'supplier/api-model'},
  ]);
  assert.deepEqual(state, before);
});
