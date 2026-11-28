import { MODEL_TYPE_LABELS } from '../model-types.mjs';

export const chartPalette = ['#3568f9', '#18a69a', '#f09b38', '#865bd6', '#7199ca', '#dd659d', '#8a97ac', '#946d42', '#3d8a66', '#b46b85', '#547dc0', '#a68a35'];
export const adminChartColor = (color, primary = 'var(--xa24-primary)') => color === chartPalette[0] ? primary : color;

const semantic = { [MODEL_TYPE_LABELS.text]: 1, [MODEL_TYPE_LABELS.multimodal]: 2, [MODEL_TYPE_LABELS.visual]: 3,
  [MODEL_TYPE_LABELS.audio]: 5, [MODEL_TYPE_LABELS.embedding]: 4, [MODEL_TYPE_LABELS.rerank]: 6 };
export function chartColor(item) {
  if (item.color) return item.color;
  if (item.total || /^(总|累计)/.test(item.label)) return chartPalette[0];
  if (semantic[item.label] != null) return chartPalette[semantic[item.label]];
  const name = item.label.split('/').at(-1).toLowerCase().replace(/[^a-z0-9\u4e00-\u9fff]/g, '');
  let hash = 0;
  for (const letter of name) hash = (hash * 31 + letter.charCodeAt(0)) >>> 0;
  return chartPalette[1 + hash % (chartPalette.length - 1)];
}
export function defaultChartSeries(series) {
  if (series.length <= 8) return series.map(item => item.label);
  const totals = series.filter(item => item.total);
  const ranked = series.filter(item => !item.total).map((item, index) => ({ item, index, sum: item.values.reduce((sum, value) => sum + (Number.isFinite(value) ? value : 0), 0) })).sort((a, b) => b.sum - a.sum || a.index - b.index);
  return [...totals, ...ranked.slice(0, Math.max(0, 6 - totals.length)).map(row => row.item)].map(item => item.label);
}
export const chartNumber = value => Number.isFinite(value) ? value.toLocaleString('zh-CN', { maximumFractionDigits: 4 }) : '—';
export function chartAxis(series, unit, axisUnit, tickScale) {
  const max = Math.max(0, ...series.flatMap(item => item.values.filter(Number.isFinite)));
  const scale = tickScale || (/^Token(?:\/分钟)?$/.test(unit) ? max >= 1e8 ? 1e8 : max >= 1e4 ? 1e4 : 1 : 1);
  return { scale, name: axisUnit || (scale > 1 ? `${unit}（${scale === 1e8 ? '亿' : '万'}）` : unit) };
}
