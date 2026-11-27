export const deploymentSources = ['模型库', 'Hugging Face', 'ModelScope', '本地路径'];
export const deploymentRuntimeModes = ['已登记运行时镜像', '推理后端版本', '自定义镜像'];
export const placementModes = ['自动调度', '指定节点', '指定 GPU'];

const text = (value, limit) => typeof value === 'string' && value.length <= limit ? value.trim() : '';
const idList = value => Array.isArray(value) && value.length <= 64 && value.every(id => /^[\w.:-]{1,127}$/.test(id))
  ? [...new Set(value)] : [];
const validImage = value => /^[\w][\w.-]*(?::\d{1,5})?(?:\/[\w.-]+)*(?::[\w.-]+|@sha256:[a-f\d]{64})?$/i.test(value);

export function validateDeploymentOptions(values) {
  const runtimeMode = values.runtimeMode || deploymentRuntimeModes[0];
  if (!deploymentRuntimeModes.includes(runtimeMode)) throw Error('请选择支持的运行方式');
  const backend = text(values.backend, 100);
  const backendVersion = text(values.backendVersion, 100);
  const containerImage = text(values.containerImage, 255);
  if (runtimeMode === '推理后端版本' && (!backend || !backendVersion)) throw Error('请选择推理后端和版本');
  if (runtimeMode === '自定义镜像' && !validImage(containerImage)) throw Error('请填写有效的容器镜像地址');

  const source = values.source || '本地路径';
  if (!deploymentSources.includes(source)) throw Error('请选择模型来源');
  const repository = text(values.repository, 200);
  if (['Hugging Face', 'ModelScope'].includes(source) && !/^[\w.-]+\/[\w.-]+$/.test(repository)) {
    throw Error('请填写组织名/模型名格式的仓库');
  }
  const filename = text(values.filename, 180);
  if (filename && !/^[\w.()/-]+$/.test(filename) || filename.split('/').includes('..')) throw Error('模型文件名格式无效');

  const placement = values.placement || placementModes[0];
  if (!placementModes.includes(placement)) throw Error('请选择调度方式');
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
  const cacheService = values.cacheAcceleration;
  const cacheAcceleration = cacheService?.clusterId === values.clusterId && text(cacheService.name, 120) && text(cacheService.provider, 100)
    ? { name: text(cacheService.name, 120), provider: text(cacheService.provider, 100), clusterId: values.clusterId }
    : null;
  return {
    runtimeMode, ...(runtimeMode === '推理后端版本' ? { backend, backendVersion } : {}),
    ...(runtimeMode === '自定义镜像' ? { containerImage } : {}),
    source, repository, filename, placement, placementTargets, description, environment, parameters,
    roles, scalingRules: schedulingRules, cacheAcceleration,
    loraAdapters: validateAdapters(values.loraAdapters),
    speculative: validateSpeculative(values.speculative),
    offloading: Boolean(values.offloading), distributedInference: Boolean(values.distributedInference),
    restartOnError: Boolean(values.restartOnError), nativeAnthropic: Boolean(values.nativeAnthropic),
  };
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
  if (Object.values(counts).some(count => !Number.isInteger(count) || count < 1 || count > 100) ||
      Object.values(counts).reduce((sum, count) => sum + count, 0) !== replicas) {
    throw Error('预填充、解码和路由角色须各有至少一个副本，合计等于目标副本数');
  }
  return counts;
}
