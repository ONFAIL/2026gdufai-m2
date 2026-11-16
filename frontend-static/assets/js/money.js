/**
 * money.js —— 金额的唯一出口。分与元的换算只允许出现在本文件。
 * 契约：入站 records[].amount 单位是「元」；其余字段一律整数「分」。
 */

const CENTS_PER_YUAN = 100

/**
 * 把分格式化成人民币字符串；缺失返回破折号，绝不返回 ¥0.00。
 * @param {number|null|undefined} cents 整数分
 * @returns {string}
 */
export function formatCents(cents) {
  if (cents === null || cents === undefined || Number.isNaN(Number(cents))) return '—'
  const value = Number(cents) / CENTS_PER_YUAN
  const abs = Math.abs(value).toLocaleString('zh-CN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
  return (value < 0 ? '-¥' : '¥') + abs
}

/**
 * 分 → 输入框里的元字符串（用于回填，不参与展示）。
 * @param {number|null|undefined} cents
 * @returns {string}
 */
export function toYuanInput(cents) {
  if (cents === null || cents === undefined) return ''
  return (Number(cents) / CENTS_PER_YUAN).toFixed(2)
}

/**
 * 分 → 提交用的「元」数值。契约 §1.3 要求入站 amount 是元。
 * @param {number|null|undefined} cents
 * @returns {number|null}
 */
export function centsToYuanNumber(cents) {
  if (cents === null || cents === undefined) return null
  return Number(cents) / CENTS_PER_YUAN
}

/**
 * 用户输入的元字符串 → 整数分。非法或负数返回 null。
 * @param {string|null|undefined} value
 * @returns {number|null}
 */
export function yuanToCents(value) {
  if (value === null || value === undefined) return null
  const text = String(value).replace(/[¥￥,，\s]/g, '')
  if (!text) return null
  const num = Number(text)
  if (!Number.isFinite(num) || num < 0) return null
  return Math.round(num * CENTS_PER_YUAN)
}

function toCents(yuan) {
  return Math.round(yuan * CENTS_PER_YUAN)
}

const RE_TAIL = /(\d+(?:\.\d{1,2})?)\s*(?:元|块|圆)\s*([1-9])\s*(?:毛|角)?/
const RE_HALF = /(\d+)\s*(?:元|块|圆)\s*半/
const RE_UNIT = /(\d+(?:\.\d{1,2})?)\s*(?:元|块|圆)/
const RE_MAO = /(\d+)\s*(?:毛|角)/
const RE_VERB = /(?:花|买|付|充|消费|一共|合计)[^\d]{0,4}(\d+(?:\.\d{1,2})?)/

/**
 * 从中文口语里抽金额（分）。抽不出返回 null——契约 §1.3 明确「识别不出传 null，不要猜」。
 * 覆盖形态：32块5 → 32.50；32元5毛 → 32.50；3块半 → 3.50；5毛 → 0.50；32块 → 32.00。
 * @param {string} rawText
 * @returns {number|null}
 */
export function extractAmountFromText(rawText) {
  const text = String(rawText || '')
  if (!text.trim()) return null

  let m = text.match(RE_TAIL)
  if (m) return toCents(Number(m[1]) + Number(m[2]) / 10)

  m = text.match(RE_HALF)
  if (m) return toCents(Number(m[1]) + 0.5)

  m = text.match(RE_UNIT)
  if (m) return toCents(Number(m[1]))

  m = text.match(RE_MAO)
  if (m) return toCents(Number(m[1]) / 10)

  m = text.match(RE_VERB)
  if (m) return toCents(Number(m[1]))

  return null
}
