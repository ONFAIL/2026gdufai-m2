import { describe, expect, it } from 'vitest';
import { parseBatch } from '../../src/modules/ledger/validation.ts';

const baseRecord = {
  recordId: 'r1',
  userId: 'u1',
  direction: null,
  amount: 32.5,
  merchant: null,
  occurredAt: '2026-11-14T09:12:00+08:00',
  chatAt: null,
  rawText: '早上瑞幸花了32块5',
  modality: 'text',
  sourceRef: null,
  confidence: 0.9,
  idempotencyKey: 'k1'
};

const baseBatch = {
  version: 1,
  batchId: 'b1',
  sentAt: '2026-11-15T21:00:00+08:00',
  records: [baseRecord]
};

function withRecord(patch: Record<string, unknown>, batchPatch: Record<string, unknown> = {}) {
  return { ...baseBatch, ...batchPatch, records: [{ ...baseRecord, ...patch }] };
}

describe('parseBatch', () => {
  it('合法批次通过并规范化', () => {
    const result = parseBatch(baseBatch);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.batch.batchId).toBe('b1');
      expect(result.batch.records[0]?.amount).toBe(32.5);
    }
  });

  it('amount 为 null 合法（未识别）', () => {
    const result = parseBatch(withRecord({ amount: null }));
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.batch.records[0]?.amount).toBeNull();
    }
  });

  it('version 非 1 拒收', () => {
    const result = parseBatch({ ...baseBatch, version: 2 });
    expect(result).toMatchObject({ ok: false, field: 'version' });
  });

  it('sentAt 缺失拒收', () => {
    const result = parseBatch({ ...baseBatch, sentAt: undefined });
    expect(result).toMatchObject({ ok: false, field: 'sentAt' });
  });

  it('sentAt 不带时区拒收', () => {
    const result = parseBatch({ ...baseBatch, sentAt: '2026-11-15T21:00:00' });
    expect(result).toMatchObject({ ok: false, field: 'sentAt' });
  });

  it('records 为空数组拒收', () => {
    const result = parseBatch({ ...baseBatch, records: [] });
    expect(result).toMatchObject({ ok: false, field: 'records' });
  });

  it('modality 非法拒收并指出字段', () => {
    const result = parseBatch(withRecord({ modality: 'video' }));
    expect(result).toMatchObject({ ok: false, field: 'records[0].modality' });
  });

  it('direction 非法拒收', () => {
    const result = parseBatch(withRecord({ direction: 'transfer' }));
    expect(result).toMatchObject({ ok: false, field: 'records[0].direction' });
  });

  it('金额超过两位小数拒收', () => {
    const result = parseBatch(withRecord({ amount: 12.345 }));
    expect(result).toMatchObject({ ok: false, field: 'records[0].amount' });
  });

  it('金额为字符串拒收', () => {
    const result = parseBatch(withRecord({ amount: '32.5' }));
    expect(result).toMatchObject({ ok: false, field: 'records[0].amount' });
  });

  it('缺 idempotencyKey 拒收', () => {
    const result = parseBatch(withRecord({ idempotencyKey: undefined }));
    expect(result).toMatchObject({ ok: false, field: 'records[0].idempotencyKey' });
  });

  it('occurredAt 无时区拒收', () => {
    const result = parseBatch(withRecord({ occurredAt: '2026-11-14T09:12:00' }));
    expect(result).toMatchObject({ ok: false, field: 'records[0].occurredAt' });
  });

  it('超过 100 条拒收', () => {
    const records = Array.from({ length: 101 }, (_, index) => ({
      ...baseRecord,
      recordId: `r${index}`,
      idempotencyKey: `k${index}`
    }));
    const result = parseBatch({ ...baseBatch, records });
    expect(result).toMatchObject({ ok: false, field: 'records' });
  });
});
