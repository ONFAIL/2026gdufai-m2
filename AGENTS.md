# AGENTS.md

本仓库是 2026 GDUF AI Studio 考核「方向一 · 选题 A：个人记账与消费分析 AI 助手」的团队协作仓库。
所有协作者的 AI 编码代理（Claude Code、Codex、Cursor、Antigravity 等）在本仓库工作时都必须遵守本文件。
`CLAUDE.md` 只是本文件的入口，规则以本文件为唯一来源。

## 1. 开工前（每次会话必做）

1. **确认身份**：弄清你在替哪位协作者工作（GitHub 用户名）以及对应模块，查 [README.md 的团队分工](README.md#团队分工)。不确定就问人，不要猜。
   完成标准：你能说出「我是 `<github-id>` 的代理，负责 `<模块>`，日志写入 `docs/agent-logs/<github-id>.md`」。
2. **同步上游**：`git fetch upstream && git rebase upstream/main`（Fork 模式，见 [CONTRIBUTING.md](CONTRIBUTING.md)）。
3. **按任务读材料**：
   - 任何代码或文档改动 → [docs/GLOSSARY.md](docs/GLOSSARY.md)（术语与标识符必须与它一致）
   - 涉及模块间调用、接口字段、反馈码、金额/时间口径 → [docs/contracts/module2-interface-v1.md](docs/contracts/module2-interface-v1.md)
   - 新建文件、目录、模块，或跨模块改动 → [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md)
   - 写代码 → [docs/CODING_STANDARDS.md](docs/CODING_STANDARDS.md)
   - 技术选型疑问 → [docs/decisions/](docs/decisions/)

## 2. 硬性规则

- **密钥只走环境变量**：真实 API Key、Token、邮箱密码只放本地 `.env`（已被 `.gitignore` 忽略），仓库里只维护 `.env.example` 的占位值。发现任何文件里出现真实密钥，立刻停下并告诉人。
- **个人信息不进仓库**：提交内容（代码、日志、测试数据、截图）只使用 GitHub 用户名和虚构数据，真实姓名、学号、手机号、QQ/微信号一律不写。
- **在自己的模块内改动**：只修改本人模块目录和本人日志文件。确需改动他人模块或共享目录（`backend/src/shared/`、`docs/contracts/`、根目录配置）时，在 PR 描述中单列说明，并 @ 对应负责人。
- **接口契约走变更流程**：`docs/contracts/` 下的契约字段只增不删、语义不变。需要新字段/新接口时，先开 `contract-change` issue，由契约维护模块确认后再改代码。
- **口径统一**：金额入站（M1→M2 的 `amount`）单位是元；入库与所有出站接口用整数「分」（`*Cents`）。时间一律 ISO-8601 带 `+08:00`，统计按 `Asia/Shanghai`。缺失值传 `null`，不用 `0`、`""`、`"未知"` 填充。
- **代码风格**：UTF-8 + LF；英文语义命名（不用拼音、不用无意义缩写）；关键函数与接口写 JSDoc/TSDoc。
- **Git 安全**：只在自己 fork 的功能分支上提交；`push --force` 仅限自己的功能分支且用 `--force-with-lease`；`reset --hard`、`clean -fd`、删除分支、改写 `main` 历史之前先征得人同意。

## 3. 工作流程

1. 从最新 `upstream/main` 拉功能分支，命名见 CONTRIBUTING.md（例：`feat/m2-stats-api`）。
2. 实现改动，同步补测试。新增环境变量必须同步写进 `.env.example` 和 README。
3. 本地验证，命令以各包 `package.json` 的 scripts 为准，通常为：
   ```bash
   pnpm -r typecheck
   pnpm -r lint
   pnpm -r test
   ```
   改动影响启动方式或依赖时，再跑一次 `docker compose up --build` 确认能起服务。
4. **写日志**：在 `docs/agent-logs/<github-id>.md` 末尾追加本次会话条目，格式见 [docs/agent-logs/README.md](docs/agent-logs/README.md)。
5. 按 Conventional Commits 提交，推送到 fork，用 PR 模板发起 PR 到上游 `main`。

完成标准（全部满足才算完成）：typecheck / lint / test 全绿；改动涉及的术语与 GLOSSARY 一致；日志条目已追加且与本次 PR 关联；PR 模板每一项都已填写或注明「不适用」。

## 4. 日志规则

- 每位协作者的代理**只追加**自己的 `docs/agent-logs/<github-id>.md`，按时间顺序写在文件末尾，已提交的条目不改写（更正用新条目说明）。
- `docs/agent-logs/SUMMARY.md` 只由 reviewer 的代理维护；其他代理只读。
- reviewer 的代理在合并 PR 后执行 [docs/agent-logs/README.md 的汇总流程](docs/agent-logs/README.md#reviewer-汇总流程)。

## 5. 遇到不确定时

需求、契约、分工有歧义时，停下来问人，并把问题与结论记进日志的「决策」一栏。不要在代码里自行约定新的跨模块口径。
