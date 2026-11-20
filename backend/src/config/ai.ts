/** 单个 OpenAI 兼容服务端点配置。 */
export interface AiEndpointConfig {
  readonly baseUrl: string;
  readonly apiKey: string | null;
  readonly model: string;
}

/** M1/M3 外部 AI 服务配置。未配置密钥时 apiKey 为 null，运行期显式报错。 */
export interface AiConfig {
  readonly llm: AiEndpointConfig;
  readonly ocr: AiEndpointConfig;
  readonly asr: AiEndpointConfig;
  readonly timeoutMs: number;
}

const DEFAULT_BASE_URL = 'https://api.openai.com/v1';
const DEFAULT_LLM_MODEL = 'gpt-4o-mini';
const DEFAULT_DEEPSEEK_BASE_URL = 'https://api.deepseek.com/v1';
const DEFAULT_DEEPSEEK_MODEL = 'deepseek-chat';
const DEFAULT_ASR_MODEL = 'whisper-1';
const DEFAULT_TIMEOUT_MS = 30_000;

function readPositiveTimeoutMs(value: string | undefined): number {
  if (value === undefined || value.trim() === '') {
    return DEFAULT_TIMEOUT_MS;
  }
  const trimmed = value.trim();
  if (!/^\d+$/.test(trimmed)) {
    throw new Error(`环境变量 AI_TIMEOUT_MS 必须是正整数，当前值: ${value}`);
  }
  const parsed = Number.parseInt(trimmed, 10);
  if (!Number.isSafeInteger(parsed) || parsed <= 0) {
    throw new Error(`环境变量 AI_TIMEOUT_MS 必须是正整数，当前值: ${value}`);
  }
  return parsed;
}

function normalizeApiKey(value: string | undefined, fallback: string | null = null): string | null {
  if (value === undefined) {
    return fallback;
  }
  const trimmed = value.trim();
  if (trimmed === '' || trimmed === 'change-me') {
    return fallback;
  }
  return trimmed;
}

function normalizeBaseUrl(value: string | undefined, fallback: string, name: string): string {
  if (value === undefined || value.trim() === '') {
    return fallback;
  }
  const trimmed = value.trim().replace(/\/+$/, '');
  if (!/^https?:\/\//i.test(trimmed)) {
    throw new Error(`环境变量 ${name} 必须以 http:// 或 https:// 开头，当前值: ${value}`);
  }
  try {
    new URL(trimmed);
  } catch {
    throw new Error(`环境变量 ${name} 不是合法的 URL，当前值: ${value}`);
  }
  return trimmed;
}

function normalizeModel(value: string | undefined, fallback: string): string {
  if (value === undefined || value.trim() === '') {
    return fallback;
  }
  return value.trim();
}

/**
 * 读取并校验外部 AI 服务端点配置。
 * 未显式配置 LLM_API_KEY 时支持回退读取 DEEPSEEK_API_KEY（默认 https://api.deepseek.com/v1 + deepseek-chat）；
 * OCR 与 ASR 未单独配置时回退复用 LLM 的地址和密钥。
 */
export function loadAiConfig(env: NodeJS.ProcessEnv = process.env): AiConfig {
  const explicitLlmKey = normalizeApiKey(env.LLM_API_KEY, null);
  const deepseekKey = explicitLlmKey === null ? normalizeApiKey(env.DEEPSEEK_API_KEY, null) : null;
  const usingDeepSeekFallback = deepseekKey !== null;

  const llm: AiEndpointConfig = {
    baseUrl: normalizeBaseUrl(
      env.LLM_API_BASE_URL,
      usingDeepSeekFallback ? DEFAULT_DEEPSEEK_BASE_URL : DEFAULT_BASE_URL,
      'LLM_API_BASE_URL'
    ),
    apiKey: explicitLlmKey ?? deepseekKey,
    model: normalizeModel(
      env.LLM_MODEL,
      usingDeepSeekFallback ? DEFAULT_DEEPSEEK_MODEL : DEFAULT_LLM_MODEL
    )
  };
  const ocr: AiEndpointConfig = {
    baseUrl: normalizeBaseUrl(env.OCR_API_BASE_URL, llm.baseUrl, 'OCR_API_BASE_URL'),
    apiKey: normalizeApiKey(env.OCR_API_KEY, llm.apiKey),
    model: normalizeModel(env.OCR_MODEL, llm.model)
  };
  const asr: AiEndpointConfig = {
    baseUrl: normalizeBaseUrl(env.ASR_API_BASE_URL, llm.baseUrl, 'ASR_API_BASE_URL'),
    apiKey: normalizeApiKey(env.ASR_API_KEY, llm.apiKey),
    model: normalizeModel(env.ASR_MODEL, DEFAULT_ASR_MODEL)
  };
  return {
    llm,
    ocr,
    asr,
    timeoutMs: readPositiveTimeoutMs(env.AI_TIMEOUT_MS)
  };
}
