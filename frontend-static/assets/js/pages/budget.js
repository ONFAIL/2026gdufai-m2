/**
 * budget.js —— 预算与超支提醒。只读接口数据，页面不做汇总计算。
 */
import { api } from '../api.js'
import { h, injectNav, toast, levelBadgeClass, levelText } from '../ui.js'
import { formatCents } from '../money.js'
import { nowIso, toMonthKey } from '../datetime.js'

const MONTH = toMonthKey(nowIso())

function heroNode(total) {
  const pct = Math.round(total.usageRatio * 100)
  const barPct = Math.min(100, pct)
  return h('div', { class: 'card budget-hero' }, [
    h('div', { class: 'budget-hero-top' }, [
      h('div', {}, [
        h('div', { class: 'kpi-label', text: MONTH + ' 总预算' }),
        h('div', { class: 'budget-hero-num', text: formatCents(total.amountCents) }),
      ]),
      h('span', { class: levelBadgeClass(total.level), text: levelText(total.level) }),
    ]),
    h('div', { class: 'progress' }, [
      h('div', {
        class: 'progress-fill' + (total.level === 'over' ? ' is-over' : total.level === 'near' ? ' is-near' : ''),
        style: 'width:' + barPct + '%',
      }),
    ]),
    h('div', { class: 'budget-hero-meta' }, [
      document.createTextNode(
        '已用 ' + formatCents(total.spentCents) + ' · 剩余 ' + formatCents(total.remainingCents) + ' · 用量 ' + pct + '%'
      ),
    ]),
  ])
}

function rowNode(item) {
  const pct = Math.round(item.usageRatio * 100)
  const barPct = Math.min(100, pct)
  const name = item.category ? item.category.name : '未分类'
  const color = item.category && item.category.color ? item.category.color : 'transparent'
  return h('div', { class: 'budget-row' }, [
    h('div', { class: 'budget-row-name' }, [
      h('span', { class: 'cat-dot', style: 'background:' + color }),
      document.createTextNode(name),
    ]),
    h('div', { class: 'progress' }, [
      h('div', {
        class: 'progress-fill' + (item.level === 'over' ? ' is-over' : item.level === 'near' ? ' is-near' : ''),
        style: 'width:' + barPct + '%',
      }),
    ]),
    h('div', { class: 'budget-row-num' }, [
      document.createTextNode(formatCents(item.spentCents) + ' / ' + formatCents(item.amountCents)),
      h('span', { class: 'budget-row-sub', text: levelText(item.level) + ' · ' + pct + '%' }),
    ]),
  ])
}

async function load() {
  try {
    const budgets = await api.getBudgets(MONTH)
    const total = budgets.filter((item) => item.scope === 'total')[0]
    const list = budgets.filter((item) => item.scope !== 'total')

    document.getElementById('hero').replaceChildren(total ? heroNode(total) : h('div', { class: 'card card-pad', text: '这个月还没设预算' }))
    document.getElementById('budget-list').replaceChildren(...list.map(rowNode))

    const over = list.filter((item) => item.level === 'over')
    if (over.length) {
      toast('有 ' + over.length + ' 个类别已超支：' + over.map((item) => item.category.name).join('、'), 'danger')
    }
  } catch (err) {
    toast(err.message || '预算加载失败', 'danger')
  }
}

function boot() {
  injectNav('budget')
  load()
}

boot()
