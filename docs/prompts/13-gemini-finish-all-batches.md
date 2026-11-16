# 给 Gemini：第 1 批复检 → 做完第 2–5 批

> 用途：把下面「提示词正文」整段粘回原来的 Gemini 代码生成会话。
> 复检依据：10 号第三节契约原文 + 12 号代码生成指令（含审议修正 B1/N1–N4）。
> 复检对象：第 1 批 `package.json` / `vite.config.ts` / `tsconfig.json` / `tsconfig.node.json` / `env.d.ts`。
> 实测环境：Node 22.22.2，npm 10.9.7；临时目录 `npm install` 后逐脚本验证。
> 版本：v1（2026-11-16）

---

## 提示词正文（从下一行开始复制）

你正在延续 Vue 3 前端框架的代码生成任务。我对第 1 批 5 个配置文件做了实测复检（真实安装依赖、逐脚本跑通，不是看代码猜）。

**总体结论：第 1 批整体结构正确，禁止整体重写。** 只有 1 处必须修正（依赖版本组合会让 `test` 脚本必现失败）。修完后**直接连续做完第 2、3、4、5 批**，中间不要停下来等我回复「继续」——这次一次交付全部剩余批次。

### 一、必须修正（1 处，阻塞）

#### 修正 1 — `package.json` 的 `vitest` 版本与 `vite 6` 不兼容，`test` 脚本必现失败

你第 1 批写的：

```json
"vite": "^6.0.5",
"vitest": "^2.1.8",
```

实测结果（Node 22 + npm 10 真实安装）：

```text
npm ls vite vitest
├── vite@6.4.6                 ← 顶层
└─┬ vitest@2.1.9
  └─┬ vite-node@2.1.9
    └── vite@5.4.21            ← 第二份 vite，被塞进 vitest 内部

npx vitest run
 FAIL  smoke.test.ts
Error: The service was stopped
  Plugin: vite:esbuild
 Test Files  1 failed (1)
```

即使只写一个 `expect(1+1).toBe(2)` 的最小测试也无法运行。原因：`vitest 2.x` 只支持 `vite 5`，与 `vite 6` 并存时会加载两份 vite、内部 esbuild 服务崩溃。

**改法**：把 `devDependencies` 里的 `"vitest": "^2.1.8"` 改为 `"vitest": "^3.2.0"`。我已实测：升级后装到 `vitest@3.2.7`，`vite` 收敛为单一 `6.4.6`，最小测试通过（`1 passed`）。

依赖白名单仍是同一批 7 个依赖——只是升版本，不新增、不删减，不违反约束 2。

### 二、复核通过，原样保留（不要改）

- `package.json`：`private` / `type: module` / 四个脚本齐全；`build` 前置 `vue-tsc --noEmit` 正确。除修正 1 外全部保留。
- `vite.config.ts`：`plugins:[vue()]`、`port:5173`、`outDir:'dist'` 正确；实测 `npx tsc -p tsconfig.node.json` 通过并产出 `vite.config.d.ts`。
- `tsconfig.json`：`strict` + 5 项额外严格检查齐全，`noEmit` 与 `allowImportingTsExtensions` 配对正确；`npx vue-tsc --noEmit` 实测退出码 0。
- `tsconfig.node.json`：`composite` + `emitDeclarationOnly` + `outDir` 组合实测无 TS6310，正确。
- `env.d.ts`：`VITE_USE_MOCK` / `VITE_API_BASE_URL` 声明正确。

### 三、跨批约定（12 号指令已写，这里再强调容易漏的）

1. **`mock` 开关读 `import.meta.env.VITE_USE_MOCK`**（`env.d.ts` 已声明这个键），不要另造 `USE_MOCK` 常量名；默认 `true`，`VITE_USE_MOCK=false` 时走真实 `request()`。
2. **`vite.config.ts` 的 `/api` proxy 目标 `http://localhost:3000` 已保留**——这是你第 1 批的决定，仓库文档没有定义后端 dev 端口，我记为未决观察但不要求你改；mock 模式下不走 proxy，不影响演示。
3. **B1 仍然生效**：`status === 'duplicate'` 按成功回执处理、复用 `transactionId`、不报错不阻断；重发沿用原 `idempotencyKey`。这是上一轮审议唯一的阻塞修正，第 3 批 `mock/import.ts` 里必须落实。
4. **N1**：`ImportResult` 是契约 §1.4 的**整个响应对象** `{ batchId, results }`，`results` 元素叫 `ImportResultItem`；`importBatch()` 返回完整响应，不取首项。
5. **N3**：所有表单控件配显式 `<label for>`，文件输入不得用 `hidden`。
6. **N4**：每个 View 请求失败给可见提示 + 重试按钮，与空态互斥。

### 四、本轮交付范围（一次做完 4 批）

严格按 12 号指令第四节的批次顺序连续输出：

| 批次 | 文件 |
| --- | --- |
| 第 2 批 | `src/styles/tokens.css`、`src/types/contract.ts`、`src/utils/money.ts`、`src/utils/datetime.ts` |
| 第 3 批 | `src/api/request.ts`、`src/api/index.ts`、`src/mock/data.ts`、`src/mock/db.ts`、`src/mock/import.ts` |
| 第 4 批 | `src/main.ts`、`src/App.vue`、`src/router/index.ts`、`src/composables/useCategories.ts`、`src/components/` 5 个组件、`index.html` |
| 第 5 批 | `src/views/` 4 个 View 骨架、`frontend/README.md` |

交付纪律（与 12 号一致，此处不重复解释）：

- 每个文件以 `// FILE: <完整路径>` 开头，后接**完整代码块**，不许「同上」「略」「按方案实现」。
- **单文件 ≤ 200 行**（`<script setup>` + `<template>` + `<style scoped>` 三块合计），超了就抽 composable / 子组件。
- 每批结束写一行「第 N 批完成」，然后**直接继续下一批**，不要停下来等回复。
- 全部交付后写一行「第 2–5 批全部完成」，停下。
- 旧 `frontend/` 的 HTML/JS 归档由我在合并时处理，**你不要删除旧文件、不要输出归档部分**。

### 五、每批写完的自查（逐条在心里过，不输出）

1. `fetch` 只在 `src/api/request.ts` 的 `request()` 里出现一次？
2. 有 `v-html` / `innerHTML` / 用户数据拼 HTML 吗？（应为 0）
3. CSS 有字面的 `#RRGGBB` 或裸 `px` 间距吗？（应为 0，走 `tokens.css` 的 `var(--xxx)`）
4. 有 `class` 组件、链式高阶、 `enum`、`toISOString()` 吗？（应为 0）
5. 有哪个 `.ts`/`.vue` 三块合计超 200 行吗？
6. 字段名和 12 号第五节速查对得上吗？`duplicate` 按 B1 改了吗？`ImportResult` 取完整响应了吗（N1）？
7. `mock/db.js` 的 `buckets[].categories` 按类别汇总填充了吗？（上一代 P0，不能留空数组）
8. 每个表单控件有 `<label>`、文件输入可键盘聚焦吗（N3）？失败有重试且与空态互斥吗（N4）？

（提示词正文结束）
