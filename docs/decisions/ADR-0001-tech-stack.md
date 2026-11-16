# ADR-0001：技术栈选型

- **状态**：已采纳
- **日期**：2026-11-16
- **决策者**：全体协作者

## 背景

立项会议（2026-11-14）初定「前端纯 HTML，后端 TypeScript + SQLite，Docker 部署」。考虑到模块划分改为契约 v1 的 4 模块、前端需要承载多轮追问对话、可视化报表与游戏化交互，团队对前端选型做了调整。

## 决策

| 层 | 选型 | 与会议纪要的差异 |
|---|---|---|
| 运行时 | Node.js（LTS）+ TypeScript（strict） | 一致 |
| 后端框架 | Fastify | 纪要未指定 |
| 数据库 | SQLite + better-sqlite3 | 纪要未指定驱动 |
| 前端 | Vite + Vue 3 + TypeScript | **由纯 HTML 改为 Vue 3** |
| 包管理 | pnpm（workspace：`backend/`、`frontend/`） | 纪要未指定 |
| 测试 | Vitest | 纪要未指定 |
| 部署 | Docker + docker-compose | 一致 |
| 协作 | Fork + PR，reviewer 统一审核合并 | 一致 |

## 理由

- **Fastify**：内建 JSON Schema 校验与序列化，契合契约驱动开发；自带 pino 日志。
- **better-sqlite3**：同步 API、零服务进程，适合单机演示与 Docker 单卷持久化。
- **Vue 3 + Vite**：组件化便于多人并行开发页面；前后端同为 TS，可共享契约类型。
- **pnpm workspace**：一个仓库管理前后端依赖，锁文件唯一，Docker 构建可复现。
- **Vitest**：与 Vite 同源、原生支持 TS，前后端共用一套测试工具。

## 影响

- 前端需要构建步骤；生产镜像中由 Fastify 静态托管 `frontend/dist`，对外只暴露一个端口。
- 后续若更换任一选型，需新建 ADR 说明原因，并在本 ADR 状态中标注「被 ADR-XXXX 取代」。
