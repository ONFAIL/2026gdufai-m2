# 问题记录与未完成项

> 考核交付物第 5 项要求「遇到的问题与解决方式、未完成的部分及原因」。各模块负责人随开发进度追加，答辩前由 reviewer 整理。

## 1. 问题与解决

| 编号 | 日期 | 模块 | 问题描述 | 原因分析 | 解决方式 | 关联 PR / 日志 |
|---|---|---|---|---|---|---|
| P-001 | 2026-11-16 | M2 | `pnpm install` 报 `ERR_PNPM_IGNORED_BUILDS`（esbuild） | pnpm 10+ 默认拦截依赖安装脚本；esbuild 需要 postinstall 下载平台二进制 | `pnpm-workspace.yaml` 增加 `onlyBuiltDependencies: esbuild` 后重装 | LOG-Z_Wen-20261116-02 |
| P-002 | 2026-11-16 | M2 | 担心 `better-sqlite3` 在 Node 26 无预编译包 | 版本 12 的预编译按 Node ABI 发布，Node 26 ABI 147 较新 | 实测 v13.2.0 自带 NAPI `prebuilds/win32-x64.node`，无需编译 | LOG-Z_Wen-20261116-02 |

填写要点：写清现象 → 根因 → 方案 → 效果；涉及 AI 能力边界（模型输出不稳定、OCR 识别错误等）的问题，注明采用了哪种约束或绕过手段。

## 2. 未完成项

| 功能 | 完成程度 | 未完成原因 | 后续计划 |
|---|---|---|---|
| | | | |
