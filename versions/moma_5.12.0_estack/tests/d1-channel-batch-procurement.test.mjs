import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash, randomBytes } from 'node:crypto';
import { startLocalBackend } from '../database/local-runtime.js';
import { domainModelWorkspace } from '../src/mock/model-fields.js';
import { activeChannelProcurement } from '../src/admin-v2/channel-change-management.js';
import { modelCatalogue } from '../src/admin-v2/model-library.js';

test('publishing batch procurement prices is scoped, atomic and keeps version history', { timeout: 60000 }, async () => {
  const accessCode = randomBytes(24).toString('hex');
  const local = await startLocalBackend({ demo: true, loginHashes: { 'admin-001': createHash('sha256').update(accessCode).digest('hex') } });
  let cookie = '';
  const request = (path, body) => local.runtime.dispatchFetch('https://example.test/api/v1' + path, {
    method: body ? 'POST' : 'GET',
    headers: { ...(cookie ? { cookie } : {}), ...(body ? { origin: 'https://example.test', 'x-moma-request': '1', 'content-type': 'application/json' } : {}),
      ...(body?.operationId ? { 'idempotency-key': body.operationId } : {}) },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
  const read = async () => domainModelWorkspace(await (await request('/model-operations')).json());
  const command = (state, operation, data) => ({
    operationId: crypto.randomUUID(), expectedRevision: state.revision, action: { type: 'modelOperations', operation, data },
  });
  const send = async (command, expected = 200) => {
    const response = await request('/model-operations/commands', command);
    assert.equal(response.status, expected, await response.clone().text());
  };
  try {
    const login = await request('/auth/login', { accountId: 'admin-001', accessCode });
    assert.equal(login.status, 200);
    cookie = login.headers.get('set-cookie').split(';')[0];
    const seed = await read();
    await send(command(seed, 'providerIntake', { confirmed: true, document: {
      provider: { name: '批量成本测试', code: 'batch-cost-fixture', source_type: 'thirdParty' },
    } }));
    const created = await read();
    const provider = created.providers.find(row => row.code === 'batch-cost-fixture');
    const modelInputs = modelCatalogue(created).filter(row => row.type === 'text').slice(0, 3)
      .map((row, index) => ({ libraryId: row.id, upstreamModelId: 'fixture-model-' + index }));
    assert.equal(modelInputs.length, 3);
    await send(command(created, 'channelQuickCreate', {
      providerId: provider.id,
      values: { name: '批量成本测试连接', authMode: 'group', keyGroupId: 'default', interfaceType: 'openai', protocol: 'OpenAI', baseUrl: 'https://vendor.example.test/v1', models: modelInputs },
    }));
    const scope = state => state.providers.find(row => row.id === provider.id).catalogConnections;
    const connected = await read();
    const [first, second, untouched] = scope(connected);
    const base = { providerId: provider.id, endpointId: first.endpointId, confirmed: true };
    const quote = listPrice => [{ name: '输入 Token', listPrice, currency: 'CNY', unit: '百万 Token' }];
    await send(command(connected, 'channelProcurementPublish', { ...base, associationId: first.id, expectedPriceRevision: 0, scenarios: quote('3') }));
    const before = await read();
    const rows = [{ associationId: first.id, expectedPriceRevision: 1 }, { associationId: second.id, expectedPriceRevision: 0 }];
    const data = { ...base, rows, scenarios: quote('7.5') };
    const operation = 'channelProcurementBatchPublish';
    for (const invalid of [
      { rows: [rows[0], { ...rows[1], expectedPriceRevision: 9 }] },
      { rows: [rows[0], { associationId: 'another-channel-model', expectedPriceRevision: 0 }] },
      { rows: [rows[0], rows[0]] },
      { scenarios: quote('') },
    ]) {
      await send(command(before, operation, { ...data, ...invalid }), 422);
      assert.deepEqual(await read(), before);
    }
    const publish = command(before, operation, data);
    await send(publish);
    const after = await read();
    await send(publish);
    assert.deepEqual(await read(), after);
    const [pricedFirst, pricedSecond, unchanged] = scope(after);
    assert.deepEqual(unchanged, untouched);
    assert.deepEqual(pricedFirst.procurementVersions.slice(0, -1), scope(before)[0].procurementVersions);
    assert.equal(pricedFirst.procurementRevision, 2);
    assert.equal(pricedSecond.procurementRevision, 1);
    assert.equal(activeChannelProcurement(pricedFirst).pricing.scenarios[0].listPrice, 7500000);
    assert.equal(activeChannelProcurement(pricedSecond).pricing.scenarios[0].listPrice, 7500000);
    assert.equal(pricedFirst.procurementVersions.at(-1).effectiveAt, pricedSecond.procurementVersions.at(-1).effectiveAt);
    assert.deepEqual(after.endpoints, before.endpoints);
    assert.deepEqual(after.modelSalePrices, before.modelSalePrices);
  } finally { await local.runtime.dispose(); }
});
