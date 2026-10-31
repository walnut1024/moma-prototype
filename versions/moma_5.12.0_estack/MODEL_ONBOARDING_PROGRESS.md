# 模型接入优化实施台账

日期：2026-10-31。依据：[完整规格快照](MODEL_ONBOARDING_SPEC.md)；逐项证据见 [62 条验收矩阵](MODEL_ONBOARDING_ACCEPTANCE.md)。

## 交付范围与回退

用户明确“不要真实验证，只做 mock”。本次实现独立 5.12.0 的 A、B、C 流程与业务规则；发现、测试、候选、平台试调用、费用及发布使用浏览器 mock API，不需要真实 Key、服务令牌或后端进程。记录保留 mock 来源，不宣称生产接入完成。定时发现、周期探测、多 Key 调度和额外厂商适配器仍为规格后续范围。

- 实施前提交：`0926269`；回退标签：`rollback/model-onboarding-before-20261031`，实际指向 `0926269ee5b619be295463f48a25b1de26448ad8`。
- 分支：`feat/model-onboarding-spec-20261031`；首段提交：`57eea35`。最终收口提交由根任务补录。
- 撤销实施提交使用 `git revert <提交>`；代码回退不恢复或清空浏览器业务数据，不覆盖无关修改。
- 未修改其他版本，未推送或部署；生产出站、鉴权、真实协议及实际扣费不在本次声明范围。

## 已实施功能

| 范围 | 最终行为 |
| --- | --- |
| 入口与三步接入 | 主体、供应模型、渠道三入口保留；一渠道多模型，接口、地址、凭证组、RPM、超时及请求选项按需配置。 |
| 草稿与身份 | 非敏感草稿刷新恢复；参考批选保留未匹配行和原始上游 ID；原地最小资料与销售服务通过明确身份引用，缺项整批阻断。 |
| 测试与启用 | 两并发、排队、取消、未知、同任务恢复及原操作查询；高成本和语音任务显式选择，不自动重试。确认冻结完整选择和指纹，变化不部分启用。 |
| 发现与诊断 | 403／空／部分／不支持发现分别表达；已有渠道差异只读；阶段、建议、用量／费用未知及追踪分层显示。 |
| 变更与密钥 | 候选测试不改生效配置；完整引用预检后组原子切换，未覆盖离线映射待复测；紧急撤销约束全部旧快照，回滚需复测。 |
| 价格与服务 | 未知不同免费；采购版本生效／到期与实际成本；请求冻结开始价格。服务内容和路由草稿可往返，明确客户、允许供给后试调用并独立发布。 |
| 上架门槛 | 新显式上架／再上架检查当前完整 C mock 发布；独立 mock 证据拒绝伪造 main receipt 与直接写入。旧 seed 在线状态不追溯下架。 |

## 最终集成检查

| 检查 | 最终结果 | 日志 |
| --- | --- | --- |
| 独立版本全部测试 | **581/581**，0 失败；此前 555 为阶段结果 | [测试日志](../../outputs/model-onboarding-interaction-review-20261031/moma-mock-final-tests-rerun.log) |
| 完整构建 | 5.12.0、根构建及 Sites 包装均完成，末尾 Prepared Sites build；保留大 chunk 提示 | [构建日志](../../outputs/model-onboarding-interaction-review-20261031/moma-mock-final-build-rerun.log) |
| Sites／版本隔离／退役 | **10/10**，0 失败 | [隔离日志](../../outputs/model-onboarding-interaction-review-20261031/moma-mock-final-isolation.log) |
| 源文件 lint | exit 0，日志为空 | [源文件 lint 日志](../../outputs/model-onboarding-interaction-review-20261031/moma-mock-final-source-lint.log) |

测试文件 lint 另为 exit 0，保留 4 处既有 unused 参数 warnings：`model-operations.test.mjs:169` 两处、`catalogue-purchase-price.test.mjs:21` 两处，不称全部 lint 零警告。原始最终日志同时保留在 `/tmp/moma-mock-final-tests-rerun.log`、`/tmp/moma-mock-final-build-rerun.log`、`/tmp/moma-mock-final-isolation.log` 及 `/tmp/moma-mock-final-source-lint.log`。

## 浏览器实际路径

以下为根任务实际操作记录；不以单条路径覆盖全部边界组合。

1. 只登记供应商主体，保存后为 0 模型、0 渠道。Anthropic 的未完成 URL 与 apiVersion=2026- 保存草稿，刷新恢复原输入。
2. 上游 `vendor/raw:model.v2` 人工匹配资料后保持原值。参考批选保留 `unmatched/item`，提交整批阻断；明确取消该行后，保存其余 2 项无价模型。
3. Key 子表单取消通过内联确认，最多 2 层且保留父草稿；最小资料“继续编辑”保值，焦点为“模型名称”，明确放弃回“选择模型”。重复渠道名下一步展示字段 alert、aria-invalid 并聚焦名称；参考选择器 1/3→2/3 仅翻页，不提交。
4. 2 项 mock passed 后仍未启用；确认区冻结两个复选框、禁用重测；明确确认后启用并携带 2 个 association 进入服务。前轮另直接走查过 20 个不同模型批选、分页和保存，以及候选 20 项失败保留旧地址、重开恢复、后续通过明确应用 v0→v1。
5. 403、empty、partial 发现分别显示错误、无模型和部分结果，未改写配置；测试详情展示分层诊断。
6. 路由草稿从 50 改为 47 未提交，进入供给维护后返回仍为 47，生效版本保持 v1；明确放弃后恢复 50。
7. 平台试调用明确选择江苏租户、仅硅基流动供给，返回采购成本 CNY 0.000024、销售试算 CNY 0.000038，未扣客户额度；明确确认发布 v2。关闭重开后显示候选 v2、修订 4、已发布 v2；当前服务仍已下架，发布配置不会自动上架。金额均为 mock 试算。
8. 另新建独立最小资料→新渠道 B passed→明确启用→handoff 显示无既有服务 CTA→新增服务预填原资料→完善作者、日期、介绍并保存服务草稿，sourceLibrary URL 已清。此新资料的精确 templateId、完整 B→C→显式上架及防伪造／直接写入合同由 `service-material-publication.test.mjs` 覆盖，不虚报该路径已手工完成全部 C／上架。

## 尺寸、键盘与截图

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
