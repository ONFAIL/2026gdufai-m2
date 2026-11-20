import { describe, expect, it } from 'vitest';
import {
  CaptureProviderError,
  createCaptureExtractor,
  PROMPT_VERSION_TEXT,
  type CaptureAiProvider
} from '../../src/modules/capture/index.ts';

const REFERENCE_TIME = '2026-11-19T12:00:00+08:00';

function createStubProvider(
  completeJson: CaptureAiProvider['completeJson']
): CaptureAiProvider {
  return {
    completeJson,
    completeVisionJson: async () => {
      throw new Error('not expected');
    },
    transcribeAudio: async () => {
      throw new Error('not expected');
    }
  };
}

describe('M1 第一阶段：文字记账抽取', () => {
  it('单笔中文口语表达抽取结构合法草稿', async () => {
    let capturedPrompt = '';
    const extractor = createCaptureExtractor({
      uploadDir: './uploads',
      provider: createStubProvider(async (input) => {
        capturedPrompt = `${input.systemPrompt}\n${input.userPrompt}`;
        return JSON.stringify({
          records: [
            {
              amount: 32.5,
              merchant: '瑞幸咖啡',
              occurredAt: '2026-11-19T09:15:00+08:00',
              direction: 'expense',
              confidence: 0.94,
              rawText: '早上瑞幸花了32块5'
            }
          ]
        });
      })
    });

    const outcome = await extractor.extractFromText({
      rawText: '早上瑞幸花了32块5',
      referenceTime: REFERENCE_TIME
    });

    expect(capturedPrompt).toContain(REFERENCE_TIME);
    expect(outcome).toEqual({
      ok: true,
      promptVersion: PROMPT_VERSION_TEXT,
      drafts: [
        {
          amount: 32.5,
          merchant: '瑞幸咖啡',
          occurredAt: '2026-11-19T09:15:00+08:00',
          direction: 'expense',
          confidence: 0.94,
          rawText: '早上瑞幸花了32块5',
          modality: 'text',
          sourceRef: null
        }
      ]
    });
  });

  it('一句话多笔消费拆分为多条草稿', async () => {
    const extractor = createCaptureExtractor({
      uploadDir: './uploads',
      provider: createStubProvider(async () =>
        JSON.stringify({
          records: [
            {
              amount: 8,
              merchant: null,
              occurredAt: '2026-11-19T08:00:00+08:00',
              direction: 'expense',
              confidence: 0.9,
              rawText: '早上买包子8元'
            },
            {
              amount: 26.5,
              merchant: '滴滴',
              occurredAt: '2026-11-19T12:00:00+08:00',
              direction: 'expense',
              confidence: 0.88,
              rawText: '中午打车花了26块5'
            }
          ]
        })
      )
    });

    const outcome = await extractor.extractFromText({
      rawText: '早上买包子8元，中午打车花了26块5',
      referenceTime: REFERENCE_TIME
    });

    expect(outcome.ok).toBe(true);
    if (!outcome.ok) return;
    expect(outcome.drafts).toHaveLength(2);
    expect(outcome.drafts[0]).toMatchObject({ amount: 8, rawText: '早上买包子8元' });
    expect(outcome.drafts[1]).toMatchObject({ amount: 26.5, merchant: '滴滴', rawText: '中午打车花了26块5' });
  });

  it('缺失字段与占位词规整为 null，不确定方向不乱猜，明确日期补 T12:00:00+08:00', async () => {
    const extractor = createCaptureExtractor({
      uploadDir: './uploads',
      provider: createStubProvider(async () =>
        JSON.stringify({
          records: [
            {
              amount: 0,
              merchant: '未知',
              occurredAt: '2026-11-18',
              direction: null,
              confidence: 0.65,
              rawText: '昨天转给朋友一笔钱，还没定多少'
            }
          ]
        })
      )
    });

    const outcome = await extractor.extractFromText({
      rawText: '昨天转给朋友一笔钱，还没定多少',
      referenceTime: REFERENCE_TIME
    });

    expect(outcome.ok).toBe(true);
    if (!outcome.ok) return;
    expect(outcome.drafts[0]).toEqual({
      amount: null,
      merchant: null,
      occurredAt: '2026-11-18T12:00:00+08:00',
      direction: null,
      confidence: 0.65,
      rawText: '昨天转给朋友一笔钱，还没定多少',
      modality: 'text',
      sourceRef: null
    });
  });

  it('未提及时间保持 null，UTC Z 时间统一换算为 +08:00，并剥离模型夹带身份字段', async () => {
    const extractor = createCaptureExtractor({
      uploadDir: './uploads',
      provider: createStubProvider(async () =>
        // 包含模型擅自夹带的越权字段，应全部由白名单剥离。
        JSON.stringify({
          records: [
            {
              amount: 15,
              merchant: '蜜雪冰城',
              occurredAt: null,
              direction: 'expense',
              confidence: 0.9,
              rawText: '买奶茶15块',
              userId: 'evil_user',
              recordId: 'r_fake',
              idempotencyKey: 'k_fake',
              originalTransactionId: 'tx_fake'
            },
            {
              amount: 50,
              merchant: null,
              occurredAt: '2026-11-19T01:30:00Z',
              direction: null,
              confidence: 0.8,
              rawText: '前天买衣服退款50元'
            }
          ]
        })
      )
    });

    const outcome = await extractor.extractFromText({
      rawText: '买奶茶15块，前天买衣服退款50元',
      referenceTime: REFERENCE_TIME
    });

    expect(outcome.ok).toBe(true);
    if (!outcome.ok) return;
    expect(Object.keys(outcome.drafts[0]!).sort()).toEqual([
      'amount',
      'confidence',
      'direction',
      'merchant',
      'modality',
      'occurredAt',
      'rawText',
      'sourceRef'
    ]);
    expect(outcome.drafts[0]!.occurredAt).toBeNull();
    expect(outcome.drafts[1]!.occurredAt).toBe('2026-11-19T09:30:00+08:00');
    expect(outcome.drafts[1]!.amount).toBe(50);
    expect(outcome.drafts[1]!.rawText).toContain('退款');
  });

  it('无效模型 JSON 先重试一次，成功则恢复，持续非法日期或非法 JSON 返回 AI_INVALID_OUTPUT', async () => {
    let calls = 0;
    const recoveredExtractor = createCaptureExtractor({
      uploadDir: './uploads',
      provider: createStubProvider(async () => {
        calls++;
        if (calls === 1) {
          return '{broken json';
        }
        return '```json\n{"records":[{"amount":12,"merchant":"沙县","occurredAt":null,"direction":"expense","confidence":0.8,"rawText":"沙县12"}]}\n```';
      })
    });

    const recovered = await recoveredExtractor.extractFromText({
      rawText: '沙县12',
      referenceTime: REFERENCE_TIME
    });
    expect(calls).toBe(2);
    expect(recovered.ok).toBe(true);

    let badDateCalls = 0;
    const badDateExtractor = createCaptureExtractor({
      uploadDir: './uploads',
      provider: createStubProvider(async () => {
        badDateCalls++;
        return JSON.stringify({
          records: [
            {
              amount: 20,
              merchant: '便利店',
              occurredAt: '2026-02-31T12:00:00+08:00',
              direction: 'expense',
              confidence: 0.7,
              rawText: '便利店20'
            }
          ]
        });
      })
    });

    const failed = await badDateExtractor.extractFromText({
      rawText: '便利店20',
      referenceTime: REFERENCE_TIME
    });
    expect(badDateCalls).toBe(2);
    expect(failed.ok).toBe(false);
    if (!failed.ok) {
      expect(failed.failure.code).toBe('AI_INVALID_OUTPUT');
    }
  });

  it('空文本在调用模型前返回 EMPTY_INPUT；未配置密钥直接返回 AI_NOT_CONFIGURED 不重试', async () => {
    let called = 0;
    const extractor = createCaptureExtractor({
      uploadDir: './uploads',
      provider: createStubProvider(async () => {
        called++;
        throw new CaptureProviderError('AI_NOT_CONFIGURED', 'missing key');
      })
    });

    const empty = await extractor.extractFromText({
      rawText: '   ',
      referenceTime: REFERENCE_TIME
    });
    expect(empty.ok).toBe(false);
    if (!empty.ok) {
      expect(empty.failure.code).toBe('EMPTY_INPUT');
    }
    expect(called).toBe(0);

    const unconfigured = await extractor.extractFromText({
      rawText: '午饭20元',
      referenceTime: REFERENCE_TIME
    });
    expect(called).toBe(1);
    expect(unconfigured.ok).toBe(false);
    if (!unconfigured.ok) {
      expect(unconfigured.failure.code).toBe('AI_NOT_CONFIGURED');
    }
  });

  it('保留输入时间中的毫秒精度（含 +08:00 与 UTC Z 换算）', async () => {
    const extractor = createCaptureExtractor({
      uploadDir: './uploads',
      provider: createStubProvider(async () =>
        JSON.stringify({
          records: [
            {
              amount: 12.5,
              merchant: '早点摊',
              occurredAt: '2026-11-19T09:12:34.567+08:00',
              direction: 'expense',
              confidence: 0.9,
              rawText: '早点 12.5'
            },
            {
              amount: 18,
              merchant: '面馆',
              occurredAt: '2026-11-19T01:12:34.567Z',
              direction: 'expense',
              confidence: 0.9,
              rawText: '面条 18'
            }
          ]
        })
      )
    });

    const outcome = await extractor.extractFromText({
      rawText: '早点12.5，面条18',
      referenceTime: REFERENCE_TIME
    });
    expect(outcome.ok).toBe(true);
    if (!outcome.ok) return;
    expect(outcome.drafts[0]!.occurredAt).toBe('2026-11-19T09:12:34.567+08:00');
    expect(outcome.drafts[1]!.occurredAt).toBe('2026-11-19T09:12:34.567+08:00');
  });
});
