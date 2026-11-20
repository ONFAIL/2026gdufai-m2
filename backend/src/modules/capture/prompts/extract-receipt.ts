/** 小票/账单截图视觉 OCR 抽取提示词版本号。 */
export const PROMPT_VERSION_RECEIPT = 'm1-receipt-v1';

/** 小票视觉抽取提示词构建入参。 */
export interface ReceiptPromptInput {
  readonly referenceTime: string;
}

/**
 * 构建小票/账单图片 OCR + 结构化抽取提示词。
 * 区分清晰小票、多金额（原价/优惠/实付）与模糊不可读图片。
 */
export function buildReceiptExtractionPrompts(input: ReceiptPromptInput): {
  systemPrompt: string;
  userPrompt: string;
} {
  const systemPrompt = [
    '你是个人记账助手 M1 消费小票与支付截图识别器，负责先识别小票关键文字再抽取结构化字段草稿。',
    '必须只输出一个合法 JSON 对象，格式为：',
    '{"readable":boolean,"reason"?:string,"ocrText":string|null,"records":[{"amount":number|null,"merchant":string|null,"occurredAt":string|null,"direction":"expense"|"income"|null,"confidence":number|null,"rawText":string}]}',
    '',
    '识别与抽取规则：',
    '1. 若图片模糊、反光遮挡、被严重裁剪、纯空白或不是消费小票/支付凭证，无法辨认关键信息，必须返回 {"readable":false,"reason":"具体原因","ocrText":null,"records":[]}，绝不编造数字。',
    '2. 单张小票出现多个金额（商品明细价、小计、满减优惠、配送费/打包费、实付金额）时，应只抽取最终「实付/应付/实收/合计」金额作为 1 条记录；若存在多个相互冲突的总额且无法判断实付金额，将 amount 设为 null 并调低 confidence。',
    '3. 若同一张图片中并排包含多笔明确独立的消费凭据，可拆成 records 多条；否则默认输出 1 条。',
    '4. amount 为元为单位的正数，最多两位小数，无法辨认填 null（不填 0）。',
    '5. merchant 提取店名/收款方，看不清填 null（不填「未知」）。',
    '6. occurredAt 提取票面消费时间（带 +08:00 偏移）；票面只有日期无时刻时使用 T12:00:00+08:00；票面无日期时必须填 null，不要抄写 referenceTime。',
    '7. direction 消费小票通常为 "expense"，退款凭据或不确定时可设为 null。',
    '8. rawText 简明保留小票关键摘要（商户、核心商品或「退款」等关键表达），严禁在任何字段内输出 base64、userId、originalTransactionId。'
  ].join('\n');

  const userPrompt = [
    `referenceTime: ${input.referenceTime}`,
    '请识别这张图片中的消费小票或支付凭证，并严格按 JSON Schema 输出结果。'
  ].join('\n');

  return { systemPrompt, userPrompt };
}
