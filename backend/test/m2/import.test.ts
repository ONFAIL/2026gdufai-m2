import { afterAll, describe, expect, it } from 'vitest';
import { buildApp } from '../../src/app.ts';
import type { AppConfig } from '../../src/config/index.ts';
import { openDatabase } from '../../src/db/client.ts';
import { seedCategories } from '../../src/db/seed/categories.ts';

const config: AppConfig = {
  port: 0,
  nodeEnv: 'test',
  databasePath: ':memory:',
  uploadDir: './uploads',
  authToken: null
};

const db = openDatabase(':memory:');
seedCategories(db);
const app = buildApp({ config, db });

afterAll(async () => {
  await app.close();
  db.close();
});

const SENT_AT = '2026-11-15T21:00:00+08:00';

function record(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    recordId: 'r1',
    userId: 'u1',
    direction: null,
    amount: 32.5,
    merchant: null,
    occurredAt: '2026-11-14T09:12:00+08:00',
    chatAt: null,
    rawText: '瑞幸 32.5',
    modality: 'text',
    sourceRef: null,
    confidence: 0.9,
    idempotencyKey: 'k1',
    ...overrides
  };
}

async function send(records: Record<string, unknown>[], batchPatch: Record<string, unknown> = {}) {
  const response = await app.inject({
    method: 'POST',
    url: '/api/transactions/import',
    payload: { version: 1, batchId: 'b1', sentAt: SENT_AT, records, ...batchPatch }
  });
  return { status: response.statusCode, body: response.json() };
}

function transactionCount(): number {
  const row = db.prepare('SELECT COUNT(*) AS count FROM transactions').get() as { count: number };
  return row.count;
}

describe('POST /api/transactions/import', () => {
  it('完整记录直接入库', async () => {
    const result = await send([record()]);
    expect(result.status).toBe(201);
    const item = result.body.results[0];
    expect(item).toMatchObject({
      status: 'confirmed',
      direction: 'expense',
      category: { id: 1, name: '餐饮', kind: 'expense' }
    });
    expect(item.transactionId).toMatch(/^tx_/);
    const row = db
      .prepare('SELECT amount_cents, merchant, occurred_date, category_id FROM transactions WHERE id = ?')
      .get(item.transactionId) as { amount_cents: number; merchant: string; occurred_date: string; category_id: number };
    expect(row).toEqual({ amount_cents: 3250, merchant: '未知账号', occurred_date: '2026-11-14', category_id: 1 });
  });

  it('缺金额先追问，补发后入库', async () => {
    const key = 'k-amount';
    const first = await send([record({ idempotencyKey: key, amount: null })]);
    expect(first.body.results[0].status).toBe('pending_followup');
    expect(first.body.results[0].feedback).toContainEqual({
      field: 'amount',
      code: 'MISSING_AMOUNT',
      severity: 'blocking'
    });
    expect(transactionCount()).toBe(1);

    const second = await send([record({ idempotencyKey: key, amount: 10 })]);
    expect(second.body.results[0].status).toBe('confirmed');
    expect(transactionCount()).toBe(2);
  });

  it('缺时间第二轮回退到聊天时间', async () => {
    const key = 'k-time';
    const first = await send([record({ idempotencyKey: key, occurredAt: null })]);
    expect(first.body.results[0].feedback).toContainEqual({
      field: 'occurredAt',
      code: 'MISSING_TIME',
      severity: 'blocking'
    });

    const second = await send([record({ idempotencyKey: key, occurredAt: null })]);
    const item = second.body.results[0];
    expect(item.status).toBe('confirmed');
    expect(item.occurredAt).toBe(SENT_AT);
    expect(item.feedback).toContainEqual({
      field: 'occurredAt',
      code: 'TIME_DEFAULTED_TO_CHAT_TIME',
      severity: 'warning'
    });
    const row = db
      .prepare('SELECT time_source, occurred_at FROM transactions WHERE id = ?')
      .get(item.transactionId) as { time_source: string; occurred_at: string };
    expect(row).toEqual({ time_source: 'chat_time', occurred_at: SENT_AT });
  });

  it('未来时间先追问，第二轮回退聊天时间', async () => {
    const key = 'k-future';
    const future = '2030-01-01T00:00:00+08:00';
    const first = await send([record({ idempotencyKey: key, occurredAt: future })]);
    expect(first.body.results[0].feedback).toContainEqual({
      field: 'occurredAt',
      code: 'FUTURE_TIME',
      severity: 'blocking'
    });

    const second = await send([record({ idempotencyKey: key, occurredAt: future })]);
    expect(second.body.results[0].status).toBe('confirmed');
    expect(second.body.results[0].occurredAt).toBe(SENT_AT);
  });

  it('重复幂等键返回 duplicate，不重复入库', async () => {
    const key = 'k-dup';
    const first = await send([record({ idempotencyKey: key })]);
    expect(first.body.results[0].status).toBe('confirmed');
    const before = transactionCount();

    const second = await send([record({ idempotencyKey: key })]);
    expect(second.body.results[0].status).toBe('duplicate');
    expect(second.body.results[0].transactionId).toBe(first.body.results[0].transactionId);
    expect(transactionCount()).toBe(before);
  });

  it('方向与类别冲突：首轮追问，次轮以类别为准', async () => {
    const key = 'k-conflict';
    const payload = record({ idempotencyKey: key, direction: 'expense', amount: 8000, rawText: '工资到账 8000' });

    const first = await send([payload]);
    expect(first.body.results[0].status).toBe('pending_followup');
    expect(first.body.results[0].feedback).toContainEqual({
      field: 'direction',
      code: 'CATEGORY_KIND_MISMATCH',
      severity: 'blocking'
    });

    const second = await send([payload]);
    const item = second.body.results[0];
    expect(item.status).toBe('confirmed');
    expect(item.direction).toBe('income');
    expect(item.category).toMatchObject({ id: 9, kind: 'income' });
    expect(item.feedback).toContainEqual({
      field: 'direction',
      code: 'DIRECTION_FORCED_BY_CATEGORY',
      severity: 'warning'
    });
  });

  it('退款不计收入，返回 REFUND_NOT_SUPPORTED', async () => {
    const result = await send([
      record({ idempotencyKey: 'k-refund', rawText: '昨天买的鞋退款 299', amount: 299 })
    ]);
    expect(result.body.results[0].status).toBe('rejected');
    expect(result.body.results[0].feedback).toContainEqual({
      field: 'rawText',
      code: 'REFUND_NOT_SUPPORTED',
      severity: 'blocking'
    });
  });

  it('缺商家时写默认值并给 warning', async () => {
    const result = await send([record({ idempotencyKey: 'k-merchant', merchant: null })]);
    const item = result.body.results[0];
    expect(item.status).toBe('confirmed');
    expect(item.feedback).toContainEqual({
      field: 'merchant',
      code: 'MERCHANT_DEFAULTED',
      severity: 'warning'
    });
  });

  it('缺 sentAt 整批 400', async () => {
    const response = await app.inject({
      method: 'POST',
      url: '/api/transactions/import',
      payload: { version: 1, batchId: 'b1', records: [record({ idempotencyKey: 'k-sent' })] }
    });
    expect(response.statusCode).toBe(400);
    expect(response.json()).toMatchObject({ error: { code: 'INVALID_BATCH', field: 'sentAt' } });
  });

  it('连续追问达到上限后 rejected，且不再复活', async () => {
    const key = 'k-limit';
    const payload = record({ idempotencyKey: key, amount: null });
    const before = transactionCount();

    const round1 = await send([payload]);
    expect(round1.body.results[0].status).toBe('pending_followup');
    const round2 = await send([payload]);
    expect(round2.body.results[0].status).toBe('pending_followup');
    const round3 = await send([payload]);
    expect(round3.body.results[0].status).toBe('rejected');
    const round4 = await send([payload]);
    expect(round4.body.results[0].status).toBe('rejected');
    expect(transactionCount()).toBe(before);
  });

  it('近未来（+2 小时）首轮追问 FUTURE_TIME，次轮按聊天时间兜底', async () => {
    const key = 'k-near-future';
    const twoHoursLater = new Date(Date.now() + 2 * 60 * 60 * 1000)
      .toISOString()
      .replace(/\.\d{3}Z$/, '+00:00');

    const first = await send([record({ idempotencyKey: key, occurredAt: twoHoursLater })]);
    expect(first.body.results[0].status).toBe('pending_followup');
    expect(first.body.results[0].feedback).toContainEqual({
      field: 'occurredAt',
      code: 'FUTURE_TIME',
      severity: 'blocking'
    });

    const second = await send([record({ idempotencyKey: key, occurredAt: twoHoursLater })]);
    expect(second.body.results[0].status).toBe('confirmed');
    expect(second.body.results[0].occurredAt).toBe(SENT_AT);
  });

  it('rejected 重发时保留原 feedback 的 field 与 severity', async () => {
    const key = 'k-refund-replay';
    const payload = record({ idempotencyKey: key, rawText: '退款 32.5', amount: 32.5 });

    const first = await send([payload]);
    expect(first.body.results[0].status).toBe('rejected');
    expect(first.body.results[0].feedback[0]).toMatchObject({ field: 'rawText', severity: 'blocking' });

    const second = await send([payload]);
    expect(second.body.results[0].feedback[0]).toMatchObject({
      field: 'rawText',
      code: 'REFUND_NOT_SUPPORTED',
      severity: 'blocking'
    });
  });

  it('冲突强制分支的 direction_source 记为 category', async () => {
    const key = 'k-forced-source';
    const payload = record({
      idempotencyKey: key,
      direction: 'expense',
      amount: 5000,
      rawText: '工资 5000'
    });

    await send([payload]);
    const second = await send([payload]);
    const item = second.body.results[0];
    expect(item.status).toBe('confirmed');

    const row = db
      .prepare('SELECT direction, direction_source FROM transactions WHERE id = ?')
      .get(item.transactionId) as { direction: string; direction_source: string };
    expect(row).toEqual({ direction: 'income', direction_source: 'category' });
  });

  it('已落库但缺 intake 记录时自愈为 duplicate', async () => {
    const key = 'k-wedge';
    const before = transactionCount();
    db.prepare(
      `INSERT INTO transactions
         (id, user_id, direction, direction_source, amount_cents, merchant, note, occurred_at, occurred_date,
          time_source, chat_at, category_id, category_source, category_confidence, status, source_modality,
          source_ref, anomaly_flag, idempotency_key, created_at, updated_at)
       VALUES ('tx_wedge', 'u1', 'expense', 'explicit', 1000, '某商户', '历史账单',
               '2026-11-14T12:00:00+08:00', '2026-11-14', 'explicit', NULL, 1, 'rule', 0.9, 'confirmed',
               'text', NULL, 0, ?, '2026-11-14T12:00:00+08:00', '2026-11-14T12:00:00+08:00')`
    ).run(key);

    const response = await send([record({ idempotencyKey: key, amount: 10, rawText: '瑞幸 10' })]);
    expect(response.body.results[0].status).toBe('duplicate');
    expect(response.body.results[0].transactionId).toBe('tx_wedge');
    expect(transactionCount()).toBe(before + 1);

    const intake = db.prepare('SELECT status FROM intake_log WHERE idempotency_key = ?').get(key) as {
      status: string;
    };
    expect(intake.status).toBe('confirmed');
  });
});
