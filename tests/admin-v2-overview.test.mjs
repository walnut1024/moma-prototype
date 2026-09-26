import { test } from 'node:test';
import assert from 'node:assert/strict';
import { overviewPeriods, overviewDemo, overviewRanking, compactCount } from '../src/admin-v2/overview.js';
const time = value => Date.parse(value+'+08:00');
test('overview demo keeps periods, source splits, trends, rankings and user metrics consistent',()=>{
  assert.equal(compactCount(9999),'9999');assert.equal(compactCount(10000),'1万');
  assert.equal(compactCount(18600972),'1860.1万');assert.equal(compactCount(100000000),'1亿');
  const now=time('2026-09-23T16:40:00');
  const periods=overviewPeriods(now);
  assert.equal(periods[0].previousEnd,time('2026-09-22T16:40:00'));
  assert.equal(periods[1].start,time('2026-09-17T00:00:00'));
  assert.equal(periods[1].range,'2026/09/17～2026/09/23');
  assert.equal(periods[1].previousEnd,time('2026-09-16T16:40:00'));
  assert.equal(periods[2].start,time('2026-08-25T00:00:00'));
  assert.equal(periods[2].previousStart,time('2026-07-26T00:00:00'));
  assert.equal(periods[2].previousEnd,time('2026-08-24T16:40:00'));
  assert.equal(periods[2].range,'2026/08/25～2026/09/23');
  const march=overviewPeriods(time('2024-03-31T12:00:00'))[2];
  assert.equal(march.start,time('2024-03-02T00:00:00'));
  assert.equal(march.previousStart,time('2024-02-01T00:00:00'));
  assert.equal(march.previousEnd,time('2024-03-01T12:00:00'));
  assert.equal(overviewPeriods(time('2026-01-01T08:00:00'))[1].start,time('2025-12-26T00:00:00'));
  const data=overviewDemo(now);
  assert.deepEqual(data,overviewDemo(now));
  for(const period of data.periods) {
    assert.ok(period.total>0&&period.previous.total>0);
    assert.equal(period.self+period.partner,period.total);
    assert.equal(period.selfCalls+period.partnerCalls,period.calls);
    for(const kind of ['user','model']) {
      const rank=overviewRanking(period,kind);
      assert.equal(rank.length,10);
      assert.equal(new Set(rank.map(r=>r.id)).size,10);
      assert.ok(Math.abs(rank.reduce((n,r)=>n+r.total,0)-period.total*.8)<20);
      rank.forEach((r,i)=>{assert.equal(r.self+r.partner,r.total);if(i)assert.ok(rank[i-1].total>=r.total)});
    }
  }
  assert.equal(data.dayTrend.length,30);assert.equal(data.hourTrend.length,72);
  assert.equal(data.dayTrend.at(-1).total,data.periods[0].total);
  assert.equal(data.hourTrend.filter(d=>d.at>=periods[0].start).reduce((n,d)=>n+d.total,0),data.periods[0].total);
  assert.equal(data.dayTrend.filter(d=>d.at>=periods[2].start).reduce((n,d)=>n+d.total,0),data.periods[2].total);
  assert.equal(data.dayTrend.filter(d=>d.at>=periods[1].start).reduce((n,d)=>n+d.total,0),data.periods[1].total);
  assert.ok(data.success>99&&data.success<100);
  for(const key of ['response','ttft','tpot']){assert.ok(data[key].avg>0);assert.ok(data[key].max>data[key].avg)}
  assert.equal(data.userTrend.length,30);assert.equal(data.userTrend.at(-1).registered,data.users.added);
  assert.equal(data.userTrend.at(-1).cancelled,data.users.cancelled);assert.equal(data.userTrend.at(-1).active,data.users.dau);
  assert.ok(data.users.registered>=data.users.mau&&data.users.mau>=data.users.dau);
  const midnight=overviewDemo(time('2026-09-23T00:00:00'));
  assert.equal(midnight.periods[0].total,0);assert.equal(midnight.success,null);
  assert.equal(midnight.response.avg,null);assert.equal(midnight.users.dau,0);
});
