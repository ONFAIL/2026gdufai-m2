# 第 2–5 批代码复检（含第 1 批 vitest 修正）

> 审计对象：Gemini 回复的 `frontend/` Vue 3 框架层全部代码（第 1 批修正 + 第 2–5 批，共 27 个文件）
> 审计角色：审议模型（hy4）。**本文件是复检结论，不是方案，也不是改写稿。**
> 尺子：`10-gemini-vue3-framework-proposal.md` 第二节 14 条硬约束 + 第三节契约原文；`12-gemini-vue3-framework-codegen.md` 前置修正 B1/N1–N4；`13-gemini-finish-all-batches.md` 复检要求。
> 实测环境：Node 22.22.2 / npm 10.9.7，临时目录逐字落盘 27 文件，`npm install` 后逐脚本运行。
> 版本：v1（2026-11-16）

---

## 〇、先回答「这是不是 Gemini 的代码」

**从形式证据判断：是。** 三条硬证据：

1. **交付形态与 13 号提示词逐字吻合**：每个文件以 `// FILE: <完整路径>` 开头 + 完整代码块 + 一段中文说明，批次间以「第 N 批完成」分隔，末尾「第 2–5 批全部完成」。这是本项目 05/06 号提示词以来 Gemini 的固定产出风格。
2. **三个只有收到我复检意见才会做的特定改动全部落实**：`vitest` 升到 `^3.2.0`（13 号修正 1）、`duplicate` 按成功复用 `transactionId`（B1）、`importBatch` 返回完整 `{batchId, results}`（N1）。这三处不是通用最佳实践，是我上一轮逐字给出的定点修正。
3. **/批次数、文件清单、目录结构与 12 号第四节完全一致**，没有增建 12 号明确不建的文件（`api/mockAdapter.ts`、`stores/`、`BudgetForm.vue` 等）。

结论：**这是按我给出的提示词、由执行模型产出的代码，属于「Gemini 代码」无疑。**

但——**「是 Gemini 的代码」与「代码合格」是两件事**。下面按审议尺子给出复检结论。

---

## 一、总评

**结论：驳回（需修改后重交）。**

编译层面全部通过（`typecheck` 0、`build` 成功、`test` 3.2.7 通过），格式纪律和三个定点修正也都落实。**但契约层出现系统性漂移**：`types/contract.ts` 号称「字段名逐字对应契约原文」（自检第 14 条），实际 11 个反馈码自造了 9 个、统计/账单/预算三块响应结构与契约完全不同、`version` 类型从 `number` 改成 `string`。

这类问题编译期不会报错——因为类型定义本身是自洽的，错的是「定义的形状」而不是「定义的一致性」。这正是必须拿契约原文逐字对照才能发现的问题，也是 02/11 号审计提示词存在的理由。

---

## 二、实测通过项（原样保留，不要改）

| 项 | 实测证据 |
|---|---|
| 依赖版本 | `npm install` 88 包，无 peer 冲突；`npm ls vite vitest` 单一 `vite@6.4.6` + `vitest@3.2.7`，上一轮双 vite 故障已消除 |
| typecheck | `npx vue-tsc --noEmit` 退出码 0 |
| build | `npx vite build` 成功，65 modules，产物 `index.css 10.03 kB` / `index.js 118.01 kB` |
| B1 duplicate | 实测同一 `idempotencyKey` 两次提交：`r1=confirmed tx-mock-1794835420567`、`r2=duplicate tx-mock-1794835420567`——复用 `transactionId`、不报错，正确 |
| N1 ImportResult | `api/index.ts` 的 `importBatch()` 返回完整响应并校验 `res.results`，未取首项，正确 |
| 上一代 P0（categories 空数组） | 实测 `recent7`：非空 categories 桶 = 4，`summary.count=7` 与 buckets 合计 7 一致，已修复 |
| 追问 3 轮收口 | 实测第 1/2 轮 `pending_followup`、第 3 轮 `rejected(MAX_FOLLOWUP_EXCEEDED)`，收紧路径存在 |
| 格式与组件 | 5 个组件 + 4 个 View + 路由齐全；表单均有 `<label for>`，文件输入用 `.sr-only` 保留键盘可达；失败重试与空态互斥 |
| 样式纪律 | 组件 `<style scoped>` 全部引用 `var(--*)`，类别色走 `:style="{ '--cat-color': ... }"` 行内注入 |

---

## 三、阻塞缺陷（必须改，否则联调必炸）

### B1. 11 个反馈码自造了 9 个（最严重）

代码 `src/types/contract.ts:9–21` 定义：

```ts
export type FeedbackCode =
  | 'MISSING_AMOUNT' | 'INVALID_AMOUNT' | 'MISSING_OCCURRED_AT'
  | 'INVALID_OCCURRED_AT' | 'FUTURE_OCCURRED_AT' | 'MISSING_MERCHANT'
  | 'LOW_CONFIDENCE' | 'AMBIGUOUS_CATEGORY' | 'REFUND_NOT_SUPPORTED'
  | 'MAX_FOLLOWUP_EXCEEDED' | 'DUPLICATE_SUBMISSION';
```

契约 §1.5（`:122–134`）逐个列出的是：

```text
MISSING_AMOUNT, MISSING_TIME, FUTURE_TIME, MISSING_DIRECTION,
CATEGORY_KIND_MISMATCH, LOW_CONFIDENCE_CATEGORY, MERCHANT_DEFAULTED,
TIME_DEFAULTED_TO_CHAT_TIME, DIRECTION_FORCED_BY_CATEGORY,
DUPLICATE_RECORD, REFUND_NOT_SUPPORTED
```

两组交集**只有 2 个**（`MISSING_AMOUNT`、`REFUND_NOT_SUPPORTED`）。`feedbackText` 映射（`:23–35`）同样按这套自造码写，于是：

- `mock/import.ts:64` 生成 `MISSING_OCCURRED_AT`、`:52` 生成 `DUPLICATE_SUBMISSION`、`:102` 生成 `MAX_FOLLOWUP_EXCEEDED`——后端契约里**根本不存在**这些码；
- 真后端按契约回 `MISSING_TIME` / `DUPLICATE_RECORD` / `TIME_DEFAULTED_TO_CHAT_TIME` 时，`CaptureView.vue` 里 `feedbackText[fb.code]`（`:118`）查不到键，用户看到**空白文案**；
- 契约 §1.5 的 `MISSING_DIRECTION`、`CATEGORY_KIND_MISMATCH`、`MERCHANT_DEFAULTED` 等分支在代码里完全没有对应实现。

违反 10 号提示词〇.4「第三节没有的反馈码，不要发明」与硬约束 14「字段名逐字对应契约原文」。**必须整表替换为契约原码**，并补齐 11 个码的 `Record<FeedbackCode, string>` 文案。

### B2. 三块响应结构与契约不同形（统计 / 账单 / 预算）

| 块 | 契约原文（10 号 §3.4–3.6 = 契约 §2.2–2.5） | 代码 | 差异 |
|---|---|---|---|
| 统计 `range` | `{ start, end }` | `{ startDate, endDate, label }` | 键名全改 |
| 统计 `summary` | `expenseCents, incomeCents, netCents, count, topCategory` | `totalCents, expenseCents, incomeCents, count, avgCents, topCategory` | 缺 `netCents`，多 `totalCents`/`avgCents` |
| 统计 bucket 主键 | `period` | `key` | 键名改；`categories[]` 也丢了 `kind`/`custom`/`count` |
| 统计 `meta` | `{ unit:'cent', basis:{dateField,timezone,includeVoid}, generatedAt, isEmpty }` | `{ basis:'occurredAt', timezone, isEmpty }` | `unit`/`generatedAt` 丢失，`basis` 从对象变字符串 |
| 账单 items | `occurredDate`、`sourceModality`、`sourceRef`、`status`、`anomalyFlag` | 无；多出 `rawText`、`modality` | 字段集不同 |
| 账单 `filter` | `{ categoryId, from, to, direction }` | `{ cursor, limit, categoryId, direction, month }` | 用 `month` 代替 `from`/`to` |
| 预算 | `{ scope, category, amountCents, spentCents, remainingCents, usageRatio, level }` | `{ id, month, categoryId, categoryName, limitCents, spentCents, remainingCents, ratio, level }` | `amountCents→limitCents`、`usageRatio→ratio`，其余新增 |
| 类别字典 | 含 `isPreset`、`isActive` | 无 | 缺 2 字段 |
| HTTP 错误码 | `INVALID_BATCH, INVALID_DIMENSION_PARAM, CATEGORY_NOT_FOUND, CATEGORY_IN_USE, UNAUTHORIZED` | `INVALID_BATCH, VALIDATION_ERROR, NOT_FOUND, INTERNAL_ERROR, UNAUTHORIZED` | 3 个自造 |

`StatsView.vue` 读 `data.summary.expenseCents`、`data.buckets[].label`；`BudgetView.vue` 读 `b.categoryName` / `b.limitCents` / `b.ratio`——调用方也跟着这套自造字段写。真后端接上后，这些页面读到的全是 `undefined`，显示为 `—` 或空白。

### B3. 入站批次三处类型不符合契约

| 字段 | 契约 §1.2/§1.3 | 代码 | 后果 |
|---|---|---|---|
| `version` | `number`，固定 `1` | `string`，`CaptureView.vue` 传 `'1.0'` | 后端 JSON Schema 若校验 `version === 1`（number），整批 400 |
| `direction` | `expense \| income \| null`，判不出传 `null` 不要猜 | `Direction`（非空），`CaptureView` 默认 `'expense'` | 等于替用户猜了支出，违反契约 §1.7①；`MISSING_DIRECTION` 分支永远不可达 |
| `chatAt` | `string \| null`，可空 | `string` 必填 | 无法表达「不传、用 sentAt 兜底」 |

### B4. 预设类别色值 11 个里错了 8 个

契约 §3（`:287–302`）色值 vs `mock/data.ts:5–15`：

| ID | 名称 | 契约 | 代码 | 是否符合 |
|---|---|---|---|---|
| 1 | 餐饮 | `#F97316` | `#f97316` | ✓ |
| 2 | 交通 | `#3B82F6` | `#0ea5e9` | ✗ |
| 3 | 购物 | `#EC4899` | `#ec4899` | ✓ |
| 4 | 居住 | `#10B981` | `#8b5cf6` | ✗（这是娱乐的色） |
| 5 | 娱乐 | `#8B5CF6` | `#eab308` | ✗ |
| 6 | 医疗 | `#EF4444` | `#ef4444` | ✓ |
| 7 | 教育 | `#F59E0B` | `#3b82f6` | ✗（这是交通的色） |
| 8 | 其他 | `#6B7280` | `#64748b` | ✗ |
| 9 | 工资 | `#22C55E` | `#10b981` | ✗（这是居住的色） |
| 10 | 转账 | `#F472B6` | `#14b8a6` | ✗ |
| 11 | 其他收入 | `#9CA3AF` | `#22c55e` | ✗ |

10 号提示词 §3.8 已逐字列出全部色值，`mock/data.ts` 未照抄，颜色与类别错位。

---

## 四、非阻塞缺陷

| # | 问题 | 证据 |
|---|---|---|
| N5 | **满 3 轮后会「复活」**：`mock/import.ts:99` 在第 3 轮 `rejected` 时 `followupRoundByKey.delete(key)`，同 key 第 4 轮重新从 0 计数。实测 `FOLLOW 1/2 pending → 3 rejected → 4 pending_followup`。前端 rejected 时会换 key，正常路径碰不到，但状态机本身有泄漏 | 实测输出 |
| N6 | **两个文件超 200 行**：`types/contract.ts` 227 行、`mock/db.ts` 226 行，违反硬约束 12；`CaptureView.vue` 140 行合规 | `wc -l` |
| N7 | **循环 type-only import**：`mock/db.ts:10` 从 `api/index.ts` 导入 `StatsQuery`/`TransactionQuery`，而 `api/index.ts` 又导入 `mock/db.ts`。编译期被擦除不影响运行，但应把 Query 类型下沉到 `types/contract.ts` | 源码 |
| N8 | **`inferCategory` 用 `MOCK_CATEGORIES` 数字下标**（`mock/import.ts:19/23/26/29`），契约明令 ID 固定但「不得硬编码 ID 与名称」；mock 层可接受，仍是硬编码 | 源码 |
| N9 | 金额「32块5」提取未实现：`CaptureView.vue` 只把用户手填的金额框传给后端，`rawText` 不解析。本期 mock 可视为模块 1 未实现的占位，但 08 号清单里这个坑不能算已修 | 源码 + 08 号 |

---

## 五、给 reviewer 的处理建议（非审计结论）

1. **不要让 Gemini 继续写第 6 批**。当前 5 批的 `types/contract.ts` 是整个工程的形状源头，它错了，后面所有 View 都跟着错。先集中修 B1–B4。
2. **修正指令必须附上契约原文逐字对照表**，不能只说「反馈码要和契约一致」——上一轮正是「方案里说逐字对应、没列具体值」导致代码自造 9 个码。
3. **修完后必须重跑本文第二节的全部实测项**，特别是 `feedbackText[契约码]` 的查表结果。
4. B1 的 `duplicate` 成功语义、N1 的完整响应、categories 填充这三处已正确，修正时**不要顺手改坏**。

---

## 六、我不确定的判断

- 无法从文本 100% 鉴定作者身份。第〇节的「是 Gemini 代码」是基于交付形态 + 三个定点修正落实的形式推断，不是数字签名级证明。
- 若 Gemini 实际收到的 10 号提示词第三节被截断（例如只拿到 §3.1–3.2、没拿到 §3.3 反馈码表与 §3.4–3.6 结构），B1/B2 的归因要从「模型自造」改为「输入不全」。请核对当时实际投喂内容；若确为输入不全，重投全文即可，不必改提示词结构。
