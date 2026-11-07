export const ROUTING_POLICIES = {
  weighted: {label:'加权随机路由',code:'simple-shuffle',description:'根据渠道权重分配请求，并排除达到已配置 RPM / TPM 限额的渠道。'},
  load: {label:'最少并发路由',code:'least-busy',description:'优先选择当前在途请求数最少的渠道。'},
  tpm: {label:'最低 TPM 路由',code:'usage-based-routing-v2',description:'优先选择当前分钟 Token 使用量较低且未超过限额的渠道。'},
  latency: {label:'最低延迟路由',code:'latency-based-routing',description:'根据近期响应延迟选择渠道。'},
  cost: {label:'最低成本路由',code:'cost-based-routing',description:'优先选择采购成本最低且满足限额的渠道；仅比较相同计费口径。'},
};
export const unifiedRouteStrategies = Object.keys(ROUTING_POLICIES);
export function withinRouteLimits(channel) {
  return [['rpmLimit','requestsPerMinute'],['tpmLimit','tokensPerMinute']].every(([limit,usage])=>{
    if(channel[limit]==null)return true;
    if(!Number.isSafeInteger(channel[limit]) || channel[limit]<0)throw Error('渠道 RPM / TPM 限额配置无效');
    if(channel[usage]==null)throw Error('配置 RPM / TPM 限额的渠道缺少实际分钟用量');
    return channel[usage]<channel[limit];
  });
}
