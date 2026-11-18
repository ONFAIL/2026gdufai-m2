/** 退款/退货类文本。命中后不生成账单，引导用户作废原单（契约 §1.5）。 */
const REFUND_PATTERN = /退款|退货|退差价|退费/;

/** 判断一段用户输入是否属于退款/退货场景。 */
export function isRefund(rawText: string): boolean {
  return REFUND_PATTERN.test(rawText);
}
