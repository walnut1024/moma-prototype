// Official OpenAI-compatible entries checked 2026-10-11; registered catalogues are documented subsets, not account entitlements.
const provider = (id, name, code, baseUrl, catalogueSource, catalogModelIds, integrationType = '模型厂商直连') => ({ id, name, code, baseUrl, catalogueSource, catalogModelIds, catalogueCheckedAt: '2026-10-11', sourceType: 'thirdParty', integrationType });
export const CARRIER_PROVIDERS = [
  provider('provider-mobile-cloud', '移动云', 'cmcc', 'https://moma.cmecloud.cn/v1', 'https://ecloud.10086.cn/op-help-center/doc/article/94470', ['ZHIPU/GLM-5.1', 'ZHIPU/GLM-5.2', 'ZHIPU/GLM-5.3'], '云厂商模型服务'),
  { ...provider('provider-ctyun', '天翼云', 'ctyun', 'https://wishub-x1.ctyun.cn/v1', 'https://www.ctyun.cn/document/10541165/10944702', ['4bd107bff85941239e27b1509eccfe98'], '云厂商模型服务'), catalogueNote: '已登记 DeepSeek-R1 的公开文档 Model ID。该文档已停止维护，实际地址和 Model ID 请以供应商控制台为准，接入前需重新核对。' },
];
export const REAL_PROVIDERS = [
  ...CARRIER_PROVIDERS,
  provider('catalog-provider-alibaba', '阿里云百炼', 'bailian', 'https://dashscope.aliyuncs.com/compatible-mode/v1', 'https://help.aliyun.com/zh/model-studio/compatibility-of-openai-with-dashscope', ['qwen3.8-max', 'qwen3.8-flash', 'qwen3.7-plus', 'qwen3.5-omni-plus', 'deepseek-v4-pro', 'kimi-k3', 'glm-5.3', 'MiniMax-M3'], '云厂商模型服务'),
  provider('provider-tokenhub', '硅基流动', 'siliconflow', 'https://api.siliconflow.cn/v1', 'https://api-docs.siliconflow.cn/docs/api/models-get', ['deepseek-ai/DeepSeek-V4-Flash', 'Pro/deepseek-ai/DeepSeek-R1', 'Pro/zai-org/GLM-5.1'], 'Token 聚合服务'),
  provider('catalog-provider-openrouter', '火山引擎方舟', 'volcengine', 'https://ark.cn-beijing.volces.com/api/v3', 'https://docs.volcengine.com/docs/ark/web-search?lang=en', ['doubao-seed-2-1-pro-260915'], '云厂商模型服务'),
  provider('provider-cmss', 'DeepSeek', 'deepseek', 'https://api.deepseek.com', 'https://api-docs.deepseek.com/', ['deepseek-flash', 'deepseek-v4-pro']),
  provider('provider-self', '智谱开放平台', 'zhipu', 'https://open.bigmodel.cn/api/paas/v4', 'https://docs.bigmodel.cn/cn/guide/develop/openai/introduction', ['glm-5.3']),
  provider('catalog-provider-huawei', '月之暗面 Kimi', 'moonshot', 'https://api.moonshot.cn/v1', 'https://platform.kimi.com/docs/models', ['kimi-k3', 'kimi-k2.7-code', 'kimi-k2.7-code-highspeed', 'kimi-k2.6']),
  provider('catalog-provider-tencent', '腾讯云混元', 'hunyuan', 'https://api.hunyuan.cloud.tencent.com/v1', 'https://cloud.tencent.cn/document/product/1729/111007', ['hunyuan-turbos-latest', 'hunyuan-embedding'], '云厂商模型服务'),
  provider('catalog-provider-mobile', '百度智能云千帆', 'qianfan', 'https://qianfan.baidubce.com/v2', 'https://ai.baidu.com/ai-doc/WENXINWORKSHOP/0m2vwrjws', ['ernie-4.0-8k-latest', 'ernie-4.0-turbo-128k', 'ernie-3.5-128k'], '云厂商模型服务'),
  provider('catalog-provider-unicom', '阶跃星辰', 'stepfun', 'https://api.stepfun.com/v1', 'https://github.com/stepfun-ai/Step-3.5-Flash/blob/main/README.zh-CN.md', ['step-3.5-flash']),
  provider('catalog-provider-telecom', '讯飞星火', 'spark', 'https://spark-api-open.xf-yun.com/v1', 'https://www.xfyun.cn/doc/spark/HTTP调用文档.html', ['generalv3.5']),
];
export const BAICHUAN_PROVIDER = provider('provider-baichuan', '百川智能', 'baichuan', 'https://api.baichuan-ai.com/v1', 'https://platform.baichuan-ai.com/docs/api?activity=true', ['Baichuan2-Turbo', 'Baichuan2-Turbo-192k']);
export const realProvider = id => structuredClone(REAL_PROVIDERS.find(item => item.id === id));
