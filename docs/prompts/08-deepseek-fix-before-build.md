# 交给 DeepSeek 落地成网站前 · 必改清单

> 用途：把下面「提示词正文」粘给负责落地成网站的 DeepSeek 会话，连同 Gemini 的完整代码一起给它。
> 来源：对 Gemini 第 1–5 批代码的实际检查（mock 逻辑跑通、边界实测、静态扫描）。
> 版本：v1（2026-11-16）

---

## 提示词正文（从下一行开始复制）

你拿到的这份前端代码（Gemini 产出）整体结构正确、可以直接作为地基，但我在交付前实测发现了 1 处硬约束违反和 5 处会导致页面显示错误或交互失效的问题。请**逐条按下表修复后再落地**，不要重写整个项目，也不要改动表里没提到、已经正确的部分。

### 必改清单

| # | 严重度 | 文件 | 问题（含实测证据） | 要怎么改 |
| --- | --- | --- | --- | --- |
| 1 | **阻塞** | `assets/js/pages/capture.js` | 实测 243 行（我落盘压缩后仍 243 行），**超过团队硬约束「单个 JS 文件 ≤ 200 行」**。Gemini 自检第 12 条声称「全站均不超过 200 行」，与事实不符。 | 按职责拆分：`buildFollowupForm()`（追问表单构造，约 80 行）单独抽到 `assets/js/pages/followup-form.js` 并 export，`capture.js` 改为 import；拆完两个文件都要 ≤200 行，并给新文件补 JSDoc。不许放宽上限。 |
| 2 | 高 | `start.bat`（Gemini 版本） | 启动顺序反了：先 `start "" "http://127.0.0.1:8080/index.html"` 再 `python -m http.server 8080`。浏览器打开时服务器尚未监听，用户首屏会看到「无法连接」，必须手动刷新。且 8080 端口与项目现有 `start.bat`（5173 + `py -3` 多重 fallback + `chcp 65001` 防中文乱码）冲突。 | **不要覆盖项目里现有的 `start.bat`**，保留 5173 版本。如果必须重制，把服务器启动放在 `start` 之前，并加 `py -3 -m http.server 5173` 的多重 fallback 和 `chcp 65001`。 |
| 3 | 高 | `mock/db.js` → `mockGetStats` | 实测 recent7 数据自相矛盾：`summary.count = 4`，但 7 个桶的 `count` 合计 = 5（11-12/11-14/11-15/11-16 支出 4 笔 + 11-10 收入 1 笔）。页面上 KPI 显示「4 笔」而图表有 5 个非空桶，对不上。 | 把 `summary.count` 改为 5，与桶合计一致。 |
| 4 | 高 | `assets/js/pages/capture.js` → `extractHintAmount()` | 实测：契约原文示例文本「早上瑞幸花了32块5」被解析成 **32**（丢了尾数 5），而契约要求 `amount = 32.5`。中文口语「X块Y」表示 X.Y 元，正则 `(\d+(?:\.\d{1,2})?)\s*(?:元\|块)` 匹配到「32块」就停了。 | 增加对「数字+块+尾数」形态的处理：`32块5` → `32.5`。或更稳妥：前端**不做金额提取**，一律传 `null` 交给后端识别（契约 §1.3 明确「识别不出传 null，不要猜」），避免与后端结果冲突。二选一，说明选了哪个。 |
| 5 | 中 | `mock/db.js` → `mockGetStats` | month 维度的 `buckets[0].period = '2026-11-01'`，契约 §2.2 原文示例是 `'2026-11'`。`chart-bar.js` 里用 `String(b.period).slice(-5)` 取标签，「2026-11-01」会显示成「11-01」。 | 把 month 桶的 `period` 改成 `'2026-11'`，并同步把 `chart-bar.js` 的标签逻辑改为按维度取末段（month 取 `'2026-11'`，recent7/day 取 `'MM-DD'`），不要用固定 `slice(-5)`。 |
| 6 | 中 | `mock/db.js` → `mockImportTransactions` | 实测：`DUPLICATE_RECORD` 这个反馈码**在任何输入下都不会产生**——含「重复」的文本直接返回 `status='duplicate'`（静默成功）。但前端 `buildFollowupForm()` 里有专门的 `DUPLICATE_RECORD` 阻断分支（改商户后重发），这段代码永远演示不到。契约里两者是不同语义。 | 增加一个测试入口：当 `rawText` 含「疑似重复」之类的标记时，返回 `status='pending_followup'` + `feedback:[{code:'DUPLICATE_RECORD',severity:'blocking'}]`，让前端阻断分支可演示。同时保留原有「重复」→ `duplicate` 静默成功的用例。 |

### 已经检查通过、不要改动的部分

- **契约形状**：`categories` / `budgets` 直接返回数组（无 items 包裹）；账单 `nextCursor` 在 `res.page` 里；item 主键 `id`、金额 `amountCents`；`summary.topCategory` 用 `categoryId`+`name`。全部与契约一致。
- **状态流转**：`confirmed` / `duplicate` / `rejected` / `pending_followup` 四种都实测可达；`rejected` 走 `REFUND_NOT_SUPPORTED`，缺字段走 `MISSING_AMOUNT`/`MISSING_DIRECTION`/`MISSING_TIME`，正确。
- **分页**：游标翻页无重复、无遗漏，`hasMore`/`nextCursor` 判断正确。
- **模块路径**：所有 `import` 相对路径可达，无循环依赖；语法检查全部通过。
- **XSS 与请求出口**：全站 `fetch` 只在 `api.js`；无 `innerHTML` 拼用户数据；`h()` 用文本节点注入，正确。
- **键盘可达**：`index.html` 里 `input.sr-only` 已在 `label.file-btn` 之前，`.sr-only:focus + .file-btn` 生效。
- **时间**：`normalizeIsoOffset()` 兜底已加入，`+08:00` 全程正确。

### 落地后的验收动作

1. 双击 `start.bat`，确认浏览器**首次打开就能看到页面**（不需要手动刷新）——验证第 2 条。
2. 在记账页输入契约示例「早上瑞幸花了32块5」，确认追问/回执里的金额符合你选的方案——验证第 4 条。
3. 进统计页切「近 7 日」，确认 KPI「笔数」与图表非空桶数量一致、X 轴标签是 `MM-DD`——验证第 3、5 条。
4. 输入含「疑似重复」的文本，确认出现红色阻断卡片且可以改商户后重发——验证第 6 条。
5. 统计所有 JS 文件行数，确认每个 ≤ 200——验证第 1 条。

（提示词正文结束）
