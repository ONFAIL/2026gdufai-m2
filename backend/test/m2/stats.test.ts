import { afterAll, describe, expect, it } from 'vitest';
import { buildApp } from '../../src/app.ts';
import type { AppConfig } from '../../src/config/index.ts';
import { openDatabase } from '../../src/db/client.ts';
import { seedCategories } from '../../src/db/seed/categories.ts';
import { todayShanghai } from '../../src/shared/time.ts';

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

const USER = 'u_001';
db.prepare('INSERT OR IGNORE INTO users (id, nickname, created_at) VALUES (?, ?, ?)').run(
  USER,
  USER,
  '2026-11-01T00:00:00+08:00'
);

let sequence = 0;

function insertTransaction(options: {
  direction: 'expense' | 'income';
  amountCents: number;
  occurredDate: string;
  categoryId: number;
}): string {
  const id = `tx_test_${++sequence}`;
  db.prepare(
    `INSERT INTO transactions
       (id, user_id, direction, direction_source, amount_cents, merchant, note, occurred_at, occurred_date,
        time_source, chat_at, category_id, category_source, category_confidence, status, source_modality,
        source_ref, anomaly_flag, idempotency_key, created_at, updated_at)
     VALUES (?, ?, ?, 'explicit', ?, '测试商户', NULL, ?, ?, 'explicit', NULL, ?, 'rule', 0.9, 'confirmed',
             'text', NULL, 0, ?, ?, ?)`
  ).run(
    id,
    USER,
    options.direction,
    options.amountCents,
    `${options.occurredDate}T12:00:00+08:00`,
    options.occurredDate,
    options.categoryId,
    `key_${id}`,
    '2026-11-01T00:00:00+08:00',
    '2026-11-01T00:00:00+08:00'
  );
  return id;
}

insertTransaction({ direction: 'expense', amountCents: 3250, occurredDate: '2026-11-14', categoryId: 1 });
insertTransaction({ direction: 'income', amountCents: 800000, occurredDate: '2026-11-14', categoryId: 9 });
insertTransaction({ direction: 'expense', amountCents: 1000, occurredDate: '2026-10-05', categoryId: 2 });
insertTransaction({ direction: 'expense', amountCents: 500, occurredDate: todayShanghai(), categoryId: 3 });

afterAll(async () => {
  await app.close();
  db.close();
});

async function stats(query: string) {
  const response = await app.inject({ method: 'GET', url: `/api/stats?${query}` });
  return { status: response.statusCode, body: response.json() };
}

describe('GET /api/stats', () => {
  it('按日统计并拆分类别', async () => {
    const result = await stats('dimension=day&date=2026-11-14&breakdownBy=category');
    expect(result.status).toBe(200);
    expect(result.body.summary).toMatchObject({ expenseCents: 3250, incomeCents: 800000, netCents: 796750, count: 2 });
    expect(result.body.buckets).toHaveLength(1);
    expect(result.body.buckets[0].categories).toHaveLength(2);
    expect(result.body.summary.topCategory).toMatchObject({ categoryId: 1, name: '餐饮', totalCents: 3250 });
  });

  it('按月统计范围覆盖整月', async () => {
    const result = await stats('dimension=month&month=2026-11');
    expect(result.body.range).toEqual({ start: '2026-11-01', end: '2026-11-30' });
    expect(result.body.summary.count).toBe(3);
  });

  it('按年统计覆盖全年', async () => {
    const result = await stats('dimension=year&year=2026');
    expect(result.body.range).toEqual({ start: '2026-01-01', end: '2026-12-31' });
    expect(result.body.summary.count).toBe(4);
  });

  it('近一周固定 7 个桶并包含今天', async () => {
    const result = await stats('dimension=recent7');
    expect(result.body.buckets).toHaveLength(7);
    const today = result.body.buckets[6];
    expect(today.period).toBe(todayShanghai());
    expect(today.expenseCents).toBe(500);
  });

  it('direction 过滤只统计支出一侧', async () => {
    const result = await stats('dimension=day&date=2026-11-14&direction=expense');
    expect(result.body.summary).toMatchObject({ expenseCents: 3250, incomeCents: 0, count: 1 });
  });

  it('参数与维度不匹配时返回 422', async () => {
    const missingDate = await stats('dimension=day');
    expect(missingDate.status).toBe(422);
    const recentWithDate = await stats('dimension=recent7&date=2026-11-14');
    expect(recentWithDate.status).toBe(422);
  });
});
