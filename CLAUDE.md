# CLAUDE.md

本仓库的代理规则以 `AGENTS.md` 为唯一来源，下面这行会把它完整导入 Claude Code 的上下文：

@AGENTS.md

## Claude Code 补充

- 跨模块或涉及契约的任务，先用 Plan 模式给出方案，经人确认后再改代码。
- 会话结束前确认已按 AGENTS.md 第 4 节写好日志条目；日志中的「工具/模型」一栏填写 `Claude Code / <模型名>`。
- 本地个人偏好写在 `CLAUDE.local.md`（已被 `.gitignore` 忽略），不要提交。
