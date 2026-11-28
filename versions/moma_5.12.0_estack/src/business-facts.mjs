import { latestRequests, requestIdentity } from './request-identity.mjs';
import {getMockOperationalRequests} from './admin-v2/mock-onboarding-service.js';
import { userBusinessData as projectUserBusinessData } from './user-business-data.mjs';
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
  return projectUserBusinessData(state, requests);
}
