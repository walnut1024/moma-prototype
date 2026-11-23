export const ROUTING_POLICIES = {
  weighted: {label:'加权随机',code:'simple-shuffle',description:'根据上游模型权重分配请求，并排除达到已配置 RPM / TPM 限额的上游模型。'},
  load: {label:'最少并发',code:'least-busy',description:'优先选择当前在途请求数最少的上游模型。'},
  tpm: {label:'按用量分流',code:'usage-based-routing-v2',description:'优先选择当前分钟 Token 使用量较低且未超过限额的上游模型。'},
  latency: {label:'低延迟优先',code:'latency-based-routing',description:'根据近期响应延迟选择上游模型。'},
  cost: {label:'成本优先',code:'cost-based-routing',description:'优先选择采购成本最低且满足限额的上游模型；仅比较相同计费口径。'},
};
export const unifiedRouteStrategies = Object.keys(ROUTING_POLICIES);
export function withinRouteLimits(channel) {
  return [['rpmLimit','requestsPerMinute'],['tpmLimit','tokensPerMinute']].every(([limit,usage])=>{
    if(channel[limit]==null)return true;
    if(!Number.isSafeInteger(channel[limit]) || channel[limit]<0)throw Error('上游模型 RPM / TPM 限额配置无效');
    if(channel[usage]==null)throw Error('配置 RPM / TPM 限额的上游模型缺少实际分钟用量');
    return channel[usage]<channel[limit];
  });
}
