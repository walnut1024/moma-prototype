import assert from 'node:assert/strict';
import { test } from 'node:test';
import * as root from '../src/admin-v2/usage-analysis.js';
import * as version512 from '../versions/moma_5.12.0_estack/src/admin-v2/usage-analysis.js';
import { overviewPeriods as rootPeriods, overviewDemo as rootDemo } from '../src/admin-v2/overview.js';
import { overviewPeriods as versionPeriods, overviewDemo as versionDemo } from '../versions/moma_5.12.0_estack/src/admin-v2/overview.js';

const now = Date.parse('2026-10-12T13:00:00+08:00');
for (const [version, usage, periods, demo] of [['5.11.0', root, rootPeriods, rootDemo], ['5.12.0', version512, versionPeriods, versionDemo]]) {
  test(`${version}: operations only offers completed natural-day presets`, () => {
    assert.deepEqual(usage.operationsPresets.map(([id]) => id), ['yesterday', '7d', '30d']);
    for (const [id] of usage.operationsPresets) {
      const selected = usage.operationsPeriod(id, undefined, now);
      const window = usage.usageWindow(selected.range, now);
      assert.equal(selected.range.end, '2026-10-11');
      assert.equal(window.end, Date.parse('2026-10-12T00:00:00+08:00'));
      assert.equal(window.end - window.start, window.days * 86400000);
      assert.equal(window.end - window.start, window.priorEnd - window.priorStart);
    }
    for (const clock of [now, Date.parse('2024-03-01T00:00:00+08:00'), Date.parse('2026-01-01T16:00:00+08:00')]) {
      for (const [index, period] of periods(clock).entries()) {
        assert.equal(period.end - period.start, [1, 7, 30][index] * 86400000);
        assert.equal(period.end - period.start, period.previousEnd - period.previousStart);
        assert.ok(period.end <= clock);
        assert.equal(new Date(period.end + 8 * 3600000).getUTCHours(), 0);
      }
    }
    assert.equal(demo(now).trend.length, 24);
    const firstOfMonth = demo(Date.parse('2026-01-01T16:00:00+08:00'));
    assert.equal(firstOfMonth.monthlyActive.start, Date.parse('2025-12-01T00:00:00+08:00'));
    assert.equal(firstOfMonth.monthlyActive.end, Date.parse('2026-01-01T00:00:00+08:00'));
  });
  test(`${version}: restored views and drill-down dates cannot include today`, () => {
    const yesterday = { period: 'yesterday', range: { start: '2026-10-11', end: '2026-10-11' } };
    for (const id of [undefined, 'today', 'unknown']) assert.deepEqual(usage.operationsPeriod(id, undefined, now), yesterday);
    assert.deepEqual(usage.operationsPeriod('custom', { start: '2026-10-01', end: '2026-10-12' }, now), { period: 'custom', range: { start: '2026-10-01', end: '2026-10-11' } });
    assert.deepEqual(usage.operationsPeriod('custom', { start: '2026-10-12', end: '2026-10-12' }, now), yesterday);
    assert.deepEqual(usage.operationsPeriod('custom', { start: 'invalid', end: '2026-10-11' }, now), yesterday);
    const range = { start: '2026-09-01', end: '2026-09-30' };
    assert.deepEqual(usage.operationsPeriod('custom', range, now), { period: 'custom', range });
    assert.equal(usage.usagePreset('today', now).end, '2026-10-12');
  });
}
