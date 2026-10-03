import test from 'node:test';
import assert from 'node:assert/strict';
import { beijingTime, monitoringWindow, deploymentSeries, deploymentSummary } from '../src/admin-v2/observability.js';
import { logPeriod, createLogRecords, defaultLogFilters, filterLogRecords } from '../src/call-log-data.mjs';

test('filter repairs preserve date boundaries, stable deployment samples and empty summaries', () => {
  const now=Date.parse('2026-09-30T08:00:00Z');
  const records=[-25,-24,-1,0,1].map(hours=>({createdAt:new Date(now+hours*3600000).toISOString()}));
  const day=monitoringWindow(records,1,now),week=monitoringWindow(records,7,now);
  assert.equal(day.rows.length,2); assert.equal(week.rows.length,3);
  assert.equal(day.buckets.reduce((sum,bucket)=>sum+day.rows.filter(row=>Date.parse(row.createdAt)>=bucket.start&&Date.parse(row.createdAt)<bucket.end).length,0),day.rows.length);
  assert.equal(day.buckets.length,24); assert.equal(week.buckets.length,168);
  assert.equal(day.buckets[0].start,now-86400000); assert.equal(day.buckets.at(-1).end,now);
  assert.equal(beijingTime('2026-09-29T16:03:00Z'),'2026-09-30 00:03');
  assert.equal(beijingTime('2026-09-30T00:03:00+08:00'),'2026-09-30 00:03');
  const deployments=[{id:'deployment-1'},{id:'deployment-2'}];
  assert.deepEqual(deploymentSeries(deployments[1],'GPU 利用率').slice(0,4),[53,46,56,75]);
  assert.equal(deploymentSummary(deployments).p95,459);
  assert.deepEqual(deploymentSummary([]),{gpu:null,throughput:null,p95:null});
  assert.equal(deploymentSummary(deployments).throughput,deploymentSummary([deployments[0]]).throughput+deploymentSummary([deployments[1]]).throughput);
  assert.deepEqual(logPeriod('7','2026-09-30'),{start:'2026-09-23',end:'2026-09-29'});
  assert.deepEqual(logPeriod('yesterday','2026-09-30'),{start:'2026-09-29',end:'2026-09-29'});
  const rows=filterLogRecords(createLogRecords('2026-09-30'),'全部',{...defaultLogFilters,range:'yesterday'},'2026-09-30');
  assert.equal(rows.length,9); assert.ok(rows.every(row=>row.time.startsWith('2026-09-29')));
});
