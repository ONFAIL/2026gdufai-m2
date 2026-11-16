# 给方案模型（Gemini）的代码生成指令

> 用途：方案经 hy4 两轮审议「通过」后，让同一个 Gemini 会话按方案产出**可落地的全部前端代码**。
> 前提：该会话里已有你上一轮的修订版方案（A–G + 自检）、01 提示词第三节的契约原文、以及本文。三份齐了再开始。
> 版本：v1（2026-11-16）

---

## 提示词正文（从下一行开始复制）

你的纯前端方案已通过独立审议（结论：通过，12 条修订全部关闭）。现在按这份方案**产出全部代码**。

这是实现，不是方案复述：要的是能直接存成文件、双击 `start.bat` 就能跑的代码，不是骨架片段、不是伪代码、不是「此处省略」。

### 〇、三项最高优先级（冲突时按此顺序裁决）

1. **契约原文 > 你的方案 > 仓库现有代码。** 字段名、枚举、返回形状以你原会话「三、已知接口」为准。方案与契约冲突，改方案；现有代码与两者冲突，扔掉现有代码。
2. **仓库 `frontend/` 里已有一版旧实现，它大量违反约束，禁止照抄。** 它只提供目录结构，不提供任何实现范式。下面第二节列了必须清除的违规点，逐条对照。
3. **既有文件名不得重命名**（约束 3）。方案 C 节里与现状不符的文件名，按第二节校正后再写。

### 一、产出范围

`frontend/` 下全部文件，按 C 节「新增与修改清单」逐项产出。共约 20 个文件，分 5 批交付（见第四节）。

### 二、仓库现状校正（最容易踩的坑，先读）

你手上可能有一份旧 `frontend/` zip。以下是它与目标方案的差异，**按右栏执行**：

| 项目 | 旧代码现状 | 本次要怎么做 |
| --- | --- | --- |
| 记账页入口 JS | `assets/js/pages/capture.js`，`index.html` 已引用它 | **保留 `capture.js` 这个文件名**（约束 3 禁止重命名）。方案 C 节写的 `pages/index.js` 是笔误，不要新建，避免双入口。若你重写 HTML，`<script src>` 仍指向 `capture.js`。 |
| 页面 CSS | 只有 `assets/css/pages.css`，4 页 HTML 都只引它 | 方案新增 `page-index.css` 等 4 个文件以隔离并行冲突。改：每页 HTML 只引自己的 `page-*.css`，`pages.css` 只留 `.page-container` 共用栅格。别让两个文件重复定义同一选择器。 |
| `api.js` | `const USE_MOCK = true`、`class ApiError`、大量 `.filter().map().reduce()` 链式调用 | 改为 `useMock`（camelCase）、去掉 class 用普通对象、链式高阶函数改成 `for` 循环（约束 12）。**全站唯一 `fetch` 就在这个文件的 `request()` 里。** |
| `api.js` 的伪接口 | 有 `confirmRecord()` 调 `POST /api/transactions/${recordId}/confirm` | **删除。契约里没有这个接口**，只有 `/api/transactions/import`。确认入库是后端的 `status=confirmed`，前端不另调接口。 |
| `api.js` 的返回形状 | `getCategories()` 返回 `{ items: [...] }`；`getBudgets()` 返回 `{ month, items }`；`listTransactions()` 顶层返回 `nextCursor` | 契约要求：`/api/categories` 和 `/api/budgets` **直接返回数组，无 items 包裹**；账单的 `nextCursor` 在 `res.page.nextCursor` 里，不在顶层。mock 分支和真实分支必须同形状。 |
| `api.js` 的时间 | `sentAt: new Date().toISOString()` | 改为显式拼 `+08:00`（走 `datetime.js` 的 `nowIsoOffset()`），`toISOString()` 输出 UTC `Z` 违反约束 5。 |
| `api.js` 的 import 请求体 | 只发 `rawText`/`modality`/`idempotencyKey` | 按契约 §1.2 发全：`version:1`、`batchId`、`sentAt`、`records[]`（`recordId`/`userId`/`direction`/`amount`/…/`idempotencyKey`）。识别不出传 `null`，不要传 `0` 或空串。金额这里是**元**，唯一的例外。 |
| `ui.js` | `initLayout()` 里直接 `fetch('partials/nav.html')` + `innerHTML = await res.text()` | 违反约束 9 和 13。导航请求移到 `api.js` 的 `loadNavPartial()`；`ui.js` 用 `DOMParser` 解析后用 `h()` 注入，**不许 innerHTML**。函数名按方案：`injectNav` / `showToast` / `renderEmptyState`。 |
| `mock/db.js` | 字段与契约不符（`categoryId` 平铺等） | 严格按契约 3.1–3.4 重造，含 `pending_followup`、`duplicate`、空月、超支、异常账单用例。mock 里的 `results[]` 不是 `records[]`；**不要出现 `followupRound`**，前端不传轮次。 |
| DOM 的 id | 旧 HTML 用 `#chat-body`/`#chat-text` | 以方案 B 节为准（`#chat-stream`/`#chat-form`/`#filter-form`…）。整页重写 HTML，别在旧 DOM 上打补丁。 |

### 三、每个文件的硬要求

- **单文件 ≤ 200 行**（含注释）。超了就按 C 节拆模块，不要申请放宽。
- 每个导出函数写 JSDoc（一句话说明 + 关键参数）。
- 不用 `class`、不用 `.map()/.filter()/.reduce()` 链式、不引入任何库。
- CSS 颜色与间距只用 `var(--xxx)`；类别色是接口返回的，用行内 CSS 自定义属性注入，不写死进 CSS 文件。
- 动态 DOM 一律 `h()`；用户数据（商户、`rawText`、类别名）只走文本节点。
- 金额：入站 `amount` 用元；其余展示/统计用 `*Cents` 整数；`cents / 100` 只出现在 `money.js`。
- 时间：一律 `+08:00`；缺省渲染 `—`；不写 `¥0.00`，不写「未知」。
- 分页：请求只传 `cursor`/`limit`；`hasMore === false` 或 `nextCursor === null` 时隐藏「加载更多」。
- 反馈展示：`blocking` 阻断并给修正表单，`warning` 只提示可确认；`rejected` 给手动补录出口；`duplicate` 静默按成功处理。

### 四、分批与输出格式

一次最多输出一批，避免超长被截断。**严格按此顺序**：

| 批次 | 文件 |
| --- | --- |
| 第 1 批 | `tokens.css`、`components.css`、`money.js`、`datetime.js` |
| 第 2 批 | `ui.js`、`api.js`、`mock/db.js`、`partials/nav.html` |
| 第 3 批 | `index.html`、`transactions.html`、`stats.html`、`budget.html`、`pages.css`、`start.bat` |
| 第 4 批 | `pages/capture.js`、`pages/transactions.js`、`chart-bar.js`、`chart-ratio.js` |
| 第 5 批 | `pages/stats.js`、`pages/budget.js`、4 个 `page-*.css` |

每个文件用一行标注开头，再跟一个完整代码块：

```text
// FILE: frontend/assets/js/money.js
```js
…完整代码…
```
```

规则：
- 每批结束写一行「第 N 批完成，共 5 批」。等我回复「继续」再发下一批，不要自作主张一次发完。
- 不许写「同上」「略」「按方案实现」——每个文件都要完整代码。
- 不要在代码外长篇解释；每个文件最多两句说明其关键决策。

### 五、契约形状速查（写 mock 和 api.js 时对着核）

- `POST /api/transactions/import` 请求：`{ version, batchId, sentAt, records:[{ recordId, userId, direction, amount(元), merchant, occurredAt, chatAt, rawText, modality, sourceRef, confidence, idempotencyKey }] }`
- 响应：`{ batchId, results:[{ recordId, status, transactionId, direction, occurredAt, category:{id,name,kind}, confidence, feedback:[{field,code,severity}] }] }`
- `status`：`confirmed` / `pending_followup` / `duplicate` / `rejected`
- `feedback[].code` 共 11 个，别把 `UNAUTHORIZED`/`INVALID_BATCH` 混进来（那是 `error.code`）
- `GET /api/categories` → **数组**
- `GET /api/budgets?month=` → **数组**，元素含 `level: normal|near|over`
- `GET /api/stats` → `{ dimension, range, direction, summary, buckets, meta }`，`summary.topCategory` 用 `categoryId`+`name`
- `GET /api/transactions` → `{ filter, summary, items, page:{limit,hasMore,nextCursor}, meta }`，项主键是 `id`、金额是 `amountCents`
- 错误 → `{ error:{ code, message, field } }`

### 六、每批写完的自查（逐条在心里过，不输出）

1. 有 `fetch` 吗？只在 `api.js`。
2. 有 `innerHTML` 吗？没有（`DOMParser` 解析静态模板不算拼接用户数据）。
3. 有字面的 `#RRGGBB` 或裸 `px` 间距在 CSS 吗？没有。
4. 有 `class`、链式高阶、`toISOString()` 吗？没有。
5. 字段名和上面第五节对得上吗？
6. 有哪个 JS 文件超 200 行吗？

（提示词正文结束）
