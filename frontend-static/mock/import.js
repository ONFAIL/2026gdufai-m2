/**
 * mock/import.js —— 扮演后端 M2 的入站处理：分类推断、追问、幂等、状态机。
 * 契约依据：§1.4 结果格式、§1.5 反馈码、§1.6 追问轮次。
 */
import { catById } from './data.js'
import { normalizeIsoOffset } from '../assets/js/datetime.js'

const KEYWORD_MAP = {
  1: ['餐', '饭', '面', '粉', '咖啡', '奶茶', '瑞幸', '外卖', '食堂', '火锅', '烧烤'],
  2: ['地铁', '公交', '滴滴', '打车', '高铁', '加油', '停车'],
  3: ['淘宝', '京东', '拼多多', '超市', '商场', '衣服', '鞋', '手机壳', '打印'],
  4: ['房租', '水费', '电费', '燃气', '物业', '宽带'],
  5: ['电影', '游戏', '会员', '健身', 'KTV', '旅游', '演出'],
  6: ['药', '医院', '挂号', '体检', '诊所'],
  7: ['书', '教材', '课程', '学费', '网课', '培训'],
  9: ['工资', '薪', '奖金', '兼职', '稿费'],
  10: ['奖学金', '补助', '报销'],
  11: ['红包', '转账'],
}

function guessCategoryId(text) {
  const ids = Object.keys(KEYWORD_MAP)
  for (let i = 0; i < ids.length; i += 1) {
    const hit = KEYWORD_MAP[ids[i]].some((word) => text.indexOf(word) !== -1)
    if (hit) return Number(ids[i])
  }
  return null
}

/** 幂等键 → 已追问轮次。契约 §1.6：满 3 轮转 rejected。 */
const roundMap = new Map()

function fb(field, code, severity) {
  return { field, code, severity }
}

function makeResult(rec, status, feedback, cat, occurredAt) {
  const done = status === 'confirmed' || status === 'duplicate'
  return {
    recordId: rec.recordId,
    status,
    transactionId: done ? 'tx_' + String(rec.idempotencyKey || 'demo').slice(-6) : null,
    direction: cat ? cat.kind : null,
    occurredAt: occurredAt || null,
    category: cat ? { id: cat.id, name: cat.name, kind: cat.kind } : null,
    confidence: typeof rec.confidence === 'number' ? rec.confidence : null,
    feedback,
  }
}

function handleRecord(rec, batchSentAt) {
  const key = String(rec.idempotencyKey || rec.recordId)
  const round = (roundMap.get(key) || 0) + 1
  roundMap.set(key, round)

  const text = String(rec.rawText || '')
  const catId = rec.categoryId || guessCategoryId(text)
  const cat = catId ? catById(catId) : null
  // 契约 §1.6：首轮缺时间要追问，第 2 轮起才用聊天时间兜底并回 TIME_DEFAULTED_TO_CHAT_TIME
  const explicitAt = normalizeIsoOffset(rec.occurredAt)
  const batchAt = normalizeIsoOffset(batchSentAt)
  const timeDefaulted = !explicitAt && round >= 2 && Boolean(batchAt)
  const occurredAt = explicitAt || (timeDefaulted ? batchAt : null)

  // 退款/退货：放弃处理，提示去账单里作废原账单
  if (text.indexOf('退款') !== -1) {
    return makeResult(rec, 'rejected', [fb('amount', 'REFUND_NOT_SUPPORTED', 'blocking')], null)
  }
  // 疑似重复：走 blocking 追问，让「改商户后重发」这条分支可以被演示
  if (text.indexOf('疑似重复') !== -1) {
    return makeResult(rec, 'pending_followup', [fb('merchant', 'DUPLICATE_RECORD', 'blocking')], cat)
  }
  // 真重复：静默按成功处理，不报错
  if (text.indexOf('重复') !== -1) {
    return makeResult(rec, 'duplicate', [], cat, occurredAt)
  }

  const blocking = []
  if (rec.amount === null || rec.amount === undefined) {
    blocking.push(fb('amount', 'MISSING_AMOUNT', 'blocking'))
  }
  if (!occurredAt) blocking.push(fb('occurredAt', 'MISSING_TIME', 'blocking'))
  if (!rec.direction && !cat) blocking.push(fb('direction', 'MISSING_DIRECTION', 'blocking'))
  if (blocking.length) {
    if (round >= 3) return makeResult(rec, 'rejected', blocking, null)
    return makeResult(rec, 'pending_followup', blocking, cat)
  }

  const warnings = []
  if (timeDefaulted) warnings.push(fb('occurredAt', 'TIME_DEFAULTED_TO_CHAT_TIME', 'warning'))
  if (!rec.merchant) warnings.push(fb('merchant', 'MERCHANT_DEFAULTED', 'warning'))
  if (typeof rec.confidence === 'number' && rec.confidence < 0.75) {
    warnings.push(fb('category', 'LOW_CONFIDENCE_CATEGORY', 'warning'))
  }
  return makeResult(rec, 'confirmed', warnings, cat, occurredAt)
}

/**
 * 批次导入。契约 §1.1：一次可含多条，逐条返回结果。
 * @param {Object} batch { version, batchId, sentAt, records[] }
 * @returns {{batchId:string, results:Array}}
 */
export function mockImportBatch(batch) {
  const sentAt = normalizeIsoOffset(batch.sentAt)
  const records = Array.isArray(batch.records) ? batch.records : []
  return { batchId: batch.batchId, results: records.map((rec) => handleRecord(rec, sentAt)) }
}
