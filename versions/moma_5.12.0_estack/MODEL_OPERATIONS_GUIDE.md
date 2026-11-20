# 渠道管理

<a id="channels"></a>
## 渠道管理

你是 MoMA 管理员。租户想在平台上聊天、生成图片、制作短视频。你拿到了硅基流动、深度求索 DeepSeek 和火山引擎方舟的接入资料，现在要把这些模型登记到 MoMA。

先在这三家的控制台确认账号开通了哪些模型，再各准备一把 API Key。下表的 Key 都是占位值，实际配置时换成对应账号的密钥。

| 服务商 | 服务根地址 | 示例 Key |
| --- | --- | --- |
| 硅基流动 | `https://api.siliconflow.cn/v1` | `EXAMPLE_SILICONFLOW_KEY` |
| 深度求索 DeepSeek | 对话用 `https://api.deepseek.com`。Messages 用 `https://api.deepseek.com/anthropic/v1`。 | `EXAMPLE_DEEPSEEK_KEY` |
| 火山引擎方舟（北京） | `https://ark.cn-beijing.volces.com/api/v3` | `EXAMPLE_ARK_KEY` |

[录入服务商和密钥](#channel-connect) · [配置硅基流动](#siliconflow) · [配置 DeepSeek](#deepseek) · [配置火山方舟](#volcengine) · [两家的视频怎样接](#video) · [测试、成本和启用](#channel-maintenance)

<a id="channel-connect"></a>
### 先录入三家服务商和密钥

1. 打开[渠道管理](#/admin-2/providers)的「服务商视图」。已有的服务商直接打开。第一次接的点「录入服务商」，填服务商名称和编码。「供给类型」选「第三方推理服务」，再点「确认录入」。三家的示例编码是 `siliconflow`、`deepseek-official`、`volcengine-ark`。
2. 点服务商名称，打开「服务商 API 密钥池」。选「默认 API 密钥组」，点「添加 API 密钥」。例如在硅基流动下把密钥命名为「硅基流动采购」，粘贴这家控制台发给你的 Key。DeepSeek 和火山方舟各做一次。如果服务商已在用其他账号的密钥，可点「新建组」单独维护。
3. 回到「模型渠道」。先看同一家的模型能不能用同一套上游协议、根地址和密钥组。能共用就建 1 条连接。再看调用时 `model` 能填几个不同的值。每个要使用的值登记 1 条模型渠道。

服务根地址是各接口共用的那一段。比如硅基流动的对话完整地址以 `/chat/completions` 结尾，生图以 `/images/generations` 结尾。表单里的「上游 API 地址」填 `https://api.siliconflow.cn/v1`。系统会按模型类型加上后面的路径。

<a id="siliconflow"></a>
### 硅基流动先接对话和生图

这里假设同一把硅基流动 Key 已开通以下三款模型。三条都用 `https://api.siliconflow.cn/v1` 和硅基流动自己的默认密钥组。

| 在 MoMA 选择的模型 | 「上游模型调用标识」填什么 | 实际请求走哪条路径 |
| --- | --- | --- |
| DeepSeek V4.1 Flash 1017 · 视觉理解 | `deepseek-ai/DeepSeek-V4.1-Flash` | `/chat/completions`，可看图并回答文字。 |
| GLM-5.2 · 语言模型 | `zai-org/GLM-5.2` | `/chat/completions`，返回文字。 |
| MOSS-Image · 图像生成 | `OpenMOSS-Team/MOSS-Image` | `/images/generations`，返回图片。 |

三条可以共用 1 条连接。对话选择「OpenAI 兼容 API（Chat Completions）」，图像生成页面显示为「OpenAI 兼容 API」。两者在连接里都用 `openai`，系统根据模型类型选路径。

在硅基流动的「模型渠道 → 批量新增 → JSON」一起登记这三条。JSON 外层 `provider` 里的 `id` 和 `code` 填 MoMA 当前服务商的 Provider ID 和服务商编码。连接清单只写下面这条。把三款模型填在 `models`，每款模型的 `mappings` 都引用 `sf-main`。

| 写在哪 | 示例怎么填 |
| --- | --- |
| `provider.connections` 中的一条 | `connection_id` 填 `sf-main`，`base_url` 填 `https://api.siliconflow.cn/v1`，`interface_type` 填 `openai`，`protocol` 填 `OpenAI`，`key_group_id` 填 `default`。用自建组时填这个组的实际 ID。 |
| Flash 那条模型资料 | `canonical_slug` 填 MoMA 已有模型的编码，例如 `deepseek-v4.1-flash-1017`。`model_name` 填模型名，`model_type` 填 `multimodal`。 |
| Flash 的 `mappings` 中的一条 | `connection_id` 填 `sf-main`，`upstream_model_id` 填 `deepseek-ai/DeepSeek-V4.1-Flash`，`channel_name` 填 `硅基流动 · Flash`。 |
| GLM 和 MOSS 的模型资料及 `mappings` | 补上各自的模型名称和编码，GLM 的 `model_type` 填 `text`，MOSS 填 `image`。各写一条映射，`connection_id` 都是 `sf-main`，`upstream_model_id` 分别用上表的值。 |

点「校验并预览」，检查三条记录的地址和调用标识，再点「确认导入」。真实 Key 放在密钥池，JSON 里只引用密钥组 ID。

如果硅基流动为这款 Flash 提供了不同的推理来源，先看你的账号拿到了几个可以自己选的入口。这里用供给 A 和供给 B 举例。

| 硅基流动给你的资料 | 在 MoMA 怎么登记 |
| --- | --- |
| 能看到供给 A 和 B，但调用示例只有一个 `deepseek-ai/DeepSeek-V4.1-Flash`，由硅基流动决定用哪路。 | 用硅基流动这 1 条连接，登记 1 条 Flash 渠道。 |
| 同一个地址和 Key 下，采购单分别给了 A 和 B 的模型 ID。示例 `sf-demo-flash-a`、`sf-demo-flash-b`。 | 仍用 1 条硅基流动连接，登记 2 条 Flash 渠道。都选同一份 Flash 模型资料，分别填写实际 ID。两个示例 ID 仅用于说明。 |
| A 和 B 有独立的服务地址，或分别用两套独立账号和密钥组。 | 在硅基流动下建 2 条连接，每条登记 1 条 Flash 渠道。 |

实际可选的来源与 ID 以账号的调用资料为准。[硅基流动对话 API](https://docs.siliconflow.cn/docs/api/chat-completions-post) · [模型升级和 MOSS-Image 公告](https://docs.siliconflow.cn/docs/release-notes/overview) · [图片生成 API](https://docs.siliconflow.cn/docs/api/images-generations-post)

<a id="deepseek"></a>
### DeepSeek 官方接两款对话模型

现在你直接拿到了 DeepSeek 官方的 Key。进入 DeepSeek 的「模型渠道 → 新增」，按下表分别保存两条。两条的「API 密钥来源」都选「服务商 API 密钥池」，再选 DeepSeek 自己的默认密钥组。

| 字段 | Flash 用 Chat Completions | Pro 用 Messages |
| --- | --- | --- |
| 模型 | DeepSeek V4.1 Flash 1017 · 视觉理解 | DeepSeek V4 Pro · 语言模型 |
| 渠道名称 | `DeepSeek 官方 · Flash` | `DeepSeek 官方 · Pro Messages` |
| 上游模型调用标识 | `deepseek-flash` | `deepseek-v4-pro` |
| 上游协议 | OpenAI 兼容 API（Chat Completions） | Anthropic Messages API |
| 上游 API 地址 | `https://api.deepseek.com` | `https://api.deepseek.com/anthropic/v1` |
| 接口地址预览 | `https://api.deepseek.com/chat/completions` | `https://api.deepseek.com/anthropic/v1/messages` |

点「保存渠道」。这个例子用了两种请求格式，所以是 2 条连接、2 条模型渠道。若业务只用 Chat Completions，Flash 和 Pro 都可用 `https://api.deepseek.com`，批量登记到同一条连接。这两款是对话模型。Flash 能看图并用文字回答，生图和生视频用本指南里的专用模型。[DeepSeek 首次调用](https://api-docs.deepseek.com/zh-cn/) · [DeepSeek Messages API](https://api-docs.deepseek.com/zh-cn/api/create-message/)

<a id="volcengine"></a>
### 火山方舟先接对话和 Seedream 生图

假设方舟北京区域的一个 Key 已开通这三款。方舟控制台如果给了专用推理接入点，调用示例中的 `model` 可能是 `ep-…`。这种情况下，把实际接入点 ID 填到「上游模型调用标识」。下表以直接用模型 ID 调用为例。

| 在 MoMA 选择的模型 | 「上游模型调用标识」填什么 | 实际请求走哪条路径 |
| --- | --- | --- |
| Doubao Seed 2.1 Lite · 视觉理解 | `doubao-seed-2-1-lite-260915` | `/chat/completions` |
| DeepSeek V4.1 Flash 1017 · 视觉理解 | `deepseek-v4-1-flash-261017` | `/chat/completions` |
| Doubao Seedream 5.5 · 图像生成 | `doubao-seedream-5-5-261028` | `/images/generations` |

按硅基流动的批量步骤，在火山方舟下建立 1 条连接，例如 `ark-main`。`base_url` 换成 `https://ark.cn-beijing.volces.com/api/v3`，密钥组换成火山方舟自己的组，三条模型记录引用 `ark-main`。对话和生图各按实际结果测试。两家生图 API 都用 `/images/generations`，硅基流动的图片在 `images` 字段，方舟在 `data` 字段，验证时要确认 MoMA 能取到图片。

登记 Flash 时，确认三个来源都是 1017 版本，再选同一份模型资料。硅基流动、DeepSeek 官方和火山方舟各有自己的连接和调用标识，所以这款模型在 MoMA 有 3 条供给记录。[火山方舟模型列表](https://console.volcengine.com/ark/region:cn-beijing/docs/model-list) · [方舟地址与鉴权](https://console.volcengine.com/ark/region:cn-beijing/docs/base-url-and-authentication) · [方舟图片生成 API](https://console.volcengine.com/ark/region:cn-beijing/docs/image-generation-api)

<a id="video"></a>
### 两家的视频先准备接入资料

视频分两步。先提交生成任务，拿到任务号。再用任务号查询，等视频生成成功就能取到视频地址。硅基流动和方舟的查询方法不同。

| 视频模型及密钥 | 提交任务 | 查结果 |
| --- | --- | --- |
| 硅基流动 MiniMax H3。模型 ID `MiniMaxAI/MiniMax-H3`。用硅基流动的 Key。 | `POST https://api.siliconflow.cn/v1/video/submit`，记下返回的 `requestId`。 | `POST https://api.siliconflow.cn/v1/video/status`，在请求里带上 `requestId`。 |
| 方舟 Doubao Seedance 2.5。模型 ID `doubao-seedance-2-5-260628`，或实际开通的 `ep-…`。用方舟的 Key。 | `POST https://ark.cn-beijing.volces.com/api/v3/contents/generations/tasks`，记下返回的 `id`。 | `GET https://ark.cn-beijing.volces.com/api/v3/contents/generations/tasks/{id}`，把 `{id}` 换成任务号。 |

硅基流动返回 `Succeed` 后，从 `results.videos[0].url` 取视频地址。方舟返回 `succeeded` 后，从 `content.video_url` 取视频地址。

当前「新增渠道」里的协议预设无法配置这两套视频任务接口。先在模型资料里登记为「视频生成」，把上表的提交地址、查询地址和密钥组交给负责接口适配的人。每家视频计划单独用 1 条连接，等 MoMA 能完成提交、查询和取视频后再配置和启用。[硅基流动提交视频](https://docs.siliconflow.cn/docs/api/video-submit-post) · [硅基流动查询视频](https://docs.siliconflow.cn/docs/api/video-status-post) · [火山方舟视频流程](https://console.volcengine.com/ark/region:cn-beijing/docs/video-generation-tutorial)

<a id="channel-maintenance"></a>
### 接完后怎么测试、填成本和启用

1. 回到服务商的「模型渠道」，对要用的每一行点「编辑 → 测试连接」。共用连接也要逐条测。对话要收到文字，生图要能拿到图片，视频要等任务结束再拿到可用的文件。当前原型使用模拟结果。正式接入还要用对应账号真实验证。
2. 去[渠道管理（新）](#/admin-2/providers-new)找到连接，点模型数量展开。在目标模型行点「成本设置」，填这一路的实际采购价。对话按合同填输入、输出等计费项，生图按合同填每张或实际约定单位，视频按约定的计费口径填。缺报价先留待配置。点「下一步：预览发布」核对生效时间。
3. 在服务商的「模型渠道」点「批量操作」，勾选通过验证的行，点「启用」。如果服务商尚未启用，先在服务商详情点「启用服务商」。租户要使用模型，还需在「模型服务」配置可用渠道和路由，再按需上架。

按本例配置，当前表单覆盖 4 条连接、8 条模型渠道。硅基流动 1 条连接接 3 条，DeepSeek 官方 2 条连接各接 1 条，火山方舟 1 条连接接 3 条。两条视频方案待适配，硅基流动供给 A/B 是单独的判断示例。「渠道视图」一行显示一条连接。展开连接，就能看到共用这套设置的模型渠道。

后面若只调某一路 Flash 的采购价或容量，改该渠道这一行。若更换共用的地址或主密钥，先查哪些模型用了它，逐条通过测试后再应用新配置。
