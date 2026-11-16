/**
 * mock/data.js —— 演示种子数据（类别字典 + 账单）。只有数据，没有逻辑。
 * 类别顺序与 ID 必须与契约 §3 数据字典一致。
 */
import { normalizeIsoOffset, toDateKey } from '../assets/js/datetime.js'

/** 演示用「今天」。后端就绪后整个 mock 目录可删。 */
export const DEMO_TODAY = '2026-11-16'

const CATEGORY_ROWS = [
  [1, '餐饮', 'expense', '#F97316', '🍜'],
  [2, '交通', 'expense', '#3B82F6', '🚇'],
  [3, '购物', 'expense', '#EC4899', '🛍'],
  [4, '居住', 'expense', '#10B981', '🏠'],
  [5, '娱乐', 'expense', '#8B5CF6', '🎬'],
  [6, '医疗', 'expense', '#EF4444', '💊'],
  [7, '教育', 'expense', '#F59E0B', '📚'],
  [8, '其他', 'expense', '#6B7280', '📦'],
  [9, '工资', 'income', '#22C55E', '💼'],
  [10, '奖学金', 'income', '#0EA5E9', '🎓'],
  [11, '红包', 'income', '#06B6D4', '🧧'],
]

export const categories = CATEGORY_ROWS.map(([id, name, kind, color, icon]) => ({
  id,
  name,
  kind,
  color,
  icon,
  isPreset: true,
  isActive: true,
}))

/**
 * 按 ID 取类别；找不到时兜底到「其他」。
 * @param {number|string} id
 * @returns {Object}
 */
export function catById(id) {
  return categories.find((item) => item.id === Number(id)) || categories[7]
}

// [id, occurredAt, merchant, amountCents, categoryId, sourceModality, categoryConfidence, anomalyFlag]
const TX_ROWS = [
  ['tx_001', '2026-11-16T08:20:00+08:00', '瑞幸咖啡', 1800, 1, 'image', 0.96, false],
  ['tx_002', '2026-11-15T18:40:00+08:00', '滴滴出行', 2640, 2, 'text', 0.94, false],
  ['tx_003', '2026-11-14T20:10:00+08:00', '淘宝', 12900, 3, 'image', 0.91, false],
  ['tx_004', '2026-11-12T12:05:00+08:00', '三食堂', 1500, 1, 'text', 0.93, false],
  ['tx_005', '2026-11-10T07:55:00+08:00', '地铁', 600, 2, 'text', 0.98, false],
  ['tx_006', '2026-11-09T19:30:00+08:00', '永辉超市', 8860, 3, 'image', 0.88, false],
  ['tx_007', '2026-11-08T10:00:00+08:00', '房东', 260000, 4, 'text', 0.99, false],
  ['tx_008', '2026-11-07T16:20:00+08:00', '大参林药店', 4650, 6, 'text', 0.9, false],
  ['tx_009', '2026-11-06T14:00:00+08:00', '学而优书店', 3980, 7, 'text', 0.86, false],
  ['tx_010', '2026-11-06T22:10:00+08:00', '网易云音乐', 1500, 5, 'text', 0.95, false],
  ['tx_011', '2026-11-05T09:00:00+08:00', '兼职工资', 80000, 9, 'text', 0.97, false],
  ['tx_012', '2026-11-04T21:15:00+08:00', '健身月卡', 19900, 5, 'text', 0.92, false],
  ['tx_013', '2026-11-03T17:45:00+08:00', '理发店', 4500, 8, 'text', 0.84, false],
  ['tx_014', '2026-11-02T08:10:00+08:00', '早餐摊', 800, 1, 'text', 0.93, false],
  ['tx_015', '2026-11-02T20:00:00+08:00', '教材', 6800, 7, 'image', 0.89, false],
  ['tx_016', '2026-11-01T12:30:00+08:00', '美团外卖', 2850, 1, 'image', 0.96, false],
  ['tx_017', '2026-11-01T15:00:00+08:00', '校级奖学金', 120000, 10, 'text', 0.99, false],
]

export const transactions = TX_ROWS.map(function (row) {
  const cat = catById(row[4])
  return {
    id: row[0],
    amountCents: row[3],
    merchant: row[2],
    occurredAt: normalizeIsoOffset(row[1]),
    occurredDate: toDateKey(row[1]),
    direction: cat.kind,
    category: { id: cat.id, name: cat.name, color: cat.color, icon: cat.icon },
    sourceModality: row[5],
    sourceRef: null,
    categoryConfidence: row[6],
    status: 'confirmed',
    anomalyFlag: row[7],
  }
})
