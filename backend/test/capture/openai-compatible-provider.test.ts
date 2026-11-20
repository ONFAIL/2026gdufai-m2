import { describe, expect, it } from 'vitest';
import { loadAiConfig, loadConfig } from '../../src/config/index.ts';
import {
  CaptureProviderError,
  createOpenAiCompatibleProvider
} from '../../src/modules/capture/index.ts';

describe('OpenAI 兼容与 DeepSeek 工具接口适配器', () => {
  it('loadAiConfig 支持默认值、OCR/ASR 回退、协议自动判别与独立覆盖', () => {
    const fallbackCfg = loadAiConfig({
      LLM_API_BASE_URL: 'https://dashscope.aliyuncs.com/compatible-mode/v1/',
      LLM_API_KEY: 'sk-test-llm',
      LLM_MODEL: 'qwen-plus'
    });
    expect(fallbackCfg).toEqual({
      llm: {
        baseUrl: 'https://dashscope.aliyuncs.com/compatible-mode/v1',
        apiKey: 'sk-test-llm',
        model: 'qwen-plus'
      },
      ocr: {
        baseUrl: 'https://dashscope.aliyuncs.com/compatible-mode/v1',
        apiKey: 'sk-test-llm',
        model: 'qwen-plus',
        protocol: 'openai-vision'
      },
      asr: {
        baseUrl: 'https://dashscope.aliyuncs.com/compatible-mode/v1',
        apiKey: 'sk-test-llm',
        model: 'whisper-1',
        protocol: 'openai-asr'
      },
      timeoutMs: 30_000
    });

    const overrideCfg = loadConfig({
      LLM_API_KEY: 'change-me',
      OCR_API_BASE_URL: 'https://api.siliconflow.cn/v1',
      OCR_API_KEY: 'sk-ocr-only',
      OCR_MODEL: 'Qwen/Qwen2.5-VL-72B-Instruct',
      ASR_API_BASE_URL: 'https://asr.example.com/v1',
      ASR_API_KEY: 'sk-asr-only',
      ASR_MODEL: 'FunAudioLLM/SenseVoiceSmall',
      AI_TIMEOUT_MS: '15000'
    });
    expect(overrideCfg.ai).toEqual({
      llm: {
        baseUrl: 'https://api.openai.com/v1',
        apiKey: null,
        model: 'gpt-4o-mini'
      },
      ocr: {
        baseUrl: 'https://api.siliconflow.cn/v1',
        apiKey: 'sk-ocr-only',
        model: 'Qwen/Qwen2.5-VL-72B-Instruct',
        protocol: 'openai-vision'
      },
      asr: {
        baseUrl: 'https://asr.example.com/v1',
        apiKey: 'sk-asr-only',
        model: 'FunAudioLLM/SenseVoiceSmall',
        protocol: 'openai-asr'
      },
      timeoutMs: 15_000
    });

    const deepseekFallback = loadAiConfig({ DEEPSEEK_API_KEY: 'sk-deepseek-stub' });
    expect(deepseekFallback).toEqual({
      llm: {
        baseUrl: 'https://api.deepseek.com/v1',
        apiKey: 'sk-deepseek-stub',
        model: 'deepseek-flash'
      },
      ocr: {
        baseUrl: 'https://api.deepseek.com/v1',
        apiKey: 'sk-deepseek-stub',
        model: 'deepseek-flash',
        protocol: 'deepseek-ocr'
      },
      asr: {
        baseUrl: 'https://api.deepseek.com/v1',
        apiKey: 'sk-deepseek-stub',
        model: 'whisper-1',
        protocol: 'deepseek-asr'
      },
      timeoutMs: 30_000
    });

    const protocolOverride = loadAiConfig({
      DEEPSEEK_API_KEY: 'sk-deepseek-stub',
      OCR_PROTOCOL: 'openai-vision',
      ASR_PROTOCOL: 'openai-asr'
    });
    expect(protocolOverride.ocr.protocol).toBe('openai-vision');
    expect(protocolOverride.asr.protocol).toBe('openai-asr');

    expect(() => loadAiConfig({ LLM_API_BASE_URL: 'ftp://invalid.example.com' })).toThrow();
    expect(() => loadAiConfig({ AI_TIMEOUT_MS: '0' })).toThrow();
    expect(() => loadAiConfig({ AI_TIMEOUT_MS: '1000ms' })).toThrow();
    expect(() => loadAiConfig({ OCR_PROTOCOL: 'invalid-ocr' })).toThrow();
    expect(() => loadAiConfig({ ASR_PROTOCOL: 'invalid-asr' })).toThrow();
  });

  it('使用 stub fetch 正确调用 OpenAI 兼容文本 JSON、Vision 与 ASR 端点并映射异常', async () => {
    const calls: { url: string; init: RequestInit }[] = [];
    const fakeFetch: typeof fetch = async (input, init = {}) => {
      const url = typeof input === 'string' ? input : input.toString();
      calls.push({ url, init });
      if (url.endsWith('/chat/completions')) {
        return new Response(
          JSON.stringify({
            choices: [{ message: { content: '{"records":[]}' } }]
          }),
          { status: 200, headers: { 'content-type': 'application/json' } }
        );
      }
      if (url.endsWith('/audio/transcriptions')) {
        return new Response(JSON.stringify({ text: '午饭花了25元' }), {
          status: 200,
          headers: { 'content-type': 'application/json' }
        });
      }
      return new Response('not found', { status: 404 });
    };

    const config = loadAiConfig({
      LLM_API_BASE_URL: 'https://llm.example.com/v1',
      LLM_API_KEY: 'sk-llm',
      LLM_MODEL: 'model-text',
      OCR_MODEL: 'model-vision',
      ASR_MODEL: 'model-asr'
    });
    const provider = createOpenAiCompatibleProvider(config, fakeFetch);

    const textRes = await provider.completeJson({
      systemPrompt: 'sys',
      userPrompt: 'usr'
    });
    expect(textRes).toBe('{"records":[]}');
    expect(calls[0]!.url).toBe('https://llm.example.com/v1/chat/completions');
    const textBody = JSON.parse(String(calls[0]!.init.body)) as Record<string, unknown>;
    expect(textBody.model).toBe('model-text');
    expect(textBody.response_format).toEqual({ type: 'json_object' });

    const visionRes = await provider.completeVisionJson({
      systemPrompt: 'sys',
      userPrompt: 'ocr',
      imageBytes: Uint8Array.from([0x89, 0x50, 0x4e, 0x47]),
      mimeType: 'image/png'
    });
    expect(visionRes).toBe('{"records":[]}');
    const visionBody = JSON.parse(String(calls[1]!.init.body)) as {
      model: string;
      messages: { content: unknown }[];
    };
    expect(visionBody.model).toBe('model-vision');
    expect(JSON.stringify(visionBody.messages[1]!.content)).toContain('data:image/png;base64,iVBORw==');

    const asrRes = await provider.transcribeAudio({
      audioBytes: Uint8Array.from([1, 2, 3, 4]),
      mimeType: 'audio/wav',
      filename: 'voice.wav'
    });
    expect(asrRes).toBe('午饭花了25元');
    expect(calls[2]!.url).toBe('https://llm.example.com/v1/audio/transcriptions');
    expect(calls[2]!.init.body).toBeInstanceOf(FormData);
    const form = calls[2]!.init.body as FormData;
    expect(form.get('model')).toBe('model-asr');
    expect(form.get('file')).toBeTruthy();

    const unconfigured = createOpenAiCompatibleProvider(loadAiConfig({}), fakeFetch);
    await expect(
      unconfigured.completeJson({ systemPrompt: 's', userPrompt: 'u' })
    ).rejects.toMatchObject({ code: 'AI_NOT_CONFIGURED' });

    const failingProvider = createOpenAiCompatibleProvider(config, async () =>
      new Response('bad gateway', { status: 502 })
    );
    await expect(
      failingProvider.completeJson({ systemPrompt: 's', userPrompt: 'u' })
    ).rejects.toThrow(CaptureProviderError);
    await expect(
      failingProvider.completeJson({ systemPrompt: 's', userPrompt: 'u' })
    ).rejects.toMatchObject({ code: 'AI_UPSTREAM_ERROR', statusCode: 502 });
  });

  it('使用 stub fetch 正确调用 DeepSeek /v1/tools/ocr 与 /v1/tools/asr，空白 OCR 不再调 LLM', async () => {
    const calls: { url: string; body: unknown }[] = [];
    let ocrMode: 'receipt' | 'blank' = 'receipt';

    const fakeDeepSeekFetch: typeof fetch = async (input, init = {}) => {
      const url = typeof input === 'string' ? input : input.toString();
      calls.push({ url, body: init.body });
      if (url.endsWith('/tools/ocr')) {
        return new Response(
          JSON.stringify({
            pages: [{ index: 0, text: ocrMode === 'receipt' ? '瑞幸咖啡 实付 32.50' : '   ' }]
          }),
          { status: 200, headers: { 'content-type': 'application/json' } }
        );
      }
      if (url.endsWith('/chat/completions')) {
        return new Response(
          JSON.stringify({
            choices: [
              {
                message: {
                  content: JSON.stringify({
                    readable: true,
                    ocrText: '瑞幸咖啡 实付 32.50',
                    records: [
                      {
                        amount: 32.5,
                        merchant: '瑞幸咖啡',
                        occurredAt: null,
                        direction: 'expense',
                        confidence: 0.92,
                        rawText: '瑞幸咖啡 实付 32.50'
                      }
                    ]
                  })
                }
              }
            ]
          }),
          { status: 200, headers: { 'content-type': 'application/json' } }
        );
      }
      if (url.endsWith('/tools/asr')) {
        return new Response(
          JSON.stringify({ request_id: 'req-asr-1', text: '打车三十八块五', duration_ms: 2100 }),
          { status: 200, headers: { 'content-type': 'application/json' } }
        );
      }
      return new Response('not found', { status: 404 });
    };

    const config = loadAiConfig({ DEEPSEEK_API_KEY: 'sk-deepseek-stub' });
    const provider = createOpenAiCompatibleProvider(config, fakeDeepSeekFetch);

    const receiptJson = await provider.completeVisionJson({
      systemPrompt: 'sys-ocr',
      userPrompt: 'usr-ocr',
      imageBytes: Uint8Array.from([0x89, 0x50, 0x4e, 0x47]),
      mimeType: 'image/png'
    });
    expect(JSON.parse(receiptJson)).toMatchObject({ readable: true, ocrText: '瑞幸咖啡 实付 32.50' });
    expect(calls[0]!.url).toBe('https://api.deepseek.com/v1/tools/ocr');
    expect(calls[0]!.body).toBeInstanceOf(FormData);
    expect((calls[0]!.body as FormData).get('purpose')).toBe('text_recognition');
    expect((calls[0]!.body as FormData).get('file')).toBeTruthy();
    expect(calls[1]!.url).toBe('https://api.deepseek.com/v1/chat/completions');
    expect(String(calls[1]!.body)).toContain('瑞幸咖啡 实付 32.50');

    ocrMode = 'blank';
    const callCountBeforeBlank = calls.length;
    const blankJson = await provider.completeVisionJson({
      systemPrompt: 'sys-ocr',
      userPrompt: 'usr-ocr',
      imageBytes: Uint8Array.from([0x89, 0x50, 0x4e, 0x47]),
      mimeType: 'image/png'
    });
    expect(JSON.parse(blankJson)).toMatchObject({ readable: false, records: [] });
    expect(calls.length).toBe(callCountBeforeBlank + 1);

    const asrText = await provider.transcribeAudio({
      audioBytes: Uint8Array.from([1, 2, 3, 4]),
      mimeType: 'audio/wav',
      filename: 'voice.wav'
    });
    expect(asrText).toBe('打车三十八块五');
    const lastCall = calls[calls.length - 1]!;
    expect(lastCall.url).toBe('https://api.deepseek.com/v1/tools/asr');
    expect(lastCall.body).toBeInstanceOf(FormData);
    expect((lastCall.body as FormData).get('file')).toBeTruthy();
    expect((lastCall.body as FormData).get('model')).toBeNull();
  });
});
