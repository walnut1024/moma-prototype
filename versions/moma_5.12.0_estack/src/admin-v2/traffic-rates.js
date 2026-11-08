export const trafficUnits = { rpm: '请求/分钟', tpm: '百万 Tokens/分钟' };

export const validTrafficLimit = limit => Number.isSafeInteger(limit?.rpm) && limit.rpm > 0
  && Number.isSafeInteger(limit?.tpm) && limit.tpm > 0;

export function parseTrafficRate(input, metric) {
  const text = input.trim();
  if (!(metric === 'tpm' ? /^\d+(\.\d{1,6})?$/ : /^\d+$/).test(text)) return null;
  const [whole, fraction = ''] = text.split('.');
  const value = Number(metric === 'tpm' ? whole + fraction.padEnd(6, '0') : whole);
  return Number.isSafeInteger(value) && value > 0 ? value : null;
}

const grouped = new Intl.NumberFormat('zh-CN');

export function trafficRateText(value, metric, display = false) {
  if (!Number.isSafeInteger(value)) return display ? '—' : '';
  const digits = String(value).padStart(metric === 'tpm' ? 7 : 1, '0');
  const whole = metric === 'tpm' ? digits.slice(0, -6) : digits;
  const fraction = metric === 'tpm' ? digits.slice(-6).replace(/0+$/, '') : '';
  return (display ? grouped.format(Number(whole)) : whole) + (fraction ? '.' + fraction : '');
}
