# 记账与消费分析 AI 助手

> 2026 GDUF AI Studio 考核 · 方向一 · 选题 A。
> 状态：开发中。本 README 中标注「待补」的部分随开发进度更新，**启动命令必须与实际一致**。

## 项目说明

用一句话、一段语音或一张小票照片完成记账；用自然语言查账（「上个月吃饭花了多少？」）；为类别或总额设定月度预算并在接近或超支时提醒。信息不全时系统主动追问，而不是猜一个数。

## 功能清单

| # | 功能 | 模块 | 状态 | 验证方式 |
|---|---|---|---|---|
| MVP-1 | 自然语言 / 语音记账 + 小票截图 OCR，识别结果可确认修正 | M1 | 待补 | 待补 |
| MVP-2 | 消费自动分类，按类别 / 时间维度统计 | M2 | 待补 | 待补 |
| MVP-3 | 自然语言查账（真实解析时间范围与类别） | M3 | 待补 | 待补 |
| MVP-4 | 月度预算设定与超支提醒 | M4 | 待补 | 待补 |
| 扩展 | 多轮追问、可视化报表、游戏化、异常消费审计 | — | 待补 | 待补 |

## 技术栈与架构

- 后端：Node.js + TypeScript + Fastify + SQLite（better-sqlite3）
- 前端：Vite + Vue 3 + TypeScript
- AI 能力：LLM / OCR / ASR 服务商待补（需写明模型名称与配置方式）
- 工程：pnpm workspace、Vitest、Docker Compose

架构与模块边界见 [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md)，选型理由见 [ADR-0001](docs/decisions/ADR-0001-tech-stack.md)。

## 快速开始

### Docker（推荐，评审使用）

```bash
cp .env.example .env        # 填入 API Key
docker compose up --build
# 浏览器打开 http://localhost:3000
```

| 项 | 值 |
|---|---|
| 端口 | `3000`（待补，以 `docker-compose.yml` 为准） |
| 数据持久化 | 待补（SQLite 文件与上传目录挂载的卷） |
| 环境变量 | 见 [.env.example](.env.example) |

### 本地开发

```bash
pnpm install
cp .env.example .env
pnpm dev                    # 待补：以根 package.json scripts 为准
```

### 演示数据

待补：`data/samples/` 下的示例账单 CSV 与导入命令。

## 团队分工

> 仅使用 GitHub 用户名。日志文件名与用户名一致：`docs/agent-logs/<github-id>.md`。

| GitHub 用户名 | 角色 | 负责模块 | 个人日志 |
|---|---|---|---|
| `Tarnishedtaffy` | 主仓库负责人 / reviewer | 前端框架、Docker、代码审核、汇总日志 | [Tarnishedtaffy.md](docs/agent-logs/Tarnishedtaffy.md) |
| `mianyoubiaoqing` | 开发 | M1 多模态记账；游戏化、异常消费审计（暂领） | [mianyoubiaoqing.md](docs/agent-logs/mianyoubiaoqing.md) |
| `yukacezar569-blip` | 开发 | M1 多模态记账；M3 自然语言查账；答辩 PPT | [yukacezar569-blip.md](docs/agent-logs/yukacezar569-blip.md) |
| `Z_Wen` | 开发 | M2 分类入库与统计（主做分类算法）；M4 预算提醒 | [Z_Wen.md](docs/agent-logs/Z_Wen.md) |
| `huangsiting546` | 开发 | M2 分类入库与统计；M4 预算提醒 | [huangsiting546.md](docs/agent-logs/huangsiting546.md) |

M2 与 M4 同进程、由同一组负责；`docs/contracts/` 由该组维护。

## 项目文档

| 文档 | 内容 |
|---|---|
| [AGENTS.md](AGENTS.md) / [CLAUDE.md](CLAUDE.md) | AI 编码代理工作规则 |
| [CONTRIBUTING.md](CONTRIBUTING.md) | Fork + PR 流程、分支与 commit 规范 |
| [docs/GLOSSARY.md](docs/GLOSSARY.md) | 项目术语规范表 |
| [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) | 方案设计与模块边界 |
| [docs/contracts/](docs/contracts/) | 模块间接口契约 |
| [docs/CODING_STANDARDS.md](docs/CODING_STANDARDS.md) | 编码规范 |
| [docs/AI_CODING_POLICY.md](docs/AI_CODING_POLICY.md) | AI 辅助编码规范 |
| [docs/decisions/](docs/decisions/) | 架构决策记录（ADR） |
| [docs/agent-logs/](docs/agent-logs/) | AI 辅助编码过程记录 |
| [docs/PROBLEMS_AND_GAPS.md](docs/PROBLEMS_AND_GAPS.md) | 遇到的问题与未完成项 |

## 在线 Demo

待补。
