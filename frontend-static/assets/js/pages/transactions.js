/**
 * transactions.js —— 账单一览：游标分页 + 类别筛选。页面零计算，全部读接口。
 */
import { api } from '../api.js'
import { h, injectNav, toast, emptyState, fillSelect, setBusy } from '../ui.js'
import { formatCents } from '../money.js'
import { fmtDateTime } from '../datetime.js'

const state = {
  cursor: null,
  hasMore: true,
  categoryId: '',
  count: 0,
  loading: false,
}

function rowNode(item) {
  const cat = item.category || {}
  const amountClass = item.direction === 'income' ? 'badge badge-ok' : ''
  return h('tr', {}, [
    h('td', { class: 'mono muted', text: fmtDateTime(item.occurredAt) }),
    h('td', {}, [
      h('span', { class: 'cat-dot', style: 'background:' + (cat.color || 'transparent') }),
      document.createTextNode(item.merchant || '—'),
    ]),
    h('td', { text: cat.name || '—' }),
    h('td', {}, [
      item.direction === 'income'
        ? h('span', { class: amountClass, text: '收入' })
        : h('span', { class: 'badge badge-neutral', text: '支出' }),
    ]),
    h('td', { class: 'num', text: formatCents(item.amountCents) }),
  ])
}

function renderSummary(summary) {
  const host = document.getElementById('list-summary')
  host.textContent =
    '共 ' + summary.count + ' 条 · 支出 ' + formatCents(summary.expenseCents) + ' · 收入 ' + formatCents(summary.incomeCents)
}

function renderFooter() {
  const foot = document.getElementById('list-foot')
  const more = document.getElementById('load-more')
  foot.textContent = state.hasMore ? '已加载 ' + state.count + ' 条，还有更多' : '共 ' + state.count + ' 条，已全部加载'
  more.disabled = !state.hasMore || state.loading
  more.textContent = state.hasMore ? '加载更多' : '没有更多了'
}

async function load(reset) {
  if (state.loading) return
  state.loading = true
  if (reset) {
    state.cursor = null
    state.count = 0
    document.getElementById('list-body').replaceChildren()
  }
  const more = document.getElementById('load-more')
  setBusy(more, true, '加载中…')

  try {
    const res = await api.listTransactions({
      limit: 8,
      cursor: state.cursor,
      categoryId: state.categoryId,
    })
    const body = document.getElementById('list-body')
    if (reset && res.items.length === 0) {
      body.replaceChildren()
      document.getElementById('list-empty').replaceChildren(
        emptyState('还没有记录', '回记账页说一句「早上瑞幸花了32块5」就行')
      )
    } else {
      document.getElementById('list-empty').replaceChildren()
      res.items.forEach((item) => body.appendChild(rowNode(item)))
    }
    state.count += res.items.length
    state.cursor = res.page.nextCursor
    state.hasMore = res.page.hasMore
    renderSummary(res.summary)
    renderFooter()
  } catch (err) {
    toast(err.message || '加载失败', 'danger')
  } finally {
    state.loading = false
    setBusy(more, false)
    more.textContent = state.hasMore ? '加载更多' : '没有更多了'
    more.disabled = !state.hasMore
  }
}

async function bindFilter() {
  const select = document.getElementById('cat-filter')
  try {
    const categories = await api.getCategories()
    fillSelect(
      select,
      categories.map((item) => ({ value: item.id, label: item.name })),
      '全部类别'
    )
  } catch (err) {
    toast('类别字典加载失败', 'danger')
  }
  select.addEventListener('change', () => {
    state.categoryId = select.value
    load(true)
  })
}

function boot() {
  injectNav('transactions')
  bindFilter()
  document.getElementById('load-more').addEventListener('click', () => load(false))
  load(true)
}

boot()
