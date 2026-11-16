# frontend · 纯 HTML 前端骨架

零构建、零第三方依赖。四个页面共 13 个 JS 文件，每个 ≤200 行。

## 怎么跑

Windows 双击 `start.bat`（服务先起，浏览器 2 秒后再开，不会出现「无法连接」）。

或者手动：

```bash
cd frontend
python -m http.server 5173
# 打开 http://127.0.0.1:5173
```

**不要双击 `index.html`**。`file://` 下浏览器会拦截 ES Module 与 `fetch`，页面必然白屏。

## 目录

```text
frontend/
├── index.html            记账页（对话式录入 + 追问/回执）
├── transactions.html     账单一览（游标分页）
├── stats.html            统计报表（KPI + 纯 CSS 柱状图）
├── budget.html           预算与超支提醒（只读）
├── start.bat             Windows 一键启动
├── partials/nav.html     全站唯一导航，由 ui.js 注入
├── assets/css/tokens.css      设计变量唯一来源
├── assets/css/components.css  通用组件
├── assets/css/pages.css       页面专属布局
├── assets/js/money.js         金额唯一出口（分↔元只在这里换算）
├── assets/js/datetime.js      时间唯一出口（+08:00）
├── assets/js/ui.js            DOM 构建 / 导航注入 / toast / 空态
├── assets/js/api.js           网络请求唯一出口（含 mock 开关）
├── assets/js/chart-bar.js     纯 CSS 柱状图
├── assets/js/pages/*.js       每页一个模块
└── mock/{data,db,import}.js   假后端 M2：种子数据 / 查询 / 入站状态机
```

## 四条纪律（review 时照这个量）

| 纪律 | 唯一合法位置 | 违规长什么样 |
|---|---|---|
| 分↔元换算 | `money.js` | 页面里出现 `cents / 100` 或 `* 100` |
| 网络请求 | `api.js` | 页面里出现 `fetch(` |
| 导航 | `partials/nav.html` | 每个 html 各抄一段 `<nav>` |
| 颜色/间距 | `tokens.css` 的 `var(--x)` | CSS 里写死 `#333`、`16px` |

另两条同等重要：**页面不做业务汇总**（所有数字来自接口）；**缺失值渲染「—」而不是 ¥0.00**。

## 切到真后端

`assets/js/api.js` 顶部：

```js
const USE_MOCK = true      // 改成 false
const API_BASE = ''        // 填后端地址，例如 'http://127.0.0.1:8000'
```

页面代码一行都不用动。`mock/` 整个目录可以直接删。

## 本机验收钩子

`index.html?demo=ok` / `pending` / `dup` / `refund`，直接跑一条示例，省得手打。
`?demo=pending` 用来验追问表单，`?demo=dup` 用来验 `DUPLICATE_RECORD` 阻断分支。

## 13 条硬约束自审（2026-11-16，逐条实测非印象）

| # | 约束 | 判定 | 依据 |
|---|---|---|---|
| 1 | 纯原生前端 | 通过 | `grep https?://` 在 html/js/css 里零命中，无框架、无构建产物 |
| 2 | 零依赖 | 通过 | 无第三方 JS/CSS；柱状图是 div 高度，未引图表库 |
| 3 | 既有目录结构 | **偏离（已声明）** | 新增 `chart-bar.js`、`pages/followup-form.js`、`mock/{data,import}.js`，未重命名既有文件 |
| 4 | 金额整数分 | 通过 | 分↔元换算仅 `money.js:27`；`records[].amount` 按契约传元 |
| 5 | 时间唯一出口 | **曾违反，已修** | 原 `followup-form.js:90/154` 手写 `slice(0,16)`；现改为 `toDatetimeLocal()` 与 `fmtDateTime()` |
| 6 | 类别不硬编码 | 通过 | 页面内无 `categoryId: 数字` 字面量，全部来自 `GET /api/categories` |
| 7 | 缺失值 null | 通过 | `formatCents(null)` 返回「—」；表单空串在提交时统一转回 `null` |
| 8 | 游标分页 | 通过 | 无 `page` / `offset` / `pageSize` 请求参数 |
| 9 | 请求唯一出口 | 通过 | `fetch` 仅出现在 `api.js` 两处 |
| 10 | 样式只走变量 | **曾违反，已修** | 原有 12 处 `padding/gap` 写死 px；现全部 `var()`，tokens 补 `--space-hair/0/1-5` |
| 11 | 命名规范 | 通过 | 文件名 kebab-case、JSON 字段 camelCase、CSS 类中划线 |
| 12 | 初学者可读 | 通过 | 无 `class` 语法；最大文件 `capture.js` 199 行；导出函数均有 JSDoc |
| 13 | XSS 纪律 | 通过 | 全站无 `innerHTML`（仅注释提及），DOM 一律走 `h()` 的文本节点 |

两处修完做了回归验证：间距改动最大偏差 1px（6px 保持 6px，9→8、5→4、3→2），四页截图无错位。

## 已知契约缺口（需要走 contract-change，不要私自改契约）

1. **`POST /api/transactions/import` 的入站字段里没有 `categoryId`**（契约 §1.3）。
   但用户在追问表单里改类别后必须把它传回后端，所以前端临时多发一个 `categoryId`。
   这是前端单方面扩展字段，**属于契约缺口**，需 M2 确认后再定稿。
2. **预算只能读**：契约 §2.5 只有 `GET /api/budgets`，没有写入接口，所以预算页是只读的。
3. **没有「确认入库」接口**：v1 提示词里写的 `POST /api/transactions/{recordId}/confirm` 在契约中不存在，本实现不调用它。
   实际流程是 `import` 即处理，用户确认发生在「返回 `pending_followup` → 补字段 → 用同一 `idempotencyKey` 重发」这一轮。

## 本地数据口径

`mock/data.js` 里 `DEMO_TODAY = '2026-11-16'`。近 7 日固定 7 个桶（11-10 ~ 11-16），
其中 5 天有支出、2 天为空；`summary.count` 与有数据的桶数一致（都是 5）。
月份维度只有 1 个桶，`period` 是 `2026-11`（不是 `2026-11-01`）。
