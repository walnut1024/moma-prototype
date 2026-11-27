import { CronExpressionParser } from 'cron-parser';

export const DEPLOYMENT_SCHEDULE_TIMEZONE = 'Asia/Shanghai';
export const MAX_SCHEDULE_DURATION = 366 * 86400;
export const DEFAULT_SCHEDULE_RULE = Object.freeze({
  start_cron: '0 9 * * *', duration_seconds: 9 * 3600, replicas: 1, name: '',
});
export const SCHEDULE_UNITS = { minutes: 60, hours: 3600, days: 86400 };
const aliases = {
  '@midnight': '0 0 * * *', '@hourly': '0 * * * *', '@daily': '0 0 * * *', '@weekly': '0 0 * * 0',
  '@monthly': '0 0 1 * *', '@yearly': '0 0 1 1 *', '@annually': '0 0 1 1 *',
};

const isReplicaCount = value => typeof value === 'number' && Number.isSafeInteger(value) && value >= 0;
const clockMinutes = text => {
  const time = /^([01]\d|2[0-3]):([0-5]\d)$/.exec(text);
  return time ? Number(time[1]) * 60 + Number(time[2]) : null;
};
const clockText = minutes => {
  const time = minutes % 1440;
  return [Math.floor(time / 60), time % 60].map(part => String(part).padStart(2, '0')).join(':');
};

function parserCron(expression) {
  if (typeof expression !== 'string' || expression.length > 512 || /\bh\b/i.test(expression)) return null;
  const fields = (aliases[expression.toLowerCase()] || expression.trim()).split(/\s+/);
  if (fields.length !== 5 && fields.length !== 6) return null;
  if (fields.some((field, index) => field.includes('?') && (field !== '?' || (index !== 2 && index !== 4)))) return null;
  if (fields[4].split(',').some(token => /^\d+l$/i.test(token))) return null;
  // GPUStack stores croniter syntax, with seconds last and L5 meaning last Friday.
  const seconds = fields.length === 6 ? fields.pop() : '0';
  fields[4] = fields[4].replace(/\bL([0-7])\b/gi, '$1L');
  return [seconds, ...fields].join(' ');
}

export function canSaveScheduleCron(expression) {
  try {
    const cron = parserCron(expression);
    if (!cron) return false;
    CronExpressionParser.parse(cron).next();
    return true;
  } catch {
    return false;
  }
}

export function readDeploymentSchedule(schedule, legacyRules) {
  const defaults = {
    enabled: false, paused: false, baseline_replicas: null,
  };
  if (schedule) return { ...defaults, ...schedule, rules: schedule.rules ?? [] };
  return {
    ...defaults,
    rules: (legacyRules || []).map(({ days, time, replicas }) => ({
      start_cron: buildScheduleCron('weekly', days.map(day => day % 7), time),
      duration_seconds: null, replicas, name: '',
    })),
  };
}

export function scheduleStartConflicts(rules) {
  const groups = new Map();
  for (const rule of rules || []) {
    const expression = rule.start_cron?.trim();
    if (!expression || !isReplicaCount(rule.replicas)) continue;
    const key = parserCron(rule.start_cron) ?? expression;
    const group = groups.get(key) ?? { expression, counts: new Set() };
    group.counts.add(rule.replicas);
    groups.set(key, group);
  }
  return [...groups.values()].filter(group => group.counts.size > 1).map(group => group.expression);
}

export function validateDeploymentSchedule(schedule, { roles, original, enforceUniqueStarts = false } = {}) {
  if (schedule == null) return null;
  if (typeof schedule !== 'object' || Array.isArray(schedule) ||
      ['enabled', 'paused'].some(key => schedule[key] != null && typeof schedule[key] !== 'boolean') ||
      (schedule.rules != null && !Array.isArray(schedule.rules))) {
    throw Error('定时伸缩配置格式无效');
  }
  const enabled = schedule.enabled === true;
  const baseline = schedule.baseline_replicas ?? null;
  if (enabled && roles) throw Error('启用 PD 分离时不可启用定时伸缩');
  if ((enabled || baseline != null) && !isReplicaCount(baseline)) throw Error('基线副本数须为非负整数');
  const rules = (schedule.rules || []).map((rule, index) => {
    const field = `规则 ${index + 1}`;
    const cron = rule?.start_cron ?? '';
    const duration = rule?.duration_seconds ?? null;
    const name = rule?.name ?? null;
    if (!isReplicaCount(rule?.replicas)) throw Error(`${field}的窗口内副本数须为非负整数`);
    if ((enabled || duration != null) && (!Number.isInteger(duration) || duration < 1 || duration > MAX_SCHEDULE_DURATION)) {
      throw Error(`${field}的时长须大于 0 且不超过 366 天`);
    }
    const stored = !enabled && original?.rules?.some(saved => saved.start_cron === cron);
    if ((cron !== '' || enabled) && !stored && !canSaveScheduleCron(cron)) throw Error(`${field}的 Cron 表达式无效`);
    if (name != null && typeof name !== 'string') throw Error(`${field}的名称无效`);
    return { start_cron: cron, duration_seconds: duration, replicas: rule.replicas, name };
  });
  if (enabled && !rules.length) throw Error('请至少添加一条规则，或关闭定时伸缩');
  if (enabled && enforceUniqueStarts && scheduleStartConflicts(rules).length) throw Error('相同开始时间的规则须使用同一副本数');
  return { enabled, paused: enabled && schedule.paused === true, baseline_replicas: baseline, rules };
}

export function buildScheduleCron(repeat, days, time) {
  const total = clockMinutes(time);
  if (total == null || (repeat !== 'daily' && !days.length)) return '';
  const prefix = `${total % 60} ${Math.floor(total / 60)}`;
  if (repeat === 'weekly') return `${prefix} * * ${days.join(',')}`;
  if (repeat === 'monthly') return `${prefix} ${days.join(',')} * *`;
  return `${prefix} * * *`;
}

export function scheduleDurationFromTimes(start, end) {
  const first = clockMinutes(start), last = clockMinutes(end);
  if (first == null || last == null) return null;
  return ((last - first + 1440) % 1440 || 1440) * 60;
}

export function splitScheduleDuration(seconds) {
  if (!seconds) return { units: 'hours', count: null };
  const units = ['days', 'hours', 'minutes'].find(unit => seconds % SCHEDULE_UNITS[unit] === 0) || 'minutes';
  return { units, count: seconds / SCHEDULE_UNITS[units] };
}

export function scheduleRuleFields(rule) {
  const [minute, hour, day, month, weekday, seconds] = rule.start_cron.trim().split(/\s+/);
  const duration = rule.duration_seconds;
  const basic = seconds == null && /^\d+$/.test(minute) && /^\d+$/.test(hour) && Number(minute) <= 59 && Number(hour) <= 23
    && month === '*' && (duration == null || (duration > 0 && duration <= 86400 && duration % 60 === 0));
  const entries = (value, minimum, maximum) => /^\d+(,\d+)*$/.test(value) && value.split(',').every(term => Number(term) >= minimum && Number(term) <= maximum);
  if (!basic) return { repeat: 'cron', start: '09:00', end: '18:00', days: [] };
  const start = Number(hour) * 60 + Number(minute);
  const times = { start: clockText(start), end: duration ? clockText(start + duration / 60) : '' };
  if (day === '*' && weekday === '*') return { ...times, repeat: 'daily', days: [] };
  if (day === '*' && entries(weekday, 0, 7)) return { ...times, repeat: 'weekly', days: weekday.split(',').map(value => Number(value) % 7) };
  if (weekday === '*' && entries(day, 1, 31)) return { ...times, repeat: 'monthly', days: day.split(',').map(Number) };
  return { repeat: 'cron', start: '09:00', end: '18:00', days: [] };
}

function ruleWindow(rule, now, timezone, upcoming) {
  if (!rule.duration_seconds) return null;
  try {
    const cron = parserCron(rule.start_cron);
    if (!cron) return null;
    const iterator = CronExpressionParser.parse(cron, { tz: timezone, currentDate: new Date(now.getTime() + 1) });
    let start;
    try {
      start = iterator.prev().toDate();
    } catch {
      if (!upcoming) return null;
    }
    const active = Boolean(start && start <= now && start.getTime() + rule.duration_seconds * 1000 > now.getTime());
    if (!active && !upcoming) return null;
    if (!active) start = CronExpressionParser.parse(cron, { tz: timezone, currentDate: now }).next().toDate();
    return { start, end: new Date(start.getTime() + rule.duration_seconds * 1000), active };
  } catch {
    return null;
  }
}

export function previewScheduleRule(rule, { now = new Date(), timezone = DEPLOYMENT_SCHEDULE_TIMEZONE } = {}) {
  return ruleWindow(rule, now, timezone, true);
}

export function evaluateDeploymentSchedule(schedule, { now = new Date(), timezone = DEPLOYMENT_SCHEDULE_TIMEZONE } = {}) {
  if (!schedule?.enabled || schedule.paused) return null;
  let result = { replicas: schedule.baseline_replicas, rule: null, start: null, end: null };
  for (const rule of schedule.rules || []) {
    const window = ruleWindow(rule, now, timezone, false);
    if (!window) continue;
    if (!result.start || window.start > result.start ||
        (window.start.getTime() === result.start.getTime() && rule.replicas > result.replicas)) {
      result = { replicas: rule.replicas, rule, start: window.start, end: window.end };
    }
  }
  return result;
}

export function overlappingScheduleRules(rules, { now = new Date(), timezone = DEPLOYMENT_SCHEDULE_TIMEZONE } = {}) {
  const endDate = new Date(now.getTime() + 35 * 86400000);
  const intervals = rules.map(rule => {
    const windows = [];
    const cron = parserCron(rule.start_cron);
    if (!cron || !rule.duration_seconds) return { cron, rule, windows };
    const active = ruleWindow(rule, now, timezone, false);
    if (active) windows.push([active.start.getTime(), active.end.getTime()]);
    try {
      const iterator = CronExpressionParser.parse(cron, { tz: timezone, currentDate: now, endDate });
      for (let count = 0; count < 300 && iterator.hasNext(); count++) {
        const time = iterator.next().toDate().getTime();
        windows.push([time, time + rule.duration_seconds * 1000]);
      }
    } catch {
      // An unpreviewable rule has no confirmed future windows.
    }
    return { cron, rule, windows };
  });
  const overlapping = new Set();
  for (const [leftIndex, left] of intervals.entries()) {
    for (const right of intervals.slice(leftIndex + 1)) {
      if (left.cron === right.cron) continue;
      let a = 0, b = 0;
      while (a < left.windows.length && b < right.windows.length) {
        const [firstStart, firstEnd] = left.windows[a], [secondStart, secondEnd] = right.windows[b];
        if (firstStart < secondEnd && secondStart < firstEnd) {
          overlapping.add(left.rule.start_cron);
          overlapping.add(right.rule.start_cron);
          break;
        }
        if (firstEnd <= secondStart) a++;
        else b++;
      }
    }
  }
  return [...overlapping];
}

export function summarizeDeploymentSchedule(schedule, legacyRules) {
  const current = readDeploymentSchedule(schedule, legacyRules);
  if (!current.rules?.length) return undefined;
  const status = current.enabled ? current.paused ? '已暂停' : '已启用' : '已关闭';
  return `${status} · ${current.rules.length} 条规则${current.baseline_replicas == null ? '' : ` · 基线 ${current.baseline_replicas}`}`;
}
