// Isolated November 2026 reference samples. These rows are never added to business records.
const liveCustomers = [
  ['4342fc', '东吴服务产业*****）有限公司', '1993.11'],
  ['8a3889', '中移苏研-质量管*****模型组-陈…', '1715.60'],
  ['7b7be8', '中移*****公司', '362.96'],
  ['616855', '中移物联网有*****平台产品部', '341.15'],
  ['c130b82', '东软集团股*****（重客）', '324.10'],
  ['be1c91', '中国移动通*****销售分公司', '257.73'],
  ['e5993c8b', '北京基元*****限公司', '179.00'],
  ['5750e2', '中国移动通信集团*****司桂平分公司', '167.61'],
  ['704715', '京东科技*****限公司', '163.05'],
  ['c64921', '词元凌岳（*****有限公司', '124.98'],
];
const [, , central, iot, neusoft, sale, beijing, guiping, jingdong, ciyuan] = liveCustomers.map(row => row[1]);
const dongwu = liveCustomers[0][1];
const idb = 'deepseek-v4.1-flash-1017';
const glm = 'glm-5.3';
const flash = 'glm-5.3-flash';
const enterpriseCustomer = '政企租户';
const usageRanks = [
  [dongwu, '4139.43'], [iot, '392.75'], [central, '385.17'], [neusoft, '337.44'],
  [sale, '296.62'], [guiping, '285.42'], [jingdong, '274.03'], [beijing, '258.23'],
  ['广州极飞*****限公司', '180.82'], [ciyuan, '170.28'],
].map(([name, amount]) => [name, enterpriseCustomer, amount]);
const gains = [
  [dongwu, '政企', '模型广场', glm, '+863.92', '26.38%'],
  ['深圳天源迪科*****份有限公司', '政企', '模型广场', idb, '+52.24', '1015.52%'],
  ['横琴人*****公司', '广东', '模型广场', idb, '+34.22', '81.30%'],
  ['江西和壹*****司红谷滩', '江西', '模型广场', idb, '+29.68', '40.51%'],
  ['滕州市山东*****技术有限公司', '山东', '模型广场', idb, '+26.43', '89.28%'],
  ['广州极飞*****限公司', '广东', '模型广场', idb, '+23.72', '15.10%'],
  [iot, '政企', '模型广场', idb, '+22.17', '5.98%'],
  ['咪咕新空文化*****）有限公司', '江西', '模型广场', idb, '+20.86', '24.95%'],
  [jingdong, '山东', '模型广场', glm, '+20.50', '24.35%'],
  ['河南鲲鱼贸易*****山县分公司', '河北', '模型广场', glm, '+18.67', '25.86%'],
];
const drops = [
  [guiping, '政企', '模型广场', glm, '-518.82', '64.51%'],
  [sale, '政企', '模型广场', idb, '-124.87', '29.63%'],
  [central, '政企', '模型广场', 'cmiot/kitchen-video-detection-model', '-105.14', '21.44%'],
  ['江苏虎宝*****限公司', '江苏', '模型广场', glm, '-67.98', '66.40%'],
  [beijing, '江苏', '模型广场', idb, '-51.70', '16.68%'],
  ['深圳市昂捷*****份有限公司', '山东', '模型广场', idb, '-36.92', '85.83%'],
  ['中移（杭州）信息*****司（大模型业务）', '政企', '模型广场', idb, '-29.84', '30.59%'],
  [neusoft, '辽宁', 'Token Plan', idb, '-26.78', '7.35%'],
  ['江西泰晨信息*****司（庐山）', '江西', '模型广场', idb, '-22.89', '25.15%'],
  ['中国移动通信集*****公司-辽企慧', '政企', '模型广场', idb, '-16.93', '66.93%'],
];
const swings = rows => rows.map(([name, region, channel, model, amount, delta]) =>
  [name, region + ' · ' + enterpriseCustomer + ' · 通过' + channel + '调用 ' + model, amount, delta]);

const metrics = [
  ['日活跃租户总数', '3,554', '个'], ['日活跃租户数变化量', '1,282', '个'],
  ['周日均活跃租户数', '3,413', '个'], ['月日均活跃租户数', '3,037', '个'],
  ['夜间 Token 调用量', '2746.97', '亿 Token'], ['日间 Token 调用量', '1.15', '万亿 Token'],
  ['忙时 Token 调用量', '6829.72', '亿 Token'], ['闲时 Token 调用量', '7446.92', '亿 Token'],
];
const categories = [
  ['个人租户', 2053, '2,053', '57.8%', '#dceafe'],
  [enterpriseCustomer, 1494, '1,494', '42.0%', '#73a9ff'],
  ['其他', 7, '7', '0.2%', '#0874f8'],
];
const requestStates = [
  ['成功', 1443000, '144.3 万次', '99.07%', '#12b665'],
  ['429', 243, '243 次', '0.02%', '#ffbd3d'],
  ['400', 7905, '7,905 次', '0.54%', '#efb329'],
  ['5xx', 326, '326 次', '0.02%', '#fc5439'],
  ['401', 0, '0 次', '0.00%', '#e9a050'],
  ['0', 4662, '4,662 次', '0.32%', '#7f899a'],
  ['其他', 472, '472 次', '0.03%', '#aab3c3'],
];
const tokenParts = [
  ['输入', 1842.99, '1842.99', '99.32%', '#0874f8'],
  ['输出', 12.62, '12.62', '0.68%', '#ff9f20'],
];
const clientMix = [
  ['未知', 64.81, '#ff64a4'], ['AsyncOpenAI/Python 2.45.0', 30.55, '#b572fa'],
  ['tokenrhythm-responses/1', 2.64, '#17b76b'], ['ReactorNetty/1.3.7', 2, '#ff9c22'],
  ['Python-urllib/3.12', 0, '#4392fa'],
];
const models = [
  [idb, '1,106,769', '76.68%', '1561.36', '84.14%', '1100.99', '2724.58', '6457.25', [32, 17, 12, 39]],
  [flash, '278,619', '19.30%', '244.35', '13.17%', '1661.92', '5072.21', '13163.58', [20, 17, 13, 50]],
  [glm, '58,038', '4.02%', '49.88', '2.69%', '2027.00', '6996.87', '17662.51', [31, 21, 14, 34]],
  ['未知', '7', '0.00%', '0', '0.00%', '0.00', '0.00', '0.00', [100]],
];
const detailRows = [
  ['17:18', idb, '93', '11,712,069', '0', '100.00%', '125354.91', '581.31', '1800.27', '1325.00'],
  ['17:18', glm, '5', '746,522', '0', '100.00%', '149237.00', '67.40', '1845.20', '1852.00'],
  ['17:18', flash, '8', '1,458,801', '0', '100.00%', '182123.25', '226.88', '6385.50', '5419.50'],
  ['17:17', idb, '129', '18,866,607', '0', '96.90%', '150037.17', '895.69', '1692.83', '1377.50'],
  ['17:17', flash, '38', '2,874,205', '0', '100.00%', '75425.74', '211.24', '5526.33', '3171.50'],
  ['17:16', idb, '125', '19,015,284', '0', '100.00%', '151385.77', '736.50', '1993.49', '1422.00'],
  ['17:16', glm, '4', '818,115', '0', '100.00%', '203650.00', '878.75', '1819.50', '1549.50'],
  ['17:16', flash, '27', '3,883,811', '0', '100.00%', '143440.22', '404.63', '5927.24', '5219.00'],
  ['17:15', idb, '126', '16,823,938', '0', '99.21%', '133574.97', '1016.54', '1974.54', '1379.50'],
  ['17:15', flash, '31', '3,392,608', '0', '100.00%', '109084.77', '354.19', '5497.30', '4842.00'],
];
const indicators = [
  'TPM', 'RPM', '请求数', '总 Token', '成功率', '平均输入 Token', '平均输出 Token',
  '平均 TTFT', 'P50 TTFT', 'P90 TTFT', 'P99 TTFT', '平均 TPOT', '平均 E2E', '缓存命中率',
];
const liveStates = [
  ['成功', '98.97%', '#13b95f', 98.97], ['0/网络错误', '0.23%', '#f6d444', .23],
  ['HTTP 400', '0.80%', '#f7ae26', .78], ['HTTP 429', '<0.01%', '#00c4e8', .005],
  ['HTTP 500', '<0.01%', '#3e9bf8', .005], ['HTTP 502', '<0.01%', '#a151f7', .005],
  ['HTTP 504', '<0.01%', '#eccf44', .005],
];
const growthRanks = swings(gains);
const declineRanks = swings(drops);
const liveUsageByTenant = new Map(liveCustomers.map(([, name, value]) => [name, value]));
const tenantNames = [...new Set([
  ...liveUsageByTenant.keys(),
  ...[...usageRanks, ...growthRanks, ...declineRanks].map(([name]) => name),
])];
export const demoTenants = tenantNames.map((name, index) => {
  const id = 'demo-' + (index + 1);
  return { id, name, displayId: name === beijing ? 'CIDC-A-e99586…22556' : id, liveTokens: liveUsageByTenant.get(name) };
});
export const demoCallUser = { id: 'demo-user-7', label: 'CIDC-U-e5993c8b…' };

export function lookupDemoTenants(field, input) {
  const keyword = input.trim().toLowerCase();
  if (!keyword) return [];
  if (field === 'tenantId') return demoTenants.filter(({ id, displayId }) => id === keyword || displayId.toLowerCase() === keyword);
  if (field === 'tenantName') return demoTenants.filter(({ name }) => name.toLowerCase().includes(keyword));
  if (field === 'userId' && [demoCallUser.id, demoCallUser.label.toLowerCase()].includes(keyword)) {
    return demoTenants.filter(({ name }) => name === beijing);
  }
  return [];
}

export {
  liveCustomers, usageRanks, growthRanks as gains, declineRanks as drops,
  metrics, categories, requestStates, tokenParts, clientMix, models, detailRows, indicators,
  liveStates, beijing, idb, glm, flash, enterpriseCustomer,
};

