export const CLUSTER_PROVIDERS = ['Docker', 'Kubernetes', 'DigitalOcean', 'SHUIHUA FUTURE'];
export const isCloudCluster = provider => provider === 'DigitalOcean' || provider === 'SHUIHUA FUTURE';

export function clusterRemovalIssue(state, row) {
  if (!row) return '集群不存在，请刷新列表';
  if (row.nodes !== 0 || row.allocatedGpu !== 0 || row.nodePools?.some(pool => pool.replicas > 0)) return `${row.name} 仍有节点或 GPU 分配记录`;
  if (state.deployments.some(item => !item.retiredAt && item.clusterId === row.id)) return `${row.name} 仍有关联模型部署`;
}
