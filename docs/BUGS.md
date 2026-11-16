# 前端代码 Bug 清单

> 范围：仅 `frontend/` 现有代码与 `tools/make-review-pack.py`，以文件当前内容为准。
> 不含技术栈口径、Git 状态、协作流程等非代码问题。
> 日期：2026-11-16。严重度按「用户能否正常完成一次记账/查账」排序。
> 标注「已验证」的条目用 Node 实际执行过相关函数，非静态推断。

---

## P0 · 阻塞：核心流程走不通

### BUG-01 重复记录追问死循环，永远无法入库或放弃

- **位置**：`frontend/mock/import.js:69-75`、`:84-87`
- **现象**：含「疑似重复」的文本每次都返回 `pending_followup` + `DUPLICATE_RECORD`(blocking)，用户按提示改商户、改金额、补时间后重发，**结果不变**；契约 §1.6 的「满 3 轮转 rejected」永远不触发。
- **已验证**：同一 `idempotencyKey` 连续提交 5 轮，每轮均 `status=pending_followup`、`code=DUPLICATE_RECORD`。
- **根因**：判定条件只读 `rec.rawText`（`:70`），而追问表单重发时只覆盖 amount/merchant/categoryId/direction/occurredAt（`followup-form.js:124-130`），`rawText` 原样保留；`round >= 3` 的收口分支位于普通 blocking 分支（`:84-87`），"疑似重复"分支提前 return，绕过收口。
- **影响**：`?demo=dup` 演示钩子、`SAMPLES` 中的「疑似重复 手机壳 30」、以及所有图片上传都卡死在此。
- **建议**：把 `DUPLICATE_RECORD` 转为可消解条件——重发时若商户/金额已变更则放行 `confirmed`；或让该分支参与 `round >= 3` 收口。

### BUG-02 统计页类别占比永远空白

- **位置**：`frontend/mock/db.js:17-24`、`:40-47`、`frontend/assets/js/pages/stats.js:52`
- **现象**：切到「本月」，类别占比区域固定显示「这个区间没有支出记录」，即使 `summary.topCategory` 有值（实测 餐饮/居住 等均有汇总）。
- **已验证**：`mockGetStats('month')` 返回 `buckets[0].categories === []`；`mockGetStats('recent7')` 每个桶的 `categories` 也都是 `[]`。
- **根因**：`aggregate()` 初始化 `categories: []`，只把类别合计写入局部 `catTotals`，**从未写回任何 bucket**；`renderRatio()` 读的是 `only.categories`，数据源恒空。
- **影响**：统计页三个区块里一个完全失效；`summary.topCategory` 却正常工作，两处数据互相矛盾。
- **建议**：在 `aggregate()` 末尾把 `catTotals` 按维度分配到对应 bucket，并补 `ratio`（当前 `catTotals` 元素也没有 `ratio` 字段，即使写回也无法渲染进度条）。

---

## P1 · 高：明显错误结果或不可达功能

### BUG-03 图片上传必然进入重复死循环

- **位置**：`frontend/assets/js/pages/capture.js:165-172`
- **现象**：选择任意图片后，代码不读取文件内容，而是硬编码提交 `'疑似重复 打印资料 12块'`，直接命中 BUG-01；用户永远无法走通图片链路。
- **附带**：`sourceRef` 传的是 `file.name`，而契约 §1.3 要求的是文件路径，不是文件名。
- **建议**：改成与文本相同的正常记账文案；OCR 未接入时明确禁用入口或提示，不要伪造一个必失败的用例。

### BUG-04 时间兜底告警文案缺失，界面显示「需要处理」

- **位置**：`frontend/assets/js/pages/followup-form.js:8-16`、`frontend/mock/import.js:90`
- **现象**：首轮缺时间、第二轮按聊天时间兜底时，后端返回 `TIME_DEFAULTED_TO_CHAT_TIME` 告警，但 `FEEDBACK_TEXT` 没有对应 key，界面显示兜底文案「需要处理」，用户不知道时间被改了。
- **已验证**：mock 会产生该 code；`FEEDBACK_TEXT` 中零命中。
- **同样缺失**：`FUTURE_TIME`、`CATEGORY_KIND_MISMATCH`、`DIRECTION_FORCED_BY_CATEGORY`（契约 §1.5 共 11 个码，文案表只覆盖 7 个）。
- **建议**：补齐四个 key；其中 `TIME_DEFAULTED_TO_CHAT_TIME` 应显示实际采用的时间。

### BUG-05 「早上」被记成当前时刻，与语义相反

- **位置**：`frontend/assets/js/pages/capture.js:44-47`、`:57`
- **现象**：写了「早上瑞幸花了32块5」，`hintTime()` 直接返回 `nowIso()`。当前实测时间 20:43，入库时间变成 `20:43:00+08:00`。
- **根因**：只判断文本含时间词就取当前时刻，不解析"早上/昨晚/中午"对应的钟点。契约 §1.3、§1.7 明确「判断不了传 null，不要猜」。
- **影响**：时间统计桶可能记错；`SAMPLES` 第一条示例就踩中。
- **建议**：要么按词映射到合理钟点（早上→08:00 等），要么一律传 `null` 交给追问。

### BUG-06 加载中切换类别筛选被静默吞掉

- **位置**：`frontend/assets/js/pages/transactions.js:50-52`、`:104-107`
- **现象**：首次加载（有 180ms mock 延迟）期间切换类别下拉框，`load(true)` 因 `state.loading === true` 直接 return，列表仍是全部类别，但下拉框显示新类别，界面与筛选不一致。
- **建议**：loading 中禁用筛选控件，或用「pending reset」标记在当前请求结束后补跑一次。

---

## P2 · 中：口径不一致、分支不可达、跨期失效

### BUG-07 「笔数」与图注「与图表非空柱数量一致」不成立

- **位置**：`frontend/assets/js/pages/stats.js:26`、`frontend/assets/js/chart-bar.js:35`
- **现象**：KPI 笔数取自 `summary.count`（含收入、含所有桶），但柱状图只画 `expenseCents > 0` 的柱子。本月维度 `count=17` 却只有 1 根柱子；某天只有收入时，笔数增加但柱子为空。
- **建议**：改图注为「含收入，按发生日计入」，或让图表支持收入/支出双序列。

### BUG-08 回执金额显示用户提交值，不是后端确认值

- **位置**：`frontend/assets/js/pages/capture.js:86`、`frontend/assets/js/pages/followup-form.js:151`
- **现象**：`confirmed` 回执和结果卡都用 `yuanToCents(record.amount)` 重新算金额。`mock/import.js` 当前不改写金额所以看不出问题，但契约允许后端推断/修正，届时界面显示与入库值不符。
- **建议**：`mock/import.js` 的结果对象补 `amountCents` 字段，前端只读后端返回值。

### BUG-09 四个反馈码在 mock 中永不产生，前端无法演示

- **位置**：`frontend/mock/import.js:51-95`
- **现象**：`FUTURE_TIME`、`CATEGORY_KIND_MISMATCH`、`DIRECTION_FORCED_BY_CATEGORY`、`LOW_CONFIDENCE_CATEGORY`(warning 语义) 均无对应分支。其中 `LOW_CONFIDENCE_CATEGORY` 用入站 `rec.confidence` 判定，而 `capture.js:62` 固定写 `0.92`，永远达不到 `< 0.75`。
- **影响**：契约 §4 联调清单的多数用例无法在 mock 环境验收。
- **建议**：补分支，并把低置信度判定改为分类置信度（入站字段表达的是 M1 抽取置信度，语义不同）。

### BUG-10 跨月后预算页与演示数据脱节

- **位置**：`frontend/assets/js/pages/budget.js:9`、`frontend/mock/data.js:8`
- **现象**：`MONTH = toMonthKey(nowIso())` 取真实月份，种子数据固定 `DEMO_TODAY = '2026-11-16'`。当前恰好都是 2026-11 所以正常，进入 12 月后预算 spent 全为 0，统计页 recent7 的桶仍停在 11 月。
- **建议**：mock 内部统一用 `DEMO_TODAY` 派生月份，或把 `nowIso()` 统一替换为 mock 时钟。

### BUG-11 一段文本含多笔时只抽第一笔金额

- **位置**：`frontend/assets/js/money.js:74-87`
- **已验证**：`"昨天花了100元今天又花了20元"` → `10000` 分，第二笔被静默丢弃。
- **建议**：多行/多笔文本应返回 `null` 触发追问，而不是猜其中一笔。

### BUG-12 批次响应缺结果数组时直接崩溃

- **位置**：`frontend/assets/js/pages/capture.js:112`
- **现象**：`payload.results[0]` 未判空；后端或 mock 返回空数组/非 JSON 时抛 `TypeError`，被 catch 误报为「服务没响应」。
- **建议**：先校验 `Array.isArray(payload.results)` 且长度大于 0，否则抛明确错误。

---

## P3 · 低：文案、边界与一致性

| # | 位置 | 问题 |
|---|---|---|
| BUG-13 | `mock/db.js:169-170` | `usageRatio` 用 round 后的值展示，但 `levelOf()` 用未 round 的原始 ratio 判定。边界处可能出现「显示 80% 却标正常」。 |
| BUG-14 | `index.html:47` | 页面写「确认后才入库」，实际 `confirmed` 立即入库，追问只在信息不全时发生，没有独立确认步骤。 |
| BUG-15 | `followup-form.js:42` | 注释称「只渲染反馈码指向的字段」，实际金额/商户/类别/方向/时间五个字段全部渲染。 |
| BUG-16 | `api.js:132-135` | `loadPartial()` 不走统一 `request()`，失败时页面导航降级为单个品牌文字，用户无法切页。 |
| BUG-17 | `ui.js:22-25` | `h()` 把所有 `on*` 开头的函数属性都当事件绑定；若传入名为 `once` 等的普通属性会误绑。 |

---

## 验证方式

可复现本次结论的两条命令（在 `frontend/` 下执行，Node 22）：

```bash
node --experimental-default-type=module --input-type=module -e "
import { mockGetStats } from './mock/db.js';
console.log(mockGetStats('month').buckets[0].categories);   # [] → BUG-02
"
node --experimental-default-type=module --input-type=module -e "
import { mockImportBatch } from './mock/import.js';
const r={recordId:'r',userId:'u',direction:null,amount:30,merchant:null,
  occurredAt:'2026-11-16T19:00:00+08:00',chatAt:null,rawText:'疑似重复 手机壳 30',
  modality:'text',sourceRef:null,confidence:0.92,idempotencyKey:'msg_dup'};
for(let i=0;i<3;i++) console.log(mockImportBatch({
  version:1,batchId:'b',sentAt:'2026-11-16T20:00:00+08:00',records:[r]}).results[0].status);
# pending_followup × 3 → BUG-01
"
```

`tools/make-review-pack.py` 已实测可正常运行（22 个源码文件、2950 行），未发现阻塞问题。
