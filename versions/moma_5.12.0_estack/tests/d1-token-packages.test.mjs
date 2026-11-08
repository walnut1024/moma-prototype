import { resetMarketSchemaFixture } from './channel-market-migration-fixture.mjs';
import assert from 'node:assert/strict';
import { after, before, test } from 'node:test';
import { createHash, randomBytes, randomUUID } from 'node:crypto';
import { migrateEmptyDatabase, startLocalBackend } from '../database/local-runtime.js';
import { adminBreadcrumbs } from '../src/admin-v2/breadcrumbs.mjs';
import { canAccessPage, pageFromHash } from '../src/admin-v2/navigation.mjs';
import { commitAdminState, createAdminSeed, parseAdminState, serializeAdminState } from '../src/admin-v2/store.js';
import { EMPTY_PACKAGE } from '../src/admin-v2/token-packages.js';

const workspace = '/package-management';
const testCode = 'Test@' + randomBytes(8).toString('hex');
const hash = createHash('sha256').update(testCode).digest('hex');
let local, admin, operator, maintenance;

async function request(path, { session = admin, body, key } = {}) {
  const response = await local.runtime.dispatchFetch('https://example.test/api/v1' + path, {
    method: body ? 'POST' : 'GET',
    headers: {
      ...(session ? { cookie: session } : {}),
      ...(body ? { origin: 'https://example.test', 'x-moma-request': '1', 'content-type': 'application/json' } : {}),
      ...(key ? { 'idempotency-key': key } : {}),
    },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
  return { status: response.status, data: await response.json(), cookie: response.headers.get('set-cookie') };
}

async function login(accountId) {
  const response = await request('/auth/login', { session: null, body: { accountId, accessCode: testCode } });
  assert.equal(response.status, 200);
  return response.cookie.split(';')[0];
}

const command = (expectedRevision, operation, values, item) => ({
  operationId: randomUUID(), expectedRevision,
  action: { type: 'tokenPackage', operation, values, id: item?.id, revision: item?.revision },
});
const post = (body, session = admin) => request(workspace + '/commands', { session, body, key: body.operationId });
const publishFactor = (revision, modelId, session = admin) => post(command(revision, 'publishFactorRules', { modelId }), session);
const rule = (billingItemId, factor, lower = '', upper = '') => ({
  billingItemId, factor, lower, upper, tiered: Boolean(lower || upper),
});

before(async () => {
  local = await startLocalBackend({ demo: true, loginHashes: { 'admin-001': hash, 'admin-002': hash, 'test-operator': hash } });
  await local.db.prepare("INSERT INTO admin_accounts(id,name,role) VALUES('test-operator','运营验收','运营人员')").run();
  [admin, operator, maintenance] = await Promise.all(['admin-001', 'test-operator', 'admin-002'].map(login));
}, { timeout: 30000 });
after(async () => { await local?.runtime.dispose(); });

test('package management routes are in operations and legacy browser records are retained without a local write path', () => {
  assert.equal(pageFromHash('#/admin-2/package-production?view=new', '运营人员'), 'package-production');
  assert.equal(canAccessPage('运营人员', 'package-production'), true);
  assert.equal(canAccessPage('运营人员', 'package-costs'), false);
  assert.equal(pageFromHash('#/admin-2/package-production?tab=factors', '运营人员'), 'package-production');
  assert.equal(canAccessPage('运维人员', 'package-production'), false);
  assert.equal(pageFromHash('#/admin-2/package-data', '运营人员'), 'package-data');
  assert.equal(canAccessPage('运营人员', 'package-data'), true);
  assert.equal(canAccessPage('运维人员', 'package-data'), false);
  assert.deepEqual(adminBreadcrumbs('package-data', new URLSearchParams()), [{ label: '套餐运营' }, { label: '套餐数据' }]);
  assert.deepEqual(adminBreadcrumbs('package-production', new URLSearchParams('view=new')), [
    { label: '套餐运营' }, { label: '套餐制作', href: '#/admin-2/package-production' }, { label: '新增套餐' },
  ]);
  const legacy = { ...createAdminSeed(), tokenPackages: [{ id: 'TP-0001', name: '旧套餐' }] };
  assert.deepEqual(parseAdminState(serializeAdminState(legacy)).tokenPackages, legacy.tokenPackages);
  assert.throws(() => commitAdminState(legacy, { type: 'tokenPackage', operation: 'save' }), /D1/);
  assert.throws(() => commitAdminState(legacy, { type: 'add', collection: 'tokenPackageTypes', record: {} }), /D1/);
});

test('D1 stores shared custom types, package fields and lifecycle changes with role, revision and replay checks', async () => {
  assert.equal((await request(workspace, { session: null })).status, 401);
  assert.equal((await request(workspace, { session: maintenance })).status, 403);
  const initial = await request(workspace, { session: operator });
  assert.equal(initial.status, 200);
  assert.deepEqual(initial.data.tokenPackages, []);
  assert.deepEqual(initial.data.tokenPackageTypes, []);
  assert.equal(initial.data.currentRole, '运营人员');

  const add = command(initial.data.revision, 'addType', { name: '行业版' });
  assert.equal((await post(add, operator)).status, 403);
  const added = await post(add);
  assert.equal(added.status, 200);
  assert.deepEqual(await post(add), added);
  const changedReplay = await post({ ...add, action: { ...add.action, values: { name: '其他版' } } });
  assert.equal(changedReplay.data.error.code, 'IDEMPOTENCY_CONFLICT');
  const type = added.data.patches.tokenPackageTypes.upsert[0];
  for (const name of ['个人版', '行业版']) {
    assert.equal((await post(command(added.data.revision, 'addType', { name }))).status, 422);
  }
  assert.equal((await post(command(0, 'addType', { name: '新分类' }))).data.error.code, 'REVISION_CONFLICT');

  const model = initial.data.packageModels.find(row => row.billingItemIds.length);
  assert.ok(model);
  const factorDraft = await post(command(added.data.revision, 'saveFactorDraft', {
    modelId: model.id, enabled: true, rules: [rule(model.billingItemIds[0], '1.25')],
  }), operator);
  assert.equal(factorDraft.status, 200);
  const priced = await publishFactor(factorDraft.data.revision, model.id, operator);
  assert.equal(priced.status, 200);
  let revision = priced.data.revision;
  const write = async (operation, values, item) => {
    const result = await post(command(revision, operation, values, item), operator);
    assert.equal(result.status, 200, JSON.stringify(result.data));
    revision = result.data.revision;
    return result.data.patches.tokenPackages.upsert[0];
  };
  const pack = { ...EMPTY_PACKAGE, kind: 'pack', name: '行业包', quota: '1500', price: '19', validDays: '30',
    limited: true, userTypes: [], displayOrder: '200', packageType: type.id, usageInstructions: '按调用扣减', usageScope: '适用于指定模型', modelIds: [model.id] };
  const draft = await write('save', pack);
  assert.equal(draft.status, 'draft');
  assert.match((await post(command(revision, 'deleteType', { typeId: type.id }))).data.error.message, /仍有 1 个套餐/);
  for (const operation of ['save', 'publishPackage']) {
    const changedKind = await post(command(revision, operation, { ...pack, kind: 'subscription' }, draft), operator);
    assert.equal(changedKind.status, 422);
    assert.match(changedKind.data.error.message, /不可修改套餐形式/);
  }
  assert.equal((await post(command(revision, 'list', undefined, draft), operator)).status, 422);
  assert.equal((await post(command(revision, 'publishPackage', pack, draft), operator)).status, 422);
  const ready = await write('publishPackage', { ...pack, userTypes: ['enterprise'], purchaseLimit: '3' }, draft);
  assert.equal(ready.status, 'ready');
  assert.equal(ready.packageType, type.id);
  assert.equal(ready.displayOrder, '200');
  assert.equal(ready.usageInstructions, pack.usageInstructions);
  assert.equal(ready.usageScope, pack.usageScope);
  assert.equal((await post(command(revision, 'list', undefined, draft), operator)).status, 422);
  const listed = await write('list', undefined, ready);
  assert.equal(listed.status, 'listed');
  assert.equal((await post(command(revision, 'save', pack, listed), operator)).status, 422);
  const unlisted = await write('unlist', undefined, listed);
  assert.equal(unlisted.status, 'unlisted');
  assert.equal((await write('list', undefined, unlisted)).status, 'listed');
  const subscriptionValues = { ...EMPTY_PACKAGE, name: '团队订阅', quota: '100', price: '0', packageType: 'team', displayOrder: '0', modelIds: [model.id] };
  const subscription = await write('publishPackage', subscriptionValues);
  assert.deepEqual(subscription.userTypes, ['enterprise', 'individual']);

  for (const patch of [{ price: '0.999' }, { quota: '1.5' }, { userTypes: ['all'] }, { packageType: 'forged' }, ...['-1', '201', '1.5'].map(displayOrder => ({ displayOrder }))]) {
    const values = { ...subscriptionValues, ...patch };
    assert.equal((await post(command(revision, 'publishPackage', values), operator)).status, 422);
  }
  const reloaded = await request(workspace);
  assert.equal(reloaded.data.revision, revision);
  assert.equal(reloaded.data.tokenPackageTypes[0].name, '行业版');
  assert.equal(reloaded.data.tokenPackages.find(row => row.id === ready.id).usageScope, pack.usageScope);
  assert.equal(reloaded.data.tokenPackages.length, 2);
  const audit = await local.db.prepare("SELECT record_json FROM audit_events WHERE entity_type='token-package' AND action='下架套餐'").first();
  assert.equal(JSON.parse(audit.record_json).before.status, 'listed');
  assert.equal(JSON.parse(audit.record_json).after.status, 'unlisted');
  assert.equal(JSON.parse(audit.record_json).actorId, 'test-operator');

  // Older records may have returned to draft after publishing, with publication only in their audit trail.
  const changed = await write('save', subscriptionValues, subscription);
  assert.equal(changed.status, 'draft');
  await local.db.prepare("UPDATE token_package_records SET record_json=json_remove(record_json,'$.everPublished') WHERE collection='tokenPackages' AND id=?").bind(changed.id).run();
  const historical = (await request(workspace)).data.tokenPackages.find(item => item.id === changed.id);
  assert.equal(historical.everPublished, true);
  const refused = await post(command(revision, 'deletePackage', undefined, historical), operator);
  assert.equal(refused.status, 422);
  assert.match(refused.data.error.message, /从未发布/);
});

test('only an untouched draft can be removed and its package ID stays reserved', async () => {
  const { data: initial } = await request(workspace);
  const values = { ...EMPTY_PACKAGE, name: '待删除草稿' };
  const created = await post(command(initial.revision, 'save', values), operator);
  assert.equal(created.status, 200);
  const draft = created.data.patches.tokenPackages.upsert[0];
  const removal = command(created.data.revision, 'deletePackage', undefined, draft);
  assert.equal((await post(removal, maintenance)).status, 403);
  const removed = await post(removal, operator);
  assert.equal(removed.status, 200);
  assert.deepEqual(removed.data.patches.tokenPackages, { upsert: [], remove: [draft.id] });
  assert.deepEqual(await post(removal, operator), removed);
  const reloaded = (await request(workspace)).data;
  assert(!reloaded.tokenPackages.some(item => item.id === draft.id));
  const audit = await local.db.prepare("SELECT record_json FROM audit_events WHERE entity_type='token-package' AND entity_id=? AND action='删除套餐草稿'").bind(draft.id).first();
  assert.equal(JSON.parse(audit.record_json).before.name, values.name);
  assert.ok(JSON.parse(audit.record_json).after.deletedAt);
  const next = await post(command(reloaded.revision, 'save', { ...values, name: '新草稿' }), operator);
  assert.equal(next.status, 200);
  assert.notEqual(next.data.objectId, draft.id);
});

test('D1 validates and publishes model factor drafts with history while packages keep using the effective rules', async () => {
  const { data: initial } = await request(workspace);
  const input = initial.packageBillingItems.find(item => item.name === '输入 Token').id;
  const output = initial.packageBillingItems.find(item => item.name === '输出 Token').id;
  const model = initial.packageModels.find(item => item.billingItemIds.includes(input) && item.billingItemIds.includes(output)
    && !initial.tokenPackageFactors.some(row => row.id === item.id));
  assert.ok(model);
  const outOfScope = initial.packageBillingItems.find(item => !model.billingItemIds.includes(item.id));
  const values = { ...EMPTY_PACKAGE, name: '抵扣测试包', quota: '10', price: '0' };
  assert.match((await post(command(initial.revision, 'publishPackage', values))).data.error.message, /至少选择一个/);
  for (const operation of ['save', 'publishPackage']) {
    const rejected = await post(command(initial.revision, operation, { ...values, modelIds: [model.id] }));
    assert.equal(rejected.status, 422);
    assert.match(rejected.data.error.message, /已配置抵扣规则/);
  }
  const configure = (rules, revision = initial.revision, enabled = true, changeNote = '') =>
    command(revision, 'saveFactorDraft', { modelId: model.id, rules, enabled, changeNote });
  const historyPath = workspace + '/factor-history?model=' + encodeURIComponent(model.id);
  assert.equal((await request(historyPath, { session: null })).status, 401);
  assert.equal((await request(historyPath, { session: maintenance })).status, 403);
  assert.equal((await request(workspace + '/factor-history')).status, 400);
  assert.equal((await publishFactor(initial.revision, model.id)).status, 422);
  for (const factor of ['0', '-1', '0.001', '1.250', '1e2', 'abc']) {
    const rejected = await post(configure([rule(input, factor)]));
    assert.equal(rejected.status, 422);
    assert.match(rejected.data.error.message, /最多两位小数/);
  }
  for (const [rules, reason] of [
    [[rule('missing', '1')], /有效计费项/],
    [[rule(outOfScope.id, '1')], /当前模型售价/],
    [[rule(input, '1', '', '256000'), rule(input, '2', '255999')], /规则重叠/],
    [[rule(input, '1'), rule(input, '2', '256000')], /规则重叠/],
    [[rule(input, '1', '100', '100')], /下限须小于上限/],
    [[rule(input, '1', '', '2.5')], /整数/],
    [[{ ...rule(input, '1'), tiered: true }], /档位端点/],
  ]) {
    const rejected = await post(configure(rules));
    assert.equal(rejected.status, 422);
    assert.match(rejected.data.error.message, reason);
  }
  const tiers = [rule(input, '5', '256000', '1000000'), rule(input, '1.5', '', '256000'), rule(output, '0.01')];
  const setup = await post(configure(tiers), operator);
  assert.equal(setup.status, 200);
  const stored = setup.data.patches.tokenPackageFactors.upsert[0];
  assert.equal(stored.enabled, false);
  assert.deepEqual(stored.rules, []);
  assert.deepEqual(stored.draft.rules, [
    { billingItemId: input, lower: null, upper: 256000, factor: '1.5' },
    { billingItemId: input, lower: 256000, upper: 1000000, factor: '5' },
    { billingItemId: output, lower: null, upper: null, factor: '0.01' },
  ]);
  const packageValues = { ...values, modelIds: [model.id], factor: '9' };
  assert.equal((await post(command(setup.data.revision, 'save', packageValues))).status, 422);
  assert.equal((await post(configure([], setup.data.revision))).status, 422);
  assert.deepEqual((await request(historyPath, { session: operator })).data.history, []);
  assert.equal((await publishFactor(setup.data.revision, model.id, maintenance)).status, 403);
  const firstPublish = command(setup.data.revision, 'publishFactorRules', { modelId: model.id });
  const enabled = await post(firstPublish, operator);
  assert.equal(enabled.status, 200);
  assert.deepEqual(await post(firstPublish, operator), enabled);
  const effective = enabled.data.patches.tokenPackageFactors.upsert[0];
  assert.equal(effective.enabled, true);
  assert.equal(effective.version, 1);
  assert.equal(effective.draft, null);
  assert.deepEqual(effective.rules, stored.draft.rules);
  const created = await post(command(enabled.data.revision, 'publishPackage', packageValues));
  assert.equal(created.status, 200);
  const saved = created.data.patches.tokenPackages.upsert[0];
  assert.deepEqual(saved.modelIds, [model.id]);
  assert.equal(saved.factor, undefined);

  const disabled = await post(configure([], created.data.revision, false));
  assert.equal(disabled.status, 200);
  assert.match((await publishFactor(disabled.data.revision, model.id)).data.error.message, /仍被套餐引用/);
  const change = configure([rule(input, '2')], disabled.data.revision, true, '调整输入系数');
  const updated = await post(change);
  assert.equal(updated.status, 200);
  assert.deepEqual(await post(change), updated);
  assert.equal((await publishFactor(disabled.data.revision, model.id)).status, 409);
  const { data: pending } = await request(workspace);
  assert.deepEqual(pending.tokenPackageFactors.find(item => item.id === model.id).rules, effective.rules);
  assert.equal((await request(historyPath)).data.history.length, 1);
  const published = await publishFactor(updated.data.revision, model.id, operator);
  assert.equal(published.status, 200);
  const { data: reloaded } = await request(workspace);
  const current = reloaded.tokenPackageFactors.find(item => item.id === model.id);
  assert.equal(current.version, 2);
  assert.equal(current.draft, null);
  assert.deepEqual(current.rules, [
    { billingItemId: input, lower: null, upper: null, factor: '2' },
  ]);
  assert.deepEqual(reloaded.tokenPackages.find(item => item.id === saved.id), saved);
  const { history } = (await request(historyPath)).data;
  assert.deepEqual(history.map(entry => entry.version), [2, 1]);
  assert.equal(history[0].before.rules[0].factor, '1.5');
  assert.equal(history[0].after.rules[0].factor, '2');
  assert.equal(history[0].after.rules[0].billingItem, '输入 Token');
  assert.equal(history[0].changeNote, '调整输入系数');
  assert.equal(history[0].actor, '运营验收');
  assert.equal(history[0].createdAt, current.publishedAt);
});

test('package model choices come from unarchived model services, with stable material references', async () => {
  const { data: state } = await request(workspace);
  const { data: services } = await request('/model-operations');
  assert.deepEqual(state.packageModels.map(row => row.code).sort(),
    services.models.filter(row => !row.archivedAt).map(row => row.id).sort());
  const material = await local.db.prepare('SELECT id FROM materials WHERE id NOT IN (SELECT material_id FROM services) LIMIT 1').first();
  assert.ok(material);
  assert(!state.packageModels.some(row => row.id === material.id));
  const blocked = await post(command(state.revision, 'saveFactorDraft', { modelId: material.id, enabled: true, rules: [] }));
  assert.equal(blocked.status, 422);
  assert.match(blocked.data.error.message, /模型服务不存在/);
  const unpriced = state.packageModels.find(row => !row.billingItemIds.length);
  const withoutPrice = await post(command(state.revision, 'saveFactorDraft', { modelId: unpriced.id, enabled: false, rules: [] }));
  assert.equal(withoutPrice.status, 422);
  assert.match(withoutPrice.data.error.message, /暂无生效售价计费项/);

  const model = state.packageModels.find(row => state.tokenPackages.some(pack => pack.modelIds.includes(row.id)));
  const service = services.models.find(row => row.id === model.code);
  const operationId = randomUUID();
  const archive = await request('/model-operations/commands', { key: operationId, body: {
    operationId, expectedRevision: services.revision,
    action: { type: 'modelOperations', operation: 'serviceArchive', modelId: model.serviceId,
      data: { confirmed: true, expectedUpdatedAt: service.updatedAt } },
  } });
  assert.equal(archive.status, 422);
  assert.match(archive.data.error.message, /仍被套餐引用/);
});

test('only administrators can delete unused custom types, and deletion persists without reusing IDs', async () => {
  const initial = await request(workspace);
  const added = await post(command(initial.data.revision, 'addType', { name: '可删除类型' }));
  assert.equal(added.status, 200);
  const type = added.data.patches.tokenPackageTypes.upsert[0];
  const revision = added.data.revision;
  assert.match((await post(command(revision, 'deleteType', { typeId: 'team' }))).data.error.message, /内置套餐类型不可删除/);
  const removal = command(revision, 'deleteType', { typeId: type.id });
  assert.equal((await post(removal, operator)).status, 403);
  const removed = await post(removal);
  assert.equal(removed.status, 200);
  assert.deepEqual(removed.data.patches.tokenPackageTypes, { upsert: [], remove: [type.id] });
  assert.deepEqual(await post(removal), removed);
  const reloaded = await request(workspace);
  assert.equal(reloaded.data.revision, revision + 1);
  assert(!reloaded.data.tokenPackageTypes.some(item => item.id === type.id));
  const audit = await local.db.prepare("SELECT record_json FROM audit_events WHERE entity_type='token-package-type' AND entity_id=? AND action='删除套餐类型'").bind(type.id).first();
  assert.equal(JSON.parse(audit.record_json).before.name, type.name);
  assert.ok(JSON.parse(audit.record_json).after.deletedAt);
  const recreated = await post(command(reloaded.data.revision, 'addType', { name: type.name }));
  assert.equal(recreated.status, 200);
  assert.notEqual(recreated.data.objectId, type.id);
});

test('v7 migration retains the original factor and package references without inventing a billing item', async () => {
  const { data: initial } = await request(workspace);
  const model = initial.packageModels.find(item => !initial.tokenPackageFactors.some(row => row.id === item.id));
  const nextRevision = initial.revision + 1;
  const legacy = { id: model.id, factor: '1.25' };
  await local.db.batch([
    local.db.prepare("INSERT INTO token_package_model_factors(id,workspace_revision,record_json) VALUES(?,?,?)")
      .bind(model.id, nextRevision, JSON.stringify(legacy)),
    ...resetMarketSchemaFixture(local.db),
    local.db.prepare('DROP TABLE traffic_limit_rules'),
    local.db.prepare('DROP TABLE traffic_limit_defaults'),
    local.db.prepare('UPDATE db_state SET schema_version=7 WHERE id=1'),
  ]);
  // Simulate the v7 records in this isolated database and apply the migration to that shape.
  await migrateEmptyDatabase(local.db);
  const { data: migrated } = await request(workspace);
  assert.deepEqual(migrated.tokenPackageFactors.find(row => row.id === model.id), { id: model.id, legacyFactor: '1.25', rules: [] });
  assert.deepEqual(migrated.tokenPackageFactors.filter(row => row.id !== model.id), initial.tokenPackageFactors);
  assert.deepEqual(migrated.tokenPackages, initial.tokenPackages);
  assert.equal(migrated.revision, nextRevision);
});

test('a custom billing item cannot be deleted while a draft or effective package rule references it', async () => {
  const modelPath = '/model-operations';
  const changeDictionary = (revision, data) => {
    const operationId = randomUUID();
    return request(modelPath + '/commands', { key: operationId, body: {
      operationId, expectedRevision: revision, action: { type: 'modelOperations', operation: 'tariffDictionary', data },
    } });
  };
  const { data: before } = await request(modelPath);
  const added = await changeDictionary(before.revision, { operation: 'save', kind: 'scenario', name: '套餐测试 Token' });
  assert.equal(added.status, 200);
  const item = added.data.patches.tariffDictionary.upsert[0];
  const { data: packageState } = await request(workspace);
  assert(packageState.packageBillingItems.some(row => row.id === item.id));
  const model = packageState.packageModels.find(row => row.billingItemIds.length);
  const baseRule = rule(model.billingItemIds[0], '1.25');
  const addPriceItem = () => local.db.prepare(`INSERT INTO price_items(id,price_version_id,billing_item_id,unit_id,currency_id,amount_micros,unit_quantity,condition_json,condition_hash,labels_json,position)
    SELECT 'package-test-item',p.price_version_id,?,p.unit_id,p.currency_id,p.amount_micros,p.unit_quantity,p.condition_json,'package-test',p.labels_json,99
    FROM offers o JOIN price_items p ON p.price_version_id=o.active_sale_price_id
    WHERE o.service_id=? AND o.retired_at IS NULL LIMIT 1`).bind(item.id, model.serviceId).run();
  const removePriceItem = () => local.db.prepare("DELETE FROM price_items WHERE id='package-test-item'").run();
  await addPriceItem();
  const setRules = (revision, rules) => post(command(revision, 'saveFactorDraft', { modelId: model.id, enabled: true, rules }));
  const saved = await setRules(packageState.revision, [baseRule, rule(item.id, '1.5', '256000')]);
  assert.equal(saved.status, 200);
  const deletion = { operation: 'delete', id: item.id };
  const rejected = await changeDictionary(added.data.revision, deletion);
  assert.equal(rejected.status, 422);
  assert.match(rejected.data.error.message, /套餐抵扣规则引用/);
  await removePriceItem();
  assert.match((await publishFactor(saved.data.revision, model.id)).data.error.message, /当前模型售价/);
  await addPriceItem();
  const published = await publishFactor(saved.data.revision, model.id);
  assert.equal(published.status, 200);
  await removePriceItem();
  const cleared = await setRules(published.data.revision, [baseRule]);
  assert.equal(cleared.status, 200);
  assert.equal((await changeDictionary(added.data.revision, deletion)).status, 422);
  assert.equal((await publishFactor(cleared.data.revision, model.id)).status, 200);
  assert.equal((await changeDictionary(added.data.revision, deletion)).status, 200);
});
