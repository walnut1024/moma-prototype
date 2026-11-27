import assert from 'node:assert/strict';
import test from 'node:test';
import {
  buildScheduleCron, canSaveScheduleCron, DEFAULT_SCHEDULE_RULE, evaluateDeploymentSchedule, MAX_SCHEDULE_DURATION,
  overlappingScheduleRules, previewScheduleRule, readDeploymentSchedule, scheduleDurationFromTimes, scheduleRuleFields,
  scheduleStartConflicts, summarizeDeploymentSchedule, validateDeploymentSchedule,
} from '../src/admin-v2/deployment-schedule.js';

const plan = (rules, changes = {}) => ({ enabled: true, baseline_replicas: 0, rules, ...changes });
const rule = (cron, replicas, duration = 3600) => ({ start_cron: cron, duration_seconds: duration, replicas });

test('converts structured daily, weekly and monthly rules and keeps full-day and overnight durations', () => {
  assert.equal(buildScheduleCron('daily', [], '08:45'), '45 8 * * *');
  assert.equal(buildScheduleCron('weekly', [1, 5, 0], '03:10'), '10 3 * * 1,5,0');
  assert.equal(buildScheduleCron('monthly', [2, 31], '23:05'), '5 23 2,31 * *');
  assert.equal(buildScheduleCron('weekly', [], '09:00'), '');
  assert.equal(scheduleDurationFromTimes('23:10', '02:40'), 12600);
  assert.equal(scheduleDurationFromTimes('09:00', '09:00'), 86400);
  assert.equal(scheduleDurationFromTimes('24:00', '09:00'), null);
  assert.deepEqual(scheduleRuleFields(rule('5 23 2,31 * *', 0, 12600)), {
    repeat: 'monthly', days: [2, 31], start: '23:05', end: '02:35',
  });
  assert.equal(scheduleRuleFields(rule('0 9 * * *', 1, 86401)).repeat, 'cron');
});

test('validates supported croniter aliases and schedule syntax, including trailing seconds', () => {
  for (const expression of ['0 9 * * 1-5', '0 9 * * L5', '15 8 ? * MON 30', '@midnight', '@annually', '0 0 29 2 *']) {
    assert(canSaveScheduleCron(expression), expression);
  }
  for (const expression of ['H 9 * * *', '0 25 * * *', '0 0 31 2 *', '0 ? * * *', '0 9 * * 5L', ' @daily ', '@reboot']) {
    assert.equal(canSaveScheduleCron(expression), false, expression);
  }
});

test('distinguishes disabled drafts from an enabled plan and preserves original weekday records', () => {
  const legacy = [{ days: [1, 7], time: '09:30', replicas: 0 }];
  const original = structuredClone(legacy);
  const dormant = readDeploymentSchedule(undefined, legacy);
  assert.equal(dormant.enabled, false);
  assert.deepEqual(dormant.rules[0], { start_cron: '30 9 * * 1,0', duration_seconds: null, replicas: 0, name: '' });
  assert.deepEqual(legacy, original);
  assert.equal(validateDeploymentSchedule(null), null);
  assert.deepEqual(validateDeploymentSchedule(dormant), dormant);
  assert.throws(() => validateDeploymentSchedule(plan(dormant.rules)), /时长/);
  assert.throws(() => validateDeploymentSchedule(plan([])), /一条规则/);
  assert.throws(() => validateDeploymentSchedule(plan([DEFAULT_SCHEDULE_RULE], { baseline_replicas: null })), /基线/);
  assert.throws(() => validateDeploymentSchedule(plan([rule('', 1)])), /Cron/);
  assert.throws(() => validateDeploymentSchedule(plan([rule('0 9 * * *', 1.5)])), /非负整数/);
  assert.throws(() => validateDeploymentSchedule(plan([rule('0 9 * * *', 1, MAX_SCHEDULE_DURATION + 1)])), /366 天/);
  assert.throws(() => validateDeploymentSchedule(plan([DEFAULT_SCHEDULE_RULE]), { roles: { router: 1 } }), /PD 分离/);
  assert.equal(validateDeploymentSchedule(plan([rule('', 0, null)], { enabled: false, paused: true })).paused, false);
  assert.equal(validateDeploymentSchedule(plan([DEFAULT_SCHEDULE_RULE])).baseline_replicas, 0);
});

test('separates form-only equal-start conflicts from portable rule validation and informational overlap', () => {
  const rules = [rule('0 9 * * *', 2, 7200), rule('0 10 * * *', 3), rule('0 9 * * * 0', 4, 7200)];
  assert.deepEqual(scheduleStartConflicts(rules), ['0 9 * * *']);
  assert.equal(validateDeploymentSchedule(plan(rules)).rules.length, 3);
  assert.throws(() => validateDeploymentSchedule(plan(rules), { enforceUniqueStarts: true }), /相同开始时间/);
  assert.deepEqual(overlappingScheduleRules(rules, { now: new Date('2026-11-26T00:00:00Z') }),
    ['0 9 * * *', '0 10 * * *', '0 9 * * * 0']);
});

test('previews active and upcoming windows, latest start precedence, tie count and pauses in Beijing time', () => {
  const schedule = plan([rule('0 9 * * *', 2, 7200), rule('0 10 * * *', 3), rule('0 10 * * 4', 4)]);
  const now = new Date('2026-11-26T02:00:00Z');
  const current = evaluateDeploymentSchedule(schedule, { now });
  assert.equal(current?.replicas, 4);
  assert.equal(current?.start.toISOString(), '2026-11-26T02:00:00.000Z');
  assert.equal(current?.end.toISOString(), '2026-11-26T03:00:00.000Z');
  assert.equal(evaluateDeploymentSchedule(schedule, { now: new Date('2026-11-26T01:15:00Z') })?.replicas, 2);
  assert.equal(evaluateDeploymentSchedule(schedule, { now: new Date('2026-11-26T03:00:00Z') })?.replicas, 0);
  assert.equal(evaluateDeploymentSchedule({ ...schedule, paused: true }, { now }), null);
  assert.equal(summarizeDeploymentSchedule({ ...schedule, paused: true }), '已暂停 · 3 条规则 · 基线 0');
  const upcoming = previewScheduleRule(rule('30 9 * * * 15', 1, 900), { now });
  assert.equal(upcoming?.active, false);
  assert.equal(upcoming?.start.toISOString(), '2026-11-27T01:30:15.000Z');
});
