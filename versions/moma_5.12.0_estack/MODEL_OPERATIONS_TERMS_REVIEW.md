# 模型运营概念与字段对齐检查

> 历史记录：以下描述 2026-10-31 当时的术语/简化工作与证据，不是当前 UX v1.0 的页面顺序、生效规则或实施状态。当前目标见 [设计基线](MODEL_OPERATIONS_UX_DESIGN.md)、[接入规格](MODEL_ONBOARDING_SPEC.md) 和 [验收要求](MODEL_ONBOARDING_ACCEPTANCE.md)。

日期：2026-10-31。基线：`450de4c`。范围为独立 5.12.0 的资料管理、供应管理、服务管理与运营入门；以实际字段取值和业务校验为依据。统一定义见 [术语表](GLOSSARY.md)，页面功能关系与关键名词已加入运营入门。

## 结论

此前未完全对齐：存在同名异义、同义异名及采购／销售错标。本轮修正可确定的标签、说明、复制反馈、校验消息和导入表头，保留字段值、稳定身份、权限、价格计算、路由及浏览器业务记录。没有把文案修改称为业务模型迁移。

## 已对齐项目

| 概念 | 发现的问题与最终口径 | 直接依据／实现位置 |
| --- | --- | --- |
| 资料 ID | 模型资料编辑页把只读内部 `record.id` 写成“模型 ID”；改为“资料 ID”，不与业务编码或调用参数混用 | [ModelLibraryEditor](src/admin-v2/ModelLibraryEditor.jsx) |
| 模型编码 | 资料 `modelId` 称模型编码，服务表单与搜索却叫模型 ID；现统一显示“模型编码”，每个表单保留实际格式约束 | [ModelMetadataForm](src/admin-v2/ModelMetadataForm.jsx)、[ServiceModelForm](src/admin-v2/ServiceModelForm.jsx)、[model-profile](src/admin-v2/model-profile.js) |
| 上游模型 ID | 服务渠道表、路由映射及供应侧混用 Model ID；统一“上游模型 ID”，仅指向供应商请求的模型参数 | [ServiceContent](src/admin-v2/ServiceContent.jsx)、[ServiceRouting](src/admin-v2/ServiceRouting.jsx)、[service-route-mapping](src/admin-v2/service-route-mapping.js) |
| 对外调用 ID | 同一 `service.callId` 在调用指南、平台试调用及映射中被称为对外 Model ID、平台 Model ID；统一“对外调用 ID”。不再宣称必须采用发布方/模型名格式 | [ServiceCallGuide](src/admin-v2/ServiceCallGuide.jsx)、[ServicePlatformTrial](src/admin-v2/ServicePlatformTrial.jsx)；[路由服务](src/admin-v2/service-routing.js) |
| 供应商与模型作者 | 服务头部“厂商”取的是作者；改“模型作者”。关联服务中的 Provider 名称／标识对应供应商主体及其编码，统一“供应商名称／供应商编码” | [ServiceManagementWorkspace](src/admin-v2/ServiceManagementWorkspace.jsx)、[ServiceWorkspaceDialogs](src/admin-v2/ServiceWorkspaceDialogs.jsx)、[model-operations](src/admin-v2/model-operations.js) |
| 渠道与请求地址 | 渠道不是供应商或一把 Key；说明明确一渠道可接多模型。完整任务 URL 统一“请求地址”，编辑动作“API 地址”和标准接口输入“服务根地址”保留各自含义 | [ProviderManagement](src/admin-v2/ProviderManagement.jsx)、[ProviderCatalogue](src/admin-v2/ProviderCatalogue.jsx)、[SupplierChannelDetails](src/admin-v2/SupplierChannelDetails.jsx)、[ServiceContent](src/admin-v2/ServiceContent.jsx) |
| 密钥绑定 | “当前使用渠道”实际统计配置绑定，包含未启用或停用渠道；改“当前绑定渠道”，不修改统计、删除及撤销算法 | [ProviderApiKeys](src/admin-v2/ProviderApiKeys.jsx)、[credential-rotation-scope](src/admin-v2/credential-rotation-scope.js) |
| 采购价与平台售价 | 服务关联渠道表把 `item.cost` 写成“供应商售价”；改“采购价”。客户价格统一“平台售价”，清除 Provider 售价、平台目录价等旧称 | [service-workspace](src/admin-v2/service-workspace.js)、[ServiceContent](src/admin-v2/ServiceContent.jsx)、[SupplyPriceEditor](src/admin-v2/SupplyPriceEditor.jsx)、[SupplierModelListing](src/admin-v2/SupplierModelListing.jsx)、[SupplierModelBatch](src/admin-v2/SupplierModelBatch.jsx) |
| 采购参考价与采购价 | 目录 `listPrice` 是折扣前基准，采购覆盖单价是 `purchasePrice`；分别标采购参考价、采购价。直接关联输入固定系数 1，其输入值称采购价 | [provider-management](src/admin-v2/provider-management.js)、[supplier-resources](src/admin-v2/supplier-resources.js)、[supplier-listing](src/admin-v2/supplier-listing.js) |
| 输出模态与结果类型 | 服务输出选择同时包含图片／音频与向量／分数／排序结果；表单、详情和错误消息明确“输出模态 / 结果类型”，没有把结果类型伪称内容模态 | [ServiceModelForm](src/admin-v2/ServiceModelForm.jsx)、[ServiceManagementWorkspace](src/admin-v2/ServiceManagementWorkspace.jsx)、[model-profile](src/admin-v2/model-profile.js) |
| 上架与生效路由 | 平台试调用“当前服务”实际显示上架状态，“已发布渠道”取当前生效路由中的参与渠道；改“上架状态／生效路由渠道” | [ServicePlatformTrial](src/admin-v2/ServicePlatformTrial.jsx) |
| 导入模板 | CSV 首两列“模型ID／模型展示名称”统一为“模型编码／模型名称”；生成模板、导入校验和现有合同同步。旧表头会被拒绝，需重新下载模板 | [model-import](src/admin-v2/model-import.js)、[ModelBatchImport](src/admin-v2/ModelBatchImport.jsx)、[导入合同](tests/model-categories.test.mjs) |

## 已解释的实际差异

- **编码约束仍不同。** 资料与快速接入编码允许小写字母、数字及 `. _ : / -`；新建服务编码要求字母开头、字母数字与不连续且不结尾的中划线。引入 `nebula/chat-v1` 等资料时，服务表单需另填符合其格式的编码，资料引用仍保留。本轮未放宽校验，入门明确两处编码不要求同值、按当前表单规则填写。
- **类型粒度和编辑方式不同。** 资料分类将图像／视频聚合为视觉生成，服务类型进一步区分；资料将输出模态与结果类型拆开，服务合并选择但分别保存；资料上下文以 Token 展示，服务允许 K/M 输入。相同概念不强行要求相同控件，也不声称全部枚举和单位完全相同。
- **资料引用与展示副本不同。** 服务保留明确资料引用；修改服务展示资料不另建模型身份。主档维护与服务展示编辑的传播范围不同，不在本轮改变已有同步规则。

## 保留的后续问题

1. **旧供应商视角的调价入口尚未收敛。** `ModelManagement` 的供应商视角仍可打开逐供给的 `SupplyPriceEditor`，其操作写按供给维护的销售价格；它不是采购编辑器，不能通过改名掩盖。[model-management.js](src/admin-v2/model-management.js) 的 `priceDraft/pricePublish` 已拒绝统一服务及分供应商模式走这条路径，因此没有发现绕过共价规则的写入。剩余问题是旧界面仍展示最终会被拒绝的操作；无服务模式的旧记录还保留旧逐供给语义。后续应将入口收敛到统一／分供应商的服务定价流程，本轮未改定价规则或历史数据。
2. **通用价格解析器仍有旧错误用词。** [provider-catalogue-pricing.js](src/admin-v2/provider-catalogue-pricing.js) 的公共校验提示仍含“平台成本／供应商目录价”。它同时承接采购参考价与系数为 1 的直接采购价输入。本轮没有机械替换共享解析上下文，不能宣称所有异常提示字面均已统一。

## 验证记录

最终版本测试、构建、版本隔离、lint 和浏览器证据见本轮 [本地验收目录](../../outputs/model-operations-terms-20261031/)。浏览器验证实际表单标签、表头、折叠概念说明、键盘展开与桌面布局；没有以源码文字代替全部界面验收，也不把 mock 记录称为真实模型服务能力。

| 检查 | 最终结果 |
| --- | --- |
| 独立版本全量测试 | **625/625**，0 失败；导入表头与现有错误断言已同步 |
| 完整构建／Sites 与版本隔离 | 构建通过，保留既有大 chunk 提示；隔离 **10/10** |
| lint／diff／界面检测 | 34 个变更源与测试文件 lint 无错误，保留 `catalogue-purchase-price.test.mjs:21` 两条既有 unused 参数警告；diff 检查通过；detector 无发现，另实际看图核对 |
| 浏览器 | ID 定义键盘展开、价格定义展开；资料 ID／模型编码、服务采购价／平台售价、对外调用 ID、输出模态／结果类型、当前绑定渠道等实际页面已核对；取消服务表单没有保存新记录 |
| 桌面尺寸 | 1280×800、1440×900、1920×1080 页面 scrollWidth 等于视口宽；长定义可换行、正文可滚动；最终重载无新增 warn／error |

回退基线 `450de4c` 已保留；本轮只在本地提交，不推送或部署。未执行真实上游、真实费用、全浏览器及全部异常组合手工验收。
