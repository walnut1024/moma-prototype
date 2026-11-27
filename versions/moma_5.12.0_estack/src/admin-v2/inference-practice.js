import { initialApplicationData } from '../mock/application-data.js';
import { deploymentGpu } from './deployments.js';
import { createInferenceDemoState } from './inference-demo-data.js';
import { readInferenceDemoInfrastructure } from './inference-demo-infrastructure.js';
import { canMutate, commitAdminState } from './state-transaction.js';

const clusterAction = action => action.collection === 'clusters' && ['add', 'update', 'remove'].includes(action.type);
const resourcePages = new Set(['ops-nodes', 'ops-gpus']);

export function createInferencePractice(role, now = Date.now()) {
  const fixtures = createInferenceDemoState(now);
  const cudaVersions = { SGLang: '0.5.9', vLLM: '0.21.0' };
  // The interactive sample clusters use NVIDIA GPUs.
  const deployments = fixtures.deployments.map(deployment => cudaVersions[deployment.backend]
    ? { ...deployment, backendVersion: cudaVersions[deployment.backend] }
    : deployment);
  const clusters = fixtures.clusters.map(cluster => ({
    ...cluster,
    allocatedGpu: deployments
      .filter(deployment => deployment.clusterId === cluster.id)
      .reduce((total, deployment) => total + deploymentGpu(deployment), 0),
  }));
  return {
    state: {
      ...initialApplicationData(now),
      ...fixtures,
      clusters,
      deployments,
      currentRole: role,
      inferenceDemo: true,
      providers: [...fixtures.providers, { id: 'provider-self', name: '内置模型推理', status: '已启用' }],
    },
    infrastructure: structuredClone(readInferenceDemoInfrastructure()),
  };
}

export function applyInferencePracticeAction(practice, action) {
  const allowedClusterAction = action.type === 'batch'
    ? action.changes?.length > 0 && action.changes.every(clusterAction)
    : clusterAction(action);
  if (action.type !== 'deploymentOperation' && !allowedClusterAction) throw Error('此操作不在可操作演示的范围内。');
  return { ...practice, state: commitAdminState(practice.state, action) };
}

export function changeInferencePracticeInfrastructure(practice, pageId, change) {
  if (!resourcePages.has(pageId) || !canMutate(practice.state.currentRole, { type: 'update', collection: 'clusters' })) {
    throw Error('当前角色不能修改演示资源。');
  }
  const records = structuredClone(practice.infrastructure);
  const result = change(records[pageId], records);
  const updates = Array.isArray(result) ? { [pageId]: result } : { ...result.related, [pageId]: result.rows };
  if (Object.entries(updates).some(([key, rows]) => !resourcePages.has(key) || !Array.isArray(rows) ||
      rows.some(row => typeof row?.id !== 'string') || new Set(rows.map(row => row.id)).size !== rows.length)) {
    throw Error('演示资源更新范围或记录无效。');
  }
  return { ...practice, infrastructure: { ...records, ...updates } };
}
