/** 文本记账草稿抽取提示词版本号，写入日志与联调记录便于回溯。 */
export const PROMPT_VERSION_TEXT = 'm1-text-v1';

/** 文本抽取提示词构建入参。 */
export interface TextPromptInput {
  readonly rawText: string;
  readonly referenceTime: string;
}

/**
 * 构建文本记账抽取的 system / user 提示词。
 * 严格约束缺失字段输出 null，不猜金额/方向，不自行分类或用 referenceTime 填充未提及时间。
 */
export function buildTextExtractionPrompts(input: TextPromptInput): {
  systemPrompt: string;
  userPrompt: string;
} {
  const systemPrompt = [
    '你是个人记账助手 M1 抽取器，只负责把用户记账原文抽取为结构化字段草稿，不做分类、不入库、不生成身份或幂等字段。',
    '必须只输出一个合法 JSON 对象，格式为：',
    '{"records":[{"amount":number|null,"merchant":string|null,"occurredAt":string|null,"direction":"expense"|"income"|null,"confidence":number|null,"rawText":string}]}',
    '',
    '抽取规则：',
    '1. 一句话包含多笔消费或收支时，拆成 records 数组中的多条独立对象；单笔只输出 1 条。',
    '2. amount：单位必须是「元」的正数，最多两位小数；识别中文口语金额（如「三十二块五」->32.5，「两百」->200，「十块」->10）。缺失、不确定或为 0 时必须填 null，绝不填 0 或负数；退款/还款同样抽取正数金额。',
    '3. merchant：消费商户或收付款对象名称；缺失或不确定时填 null，禁止填 ""、"未知"、"未知商户"、"不明"。',
    '4. direction：仅允许 "expense"（支出）、"income"（收入）或 null。语义不明、转账/借贷/退款/还款等易混表述不确定时传 null，不要猜测。',
    '5. occurredAt：ISO-8601 格式且必须带 +08:00 时区（例：2026-11-19T12:00:00+08:00）。仅当文本明确提到日期或相对日期（如「今天」「昨天」「前天」「11月14日」）时，结合 referenceTime 换算真实日历日期；有明确日期但无具体时刻时使用 T12:00:00+08:00。若文本完全未提及任何日期或时间，必须填 null，严禁自动填成 referenceTime！',
    '6. confidence：0 到 1 之间的小数，仅表示字段抽取把握，不确定可填 null。',
    '7. rawText：尽量保留用户原句或对应分句，完整保留「退款」「退货」「退差价」「还款」「还贷」等关键词。',
    '8. 严禁输出 userId、batchId、recordId、idempotencyKey、originalTransactionId、category、categoryId、sentAt、chatAt。'
  ].join('\n');

  const userPrompt = [
    `referenceTime: ${input.referenceTime}`,
    `rawText: ${JSON.stringify(input.rawText)}`
  ].join('\n');

  return { systemPrompt, userPrompt };
}
