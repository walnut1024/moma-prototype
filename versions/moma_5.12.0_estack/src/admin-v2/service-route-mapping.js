const interfaces={
  text:{protocol:'OpenAI',path:'/v1/chat/completions',suffixes:['/chat/completions'],types:['text','multimodal']},
  image:{protocol:'图像生成',path:'/v1/images/generations',suffixes:['/images/generations'],types:['image','visual']},
  video:{protocol:'视频生成',path:'/v1/videos',suffixes:['/videos','/videos/generations'],types:['video','visual']},
  speech:{protocol:'语音合成',path:'/v1/audio/speech',suffixes:['/audio/speech'],types:['audio']},
  transcription:{protocol:'语音识别',path:'/v1/audio/transcriptions',suffixes:['/audio/transcriptions'],types:['audio']},
};
function modelInterface(model) {
  if (['text','multimodal'].includes(model?.type)) return interfaces.text;
  if (['image','video'].includes(model?.type)) return interfaces[model.type];
  if (model?.type==='audio') {
    const tasks=model.profile?.tasks || [],speech=tasks.includes('语音合成'),transcription=tasks.includes('语音识别');
    if (speech!==transcription) return speech?interfaces.speech:interfaces.transcription;
    return {protocol:'',path:'',reason:speech?'模型包含多种音频任务，请先明确平台调用接口。':'请先在模型信息中明确语音合成或语音识别任务。'};
  }
  return {protocol:'',path:'',reason:'当前模型类型尚未配置协议适配规则。',unsupported:true};
}
export function platformRouteInterface(model) {
  const {protocol,path}=modelInterface(model);
  return {protocol,path};
}

// Compatibility describes a declared interface convention, not a verified upstream request or converter.
export function routeMappingStatus(state,service,channel) {
  const model=service?.model,contract=modelInterface(model);
  const endpoint=channel?.endpoint || state.endpoints?.find(item=>item.id===channel?.endpointId);
  const provider=channel?.provider || state.providers?.find(item=>item.id===endpoint?.providerId);
  const catalogueId=channel?.catalogueModelId || channel?.upstreamModelId;
  const association=provider?.catalogConnections?.find(item=>!item.deletedAt && item.endpointId===endpoint?.id && item.modelId===catalogueId && item.upstreamModelId===channel?.upstreamModelId);
  const upstreamUrl=channel?.url || endpoint?.baseUrl || '';
  const address=association?.apiAddresses?.find(item=>item.baseUrl===upstreamUrl);
  const upstreamProtocol=address?.protocol || endpoint?.protocol || '';
  const upstreamType=provider?.catalogModels?.find(item=>item.modelId===catalogueId)?.type;
  const result={valid:false,status:'待配置',reason:'',platformProtocol:contract.protocol,upstreamProtocol,platformPath:contract.path,upstreamPath:'',platformModelId:service?.callId || (service?.providerId?'':model?.modelId) || '',upstreamModelId:channel?.upstreamModelId || ''};
  let url;
  try {url=new URL(upstreamUrl);result.upstreamPath=url.pathname;} catch { /* Missing or invalid addresses remain unconfigured. */ }
  const reject=(status,reason)=>({...result,status,reason});
  if (contract.reason) return reject(contract.unsupported?'待适配':'待配置',contract.reason);
  if (!result.platformModelId) return reject('待配置','请先配置当前服务的对外调用 ID。');
  if (!result.upstreamModelId || /\s/.test(result.upstreamModelId)) return reject('待配置','请先在供应管理配置有效的上游模型 ID。');
  if (!endpoint || !provider || (channel.modelId && channel.modelId!==model.id) || (service.providerId && service.providerId!==provider.id)) return reject('待配置','渠道与当前模型服务或供应商的关联不完整。');
  if (!upstreamProtocol) return reject('待配置','请先在供应管理明确渠道协议。');
  if (!url) return reject('待配置','请先在供应管理配置完整的请求地址。');
  if (!['http:','https:'].includes(url.protocol) || url.username || url.password || url.search || url.hash || url.pathname==='/' || /^\/v\d+\/?$/.test(url.pathname)) return reject('待配置','请求地址 需为无嵌入凭据的完整接口地址。');
  if (upstreamType && !contract.types.includes(upstreamType)) return reject('待适配','供应模型类型与平台接口不同，尚未提供对应的数据转换适配。');
  const normalizedPath=url.pathname.replace(/\/$/,''),knownPath=contract.suffixes.some(suffix=>normalizedPath===suffix || normalizedPath.endsWith(suffix));
  if (!knownPath) return reject('待适配','渠道接口路径不在当前支持的同类接口范围，需先完成协议适配。');
  if (upstreamProtocol==='OpenAI') return {...result,valid:true,status:'已配置'};
  if (upstreamProtocol==='其他' && contract!==interfaces.text) {
    if (!upstreamType) return reject('待配置','渠道使用其他协议，请先明确供应模型类型，确认接口数据格式。');
    return {...result,valid:true,status:'已配置'};
  }
  return reject('待适配',`尚未提供 ${contract.protocol} 到 ${upstreamProtocol} 的协议转换适配。`);
}
