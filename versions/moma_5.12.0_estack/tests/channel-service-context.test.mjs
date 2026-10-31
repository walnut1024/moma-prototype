import test from 'node:test';
import assert from 'node:assert/strict';
import { parseAdminState } from '../src/admin-v2/store.js';
import { channelServiceContext, channelServiceParameters, channelServiceReturn } from '../src/admin-v2/channel-service-context.js';
import { catalogueChannels } from '../src/admin-v2/provider-channels.js';

test('service handoff retains every selected mapping and returns the same fixed set', () => {
  const state = parseAdminState(null), provider = state.providers.find(row => row.id === 'provider-moma');
  const mappings = provider.catalogModels.flatMap(model => catalogueChannels(state, provider, model.modelId)).filter(row => row.endpointId);
  const endpointId = mappings[0].endpointId, ids = mappings.filter(row => row.endpointId === endpointId).slice(0, 3).map(row => row.id);
  const params = new URLSearchParams(channelServiceParameters({ providerId: provider.id, endpointId, associationIds: ids, origin: '#/admin-2/providers?q=preserved' }));
  const before = structuredClone(state), context = channelServiceContext(state, params);
  assert.deepEqual(context.rows.map(row => row.id), ids); assert.equal(context.missing, 0);
  const returning = new URLSearchParams(channelServiceReturn(context).split('?')[1]);
  assert.equal(returning.get('returnTestEndpoint'), endpointId); assert.deepEqual(JSON.parse(returning.get('returnTestAssociations')), ids);
  assert.deepEqual(state, before);
  params.set('supplyAssociations', '["unknown"]'); assert.equal(channelServiceContext(state, params).missing, 1);
});

test('invalid or foreign handoff never maps by model name', () => {
  const state = parseAdminState(null);
  for (const json of ['invalid', '[]', '[1]', '["a","a"]']) assert.ok(channelServiceContext(state, new URLSearchParams({ supplyProvider: 'provider-moma', supplyEndpoint: 'a', supplyAssociations: json })).error);
  assert.equal(channelServiceContext(state, new URLSearchParams()), null);
});

test('an existing implicit channel resolves the original service through its exact supply references without materializing a new mapping',()=>{
 const state=parseAdminState(null),provider=state.providers.find(row=>row.id==='provider-self');
 const mapping=catalogueChannels(state,provider,'glm-5.3')[0],before=structuredClone(state);
 const params=new URLSearchParams(channelServiceParameters({providerId:provider.id,endpointId:mapping.endpointId,associationIds:[mapping.id]}));
 const context=channelServiceContext(state,params);
 assert.equal(context.missing,0);assert.equal(context.rows[0].master.id,'model-glm53');assert.equal(context.rows[0].service.id,'model-glm53');
 assert.deepEqual(state,before);
});
