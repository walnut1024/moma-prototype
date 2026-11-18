import { projectAccess, requireProject, projectModelEnabled } from './project-access.mjs';
import { maskApiKey, parseIpAllowlist } from './api-key-utils.mjs';

export function maskedProjectKeys(rows) {
  return rows.map(({key,...row}) => ({ ...row, secretPreview:maskApiKey(key || row.secretPreview || '*****') }));
}

export function changeProjectKeys({ state, identity, link }, rows, { projectId, billing = '按量付费', subscriptionId }, services) {
  const project = requireProject(projectAccess(state, identity, link).projects, projectId, true);
  if (!['按量付费', 'Token Plan'].includes(billing) || (billing === 'Token Plan') !== Boolean(subscriptionId)) throw Error('API Key 计费方式无效');
  const scoped=state.apiKeys.filter(row=>row.tenantId===identity.tenantId && row.projectId===project.id && row.kind!=='experience' && row.status!=='已删除' && (row.billingType || '按量付费')===billing && (row.subscriptionId || '')===(subscriptionId || ''));
  const ids = new Set(), digests = new Set(state.apiKeys.map(row=>row.credentialDigest).filter(Boolean));
  const actions = [], next = structuredClone(state);
  const at = new Date().toISOString();
  if(subscriptionId&&!state.orders.some(row=>row.id===subscriptionId&&row.tenantId===identity.tenantId&&['已开通','生效中'].includes(row.status)&&(!row.expiresAt || Date.parse(row.expiresAt)>Date.now())))throw Error('套餐归属或状态无效');
  const allowed=new Set(services.filter(item=>projectModelEnabled(project, item.modelKey)).map(item=>item.modelKey));
  const mapped=rows.map(row=>{
    if(!row.id || row.id.startsWith('experience:') || ids.has(row.id))throw Error('API Key ID 无效或重复');ids.add(row.id);
    const existing=state.apiKeys.find(item=>item.id===row.id);
    if(existing && !scoped.some(item=>item.id===row.id))throw Error('无权修改其他客户或用户的 API Key');
    const name=String(row.name || '').trim();if(name.length<2 || name.length>80)throw Error('名称需为2至80个字符');
    const modelIds=row.models===null?[...allowed]:(row.models || []).map(code=>state.models.find(item=>item.modelId===code)?.id || code);
    if(modelIds.some(id=>!allowed.has(id) && !existing?.modelIds?.includes(id)))throw Error('选择了未授权模型');
    const quotaLimit=row.quotaEnabled===false?null:(row.quotaLimit !== undefined ? row.quotaLimit : existing?.quotaLimit ?? null);
    if(quotaLimit!==null&&quotaLimit!==undefined&&(!Number.isSafeInteger(quotaLimit)||quotaLimit<0))throw Error('额度必须为非负整数');
    for(const field of ['tpmLimit','qpmLimit'])if(row[field]!=null&&(!Number.isSafeInteger(row[field])||row[field]<1))throw Error('TPM 和 QPM 上限必须为正整数');
    const budgetMicros = row.budgetMicros ?? null, expiresAt = row.expiresAt || null;
    if (budgetMicros !== null && (billing !== '按量付费' || !Number.isSafeInteger(budgetMicros) || budgetMicros < 1)) throw Error('API Key 消费预算无效');
    const planBudgetTokens = row.planBudgetTokens ?? null;
    if (planBudgetTokens !== null && (billing !== 'Token Plan' || !Number.isSafeInteger(planBudgetTokens) || planBudgetTokens < 1)) throw Error('套餐 Key 的 Token 预算无效');
    if (expiresAt !== null && (typeof expiresAt !== 'string' || !Number.isFinite(Date.parse(expiresAt)) ||
        new Date(expiresAt).toISOString() !== expiresAt)) throw Error('API Key 有效期无效');
    const rotates = existing && row.credentialVersion === (existing.credentialVersion || 1) + 1;
    const hasNewSecret = typeof row.secretPreview === 'string' && /^(?:[\w-]{0,8})\*{5}(?:[\w-]{0,4})$/.test(row.secretPreview);
    if (rotates && !hasNewSecret) throw Error('API Key 重置缺少新凭证');
    const newDigest = row.credentialDigest;
    if (newDigest !== undefined && (typeof newDigest !== 'string' || !/^[0-9a-f]{64}$/.test(newDigest) ||
        digests.has(newDigest) || existing && !rotates || !hasNewSecret)) {
      throw Error('API Key 凭证摘要无效');
    }
    if (newDigest) digests.add(newDigest);
    const grantId='tenant-grant:'+row.id,grant=next.grants.find(item=>item.id===grantId)||next.grants.find(item=>item.subjectType==='key'&&item.subjectId===row.id&&item.status==='生效中');
    if(row.quotaLimit!==undefined || row.quotaEnabled===false){
      const period={'日':'day','周':'week','月':'month','总额度':'total','不限额度':'total'}[row.quotaType] || 'day';
      if(quotaLimit!==null){
        if(grant){if(grant.limit!==quotaLimit||grant.period!==period)Object.assign(grant,{limit:quotaLimit,period,used:0});Object.assign(grant,{modelIds,status:'生效中'});}
        else next.grants.push({id:grantId,subjectType:'key',subjectId:row.id,modelIds,period,limit:quotaLimit,used:0,status:'生效中'});
      }else for(const item of next.grants)if(item.subjectType==='key'&&item.subjectId===row.id)item.status='已停用';
    }
    const record = {...existing,id:row.id,keyId:existing?.keyId || row.id,name,description:String(row.desc || ''),tenantId:identity.tenantId,projectId:project.id,ownerId:existing?.ownerId || link.backendUserId,modelIds,status:row.enabled?'有效':'停用',billingType:billing,quotaType:row.quotaType,quotaLimit,tpmLimit:row.tpmLimit ?? null,qpmLimit:row.qpmLimit ?? null,...(subscriptionId?{subscriptionId}:{}),ipAllowlist:parseIpAllowlist((row.ips || []).join('\n')),secretPreview:(!existing || rotates) && hasNewSecret ? row.secretPreview : existing?.secretPreview || '****',credentialVersion:rotates ? row.credentialVersion : existing?.credentialVersion || 1,
      budgetMicros,planBudgetTokens,expiresAt,createdAt:existing?.createdAt || at};
    if (newDigest) record.credentialDigest = newDigest;
    else if (rotates) delete record.credentialDigest;
    if (!existing || JSON.stringify(record) !== JSON.stringify(existing)) {
      const action = !existing ? '创建 API Key' : rotates ? '重置 API Key' : existing.status !== record.status
        ? (row.enabled ? '启用 API Key' : '停用 API Key') : '编辑 API Key';
      actions.push({ action, objectId: row.id });
      record.updatedAt = at;
    }
    return record;
  });
  const deleted = scoped.filter(row => !ids.has(row.id)).map(row => ({ ...row, status: '已删除', updatedAt: at }));
  for (const row of deleted) {
    actions.push({ action: '删除 API Key', objectId: row.id });
    for (const grant of next.grants) if (grant.subjectType === 'key' && grant.subjectId === row.id) grant.status = '已停用';
  }
  next.apiKeys = next.apiKeys.filter(row => !scoped.some(item => item.id === row.id)).concat(mapped, deleted);
  return { next, actions };
}
