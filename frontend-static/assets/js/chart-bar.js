/**
 * chart-bar.js —— 纯 CSS 柱状图（零第三方依赖）。
 * 标签按维度取，不用固定 slice(-5)：month 显示「11月」，日粒度显示「MM-DD」。
 */
import { h, emptyState } from './ui.js'
import { formatCents } from './money.js'

/**
 * 把一个桶的 period 转成 X 轴标签。
 * @param {string} period 契约里的 period：month 为 YYYY-MM，日粒度为 YYYY-MM-DD
 * @param {string} dimension
 * @returns {string}
 */
export function periodLabel(period, dimension) {
  const text = String(period || '')
  if (dimension === 'month') return text.length >= 7 ? Number(text.slice(5, 7)) + '月' : text
  if (dimension === 'year') return text
  if (text.length === 7) return Number(text.slice(5, 7)) + '月'
  return text.slice(5)
}

/**
 * 渲染柱状图。空值桶画一条 2px 的底线，不画成 0 元的高度。
 * @param {HTMLElement} container
 * @param {Array<Object>} buckets 契约 §2.2 的 buckets
 * @param {string} dimension
 */
export function renderBarChart(container, buckets, dimension) {
  const list = Array.isArray(buckets) ? buckets : []
  if (!list.length) {
    container.replaceChildren(emptyState('这段时间还没有记录', '换个维度，或先记一笔'))
    return
  }

  const values = list.map((item) => Number(item.expenseCents) || 0)
  const max = Math.max.apply(null, values.concat([1]))
  const plot = h('div', { class: 'chart-plot' })
  const axis = h('div', { class: 'chart-axis' })

  list.forEach((item, index) => {
    const value = values[index]
    const height = value > 0 ? Math.max(Math.round((value / max) * 100), 6) : 2
    const label = periodLabel(item.period, dimension)
    plot.appendChild(
      h('div', { class: 'chart-col', title: label + ' ' + formatCents(value) }, [
        h('span', { class: 'chart-value', text: value > 0 ? formatCents(value) : '' }),
        h('div', {
          class: 'chart-bar' + (value > 0 ? '' : ' is-empty'),
          style: 'height:' + height + '%',
        }),
      ])
    )
    axis.appendChild(h('span', { text: label }))
  })

  container.replaceChildren(plot, axis)
}
