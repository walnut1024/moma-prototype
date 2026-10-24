import test from 'node:test';
import assert from 'node:assert/strict';
import { overviewPeriod, overviewDemo } from '../src/admin-v2/overview.js';
const time = text => Date.parse(text + '+08:00');
const now = time('2026-10-24T10:30:00');
test('today uses Beijing midnight and previous day at equal elapsed time', () => {
 const p = overviewPeriod(now, 'today');
 assert.equal(p.start, time('2026-10-24T00:00:00'));
 assert.equal(p.end, now);
 assert.equal(p.previousEnd, time('2026-10-23T10:30:00'));
 const d = overviewDemo(now,'today');
 assert.equal(d.trend.length,11);
 for (const key of ['total','calls']) for(const list of ['trend','customers','models','pairs']) assert.equal(d[list].reduce((n,r)=>n+r[key],0),d[key]);
 assert.equal(overviewDemo(time('2026-10-24T00:00:00'),'today').total,0);
});
test('custom supports full days and today with same-progress comparison', () => {
 const p = overviewPeriod(now,'custom',{start:'2026-10-20',end:'2026-10-22'});
 assert.equal(p.end,time('2026-10-23T00:00:00'));
 assert.equal(p.previousStart,time('2026-10-17T00:00:00'));
 assert.equal(p.previousEnd,time('2026-10-20T00:00:00'));
 assert.equal(p.partial,false);
 const current=overviewPeriod(now,'custom',{start:'2026-10-23',end:'2026-10-24'});
 assert.equal(current.end,now);
 assert.equal(current.previousEnd,time('2026-10-22T10:30:00'));
 assert.equal(overviewDemo(now,'custom',{start:'2026-10-23',end:'2026-10-23'}).total,overviewDemo(now,'day').total);
 assert.deepEqual(overviewDemo(now,'today').monthlyActive,overviewDemo(now,'day').monthlyActive);
});
test('invalid saved custom ranges are rejected', () => {
 for(const range of [null,{start:'2026-02-30',end:'2026-03-02'},{start:'2026-10-24',end:'2026-10-23'},{start:'2026-10-24',end:'2026-10-25'},{start:'2025-01-01',end:'2026-10-24'}]) assert.equal(overviewPeriod(now,'custom',range),null);
 assert.equal(overviewPeriod(now,'missing'),null);
});
