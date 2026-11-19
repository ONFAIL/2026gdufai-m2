import Database from 'better-sqlite3';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterAll, describe, expect, it } from 'vitest';
import { openDatabase } from '../../src/db/client.ts';

const migrationsDir = fileURLToPath(new URL('../../src/db/migrations/', import.meta.url));
const dirs: string[] = [];

afterAll(() => {
  for (const dir of dirs) {
    rmSync(dir, { recursive: true, force: true });
  }
});

describe('迁移 003：贷款利息类别', () => {
  it('旧库自定义类别 13 迁移到 14，预设 13 可用且引用全部更新', () => {
    const dir = mkdtempSync(join(tmpdir(), 'm2-migration-'));
    dirs.push(dir);
    const path = join(dir, 'legacy.db');

    const raw = new Database(path);
    raw.exec(readFileSync(join(migrationsDir, '001_init.sql'), 'utf8'));
    raw.exec(readFileSync(join(migrationsDir, '002_refund_neutral.sql'), 'utf8'));
    raw.pragma('user_version = 2');

    raw
      .prepare("INSERT INTO users (id, nickname, created_at) VALUES ('u_001', 'u_001', '2026-11-01T00:00:00+08:00')")
      .run();
    raw
      .prepare(
        `INSERT INTO categories (id, name, kind, keywords, color, icon, sort_order, is_preset, is_active, created_at)
         VALUES (13, '宠物', 'expense', '["狗粮"]', '#000000', '🐱', 13, 0, 1, '2026-11-01T00:00:00+08:00')`
      )
      .run();
    raw
      .prepare(
        `INSERT INTO transactions
           (id, user_id, direction, direction_source, amount_cents, merchant, note, occurred_at, occurred_date,
            time_source, chat_at, category_id, category_source, category_confidence, status, source_modality,
            source_ref, anomaly_flag, idempotency_key, created_at, updated_at)
         VALUES ('tx_legacy', 'u_001', 'expense', 'explicit', 1000, '宠物店', NULL,
                 '2026-11-02T12:00:00+08:00', '2026-11-02', 'explicit', NULL, 13, 'rule', 0.9, 'confirmed',
                 'text', NULL, 0, 'key_legacy', '2026-11-02T12:00:00+08:00', '2026-11-02T12:00:00+08:00')`
      )
      .run();
    raw
      .prepare(
        `INSERT INTO budgets (user_id, month, scope, category_id, amount_cents, alert_thresholds, created_at, updated_at)
         VALUES ('u_001', '2026-11', 'category', 13, 10000, '[80,100]', '2026-11-01T00:00:00+08:00', '2026-11-01T00:00:00+08:00')`
      )
      .run();
    raw
      .prepare(
        `INSERT INTO user_category_rules (user_id, pattern, category_id, hit_count, last_used_at)
         VALUES ('u_001', '宠物店', 13, 1, '2026-11-02T12:00:00+08:00')`
      )
      .run();
    raw.close();

    const db = openDatabase(path);

    const preset = db.prepare('SELECT name, is_preset FROM categories WHERE id = 13').get() as {
      name: string;
      is_preset: number;
    };
    expect(preset).toEqual({ name: '贷款利息', is_preset: 1 });

    const custom = db.prepare('SELECT id, name, is_preset FROM categories WHERE name = ?').get('宠物') as {
      id: number;
      name: string;
      is_preset: number;
    };
    expect(custom).toEqual({ id: 14, name: '宠物', is_preset: 0 });

    const tx = db.prepare('SELECT category_id FROM transactions WHERE id = ?').get('tx_legacy') as {
      category_id: number;
    };
    expect(tx.category_id).toBe(14);

    const budget = db.prepare('SELECT category_id FROM budgets').get() as { category_id: number };
    expect(budget.category_id).toBe(14);

    const rule = db.prepare('SELECT category_id FROM user_category_rules').get() as {
      category_id: number;
    };
    expect(rule.category_id).toBe(14);

    expect(Number(db.pragma('user_version', { simple: true }))).toBe(3);
    db.close();
  });
});
