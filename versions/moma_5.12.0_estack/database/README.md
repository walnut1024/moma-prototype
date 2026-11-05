# 5.12.0 模型运营 D1 后端

管理端 `listing`（含接入向导）、`providers`、`model-templates`、`tariff-dictionary` 已切换同源 `/api/5120/`。模型资料、供应商、密钥元数据及组/池、渠道与映射、采购/销售、服务、路由、检测与平台试调用、发布及审计均由 D1 保存；客户端没有本地业务写入回退。图表及未迁移模块保留原数据范围。

## 本地运行与验证

从 `prototype/` 运行 `npm run test:backend:5120`。测试使用 Miniflare/workerd 的真实 D1 binding；持久化测试使用独立临时库，不访问云端。

本地后端：给 `MODEL_OPS_LOGIN_HASHES` 传账号 ID 到8–128 字符密码的 SHA-256 摘要的 JSON，再运行 `npm run dev:backend:5120`。本地 UI 运行 `npm run dev:5120`；版本 Vite 配置将 `/api/5120` 代理到 `127.0.0.1:8787`。不要用根 Vite 开发入口验收 5.12.0。数据库默认保存在忽略的 `.local/`，重启不覆盖修改，不要删除它来处理业务错误。

本地引擎 compatibility date 为 `2026-07-30`，云端沿用项目 `2026-09-15`。密码和会话令牌明文不进入数据库、日志或构建产物。会话为 HttpOnly、Secure、SameSite Cookie；写入检查同源 Origin、JSON 和 `X-MoMA-Request: 1`。仅预置测试账号，不是生产 IAM。

## 数据与事务

`0001`—`0004` migration 共 38 张业务及基础表。初始数据来自当前 5.12.0 静态配置的完整组合：46 份规范资料、29 条原资料别名记录、32 个模型服务、26 家供应商、76 条渠道、68 条服务供给和 103 条原销售/供给价格记录；默认仍显示两个运营案例。资料别名通过明确 material_id 关联单一主档，不重复创建第二份编辑身份。旧版缺少当前计费定义的价格保留原记录，不补造计量、报价或生效证明。

`0004` 将模型文档转换为目录字段：模型名称 `name`、规范模型标识 `canonical_slug`、上下文 `context_length`、模态 `architecture.input_modalities/output_modalities`、支持参数 `supported_parameters`、默认参数 `default_parameters`。资料表使用 `canonical_slug` 和 `metadata_json`；服务供给表以 `record_id` 保存原内部主键，以 `id` 保存对外调用标识。历史调用、价格、审计和幂等回执不重写。`created` 在资料查询接口中为平台收录时间的 Unix 秒，`release_date` 单独保存原厂发布日期。应用领域对象仅在存储边界转换，业务关联不改号。

`record_json` 按资源保存标准属性，所有者、稳定身份、有效价格/路由/发布引用仍由关系列和外键检查。模拟资源按 kind/id 保存；幂等回执统一在 operations，模拟器不再重复保存整份回执。源码 JSON 不在刷新时重放，用户浏览器旧存档不隐式导入、合并或删除。

业务命令由现有领域规则在服务端执行，带 expectedRevision 和 operationId；业务修改、模拟状态、回执、审计在单个 D1 batch 中提交。失败保留输入；未知结果查询 `/operations/:id`。后台测试的未知提交通过原 operationId 找回任务，不能重复创建。供应密钥只保存掩码、版本、指纹及状态，不访问真实上游。

## 接口

- `POST /auth/login`、`POST /auth/logout`、`GET /auth/me`、`GET /health`。
- `GET /model-operations`：当前原型资源视图；由 SQLite 组合 JSON，Worker 直接返回，避免整库解析再序列化。
- `POST /model-operations/commands`：模型运营、模型服务和供应维护命令；不接受客户端身份或任意集合替换。
- `/simulation/*`：管理端模拟接入、任务、候选、试调用及发布；轮询读取精简资源，不加载整份编辑工作区。
- 资料、服务、供应商、渠道及字典的分页查询，服务 workspace/history，可见性命令，账号自己的操作回执查询。

路径均以 `/api/5120` 开头；角色复用版本内导航规则。网络失败不回退为本地成功。

## 发布与恢复

1. `npm run build` 生成 Sites Worker 和 Pages advanced mode `_worker.js`；`_routes.json` 仅将 `/api/5120` 交给函数，静态页面和图表不消耗 Functions 请求。
2. `export-initial.js` 只对独立空库生成初始化 SQL，不读取 QA 库/浏览器。大字段按 D1 单条 SQL 长度预算分段，循环价格/路由指针在资源插入后设置。只对首次创建的空远程库导入，不对已有库重放初始化包。
3. 生产绑定 `moma-prototype-5120-model-ops`，预览绑定独立 `moma-prototype-5120-model-ops-preview`，绑定名均为 `MODEL_OPS_DB`。密码摘要放 Pages secret `MODEL_OPS_LOGIN_HASHES`。
4. 本地密码交付文件为 `.local/cloud-access.json`，权限 0600，不提交、不公开上传；账号 `admin-001` 为平台管理员，`admin-002` 为运维观察边界账号。
5. `verify-preview.js` 固定指向预览库，执行模拟检测/试调用/发布/下架和资源维护。禁止改为生产地址运行完整案例上架验收。
6. 正式发布使用现有 `moma-prototype`、production 分支。此字段升级须与新代码配套；旧代码不能直接连接升级后的字段结构。数据库不随代码回退而删除。数据库恢复前先导出备份并核对 D1 Time Travel 恢复点，不能以删除 `.local` 或重建生产库替代恢复。

当前证据及运行限制见 [PROGRESS](../docs/model-operations-d1/PROGRESS.md)。
