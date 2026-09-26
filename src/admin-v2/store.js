import { useEffect, useState } from "react";

export const STORAGE_KEY = "moma.adminV2.v1";
const now = "2026-09-15T10:30:00+08:00";
const record = (id, value) => ({ id, createdAt: now, updatedAt: now, ...value });

export function createAdminSeed() {
  const models = [
    ["deepseek-v4-pro", "DeepSeek-V4-Pro", "text", "运行中", "公开"],
    ["glm-5.2", "GLM-5.2", "text", "运行中", "公开"],
    ["kimi-k3", "Kimi-K3", "multimodal", "验证中", "内部"],
    ["minimax-h3", "MiniMax-H3", "video", "运行中", "公开"],
    ["qwen-audio-tts", "Qwen-Audio-TTS", "audio", "运行中", "公开"],
    ["bge-m3", "BGE-M3", "embedding", "运行中", "公开"],
    ["qwen3-max", "Qwen3-Max", "text", "运行中", "公开"],
    ["doubao-pro", "Doubao-Pro", "text", "运行中", "公开"],
    ["hunyuan-t1", "Hunyuan-T1", "text", "运行中", "公开"],
    ["yi-large", "Yi-Large", "text", "运行中", "公开"],
    ["qwen-vl-plus", "Qwen-VL-Plus", "multimodal", "运行中", "公开"],
    ["qwen-image", "Qwen-Image", "image", "运行中", "公开"],
    ["baichuan-m2", "Baichuan-M2", "text", "运行中", "公开"],
    ["internlm-3", "InternLM-3", "text", "运行中", "公开"],
    ["bge-reranker-v2", "BGE-Reranker-v2", "rerank", "运行中", "公开"],
    ["qwen-reranker", "Qwen-Reranker", "rerank", "运行中", "公开"],
    ["qwen-embedding", "Qwen-Embedding", "embedding", "运行中", "公开"],
    ["gte-large", "GTE-Large", "embedding", "运行中", "公开"],
    ["sensevoice-asr", "SenseVoice-ASR", "audio", "运行中", "公开"],
    ["cosyvoice-tts", "CosyVoice-TTS", "audio", "运行中", "公开"],
    ["wan-video", "Wan-Video", "video", "运行中", "公开"],
    ["flux-image", "FLUX-Image", "image", "运行中", "公开"],
  ].map(([modelId, name, type, status, visibility], index) => record(`model-${index + 1}`, { modelId, name, type, status, visibility, defaultVersionId: `version-${index + 1}`, usageUnit: type === "audio" && modelId.endsWith("tts") ? "字符" : undefined, capabilities: { streaming: ["text", "multimodal", "audio"].includes(type), context: type === "embedding" ? 32768 : 1048576 } }));
  const modelVersions = models.map((model, index) => record(`version-${index + 1}`, { modelId: model.id, version: `v${index + 1}.0`, capabilities: model.capabilities, validationStatus: index === 2 ? "失败" : "通过", isDefault: index !== 2, deprecatedAt: null, status: index === 2 ? "验证失败" : "已发布" }));
  const validations = modelVersions.map((version, index) => record(`validation-${index + 1}`, { modelVersionId: version.id, endpointId: ["endpoint-ds", "endpoint-glm", "endpoint-kimi"][index % 3], cases: ["协议兼容", "流式响应", "基础推理"], passed: version.validationStatus === "通过", result: version.validationStatus, durationMs: 820 + index * 130, status: "已完成" }));
  const providers = [record("provider-cmss", { name: "江苏移动", sourceType: "thirdParty", contact: "模型运营组", contractEnd: "2027-12-31", status: "已启用" }), record("provider-tokenhub", { name: "TokenHub", sourceType: "thirdParty", contact: "供应商接口人", contractEnd: "2027-06-30", status: "已启用" }), record("provider-self", { name: "自有算力", sourceType: "selfHosted", contact: "平台运维组", contractEnd: null, status: "已启用" })];
  const endpoints = [record("endpoint-ds", { endpointId: "ep-ds-v4-prod", name: "DeepSeek 生产端点", providerId: "provider-cmss", protocol: "OpenAI", baseUrl: "https://demo.invalid/v1", credentialRef: "mock-credential-a", modelIds: ["model-1"], capacity: 18000, health: 99.99, status: "运行中" }), record("endpoint-glm", { endpointId: "ep-glm-self", name: "GLM 自有推理", providerId: "provider-self", protocol: "OpenAI", baseUrl: "https://self.demo.invalid/v1", credentialRef: "mock-credential-b", modelIds: ["model-2", "model-1"], capacity: 12000, health: 99.95, status: "运行中" }), record("endpoint-kimi", { endpointId: "ep-kimi-k3", name: "Kimi 聚合端点", providerId: "provider-tokenhub", protocol: "OpenAI", baseUrl: "https://hub.demo.invalid/v1", credentialRef: "mock-credential-c", modelIds: ["model-3"], capacity: 6000, health: 98.72, status: "需关注" })];
  const clusters = [record("cluster-nj-a", { clusterId: "inference-nj-a", name: "南京智算一池", zone: "南京", gpuType: "H20", totalGpu: 64, allocatedGpu: 36, nodes: 8, status: "运行中" }), record("cluster-sz-a", { clusterId: "inference-sz-a", name: "苏州智算一池", zone: "苏州", gpuType: "L40S", totalGpu: 32, allocatedGpu: 24, nodes: 4, status: "运行中" }), record("cluster-nj-test", { clusterId: "inference-nj-test", name: "南京验证集群", zone: "南京", gpuType: "A800", totalGpu: 16, allocatedGpu: 4, nodes: 2, status: "维护中" })];
  const artifacts = [record("artifact-vllm", { name: "vLLM CUDA 运行时", type: "运行时镜像", version: "v5.1", digest: "sha256:81dd3093a102", size: "18.6 GB", validation: "通过", status: "可运行" }), record("artifact-ds", { name: "DeepSeek-V4-Pro 权重", type: "模型制品", version: "v4.0", digest: "sha256:deepseekv4", size: "412 GB", validation: "通过", status: "可运行" }), record("artifact-base", { name: "CUDA 12.8 基础镜像", type: "基础镜像", version: "2026.09", digest: "sha256:cuda128", size: "8.2 GB", validation: "通过", status: "可运行" })];
  const deployments = [record("deployment-ds", { deploymentId: "deploy-deepseek-v4", name: "DeepSeek-V4-Pro 生产服务", modelId: "model-1", clusterId: "cluster-nj-a", artifactId: "artifact-ds", replicas: 4, gpuPerReplica: 4, endpointId: "endpoint-ds", status: "运行中" }), record("deployment-glm", { deploymentId: "deploy-glm-52", name: "GLM-5.2 生产服务", modelId: "model-2", clusterId: "cluster-sz-a", artifactId: "artifact-vllm", replicas: 2, gpuPerReplica: 4, endpointId: "endpoint-glm", status: "运行中" }), record("deployment-bge", { deploymentId: "deploy-bge-m3", name: "BGE-M3 向量服务", modelId: "model-6", clusterId: "cluster-nj-a", artifactId: "artifact-vllm", replicas: 2, gpuPerReplica: 2, endpointId: null, status: "部署中" })];
  const supplyPrices = [record("supply-price-ds", { priceId: "sp-ds-v4-202609", providerId: "provider-cmss", modelId: "model-1", inputPrice: 1000000, cachedPrice: 200000, outputPrice: 2000000, capacity: 18000, balance: 860000000, effectiveAt: "2026-09-01", status: "生效中" }), record("supply-price-glm", { priceId: "sp-glm-52-202609", providerId: "provider-self", modelId: "model-2", inputPrice: 700000, cachedPrice: 150000, outputPrice: 1400000, capacity: 12000, balance: 420000000, effectiveAt: "2026-09-01", status: "生效中" })];
  const tenants = [record("tenant-gov", { name: "江苏政务云", type: "政府", ownerId: "user-zhang", status: "正常" }), record("tenant-nanjing", { name: "南京智算中心", type: "企业", ownerId: "user-li", status: "正常" }), record("tenant-demo", { name: "企业体验租户", type: "企业", ownerId: "user-chen", status: "需关注" }), ...["苏州工业园区", "无锡城市大脑", "常州制造云", "南通政务中心", "扬州智慧医疗", "徐州交通集团", "盐城教育云", "泰州能源集团", "镇江金融云"].map((name, index) => record(`tenant-usage-${index + 1}`, { name, type: index % 3 === 0 ? "政府" : "企业", ownerId: `user-usage-${index + 1}`, status: "正常" }))];
  const projects = tenants.flatMap((tenant, tenantIndex) => [1, 2].map(projectIndex => record(`project-${tenantIndex + 1}-${projectIndex}`, { tenantId: tenant.id, name: `${tenant.name}${projectIndex === 1 ? "生产" : "测试"}项目`, ownerId: tenant.ownerId, budget: projectIndex === 1 ? 500000000 : 100000000, status: "正常" })));
  const apiKeys = Array.from({ length: 200 }, (_, index) => { const project = projects[index % projects.length], number = String(index + 1).padStart(3, "0"); return record(`key-${number}`, { keyId: `ak-demo-${number}-81dd3093`, name: `api-key-${number}`, tenantId: project.tenantId, projectId: project.id, secretPreview: `sk-****${number}`, modelIds: (index < projects.length * 2 ? models : models.slice(0, 2 + index % 4)).map(model => model.id), status: index % 17 === 0 ? "停用" : "有效", lastUsedAt: index % 9 === 0 ? null : now }); });
  const memberships = tenants.map((tenant, index) => record(`member-${index + 1}`, { userId: tenant.ownerId, name: ["张敏", "李晨", "陈曦"][index] || `${tenant.name}管理员`, tenantId: tenant.id, projectIds: projects.filter(item => item.tenantId === tenant.id).map(item => item.id), role: index ? "项目管理员" : "租户管理员", status: "正常" }));
  const grants = apiKeys.slice(0, 12).map((key, index) => record(`grant-${index + 1}`, { subjectType: "key", subjectId: key.id, modelIds: key.modelIds, period: index % 3 === 0 ? "day" : "month", limit: index % 3 === 0 ? 10000000 : 100000000, used: (index + 1) * 420000, expiresAt: "2027-09-15", status: "生效中" }));
  const ledger = grants.map((grant, index) => record(`ledger-${index + 1}`, { accountId: grant.subjectId, sourceId: grant.id, type: "额度发放", delta: grant.limit, balance: grant.limit - grant.used, reason: "初始授权", status: "已完成" }));
  const routes = [record("route-deepseek", { routeId: "route-deepseek-prod", name: "DeepSeek 生产路由", modelId: "model-1", targets: [{ endpointId: "endpoint-ds", weight: 70 }, { endpointId: "endpoint-glm", weight: 30 }], mode: "加权", status: "已生效", releaseId: "release-2" }), record("route-glm", { routeId: "route-glm-prod", name: "GLM 优先级路由", modelId: "model-2", targets: [{ endpointId: "endpoint-glm", weight: 100 }], mode: "优先级", status: "已生效", releaseId: "release-2" })];
  const limits = [record("limit-tenant", { name: "政务租户生产限流", scopeType: "tenant", scopeId: "tenant-gov", rpm: 1200, tpm: 1200000, concurrency: 80, status: "已启用" }), record("limit-key", { name: "体验 Key 防刷", scopeType: "key", scopeId: "key-001", rpm: 60, tpm: 100000, concurrency: 5, status: "已启用" })];
  const fallbacks = [record("fallback-ds", { name: "DeepSeek 超时回退", routeId: "route-deepseek", timeoutMs: 3000, errorRate: 5, chain: ["endpoint-ds", "endpoint-glm"], status: "已启用" })];
  const releases = [record("release-2", { version: "r-002", configSnapshot: "2 routes · 2 limits · 1 fallback", previousReleaseId: "release-1", validation: "通过", diff: "+ GLM 优先级路由", publishedAt: now, status: "当前生效" }), record("release-1", { version: "r-001", configSnapshot: "1 route · 1 limit", previousReleaseId: null, validation: "通过", diff: "初始版本", publishedAt: "2026-09-14T10:00:00+08:00", status: "历史版本" })];
  const caches = [record("cache-text", { name: "文本模型公共前缀缓存", scope: "tenant+model", ttl: 600, exclusions: "敏感策略命中", hitRate: 38.6, savedTokens: 402670000, status: "已启用" })];
  const requestAnchor = Date.now();
  const requests = Array.from({ length: 168 }, (_, index) => { const model = models[index % 6], key = apiKeys[(index * 7 + Math.floor(index / 6) * 4) % apiKeys.length], endpoint = endpoints[index % endpoints.length], failed = index % 19 === 0, createdAt = new Date(requestAnchor - index * 2 * 60 * 60 * 1000).toISOString(); return { id: `request-${String(index + 1).padStart(4, "0")}`, requestId: `req_${String(index + 1).padStart(6, "0")}`, tenantId: key.tenantId, projectId: key.projectId, keyId: key.id, modelId: model.id, versionId: model.defaultVersionId, endpointId: endpoint.id, releaseId: "release-2", source: index % 4 ? "API 调用" : "网页端调用", attempts: failed ? [{ endpointId: endpoint.id, durationMs: 3000, error: "upstream_timeout" }] : [{ endpointId: endpoint.id, durationMs: 320 + index % 8 * 45, error: null }], usage: model.type === "video" ? { tasks: 1, seconds: 8 + index % 12 } : model.type === "image" ? { tasks: 1, images: 2 } : model.type === "audio" ? { characters: 180 + index % 240 } : model.type === "embedding" ? { input: 1800 + index * 3, vectors: 8 + index % 5 } : { input: 2400 + index * 7, cached: 600 + index % 400, output: 720 + index % 300 }, httpStatus: failed ? 504 : 200, ttftMs: model.capabilities.streaming && !failed ? 180 + index % 120 : null, durationMs: failed ? 3000 : 620 + index % 12 * 70, createdAt, updatedAt: createdAt }; });
  const usageDemoRequests = Array.from({ length: 36 * 24 * 4 }, (_, index) => {
    const offset = Math.floor(index / 4), hour = offset % 24, day = Math.floor(offset / 24), minute = (index % 4) * 12 + 3;
    const at = new Date(requestAnchor - day * 86400000 - (new Date(requestAnchor + 8 * 3600000).getUTCHours() - hour) * 3600000);
    at.setUTCMinutes(minute, 0, 0);
    if (at.getTime() > requestAnchor) return null;
    const tenantIndex = (index * 7 + Math.floor(index / 9)) % tenants.length;
    const tenant = tenants[tenantIndex], project = projects[tenantIndex * 2], key = apiKeys.find(item => item.projectId === project.id && item.status === '有效' && item.modelIds.length === models.length);
    const model = models[(index + day * 7) % models.length];
    const endpoint = endpoints[index % endpoints.length], failed = index % 43 === 0;
    const weight = [850000, 540000, 250000, 750000, 350000, 200000, 42000, 30000, 20000, 13000, 9000, 6000][tenantIndex];
    const input = Math.round(weight * (0.48 + (index % 7) * 0.07));
    const output = ['embedding', 'rerank'].includes(model.type) ? 0 : Math.round(input * (0.16 + (index % 5) * 0.04));
    const createdAt = at.toISOString();
    return { id: `usage-demo-${index}`, requestId: `usage_demo_${index}`, tenantId: tenant.id, projectId: project.id, keyId: key?.id, modelId: model.id, versionId: model.defaultVersionId, endpointId: endpoint.id, releaseId: 'release-2', source: 'API 调用', attempts: [{ endpointId: endpoint.id, durationMs: failed ? 3000 : 480 + index % 370, error: failed ? 'upstream_timeout' : null }], usage: model.type === 'image' ? { images: 1 + index % 4 } : model.type === 'video' ? { tasks: 1, seconds: 5 + index % 12 } : model.type === 'audio' ? model.modelId.endsWith('tts') ? { characters: 180 + index % 240 } : { seconds: 8 + index % 24 } : { input, output, cached: Math.round(input * 0.08) }, usageConfirmed: true, httpStatus: failed ? 504 : 200, ttftMs: failed ? null : 160 + index % 180, durationMs: failed ? 3000 : 520 + index % 900, createdAt, updatedAt: createdAt };
  }).filter(Boolean);
  requests.push(...usageDemoRequests);
  for (let hour = 0; hour < 7 * 24; hour++) for (let slot = 0; slot < 2; slot++) {
    const at = new Date(requestAnchor - hour * 3600000);
    at.setUTCMinutes(13 + slot * 20, 0, 0);
    if (at.getTime() > requestAnchor) continue;
    const createdAt = at.toISOString(), index = hour * 2 + slot, project = projects[6], key = apiKeys.find(item => item.projectId === project.id && item.status === '有效' && item.modelIds.length === models.length);
    requests.push({ id: `usage-demo-heavy-${index}`, requestId: `usage_demo_heavy_${index}`, tenantId: tenants[3].id, projectId: project.id, keyId: key?.id, modelId: models[0].id, versionId: models[0].defaultVersionId, endpointId: 'endpoint-ds', releaseId: 'release-2', source: 'API 调用', attempts: [{ endpointId: 'endpoint-ds', durationMs: 540 + index % 180, error: null }], usage: { input: 430000 + index % 7 * 17000, output: 85000 + index % 5 * 7000, cached: 30000 }, usageConfirmed: true, httpStatus: 200, ttftMs: 160 + index % 90, durationMs: 540 + index % 180, createdAt, updatedAt: createdAt });
  }
  const alerts = [record("alert-glm-errors", { ruleId: "rule-error-rate", objectId: "model-2", title: "GLM-5.2 失败率超过阈值", severity: "高", assignee: "运维人员", status: "待确认", startedAt: "2026-09-15T09:20:00+08:00", timeline: ["09:20 首次触发"] }), record("alert-kimi-health", { ruleId: "rule-endpoint-health", objectId: "endpoint-kimi", title: "Kimi 端点健康度下降", severity: "中", assignee: "运维人员", status: "处理中", startedAt: "2026-09-15T08:10:00+08:00", timeline: ["08:10 触发", "08:30 已确认"] })];
  const incidents = [record("incident-001", { incidentId: "INC-20260915-001", title: "Kimi 上游间歇性超时", alertIds: ["alert-kimi-health"], impact: "约 2.1% 请求触发回退", assignee: "运维人员", resolution: "", status: "处理中", timeline: ["08:10 告警触发", "08:35 建立事件"] })];
  const products = [record("product-payg", { code: "PAYG-TEXT", name: "文本模型按量付费", billingMode: "按量付费", modelIds: ["model-1","model-2"], price: 1.8, status: "已上架" }), record("product-plan", { code: "TOKEN-100M", name: "Token Plan 100M", billingMode: "预付费", modelIds: ["model-1","model-3"], price: 699, status: "已上架" })];
  const prices = [record("price-payg-v1", { productId: "product-payg", item: "输入 Token", unit: "百万 Tokens", amount: 1, effectiveAt: "2026-09-01", status: "生效中" }), record("price-output-v1", { productId: "product-payg", item: "输出 Token", unit: "百万 Tokens", amount: 2, effectiveAt: "2026-09-01", status: "生效中" })];
  const orders = [record("order-001", { orderNo: "ORD-202609-001", tenantId: "tenant-gov", productId: "product-plan", amount: 699, entitlement: 100000000, status: "已开通", timeline: ["订单创建", "支付成功", "权益发放"] }), record("order-002", { orderNo: "ORD-202609-002", tenantId: "tenant-nanjing", productId: "product-payg", amount: 0, entitlement: 0, status: "生效中", timeline: ["订单创建", "服务开通"] })];
  const bills = [record("bill-001", { billNo: "BILL-202609-001", tenantId: "tenant-gov", period: "2026-09", amount: 486.2, discount: 20, paid: 466.2, status: "已出账" }), record("bill-002", { billNo: "BILL-202609-002", tenantId: "tenant-nanjing", period: "2026-09", amount: 301.74, discount: 0, paid: 0, status: "待出账" })];
  const settlements = [record("settlement-001", { settlementNo: "SET-202609-CMSS", providerId: "provider-cmss", period: "2026-09", platformAmount: 984, providerAmount: 981.5, difference: 2.5, status: "待确认" })];
  const adjustments = [record("adjustment-001", { adjustmentNo: "ADJ-202609-001", billId: "bill-001", amount: -8.4, reason: "重复计量冲正", status: "待审批" })];
  const announcements = [record("notice-001", { title: "国庆假期服务保障通知", audience: "全部租户", channel: "站内信", effectiveAt: "2026-09-30", status: "草稿" })];
  const securityPolicies = [record("security-pii", { name: "政务敏感信息防护", category: "请求内容", scope: "输入与输出", action: "阻断并审计", hits: 128, status: "已启用" }), record("security-abuse", { name: "高频 Key 防刷", category: "访问防护", scope: "API 网关", action: "限流", hits: 1204, status: "已启用" }), record("security-retention", { name: "政务数据不留存", category: "数据策略", scope: "tenant-gov", action: "不留存", hits: 0, status: "已启用" })];
  const securityEvents = [record("security-event-001", { eventNo: "SEC-202609-001", policyId: "security-pii", requestId: "request-0019", keyId: "key-127", severity: "高", assignee: "安全管理员", conclusion: "", status: "待处置" })];
  const admins = [record("admin-001", { account: "estack-yy", name: "平台管理员", role: "平台管理员", scope: "全平台", status: "已启用" }), record("admin-002", { account: "ops-wang", name: "王运维", role: "运维人员", scope: "服务运维", status: "已启用" })];
  const approvals = [record("approval-001", { name: "大额调账审批", condition: "金额绝对值 ≥ ¥5", approverRole: "财务人员", status: "已启用" })];
  const integrations = [record("integration-001", { name: "生产告警群", type: "飞书 Webhook", target: "ops-demo", events: "高等级告警", lastResult: "模拟成功", status: "已启用" })];
  return { version: 1, revision: 1, updatedAt: now, models, modelVersions, validations, providers, endpoints, supplyPrices, clusters, artifacts, deployments, tenants, projects, memberships, apiKeys, grants, ledger, routes, limits, fallbacks, releases, caches, requests, alerts, incidents, products, prices, orders, bills, settlements, adjustments, announcements, securityPolicies, securityEvents, admins, approvals, integrations, audits: [], currentRole: "平台管理员", settings: { environmentLabel: "演示环境", timezone: "Asia/Shanghai", retentionDays: 90, defaultTpm: 1000000 } };
}

export function parseAdminState(raw) {
  if (!raw) return createAdminSeed();
  const value = JSON.parse(raw);
  if (value?.version !== 1 || !Array.isArray(value.models) || !Array.isArray(value.apiKeys)) throw new Error("演示数据格式不兼容");
  const seed = createAdminSeed();
  const restored = { ...seed, ...value, ...Object.fromEntries(["modelVersions", "validations", "clusters", "artifacts", "deployments", "supplyPrices", "memberships", "grants", "ledger", "routes", "limits", "fallbacks", "releases", "caches", "requests", "alerts", "incidents", "products", "prices", "orders", "bills", "settlements", "adjustments", "announcements", "securityPolicies", "securityEvents", "admins", "approvals", "integrations"].map(key => [key, Array.isArray(value[key]) ? value[key] : seed[key]])) };
  for (const key of ['models', 'modelVersions', 'tenants', 'projects']) restored[key] = [...restored[key], ...seed[key].filter(item => !restored[key].some(saved => saved.id === item.id))];
  restored.apiKeys = restored.apiKeys.map(key => {
    const index = seed.apiKeys.findIndex(item => item.id === key.id);
    return index >= 0 && index < seed.projects.length * 2 && key.updatedAt === now ? { ...key, modelIds: seed.apiKeys[index].modelIds } : key;
  });
  restored.requests = [...restored.requests.filter(item => !item.id?.startsWith('usage-demo-')), ...seed.requests.filter(item => item.id.startsWith('usage-demo-'))];
  return restored;
}

export function canMutate(role, action) {
  if (action.type === "setRole" || role === "平台管理员") return true;
  if (role === "只读观察员") return false;
  const collection = action.collection || action.changes?.[0]?.collection || (action.type === "setSettings" ? "settings" : "");
  const allowed = {
    运营人员: ["models","modelVersions","validations","tenants","projects","memberships","apiKeys","grants","products","prices","orders","announcements"],
    运维人员: ["providers","endpoints","supplyPrices","clusters","artifacts","deployments","routes","limits","fallbacks","releases","caches","alerts","incidents","integrations"],
    财务人员: ["prices","orders","ledger","bills","settlements","adjustments"],
    安全管理员: ["securityPolicies","securityEvents","apiKeys"],
  };
  return allowed[role]?.includes(collection) || false;
}

export function commitAdminState(state, action, actor = state.currentRole) {
  if (!canMutate(actor, action)) throw new Error(`${actor}无权执行此操作`);
  const next = structuredClone(state), timestamp = new Date().toISOString();
  if (action.type === "setRole") next.currentRole = action.role;
  else if (action.type === "setSettings") next.settings = { ...next.settings, ...action.changes };
  else if (action.type === "add") {
    if (!Array.isArray(next[action.collection])) throw new Error("未知数据集合");
    if (next[action.collection].some(item => item.id === action.record.id)) throw new Error("记录 ID 已存在");
    next[action.collection].unshift({ createdAt: timestamp, updatedAt: timestamp, ...action.record });
  } else if (action.type === "update") {
    const index = next[action.collection]?.findIndex(item => item.id === action.id) ?? -1;
    if (index < 0) throw new Error("记录不存在");
    next[action.collection][index] = { ...next[action.collection][index], ...action.changes, updatedAt: timestamp };
  } else if (action.type === "batch") {
    for (const change of action.changes) {
      if (!Array.isArray(next[change.collection])) throw new Error("未知数据集合");
      if (change.type === "add") {
        if (next[change.collection].some(item => item.id === change.record.id)) throw new Error("记录 ID 已存在");
        next[change.collection].unshift({ createdAt: timestamp, updatedAt: timestamp, ...change.record });
      } else {
        const index = next[change.collection].findIndex(item => item.id === change.id);
        if (index < 0) throw new Error("记录不存在");
        next[change.collection][index] = { ...next[change.collection][index], ...change.changes, updatedAt: timestamp };
      }
    }
  } else throw new Error("未知操作");
  next.revision += 1; next.updatedAt = timestamp;
  if (action.type !== "setRole") next.audits.unshift(record(`audit-${next.revision}`, { actor, action: action.type, objectId: action.record?.id || action.id || action.objectId || "batch", result: "成功", before: null, after: action.record || action.changes }));
  return next;
}

export function useAdminStore() {
  const [state, setState] = useState(() => { try { return parseAdminState(localStorage.getItem(STORAGE_KEY)); } catch (error) { return { ...createAdminSeed(), storageError: error.message }; } });
  const [conflict, setConflict] = useState(false);
  useEffect(() => { if (!state.storageError) localStorage.setItem(STORAGE_KEY, JSON.stringify(state)); }, [state]);
  useEffect(() => { const onStorage = event => { if (event.key !== STORAGE_KEY || !event.newValue) return; try { const incoming = parseAdminState(event.newValue); if (incoming.revision > state.revision) setConflict(true); } catch { setConflict(true); } }; addEventListener("storage", onStorage); return () => removeEventListener("storage", onStorage); }, [state.revision]);
  const dispatch = action => setState(current => { try { return commitAdminState(current, action); } catch (error) { queueMicrotask(() => globalThis.alert?.(error.message)); return current; } });
  const recover = () => { const fresh = createAdminSeed(); localStorage.setItem(STORAGE_KEY, JSON.stringify(fresh)); setState(fresh); setConflict(false); };
  const reload = () => { try { setState(parseAdminState(localStorage.getItem(STORAGE_KEY))); setConflict(false); } catch (error) { setState(current => ({ ...current, storageError: error.message })); } };
  return { state, dispatch, recover, reload, conflict };
}
