# 给 Gemini：第二轮修正复检 → 定点修 R1/R2 后收口

> 用途：把下面「提示词正文」整段粘回原来的 Gemini 代码生成会话。
> 复检依据：`docs/reviews/2026-11-16-gemini-round2-fixes-audit.md`（结论：修改后通过）。
> 复检对象：第二轮修正的 10 个文件 + `mock/stats.ts`，真实安装依赖后 typecheck / build / 逐项断言全部通过。
> 性质：**定点修订，不是全量重写**。只改两处，其余一个字都不要动。
> 版本：v1（2026-11-16）

---

## 提示词正文（从下一行开始复制）

你对 Vue 3 前端框架的第二轮修正，我做了实测复检（真实安装依赖、跑 typecheck / build、逐条断言，不是看代码猜）。

**总体结论：修改后通过，禁止整体重写，也不要顺手重构任何已通过的部分。** 上一轮 4 个阻塞 + 4 个非阻塞已全部确认修复。现在只剩 **2 处定点阻塞（R1/R2）**，改完这两处就收口。

**本轮交付边界（严格遵守）：**

- 只改 R1、R2 涉及的 2 个文件（R1 是 `src/views/CaptureView.vue`，R2 是 `src/types/contract.ts` + `src/mock/stats.ts`）。
- **不要**改 R3–R7（行数、推断兜底、字段类型过宽、direction=all、severity）——那些是下一轮技术债或需 reviewer 裁决，本轮一律不碰。
- **不要**重新输出已经通过的 10 个文件，不要「顺便优化」，不要调整格式、命名或任何注释。
- 每个要改的文件仍以 `// FILE: <完整路径>` 开头，后接**完整代码块**，不许写「同上」「略」「改这一行即可」。

---

### R1（阻塞）`CaptureView.vue` 手写 `cents / 100`，违反硬约束 4

你在 `src/views/CaptureView.vue:36` 写的是：

```ts
const cents = yuanToCents(amountInput.value);
const amountYuan = cents === null ? null : cents / 100;
```

10 号提示词硬约束 4 明文规定：**分转元的除法只能出现在 `utils/money.ts`**，其它文件出现 `cents / 100`、`/ 100`、`* 0.01` 即违规。而 `utils/money.ts` 已经导出了 `centsToYuanNumber()` 专门做这件事，你没有调用它。

**改法**：把 import 与这一行改成——

```ts
import { yuanToCents, centsToYuanNumber } from '../utils/money';

const cents = yuanToCents(amountInput.value);
const amountYuan = centsToYuanNumber(cents);
```

`centsToYuanNumber(null)` 的既有行为保持不动，不要在 `money.ts` 里改任何东西。

（责任说明：`cents / 100` 这一行在更早的版本就存在，是我上一轮复检漏审，不是你本轮新引入的。但按项目尺度硬约束违规必须修正，所以本轮一起改掉。）

---

### R2（阻塞）`basis.dateField` 的取值与契约不符

你在 `src/types/contract.ts:8` 定义：

```ts
export type StatsBasisDateField = 'occurredAt';
```

`src/mock/stats.ts` 的实测输出是：

```json
"basis": { "dateField": "occurredAt", "timezone": "Asia/Shanghai", "includeVoid": false }
```

但契约 `docs/contracts/module2-interface-v1.md` §2.2 的原文是：

```jsonc
"basis": { "dateField": "occurred_date", "timezone": "Asia/Shanghai", "includeVoid": false }
```

上一轮我指出 `meta` 结构漂移，你修了结构，但 `dateField` 的**取值**仍按自己的命名。契约字段名以 `occurred_date` 为准。

**改法**：类型字面量与运行值同时改——

1. `src/types/contract.ts`：`export type StatsBasisDateField = 'occurred_date';`
2. `src/mock/stats.ts`：`basis` 对象里 `dateField: 'occurred_date'`

`timezone` 保持 `'Asia/Shanghai'`、`includeVoid` 保持 `false`，都不要动。

---

### 三、改完后的自查（逐条在心里过，只输出最终结果）

1. 全局搜 `cents / 100`、`/ 100`、`* 0.01`，除 `utils/money.ts` 外应为 0 处。
2. 全局搜 `occurredAt` 作为 `dateField` 取值应为 0 处；`dateField: 'occurred_date'` 与类型字面量一致。
3. 只输出了 R1、R2 涉及的完整文件代码块，没有重交其它文件、没有改 R3–R7。

### 四、本轮输出格式

- 依次输出 3 个文件：`// FILE: src/views/CaptureView.vue`、`// FILE: src/types/contract.ts`、`// FILE: src/mock/stats.ts`（每个都是完整代码块）。
- 末尾写一行「R1/R2 定点修正完成，未改动其它文件」，然后停下，不要继续。

（提示词正文结束）
