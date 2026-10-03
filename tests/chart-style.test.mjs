import test from 'node:test';
import assert from 'node:assert/strict';
import { chartColor, chartAxis, chartNumber, defaultChartSeries } from '../src/components/chart-style.mjs';

test('many models default to total plus five leaders without changing values or losing candidates', () => {
  const series = [{ label: '总量', total: true, values: [100, null] }, ...Array.from({ length: 100 }, (_, i) => ({ label: `模型${i}`, values: [i, null] }))];
  const before = structuredClone(series);
  assert.deepEqual(defaultChartSeries(series), ['总量', '模型99', '模型98', '模型97', '模型96', '模型95']);
  assert.deepEqual(series, before);
  assert.equal(defaultChartSeries(series.slice(0, 8)).length, 8);
  assert.deepEqual(defaultChartSeries(series.slice(0, 3)), ['总量', '模型0', '模型1']);
});

test('chart colors remain stable across names and token axes preserve base values and missing readings', () => {
  assert.equal(chartColor({ label: 'DeepSeek/DeepSeek–V4–Pro' }), chartColor({ label: 'deepseek-v4-pro' }));
  assert.equal(chartColor({ label: '总 Token' }), '#3568f9');
  assert.equal(chartColor({ label: '向量模型' }), '#7199ca');
  assert.deepEqual(chartAxis([{ values: [null, 2500000] }], 'Token'), { scale: 10000, name: 'Token（万）' });
  assert.deepEqual(chartAxis([{ values: [120000000] }], 'Token/分钟'), { scale: 100000000, name: 'Token/分钟（亿）' });
  assert.deepEqual(chartAxis([{ values: [120000] }], 'ms'), { scale: 1, name: 'ms' });
  assert.equal(chartNumber(null), '—');
  assert.equal(chartNumber(0), '0');
  assert.equal(chartNumber(2500000), '2,500,000');
});
