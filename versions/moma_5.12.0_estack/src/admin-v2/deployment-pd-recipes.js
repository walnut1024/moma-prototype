// Display values derived from GPUStack v2.3.1 gpustack/assets/pd-modes.yaml.
// GPUStack is licensed under Apache-2.0. Runtime placeholders stay unresolved here.
const routerConnection = [
  ['--host','{{worker_ip}}'],['--port','{{port}}'],
  ['--prometheus-host','{{worker_ip}}'],['--prometheus-port','{{ports.prometheus}}'],
];
const policies = ['random','round_robin','cache_aware','power_of_two'];
const managedPeers = ['--prefill','--decode'];
const nixlEnvironment = {
  VLLM_NIXL_SIDE_CHANNEL_HOST:'{{worker_ip}}',VLLM_NIXL_SIDE_CHANNEL_PORT:'{{ports.kv_side_channel}}',UCX_NET_DEVICES:'{{net_device}}',
};
const ascendEnvironment = {
  HCCL_IF_IP:'{{worker_ip}}',HCCL_SOCKET_IFNAME:'{{net_device}}',GLOO_SOCKET_IFNAME:'{{net_device}}',TP_SOCKET_IFNAME:'{{net_device}}',
};
const ascendParallel = {
  prefill:{tp_size:'{{roles.prefill.tensor_parallel_size}}',dp_size:'{{roles.prefill.data_parallel_size}}'},
  decode:{tp_size:'{{roles.decode.tensor_parallel_size}}',dp_size:'{{roles.decode.data_parallel_size}}'},
};
const emptyRecipe = {parameters:[],environment:{},owned:[]};
const entries = [
  ['vllm-nixl','vllm','nixl',true,false],
  ['vllm-mooncake','vllm','mooncake',false,true],
  ['sglang-mooncake','sglang','mooncake',false,true],
  ['sglang-nixl','sglang','nixl',false,true],
  ['vllm-ascend-mooncake','vllm','nixl',true,false],
];
const modes = new Map(entries.map(entry=>[entry[0],entry.slice(1)]));

export function pdRoleRecipe(mode, role, manualRouter = false) {
  const recipe = modes.get(mode);
  if (!recipe) return emptyRecipe;
  const [engine,transport,igw,bootstrap] = recipe;
  if (role==='router') {
    if (manualRouter) return {...emptyRecipe,owned:managedPeers};
    const sglang = engine==='sglang';
    const entrypoint = sglang ? 'python3 -m sglang_router.launch_router' : 'vllm-router';
    return {environment:{},owned:managedPeers,entrypoint,bootstrap,parameters:[
      ...(igw ? [['--enable-igw','']] : []),
      ...(sglang ? [['--pd-disaggregation','']] : [['--vllm-pd-disaggregation',''],['--kv-connector',transport]]),
      ...routerConnection,
      ['--prefill-policy','cache_aware',{options:[...policies,...(sglang ? ['manual','bucket'] : ['consistent_hash'])]}],
      ['--decode-policy','round_robin',{options:[...policies,sglang ? 'manual' : 'consistent_hash']}],
      ['--cb-failure-threshold','10',{min:1}],['--retry-max-retries','3',{min:0}],
    ]};
  }
  const prefill = role==='prefill';
  if (engine==='sglang') {
    return {owned:[],parameters:[
      ['--disaggregation-mode',role],
      ...(prefill ? [['--disaggregation-bootstrap-port','{{ports.bootstrap}}']] : []),
      ['--disaggregation-transfer-backend',transport],
    ],environment:transport==='nixl' ? {SGLANG_DISAGGREGATION_NIXL_BACKEND:'UCX',UCX_NET_DEVICES:'{{net_device}}'}
      : {MC_TCP_ENABLE_CONNECTION_POOL:'1',...(prefill ? {SGLANG_ENABLE_FAILED_SESSION_PROBE:'true'} : {})}};
  }
  const polarity = prefill ? 'kv_producer' : 'kv_consumer';
  const ascend = mode==='vllm-ascend-mooncake';
  const connector = ascend ? {kv_connector:'{{pd_connector}}',kv_role:polarity,kv_port:'{{ports.kv_port}}',kv_connector_extra_config:ascendParallel}
    : {kv_connector:transport==='nixl' ? 'NixlConnector' : 'MooncakeConnector',kv_role:polarity,
      kv_load_failure_policy:'{{kv_load_failure_policy}}',...(transport==='nixl' && prefill ? {kv_connector_extra_config:{kv_lease_duration:'{{kv_lease_duration}}'}} : {})};
  return {owned:[],parameters:[['--kv-transfer-config',JSON.stringify(connector)]],environment:ascend ? ascendEnvironment
    : transport==='nixl' ? nixlEnvironment : prefill ? {VLLM_MOONCAKE_BOOTSTRAP_PORT:'{{ports.bootstrap}}'} : {}};
}

export function pdRouterCommand(role = {}, backend, mode) {
  const definition = role.backend && role.backend===backend?.name ? backend : undefined;
  const version = role.backendVersion || definition?.version;
  const entry = definition?.compatibleVersions?.find(item=>item.version===version);
  if (role.containerCommand?.trim()) return {source:'role',command:role.containerCommand};
  if (entry?.command?.trim()) return {source:'version',command:entry.command};
  if (definition?.command?.trim()) return {source:'backend',command:definition.command};
  const recipe = pdRoleRecipe(mode,'router');
  if (recipe.entrypoint) return {source:'recipe',command:[recipe.entrypoint,...recipe.parameters.map(([name,value])=>value ? name+' '+value : name)].join('\n')};
  return {source:'missing'};
}

export function pdRouterExample(mode) {
  const recipe = pdRoleRecipe(mode,'router');
  const prefill = '--prefill {{p.url}}'+(recipe.bootstrap ? ' {{p.ports.bootstrap}}' : '');
  return [recipe.entrypoint || 'your-router',
    ...recipe.parameters.filter(([, , rule])=>!rule).map(([name,value])=>value ? name+' '+value : name),
    ...(!recipe.entrypoint ? ['--host {{worker_ip}}','--port {{port}}'] : []),
    '{% for p in prefill %}',prefill,'{% endfor %}',
    '{% for d in decode %}','--decode {{d.url}}','{% endfor %}'].join('\n');
}

export function pdNamedParameter(line) {
  const match = /^\s*(--[\w.-]+)(?:[=\s]+(.*))?$/.exec(String(line ?? ''));
  return match ? [match[1],match[2] ?? ''] : [];
}

export function roleEnvironmentEntries(value) {
  return String(value ?? '').split(/\r?\n/).filter(line=>line.trim()).map(line=>{
    const divider = line.indexOf('=');
    return divider<0 ? [line,''] : [line.slice(0,divider),line.slice(divider+1)];
  });
}

export function pdEffectiveEnvironment(parent, role) {
  if (role?.environment==null) return Object.fromEntries(roleEnvironmentEntries(parent));
  return Object.fromEntries([...(role.environmentMode==='merge' ? roleEnvironmentEntries(parent) : []),...roleEnvironmentEntries(role.environment)]);
}
