import type { AsrEndpointConfig, OcrEndpointConfig } from '../../config/ai.ts';
import {
  CaptureProviderError,
  type AudioTranscriptionInput,
  type VisionCompletionInput
} from './types.ts';

/** Provider 内部统一 JSON 请求回调，复用超时与鉴权校验。 */
export type EndpointJsonRequester = (
  endpoint: OcrEndpointConfig | AsrEndpointConfig,
  path: string,
  label: string,
  initBuilder: (apiKey: string) => RequestInit
) => Promise<unknown>;

const MIME_TO_IMAGE_EXT: Readonly<Record<string, string>> = {
  'image/jpeg': 'jpg',
  'image/jpg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp'
};

/**
 * 调用 DeepSeek 专用 OCR 工具端点（POST /v1/tools/ocr）。
 * 按官方文档发送 multipart/form-data（purpose + file）并拼接 pages[].text。
 */
export async function callDeepSeekOcr(
  requestJson: EndpointJsonRequester,
  endpoint: OcrEndpointConfig,
  input: VisionCompletionInput
): Promise<string> {
  const ext = MIME_TO_IMAGE_EXT[input.mimeType.toLowerCase()] ?? 'png';
  const form = new FormData();
  form.append('purpose', 'text_recognition');
  form.append(
    'file',
    new Blob([new Uint8Array(input.imageBytes)], { type: input.mimeType }),
    `receipt.${ext}`
  );

  const payload = await requestJson(endpoint, '/tools/ocr', 'OCR 小票识别', (apiKey) => ({
    method: 'POST',
    headers: { authorization: `Bearer ${apiKey}` },
    body: form
  }));

  if (
    typeof payload !== 'object' ||
    payload === null ||
    !Array.isArray((payload as { pages?: unknown }).pages)
  ) {
    throw new CaptureProviderError('AI_INVALID_OUTPUT', 'DeepSeek OCR 响应缺少 pages 数组。');
  }

  const pages = (payload as { pages: readonly { text?: unknown }[] }).pages;
  return pages
    .map((page) => (typeof page?.text === 'string' ? page.text.trim() : ''))
    .filter((text) => text !== '')
    .join('\n')
    .trim();
}

/**
 * 调用 DeepSeek 专用语音转写工具端点（POST /v1/tools/asr）。
 * 按官方文档上传 16-bit PCM WAV 或 Ogg Opus 音频并返回识别文本。
 */
export async function callDeepSeekAsr(
  requestJson: EndpointJsonRequester,
  endpoint: AsrEndpointConfig,
  input: AudioTranscriptionInput
): Promise<string> {
  const form = new FormData();
  form.append(
    'file',
    new Blob([new Uint8Array(input.audioBytes)], { type: input.mimeType }),
    input.filename
  );

  const payload = await requestJson(endpoint, '/tools/asr', 'ASR 语音转写', (apiKey) => ({
    method: 'POST',
    headers: { authorization: `Bearer ${apiKey}` },
    body: form
  }));

  if (
    typeof payload !== 'object' ||
    payload === null ||
    typeof (payload as { text?: unknown }).text !== 'string'
  ) {
    throw new CaptureProviderError('AI_INVALID_OUTPUT', 'DeepSeek ASR 响应缺少 text 字段。');
  }

  return (payload as { text: string }).text;
}
