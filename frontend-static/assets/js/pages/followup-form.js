/**
 * followup-form.js —— 追问表单与回执卡。从 capture.js 拆出，保证单文件 ≤200 行。
 */
import { h, fillSelect } from '../ui.js'
import { centsToYuanNumber, formatCents, yuanToCents } from '../money.js'
import { normalizeIsoOffset, fmtDateTime, toDatetimeLocal } from '../datetime.js'

const FEEDBACK_TEXT = {
  MISSING_AMOUNT: '还差金额：这笔花了多少钱？',
  MISSING_TIME: '还差时间：这是哪天的消费？',
  MISSING_DIRECTION: '判断不出收支方向，请选一下。',
  DUPLICATE_RECORD: '这笔可能已经记过了。改一下商户或金额再提交。',
  MERCHANT_DEFAULTED: '商户缺失，我按「未知账号」记了，可以补一下。',
  LOW_CONFIDENCE_CATEGORY: '类别置信度偏低，建议确认一下。',
  REFUND_NOT_SUPPORTED: '退款请到账单一览里作废原账单。',
}

function feedbackList(feedback) {
  const list = Array.isArray(feedback) ? feedback : []
  const hasBlocking = list.some((item) => item.severity === 'blocking')
  const wrap = h('div', { class: 'followup-alert' + (hasBlocking ? ' is-blocking' : '') })
  if (!list.length) {
    wrap.appendChild(h('span', { text: '没有需要处理的问题。' }))
    return wrap
  }
  list.forEach((item) => {
    wrap.appendChild(
      h('div', { class: 'feedback-line' }, [
        h('span', {
          class: item.severity === 'blocking' ? 'badge badge-danger' : 'badge badge-warn',
          text: item.severity === 'blocking' ? '必须补' : '提示',
        }),
        h('span', { text: FEEDBACK_TEXT[item.code] || '需要处理' }),
        h('span', { class: 'feedback-code', text: item.code }),
      ])
    )
  })
  return wrap
}

/**
 * 构造追问表单：只渲染契约里反馈码指向的字段，用同一个 idempotencyKey 重发。
 * @param {{record:Object, result:Object, categories:Array, onSubmit:Function}} options
 * @returns {HTMLFormElement}
 */
export function buildFollowupForm(options) {
  const record = options.record
  const result = options.result
  const categories = options.categories
  const onSubmit = options.onSubmit

  const amountInput = h('input', {
    class: 'input',
    id: 'f-amount',
    type: 'text',
    inputmode: 'decimal',
    autocomplete: 'off',
    placeholder: '例如 32.50',
    value: record.amount === null || record.amount === undefined ? '' : Number(record.amount).toFixed(2),
  })
  const merchantInput = h('input', {
    class: 'input',
    id: 'f-merchant',
    type: 'text',
    autocomplete: 'off',
    placeholder: '例如 瑞幸咖啡',
    value: record.merchant || '',
  })
  const categorySelect = h('select', { class: 'select', id: 'f-category' })
  fillSelect(
    categorySelect,
    categories.map((item) => ({ value: item.id, label: item.name })),
    '未定'
  )
  if (record.categoryId) categorySelect.value = String(record.categoryId)
  const directionSelect = h('select', { class: 'select', id: 'f-direction' })
  fillSelect(
    directionSelect,
    [
      { value: 'expense', label: '支出' },
      { value: 'income', label: '收入' },
    ],
    '未定'
  )
  if (record.direction) directionSelect.value = record.direction
  const timeInput = h('input', {
    class: 'input',
    id: 'f-time',
    type: 'datetime-local',
    value: toDatetimeLocal(record.occurredAt),
  })
  const submitBtn = h('button', { class: 'btn btn-primary', type: 'submit', text: '继续提交' })

  const form = h('form', { class: 'followup-form' }, [
    feedbackList(result.feedback),
    h('div', { class: 'field' }, [
      h('label', { class: 'field-label', for: 'f-amount', text: '金额（元）' }),
      amountInput,
      h('p', { class: 'field-hint', text: '识别不出就留空。留空会继续追问，不会当成 0' }),
    ]),
    h('div', { class: 'field' }, [
      h('label', { class: 'field-label', for: 'f-merchant', text: '商户' }),
      merchantInput,
    ]),
    h('div', { class: 'field' }, [
      h('label', { class: 'field-label', for: 'f-category', text: '类别' }),
      categorySelect,
    ]),
    h('div', { class: 'field' }, [
      h('label', { class: 'field-label', for: 'f-direction', text: '收支方向' }),
      directionSelect,
    ]),
    h('div', { class: 'field' }, [
      h('label', { class: 'field-label', for: 'f-time', text: '发生时间' }),
      timeInput,
    ]),
    submitBtn,
  ])

  form.addEventListener('submit', (event) => {
    event.preventDefault()
    const cents = yuanToCents(amountInput.value)
    onSubmit(
      Object.assign({}, record, {
        amount: cents === null ? null : centsToYuanNumber(cents),
        merchant: merchantInput.value.trim() || null,
        categoryId: categorySelect.value ? Number(categorySelect.value) : null,
        direction: directionSelect.value || null,
        occurredAt: timeInput.value ? normalizeIsoOffset(timeInput.value) : null,
      })
    )
  })

  return form
}

/**
 * 构造结果卡片（已入库 / 重复 / 放弃）。
 * @param {Object} result 契约 §1.4 的单条结果
 * @param {Object} record 提交的记录
 * @returns {HTMLElement}
 */
export function buildResultCard(result, record) {
  const rows = []
  const row = (key, value) =>
    h('div', { class: 'receipt-row' }, [
      h('span', { class: 'receipt-key', text: key }),
      h('span', { class: 'receipt-val', text: value }),
    ])

  rows.push(row('金额', formatCents(yuanToCents(record.amount))))
  rows.push(row('商户', record.merchant || '—'))
  rows.push(row('类别', result.category ? result.category.name : '—'))
  rows.push(row('时间', fmtDateTime(result.occurredAt)))

  let statusBadge
  if (result.status === 'confirmed') statusBadge = h('span', { class: 'badge badge-ok', text: '已入库' })
  else if (result.status === 'duplicate') statusBadge = h('span', { class: 'badge badge-info', text: '按重复处理' })
  else statusBadge = h('span', { class: 'badge badge-danger', text: '未入库' })

  const wrap = h('div', { class: 'receipt' }, [
    h('div', { class: 'receipt-row' }, [h('span', { class: 'receipt-key', text: '状态' }), statusBadge]),
  ])
  rows.forEach((item) => wrap.appendChild(item))

  if (result.status === 'duplicate') {
    wrap.appendChild(h('p', { class: 'field-hint', text: '这笔已经记过了，直接用原记录，没有重复入库。' }))
  }
  if (Array.isArray(result.feedback) && result.feedback.length) {
    wrap.appendChild(feedbackList(result.feedback))
  }
  return wrap
}
