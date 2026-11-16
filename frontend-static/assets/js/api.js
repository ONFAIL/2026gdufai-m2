/**
 * api.js —— 网络请求的唯一出口。页面脚本里出现 fetch 即违规。
 * USE_MOCK = true 时走本地 mock（扮演后端 M2），后端就绪后改 false 并填 API_BASE 即可。
 */
import {
  mockGetCategories,
  mockGetStats,
  mockListTransactions,
  mockGetBudgets,
} from '../../mock/db.js'
import { mockImportBatch } from '../../mock/import.js'

const USE_MOCK = true
const API_BASE = ''
const MOCK_DELAY = 180

/**
 * 统一错误对象：错误码来自契约 §2.6 的 error.code。
 */
export class ApiError extends Error {
  constructor(code, message) {
    super(message)
    this.name = 'ApiError'
    this.code = code
  }
}

function wait(ms) {
  return new Promise((resolve) => window.setTimeout(resolve, ms))
}

async function request(path, options = {}) {
  let res
  try {
    res = await fetch(API_BASE + path, {
      ...options,
      headers: { 'Content-Type': 'application/json', ...(options.headers || {}) },
    })
  } catch (err) {
    throw new ApiError('NETWORK', '网络不可用，请检查连接后重试')
  }
  const body = await res.json().catch(() => null)
  if (!res.ok) {
    const error = body && body.error ? body.error : null
    throw new ApiError(error ? error.code : 'HTTP_' + res.status, error ? error.message : '请求失败（' + res.status + '）')
  }
  return body
}

function buildQuery(query) {
  const params = new URLSearchParams()
  if (query.limit) params.set('limit', String(query.limit))
  if (query.cursor) params.set('cursor', String(query.cursor))
  if (query.categoryId) params.set('categoryId', String(query.categoryId))
  const tail = params.toString()
  return tail ? '?' + tail : ''
}

export const api = {
  /**
   * 类别字典。契约 §2.4：直接返回数组。
   * @returns {Promise<Array>}
   */
  async getCategories() {
    if (USE_MOCK) {
      await wait(MOCK_DELAY)
      return mockGetCategories()
    }
    return request('/api/categories')
  },

  /**
   * 统计。契约 §2.2。
   * @param {'recent7'|'month'|'day'|'year'} dimension
   * @returns {Promise<Object>}
   */
  async getStats(dimension) {
    if (USE_MOCK) {
      await wait(MOCK_DELAY)
      return mockGetStats(dimension)
    }
    return request('/api/stats?dimension=' + encodeURIComponent(dimension))
  },

  /**
   * 账单一览。契约 §2.3：游标分页，参数只有 limit / cursor / categoryId。
   * @param {{limit?:number, cursor?:string|null, categoryId?:number|string}} query
   * @returns {Promise<Object>}
   */
  async listTransactions(query = {}) {
    if (USE_MOCK) {
      await wait(MOCK_DELAY)
      return mockListTransactions(query)
    }
    return request('/api/transactions' + buildQuery(query))
  },

  /**
   * 预算状态。契约 §2.5：直接返回数组。
   * @param {string} month YYYY-MM
   * @returns {Promise<Array>}
   */
  async getBudgets(month) {
    if (USE_MOCK) {
      await wait(MOCK_DELAY)
      return mockGetBudgets(month)
    }
    return request('/api/budgets?month=' + encodeURIComponent(month))
  },

  /**
   * 提交记账批次。契约 §1.1 / §1.4。
   * @param {Object} batch
   * @returns {Promise<Object>}
   */
  async importBatch(batch) {
    if (USE_MOCK) {
      await wait(MOCK_DELAY + 80)
      return mockImportBatch(batch)
    }
    return request('/api/transactions/import', {
      method: 'POST',
      body: JSON.stringify(batch),
    })
  },

  /**
   * 读取静态片段（导航）。静态资源，不走 mock 开关。
   * @param {string} path
   * @returns {Promise<string>}
   */
  async loadPartial(path) {
    const res = await fetch(path, { cache: 'no-store' })
    if (!res.ok) throw new ApiError('PARTIAL_NOT_FOUND', '静态片段加载失败：' + path)
    return res.text()
  },
}
