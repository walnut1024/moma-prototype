import { dayOf } from './analytics.js';
import { requestOutcome } from './call-observations.mjs';
import { usageMeter, usageValue, usageWindow } from './usage-analysis.js';
import { usageTokenValue } from './usage-distributions.js';
import { diagnosticRequest, latestRequests } from '../request-identity.mjs';

const DAY = 86400000;
const userTypes = ['企业', '个人'];

// Explicit identity events for the prototype; gateway requests have no user owner.
export function userDemo(now = Date.now()) {
  const today = Date.parse(`${dayOf(now)}T00:00:00+08:00`);
  const users = [], logins = [], calls = [], keys = [];
  const addUser = (at, index) => users.push({ id: `U-${index + 1}`, type: index % 4 === 0 ? '个人' : '企业', at });
  for (let i = 0; i < 900; i++) addUser(today - 181 * DAY - i * 3600000, i);
  for (let day = -180; day <= 0; day++) {
    const start = today + day * DAY;
    for (let n = 0; n < 4 + (day * day + 3) % 5; n++) addUser(start + (8 + n * 2) * 3600000, users.length);
    for (let n = 0; n < 145 + (day * day + 7) % 33; n++) {
      const user = users[((Math.imul(day + 181, 9301) + Math.imul(n + 1, 49297)) >>> 0) % users.length];
      const at = start + (n * 37 % 24) * 3600000 + (n * 13 % 60) * 60000;
      if (at >= user.at && at <= now) logins.push({ userId: user.id, at });
    }
    for (let n = 0; n < 84 + (day * day + 11) % 31; n++) {
      const user = users[((Math.imul(day + 181, 6781) + Math.imul(n + 1, 33437)) >>> 0) % users.length];
      const at = start + (n * 43 % 24) * 3600000 + (n * 7 % 60) * 60000;
      if (at >= user.at && at <= now) calls.push({ userId: user.id, at });
    }
    for (let n = 0; n < 3; n++) {
      const user = users[(Math.abs(day * 31 + n * 71) + n * 13) % users.length];
      const at = start + (9 + n * 4) * 3600000;
      if (at >= user.at && at <= now) keys.push({ userId: user.id, at });
    }
  }
  return { users, logins, calls, keys };
}

const unique = (events, start, end, allowed) => new Set(events.filter(event => event.at >= start && event.at < end && allowed.has(event.userId)).map(event => event.userId)).size;
const count = (events, end, allowed) => events.filter(event => event.at < end && allowed.has(event.userId)).length;

export function userMetrics(data, range, now = Date.now()) {
  const window = usageWindow(range, now);
  if (!window) return null;
  const allowed = new Set(data.users.map(user => user.id));
  const byType = Object.fromEntries(userTypes.map(type => [type, new Set(data.users.filter(user => user.type === type).map(user => user.id))]));
  const { start, end, priorStart, priorEnd, hourly } = window;
  const measure = (from, to) => ({
    registered: data.users.filter(user => user.at < to && allowed.has(user.id)).length,
    added: data.users.filter(user => user.at >= from && user.at < to && allowed.has(user.id)).length,
    login: unique(data.logins, from, to, allowed),
    active: unique(data.calls, from, to, allowed),
    keys: count(data.keys, to, allowed),
  });
  const labels = [], dau = [], mau = [];
  const dauByType = { 企业: [], 个人: [] }, mauByType = { 企业: [], 个人: [] };
  for (let at = start; at < end; at += hourly ? 3600000 : DAY) {
    const to = Math.min(end, at + (hourly ? 3600000 : DAY));
    const date = dayOf(at);
    const dayStart = Date.parse(`${date}T00:00:00+08:00`);
    const monthStart = Date.parse(`${date.slice(0, 7)}-01T00:00:00+08:00`);
    labels.push(hourly ? `${String(new Date(at + 8 * 3600000).getUTCHours()).padStart(2, '0')}:00` : date.slice(5));
    dau.push(unique(data.logins, dayStart, to, allowed));
    mau.push(unique(data.logins, monthStart, to, allowed));
    for (const type of userTypes) {
      dauByType[type].push(unique(data.logins, dayStart, to, byType[type]));
      mauByType[type].push(unique(data.logins, monthStart, to, byType[type]));
    }
  }
  const priorDate = dayOf(priorEnd - 1);
  const priorDayStart = Date.parse(`${priorDate}T00:00:00+08:00`);
  const priorMonthStart = Date.parse(`${priorDate.slice(0, 7)}-01T00:00:00+08:00`);
  const priorDau = unique(data.logins, priorDayStart, priorEnd, allowed);
  const priorMau = unique(data.logins, priorMonthStart, priorEnd, allowed);
  return { current: measure(start, end), previous: measure(priorStart, priorEnd), labels, dau, mau, dauByType, mauByType, priorDau, priorMau, hourly };
}

export function userCallRows(state, data, range, now = Date.now()) {
  const window = usageWindow(range, now);
  if (!window) return [];
  const accounts = new Map(state.users.map(user => [user.id, user]));
  const models = new Map(state.models.map(model => [model.id, model]));
  const users = new Map();
  for (const user of data.users) {
    const account = accounts.get(user.id);
    if (!account || !Number.isFinite(user.at) || user.at >= window.end) continue;
    users.set(user.id, { id: user.id, name: account.name || account.nickname || user.id,
      calls: 0, input: null, output: null, total: null, pendingTokenCalls: 0, successful: 0, failed: 0 });
  }
  for (const request of latestRequests(state.requests)) {
    const user = users.get(request.userId);
    if (!user || diagnosticRequest(request)) continue;
    const at = Date.parse(request.createdAt);
    if (!(at >= window.start && at < window.end)) continue;
    user.calls++;
    const outcome = requestOutcome(request);
    if (outcome === 'success') user.successful++;
    if (outcome === 'failed') user.failed++;
    const model = models.get(request.modelId) || { type: request.modelType };
    const { unit, fields } = usageMeter(model, request);
    if (unit !== 'Token') continue;
    const value = request.usageConfirmed === false ? null : usageValue(request, fields);
    const metered = { unit, modelType: model.type, value };
    for (const metric of ['input', 'output', 'total']) {
      const tokens = usageTokenValue(metered, metric);
      if (tokens !== null) user[metric] = (user[metric] ?? 0) + tokens;
      else if (metric === 'total') user.pendingTokenCalls++;
    }
  }
  return [...users.values()].map(({ successful, failed, ...user }) => ({
    ...user,
    ...(!user.calls && { input: 0, output: 0, total: 0 }),
    errorRate: successful + failed ? failed * 100 / (successful + failed) : null,
  }));
}
