import { randomUUID } from 'node:crypto';
import type { Db } from '../../db/client.ts';
import { yuanToCents } from '../../shared/money.ts';
import { nowIsoShanghai, toShanghaiDate } from '../../shared/time.ts';
import { classify } from './classifier.ts';
import { detectSpecialEntry, type SpecialEntry } from './intent.ts';
import {
  adjustTransactionAmount,
  findIntake,
  findTransactionByIdempotencyKey,
  getTransactionById,
  getTransactionView,
  insertTransaction,
  listCategories,
  listUserRules,
  saveIntake,
  voidTransaction
} from './repository.ts';
import type { CategoryRow, Direction, RawBatch, RawRecord } from './types.ts';

/** 契约 §1.5 登记的反馈码。 */
export type FeedbackCode =
  | 'MISSING_AMOUNT'
  | 'MISSING_TIME'
  | 'FUTURE_TIME'
  | 'MISSING_DIRECTION'
  | 'MISSING_ORIGINAL_TRANSACTION'
  | 'ORIGINAL_NOT_FOUND'
  | 'ORIGINAL_AMOUNT_ADJUSTED'
  | 'REFUND_EXCESS_AS_INCOME'
  | 'REPAYMENT_EXCESS_AS_EXPENSE'
  | 'CATEGORY_KIND_MISMATCH'
  | 'LOW_CONFIDENCE_CATEGORY'
  | 'MERCHANT_DEFAULTED'
  | 'TIME_DEFAULTED_TO_CHAT_TIME'
  | 'DIRECTION_FORCED_BY_CATEGORY'
  | 'DUPLICATE_RECORD'
  | 'REFUND_RECORDED_NEUTRAL'
  | 'REPAYMENT_RECORDED_NEUTRAL'
  | 'ORIGINAL_NOT_FOUND_RECORDED';

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
  /** 退款/还款匹配到的原账单 id；未匹配为 null。 */
  readonly matchedTransactionId: string | null;
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
/** 退款/还款原账单的匹配窗口。 */
const MATCH_WINDOW_DAYS = 30;

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

function withinMatchWindow(occurredAt: string, now: Date): boolean {
  const diff = now.getTime() - Date.parse(occurredAt);
  return diff >= 0 && diff <= MATCH_WINDOW_DAYS * 24 * 60 * 60 * 1000;
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
    matchedTransactionId: null,
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
  return rejected
    ? rejectedResult(record, feedback)
    : {
        recordId: record.recordId,
        status: 'pending_followup',
        transactionId: null,
        direction: record.direction ?? 'expense',
        occurredAt: record.occurredAt,
        category: null,
        confidence: null,
        matchedTransactionId: null,
        feedback
      };
}

interface ResolvedSpecial {
  amountCents: number;
  occurredAt: string;
  direction: Direction;
  category: CategoryRow | null;
  timeSource: 'explicit' | 'chat_time';
  chatAt: string | null;
}

/** 写入退款/还款记录；事务由调用方统一控制。 */
function persistSpecialEntry(
  db: Db,
  batch: RawBatch,
  record: RawRecord,
  round: number,
  resolved: ResolvedSpecial,
  extraFeedback: FeedbackItem[],
  matchedTransactionId: string | null,
  entryType: 'normal' | 'refund' | 'repayment'
): RecordResult {
  const direction = resolved.direction;
  const category = resolved.category;
  const merchant = record.merchant?.trim() === '' || record.merchant === null ? DEFAULT_MERCHANT : record.merchant;
  const feedback = [...extraFeedback];
  if (merchant === DEFAULT_MERCHANT) {
    feedback.push(warning('merchant', 'MERCHANT_DEFAULTED'));
  }

  const transactionId = `tx_${randomUUID()}`;
  const nowIso = nowIsoShanghai();

  insertTransaction(db, {
    id: transactionId,
    userId: record.userId,
    direction,
    directionSource: 'category',
    amountCents: resolved.amountCents,
    merchant,
    note: record.rawText,
    occurredAt: resolved.occurredAt,
    occurredDate: toShanghaiDate(resolved.occurredAt),
    timeSource: resolved.timeSource,
    chatAt: resolved.chatAt,
    categoryId: category?.id ?? null,
    categorySource: 'fallback',
    categoryConfidence: 0.3,
    sourceModality: record.modality,
    sourceRef: record.sourceRef,
    idempotencyKey: record.idempotencyKey,
    createdAt: nowIso,
    updatedAt: nowIso,
    entryType,
    matchedTransactionId
  });

  saveIntake(db, {
    idempotencyKey: record.idempotencyKey,
    recordId: record.recordId,
    batchId: batch.batchId,
    status: 'confirmed',
    followupRound: round,
    transactionId,
    feedback
  });

  return {
    recordId: record.recordId,
    status: 'confirmed',
    transactionId,
    direction,
    occurredAt: resolved.occurredAt,
    category: toView(category),
    confidence: 0.3,
    matchedTransactionId,
    feedback
  };
}

/** 超额部分按普通收入/支出入账（部分退款、带息还款）。 */
function insertExcessEntry(
  db: Db,
  record: RawRecord,
  resolved: ResolvedSpecial,
  direction: Direction,
  category: CategoryRow | null,
  amountCents: number,
  matchedTransactionId: string
): void {
  const nowIso = nowIsoShanghai();
  insertTransaction(db, {
    id: `tx_${randomUUID()}`,
    userId: record.userId,
    direction,
    directionSource: 'category',
    amountCents,
    merchant: record.merchant?.trim() === '' || record.merchant === null ? DEFAULT_MERCHANT : record.merchant,
    note: record.rawText,
    occurredAt: resolved.occurredAt,
    occurredDate: toShanghaiDate(resolved.occurredAt),
    timeSource: resolved.timeSource,
    chatAt: resolved.chatAt,
    categoryId: category?.id ?? null,
    categorySource: 'fallback',
    categoryConfidence: 0.3,
    sourceModality: record.modality,
    sourceRef: record.sourceRef,
    idempotencyKey: `${record.idempotencyKey}#excess`,
    createdAt: nowIso,
    updatedAt: nowIso,
    entryType: 'normal',
    matchedTransactionId
  });
}

/** 处理退款/还款：30 天内且带原账单 id 才算匹配，否则首轮追问、次轮兜底。 */
function handleSpecialEntry(
  db: Db,
  batch: RawBatch,
  record: RawRecord,
  round: number,
  kind: SpecialEntry,
  resolved: {
    amountCents: number;
    occurredAt: string;
    category: CategoryRow | null;
    timeSource: 'explicit' | 'chat_time';
    chatAt: string | null;
  },
  timeFeedback: FeedbackItem[],
  now: Date,
  categories: CategoryRow[],
  askedOriginal: boolean
): RecordResult {
  let matched: { id: string; direction: Direction; amountCents: number } | null = null;
  if (record.originalTransactionId !== null) {
    const original = getTransactionById(db, record.originalTransactionId, record.userId);
    if (
      original !== null &&
      original.entryType === 'normal' &&
      withinMatchWindow(original.occurredAt, now)
    ) {
      matched = { id: original.id, direction: original.direction, amountCents: original.amountCents };
    }
  }

  if (matched !== null) {
    const diff = resolved.amountCents - matched.amountCents;
    const direction: Direction = kind === 'refund' ? 'income' : 'expense';
    const feedback = [...timeFeedback];
    let result: RecordResult | undefined;

    db.transaction(() => {
      if (diff === 0) {
        // 全额退款/还款：作废原账单，退款/还款本身记中性。
        voidTransaction(db, matched.id, record.userId, nowIsoShanghai());
        feedback.push(
          warning(
            'originalTransactionId',
            kind === 'refund' ? 'REFUND_RECORDED_NEUTRAL' : 'REPAYMENT_RECORDED_NEUTRAL'
          )
        );
      } else if (diff < 0) {
        // 部分退款/还款：把原账单金额改为剩余金额。
        adjustTransactionAmount(
          db,
          matched.id,
          record.userId,
          matched.amountCents - resolved.amountCents,
          nowIsoShanghai()
        );
        feedback.push(warning('originalTransactionId', 'ORIGINAL_AMOUNT_ADJUSTED'));
      } else {
        // 退款/还款大于原账单：作废原账单，多余部分记收入/支出。
        voidTransaction(db, matched.id, record.userId, nowIsoShanghai());
        feedback.push(
          warning(
            'originalTransactionId',
            kind === 'refund' ? 'REFUND_EXCESS_AS_INCOME' : 'REPAYMENT_EXCESS_AS_EXPENSE'
          )
        );
      }

      result = persistSpecialEntry(
        db,
        batch,
        record,
        round,
        { ...resolved, direction, category: fallbackCategory(categories, direction) },
        feedback,
        matched.id,
        kind
      );

      if (diff > 0) {
        const excessName = direction === 'income' ? '其他收入' : '其他';
        const excessCategory =
          categories.find((item) => item.kind === direction && item.name === excessName) ??
          fallbackCategory(categories, direction);
        insertExcessEntry(
          db,
          record,
          { ...resolved, direction, category: excessCategory },
          direction,
          excessCategory,
          diff,
          matched.id
        );
      }
    })();

    if (result !== undefined) {
      return result;
    }
    throw new Error('persistSpecialEntry 未返回结果');
  }

  if (!askedOriginal) {
    // 还没问过原账单：即使本轮不是首轮，也要先问，避免直接兜底。
    const code =
      record.originalTransactionId === null
        ? 'MISSING_ORIGINAL_TRANSACTION'
        : 'ORIGINAL_NOT_FOUND';
    return persistPending(db, batch, record, round, [
      ...timeFeedback,
      blocking('originalTransactionId', code)
    ]);
  }

  const direction: Direction = kind === 'refund' ? 'income' : 'expense';
  const fallbackName = direction === 'income' ? '其他收入' : '其他';
  const category =
    categories.find((item) => item.kind === direction && item.name === fallbackName) ??
    fallbackCategory(categories, direction);
  let fallbackResult: RecordResult | undefined;
  db.transaction(() => {
    fallbackResult = persistSpecialEntry(
      db,
      batch,
      record,
      round,
      { ...resolved, direction, category },
      [...timeFeedback, warning('originalTransactionId', 'ORIGINAL_NOT_FOUND_RECORDED')],
      null,
      kind
    );
  })();
  if (fallbackResult !== undefined) {
    return fallbackResult;
  }
  throw new Error('persistSpecialEntry 未返回结果');
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
      matchedTransactionId: view?.matchedTransactionId ?? null,
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
      return persistPending(db, batch, record, round, [blocking('occurredAt', 'MISSING_TIME')]);
    }
    chatAt = record.chatAt ?? batch.sentAt;
    occurredAt = chatAt;
    timeSource = 'chat_time';
    timeFeedback.push(warning('occurredAt', 'TIME_DEFAULTED_TO_CHAT_TIME'));
  } else if (isFuture(occurredAt, now)) {
    if (round === 0) {
      return persistPending(db, batch, record, round, [blocking('occurredAt', 'FUTURE_TIME')]);
    }
    chatAt = record.chatAt ?? batch.sentAt;
    occurredAt = chatAt;
    timeSource = 'chat_time';
    timeFeedback.push(warning('occurredAt', 'TIME_DEFAULTED_TO_CHAT_TIME'));
  }

  const amountCents = yuanToCents(record.amount);
  const directionForFallback: Direction = record.direction ?? 'expense';
  const resolvedCategory = fallbackCategory(categories, directionForFallback);

  // 退款/还款：保留记录但不计入收支。
  const special = detectSpecialEntry(record.rawText);
  if (special !== null) {
    const askedOriginal =
      existing?.feedback.some(
        (item) => item.code === 'MISSING_ORIGINAL_TRANSACTION' || item.code === 'ORIGINAL_NOT_FOUND'
      ) ?? false;
    return handleSpecialEntry(
      db,
      batch,
      record,
      round,
      special,
      { amountCents, occurredAt, category: resolvedCategory, timeSource, chatAt },
      timeFeedback,
      now,
      categories,
      askedOriginal
    );
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
      return persistPending(db, batch, record, round, [blocking('direction', 'CATEGORY_KIND_MISMATCH')]);
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
    updatedAt: nowIso,
    entryType: 'normal' as const,
    matchedTransactionId: null
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
          matchedTransactionId: null,
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
    matchedTransactionId: null,
    feedback
  };
}

/** 处理一个批次：逐条判定并入库，返回与输入 recordId 对应的结果。 */
export function processBatch(db: Db, batch: RawBatch): BatchResult {
  const categories = listCategories(db);
  const results = batch.records.map((record) => processRecord(db, batch, record, categories));
  return { batchId: batch.batchId, results };
}
