# 给 Gemini：第 1 批代码复检 → 定点修正指令

> 用途：把下面「提示词正文」整段粘回原来的 Gemini 代码生成会话。
> 复检依据：02 号审议提示词 v2（13 条硬约束 + 契约原文）＋ Gemini 在修订说明里已逐条接受的 12 项要求。
> 复检对象：第 1 批 `tokens.css` / `components.css` / `money.js` / `datetime.js`。
> 版本：v1（2026-11-16）

---

## 提示词正文（从下一行开始复制）

你正在延续上一轮的代码生成任务。我对第 1 批代码按最初的 13 条硬约束、`docs/contracts/module2-interface-v1.md` 契约原文，以及你在修订说明里逐条接受的 12 项要求做了复检。

**总体结论：第 1 批整体正确，禁止整体重写。** 下面只列必须改的 2 处和必须遵守的 3 条跨批约定；没有列出的代码、样式、注释一律保持原样，不要顺手「优化」。

### 一、本轮必须修正（2 处）

#### 修正 1 — `components.css` 焦点选择器选不中已定 DOM，键盘焦点不可见

原文（你第 1 批写的）：

```css
.sr-only:focus + .file-btn,
label:focus-within {
  outline: var(--unit-2) solid var(--color-primary);
  outline-offset: var(--unit-2);
}
```

你修订说明 B3 的原话是「移除 `hidden` 属性改用 `.sr-only` 视觉隐藏类，保留原生键盘焦点」。但你在修订版方案 B 节 1 定的 DOM 顺序是：

```html
<label for="media-file-input" class="file-btn">附件</label>
<input id="media-file-input" name="mediaFile" type="file" accept="audio/*,image/*" class="sr-only" />
```

- `+` 是相邻兄弟选择器，要求 `.sr-only` 在前、`.file-btn` 紧跟其后；实际 `.sr-only` 后面是 `#send-btn`。
- `label:focus-within` 要求 input 是 label 的**后代**；实际两者只是靠 `for` 关联的兄弟。

后果：元素能 Tab 到，但没有任何可见焦点轮廓，B3 只完成一半。

**改法（改动最小的一版）**：把第 3 批 `index.html` 里这两行**对调顺序**——`input.sr-only` 在前、`label.file-btn` 在后，`for` / `id` 全部不变。现有 CSS 立即生效，视觉顺序不变（input 是 1px 隐藏的）。`components.css` 不用改。

> 如果你选择改 CSS 而不是改 DOM，必须说明新选择器如何在 label 在前的结构里生效；不要两处都改。

修正后请在回复里贴出第 3 批 `index.html` 该片段的最终 DOM 顺序，便于核对。

#### 修正 2 — `datetime.js`：`SHANGHAI_OFFSET_MS` 与你自己已接受的 camelCase 口径冲突

原文（你第 1 批写的）：

```js
const SHANGHAI_OFFSET_MS = 8 * 60 * 60 * 1000;
```

你在修订说明 N5 写的是「将常量重命名为 `useMock` 与 `codeMessageMap`，使全部 JS 变量名统一符合 `camelCase`」，并在修订版自检第 11 条写「JS 变量与函数（含 `useMock`、`codeMessageMap`）全部使用 `camelCase`」。这个新常量是全大写下划线，与已交付口径不一致。

说明：**这不违反 13 条硬约束里的命名条款**（该条款只约束 JSON 字段和文件/目录名），违反的是你自己接受并写进自检的口径。既然 N5 已选了「改实例」而不是「给常量开例外」，就贯彻到底。

**改法**：把 `SHANGHAI_OFFSET_MS` 改名为 `shanghaiOffsetMs`，并同步替换文件内所有引用处；JSDoc 不用改。同时自查第 1 批其余 JS 标识符（含 `pad2`、`getShanghaiParts`、`yuanToCents` 等），确认没有第二处全大写下划线标识符。

### 二、跨批约定（本轮不要动代码，后续批次必须照做）

1. **Toast 类名以第 1 批 CSS 为准**：`components.css` 定义的是 `.toast-container` / `.toast-item` / `.toast-error` / `.toast-success`。第 2 批 `ui.js` 必须产出这套类名。**不要**沿用仓库旧 `ui.js` 里的 `.toast-stack` / `.toast` / `is-visible`，否则所有 toast 裸奔无样式。
2. **`mock/db.js` 的时间字段一律带 `+08:00`**：`sentAt` / `occurredAt` / `chatAt` / `generatedAt` 必须用 `2026-11-16T09:30:00+08:00` 这种带偏移的字符串；`occurredDate` / `range.start` / `range.end` / `buckets[].period` 用 `YYYY-MM-DD`。原因：`datetime.js` 的 `formatDisplayDateTime()` 内部用 `new Date(isoStr)` 解析，无时区的字符串会随浏览器所在时区漂移。
3. **第 3 批 `transactions.html` 的表格要包一层 `.table-wrap`**：`components.css` 已定义 `.table-wrap { overflow-x: auto }`，但修订方案 B 节 2 的 table 没有这个父容器。不加的话窄屏下表格无法横向滚动。

### 三、明确保留（复核通过，不要改）

- `tokens.css`：颜色/间距/尺寸/字号全部为 `var(--xxx)` 唯一来源，定义 `#hex` 与 `px` 正确。
- `components.css`：除修正 1 提到的选择器外，所有声明只引用变量；`.skeleton` / `.is-loading` / `.sr-only` / `--cat-color` 插槽符合修订要求 B2/B3。
- `money.js`：`cents / 100` 只在本文件；`null/undefined/NaN → —`；`0 → ¥0.00` 保留（`recent7` 空日补 0 需要），正确。
- `datetime.js`：`getShanghaiParts` + UTC getter + 固定 `+08:00`，不使用 `toISOString()`；`T12:00:00+08:00` 兜底符合契约 §1.3。
- 三个 JS 文件均 ≤ 200 行、JSDoc 齐全、无 `class` / 链式高阶 / `fetch` / `innerHTML`。

### 四、交付格式

- 本轮只输出**被修改的文件**（预期：`datetime.js` 全文 + 第 3 批 `index.html` 中那一段 DOM 的贴片）；`tokens.css` / `components.css` / `money.js` 不要重贴。
- 每个文件仍以 `// FILE: <完整路径>` 开头，后接完整代码块；贴片要标明属于哪个文件。
- 末尾写一行「第 1 批修正完成」，然后停下等我回复「继续」，再进入第 2 批。
- 如果你认为上面某条判断错了，必须引用契约原文或 13 条约束中的具体编号来反驳，不要沉默跳过，也不要半改半不改。

（提示词正文结束）
