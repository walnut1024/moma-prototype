import assert from 'node:assert/strict';
import { createHash, randomBytes } from 'node:crypto';
import test from 'node:test';
import { runLocalChannelDiscovery } from '../server/local-channel-discovery.js';
import { startLocalBackend } from '../database/local-runtime.js';
import { domainModelWorkspace } from '../src/mock/model-fields.js';
import { routingChannels, routingServices, serviceRoute } from '../src/admin-v2/service-routing.js';
import { ollamaCurrentRows } from '../src/admin-v2/channel-directory-specialty.js';
import { channelChangeImpact } from '../src/admin-v2/channel-change-management.js';
import { channelDiscoveryPreview, directoryDiscoverySignature } from '../src/admin-v2/channel-discovery-diff.js';
import { directoryArchivePlan, directoryDisabledKind } from '../src/admin-v2/channel-directory-archive.js';
import { connectionFingerprint, connectionKeys } from '../src/admin-v2/connection-state.js';
import { providerApiKeysDraft } from '../src/admin-v2/provider-management.js';
import { providerRemovalPlan } from '../src/admin-v2/provider-removal.js';
import { supplierChannelLifecyclePlan } from '../src/admin-v2/supplier-channel-batch.js';
import { supplierChannelAssociations } from '../src/admin-v2/supplier-resources.js';

test('the channel directory persists credential scopes, retries batches and maintains independent lifecycles through D1', { timeout: 45000 }, async () => {
  const accessCode = randomBytes(32).toString('hex');
  const local = await startLocalBackend({ demo: true, loginHashes: { 'admin-001': createHash('sha256').update(accessCode).digest('hex') } });
  let cookie, state;
  async function request(path, body, operationId) {
    const response = await local.runtime.dispatchFetch('https://example.test/api/5120' + path, {
      method: body ? 'POST' : 'GET',
      headers: { ...(cookie ? { cookie } : {}), ...(body ? { origin: 'https://example.test', 'x-moma-request': '1', 'content-type': 'application/json' } : {}),
        ...(operationId ? { 'idempotency-key': operationId } : {}) },
      ...(body ? { body: JSON.stringify(body) } : {}),
    });
    const result = await response.json();
    if (!response.ok) throw Error(result.error?.message || JSON.stringify(result));
    return { result, headers: response.headers };
  }
  const load = async () => { state = domainModelWorkspace((await request('/model-operations')).result); };
  const command = async (operation, data) => {
    const operationId = crypto.randomUUID();
    await request('/model-operations/commands', { operationId, expectedRevision: state.revision,
      action: { type: 'modelOperations', operation, data } }, operationId);
    await load();
  };
  try {
    await assert.rejects(request('/channels/consistency'), /先登录后台/);
    const login = await request('/auth/login', { accountId: 'admin-001', accessCode });
    cookie = login.headers.get('set-cookie').split(';')[0];
    await load();
    const providerId = 'provider-moma';
    const provider = () => state.providers.find(row => row.id === providerId);
    const original = state.endpoints.map(row => row.id);
    const raw = Array.from({ length: 5 }, () => 'dummy-' + randomBytes(12).toString('hex'));
    const { apiKeys: keys } = await providerApiKeysDraft(raw);
    const row = (name, keys) => ({ name, keys, creationId: crypto.randomUUID() });
    const common = { providerId, interfaceType: 'openai', protocol: 'OpenAI', baseUrl: 'https://example.invalid/v1',
      authMode: 'independent', timeoutSeconds: 60 };
    const single = row('独立渠道验收', [keys[0]]);
    await assert.rejects(command('channelDirectoryCreate', { ...common, baseUrl: 'https://example.invalid/v1/chat/completions', rows: [single] }), /根地址/);
    await assert.rejects(command('channelDirectoryCreate', { ...common, rows: [{ ...single, keys: [{ ...keys[0], raw: raw[0] }] }] }), /脱敏元数据/);
    await assert.rejects(command('channelDirectoryCreate', { ...common, note: '简'.repeat(301), rows: [single] }), /最多 300 字/);
    await command('channelDirectoryCreate', { ...common, note: '  原始简介  ', rows: [single] });
    const get = input => state.endpoints.find(row => row.directoryCreationId === input.creationId);
    assert.equal(get(single).authMode, 'specific');
    assert.equal(get(single).directoryNote, '原始简介');
    const details = { providerId, endpointId: get(single).id, baseUrl: get(single).baseUrl,
      expectedUpdatedAt: get(single).updatedAt, expectedProviderUpdatedAt: provider().updatedAt, note: '修改简介' };
    await assert.rejects(command('supplierChannelEdit', { ...details, expectedUpdatedAt: 'stale' }), /当前版本/);
    await command('supplierChannelEdit', { ...details, name: '独立渠道更新', connectionNameOnly: true });
    assert.equal(get(single).name, '独立渠道更新');
    assert.equal(get(single).directoryNote, '修改简介');
    const verifyPath = '/channels/' + get(single).id + '/verify-credential';
    const assignedKey = connectionKeys(get(single), provider())[0];
    await assert.rejects(request(verifyPath, { keyId: assignedKey.id, accessCode: 'invalid-local-code' }), /访问码不正确/);
    await assert.rejects(request(verifyPath, { keyId: 'foreign-key', accessCode }), /不属于当前连接/);
    const verified = (await request(verifyPath, { keyId: assignedKey.id, accessCode })).result;
    assert.equal(verified.maskedKey, assignedKey.maskedKey);
    assert(Date.parse(verified.expiresAt) > Date.now() && Date.parse(verified.expiresAt) <= Date.now() + 30000);
    assert.equal(Object.hasOwn(verified, 'fingerprint'), false);
    await load();
    const accessAudits = state.audits.filter(row => row.endpointId === get(single).id && row.action === '凭证查看身份验证');
    assert.deepEqual(accessAudits.map(row => row.result).sort(), ['失败', '成功']);
    assert(!JSON.stringify(accessAudits).includes(accessCode));
    const pool = row('多密钥渠道验收', keys.slice(1, 3));
    await command('channelDirectoryCreate', { ...common, keyStrategy: 'roundRobin', rows: [pool] });
    assert.equal(get(pool).authMode, 'pool');
    assert.equal(get(pool).keyStrategy, 'roundRobin');
    assert.deepEqual(connectionKeys(get(pool), provider()).map(row => row.fingerprint), keys.slice(1, 3).map(row => row.fingerprint));
    await command('channelCandidateSave', { providerId, endpointId: get(pool).id, expectedRevision: 0,
      config: { authMode: 'pool', keyStrategy: 'random', keyPool: get(pool).keyPool } });
    assert.equal(get(pool).candidateConfiguration.config.keyStrategy, 'random');
    assert.equal(get(pool).keyStrategy, 'roundRobin');
    assert.deepEqual(connectionKeys({ ...get(pool), ...get(pool).candidateConfiguration.config }, provider()).map(row => row.scope), ['channel', 'channel']);
    const poolContext = () => ({ providerId, endpointId: get(pool).id, candidateId: get(pool).candidateConfiguration?.id,
      expectedRevision: get(pool).configurationRevision || 0 });
    await command('channelCandidateDiscard', poolContext());
    await command('supplierChannelRegister', { providerId, endpointId: get(pool).id, modelId: 'glm-5.3',
      upstreamModelId: 'glm-5.3', expectedEndpointUpdatedAt: get(pool).updatedAt });
    const poolMapping = supplierChannelAssociations(state, provider(), get(pool).id)[0];
    const poolRaw = Array.from({ length: 3 }, () => 'pool-' + randomBytes(12).toString('hex'));
    const { apiKeys: poolKeys } = await providerApiKeysDraft(poolRaw);
    const currentKeys = () => connectionKeys(get(pool), provider());
    const stagedKeys = () => connectionKeys({ ...get(pool), ...get(pool).candidateConfiguration?.config }, provider());
    const stage = (mode, newKeys, extra = {}) => command('channelCandidatePoolSave', { ...poolContext(), mode, newKeys, keyStrategy: 'roundRobin',
      expectedImpactRevision: channelChangeImpact(state, providerId, get(pool).id).revision,
      keyPool: get(pool).candidateConfiguration?.config.keyPool || get(pool).keyPool, ...extra });
    await assert.rejects(stage('append', [{ ...poolKeys[0], raw: poolRaw[0] }]), /掩码/);
    await assert.rejects(stage('append', [keys[1]]), /相同/);
    await assert.rejects(stage('append', [poolKeys[0]], { candidateId: 'expired' }), /已变化/);
    const previousPool = currentKeys().map(key => key.id);
    const sharedKeys = structuredClone(provider().apiKeys);
    await stage('append', [poolKeys[0]]);
    assert.deepEqual(currentKeys().map(key => key.id), previousPool);
    const appendIds = stagedKeys().map(key => key.id);
    assert.deepEqual(appendIds.slice(0, 2), previousPool);
    assert.equal(appendIds.length, 3);
    await stage('edit', []);
    assert.deepEqual(stagedKeys().map(key => key.id), appendIds);
    const applyPool = () => command('channelCandidateApply', { ...poolContext(), confirmed: true });
    const testKey = (keyId, scenario = 'success') => command('channelCandidateTest', { ...poolContext(), keyId,
      associationIds: [poolMapping.id], scenarios: { [poolMapping.id]: scenario } });
    await testKey(appendIds[0]);
    await assert.rejects(applyPool(), /全部启用密钥/);
    await testKey(appendIds[1]);
    await testKey(appendIds[2], 'unauthorized');
    await assert.rejects(applyPool(), /密钥无效|鉴权/);
    assert.deepEqual(currentKeys().map(key => key.id), previousPool);
    await testKey(appendIds[2]);
    await applyPool();
    assert.deepEqual(currentKeys().map(key => key.id), appendIds);
    await stage('rotate', [poolKeys[1]], { replaceKeyId: appendIds[1] });
    assert.deepEqual(stagedKeys().map(key => key.fingerprint), [keys[1].fingerprint, poolKeys[1].fingerprint, poolKeys[0].fingerprint]);
    assert.deepEqual(currentKeys().map(key => key.id), appendIds);
    await stage('replace', [poolKeys[2]]);
    assert.deepEqual(stagedKeys().map(key => key.fingerprint), [poolKeys[2].fingerprint]);
    await testKey(stagedKeys()[0].id);
    await applyPool();
    assert.deepEqual(currentKeys().map(key => key.fingerprint), [poolKeys[2].fingerprint]);
    assert.deepEqual(provider().apiKeys, sharedKeys);
    assert(poolRaw.every(key => !JSON.stringify(state).includes(key)));
    await command('channelCandidatePoolPause', { ...poolContext(), confirmed: true,
      expectedImpactRevision: channelChangeImpact(state, providerId, get(pool).id).revision });
    assert.equal(get(pool).poolPaused, true);
    assert.deepEqual(currentKeys(), []);
    assert.equal(get(pool).status, '停用');
    await stage('edit', []);
    await assert.rejects(applyPool(), /全部启用密钥/);
    await testKey(stagedKeys()[0].id);
    await applyPool();
    assert.equal(get(pool).poolPaused, false);
    assert.equal(currentKeys().length, 1);
    assert.equal(get(pool).status, '停用');
    await command('channelCandidateRollback', { ...poolContext(), targetVersion: 1, allAssociations: true });
    assert.deepEqual(stagedKeys().map(key => key.id), appendIds);
    await assert.rejects(applyPool(), /全部启用密钥/);
    const batch = [row('逐行验收-A', [keys[3]]), row('逐行验收-B', [keys[4]])];
    await command('channelDirectoryCreate', { ...common, perCredential: true, rows: batch });
    await command('channelDirectoryCreate', { ...common, perCredential: true, rows: batch });
    assert.equal(state.endpoints.length, original.length + 4);
    for (const input of batch) assert.equal(get(input).apiKeys.length, 1);
    await assert.rejects(command('channelDirectoryCreate', { ...common, perCredential: true, rows: [row('重复验收', [keys[3]])] }), /重复/);
    assert(raw.every(key => !JSON.stringify(state).includes(key)));
    const endpointId = get(single).id;
    const target = row => ({ providerId, endpointId: row.id, expectedUpdatedAt: row.updatedAt,
      expectedImpactRevision: channelChangeImpact(state, providerId, row.id).revision });
    const operate = (action, targets, extra = {}) => command('channelDirectoryOperate', { action, targets, confirmed: true, ...extra });
    const changeStatus = (enabled, patch = {}) => operate(enabled ? 'enable' : 'disable', [{ ...target(get(single)), ...patch }]);
    const selected = [get(single), get(batch[0])].map(target);
    await assert.rejects(operate('tag', [selected[0], { ...selected[1], expectedUpdatedAt: 'stale' }], { tag: '运维验收' }), /影响范围已变化/);
    assert.equal(get(single).directoryTags, undefined);
    await operate('tag', selected, { tag: '运维验收' });
    assert.deepEqual(get(single).directoryTags, ['运维验收']);
    assert.deepEqual(get(batch[0]).directoryTags, ['运维验收']);
    assert.equal(get(batch[1]).directoryTags, undefined);
    await operate('untag', [target(get(single))], { tag: '运维验收' });
    assert.deepEqual(get(single).directoryTags, []);
    assert.deepEqual(get(batch[0]).directoryTags, ['运维验收']);
    await operate('tag', [target(get(single))], { tag: '运维验收' });
    await operate('tag', [target(get(batch[0]))], { tag: '第二标签' });
    const members = () => [target(get(single)), target(get(batch[0]))];
    await assert.rejects(operate('renameTag', [members()[0]], { sourceTag: '运维验收', tag: '新名称' }), /成员已变化/);
    await assert.rejects(operate('renameTag', members(), { sourceTag: '运维验收', tag: '第二标签' }), /已存在/);
    const serviceRoutes = structuredClone(state.serviceRoutes);
    await operate('renameTag', members(), { sourceTag: '运维验收', tag: '新名称' });
    assert.deepEqual(get(single).directoryTags, ['新名称']);
    await operate('dissolveTag', members(), { sourceTag: '新名称' });
    assert.deepEqual(get(single).directoryTags, []);
    assert.deepEqual(get(batch[0]).directoryTags, ['第二标签']);
    assert.deepEqual(state.serviceRoutes, serviceRoutes);
    const taggedId = get(batch[0]).id;
    const tagEdit = (mode, patch = {}) => command('channelDirectoryTagEdit', { tag: '第二标签', confirmed: true,
      memberIds: [taggedId], providerId, modelId: 'glm-5.3', mode, upstreamModelId: mode === 'append' ? 'tag-append-demo' : 'tag-replace-demo',
      targets: [{ endpointId: taggedId, expectedUpdatedAt: get(batch[0]).updatedAt }], ...patch });
    await assert.rejects(tagEdit('append', { memberIds: [] }), /成员已变化/);
    await tagEdit('append');
    assert.equal(state.audits[0].directoryOperationResults[0].status, '已完成');
    await tagEdit('replace');
    assert.equal(supplierChannelAssociations(state, provider(), taggedId)[0].upstreamModelId, 'tag-replace-demo');
    await assert.rejects(changeStatus(true), /新增模型渠道/);
    const model = provider().catalogModels.find(row => row.modelId === 'glm-5.3');
    await command('supplierChannelRegister', { providerId, endpointId, modelId: model.modelId, upstreamModelId: 'glm-5.3',
      expectedEndpointUpdatedAt: get(single).updatedAt });
    await assert.rejects(changeStatus(true), /测试/);
    await command('provider', { operation: 'supplierChannelTest', objectId: providerId, values: { endpointId } });
    await assert.rejects(operate('enable', [target(get(single)), target(get(batch[0]))]), /请先配置凭证并通过渠道测试/);
    assert.equal(get(single).status, '草稿');
    await operate('enable', [target(get(single)), target(get(batch[1]))], { report: true });
    assert.equal(get(single).status, '运行中');
    assert.deepEqual(state.audits[0].directoryOperationResults.map(row => row.status), ['已完成', '已跳过']);
    await assert.rejects(changeStatus(false, { expectedImpactRevision: 'stale' }), /影响范围已变化/);
    await changeStatus(false);
    assert.equal(get(single).status, '停用');
    const association = supplierChannelAssociations(state, provider(), endpointId)[0];
    assert.equal(association.enabled, false);
    const associationIds = [association.id];
    const modelPlan = supplierChannelLifecyclePlan(state, providerId, associationIds, 'enable', { modelOnly: true });
    await assert.rejects(command('supplierChannelBatchLifecycle', { providerId, associationIds, action: 'enable',
      modelOnly: true, confirmed: true, expectedSignature: modelPlan.signature }), /先在连接行启用连接/);
    const receipt = { endpointId, providerId, signature: directoryDiscoverySignature(provider(), get(single)),
      result: { source: 'mock', models: [{ id: 'next-model', unrecognized: 'discarded' }], complete: false } };
    const recordDiscovery = rows => command('channelDiscoveryRecord', { taskId: crypto.randomUUID(), rows });
    await assert.rejects(recordDiscovery([{ ...receipt, signature: 'old-config' }]), /已经变化/);
    await assert.rejects(recordDiscovery([receipt, receipt]), /不重复/);
    await recordDiscovery([receipt]);
    const savedDiscovery = get(single).directoryDiscovery;
    assert.equal(savedDiscovery.result.complete, false);
    assert.equal(Object.hasOwn(savedDiscovery.result.models[0], 'unrecognized'), false);
    await assert.rejects(recordDiscovery([{ ...receipt, result: { ...receipt.result, models: [{ id: 'next-model', authorization: 'dummy' }] } }]), /明文不得提交/);
    assert.equal(channelDiscoveryPreview(state, provider(), endpointId, savedDiscovery.result).missing.length, 0);
    assert.deepEqual(supplierChannelAssociations(state, provider(), endpointId).map(row => row.id), associationIds);
    const proof = get(single).connectionTest;
    await command('channelDirectoryNote', { ...target(get(single)), note: '验收记录' });
    assert.deepEqual(get(single).connectionTest, proof);
    assert.equal(get(single).directoryNote, '验收记录');
    const rules = { parameters: { temperature: 0.2 }, headers: { 'X-Workspace': 'ops-demo' }, statusCodes: { 429: 503 } };
    const editRules = patch => command('supplierChannelEdit', { ...target(get(single)), expectedProviderUpdatedAt: provider().updatedAt,
      baseUrl: get(single).baseUrl, prepareConnection: true, allAssociations: true, requestRules: rules, ...patch });
    await assert.rejects(editRules({ expectedImpactRevision: 'stale' }), /核对请求规则/);
    await assert.rejects(editRules({ requestRules: { parameters: { stream: false } } }), /受保护/);
    await assert.rejects(editRules({ networkSettings: { proxyRef: 'https://example.invalid' } }), /配置引用/);
    await editRules({ networkSettings: { httpVersion: 'http2', http2Streams: 3, proxyRef: 'proxy-east' }, timeoutSeconds: 90 });
    assert.equal(get(single).requestRules, undefined);
    assert.equal(get(single).timeoutSeconds, 60);
    assert.deepEqual(get(single).candidateConfiguration.config.requestRules.headers, { 'x-workspace': 'ops-demo' });
    const ruleTarget = () => ({ providerId, endpointId, candidateId: get(single).candidateConfiguration?.id,
      expectedRevision: get(single).configurationRevision || 0, confirmed: true });
    await assert.rejects(command('channelCandidateApply', ruleTarget()), /尚未测试/);
    await command('channelCandidateTest', { ...ruleTarget(), associationIds, scenarios: { [association.id]: 'success' } });
    await command('channelCandidateApply', ruleTarget());
    assert.equal(get(single).requestRules.parameters.operations[0].value, 0.2);
    assert.equal(get(single).requestRules.statusCodes[429], 503);
    assert.equal(get(single).networkSettings.http2Streams, 3);
    assert.equal(get(single).timeoutSeconds, 90);
    assert.equal(get(single).status, '停用');
    assert.notEqual(directoryDiscoverySignature(provider(), get(single)), savedDiscovery.signature);
    await command('channelCandidateRollback', { ...ruleTarget(), targetVersion: 0, allAssociations: true });
    assert.equal(get(single).candidateConfiguration.config.requestRules, null);
    assert.equal(get(single).candidateConfiguration.config.networkSettings, null);
    assert.equal(get(single).requestRules.statusCodes[429], 503);
    await command('channelCandidateDiscard', ruleTarget());
    await command('channelCapacitySave', { providerId, endpointId, associationId: association.id, expectedCapacityRevision: 0, limits: { rpm: 12 } });
    await command('channelProcurementPublish', { providerId, endpointId, associationId: association.id, expectedPriceRevision: 0,
      scenarios: [{ name: '输入 Token', listPrice: '1', unit: '百万 Token', currency: 'CNY' }], confirmed: true });
    const [copyKey] = (await providerApiKeysDraft(['copy-' + randomBytes(12).toString('hex')])).apiKeys;
    const copy = row('复制验收', [copyKey]);
    const copyData = () => ({ ...common, rows: [copy], models: [{ modelId: model.modelId, upstreamModelId: 'glm-5.3' }],
      copyFrom: { endpointId, expectedUpdatedAt: get(single).updatedAt, expectedProviderUpdatedAt: provider().updatedAt, rules: true, commercial: true } });
    await assert.rejects(command('channelDirectoryCreate', { ...copyData(), models: [{ modelId: 'foreign', upstreamModelId: 'foreign' }] }), /已登记/);
    assert.equal(get(copy), undefined);
    await command('channelDirectoryCreate', copyData());
    assert.equal(get(copy).status, '草稿');
    assert.equal(get(copy).connectionTest, null);
    assert.equal(get(copy).requestRules.statusCodes[429], 503);
    assert(!connectionKeys(get(copy), provider()).some(key => key.id === connectionKeys(get(single), provider())[0].id));
    const copied = supplierChannelAssociations(state, provider(), get(copy).id)[0];
    assert.equal(copied.capacityLimits.rpm, 12);
    assert.equal(copied.procurementVersions[0].status, '草稿');
    assert.notEqual(copied.id, association.id);
    assert.equal(copied.enabled, false);
    const custom = row('高级自定义验收', [copyKey]);
    await command('channelDirectoryCreate', { ...common, interfaceType: 'custom', protocol: '其他', baseUrl: 'https://example.invalid/task', rows: [custom] });
    const adapter = {
      routes: [{ task: 'video', match: 'demo-*', method: 'POST', path: '/jobs', conversion: 'task', idPath: '$.id', statusPath: '/jobs/{id}', auth: 'connection' }],
      models: { method: 'GET', path: '/models', listPath: '$.data', idPath: '$.id', completePath: '$.complete' },
      balance: { method: 'GET', path: '/balance', amountPath: '$.remaining', unitPath: '$.currency', usedPath: '$.used' },
    };
    const endpointTarget = { endpointId: get(custom).id, providerId, expectedRevision: 0 };
    await assert.rejects(command('channelCandidateSave', { ...endpointTarget, config: { customAdapter: { ...adapter, routes: [
      { ...adapter.routes[0], auth: 'credential', credentialId: 'other-provider-key' },
    ] } } }), /独立凭证.*不属于/);
    const availableKey = provider().apiKeys.find(key => key.status !== 'disabled' && !key.revokedAt);
    adapter.routes[0] = { ...adapter.routes[0], auth: 'credential', credentialId: availableKey.id };
    await command('channelCandidateSave', { ...endpointTarget, config: { customAdapter: adapter } });
    await command('supplierChannelEdit', { ...endpointTarget, candidateId: get(custom).candidateConfiguration.id,
      expectedUpdatedAt: get(custom).updatedAt, expectedProviderUpdatedAt: provider().updatedAt,
      confirmed: true, unlinked: true, note: '与接口配置一同保存的简介' });
    assert.equal(get(custom).directoryNote, '与接口配置一同保存的简介');
    const mock = async (path, data) => {
      const operationId = crypto.randomUUID();
      return (await request('/simulation' + path, { ...data, operationId }, operationId)).result.result;
    };
    const endpoint = get(custom), key = connectionKeys(endpoint, provider())[0], signature = connectionFingerprint(endpoint);
    const serverChannel = await mock('/channels', { providerId, name: '自定义模拟渠道', clientChannelId: endpoint.id, clientSignature: signature,
      interfaceType: endpoint.interfaceType, baseUrl: endpoint.baseUrl, customAdapter: endpoint.customAdapter,
      credential: { id: key.id, version: key.fingerprint }, authMode: 'key' });
    const requestRoute = await mock('/tests', { channelId: serverChannel.id, confirmExpensive: true,
      models: [{ id: 'local-video-qa', upstreamModelId: 'demo-video', type: 'video' }] });
    assert.deepEqual(requestRoute.items[0].request, { method: 'POST', url: 'https://example.invalid/jobs', auth: 'credential', conversion: 'task' });
    const found = await mock('/discover', { channelId: serverChannel.id });
    assert.equal(found.complete, true);
    assert(found.models.length > 0);
    const balance = await mock('/balance', { channelId: serverChannel.id });
    await load();
    const balanceRow = { endpointId: endpoint.id, providerId, signature };
    const saveBalance = result => command('channelDirectoryBalance', { rows: [{ ...balanceRow, result }] });
    await saveBalance(balance);
    assert.equal(get(custom).directoryBalance.lastSuccess.amount, 125);
    await mock('/scenario', { scenario: 'timeout' });
    await assert.rejects(mock('/balance', { channelId: serverChannel.id }), /超时/);
    await mock('/scenario', { scenario: 'success' });
    await load();
    await saveBalance(null);
    assert.equal(get(custom).directoryBalance.status, '查询失败');
    assert.equal(get(custom).directoryBalance.lastSuccess.amount, 125);
    await command('channelDirectoryDiscoveryPolicy', { ...balanceRow, expectedUpdatedAt: get(custom).updatedAt,
      policy: { enabled: true, intervalMinutes: 5, ignored: ['demo-test-*'], whitelist: ['glm-5.3'] } });
    const discoveryTarget = { endpointId: endpoint.id, providerId, signature: directoryDiscoverySignature(provider(), get(custom)) };
    await recordDiscovery([{ ...discoveryTarget, result: { source: 'mock', complete: false, models: ['glm-5.3'] } }]);
    const applyDiscovery = models => command('channelDirectoryApplyDiscovery', { automatic: true, confirmed: true,
      targets: [{ endpointId: endpoint.id, providerId, taskId: get(custom).directoryDiscovery.taskId, modelIds: models }] });
    await assert.rejects(applyDiscovery(['glm-5.3']), /不完整/);
    await recordDiscovery([{ ...discoveryTarget, result: { source: 'mock', complete: true, models: ['glm-5.3', 'demo-test-skipped'] } }]);
    await assert.rejects(applyDiscovery(['demo-test-skipped']), /可应用范围/);
    await applyDiscovery(['glm-5.3']);
    const discovered = supplierChannelAssociations(state, provider(), endpoint.id);
    assert.equal(discovered[0].upstreamModelId, 'glm-5.3');
    assert.equal(discovered[0].enabled, false);
    assert.equal(get(custom).directoryDiscoveryApply.modelIds.length, 1);
    await assert.rejects(applyDiscovery(['glm-5.3']), /过期|不完整/);
    const scheduled = row('关闭页面后仍定期检测', [copyKey]);
    await command('channelDirectoryCreate', { ...common, rows: [scheduled] });
    const syncPolicy = (endpoint, whitelist) => command('channelDirectoryDiscoveryPolicy', {
      providerId: endpoint.providerId, endpointId: endpoint.id, expectedUpdatedAt: endpoint.updatedAt,
      policy: { enabled: true, intervalMinutes: 5, ignored: ['bge-*'], whitelist },
    });
    const scheduledEndpoint = get(scheduled);
    const scheduledKey = connectionKeys(scheduledEndpoint, provider())[0];
    await mock('/channels', { providerId, name: '定期检测模拟上游列表', clientChannelId: scheduledEndpoint.id,
      clientSignature: connectionFingerprint(scheduledEndpoint), interfaceType: 'openai', baseUrl: scheduledEndpoint.baseUrl,
      credential: { id: scheduledKey.id, version: scheduledKey.fingerprint }, authMode: 'key',
      mockModels: ['deepseek-v4-pro', 'glm-5.3', 'bge-m3'] });
    await load();
    await syncPolicy(get(scheduled), ['deepseek-v4-pro', 'glm-5.3']);
    assert.equal(get(scheduled).directoryDiscoveryPolicy.ownerId, 'admin-001');
    const liveVersion = state.serviceRoutes.map(row => [row.id, row.activeVersion]);
    const ticks = await runLocalChannelDiscovery(local.db, {});
    assert(ticks.some(row => row.endpointId === get(scheduled).id && row.complete));
    await load();
    assert.equal(get(scheduled).directoryDiscovery.result.complete, true);
    assert.deepEqual(get(scheduled).directoryDiscoveryApply.modelIds, ['glm-5.3']);
    const autoRows = supplierChannelAssociations(state, provider(), get(scheduled).id);
    assert.deepEqual(autoRows.map(row => [row.upstreamModelId, row.enabled]), [['glm-5.3', false]]);
    assert.deepEqual(state.serviceRoutes.map(row => [row.id, row.activeVersion]), liveVersion);
    assert(state.audits.some(row => row.objectId === get(scheduled).id && row.executionSource === '本地定期检测'));
    assert(!(await runLocalChannelDiscovery(local.db, {})).some(row => row.endpointId === get(scheduled).id));
    const plugin = row('插件验收', [copyKey]);
    await command('channelDirectoryCreate', { ...common, interfaceType: 'custom', protocol: '其他', baseUrl: 'https://example.invalid/plugin', rows: [plugin] });
    const pluginTarget = { providerId, endpointId: get(plugin).id, expectedRevision: 0 };
    await command('channelCandidateSave', { ...pluginTarget, config: { networkSettings: { runtimeKind: 'plugin' } } });
    await command('channelCandidateApply', { ...pluginTarget, candidateId: get(plugin).candidateConfiguration.id, confirmed: true, unlinked: true });
    const specialty = (action, extra = {}) => command('channelDirectorySpecialty', { providerId, endpointId: get(plugin).id,
      kind: 'plugin', expectedUpdatedAt: get(plugin).updatedAt, confirmed: true, action, ...extra });
    await specialty('start');
    const authorization = get(plugin).directorySpecialties.plugin.authorization;
    await assert.rejects(specialty('complete', { authorizationId: 'other' }), /已变化或过期/);
    await specialty('complete', { authorizationId: authorization.id });
    assert.equal(get(plugin).directorySpecialties.plugin.quota.remaining, 65);
    await specialty('recover');
    assert.equal(get(plugin).directorySpecialties.plugin.quota.recoveryCredits, 1);
    await assert.rejects(specialty('recover'), /没有可用/);
    const draftAdapter = row('Azure 待适配验收', []);
    await command('channelDirectoryCreate', { providerId, protocol: '其他', baseUrl: 'https://example.invalid', authMode: 'pending',
      timeoutSeconds: 60, rows: [draftAdapter], adapterDraft: { kind: 'azure', values: { deployment: 'review-instance' } } });
    assert.equal(get(draftAdapter).adapterDraft.label, 'Azure OpenAI');
    assert.deepEqual(connectionKeys(get(draftAdapter), provider(), true), []);
    await assert.rejects(command('provider', { operation: 'supplierChannelTest', objectId: providerId, values: { endpointId: get(draftAdapter).id } }), /待适配连接/);
    await command('provider', { operation: 'create', values: { name: '自建状态验收', code: 'local-specialty-qa', sourceType: 'selfHosted' } });
    const selfHosted = state.providers.find(row => row.code === 'local-specialty-qa');
    const localChannel = row('推理实例验收', []);
    await command('channelDirectoryCreate', { ...common, providerId: selfHosted.id, authMode: 'none', rows: [localChannel] });
    const runtime = () => get(localChannel);
    const setRuntime = async runtimeKind => {
      const context = { providerId: selfHosted.id, endpointId: runtime().id, expectedRevision: runtime().configurationRevision || 0 };
      await command('channelCandidateSave', { ...context, config: { networkSettings: { runtimeKind } } });
      await command('channelCandidateApply', { ...context, candidateId: runtime().candidateConfiguration.id, confirmed: true, unlinked: true });
    };
    const inspectRuntime = (action, model) => command('channelDirectorySpecialty', { kind: runtime().networkSettings.runtimeKind,
      providerId: selfHosted.id, endpointId: runtime().id, expectedUpdatedAt: runtime().updatedAt, confirmed: true, action, model });
    await setRuntime('ollama');
    await inspectRuntime('pull', 'example-review:v1');
    const pulling = runtime().directorySpecialties.ollama;
    assert.equal(pulling.models.find(row => row.id === 'example-review:v1').status, '正在拉取');
    assert.equal(ollamaCurrentRows(pulling, Date.now() + 6000).find(row => row.id === 'example-review:v1').status, '已安装');
    await inspectRuntime('cancel', 'example-review:v1');
    assert(!runtime().directorySpecialties.ollama.models.some(row => row.id === 'example-review:v1'));
    await inspectRuntime('remove', 'llama3.1:8b');
    assert(!runtime().directorySpecialties.ollama.models.some(row => row.id === 'llama3.1:8b'));
    await command('channelQuickCreate', { providerId: selfHosted.id, values: {
      endpointId: runtime().id, models: [{ libraryId: 'model-glm53', upstreamModelId: 'before-swap', scenarios: [] }],
    } });
    const ownProvider = () => state.providers.find(row => row.id === selfHosted.id);
    const currentMapping = () => supplierChannelAssociations(state, ownProvider(), runtime().id)[0];
    const originalMapping = currentMapping();
    const replaceModel = model => command('channelDirectorySpecialty', { providerId: selfHosted.id, endpointId: runtime().id,
      action: 'replaceModel', model, associationId: originalMapping.id, expectedUpdatedAt: runtime().updatedAt, confirmed: true });
    await assert.rejects(replaceModel('not-installed'), /已安装模型/);
    await replaceModel('llama3.2:3b');
    assert.equal(currentMapping().id, originalMapping.id);
    assert.equal(currentMapping().modelId, originalMapping.modelId);
    assert.equal(currentMapping().upstreamModelId, 'llama3.2:3b');
    assert.equal(currentMapping().enabled, false);
    await assert.rejects(inspectRuntime('remove', 'llama3.2:3b'), /仍有 MoMA 模型渠道引用/);
    await command('providerRemovalCommit', { target: { providerId: selfHosted.id, endpointId: runtime().id, associationId: originalMapping.id, keepEndpoint: true },
      confirmed: true, expectedSignature: providerRemovalPlan(state, { providerId: selfHosted.id, endpointId: runtime().id, associationId: originalMapping.id, keepEndpoint: true }).signature });
    await setRuntime('vllm');
    await inspectRuntime('refresh');
    assert.equal(runtime().directorySpecialties.vllm.status, '模拟在线');
    const service = routingServices(state).find(row => row.id === 'standard:mock-service-deepseek-v4-flash-0731');
    const getRoute = () => serviceRoute(state, service.id);
    const liveRoute = structuredClone(getRoute());
    const liveConfig = liveRoute.versions.find(row => row.version === liveRoute.activeVersion).config;
    const [routeFirst, routeSecond] = liveConfig.channels;
    const bySupply = new Map(routingChannels(state, service).map(row => [row.id, row.endpointId]));
    const getMember = id => state.endpoints.find(row => row.id === bySupply.get(id));
    const groupName = '移组验收';
    await operate('tag', [target(getMember(routeFirst.supplyId)), target(getMember(routeSecond.supplyId))], { tag: groupName });
    await command('serviceRouteDraft', { serviceId: service.id, expectedVersion: liveRoute.activeVersion, config: {
      ...liveConfig, groups: [...liveConfig.groups, { id: 'P2', name: '验收备用组', strategy: 'weighted' }],
      channels: liveConfig.channels.map(row => row.supplyId === routeSecond.supplyId ? { ...row, groupId: 'P2' } : row),
    } });
    const moveTagRoute = (expectedUpdatedAt, endpointId = getMember(routeFirst.supplyId).id) => command('channelDirectoryTagEdit', {
      tag: groupName, memberIds: [getMember(routeFirst.supplyId).id, getMember(routeSecond.supplyId).id].sort(),
      mode: 'route', serviceId: service.id, groupId: 'P2', confirmed: true,
      targets: [{ endpointId, expectedUpdatedAt }],
      routeSignature: JSON.stringify([getRoute().activeVersion, getRoute().draftUpdatedAt, getRoute().draft]),
    });
    await assert.rejects(moveTagRoute('changed'), /归属已变化/);
    await assert.rejects(moveTagRoute(runtime().updatedAt, runtime().id), /归属已变化/);
    await moveTagRoute(getMember(routeFirst.supplyId).updatedAt);
    assert.equal(getRoute().draft.channels.find(row => row.supplyId === routeFirst.supplyId).groupId, 'P2');
    assert.deepEqual(getRoute().versions, liveRoute.versions);
    assert.equal(getRoute().activeVersion, liveRoute.activeVersion);

    const mixed = ['provider-moma', 'provider-zhipu-direct'].map((ownerId, index) => ({ ...row('跨服务商差异 ' + index, [copyKey]), ownerId }));
    for (const item of mixed) await command('channelDirectoryCreate', { ...common, providerId: item.ownerId, rows: [item] });
    const mixedTargets = mixed.map(item => { const owner = state.providers.find(row => row.id === item.ownerId); return {
      endpointId: get(item).id, providerId: item.ownerId, signature: directoryDiscoverySignature(owner, get(item)),
      result: { complete: true, source: 'mock', models: ['glm-5.3'] },
    }; });
    await recordDiscovery(mixedTargets);
    const planMixed = mixed.map(item => ({ endpointId: get(item).id, providerId: item.ownerId, taskId: get(item).directoryDiscovery.taskId, modelIds: ['glm-5.3'] }));
    const applyMixed = targets => command('channelDirectoryApplyDiscovery', { targets, confirmed: true });
    await assert.rejects(applyMixed([planMixed[0], { ...planMixed[1], taskId: 'changed' }]), /过期或不完整/);
    assert(!get(mixed[0]).directoryDiscoveryApply);
    await applyMixed(planMixed);
    assert(mixed.every(item => get(item).directoryDiscoveryApply.modelIds[0] === 'glm-5.3'));
    const remove = async target => command('providerRemovalCommit', { target, confirmed: true,
      expectedSignature: providerRemovalPlan(state, target).signature });
    await remove({ providerId, endpointId, associationId: association.id, keepEndpoint: true });
    assert.equal(get(single).deletedAt ?? null, null);
    assert.deepEqual(supplierChannelAssociations(state, provider(), endpointId), []);
    await remove({ providerId, endpointId });
    assert(get(single)?.deletedAt || !get(single));
    const [manual, automatic] = batch.map(get);
    await operate('disable', [target(manual)]);
    assert.equal(directoryDisabledKind(get(batch[0])), 'manual');
    assert.equal(directoryDisabledKind(automatic), '');
    assert.equal(directoryDisabledKind({ ...automatic, status: '停用', activationChangedAt: new Date().toISOString() }), '');
    await local.db.prepare("UPDATE channels SET record_json=json_set(record_json,'$.status','停用','$.activationSource','automatic') WHERE id=?").bind(automatic.id).run();
    await load();
    const scope = (row, mode, includeAutomatic) => {
      const plan = directoryArchivePlan(state, row.providerId, row.id, { mode, includeAutomatic });
      return { ...plan.target, signature: plan.signature || '' };
    };
    const archive = (mode, targets, includeAutomatic = false) => command('channelDirectoryArchive',
      { mode, targets, includeAutomatic, confirmed: true });
    const disabled = scope(get(batch[0]), 'disabled', false);
    await assert.rejects(archive('disabled', [disabled, disabled]), /不重复/);
    await archive('disabled', [{ ...disabled, signature: 'stale' }, scope(automatic, 'disabled', true)]);
    const archived = () => state.audits.find(row => row.archiveResults)?.archiveResults;
    assert.deepEqual(archived().map(row => row.status), ['已跳过', '已跳过']);
    assert.match(archived()[1].reason, /停用状态/);
    const inUse = state.endpoints.find(row => row.id === 'showcase-channel-moma-self');
    await archive('selected', [scope(inUse, 'selected', false), scope(get(batch[0]), 'selected', false)]);
    assert.deepEqual(archived().map(row => row.status), ['已跳过', '已归档']);
    assert.match(archived()[0].reason, /引用|启用|下架/);
    await archive('disabled', [scope(get(batch[1]), 'disabled', true)], true);
    assert.deepEqual(archived().map(row => row.status), ['已归档']);
    const rows = await local.db.prepare('SELECT id,deleted_at FROM channels WHERE id IN (?,?)').bind(manual.id, automatic.id).all();
    assert(rows.results.length === 2 && rows.results.every(row => row.deleted_at > 0));
    assert(original.every(id => state.endpoints.some(row => row.id === id && !row.deletedAt)));

    const scan = async () => (await request('/channels/consistency')).result;
    const clean = await scan();
    const savedChannel = await local.db.prepare("SELECT * FROM channel_models WHERE removed_at IS NULL AND json_extract(mapping_json,'$.sourceAssociationId') IS NOT NULL AND enabled=1 LIMIT 1").first();
    const savedMember = await local.db.prepare("SELECT rm.* FROM route_members rm JOIN offers o ON o.active_route_id=rm.route_version_id LIMIT 1").first();
    const route = () => local.db.prepare('SELECT * FROM route_members WHERE route_version_id=? AND channel_model_id=?')
      .bind(savedMember.route_version_id, savedMember.channel_model_id);
    const channel = () => local.db.prepare('SELECT * FROM channel_models WHERE id=?').bind(savedChannel.id);
    await local.db.prepare('UPDATE channel_models SET enabled=0 WHERE id=?').bind(savedChannel.id).run();
    await local.db.prepare('DELETE FROM route_members WHERE route_version_id=? AND channel_model_id=?')
      .bind(savedMember.route_version_id, savedMember.channel_model_id).run();
    const preview = await scan();
    const issueIds = ['channel/' + savedChannel.id, 'route/' + savedMember.route_version_id + '/' + savedMember.channel_model_id];
    assert(preview.issues.some(row => row.id === issueIds[0] && row.indexed.enabled === 0 && row.source.enabled === 1));
    assert(preview.issues.some(row => row.id === issueIds[1] && row.indexed === null));
    assert.equal((await channel().first()).enabled, 0);
    assert.equal(await route().first(), null);
    const repair = (signature, ids, confirmed = true) => command('channelDirectoryRepair', { signature, issueIds: ids, confirmed });
    await assert.rejects(repair(clean.signature, issueIds), /索引或源配置已变化/);
    await assert.rejects(repair(preview.signature, issueIds, false), /确认/);
    await assert.rejects(repair(preview.signature, [issueIds[0], 'route/unknown']), /不存在/);
    await repair(preview.signature, issueIds);
    assert.deepEqual(await channel().first(), savedChannel);
    assert.deepEqual(await route().first(), savedMember);
    assert.deepEqual((await scan()).issues, clean.issues);
    assert.deepEqual(state.audits.find(row => row.indexRepairResults).indexRepairResults.map(row => row.status), ['已修复', '已修复']);
  } finally { await local.runtime.dispose(); }
});
