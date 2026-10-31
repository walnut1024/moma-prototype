# 模型接入优化实施台账

日期：2026-10-31。依据：[完整规格快照](MODEL_ONBOARDING_SPEC.md)；逐项证据见 [原 AC01–62 与 v1.1 AC63–74 验收矩阵](MODEL_ONBOARDING_ACCEPTANCE.md)。前文为原 A／B／C 历史台账，本轮目录外接入和维护简化见末尾新增章节。

## 交付范围与回退

用户明确“不要真实验证，只做 mock”。本次实现独立 5.12.0 的 A、B、C 流程与业务规则；发现、测试、候选、平台试调用、费用及发布使用浏览器 mock API，不需要真实 Key、服务令牌或后端进程。记录保留 mock 来源，不宣称生产接入完成。定时发现、周期探测、多 Key 调度和额外厂商适配器仍为规格后续范围。

- 实施前提交：`0926269`；回退标签：`rollback/model-onboarding-before-20261031`，实际指向 `0926269ee5b619be295463f48a25b1de26448ad8`。
- 分支：`feat/model-onboarding-spec-20261031`；首段提交：`57eea35`，原完整 mock 收口提交：`7209855`。后续简化记录见本文末尾。
- 撤销实施提交使用 `git revert <提交>`；代码回退不恢复或清空浏览器业务数据，不覆盖无关修改。
- 未修改其他版本，未推送或部署；生产出站、鉴权、真实协议及实际扣费不在本次声明范围。

## 原 A／B／C 已实施功能

| 范围 | 最终行为 |
| --- | --- |
| 入口与三步接入 | 主体、供应模型、渠道三入口保留；一渠道多模型，接口、地址、凭证组、RPM、超时及请求选项按需配置。 |
| 草稿与身份 | 非敏感草稿刷新恢复；参考批选保留未匹配行和原始上游 ID；原地最小资料与销售服务通过明确身份引用，缺项整批阻断。 |
| 测试与启用 | 两并发、排队、取消、未知、同任务恢复及原操作查询；高成本和语音任务显式选择，不自动重试。确认冻结完整选择和指纹，变化不部分启用。 |
| 发现与诊断 | 403／空／部分／不支持发现分别表达；已有渠道差异只读；阶段、建议、用量／费用未知及追踪分层显示。 |
| 变更与密钥 | 候选测试不改生效配置；完整引用预检后组原子切换，未覆盖离线映射待复测；紧急撤销约束全部旧快照，回滚需复测。 |
| 价格与服务 | 未知不同免费；采购版本生效／到期与实际成本；请求冻结开始价格。服务内容和路由草稿可往返，明确客户、允许供给后试调用并独立发布。 |
| 上架门槛 | 新显式上架／再上架检查当前完整 C mock 发布；独立 mock 证据拒绝伪造 main receipt 与直接写入。旧 seed 在线状态不追溯下架。 |

## 原 A／B／C 最终集成检查

| 检查 | 最终结果 | 日志 |
| --- | --- | --- |
| 独立版本全部测试 | **581/581**，0 失败；此前 555 为阶段结果 | [测试日志](../../outputs/model-onboarding-interaction-review-20261031/moma-mock-final-tests-rerun.log) |
| 完整构建 | 5.12.0、根构建及 Sites 包装均完成，末尾 Prepared Sites build；保留大 chunk 提示 | [构建日志](../../outputs/model-onboarding-interaction-review-20261031/moma-mock-final-build-rerun.log) |
| Sites／版本隔离／退役 | **10/10**，0 失败 | [隔离日志](../../outputs/model-onboarding-interaction-review-20261031/moma-mock-final-isolation.log) |
| 源文件 lint | exit 0，日志为空 | [源文件 lint 日志](../../outputs/model-onboarding-interaction-review-20261031/moma-mock-final-source-lint.log) |

测试文件 lint 另为 exit 0，保留 4 处既有 unused 参数 warnings：`model-operations.test.mjs:169` 两处、`catalogue-purchase-price.test.mjs:21` 两处，不称全部 lint 零警告。原始最终日志同时保留在 `/tmp/moma-mock-final-tests-rerun.log`、`/tmp/moma-mock-final-build-rerun.log`、`/tmp/moma-mock-final-isolation.log` 及 `/tmp/moma-mock-final-source-lint.log`。

## 原 A／B／C 浏览器实际路径

以下为根任务实际操作记录；不以单条路径覆盖全部边界组合。

1. 只登记供应商主体，保存后为 0 模型、0 渠道。Anthropic 的未完成 URL 与 apiVersion=2026- 保存草稿，刷新恢复原输入。
2. 上游 `vendor/raw:model.v2` 人工匹配资料后保持原值。参考批选保留 `unmatched/item`，提交整批阻断；明确取消该行后，保存其余 2 项无价模型。
3. Key 子表单取消通过内联确认，最多 2 层且保留父草稿；最小资料“继续编辑”保值，焦点为“模型名称”，明确放弃回“选择模型”。重复渠道名下一步展示字段 alert、aria-invalid 并聚焦名称；参考选择器 1/3→2/3 仅翻页，不提交。
4. 2 项 mock passed 后仍未启用；确认区冻结两个复选框、禁用重测；明确确认后启用并携带 2 个 association 进入服务。前轮另直接走查过 20 个不同模型批选、分页和保存，以及候选 20 项失败保留旧地址、重开恢复、后续通过明确应用 v0→v1。
5. 403、empty、partial 发现分别显示错误、无模型和部分结果，未改写配置；测试详情展示分层诊断。
6. 路由草稿从 50 改为 47 未提交，进入供给维护后返回仍为 47，生效版本保持 v1；明确放弃后恢复 50。
7. 平台试调用明确选择江苏租户、仅硅基流动供给，返回采购成本 CNY 0.000024、销售试算 CNY 0.000038，未扣客户额度；明确确认发布 v2。关闭重开后显示候选 v2、修订 4、已发布 v2；当前服务仍已下架，发布配置不会自动上架。金额均为 mock 试算。
8. 另新建独立最小资料→新渠道 B passed→明确启用→handoff 显示无既有服务 CTA→新增服务预填原资料→完善作者、日期、介绍并保存服务草稿，sourceLibrary URL 已清。此新资料的精确 templateId、完整 B→C→显式上架及防伪造／直接写入合同由 `service-material-publication.test.mjs` 覆盖，不虚报该路径已手工完成全部 C／上架。

## 原 A／B／C 尺寸、键盘与截图

| 实际 CSS 视口 | 已观察范围 |
| --- | --- |
| 1280×800 | partial 发现弹窗宽 1000，页面宽 1280；框内滚动，页脚可达。 |
| 1440×900 | 平台弹窗宽 1000、高 860，top 20、bottom 880；客户列表在内部滚动，重开版本信息保留。 |
| 1920×1080 | 路由页 scrollWidth 1920，无整页横向溢出；返回草稿及明确放弃保持正确版本。 |

截图目录：[本地交互走查截图](../../outputs/model-onboarding-interaction-review-20261031/screenshots/)，共 13 张。01–05 为本地 Docker NewAPI／LiteLLM 只读交互参考；06 为 MoMA 改前入口；07–13 为本轮 MoMA 证据：

- [Anthropic 草稿恢复](../../outputs/model-onboarding-interaction-review-20261031/screenshots/07-moma-anthropic-draft-restored.png)
- [启用冻结选择](../../outputs/model-onboarding-interaction-review-20261031/screenshots/08-moma-enable-frozen-selection.png)
- [分层诊断](../../outputs/model-onboarding-interaction-review-20261031/screenshots/09-moma-test-diagnostics.png)
- [1280 部分发现](../../outputs/model-onboarding-interaction-review-20261031/screenshots/10-moma-partial-discovery-1280.png)
- [1920 路由草稿恢复](../../outputs/model-onboarding-interaction-review-20261031/screenshots/11-moma-route-draft-restored-1920.png)
- [1440 平台发布后重开](../../outputs/model-onboarding-interaction-review-20261031/screenshots/12-moma-platform-published-1440.png)
- [原资料新增服务草稿](../../outputs/model-onboarding-interaction-review-20261031/screenshots/13-moma-material-service-created.png)

字体放大、全浏览器和全部手工组合未验。规则／mock 合同通过不代替这些视觉结论，也不代表真实上游、生产安全或实际计费验证。

## v1.1 目录外接入、维护与专属 Key 轮换（2026-10-31）

用户要求按竞品重计数结论继续实施：重点减少目录外模型接入和日常维护动作，修复专属 Key 轮换，同步 spec 与研发须知。权威增量为 [Spec 第 23 节](MODEL_ONBOARDING_SPEC.md#23-目录外接入与日常维护简化2026-10-31)，新增 [AC63–74 实施矩阵](MODEL_ONBOARDING_ACCEPTANCE.md#v11-目录外接入与维护简化验收ac6374)。此前原 A／B／C 数量和截图保留为历史，不能替代本轮回归。

### 基线与数据保护

- 本轮基线提交 `0f45c82`；回退标签 `rollback/model-onboarding-before-maintenance-20261031` 指向该提交。本轮收口提交以本地标签 `milestone/onboarding-maintenance-mock-20261031` 定位。
- 修改限定独立 `versions/moma_5.12.0_estack/`，保留三个添加入口、双视图、稳定资料引用及供给／销售边界。
- 已有浏览器数据、渠道绑定、历史凭证和价格记录保留，不自动重置、不按名称合并、不为本轮走查清除业务状态。
- 本轮继续仅做 mock；无真实上游、真实 Key、实际扣费、推送或部署。

### 本轮实现

| 范围 | 已落盘行为与实施边界 |
| --- | --- |
| 目录外主体与模型 | 同页输入供应商名称、模型 ID 和类型，内部主体编码保存时生成并固定；最低身份资料保留空任务、空模态、未知能力及待完善状态。 |
| 原子保存与追加 | `channelQuickCreate` 同事务登记必要主体、主档、脱敏 Key、渠道与映射；已有渠道追加使用明确 `endpointId`，不夹带连接或密钥覆盖。 |
| 草稿与引用 | 新主体／新模型的未完成安全文本可保存和恢复，不存明文 Key；重名、重复编码、非法类型和外供应商引用仍阻断；新旧记录按稳定 ID 处理。 |
| 地址候选 | 明确产生用量的测试动作合并候选准备和测试；通过后仍需单次明确应用，失败保留当前配置。 |
| Key 范围 | 专属绑定、组主要 Key 和混合引用使用明确实际目标；正常轮换不自动撤销旧 Key，不误改其他组或供应商。 |
| 完整测试与应用 | 共享引用完整集合依次测试；派发及应用前检查冻结候选、当前配置、映射、服务影响和最新凭证状态，拒绝范围扩张和部分隐式切换。 |
| 新增与恢复 | 本次新追加、从未启停且无服务影响的单映射可明确启用；历史恢复入口统一固定范围和有效性检查，去除旧结果直达旁路。 |
| 文档和研发说明 | canonical spec v1.1、增量说明、研发须知与运营入门同步；最低身份不代表完整能力、采购价或正式服务资格。 |

### 本轮实际浏览器路径与动作数

以下由根任务实际操作；每项独立选择、字段填写和明确提交分别计数，选择器展开不另计。起点为已打开表单或目标可见的管理列表；正式服务上架另计。不是物理鼠标点击数，也不是新手耗时实验。

1. **目录外接入9项**：新供应商、目录外 `Nebula/Chat-V1`、新 Key，在同页原子保存，完成 mock 测试和单模型明确启用。上游大写和斜杠保留，平台资料编码与上游 ID 分开保存。
2. **追加模型6项**：已有运行渠道新增 `Qwen3.8 Flash`，保存后测试，再明确启用本次新增映射；其他映射和当前连接保留。
3. **地址维护5项**：填写新地址、明确测试候选、通过后明确应用；另走失败场景，当前地址继续保留。
4. **专属 Key 轮换5项**：当前渠道明确使用新 Key，另外两条共享组引用保持不变，旧 Key 未自动撤销。
5. **两条组引用轮换5项**：详情转 API 密钥页、替换主要 Key、填新 Key、测试、应用。一次按钮顺序检查完整集合，单次明确应用后保留成功信息与生效版本 2；独立专属绑定保持。另从 Key 页对专属渠道的两个模型复验通过并应用，保留配置版本 3 成功视图，没有跳转到旧 Key 编辑器。

另实际保存、关闭和恢复未填模型 ID 的目录外草稿，名称、地址、向量类型保留、Key 为空；未完成输入不提前报错。1280×800／1440×900／1920×1080 的页面 scrollWidth 分别等于视口宽，弹窗宽1000；1280 top20／bottom780，正文滚动、页脚可达，修复表格 flex 压缩。长 URL 预览省略，模型 ID Tab 到采购价、关闭回添加渠道；最终重载数据保留且无新增 warn／error。以上路径不覆盖所有任务类型、Key 混合引用、失败／并发、权限、缩放或浏览器组合。

### 新增直接合同与验收映射

| 测试文件 | 主要边界 | 对应 AC |
| --- | --- | --- |
| [custom-channel-onboarding.test.mjs](tests/custom-channel-onboarding.test.mjs) | 最低身份、未知能力、正式服务门槛、新增／追加原子性、安全草稿、冲突、权限、存储失败 | AC63–66、AC71、AC74 |
| [candidate-probe-start.test.mjs](tests/candidate-probe-start.test.mjs) | 明确用量点击准备候选并测试，当前配置保持、任务不重复派发 | AC67、AC74 |
| [credential-rotation-prepare.test.mjs](tests/credential-rotation-prepare.test.mjs) | 新 Key 候选准备、凭证边界、原子性与旧 Key 保留 | AC69、AC70 |
| [credential-rotation-scope.test.mjs](tests/credential-rotation-scope.test.mjs) | 专属、组及混合引用的准确目标集合 | AC69、AC70 |
| [candidate-frozen-scope.test.mjs](tests/candidate-frozen-scope.test.mjs) | 候选测试派发与应用的配置、映射、渠道及服务引用快照 | AC68、AC70 |
| [unused-credential-replacement.test.mjs](tests/unused-credential-replacement.test.mjs) | 无引用 Key 的直接替换边界，不误用组／渠道候选路径 | AC69、AC70 |
| [channel-enable-confirmation.test.mjs](tests/channel-enable-confirmation.test.mjs) | 新追加单映射启用、历史恢复和固定范围复核 | AC71、AC72 |

上述文件均包含在下表最终全量运行中，不把测试名称直接当作全部手工路径通过。

### 本轮最终集成记录

| 检查 | 最终数量／结果 | 日志或证据 |
| --- | --- | --- |
| 独立版本全量测试 | **625/625**，0 失败 | [日志](../../outputs/onboarding-maintenance-20261031/final-tests.log) |
| 新增及现有相关合同 | 目录外、候选启动、轮换准备／范围、派发冻结、备用 Key、启用合同全部包含于625项 | 同上；AC63–74矩阵注明证据类型 |
| 完整构建 | 5.12.0、根构建及 Sites 包装完成；既有大 chunk 提示保留 | [构建](../../outputs/onboarding-maintenance-20261031/final-build.log) |
| Sites／版本隔离／退役 | **10/10** | [隔离](../../outputs/onboarding-maintenance-20261031/final-isolation.log) |
| 定向 lint、diff、界面检测 | 27个变更源／测试文件 oxlint无输出；diff --check通过；Impeccable detector无发现，人工界面检查完成 | [lint](../../outputs/onboarding-maintenance-20261031/final-lint.log)、[检测](../../outputs/onboarding-maintenance-20261031/final-detector.log) |
| 响应式、草稿、焦点和截图 | 上述实际路径与三桌面尺寸，保留未测组合 | [浏览器记录](../../outputs/onboarding-maintenance-20261031/browser-verification.json)、[截图目录](../../outputs/onboarding-maintenance-20261031/) |

本轮不宣称真实协议、生产密钥存储、完整跨浏览器或真实费用验证；没有推送或部署。
