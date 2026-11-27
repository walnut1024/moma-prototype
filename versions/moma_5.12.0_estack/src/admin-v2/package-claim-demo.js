import { dayOf } from './analytics.js';

const DAY = 24 * 60 * 60 * 1000;
const prices = [
  { model: 'DeepSeek V3.2', provider: '移动云', inputRate: 2, outputRate: 3 },
  { model: 'GLM-4.7', provider: '智谱 AI', inputRate: 2, outputRate: 8 },
  { model: 'Qwen3-Max', provider: '阿里云', inputRate: 2.5, outputRate: 10 },
];

const accounts = [
  { userId: 'demo-user-7018', accountName: '林若溪', accountType: 'individual', tenantId: 'demo-individual-7018' },
  { userId: 'demo-user-7088', accountName: '沈启明', accountType: 'individual', tenantId: 'demo-individual-7088' },
  { userId: 'demo-user-7146', accountName: '陈默', accountType: 'individual', tenantId: 'demo-individual-7146' },
  { userId: 'demo-user-7182', accountName: '周奕安', accountType: 'individual', tenantId: 'demo-individual-7182' },
  { userId: 'demo-user-7219', accountName: '星澜数据技术有限公司', accountType: 'enterprise', tenantId: 'demo-enterprise-1003' },
  { userId: 'demo-user-7257', accountName: '云帆智能研发中心', accountType: 'enterprise', tenantId: 'demo-enterprise-1042' },
  { userId: 'demo-user-7294', accountName: '栖原软件有限公司', accountType: 'enterprise', tenantId: 'demo-enterprise-1056' },
  { userId: 'demo-user-7302', accountName: '远川数字科技有限公司', accountType: 'enterprise', tenantId: 'demo-enterprise-1063' },
  { userId: 'demo-user-7365', accountName: '明溪计算实验室', accountType: 'enterprise', tenantId: 'demo-enterprise-1089' },
  { userId: 'demo-user-7406', accountName: '澄光信息技术有限公司', accountType: 'enterprise', tenantId: 'demo-enterprise-1108' },
  { userId: 'demo-user-7488', accountName: '原洲软件工作室', accountType: 'enterprise', tenantId: 'demo-enterprise-1127' },
  { userId: 'demo-user-7526', accountName: '湖桥智能科技有限公司', accountType: 'enterprise', tenantId: 'demo-enterprise-1150' },
];

export function packageClaimDemo(now = Date.now()) {
  const today = Date.parse(`${dayOf(now)}T00:00:00+08:00`);
  const orders = [12, 6, 4, 0, 7, 3, 5, 0, 4, 2, 5, 0, 1, 3, 0, 2].flatMap((count, daysAgo) =>
    Array.from({ length: count }, (_, index) => {
      const sample = daysAgo * accounts.length + index;
      const account = accounts[(sample + daysAgo * 5) % accounts.length];
      const team = account.accountType === 'enterprise';
      const opc = daysAgo > 0 && !team && sample % 3 === 2;
      const packageId = team ? 'demo-team-free' : opc ? 'demo-opc-zero' : 'demo-personal-free';
      const tier = team ? '团队版-Free' : opc ? 'OPC 0元卡' : '个人版-Free';
      const entitlement = team ? 500_000_000 : opc ? 20_000_000 : 100_000_000;
      const duration = daysAgo === 0 ? now - today : DAY;
      const acquired = today - daysAgo * DAY + Math.floor(duration * (index + 1) / (count + 1));
      const models = [prices[sample % prices.length], prices[(sample + 1) % prices.length]];
      const spent = sample % 7 === 0 ? 0 : 38_150 + sample % 13 * 11_840;
      const usage = spent ? models.map(({ model, provider }, position) => ({
        model, provider, inputTokens: spent * (position ? 2 : 3), outputTokens: Math.floor(spent / (position ? 6 : 4)),
      })) : [];
      const used = usage.reduce((sum, entry) => sum + entry.inputTokens + entry.outputTokens, 0);
      const cost = usage.reduce((sum, entry, position) => {
        const { inputRate, outputRate } = models[position];
        return sum + (entry.inputTokens * inputRate + entry.outputTokens * outputRate) / 1_000_000;
      }, 0);
      return { ...account, id: `demo-claim-${sample + 1001}`, packageId, tier, entitlement, used, cost, usage,
        createdAt: new Date(acquired).toISOString(), expiresAt: new Date(acquired + (opc ? 7 : 30) * DAY).toISOString(),
        status: sample % 17 === 7 ? '已冻结' : sample % 19 === 8 ? '已取消' : '生效中' };
    }));
  return { orders, prices };
}
