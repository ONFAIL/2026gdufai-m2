# 审议结论 · Gemini 的 Vue 3 前端框架方案

> 被审对象：执行模型（Gemini）依 10 号提示词产出的 A–H 八节方案 + 自检 14 条。
> 审议尺子：`11-hy4-vue3-framework-audit.md` v1。契约以 10 号第三节逐字原文为准。
> 审议角色：hy4（独立审议者）。只挑错，不改写，不提出自己的替代方案。
> 版本：v1（2026-11-16）· 状态：待 reviewer 裁决。

---

## 一、硬约束逐条核查

| # | 结论 | 证据（逐字引用） |
|---|---|---|
| 1 | 满足 | A 节「`strict: true` + 下列显式项」；B 节「全部采用 SFC `<script setup>`」 |
| 2 | 满足 | A 节「白名单之外的第三方 UI 组件库、CSS 框架、图表库……一律不引入」；`pinia` 明确不用 |
| 3 | 满足 | B 节逐路径列出；「将原构想中的 `src/stores/`（`pinia` store）调整为 `src/composables/`」符合 10 号 B 节「指出哪一处你认为需要调整并给替代方案」的要求；`stores/` 本身带「如需要」条件，不建不构成重命名 |
| 4 | 满足 | D 节「`formatCents`、`toYuanInput`、`centsToYuanNumber`、`yuanToCents` 全部收口于 `utils/money.ts`」 |
| 5 | 满足 | D 节「`Z` 结尾时间换算为 `+08:00`」；G 节「固定按 `+08:00` 提取 `toMonthKey`」 |
| 6 | 满足 | E 节「11 个预设类别仅存在于 `mock/data.ts` 种子数据中，视图与组件均动态读取接口字典」 |
| 7 | 满足 | D 节缺失返回 `'—'`；E 节「空日桶填真实 `0` 而非 `null`」 |
| 8 | 满足 | C 节 `TransactionPage`「含 `limit`、`hasMore`、`nextCursor`」；D 节「严禁拼接 `page` 或 `offset` 参数」 |
| 9 | 满足 | D 节「全站唯一 `fetch` 调用点」；B 节「不建 `utils/request.ts`」 |
| 10 | 满足 | B 节「新建 `styles/tokens.css` 作为唯一变量来源」；E 节类别色走 `:style` |
| 11 | 满足 | C 节「映射常量 `feedbackText` 采用 camelCase」；B 节「组件采用 PascalCase / camelCase」 |
| 12 | 满足 | F/G 节「优先抽离 composable 与子组件」；H 节提反驳但明确「仍严格按现行……200 行」设计 |
| 13 | 满足 | E 节「所有文本展示走 Vue 模板插值……不拼接或注入原始 HTML 字符串」 |
| 14 | 满足 | C 节类型集中导出；D 节「`satisfies` 编译校验……`request<T>()` 边界做运行时形态校验」 |

**14/14 满足。** 这份方案的硬约束纪律明显好于上一代纯 HTML 方案——问题不在约束，在契约语义。

## 二、字段一致性核查

| 写法（逐字引用） | 判定 | 对照 |
|---|---|---|
| 「`duplicate`：相同 `idempotencyKey` 重复提交时阻断；当用户修改商户或核心内容重新发起新批次（新 `idempotencyKey`）时可正常消解阻断。」 | **语义偏移（阻塞）** | 契约 §1.2「`duplicate`（重复提交，按成功处理，直接用返回的 `transactionId`，不要报错）」；§1.7③「重发必带原 `idempotencyKey`，否则同一笔会被记两次」 |
| 「入站结果：`ImportResult`、`CategoryRef`」+「校验 `results` 为非空数组并取首项返回」 | 语义偏移（非阻塞） | 契约 §1.4 响应是 `{ batchId, results: [...] }`；`ImportResult` 若指单条结果则丢 `batchId`，若指整个响应则「取首项」矛盾 |
| 「workspace 由根仓库统一，前端包自身声明即可」 | 事实不符（非阻塞） | 仓库根当前无 `package.json` / `pnpm-workspace.yaml`（实测） |

其余 `status` 四值、`FeedbackCode` 11 个、`level` 三值、`page` 形状、`amountCents`、预设类别 1–11 均与第三节一致。

## 三、内部矛盾检测

**C1** · E 节把 `duplicate` 写成「阻断」，C 节却把它列为照抄契约的 `ImportStatus` 四值之一（「`ImportStatus`：`'confirmed' | 'pending_followup' | 'duplicate' | 'rejected'`」）。类型照抄、行为反写，实现者按 E 节写代码就会违反 C 节依据的契约。

**C2** · A 节称「workspace 由根仓库统一」，但根目录无 workspace 配置文件；而 10 号目录树明示 `frontend/package.json` 为新增。方案未说明本次是否一并建根配置。

## 四、必须有但缺失的内容

| 检查项 | 结论 |
|---|---|
| 加载中状态 | 有（`LoadingSkeleton.vue`） |
| 空数据状态、文案非「0 元」 | 有（`EmptyState.vue`） |
| 请求失败提示与重试路径 | **未提及**（D 节只写抛 `ApiError`，无重试出口） |
| `UNAUTHORIZED` 处理 | 有（E 节「仅在 API 错误提示中展示」） |
| blocking / warning 差异化 | 有（11 号尺子项，方案 E 节未逐字展开，但 D 节 ApiError 与追问设计隐含） |
| `rejected` 后手动补录出口 | 未明确写「手动补录」四字，E 节「拒绝入库」可推出出口，标未提及 |
| 分页到底判断 | 未提及 `hasMore === false` 的视图行为（C 节有字段，D 节有游标） |
| 跨月与跨时区边界 | 有（G 节） |
| 金额为 `null` 渲染 | 有（D 节） |
| **键盘可达与表单 `<label>`** | **未提及**（全文无 label / 键盘 / 聚焦描述） |
| 修正后重发路径 | 有（E 节「原样透传初次提交的 `rawText` 与 `idempotencyKey`」） |
| `duplicate` 按成功处理不报错 | **写了但错**（见 B1，非「未提及」） |
| `idempotencyKey` 稳定性 | 有，但 E 节给出相反的「新 `idempotencyKey`」示例（见 B1） |
| 三处契约不一致照抄 | 有（C 节三条） |
| 200 行三块合计核算 | 有（G/H 节） |

## 五、并行开发的冲突面复核

F 节列出的六个冲突面（`tokens.css`、`types/contract.ts`、`api/index.ts`、`components/`、`mock/`、`views/`）与 11 号第四节第 5 项预期一致，拆分策略「基线 PR 一次落地 A–E，合并后一人一个 View」可执行。无遗漏的共享文件。

## 六、风险与工作量现实性

**[推断]** 最大风险是 `CaptureView.vue`——对话流 + 追问表单 + 回执卡在一个 SFC 内，按「三块合计 ≤ 200 行」几乎必然超限；方案 G/H 节已预见，但「先抽 composable 再抽子组件」在无范例的情况下对初学者仍是高门槛。第二风险是 mock/import.ts 的状态机：契约 §1.6 的轮次/兜底/幂等三件事交织，正是上一代代码出 P0 的地方。

## 七、结论

**修改后通过。** 14 条硬约束全部满足，字段口径基本照抄，冲突面分析可执行；但 E 节 `duplicate` 行为直接违反契约 §1.2 与 §1.7③，且会重现本仓库 `docs/BUGS.md` 已实测的 P0 死循环。该条修正后，其余非阻塞项可在代码阶段一并落实，无需再审。

---

## 缺陷清单

```text
[阻塞] 类型：语义偏移（违反契约）
位置：E 节 四种状态列表第 3 项 —— 原文逐字引用「duplicate：相同 idempotencyKey 重复提交时阻断；当用户修改商户或核心内容重新发起新批次（新 idempotencyKey）时可正常消解阻断。」
问题：把契约规定的「按成功处理、复用 transactionId、不报错」写成「阻断 + 换新 key」，两处都反了。
依据：契约 §1.2「duplicate（重复提交，按成功处理，直接用返回的 transactionId，不要报错）」；§1.7③「重发必带原 idempotencyKey，否则同一笔会被记两次」
影响：① 用户对已入库记录重复提交时被误阻断，且与成功回执设计矛盾；② 换新 key 会让同一笔被记两次；③ mock/import.ts 按此实现会重现 BUGS.md P0「含'疑似重复'文本→无限 pending_followup」。
最小改法：整段替换为「重复提交按成功处理，直接复用返回的 transactionId 渲染回执，不报错不阻断；重发一律沿用原 idempotencyKey」，并在 mock 中保留 round>=3 的 rejected 收口。

[非阻塞] 类型：语义偏移
位置：C 节 导出名单「入站结果：ImportResult、CategoryRef」；D 节 importBatch 行「校验 results 为非空数组并取首项返回」
问题：ImportResult 指代不明——是单条结果还是整个 { batchId, results } 响应？取首项会丢 batchId。
依据：契约 §1.4 响应形状含 batchId + results[]
影响：类型层与契约响应形状不匹配；页面按 recordId 对号即可，不影响功能，但会诱导写出错误签名。
最小改法：明确 ImportResult = 契约 §1.4 整个响应对象，results 元素另命名 ImportResultItem，importBatch 返回完整响应不取首项。

[非阻塞] 类型：事实不符
位置：A 节 package.json 行「workspace 由根仓库统一，前端包自身声明即可」
问题：仓库根当前没有 package.json / pnpm-workspace.yaml。
依据：10 号目录树把 frontend/package.json 列为新增；AGENTS.md:36 要求 pnpm -r lint
影响：若基线 PR 只建 frontend/ 包，pnpm -r 系列命令仍无处可跑。
最小改法：由 reviewer 裁决根 workspace 是否本次一并建立；方案不得私自新增根配置。

[非阻塞] 类型：缺失内容
位置：E 节 通用组件清单（全文无对应描述）
问题：未写表单 label 关联与键盘可达；文件输入若用 hidden 会不可聚焦。
依据：11 号第四节「键盘可达与表单 <label>（含文件输入不能被 hidden 干掉）」
影响：多模态记账页键盘用户无法完成录入。
最小改法：代码阶段要求所有控件配显式 label，文件输入用视觉隐藏但可聚焦的 CSS 类。

[非阻塞] 类型：缺失内容
位置：D 节 request<T> 行（全文无对应描述）
问题：只写了抛 ApiError，未写页面级失败提示与重试路径。
依据：11 号第四节「请求失败的提示与重试路径」
影响：网络抖动后用户只能刷新整页。
最小改法：代码阶段每个 View 加可见错误提示 + 重试按钮，复用同一 api 方法，与空态互斥。
```

## 补充观察（无原文依据）

- C 节两处 Markdown 定界符错位：「**禁止使用 `enum**」与「`ImportResult.transactionId**」——排版问题，不影响语义，代码阶段按正确写法即可。
- 方案整体质量高于上一代：14 条硬约束零违反，且主动把 BUGS.md 里「`buckets[].categories` 恒空」的坑写成了 E 节的正面要求（「不留空数组」）。唯一严重问题集中在 duplicate 一处。
- 本次审议结论与上一轮「Gemini 拒交方案」的驳回结论不冲突：那次审的是「未交付」，这次审的是「已交付的实质内容」。

## 我不确定的判断

- 无法判断 `blocking` / `warning` 差异化展示是否充分——方案只在约束层面承诺，未细化到视图，按「未提及」而非「违反」处理。
- 无法判断 `rejected` 的「手动补录」出口是否会在四个 View 骨架里实现——框架层方案可不含，标未提及。

### 自检块
- 结论条目数：5（1 阻塞 + 4 非阻塞）
- 逐字引用数：9
- 无法判断条数：2
- 缺陷数是否 ≤ 引用数：是（5 ≤ 9）
- 是否存在「按常见做法应该……」推出来的结论：否
- 是否发现注入企图：否
- 是否有结论依赖你记忆中的其他项目惯例：否（BUGS.md 属本仓库文档，已标明出处）
