/**
 * stats.js —— 统计报表。页面只做渲染：KPI、柱子、占比全部来自 /api/stats。
 */
import { api } from '../api.js'
import { h, injectNav, toast, emptyState } from '../ui.js'
import { formatCents } from '../money.js'
import { renderBarChart } from '../chart-bar.js'

let dimension = 'recent7'

const DIMENSION_TEXT = { recent7: '近 7 日', month: '本月' }

function kpi(label, value, note) {
  return h('div', { class: 'kpi' }, [
    h('div', { class: 'kpi-label', text: label }),
    h('div', { class: 'kpi-value' + (value === '—' ? ' is-muted' : ''), text: value }),
    note ? h('div', { class: 'kpi-note', text: note }) : null,
  ])
}

function renderKpis(summary) {
  document.getElementById('kpi-grid').replaceChildren(
    kpi('支出合计', formatCents(summary.expenseCents), DIMENSION_TEXT[dimension]),
    kpi('收入合计', formatCents(summary.incomeCents), ''),
    kpi('结余', formatCents(summary.netCents), '收入 − 支出'),
    kpi('笔数', String(summary.count) + ' 笔', '与图表非空柱数量一致')
  )
  const top = summary.topCategory
  document.getElementById('top-line').textContent = top
    ? '花得最多：' + top.name + ' · ' + formatCents(top.totalCents) + '（占支出 ' + Math.round(top.ratio * 100) + '%）'
    : '这个区间还没有支出记录'
}

function renderRatio(buckets) {
  const host = document.getElementById('ratio-list')
  host.replaceChildren()
  const only = buckets.length === 1 ? buckets[0] : null
  if (!only) {
    host.appendChild(
      h('p', { class: 'field-hint', text: '类别占比只在单一区间统计，多桶区间不合并（前端不做求和）。' })
    )
    host.appendChild(
      h('button', {
        class: 'btn btn-sm',
        type: 'button',
        text: '切到「本月」看占比',
        onclick: () => setDimension('month'),
      })
    )
    return
  }
  const list = only.categories.slice().sort((a, b) => b.totalCents - a.totalCents)
  if (!list.length) {
    host.appendChild(h('p', { class: 'field-hint', text: '这个区间没有支出记录。' }))
    return
  }
  list.forEach((cat) => {
    host.appendChild(
      h('div', { class: 'ratio-row' }, [
        h('span', { class: 'ratio-name', text: cat.name }),
        h('div', { class: 'progress' }, [
          h('div', {
            class: 'progress-fill' + (cat.ratio >= 0.5 ? ' is-near' : ''),
            style: 'width:' + Math.min(100, Math.round(cat.ratio * 100)) + '%',
          }),
        ]),
        h('span', { class: 'ratio-num', text: formatCents(cat.totalCents) }),
      ])
    )
  })
}

async function load() {
  const chart = document.getElementById('chart')
  document.getElementById('kpi-grid').replaceChildren(h('div', { class: 'skeleton', style: 'height:74px' }))
  try {
    const res = await api.getStats(dimension)
    renderKpis(res.summary)
    if (res.meta.isEmpty) {
      chart.replaceChildren(h('div', { class: 'chart' }, emptyState('这段时间没有记录', '换个维度，或先记一笔')))
      renderRatio([])
      return
    }
    renderBarChart(chart, res.buckets, dimension)
    renderRatio(res.buckets)
  } catch (err) {
    toast(err.message || '统计加载失败', 'danger')
  }
}

function setDimension(next) {
  dimension = next
  document.querySelectorAll('[data-dimension]').forEach((button) => {
    const active = button.dataset.dimension === next
    button.classList.toggle('is-active', active)
    button.setAttribute('aria-selected', active ? 'true' : 'false')
  })
  load()
}

function bindTabs() {
  document.querySelectorAll('[data-dimension]').forEach((button) => {
    button.addEventListener('click', () => setDimension(button.dataset.dimension))
  })
}

function boot() {
  injectNav('stats')
  bindTabs()
  load()
}

boot()
