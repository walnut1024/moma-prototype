import mockConfig from './mock/catalogues.json' with { type: 'json' };
// 参数规模来自各模型公开型号/模型卡；价格仅用于原型排序演示，不代表平台报价。
// price: 示例场景下每百万输入 Token + 每百万输出 Token 的合计元数。
export const routeModels = mockConfig["route-models.mjs"]["routeModels"];

export function orderedRouteModels(strategy) {
  const score = strategy === '成本优先'
    ? model => model.price
    : strategy === '平衡模式'
      ? model => -model.size / model.price
      : model => -model.size;
  return [...routeModels].sort((a, b) => score(a) - score(b) || a.name.localeCompare(b.name));
}
