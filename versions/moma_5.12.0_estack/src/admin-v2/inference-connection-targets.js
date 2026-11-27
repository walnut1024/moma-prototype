import { channelProtocolPaths, prepareListedChannelInterface } from './channel-connection-directory.js';
import { connectionActive } from './connection-state.js';
import { deployableModels, deploymentCanServe, deploymentInstances } from './deployments.js';
import { modelMaterial } from './model-library.js';

export const BUILTIN_INFERENCE_PROVIDER_ID = 'provider-builtin-inference';
export const BUILTIN_INFERENCE_PROVIDER_NAME = '内置模型推理';

const interfaceForModel = { text: 'openai', multimodal: 'openai', embedding: 'openai-embeddings' };

export function inferenceProviderAvailable(provider) {
  return !provider || provider.status === '已启用' && !provider.deletedAt && !provider.profileRemovedAt && provider.sourceType === 'selfHosted';
}

export function inferenceConnectionTargets(state) {
  if (!inferenceProviderAvailable(state.providers.find(row => row.id === BUILTIN_INFERENCE_PROVIDER_ID))) return [];
  const models = deployableModels(state);
  return (state.deployments || []).flatMap(deployment => {
    if (deployment.retiredAt || deployment.enableInternalRoute === false || !deploymentCanServe(deployment)) return [];
    const endpoint = state.endpoints.find(row => row.id === deployment.endpointId && row.status === '运行中' &&
      !row.deletedAt && !row.frozen && row.modelIds?.includes(deployment.modelId));
    const model = models.find(row => row.id === deployment.modelId);
    const material = model && modelMaterial(state, model.id);
    if (!endpoint || !material || !model.modelId || /\s|\p{Cc}/u.test(model.modelId)) return [];
    const interfaceType = endpoint.modelProtocol || endpoint.interfaceType ||
      (endpoint.protocol === 'OpenAI' && interfaceForModel[model.type]);
    const endpointPath = endpoint.endpointPath || channelProtocolPaths({ interfaceType })[0];
    if (!endpointPath) return [];
    let config;
    try {
      config = prepareListedChannelInterface({ interfaceType, endpointPath, baseUrl: endpoint.baseUrl, allowHttp: true });
    } catch {
      return [];
    }
    return deploymentInstances([deployment]).filter(instance => instance.state === 'running' &&
      (!deployment.roles || instance.role === 'router')).map(instance => ({
        id: instance.id, name: instance.name, deploymentName: deployment.name, modelName: model.name,
        interfaceType, endpointPath: config.endpointPath, baseUrl: config.baseUrl, libraryId: material.id, upstreamModelId: model.modelId,
        source: { deploymentId: deployment.id, endpointId: endpoint.id, instanceId: instance.id },
      }));
  });
}

export function inferenceSourceAvailable(state, source) {
  const deployment = (state.deployments || []).find(row => row.id === source.deploymentId &&
    row.endpointId === source.endpointId && !row.retiredAt && row.enableInternalRoute !== false);
  if (!deployment || !deploymentCanServe({ ...deployment, status: '运行中' })) return false;
  return state.endpoints.some(row => row.id === source.endpointId && row.status === '运行中' && !row.deletedAt && !row.frozen);
}

export function invalidateInferenceConnections(before, after) {
  return after.endpoints.map(endpoint => {
    const source = endpoint.inferenceSource;
    if (!source || endpoint.deletedAt || inferenceSourceAvailable(after, source) ||
      (!connectionActive(endpoint) && !inferenceSourceAvailable(before, source))) return endpoint;
    return { ...endpoint, status: '停用', connectionTest: null, connectionQualification: null,
      activationSource: 'automatic', activationChangedAt: after.updatedAt, activationReason: '推理部署的服务端点不可用', updatedAt: after.updatedAt };
  });
}
