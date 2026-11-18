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
  authToken: null,
  demoUserId: 'u_001'
};

const db = openDatabase(':memory:');
seedCategories(db);
const app = buildApp({ config, db });

const USER = 'u_001';
db.prepare('INSERT OR IGNORE INTO users (id, nickname, created_at) VALUES (?, ?, ?)').run(
  USER,
  USER,
  '2026-11-01T00:00:00+08:00'
);

let sequence = 0;
function insert(options: {
  date: string;
  direction: 'expense' | 'income';
  amountCents: number;
  categoryId: number;
}): string {
  const id = `tx_extra_${++sequence}`;
  db.prepare(
    `INSERT INTO transactions
       (id, user_id, direction, direction_source, amount_cents, merchant, note, occurred_at, occurred_date,
        time_source, chat_at, category_id, category_source, category_confidence, status, source_modality,
        source_ref, anomaly_flag, idempotency_key, created_at, updated_at)
     VALUES (?, ?, ?, 'explicit', ?, '测试商户', NULL, ?, ?, 'explicit', NULL, ?, 'rule', 0.9, 'confirmed',
             'text', NULL, 0, ?, '2026-11-01T00:00:00+08:00', '2026-11-01T00:00:00+08:00')`
  ).run(
    id,
    USER,
    options.direction,
    options.amountCents,
    `${options.date}T12:00:00+08:00`,
    options.date,
    options.categoryId,
    `key_${id}`
  );
  return id;
}

insert({ date: '2026-11-14', direction: 'expense', amountCents: 3250, categoryId: 1 });
insert({ date: '2026-11-14', direction: 'expense', amountCents: 1000, categoryId: 2 });
insert({ date: '2026-11-14', direction: 'income', amountCents: 800000, categoryId: 9 });
insert({ date: '2026-12-02', direction: 'expense', amountCents: 500, categoryId: 3 });

// 中性记录：保留但不计入 summary
db.prepare(
  `INSERT INTO transactions
     (id, user_id, direction, direction_source, amount_cents, merchant, note, occurred_at, occurred_date,
      time_source, chat_at, category_id, category_source, category_confidence, status, source_modality,
      source_ref, anomaly_flag, idempotency_key, entry_type, matched_transaction_id, created_at, updated_at)
   VALUES ('tx_extra_refund', ?, 'income', 'category', 500, '测试商户', '退款', '2026-11-20T12:00:00+08:00',
           '2026-11-20', 'explicit', NULL, 11, 'fallback', 0.3, 'confirmed', 'text', NULL, 0, 'key_refund',
           'refund', NULL, '2026-11-20T12:00:00+08:00', '2026-11-20T12:00:00+08:00')`
).run(USER);

afterAll(async () => {
  await app.close();
  db.close();
});

async function getJson(url: string) {
  const response = await app.inject({ method: 'GET', url });
  return { status: response.statusCode, body: response.json() };
}

describe('统计补充用例', () => {
  it('混合收支时 ratio 分母取同方向合计', async () => {
    const { body } = await getJson('/api/stats?dimension=day&date=2026-11-14&breakdownBy=category');
    const categories = body.buckets[0].categories as Array<{
      categoryId: number;
      ratio: number;
      totalCents: number;
    }>;
    const food = categories.find((item) => item.categoryId === 1);
    const transport = categories.find((item) => item.categoryId === 2);
    const salary = categories.find((item) => item.categoryId === 9);
    expect(food).toMatchObject({ totalCents: 3250, ratio: 0.765 });
    expect(transport).toMatchObject({ totalCents: 1000, ratio: 0.235 });
    expect(salary).toMatchObject({ totalCents: 800000, ratio: 1 });
  });

  it('income 方向的 topCategory 取收入侧', async () => {
    const { body } = await getJson('/api/stats?dimension=month&month=2026-11&direction=income');
    expect(body.summary.topCategory).toMatchObject({ categoryId: 9, totalCents: 800000, ratio: 1 });
  });

  it('空月份返回 meta.isEmpty 与零值', async () => {
    const { body } = await getJson('/api/stats?dimension=month&month=2025-01');
    expect(body.meta.isEmpty).toBe(true);
    expect(body.summary).toMatchObject({ expenseCents: 0, incomeCents: 0, count: 0 });
  });

  it('userId 查询参数不改变结果', async () => {
    const without = await getJson('/api/stats?dimension=month&month=2026-11');
    const withOther = await getJson('/api/stats?dimension=month&month=2026-11&userId=u_other');
    expect(withOther.body.summary).toEqual(without.body.summary);
  });

  it('非法日历日期返回 422', async () => {
    const { status } = await getJson('/api/stats?dimension=day&date=2026-02-31');
    expect(status).toBe(422);
  });
});

describe('账单一览补充用例', () => {
  it('同日多笔按 id 倒序，游标翻页无重复', async () => {
    const first = await getJson('/api/transactions?limit=2');
    const firstIds = (first.body.items as Array<{ id: string }>).map((item) => item.id);
    expect(firstIds).toHaveLength(2);

    const second = await getJson(
      `/api/transactions?limit=2&cursor=${encodeURIComponent(first.body.page.nextCursor)}`
    );
    const secondIds = (second.body.items as Array<{ id: string }>).map((item) => item.id);
    expect(new Set([...firstIds, ...secondIds]).size).toBe(firstIds.length + secondIds.length);
  });

  it('非法 cursor 返回 422 且错误码为 INVALID_QUERY_PARAM', async () => {
    const response = await app.inject({ method: 'GET', url: '/api/transactions?cursor=not-a-cursor' });
    expect(response.statusCode).toBe(422);
    expect(response.json()).toMatchObject({ error: { code: 'INVALID_QUERY_PARAM' } });
  });

  it('limit 越界返回 422', async () => {
    const zero = await app.inject({ method: 'GET', url: '/api/transactions?limit=0' });
    const tooLarge = await app.inject({ method: 'GET', url: '/api/transactions?limit=101' });
    expect(zero.statusCode).toBe(422);
    expect(tooLarge.statusCode).toBe(422);
    expect(zero.json()).toMatchObject({ error: { code: 'INVALID_QUERY_PARAM' } });
  });

  it('entryType=refund 时 items 有中性记录、summary 仍只算 normal', async () => {
    const response = await app.inject({ method: 'GET', url: '/api/transactions?entryType=refund' });
    const body = response.json() as {
      items: Array<{ entryType: string }>;
      summary: { count: number };
    };
    expect(body.items).toHaveLength(1);
    expect(body.items[0]?.entryType).toBe('refund');
    expect(body.summary.count).toBe(0);
  });

  it('entryType 非法值返回 422', async () => {
    const response = await app.inject({ method: 'GET', url: '/api/transactions?entryType=bogus' });
    expect(response.statusCode).toBe(422);
    expect(response.json()).toMatchObject({ error: { code: 'INVALID_QUERY_PARAM' } });
  });

  it('userId 查询参数不改变结果', async () => {
    const without = await getJson('/api/transactions');
    const withOther = await getJson('/api/transactions?userId=u_other');
    expect(withOther.body.summary).toEqual(without.body.summary);
    expect((withOther.body.items as Array<{ id: string }>).length).toBe(
      (without.body.items as Array<{ id: string }>).length
    );
  });
});
