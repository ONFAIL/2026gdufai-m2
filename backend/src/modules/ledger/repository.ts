import type { Db } from '../../db/client.ts';
import type { CategoryRow, Direction, UserCategoryRule } from './types.ts';

interface CategoryDbRow {
  id: number;
  name: string;
  kind: Direction;
  keywords: string;
  is_preset: number;
}

interface RuleDbRow {
  pattern: string;
  category_id: number;
}

/** 读取启用中的类别字典，供分类引擎匹配。 */
export function listCategories(db: Db): CategoryRow[] {
  const rows = db
    .prepare(
      'SELECT id, name, kind, keywords, is_preset FROM categories WHERE is_active = 1 ORDER BY sort_order, id'
    )
    .all() as CategoryDbRow[];

  return rows.map((row) => ({
    id: row.id,
    name: row.name,
    kind: row.kind,
    keywords: JSON.parse(row.keywords) as string[],
    isPreset: row.is_preset === 1
  }));
}

/** 读取某用户的历史修正规则。 */
export function listUserRules(db: Db, userId: string): UserCategoryRule[] {
  const rows = db
    .prepare('SELECT pattern, category_id FROM user_category_rules WHERE user_id = ?')
    .all(userId) as RuleDbRow[];

  return rows.map((row) => ({ pattern: row.pattern, categoryId: row.category_id }));
}

export interface IntakeRow {
  readonly status: 'confirmed' | 'pending_followup' | 'rejected' | 'duplicate';
  readonly followupRound: number;
  readonly transactionId: string | null;
  readonly codes: string[];
}

export interface TransactionInput {
  readonly id: string;
  readonly userId: string;
  readonly direction: Direction;
  readonly directionSource: 'explicit' | 'category';
  readonly amountCents: number;
  readonly merchant: string;
  readonly note: string;
  readonly occurredAt: string;
  readonly occurredDate: string;
  readonly timeSource: 'explicit' | 'chat_time';
  readonly chatAt: string | null;
  readonly categoryId: number | null;
  readonly categorySource: string;
  readonly categoryConfidence: number;
  readonly sourceModality: string;
  readonly sourceRef: string | null;
  readonly idempotencyKey: string;
  readonly createdAt: string;
  readonly updatedAt: string;
}

export interface TransactionView {
  readonly direction: Direction;
  readonly occurredAt: string;
  readonly category: { id: number; name: string; kind: Direction } | null;
}

/** 确保用户存在，避免 transactions 外键失败。演示阶段用户由入站数据携带。 */
export function ensureUser(db: Db, userId: string): void {
  db.prepare('INSERT OR IGNORE INTO users (id, nickname, created_at) VALUES (?, ?, ?)').run(
    userId,
    userId,
    new Date().toISOString()
  );
}

/** 查询幂等键对应的入站记录。 */
export function findIntake(db: Db, idempotencyKey: string): IntakeRow | null {
  const row = db
    .prepare(
      'SELECT status, followup_round, transaction_id, last_codes FROM intake_log WHERE idempotency_key = ?'
    )
    .get(idempotencyKey) as
    | { status: IntakeRow['status']; followup_round: number; transaction_id: string | null; last_codes: string }
    | undefined;

  if (row === undefined) {
    return null;
  }
  return {
    status: row.status,
    followupRound: row.followup_round,
    transactionId: row.transaction_id,
    codes: JSON.parse(row.last_codes) as string[]
  };
}

/** 写入或更新入站记录，轮次与状态用于跨进程的追问控制。 */
export function saveIntake(
  db: Db,
  input: {
    idempotencyKey: string;
    recordId: string;
    batchId: string;
    status: IntakeRow['status'];
    followupRound: number;
    transactionId: string | null;
    codes: string[];
  }
): void {
  const now = new Date().toISOString();
  db.prepare(
    `INSERT INTO intake_log
       (idempotency_key, record_id, batch_id, status, followup_round, transaction_id, last_codes, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT(idempotency_key) DO UPDATE SET
       status = excluded.status,
       followup_round = excluded.followup_round,
       transaction_id = excluded.transaction_id,
       last_codes = excluded.last_codes,
       updated_at = excluded.updated_at`
  ).run(
    input.idempotencyKey,
    input.recordId,
    input.batchId,
    input.status,
    input.followupRound,
    input.transactionId,
    JSON.stringify(input.codes),
    now,
    now
  );
}

/** 写入一笔已确认的账单。 */
export function insertTransaction(db: Db, input: TransactionInput): void {
  db.prepare(
    `INSERT INTO transactions
       (id, user_id, direction, direction_source, amount_cents, merchant, note,
        occurred_at, occurred_date, time_source, chat_at, category_id, category_source,
        category_confidence, status, source_modality, source_ref, idempotency_key, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'confirmed', ?, ?, ?, ?, ?)`
  ).run(
    input.id,
    input.userId,
    input.direction,
    input.directionSource,
    input.amountCents,
    input.merchant,
    input.note,
    input.occurredAt,
    input.occurredDate,
    input.timeSource,
    input.chatAt,
    input.categoryId,
    input.categorySource,
    input.categoryConfidence,
    input.sourceModality,
    input.sourceRef,
    input.idempotencyKey,
    input.createdAt,
    input.updatedAt
  );
}

/** 按 id 读取账单视图，用于幂等重复时回显已有结果。 */
export function getTransactionView(db: Db, transactionId: string): TransactionView | null {
  const row = db
    .prepare(
      `SELECT t.direction, t.occurred_at, c.id AS category_id, c.name AS category_name, c.kind AS category_kind
         FROM transactions t
         LEFT JOIN categories c ON c.id = t.category_id
        WHERE t.id = ?`
    )
    .get(transactionId) as
    | {
        direction: Direction;
        occurred_at: string;
        category_id: number | null;
        category_name: string | null;
        category_kind: Direction | null;
      }
    | undefined;

  if (row === undefined) {
    return null;
  }
  return {
    direction: row.direction,
    occurredAt: row.occurred_at,
    category:
      row.category_id === null || row.category_name === null || row.category_kind === null
        ? null
        : { id: row.category_id, name: row.category_name, kind: row.category_kind }
  };
}
