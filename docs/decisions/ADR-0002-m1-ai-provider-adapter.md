# ADR-0002：M1 多模态 AI 能力统一采用 OpenAI 兼容协议适配

- **状态**：已采纳
- **日期**：2026-11-19
- **决策者**：`mianyoubiaoqing`（M1 #6 识别与抽取端）

## 背景

M1（#6）需要同时承载三类外部 AI 能力：
1. 自然语言单笔/多笔文本抽取与追问补丁抽取；
2. 消费小票/账单截图的视觉识别与结构化抽取（OCR）；
3. 记账语音的自动转写（ASR）。

团队当前约束如下：
- 后端使用 Node.js 22 + TypeScript（strict），`backend/package.json` 仅保留轻量核心依赖，CI 与评审不依赖特定商业厂商的独占 SDK；
- 成员与演示环境可能切换不同模型供应方（如阿里云百炼 DashScope 兼容模式、硅基流动 SiliconFlow、OpenAI 或自部署 vLLM / Faster-Whisper 网关）；
- 编码规范要求调用外部 AI 的代码可依赖注入 stub，单元测试不依赖网络与真实密钥；
- 所有外部 AI 调用与密钥仅存在于服务端（`backend/src/config/`），浏览器不持有任何密钥。

## 备选方案

| 方案 | 优点 | 缺点 |
|---|---|---|
| A. 绑定单一厂商专有 SDK（如各自接入阿里/百度/讯飞专有签名 SDK） | 厂商控制台特性齐全 | 强绑定单家厂商；引入多套鉴权签名与体积依赖；换服务商需重写适配层 |
| B. 文本走 OpenAI SDK，OCR/ASR 分别对接专有 REST API | 可复用部分开源封装 | 增加 `openai` 等外部依赖包；三路协议不统一，环境配置复杂度高 |
| C. 基于 Node 22 原生 `fetch` / `FormData` / `Blob` 实现 OpenAI 兼容协议统一适配，并支持 `OCR_*` / `ASR_*` 独立覆盖 | 零新增运行时依赖；一套配置可接 OpenAI、阿里百炼、硅基流动及本地兼容网关；三路能力也可按需拆到不同供应商；天然易注入 stub `fetch` | 若接入非 OpenAI 兼容协议的纯传统 OCR/ASR 接口，需额外新增适配器实现 `CaptureAiProvider` 接口 |

## 决策

采用 **方案 C**：
1. 在 `backend/src/modules/capture/types.ts` 定义 `CaptureAiProvider` 抽象接口（`completeJson`、`completeVisionJson`、`transcribeAudio`），与抽取逻辑解耦；
2. 默认实现 `createOpenAiCompatibleProvider` 使用 Node 22 原生 `fetch`：
   - 文本与追问抽取：`POST {LLM_API_BASE_URL}/chat/completions`（`response_format: { type: 'json_object' }`，`temperature: 0`）；
   - 小票图像识别：`POST {OCR_API_BASE_URL}/chat/completions`（Vision `image_url` base64 data URL 仅在服务端出站报文中使用，不写入 `sourceRef` 或日志）；
   - 语音转写：`POST {ASR_API_BASE_URL}/audio/transcriptions`（`multipart/form-data` 上传受控落盘音频）；
3. `OCR_*` 与 `ASR_*` 的地址/密钥未单独设置时默认回退复用 `LLM_API_BASE_URL` / `LLM_API_KEY`，避免配置繁琐，同时允许将 OCR/ASR 切换到独立模型或端点。

## 理由

- 阿里百炼（Qwen / Qwen-VL / SenseVoice 兼容接口）、硅基流动（DeepSeek / Qwen2.5-VL / SenseVoiceSmall）、OpenAI 等主流平台均直接支持 `/chat/completions` 与 `/audio/transcriptions` 标准路径，能一次满足评审环境切换需求；
- 不新增 npm 依赖，不改动 `pnpm-lock.yaml` 与 Docker 构建缓存结构；
- `CaptureAiProvider` 抽象保证日后若需接入非兼容协议的专有 ASR/OCR 服务，只需新增一个实现文件，不影响提示词、schema 校验与下游 `CaptureDraft` 交接。

## 影响

- **配置与文档**：在 `.env.example` 与 `README.md` 新增 `OCR_API_BASE_URL`、`OCR_MODEL`、`ASR_API_BASE_URL`、`ASR_MODEL`、`AI_TIMEOUT_MS` 及可选快捷回退 `DEEPSEEK_API_KEY`，并明确 `LLM_*` 与回退规则（未设置 `LLM_API_KEY` 时可自动回退读取 `DEEPSEEK_API_KEY` 并默认使用 `https://api.deepseek.com/v1` / `deepseek-chat`）。
- **M1（#6 / #7）**：抽取服务只产出对齐 `@gduf/capture-flow` 的 `CaptureDraft` / `CaptureDraftPatch`，不修改 M2 入库逻辑或冻结契约；对外 HTTP 上传与抽取端点已另开契约变更议题 [#24](https://github.com/Tarnishedtaffy/2026gdufai/issues/24) 等待 M2 与前端确认后再挂载。
- **M3**：查账模块如后续复用 LLM 配置，可直接从 `loadConfig().ai.llm` 读取，无需重复解析环境变量。
