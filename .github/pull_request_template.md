## 改动说明

<!-- 做了什么、为什么做。关联 issue：Closes #N -->

## 模块与影响范围

- 模块：M1 / M2 / M3 / M4 / 前端 / infra / docs
- [ ] 只改动了本人模块
- [ ] 改动了他人模块或共享目录（已 @ 对应负责人：）
- [ ] 改动了接口契约（已有已确认的「契约变更」issue：#）
- [ ] 新增 / 修改了术语（已同步 `docs/GLOSSARY.md`）
- [ ] 新增环境变量（已同步 `.env.example` 与 README）

## 验证

<!-- 粘贴实际运行的命令与结果摘要 -->

- [ ] `pnpm -r typecheck` 通过
- [ ] `pnpm -r lint` 通过
- [ ] `pnpm -r test` 通过
- [ ] 影响启动 / 依赖时：`docker compose up --build` 可正常启动

## AI 辅助记录

- 个人日志条目编号：`LOG-<github-id>-YYYYMMDD-NN`
- [ ] 日志条目已包含在本 PR 中

## 安全自查

- [ ] diff 中没有 API Key、Token、`.env` 内容
- [ ] 没有真实姓名、学号、手机号等个人信息；测试数据均为虚构
