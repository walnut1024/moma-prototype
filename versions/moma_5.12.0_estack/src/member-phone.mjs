export function normalizeMemberPhone(value) {
  const phone = String(value ?? "").trim().replace(/^'(?=\+)/, "").replace(/[\s()-]/g, "");
  return /^\+861[3-9]\d{9}$/.test(phone) ? phone.slice(3) : phone;
}

export function memberPhoneError(value) {
  const phone = normalizeMemberPhone(value);
  if (!phone) return "请填写手机号";
  return !phone.startsWith("+86") && /^(?:1[3-9]\d{9}|\+[1-9]\d{7,14})$/.test(phone) ? "" : "手机号格式错误，请填写 11 位大陆手机号或带 +国家区号的号码";
}

export function maskMemberPhone(value) {
  const phone = normalizeMemberPhone(value);
  return phone ? `${phone.slice(0, 3)}****${phone.slice(-4)}` : "未填写";
}

export function displayMemberAccount(value) {
  return memberPhoneError(value) ? value : maskMemberPhone(value);
}
