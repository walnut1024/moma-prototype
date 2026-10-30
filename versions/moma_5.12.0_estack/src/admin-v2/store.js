import { usageDemoRequests } from './usage-demo.js';
import { DEFAULT_SUPPLIERS } from './moma-provider.js';
import { officialSupplyRecords } from './official-supply-catalogue.js';
import { tariffDictionarySeed } from './tariff-dictionary.js';
import { CARRIER_PROVIDERS, realProvider } from './real-provider-catalogue.js';
import { toast } from "sonner";
import { useEffect, useRef, useState } from "react";
import { enterpriseTransaction } from "./enterprise.js";
import { individualSeed, individualTransaction } from "./individual-users.js";
import { modelManagementSeed, modelTransaction } from "./model-management.js";
import { providerTransaction } from "./provider-management.js";
import { enterpriseOrganizationSeed } from "./enterprise-organization-demo.js";
import { adminAccountTransaction } from './admin-accounts.js';
import { deploymentTransaction, deploymentUsesArtifact } from './deployments.js';

import { operationsTransaction, templateSeed } from './model-operations.js';
import { catalogueModelSeed } from './real-model-catalogue.js';
import { prepareServiceReviewCases, completeServiceProviderExample } from './service-review-cases.js';
import { prepareSupplierReviewCases } from './supplier-review-cases.js';

export const STORAGE_KEY = "moma.adminV2.5120.v1";
const now = "2026-09-15T10:30:00+08:00";
const record = (id, value) => ({ id, createdAt: now, updatedAt: now, ...value });
const isDerivedUsageRequest = request => request.id?.startsWith('usage-demo-');

export function serializeAdminState(state) {
  // parseAdminState rebuilds these derived examples on every load.
  return JSON.stringify({ ...state, requests: state.requests.filter(request => !isDerivedUsageRequest(request)) });
}

export function createAdminSeed() {
  const models = catalogueModelSeed(now);
  const modelVersions = models.map((model, index) => record(`version-${index + 1}`, { modelId: model.id, version: `v${index + 1}.0`, capabilities: model.capabilities, validationStatus: index === 2 ? "失败" : "通过", isDefault: index !== 2, deprecatedAt: null, status: index === 2 ? "验证失败" : "已发布" }));
  const validations = modelVersions.map((version, index) => record(`validation-${index + 1}`, { modelVersionId: version.id, endpointId: ["endpoint-ds", "endpoint-glm", "endpoint-kimi"][index % 3], cases: ["协议兼容", "流式响应", "基础推理"], passed: version.validationStatus === "通过", result: version.validationStatus, durationMs: 820 + index * 130, status: "已完成" }));
  const providers = ['provider-cmss', 'provider-tokenhub', 'provider-self'].map(id => record(id, { ...realProvider(id), contact: '', contractEnd: null, status: '已启用' }));
  const endpoints = [record("endpoint-ds", { endpointId: "ep-ds-v4-prod", name: "DeepSeek 生产端点", providerId: "provider-cmss", protocol: "OpenAI", baseUrl: "https://demo.invalid/v1", credentialRef: "mock-credential-a", modelIds: ["model-1"], capacity: 18000, health: 99.99, status: "运行中" }), record("endpoint-glm", { endpointId: "ep-glm-self", name: "GLM 自有推理", providerId: "provider-self", protocol: "OpenAI", baseUrl: "https://self.demo.invalid/v1", credentialRef: "mock-credential-b", modelIds: ["model-2", "model-1"], capacity: 12000, health: 99.95, status: "运行中" }), record("endpoint-kimi", { endpointId: "ep-kimi-k3", name: "Kimi 聚合端点", providerId: "provider-tokenhub", protocol: "OpenAI", baseUrl: "https://hub.demo.invalid/v1", credentialRef: "mock-credential-c", modelIds: ["model-3"], capacity: 6000, health: 98.72, status: "需关注" })];
  endpoints.forEach(endpoint => { const provider = providers.find(item => item.id === endpoint.providerId); endpoint.baseUrl = provider.baseUrl; endpoint.name = provider.name + ' 接入'; });
  const initialSupplyPrices = [];
  const { modelSupplies, modelSalePrices } = modelManagementSeed(models, endpoints, initialSupplyPrices, providers);
  models.filter(model => !modelVersions.some(version => version.modelId === model.id)).forEach(model => modelVersions.push(record(model.defaultVersionId, { modelId: model.id, version: 'v1.0', capabilities: model.capabilities, validationStatus: '通过', isDefault: true, status: '已发布' })));
  const clusters = [record("cluster-nj-a", { clusterId: "inference-nj-a", name: "南京智算一池", zone: "南京", gpuType: "H20", totalGpu: 64, allocatedGpu: 36, nodes: 8, status: "运行中" }), record("cluster-sz-a", { clusterId: "inference-sz-a", name: "苏州智算一池", zone: "苏州", gpuType: "L40S", totalGpu: 32, allocatedGpu: 24, nodes: 4, status: "运行中" }), record("cluster-nj-test", { clusterId: "inference-nj-test", name: "南京验证集群", zone: "南京", gpuType: "A800", totalGpu: 16, allocatedGpu: 4, nodes: 2, status: "维护中" })];
  const artifacts = [record("artifact-vllm", { name: "vLLM CUDA 运行时", type: "运行时镜像", version: "v5.1", digest: "sha256:81dd3093a102", size: "18.6 GB", validation: "通过", status: "可运行" }), record("artifact-ds", { name: "DeepSeek-V4-Pro 权重", type: "模型制品", version: "v4.0", digest: "sha256:deepseekv4", size: "412 GB", validation: "通过", status: "可运行" }), record("artifact-base", { name: "CUDA 12.8 基础镜像", type: "基础镜像", version: "2026.09", digest: "sha256:cuda128", size: "8.2 GB", validation: "通过", status: "可运行" })];
  const deployments = [record("deployment-ds", { deploymentId: "deploy-deepseek-v4", name: "DeepSeek-V4-Pro 生产服务", modelId: "model-1", clusterId: "cluster-nj-a", artifactId: "artifact-ds", replicas: 4, gpuPerReplica: 4, endpointId: "endpoint-ds", status: "运行中" }), record("deployment-glm", { deploymentId: "deploy-glm-52", name: "GLM-5.2 生产服务", modelId: "model-2", clusterId: "cluster-sz-a", artifactId: "artifact-vllm", replicas: 2, gpuPerReplica: 4, endpointId: "endpoint-glm", status: "运行中" }), record("deployment-bge", { deploymentId: "deploy-bge-m3", name: "BGE-M3 向量服务", modelId: "model-6", clusterId: "cluster-nj-a", artifactId: "artifact-vllm", replicas: 2, gpuPerReplica: 2, endpointId: null, status: "部署中" })];
  const supplyPrices = [record("supply-price-ds", { priceId: "sp-ds-v4-202609", providerId: "provider-cmss", modelId: "model-1", inputPrice: 1000000, cachedPrice: 200000, outputPrice: 2000000, capacity: 18000, balance: 860000000, effectiveAt: "2026-09-01", status: "生效中" }), record("supply-price-glm", { priceId: "sp-glm-52-202609", providerId: "provider-self", modelId: "model-2", inputPrice: 700000, cachedPrice: 150000, outputPrice: 1400000, capacity: 12000, balance: 420000000, effectiveAt: "2026-09-01", status: "生效中" })];
  supplyPrices.forEach(price => { price.supplyId = modelSupplies.find(supply => supply.modelId === price.modelId && endpoints.find(endpoint => endpoint.id === supply.endpointId)?.providerId === price.providerId)?.id; price.unit = '元/百万 Token'; });
  supplyPrices.push(...initialSupplyPrices);
  const tenants = [record("tenant-gov", { name: "江苏政务云", type: "政府", ownerId: "user-zhang", status: "正常" }), record("tenant-nanjing", { name: "南京智算中心", type: "企业", ownerId: "user-li", status: "正常" }), record("tenant-demo", { name: "企业体验租户", type: "企业", ownerId: "user-chen", status: "需关注" }), ...["苏州工业园区", "无锡城市大脑", "常州制造云", "南通政务中心", "扬州智慧医疗", "徐州交通集团", "盐城教育云", "泰州能源集团", "镇江金融云"].map((name, index) => record(`tenant-usage-${index + 1}`, { name, type: index % 3 === 0 ? "政府" : "企业", ownerId: `user-usage-${index + 1}`, status: "正常" }))];
  const projects = tenants.flatMap((tenant, tenantIndex) => [1, 2].map(projectIndex => record(`project-${tenantIndex + 1}-${projectIndex}`, { tenantId: tenant.id, name: `${tenant.name}${projectIndex === 1 ? "生产" : "测试"}项目`, ownerId: tenant.ownerId, budget: projectIndex === 1 ? 500000000 : 100000000, status: "正常" })));
  const apiKeys = Array.from({ length: 200 }, (_, index) => { const project = projects[index % projects.length], number = String(index + 1).padStart(3, "0"); return record(`key-${number}`, { keyId: `ak-demo-${number}-81dd3093`, name: `api-key-${number}`, tenantId: project.tenantId, projectId: project.id, secretPreview: `sk-****${number}`, modelIds: (index < projects.length * 2 ? models : models.slice(0, 2 + index % 4)).map(model => model.id), status: index % 17 === 0 ? "停用" : "有效", lastUsedAt: index % 9 === 0 ? null : now }); });
  const memberships = tenants.map((tenant, index) => record(`member-${index + 1}`, { userId: tenant.ownerId, name: ["张敏", "李晨", "陈曦"][index] || `${tenant.name}管理员`, tenantId: tenant.id, projectIds: projects.filter(item => item.tenantId === tenant.id).map(item => item.id), role: "租户管理员", status: "正常" }));
  const users = memberships.map(member => record(member.userId, { name: member.name, login: member.userId.replace(/^user-/, ''), email: '', status: '正常', initialized: true }));
  users.push(record('user-unassigned', { name: '王晓', login: 'wangxiao', email: 'wangxiao@example.com', status: '正常', initialized: true }));
  const organizations = tenants.map(tenant => record('org-' + tenant.id, { tenantId: tenant.id, parentId: null, name: tenant.name, status: '正常' }));
  for (const [collection, examples] of Object.entries(enterpriseOrganizationSeed())) ({ organizations, users, memberships })[collection].push(...examples);
  const grants = apiKeys.slice(0, 12).map((key, index) => record(`grant-${index + 1}`, { subjectType: "key", subjectId: key.id, modelIds: key.modelIds, period: index % 3 === 0 ? "day" : "month", limit: index % 3 === 0 ? 10000000 : 100000000, used: (index + 1) * 420000, expiresAt: "2027-09-15", status: "生效中" }));
  const ledger = grants.map((grant, index) => record(`ledger-${index + 1}`, { accountId: grant.subjectId, sourceId: grant.id, type: "额度发放", delta: grant.limit, balance: grant.limit - grant.used, reason: "初始授权", status: "已完成" }));
  const routes = [record("route-deepseek", { routeId: "route-deepseek-prod", name: "DeepSeek 生产路由", modelId: "model-1", targets: [{ endpointId: "endpoint-ds", weight: 70 }, { endpointId: "endpoint-glm", weight: 30 }], mode: "加权", status: "已生效", releaseId: "release-2" }), record("route-glm", { routeId: "route-glm-prod", name: "GLM 优先级路由", modelId: "model-2", targets: [{ endpointId: "endpoint-glm", weight: 100 }], mode: "优先级", status: "已生效", releaseId: "release-2" })];
  const limits = [record("limit-tenant", { name: "政务租户生产限流", scopeType: "tenant", scopeId: "tenant-gov", rpm: 1200, tpm: 1200000, concurrency: 80, status: "已启用" }), record("limit-key", { name: "体验 API 密钥防刷", scopeType: "key", scopeId: "key-001", rpm: 60, tpm: 100000, concurrency: 5, status: "已启用" })];
  const fallbacks = [record("fallback-ds", { name: "DeepSeek 超时回退", routeId: "route-deepseek", timeoutMs: 3000, errorRate: 5, chain: ["endpoint-ds", "endpoint-glm"], status: "已启用" })];
  const releases = [record("release-2", { version: "r-002", configSnapshot: "2 routes · 2 limits · 1 fallback", previousReleaseId: "release-1", validation: "通过", diff: "+ GLM 优先级路由", publishedAt: now, status: "当前生效" }), record("release-1", { version: "r-001", configSnapshot: "1 route · 1 limit", previousReleaseId: null, validation: "通过", diff: "初始版本", publishedAt: "2026-09-14T10:00:00+08:00", status: "历史版本" })];
  const caches = [record("cache-text", { name: "文本模型公共前缀缓存", scope: "tenant+model", ttl: 600, exclusions: "敏感策略命中", hitRate: 38.6, savedTokens: 402670000, status: "已启用" })];
  const requestAnchor = Date.now();
  const requests = Array.from({ length: 168 }, (_, index) => { const model = models[index % 6], key = apiKeys[(index * 7 + Math.floor(index / 6) * 4) % apiKeys.length], endpoint = endpoints[index % endpoints.length], failed = index % 19 === 0, createdAt = new Date(requestAnchor - index * 2 * 60 * 60 * 1000).toISOString(); return { id: `request-${String(index + 1).padStart(4, "0")}`, requestId: `req_${String(index + 1).padStart(6, "0")}`, tenantId: key.tenantId, projectId: key.projectId, keyId: key.id, modelId: model.id, versionId: model.defaultVersionId, endpointId: endpoint.id, releaseId: "release-2", source: index % 4 ? "API 调用" : "网页端调用", attempts: failed ? [{ endpointId: endpoint.id, durationMs: 3000, error: "upstream_timeout" }] : [{ endpointId: endpoint.id, durationMs: 320 + index % 8 * 45, error: null }], usage: model.type === "video" ? { tasks: 1, seconds: 8 + index % 12 } : model.type === "image" ? { tasks: 1, images: 2 } : model.type === "audio" ? { characters: 180 + index % 240 } : model.type === "embedding" ? { input: 1800 + index * 3, vectors: 8 + index % 5 } : { input: 2400 + index * 7, cached: 600 + index % 400, output: 720 + index % 300 }, httpStatus: failed ? 504 : 200, ttftMs: model.capabilities.streaming && !failed ? 180 + index % 120 : null, durationMs: failed ? 3000 : 620 + index % 12 * 70, createdAt, updatedAt: createdAt }; });
  const alerts = [record("alert-glm-errors", { ruleId: "rule-error-rate", objectId: "model-2", title: "GLM-5.2 失败率超过阈值", severity: "高", assignee: "运维人员", status: "待确认", startedAt: "2026-09-15T09:20:00+08:00", timeline: ["09:20 首次触发"] }), record("alert-kimi-health", { ruleId: "rule-endpoint-health", objectId: "endpoint-kimi", title: "Kimi 端点健康度下降", severity: "中", assignee: "运维人员", status: "处理中", startedAt: "2026-09-15T08:10:00+08:00", timeline: ["08:10 触发", "08:30 已确认"] })];
  const incidents = [record("incident-001", { incidentId: "INC-20260915-001", title: "Kimi 上游间歇性超时", alertIds: ["alert-kimi-health"], impact: "约 2.1% 请求触发回退", assignee: "运维人员", resolution: "", status: "处理中", timeline: ["08:10 告警触发", "08:35 建立事件"] })];
  const products = [record("product-payg", { code: "PAYG-TEXT", name: "文本模型按量付费", billingMode: "按量付费", modelIds: ["model-1","model-2"], price: 1.8, status: "已上架" }), record("product-plan", { code: "TOKEN-100M", name: "Token Plan 100M", billingMode: "预付费", modelIds: ["model-1","model-3"], price: 699, status: "已上架" })];
  const prices = [record("price-payg-v1", { productId: "product-payg", item: "输入 Token", unit: "百万 Tokens", amount: 1, effectiveAt: "2026-09-01", status: "生效中" }), record("price-output-v1", { productId: "product-payg", item: "输出 Token", unit: "百万 Tokens", amount: 2, effectiveAt: "2026-09-01", status: "生效中" })];
  const orders = [record("order-001", { orderNo: "ORD-202609-001", tenantId: "tenant-gov", productId: "product-plan", amount: 699, entitlement: 100000000, status: "已开通", timeline: ["订单创建", "支付成功", "权益发放"] }), record("order-002", { orderNo: "ORD-202609-002", tenantId: "tenant-nanjing", productId: "product-payg", amount: 0, entitlement: 0, status: "生效中", timeline: ["订单创建", "服务开通"] })];
  const bills = [record("bill-001", { billNo: "BILL-202609-001", tenantId: "tenant-gov", period: "2026-09", amount: 486.2, discount: 20, paid: 466.2, status: "已出账" }), record("bill-002", { billNo: "BILL-202609-002", tenantId: "tenant-nanjing", period: "2026-09", amount: 301.74, discount: 0, paid: 0, status: "待出账" })];
  const settlements = [record("settlement-001", { settlementNo: "SET-202609-CMSS", providerId: "provider-cmss", period: "2026-09", platformAmount: 984, providerAmount: 981.5, difference: 2.5, status: "待确认" })];
  const adjustments = [record("adjustment-001", { adjustmentNo: "ADJ-202609-001", billId: "bill-001", amount: -8.4, reason: "重复计量冲正", status: "待审批" })];
  const announcements = [record("notice-001", { title: "国庆假期服务保障通知", audience: "全部租户", channel: "站内信", effectiveAt: "2026-09-30", status: "草稿" })];
  const admins = [record("admin-001", { account: "estack-yy", name: "平台管理员", role: "平台管理员", scope: "全平台", status: "已启用" }), record("admin-002", { account: "ops-wang", name: "王运维", role: "运维人员", scope: "服务运维", status: "已启用" })];
  const approvals = [record("approval-001", { name: "大额调账审批", condition: "金额绝对值 ≥ ¥5", approverRole: "财务人员", status: "已启用" })];
  const integrations = [record("integration-001", { name: "生产告警群", type: "飞书 Webhook", target: "ops-demo", events: "高等级告警", lastResult: "检查通过", status: "已启用" })];
  const personal = individualSeed();
  for (const [collection, examples] of Object.entries(personal)) ({ users, tenants, projects, apiKeys, grants, products, orders })[collection].push(...examples);
  CARRIER_PROVIDERS.forEach(provider => {
    providers.push(record(provider.id, { ...structuredClone(provider), contact: '', contractEnd: null, status: '已启用' }));
    endpoints.push(record('endpoint-' + provider.code, { endpointId: 'ep-' + provider.code, name: provider.name + ' 接入', providerId: provider.id, protocol: 'OpenAI', baseUrl: provider.baseUrl, credentialRef: '', modelIds: [], status: '停用', connectionTest: null }));
  });
  DEFAULT_SUPPLIERS.forEach(provider => {
    providers.push(record(provider.id, { ...structuredClone(provider), contact: '', contractEnd: null, status: '已启用' }));
    endpoints.push(record('endpoint-' + provider.code, { endpointId: 'ep-' + provider.code, name: provider.name + ' 接入', providerId: provider.id, protocol: 'OpenAI', baseUrl: provider.baseUrl, credentialRef: '', modelIds: [], status: '停用', connectionTest: null }));
  });
  const official = officialSupplyRecords();
  providers.push(...official.providers.map(provider => record(provider.id, provider)));
  endpoints.push(...official.endpoints.map(endpoint => record(endpoint.id, endpoint)));
  requests.push(...usageDemoRequests({ models, tenants, projects, apiKeys, endpoints, memberships }, requestAnchor));
  return { serviceRoutes: [], modelOnboardings: [], tariffDictionary: tariffDictionarySeed(), modelTemplates: templateSeed(models), version: 1, revision: 1, updatedAt: now, models, modelSupplies, modelSalePrices, modelVersions, validations, providers, endpoints, supplyPrices, clusters, artifacts, deployments, tenants, projects, memberships, users, organizations, apiKeys, grants, ledger, routes, limits, fallbacks, releases, caches, requests, alerts, incidents, products, prices, orders, bills, settlements, adjustments, announcements, admins, approvals, integrations, audits: [], currentRole: "平台管理员", settings: { environmentLabel: "运营中心", timezone: "Asia/Shanghai", retentionDays: 90, defaultTpm: 1000000 } };
}

export function parseAdminState(raw) {
  if (!raw) return prepareSupplierReviewCases(prepareServiceReviewCases(createAdminSeed()), false);
  const value = JSON.parse(raw);
  if (value?.version !== 1 || !Array.isArray(value.models) || !Array.isArray(value.apiKeys)) throw new Error("数据格式不兼容");
  const seed = createAdminSeed();
  const restored = { ...seed, ...value, ...Object.fromEntries(["serviceRoutes", "modelOnboardings", "tariffDictionary", "modelTemplates", "modelSupplies", "modelSalePrices", "users", "organizations", "modelVersions", "validations", "clusters", "artifacts", "deployments", "supplyPrices", "memberships", "grants", "ledger", "routes", "limits", "fallbacks", "releases", "caches", "requests", "alerts", "incidents", "products", "prices", "orders", "bills", "settlements", "adjustments", "announcements", "admins", "approvals", "integrations"].map(key => [key, Array.isArray(value[key]) ? value[key] : seed[key]])) };
  const newExamples = seed.models.filter(model => model.id.startsWith('catalog-demo-') && !value.models.some(saved => saved.id === model.id));
  for (const key of ['models', 'modelVersions', 'tenants', 'projects']) restored[key] = [...restored[key], ...seed[key].filter(item => !restored[key].some(saved => saved.id === item.id))];
  const exampleIds = new Set(newExamples.map(model => model.id));
  const carrierProviderIds = new Set(['mobile', 'unicom', 'telecom'].map(key => `catalog-provider-${key}`));
  const carrierEndpointIds = new Set(seed.endpoints.filter(item => carrierProviderIds.has(item.providerId) && restored.models.some(model => item.modelIds.includes(model.id))).map(item => item.id));
  for (const key of ['modelSupplies', 'modelSalePrices', 'endpoints']) restored[key] = [...restored[key], ...seed[key].filter(item => ((key === 'endpoints' ? item.modelIds.some(id => exampleIds.has(id)) : exampleIds.has(item.modelId)) || (key === 'endpoints' ? carrierEndpointIds.has(item.id) : key === 'modelSupplies' && carrierEndpointIds.has(item.endpointId))) && !restored[key].some(saved => saved.id === item.id))];
  restored.providers = [...restored.providers, ...seed.providers.filter(provider => (newExamples.length && provider.id.startsWith('catalog-provider-') || carrierProviderIds.has(provider.id)) && !restored.providers.some(saved => saved.id === provider.id))];
  const defaultProviderIds = new Set(DEFAULT_SUPPLIERS.map(provider => provider.id));
  restored.providers = [...restored.providers, ...seed.providers.filter(item => defaultProviderIds.has(item.id) && !restored.providers.some(saved => saved.id === item.id))];
  restored.apiKeys = restored.apiKeys.map(key => {
    const index = seed.apiKeys.findIndex(item => item.id === key.id);
    return index >= 0 && index < seed.projects.length * 2 && key.updatedAt === now ? { ...key, modelIds: seed.apiKeys[index].modelIds } : key;
  });
  restored.requests = [...restored.requests.filter(item => !isDerivedUsageRequest(item)), ...seed.requests.filter(isDerivedUsageRequest)];
  // Add explicitly labeled personal-account examples without replacing edited records.
  for (const [collection, examples] of Object.entries(individualSeed())) restored[collection].push(...examples.filter(example => !restored[collection].some(item => item.id === example.id)));
  // Enrich the demo enterprise without resetting saved accounts or their assignments.
  if (restored.tenants.some(tenant => tenant.id === 'tenant-gov') && restored.organizations.some(org => org.id === 'org-tenant-gov' && org.tenantId === 'tenant-gov')) {
    for (const [collection, examples] of Object.entries(enterpriseOrganizationSeed())) restored[collection].push(...examples.filter(example => !restored[collection].some(item => item.id === example.id)));
  }
  return restored;
}

export function canMutate(role, action) {
  if (action.type === 'deploymentOperation') return ['平台管理员', '运维人员'].includes(role);
  if (action.type === 'modelOperations') return ['平台管理员', '运营人员'].includes(role);
  if (action.type === 'adminAccount') return role === '平台管理员';
  if (action.type === 'providerOperation') return ['平台管理员', '运营人员'].includes(role);
  if (action.type === "individual") return ["平台管理员", "运营人员"].includes(role);
  if (action.type === 'modelOperation') return ['平台管理员', '运营人员'].includes(role) || (role === '财务人员' && ['priceDraft', 'pricePublish', 'procurement'].includes(action.operation));
  if (action.type === "enterprise") return ["平台管理员", "运营人员"].includes(role);
  if (action.type === "setRole" || role === "平台管理员") return true;
  if (role === "只读观察员") return false;
  const collection = action.collection || action.changes?.[0]?.collection || (action.type === "setSettings" ? "settings" : "");
  const allowed = {
    运营人员: ["providers","endpoints","supplyPrices","models","modelVersions","validations","tenants","projects","memberships","users","organizations","apiKeys","grants","products","prices","orders","announcements"],
    运维人员: ["clusters","artifacts","deployments","routes","limits","fallbacks","releases","caches","alerts","incidents","integrations"],
    财务人员: ["prices","orders","ledger","bills","settlements","adjustments"],
    安全管理员: ["apiKeys"],
  };
  return allowed[role]?.includes(collection) || false;
}

export function commitAdminState(state, action, actor = state.currentRole) {
  const deletingLibrary = action.type === 'modelOperations' && action.operation === 'templateDelete';
  const directChanges=action.type==='batch'?action.changes:[action];
  if (action.type!=='modelOperations' && directChanges?.some(change=>change.collection==='models' && ['serviceProviders','serviceMode','serviceModeRevision'].some(key=>Object.hasOwn(change.changes || change.record || {},key)) || change.collection==='modelSalePrices' && ['model','provider'].includes((change.record || change.changes)?.scope || state.modelSalePrices.find(price=>price.id===change.id)?.scope))) throw new Error('模型服务关联及售价须通过服务管理操作');
  const isEnterprise = ['enterprise', 'individual', 'adminAccount'].includes(action.type);
  if (action.type !== 'adminAccount' && (action.collection === 'admins' || Array.isArray(action.changes) && action.changes.some(change => change.collection === 'admins'))) throw new Error('后台账号须通过账号管理操作');
  if (action.type !== 'modelOperations' && (action.collection === 'serviceRoutes' || Array.isArray(action.changes) && action.changes.some(change => change.collection === 'serviceRoutes'))) throw new Error('服务路由须通过路由管理操作');
  if (action.type !== 'modelOperations' && (action.collection === 'tariffDictionary' || Array.isArray(action.changes) && action.changes.some(change => change.collection === 'tariffDictionary'))) throw new Error('资费字典须通过字典维护操作');
  if (!canMutate(actor, action)) throw new Error(`${actor}无权执行此操作`);
  if (action.type === "enterprise") action = enterpriseTransaction(state, action);
  if (action.type === "individual") action = individualTransaction(state, action, actor);
  if (action.type === "modelOperations") action = operationsTransaction(state, action);
  if (action.type === "modelOperation") action = modelTransaction(state, action);
  if (action.type === 'providerOperation') action = providerTransaction(state, action);
  if (action.type === 'adminAccount') action = adminAccountTransaction(state, action);
  if (action.type === 'deploymentOperation') action = deploymentTransaction(state, action);
  if (action.type === 'update' && action.collection === 'artifacts' && action.changes.status === '已删除' && state.deployments.some(item => deploymentUsesArtifact(item, action.id))) throw new Error('该制品被部署或回滚配置引用，不能删除');
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
        if (change.type === 'remove') {
          if (change.collection !== 'tariffDictionary' && !(deletingLibrary && change.collection === 'modelTemplates')) throw new Error('不支持删除此集合');
          next[change.collection].splice(index, 1);
        } else next[change.collection][index] = { ...next[change.collection][index], ...change.changes, updatedAt: timestamp };
      }
    }
  } else throw new Error("未知操作");
  next.revision += 1; next.updatedAt = timestamp;
  if (action.type !== "setRole") next.audits.unshift(record(`audit-${next.revision}`, { createdAt: timestamp, updatedAt: timestamp, actor, action: action.label || action.type, objectId: action.record?.id || action.id || action.objectId || "batch", result: "成功", before: isEnterprise ? action.changes.filter(change => change.type === 'update').map(change => ({ collection: change.collection, id: change.id, values: Object.fromEntries(Object.keys(change.changes).map(key => [key, state[change.collection].find(item => item.id === change.id)?.[key]])) })) : null, after: action.record || action.changes }));
  return next;
}

export function persistAdminAction(state, action, storage) {
  if (state.storageError) throw new Error('本地数据尚未就绪，请先重新加载');
  const raw = storage.getItem(STORAGE_KEY);
  if (raw && JSON.parse(raw).revision !== state.revision) throw new Error('数据已变化，请载入新版本后重试');
  const next = commitAdminState(state, action);
  storage.setItem(STORAGE_KEY, serializeAdminState(next));
  return next;
}

export function persistModelAction(state, action, storage) {
  if (!['modelOperation', 'modelOperations'].includes(action.type)) throw new Error('此入口仅支持模型操作');
  if (state.storageError) throw new Error('本地数据尚未就绪，请先重新加载');
  const raw = storage.getItem(STORAGE_KEY);
  if (raw && JSON.parse(raw).revision !== state.revision) throw new Error('数据已变化，请载入新版本后重试；当前输入保留');
  const next = commitAdminState(state, action);
  storage.setItem(STORAGE_KEY, serializeAdminState(next));
  return next;
}

export function persistProviderAction(state, action, storage, expectedRevision = state.revision) {
  if (action.type !== 'providerOperation') throw new Error('此入口仅支持供应商操作');
  if (state.storageError) throw new Error('本地数据尚未就绪，请先重新加载');
  const raw = storage.getItem(STORAGE_KEY);
  if (state.revision !== expectedRevision || (raw && JSON.parse(raw).revision !== expectedRevision)) throw new Error('数据已变化，请载入新版本后重试；当前输入保留');
  const next = commitAdminState(state, action);
  storage.setItem(STORAGE_KEY, serializeAdminState(next));
  return next;
}

export function persistEnterpriseAction(state, action, storage, expectedRevision = state.revision) {
  if (action.type !== 'enterprise') throw new Error('此入口仅支持企业操作');
  if (state.storageError) throw new Error('本地数据尚未就绪，请先重新加载');
  const raw = storage.getItem(STORAGE_KEY);
  if (expectedRevision !== state.revision || (raw && JSON.parse(raw).revision !== state.revision)) throw new Error('数据已变化，请载入新版本后重试；当前输入保留');
  const next = commitAdminState(state, action);
  storage.setItem(STORAGE_KEY, serializeAdminState(next));
  return next;
}

export function persistIndividualAction(state, action, storage, expectedRevision = state.revision) {
  if (action.type !== 'individual') throw new Error('此入口仅支持个人用户操作');
  if (state.storageError) throw new Error('本地数据尚未就绪，请先重新加载');
  const raw = storage.getItem(STORAGE_KEY);
  if (expectedRevision !== state.revision || (raw && JSON.parse(raw).revision !== state.revision)) throw new Error('数据已变化，请载入新版本后重试；当前输入保留');
  const next = commitAdminState(state, action);
  storage.setItem(STORAGE_KEY, serializeAdminState(next));
  return next;
}

export function persistAdminAccountAction(state, action, storage, expectedRevision = state.revision) {
  if (action.type !== 'adminAccount') throw new Error('此入口仅支持后台账号操作');
  if (state.storageError) throw new Error('本地数据尚未就绪，请先重新加载');
  const raw = storage.getItem(STORAGE_KEY);
  if (state.revision !== expectedRevision || (raw && JSON.parse(raw).revision !== expectedRevision)) throw new Error('数据已变化，请载入新版本后重试；当前输入保留');
  const next = commitAdminState(state, action);
  storage.setItem(STORAGE_KEY, serializeAdminState(next));
  return next;
}

export function loadAdminState(storage) {
  const raw = storage.getItem(STORAGE_KEY);
  const state = prepareSupplierReviewCases(parseAdminState(raw));
  const completed = completeServiceProviderExample(state);
  const storedRequests = raw ? JSON.parse(raw).requests : [];
  if (completed === state && raw && (!Array.isArray(storedRequests) || !storedRequests.some(isDerivedUsageRequest))) return state;
  const next = raw ? { ...completed, revision: state.revision + 1 } : completed;
  try {
    if (storage.getItem(STORAGE_KEY) !== raw) throw new Error('数据已变化，请载入最新数据后重试');
    storage.setItem(STORAGE_KEY, serializeAdminState(next));
    return next;
  } catch (error) {
    return { ...state, storageError: error.message };
  }
}

export function useAdminStore() {
  const [state, setState] = useState(() => { try { return loadAdminState(localStorage); } catch (error) { return { ...createAdminSeed(), storageError: error.message }; } });
  const [conflict, setConflict] = useState(false);
  const currentState = useRef(state);
  currentState.current = state;
  useEffect(() => { const onStorage = event => { if (event.key !== STORAGE_KEY || !event.newValue) return; try { const incoming = parseAdminState(event.newValue); if (incoming.revision > state.revision) setConflict(true); } catch { setConflict(true); } }; addEventListener("storage", onStorage); return () => removeEventListener("storage", onStorage); }, [state.revision]);
  const dispatch = action => {
    try {
      if (conflict) throw new Error('检测到数据冲突，请载入新版本后重试');
      const next = persistAdminAction(currentState.current, action, localStorage);
      currentState.current = next; setState(next);
      if (action.type !== 'setRole' && action.feedback !== false) {
        const names = { clusters: '集群', deployments: '模型部署', artifacts: '制品', routes: '路由策略', limits: '限流规则', fallbacks: '回退策略', caches: '缓存策略', releases: '配置版本', alerts: '告警', incidents: '事件', products: '商品', orders: '订单', announcements: '公告', settlements: '结算单', adjustments: '调账', bills: '账单', prices: '价格' };
        const collection = action.collection || action.changes?.[0]?.collection;
        const status = action.changes?.status;
        toast.success(action.feedback || `${names[collection] || '配置'}${status?.startsWith('已') ? status : action.type === 'add' ? '已新建' : '已更新'}`);
      }
      return next;
    } catch (error) { toast.error(error.message); return null; }
  };
  const transact = action => {
    if (conflict) throw new Error('检测到数据冲突，请载入新版本后重试；当前输入保留');
    const next = persistEnterpriseAction(currentState.current, action, localStorage, state.revision);
    currentState.current = next;
    setState(next);
    return next;
  };
  const transactModel = action => {
    if (conflict) throw new Error('检测到数据冲突，请载入新版本后重试；当前输入保留');
    const next = persistModelAction(currentState.current, action, localStorage);
    currentState.current = next;
    setState(next);
    return next;
  };
  const transactIndividual = action => {
    if (conflict) throw new Error('检测到数据冲突，请载入新版本后重试；当前输入保留');
    const next = persistIndividualAction(currentState.current, action, localStorage, state.revision);
    currentState.current = next;
    setState(next);
    return next;
  };
  const transactProvider = action => {
    if (conflict) throw new Error('检测到数据冲突，请载入新版本后重试；当前输入保留');
    const next = persistProviderAction(currentState.current, action, localStorage, state.revision);
    currentState.current = next;
    setState(next);
    return next;
  };
  const reload = () => { try { const fresh = loadAdminState(localStorage); currentState.current = fresh; setState(fresh); setConflict(false); if (fresh.storageError) toast.error(fresh.storageError); else toast.success("已载入最新数据"); } catch (error) { toast.error(error.message); setState(current => ({ ...current, storageError: error.message })); } };
  const transactAdminAccount = (action, expectedRevision) => {
    if (conflict) throw new Error('检测到数据冲突，请载入新版本后重试；当前输入保留');
    const next = persistAdminAccountAction(currentState.current, action, localStorage, expectedRevision);
    currentState.current = next;
    setState(next);
    return next;
  };
  return { state, dispatch, transact, transactModel, transactIndividual, transactProvider, transactAdminAccount, reload, conflict };
}
