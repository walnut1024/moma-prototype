import {getMockOperationalRequests} from './admin-v2/mock-onboarding-service.js';
export function observedUsageTotal(usage={}) {
  const values=Object.entries(usage).filter(([key,value])=>!['cached','cacheWrite','thinking'].includes(key)&&Number.isFinite(value)).map(([,value])=>value);
  return values.length?values.reduce((sum,value)=>sum+value,0):null;
}
export function sharedRequests(state) {
  const rows=new Map(state.requests.map(row=>[row.requestId || row.id,row]));
  for(const row of getMockOperationalRequests())if(!rows.has(row.requestId))rows.set(row.requestId,row);
  return [...rows.values()].map(row=>row.callId&&!row.publicModelId?{...row,publicModelId:row.callId}:row);
}
export function userBusinessData(state) {
  return {users:state.users.filter(row=>row.registeredAt || row.createdAt).map(row=>({id:row.id,type:state.tenants.some(tenant=>tenant.ownerId===row.id&&tenant.type==='个人')?'个人':'企业',at:Date.parse(row.registeredAt || row.createdAt)})),logins:(state.identityEvents || []).filter(row=>row.type==='login').map(row=>({userId:row.userId,at:Date.parse(row.at)})),calls:sharedRequests(state).filter(row=>row.userId).map(row=>({userId:row.userId,at:Date.parse(row.createdAt)})),keys:state.apiKeys.filter(row=>row.ownerId).map(row=>({userId:row.ownerId,at:Date.parse(row.createdAt)}))};
}
