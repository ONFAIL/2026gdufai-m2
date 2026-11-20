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

const DEEPSEEK_ASR_MAX_BYTES = 8 * 1024 * 1024;
const DEEPSEEK_ASR_MAX_DURATION_SECONDS = 120;
const DEEPSEEK_ASR_MIMES = new Set(['audio/wav', 'audio/x-wav', 'audio/ogg']);

const MIME_TO_IMAGE_EXT: ReadonlyMap<string, string> = new Map([
  ['image/jpeg', 'jpg'],
  ['image/jpg', 'jpg'],
  ['image/png', 'png'],
  ['image/webp', 'webp']
]);

function readAsciiFourCC(bytes: Uint8Array, offset: number): string {
  return String.fromCharCode(
    bytes[offset] ?? 0,
    bytes[offset + 1] ?? 0,
    bytes[offset + 2] ?? 0,
    bytes[offset + 3] ?? 0
  );
}

/** 解析标准 RIFF/WAVE 头并计算音频时长（秒）；非完整 WAV 容器时返回 null。 */
function estimateWavDurationSeconds(bytes: Uint8Array): number | null {
  if (bytes.byteLength < 12) {
    return null;
  }
  if (readAsciiFourCC(bytes, 0) !== 'RIFF' || readAsciiFourCC(bytes, 8) !== 'WAVE') {
    return null;
  }

  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  let offset = 12;
  let byteRate: number | null = null;
  let dataBytes: number | null = null;

  while (offset + 8 <= bytes.byteLength) {
    const chunkId = readAsciiFourCC(bytes, offset);
    const chunkSize = view.getUint32(offset + 4, true);
    const dataStart = offset + 8;

    if (chunkId === 'fmt ' && chunkSize >= 16 && dataStart + 16 <= bytes.byteLength) {
      const rate = view.getUint32(dataStart + 8, true);
      if (rate > 0) {
        byteRate = rate;
      }
    } else if (chunkId === 'data') {
      dataBytes = Math.min(chunkSize, Math.max(0, bytes.byteLength - dataStart));
    }

    if (byteRate !== null && dataBytes !== null) {
      return dataBytes / byteRate;
    }

    const paddedSize = chunkSize + (chunkSize % 2);
    if (paddedSize > bytes.byteLength - dataStart) {
      break;
    }
    offset = dataStart + paddedSize;
  }

  return null;
}

/**
 * 调用 DeepSeek 专用 OCR 工具端点（POST /v1/tools/ocr）。
 * 按官方文档发送 multipart/form-data（purpose + file）并拼接 pages[].text。
 */
export async function callDeepSeekOcr(
  requestJson: EndpointJsonRequester,
  endpoint: OcrEndpointConfig,
  input: VisionCompletionInput
): Promise<string> {
  const normalizedMime = input.mimeType.split(';')[0]?.trim().toLowerCase() ?? '';
  const ext = MIME_TO_IMAGE_EXT.get(normalizedMime) ?? 'png';
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
 * 按官方文档上传 16-bit PCM WAV 或 Ogg Opus 音频并返回识别文本；
 * 本地预检格式、8 MiB 上限与 WAV ≤ 120 秒时长，Ogg Opus 时长由上游与后续路由层进一步约束。
 */
export async function callDeepSeekAsr(
  requestJson: EndpointJsonRequester,
  endpoint: AsrEndpointConfig,
  input: AudioTranscriptionInput
): Promise<string> {
  const normalizedMime = input.mimeType.split(';')[0]?.trim().toLowerCase() ?? '';
  if (!DEEPSEEK_ASR_MIMES.has(normalizedMime)) {
    throw new CaptureProviderError(
      'UPLOAD_UNSUPPORTED_TYPE',
      'DeepSeek ASR 仅支持 16-bit PCM WAV 或 Ogg Opus 音频格式。'
    );
  }
  if (input.audioBytes.byteLength > DEEPSEEK_ASR_MAX_BYTES) {
    throw new CaptureProviderError(
      'UPLOAD_TOO_LARGE',
      'DeepSeek ASR 单文件大小上限为 8 MiB。'
    );
  }
  if (normalizedMime === 'audio/wav' || normalizedMime === 'audio/x-wav') {
    const durationSeconds = estimateWavDurationSeconds(input.audioBytes);
    if (durationSeconds !== null && durationSeconds > DEEPSEEK_ASR_MAX_DURATION_SECONDS) {
      throw new CaptureProviderError(
        'UPLOAD_TOO_LARGE',
        'DeepSeek ASR 单条语音时长上限为 120 秒。'
      );
    }
  }

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
