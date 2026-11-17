/** 退款/退货类文本。命中后保留记录但不计入收支（契约 §1.5）。 */
const REFUND_PATTERN = /退款|退货|退差价|退费/;

/** 还款/还贷类文本。命中后保留记录但不计入收支，并引导作废原贷款账单。 */
const REPAYMENT_PATTERN = /还款|还贷|偿还|还借款|分期还款/;

export type SpecialEntry = 'refund' | 'repayment';

/** 识别退款/还款场景；普通消费返回 null。 */
export function detectSpecialEntry(rawText: string): SpecialEntry | null {
  if (REFUND_PATTERN.test(rawText)) {
    return 'refund';
  }
  if (REPAYMENT_PATTERN.test(rawText)) {
    return 'repayment';
  }
  return null;
}

/** 判断是否为退款/退货文本。 */
export function isRefund(rawText: string): boolean {
  return detectSpecialEntry(rawText) === 'refund';
}
