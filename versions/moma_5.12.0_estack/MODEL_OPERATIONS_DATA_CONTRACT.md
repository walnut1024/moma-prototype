# 模型运营数据契约

适用于模型接入、模型服务、模型广场、模型售价和基础资料的永久 ID、对象引用、维护接口和批量导入导出。

## 必须遵守

- 永久 ID 由保存事务生成并持久化；名称、调用标识、价格、路由和显示文案变化不改写 ID。读取、渲染和导出不生成 ID。
- 新建和存量对象均按下表前缀加 UUID v4 编号。模型服务统一使用 `model_service-<UUID v4>`，不允许保留 `offer-…` 或历史组合键作为公开永久 ID。存量整改必须备份、原子迁移主键及全库引用，并验证外键、记录数量和业务内容一致；日常操作不重编号。
- 列表、详情、复制内容、维护文件、关联和计量引用使用同一个完整 ID。省略显示必须能查看和复制完整值；禁止只在界面替换前缀。
- 导入按已存在的完整 ID 及归属定位，不得接受旧前缀、截取 UUID、用调用值匹配，或把未知 ID 当作新增。首次接入与已有对象维护分开。
- 新增管理字段使用 `snake_case` 引用键，界面名称按[关键概念和字段](MODEL_OPERATIONS_GUIDE_FIELDS.md)。现有物理表、内部 `camelCase` 键、历史数据及审计原文保留，用明确映射衔接；不得再新增含义不明的通用 `modelId` 字段。
- 模型展示名可重复。模型编码跨服务商统一；平台调用标识、上游调用标识分别维护，均不承担永久外键职责。
- 稳定模型身份用于对象关联。业务模块从基础资料复制的字段随各自对象保存，读取时使用本对象的已保存值。字段归属遵守[版本约束](AGENTS.md#关键业务约束)。

## 对象和存储映射

下列永久身份均为 **MoMA 自有字段**，不是 OpenRouter 模型目录中的调用 `id`。

| 对象／界面名称 | 自身永久 ID | 关联字段 | 新编号前缀 | 现有存储主键 |
| --- | --- | --- | --- | --- |
| provider／Provider ID | provider.id | provider_id | provider- | suppliers.id |
| connection／连接 ID | connection.id | connection_id | connection- | channels.id |
| channel／上游模型 ID | channel.id | channel_id | channel- | channel_models.id |
| model／模型档案 ID | model.id | model_id | model- | materials.id |
| model_service／模型服务 ID | model_service.id | model_service_id | model_service- | offers.record_id |

保留物理表结构；存量主键按上述专用整改统一，资源映射从 modelData.resourceIds、mappingIds 读取，读取不生成新 ID。模型级服务配置仍保留 services.id；管理导出使用 model_service_config_id 区分这层内部配置。

连接属于 Provider，上游模型通过 provider_id、connection_id、model_id 明确归属。一个模型可有多个连接及具体对外模型服务；服务在已关联的可用连接内路由。关联不自动发布路由或上架。

管理侧 model.id 是模型内部永久编号。OpenRouter 兼容模型目录中的 Model.id 是调用值；管理维护文件使用 model_service.call_id，兼容目录及推理请求分别投影为 id 和 model。模型编码 canonical_slug 沿用 glm-5.3 等跨服务商形式。

`services.id` 是模型级技术配置的现有键，既有 `service-…` 编号保持原值；它与具体对外入口的 `model_service_id` 分层关联。`offers`、`offer_id` 等现有物理名称不因新增 ID 前缀而改表或改键。

## 字段引用规则

界面字段采用[关键概念和字段](MODEL_OPERATIONS_GUIDE_FIELDS.md)。管理接口中的模型编码使用 `canonical_slug`，模型 ID 使用 `call_id`，上游模型调用标识使用 `upstream_model_id`。模型编码新录入去除首尾空白，允许 1–80 个字符，以小写字母或数字开头，后续可用小写字母、数字及 . _ : / -。

OpenRouter 兼容接口使用调用标识作为 `id` 或请求体 `model`，MoMA 管理接口按 `model_id` 和 `model_service_id` 定位。接入管理使用 `base_url` 和 `key_group_id` 识别服务地址和密钥组，分别沿用现有物理字段。

既有模型编码、调用值和 ID 不做批量格式修复。旧内部键 `modelTemplates.modelId` 表示模型编码，历史 `models.modelId` 在存量服务中可表示调用值，关联记录的 `modelId` 可能表示内部引用；必须按对象解析，不能按同名键直接联表。

旧服务商目录接口中的 `catalogModels[].modelId`、`catalogModelIds` 是服务商范围内的目录标识，保留已有大小写及专用输入校验；它既不是模型永久 ID，也不能直接充当全局模型编码。当前接入通过 `libraryId`／明确模型档案 ID 建立身份引用，新流程不新增通用“Model ID”同义字段。

服务商目录首次导入按模型编码精确匹配参考资料：同编码复用原 model.id 并保留已有内容，不同编码独立登记。模型展示名允许重复，不作为冲突判断或合并依据；上游调用值也不用于推断模型身份。后续维护使用永久 ID。

## 各模块字段归属

| 模块 | 稳定关联 | 本模块维护 |
| --- | --- | --- |
| 模型接入 | provider.id、connection.id、channel.id、model_id | 来源、连接配置、上游调用值、实际能力、采购配置 |
| 模型服务 | 模型服务 ID、已登记上游模型的稳定关联 ID | 服务名称、模型 ID、类型、路由、故障转移配置及启停 |
| 模型广场 | 卡片 ID、模型服务 ID | 卡片展示名、介绍、图标、作者、可见范围及展示服务 |
| 模型销售 | 模型服务 ID、价格版本、计费项／单位／货币 ID | 按服务保存唯一售卖、刊例价版本、售卖状态和销售范围 |
| 基础资料 → 模型 | 保留既有档案记录与模型身份引用 | 参考名称、类型、规格、能力及来源 |

新建卡片使用 `model-card-` 加 UUID v4 的独立 ID，保存至工作区的 `marketCards`。卡片可独立创建，按模型服务 ID 保存运营确认的关联。已有卡片沿用原键和已保存的展示资料。卡片单独保存展示字段、关联及展示服务 ID、上架状态和可见范围。卡片命令的 `listing_stage` 使用 `withdrawn`、`preview`、`gray`、`formal`，分别对应不可见、预告可见、灰度可见和全部可见。新建存为 `draft`，对客不可见。持久化的 `listed` 通过指定租户和全部用户区分灰度可见与全部可见。新设置的灰度范围保存 `tenantIds`，按有效租户校验，已有组织和项目范围在重新设置前仍按存量规则读取。卡片阶段及展示范围独立写入。展示中的服务拦截停服。取消展示后停服时，生效售卖和服务状态原子提交，售卖变为 `paused`，并保存售卖审计及停服来源。模型服务重新启动后由运营人员重新开售。已有卡片读出历史服务记录的 marketContent 和展示许可，首次通过卡片表单保存后读取卡片配置。模型资料、模型服务、价格、订购和调用保留原身份与数据。

卡片维护请求的 `name` 对应模型展示名，`description` 和 `description_en` 分别对应中文和英文简介。表单用 K 或 M 表示上下文长度，提交前以 1,024 或 1,048,576 为系数换算。`context_length` 以整数 Token 提交，存入 `capabilities.context`；`family`、`precision`、`release_date` 和 `parameters` 分别保存至 `profile.family`、`profile.precision`、`profile.releaseDate` 和 `profile.parameters`。`input_modalities` 对应 `profile.inputModalities`，输出选项按模态和结果类型分别保存至 `profile.outputModalities` 和 `profile.resultTypes`。`heat` 为热度，`tags` 为标签列表。`features` 中保存 `online_experience`、`smart_routing`、`supports_agent`、`supports_mcp` 和 `file_upload` 的布尔值。新建及编辑均可复制基础资料中的模型字段，保存更新当前卡片，沿用原身份及关联。

卡片命令的可选字段 `logo` 保存到 `profile.logo`，可使用图片数据或资料导入的 HTTP(S) 图片地址。表单上传支持 1 MB 以内的 PNG、JPEG 和 WebP，保存等比缩小后的图标。编辑时省略该字段会保留原图标，提交空字符串会移除图标。

5.12.0 独立服务原型的永久 ID 使用 `model-service-` 加 UUID v4，主键为 `new_model_services.id`。模型销售通过 `/model-service-sales` 读写，`model_service_sales.service_id` 为主键。卡片在 `linked` 保存关联服务 ID，在 `shown` 保存展示服务 ID。新订购校验卡片详情权限、展示服务、服务状态与销售范围，`model_service_orders` 按租户和服务保证有效订单唯一，保存原刊例价版本和快照。体验及 API 密钥调用按同一服务 ID 记录请求、价格版本和用量。已生效订单可在停售后继续调用运行中的服务。存量数据按原 ID 和已保存的明确引用读取。

## 来源接入与资料模板

- 日常新建服务商通过「基础资料 → 服务商」的表单办理。批量导入服务商资料和供应关系使用各自表格模板，连接和上游模型在「模型接入」维护。模型资料 CSV／XLSX 继续使用“模型展示名”“模型编码”字段。

## 计量和历史

请求及用量沿用原有 requestId、usage.id，D1 market_calls 保留其幂等键及价格／路由引用。用量附带 platform_request_id、model_id、model_service_id、route_version_id、sale_price_id；上游尝试记录 attempt_no、实际 channel_id、connection_id、provider_id。销售和采购快照携带可确认的价格版本、价格项、计费项、单位、币种 ID；历史缺项保持未知，不补造。

UUID 和主键约束之外，所有普通更新入口禁止改写永久 ID。价格、路由通过版本保留历史；新对象不复用旧对象身份。计量执行仍为模拟，不证明真实上游、生产扣费或上线有效性。

## 上游模型批量维护

批量选择以原连接关联 ID 定位，不按模型编码、调用值或名称合并。名称只维护所选 channel.name（内部 sourceName），不改 connection.name。上游 API 地址维护 connection.base_url，预览按 connection.id 去重并包含未勾选的全部共享连接；必须确认实际影响。候选验证前不改当前地址，准备及最终保存各自保持原子性。测试回执按连接关联保留，每款模型独立验证；不以一个连接通过代替全部模型通过，不更换数据或永久 ID。

批量启用、停用和移除均使用所选连接关联的原 ID；启停与地址共享修改分开，停用不改共享连接及未选关联。恢复连接时未选关联保持停用，须展示范围并确认。批量移除以全部所选关联的并集校验引用，沿用关联处理与风险确认，软归档保留原 ID；只有没有其他实际关联的连接才可归档。服务商、模型资料、价格和历史不随连接移除。

新增连接的模型展示名与模型编码联动引用同一已有模型档案 ID；目录外新模型显式填写类型并通过既有接入事务创建，不按同名合并、重写或重建存量 ID。上游地址选择项与服务商 Base URL 展示同源；新建取首项，已有配置保留原值。
