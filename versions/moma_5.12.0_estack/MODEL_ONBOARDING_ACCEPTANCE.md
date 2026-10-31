# 模型接入 Spec 验收证据矩阵

日期：2026-10-31。分支：`feat/model-onboarding-spec-20261031`。依据：[模型接入规格](MODEL_ONBOARDING_SPEC.md)。前文保留原 A／B／C 的 AC01–62 历史证据；本轮 v1.1 的 AC63–74、动作数与待补录集成结果见文末新增矩阵。

## 原 A／B／C 交付与证据口径

用户明确本次只做 mock 原型，不做真实上游验证。A／B／C 保留作需求追踪；发现、任务、候选、平台试调用、发布及用量由浏览器 mock API 驱动，记录保持 `source:'mock'`／`evidenceSource:'mock'`。生产出站策略、真实凭证库、生产鉴权及真实厂商协议不属于本次交付声明，也不作为 mock 原型的未完成门槛。

- **规则已验**：领域／转换测试直接验证业务约束。
- **mock 合同已验**：mock API、编排及持久化合同通过；默认调用测试禁止 fetch。
- **界面已验**：根任务在浏览器实际操作过表中所述路径，不扩展为所有组合的手工通过。

最终独立版本测试 **581/581**、Sites／版本隔离／退役 **10/10** 通过；完整 build 完成至 Prepared Sites build，保留大 chunk 提示。源文件 lint 通过且日志为空。测试文件 lint exit 0，保留 4 处既有 unused 参数 warnings；不称全部 lint 零警告。此前 555 项为阶段结果，本表以最终 581 项替代。

日志、13 张截图及详细路径见 [实施台账](MODEL_ONBOARDING_PROGRESS.md)。字体放大、全浏览器与全部手工组合未验；其余边界按规则或 mock 合同证据记录，不把未逐组合点测等同缺少实现。

## 原 A／B／C 证据索引

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

## 原 62 条验收逐项记录

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

## 原 A／B／C 最终证据范围

浏览器补充走查覆盖主体空附属登记、未完成 Anthropic 草稿恢复、原始上游 ID 匹配、未匹配行保留与原子阻断、无价 2 项测试和明确启用、父子表单确认与焦点、名称错误定位、参考分页、发现状态、分层诊断、路由未提交草稿往返、受限 C 试调用及发布后重开。

另实际完成独立最小资料→新渠道 B passed→启用→无既有服务 handoff→预填同资料新增服务→完善作者／日期／介绍并保存草稿。该浏览器路径未宣称继续手工跑完此新资料的 C 和最终上架；精确 templateId、完整 C 及防绕过合同由 `service-material-publication.test.mjs` 直接覆盖。

新显式上架门槛不追溯改变既有 seed 的在线状态。未执行真实上游、真实费用或生产验收；未推送或部署。

## v1.1 目录外接入与维护简化验收（AC63–74）

依据 [Spec 第 23 节](MODEL_ONBOARDING_SPEC.md#23-目录外接入与日常维护简化2026-10-31)。本轮在 `0f45c82` 上继续实现目录外同页输入、维护候选测试合并、渠道专属 Key 轮换和恢复入口统一。回退标签 `rollback/model-onboarding-before-maintenance-20261031` 指向 `0f45c82`，不清除或重置浏览器业务数据。

本节区分三种证据：已由根任务实际操作的浏览器路径；测试文件中的规则／mock 合同断言；未覆盖的手工组合与生产能力。新增范围不因已有 AC01–62 历史通过而自动记为全部手工通过。

### v1.1 实现与断言索引

| 标识 | 直接实现及合同 |
| --- | --- |
| CUSTOM | `SupplierChannelConfiguration.jsx`、`SupplyModelPicker.jsx`、`onboarding-presets.js`、`model-operations.js`、`channel-onboarding.js`；[目录外接入合同](tests/custom-channel-onboarding.test.mjs)：最低身份、内部编码、引用互斥、原子新增／追加、安全草稿、未知能力与正式服务门槛 |
| PROBE | `CandidateProbePanel.jsx`、`candidate-probe-start.js`；[候选测试启动合同](tests/candidate-probe-start.test.mjs)：明确用量按钮合并候选准备和测试，不重复派发 |
| ROTATE | `ChannelCredentialRotation.jsx`、`credential-rotation-scope.js`、`channel-change-management.js`；[轮换准备](tests/credential-rotation-prepare.test.mjs)、[范围检查](tests/credential-rotation-scope.test.mjs)、[未使用凭证替换](tests/unused-credential-replacement.test.mjs)：专属／组／混合引用及未使用 Key 的实际边界 |
| FROZEN | `channel-change-management.js`；[候选固定范围](tests/candidate-frozen-scope.test.mjs)：测试派发及应用前核对冻结候选、映射、渠道和服务影响；范围变化先拒绝新任务，不部分覆盖 |
| ENABLE-V1.1 | `SupplierChannelBatchTest.jsx`、`SupplierChannelTest.jsx`、`channel-enable-confirmation.js`；[启用确认合同](tests/channel-enable-confirmation.test.mjs)：新追加单映射的明确启用与历史恢复统一检查 |

最终版本全量 **625/625**、下列新增与既有合同均通过；对应日志见本节末尾。文件名用于实现定位，不替代浏览器证据。

### AC63–74 实施矩阵

| ID | 实施与规则证据 | 浏览器证据及剩余边界 |
| --- | --- | --- |
| AC63 | CUSTOM 原子登记新主体、最低身份主档、脱敏 Key、渠道与映射；主体编码内部生成，实际上游 ID 与资料编码分开保存。定向目录外合同已验证。 | 根任务完成新供应商＋`Nebula/Chat-V1`＋新 Key 的保存、测试、明确启用，9 项业务操作；大写及斜杠保留。未把该次成功推广为所有协议均可接入。 |
| AC64 | CUSTOM 保留空任务、空模态、未知能力与待完善资料；定向合同确认最低身份可技术测试启用，不完整正式服务创建被阻断。 | 目录外单模型技术闭环已走；正式服务全部缺项组合未逐项手工点测。服务资料、能力、价格和发布门槛仍由既有合同检查。 |
| AC65 | CUSTOM 保留新主体／新模型的安全未完成文本；草稿不存明文，失败不产生部分主体、资料或映射，独立保存资源保留。 | 已保存并重开恢复未填模型 ID 的新供应商草稿，名称、地址及向量类型保留、Key 为空；未完成输入无过早红错，正式保存仍校验。未完成名称及存储失败组合由合同覆盖，未全部手工点测。 |
| AC66 | CUSTOM 定向合同拒绝三种主体／资料引用混填、同名主体、重复资料编码、非法类型、越权渠道引用及后行失败；显式已有资料复用稳定 ID。 | 接入主路径已走；所有冲突、权限和存储失败组合以规则断言为主，不称全部手工复验。 |
| AC67 | PROBE 合并当前候选准备与明确基础测试；任务沿用原提交、签名和恢复检查，测试不应用。 | 根任务完成地址修改5项操作，并实际验证失败保留旧地址。未知、取消及中断恢复等组合由相关合同覆盖，全量 625 项通过。 |
| AC68 | FROZEN 在测试派发和明确应用前重新核对候选、当前版本、引用集合、服务影响及凭证资格；不同入口不能绕过固定范围或隐式扩大测试用量。 | 地址候选通过后单次明确应用已走；共享组与 Key 列表进入的专属轮换均复验应用成功后保留原页面、新版本和成功信息。 |
| AC69 | ROTATE 按明确专属 endpoint 更新 Key 绑定，其他渠道与共享组主要 Key 保留；旧 Key 不因正常轮换自动撤销。 | 根任务完成渠道专属 Key 轮换5项操作，并核对另两条组引用保持原绑定。失败及撤销边界以合同断言补足，不宣称真实 Key 轮换。 |
| AC70 | ROTATE／FROZEN 按实际引用区分专属、组和混合范围；需完整目标证据后原子应用；未使用 Key 替换另有直接合同。 | 两条组引用已经走到一次按钮顺序验证完整集合及单次明确应用；修复后的持久成功视图已确认；准确当前使用数为共享 2、专属 1、备用 0。混合范围、部分失败及在途新增引用未逐项手工复验。 |
| AC71 | CUSTOM 与 ENABLE-V1.1 原子追加资料／映射，新追加且从未启停、无服务影响的单映射可明确启用；旧渠道和既有映射保持。 | 根任务在已有运行渠道追加 `Qwen3.8 Flash`，保存、测试、启用共6项操作；不自动启用既有兄弟映射。 |
| AC72 | ENABLE-V1.1 让列表和测试入口共用固定选择、资格与服务影响检查，删除旧通过记录直达启用旁路。 | 当前以实现及启用合同断言为主；历史渠道恢复、停用供应商及服务引用变化等手工组合未全部执行。 |
| AC73 | 创建、维护和返回继续使用版本内组件、固定底部动作和字段／行错误定位；同口径记录准备条件和完成终点。 | 本轮实测目录外9、追加6、地址5、两类 Key 各5；1280／1440／1920 实际 CSS 视口无整页横向溢出，1280 正文滚动且模型行不压缩、页脚可达。长 URL 预览省略，模型 ID Tab 到采购价，关闭回添加渠道；未测全键盘与缩放组合。 |
| AC74 | 继续使用浏览器 mock，保留统一资料、采购／销售分离、明确应用／启用及正式服务发布门槛；不改其他版本，不重置记录。 | 本轮操作仅限本地原型，未真实上游调用、真实费用或生产部署。无自动服务创建、客户售价修改和上架等边界以回归合同为主。 |

### v1.1 动作数记录

起点为已打开的添加渠道表单，或目标已可见的供应商详情渠道列表。独立选择、字段填写、保存、测试及必要明确操作分别计数；同一选择器展开不另计，不包含搜索、滚动、等待和失败修复，也不是鼠标点击数。

| 场景 | 根任务已实际走查结果 | 限定 |
| --- | --- | --- |
| 新供应商＋目录外文本模型＋新 Key | **9 项** | OpenAI 兼容；上游 `Nebula/Chat-V1` 保留原值；正式销售服务另计 |
| 已有运行渠道追加一个已有资料模型 | **6 项** | `Qwen3.8 Flash`，基础检查通过后明确启用本次新增映射 |
| 修改一个渠道地址 | **5 项** | 单字段地址修改，明确候选测试与应用；另验证失败保留旧地址 |
| 轮换当前渠道专属 Key | **5 项** | 明确专属渠道范围，另外两条组引用保持；不撤销旧 Key |
| 两条组引用轮换 | **5 项** | 从详情转 API 密钥页、替换主要 Key、填新 Key、测试、应用；一次按钮依次检查完整目标集合，持久成功视图已复验。混合引用选择另计。 |

### v1.1 最终集成补录

| 检查 | 本轮最终结果及日志 |
| --- | --- |
| 独立版本全量测试 | **625/625**，0 失败：[日志](../../outputs/onboarding-maintenance-20261031/final-tests.log) |
| 新增目录外、候选、轮换及启用合同 | 全部包含于最终 625 项；新增草稿中性恢复、派发前冻结范围、未使用备用 Key 不影响在线供给等回归 |
| 完整构建与 Sites／版本隔离 | 完整构建通过，保留既有大 chunk 提示；隔离 **10/10**：[构建](../../outputs/onboarding-maintenance-20261031/final-build.log)、[隔离](../../outputs/onboarding-maintenance-20261031/final-isolation.log) |
| 定向 lint、diff、界面检测 | 27 个变更源／测试文件 oxlint exit 0、无输出；diff --check 通过；Impeccable detector 无发现，另人工检查实际界面：[lint](../../outputs/onboarding-maintenance-20261031/final-lint.log)、[detector](../../outputs/onboarding-maintenance-20261031/final-detector.log) |
| 浏览器截图、三种桌面尺寸、草稿与焦点 | 本轮 [证据目录](../../outputs/onboarding-maintenance-20261031/) 与 [实际覆盖](../../outputs/onboarding-maintenance-20261031/browser-verification.json)；最终重载保留记录且无新增 warn／error |

本节按证据范围记录通过结果，未执行的手工组合仍保留限制；不把 mock 结果描述为真实上游或生产凭证能力。
