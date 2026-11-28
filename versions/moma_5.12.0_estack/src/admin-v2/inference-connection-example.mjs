const id = 'connection-demo-bge-m3';

export const inferenceConnectionExample = {
  id,
  name: 'BGE-M3 内置推理（模拟）',
  provider: { name: '内置模型推理' },
  endpoint: {
    id,
    channelSourceType: 'selfHosted',
    interfaceType: 'openai',
    modelProtocol: 'openai-embeddings',
    endpointPath: '/embeddings',
    baseUrl: 'https://inference.demo.invalid/deploy-bge-m3-nj/v1',
    authMode: 'none',
    directoryNote: '只读模拟连接，用于查看内置模型推理服务的连接和模型信息。',
  },
  credentials: [],
  status: '待验证',
  modelCount: 1,
  models: [{
    key: 'bge-m3',
    modelName: 'BGE-M3',
    master: { type: 'embedding' },
    association: { upstreamModelId: 'bge-m3' },
  }],
};
