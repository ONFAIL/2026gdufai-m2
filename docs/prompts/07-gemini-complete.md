# 给 Gemini：最后一道加固 + 做完剩余全部代码

> 用途：把下面「提示词正文」整段粘回同一个 Gemini 会话。这是收尾指令，取代 05 号提示词第四节「等我回复继续」的节奏。
> 前提：会话里已有修订版方案、契约原文、05 号代码生成提示词，以及第 1 批代码与它的修正贴片。
> 版本：v1（2026-11-16）

---

## 提示词正文（从下一行开始复制）

第 1 批修正通过。现在做最后一道加固，然后把剩余代码全部做完。这是收尾指令：**从现在起连续输出，不要每批停下来等我回复「继续」。**

### 〇、先做加固：`datetime.js` 加无时区兜底

第 1 批已把常量改名为 `shanghaiOffsetMs`、DOM 顺序也对调好了，这些保持不动。只补一处防御：现在 `formatDisplayDateTime()` 和 `formatDisplayDate()` 内部直接 `new Date(str)`，若收到不带时区后缀的 ISO 串（初学者手搓 mock 时最容易漏），会随浏览器时区漂移——实测在 `TZ=UTC` 下 `09:12` 会变成 `17:12`，`23:50` 还会跨日错一天。契约保证后端不返回这种串，但加一道兜底更稳。

**第 1 步**：在 `localInputToIsoOffset()` 之后、`currentShanghaiDate()` 之前，新增这个函数（JSDoc 照写）：

```js
/**
 * 将无时区后缀的 ISO 时间串按东八区补齐 +08:00，带时区的串原样返回。
 * 防止 new Date(str) 在浏览器处于其他时区时把本地时间误当成东八区时间。
 * @param {string} str ISO-8601 时间串
 * @returns {string} 带 +08:00 的 ISO-8601 时间串
 */
function normalizeIsoOffset(str) {
  if (/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2})?$/.test(str)) {
    return localInputToIsoOffset(str) || str;
  }
  return str;
}
```

**第 2 步**：只改这两个函数的解析调用，其余一行不动：

- `formatDisplayDateTime()`：`const p = getShanghaiParts(new Date(normalizeIsoOffset(isoStr)));`
- `formatDisplayDate()`：`const p = getShanghaiParts(new Date(normalizeIsoOffset(trimmed)));`

`token.css`、`components.css`、`money.js` 不要重贴；`datetime.js` 贴**加固后的完整全文**（约 145 行，仍 ≤ 200 行）。

### 一、然后连续产出第 2–5 批

按 05 号提示词第四节的顺序和 `// FILE:` 格式，依次产出：

| 批次 | 文件 |
| --- | --- |
| 第 2 批 | `ui.js`、`api.js`、`mock/db.js`、`partials/nav.html` |
| 第 3 批 | `index.html`、`transactions.html`、`stats.html`、`budget.html`、`pages.css`、`start.bat` |
| 第 4 批 | `pages/capture.js`、`pages/transactions.js`、`chart-bar.js`、`chart-ratio.js` |
| 第 5 批 | `pages/stats.js`、`pages/budget.js`、4 个 `page-*.css` |

**每批末尾写一行「第 N 批完成，共 5 批」，然后立刻发下一批，不要停下等确认。** 若单次回复长度受限，可分多条消息连续发送，但每条只含完整批次，批与批之间不要插入解释或等待语句。每个文件都要完整代码，不许「同上」「略」「按方案实现」。

### 二、贯穿全部批次的硬约束（逐条对照，违反即返工）

以下是前几轮反复确认过的点，现在集中列一次，写每批时都过一遍：

1. **伪接口禁止**：不得出现 `/api/transactions/{id}/confirm`。契约只有 `POST /api/transactions/import`，确认入库由响应的 `status=confirmed` 表达。
2. **`fetch` 唯一出口**：全站只有 `api.js` 的 `request()` 里能出现 `fetch`；`ui.js` 加载导航走 `api.js` 的 `loadNavPartial()`。
3. **不许 `innerHTML` 拼用户数据**：`ui.js` 用 `DOMParser` 解析静态 `nav.html`，动态节点一律用 `h()` 建；商户名、`rawText`、类别名只走文本节点。
4. **返回形状**：`GET /api/categories` 和 `GET /api/budgets` **直接返回数组**，不许 `{ items: [...] }` 包裹，mock 分支与真实分支形状必须一致；账单的游标在 `res.page.nextCursor`，不在顶层。
5. **金额与时间**：入站 `records[].amount` 用**元**（唯一例外），其余展示/统计全用 `*Cents` 整数；`cents / 100` 只在 `money.js`。所有时间戳显式带 `+08:00`，不许 `toISOString()`；`mock/db.js` 的 `sentAt`/`occurredAt`/`chatAt`/`generatedAt` 必须带 `+08:00`，`occurredDate`/`range.start`/`range.end`/`buckets[].period` 用 `YYYY-MM-DD`。
6. **命名**：`useMock` / `codeMessageMap` 等 JS 标识符一律 camelCase，不许全大写下划线常量；文件名 kebab-case。保留 `pages/capture.js` 这个名字（`index.html` 已引用），不要新建 `pages/index.js` 造成双入口。
7. **代码风格**：不许 `class`、`.map()/.filter()/.reduce()` 链式、`Proxy`、生成器；单文件 ≤ 200 行（含注释）；导出函数有 JSDoc。
8. **CSS**：颜色与间距只用 `var(--xxx)`；类别色用行内 CSS 自定义属性 `--cat-color` 注入，不写死进 CSS 文件。
9. **反馈码**：`feedback[].code` 只有 11 个，`UNAUTHORIZED`/`INVALID_BATCH` 是 §2.6 的 `error.code`，**不得混进 `feedback[]`**。
10. **Toast 类名**：以第 1 批 `components.css` 为准——`.toast-container` / `.toast-item` / `.toast-error` / `.toast-success`。不许带回旧 `ui.js` 的 `.toast-stack` / `.toast` / `is-visible`。
11. **状态与分页**：`duplicate` 静默按成功处理并复用 `transactionId`，禁止「仍要提交」按钮；`rejected` 给手动补录出口；`blocking` 阻断给修正表单、`warning` 只提示可确认；`hasMore === false` 或 `nextCursor === null` 时隐藏「加载更多」。
12. **键盘可达**：第 3 批 `index.html` 里 `input.sr-only` 必须放在 `label.file-btn` **之前**（第 1 批贴片顺序），否则焦点样式失效；`transactions.html` 的表格要包一层 `.table-wrap`。
13. **空态与加载态**：`meta.isEmpty === true` 或空数组时显示空态文案（不写「0 元」），加载中渲染 `.skeleton` 并隐藏空态，两者严格互斥；请求失败给带「重试」按钮的 Toast，复用同一个 `api.js` 方法。

### 三、写完的自查（逐条在心里过，不输出）

1. 有 `fetch` 吗？只在 `api.js`。
2. 有 `innerHTML` 吗？没有（`DOMParser` 解析静态模板不算拼接用户数据）。
3. 有字面 `#RRGGBB` 或裸 `px` 间距在 CSS 吗？没有。
4. 有 `class`、链式高阶、`toISOString()`、全大写下划线常量吗？没有。
5. 字段名与 05 号第五节对得上吗？`feedback[]` 里没有 HTTP 错误码吗？
6. 有哪个 JS 文件超 200 行吗？
7. 第 1 批那三个没改的文件被误重贴了吗？

（提示词正文结束）
