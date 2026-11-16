# Agent 日志 · `Z_Wen`

> 写入者：`Z_Wen` 本人的代理，只追加到文件末尾。格式见 [README.md](README.md#条目模板)。
> 负责模块：见 [README 团队分工](../../README.md#团队分工)。

<!-- 在此线以下按时间顺序追加条目 -->

### LOG-Z_Wen-20261116-01

- **时间**：2026-11-16 21:43（+08:00）
- **工具/模型**：DeepSeek Harness / deepseek-flash
- **模块 / 分支 / PR**：M2 / `docs/m2-remove-duplicate-docs` / 待建
- **任务**：删除模块 2 的两份重复/过时文档，只保留契约正本，避免多处维护产生分歧
- **关键提示词**：「删掉两份旧文档」；确认目标为 `docs/module2-interface-handover.md` 与 `docs/module2-4-overview.md`
- **代理做了什么**：
  - 删除 `docs/module2-interface-handover.md`（与 `docs/contracts/module2-interface-v1.md` 内容重复，两份 336 行文档会改一漏一）
  - 删除 `docs/module2-4-overview.md`（技术栈写着零依赖 / node:sqlite / 纯 HTML，已被 ADR-0001 取代）
- **决策**：契约以 `docs/contracts/` 为唯一来源；项目概览由 README 与 `docs/ARCHITECTURE.md` 承担，模块 2 不再单独维护概览文档
- **验证**：`git status` 显示两个 `D`；全仓库检索 `module2-interface-handover`、`module2-4-overview` 均 0 命中，无悬空引用；删除已在 `e22173b` 提交
- **人工审核**：采纳
- **遗留问题**：后端骨架尚未落盘；`better-sqlite3` 在 Node 26 上的安装问题待解决（pnpm 构建脚本拦截或缺少预编译二进制）

### LOG-Z_Wen-20261116-02

- **时间**：2026-11-16 23:40（+08:00）
- **工具/模型**：DeepSeek Harness / deepseek-flash
- **模块 / 分支 / PR**：M2 / `feat/m2-backend-skeleton` / 待建
- **任务**：按 ADR-0001 建立后端工程骨架：pnpm workspace、Fastify 工厂、SQLite 迁移与 11 个预设类别种子
- **关键提示词**：「按建议的执行顺序来」（先依赖冒烟，再补全骨架）；技术栈按 ADR-0001（Fastify + better-sqlite3 + Vitest）
- **代理做了什么**：
  - 新增根 `package.json`、`pnpm-workspace.yaml`（含 `onlyBuiltDependencies: esbuild`）、`pnpm-lock.yaml`
  - 新增 `backend/package.json`、`tsconfig.json`、`eslint.config.js`
  - 新增 `backend/src/config/index.ts`、`shared/{money,time,errors}.ts`、`db/client.ts`、`db/migrations/001_init.sql`、`db/seed/categories.ts`、`app.ts`、`server.ts`
  - 新增测试 `test/shared/{money,time}.test.ts`、`test/m2/db.test.ts`、`test/smoke.test.ts`
- **决策**：
  - workspace 同时包含 `backend` 与 `frontend`，`pnpm -r` 三条检查可统一执行
  - `esbuild` 加入 `onlyBuiltDependencies`，否则 pnpm 10+ 拦截安装脚本导致 Vite 无法启动
  - 骨架**不注册 HTTP 路由**：`/api/health` 不在契约 v1 内，留待契约变更后再加
  - `nowIsoShanghai` 固定输出不带毫秒的 `+08:00` 时间，避免统计字符串比较出错
- **验证**：`pnpm install` 成功（241 包）；`pnpm -r typecheck`、`pnpm -r lint`、`pnpm -r test` 全绿（backend 13 例、frontend 31 例）
- **人工审核**：采纳
- **遗留问题**：契约 v1 缺类别 CRUD、预算写入、账单作废与 `INTERNAL_ERROR`，需走 contract-change；导入链路与统计接口尚未实现

### LOG-Z_Wen-20261117-02

- **时间**：2026-11-17 00:25（+08:00）
- **工具/模型**：DeepSeek Harness / deepseek-flash
- **模块 / 分支 / PR**：M2 / `fix/m2-skeleton-p0p1` / 待建
- **任务**：按独立审议意见修正 PR #3 的 1 个 P0 + 2 个 P1，属定点修订
- **关键提示词**：只改 `pnpm-workspace.yaml`、`app.ts`、`errors.ts`（另加契约 §2.6），禁止重写或重构其它已核对的代码
- **代理做了什么**：
  - `pnpm-workspace.yaml`：删除未填写的 `allowBuilds` 占位符，改为 `allowBuilds: { esbuild: true }`，保留 `onlyBuiltDependencies` 兼容旧版 pnpm
  - `backend/src/app.ts`：错误处理器透传 `error.details`
  - `backend/src/shared/errors.ts`：从 `ErrorCode` 移除 `DUPLICATE_RECORD`（它是反馈码，不是 HTTP 错误码）
  - `docs/contracts/module2-interface-v1.md`：§2.6 登记 `INTERNAL_ERROR`（500），补充 `details` 字段说明，版本升 v1.1
  - 新增 `test/m2/error-handler.test.ts`：2 例，覆盖 counts 透传与 500 兜底
- **决策**：`INTERNAL_ERROR` 走契约变更（方案 a），不在代码里用契约外错误码；`details` 仅在存在时输出，避免响应体出现 `details: undefined`
- **排查记录**：只删占位符后全新目录安装仍报 `ERR_PNPM_IGNORED_BUILDS`，确认 pnpm 12 依据 `allowBuilds` 授权构建脚本，`onlyBuiltDependencies` 在 v12 已不生效
- **验证**：复制仓库到全新目录 `D:\m2-fix-verify`（排除 node_modules/.git），`pnpm install --frozen-lockfile` 首次 exit 0，esbuild 两个版本 postinstall 均执行；该目录内 `pnpm -r typecheck/lint/test` 全绿（backend 15 例、frontend 31 例）
- **人工审核**：采纳
- **遗留问题**：契约变更 issue 待开；CI workflow（用户提供 `ci.yml`）建议单独 PR 提交
