# 编码规范

> 本文只记录工具配置表达不了的约定。格式化与 lint 规则以仓库中的 ESLint / Prettier 配置为准。

## 1. 通用

- 文件编码 UTF-8，换行 LF，结尾保留一个空行（由 `.editorconfig` 与 `.gitattributes` 保证）。
- 命名遵循 [GLOSSARY 第 1 节](GLOSSARY.md#1-命名约定)；业务名词必须使用 GLOSSARY 中的代码标识。
- 一个文件一个职责；单文件超过约 300 行时考虑拆分。
- 注释解释「为什么」，不复述代码在做什么。导出函数、路由处理器、跨模块类型写 TSDoc：

  ```ts
  /**
   * 按契约 1.6 处理同一幂等键的重发记录。
   * 第 2 轮起时间仍缺失则用 chatAt / sentAt 兜底，并返回 TIME_DEFAULTED_TO_CHAT_TIME。
   */
  export function resolveFollowup(record: ImportRecord, round: number): ImportResult { ... }
  ```

## 2. TypeScript（backend 与 frontend 共用）

- 开启 `strict`；使用 `unknown` 并在边界处收窄，类型系统表达不了的地方写注释说明理由。
- 外部输入（HTTP 请求体、LLM 输出、OCR 结果）在进入业务逻辑前必须做运行时校验（Fastify JSON Schema 或 zod，二选一，以首个骨架 PR 为准）。
- **LLM 输出一律视为不可信输入**：要求模型输出 JSON，解析后做 schema 校验，失败时重试或降级，结构不合法的数据不入库。
- 金额计算只用整数分；元 → 分的转换集中在 `backend/src/shared/money.ts`。
- 时间处理集中在 `backend/src/shared/time.ts`，统一按 `Asia/Shanghai` 计算日期边界。
- 错误：业务错误抛带 `code` 的自定义错误类，由全局错误处理器转成契约 2.6 的格式；错误码必须在契约中登记。
- 依赖方向：`routes → service → repository`；模块之间只引用对方 `index.ts` 导出的内容。

## 3. 后端（Fastify + better-sqlite3）

- SQL 写在 `repository.ts`，使用参数化查询，不拼接用户输入。
- 表结构变更只通过新增迁移文件（`backend/src/db/migrations/NNN_<描述>.sql`），已合并的迁移不修改。
- 配置从 `backend/src/config/` 统一读取并校验，业务代码不直接访问 `process.env`。
- 日志使用 Fastify 自带 logger（pino），日志中不输出密钥、完整图片内容或用户原始语音。

## 4. 前端（Vite + Vue 3 + TS）

- 使用 `<script setup lang="ts">` 与 Composition API。
- 接口调用集中在 `frontend/src/api/`，组件内不直接写 `fetch`。
- 金额展示统一用一个格式化函数（分 → 元，保留两位）；类别 ID 不硬编码，从 `/api/categories` 获取。
- 前端不保存任何 API Key；仅存放必要的会话 Token。

## 5. 测试

- 测试框架 Vitest；测试文件与被测模块对应：`backend/test/<module>/*.test.ts`。
- M2 的契约行为（反馈码、追问轮次、幂等、统计口径）必须有测试覆盖，契约第 4 节联调清单逐项对应用例。
- 调用外部 AI API 的代码通过依赖注入替换为 stub，单元测试不依赖网络与真实密钥。
- 修复缺陷时先写能复现缺陷的失败用例，再修复。

## 6. 提示词（Prompt）管理

- 提示词作为代码管理，放在所属模块的 `prompts/` 目录，用模板字符串或 `.md` 文件，不散落在业务代码中。
- 提示词中引用的类别、字段名与 GLOSSARY / 契约保持一致；类别列表运行时从数据库注入，不在提示词中写死。
- 修改提示词视同修改代码：需要 PR，并在日志「决策」中记录修改原因与效果对比。
