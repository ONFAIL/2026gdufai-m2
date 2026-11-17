import type { Modality, RawBatch, RawRecord } from './types.ts';

const MODALITIES: readonly Modality[] = ['text', 'voice', 'image'];
const DIRECTIONS = ['expense', 'income'] as const;
const ISO_PATTERN = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d{1,3})?(Z|[+-]\d{2}:\d{2})$/;
const MAX_RECORDS = 100;

export type ParseResult =
  | { readonly ok: true; readonly batch: RawBatch }
  | { readonly ok: false; readonly field?: string; readonly message: string };

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === 'string' && value.trim() !== '';
}

/** 只接受带时区偏移的 ISO-8601，避免把本地时间当成 UTC。 */
function isIsoTime(value: unknown): value is string {
  return typeof value === 'string' && ISO_PATTERN.test(value) && !Number.isNaN(Date.parse(value));
}

/** 金额必须是有限数字且最多两位小数；非法金额属于模块 1 的字段错误。 */
function isAmount(value: unknown): value is number {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    return false;
  }
  const scaled = value * 100;
  return Math.abs(scaled - Math.round(scaled)) <= 1e-6;
}

function fail(message: string, field?: string): ParseResult {
  return { ok: false, message, field };
}

function parseDirection(value: unknown, index: number): ParseResult | RawRecord['direction'] {
  if (value === undefined || value === null) {
    return null;
  }
  if (typeof value === 'string' && (DIRECTIONS as readonly string[]).includes(value)) {
    return value as RawRecord['direction'];
  }
  return fail(`records[${index}].direction 只能是 expense / income / null`, `records[${index}].direction`);
}

function parseModality(value: unknown, index: number): ParseResult | Modality {
  if (typeof value === 'string' && (MODALITIES as readonly string[]).includes(value)) {
    return value as Modality;
  }
  return fail(`records[${index}].modality 只能是 text / voice / image`, `records[${index}].modality`);
}

function parseRecord(value: unknown, index: number): ParseResult | RawRecord {
  if (!isObject(value)) {
    return fail(`records[${index}] 必须是对象`, `records[${index}]`);
  }

  const prefix = `records[${index}]`;
  if (!isNonEmptyString(value.recordId)) {
    return fail(`${prefix}.recordId 必填`, `${prefix}.recordId`);
  }
  if (!isNonEmptyString(value.userId)) {
    return fail(`${prefix}.userId 必填`, `${prefix}.userId`);
  }
  if (!isNonEmptyString(value.rawText)) {
    return fail(`${prefix}.rawText 必填`, `${prefix}.rawText`);
  }
  if (!isNonEmptyString(value.idempotencyKey)) {
    return fail(`${prefix}.idempotencyKey 必填`, `${prefix}.idempotencyKey`);
  }

  const modality = parseModality(value.modality, index);
  if (typeof modality !== 'string') {
    return modality as ParseResult;
  }

  const direction = parseDirection(value.direction, index);
  if (direction !== null && typeof direction !== 'string') {
    return direction as ParseResult;
  }

  if (value.amount !== undefined && value.amount !== null && !isAmount(value.amount)) {
    return fail(`${prefix}.amount 必须是最多两位小数的数字`, `${prefix}.amount`);
  }
  if (value.merchant !== undefined && value.merchant !== null && typeof value.merchant !== 'string') {
    return fail(`${prefix}.merchant 必须是字符串或 null`, `${prefix}.merchant`);
  }
  if (value.occurredAt !== undefined && value.occurredAt !== null && !isIsoTime(value.occurredAt)) {
    return fail(`${prefix}.occurredAt 必须是带时区的 ISO-8601`, `${prefix}.occurredAt`);
  }
  if (value.chatAt !== undefined && value.chatAt !== null && !isIsoTime(value.chatAt)) {
    return fail(`${prefix}.chatAt 必须是带时区的 ISO-8601`, `${prefix}.chatAt`);
  }
  if (value.sourceRef !== undefined && value.sourceRef !== null && typeof value.sourceRef !== 'string') {
    return fail(`${prefix}.sourceRef 必须是字符串或 null`, `${prefix}.sourceRef`);
  }
  if (
    value.confidence !== undefined &&
    value.confidence !== null &&
    (typeof value.confidence !== 'number' || value.confidence < 0 || value.confidence > 1)
  ) {
    return fail(`${prefix}.confidence 必须在 0–1 之间`, `${prefix}.confidence`);
  }

  return {
    recordId: value.recordId,
    userId: value.userId,
    direction: direction as RawRecord['direction'],
    amount: (value.amount ?? null) as number | null,
    merchant: (value.merchant ?? null) as string | null,
    occurredAt: (value.occurredAt ?? null) as string | null,
    chatAt: (value.chatAt ?? null) as string | null,
    rawText: value.rawText,
    modality: modality as Modality,
    sourceRef: (value.sourceRef ?? null) as string | null,
    confidence: (value.confidence ?? null) as number | null,
    idempotencyKey: value.idempotencyKey
  };
}

/**
 * 校验并规范化模块 1 的批次 JSON。
 * 任一条必填字段缺失或类型非法，整批拒收（契约 1.1 / R1）。
 */
export function parseBatch(input: unknown): ParseResult {
  if (!isObject(input)) {
    return fail('批次必须是 JSON 对象');
  }
  if (input.version !== 1) {
    return fail('version 必须为 1', 'version');
  }
  if (!isNonEmptyString(input.batchId)) {
    return fail('batchId 必填', 'batchId');
  }
  if (!isIsoTime(input.sentAt)) {
    return fail('sentAt 必填且必须带时区（ISO-8601）', 'sentAt');
  }
  if (!Array.isArray(input.records) || input.records.length === 0) {
    return fail('records 必须是非空数组', 'records');
  }
  if (input.records.length > MAX_RECORDS) {
    return fail(`records 最多 ${MAX_RECORDS} 条`, 'records');
  }

  const records: RawRecord[] = [];
  for (const [index, item] of input.records.entries()) {
    const parsed = parseRecord(item, index);
    if ('ok' in parsed && parsed.ok === false) {
      return parsed;
    }
    records.push(parsed as RawRecord);
  }

  return {
    ok: true,
    batch: {
      version: 1,
      batchId: input.batchId,
      sentAt: input.sentAt,
      records
    }
  };
}
