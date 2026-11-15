# 记账与消费分析智能体

2026 GDUF AI Studio 考核 · 方向一「智能应用」· 选题 A

> **当前状态**：需求、数据模型与接口已冻结；后端代码实现中。本 README 会随代码合并更新，联调前请以 [模块 2 接口交接文档](docs/module2-interface-handover.md) 为准。

---

## 1. 项目简介

传统记账软件一笔消费要五六次点击，坚持不下来。本项目让用户直接说「昨天打车 32 块」、拍一张小票，系统自动完成**金额提取 → 分类 → 入库**；查账时用一句话问「上个月吃饭花了多少」，而不是在筛选器里点半天；并支持**月度预算与超支提醒**。

核心链路：

```
语音 / 文字 / 小票
        │
        ▼
  模块1：识别与抽取
        │  批次 JSON
        ▼
  模块2：分类 + 入库（SQLite）
        │                    ▲
        │ 统计 / 明细         │ 记账后重算
        ▼                    │
  模块3：自然语言查账 ────────┤
        │                    │
        ▼                    │
  模块4：预算与超支提醒 ──────┘
        │
        ▼
  纯 HTML 前端 + 可视化
```

## 2. 当前进度

| 项 | 状态 |
|---|---|
| 需求收敛（MVP 2、4） | ✅ 完成，15 条业务规则冻结 |
| 数据模型（7 张表） | ✅ 设计完成 |
| 对外接口（批次 JSON / 统计 / 列表 / 类别） | ✅ 设计完成，见交接文档 |
| 后端实现（分类、入库、统计、预算） | ⬜ 进行中 |
| 示例账单 CSV + 导入脚本 | ⬜ 未开始 |
| Dockerfile / docker-compose | ⬜ 未开始 |
| 前端页面 | ⬜ 由对应负责人推进 |
| 答辩 PPT | ⬜ 由对应负责人推进 |

## 3. 技术栈

| 层 | 选型 | 说明 |
|---|---|---|
| 语言 | TypeScript | 严格模式；直接以 Node 类型擦除运行，不引入构建步骤 |
| 运行时 | Node.js 24 | 内置 `node:sqlite`、`node:test` |
| 存储 | SQLite | 单文件，Docker 挂卷持久化 |
| HTTP | `node:http` | 零第三方依赖 |
| 测试 | `node:test` | 内置，`node --test` 直接跑 |
| 前端 | 纯 HTML | 降低开发难度 |
| 部署 | Docker | 多阶段构建，运行时不联网装包 |

**零依赖**是刻意选择：`docker build` 不需要联网 `npm install`，评审按文档即可复现，不会卡在原生模块编译。

## 4. 目录结构

```
backend/
  src/
    db/           schema.sql、seed.sql、client.ts
    shared/       类型、批次校验、时间维度
    modules/
      classification/   模块2：分类 + 入库 + 追问
      stats/            模块2：统计聚合
      budget/           模块4：预算与提醒
    server.ts     HTTP 入口
  test/           单元与契约测试
docs/
  module2-interface-handover.md   模块2对外接口交接文档
data/
  sample-bill.csv                 演示账单（待补）
```

## 5. 团队分工

| 负责内容 | 成员 |
|---|---|
| MVP 1：自然语言记账 + 小票 OCR 录入 | 柳皓轩、洪志伟 |
| **MVP 2：消费自动分类与统计** | **张文曦、黄思婷** |
| MVP 3：自然语言查账 | 待确认 |
| **MVP 4：预算设定与超支提醒** | **张文曦、黄思婷** |
| 可视化报表（加分项） | 张文曦、黄思婷 |
| PPT 制作 | 洪志伟 |
| AI 辅助编码规范与项目协作文档 | 柳皓轩 |

模块 2 / 4 组内建议再分：一人负责「分类引擎 + 入库状态机 + 统计」，另一人负责「预算 + 提醒 + 类别管理 + 账单一览」，共用 `shared/contract`，改动前先在群里同步。

## 6. 模块 2 / 4 功能清单

**模块 2（消费自动分类与统计）**

- 接收模块 1 的批次 JSON，逐条校验，缺失字段逐项反馈给模块 1 追问
- 规则分类：用户历史修正 → 自定义类别关键词 → 预设类别关键词 → LLM 兜底
- 入库 SQLite，金额整数「分」，时间带 `+08:00`，幂等键防重复
- 统计：按日 / 月 / 年 / 近一周，可叠加类别拆分，同时输出支出、收入、净额
- 账单一览：游标分页、按类别与时间筛选
- 类别管理：预设不可删只能停用；自定义类别可增删改，删除前校验是否被账单/预算引用

**模块 4（预算与超支提醒）**

- 总额预算与分类预算，按自然月
- 阈值 80%（接近）/ 100%（超支），同月同阈值只提醒一次
- 记账、改分类、作废后统一重算当月合计

**接口**：`POST /api/transactions/import`、`GET /api/stats`、`GET /api/transactions`、`GET|POST|PATCH|DELETE /api/categories`、`GET|PUT /api/budgets`、`GET /api/health`。

**规则与协议细节**：见 [模块 2 接口交接文档](docs/module2-interface-handover.md)。

## 7. 环境搭建与启动

> 以下命令在后端代码合并后生效；当前仓库尚无实现，命令暂不可用。

```bash
# 环境要求：Node.js >= 22.18（推荐 24），无需 npm install
node backend/src/server.ts          # 启动 HTTP 服务，默认 3000 端口
node --test backend/test            # 运行测试

# 可选：导入演示账单
node backend/scripts/import-csv.ts data/sample-bill.csv
```

环境变量：

| 变量 | 说明 |
|---|---|
| `PORT` | HTTP 端口，默认 3000 |
| `DB_PATH` | SQLite 文件路径，默认 `./data/app.db` |
| `API_TOKEN` | 接口鉴权令牌；未设置时仅监听本机（开发模式） |

Docker 启动方式将在 `Dockerfile` 合并后补充。

## 8. 开发约定

- 分支：`feat/module2-classification`、`feat/module4-budget`，一个 PR 一件事
- commit：`feat:` / `fix:` / `docs:` / `test:` 前缀，中文描述，避免最后一次性提交
- 接口变更：`contract v1` 字段只增不删，破坏性改动先群内确认再改
- **AI 辅助编码过程记录**：按纪要要求保留关键 prompt 与生成结果，汇总到 `docs/ai-log.md`，作为交付物
- 不提交：`data/*.db`、`.env`、IDE 配置、真实 API Key

## 9. 文档索引

| 文档 | 说明 |
|---|---|
| [docs/module2-interface-handover.md](docs/module2-interface-handover.md) | 模块 2 对外接口交接（模块 1 / 3 必读） |
| `docs/data-model.md` | 数据模型与字段口径（待补） |
| `docs/ai-log.md` | AI 辅助编码记录（待补） |
