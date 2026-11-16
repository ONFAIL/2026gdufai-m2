/**
 * mock/db.js —— 查询侧：类别字典、统计、账单分页、预算状态。
 * 入站处理（分类推断 / 追问 / 幂等）在 mock/import.js，种子数据在 mock/data.js。
 */
import { categories, catById, transactions, DEMO_TODAY } from './data.js'
import { nowIso, recent7Keys, toMonthKey } from '../assets/js/datetime.js'

/**
 * 类别字典。契约 §2.4：裸数组。
 * @returns {Array}
 */
export function mockGetCategories() {
  return categories.map((item) => Object.assign({}, item))
}

function aggregate(periods, dimension, range) {
  const buckets = periods.map((period) => ({
    period,
    expenseCents: 0,
    incomeCents: 0,
    netCents: 0,
    count: 0,
    categories: [],
  }))
  const index = new Map(buckets.map((bucket) => [bucket.period, bucket]))
  const catTotals = new Map()

  transactions.forEach((tx) => {
    let key = tx.occurredDate
    if (dimension === 'month') key = toMonthKey(tx.occurredAt)
    if (dimension === 'year') key = tx.occurredDate.slice(0, 4)
    const bucket = index.get(key)
    if (!bucket) return
    bucket.count += 1
    if (tx.direction === 'income') {
      bucket.incomeCents += tx.amountCents
      return
    }
    bucket.expenseCents += tx.amountCents
    const stat = catTotals.get(tx.category.id) || {
      categoryId: tx.category.id,
      name: tx.category.name,
      totalCents: 0,
    }
    stat.totalCents += tx.amountCents
    catTotals.set(tx.category.id, stat)
  })

  const expenseCents = buckets.reduce((sum, item) => sum + item.expenseCents, 0)
  const incomeCents = buckets.reduce((sum, item) => sum + item.incomeCents, 0)
  const count = buckets.reduce((sum, item) => sum + item.count, 0)
  const top = Array.from(catTotals.values()).sort((a, b) => b.totalCents - a.totalCents)[0] || null

  return {
    dimension,
    range,
    direction: 'all',
    summary: {
      expenseCents,
      incomeCents,
      netCents: incomeCents - expenseCents,
      count,
      topCategory: top
        ? {
            categoryId: top.categoryId,
            name: top.name,
            totalCents: top.totalCents,
            ratio: expenseCents ? Math.round((top.totalCents / expenseCents) * 1000) / 1000 : 0,
          }
        : null,
    },
    buckets,
    meta: {
      unit: 'cent',
      basis: { dateField: 'occurred_date', timezone: 'Asia/Shanghai', includeVoid: false },
      generatedAt: nowIso(),
      isEmpty: count === 0,
    },
  }
}

/**
 * 统计。契约 §2.2：recent7 固定 7 个日桶；month 只有 1 个桶，period 是 YYYY-MM。
 * @param {'recent7'|'month'|'day'|'year'} dimension
 * @returns {Object}
 */
export function mockGetStats(dimension = 'recent7') {
  if (dimension === 'month') {
    return aggregate(['2026-11'], 'month', { start: '2026-11-01', end: '2026-11-30' })
  }
  if (dimension === 'day') {
    return aggregate([DEMO_TODAY], 'day', { start: DEMO_TODAY, end: DEMO_TODAY })
  }
  if (dimension === 'year') {
    return aggregate(['2026'], 'year', { start: '2026-01-01', end: '2026-12-31' })
  }
  return aggregate(recent7Keys(DEMO_TODAY), 'recent7', { start: '2026-11-10', end: '2026-11-16' })
}

/**
 * 账单一览。契约 §2.3：游标分页，nextCursor 在 page 里；主键是 id 不是 transactionId。
 * @param {{limit?:number, cursor?:string|null, categoryId?:number|string}} query
 * @returns {Object}
 */
export function mockListTransactions(query = {}) {
  const limit = Number(query.limit) || 20
  const categoryId = query.categoryId ? Number(query.categoryId) : null
  const filtered = transactions
    .filter((tx) => (categoryId ? tx.category.id === categoryId : true))
    .slice()
    .sort((a, b) => (a.occurredAt < b.occurredAt ? 1 : -1))
  const offset = query.cursor ? Number(String(query.cursor).replace('c_', '')) || 0 : 0
  const items = filtered.slice(offset, offset + limit)
  const nextCursor = offset + items.length < filtered.length ? 'c_' + (offset + items.length) : null

  return {
    filter: { categoryId, from: null, to: null, direction: 'all' },
    summary: {
      count: filtered.length,
      expenseCents: filtered.reduce((s, t) => (t.direction === 'expense' ? s + t.amountCents : s), 0),
      incomeCents: filtered.reduce((s, t) => (t.direction === 'income' ? s + t.amountCents : s), 0),
    },
    items,
    page: { limit, hasMore: Boolean(nextCursor), nextCursor },
    meta: { unit: 'cent', isEmpty: filtered.length === 0 },
  }
}

const BUDGET_ROWS = [
  { scope: 'total', categoryId: null, amountCents: 350000 },
  { scope: 'category', categoryId: 1, amountCents: 8000 },
  { scope: 'category', categoryId: 2, amountCents: 3000 },
  { scope: 'category', categoryId: 3, amountCents: 20000 },
  { scope: 'category', categoryId: 4, amountCents: 280000 },
  { scope: 'category', categoryId: 5, amountCents: 40000 },
]

function levelOf(ratio) {
  if (ratio >= 1) return 'over'
  if (ratio >= 0.8) return 'near'
  return 'normal'
}

/**
 * 预算状态。契约 §2.5：裸数组；level 由 usageRatio 推出（≥0.8 near，≥1 over）。
 * @param {string} month YYYY-MM
 * @returns {Array}
 */
export function mockGetBudgets(month = '2026-11') {
  const spentByCat = new Map()
  let total = 0
  transactions.forEach((tx) => {
    if (tx.direction !== 'expense') return
    if (toMonthKey(tx.occurredAt) !== month) return
    total += tx.amountCents
    spentByCat.set(tx.category.id, (spentByCat.get(tx.category.id) || 0) + tx.amountCents)
  })

  return BUDGET_ROWS.map((row) => {
    const spent = row.scope === 'total' ? total : spentByCat.get(row.categoryId) || 0
    const ratio = row.amountCents ? spent / row.amountCents : 0
    const cat = row.categoryId ? catById(row.categoryId) : null
    return {
      scope: row.scope,
      category: cat ? { id: cat.id, name: cat.name, color: cat.color } : null,
      amountCents: row.amountCents,
      spentCents: spent,
      remainingCents: row.amountCents - spent,
      usageRatio: Math.round(ratio * 1000) / 1000,
      level: levelOf(ratio),
    }
  })
}
