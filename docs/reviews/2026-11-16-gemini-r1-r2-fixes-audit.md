# R1/R2 定点修正复检（前端框架收口）

> 审计对象：Gemini 针对 14 号提示词的定点修订（3 个文件：`CaptureView.vue`、`types/contract.ts`、`mock/stats.ts`）
> 审计角色：审议模型（hy4）。**本文件是复检结论，不是改写稿。**
> 尺子：14 号提示词的交付边界（只改 R1/R2，禁碰 R3–R7）；10 号第二节硬约束；契约原文。
> 版本：v1（2026-11-16）

---

## 一、结论

**通过。前端框架代码生成阶段可以收口。** R1/R2 两处均按指令精确修复，没有夹带任何 R3–R7 改动，没有重交已通过文件。两处都是类型安全的一行级改动，静态核对无新风险。

---

## 二、逐条核对

### R1 `CaptureView.vue` 分转元除法 ✅

- import 已改为 `import { yuanToCents, centsToYuanNumber } from '../utils/money';`
- `const amountYuan = centsToYuanNumber(cents);` 替换了原来的 `cents === null ? null : cents / 100;`
- 类型核对：`cents` 来自 `yuanToCents()`，类型 `number | null`；`centsToYuanNumber` 输入 `number | null | undefined`、输出 `number | null`（10 号 RESULT §D 已确认），**签名匹配，类型安全**。
- 语义核对：`centsToYuanNumber(null) → null`，与原三元表达式行为一致，入站 `amount` 值不变。
- 全文再无 `/ 100`、`* 0.01` 等硬约束 4 违禁写法。

### R2 `basis.dateField` 取值 ✅

- `types/contract.ts`：`export type StatsBasisDateField = 'occurred_date';`（类型字面量已改）
- `mock/stats.ts`：`basis: { dateField: 'occurred_date', timezone: 'Asia/Shanghai', includeVoid: false }`（运行值已改）
- 与契约 §2.2 原文逐字一致；`timezone` / `includeVoid` 未动。

### 交付边界 ✅

- 只输出了 3 个应改文件，每个以 `// FILE:` 开头、附完整代码块，末尾有收口声明。
- **未夹带 R3–R7**：
  - R3 `contract.ts` 行数仍超限、未拆分（按要求本轮不碰，转技术债）；
  - R5 `TransactionItem.status: string` / `anomalyFlag: string | null` 保持原样；
  - R6 `Direction` 仍无 `all`；
  - R7 `DUPLICATE_RECORD` severity 未动；
  - R4（`import.ts` 推断兜底）本轮未涉及该文件。
- 11 个反馈码集合、`HttpErrorCode` 5 项、`version:1` 等上一轮通过项在本轮贴出的代码里保持不变。

---

## 三、验证层级说明（如实交代）

本轮**未做隔离目录实测**（typecheck / build / 运行时断言）。原因：R1/R2 是两处一行级、类型签名已核对的确定性改动，且 Gemini 未落盘到仓库、只在对话里贴出 3 个文件，重搭全量隔离环境复跑的边际价值低于其成本。上一轮（第二轮修正）已实测 build 通过、66 modules，本轮改动不改变模块结构。

如需绝对归档级证据，可把 15 个源文件落盘后跑一次 `vue-tsc --noEmit` + `vite build` + 两条断言（`dateField==='occurred_date'`、非 money.ts 文件无 `/ 100`）。这不是收口阻塞项。

---

## 四、转下一轮技术债（不阻塞本期）

| 项 | 摘要 | 处置 |
|---|---|---|
| R3 | `contract.ts` 247 行超 200 行约束 | 按域拆 `types/stats.ts` 等，`contract.ts` 用 `export type {...} from` 汇总 |
| R4 | `direction=null` 硬兜底 `expense`，绕过按类别 kind 推断 | 改兜底顺序为「推断类别 kind → expense」 |
| R5 | `status: string` 应为 `'confirmed'`；`anomalyFlag: string \| null` 应为 `boolean` | 收紧类型 + 种子填 `false` |
| R6 | `StatsResponse.direction` 缺 `all` | `Direction` 或统计方向类型补 `all` |
| R7 | `DUPLICATE_RECORD` severity=warning 与契约表格 blocking 冲突 | 走 `contract-change` 改契约表格为 warning，保留代码 |

---

## 五、我不确定的判断

- 作者身份仍是形式推断（3 个文件的风格、批次上下文与第二轮一致），非数字签名级证明。
- 本轮为静态审议，未验证真实 HTTP 往返（后端尚不存在）。
