# 协作指南

## 1. 仓库与分支模型（Fork + PR）

```text
upstream（团队主仓库）main  ←  PR  ←  origin（个人 fork）feat/xxx
```

首次配置：

```bash
git clone https://github.com/<你的-github-id>/2026gdufai.git
cd 2026gdufai
git remote add upstream https://github.com/Tarnishedtaffy/2026gdufai.git
pnpm install
cp .env.example .env   # Windows PowerShell: Copy-Item .env.example .env
```

日常：

```bash
git fetch upstream
git switch -c feat/m2-stats-api upstream/main
# ……开发、测试、写日志……
git push -u origin feat/m2-stats-api
# 在 GitHub 上向 upstream/main 发起 PR
```

- `main` 只接受 PR 合并，不直接推送（reviewer 汇总日志除外）。
- 一个 PR 只做一件事，建议不超过约 400 行有效改动；大功能拆成多个 PR。
- PR 合并前先 rebase 到最新 `upstream/main`，保证线性历史。

## 2. 分支命名

`<类型>/<模块>-<简述>`，类型与 commit 类型一致，模块取 `m1`–`m4`、`fe`、`infra`、`docs`。

示例：`feat/m1-receipt-ocr`、`fix/m2-recent7-bucket`、`docs/glossary-budget`、`chore/infra-docker`。

## 3. Commit 规范（Conventional Commits）

```text
<type>(<scope>): <中文或英文简述>

[可选正文：为什么改、怎么改]

[可选脚注：Refs #12 / BREAKING CHANGE: ...]
```

| type | 用途 |
|---|---|
| `feat` | 新功能 |
| `fix` | 修复缺陷 |
| `docs` | 只改文档（含日志） |
| `refactor` | 不改行为的重构 |
| `test` | 测试 |
| `chore` | 构建、依赖、配置 |
| `perf` | 性能 |

scope 取 `m1`、`m2`、`m3`、`m4`、`fe`、`infra`、`contract`、`glossary`、`agent-logs`。

示例：`feat(m2): 实现 recent7 统计维度`、`docs(agent-logs): summarize #12`。

粒度要求：每个 commit 能独立说明一件事；不在最后一天一次性提交（考核明确要求）。

## 4. PR 流程

1. 按 [PR 模板](.github/pull_request_template.md) 填写；关联 issue 用 `Closes #N`。
2. CI / 本地检查通过：`pnpm -r typecheck && pnpm -r lint && pnpm -r test`。
3. 涉及他人模块或共享目录时 @ 对应负责人，需其认可。
4. reviewer 审核合并，合并方式 **Squash and merge**（标题沿用 Conventional Commits 格式）。
5. 合并后 reviewer 的代理更新 `docs/agent-logs/SUMMARY.md`。

## 5. 接口契约变更

1. 开 issue，选「契约变更」模板，写清字段、语义、影响的模块。
2. 契约维护模块（当前为 M2）在 issue 中确认。
3. 同一 PR 内同时修改契约文档、实现代码与 GLOSSARY；破坏性变更升主版本号（`contract v2`）并在群里通知。

## 6. 密钥与隐私

- `.env` 不提交；新增变量同步到 `.env.example`（占位值）与 README。
- 提交前自查：`git diff --cached` 中没有 Key、Token、真实姓名、学号、手机号。
- 万一密钥进入历史：立即在服务商处作废该密钥并通知 reviewer，作废优先于清理历史。

## 7. 沟通

- 需求、契约、分工的结论以仓库文档为准；群聊结论需在 24 小时内落到 issue 或文档。
- 联调问题带上 `batchId` / `recordId` / 接口返回原文。
