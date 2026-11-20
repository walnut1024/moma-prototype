import { deploymentLicense } from '../src/deployment-license.mjs';
import { effectiveInstalledLicense, readInstalledLicense } from './deployment-license.js';
import { createMockEngine } from '../src/admin-v2/mock-onboarding-core.js';
import { connectionCredentialsReady, connectionFingerprint, connectionKeys } from '../src/admin-v2/connection-state.js';
import { channelDiscoveryPreview, directoryDiscoveryReceipt, directoryDiscoverySignature, ignoredDiscoveryModel } from '../src/admin-v2/channel-discovery-diff.js';
import { loadModelWorkspace } from './model-repository.js';
import { modelCommand } from './model-commands.js';

function discover(state, provider, endpoint) {
  const engine = createMockEngine({ initialState: state.cloudMockState, localState: state });
  engine.setMockRuntimeState(state);
  const key = connectionKeys(endpoint, provider)[0];
  const saved = state.cloudMockState?.channels?.find(row => row.clientChannelId === endpoint.id && row.providerId === provider.id &&
    row.clientSignature === connectionFingerprint(endpoint) && !row.disabled && !row.supersededBy);
  const channel = saved || engine.invoke('/channels', { method: 'POST', body: {
    operationId: crypto.randomUUID(), providerId: provider.id, name: '本地定期检测 ' + crypto.randomUUID(),
    interfaceType: endpoint.interfaceType, baseUrl: endpoint.baseUrl, taskUrls: endpoint.taskUrls,
    customAdapter: endpoint.customAdapter, authMode: endpoint.authMode === 'none' ? 'none' : 'key',
    credentialId: key?.id || endpoint.credentialRef,
    ...(key ? { credential: { id: key.id, version: key.version || key.fingerprint } } : {}),
  } });
  return directoryDiscoveryReceipt(engine.invoke('/discover', { method: 'POST', body: { channelId: channel.id } }));
}

export async function runLocalChannelDiscovery(db, env, now = Date.now()) {
  const installed = await readInstalledLicense(db);
  const license = installed ? effectiveInstalledLicense(installed) : deploymentLicense(env);
  const due = await db.prepare(`SELECT c.id AS endpoint_id, a.id, a.role, s.id AS session_id
    FROM channels c JOIN admin_accounts a ON a.id=json_extract(c.record_json,'$.directoryDiscoveryPolicy.ownerId')
    JOIN admin_sessions s ON s.id=(SELECT session.id FROM admin_sessions session
      WHERE session.actor_id=a.id AND session.revoked_at IS NULL AND session.expires_at>?
      ORDER BY session.expires_at DESC LIMIT 1)
    WHERE c.deleted_at IS NULL AND a.enabled=1 AND a.role IN ('平台管理员','运营人员')
      AND json_extract(c.record_json,'$.directoryDiscoveryPolicy.enabled')=1
      AND COALESCE(unixepoch(json_extract(c.record_json,'$.directoryDiscovery.discoveredAt')),0)*1000
        + json_extract(c.record_json,'$.directoryDiscoveryPolicy.intervalMinutes')*60000 <= ?
    ORDER BY json_extract(c.record_json,'$.directoryDiscovery.discoveredAt'), c.id LIMIT 10`).bind(now, now).all();
  const receipts = [];
  for (const { endpoint_id: endpointId, ...actor } of due.results) {
    let state = await loadModelWorkspace(db, actor, { command: true });
    const endpoint = state.endpoints.find(row => row.id === endpointId && !row.deletedAt);
    const policy = endpoint?.directoryDiscoveryPolicy;
    const provider = state.providers.find(row => row.id === endpoint?.providerId && !row.deletedAt);
    if (!policy?.enabled || policy.ownerId !== actor.id || !provider || Date.parse(endpoint.directoryDiscovery?.discoveredAt) + policy.intervalMinutes * 60000 > now) continue;
    const command = (operation, data) => {
      const operationId = crypto.randomUUID();
      return modelCommand(db, actor, { operationId, expectedRevision: state.revision,
        action: { type: 'modelOperations', operation, data } }, operationId, license, { executionSource: '本地定期检测' });
    };
    const row = { endpointId, providerId: provider.id, signature: directoryDiscoverySignature(provider, endpoint) };
    if (provider.status !== '已启用' || endpoint.frozen || !endpoint.interfaceType ||
      endpoint.interfaceType === 'custom' && !endpoint.customAdapter?.models || !connectionCredentialsReady(endpoint, provider)) {
      row.reason = '连接配置暂不支持检测';
    } else {
      try { row.result = discover(state, provider, endpoint); }
      catch { row.reason = '上游模型列表检测失败'; }
    }
    const taskId = crypto.randomUUID();
    try {
      await command('channelDiscoveryRecord', { taskId, rows: [row] });
      receipts.push({ endpointId, taskId, complete: row.result?.complete === true });
      if (!row.result?.complete || !policy.whitelist.length || endpoint.candidateConfiguration) continue;
      state = await loadModelWorkspace(db, actor, { command: true });
      const current = state.endpoints.find(item => item.id === endpointId);
      const owner = state.providers.find(item => item.id === provider.id);
      if (!current?.directoryDiscoveryPolicy?.enabled || current.directoryDiscoveryPolicy.ownerId !== actor.id ||
        current.candidateConfiguration || current.directoryDiscovery?.taskId !== taskId || !owner) continue;
      const modelIds = channelDiscoveryPreview(state, owner, endpointId, row.result).rows
        .filter(item => item.libraryId && item.candidates.length === 1 && !item.existingAssociationId &&
          current.directoryDiscoveryPolicy.whitelist.includes(item.upstreamModelId) && !ignoredDiscoveryModel(current.directoryDiscoveryPolicy, item.upstreamModelId))
        .slice(0, 25).map(item => item.upstreamModelId);
      if (modelIds.length) await command('channelDirectoryApplyDiscovery', {
        automatic: true, confirmed: true, targets: [{ endpointId, providerId: provider.id, taskId, modelIds }],
      });
    } catch (error) {
      if (error.status !== 409 && error.status !== 401) throw error;
    }
  }
  return receipts;
}
