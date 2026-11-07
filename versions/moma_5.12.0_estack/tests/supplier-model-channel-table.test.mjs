import { legacySupplierState } from './legacy-supplier-fixture.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';
import { parseAdminState } from '../src/admin-v2/store.js';
import { supplierModelChannelGroups } from '../src/admin-v2/supplier-model-channel-table.js';
import { supplierChannelResources } from '../src/admin-v2/supplier-resources.js';
import { supplyModelDirectory } from '../src/admin-v2/supply-models.js';
import { displayedCatalogueIds } from '../src/admin-v2/moma-provider.js';

test('merged supplier directory preserves all model identities and every shared or unlinked channel without writes', () => {
  const state = parseAdminState(null), before = structuredClone(state);
  for (const provider of state.providers) {
    const groups = supplierModelChannelGroups(state, provider);
    assert.deepEqual(groups.filter(group => group.modelId).map(group => group.id), supplyModelDirectory(state, [provider]).map(group => group.id));
    const endpoints = new Set(groups.flatMap(group => group.channels.map(channel => channel.endpointId)));
    for (const endpoint of supplierChannelResources(state, provider)) assert(endpoints.has(endpoint.id), endpoint.id);
    for (const group of groups.filter(group => group.modelId)) for (const channel of group.channels) assert.ok(group.modelIds.includes(channel.modelId));
  }
  assert.deepEqual(state, before);
});

import { commitAdminState } from '../src/admin-v2/store.js';
import { withAdminSession } from './admin-session-fixture.mjs';
import { activeSupplierListPrice } from '../src/admin-v2/supplier-model-maintenance.js';
import { supplierModelChannelRows } from '../src/admin-v2/supplier-model-channel-table.js';

const fixture = () => {
  const state = withAdminSession(legacySupplierState());
  const provider = state.providers.find(row => row.id === 'provider-moma');
  const modelId = provider.catalogModels[0].modelId;
  const endpoint = state.endpoints.find(row => row.providerId === provider.id);
  state.endpoints.push({ ...structuredClone(endpoint), id: 'quote-channel-b' });
  provider.catalogConnections = [
    { id: 'quote-a', modelId, endpointId: endpoint.id, pricing: { scenarios: [{ name: '采购', listPrice: 123 }] } },
    { id: 'quote-b', modelId, endpointId: 'quote-channel-b', pricing: { scenarios: [] } },
    ...(provider.catalogConnections || []).filter(row => row.modelId !== modelId),
  ];
  provider.catalogModels.find(row => row.modelId === modelId).listPriceVersions = [{ id: 'legacy', status: '已发布', version: 1, effectiveAt: '2020-01-01', pricing: { scenarios: [{ name: '旧刊例价', listPrice: 999 }] } }];
  return { state, provider, modelId, endpoint };
};
const price = { expectedRevision: 0, confirmed: true, effectiveAt: '2020-01-01', scenarios: [{ name: '输入 Token', unit: '百万 Token', currency: 'CNY', listPrice: '0' }, { name: '输出 Token', unit: '百万 Token', currency: 'CNY', listPrice: '8' }] };
const publish = (state, provider, modelId, endpointId, associationId, patch = {}) => commitAdminState(state, { type: 'modelOperations', operation: 'provider', data: { operation: 'supplierChannelListPricePublish', objectId: provider.id, values: { ...price, modelId, endpointId, associationId, ...patch } } });

test('channel list price persists independently without changing old quotes, procurement, sales, credentials or other channels', () => {
  const { state, provider, modelId, endpoint } = fixture(), before = structuredClone(state);
  const next = publish(state, provider, modelId, endpoint.id, 'quote-a');
  const owner = next.providers.find(row => row.id === provider.id);
  const association = owner.catalogConnections.find(row => row.id === 'quote-a');
  assert.equal(activeSupplierListPrice(association).pricing.scenarios[0].listPrice, 0);
  assert.deepEqual(association.pricing, provider.catalogConnections[0].pricing);
  assert.deepEqual(owner.catalogModels, provider.catalogModels);
  assert.deepEqual(owner.catalogConnections.slice(1), provider.catalogConnections.slice(1));
  for (const field of ['endpoints', 'models', 'modelSupplies', 'serviceRoutes', 'modelSalePrices', 'supplyPrices']) assert.deepEqual(next[field], before[field]);
  assert.deepEqual(parseAdminState(JSON.stringify(next)).providers.find(row => row.id === provider.id).catalogConnections, owner.catalogConnections);
  assert.deepEqual(state, before);
  assert.throws(() => publish(next, provider, modelId, endpoint.id, 'quote-a'), /已变化/);
  const second = publish(next, provider, modelId, 'quote-channel-b', 'quote-b', { scenarios: [{ ...price.scenarios[0], listPrice: '3' }] });
  const groups = supplierModelChannelGroups(second, second.providers.find(row => row.id === provider.id));
  const rows = supplierModelChannelRows(groups.find(row => row.modelId === modelId));
  assert.deepEqual(rows.map(row => row.modelSpan), [2, 0]);
  assert.deepEqual(rows.map(row => row.channelSpan), [1, 1]);
  assert.equal(rows[0].price.purchasePrice, 123);
  assert.equal(rows[1].price, null);
});

test('missing prices and channels retain placeholder rows; model quote never becomes a channel quote', () => {
  const { state, provider, modelId } = fixture();
  const group = supplierModelChannelGroups(state, provider).find(row => row.modelId === modelId);
  assert.equal(supplierModelChannelRows(group)[0].price.purchasePrice, 123);
  assert.equal(supplierModelChannelRows(group)[1].price, null);
  assert.deepEqual(supplierModelChannelRows({ channels: [] }), [{ channel: null, price: null, channelSpan: 1, modelSpan: 1 }]);
});

test('procurement rows preserve model and channel spans and show explicit cost or discounted directory price without using channel list quotes', () => {
  const group = { channels: [
    { id: 'a', pricing: { discountFactor: 500000, scenarios: [{name:'输入',listPrice:4000000,currency:'CNY',unit:'百万 Token'},{name:'输出',listPrice:9000000,purchasePrice:0,currency:'CNY',unit:'百万 Token'}] }, listPriceVersions:[{status:'已发布',version:1,effectiveAt:'2020-01-01',pricing:{scenarios:[{name:'不应显示的刊例价',listPrice:999000000}]}}] },
    { id: 'b', pricing: { scenarios: [{name:'输入',listPrice:null,purchasePrice:3000000,currency:'USD',unit:'百万 Token'},{name:'缺价',listPrice:null,currency:'USD',unit:'次'}] } },
  ] }, before = structuredClone(group), rows = supplierModelChannelRows(group);
  assert.deepEqual(rows.map(row=>row.modelSpan),[4,0,0,0]);
  assert.deepEqual(rows.map(row=>row.channelSpan),[2,0,2,0]);
  assert.deepEqual(rows.map(row=>row.price.purchasePrice),[2000000,0,3000000,null]);
  assert.deepEqual(rows.map(row=>row.price.currency),['CNY','CNY','USD','USD']);
  assert.deepEqual(group,before);
});

test('publishing validates exact live association, confirmation, amounts, dates and role', () => {
  const { state, provider, modelId, endpoint } = fixture();
  for (const [patch, pattern] of [[{ confirmed: false }, /确认/], [{ associationId: 'missing' }, /关联/], [{ endpointId: 'quote-channel-b' }, /关联/], [{ scenarios: [{ ...price.scenarios[0], listPrice: '' }] }, /完整刊例价/], [{ expiresAt: '2019-01-01' }, /晚于/]]) {
    assert.throws(() => publish(state, provider, modelId, endpoint.id, 'quote-a', patch), pattern);
  }
  provider.catalogConnections[0].deletedAt = new Date().toISOString();
  assert.throws(() => publish(state, provider, modelId, endpoint.id, 'quote-a'), /关联/);
});

test('removing a model-channel association retains its quote history and the shared channel resource', () => {
  const { state, provider, modelId } = fixture();
  const quoted = publish(state, provider, modelId, 'quote-channel-b', 'quote-b');
  const next = commitAdminState(quoted, { type: 'modelOperations', operation: 'provider', data: { operation: 'supplierAssociationRemove', objectId: provider.id, values: { modelId, endpointId: 'quote-channel-b', associationId: 'quote-b', confirmed: true } } });
  const before = quoted.providers.find(row => row.id === provider.id).catalogConnections.find(row => row.id === 'quote-b');
  const after = next.providers.find(row => row.id === provider.id).catalogConnections.find(row => row.id === 'quote-b');
  assert(after.deletedAt);
  assert.deepEqual(after.listPriceVersions, before.listPriceVersions);
  assert.deepEqual(next.endpoints, quoted.endpoints);
  assert.deepEqual(next.providers.find(row => row.id === provider.id).catalogConnections.filter(row => row.id !== 'quote-b'), quoted.providers.find(row => row.id === provider.id).catalogConnections.filter(row => row.id !== 'quote-b'));
});

test('read-only operators cannot publish a channel list price', () => {
  const { state, provider, modelId, endpoint } = fixture();
  const readonly = withAdminSession({ ...state, currentRole: '运维人员' });
  assert.throws(() => publish(readonly, provider, modelId, endpoint.id, 'quote-a'), /无权执行/);
});

import { supplierChannelInterface } from '../src/admin-v2/supplier-model-channel-table.js';
import { connectionBlockReason } from '../src/admin-v2/connection-state.js';
import { channelBlockReason, catalogueChannels } from '../src/admin-v2/provider-channels.js';
import { persistModelAction } from '../src/admin-v2/store.js';

test('supplier table presents the exact upstream address and distinguishes Chat, Responses and Anthropic without inventing missing addresses',()=>{
 const provider={};
 for(const [url,protocol,label] of [['https://api.example.invalid/v1/chat/completions','OpenAI','OpenAI Chat'],['https://api.example.invalid/v1/responses','OpenAI','OpenAI Response'],['https://api.example.invalid/v1/messages','Anthropic','Anthropic'],['https://api.example.invalid/v1/embeddings','OpenAI','OpenAI']]) {
   assert.deepEqual(supplierChannelInterface(provider,{endpointId:'endpoint',unlinked:true,endpoint:{baseUrl:url,protocol}}),{url,protocol:label});
 }
 assert.deepEqual(supplierChannelInterface(provider,null),{protocol:'—',url:''});
});

test('freezing a shared channel persists without changing its credentials, evidence, relations, prices, other channels or history',()=>{
 const {state,provider,endpoint}=fixture(),before=structuredClone(state);
 const action={type:'modelOperations',operation:'provider',data:{operation:'supplierChannelFreeze',objectId:provider.id,values:{endpointId:endpoint.id,frozen:true,confirmed:true,expectedUpdatedAt:endpoint.updatedAt}}};
 const next=commitAdminState(state,action),saved=next.endpoints.find(row=>row.id===endpoint.id),owner=next.providers.find(row=>row.id===provider.id);
 assert.equal(saved.frozen,true);assert.equal(connectionBlockReason(saved,owner),'渠道已冻结');
 for(const modelId of displayedCatalogueIds(owner,next))for(const channel of catalogueChannels(next,owner,modelId).filter(row=>row.endpointId===endpoint.id))assert.equal(channelBlockReason(owner,channel,{runtime:true}),'渠道已冻结');
 assert.deepEqual({...saved,updatedAt:endpoint.updatedAt,frozen:undefined},{...endpoint,frozen:undefined});
 assert.deepEqual(next.endpoints.filter(row=>row.id!==endpoint.id),state.endpoints.filter(row=>row.id!==endpoint.id));
 for(const field of ['providers','models','modelTemplates','modelSupplies','serviceRoutes','modelSalePrices','supplyPrices','orders','requests'])assert.deepEqual(next[field],before[field]);
 const parsed=parseAdminState(JSON.stringify(next));assert.equal(parsed.endpoints.find(row=>row.id===endpoint.id).frozen,true);
 const thawed=commitAdminState(next,{...action,data:{...action.data,values:{...action.data.values,frozen:false,expectedUpdatedAt:saved.updatedAt}}});
 assert.equal(thawed.endpoints.find(row=>row.id===endpoint.id).frozen,false);
 assert.equal(thawed.endpoints.find(row=>row.id===endpoint.id).status,endpoint.status);
 for(const values of [{frozen:'true'},{confirmed:false},{expectedUpdatedAt:'stale'},{endpointId:'missing'}])assert.throws(()=>commitAdminState(state,{...action,data:{...action.data,values:{...action.data.values,...values}}}));
 assert.throws(()=>commitAdminState(withAdminSession({...state,currentRole:'运维人员'}),action),/无权/);
 assert.throws(()=>commitAdminState(state,{type:'update',collection:'endpoints',id:endpoint.id,changes:{frozen:true}}),/供应管理/);
 assert.throws(()=>persistModelAction(state,action,{getItem:()=>JSON.stringify(state),setItem:()=>{throw Error('disk full');}}),/disk full/);
 assert.deepEqual(state,before);
});

test('supplier model names are read-only and obsolete rename commands preserve every record',()=>{
 const {state,provider,modelId}=fixture(),before=structuredClone(state);
 const action={type:'modelOperations',operation:'provider',data:{operation:'supplierModelRename',objectId:provider.id,values:{modelId,name:'不可修改',expectedUpdatedAt:provider.updatedAt}}};
 assert.throws(()=>commitAdminState(state,action));
 assert.deepEqual(state,before);
 const refreshed=parseAdminState(JSON.stringify(state));
 assert.deepEqual(supplierModelChannelGroups(refreshed,refreshed.providers.find(row=>row.id===provider.id)),supplierModelChannelGroups(state,provider));
});

import { supplierListPriceDraft } from '../src/admin-v2/supplier-model-maintenance.js';

test('billing preview is read-only and uses exactly the publication validation and normalized amounts',()=>{
 const {state,provider,modelId,endpoint}=fixture(),before=structuredClone(state),input=structuredClone(price);
 const preview=supplierListPriceDraft(input,modelId);
 assert.deepEqual(input,price);assert.deepEqual(state,before);assert.equal(Object.hasOwn(preview,'source'),false);
 assert.equal(preview.pricing.scenarios[0].listPrice,0);assert.equal(preview.pricing.scenarios[1].listPrice,8000000);
 const published=publish(state,provider,modelId,endpoint.id,'quote-a');
 const saved=activeSupplierListPrice(published.providers.find(row=>row.id===provider.id).catalogConnections.find(row=>row.id==='quote-a'));
 for(const key of ['pricing','effectiveAt','expiresAt'])assert.deepEqual(saved[key],preview[key]);
 for(const patch of [{scenarios:[]},{scenarios:[{...price.scenarios[0],listPrice:''}]},{effectiveAt:'bad'},{expiresAt:'2019-01-01'}])assert.throws(()=>supplierListPriceDraft({...input,...patch},modelId));
 assert.deepEqual(state,before);
});

import { channelStatus } from '../src/admin-v2/channel-selection.js';
test('channel status reports frozen, missing association and supplier-disabled facts before readiness',()=>{
 const provider={status:'已启用'};
 assert.equal(channelStatus(provider,null),'未配置渠道');
 assert.equal(channelStatus(provider,{endpoint:{frozen:true}}),'已冻结');
 assert.equal(channelStatus(provider,{unlinked:true,endpoint:{}}),'未关联模型');
 assert.equal(channelStatus({status:'已停用'},{unlinked:true,endpoint:{frozen:true}}),'服务商已停用');
});
