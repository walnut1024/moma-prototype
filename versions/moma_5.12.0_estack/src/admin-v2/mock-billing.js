import { priceRequest } from './operations-analysis.js';

export function billingPeriod(at=Date.now()) {
  return new Date(new Date(at).getTime()+8*3600000).toISOString().slice(0,7);
}

export function mockCharge(state, row) {
  if(row.httpStatus!==200)return null;
  if(row.charge)return {amount:row.charge.amount/1e6,currency:row.charge.currency};
  const model=state.models.find(item=>item.id===row.modelId);
  return priceRequest(row.priceSnapshot,row,model);
}
