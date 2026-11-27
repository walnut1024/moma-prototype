import { validateDeploymentSchedule } from './deployment-schedule.js';
import { pdNamedParameter, pdRoleRecipe } from './deployment-pd-recipes.js';

export const deploymentSources = ['模型库', 'Hugging Face', 'ModelScope', '本地路径'];
export const deploymentRuntimeModes = ['已登记运行时镜像', '推理后端版本', '自定义镜像'];
export const placementModes = ['自动调度', '指定节点', '指定 GPU'];
export const placementStrategies = [['spread','Spread'],['binpack','Binpack']];
export const pdModes = {
  vLLM:['vllm-nixl','vllm-mooncake','vllm-ascend-mooncake','custom'],
  SGLang:['sglang-mooncake','sglang-nixl','custom'],
  Custom:['custom'],
};
export const pdModeDetails = {
  'vllm-nixl':['vLLM + NIXL','nvidia','0.27.1'],
  'vllm-mooncake':['vLLM + Mooncake','nvidia','0.27.1'],
  'sglang-mooncake':['SGLang + Mooncake','nvidia','0.5.7'],
  'sglang-nixl':['SGLang + NIXL','nvidia','0.5.7'],
  'vllm-ascend-mooncake':['vLLM-Ascend + Mooncake','ascend','0.23.0'],
  custom:['自定义'],
};
export const pdRoleNames = { prefill:'预填充',decode:'解码',router:'路由' };
export const PD_NODE_LAYER = 'builtin-000004';
export const pdVendor = vendor => {
  const value = String(vendor || '').trim().toLowerCase();
  return /ascend|huawei/.test(value) ? 'ascend' : value;
};
export const pdGib = 1024 ** 3;
export const pdSupportsSource = values => ![values.filename,values.weightPath].some(path=>typeof path==='string' && /\.gguf$/i.test(path.trim()));

const ggufWarningBackends = new Set(['vLLM','SGLang','MindIE','VoxBox']);

export function deploymentCompatibilityWarnings(values, devices = []) {
  const warnings = [];
  if (ggufWarningBackends.has(values.backend) && !pdSupportsSource(values)) {
    warnings.push({code:'gguf-backend',message:'当前后端不支持 GGUF 格式模型。请选择支持 GGUF 的推理后端。'});
  }
  if (values.backend==='SGLang' && devices.length && devices.every(device=>{
    const raw = String(device.computeCapability ?? device.compute_capability ?? '').trim();
    return /nvidia|英伟达/i.test(device.vendor || '') && /^\d+(\.\d+)?$/.test(raw) && Number(raw)>0 && Number(raw)<8;
  })) {
    warnings.push({code:'sglang-nvidia-architecture',message:'所选 NVIDIA GPU 的计算能力均低于 8.0，可能无法运行 SGLang。'});
  }
  return warnings;
}

export function deploymentSubmissionIssue(assessment, acknowledged = []) {
  if (assessment.hardError) return assessment.hardError;
  return assessment.warnings.some(warning=>!acknowledged.includes(warning.code)) ? '请确认兼容性告警后选择「仍然提交」。' : '';
}

function versionMeets(actual, floor) {
  const actualParts = /^v?(\d+)\.(\d+)\.(\d+)(?:$|[-+._])/.exec(actual)?.slice(1);
  if (!actualParts) return true;
  const required = floor.split('.').map(Number);
  const difference = actualParts.map((part,index)=>Number(part)-required[index]).find(part=>part!==0);
  return difference===undefined || difference>0;
}

export function pdModeIssue(mode, {vendor, version, versions=[]} = {}) {
  const [, expectedVendor, minimum] = pdModeDetails[mode] || [];
  if (!minimum) return '';
  if (expectedVendor && vendor && vendor!==expectedVendor) return '传输模式与 GPU 厂商不兼容';
  if ([version,...versions].filter(Boolean).some(value=>!versionMeets(value,minimum))) return `传输模式要求后端版本至少为 ${minimum}`;
  return '';
}

const vendorFrameworks = {
  amd:['rocm'], iluvatar:['corex'], metax:['maca','metax'], cambricon:['neuware'],
  huawei:['cann'], ascend:['cann'], nvidia:['cuda'], moore:['musa'], hygon:['dtk','dcu','hygon'],
  't-head':['hggc'], thead:['hggc'], cpu:['cpu'], enflame:['gcu'],
};

export function compatibleDeploymentVersions(versions, devices) {
  const selectable = versions.filter(version=>!version.recordOnly);
  const frameworkGroups = [...new Set(devices.map(device=>String(device.vendor || '').toLowerCase()))]
    .map(vendor=>Object.entries(vendorFrameworks).find(([name])=>vendor.includes(name))?.[1]);
  if (!frameworkGroups.length || frameworkGroups.some(group=>!group)) return selectable;
  const frameworks = new Set(frameworkGroups.flat());
  return selectable.filter(version=>!version.frameworks.length || version.frameworks.some(framework=>frameworks.has(framework.toLowerCase())));
}

const parameterLines = value => (Array.isArray(value) ? value : String(value ?? '').split(/\r?\n/)).map(line=>line.trim()).filter(Boolean);
const parameterKey = line => line.split(/[=\s]/,1)[0];

export function mergeDeploymentBackendDefaults(defaults, value, priorDefaults = []) {
  const prior = new Set(priorDefaults);
  const overrides = parameterLines(value).filter(line=>!prior.has(line));
  const configured = new Set(overrides.map(parameterKey));
  const inserted = parameterLines(defaults).filter(line=>!configured.has(parameterKey(line)));
  return {parameters:[...inserted,...overrides].join('\n'),inserted};
}

export function deploymentParameterSuggestions(common, value) {
  const configured = new Set(parameterLines(value).map(parameterKey));
  return parameterLines(common).filter(line=>!configured.has(parameterKey(line)));
}

const text = (value, limit) => typeof value === 'string' && value.length <= limit ? value.trim() : '';
const idList = value => Array.isArray(value) && value.length <= 64 && value.every(id => /^[\w.:-]{1,127}$/.test(id))
  ? [...new Set(value)] : [];
const validImage = value => /^[\w][\w.-]*(?::\d{1,5})?(?:\/[\w.-]+)*(?::[\w.-]+|@sha256:[a-f\d]{64})?$/i.test(value);
const pdShared = {
  'vllm-nixl':{ LMCache:['0.26.0','prefill'] },
  'vllm-mooncake':{ Mooncake:['0.29.0','prefill','decode'] },
  'vllm-ascend-mooncake':{ Mooncake:['0.23.0','prefill','decode'] },
  'sglang-nixl':{ LMCache:[null,'prefill','decode'],MeshFusion:[null,'prefill','decode'] },
  'sglang-mooncake':{ LMCache:[null,'prefill','decode'],MeshFusion:[null,'prefill','decode'] },
};
const pdLocalMinimum = { 'vllm-nixl':'0.26.0','vllm-mooncake':'0.26.0','vllm-ascend-mooncake':'0.23.0' };

export function deploymentCacheIssue(mode, {backend,backendVersion,pdMode,role,provider} = {}) {
  if (!['vLLM','SGLang'].includes(backend)) return '扩展 KV 缓存仅支持 vLLM 和 SGLang';
  if (pdMode==='custom' || role==='router') return '当前角色或传输方案无法使用平台管理的扩展 KV 缓存';
  if (mode==='local') {
    const minimum = pdLocalMinimum[pdMode];
    return minimum && backendVersion && !versionMeets(backendVersion,minimum) ? '所选后端版本不支持当前传输方案的本地 KV 缓存' : '';
  }
  const providerId = provider==='XSKY MeshFusion' ? 'MeshFusion' : provider;
  if (pdMode) {
    const [minimum,...roles] = pdShared[pdMode]?.[providerId] || [];
    if (!roles.includes(role)) return '所选缓存提供方不支持当前 PD 传输方案及角色';
    return minimum && backendVersion && !versionMeets(backendVersion,minimum) ? '所选后端版本不支持此共享 KV 缓存' : '';
  }
  if (backend==='vLLM' && !['LMCache','Mooncake'].includes(providerId) ||
    backend==='SGLang' && !['LMCache','Mooncake','MeshFusion'].includes(providerId)) return '缓存提供方与推理后端不兼容';
  return '';
}

function validateKvCache(value, clusterId) {
  if (value==null) return undefined;
  if (typeof value!=='object' || typeof value.enabled!=='boolean') throw Error('扩展 KV 缓存配置无效');
  if (!value.enabled) return {enabled:false};
  const mode = value.mode || 'local';
  if (mode==='shared') {
    const row = value.service;
    if (!row || typeof row.id!=='string' || !idList([row.id]).length || row.clusterId!==clusterId ||
      !text(row.name,120) || !text(row.provider,100)) throw Error('请选择同一集群内的共享 KV 缓存服务');
    const service = {id:row.id,name:row.name,provider:row.provider,clusterId};
    if (Number.isSafeInteger(row.gpustackId) && row.gpustackId>0) service.gpustackId=row.gpustackId;
    return {enabled:true,mode,service};
  }
  if (mode!=='local' || value.service) throw Error('请选择有效的扩展 KV 缓存方式');
  const config = {enabled:true,mode};
  for (const [key,minimum] of [['ram_ratio',0],['ram_size',0],['chunk_size',1]]) {
    if (value[key]==null || value[key]==='') continue;
    const number = Number(value[key]);
    if (!Number.isFinite(number) || number<minimum || key!=='ram_ratio' && !Number.isSafeInteger(number)) {
      throw Error('内存比例和大小须为非负数，内存大小和块大小须为整数，块大小至少为 1');
    }
    config[key]=number;
  }
  if (config.ram_size!=null) delete config.ram_ratio;
  else if (config.ram_ratio==null) config.ram_ratio=1.2;
  return config;
}

export function validateDeploymentOptions(values, { originalSchedule, enforceUniqueScheduleStarts = false } = {}) {
  const runtimeMode = values.runtimeMode || deploymentRuntimeModes[0];
  if (!deploymentRuntimeModes.includes(runtimeMode)) throw Error('请选择支持的运行方式');
  const backend = text(values.backend, 100);
  const backendVersion = text(values.backendVersion, 100);
  const containerImage = text(values.containerImage, 255);
  const containerCommand = text(values.containerCommand, 2000);
  if (runtimeMode === '推理后端版本' && (!backend || !backendVersion)) throw Error('请选择推理后端和版本');
  if (runtimeMode === '自定义镜像' && !validImage(containerImage)) throw Error('请填写有效的容器镜像地址');
  if (runtimeMode === '自定义镜像' && values.containerCommand && !containerCommand) throw Error('执行命令不得超过 2000 字');
  if (values.genericProxy && values.enableInternalRoute===false) throw Error('启用通用代理前请先启用模型路由');

  const source = values.source || '本地路径';
  if (!deploymentSources.includes(source)) throw Error('请选择模型来源');
  const repository = text(values.repository, 200);
  if (['Hugging Face', 'ModelScope'].includes(source) && !/^[\w.-]+\/[\w.-]+$/.test(repository)) {
    throw Error('请填写组织名/模型名格式的仓库');
  }
  const filename = text(values.filename, 180);
  const knownGgufPattern = /^[\w.()/-]+-\*\.gguf$/i;
  if (filename && !/^[\w.()/-]+$/.test(filename) && !knownGgufPattern.test(filename) || filename.split('/').includes('..')) throw Error('模型文件名格式无效');

  const placement = values.placement || placementModes[0];
  if (!placementModes.includes(placement)) throw Error('请选择调度方式');
  const placementStrategy = values.placementStrategy || 'spread';
  if (!placementStrategies.some(([strategy])=>strategy===placementStrategy)) throw Error('请选择有效放置策略');
  const placementTargets = placement === placementModes[0] ? [] : idList(values.placementTargets);
  if (placement !== placementModes[0] && !placementTargets.length) throw Error('请选择调度目标');
  const environment = text(values.environment, 6000);
  if (environment.split(/\r?\n/).some(line => line && !/^[A-Z_][A-Z0-9_]*=\S.*$/i.test(line))) throw Error('环境变量每行须为 NAME=VALUE');
  if (environment.split(/\r?\n/).some(line => /(?:SECRET|TOKEN|PASSWORD|API_?KEY|ACCESS_?KEY|AUTHORIZATION)/i.test(line.split('=')[0]))) {
    throw Error('环境变量中的凭证请使用引用');
  }
  const parameters = text(values.parameters, 8000);
  const description = text(values.description, 500);
  const schedulingRules = validateScaleRules(values.scalingRules);
  const roles = validateDeploymentRoles(values.roles, Number(values.replicas));
  const scalingSchedule = validateDeploymentSchedule(values.scalingSchedule,{
    roles,original:originalSchedule,enforceUniqueStarts:enforceUniqueScheduleStarts,
  });
  const pdBackend = runtimeMode === '自定义镜像' ? backend || 'Custom' : backend;
  const pdMode = text(values.pdMode, 40);
  if (roles && !pdSupportsSource(values)) throw Error('GGUF 模型不支持 PD 分离');
  if (roles && pdBackend && (!pdModes[pdBackend] || pdMode && !pdModes[pdBackend].includes(pdMode))) {
    throw Error('所选推理后端不支持此 PD 分离模式');
  }
  const roleConfigs = roles && values.roleConfigs != null ? validateRoleConfigs(values.roleConfigs,values.clusterId) : undefined;
  const kvCache = validateKvCache(values.kvCache,values.clusterId);
  const pdSettings = roles ? validatePdSettings(values.pdSettings, pdMode) : undefined;
  if (roles && roleConfigs && !Object.hasOwn(pdModeDetails,pdMode)) throw Error('请选择 PD 分离传输模式');
  if (roles && roleConfigs && values.loraAdapters?.length) throw Error('PD 分离不支持 LoRA 适配器');
  if (roles && roleConfigs && pdMode==='custom' && values.cacheAcceleration) throw Error('自定义传输方案不可连接平台管理的 KV 缓存');
  if (roleConfigs) {
    const issue = pdModeIssue(pdMode,{ vendor:pdSettings?.vendor,version:backendVersion,
      versions:['prefill','decode'].map(role=>roleConfigs[role]?.backendVersion) });
    if (issue) throw Error(issue);
    if (['prefill','decode'].some(role=>roleConfigs[role]?.backend && pdMode!=='custom' && roleConfigs[role].backend!==pdBackend)) {
      throw Error('预填充和解码角色的推理后端须与传输模式一致');
    }
    if (Object.values(roleConfigs).some(config=>config.backend && !Object.hasOwn(pdModes,config.backend))) {
      throw Error('PD 角色支持 vLLM、SGLang 或自定义推理后端');
    }
    validateRouterConfig(roleConfigs.router,pdMode);
    const used = new Set();
    for (const [role, config] of Object.entries(roleConfigs)) {
      if (config.placement!=='指定 GPU') continue;
      const expected = (config.gpuPerReplica ?? Number(values.gpuPerReplica))*roles[role];
      if (config.placementTargets.length!==expected || config.placementTargets.some(id=>used.has(id))) {
        throw Error('为各角色选择互不重叠的 GPU，数量须等于单副本 GPU × 角色副本数');
      }
      config.placementTargets.forEach(id=>used.add(id));
    }
  }
  const uses = roles ? ['prefill','decode'].map(role=>[role,roleConfigs?.[role]?.kvCache ?? kvCache]) : [[null,kvCache]];
  const serviceIds = new Set();
  for (const [role,cache] of uses) {
    if (!cache?.enabled) continue;
    const override = roleConfigs?.[role];
    const error=deploymentCacheIssue(cache.mode,{backend:override?.backend ?? backend,
      backendVersion:override?.backendVersion ?? backendVersion,pdMode:roles ? pdMode : undefined,role,provider:cache.service?.provider});
    if (error) throw Error(error);
    if (cache.service) serviceIds.add(cache.service.id);
  }
  if (serviceIds.size>1) throw Error('同一部署的角色须使用同一个共享 KV 缓存服务');
  const cacheService = values.cacheAcceleration;
  const cacheAcceleration = cacheService?.clusterId === values.clusterId && text(cacheService.name, 120) && text(cacheService.provider, 100)
    ? { name: text(cacheService.name, 120), provider: text(cacheService.provider, 100), clusterId: values.clusterId }
    : null;
  return {
    runtimeMode, ...(runtimeMode === '推理后端版本' ? { backend, backendVersion } : {}),
    ...(runtimeMode === '自定义镜像' ? { containerImage, ...(backend && backend!=='Custom' ? {backend} : {}), ...(containerCommand ? { containerCommand } : {}) } : {}),
    source, repository, filename, placement, placementTargets, description, environment, parameters,
    ...(placementStrategy==='binpack' ? {placementStrategy} : {}),
    roles, ...(roles && pdMode ? { pdMode } : {}), ...(roleConfigs ? {roleConfigs} : {}), ...(pdSettings ? {pdSettings} : {}), scalingRules: schedulingRules,
    ...(scalingSchedule ? {scalingSchedule} : {}), cacheAcceleration, ...(kvCache ? {kvCache} : {}),
    loraAdapters: validateAdapters(values.loraAdapters),
    speculative: validateSpeculative(values.speculative),
    offloading: Boolean(values.offloading), distributedInference: Boolean(values.distributedInference),
    restartOnError: Boolean(values.restartOnError), nativeAnthropic: Boolean(values.nativeAnthropic),
    ...(values.enableInternalRoute===false ? { enableInternalRoute:false } : {}),
    ...(values.genericProxy ? { genericProxy:true } : {}),
  };
}

function validateRoleConfigs(value, clusterId) {
  if (typeof value!=='object' || Array.isArray(value) || Object.keys(value).some(role=>!Object.hasOwn(pdRoleNames,role))) throw Error('PD 角色配置无效');
  const configs = {};
  for (const role of Object.keys(pdRoleNames)) {
    const source = value[role];
    if (!source) continue;
    const label = pdRoleNames[role];
    if (typeof source!=='object' || Array.isArray(source)) throw Error(`${label}角色配置无效`);
    const normalized = {};
    for (const [key,limit] of [['backend',100],['backendVersion',100],['containerImage',255],['containerCommand',2000],
      ['parameters',8000],['environment',6000]]) {
      if (source[key] == null) continue;
      if (typeof source[key]!=='string' || source[key].length>limit) throw Error(`${label}角色的输入格式无效或超出长度限制`);
      if (source[key].trim() || ['parameters','environment'].includes(key)) normalized[key]=source[key].trim();
    }
    if (source.containerImage!=null && (!validImage(normalized.containerImage || '') || normalized.backendVersion)) {
      throw Error(`${label}角色的容器镜像格式无效，或同时指定了后端版本`);
    }
    const variables = new Set();
    for (const line of (normalized.environment || '').split(/\r?\n/).filter(Boolean)) {
      const match = /^([A-Z_][A-Z0-9_]*)=/i.exec(line);
      if (!match || variables.has(match[1]) || /(?:SECRET|TOKEN|PASSWORD|API_?KEY|ACCESS_?KEY|AUTHORIZATION)/i.test(match[1])) {
        throw Error(`${label}角色的环境变量须使用唯一的 NAME=VALUE，凭证请使用引用`);
      }
      variables.add(match[1]);
    }
    if (source.environmentMode!=null && !['merge','replace'].includes(source.environmentMode)) throw Error('请选择角色环境变量的合并方式');
    if (source.environmentMode==='merge' && normalized.environment!=null) normalized.environmentMode='merge';
    if (source.gpuPerReplica!=null && source.gpuPerReplica!=='') {
      const count = Number(source.gpuPerReplica);
      if (role==='router' || !Number.isInteger(count) || count<1 || count>64) throw Error('预填充或解码的每副本 GPU 须为 1–64 张，路由角色仅使用 CPU');
      normalized.gpuPerReplica = count;
    }
    if (source.placement) {
      if (!placementModes.includes(source.placement) || role==='router' && source.placement==='指定 GPU') throw Error(`${label}角色的调度方式无效`);
      normalized.placement = source.placement;
      if (source.placement!=='自动调度') {
        normalized.placementTargets = idList(source.placementTargets);
        if (!normalized.placementTargets.length) throw Error(`请选择${label}角色的调度目标`);
      }
    }
    if (source.resources != null) {
      if (role!=='router' || typeof source.resources!=='object' || Array.isArray(source.resources)) throw Error('只有路由角色可指定 CPU 和内存');
      const {cpu,memory} = source.resources;
      if (cpu!=null && (!Number.isFinite(cpu) || cpu<0.1) || memory!=null && (!Number.isSafeInteger(memory) || memory<pdGib/2)) {
        throw Error('路由 CPU 至少为 0.1 核，内存至少为 0.5 GiB');
      }
      if (cpu!=null || memory!=null) normalized.resources = {...(cpu!=null ? {cpu} : {}),...(memory!=null ? {memory} : {})};
    }
    if (source.dependencies != null) {
      if (!Array.isArray(source.dependencies) || role!=='router' || new Set(source.dependencies).size!==source.dependencies.length ||
        source.dependencies.some(name=>!['prefill','decode'].includes(name))) throw Error('仅支持路由角色依赖预填充和解码角色');
      normalized.dependencies=source.dependencies;
    }
    if (source.speculative != null) {
      if (role==='router') throw Error('路由角色不支持推测解码');
      normalized.speculative = source.speculative.enabled===false ? { enabled:false } : validateSpeculative(source.speculative);
    }
    if (source.kvCache != null) {
      if (role==='router') throw Error('路由角色不支持扩展 KV 缓存');
      normalized.kvCache = validateKvCache(source.kvCache,clusterId);
    }
    if (Object.keys(normalized).length) configs[role] = normalized;
  }
  return configs;
}

function validateRouterConfig(router,pdMode) {
  if (pdMode==='custom' && !router?.containerCommand && !router?.backend) throw Error('请为自定义传输方案填写 Router 启动命令');
  const recipe = pdRoleRecipe(pdMode,'router',Boolean(router?.containerCommand));
  const params = (router?.parameters || '').split(/\r?\n/);
  for (const line of params) {
    if (recipe.owned.some(flag=>new RegExp('(?:^|\\s)'+flag+'(?=$|[\\s=])').test(line))) {
      throw Error('路由角色的 --prefill 和 --decode 参数由平台设置');
    }
    const [flag,value] = pdNamedParameter(line);
    const constraints = recipe.parameters.find(([name])=>name===flag)?.[2];
    if (!constraints) continue;
    if (constraints.options && !constraints.options.includes(value)) throw Error(flag+' 不支持此路由策略');
    if (constraints.min!=null && (!/^\d+$/.test(value) || !Number.isSafeInteger(Number(value)) || Number(value)<constraints.min)) {
      throw Error(flag+' 须为不小于 '+constraints.min+' 的整数');
    }
  }
}

function validatePdSettings(value, mode) {
  if (!value) return undefined;
  if (typeof value!=='object' || Array.isArray(value)) throw Error('PD 分离配置无效');
  const { vendor, readiness, kvLoadFailure, gather } = value;
  if (vendor && !/^[a-z][a-z 0-9_-]{0,39}$/i.test(vendor)) throw Error('GPU 厂商无效');
  if (readiness && !['any_per_role','all'].includes(readiness)) throw Error('PD 就绪策略无效');
  if (kvLoadFailure && (!['fail','recompute'].includes(kvLoadFailure) || kvLoadFailure==='recompute' && mode!=='vllm-nixl')) {
    throw Error('仅 vLLM + NIXL 支持 KV 加载失败后重新计算');
  }
  if (gather && (!['PreferGather','MustGather'].includes(gather.strategy) ||
    gather.layer && !/^[\w.-]{1,63}$/.test(gather.layer) || gather.strategy==='MustGather' && !gather.layer)) {
    throw Error('请选择有效的成员聚集范围和失败策略');
  }
  const result = {...(vendor ? {vendor:pdVendor(vendor)} : {}),...(readiness==='all' ? {readiness} : {}),
    ...(kvLoadFailure==='recompute' ? {kvLoadFailure} : {}),...(gather?.layer ? {gather:{strategy:gather.strategy,layer:gather.layer}} : {})};
  return Object.keys(result).length ? result : undefined;
}

function validateAdapters(adapters) {
  if (adapters == null) return [];
  if (!Array.isArray(adapters) || adapters.length > 20) throw Error('LoRA 适配器最多支持 20 项');
  const normalized = adapters.map(row => ({ name:text(row?.name,63), path:text(row?.path,255) }));
  if (new Set(normalized.map(row=>row.name)).size !== normalized.length ||
      normalized.some(row=>!/^[\w.-]{1,63}$/.test(row.name) || !/^\/[\w./-]+$/.test(row.path) || row.path.split('/').includes('..'))) {
    throw Error('LoRA 适配器名称须唯一并指定已挂载的绝对路径');
  }
  return normalized;
}

function validateSpeculative(config) {
  if (!config) return null;
  const algorithm = config.algorithm;
  const tokens = Number(config.tokens);
  if (!['Eagle3','MTP','N-gram'].includes(algorithm) || !Number.isInteger(tokens) || tokens < 1 || tokens > 128) {
    throw Error('请选择推测解码算法并填写 1–128 个推测 Token');
  }
  if (algorithm === 'N-gram') {
    const min = Number(config.min), max = Number(config.max);
    if (!Number.isInteger(min) || !Number.isInteger(max) || min < 1 || max < min || max > 128) throw Error('N-gram 匹配长度须为 1–128，且最小值不能超过最大值');
    return { algorithm,tokens,min,max };
  }
  const draftModel = algorithm === 'Eagle3' ? text(config.draftModel,200) : '';
  if (algorithm === 'Eagle3' && !draftModel) throw Error('Eagle3 需指定草稿模型');
  return { algorithm,tokens,...(draftModel ? { draftModel } : {}) };
}

function validateScaleRules(rules) {
  if (rules == null) return [];
  if (!Array.isArray(rules) || rules.length > 24) throw Error('定时扩缩容最多支持 24 条规则');
  return rules.map(rule => {
    const days = [...new Set(Array.isArray(rule?.days) ? rule.days : [])].sort();
    const desired = Number(rule?.replicas);
    if (!days.length || days.some(day => ![1, 2, 3, 4, 5, 6, 7].includes(day)) ||
        !/^([01]\d|2[0-3]):[0-5]\d$/.test(rule?.time) || !Number.isInteger(desired) || desired < 0 || desired > 100) {
      throw Error('定时规则需填写生效日期、北京时间和 0–100 个目标副本');
    }
    return { days, time: rule.time, replicas: desired };
  });
}

function validateDeploymentRoles(roles, replicas) {
  if (!roles) return null;
  const counts = Object.fromEntries(['prefill', 'decode', 'router'].map(role => [role, Number(roles[role])]));
  if (counts.router!==1) throw Error('路由角色固定为 1 个副本');
  if (Object.values(counts).some(count => !Number.isInteger(count) || count < 1 || count > 100) ||
      Object.values(counts).reduce((sum, count) => sum + count, 0) !== replicas) {
    throw Error('预填充、解码和路由角色须各有至少一个副本，合计等于目标副本数');
  }
  return counts;
}
