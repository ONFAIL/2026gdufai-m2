import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, afterEach, describe, expect, it } from 'vitest';
import { buildApp } from '../../src/app.ts';
import type { AppConfig } from '../../src/config/index.ts';
import { openDatabase } from '../../src/db/client.ts';
import { seedCategories } from '../../src/db/seed/categories.ts';
import { seedDemoUser } from '../../src/db/seed/users.ts';
import {
  createCaptureExtractor,
  mergeDraftPatch,
  saveCaptureUpload,
  type CaptureAiProvider,
  type CaptureDraft
} from '../../src/modules/capture/index.ts';

const SENT_AT = '2026-11-19T12:00:00+08:00';
const PNG_BYTES = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0x01]);
const WAV_BYTES = Buffer.from('RIFF\x24\x00\x00\x00WAVEfmt ');

const config: AppConfig = {
  port: 0,
  nodeEnv: 'test',
  databasePath: ':memory:',
  uploadDir: './uploads',
  authToken: null,
  demoUserId: 'u_001'
};

const db = openDatabase(':memory:');
seedCategories(db);
seedDemoUser(db, config.demoUserId);
const app = buildApp({ config, db });

const tempDirs: string[] = [];

async function makeUploadDir(): Promise<string> {
  const dir = await mkdtemp(join(tmpdir(), 'gdufai-m1-m2-'));
  tempDirs.push(dir);
  return dir;
}

afterEach(async () => {
  while (tempDirs.length > 0) {
    const dir = tempDirs.pop();
    if (dir) {
      await rm(dir, { recursive: true, force: true });
    }
  }
});

afterAll(async () => {
  await app.close();
  db.close();
});

async function submitDraftToM2(
  draft: CaptureDraft,
  ids: { batchId: string; recordId: string; idempotencyKey: string }
) {
  const response = await app.inject({
    method: 'POST',
    url: '/api/transactions/import',
    payload: {
      version: 1,
      batchId: ids.batchId,
      sentAt: SENT_AT,
      records: [
        {
          ...draft,
          recordId: ids.recordId,
          userId: config.demoUserId,
          chatAt: SENT_AT,
          idempotencyKey: ids.idempotencyKey
        }
      ]
    }
  });
  return { status: response.statusCode, body: response.json() };
}

function transactionCount(): number {
  const row = db.prepare('SELECT COUNT(*) AS count FROM transactions').get() as { count: number };
  return row.count;
}

describe('M1 识别草稿与真实 M2 入库契约联调', () => {
  it('文字抽取 -> 草稿提交 M2 -> confirmed 且重复幂等键返回 duplicate 不重复入库', async () => {
    const extractor = createCaptureExtractor({
      uploadDir: './uploads',
      provider: {
        completeJson: async () =>
          JSON.stringify({
            records: [
              {
                amount: 32.5,
                merchant: '瑞幸',
                occurredAt: '2026-11-19T09:12:00+08:00',
                direction: null,
                confidence: 0.92,
                rawText: '早上瑞幸花了32块5'
              }
            ]
          }),
        completeVisionJson: async () => '',
        transcribeAudio: async () => ''
      }
    });

    const outcome = await extractor.extractFromText({
      rawText: '早上瑞幸花了32块5',
      referenceTime: SENT_AT
    });
    expect(outcome.ok).toBe(true);
    if (!outcome.ok) return;

    const first = await submitDraftToM2(outcome.drafts[0]!, {
      batchId: 'b_m1_text_1',
      recordId: 'r_m1_text_1',
      idempotencyKey: 'k_m1_text_dup'
    });
    expect(first.status).toBe(201);
    expect(first.body.results[0]).toMatchObject({
      recordId: 'r_m1_text_1',
      status: 'confirmed',
      direction: 'expense'
    });

    const row = db
      .prepare('SELECT amount_cents, source_modality, source_ref FROM transactions WHERE id = ?')
      .get(first.body.results[0].transactionId) as {
      amount_cents: number;
      source_modality: string;
      source_ref: string | null;
    };
    expect(row).toEqual({ amount_cents: 3250, source_modality: 'text', source_ref: null });

    const beforeDup = transactionCount();
    const duplicate = await submitDraftToM2(outcome.drafts[0]!, {
      batchId: 'b_m1_text_2',
      recordId: 'r_m1_text_1',
      idempotencyKey: 'k_m1_text_dup'
    });
    expect(duplicate.body.results[0].status).toBe('duplicate');
    expect(transactionCount()).toBe(beforeDup);
  });

  it('缺金额追问补充 + 缺时间两轮后由 M2 用聊天时间兜底入库', async () => {
    const provider: CaptureAiProvider = {
      completeJson: async (input) => {
        if (input.userPrompt.includes('followupText')) {
          if (input.userPrompt.includes('18块')) {
            return JSON.stringify({ patch: { amount: 18 } });
          }
          return JSON.stringify({ patch: {} });
        }
        return JSON.stringify({
          records: [
            {
              amount: null,
              merchant: '食堂',
              occurredAt: null,
              direction: 'expense',
              confidence: 0.8,
              rawText: '食堂吃饭'
            }
          ]
        });
      },
      completeVisionJson: async () => '',
      transcribeAudio: async () => ''
    };
    const extractor = createCaptureExtractor({ uploadDir: './uploads', provider });

    const initial = await extractor.extractFromText({
      rawText: '食堂吃饭',
      referenceTime: SENT_AT
    });
    expect(initial.ok).toBe(true);
    if (!initial.ok) return;

    const r1 = await submitDraftToM2(initial.drafts[0]!, {
      batchId: 'b_fu_1',
      recordId: 'r_fu_1',
      idempotencyKey: 'k_m1_followup_flow'
    });
    expect(r1.body.results[0].status).toBe('pending_followup');
    expect(r1.body.results[0].feedback).toContainEqual(
      expect.objectContaining({ code: 'MISSING_AMOUNT', severity: 'blocking' })
    );

    // 第 2 轮只补了金额、时间仍不知，触发 M2 聊天时间兜底入库。
    const p2 = await extractor.extractFollowupPatch({
      currentDraft: initial.drafts[0]!,
      followupText: '花了18块，哪天记不清了',
      pendingFeedback: r1.body.results[0].feedback,
      referenceTime: SENT_AT
    });
    expect(p2.ok).toBe(true);
    if (!p2.ok) return;

    const patchedDraft = mergeDraftPatch(initial.drafts[0]!, p2.patch);
    const r2 = await submitDraftToM2(patchedDraft, {
      batchId: 'b_fu_2',
      recordId: 'r_fu_1',
      idempotencyKey: 'k_m1_followup_flow'
    });
    expect(r2.body.results[0].status).toBe('confirmed');
    expect(r2.body.results[0].feedback).toContainEqual(
      expect.objectContaining({ code: 'TIME_DEFAULTED_TO_CHAT_TIME', severity: 'warning' })
    );

    const row = db
      .prepare('SELECT amount_cents, time_source FROM transactions WHERE id = ?')
      .get(r2.body.results[0].transactionId) as { amount_cents: number; time_source: string };
    expect(row).toEqual({ amount_cents: 1800, time_source: 'chat_time' });
  });

  it('图片与语音上传落盘后抽取并导入 M2，数据库落库 source_modality 与受控 source_ref', async () => {
    const uploadDir = await makeUploadDir();
    const imgSaved = await saveCaptureUpload({
      uploadDir,
      bytes: PNG_BYTES,
      mimeType: 'image/png',
      now: new Date(SENT_AT)
    });
    const voiceSaved = await saveCaptureUpload({
      uploadDir,
      bytes: WAV_BYTES,
      mimeType: 'audio/wav',
      now: new Date(SENT_AT)
    });
    expect(imgSaved.ok && voiceSaved.ok).toBe(true);
    if (!imgSaved.ok || !voiceSaved.ok) return;

    const extractor = createCaptureExtractor({
      uploadDir,
      provider: {
        completeVisionJson: async () =>
          JSON.stringify({
            readable: true,
            ocrText: '便利店实付19.8元',
            records: [
              {
                amount: 19.8,
                merchant: '便利店',
                occurredAt: '2026-11-19T10:00:00+08:00',
                direction: 'expense',
                confidence: 0.9,
                rawText: '便利店小票实付19.8元'
              }
            ]
          }),
        transcribeAudio: async () => '打车24元',
        completeJson: async () =>
          JSON.stringify({
            records: [
              {
                amount: 24,
                merchant: '出租车',
                occurredAt: '2026-11-19T11:00:00+08:00',
                direction: 'expense',
                confidence: 0.89,
                rawText: '打车24元'
              }
            ]
          })
      }
    });

    const imgDrafts = await extractor.extractFromImage({
      sourceRef: imgSaved.upload.sourceRef,
      referenceTime: SENT_AT
    });
    const voiceDrafts = await extractor.extractFromVoice({
      sourceRef: voiceSaved.upload.sourceRef,
      referenceTime: SENT_AT
    });
    expect(imgDrafts.ok && voiceDrafts.ok).toBe(true);
    if (!imgDrafts.ok || !voiceDrafts.ok) return;

    const imgImported = await submitDraftToM2(imgDrafts.drafts[0]!, {
      batchId: 'b_img_1',
      recordId: 'r_img_1',
      idempotencyKey: 'k_img_1'
    });
    const voiceImported = await submitDraftToM2(voiceDrafts.drafts[0]!, {
      batchId: 'b_voice_1',
      recordId: 'r_voice_1',
      idempotencyKey: 'k_voice_1'
    });

    expect(imgImported.body.results[0].status).toBe('confirmed');
    expect(voiceImported.body.results[0].status).toBe('confirmed');

    const imgRow = db
      .prepare('SELECT amount_cents, source_modality, source_ref FROM transactions WHERE id = ?')
      .get(imgImported.body.results[0].transactionId) as {
      amount_cents: number;
      source_modality: string;
      source_ref: string;
    };
    expect(imgRow).toEqual({
      amount_cents: 1980,
      source_modality: 'image',
      source_ref: imgSaved.upload.sourceRef
    });

    const voiceRow = db
      .prepare('SELECT amount_cents, source_modality, source_ref FROM transactions WHERE id = ?')
      .get(voiceImported.body.results[0].transactionId) as {
      amount_cents: number;
      source_modality: string;
      source_ref: string;
    };
    expect(voiceRow).toEqual({
      amount_cents: 2400,
      source_modality: 'voice',
      source_ref: voiceSaved.upload.sourceRef
    });
  });
});
