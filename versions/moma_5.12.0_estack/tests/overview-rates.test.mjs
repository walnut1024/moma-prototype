import {test} from 'node:test';
import assert from 'node:assert/strict';
import {overviewDemo,overviewRates} from '../src/admin-v2/overview.js';
const at=value=>Date.parse(value+'+08:00');
test('overview daily average includes idle natural days',()=>{
  assert.deepEqual(overviewRates(1008000,at('2026-10-19T00:00:00'),at('2026-10-26T00:00:00')),{averageTpd:144000});
  assert.deepEqual(overviewRates(4320,at('2026-10-24T00:00:00'),at('2026-10-26T12:00:00')),{averageTpd:1440});
});
test('zero activity differs from an interval that has not started',()=>{
  const start=at('2026-10-26T00:00:00');
  assert.deepEqual(overviewRates(0,start,start+86400000),{averageTpd:0});
  assert.deepEqual(overviewRates(0,start,start),{averageTpd:null});
  assert.equal(overviewDemo(start,'today').peakHourlyTokens,null);
  assert.equal(overviewDemo(start+1,'today').peakHourlyTokens,0);
});
test('overview current and comparison metrics use their own common totals and windows',()=>{
  const data=overviewDemo(at('2026-10-26T12:00:00'),'custom',{start:'2026-10-24',end:'2026-10-26'});
  assert.equal(data.rates.averageTpd*3,data.total);
  assert.equal(data.previous.rates.averageTpd*3,data.previous.total);
});
test('hour peak uses hourly totals for both single-day and multi-day selections',()=>{
  const now=at('2026-10-30T12:30:00');
  const today=overviewDemo(now,'today');
  assert.equal(today.peakHourlyTokens,Math.max(...today.trend.map(row=>row.total)));
  assert.equal(today.previous.peakHourlyTokens,Math.max(...today.previous.trend.map(row=>row.total)));
  const hourlyTotals=(start,end)=>{
    const totals=[];
    for(let day=start;day<end;day+=86400000){
      const date=new Date(day+8*3600000).toISOString().slice(0,10);
      totals.push(...overviewDemo(now,'custom',{start:date,end:date}).trend.map(row=>row.total));
    }
    return totals;
  };
  const week=overviewDemo(now,'week');
  assert.equal(week.peakHourlyTokens,Math.max(...hourlyTotals(week.period.start,week.period.end)));
  assert.equal(week.previous.peakHourlyTokens,Math.max(...hourlyTotals(week.period.previousStart,week.period.previousEnd)));
  assert.ok(week.peakHourlyTokens<Math.max(...week.trend.map(row=>row.total)));
});
