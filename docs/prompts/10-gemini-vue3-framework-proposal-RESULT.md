# Vue 3 前端框架层方案（10 号提示词执行结果）

> 执行方式：严格按 `10-gemini-vue3-framework-proposal.md` 正文的指令边界、14 条硬约束、第三节契约原文产出。
> 状态：**待审议**。请用 `11-hy4-vue3-framework-audit.md` 作尺子逐条挑错，不要因为本文件自称满足就跳过核查。
> 版本：v1（2026-11-16）· 范围：仅 `frontend/` 框架层，不碰后端、Docker、完整业务逻辑。

---

## A. 工程配置方案

| 配置文件 | 关键选项 | 理由 |
|---|---|---|
| `package.json` | `private: true`、`type: "module"`；scripts 见下 | workspace 由根仓库统一，前端包自身声明即可 |
| `vite.config.ts` | `plugins: [vue()]`、`server.port = 5173`、`build.outDir = 'dist'` | 构建产物固定，便于后端单端口托管 |
| `tsconfig.json` | `strict: true` + 下列显式项；`moduleResolution: "Bundler"`、`target: "ES2022"`、`jsx: preserve` | 与 Vite 原生 ESM 对齐 |
| `tsconfig.node.json` | 只 include `vite.config.ts`，`composite: true` | 隔离 Node 侧配置的类型上下文 |
| `env.d.ts` | `/// <reference types="vite/client" />` | 让 `.vue` 与 import.meta.env 有类型 |

**strict 具体开项**（`strict: true` 已含的前七项在此列明，便于审议核对）：

- 总开关含：`noImplicitAny`、`strictNullChecks`、`strictFunctionTypes`、`strictBindCallApply`、`strictPropertyInitialization`、`noImplicitThis`、`alwaysStrict`。
- 额外显式开：`noUnusedLocals`、`noUnusedParameters`、`noFallthroughCasesInSwitch`、`noImplicitOverride`、`useUnknownInCatchVariables`。
- 明确**不开** `exactOptionalPropertyTypes` 与 `noUncheckedIndexedAccess`：契约大量字段是「可选且可为 null」，前者会把 `undefined` 与缺失区分得过细；后者会让每次数组取值都要收窄。结论：不开，理由写在 `tsconfig.json` 注释里。

**四个脚本各跑什么**：

| 脚本 | 命令 | 作用 |
|---|---|---|
| `dev` | `vite` | 本地开发服务器，mock 分支常驻 |
| `build` | `vue-tsc --noEmit && vite build` | 先全量类型检查再出包，类型错不产 dist |
| `typecheck` | `vue-tsc --noEmit` | 只检查不产包，CI 与 PR 前跑 |
| `test` | `vitest run` | 只测工具层与 mock 层纯函数，不依赖网络 |

**依赖白名单逐项结论**：

| 依赖 | 是否实际需要 | 结论 |
|---|---|---|
| `vue` | 需要 | 框架本体 |
| `vue-router` | 需要 | 四页面路由 |
| `pinia` | **不需要** | 页面间无共享可变状态，用 composable 替代（见 E 节） |
| `vite` | 需要 | 构建与 dev server |
| `typescript` | 需要 | 类型系统 |
| `vue-tsc` | 需要 | SFC 类型检查，`tsc` 无法检查 `<script setup>` |
| `@vitejs/plugin-vue` | 需要 | 编译 SFC |
| `vitest` | 需要 | 工具层/mock 层单测 |

白名单外的 UI 库、CSS 框架、图表库、图标库、请求库、CDN 外链一律不引入；图表用 `<div>` 高度 + CSS，图标用文字或内联 SVG。

---

## B. 目录与文件清单（新增 / 不新建）

| 路径 | 动作 | 理由 |
|---|---|---|
| `frontend/index.html` | 新增 | Vite 唯一入口，`<div id="app">` + 一个 module script |
| `frontend/package.json`、`vite.config.ts`、`tsconfig.json`、`tsconfig.node.json`、`env.d.ts` | 新增 | 见 A 节 |
| `src/main.ts` | 新增 | `createApp(App).use(router).mount('#app')` |
| `src/App.vue` | 新增 | 根组件，只放 `<AppNav/>` + `<RouterView/>` |
| `src/router/index.ts` | 新增 | 四条路由，路径与旧 HTML 文件名一致：`/`、`/transactions`、`/stats`、`/budget` |
| `src/types/contract.ts` | 新增 | 契约类型唯一来源 |
| `src/utils/money.ts`、`src/utils/datetime.ts` | 新增 | 金额/时间唯一出口 |
| `src/api/request.ts`、`src/api/index.ts` | 新增 | fetch 唯一出口与业务方法 |
| `src/mock/data.ts`、`db.ts`、`import.ts` | 新增 | 种子数据、查询侧、入站状态机 |
| `src/composables/useCategories.ts` | 新增 | 类别字典缓存，替代 pinia |
| `src/components/`（5 个） | 新增 | 见 E 节组件清单 |
| `src/views/`（4 个 `*.vue`） | 新增 | 四个页面骨架 |
| `src/styles/tokens.css` | 新增 | 颜色/间距/字号唯一来源 |
| `frontend-static/`（仓库根） | 新增（归档） | 旧纯 HTML 版整体移入，不删、不参与构建 |

**我认为需要调整的一处**：第二节目录树里的 `src/stores/`（pinia store）。改为 `src/composables/`，不建 `stores/`。理由：类别字典是唯一需要跨页复用的数据，一个 `useCategories()` 的模块级缓存足够；引入 pinia 只是多一层样本代码。代价：若后续要加全局草稿状态，需再补一个 composable 或重新评估 pinia。

**我考虑过但决定不新建的文件**（防止膨胀）：

| 文件 | 不建的理由 |
|---|---|
| `src/stores/index.ts` | 不用 pinia，无 store 入口 |
| `src/api/mockAdapter.ts` | mock 与真实分支在同一方法内用 `USE_MOCK` 开关，形状由返回类型保证，不需要适配层 |
| `src/utils/request.ts` | fetch 出口放 `api/request.ts`，不设第二处 |
| `src/components/BudgetForm.vue` | 契约 §2.5 只有 GET，没有写接口，预算页只读 |
| `src/views/AuditView.vue`、`GamificationView.vue` | 扩展项本期只留目录位，不建空文件占坑 |
| `src/styles/components.css` | 组件样式用 `<style scoped>`，避免全局样式回流 |

---

## C. 契约类型设计

`types/contract.ts` 导出名单（只列名字，不写实现）：

- 批次入站：`ImportBatch`、`ImportRecord`
- 入站结果：`ImportResult`、`CategoryRef`
- 统计：`StatsResponse`、`StatsRange`、`StatsSummary`、`TopCategory`、`StatsBucket`、`StatsCategory`、`StatsMeta`、`StatsBasis`
- 账单：`TransactionListResponse`、`TransactionItem`、`TransactionSummary`、`TransactionPage`、`TransactionFilter`、`TransactionMeta`
- 类别与预算：`CategoryItem`、`BudgetItem`
- 错误：`ApiErrorBody`、`ErrorDetail`

**枚举/联合类型表达**：全部用字面量联合，**不用 `enum`**。理由：`enum` 会引入运行时对象，而契约字段是纯字符串值，字面量联合可逐字对应第三节且编译期可穷尽检查。

- `export type Direction = 'expense' | 'income'`
- `export type Modality = 'text' | 'voice' | 'image'`
- `export type ImportStatus = 'confirmed' | 'pending_followup' | 'duplicate' | 'rejected'`
- `export type FeedbackSeverity = 'blocking' | 'warning'`
- `export type FeedbackCode = 'MISSING_AMOUNT' | ...`（11 个字面量，与 §3.3 逐条对齐）
- `export type BudgetLevel = 'normal' | 'near' | 'over'`
- `export type StatsDimension = 'day' | 'month' | 'year' | 'recent7'`

**11 个反馈码与中文话术映射**：`export const feedbackText: Record<FeedbackCode, string>`，11 个 key 一个不少。`Record` 保证漏一个就类型报错——这是防止「码有了、文案没写」的结构性手段。未列入 §3.3 的码（如 `UNAUTHORIZED`）不进这张表，它们属于 `error.code`。

**字段名逐字对应的保证方式**：每个 interface 的字段名直接抄第三节，不写映射函数、不写 `Partial<>`、不做重命名；可选字段用 `field?: T | null` 原样表达。HTTP 错误码单独一个 `HttpErrorCode` 联合（5 个），与 `FeedbackCode` 不共用类型。

**三处契约不一致在类型层各自照抄**：

1. `TransactionItem.id` 与 `ImportResult.transactionId` —— 两个接口各用自己的名字，不抽公共基类。
2. 类别三种表示 —— `/api/categories` 用扁平 `CategoryItem`；`TransactionItem.category` 用嵌套 `CategoryRef`（id/name/color/icon）；`StatsSummary.topCategory` 用单独的 `TopCategory`（categoryId/name/totalCents/ratio）。三个类型各写各的。
3. 账单响应顶层 `page` —— 定义为 `TransactionPage { limit; hasMore; nextCursor }`，不叫 `pagination`，不含页码字段。

---

## D. 工具层与 API 层设计

| 导出 | 输入 | 输出 | 关键行为与降级 |
|---|---|---|---|
| `formatCents` | `number \| null \| undefined` | `string` | 唯一分转元展示出口；`null/undefined/NaN` → `'—'`；`0` → `'¥0.00'`（真 0 与缺失可区分） |
| `toYuanInput` | 同上 | `string` | 回填输入框用；缺失 → `''` |
| `centsToYuanNumber` | 同上 | `number \| null` | 提交入站字段 `amount` 用；缺失 → `null` |
| `yuanToCents` | `string \| null` | `number \| null` | 非法/负数/空串 → `null`；`0` → `0` |
| `normalizeIsoOffset` | `string \| null` | `string \| null` | 无偏移补 `+08:00`；`Z` 结尾换算为 `+08:00`；缺失 → `null` |
| `nowIso` | 无 | `string` | 固定 `+08:00`，不产生 Z 结尾 |
| `toDateKey` / `toMonthKey` | ISO 字符串 | `string` | 缺失 → `''` |
| `fmtDateTime` / `fmtDate` | ISO 字符串 | `string` | 缺失 → `'—'` |
| `toDatetimeLocal` | ISO 字符串 | `string` | 缺失 → `''`（datetime-local 控件只能收字符串） |
| `recent7Keys` | `YYYY-MM-DD` | `string[]` | 固定 7 个键，升序 |
| `request<T>` | `path`, `options` | `Promise<T>` | 全站唯一 `fetch`；网络失败抛 `ApiError('NETWORK')`；非 2xx 读 `body.error` 抛 `ApiError(code, message)` |
| `getCategories` | 无 | `Promise<CategoryItem[]>` | mock/真实都返回裸数组 |
| `getStats` | `dimension` 等 §2.4 参数 | `Promise<StatsResponse>` | `recent7` 不带 date/month/year；金额字段原样为分 |
| `listTransactions` | `cursor`/`limit`/`categoryId` 等 | `Promise<TransactionListResponse>` | `cursor` 为 `null` 时不拼该参数；禁止拼 offset |
| `getBudgets` | `month: string` | `Promise<BudgetItem[]>` | 裸数组 |
| `importBatch` | `ImportBatch` | `Promise<ImportResult>` | `results` 为空或非数组时抛 `ApiError('INVALID_BATCH')`，不让页面取 `results[0]` 崩掉 |

**mock 分支与真实分支同形状**：每个 `api/index.ts` 方法写法固定为 `if (USE_MOCK) return mockXxx(args); return request<T>(...)`，两分支都标注同一个契约返回类型；种子数据用 `satisfies CategoryItem[]` / `satisfies TransactionItem[]` 在编译期校验形状。`request<T>()` 内做最小运行时校验：检查 `body.error` 形状，并检查顶层是数组还是对象，不匹配即抛 `ApiError('INVALID_BATCH')`。这样真实后端返回脏数据时，错误也在 `api/` 边界被拦住，不流入业务层。

---

## E. mock 数据与组件/路由设计

**种子数据覆盖 11 个类别**：按第三节 §3.8 原文建表——支出 1 餐饮、2 交通、3 购物、4 居住、5 娱乐、6 医疗、7 教育、8 其他；收入 9 工资、10 转账、11 其他收入。名称、颜色、kind 逐字照抄，**不采用旧 mock 里的「奖学金/红包」命名**。

**四种状态各有样例**：`confirmed`（正常）、`pending_followup`（缺金额/缺时间）、`duplicate`（同 `idempotencyKey` 重发）、`rejected`（退款或满 3 轮）。`pending_followup` 再发时透传原 `rawText` 与原 `idempotencyKey`；重复阻断必须能被「改商户后重发」消解，否则状态机演示不通。

**recent7 与 `summary.count` 一致性**：7 个桶按 `[今天-6, 今天]` 生成（今天取 `DEMO_TODAY`，不取浏览器时钟）；空日 `expenseCents/incomeCents/count` 均为真实 `0`，这属于 0 值不是缺失；`summary.count` 定义为 7 桶 `count` 之和，禁止单独写死；`buckets[].categories` 必须按类别汇总填充并带 `ratio`，不能留空数组。

**通用组件清单**：

| 组件 | 职责 |
|---|---|
| `AppNav.vue` | 全站唯一导航，接收 `active` prop |
| `EmptyState.vue` | 空态，文案不出现「0 元」 |
| `LoadingSkeleton.vue` | 加载占位 |
| `AmountText.vue` | 金额展示，内部只调 `formatCents` |
| `LevelBadge.vue` | `budget.level` → 徽标样式与中文 |

类别色由接口返回，用 `:style="{ '--cat-color': cat.color }"` 注入，CSS 里用 `var(--cat-color)` 消费，不写死进 CSS 文件。

**pinia 是否需要**：不需要。`useCategories.ts` 用模块级变量缓存一次 `getCategories()` 结果，四个 View 共用；页面状态留在各 View 本地 `ref`。代价：刷新页面会重新请求类别字典，但这是一次轻量 GET，可接受。

**路由**：四条静态路由，无动态参数、无守卫（鉴权未定，契约 §2.6 的 `UNAUTHORIZED` 只做错误码展示）。

---

## F. 5 人并行的冲突面分析

| 文件/目录 | 冲突风险 | 拆分策略 |
|---|---|---|
| `src/styles/tokens.css` | 高（所有页面都用） | reviewer 在基线 PR 一次性定稿，其余人只读；要改变量先提 issue |
| `src/types/contract.ts` | 高（所有人都 import） | M2 组维护，其余人只读；新字段走 `contract-change` |
| `src/api/index.ts` | 高 | FE 负责人在基线 PR 定稿全部方法签名，页面只调用，不改签名 |
| `src/components/` | 中（新组件会改目录） | 新组件先在游戏化/审计扩展期由 FE 负责人统一合并；页面内私有子组件放 `views/` 同目录 |
| `src/mock/` | 中 | M2 组维护，前端只读；后端就绪后整体删除 |
| `src/views/*.vue` | **低** | 一人一个 View，互不覆盖，这是并行的主战场 |

**策略**：先由一个基线 PR 落地 A–E 全部基础设施 + 四个空 View 骨架，合并后 4 人各认领一个 View，日常提交只碰自己的 `views/<X>View.vue`。基线期短，冲突面集中在 reviewer 一人身上，可控。

---

## G. 风险与未决问题

| 问题 | 影响 | 建议方案 | 代价 |
|---|---|---|---|
| 旧纯 HTML 代码如何处置 | 两套前端并存会让评审困惑 | 整体移到 `frontend-static/`，README 注明「归档参考，不参与构建」 | 仓库多一个目录 |
| 后端未就绪时如何联调 | 页面无法跑通 | `USE_MOCK` 开关，mock 与真实分支同形状；后端就绪后删 `mock/` | mock 逻辑需随契约同步 |
| 空数据与首次使用体验 | 首次打开全是 0 元，误导 | 读 `meta.isEmpty`，为 true 时显示引导文案；空态组件禁止把缺失渲染成 `¥0.00` | 每个 View 多一个分支 |
| 时区与跨月边界 | 跨月统计串月 | 时间全部走 `utils/datetime.ts`，固定 `+08:00`；`toMonthKey` 从 `occurredAt` 取，不从浏览器时钟取 | 与用户本地时区显示可能差几小时，需在文档声明 |
| TS strict 对初学者的门槛 | 前期报错多、进度慢 | strict 全开，但配一份「常见报错速查」贴在 `frontend/README.md`；不因此降 strict | 前 2–3 天学习成本上升 |
| 200 行上限与 SFC 结构的张力 | 复杂 View 容易超限 | 按 script+template+style 三块合计核算；超限先抽 composable，再抽子组件 | 文件数增加 |
| 契约入站结果不含最终金额 | 回执只能显示用户提交值 | 本期照契约办；作为契约缺口单列给 M2，走 `contract-change` | 后端若改金额，回执与入库值可能不同 |

---

## H. 你不同意的既有约定

**对约束 12 的「单个 `.ts`/`.vue` 文件 ≤ 200 行（含三块合计）」有保留意见。**

- 理由：`<template>` 是声明式标记，行数随字段数线性增长，与 `<script>` 的逻辑复杂度不在一个维度。一个含对话流、追问表单、回执卡的 `CaptureView.vue`，模板本身就可能接近 100 行，导致为了压行数把模板拆成多个子组件，反而增加跳转成本，不利于初学者阅读。
- 替代方案：改为「单个 `.ts` ≤ 200 行；`.vue` 的 `<script setup>` ≤ 200 行，`<template>` 与 `<style scoped>` 不计入；单文件总行数 ≤ 350 行」。
- 代价：需要同步修订 11 号审议提示词的约束 12 与自检项，否则两份尺子不同源；且总行数放宽后要防组件膨胀。
- 本方案仍按现行 200 行合计口径设计（见 F/G 节），未因这条意见放宽。

---

## 自检：14 条硬约束

| # | 约束 | 我的方案如何满足 |
|---|---|---|
| 1 | Vite + Vue 3 + TS strict，`<script setup>` | A 节配置；B 节四 View 均为 SFC；H 节明确不退回 Options API |
| 2 | 依赖白名单，无 UI/图表/请求库/CDN | A 节逐项结论，pinia 明确不用，图表用 CSS |
| 3 | 沿用目录树，不重命名概念目录 | B 节逐路径对照；唯一调整 `stores/`→`composables/` 并给出理由与替代 |
| 4 | 分↔元只在 `utils/money.ts` | D 节四个金额函数全在该文件；提交 `amount` 按契约传元，是明文例外 |
| 5 | 时间统一 +08:00，不产 Z 结尾 | D 节 `normalizeIsoOffset`/`nowIso`；G 节跨月边界方案 |
| 6 | 类别 ID/名称不硬编码 | C 节类型来自接口；E 节 11 类只出现在 mock 种子数据，页面组件不写死 |
| 7 | 缺失为 null 渲染「—」，空日 0 不混淆 | D 节每个函数的 null 降级；E 节明确空日是真 0；`AmountText.vue` 调 `formatCents` |
| 8 | 游标分页，禁 page/offset 请求参数 | D 节 `listTransactions` 不拼 offset；C 节 `TransactionPage` 照抄顶层键名 |
| 9 | fetch 只在 `api/request.ts` | D 节 `request<T>` 唯一出口；B 节不建第二处 request |
| 10 | 样式只走变量，scoped，类别色行内注入 | A/B/E 节：`tokens.css` 唯一来源、`<style scoped>`、`--cat-color` |
| 11 | 命名 camelCase / kebab-case / PascalCase | C 节类型名、B 节文件名均按此；常量 `feedbackText` 用 camelCase 不用全大写 |
| 12 | 单文件 ≤ 200 行，导出函数有 TSDoc | F 节拆分策略；G 节超限处理；H 节提出修订意见但本方案仍按现口径 |
| 13 | 禁 `v-html`、禁 `innerHTML` | E 节组件用 `{{ }}` 插值；类别色走 `:style`，不拼 HTML |
| 14 | `types/contract.ts` 唯一来源，边界收窄 | C 节全量类型名单与三处不一致照抄；D 节 `satisfies` + `request<T>` 最小校验 |

（正文结束）
