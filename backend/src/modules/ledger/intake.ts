import { randomUUID } from 'node:crypto';
import type { Db } from '../../db/client.ts';
import { yuanToCents } from '../../shared/money.ts';
import { nowIsoShanghai, toShanghaiDate } from '../../shared/time.ts';
import { classify } from './classifier.ts';
import {
  findIntake,
  findTransactionByIdempotencyKey,
  getTransactionView,
  listCategories,
  listUserRules,
  saveIntake,
  insertTransaction
} from './repository.ts';
import { isRefund } from './intent.ts';
import type { CategoryRow, Direction, RawBatch, RawRecord } from './types.ts';

/** 契约 §1.5 登记的反馈码。 */
export type FeedbackCode =
  | 'MISSING_AMOUNT'
  | 'MISSING_TIME'
  | 'FUTURE_TIME'
  | 'MISSING_DIRECTION'
  | 'CATEGORY_KIND_MISMATCH'
  | 'LOW_CONFIDENCE_CATEGORY'
  | 'MERCHANT_DEFAULTED'
  | 'TIME_DEFAULTED_TO_CHAT_TIME'
  | 'DIRECTION_FORCED_BY_CATEGORY'
  | 'DUPLICATE_RECORD'
  | 'REFUND_NOT_SUPPORTED';

export type FeedbackSeverity = 'blocking' | 'warning';

export interface FeedbackItem {
  readonly field: string | null;
  readonly code: FeedbackCode;
  readonly severity: FeedbackSeverity;
}

export interface RecordResult {
  readonly recordId: string;
  readonly status: 'confirmed' | 'pending_followup' | 'duplicate' | 'rejected';
  readonly transactionId: string | null;
  readonly direction: Direction;
  readonly occurredAt: string | null;
  readonly category: { id: number; name: string; kind: Direction } | null;
  readonly confidence: number | null;
  readonly feedback: FeedbackItem[];
}

export interface BatchResult {
  readonly batchId: string;
  readonly results: RecordResult[];
}

/** 追问超过该轮次仍未解决则放弃（第 3 次提交转 rejected）。 */
export const MAX_FOLLOWUP_ROUNDS = 2;
/** 分类置信度低于该值时提示用户确认。 */
const LOW_CONFIDENCE_THRESHOLD = 0.75;
/** 商户缺失时的默认值，契约 §1.5 MERCHANT_DEFAULTED。 */
const DEFAULT_MERCHANT = '未知账号';

function blocking(field: string | null, code: FeedbackCode): FeedbackItem {
  return { field, code, severity: 'blocking' };
}

function warning(field: string | null, code: FeedbackCode): FeedbackItem {
  return { field, code, severity: 'warning' };
}

function toView(category: CategoryRow | null): RecordResult['category'] {
  return category === null ? null : { id: category.id, name: category.name, kind: category.kind };
}

/** 按方向选兜底类别：支出取「其他」，收入取「其他收入」。 */
function fallbackCategory(categories: readonly CategoryRow[], direction: Direction | null): CategoryRow | null {
  const kind: Direction = direction ?? 'expense';
  const name = kind === 'expense' ? '其他' : '其他收入';
  return categories.find((item) => item.kind === kind && item.name === name) ?? null;
}

/** 未来时间容差：与契约 §1.5 一致，5 分钟。 */
const FUTURE_TOLERANCE_MS = 5 * 60_000;

function isFuture(iso: string, now: Date): boolean {
  return Date.parse(iso) > now.getTime() + FUTURE_TOLERANCE_MS;
}

/** 判断是否为幂等键唯一冲突（SQLite 错误码）。 */
function isUniqueViolation(error: unknown): boolean {
  return (
    typeof error === 'object' &&
    error !== null &&
    (error as { code?: string }).code === 'SQLITE_CONSTRAINT_UNIQUE'
  );
}

function rejectedResult(record: RawRecord, codes: FeedbackItem[]): RecordResult {
  return {
    recordId: record.recordId,
    status: 'rejected',
    transactionId: null,
    direction: record.direction ?? 'expense',
    occurredAt: null,
    category: null,
    confidence: null,
    feedback: codes
  };
}

function persistPending(
  db: Db,
  batch: RawBatch,
  record: RawRecord,
  round: number,
  feedback: FeedbackItem[],
  rejected = false
): RecordResult {
  saveIntake(db, {
    idempotencyKey: record.idempotencyKey,
    recordId: record.recordId,
    batchId: batch.batchId,
    status: rejected ? 'rejected' : 'pending_followup',
    followupRound: round,
    transactionId: null,
    feedback
  });
  const result = rejected
    ? rejectedResult(record, feedback)
    : {
        recordId: record.recordId,
        status: 'pending_followup' as const,
        transactionId: null,
        direction: record.direction ?? 'expense',
        occurredAt: record.occurredAt,
        category: null,
        confidence: null,
        feedback
      };
  return result;
}

function processRecord(db: Db, batch: RawBatch, record: RawRecord, categories: CategoryRow[]): RecordResult {
  const existing = findIntake(db, record.idempotencyKey);
  const round = existing === null ? 0 : existing.followupRound + 1;

  if (existing !== null && (existing.status === 'confirmed' || existing.status === 'duplicate')) {
    const view = existing.transactionId === null ? null : getTransactionView(db, existing.transactionId);
    return {
      recordId: record.recordId,
      status: 'duplicate',
      transactionId: existing.transactionId,
      direction: view?.direction ?? record.direction ?? 'expense',
      occurredAt: view?.occurredAt ?? null,
      category: view?.category ?? null,
      confidence: null,
      feedback: [warning(null, 'DUPLICATE_RECORD')]
    };
  }

  if (existing !== null && existing.status === 'rejected') {
    return rejectedResult(
      record,
      existing.feedback.map((item) => ({
        field: item.field,
        code: item.code as FeedbackCode,
        severity: item.severity
      }))
    );
  }

  // 追问轮次用尽后不再反复询问，直接放弃，避免死循环。
  if (round > MAX_FOLLOWUP_ROUNDS) {
    return persistPending(db, batch, record, round, [blocking(null, 'MISSING_AMOUNT')], true);
  }

  // 退款/退货不计收入，也不生成新账单。
  if (isRefund(record.rawText)) {
    return persistPending(db, batch, record, round, [blocking('rawText', 'REFUND_NOT_SUPPORTED')], true);
  }

  // 金额缺失或非正数：必须追问，绝不猜。
  if (record.amount === null || record.amount <= 0) {
    const feedback = [blocking('amount', 'MISSING_AMOUNT')];
    return persistPending(db, batch, record, round, feedback, round >= MAX_FOLLOWUP_ROUNDS);
  }

  // 时间：缺失或在未来先追问；第二轮起回退到聊天时间。
  const now = new Date();
  let occurredAt = record.occurredAt;
  let timeSource: 'explicit' | 'chat_time' = 'explicit';
  let chatAt: string | null = null;
  const timeFeedback: FeedbackItem[] = [];

  if (occurredAt === null) {
    if (round === 0) {
      const feedback = [blocking('occurredAt', 'MISSING_TIME')];
      return persistPending(db, batch, record, round, feedback);
    }
    chatAt = record.chatAt ?? batch.sentAt;
    occurredAt = chatAt;
    timeSource = 'chat_time';
    timeFeedback.push(warning('occurredAt', 'TIME_DEFAULTED_TO_CHAT_TIME'));
  } else if (isFuture(occurredAt, now)) {
    if (round === 0) {
      const feedback = [blocking('occurredAt', 'FUTURE_TIME')];
      return persistPending(db, batch, record, round, feedback);
    }
    chatAt = record.chatAt ?? batch.sentAt;
    occurredAt = chatAt;
    timeSource = 'chat_time';
    timeFeedback.push(warning('occurredAt', 'TIME_DEFAULTED_TO_CHAT_TIME'));
  }

  // 分类：先按全类别匹配，冲突检测才有依据。
  const userRules = listUserRules(db, record.userId);
  const classification = classify(
    { merchant: record.merchant, rawText: record.rawText, direction: null },
    { categories, userRules }
  );
  let category: CategoryRow | null =
    classification.source === 'fallback'
      ? fallbackCategory(categories, record.direction)
      : categories.find((item) => item.id === classification.categoryId) ?? null;

  const feedback: FeedbackItem[] = [...timeFeedback];
  let direction: Direction;
  let directionSource: 'explicit' | 'category' = record.direction !== null ? 'explicit' : 'category';

  if (record.direction !== null && category !== null && category.kind !== record.direction) {
    if (round === 0) {
      return persistPending(db, batch, record, round, [
        blocking('direction', 'CATEGORY_KIND_MISMATCH')
      ]);
    }
    direction = category.kind;
    directionSource = 'category';
    feedback.push(warning('direction', 'DIRECTION_FORCED_BY_CATEGORY'));
  } else if (record.direction !== null) {
    direction = record.direction;
  } else if (category !== null) {
    direction = category.kind;
  } else {
    const missing = [blocking('direction', 'MISSING_DIRECTION')];
    return persistPending(db, batch, record, round, missing, round >= MAX_FOLLOWUP_ROUNDS);
  }

  if (category === null) {
    category = fallbackCategory(categories, direction);
  }

  if (classification.confidence < LOW_CONFIDENCE_THRESHOLD) {
    feedback.push(warning('category', 'LOW_CONFIDENCE_CATEGORY'));
  }

  const merchant = record.merchant?.trim() === '' || record.merchant === null ? DEFAULT_MERCHANT : record.merchant;
  if (merchant === DEFAULT_MERCHANT) {
    feedback.push(warning('merchant', 'MERCHANT_DEFAULTED'));
  }

  const amountCents = yuanToCents(record.amount);
  const occurredDate = toShanghaiDate(occurredAt);
  const transactionId = `tx_${randomUUID()}`;
  const nowIso = nowIsoShanghai();

  const transactionInput = {
    id: transactionId,
    userId: record.userId,
    direction,
    directionSource,
    amountCents,
    merchant,
    note: record.rawText,
    occurredAt,
    occurredDate,
    timeSource,
    chatAt,
    categoryId: category?.id ?? null,
    categorySource: classification.source,
    categoryConfidence: classification.confidence,
    sourceModality: record.modality,
    sourceRef: record.sourceRef,
    idempotencyKey: record.idempotencyKey,
    createdAt: nowIso,
    updatedAt: nowIso
  };
  const intakeInput = {
    idempotencyKey: record.idempotencyKey,
    recordId: record.recordId,
    batchId: batch.batchId,
    status: 'confirmed' as const,
    followupRound: round,
    transactionId,
    feedback
  };

  try {
    // 记录级原子性：账单与入站日志同事务提交，避免只写一半造成幂等键卡死。
    db.transaction(() => {
      insertTransaction(db, transactionInput);
      saveIntake(db, intakeInput);
    })();
  } catch (error) {
    // 唯一冲突自愈：已存在同幂等键的账单时补写入站日志并返回 duplicate。
    if (isUniqueViolation(error)) {
      const existingTransaction = findTransactionByIdempotencyKey(db, record.idempotencyKey);
      if (existingTransaction !== null) {
        const duplicateFeedback = [warning(null, 'DUPLICATE_RECORD')];
        saveIntake(db, {
          ...intakeInput,
          status: 'confirmed',
          transactionId: existingTransaction.id,
          feedback: duplicateFeedback
        });
        return {
          recordId: record.recordId,
          status: 'duplicate',
          transactionId: existingTransaction.id,
          direction: existingTransaction.direction,
          occurredAt: existingTransaction.occurredAt,
          category: existingTransaction.category,
          confidence: null,
          feedback: duplicateFeedback
        };
      }
    }
    throw error;
  }

  return {
    recordId: record.recordId,
    status: 'confirmed',
    transactionId,
    direction,
    occurredAt,
    category: toView(category),
    confidence: classification.confidence,
    feedback
  };
}

/** 处理一个批次：逐条判定并入库，返回与输入 recordId 对应的结果。 */
export function processBatch(db: Db, batch: RawBatch): BatchResult {
  const categories = listCategories(db);
  const results = batch.records.map((record) => processRecord(db, batch, record, categories));
  return { batchId: batch.batchId, results };
}
