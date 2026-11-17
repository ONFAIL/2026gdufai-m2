# 交接文档：模块 2 受契约阻塞项与用户信息存储方案

> 面向对象：全体协作者（M1 / M3 / M4 / 前端 / reviewer）
> 目的：把「代码想写但契约没定义」和「用户信息到底怎么存」两件事摆到桌面上，一次性拍板，避免各写各的。
> 当前契约：`docs/contracts/module2-interface-v1.md` v1.1（M2 维护）
> 日期：2026-11-17

---

## 一、用户信息如何存储

### 1.1 文档现状：契约没有定义

| 文档 | 现状 |
|---|---|
| 契约 §1.3 | 只规定入站记录带 `userId`（必填），**没有用户模型、注册/登录、鉴权接口** |
| 契约 §2.2 / §2.3 | 统计与账单一览的参数里**没有 `userId`**，隐含「单用户演示」 |
| ARCHITECTURE §5 | 「鉴权方式（单用户演示 Token / 简单登录）」列为待定，负责 M2 + reviewer |
| 契约 §2.6 | 预留 `UNAUTHORIZED`，但没有实际约定 |

### 1.2 代码现状：最小用户表

`backend/src/db/migrations/001_init.sql`：

```sql
CREATE TABLE users (
  id         TEXT PRIMARY KEY,
  nickname   TEXT NOT NULL,
  timezone   TEXT NOT NULL DEFAULT 'Asia/Shanghai',
  currency   TEXT NOT NULL DEFAULT 'CNY',
  created_at TEXT NOT NULL
);
```

- 导入时 `ensureUser()` 用 `INSERT OR IGNORE` 按入站 `userId` 自动补建，`nickname` 直接等于 `userId`；
- **不存密码、邮箱、手机号、头像**，没有任何可识别到自然人的信息；
- 符合「个人信息不进仓库」「浏览器不保存隐私数据」的约束。

### 1.3 发现的问题：写读用户不一致

| 路径 | 用的 userId |
|---|---|
| 写：`POST /api/transactions/import` | 入站记录里的 `record.userId` |
| 读：`GET /api/stats`、`GET /api/transactions` | 默认写死 `u_001` |

**后果**：如果模块 1 传的是 `u_x` 而不是 `u_001`，这笔账能写进库，但统计和账单一览查不到——「记得进去、看不见」。

### 1.4 两个可选方案

**方案 A：统一演示用户（M2 推荐）**

- 增加配置 `DEMO_USER_ID`（默认 `u_001`）；
- 导入时忽略入站 `userId`，统一写入该用户；读路径也用它；
- 与「读接口没有 `userId` 参数」的现有契约一致；
- 改动小，不需要契约变更；
- 代价：暂不支持多用户。

**方案 B：读接口增加 `userId` 参数**

- 契约 §2.2 / §2.3 增加 `userId` 查询参数；
- 写读都用入站值；
- 需要开 contract-change issue，前端每次请求都要带 userId；
- 好处：为将来多用户打基础。

**需要团队拍板**：选 A 还是 B？（M2 建议 A，等真正需要多用户时再升级为 B。）

### 1.5 鉴权怎么接（后续）

- 现状：`APP_AUTH_TOKEN` 配置已预留，但没有任何路由校验它；
- 建议：单用户演示阶段用固定 Token（`Authorization: Bearer <token>`），全局钩子校验，失败返回 `UNAUTHORIZED`；
- 这属于 `ARCHITECTURE §5` 的待定事项，由 M2 + reviewer 决定，确定前不实现。

---

## 二、受契约阻塞的功能

下列能力 **需求已明确、代码也想写，但契约 v1.1 里没有对应接口**，按 CONTRIBUTING 第 5 节必须先走契约变更。

### 2.1 类别管理

| 项 | 内容 |
|---|---|
| 需求 | 用户可创建/改名/停用/删除自定义类别；删除前校验是否被账单或预算引用 |
| 契约现状 | 只有 `GET /api/categories` |
| 建议接口 | `POST /api/categories`、`PATCH /api/categories/:id`、`DELETE /api/categories/:id`、`POST /api/categories/:id/reassign` |
| 关联规则 | 删除被引用时返回 `409 CATEGORY_IN_USE`，响应带 `details.counts`（已由契约 v1.1 的 `details` 字段支持） |
| 影响模块 | 前端（类别管理页）、M3（查账时类别映射） |

### 2.2 预算写入

| 项 | 内容 |
|---|---|
| 需求 | 设定/修改/删除总额或分类的月度预算 |
| 契约现状 | 只有 `GET /api/budgets`（§2.5） |
| 建议接口 | `PUT /api/budgets`、`DELETE /api/budgets/:id` |
| 影响模块 | M4（实现方）、前端（预算页） |

### 2.3 账单纠错

| 项 | 内容 |
|---|---|
| 需求 | 用户在账单一览里改分类、改金额/时间，或作废退款账单 |
| 契约现状 | 无 |
| 建议接口 | `PATCH /api/transactions/:id`、`POST /api/transactions/:id/void` |
| 关联规则 | 改分类时写入 `user_category_rules`（下次同商户自动命中）；改到另一侧 kind 会翻转 `direction`，需重算当月预算 |
| 影响模块 | 前端（列表操作）、M4（重算） |

### 2.4 查询参数错误码

| 项 | 内容 |
|---|---|
| 现状 | 契约 §2.6 没有查询参数类错误码，M2 目前统一用 `INVALID_DIMENSION_PARAM`（422）兜底 |
| 建议 | 新增 `INVALID_QUERY_PARAM`（422），与 `INVALID_DIMENSION_PARAM` 区分 |
| 影响 | 前端错误提示的精确度；不涉及数据 |

### 2.5 贷款类别与还款规则

| 项 | 内容 |
|---|---|
| 需求 | 新增收入类别「贷款」（计入收入）；文本为还款/还贷时不记支出，引导作废原贷款账单 |
| 契约现状 | §3 只有 11 个预设类别；§1.5 没有对应反馈码 |
| 建议 | §3 增加 ID 12「贷款」；§1.5 增加 `REPAYMENT_REQUIRES_VOID`（blocking） |
| 影响模块 | M1（方向判断词表）、M3（「借了多少钱」映射）、前端（类别颜色与反馈文案） |

---

## 三、需要团队回答的问题

| # | 问题 | 选项 | M2 建议 |
|---|---|---|---|
| 1 | 用户 ID 怎么处理 | A 统一演示用户 / B 读接口加 `userId` | A |
| 2 | 鉴权是否本期实现 | 实现固定 Token / 继续待定 | 先待定，合并前用 `UNAUTHORIZED` 占位 |
| 3 | 类别管理是否本期做 | 做 / 不做 | 做，MVP-2 的「类别体系自行设计」需要它 |
| 4 | 预算写入是否本期做 | 做 / 不做 | 做，M4 的核心 |
| 5 | 账单作废是否本期做 | 做 / 不做 | 做，退款规则依赖它 |
| 6 | 贷款类别是否加入 | 加入 / 不加 | 加入，但要同步前端断言（11 → 12 个类别） |

---

## 四、建议的契约变更清单（v1.2）

如果上面问题多数选「做」，建议一次开一个 contract-change issue，内容包含：

1. §1.5 新增 `REPAYMENT_REQUIRES_VOID`
2. §2.2 / §2.3 增加 `userId` 参数（若选方案 B）
3. §2.6 新增 `INVALID_QUERY_PARAM`
4. §2.7 类别管理接口（4 个）
5. §2.8 预算写入接口（2 个）
6. §2.9 账单纠错接口（2 个）
7. §3 增加 ID 12「贷款」

一次改完、一次评审，比分四次开 issue 省事。

---

## 五、当前 M2 状态（供参考）

| 部分 | 状态 |
|---|---|
| 导入链路（校验、分类、追问、入库） | 已完成，分支 `feat/m2-import-pipeline`（`b008046`） |
| 统计 / 账单一览 / 类别字典 | 已完成，分支 `feat/m2-query-api`（`92e5a4b`，堆叠） |
| 测试 | backend 59 例，typecheck / lint 通过 |
| 受契约阻塞 | 本文第二节五项 |
| M4 预算提醒 | 未开始 |

---

## 六、下一步

1. 团队在群里或周会上回答第三节的 6 个问题；
2. M2 按结论开一个 contract-change issue；
3. issue 确认后，M2 在同一 PR 内补契约、补实现、补测试；
4. 前端与 M1/M3 同步更新类型与文案。
