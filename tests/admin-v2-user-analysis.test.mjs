import { test } from 'node:test';
import assert from 'node:assert/strict';
import { userMetrics } from '../src/admin-v2/user-analysis.js';

const at = value => Date.parse(`${value}+08:00`);
const now = at('2026-09-24T12:00:00');
const data = {
  users: [
    { id: 'a', type: '企业', at: at('2026-08-01T09:00:00') },
    { id: 'b', type: '企业', at: at('2026-09-24T08:00:00') },
    { id: 'c', type: '个人', at: at('2026-09-24T09:00:00') },
  ],
  logins: [
    { userId: 'a', at: at('2026-09-23T09:00:00') },
    { userId: 'b', at: at('2026-09-24T09:00:00') },
    { userId: 'b', at: at('2026-09-24T10:00:00') },
    { userId: 'c', at: at('2026-09-24T11:00:00') },
  ],
  calls: [{ userId: 'b', at: at('2026-09-24T10:00:00') }, { userId: 'b', at: at('2026-09-24T11:00:00') }],
  keys: [{ userId: 'a', at: at('2026-09-01T10:00:00') }, { userId: 'b', at: at('2026-09-24T09:00:00') }],
};

test('user counts use identity events, deduplicate logins and calls, and compare equal elapsed windows', () => {
  const result = userMetrics(data, { start: '2026-09-24', end: '2026-09-24' }, now);
  assert.deepEqual(result.current, { registered: 3, added: 2, login: 2, active: 1, keys: 2 });
  assert.deepEqual(result.previous, { registered: 1, added: 0, login: 1, active: 0, keys: 1 });
  assert.equal(result.dau.at(-1), 2);
  assert.equal(result.mau.at(-1), 3);
  assert.equal(result.priorDau, 1);
  assert.equal(result.priorMau, 1);
  assert.equal(result.dauByType.企业.at(-1), 1);
  assert.equal(result.dauByType.个人.at(-1), 1);
  assert.equal(result.mauByType.企业.at(-1), 2);
  assert.equal(result.mauByType.个人.at(-1), 1);
  assert.equal(result.dau.at(-1), result.dauByType.企业.at(-1) + result.dauByType.个人.at(-1));
});

test('MAU resets at the Beijing calendar-month boundary instead of summing DAU', () => {
  const acrossMonth = {
    ...data,
    users: data.users.map(user => user.id === 'b' ? { ...user, at: at('2026-08-01T09:00:00') } : user),
    logins: [
      { userId: 'a', at: at('2026-08-31T09:00:00') },
      { userId: 'a', at: at('2026-09-01T09:00:00') },
      { userId: 'b', at: at('2026-09-01T10:00:00') },
    ],
  };
  const result = userMetrics(acrossMonth, { start: '2026-08-31', end: '2026-09-01' }, now);
  assert.deepEqual(result.dau, [1, 2]);
  assert.deepEqual(result.mau, [1, 2]);
  assert.deepEqual(result.mauByType.企业, [1, 2]);
  assert.deepEqual(result.mauByType.个人, [0, 0]);
  assert.equal(result.priorDau, 0);
});
