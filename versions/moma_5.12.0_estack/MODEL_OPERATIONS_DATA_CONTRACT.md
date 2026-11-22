# 模型运营数据契约

适用于渠道管理、模型服务、模型广场、模型售价和基础资料的永久 ID、对象引用、维护接口和批量导入导出。

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
| channel／渠道 ID | channel.id | channel_id | channel- | channel_models.id |
| model／模型档案 ID | model.id | model_id | model- | materials.id |
| model_service／模型服务 ID | model_service.id | model_service_id | model_service- | offers.record_id |

保留物理表结构；存量主键按上述专用整改统一，资源映射从 modelData.resourceIds、mappingIds 读取，读取不生成新 ID。模型级服务配置仍保留 services.id；管理导出使用 model_service_config_id 区分这层内部配置。

连接属于 Provider，模型渠道通过 provider_id、connection_id、model_id 明确归属。一个模型可有多个渠道及具体对外模型服务；服务在已关联的可用渠道内路由。关联不自动发布路由或上架。

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
| 渠道管理 | provider.id、connection.id、channel.id、model_id | 来源、连接配置、上游调用值、实际能力、采购配置 |
| 模型服务 | model_service.id、model_id；映射和路由的渠道引用 | 服务名称、保存的模型字段、平台调用值、路由、故障转移配置及启停 |
| 模型广场 | model_id 管理公共内容，model_service_id 管理具体服务 | 展示名、介绍、图标、作者等展示内容及上架、展示设置 |
| 模型售价 | model_service_id、价格版本、计费项／单位／币种 ID | 销售价格、条件、价格版本和销售范围 |
| 基础资料 → 模型 | 保留既有档案记录与模型身份引用 | 参考名称、类型、规格、能力及来源 |

新建卡片使用 `model-card-` 加 UUID v4 的独立 ID，保存至工作区的 `marketCards`。卡片可独立存为草稿，首次关联服务后写入对应模型档案 ID（`model_id`）。已有卡片沿用原键。卡片单独保存展示字段、关联及展示服务 ID、上架状态和可见范围。卡片命令的 `listing_stage` 使用 `withdrawn`、`preview`、`gray`、`formal`，分别对应不可见、预告可见、灰度可见和全部可见。新建存为 `draft`，对客不可见。持久化的 `listed` 通过指定租户和全部用户区分灰度可见与全部可见。新设置的灰度范围保存 `tenantIds`，按有效租户校验，已有组织和项目范围在重新设置前仍按存量规则读取。设为不可见或预告可见时，关联在售服务原子设置 `salesPaused=true`，拦截新订购，保留调用状态和已有订单。恢复卡片可见后由运营人员重新开售。已有卡片读出历史服务记录的 marketContent 和展示许可，首次通过卡片表单保存后读取卡片配置。模型资料、模型服务、价格、订购和调用保留原身份与数据。批量维护 JSON 中的服务销售上架阶段和历史展示字段仍属于服务配置。

卡片维护请求的 `name` 对应模型展示名，`description` 和 `description_en` 分别对应中文和英文简介。表单用 K 或 M 表示上下文长度，提交前以 1,024 或 1,048,576 为系数换算。`context_length` 以整数 Token 提交，存入 `capabilities.context`；`family`、`precision`、`release_date` 和 `parameters` 分别保存至 `profile.family`、`profile.precision`、`profile.releaseDate` 和 `profile.parameters`。`input_modalities` 对应 `profile.inputModalities`，输出选项按模态和结果类型分别保存至 `profile.outputModalities` 和 `profile.resultTypes`。`heat` 为热度，`tags` 为标签列表。`features` 中保存 `online_experience`、`smart_routing`、`supports_agent`、`supports_mcp` 和 `file_upload` 的布尔值。新建及编辑均可复制基础资料中的模型字段，保存更新当前卡片，沿用原身份及关联。

模型服务、广场及售价展示并复制同一 model_service_id；渠道展示 channel_id，连接和 Provider 的 ID 在相应配置或详情可查。模型编码及永久 ID 纳入搜索。历史审计原文和已有 ID 不因文案统一而改写。

## 批量维护 JSON

提供“查看 JSON”的模块通过该入口进入独立下钻页，完整内容按页面自然高度展示，不截断、不使用固定高度文本框。对象和数组支持逐层展开／收起以及全部展开／收起，默认全部展开；收起后显示字段或项目数量，空对象、空数组及基本值完整保留。折叠仅影响浏览，完整复制与批量维护始终使用完整 JSON。总表入口位于模块页头；服务商、模型和服务详情入口位于当前对象信息区右侧。JSON 页标题显示当前对象，支持完整复制；渠道管理服务商详情及对应 JSON 页只提供查看和复制，不提供批量维护，渠道表的批量操作保持；渠道管理其他范围和模型售价保留批量维护，模型服务页面不提供批量维护入口，模型广场页面不提供查看及批量维护 JSON 的入口；返回及面包屑恢复来源筛选、页码、详情和滚动位置。

### 范围与结构

维护格式统一为 moma.model-operations/v2，顶层严格接受 schema、operation、scope、target、revision、rows、references。旧 v1 维护 JSON 需重新导出；业务数据、永久 ID 和来源接入格式不变。

| 字段 | 约束 |
| --- | --- |
| schema | moma.model-operations/v2；属于 MoMA 运营维护契约 |
| operation | update 更新现有配置；link 显式关联已有模型服务与渠道 |
| scope | channels、services、market、prices |
| target | level 为 module、provider、model、provider_model、model_service；仅携带该层需要的 provider_id、model_id 或 model_service_id |
| revision | 当前导出修订；提交时重新核对，过期拒绝 |
| rows | 当前范围的主体配置；按下表区分可维护字段及只读字段 |
| references | 必要的只读模型、服务商、连接、密钥组／密钥脱敏元数据、计费字典及价格历史；按对象类型、归属及已有 ID 去重 |

渠道管理总表包含全部当前可维护的服务商、模型登记、连接和渠道；服务商详情只包含该服务商；全局模型详情包含该模型的各服务商登记和渠道；从服务商下钻的模型只包含二者交集。登记与页面使用同一供应关系，内置参考目录不视为已登记；同一服务商与模型的目录别名合并在 catalogue_model_ids。模型级 JSON 将共享连接与服务商放在只读 references，不授予修改共享对象的权限。已登记但尚无渠道的模型仍必须包含，未解析的身份保留 null，不通过名称补猜。

模型服务与广场支持模块、模型及具体服务范围；售价详情按具体模型服务定位。层级范围不受搜索、分页、折叠或服务商详情页签影响。URL resourceTarget 只记录已验证的对象上下文，不能扩大真实详情来源范围；无效／不存在的对象显示错误，不回退全量。服务端重新解析 target、验证归属和每行 ID，客户端另检查文件范围与当前页面一致。

### 字段与维护权

所有主体和引用均保留已有完整 ID；读取和导出不生成 UUID。通用 type 区分配置对象，模型类型使用 model_type。配置行的 id 保持原定位规则：model_service／market_service／sale_price 行定位模型服务；market_model 行定位模型；provider_model 行使用供应关系中的登记 ID；本地域状态尚无持久化登记 ID 时沿用既有 supplier-model:服务商ID:模型ID 关联键，不将目录调用标识当作模型永久 ID。

| 对象 type | 主要字段 | JSON 可修改字段 |
| --- | --- | --- |
| provider | id、name、slug、source_type、website、documentation、logo、description、introduction、contact、contact_info、status | 名称、供给类型及上述资料字段；id、slug、status 只读 |
| provider_model | id、provider_id、catalogue_model_id、catalogue_model_ids、model_id、canonical_slug、name、model_type、capabilities、registered | 全部只读；新增登记走已有接入／登记流程 |
| connection | id、provider_id、name、base_url、protocol、interface_type、address_mode、task_urls、timeout_seconds、adapter_options、auth_mode、key_group_id、api_key_id、key_pool、configuration_revision | name、base_url、protocol、interface_type、task_urls；其余只读。协议和接口类型须一致；配置变更遵守原共享影响、候选、验证及依赖规则 |
| channel | id、provider_id、connection_id、model_id、canonical_slug、name、upstream_model_id、enabled、api_addresses、capacity_limits、capacity_revision、procurement、procurement_history；异常关联包含 association_issue | name、upstream_model_id、capacity_limits、procurement 中的计费项和生效／到期时间；身份、状态、修订及历史只读 |
| model_service | id、model_id、canonical_slug、model_service_config_id、call_id、provider_id、channel_id、calls_enabled、interface、mappings、routing | 仅 call_id；须满足原停用及下架等条件。状态、映射和路由只读，变更仍走验证和发布流程 |
| market_model | id、model_id、canonical_slug、name、description、profile | name、description、profile；不回写模型资料库 |
| market_service | id、model_id、model_service_id、model_service_config_id、canonical_slug、call_id、listing_stage、market_visible、gray_customer_ids | listing_stage、market_visible、gray_customer_ids；沿用上架／下架及灰度校验 |
| sale_price | id、model_id、model_service_id、model_service_config_id、canonical_slug、call_id、price_version_id、effective_at、expires_at、sales_scope、items | 仅 items；销售范围和时间等当前信息只读，仍在原销售设置流程维护 |

references 中模型的 name、canonical_slug、model_type 用于识别，不能在渠道、服务或售价模块修改广场内容。密钥组保留组名称和组内顺序；密钥仅含已有 ID、名称、脱敏值和状态，不含明文、credentialRef、输入值或令牌。认证、轮换及组排序仍在密钥池执行。路由和映射 configuration 是原业务配置结构的只读快照；永久身份引用以明确的外层字段为准。

采购 procurement 包含 price_version_id、revision、effective_at、expires_at、items；价格版本与修订只读，修改通过现有采购发布事务生成新版本。procurement_history、售价 price_version 引用不回写；历史保留原代际模型服务 ID，无法确认归属时为 null，不挂到当前新服务。

价格项包含 name、condition、amount、unit、currency、billing_item_id、unit_id、currency_id、price_item_id。amount 使用货币单位的十进制文本，0 是有效价格，空值表示未配置；字典 ID 必须与名称、单位、币种一致。price_item_id 是当前价格版本内的标识，不是跨版本永久 ID。新增计费项不伪造已有价格项 ID。容量采用现有指标和基础单位：rpm、tpm、concurrency、rpd、tpd、rps、inputTpm、outputTpm、ipm；Token 速率保存基础 Token 数，沿用正整数校验，未配置不补成 0 或无限。

### 校验与保存

- 未知字段、改写只读字段／references、重复对象、错误归属、过期修订及不存在的 ID 整批拒绝；未知 ID 不自动新增。省略行不代表删除。
- 查看和复制不受 500 行更新上限限制。提交最多 500 条主体行、10 MB，references 不计行数；超限提示缩小服务商或模型范围，不截断、不自动分批保存。空范围原样校验为无变更，不可保存。
- 原样回导不产生业务变更；编辑立即使旧预览失效，修订变化后重新校验。共享连接变更预览列出受影响渠道，生命周期、权限、冲突、原子保存及未保存保护与原页面一致。
- 新建、移除、启停、密钥操作、路由发布与历史回滚不由通用 JSON 更新隐式执行；价格变更只生成新版本，保留旧版本和请求快照。

### 批量关联

模型服务的“填入渠道关联模板”从当前范围导出最新 v2 元数据和只读 references，将 operation 设为 link，rows 使用 model_service_id、channel_id 两个已有稳定 ID。校验模型一致及目标服务归属，服务必须属于当前 target；按二者组合去重。已有映射保持原值，新映射为待验证、已停用，不自动发布路由或上架。

### 来源接入与资料模板

首次接入继续使用已有服务商／模型接入契约，不是 OpenRouter 响应或运营维护 JSON。models[].model_name／model_type 对应模型展示名／类型，models[].canonical_slug 为模型编码；connections[].connection_id 与 mappings[].connection_id 是来源文件内的连接别名，不能作为本地永久 ID；mappings[].upstream_model_id 原样保留大小写。CSV／XLSX 继续使用“模型展示名”“模型编码”。删除接入资料的重建 JSON 与保留 ID 的维护用途分开。

## 计量和历史

请求及用量沿用原有 requestId、usage.id，D1 market_calls 保留其幂等键及价格／路由引用。用量附带 platform_request_id、model_id、model_service_id、route_version_id、sale_price_id；上游尝试记录 attempt_no、实际 channel_id、connection_id、provider_id。销售和采购快照携带可确认的价格版本、价格项、计费项、单位、币种 ID；历史缺项保持未知，不补造。

UUID 和主键约束之外，所有普通更新入口禁止改写永久 ID。价格、路由通过版本保留历史；新对象不复用旧对象身份。计量执行仍为模拟，不证明真实上游、生产扣费或上线有效性。

## 模型渠道批量维护

批量选择以原渠道关联 ID 定位，不按模型编码、调用值或名称合并。名称只维护所选 channel.name（内部 sourceName），不改 connection.name。上游 API 地址维护 connection.base_url，预览按 connection.id 去重并包含未勾选的全部共享渠道；必须确认实际影响。候选验证前不改当前地址，准备及最终保存各自保持原子性。测试回执按渠道关联保留，每款模型独立验证；不以一个连接通过代替全部模型通过，不更换数据或永久 ID。

批量启用、停用和移除均使用所选渠道关联的原 ID；启停与地址共享修改分开，停用不改共享连接及未选关联。恢复连接时未选关联保持停用，须展示范围并确认。批量移除以全部所选关联的并集校验引用，沿用关联处理与风险确认，软归档保留原 ID；只有没有其他实际关联的连接才可归档。服务商、模型资料、价格和历史不随渠道移除。

新增渠道的模型展示名与模型编码联动引用同一已有模型档案 ID；目录外新模型显式填写类型并通过既有接入事务创建，不按同名合并、重写或重建存量 ID。上游地址选择项与服务商 Base URL 展示同源；新建取首项，已有配置保留原值。
