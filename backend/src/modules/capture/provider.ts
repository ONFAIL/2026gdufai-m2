import type { AiConfig, AiEndpointConfig } from '../../config/ai.ts';
import {
  CaptureProviderError,
  type AudioTranscriptionInput,
  type CaptureAiProvider,
  type TextCompletionInput,
  type VisionCompletionInput
} from './types.ts';

interface OpenAiChatResponse {
  readonly choices?: readonly {
    readonly message?: {
      readonly content?: string | readonly { readonly type?: string; readonly text?: string }[] | null;
    };
  }[];
}

function requireApiKey(endpoint: AiEndpointConfig, capabilityLabel: string): string {
  if (endpoint.apiKey === null || endpoint.apiKey.trim() === '') {
    throw new CaptureProviderError(
      'AI_NOT_CONFIGURED',
      `${capabilityLabel} API Key 未配置，请在服务端环境变量中设置后再调用。`
    );
  }
  return endpoint.apiKey;
}

function extractChoiceContent(payload: unknown): string {
  if (typeof payload !== 'object' || payload === null) {
    throw new CaptureProviderError('AI_INVALID_OUTPUT', 'AI 服务返回了非 JSON 对象。');
  }
  const chat = payload as OpenAiChatResponse;
  const content = chat.choices?.[0]?.message?.content;
  if (typeof content === 'string') {
    if (content.trim() === '') {
      throw new CaptureProviderError('AI_INVALID_OUTPUT', 'AI 服务返回内容为空。');
    }
    return content;
  }
  if (Array.isArray(content)) {
    const joined = content
      .filter((part) => typeof part?.text === 'string')
      .map((part) => part.text)
      .join('');
    if (joined.trim() !== '') {
      return joined;
    }
  }
  throw new CaptureProviderError('AI_INVALID_OUTPUT', 'AI 服务响应中缺少 choices[0].message.content。');
}

async function fetchWithTimeout(
  fetchFn: typeof fetch,
  url: string,
  init: RequestInit,
  timeoutMs: number
): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetchFn(url, { ...init, signal: controller.signal });
  } catch (error: unknown) {
    if (error instanceof Error && error.name === 'AbortError') {
      throw new CaptureProviderError('AI_UPSTREAM_ERROR', `AI 服务请求超时（>${timeoutMs}ms）。`);
    }
    throw new CaptureProviderError('AI_UPSTREAM_ERROR', '连接 AI 服务失败，请检查网络与服务地址。');
  } finally {
    clearTimeout(timer);
  }
}

async function parseJsonResponse(response: Response, label: string): Promise<unknown> {
  if (!response.ok) {
    const rawDetail = await response.text().catch(() => '');
    const snippet = rawDetail.replace(/\s+/g, ' ').slice(0, 160);
    throw new CaptureProviderError(
      'AI_UPSTREAM_ERROR',
      `${label} 服务返回 HTTP ${response.status}${snippet ? `: ${snippet}` : ''}`,
      response.status
    );
  }
  try {
    return (await response.json()) as unknown;
  } catch {
    throw new CaptureProviderError('AI_INVALID_OUTPUT', `${label} 服务响应不是合法的 JSON。`);
  }
}

/**
 * 基于 Node 22 原生 fetch 实现 OpenAI 兼容协议适配器，见 ADR-0002。
 * 支持 Chat Completions（文字/追问）、Vision（小票图片）与 /audio/transcriptions（语音）。
 */
export function createOpenAiCompatibleProvider(
  config: AiConfig,
  fetchFn: typeof fetch = globalThis.fetch
): CaptureAiProvider {
  async function callChatCompletions(
    endpoint: AiEndpointConfig,
    label: string,
    messages: readonly Record<string, unknown>[]
  ): Promise<string> {
    const apiKey = requireApiKey(endpoint, label);
    const response = await fetchWithTimeout(
      fetchFn,
      `${endpoint.baseUrl}/chat/completions`,
      {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          authorization: `Bearer ${apiKey}`
        },
        body: JSON.stringify({
          model: endpoint.model,
          temperature: 0,
          response_format: { type: 'json_object' },
          messages
        })
      },
      config.timeoutMs
    );
    const payload = await parseJsonResponse(response, label);
    return extractChoiceContent(payload);
  }

  return {
    async completeJson(input: TextCompletionInput): Promise<string> {
      return callChatCompletions(config.llm, 'LLM 文本抽取', [
        { role: 'system', content: input.systemPrompt },
        { role: 'user', content: input.userPrompt }
      ]);
    },

    async completeVisionJson(input: VisionCompletionInput): Promise<string> {
      // Base64 仅用于服务端出站多模态请求，绝不写入 sourceRef 或日志。
      const dataUrl = `data:${input.mimeType};base64,${Buffer.from(input.imageBytes).toString('base64')}`;
      return callChatCompletions(config.ocr, 'OCR 小票识别', [
        { role: 'system', content: input.systemPrompt },
        {
          role: 'user',
          content: [
            { type: 'text', text: input.userPrompt },
            { type: 'image_url', image_url: { url: dataUrl } }
          ]
        }
      ]);
    },

    async transcribeAudio(input: AudioTranscriptionInput): Promise<string> {
      const apiKey = requireApiKey(config.asr, 'ASR 语音转写');
      const form = new FormData();
      const audioBlob = new Blob([new Uint8Array(input.audioBytes)], { type: input.mimeType });
      form.append('file', audioBlob, input.filename);
      form.append('model', config.asr.model);

      const response = await fetchWithTimeout(
        fetchFn,
        `${config.asr.baseUrl}/audio/transcriptions`,
        {
          method: 'POST',
          headers: {
            authorization: `Bearer ${apiKey}`
          },
          body: form
        },
        config.timeoutMs
      );

      if (!response.ok) {
        const rawDetail = await response.text().catch(() => '');
        const snippet = rawDetail.replace(/\s+/g, ' ').slice(0, 160);
        throw new CaptureProviderError(
          'AI_UPSTREAM_ERROR',
          `ASR 语音转写服务返回 HTTP ${response.status}${snippet ? `: ${snippet}` : ''}`,
          response.status
        );
      }

      const contentType = response.headers.get('content-type') ?? '';
      if (contentType.includes('application/json')) {
        const payload = (await response.json().catch(() => null)) as { text?: unknown } | null;
        if (payload !== null && typeof payload.text === 'string') {
          return payload.text;
        }
        throw new CaptureProviderError('AI_INVALID_OUTPUT', 'ASR 服务 JSON 响应缺少 text 字段。');
      }

      const textBody = await response.text();
      try {
        const parsed = JSON.parse(textBody) as { text?: unknown };
        if (typeof parsed === 'object' && parsed !== null && typeof parsed.text === 'string') {
          return parsed.text;
        }
      } catch {
        return textBody;
      }
      return textBody;
    }
  };
}
