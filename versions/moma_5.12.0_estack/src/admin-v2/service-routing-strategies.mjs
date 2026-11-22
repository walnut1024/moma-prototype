export const DEFAULT_ROUTING_STRATEGY = 'simple-shuffle';

export const ROUTING_STRATEGIES = {
  'simple-shuffle': { label: '加权随机', description: '同优先级渠道按权重随机选择。' },
  'least-busy': { label: '最少并发', description: '优先选择正在处理请求最少的渠道。' },
  'latency-based-routing': { label: '低延迟优先', description: '优先选择近期响应较快的渠道，使用网关默认采样参数。' },
  'usage-based-routing-v2': { label: '按用量分流', description: '在已配置的限额内，优先选择本分钟已用 Token 较少的渠道。' },
  'cost-based-routing': { label: '成本优先', description: '优先选择符合限额且调用成本较低的渠道。' },
};
