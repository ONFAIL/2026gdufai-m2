# 模块 2 接口交接文档

> 适用对象：模块 1（语音/文字/图片记账）、模块 3（自然语言查账）、模块 4（预算提醒，同进程）
> 文档版本：v1.0（接口冻结）
> 维护人：模块 2 负责人
> 状态：接口定义已冻结；服务端实现按本文档开发中，联调前以本文档为准

---

## 0. 一分钟看懂边界

| 模块 | 负责 | 不负责 |
|---|---|---|
| 模块 1 | 语音转文字、OCR、字段抽取、把结果组装成批次 JSON、把反馈转成用户话术 | 分类、入库、去重、追问轮次管理 |
| 模块 2（本文档） | 校验、分类、入库、追问状态机、统计、账单一览、类别管理 | 自然语言解析、话术生成、UI |
| 模块 3 | 把「上个月吃饭花了多少」解析成结构化查询参数、把结果组织成回答 | 任何金额聚合、时间换算、分类判断 |
| 模块 4 | 预算 CRUD、超支判断、通知 | 账单入库、统计口径 |

一句话：**模块 1 只给字段，模块 2 只给事实，模块 3 只负责说人话。**

---

## 1. 模块 1 → 模块 2：批次 JSON

### 1.1 传输方式

- 一个批次一个 JSON 文件（或一次 HTTP POST），**仅支持批量包装**（`records` 数组，一个批次可含多条记录）。
- 推荐接口：`POST /api/transactions/import`，`Content-Type: application/json`。
- 处理结果逐条返回（见 1.4）。

### 1.2 批次结构

```jsonc
{
  "version": 1,
  "batchId": "b_20261115_001",
  "sentAt": "2026-11-15T21:00:00+08:00",
  "records": [
    {
      "recordId": "r_001",
      "userId": "u_001",
      "direction": null,
      "amount": 32.5,
      "merchant": null,
      "occurredAt": "2026-11-14T09:12:00+08:00",
      "chatAt": null,
      "rawText": "早上瑞幸花了32块5",
      "modality": "text",
      "sourceRef": null,
      "confidence": 0.9,
      "idempotencyKey": "msg_8821"
    }
  ]
}
```

### 1.3 字段说明

| 字段 | 层级 | 必填 | 类型 | 说明 |
|---|---|---|---|---|
| `version` | 批次 | 是 | number | 固定 `1` |
| `batchId` | 批次 | 是 | string | 模块 1 生成，结果回写对号用 |
| `sentAt` | 批次 | **是** | string | **用户发消息的时刻**（聊天时间），ISO-8601 带 `+08:00`。时间兜底规则依赖它，缺失整批拒收 |
| `records` | 批次 | 是 | array | 非空 |
| `recordId` | 记录 | 是 | string | 模块 1 生成，批次内唯一 |
| `userId` | 记录 | 是 | string | 当前用户 |
| `direction` | 记录 | 否 | `"expense"` \| `"income"` \| `null` | 判断不了就传 `null`，**不要猜** |
| `amount` | 记录 | 否 | number \| `null` | **单位：元**，最多两位小数；识别不出传 `null`，**不要传 0** |
| `merchant` | 记录 | 否 | string \| `null` | 缺失传 `null`，不要传 `"未知"` |
| `occurredAt` | 记录 | 否 | string \| `null` | 消费发生时间，ISO-8601；日期明确但时间不明可传当天 `T12:00:00+08:00` |
| `chatAt` | 记录 | 否 | string \| `null` | 该条消息本身发出的时刻；不传则用批次 `sentAt` 兜底 |
| `rawText` | 记录 | 是 | string | 原始输入文本（语音转写结果也算） |
| `modality` | 记录 | 是 | `"text"` \| `"voice"` \| `"image"` | 输入形态 |
| `sourceRef` | 记录 | 否 | string \| `null` | 语音/图片文件路径，**不要把文件内容 base64 塞进 JSON** |
| `confidence` | 记录 | 否 | number 0–1 \| `null` | 模块 1 对整条抽取的置信度，仅作参考 |
| `idempotencyKey` | 记录 | 是 | string | **同一笔重发必须相同**，模块 2 据此去重 |

> **关于 `direction` 可以传 `null`**：`null` 只出现在**入站**，含义是「模块 1 没有判定」，不是脏数据。模块 2 收到后按优先级解析：类别能识别就用类别 kind 推断，推断不出就追问（`MISSING_DIRECTION`），因此 **`transactions.direction` 是非空字段，入库前方向必然已经确定**，不存在把 `null` 写进库的路径。
>
> 不让模块 1 强制填写方向，是因为它只能靠猜：猜错会直接污染预算与统计（支出一旦记成收入，当月超支判断就失效），而传 `null` 最多触发一次推断或追问，代价小得多。

### 1.4 结果格式

模块 2 返回（HTTP 响应体，或与输入同名的 `.result.json`）：

```jsonc
{
  "batchId": "b_20261115_001",
  "results": [
    {
      "recordId": "r_001",
      "status": "confirmed",
      "transactionId": "tx_01J9Z8Q3K7",
      "direction": "expense",
      "occurredAt": "2026-11-14T09:12:00+08:00",
      "category": { "id": 1, "name": "餐饮", "kind": "expense" },
      "confidence": 0.92,
      "feedback": []
    }
  ]
}
```

`status` 四种取值：

| status | 含义 | 模块 1 该做什么 |
|---|---|---|
| `confirmed` | 已入库 | 展示成功；`feedback` 里的 warning 可以转成轻提示 |
| `pending_followup` | 未入库，信息不全 | **按 `feedback` 逐项追问用户**，拿到答案后原样重发同一条记录（同 `idempotencyKey`） |
| `duplicate` | 重复提交 | 按成功处理，直接用返回的 `transactionId`，**不要报错** |
| `rejected` | 放弃处理 | 提示用户手动补录或稍后重试 |

### 1.5 反馈码（`feedback[]`）

```jsonc
"feedback": [
  { "field": "amount", "code": "MISSING_AMOUNT", "severity": "blocking" },
  { "field": "merchant", "code": "MERCHANT_DEFAULTED", "severity": "warning" }
]
```

| code | 触发条件 | 严重度 | 模块 1 建议话术（文案可改，语义别变） |
|---|---|---|---|
| `MISSING_AMOUNT` | 金额空/0/负 | blocking | 「这笔大概花了多少钱？」 |
| `MISSING_TIME` | 时间缺失（首轮） | blocking | 「这是哪天的消费？」 |
| `FUTURE_TIME` | 时间在未来（首轮） | blocking | 「这个时间是未来的，是不是记错了？」 |
| `MISSING_DIRECTION` | 方向和类别都判不出 | blocking | 「这笔是支出还是收入？」 |
| `CATEGORY_KIND_MISMATCH` | 方向与类别冲突（首轮） | blocking | 「你说是支出，但类别是工资，以哪个为准？」 |
| `LOW_CONFIDENCE_CATEGORY` | 分类置信度 < 0.75 | warning | 「我把它归到了其他，可以帮我选个类别吗？」（附 `candidates`） |
| `MERCHANT_DEFAULTED` | 商户缺失 | warning | 「商户我填了未知账号，要补吗？」 |
| `TIME_DEFAULTED_TO_CHAT_TIME` | 时间追问不清，已回退聊天时间 | warning | 「时间我按你发消息的时间记了」 |
| `DIRECTION_FORCED_BY_CATEGORY` | 冲突二次以类别为准 | warning | 「按类别记成了收入」 |
| `DUPLICATE_RECORD` | 幂等键重复 | blocking | 「这笔已经记过了」 |
| `REFUND_NOT_SUPPORTED` | 文本是退款/退货 | blocking | 「退款请到账单一览里作废原账单」 |

### 1.6 追问轮次怎么算

- 追问轮次由模块 2 用 `idempotencyKey` 维护（存数据库），**模块 1 不需要传轮次**。
- 同一笔重发时：`idempotencyKey` 不变，已确认的字段填上，**未确认的字段继续传 `null`**。
- 第 2 轮起，如果时间仍为空或在未来，模块 2 会用 `chatAt`（或批次 `sentAt`）兜底入库，并回 `TIME_DEFAULTED_TO_CHAT_TIME`。
- 同一笔追问满 **3 轮** 仍无法解决，模块 2 返回 `rejected`，模块 1 提示用户手动补录。

### 1.7 模块 1 必须守的三条

1. **空就是 `null`**，不要用 `0`、`""`、`"未知"` 填充——模块 2 靠 `null` 判断「缺失」，填了假值会被当成真实数据。
2. **金额传元、不要传分**，也不要自己四舍五入到整数。
3. **重发必带原 `idempotencyKey`**，否则同一笔会被记两次；模块 2 无法替你纠正。

---

## 2. 模块 3 → 模块 2：查询调用

### 2.1 原则

模块 3 **只做两件事**：把用户问题解析成参数、把返回结果转成话术。**不要自己算金额、不要自己推时间范围、不要自己分类。**

### 2.2 统计查询 `GET /api/stats`

| 参数 | 必填 | 取值 | 说明 |
|---|---|---|---|
| `dimension` | 是 | `day` \| `month` \| `year` \| `recent7` | 时间维度 |
| `date` | dimension=day 时必填 | `YYYY-MM-DD` | 精确到某天 |
| `month` | dimension=month 时必填 | `YYYY-MM` | 精确到某月 |
| `year` | dimension=year 时必填 | `YYYY` | 精确到某年 |
| `breakdownBy` | 否 | `category` | 同时按类别拆分 |
| `direction` | 否 | `all`（默认）\| `expense` \| `income` | 收支过滤 |
| `categoryIds` | 否 | `1,2` | 限定类别 |
| `order` | 否 | `asc` \| `desc` | 桶/类别的排序方向 |

- `dimension=recent7` **不接受** `date/month/year`，固定 `[今天-6, 今天]`，固定 7 个日桶（空日补 0）。
- 精确模式（day/month/year）返回 **1 个桶**，`summary` 与 `buckets[0]` 数值相同。

响应：

```jsonc
{
  "dimension": "month",
  "range": { "start": "2026-11-01", "end": "2026-11-30" },
  "direction": "all",
  "summary": {
    "expenseCents": 268400,
    "incomeCents": 800000,
    "netCents": 531600,
    "count": 23,
    "topCategory": { "categoryId": 1, "name": "餐饮", "totalCents": 98000, "ratio": 0.365 }
  },
  "buckets": [
    {
      "period": "2026-11",
      "expenseCents": 268400,
      "incomeCents": 800000,
      "netCents": 531600,
      "count": 23,
      "categories": [
        { "categoryId": 1, "name": "餐饮", "kind": "expense", "custom": false,
          "color": "#F97316", "totalCents": 98000, "count": 11, "ratio": 0.365 }
      ]
    }
  ],
  "meta": {
    "unit": "cent",
    "basis": { "dateField": "occurred_date", "timezone": "Asia/Shanghai", "includeVoid": false },
    "generatedAt": "2026-11-15T22:10:00+08:00",
    "isEmpty": false
  }
}
```

模块 3 使用约定：

- **金额字段全部是「分」**（`meta.unit = "cent"`），展示前除以 100。
- `netCents = incomeCents - expenseCents`，可为负，**不要叫「余额」**。
- `ratio` 分母是**同方向**合计：支出类别 ÷ `expenseCents`，收入类别 ÷ `incomeCents`。
- `meta.isEmpty = true` 时回答「这个月还没有记录」，而不是「花了 0 元」。
- 想回答「哪类花得最多」，直接读 `summary.topCategory`，不要遍历 `buckets` 自己排。

### 2.3 账单一览 `GET /api/transactions`

| 参数 | 说明 |
|---|---|
| `categoryId` | 按类别筛选 |
| `from` / `to` | `YYYY-MM-DD`，闭区间 |
| `direction` | `expense` \| `income`，默认全部 |
| `limit` | 默认 20，上限 100 |
| `cursor` | 上一页返回的 `nextCursor`，首页不传 |

```jsonc
{
  "filter": { "categoryId": 1, "from": "2026-11-01", "to": "2026-11-30", "direction": "expense" },
  "summary": { "count": 23, "expenseCents": 98000, "incomeCents": 0 },
  "items": [
    { "id": "tx_...", "amountCents": 3250, "merchant": "瑞幸咖啡",
      "occurredAt": "2026-11-14T12:30:00+08:00", "occurredDate": "2026-11-14",
      "direction": "expense",
      "category": { "id": 1, "name": "餐饮", "color": "#F97316", "icon": "🍜" },
      "sourceModality": "image", "sourceRef": "uploads/2026/11/r.jpg",
      "categoryConfidence": 0.92, "status": "confirmed", "anomalyFlag": false }
  ],
  "page": { "limit": 20, "hasMore": true, "nextCursor": "eyJkIjoiMjAyNi0xMS0xNCIsImlkIjoidHhfLi4uIn0" },
  "meta": { "unit": "cent", "isEmpty": false }
}
```

- `summary` 是**整个筛选集**的合计，不是本页。
- 游标分页：把 `nextCursor` 原样回传，不要自己拼 `offset`。

### 2.4 类别字典 `GET /api/categories`

```jsonc
[ { "id": 1, "name": "餐饮", "kind": "expense", "isPreset": true,
    "color": "#F97316", "icon": "🍜", "isActive": true } ]
```

模块 3 解析「吃饭」「打车」时用这张表的 `name` 和 `id` 做映射，**不要在前端或话术里硬编码 ID**。

### 2.5 预算状态 `GET /api/budgets?month=2026-11`（模块 4 提供）

```jsonc
[ { "scope": "total", "category": null, "amountCents": 300000,
    "spentCents": 268400, "remainingCents": 31600, "usageRatio": 0.895, "level": "near" } ]
```

`level`：`normal` / `near`（≥80%）/ `over`（≥100%）。

### 2.6 错误格式

```jsonc
{ "error": { "code": "INVALID_DIMENSION_PARAM", "message": "dimension=day 需要 date 参数", "field": "date" } }
```

| code | HTTP | 场景 |
|---|---|---|
| `INVALID_BATCH` | 400 | 批次缺必填字段 |
| `INVALID_DIMENSION_PARAM` | 422 | dimension 与参数不匹配 |
| `CATEGORY_NOT_FOUND` | 404 | 类别不存在 |
| `CATEGORY_IN_USE` | 409 | 删除有数据的类别，返回 `counts` |
| `UNAUTHORIZED` | 401 | 缺少/错误的鉴权头 |

---

## 3. 数据字典（预设分类，ID 固定）

### 支出（kind = expense）

| ID | 名称 | 颜色 | 关键词 |
|---|---|---|---|
| 1 | 餐饮 | `#F97316` | 早餐、午餐、晚餐、夜宵、外卖、餐厅、饭店、食堂、咖啡、奶茶、瑞幸、星巴克、麦当劳、肯德基、火锅、烧烤、聚餐、AA |
| 2 | 交通 | `#3B82F6` | 地铁、公交、打车、滴滴、出租车、高铁、火车、机票、加油、停车、过路费、共享单车 |
| 3 | 购物 | `#EC4899` | 淘宝、京东、拼多多、超市、便利店、商场、衣服、鞋、数码、日用品、化妆品 |
| 4 | 居住 | `#10B981` | 房租、租金、水费、电费、燃气、物业、宽带、家政、维修 |
| 5 | 娱乐 | `#8B5CF6` | 电影、游戏、会员、订阅、KTV、旅游、酒店、演出、健身、剧本杀 |
| 6 | 医疗 | `#EF4444` | 医院、药店、挂号、体检、门诊、药、牙科 |
| 7 | 教育 | `#F59E0B` | 学费、课程、教材、书、培训、考试、网课 |
| 8 | 其他 | `#6B7280` | （兜底） |

### 收入（kind = income）

| ID | 名称 | 颜色 | 关键词 |
|---|---|---|---|
| 9 | 工资 | `#22C55E` | 工资、薪资、月薪、发薪、薪酬、奖金、年终奖、绩效、提成、兼职、外快、稿费、劳务 |
| 10 | 转账 | `#F472B6` | 转账、收款、入账、红包、礼金、压岁钱 |
| 11 | 其他收入 | `#9CA3AF` | 利息、分红、基金、股票、理财、收益、报销 |

> 口径说明：**转账计入收入**；**退款/退货不算收入**（返回 `REFUND_NOT_SUPPORTED`，引导作废原单）。

---

## 4. 联调检查清单

模块 1 侧：

- [ ] 最简单记录（金额 + 时间齐全）→ 期望 `confirmed`
- [ ] 缺金额 → `pending_followup` + `MISSING_AMOUNT`；补发后 `confirmed`
- [ ] 缺时间，连续两轮不补 → 第二次回 `TIME_DEFAULTED_TO_CHAT_TIME` 且入库
- [ ] 未来时间 → 首轮 `FUTURE_TIME`，第二轮兜底
- [ ] 同一 `idempotencyKey` 重发 → `duplicate`，账单数不变
- [ ] 方向与类别冲突 → 首轮 `CATEGORY_KIND_MISMATCH`，第二轮按类别覆盖
- [ ] 文本含「退款」→ `REFUND_NOT_SUPPORTED`
- [ ] 缺 `sentAt` → 整批 `INVALID_BATCH`

模块 3 侧：

- [ ] 四种 `dimension` 各调一次，`recent7` 返回 7 个连续日桶
- [ ] `breakdownBy=category` 时 `ratio` 分母正确
- [ ] 无数据月份 → `meta.isEmpty = true`
- [ ] 未传 `date` 却用 `dimension=day` → `422`
- [ ] 账单一览翻页用 `nextCursor`，两页无重复无遗漏

---

## 5. 变更与沟通约定

1. 本文档对应 `contract v1`，**字段只增不删、语义不变**；破坏性改动会提前在群里通知并升版本号。
2. 模块 2 的实现在 `backend/` 下，接口以本文档为准；代码合并后如有差异，以代码为准并同步更新本文档。
3. 模块 1 / 3 需要新增字段或接口（比如「按商户统计」），先在群里提，确认后由模块 2 加，**不要各自约定后直接改**。
4. 联调问题优先带三样东西：`batchId` / `recordId` / 接口返回原文，方便直接查 `intake_log`。
