# 5.12.0 模型运营 D1 后端

管理端 `listing`（含接入向导）、`providers`、`model-templates`、`tariff-dictionary`、`package-production` 和 `traffic-limits` 使用同源 `/api/5120/`。模型资料、服务商、密钥元数据及组/池、渠道与映射、采购/销售、服务、路由、检测与平台试调用、发布、套餐管理、限流配置及审计均由 D1 保存；客户端没有本地业务写入回退。图表及未迁移模块保留原数据范围。

## 本地运行与验证

从 `prototype/` 运行 `npm run test:backend:5120`。测试使用 Miniflare/workerd 的真实 D1 binding；持久化测试使用独立临时库，不访问云端。

本地后端读取 `MODEL_OPS_LOGIN_HASHES`，键是登录编号（如 `admin-001`），值是 8–128 字符密码的 SHA-256 摘要。运行 `npm run dev:backend:5120` 启动后端，运行 `npm run dev:5120` 启动界面。`/api/5120` 由版本 Vite 配置代理到 `127.0.0.1:8787`。新库保存在 `.local/fresh-workspace/`，重启继续读取该库。

本地引擎 compatibility date 为 `2026-07-30`，云端沿用项目 `2026-09-15`。密码和会话令牌明文不进入数据库、日志或构建产物。会话为 HttpOnly、Secure、SameSite Cookie；写入检查同源 Origin、JSON 和 `X-MoMA-Request: 1`。仅预置测试账号，不是生产 IAM。

## 数据与事务

渠道管理的公开管理工作区返回 `supplyRelations`，供应登记从 `supplier_models` 关联 `materials`、`suppliers` 读取，模型渠道从 `channel_models` 关联其供应登记及 `channels` 读取，排除已移除或已删除的关系。两个 tab 只改变分组方式，成员及计数共用这一集合。`suppliers.record_json` 内的配置只用于补充已保存的渠道成本、容量、检测及来源信息，不决定列表成员。模型命令的回执使用同一关系投影，字段及 ID 与刷新读取一致。登记移除和恢复同步 `supplier_models.removed_at`，多个别名仍合并为同一服务商／主档关系，不删除历史 JSON 或其他服务商记录。

空 D1 通过 `0001`—`0012` 建表，初始化后台账号、135 条计费字典、17 份参考模型主档，以及移动云 MoMA（`moma`）、DeepSeek（`deepseek-official`）和各自默认密钥组。初始化业务主键使用完整英文前缀和 UUID v4，后台登录编号单独保存在 `admin_accounts.login_code`。旧业务数据不迁入。

在「渠道管理 → 服务商详情 → 批量接入 → JSON → 载入内置目录」预览并导入。两份目录分别提供 26 和 2 款模型，使用当前服务商 ID，保留规范模型标识、文件内连接引用和上游调用标识。确认后生成供应关系和待验证渠道。售价、路由、上架记录、客户与订单从空白开始。浏览器使用 `moma-5120-workspace-v2:` 命名空间。

`0004` 将模型文档转换为目录字段：模型展示名 `name`、规范模型标识 `canonical_slug`、上下文 `context_length`、模态 `architecture.input_modalities/output_modalities`、支持参数 `supported_parameters`、默认参数 `default_parameters`。资料表使用 `canonical_slug` 和 `metadata_json`；服务供给表以 `record_id` 保存原内部主键，以 `id` 保存对外调用标识。历史调用、价格、审计和幂等回执不重写。`created` 在资料查询接口中为平台收录时间的 Unix 秒，`release_date` 单独保存原厂发布日期。应用领域对象仅在存储边界转换，业务关联不改号。

`0005` 解除计费项必须绑定单位的旧约束，保留已有单位关联在 `record_json.unitId`，不改写价格条目的单位或历史。新计费项只要求名称，单位仍由每条价格独立引用。发布这批代码前须同步应用该结构变更；本地迁移验收覆盖旧数据与外键保留。

`0006` 新增套餐和自定义套餐类型存储。套餐工作区独立读取，复用会话、幂等回执和原子审计；本地浏览器旧存档保留。

`0007` 新增按模型资料主档保存的平台抵扣配置。 `0008` 将原模型级系数保留为历史值，启用按计费项 ID 和输入 Token 区间维护的规则。已有套餐的模型引用原样保留，历史值不自动分配给计费项。

`0009` 新增用户全局默认限流记录，初始值为 60 RPM 和 3,000,000 TPM。`0010` 保留已保存的用户全局默认和审计，初始化模型默认 600 RPM 和 30,000,000 TPM，并增加账号额度、一客一策与模型覆盖记录。发布限流页面与接口前先应用 `0010`。

`0011` 允许同一连接下保存同款模型的不同上游标识，并把上架阶段与灰度客户保存到具体渠道服务。客户使用 D1 工作区中有效且在 `MODEL_OPS_LOGIN_HASHES` 中配置了凭据的客户编号登录。客户会话、订单及模拟调用分别写入 `market_sessions`、`market_orders`、`market_calls`；每次调用同时保存使用量、售价和路由引用。

`record_json` 按资源保存标准属性，所有者、稳定身份、有效价格/路由/发布引用仍由关系列和外键检查。模拟资源按 kind/id 保存；幂等回执统一在 operations，模拟器不再重复保存整份回执。源码 JSON 不在刷新时重放，用户浏览器旧存档不隐式导入、合并或删除。

初始化和新建业务资源使用 `<完整英文前缀>-<UUID v4>`。页面手动创建、批量导入和 API 共用这套规则。D1 的 `channels.id` 是连接 ID，`channel_models.id` 是渠道 ID，`offers.record_id` 是对外服务条目 ID。派生记录的 ID 随工作区数据在同一事务中保存，后续变更沿用已保存的 ID。服务商编码、规范模型标识和调用标识沿用各自规则。

业务命令由现有领域规则在服务端执行，带 expectedRevision 和 operationId；业务修改、模拟状态、回执、审计在单个 D1 batch 中提交。失败保留输入；未知结果查询 `/operations/:id`。后台测试的未知提交通过原 operationId 找回任务，不能重复创建。供应密钥只保存掩码、版本、指纹及状态，不访问真实上游。

## 接口

- `POST /auth/sign-in` 接收账号编号和密码（`identifier`、`accessCode`），按启用的后台账号或模型广场客户记录签发对应会话。后台专用会话接口为 `POST /auth/login`、`POST /auth/logout`、`GET /auth/me`。健康检查为 `GET /health`。
- `GET /traffic-limits` 读取两类默认、账号额度、一客一策、单模型覆盖和可配置的模型资料主档。`POST /traffic-limits` 按操作更新限流配置，并原子提交审计和回执。两者要求平台管理员或运营人员会话，写入还校验当前账号、修订号和幂等标识。每分钟请求数和 Token 数均存整数。
- `GET /traffic-limits/history` 使用同一后台会话按时间倒序查询已提交的配置变更。`limit` 控制每次读取的操作数，批量操作展开实际改动的对象，`after` 续查更早的操作。
- `GET /model-operations`：当前原型资源视图；由 SQLite 组合 JSON，Worker 直接返回，避免整库解析再序列化。
- `POST /model-operations/commands`：模型运营、模型服务和供应维护命令；不接受客户端身份或任意集合替换。
- `GET /package-management`、`POST /package-management/commands` 处理套餐读写和生命周期命令。模型选项来自未归档的模型服务，规则和套餐关联使用模型主档 ID。平台管理员可管理共享套餐类型。「套餐数据」通过此读取接口展示套餐列表。订购、使用、成本和利润使用单独的前端演示记录，正式数据源待接入。
- `saveFactorDraft` 保存「允许加入套餐」状态和抵扣规则草稿。 `publishFactorRules` 校验草稿后原子切换生效版本并写入审计。计费项来自模型当前服务模式下的生效售价，保存和发布均校验归属。允许加入套餐至少需要一条规则，且不能关闭被套餐引用的模型。已有规则且被套餐引用的旧配置保留可选状态。 `GET /package-management/factor-history?model=<模型主档ID>` 读取该模型的发布记录。
- `GET /market/catalogue` 读取 D1 对客目录及当前客户订单。 `POST /market/login`、`/market/logout` 维护独立客户会话；`POST /market/orders` 与 `/market/completions` 校验当前渠道、客户范围及订单归属后写入 D1。后者仅运行原型模拟器。
- `/simulation/*`：管理端模拟接入、任务、候选、试调用及发布；轮询读取精简资源，不加载整份编辑工作区。
- 资料、服务、服务商、渠道及字典的分页查询，服务 workspace/history，可见性命令，账号自己的操作回执查询。

路径均以 `/api/5120` 开头；角色复用版本内导航规则。网络失败不回退为本地成功。

## 发布与恢复

1. `npm run build` 生成 Sites Worker 和 Pages advanced mode `_worker.js`；`_routes.json` 仅将 `/api/5120` 交给函数，静态页面和图表不消耗 Functions 请求。
2. `export-initial.js` 只对独立空库生成初始化 SQL，不读取 QA 库/浏览器。大字段按 D1 单条 SQL 长度预算分段，循环价格/路由指针在资源插入后设置。只对首次创建的空远程库导入，不对已有库重放初始化包。
3. 生产绑定 `moma-prototype-5120-model-ops`，预览绑定独立 `moma-prototype-5120-model-ops-preview`，绑定名均为 `MODEL_OPS_DB`。密码摘要放 Pages secret `MODEL_OPS_LOGIN_HASHES`。
4. 本地密码交付文件为 `.local/cloud-access.json`，权限 0600，不提交、不公开上传；账号 `admin-001` 为平台管理员，`admin-002` 为运维观察边界账号。
5. `verify-preview.js` 固定指向预览库，执行模拟检测/试调用/发布/下架和资源维护。禁止改为生产地址运行完整案例上架验收。
6. 正式发布使用现有 `moma-prototype`、production 分支。此字段升级须与新代码配套；旧代码不能直接连接升级后的字段结构。数据库不随代码回退而删除。数据库恢复前先导出备份并核对 D1 Time Travel 恢复点，不能以删除 `.local` 或重建生产库替代恢复。

当前证据及运行限制见 [PROGRESS](../docs/model-operations-d1/PROGRESS.md)。

## 永久编号整改

新建与存量对象均遵守 MODEL_OPERATIONS_IDENTITIES.md。模型服务只允许 model_service-UUID v4；不保留 offer- 编号或公开别名。日常命令发现旧服务身份映射时拒绝保存，须先完成专用整改。

先导出完整 D1 SQL 到权限受限目录，执行 `node versions/moma_5.12.0_estack/database/normalize-identities.mjs backup.sql normalize.sql`。脚本盘点五类公开身份，对存量 ID 生成一次性映射并扫描全部持久表及文本/JSON引用，在独立 SQLite 事务演练后逐字段比较全库业务内容。输出 SQL 含修订冲突检查、外键延迟验证、服务编号写入触发器；生产库使用 `wrangler d1 execute --remote --command` 在一次查询中执行演练通过的整份 SQL，不能拆分执行，也不使用文件导入（文件导入可能跨事务导致延迟外键校验失败）。历史内容只同步编号引用，不改费用、调用标识、状态或记录数量。备份文件不进入静态产物或版本控制。

整改后重新导出生产库，对同一映射逐字段比较；五类编号违规、旧 ID 残留与外键违规均须为零。维护 JSON 及 API 不接受旧编号定位。新增部署不应用备份或重放历史数据；新建服务继续由现有保存事务生成规范 ID。

### 部署 License 与模型广场范围

为本地后端或 Worker 绑定 `MOMA_LICENSE_EDITION=internal` 或 `commercial`。可选 `MOMA_LICENSE_EXPIRES_AT` 使用带时区的 ISO 时间。有效期由服务端核对。绑定后的规格不受浏览器站点配置影响。未绑定的原型默认保留原有站点体验。商业版到期后保留查询接口，拒绝新的商业写入。

`0013_market_member_session.sql` 给广场会话增加可空的成员引用。D1 仍支持原客户编号登录商业广场。需验收组织、项目可见范围时，为工作区中已有且有效的成员编号配置 `MODEL_OPS_LOGIN_HASHES`，使用现有登录页登录。服务端核对当前企业、成员及账号状态。成员会话使用 D1 工作区的组织和项目记录，项目访问沿用已登记角色。浏览器独立工作区仍从本地成员身份读取可见范围，两个工作区不自动合并。D1 成员会话用于广场浏览，项目调用仍走原有项目与 Key 权限流程。

这组绑定用于原型验证。实际签名 License 的签发、验签服务及部署配置由交付环境提供。
