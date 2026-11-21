# 汇总日志（SUMMARY）

> 仅由 reviewer 的代理维护，其他代理只读。流程见 [README.md](README.md#reviewer-汇总流程)。

## 进度看板

| 功能 | 负责模块 | 状态 | 最近相关 PR |
|---|---|---|---|
| MVP-1 自然语言记账 + OCR 录入 | M1 | 进行中（识别抽取核心已合入，对外路由待 #24） | #30 |
| MVP-2 消费自动分类与统计 | M2 | 进行中（契约 v1.4） | #17 |
| MVP-3 自然语言查账 | M3 | 未开始 | — |
| MVP-4 预算设定与超支提醒 | M4（M2 组） | 未开始 | — |
| 前端框架 | 前端 | 进行中 | #13 |
| 扩展：多轮追问 | M1 + M2 | 契约已定义 | — |
| 扩展：可视化报表 | 前端 + M2 | 未开始 | — |
| 扩展：游戏化 | gamification | 未开始 | — |
| 扩展：异常消费审计 | audit | 未开始 | — |
| 答辩 PPT | M3 负责人 | 未开始 | — |
| Docker 与复现 | reviewer | 未开始 | — |

状态取值：未开始 / 进行中 / 联调中 / 已完成 / 已放弃（写明原因）。

## 汇总条目

<!-- reviewer 的代理在此线以下按时间顺序追加 -->

### #13 feat(m1): 接通真实记账确认、批次提交与反馈追问

- **合并时间**：2026-11-19
- **作者 / 模块**：`yukacezar569-blip` / M1
- **关联日志**：LOG-yukacezar569-blip-20261117-01、LOG-yukacezar569-blip-20261118-01、LOG-yukacezar569-blip-20261118-02、LOG-yukacezar569-blip-20261119-01、LOG-yukacezar569-blip-20261119-02
- **改动摘要**：接通真实模式的草稿确认、批次提交、反馈追问与未决提交放弃；抽出 `@gduf/capture-flow` 共享流程与冻结反馈话术；Docker 与前端同步适配。
- **契约 / 术语影响**：无新增契约字段；与 v1.2 入站/反馈码对齐，并兼容 #17 v1.4 的 8 个现行码。
- **评审意见**：修改后通过。三轮 Request changes 的 P0/P1（可信会话、`userId` 对齐、retry 退出、反馈码漂移）均已修复，最终 APPROVED。
- **后续事项**：#17 按序合并；#18 前端 `entryType`/mock/原单选择；#6 上传、真实识别与 `sourceRef` 回填。

### #17 feat(m2): 退款还款改为中性记录

- **合并时间**：2026-11-19
- **作者 / 模块**：`ONFAIL`（Z_Wen） / M2
- **关联日志**：LOG-Z_Wen-20261117-05、LOG-Z_Wen-20261118-11、LOG-Z_Wen-20261118-12、LOG-Z_Wen-20261118-13、LOG-Z_Wen-20261118-14、LOG-Z_Wen-20261119-01、LOG-Z_Wen-20261119-02、LOG-Z_Wen-20261119-03、LOG-Z_Wen-20261119-04、LOG-Z_Wen-20261119-05、LOG-Z_Wen-20261119-07
- **改动摘要**：退款/还款保留为中性记录且不计收支；匹配到原账单后按金额三态处理（等额作废、部分改额、超额部分记收入/支出）；统计与账单一览默认排除中性记录。
- **契约 / 术语影响**：契约 v1.4；新增 `entry_type`、`matched_transaction_id`、`originalTransactionId`、`matchedTransactionId`、`entryType`；新增 3 个 v1.4 反馈码；GLOSSARY 更新「退款」并新增「中性记录」。
- **评审意见**：修改后通过。还款方向、`isEmpty` 筛选、超额退款误伤还款、契约流程与话术一致性均已修复，最终 APPROVED。
- **后续事项**：#18 前端 `entryType` / mock / 原单选择；#22/#23 v1.5 贷款还款改为 2C、新增类别 13「贷款利息」。

### #30 feat(m1): 实现多模态识别与字段抽取核心及 AI 适配 ADR

- **合并时间**：2026-11-21
- **作者 / 模块**：`mianyoubiaoqing` / M1
- **关联日志**：LOG-mianyoubiaoqing-20261119-01、LOG-mianyoubiaoqing-20261120-01、LOG-mianyoubiaoqing-20261120-02、LOG-mianyoubiaoqing-20261120-03、LOG-mianyoubiaoqing-20261120-04
- **改动摘要**：新增文本 / 语音 / 小票三模态识别与字段抽取核心、受控上传存储、OpenAI 兼容与 DeepSeek `/tools/ocr`、`/tools/asr` 双协议适配器及版本化提示词；输出对齐 `@gduf/capture-flow` 的 `CaptureDraft`，不改动 M2 入库。
- **契约 / 术语影响**：未修改 `docs/contracts/`；新增 ADR-0002；对外 `/api/capture/uploads`、`/api/capture/extract` 路由待 #24 契约冻结。
- **评审意见**：修改后通过。两轮 P1/P2/P3（凭据跨厂商拦截、反馈码补全、全生命周期超时、上传目录符号链接 / 硬链接 / TOCTOU 防护、ASR 预检）均已修复，最终 APPROVED。
- **后续事项**：#24 契约冻结后挂载对外路由与失败码映射；Ogg Opus 时长校验待路由层；三模态真实密钥联调记录见个人日志。
