export function basicChannelUsageButton(models,check='') {
  return !check && models.length>0 && models.every(row=>['text','multimodal','embedding','rerank'].includes(row.type) && !row.check);
}

export function channelTestUsageAuthorized(models,{check='',explicitBasicClick=false,consent=false}={}) {
  return models.length>0 && (basicChannelUsageButton(models,check) ? explicitBasicClick===true : consent===true);
}
