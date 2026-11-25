const recordedUsage = usageMetric => ({ usageMetric, meteringRule: '直接取对应指标的记录值。' });

const scenarioMetering = new Map([
  ['输入 Token', {
    usageMetric: '总输入 Token 数、缓存命中 Token 数',
    meteringRule: '总输入包含单独计费的缓存命中时，扣除命中量。上报值已排除缓存命中时，直接取值。',
  }],
  ['输出 Token', recordedUsage('输出 Token 数')],
  ['缓存读取 Token', recordedUsage('缓存命中 Token 数')],
  ['缓存写入 Token', {
    usageMetric: '缓存写入 Token 数',
    meteringRule: '取对应缓存类型和有效期的写入量。',
  }],
  ['图像输入 Token', recordedUsage('图像输入 Token 数')],
  ['图像输出 Token', recordedUsage('图像输出 Token 数')],
  ['音频输入 Token', recordedUsage('音频输入 Token 数')],
  ['音频输出 Token', recordedUsage('音频输出 Token 数')],
  ['向量输入 Token', recordedUsage('向量请求的输入 Token 数')],
  ['重排输入 Token', recordedUsage('重排请求的输入 Token 数')],
  ['重排请求数', recordedUsage('重排请求次数')],
  ['图像输出', recordedUsage('输出图片张数')],
  ['视频输出时长', recordedUsage('输出视频时长')],
  ['图像输入', recordedUsage('输入图片张数')],
  ['图像输入（按张）（每次第 6 张起）', { usageMetric: '输入图片张数', meteringRule: '计算每次请求从第 6 张起的图片张数。' }],
  ['图像输入（按张）（每次前 5 张免费）', { usageMetric: '输入图片张数', meteringRule: '取每次请求的前 5 张，按免费项计量。' }],
  ['图像输入（按张）（每次第 6–9 张，最多 9 张）', { usageMetric: '输入图片张数', meteringRule: '计算每次请求第 6–9 张的图片张数。' }],
  ['图像输入（按张）（每次前 5 张免费，最多 9 张）', { usageMetric: '输入图片张数', meteringRule: '取每次请求的前 5 张，按免费项计量。' }],
  ['视频输入时长', recordedUsage('输入视频时长')],
  ['视频输入 Token', recordedUsage('视频输入 Token 数')],
  ['Token 用量', { usageMetric: '总 Token 数', meteringRule: '取服务商记录的总用量，按对应接口的统计口径计量。' }],
  ['输入 TPM 预留', { usageMetric: '预留输入 TPM、计费月数', meteringRule: '按合同约定的输入吞吐预留量和计费月数计量。' }],
  ['输出 TPM 预留', { usageMetric: '预留输出 TPM、计费月数', meteringRule: '按合同约定的输出吞吐预留量和计费月数计量。' }],
  ['资源包', { usageMetric: '订购包数', meteringRule: '按合同约定的资源包数量计量。' }],
  ['图像及视频输入 Token', recordedUsage('图像及视频输入 Token 数')],
  ['音频输入时长', recordedUsage('输入音频时长')],
  ['语音合成字符数', recordedUsage('待合成文本字符数')],
  ['文本、图像及视频输入 Token', recordedUsage('文本、图像及视频输入 Token 数')],
  ['视频处理时长', { usageMetric: '视频处理时长', meteringRule: '取服务商按对应任务口径记录的处理时长。' }],
]);

const unitMetering = new Map([
  ['百万 Token', { baseUnit: 'Token', multiplier: 1_000_000 }],
  ['张', { baseUnit: '张', multiplier: 1 }],
  ['秒', { baseUnit: '秒', multiplier: 1 }],
  ['分钟', { baseUnit: '秒', multiplier: 60 }],
  ['万字符', { baseUnit: '字符', multiplier: 10_000 }],
  ['千次', { baseUnit: '次', multiplier: 1_000 }],
  ['千 TPM·月', { baseUnit: 'TPM·月', multiplier: 1_000 }],
  ['包', { baseUnit: '包', multiplier: 1 }],
]);

export const tariffUnitBase = name => unitMetering.get(name)?.baseUnit;

export function tariffMeteringDetails({ kind, name }) {
  if (kind === 'unit') return unitMetering.get(name);
  if (kind === 'scenario') {
    // Quote variants share the base indicator. Per-request image ranges override the base count.
    return scenarioMetering.get(name) ?? scenarioMetering.get(name.split('（', 1)[0]);
  }
}
