// 参数规模来自各模型公开型号/模型卡；价格仅用于原型排序演示，不代表平台报价。
// price: 示例场景下每百万输入 Token + 每百万输出 Token 的合计元数。
export const routeModels = [
  { name: 'Kimi-K3', size: 2800, price: 18 },
  { name: 'DeepSeek-V4-Pro', size: 1600, price: 12 },
  { name: 'Kimi-K2-Instruct', size: 1000, price: 9 },
  { name: 'GLM-5', size: 744, price: 10 },
  { name: 'DeepSeek-V3.2', size: 671, price: 4.6 },
  { name: 'MiniMax-M3', size: 428, price: 8.8 },
  { name: 'Qwen3.5-397B-A17B', size: 397, price: 8.4 },
  { name: 'GLM-4.5', size: 355, price: 6.8 },
  { name: 'Step-3', size: 321, price: 7.5 },
  { name: 'ERNIE-4.5-300B-A47B', size: 300, price: 6.2 },
  { name: 'Qwen3-235B-A22B', size: 235, price: 5.5 },
  { name: 'Qwen3.5-122B-A10B', size: 122, price: 7.2 },
  { name: 'GLM-4.5-Air', size: 106, price: 3.8 },
  { name: 'Qwen2.5-72B-Instruct', size: 72, price: 3.4 },
  { name: 'Qwen3.5-35B-A3B', size: 35, price: 3.6 },
  { name: 'Qwen3-32B', size: 32, price: 2.4 },
  { name: 'Qwen3.5-27B', size: 27, price: 5.4 },
  { name: 'Qwen3-14B', size: 14, price: 1.8 },
  { name: 'Qwen3-8B', size: 8, price: 1.2 },
  { name: 'Qwen3.5-4B', size: 4, price: 0.8 },
];

export function orderedRouteModels(strategy) {
  const score = strategy === '成本优先'
    ? model => model.price
    : strategy === '平衡模式'
      ? model => -model.size / model.price
      : model => -model.size;
  return [...routeModels].sort((a, b) => score(a) - score(b) || a.name.localeCompare(b.name));
}
