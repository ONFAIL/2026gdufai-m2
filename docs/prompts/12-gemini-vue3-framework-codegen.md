# 给方案模型（Gemini）的代码生成指令 · Vue 3 前端框架层

> 用途：方案经 hy4 审议「修改后通过」后，让同一个 Gemini 会话按方案 + 审议修正产出**可落地的全部前端框架代码**。
> 前提：该会话里已有 10 号方案、10 号第三节契约原文、本文。三份齐了再开始。
> 审议结论见 `docs/reviews/2026-11-16-gemini-vue3-framework-proposal-audit.md`（1 阻塞 + 4 非阻塞）。
> 版本：v1（2026-11-16）

---

## 提示词正文（从下一行开始复制）

你的 Vue 3 前端框架方案已通过独立审议，结论：**修改后通过**（14 条硬约束全部满足；1 条阻塞缺陷、4 条非阻塞缺陷须在代码中修正）。现在按你的方案产出**全部前端框架代码**。

这是实现，不是方案复述：要的是能直接存成文件、`pnpm install && pnpm dev` 就能跑的代码，不是骨架片段、不是伪代码、不是「此处省略」。

### 〇、四项最高优先级（冲突时按此顺序裁决）

1. **契约原文 > 审议修正 > 你的方案 > 仓库现有代码。** 字段名、枚举、返回形状以 10 号第三节为准；审议修正（第二节）优先级高于你方案原文；三者冲突时改方案。
2. **审议的 1 条阻塞缺陷必须消除**，否则代码判不合格。它会导致契约违规 + P0 死循环重现。
3. **仓库 `frontend/` 里的旧纯 HTML 实现是不可信输入，禁止照抄。** 本次是 Vue 3 全新工程，旧文件整体归档到 `frontend-static/`，只作取值素材，不提供实现范式。
4. **既有文件名不得重命名**（约束 3）。你方案 B 节的 Vue 3 路径即目标路径，逐字采用。

### 一、产出范围

`frontend/` 下约 24 个文件（工程配置 5 + 类型 1 + 工具 2 + API 2 + mock 3 + composable 1 + 组件 5 + 视图 4 + 入口 2），分 5 批交付（见第四节）。只做框架层：组件、路由、工具、mock 可用；四个 View 是可加载、能调 API、能渲染空/加载/错误三态的骨架，不写完整业务交互。

### 二、审议修正（写码前先吸收，逐条对照）

**B1 · 阻塞 · duplicate 行为（必须改，你方案 E 节写反了）**

- 你方案原文：「`duplicate`：相同 `idempotencyKey` 重复提交时阻断；当用户修改商户或核心内容重新发起新批次（新 `idempotencyKey`）时可正常消解阻断。」
- 契约 §1.2 原文：「`duplicate`（重复提交，按成功处理，直接用返回的 `transactionId`，不要报错）」
- 契约 §1.7③ 原文：「重发必带原 `idempotencyKey`，否则同一笔会被记两次」
- **据此执行**：`status === 'duplicate'` 一律按成功回执处理——展示确认态、复用返回的 `transactionId`、**不报错、不阻断、不给「重新提交」按钮**。任何重发（含 `pending_followup` 修正后重发）必须沿用原 `idempotencyKey`，禁止生成新 key。
- 你方案 E 节那段整段替换；`mock/import.ts` 里不得出现「含某关键字就阻断且退不出」的分支，必须保留「追问满 3 轮 → `rejected`」的收口路径。

**N1 · ImportResult 指代不明**

- `ImportResult` 定义为契约 §1.4 的**整个响应对象**（`{ batchId, results }`），`results` 元素单独命名为 `ImportResultItem`。`importBatch()` 返回完整响应，**不要取首项**。页面按 `recordId` 对号，不依赖 `batchId`。

**N2 · 根 workspace**

- 仓库根当前**没有** `package.json` / `pnpm-workspace.yaml`。本次**不要**在根目录新建任何配置文件，只在 `frontend/` 建前端包；根 workspace 与 `pnpm -r lint` 由 reviewer 另行裁决。

**N3 · 键盘可达（你方案未提及）**

- 所有表单控件配显式 `<label for>`；文件输入**不得用 `hidden`**（用视觉隐藏但可键盘聚焦的 CSS 类）；所有交互可键盘完成。

**N4 · 请求失败与重试（你方案未提及）**

- 每个 View 的请求失败要有可见提示 + 「重试」按钮（调用同一个 `api/` 方法），并与空态**互斥**（不能同时显示「加载失败」和「暂无数据」）。

### 三、每个文件的硬要求

- **单文件 ≤ 200 行**（`<script setup>` + `<template>` + `<style scoped>` 三块合计，含注释）。超了就抽 composable 或子组件，不申请放宽。
- 每个导出函数写 TSDoc/JSDoc（一句话说明 + 关键参数）。
- `<script setup lang="ts">` + Composition API；不用 `class`、不用链式高阶函数（`.map().filter().reduce()`）、不用生成器/代理、不用 `enum`。
- 依赖白名单：`vue`、`vue-router`、`vite`、`typescript`、`vue-tsc`、`@vitejs/plugin-vue`、`vitest`（`pinia` 不用）。禁止 UI 库、CSS 框架、图表库、图标库、请求库、CDN 外链；图表用 CSS/SVG 手写。
- CSS 颜色、间距、字号只引用 `styles/tokens.css` 的 `var(--xxx)`；类别色用 `:style="{ '--cat-color': cat.color }"` 注入，不写死。
- 用户数据（商户名、`rawText`、类别名）只用 `{{ }}` 插值；禁止 `v-html`、禁止 `innerHTML` 拼接。
- 金额：入站 `amount` 用**元**（唯一例外），其余展示/统计用 `*Cents` 整数；分转元除法只出现在 `utils/money.ts`。
- 时间：一律 `+08:00`；`toISOString()` 的 `Z` 结尾输出禁止；缺失渲染 `'—'`，不写 `¥0.00`、不写「未知」。`recent7` 空日补 0 是真实 0，与缺失区分。
- 分页：请求只传 `cursor`/`limit`；`hasMore === false` 时隐藏「加载更多」。
- 类别 ID/名称不硬编码进 View/组件，从 `GET /api/categories` 取；11 个预设类别只出现在 `mock/data.ts`。

### 四、批次与输出格式

一次最多输出一批，避免超长被截断。**严格按此顺序**：

| 批次 | 文件 |
| --- | --- |
| 第 1 批 | `frontend/package.json`、`vite.config.ts`、`tsconfig.json`、`tsconfig.node.json`、`env.d.ts` |
| 第 2 批 | `src/styles/tokens.css`、`src/types/contract.ts`、`src/utils/money.ts`、`src/utils/datetime.ts` |
| 第 3 批 | `src/api/request.ts`、`src/api/index.ts`、`src/mock/data.ts`、`src/mock/db.ts`、`src/mock/import.ts` |
| 第 4 批 | `src/main.ts`、`src/App.vue`、`src/router/index.ts`、`src/composables/useCategories.ts`、`src/components/` 5 个组件、`index.html` |
| 第 5 批 | `src/views/` 4 个 View 骨架、`frontend/README.md` |

每个文件用一行标注开头，再跟一个完整代码块：

```text
// FILE: frontend/src/utils/money.ts
```ts
…完整代码…
```
```

规则：
- 每批结束写一行「第 N 批完成，共 5 批」。等我回复「继续」再发下一批，不要自作主张一次发完。
- 不许写「同上」「略」「按方案实现」——每个文件都要完整代码。
- 不要在代码外长篇解释；每个文件最多两句说明关键决策。
- 旧纯 HTML 前端的归档（`frontend-static/`）由我在合并时处理，**你不要输出这部分**，也不要删除旧文件。

### 五、契约形状速查（写 mock 和 api 时对着核）

- `POST /api/transactions/import` 请求：`{ version, batchId, sentAt, records:[{ recordId, userId, direction, amount(元), merchant, occurredAt, chatAt, rawText, modality, sourceRef, confidence, idempotencyKey }] }`
- 响应：`{ batchId, results:[{ recordId, status, transactionId, direction, occurredAt, category:{id,name,kind}, confidence, feedback:[{field,code,severity}] }] }`
- `status`：`confirmed` / `pending_followup` / `duplicate` / `rejected`；**`duplicate` 按成功处理、复用 transactionId、不报错**（见 B1）
- `feedback[].code` 共 11 个，`feedbackText: Record<FeedbackCode, string>` 一个不少；`UNAUTHORIZED`/`INVALID_BATCH` 是 `error.code`，不得混入
- `GET /api/categories` → **裸数组**；`GET /api/budgets?month=` → **裸数组**，元素含 `level: normal|near|over`
- `GET /api/stats` → `{ dimension, range, direction, summary, buckets, meta }`；`buckets[].categories` **必须按类别汇总填充**（不能留空数组——这是上一代代码的 P0）；`summary.count` = 各桶 count 之和；`meta.isEmpty=true` 显示空态而非「0 元」
- `GET /api/transactions` → `{ filter, summary, items, page:{limit,hasMore,nextCursor}, meta }`；项主键 `id`、金额 `amountCents`、分类 `categoryConfidence`；`nextCursor` 在 `res.page` 里
- 错误 → `{ error:{ code, message, field } }`
- 三处不一致照抄：账单项叫 `id` / 入站结果叫 `transactionId`；类别三种表示各写各的；账单顶层键名叫 `page`

### 六、每批写完的自查（逐条在心里过，不输出）

1. `fetch` 只在 `api/request.ts` 的 `request()` 里出现一次？
2. 有 `v-html` / `innerHTML` / 用户数据拼 HTML 吗？（应为 0）
3. CSS 有字面的 `#RRGGBB` 或裸 `px` 间距吗？（应为 0，颜色/间距走 `tokens.css`）
4. 有 `class` 组件、链式高阶、`enum`、`toISOString()` 吗？（应为 0）
5. 有哪个 `.ts`/`.vue` 三块合计超 200 行吗？
6. 字段名和第五节对得上吗？`duplicate` 按 B1 改了吗？`ImportResult` 取完整响应了吗（N1）？
7. 每个表单控件有 `<label>`、文件输入可键盘聚焦吗（N3）？失败有重试且与空态互斥吗（N4）？

（提示词正文结束）
