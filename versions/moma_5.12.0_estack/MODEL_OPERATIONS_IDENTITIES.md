# 模型运营字段、永久 ID 与批量维护规范

适用于模型接入、模型服务、模型广场、模型售价、模型资料及其共用表单、预览和导入导出。本文件是字段命名、身份引用和编号规则的约束；[字段字典](MODEL_OPERATIONS_FIELD_DICTIONARY.md)补充旧键映射，[术语表](GLOSSARY.md)解释业务概念。

## 必须遵守

- 永久 ID 由保存事务生成并持久化；名称、调用标识、价格、路由和显示文案变化不改写 ID。读取、渲染和导出不生成 ID。
- 新建和存量对象均按下表前缀加 UUID v4 编号。模型服务统一使用 `model_service-<UUID v4>`，不允许保留 `offer-…` 或历史组合键作为公开永久 ID。存量整改必须备份、原子迁移主键及全库引用，并验证外键、记录数量和业务内容一致；日常操作不重编号。
- 列表、详情、复制内容、维护文件、关联和计量引用使用同一个完整 ID。省略显示必须能查看和复制完整值；禁止只在界面替换前缀。
- 导入按已存在的完整 ID 及归属定位，不得接受旧前缀、截取 UUID、用调用值匹配，或把未知 ID 当作新增。首次接入与已有对象维护分开。
- 新增管理字段使用下表中的名称和 `snake_case` 引用键。现有物理表、内部 `camelCase` 键、历史数据及审计原文保留，用明确映射衔接；不得再新增含义不明的通用 `modelId` 字段。
- 模型展示名可重复。模型编码跨服务商统一；平台调用标识、上游调用标识分别维护，均不承担永久外键职责。
- 共享身份和参考资料不授予资料库最终展示内容的维护权；运营展示内容由模型广场维护。

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

## 中英文字段与取值

| 统一中文名 | 管理字段／引用键 | 归属和规则 | 命名来源 |
| --- | --- | --- | --- |
| 模型展示名 | name | 广场维护，其他运营模块读取；未维护时沿用现有内容。资料库的 name 是参考内容，更新不覆盖广场 | OpenRouter Model.name 同名字段 |
| 模型类型 | type | 按现有类型字典维护，不按名称或是否支持图片推断；服务从所选模型继承 | MoMA 分类字段 |
| 模型简介／模型作者 | description／profile.author | 广场维护最终展示内容，资料库维护参考内容；作者与接入服务商分别表达 | description 沿用 OpenRouter 同名字段，profile.author 为 MoMA 资料字段 |
| 模型编码 | canonical_slug | 如 glm-5.3，同一型号与版本跨服务商一致。新录入去除首尾空白，1–80 字符，小写字母或数字开头，允许小写字母、数字及 . _ : / -；不随接入服务商添加命名空间 | 沿用 OpenRouter 字段名；跨服务商取值规则为 MoMA 约定 |
| 模型 ID | call_id | 平台对外调用值，可按生命周期规则修改，保留大小写；兼容目录的 id 和推理请求的 model 使用此值 | call_id 为 MoMA 管理字段；id／model 为协议字段 |
| 上游模型调用标识 | upstream_model_id | 连接维护的实际上游调用值，保留大小写及完整字符串，可因连接不同而不同 | MoMA 自有字段 |
| 模型服务配置 ID | model_service_config_id | 关联模型级技术配置；不替代具体入口的 model_service_id | MoMA 自有字段 |
| 服务商名称／服务商编码 | provider.name／slug | 名称可编辑，编码创建后固定；现有内部 code 保留 | MoMA 管理约定 |
| 连接名称／服务根地址 | connection.name／base_url | 属于一个 Provider，多个上游模型可复用；任务完整地址另按协议维护 | MoMA 管理约定 |
| 连接编码 | connection.code | 既有业务别名，物理字段为 channels.code，旧内部键为 channelCode／endpointId；独立显示，不替代连接 ID，不增加到现有维护文件 | MoMA 自有字段 |
| 上游模型名称 | channel.name | 识别实际供给来源；上游调用值、采购版本和容量按上游模型独立维护 | MoMA 管理约定 |
| API 密钥组 ID／密钥组名称 | key_group_id／key_group_name | 服务商密钥池维护，内部映射 apiKeyGroups[].id／name 与连接 keyGroupId | MoMA 自有字段 |
| 上架状态／广场展示 | listing_stage／market_visible | 广场服务维护字段，与技术启停、销售状态分别管理 | MoMA 自有字段 |
| 价格版本 ID／价格项 ID | price_version_id／price_item_id | 售价或采购的版本及计费项引用；价格变更创建新版本，历史不追改 | MoMA 自有字段 |
| 计费项 ID／计费单位 ID／币种 ID | billing_item_id／unit_id／currency_id | 引用计量字典；单位、数量、币种和金额分别表达 | MoMA 自有字段 |

OpenRouter 字段依据：[模型目录接口](https://openrouter.ai/docs/api/api-reference/models/list-all-models-and-their-properties)。同名字段不表示两端值域完全相同，也不把其调用 id 解释为 MoMA 永久主键。表中的管理字段按对象限定含义；维护文件的 provider 行用 name／slug，connection、channel 行用各自的 name。

既有模型编码、调用值和 ID 不做批量格式修复。旧内部键 `modelTemplates.modelId` 表示模型编码，历史 `models.modelId` 在存量服务中可表示调用值，关联记录的 `modelId` 可能表示内部引用；必须按对象解析，不能按同名键直接联表。

旧服务商目录接口中的 `catalogModels[].modelId`、`catalogModelIds` 是服务商范围内的目录标识，保留已有大小写及专用输入校验；它既不是模型永久 ID，也不能直接充当全局模型编码。当前接入通过 `libraryId`／明确模型档案 ID 建立身份引用，新流程不新增通用“Model ID”同义字段。

服务商目录首次导入按模型编码精确匹配参考资料：同编码复用原 model.id 并保留已有内容，不同编码独立登记。模型展示名允许重复，不作为冲突判断或合并依据；上游调用值也不用于推断模型身份。后续维护使用永久 ID。

## 各模块字段归属

| 模块 | 稳定关联 | 本模块维护 |
| --- | --- | --- |
| 模型接入 | provider.id、connection.id、channel.id、model_id | 来源、连接配置、上游调用值、实际能力、采购配置 |
| 模型服务 | 模型服务 ID、已登记上游模型的稳定关联 ID | 服务名称、模型 ID、类型、路由、故障转移配置及启停 |
| 模型广场 | 卡片 ID、模型服务 ID | 展示名、介绍、图标、作者等展示内容、可见性和展示服务 |
| 模型销售 | 模型服务 ID、价格版本、计费项／单位／货币 ID | 每个服务最多一条售卖，维护刊例价、状态和销售范围 |
| 模型资料 | 保留既有参考资料记录与模型身份引用 | 参考内容及来源，不覆盖已经维护的广场内容 |

新建模型卡片按独立卡片 ID 保存到工作区的 `marketCards`。运营人员从模型服务列表选取服务，确认同款后按模型服务 ID 保存关联。卡片保存独立展示内容、关联及展示服务 ID、展示状态和可见范围。指定范围分别保存 `organizationIds`、`projectIds` 和 `tenantIds`；组织和项目按同源记录校验，命中任一范围即可查看。已有卡片读出历史服务记录的 marketContent 和展示许可，首次通过卡片表单保存后读取卡片配置。模型资料、模型服务、价格、订购和调用保留原身份与数据。

模型服务、广场及售价展示并复制同一 model_service_id；连接展示 channel_id，连接和 Provider 的 ID 在相应配置或详情可查。模型编码及永久 ID 纳入搜索。历史审计原文和已有 ID 不因文案统一而改写。

## 来源接入与资料模板

日常新建及批量导入使用现行表单和表格模板。见[数据契约](MODEL_OPERATIONS_DATA_CONTRACT.md#来源接入与资料模板)。

## 计量和历史

请求及用量沿用原有 requestId、usage.id，D1 market_calls 保留其幂等键及价格／路由引用。用量附带 platform_request_id、model_id、model_service_id、route_version_id、sale_price_id；上游尝试记录 attempt_no、实际 channel_id、connection_id、provider_id。销售和采购快照携带可确认的价格版本、价格项、计费项、单位、币种 ID；历史缺项保持未知，不补造。

UUID 和主键约束之外，所有普通更新入口禁止改写永久 ID。价格、路由通过版本保留历史；新对象不复用旧对象身份。计量执行仍为模拟，不证明真实上游、生产扣费或上线有效性。

## 上游模型批量维护

批量选择以原连接关联 ID 定位，不按模型编码、调用值或名称合并。名称只维护所选 channel.name（内部 sourceName），不改 connection.name。上游 API 地址维护 connection.base_url，预览按 connection.id 去重并包含未勾选的全部共享连接；必须确认实际影响。候选验证前不改当前地址，准备及最终保存各自保持原子性。测试回执按连接关联保留，每款模型独立验证；不以一个连接通过代替全部模型通过，不更换数据或永久 ID。

批量启用、停用和移除均使用所选连接关联的原 ID；启停与地址共享修改分开，停用不改共享连接及未选关联。恢复连接时未选关联保持停用，须展示范围并确认。批量移除以全部所选关联的并集校验引用，沿用关联处理与风险确认，软归档保留原 ID；只有没有其他实际关联的连接才可归档。服务商、模型资料、价格和历史不随连接移除。

新增连接的模型展示名与模型编码联动引用同一已有模型档案 ID；目录外新模型显式填写类型并通过既有接入事务创建，不按同名合并、重写或重建存量 ID。上游地址选择项与服务商 Base URL 展示同源；新建取首项，已有配置保留原值。
