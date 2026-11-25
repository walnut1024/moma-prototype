import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash, randomBytes } from 'node:crypto';
import { startLocalBackend } from '../database/local-runtime.js';
import { API_PREFIX } from '../api-path.js';
import { domainModelWorkspace } from '../src/mock/model-fields.js';
import { providerRemovalPlan } from '../src/admin-v2/provider-removal.js';
import { channelManagementDirectory, supplierModelChannelRows } from '../src/admin-v2/supplier-model-channel-table.js';
import { costRecords, supplyCostTableRows } from '../src/admin-v2/model-pricing-workspace.js';
import { channelFingerprint } from '../src/admin-v2/provider-channels.js';
import { registeredServiceUpstreams } from '../src/admin-v2/service-model-mappings.js';
import { resourceId } from '../src/resource-id.mjs';
import { channelListType, connectionDirectoryRows } from '../src/admin-v2/channel-connection-directory.js';
import { channelModelCandidates } from '../src/admin-v2/channel-model-candidates.js';
import { modelTaskUrl } from '../src/admin-v2/channel-interface.js';
import { modelMaterial } from '../src/admin-v2/model-library.js';

test('HTTP/D1 upstream removal retains registration and commercial history while registration removal retains upstreams', { timeout: 60000 }, async () => {
  const code = randomBytes(24).toString('hex'), hash = createHash('sha256').update(code).digest('hex');
  const local = await startLocalBackend({ demo: true, loginHashes: { 'admin-001': hash, 'admin-002': hash } });
  let cookie;
  const request = async (path, body, token = cookie) => {
    const response = await local.runtime.dispatchFetch('https://example.test' + API_PREFIX + path, {
      method: body ? 'POST' : 'GET', headers: { ...(token ? { cookie: token } : {}), ...(body ? { origin: 'https://example.test', 'x-moma-request': '1', 'content-type': 'application/json', 'idempotency-key': body.operationId || crypto.randomUUID() } : {}) },
      ...(body ? { body: JSON.stringify(body) } : {}),
    });
    return { status: response.status, data: await response.json(), cookie: response.headers.get('set-cookie')?.split(';')[0] };
  };
  const read = async () => { const response = await request('/model-operations'); assert.equal(response.status, 200); return domainModelWorkspace(response.data); };
  const body = (state, operation, data) => ({ operationId: crypto.randomUUID(), expectedRevision: state.revision, action: { type: 'modelOperations', operation, data } });
  const history = async () => Object.fromEntries(await Promise.all(['materials', 'price_versions', 'price_items', 'route_versions', 'route_members', 'model_price_records'].map(async table => [table, (await local.db.prepare(`SELECT * FROM ${table} ORDER BY rowid`).all()).results])));
  const checkViews = state => {
    const directory = channelManagementDirectory(state, state.providers), groups = [...directory.byProvider.values()].flat();
    const left = groups.flatMap(group => supplierModelChannelRows(state, [group]));
    const right = supplyCostTableRows(directory.models, costRecords(state, groups));
    assert.deepEqual(left.map(r => r.channel.id).sort(), right.map(r => r.channel.id).sort());
    assert(groups.every(g => !g.modelId || g.channels.length > 0));
    return directory;
  };
  try {
    assert.equal((await request('/model-operations')).status, 401);
    cookie = (await request('/auth/login', { accountId: 'admin-001', accessCode: code })).cookie;
    const observer = await request('/auth/login', { accountId: 'admin-002', accessCode: code }, '');
    let state = await read();
    const owner = state.providers.find(p => p.id === 'provider-moma');
    const registration = state.supplyRelations.models.find(r => r.providerId === owner.id && r.modelId === 'glm-5.3');
    const channels = state.supplyRelations.channels.filter(r => r.supplierModelId === registration.id);
    assert.equal(channels.length, 2);
    const otherProviders = structuredClone(state.providers.filter(p => p.id !== owner.id));
    const target = { providerId: owner.id, associationIds: channels.map(c => c.associationId) };
    const removal = current => ({ target, confirmed: true, expectedSignature: providerRemovalPlan(current, target).signature });
    assert.equal((await request('/model-operations/commands', body(state, 'providerRemovalCommit', removal(state)))).status, 422);
    assert.equal((await request('/model-operations/commands', body(state, 'providerRemovalPrepare', removal(state)))).status, 200);
    state = await read();
    const preserved = await history();
    const existingAudits = (await local.db.prepare('SELECT id,record_json FROM audit_events ORDER BY id').all()).results;
    const deletion = body(state, 'providerRemovalCommit', removal(state));
    assert.equal((await request('/model-operations/commands', deletion, observer.cookie)).status, 403);
    const saved = await request('/model-operations/commands', deletion); assert.equal(saved.status, 200, JSON.stringify(saved.data));
    assert.deepEqual((await request('/model-operations/commands', deletion)).data, saved.data);
    assert.equal((await request('/model-operations/commands', { ...deletion, operationId: crypto.randomUUID() })).status, 409);
    state = await read();
    assert.deepEqual(state.supplyRelations, saved.data.supplyRelations);
    assert(state.supplyRelations.models.some(r => r.id === registration.id));
    assert(!state.supplyRelations.channels.some(r => r.supplierModelId === registration.id));
    assert(!checkViews(state).byProvider.get(owner.id).some(g => g.id === registration.materialId));
    assert.equal(await local.db.prepare('SELECT removed_at FROM supplier_models WHERE id=?').bind(registration.id).first('removed_at'), null);
    for (const c of channels) assert((await local.db.prepare('SELECT removed_at FROM channel_models WHERE id=?').bind(c.id).first('removed_at')) > 0);
    assert.deepEqual(await history(), preserved);
    assert.deepEqual(state.providers.filter(p => p.id !== owner.id), otherProviders);
    for (const audit of existingAudits) assert.equal(await local.db.prepare('SELECT record_json FROM audit_events WHERE id=?').bind(audit.id).first('record_json'), audit.record_json);
    assert.equal((await local.db.prepare('PRAGMA foreign_key_check').all()).results.length, 0);
    assert(channels.every(channel => state.endpoints.some(endpoint => endpoint.id === channel.endpointId)));
    assert.equal((await request('/model-operations/commands', body(state, 'supplierModelsRegister', { providerId: owner.id, libraryIds: ['builtin-pp-ocrv6'] }))).status, 200);
    state = await read();
    const orphan = state.supplyRelations.models.find(r => r.providerId === owner.id && r.materialId === 'builtin-pp-ocrv6');
    const cleanup = body(state, 'provider', { operation: 'catalogueRemove', objectId: owner.id, values: { modelId: orphan.modelId, confirmed: true } });
    const cleaned = await request('/model-operations/commands', cleanup); assert.equal(cleaned.status, 200, JSON.stringify(cleaned.data));
    assert.deepEqual((await request('/model-operations/commands', cleanup)).data, cleaned.data);
    state = await read();
    assert(!state.supplyRelations.models.some(r => r.id === orphan.id));
    assert.deepEqual(await history(), preserved);
    const usable = registeredServiceUpstreams(state).filter(row => row.provider.id === owner.id && !row.reason);
    const live = state.supplyRelations.models.find(r => r.providerId === owner.id && state.supplyRelations.channels.some(c =>
      c.supplierModelId === r.id && usable.some(candidate => candidate.id === c.associationId)));
    const liveChannels = state.supplyRelations.channels.filter(row => row.supplierModelId === live.id);
    const upstream = usable.find(row => liveChannels.some(channel => channel.associationId === row.id));
    const supplierConnection = workspace => {
      const provider = workspace.providers.find(row => row.id === owner.id);
      return connectionDirectoryRows(workspace, [provider]).find(row => row.id === upstream.endpointId);
    };
    const supplierCandidate = workspace => channelModelCandidates(workspace, supplierConnection(workspace)).find(row => row.id === live.materialId);
    const material = modelMaterial(state, live.materialId);
    const connection = supplierConnection(state);
    const offer = {
      code: material.modelId, name: material.name, type: material.type,
      bindings: [{
        upstream: upstream.upstreamModelId,
        protocol: channelListType(connection),
        url: modelTaskUrl(connection.endpoint, material.type),
      }],
    };
    const declared = await request('/model-operations/commands', body(state, 'supplierOffersSave', { providerId: owner.id, offers: [offer] }));
    assert.equal(declared.status, 200, JSON.stringify(declared.data));
    state = await read();
    assert.equal(supplierCandidate(state)?.upstreamModelId, upstream.upstreamModelId);
    const removeLive = body(state, 'provider', { operation: 'catalogueRemove', objectId: owner.id,
      values: { modelId: live.modelId, expectedUpdatedAt: state.providers.find(row => row.id === owner.id).updatedAt, confirmed: true } });
    const removed = await request('/model-operations/commands', removeLive);
    assert.equal(removed.status, 200, JSON.stringify(removed.data));
    assert(!removed.data.supplyRelations.models.some(row => row.id === live.id));
    state = await read();
    assert.deepEqual(state.supplyRelations.channels.filter(row => row.supplierModelId === live.id), liveChannels);
    assert.equal(supplierCandidate(state), undefined);
    assert.equal(checkViews(state).byProvider.get(owner.id).find(group => group.id === live.materialId).channels.length, liveChannels.length);
    assert.equal((await request('/model-operations/commands', body(state, 'templateDelete', { id: live.materialId, confirmed: true }))).status, 200);
    state = await read();
    const candidate = registeredServiceUpstreams(state).find(row => row.id === upstream.id);
    assert.equal(candidate.reason, '');
    assert.equal(channelFingerprint(candidate), channelFingerprint(upstream));
    assert.deepEqual(candidate.pricing, upstream.pricing);

    const saveService = (row, revision) => request('/model-services-new', {
      operationId: resourceId('operation'), action: 'save', id: row.id, row, revision,
    });
    const created = await saveService({ id: resourceId('model-service'), name: '移除来源资料后的模型服务',
      callId: 'retained-upstream-service', modelId: '', type: candidate.type, listed: false, channels: [] }, 0);
    assert.equal(created.status, 200, JSON.stringify(created.data));
    const associated = await saveService({ ...created.data.row, channels: [{ id: resourceId('service-channel'), channelId: candidate.id,
      name: candidate.name, provider: owner.name, upstreamId: candidate.upstreamModelId, fingerprint: channelFingerprint(candidate),
      enabled: true, priority: 0, weight: 100 }] }, 1);
    assert.equal(associated.status, 200, JSON.stringify(associated.data));

    const associatedTarget = { providerId: owner.id, endpointId: candidate.endpointId, associationId: candidate.id };
    const serviceLinks = [{ name: created.data.row.name, callId: created.data.row.callId, channelIds: [candidate.id] }];
    const associationPlan = providerRemovalPlan({ ...state, newModelServiceLinks: serviceLinks }, associatedTarget);
    const blocked = await request('/model-operations/commands', body(state, 'providerRemovalCommit', {
      target: associatedTarget, expectedSignature: associationPlan.signature, confirmed: true,
    }));
    assert.equal(blocked.status, 422);
    assert.match(blocked.data.error.message, /请先在模型服务中移除待删除的关联上游模型/);
    assert.deepEqual((await request('/model-services-new')).data.rows.find(row => row.id === created.data.row.id).channels, associated.data.row.channels);
    assert.equal((await local.db.prepare('PRAGMA foreign_key_check').all()).results.length, 0);
  } finally { await local.runtime.dispose(); }
});
