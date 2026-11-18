import { diagnosticRequest, latestRequests, requestIdentity } from './request-identity.mjs';
import {getMockOperationalRequests} from './admin-v2/mock-onboarding-service.js';
export function observedUsageTotal(usage={}) {
  const values=Object.entries(usage).filter(([key,value])=>!['cached','cacheWrite','thinking'].includes(key)&&Number.isFinite(value)).map(([,value])=>value);
  return values.length?values.reduce((sum,value)=>sum+value,0):null;
}
export function sharedRequests(state) {
  const rows = new Map(latestRequests(state.requests).map(row => [requestIdentity(row), row]));
  for (const row of getMockOperationalRequests()) {
    const identity = requestIdentity(row);
    if (identity && !rows.has(identity)) rows.set(identity, row);
  }
  return [...rows.values()].map(row=>row.callId&&!row.publicModelId?{...row,publicModelId:row.callId}:row);
}
export function userBusinessData(state,requests=sharedRequests(state)) {
  const accounts=state.accountUserIds && new Set(state.accountUserIds);
  return {users:state.users.filter(row=>(!accounts || accounts.has(row.id)) && (row.registeredAt || row.createdAt)).map(row=>({id:row.id,type:state.tenants.some(tenant=>tenant.ownerId===row.id&&tenant.type==='个人')?'个人':'企业',at:Date.parse(row.registeredAt || row.createdAt)})),logins:(state.identityEvents || []).filter(row=>row.type==='login').map(row=>({userId:row.userId,at:Date.parse(row.at)})),calls:latestRequests(requests).filter(row=>row.userId && !diagnosticRequest(row)).map(row=>({userId:row.userId,at:Date.parse(row.createdAt)})),keys:state.apiKeys.filter(row=>row.ownerId).map(row=>({userId:row.ownerId,at:Date.parse(row.createdAt)}))};
}
