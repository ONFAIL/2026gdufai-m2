import type { CaptureDraft, PendingFeedbackHint } from '../types.ts';

/** 二阶段追问补丁抽取提示词版本号。 */
export const PROMPT_VERSION_FOLLOWUP = 'm1-followup-v1';

/** 追问补丁抽取提示词构建入参。 */
export interface FollowupPromptInput {
  readonly currentDraft: CaptureDraft;
  readonly followupText: string;
  readonly pendingFeedback?: readonly PendingFeedbackHint[];
  readonly referenceTime: string;
}

/**
 * 构建二阶段追问补充提示词。
 * 只抽取用户本轮明确补充或修正的字段，未提及字段保持省略，不覆盖已确认字段。
 */
export function buildFollowupExtractionPrompts(input: FollowupPromptInput): {
  systemPrompt: string;
  userPrompt: string;
} {
  const systemPrompt = [
    '你是个人记账助手 M1 追问补充抽取器，负责从用户的补充回复中抽取增量修正字段 patch。',
    '必须只输出一个合法 JSON 对象，格式为：',
    '{"patch":{"amount"?:number|null,"merchant"?:string|null,"occurredAt"?:string|null,"direction"?: "expense"|"income"|null,"confidence"?:number|null},"appendRawText"?:boolean}',
    '',
    '抽取规则：',
    '1. patch 中只允许放入用户在本轮 followupText 中明确给出或明确要求修改的字段。',
    '2. 未被本轮补充提及的字段必须彻底省略（不要出现在 patch 中，也不要输出 null），严禁覆盖或清空 currentDraft 中已确认的 merchant、occurredAt、direction 等字段。',
    '3. 若用户表示时间仍不知道（如「不记得哪天了」「忘了」）：当 currentDraft.occurredAt 原先为 null 时保持省略（不要填入 referenceTime）；仅当原值为无效/未来时间且用户明确表示不知道时可输出 "occurredAt": null 以便 M2 兜底。',
    '4. 金额规则与首轮一致：元为单位的正数，最多两位小数，禁止 0 或负数。时间格式为带 +08:00 的合法日历时间，有日期无时刻用 T12:00:00+08:00。',
    '5. 若补充内容澄清了交易性质或上下文（如「这笔是退款」「买奶茶忘了备注」），将 "appendRawText" 设为 true，不要删改原始记录文本中的关键语义。',
    '6. 严禁输出 userId、batchId、recordId、idempotencyKey、originalTransactionId。'
  ].join('\n');

  const userPrompt = [
    `referenceTime: ${input.referenceTime}`,
    `currentDraft: ${JSON.stringify(input.currentDraft)}`,
    `pendingFeedback: ${JSON.stringify(input.pendingFeedback ?? [])}`,
    `followupText: ${JSON.stringify(input.followupText)}`
  ].join('\n');

  return { systemPrompt, userPrompt };
}
