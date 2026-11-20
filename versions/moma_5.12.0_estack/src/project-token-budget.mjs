export const PROJECT_BUDGET_PERIODS = {
  total:'永不重置', hour:'每小时', day:'每天', week:'每周', month:'每月',
};

const MILLION = 1_000_000;
const HOUR = 3_600_000;
const DAY = 24 * HOUR;
const BEIJING_OFFSET = 8 * HOUR;

export function activeProjectSpendBudget(project) {
  return project && !Object.hasOwn(project, 'tokenBudget') ? project.spendBudget : null;
}

export function millionTokens(tokens) {
  if (tokens == null) return '';
  const digits = String(tokens).padStart(7, '0');
  const fraction = digits.slice(-6).replace(/0+$/, '');
  return digits.slice(0, -6) + (fraction ? '.' + fraction : '');
}

function parseLimit(value, label, scale = 1) {
  const text = String(value ?? '').trim();
  if (value == null || typeof value === 'string' && !text) return null;
  const valid = scale === MILLION ? /^\d+(\.\d{1,6})?$/.test(text) : /^\d+$/.test(text);
  const [units, fraction = ''] = text.split('.');
  const limit = Number(scale === MILLION ? units + fraction.padEnd(6, '0') : units);
  if (!['string','number'].includes(typeof value) || !valid || !Number.isSafeInteger(limit) || limit <= 0) {
    throw Error(label + (scale === MILLION ? '须为正数，最多保留 6 位小数' : '须为正整数'));
  }
  return limit;
}

export function projectTokenBudget(input) {
  const period = input?.period;
  if (typeof period !== 'string' || !Object.hasOwn(PROJECT_BUDGET_PERIODS, period)) throw Error('请选择有效的预算周期');
  const limit = parseLimit(input.limit, 'Token 预算', MILLION);
  const tpm = parseLimit(input.tpm, 'TPM');
  const rpm = parseLimit(input.rpm, 'RPM');
  const dailyBatchLimit = parseLimit(input.dailyBatchLimit, '每日批处理 Token 限额', MILLION);
  return limit || tpm || rpm || dailyBatchLimit || period !== 'total'
    ? { limit, period, tpm, rpm, dailyBatchLimit } : null;
}

export function projectBudgetStart(period, at) {
  const local = at + BEIJING_OFFSET;
  if (period === 'hour') return Math.floor(local / HOUR) * HOUR - BEIJING_OFFSET;
  const midnight = Math.floor(local / DAY) * DAY;
  if (period === 'day') return midnight - BEIJING_OFFSET;
  const date = new Date(local);
  if (period === 'week') {
    const daysSinceMonday = (date.getUTCDay() + 6) % 7;
    return midnight - daysSinceMonday * DAY - BEIJING_OFFSET;
  }
  if (period === 'month') return Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), 1) - BEIJING_OFFSET;
  return -Infinity;
}
