# 第 2 轮修正复检（B1–B4 / N5–N8）

> 审计对象：Gemini 针对 `2026-11-16-gemini-code-batch2to5-audit.md` 的修订（10 个文件，新增 `mock/stats.ts`）
> 审计角色：审议模型（hy4）。**本文件是复检结论，不是改写稿。**
> 尺子：10 号第二节 14 条硬约束 + 第三节契约原文；上一轮复检的阻塞/非阻塞清单。
> 实测环境：Node 22.22.2 / npm 10.9.7，逐字落盘到隔离目录，`npm install` 基线 + 覆盖修订文件后逐项运行。
> 版本：v1（2026-11-16）

---

## 一、总评

**结论：修改后通过。** 上一轮 4 个阻塞 + 4 个非阻塞的指定项**全部实测确认修复**，编译与构建保持通过。剩余 2 处定点问题（R1/R2）改完即可收口，不需要再全量重写。

---

## 二、实测通过项（逐条，附证据）

| 项 | 判定 | 实测证据 |
|---|---|---|
| typecheck | ✅ | `npx vue-tsc --noEmit` 退出码 0 |
| build | ✅ | `npx vite build` 成功，66 modules，产物 css 10.07 kB / js 119.73 kB |
| **B1** 反馈码 | ✅ | `feedbackText` 11 键，与契约 §1.5 集合**全等**；`MISSING_TIME`/`DUPLICATE_RECORD` 等契约码全部到位 |
| **B2** 统计结构 | ✅ | `range={start,end}`；`summary keys=expenseCents,incomeCents,netCents,count,topCategory`；`bucket keys=period,...`；`categories[0]` 含 `kind/custom/count/ratio`；`meta.unit='cent'` |
| **B2** 账单结构 | ✅ | `filter={categoryId,from,to,direction}`；item keys 含 `occurredDate/sourceModality/sourceRef/status/anomalyFlag` |
| **B2** 预算结构 | ✅ | `budget[0]={scope,category,amountCents,spentCents,remainingCents,usageRatio,level}` |
| **B2** 错误码 | ✅ | `HttpErrorCode` 5 个换成契约的 `INVALID_BATCH/INVALID_DIMENSION_PARAM/CATEGORY_NOT_FOUND/CATEGORY_IN_USE/UNAUTHORIZED`；`request.ts` 兜底码从 `INTERNAL_ERROR` 改为 `INVALID_BATCH` |
| **B3** 入站类型 | ✅ | `version:1`（数字）；`direction:null` 实测回 `pending_followup + MISSING_DIRECTION`；`chatAt` 可空 |
| **B3** duplicate | ✅ | 同 key 两次提交：第二次 `status=duplicate`、复用 `transactionId`、反馈码 `DUPLICATE_RECORD` |
| **B4** 色值 | ✅ | 11 个色值与契约 §3 逐字全等，`isPreset/isActive` 齐全 |
| **N5** 轮次复活 | ✅ | 同 key 连续 5 轮：`pending→pending→rejected→rejected→rejected`，第 4/5 轮不再复活 |
| **N5** 退款 | ✅ | `rawText` 含「退款」→ `rejected + REFUND_NOT_SUPPORTED` |
| **N6** db.ts 行数 | ✅ | `mock/db.ts` 从 226 行降到 **110 行**，统计逻辑移入 142 行的 `mock/stats.ts` |
| **N7** 循环依赖 | ✅ | `StatsQuery`/`TransactionQuery` 下沉到 `types/contract.ts`，`db.ts` 不再从 `api/index.ts` 反引 |
| **N8** 硬编码 ID | ✅ | `inferCategory` 改为 `findCategoryByNameAndKind`，收入实测推断到 `{id:9,name:'工资',kind:'income'}` |
| 上一代 P0 categories | ✅ | `recent7` 非空 categories 桶存在，`count` 与 buckets 合计一致，`ratio/kind/custom/count` 齐全 |

---

## 三、剩余定点问题（必须改，但不需要重交全量）

### R1（阻塞）`CaptureView.vue` 手写 `cents / 100`，违反硬约束 4

代码 `:36`：

```ts
const cents = yuanToCents(amountInput.value);
const amountYuan = cents === null ? null : cents / 100;
```

10 号提示词硬约束 4 明文：「分转元的除法**只能出现在 `utils/money.ts`**，其它文件出现 `cents / 100`、`/ 100`、`* 0.01` 即违规」。而 `money.ts` 已经导出了 `centsToYuanNumber()` 专做这件事——Gemini 没有调用它。

**改法**：`import { yuanToCents, centsToYuanNumber } from '../utils/money'`，改成 `const amountYuan = centsToYuanNumber(cents);`。

**责任说明（如实交代）**：这一行在上一轮代码里就存在，是我上一轮复检的**漏审**，不是 Gemini 本轮新引入的。但按项目尺度（08 号清单里 243 行超限即判阻塞），硬约束违规必须修正，不能因为它存在得早就放过。

### R2（阻塞）`basis.dateField` 的值与契约不符

代码 `types/contract.ts:8` 定义 `StatsBasisDateField = 'occurredAt'`，`stats.ts` 实测输出：

```json
"basis": { "dateField": "occurredAt", "timezone": "Asia/Shanghai", "includeVoid": false }
```

契约 §2.2（原文 `:202`）是：

```jsonc
"basis": { "dateField": "occurred_date", "timezone": "Asia/Shanghai", "includeVoid": false }
```

上一轮我指出 `meta` 结构漂移，Gemini 修了结构但 `dateField` 的**取值**仍按自己命名。改成 `'occurred_date'`（类型字面量与运行值同时改）。

### R3（非阻塞）`contract.ts` 247 行，N6 只修了一半

Gemini 拆分了 `db.ts`（226→110，做得对），但 `contract.ts` 从 227 行涨到 **247 行**，仍超 200 行硬约束。建议把 `Stats*`/`Transaction*`/`Budget*` 的纯接口按域拆到 `types/stats.ts`、`types/transaction.ts`，`contract.ts` 用 `export type { ... } from` 汇总导出，保持「唯一来源」语义不变。

### R4（非阻塞）`direction=null` 时用 `expense` 硬兜底，绕过按类别推断

`import.ts` 里 `const effectiveDirection: Direction = record.direction ?? 'expense'`，同时把 `MISSING_DIRECTION` 塞进 feedback。契约 §1.3 要求「类别能识别就用类别 kind 推断，推断不出才追问」——当 `rawText` 明显是工资/转账时，这里仍按 `expense` 参与 `inferCategory` 与入库，第 2 轮用户仍不指定方向会记成支出。建议把兜底顺序改成「先看推断类别的 `kind` → 再 expense」，或明确只有第 2 轮起才允许硬兜底。

### R5（非阻塞）两个字段类型过宽 / 与契约取值不符

`TransactionItem.status: string`（契约是字面量 `confirmed`）、`anomalyFlag: string | null`（契约是 `boolean`，种子数据却填 `null`）。建议 `status: 'confirmed'`、`anomalyFlag: boolean`，种子填 `false`。

### R6（非阻塞）`StatsResponse.direction` 缺 `all`

类型 `Direction` 只有 `expense|income`，契约 §2.2 的 `direction` 允许 `all`（默认）。本期 View 只传 `expense`，不影响演示，但类型没覆盖契约全量。

### R7（需 reviewer 裁决）`DUPLICATE_RECORD` 的 severity=warning

代码用 `'warning'`，契约 §1.5 表格写 `blocking`，但 §1.4 又要求 `duplicate`「按成功处理、不要报错」。这是契约自身的矛盾（上一轮 BUGS.md 的 A1 已记录）。**建议保留 warning** 以配合「按成功处理」语义，并在契约里把 §1.5 的 `DUPLICATE_RECORD` 严重度改为 warning——走 `contract-change`，不要私自改代码。

---

## 四、给 reviewer 的处理建议（非审计结论）

1. **R1/R2 两条直接发回 Gemini 定点修**，附上本文逐字引用，不要再发全量提示词，也不要让它顺手重构已通过的部分。
2. **R3–R6 列入下一轮技术债**，不阻塞本期合并；其中 R3（行数）若评审会查硬约束，则本轮一起修。
3. **R7 由你拍板**：保留 warning 并提 `contract-change`，还是严格按表格改 blocking（但会和「按成功处理」打架）。
4. 修完后只需重跑 `vue-tsc --noEmit`、`vite build` 与反馈码/dateField 两项断言，不必全量回归。

---

## 五、我不确定的判断

- 与前一轮相同：作者身份是形式推断，非数字签名级证明。本轮代码风格、批次上下文与上一轮一致。
- R1 归因已明确写为「我上一轮漏审」，不推给 Gemini。
- 未验证真实后端联调（后端尚不存在），所有「与契约一致」的判断都基于代码形状与 mock 运行时输出，不等于真实 HTTP 往返一定正确。
