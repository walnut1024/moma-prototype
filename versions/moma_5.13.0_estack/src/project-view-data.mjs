export function projectLogRecords(state, records) {
  return records.map(row => {
    const key = state.apiKeys.find(item => item.id === row.keyId);
    const supply = state.modelSupplies?.find(item => item.id === row.supplyId);
    const order = state.orders.find(item => item.id === row.subscriptionId);
    const usage = row.usage || {};
    return { ...row, id: row.requestId, time: new Date(Date.parse(row.createdAt) + 28800000).toISOString().replace('T', ' ').replace('Z', ''), model: row.callModelId || state.models.find(item => item.id === row.modelId)?.name || row.modelId, status: row.httpStatus, billing: row.billing || (order ? 'Token Plan' : '按量付费'), source: row.source === 'API' ? 'API 调用' : row.source, keyName: key?.name, apiKey: key?.managed ? '系统托管' : key?.secretPreview, endpointName: supply?.name, resource: state.products.find(item => item.id === order?.productId)?.name, resourceId: order?.id, input: usage.input, output: usage.output, cache: usage.cached, total: usage.input == null || usage.output == null ? null : usage.input + usage.output, first: row.ttftMs, duration: row.durationMs, charge: row.customerCharge, projectName: state.projects.find(item => item.id === row.projectId)?.name, userName: state.users.find(item => item.id === row.userId)?.name };
  });
}

export const usageType = model => model?.type==='audio' ? (model.profile?.tasks?.includes('语音识别')?'语音识别':'语音合成') : ({ text:'文本模型',multimodal:'多模态模型',image:'图片生成',video:'视频生成',tts:'语音合成',asr:'语音识别',embedding:'向量模型',rerank:'重排模型' }[model?.type] || '文本模型');
export function projectUsageData({ records, state, start, end, minutes = 60, now = new Date(), billing = '全部', types, modelIds, keyIds }) {
  const from=Date.parse(start+'T00:00:00+08:00'), until=Math.min(Date.parse(end+'T00:00:00+08:00')+86400000, +now), step=minutes*60000;
  const rows=records.filter(row=>Date.parse(row.createdAt)>=from && Date.parse(row.createdAt)<until && (billing==='全部' || (row.billing || '按量付费')===billing) && (!types || types.includes(usageType(state.models.find(model=>model.id===row.modelId)))) && (modelIds==null || modelIds.includes(row.modelId)) && (keyIds==null || keyIds.includes(row.keyId)));
  function aggregate(items, duration) {
    const sum=key=>{const values=items.map(row=>row.usage?.[key]).filter(Number.isFinite);return values.length ? values.reduce((a,b)=>a+b,0) : null;};
    const input=sum('input'),output=sum('output'),total=input==null || output==null ? null : input+output;
    const success=items.filter(row=>row.httpStatus>=200&&row.httpStatus<300).length, timings=items.filter(row=>row.httpStatus===200).map(row=>row.durationMs).filter(Number.isFinite).sort((a,b)=>a-b),firsts=items.map(row=>row.ttftMs).filter(Number.isFinite);
    const durationMinutes=Math.max(duration/60000,1/60), modelRequests={}, minuteTokens={};
    for(const row of items) {const name=state.models.find(model=>model.id===row.modelId)?.name || row.modelId;modelRequests[name]=(modelRequests[name]||0)+1;const minute=Math.floor(Date.parse(row.createdAt)/60000);if(Number.isFinite(row.usage?.input)&&Number.isFinite(row.usage?.output))minuteTokens[minute]=(minuteTokens[minute]||0)+row.usage.input+row.usage.output;}
    return { requests:items.length,models:Object.keys(modelRequests).length,modelRequests,success,failure:items.length-success,successRate:items.length?success/items.length*100:null,failureRate:items.length?(items.length-success)/items.length*100:null,input,output,total,cache:sum('cached'),images:sum('images'),seconds:sum('seconds'),audio:sum('seconds'),characters:sum('characters'),vectors:sum('vectors'),latency:timings.length?timings.reduce((a,b)=>a+b,0)/timings.length/1000:null,latencyMin:timings.length?timings[0]/1000:null,latencyMax:timings.length?timings.at(-1)/1000:null,latencyP95:timings.length?timings[Math.ceil(timings.length*.95)-1]/1000:null,ttft:firsts.length?firsts.reduce((a,b)=>a+b,0)/firsts.length/1000:null,rpm:items.length/durationMinutes,tpm:total==null?null:total/durationMinutes,peakTpm:total==null?null:Math.max(0,...Object.values(minuteTokens)),inputMinute:input==null?null:input/durationMinutes,outputMinute:output==null?null:output/durationMinutes,outputSecond:output==null?null:output/(durationMinutes*60),status2:success,status4:items.filter(row=>row.httpStatus>=400&&row.httpStatus<500).length,status5:items.filter(row=>row.httpStatus>=500).length,charge:items.some(row=>row.customerCharge==null)?null:items.reduce((sum,row)=>sum+row.customerCharge,0) };
  }
  const buckets=[];
  if(Number.isFinite(from)&&Number.isFinite(until)&&until>from&&until-from<=32*86400000)for(let time=from;time<until;time+=step)buckets.push({time,...aggregate(rows.filter(row=>Date.parse(row.createdAt)>=time&&Date.parse(row.createdAt)<time+step),Math.min(step,until-time))});
  return {summary:aggregate(rows,until-from),buckets};
}
