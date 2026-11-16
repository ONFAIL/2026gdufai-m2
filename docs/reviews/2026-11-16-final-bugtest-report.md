# 最终版前端框架 · Bug 测试报告

> 测试时间：2026-11-16 21:50 GMT+8
> 测试对象：Gemini 三轮交付的最终版（第二轮修正 + R1/R2 定点修正），共 23 个源码文件。
> 测试方式：隔离目录 `gdufai-vue3-final`（由 `gdufai-vue3-round2` 副本覆盖 R1/R2 三处修正得到），真实 `npm install` 依赖后实跑。
> 环境：Node v22.22.2 / npm 10.9.7 / vite 6.4.6 / vitest 3.2.7 / vue-tsc 2.2.x。**不是静态看代码猜。**
> 代码状态：**未入库**，仅隔离测试；是否合并由 reviewer 拍板。

---

## 一、总评

**全部通过，未发现功能性 bug。** typecheck、build、31 条断言（含 R1/R2 专项、硬约束静态扫描、金额精度、时间归一化、状态机回归、响应形状）全绿。唯一命中项是已知技术债 **R3（`contract.ts` 248 行 > 200）**，按上一轮审议约定本轮不阻塞。

| 检查项 | 结果 |
|---|---|
| `npx vue-tsc --noEmit` | ✅ 退出码 0 |
| `npx vite build` | ✅ 成功，66 modules，css 10.07 kB / js 119.79 kB |
| `npm test`（vitest） | ✅ 2 文件 / **31 tests 全过** |
| R1/R2 专项 | ✅ 4 条断言全过 |
| 硬约束静态扫描 | ✅ fetch 仅在 request.ts；无 v-html/innerHTML/enum/toISOString；违禁除法 0 处 |
| 已知技术债 | ⚠️ `contract.ts` 248 行（R3，不阻塞） |

---

## 二、R1/R2 修正实测确认

- **R1**：`CaptureView.vue` 第 7 行 `import { yuanToCents, centsToYuanNumber }`，第 36 行 `const amountYuan = centsToYuanNumber(cents);`。`centsToYuanNumber` 签名 `number | null | undefined → number | null`，与 `cents`（`number | null`）匹配。全目录扫描 `cents / 100` / `* 0.01` **0 处**。
- **R2**：`contract.ts` 类型字面量 `'occurred_date'`、`stats.ts` 运行值 `'occurred_date'`，实测 `mockGetStats().meta.basis.dateField === 'occurred_date'` 通过；`timezone='Asia/Shanghai'`、`includeVoid=false` 一并确认。

---

## 三、逐类测试结果

### 3.1 金额工具（6 条）
- 元→分→元往返：`0 / 0.01 / 24.5 / 99.99 / 100 / 1234.56` 全部无精度漂移（`toBeCloseTo` 2 位）。
- 非法输入：`''` / `'-5'` / `'abc'` → `null`；`'0'` → `0`；`formatCents(null)='—'`、`formatCents(0)='¥0.00'`、`toYuanInput(null)=''`。真 0 与缺失可区分。

### 3.2 时间归一化（1 条）
- 无偏移 `2026-11-16T12:00:00` → `...+08:00`；`Z` 结尾 `2026-11-16T04:00:00Z` → `2026-11-16T12:00:00+08:00`，无 `Z` 残留。

### 3.3 入站状态机（7 条）
- 反馈码集合 11 个与契约**全等**（不多不少）。
- `direction=null` → `pending_followup + MISSING_DIRECTION`。
- `duplicate`：第二次提交 `status=duplicate`、复用同一 `transactionId`、反馈码 `DUPLICATE_RECORD`、`severity=warning`，按成功处理不报错。
- 满 3 轮永久 `rejected`：实测 `pending_followup → pending_followup → rejected → rejected → rejected`，第 4/5 轮不复活（原 P0 死循环已消除）。
- 退款/负数 → `rejected + REFUND_NOT_SUPPORTED`。
- 收入方向推断到 `{id:9, name:'工资', kind:'income'}`（无硬编码 ID）。

### 3.4 响应形状（5 条）
- 统计：`range={start,end}`、`summary` 键全等、`buckets[].categories` 存在非空桶且字段 `kind/custom/count/ratio/totalCents` 齐全（原 P0 恒空已消除）、`meta.unit='cent'`。
- 账单：`filter={categoryId,from,to,direction}`、item 含 `occurredDate/sourceModality/anomalyFlag`。
- 预算：`{scope,category,amountCents,spentCents,remainingCents,usageRatio,level}` 键全等。
- 色值：11 个预设类别色值与契约逐字全等，`isPreset/isActive` 齐全。

### 3.5 硬约束静态扫描（6 条）
- `fetch(` 仅出现在 `api/request.ts`。
- `.vue` 无 `v-html` / `innerHTML`。
- 无 `enum`、无 `toISOString()`。
- 单文件行数：除 `contract.ts`（248，R3 技术债）外全部 ≤ 200。

---

## 四、实测输出样本（可复核）

```text
STATS meta= {"unit":"cent","basis":{"dateField":"occurred_date","timezone":"Asia/Shanghai","includeVoid":false},"generatedAt":"2026-11-16T21:50:25+08:00","isEmpty":false}
B1 反馈码数量= 11 | 与契约集合全等= true
B4 色值全等= true
追问轮次状态: pending_followup → pending_followup → rejected → rejected → rejected
Test Files  2 passed (2)
     Tests  31 passed (31)
```

---

## 五、结论与建议

1. **功能层面可以入库**：31 条断言覆盖契约核心口径全过，无阻塞 bug。
2. **入库前建议二选一**：
   - (a) 直接合并，把 R3–R7 登记为技术债下一轮处理；
   - (b) 先让 Gemini 做 R3（`contract.ts` 按域拆分到 `types/stats.ts` 等）再合并，一次性满足 200 行约束。
3. **不入库也无损**：测试全部在隔离目录完成，仓库当前状态未被改动。
4. R7（`DUPLICATE_RECORD` severity=warning vs 契约表格 blocking）是契约自身矛盾，需走 `contract-change`，不是代码 bug。

---

## 六、测试局限（如实交代）

- 作者身份仍为形式推断，非数字签名级证明。
- 后端尚不存在，所有「与契约一致」判断基于 mock 运行时输出与代码形状，不等于真实 HTTP 往返一定正确。
- 测试套件 `bugtest.test.ts` / `verify2.test.ts` 目前只在隔离目录，**未随本报告入库**；如需回归资产，请在决定入库时一并移入 `frontend/`。
