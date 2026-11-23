## 关键概念和字段

| 字段中文 | 字段英文 | 定义 | Definition |
| --- | --- | --- | --- |
| 服务商 | Provider | 向 MoMA 提供模型推理服务、与平台形成采购关系的主体。一个服务商可以提供多条渠道。 | An organization that supplies model inference to MoMA under a procurement relationship. One provider may offer multiple channels. |
| 渠道 | Channel | 平台访问上游服务的一条接入连接，包含服务地址、接口和认证配置，可供多款模型共用。 | A connection from MoMA to an upstream service. It specifies the service address, API and authentication settings, and can serve multiple models. |
| 模型 | Model | 由开发者发布的 AI 模型或具体版本，其档案记录能力、模态和技术规格。 | An AI model or model version published by its developer. Its record describes its capabilities, modalities and technical specifications. |
| 模型资料 | Model Record | 基础资料中的参考档案。创建模型服务、登记渠道模型或新建广场卡片时可复制所需字段。保存后，各模块分别维护自己的字段值。 | A reference record in Basic Data. When creating a model service, registering a channel model, or creating a marketplace card, you can copy the fields you need. Each module maintains its own saved values. |
| 渠道模型 | Channel Model | 某款模型在某条渠道上的供给记录，保存模型身份、上游模型调用标识和该来源的采购价。 | A model offering on a specific channel. The record stores the model identity, the upstream invocation ID and the purchase price from that source. |
| 模型服务 | Model Service | MoMA 提供给客户的调用入口，按模型 ID 接收请求，并关联可使用的渠道模型。 | An entry point MoMA exposes to customers. It accepts requests by the requested model ID and links to the channel models it can use. |
| 模型档案 ID | Model Record ID | 系统用于关联同一款模型档案的永久编号。 | A permanent identifier for linking records to the same model. |
| 模型编码 | Model Code | 在同一个 MoMA 实例的模型资料库中，唯一标识一个确定的模型型号和版本。多个服务商提供同一型号、同一版本时，共用同一个模型编码。不同型号或版本使用不同编码。用于模型资料登记、导入和匹配。 | A unique code for a specific model and version within the model library of a MoMA instance. Providers offering the same model and version share the code. Different models or versions have different codes. Used to register, import and match model records. |
| 模型资料名称 | Model Record Name | 在基础资料中维护的可读名称，供运营人员查找和选取模型。名称可以重复。 | A readable name maintained in Basic Data to help operators find and select models. Multiple records may share the same name. |
| 模型展示名 | Model Display Name | 在模型广场维护、面向用户展示的名称。名称可以重复。 | The name shown to users in the model marketplace and maintained there. Multiple models may share the same display name. |
| 模型中文简介 | Chinese Model Summary | 模型卡片对用户展示的中文简介。 | A Chinese summary shown on the marketplace card. |
| 模型英文简介 | English Model Summary | 模型卡片对用户展示的英文简介。 | An English summary available in the marketplace details. |
| 热度设置 | Popularity Score | 用于模型广场推荐排序的可选非负数值。 | An optional nonnegative score used to rank recommendations. |
| 模型精度 | Model Precision | 模型权重使用的数值精度，例如 BF16。 | The numeric precision of the model weights, such as BF16. |
| 模型标签 | Model Tags | 模型广场维护的展示关键词。 | Display keywords maintained in the marketplace. |
| 模型发布日期 | Model Release Date | 模型作者发布该模型版本的日期。 | The date the model author released this version. |
| 参数量（B） | Parameter Count (B) | 模型的总参数数量，以十亿为单位。1 B 表示 10 亿个参数。 | The total number of model parameters, in billions. 1 B means one billion parameters. |
| 模型作者 | Model Author | 研发或发布模型的组织或团队。 | The organization or team that develops or publishes the model. |
| 模型系列 | Model Family | 同一开发者具有共同技术演进关系的一组模型。 | A group of related models that share a line of technical development from the same author. |
| 模型版本 | Model Version | 区分同一模型系列具体迭代的版本号或发布标识。 | A version number or release identifier for a particular iteration in a model family. |
| 模型类型 | Model Type | 按主要用途划分的类别，例如对话、向量生成或图像生成。 | A category based on the model's primary purpose, such as chat, embedding or image generation. |
| 输入模态 | Input Modalities | 模型能够接收的内容形式，例如文本、图像或音频。 | The forms of content a model accepts, such as text, images or audio. |
| 输出模态 | Output Modalities | 模型能够生成的内容形式，例如文本、图像或视频。 | The forms of content a model can generate, such as text, images or video. |
| 结果类型 | Result Type | 模型返回的结构化结果形式，例如向量、相关性分数或排序结果。 | The structure the model returns, such as a vector, a relevance score or a ranked list. |
| 上下文长度 | Context Length | 单次推理可处理的上下文 Token 上限，具体计算范围以模型接口约定为准。 | The maximum number of context tokens for one inference request. The API defines which tokens count toward the limit. |
| 最大输出 Token 数 | Max Output Tokens | 单次推理允许生成的 Token 数量上限。 | The maximum number of tokens a model can generate for one inference request. |
| 支持的参数 | Supported Parameters | 模型接口接受的请求参数集合，例如 temperature 或 top_p。 | Request parameters accepted by the model API, such as temperature or top_p. |
| 模型描述 | Description | 对模型能力、适用场景及限制的说明。 | A description of the model's capabilities, intended uses and limitations. |
| 服务商 ID | Provider ID | 系统关联服务商档案的永久编号。 | A permanent identifier for the provider record. |
| 服务商名称 | Provider Name | 在基础资料和渠道列表中展示的服务商名称。 | The provider's display name in the provider directory and channel list. |
| 服务商编码 | Provider Code | 服务商创建时确定的业务编码，供运营识别和查询。 | A business code assigned when the provider is created. Operators use it to identify and find the provider. |
| 渠道 ID | Channel ID | 标识一条共享接入连接的编号，用于定位渠道列表中的具体连接。 | An identifier for a shared connection that locates the corresponding entry in the channel list. |
| 渠道名称 | Channel Name | 运营人员为连接设置的名称，用于区分同一服务商的不同接入配置。 | An operator-defined name that distinguishes connections for the same provider. |
| 渠道类型 | Channel Type | 按供给来源对渠道进行的业务分类。 | A business classification based on the source of inference capacity. |
| 服务地址 | Base URL | 按服务商文档填写的基础地址，保留路径和版本前缀。渠道管理中指上游服务的地址，模型服务中指 MoMA 网关的地址。 | The API base URL, including the provider’s path and version prefix. In Channel Management it refers to the upstream service. In Model Services it refers to the MoMA gateway. |
| 接口格式 | API Format | 上游接口采用的请求、响应和调用约定，例如 OpenAI Chat Completions。 | The upstream API's request, response and invocation conventions, such as OpenAI Chat Completions. |
| 接口端点 | API Endpoint | 追加在服务地址之后的路径，例如 /chat/completions。渠道管理中指上游接口，模型服务中指 MoMA 对外接口。 | The path appended to the base URL, such as /chat/completions. In Channel Management it refers to the upstream API. In Model Services it refers to the API MoMA exposes to clients. |
| 接口版本 | API Version | 上游 API 要求指定的接口规范版本。 | The API specification version required by the upstream provider. |
| 服务区域 | Region | 上游服务提供访问的地理区域。 | The geographic region where the upstream service is available. |
| 认证方式 | Authentication Method | 平台向上游证明调用身份的方式。 | The method MoMA uses to prove its identity to the upstream service. |
| 上游 API 密钥 | Provider API Key | 由服务商签发、供 MoMA 调用上游服务的密钥。 | A key issued by the provider for MoMA to call the upstream service. |
| API 密钥 | API Key | 由 MoMA 签发、供客户或应用调用平台模型服务的密钥。 | A key MoMA issues to a customer or application to call a model service on the platform. |
| 密钥组 | Key Group | 供接入配置引用的一组上游密钥。 | A collection of provider API keys that a connection configuration can reference. |
| 渠道模型 ID | Channel Model ID | 标识渠道内一条模型供给记录的编号，模型服务通过该记录选择具体上游来源。 | An identifier for one model offering on a channel. A model service uses it to select the upstream source. |
| 上游模型调用标识 | Upstream Model Invocation ID | MoMA 向服务商发起请求时使用的模型或部署标识，以该渠道实际接受的值为准。 | The model or deployment identifier MoMA sends to the provider. Use the value accepted by the channel. |
| 渠道状态 | Channel Status | 渠道的管理开关，表示运营人员已启用或已停用该连接。 | The administrative state of a connection, either enabled or disabled. |
| 已接入模型数 | Connected Model Count | 当前渠道中已完成接入的模型数量。 | The number of models connected through the channel. |
| 模型服务名称 | Model Service Name | 运营人员为具体模型服务设置的管理名称。 | An administrative name assigned to a specific model service. |
| 模型服务 ID | Model Service ID | 系统标识具体服务记录的永久编号，供广场、销售等模块关联。 | A permanent identifier for a model service record. The marketplace, sales and other modules use it to link to the service. |
| 模型 ID | Model ID | 客户调用 MoMA 时在请求参数 model 中填写的值，由模型服务维护。 | The value a customer puts in the model parameter when calling MoMA. The model service maintains it. |
| 模型映射 | Model Mapping | 模型服务与渠道模型之间的绑定关系，决定该服务可以使用哪些上游来源。 | The association between a model service and a channel model. It determines which upstream sources the service can use. |
| 渠道模型状态 | Channel Model Status | 一条已关联渠道在当前服务中的状态。已启用的渠道在来源配置可用时可参与路由。 | The state of a linked channel model in the current service. An enabled channel can participate when its upstream configuration is available. |
| 服务描述 | Service Description | 在模型服务中维护的该服务说明。 | A description maintained on the model service. |
| 路由策略 | Routing Strategy | 从符合条件的渠道模型中选择本次请求目标的规则。 | The rule that chooses a target for the current request from the eligible channel models. |
| 参与路由 | Routing Enabled | 控制某条渠道模型绑定是否参与该服务的路由选择。 | Whether a linked channel model can participate in routing for this service. |
| 优先级 | Priority | 渠道模型被选择的先后顺序，数值越小越优先。 | The order in which channel models are preferred. Lower numbers have higher priority. |
| 路由权重 | Weight | 加权分流时，同一优先级的可用渠道模型之间分配请求的相对权重。 | The relative share of requests assigned to an eligible channel model in the same priority group when weighted routing is used. |
| 故障转移 | Fallbacks | 当前目标调用失败且满足切换条件时，转向允许的备用目标。 | Alternative targets that can be used when the current target fails and switching conditions are met. |
| 重试次数 | Max Retries | 首次尝试失败后，策略允许额外尝试的最大次数。 | The maximum number of additional attempts allowed by the policy after the first attempt fails. |
| 超时时间 | Timeout | 调用策略允许等待的最长时间，具体值需同时标明单位和作用范围。 | The longest wait the call policy allows. The value has a unit and an applicable scope. |
| 服务状态 | Service Status | 模型服务的调用开关，表示服务已启动或已停止。 | Whether the model service is started or stopped for calls. |
| 可见范围 | Visibility Scope | 允许看到该模型卡片的客户、组织或项目范围。 | The customers, organizations or projects that can see the model card. |
| 可见性 | Visibility | 模型卡片在广场的展示范围，分为不可见、预告可见、灰度可见和全部可见。灰度可见面向指定租户。 | The visibility of a model card: hidden, preview without details, visible to selected tenants, or visible to all. |
| 计费项 | Billing Item | 独立计价的资源项目，例如输入 Token、输出 Token 或缓存读取。 | A resource billed separately, such as input tokens, output tokens or cache reads. |
| 计费单位 | Billing Unit | 单价对应的资源数量单位，例如百万 Token、次、张或秒。 | The quantity a unit price applies to, such as one million tokens, a request, an image or a second. |
| 币种 | Currency | 价格使用的货币代码，例如 CNY 或 USD。 | The currency code used for a price, such as CNY or USD. |
| 采购单价 | Purchase Unit Price | 平台从指定渠道采购一个计费单位资源的价格。 | The price MoMA pays to procure one billing unit from a specified channel. |
| 销售单价 | Sales Unit Price | 平台向客户收取的每个计费单位的价格，由模型销售维护。 | The price the platform charges customers per billing unit. It is maintained in model sales. |
| 价格版本 | Price Version | 一组采购价或销售价在某个生效期内的记录，供历史计价追溯。 | A set of purchase or sales prices valid for a specified period and retained for historical billing. |
| 请求 ID | Request ID | 标识一次客户请求的编号，用于关联该请求产生的各次上游尝试。 | An identifier for a customer request that links all upstream attempts made for that request. |
| 尝试序号 | Attempt Index | 一次客户请求中，每次调用上游的顺序编号。 | The order of an upstream attempt within a customer request. |
| 实际渠道 | Actual Channel | 某一次上游调用尝试实际使用的渠道。 | The channel used for a particular upstream attempt. |
| 上游尝试数 | Upstream Attempts | 所选时段内发起的上游调用尝试总数，同一客户请求可产生多次尝试。 | The number of upstream attempts in the selected period. One customer request can produce multiple attempts. |
| 失败次数 | Failed Attempts | 所选时段内失败的上游调用尝试数。 | The number of upstream attempts that failed in the selected period. |
| 失败率 | Failure Rate | 所选时段内失败次数占上游尝试数的比例。 | The percentage of upstream attempts that failed in the selected period. |
| 超时率 | Timeout Rate | 所选时段内超时次数占上游尝试数的比例。 | The percentage of upstream attempts that timed out in the selected period. |
| 上游 429 次数 | Upstream 429 Count | 上游返回 HTTP 429 的尝试次数。 | The number of upstream attempts that returned HTTP 429. |
| 回退次数 | Fallback Count | 所选时段内被记录为回退的上游尝试数。 | The number of attempts recorded as fallbacks in the selected period. |
| P95 上游耗时 | P95 Upstream Latency | 上游尝试耗时的第 95 百分位数，以毫秒表示。 | The 95th percentile of upstream attempt durations, measured in milliseconds. |
| 峰值 RPM | Peak RPM | 所选时段内观测到的最高每分钟请求数。 | The highest observed requests per minute in the selected period. |
| 峰值 TPM | Peak TPM | 所选时段内观测到的最高每分钟 Token 数。 | The highest observed tokens per minute in the selected period. |
