import config from './tenant-usage.json' with { type: 'json' };
import { shanghaiDate } from '../call-log-data.mjs';
import { priceRequest } from '../admin-v2/operations-analysis.js';
import { USAGE_ACTIVITY_DAYS } from '../tenant-usage-report.mjs';

const DAY = 86_400_000;
const MICROS = 1_000_000;
const ACTIVE_DEMO_START = Date.parse('2026-10-11T00:00:00+08:00');
const priceItems = {
  input: ['输入 Token', '百万 Token'], cached: ['缓存读取 Token', '百万 Token'],
  output: ['输出 Token', '百万 Token'], cacheWrite: ['缓存写入 Token', '百万 Token'],
  images: ['生成图片', '张'], seconds: ['时长', '秒'], characters: ['字符', '字符'], calls: ['调用', '次'],
};
const nativeFields = { 张: 'images', 秒: 'seconds', 字符: 'characters' };

export function tenantUsageDemo(now) {
  const today = Date.parse(shanghaiDate(now) + 'T00:00:00+08:00');
  const { projects, keys, users, models, profiles, subscribedModelIds } = config;
  const keysById = new Map(keys.map(key => [key.id, key]));
  const modelsById = new Map(models.map(model => [model.id, model]));
  const salePrices = new Map(models.map(model => [model.id, {
    id: model.id + '-sale-v1',
    effectiveAt: '2026-01-01T00:00:00+08:00',
    items: Object.entries(model.rates).map(([meter, amount]) => {
      const [name, unit] = priceItems[meter];
      return { name, unit, currency: 'CNY', amount };
    }),
  }]));
  const records = [];

  // Generate by calendar day so refreshing or crossing midnight never changes earlier mock facts.
  for (let day = today - (USAGE_ACTIVITY_DAYS - 1) * DAY; day <= today; day += DAY) {
    const ordinal = Math.floor(day / DAY);
    const seed = ordinal * 53 % 101;
    const history = Math.max(0.2, 1 + (day - ACTIVE_DEMO_START) / (420 * DAY));
    const volume = day >= ACTIVE_DEMO_START ? 1 : seed < 26 ? 0 : (0.10 + seed / 165) * history;
    profiles.forEach((profile, index) => {
      const key = keysById.get(profile.keyId);
      const model = modelsById.get(profile.modelId);
      const count = Math.round(profile.count * volume * (0.65 + ((ordinal * (7 + index) + index * 11) % 31) / 39));
      for (let n = 0; n < count; n++) {
        const seed = ordinal + index * 17 + n * 23;
        const at = day + ((n * 47 + index * 79 + ordinal * 13) % 1380) * 60_000;
        if (at >= now.getTime()) continue;
        const id = `usage-preview-${ordinal}-${index}-${n}`;
        const failed = seed % 83 === 0;
        const input = failed ? 0 : Math.round((profile.input ?? 0) * (0.75 + seed % 49 / 100));
        const output = failed ? 0 : Math.round((profile.output ?? 0) * (0.7 + seed % 61 / 100));
        const cached = Math.round(input * (seed % 7 === 0 ? 0 : Math.min(1, (profile.hit ?? 0) + (seed % 17 - 8) / 100)));
        const nativeField = nativeFields[model.usageUnit];
        const quantity = profile.quantity ? Math.round(profile.quantity * (0.5 + seed % 101 / 100)) : 1 + seed % 3;
        const usage = nativeField ? { [nativeField]: failed ? 0 : quantity } : {
          input, ...(profile.output != null && { output }), ...(profile.hit != null && { cached }),
          ...(model.rates.cacheWrite && { cacheWrite: !failed && seed % 13 === 0 ? Math.round(input * 0.25) : 0 }),
        };
        const row = {
          id, requestId: id, projectId: key.projectId, keyId: key.id, userId: profile.userId,
          modelId: model.id, usageUnit: model.usageUnit, createdAt: new Date(at).toISOString(), billingType: key.billingType,
          httpStatus: failed ? 503 : 200, usage, usageConfirmed: true,
        };
        if (key.billingType === 'Token Plan') {
          row.planTokens = input + output;
        } else {
          const price = salePrices.get(model.id);
          const actual = failed && model.rates.calls ? null : priceRequest(price, row, model);
          if (actual) {
            const baseline = Object.hasOwn(usage, 'cached') && priceRequest(price, { ...row, usage: { ...usage, cached: 0, cacheWrite: 0 } }, model);
            const micros = Math.round(actual.amount * MICROS);
            row.charge = { currency: actual.currency, micros, ...(baseline && { savingsMicros: Math.round(baseline.amount * MICROS) - micros }) };
          }
        }
        records.push(row);
      }
    });
  }
  return { projects, keys, users, models, records, subscribedModelIds, canFilterUser: true };
}
