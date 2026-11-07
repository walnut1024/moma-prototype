export function materialModalitiesLabel(profile) {
  return `${(profile.inputModalities || []).join('、') || '未填写'} → ${(profile.outputModalities || []).join('、') || '未填写'}`;
}
