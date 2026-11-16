/**
 * capture.js —— 记账页：一句话录入 → 调用 import → 按返回状态展示追问或回执。
 * 本文件职责仅限「交互编排」，识别与分类都在后端（mock 扮演）。
 */
import { api } from '../api.js'
import { h, injectNav, toast, setBusy } from '../ui.js'
import { centsToYuanNumber, extractAmountFromText, formatCents, yuanToCents } from '../money.js'
import { nowIso } from '../datetime.js'
import { buildFollowupForm, buildResultCard } from './followup-form.js'

const SAMPLES = [
  '早上瑞幸花了32块5',
  '中午食堂 15块',
  '花了点钱',
  '退款 20',
  '疑似重复 手机壳 30',
  '重复 咖啡 18',
]

const state = {
  categories: [],
  log: null,
  panel: null,
  input: null,
  sendBtn: null,
}

function bubble(text, who, meta) {
  const node = h('div', {
    class: 'bubble ' + (who === 'user' ? 'bubble-user' : 'bubble-bot'),
    text,
  })
  if (meta) node.appendChild(h('span', { class: 'bubble-meta', text: meta }))
  state.log.appendChild(node)
  state.log.scrollTop = state.log.scrollHeight
  return node
}

/**
 * 只在有明显时间词时才给 occurredAt，其余一律留空交给后端追问（契约 §1.3：不要猜）。
 * @param {string} text
 * @returns {string|null}
 */
function hintTime(text) {
  if (/(今天|刚才|刚刚|现在|中午|早上|晚上|昨晚)/.test(text)) return nowIso()
  return null
}

function makeRecord(rawText, modality, sourceRef) {
  const stamp = Date.now().toString(36)
  return {
    recordId: 'r_' + stamp,
    userId: 'u_demo',
    direction: null,
    amount: centsToYuanNumber(extractAmountFromText(rawText)),
    merchant: null,
    occurredAt: hintTime(rawText),
    chatAt: nowIso(),
    rawText,
    modality,
    sourceRef: sourceRef || null,
    confidence: 0.92,
    idempotencyKey: 'msg_' + stamp,
  }
}

function showPanel(node) {
  state.panel.replaceChildren(node)
}

function handleResult(record, result) {
  if (result.status === 'pending_followup') {
    bubble('这条还差点信息，在右边补一下我就能记。', 'bot')
    showPanel(
      buildFollowupForm({
        record,
        result,
        categories: state.categories,
        onSubmit: (next) => submit(next),
      })
    )
    return
  }

  if (result.status === 'confirmed') {
    const line = [formatCents(yuanToCents(record.amount)), result.category ? result.category.name : '未分类']
    bubble('记好了：' + line.join(' · '), 'bot', result.transactionId || '')
    showPanel(buildResultCard(result, record))
    toast('已入库', 'ok')
    return
  }

  if (result.status === 'duplicate') {
    bubble('这笔之前记过了，没有重复入库。', 'bot', result.transactionId || '')
    showPanel(buildResultCard(result, record))
    return
  }

  bubble('这笔我没法自动处理，需要你手动补录。', 'bot')
  showPanel(buildResultCard(result, record))
}

async function submit(record, button) {
  if (button) setBusy(button, true, '提交中…')
  try {
    const payload = await api.importBatch({
      version: 1,
      batchId: 'b_' + Date.now().toString(36),
      sentAt: nowIso(),
      records: [record],
    })
    handleResult(record, payload.results[0])
  } catch (err) {
    toast(err.message || '提交失败，请重试', 'danger')
    bubble('服务没响应：' + (err.message || '未知错误'), 'bot')
  } finally {
    if (button) setBusy(button, false)
  }
}

async function submitText(text, modality = 'text', sourceRef = null) {
  const raw = String(text || '').trim()
  if (!raw) {
    toast('先写一句，比如「早上瑞幸花了32块5」')
    state.input.focus()
    return
  }
  const label = modality === 'voice' ? '（语音转写）' : modality === 'image' ? '（图片 OCR）' : ''
  bubble(raw, 'user', label)
  setBusy(state.sendBtn, true, '识别中…')
  try {
    await submit(makeRecord(raw, modality, sourceRef))
  } finally {
    setBusy(state.sendBtn, false)
    state.input.value = ''
    state.input.focus()
  }
}

function renderSamples() {
  const host = document.getElementById('sample-row')
  if (!host) return
  SAMPLES.forEach((text) => {
    host.appendChild(
      h('button', {
        class: 'btn btn-ghost btn-sm',
        type: 'button',
        text,
        onclick: () => submitText(text),
      })
    )
  })
}

function bindComposer() {
  document.getElementById('composer').addEventListener('submit', (event) => {
    event.preventDefault()
    submitText(state.input.value)
  })

  document.getElementById('voice-btn').addEventListener('click', () => {
    submitText('刚才打车 26 块', 'voice')
  })

  const fileInput = document.getElementById('file-input')
  fileInput.addEventListener('change', (event) => {
    const file = event.target.files && event.target.files[0]
    event.target.value = ''
    if (!file) return
    toast('OCR 还没接入，先按示例文本走一遍图片链路')
    submitText('疑似重复 打印资料 12块', 'image', file.name)
  })
}

async function boot() {
  state.log = document.getElementById('chat-log')
  state.panel = document.getElementById('panel-body')
  state.input = document.getElementById('chat-input')
  state.sendBtn = document.getElementById('send-btn')

  injectNav('capture')
  bindComposer()
  renderSamples()

  bubble('你好，直接说「早上瑞幸花了32块5」就行。金额、时间、商户我都试着抽，抽不出会问你。', 'bot')

  try {
    state.categories = await api.getCategories()
  } catch (err) {
    toast('类别字典加载失败：' + (err.message || '未知错误'), 'danger')
  }
}

boot()

// 本地验收钩子：index.html?demo=ok|pending|dup|refund 直接跑一条示例，省得手打
const DEMO_TEXT = { ok: '早上瑞幸花了32块5', pending: '花了点钱', dup: '疑似重复 手机壳 30', refund: '退款 20' }
const demoKey = new URLSearchParams(location.search).get('demo')
if (DEMO_TEXT[demoKey]) window.setTimeout(() => submitText(DEMO_TEXT[demoKey]), 400)
