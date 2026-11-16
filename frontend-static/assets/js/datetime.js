/**
 * datetime.js —— 时间的唯一出口。统一 Asia/Shanghai（+08:00）口径。
 * 契约：occurredAt 必须是带 +08:00 的 ISO-8601；统计口径固定 Asia/Shanghai。
 */

const TZ_OFFSET = '+08:00'
const TZ_SHIFT_MS = 8 * 3600 * 1000
const PAD = (n) => String(n).padStart(2, '0')

export const WEEKDAY = ['周日', '周一', '周二', '周三', '周四', '周五', '周六']

/**
 * 补齐时区偏移。缺偏移的补 +08:00，Z 结尾的换算成本地 +08:00。
 * @param {string|null|undefined} value
 * @returns {string|null}
 */
export function normalizeIsoOffset(value) {
  if (!value) return null
  const text = String(value).trim()
  if (/[+-]\d{2}:\d{2}$/.test(text)) return text
  if (/z$/i.test(text)) return fromDate(new Date(text))
  if (/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(text)) return text + ':00' + TZ_OFFSET
  if (/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}$/.test(text)) return text + TZ_OFFSET
  if (/^\d{4}-\d{2}-\d{2}$/.test(text)) return text + 'T12:00:00' + TZ_OFFSET
  return text
}

function fromDate(date) {
  const shifted = new Date(date.getTime() + TZ_SHIFT_MS)
  return shifted.toISOString().slice(0, 19) + TZ_OFFSET
}

/**
 * 当前时刻的 ISO-8601（+08:00）。前端自己造时间只走这里。
 * @returns {string}
 */
export function nowIso() {
  return fromDate(new Date())
}

/**
 * 取日期键 YYYY-MM-DD。
 * @param {string} iso
 * @returns {string}
 */
export function toDateKey(iso) {
  const normalized = normalizeIsoOffset(iso)
  return normalized ? normalized.slice(0, 10) : ''
}

/**
 * 取月份键 YYYY-MM。
 * @param {string} iso
 * @returns {string}
 */
export function toMonthKey(iso) {
  const normalized = normalizeIsoOffset(iso)
  return normalized ? normalized.slice(0, 7) : ''
}

/**
 * 展示用：11-16 08:20。
 * @param {string} iso
 * @returns {string}
 */
export function fmtDateTime(iso) {
  const normalized = normalizeIsoOffset(iso)
  if (!normalized) return '—'
  return normalized.slice(5, 10) + ' ' + normalized.slice(11, 16)
}

/**
 * 展示用：2026-11-16。
 * @param {string} iso
 * @returns {string}
 */
export function fmtDate(iso) {
  const key = toDateKey(iso)
  return key || '—'
}

/**
 * 输入框回填用：2026-11-16T08:20。
 * `<input type="datetime-local">` 只认这个形状（不带时区、不带秒），所以转换留在这里，
 * 页面里不要再自己 slice——那是上一版的违规点。
 * @param {string|null|undefined} iso
 * @returns {string} 缺失返回空串（表单控件只能填字符串）
 */
export function toDatetimeLocal(iso) {
  const normalized = normalizeIsoOffset(iso)
  if (!normalized) return ''
  return normalized.slice(0, 16)
}

/**
 * 以 endKey 为最后一天，倒推 n 天的日期键数组（升序）。
 * @param {string} endKey YYYY-MM-DD
 * @param {number} n 天数
 * @returns {string[]}
 */
export function recentKeys(endKey, n) {
  const [y, m, d] = endKey.split('-').map(Number)
  const end = Date.UTC(y, m - 1, d)
  const keys = []
  for (let i = n - 1; i >= 0; i -= 1) {
    const dt = new Date(end - i * 86400000)
    keys.push(dt.getUTCFullYear() + '-' + PAD(dt.getUTCMonth() + 1) + '-' + PAD(dt.getUTCDate()))
  }
  return keys
}

/**
 * 近 7 日日期键（含今天）。
 * @param {string} endKey
 * @returns {string[]}
 */
export function recent7Keys(endKey) {
  return recentKeys(endKey, 7)
}

/**
 * 日期键 → 星期几简称。
 * @param {string} dateKey
 * @returns {string}
 */
export function weekdayOf(dateKey) {
  const [y, m, d] = dateKey.split('-').map(Number)
  return WEEKDAY[new Date(Date.UTC(y, m - 1, d)).getUTCDay()]
}
