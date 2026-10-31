# 模型接入 Spec 验收证据矩阵

日期：2026-10-31。分支：`feat/model-onboarding-spec-20261031`。依据：[模型接入规格](MODEL_ONBOARDING_SPEC.md)。本表覆盖 62 条 AC，记录最终集成结果与实际界面证据。

## 本次交付与证据口径

用户明确本次只做 mock 原型，不做真实上游验证。A／B／C 保留作需求追踪；发现、任务、候选、平台试调用、发布及用量由浏览器 mock API 驱动，记录保持 `source:'mock'`／`evidenceSource:'mock'`。生产出站策略、真实凭证库、生产鉴权及真实厂商协议不属于本次交付声明，也不作为 mock 原型的未完成门槛。

- **规则已验**：领域／转换测试直接验证业务约束。
- **mock 合同已验**：mock API、编排及持久化合同通过；默认调用测试禁止 fetch。
- **界面已验**：根任务在浏览器实际操作过表中所述路径，不扩展为所有组合的手工通过。

最终独立版本测试 **581/581**、Sites／版本隔离／退役 **10/10** 通过；完整 build 完成至 Prepared Sites build，保留大 chunk 提示。源文件 lint 通过且日志为空。测试文件 lint exit 0，保留 4 处既有 unused 参数 warnings；不称全部 lint 零警告。此前 555 项为阶段结果，本表以最终 581 项替代。

日志、13 张截图及详细路径见 [实施台账](MODEL_ONBOARDING_PROGRESS.md)。字体放大、全浏览器与全部手工组合未验；其余边界按规则或 mock 合同证据记录，不把未逐组合点测等同缺少实现。

## 当前证据索引

源码路径相对 `src/admin-v2/`，测试路径相对 `tests/`。

| 标识 | 实现与直接断言 |
| --- | --- |
| ENTRY | `ProviderManagement.jsx`、`SupplyModelView.jsx`：三入口、双视图和目录上下文 |
| CFG | `SupplierChannelConfiguration.jsx`、`SupplierCreationDialog.jsx`：现有三步弹窗、固定模型行、错误定位、草稿和原地资源维护 |
| META | `MinimalModelForm.jsx`、`SupplyModelPicker.jsx`、`channel-association-model.js`；`model-supply-contract.test.mjs`：最小资料、显式引用、同模板关系与删除保护 |
| DRAFT | `channel-onboarding.js`；`channel-onboarding.test.mjs`：非敏感草稿、行校验、原子创建、固定选择、mock任务与回执 |
| TABLE | `ProviderCatalogue.jsx`、`channel-selection.js`；`channel-selection.test.mjs`：映射级选择、当前页／全部筛选、固定快照、分页和右列操作 |
| DISC | `ChannelDiscovery.jsx`、`channel-discovery-diff.js`；`channel-discovery-diff.test.mjs`：现有渠道检查、新旧差异、未提供属性不判相同、部分列表不判删除 |
| JOB | `SupplierChannelBatchTest.jsx`、`channel-test-jobs.js`；`channel-test-jobs.test.mjs`：显式测试、高成本任务选择、独立任务、取消和恢复 |
| IMPACT | `channel-selection-impact.js`；`channel-selection-impact.test.mjs`：provider＋endpoint 分组／50条边界、最后供给和已允许替代集合 |
| DETAIL | `SupplierChannelDetails.jsx`：配置／测试记录／关联服务、来源、阶段、耗时、错误和脱敏JSON |
| CHANGE | `channel-change-management.js`、`ChannelCandidateEditor.jsx`、`KeyGroupCandidateDialog.jsx`：候选、引用预览、组版本、应用与回滚 |
| CAND | `candidate-tests.js`；`candidate-tests.test.mjs`：候选任务固定请求、独立mock回执、任务恢复、能力区分、引用变化及隐式渠道身份 |
| PRICE | `ProcurementVersionEditor.jsx`、`service-workspace.js`；`channel-runtime-pricing.test.mjs`、`catalogue-purchase-price.test.mjs`：采购版本、明确零价、过期门槛、请求开始价格快照及实际成本 |
| MOCK | `mock-onboarding-service.js`、`onboarding-client.js`；`mock-onboarding-service.test.mjs`：默认无fetch、source mock、场景、任务、候选快照、共享额度、平台与客户范围、价格及运行时门槛 |
| SYNC | `mock-onboarding-sync.js`、`store.js`；`mock-onboarding-sync.test.mjs`：同一操作同步不可变候选快照；主存储／mock写入失败恢复；并发不覆盖；本地停用立即阻止旧发布调用 |
| PLATFORM | `ServicePlatformTrial.jsx`、`platform-service-client.js`、`ServiceCallGuide.jsx`、`ServiceManagementWorkspace.jsx`；`platform-service-client.test.mjs`：显式租户／供给、canonical ID、语音probe、精确计量转换、平台试调用、独立发布与失效规则 |
| ENABLE | `channel-enable-confirmation.js`、JOB；`channel-enable-confirmation.test.mjs`：确认冻结完整选择、当前指纹与服务影响，变化整批阻断，恢复仅覆盖所选 |
| SESSION | `service-session-drafts.js`；`service-session-drafts.test.mjs`：服务内容／路由未提交草稿往返，明确放弃恢复生效版本 |
| MATERIAL | `service-material-publication.test.mjs`：独立最小资料到 B、服务引用、C、显式上架的完整 mock 合同，精确 `templateId`，拒绝伪造回执与直接写入 |
| FLOW | `model-onboarding-batch.test.mjs`、`supplier-flow.test.mjs`、`onboarding-20-models.test.mjs`：批量业务边界与20份不同资料共用连接 |

## 62 条验收逐项记录

| ID | 原层级 | 当前证据状态 | 当前 mock 实现与证据范围 |
| --- | --- | --- | --- |
| AC01 | A | 规则已验 | ENTRY 保留三个独立入口及模型／供应商双视图，共用业务对象；筛选和选择规则由领域检查覆盖。 |
| AC02 | A | 规则已验＋界面已验 | 独立最小资料可直接创建渠道，原子补齐供应关系；浏览器完成新渠道 B 测试、启用及进入服务。 |
| AC03 | A | 界面已验 | 主体登记后模型数 0、渠道数 0；未要求地址、Key、模型或价格。 |
| AC04 | A | 规则已验 | META／FLOW 只登记明确资料引用，不创建空渠道、不自动测试或建立销售服务。 |
| AC05 | A | 规则已验＋界面已验 | CFG 使用文本渠道名称和自动 ID；重复名称在下一步定位字段错误，FLOW 拒绝新增时暗用旧资源 ID。 |
| AC06 | A | 规则已验＋界面已验 | Anthropic 未完成的 URL、apiVersion=2026- 可保存草稿并刷新恢复；正式提交仍校验接口和适配字段，不声明真实协议兼容已验。 |
| AC07 | A | 规则已验＋界面已验 | 前轮直接走查 20 个不同模型批选、分页和原子保存；最终合同继续覆盖一连接共用地址／凭证、模型独立验证。本轮另复验参考批选与 2 项闭环。 |
| AC08 | A | 规则已验＋界面已验 | 精确候选仍需确认，相似名称不合并；浏览器人工匹配资料保留原上游 ID，META 只接受明确身份引用。 |
| AC09 | A | 规则已验＋界面已验 | 原地最小资料支持继续编辑保值，放弃回父选择器；另实际新建独立资料并引用到服务。完整同一资料 B→C→上架由 MATERIAL 合同覆盖。 |
| AC10 | A | 规则已验＋界面已验 | DRAFT 返回稳定 rowId／field，未匹配行阻止整批保存；CFG 保留该行，明确取消选择后才保存其余行。 |
| AC11 | A | 规则已验＋界面已验 | 重复资料／上游 ID／渠道名均拒绝；浏览器重复渠道名在下一步显示字段 alert、aria-invalid，并聚焦名称。 |
| AC12 | A | 规则已验＋界面已验 | 上游 vendor/raw:model.v2 在人工匹配主档后原样保留；FLOW 不套用资料编码限制，拒绝空白和控制字符。 |
| AC13 | A | 规则已验＋界面已验 | 参考批选取消未匹配行后，2 项无价保存、mock 测试及技术启用；PRICE／PLATFORM 阻止缺当前采购价的正式发布，不补零。 |
| AC14 | A | 规则已验 | PRICE／PLATFORM 保留明确零价、单位及微货币精度；实际采购价使用折扣或手工覆盖，区别未知。 |
| AC15 | A | 规则已验＋界面已验 | 参考批选保留 unmatched/item，整批被阻止；仅在明确取消该行后保存其余 2 项，没有默默过滤坏行。 |
| AC16 | A | 规则已验＋mock 合同已验 | 部分失败不回滚已保存配置；MOCK 冻结提交场景并逐项记录，失败项不自动启用。 |
| AC17 | A | 规则已验＋界面已验 | 2 项 mock passed 后仍未启用；勾选与明确确认启用是独立动作，不自动关联服务、发布或上架。 |
| AC18 | A | 规则已验＋界面已验 | 浏览器确认时固定 2 项选择，复选框及重测禁用；ENABLE／DRAFT 对指纹、资格、权限变化整批拒绝，不部分启用。 |
| AC19 | A | 规则已验＋界面已验 | Key 子表单取消采用内联确认，最多 2 层并保留父草稿；最小资料继续编辑保值、放弃回父。明确保存 Key 的保留及无明文持久化由规则覆盖。 |
| AC20 | A | 规则已验＋mock 合同已验 | 临时组测试具有独立任务和历史，不覆盖正式配置或当前资格；通过后应用仍是独立候选动作。 |
| AC21 | A | 规则已验＋mock 合同已验 | FLOW／CHANGE 拒绝外供应商组；MOCK 的凭证、渠道与替换集合检查供应商归属。 |
| AC22 | A | 规则已验 | 连接指纹只含调用相关字段；名称、备注修改不改变稳定身份或调用签名。 |
| AC23 | A | 规则已验＋mock 合同已验 | 旧签名回执只留历史，不覆盖新配置；任务绑定提交快照，当前准入按当前签名派生。 |
| AC24 | A | 规则已验＋界面已验 | 浏览器刷新恢复 Anthropic 未完成草稿及模型行；冲突／主存储或 mock 存储失败保留输入和本次原状态由 DRAFT／SYNC 覆盖。 |
| AC25 | A | 规则已验 | 向已有渠道添加仅新增明确模型，保留旧映射、价格、启停与服务；发现新项先进入映射表单。 |
| AC26 | B | mock 合同已验 | custom 发现返回 discovery_unsupported；手动／参考入口独立可用，不把不支持发现解释为调用失败。 |
| AC27 | B | mock 合同已验＋界面已验 | 403、空列表、部分列表三种界面状态区分，均未改写配置；部分列表不判定模型删除。 |
| AC28 | B | 规则已验 | 已有渠道检查分别展示新增、已有、完整列表疑似移除及只读属性差异；不改主档、报价和服务，未提供属性保持未知。 |
| AC29 | B | 规则已验＋mock 合同已验 | 基础与 streaming／tools／structured 专项分别记录；前轮直接补测流式和工具，资格不会因基础成功而全量通过。 |
| AC30 | B | mock 合同已验 | protocol 场景返回 invalid_response、失败与解析阶段；向量／重排不能借错误响应取得通过资格。真实响应解析不属于本次 mock 声明。 |
| AC31 | B | mock 合同已验 | 视频先进行中再进入终态；taskId 固定持久，轮询、取消、恢复保持同一任务，创建成功不当作最终成功。 |
| AC32 | B | mock 合同已验＋界面已验 | 分层诊断实际可见，状态、阶段、建议、追踪等分开呈现；429、余额不足和超时未知的具体边界由 MOCK 合同覆盖。 |
| AC33 | B | mock 合同已验 | 并发 2；取消阻止排队项，已派发项保留结果未知和费用未知，不伪造零消耗。 |
| AC34 | B | 规则已验＋mock 合同已验 | JOB／CAND 固定 pending request／job，关闭重开查询同任务；前轮实际关闭重开候选记录未重新派发。 |
| AC35 | B | mock 合同已验 | 同操作同内容返回原结果，改内容拒绝；客户请求先鉴权再按 Key 隔离幂等缓存，不能用无效或跨租户身份取缓存。 |
| AC36 | B | 规则已验＋mock 合同已验 | 先保存原提交再派发；结果未知先按原操作 ID 查询，明确继续仍用原请求，不创建新任务。 |
| AC37 | B | 本次 mock 范围已验 | 默认调用只进入浏览器 mock API，闭环测试禁止 fetch。生产 DNS、元数据、私网和重定向出站防线不属于本次交付声明。 |
| AC38 | B | 规则已验＋mock 合同已验 | 草稿拒绝秘密和带凭证 URL；只存掩码、引用和 mock 哈希，诊断递归脱敏。不声明生产凭证库安全验收。 |
| AC39 | B | mock 合同已验 | 同凭证账号 RPM 跨渠道聚合，不能按模型数放大；缺少配置不生成虚构额度。 |
| AC40 | B | 规则已验＋mock 合同已验 | 本地 Key 移除、停用、撤销立即约束旧快照及发布调用；SYNC 在同一持久化动作刷新 runtime。 |
| AC41 | B | 规则已验＋mock 合同已验＋界面已验 | 前轮候选 20 项鉴权失败保留旧地址，重开恢复原记录；后续通过才明确应用 v0→v1。在线缺目标快照在主存储写前拒绝。 |
| AC42 | B | 规则已验＋mock 合同已验 | 新增模型／服务引用使旧候选失效；preview／apply 重新检查完整引用与修订，不能覆盖新增引用。 |
| AC43 | C | 规则已验＋mock 合同已验 | 缺价供给可见但不可正式发布；采购版本、金额和单位须明确，免费也须明确 0。 |
| AC44 | C | 规则已验＋mock 合同已验 | 候选切换只换明确供给快照，保留 binding ID、采购／销售价格、租户与路由允许范围；请求采购／销售版本分别冻结。 |
| AC45 | C | mock 合同已验＋界面已验 | 明确选择江苏租户和仅硅基流动供给完成受限平台试调用；普通客户不能访问未发布服务，测试身份仅内存且限定候选。 |
| AC46 | C | mock 合同已验＋界面已验 | 本轮试调用返回采购成本 CNY 0.000024、销售试算 CNY 0.000038，显示未扣客户额度；金额仅为 mock 计算。 |
| AC47 | C | 规则已验＋mock 合同已验＋界面已验 | 明确发布 v2，关闭重开仍显示候选 v2、修订 4、已发布 v2。配置／价格／路由／范围变更及最新失败使新发布资格失效。 |
| AC48 | C | 规则已验＋mock 合同已验 | 停用影响列出已发布服务、已允许可用替代与最后供给；runtime／SYNC 阻止旧发布绕过，不扩大回退范围。 |
| AC49 | A | 规则已验 | 主档及草稿引用、渠道／映射引用保护、默认组删除门槛保留；解除关联不删除历史。 |
| AC50 | A | 规则已验＋界面已验 | 路由 50→47 未提交，进入供给维护再返回仍为 47、生效 v1；明确放弃回 50。新最小资料 handoff 到新增服务预填原资料，保存后清理 sourceLibrary URL。 |
| AC51 | A | 界面已验（有限范围） | 实际 CSS 1280×800 发现框宽 1000／页面宽 1280；1440×900 平台框宽 1000、高 860、top 20／bottom 880；1920×1080 路由页滚动宽 1920。子表单继续编辑焦点为模型名称，放弃回选择模型；参考分页 1/3→2/3 不提交。字体放大及所有浏览器组合未验。 |
| AC52 | A | 规则已验 | 直接事务拒绝无权角色；中途权限或未保存状态变化阻止发布性动作，按钮隐藏不能代替事务检查。 |
| AC53 | C | 规则已验＋mock 合同已验 | 新显式上架／再上架须有当前完整 C mock 发布证据；store 拒绝伪造 main receipt 和直接状态写入，旧 seed 在线状态不追溯下架。生产网关不消费 mock 资格。 |
| AC54 | A | 规则已验 | 旧记录重载保留稳定 ID 和关系；新 mock 状态使用独立版本 key，不按名称合并、迁移或清空业务数据。 |
| AC55 | A | 规则已验＋界面已验 | 2 项明确确认后渠道及所选映射一起启用，handoff 携带 2 个 association；未选项不隐式启用。 |
| AC56 | A | 规则已验 | 恢复只覆盖冻结选择；ENABLE 展示命中的已发布服务并复核服务影响，未选历史映射保持停用。未将此边界记为逐项手工复验。 |
| AC57 | B | 规则已验＋mock 合同已验 | 共享组要求完整引用和候选证据；缺一目标不生成部分替换，预检后单次 commit 整组切换。 |
| AC58 | B | 规则已验＋mock 合同已验 | 撤销独立于快照版本，旧版本及回滚都不能绕过；普通启用不能恢复已撤销 Key。 |
| AC59 | B | 规则已验＋mock 合同已验 | 同签名最新失败、排队／执行中、取消／未知不被旧成功覆盖；平台 trial 亦采用最新结果，基础和专项独立。 |
| AC60 | B | 规则已验＋mock 合同已验 | 非在线未覆盖映射保留并待复测；隐式渠道保留身份及实际成本；无目标旧快照标 needsValidation，不继承资格。 |
| AC61 | C | 规则已验＋mock 合同已验 | 最新已生效报价到期不复活旧价，未来价不提前生效；新请求只阻断或在已允许有效供给内回退，不填 0。 |
| AC62 | C | 规则已验＋mock 合同已验 | 请求保存开始时采购／销售版本，后续调价只影响新请求，不追溯改写已记录 mock 用量。 |

## 最终证据范围

浏览器补充走查覆盖主体空附属登记、未完成 Anthropic 草稿恢复、原始上游 ID 匹配、未匹配行保留与原子阻断、无价 2 项测试和明确启用、父子表单确认与焦点、名称错误定位、参考分页、发现状态、分层诊断、路由未提交草稿往返、受限 C 试调用及发布后重开。

另实际完成独立最小资料→新渠道 B passed→启用→无既有服务 handoff→预填同资料新增服务→完善作者／日期／介绍并保存草稿。该浏览器路径未宣称继续手工跑完此新资料的 C 和最终上架；精确 templateId、完整 C 及防绕过合同由 `service-material-publication.test.mjs` 直接覆盖。

新显式上架门槛不追溯改变既有 seed 的在线状态。未执行真实上游、真实费用或生产验收；未推送或部署。
