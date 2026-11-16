/**
 * ui.js —— DOM 构建与通用交互。全站唯一允许创建元素的地方。
 * 纪律：禁止用 innerHTML 拼接任何用户数据；字符串一律走 textContent。
 */
import { api } from './api.js'

/**
 * 安全创建元素。字符串子节点用文本节点注入，不解析 HTML。
 * @param {string} tag 标签名
 * @param {Object} [props] 属性；text 写文本，on* 绑事件，dataset 合并 data-*
 * @param {Array<Node|string>} [children] 子节点
 * @returns {HTMLElement}
 */
export function h(tag, props = {}, children = []) {
  const el = document.createElement(tag)
  Object.keys(props).forEach((key) => {
    const value = props[key]
    if (value === null || value === undefined || value === false) return
    if (key === 'class') el.className = value
    else if (key === 'text') el.textContent = value
    else if (key === 'dataset') Object.assign(el.dataset, value)
    else if (key.startsWith('on') && typeof value === 'function') {
      el.addEventListener(key.slice(2).toLowerCase(), value)
    } else if (value === true) el.setAttribute(key, '')
    else el.setAttribute(key, String(value))
  })
  ;[].concat(children).forEach((child) => {
    if (child === null || child === undefined || child === false) return
    el.appendChild(typeof child === 'string' ? document.createTextNode(child) : child)
  })
  return el
}

/**
 * 把导航注入 #nav-root。partials/nav.html 是全站唯一的一份导航。
 * @param {string} activeKey 当前页 data-nav 值
 * @returns {Promise<void>}
 */
export async function injectNav(activeKey) {
  const host = document.getElementById('nav-root')
  if (!host) return
  try {
    const html = await api.loadPartial('partials/nav.html')
    const doc = new DOMParser().parseFromString(html, 'text/html')
    host.replaceChildren(...Array.from(doc.body.childNodes))
  } catch (err) {
    host.replaceChildren(h('div', { class: 'nav-brand', text: '记一笔' }))
    return
  }
  host.querySelectorAll('[data-nav]').forEach((link) => {
    if (link.dataset.nav === activeKey) link.classList.add('is-active')
  })
}

/**
 * 右下角提示。
 * @param {string} message
 * @param {'ok'|'danger'|''} [kind]
 */
export function toast(message, kind = '') {
  let stack = document.querySelector('.toast-stack')
  if (!stack) {
    stack = h('div', { class: 'toast-stack', role: 'status', 'aria-live': 'polite' })
    document.body.appendChild(stack)
  }
  const node = h('div', { class: 'toast' + (kind ? ' is-' + kind : ''), text: message })
  stack.appendChild(node)
  window.setTimeout(() => node.remove(), 2800)
}

/**
 * 空态块。文案必须避免「0 元」这类把缺失当零的写法。
 * @param {string} title
 * @param {string} desc
 * @returns {HTMLElement}
 */
export function emptyState(title, desc) {
  return h('div', { class: 'empty' }, [
    h('p', { class: 'empty-title', text: title }),
    h('p', { text: desc }),
  ])
}

/**
 * 骨架占位行。
 * @param {number} rows
 * @param {string} [height]
 * @returns {HTMLElement}
 */
export function skeletonRows(rows, height = '14px') {
  const wrap = h('div', { class: 'card-pad' })
  for (let i = 0; i < rows; i += 1) {
    wrap.appendChild(h('div', { class: 'skeleton', style: 'height:' + height + ';margin-bottom:10px' }))
  }
  return wrap
}

/**
 * 切换按钮的忙碌态，避免重复提交。
 * @param {HTMLButtonElement} button
 * @param {boolean} busy
 * @param {string} [busyText]
 */
export function setBusy(button, busy, busyText = '处理中…') {
  if (!button) return
  if (busy) {
    button.dataset.label = button.textContent
    button.disabled = true
    button.replaceChildren(h('span', { class: 'spinner' }), document.createTextNode(' ' + busyText))
  } else {
    button.disabled = false
    button.textContent = button.dataset.label || '提交'
  }
}

/**
 * 填充下拉框。选项数据一律来自接口，禁止硬编码类别。
 * @param {HTMLSelectElement} select
 * @param {Array<{value:string|number,label:string}>} options
 * @param {string} [placeholder] 传入则加一个空值项
 */
export function fillSelect(select, options, placeholder = '') {
  select.replaceChildren()
  if (placeholder) select.appendChild(h('option', { value: '', text: placeholder }))
  options.forEach((opt) => {
    select.appendChild(h('option', { value: String(opt.value), text: opt.label }))
  })
}

/**
 * 等级 → 徽标类名。
 * @param {'normal'|'near'|'over'} level
 * @returns {string}
 */
export function levelBadgeClass(level) {
  if (level === 'over') return 'badge badge-danger'
  if (level === 'near') return 'badge badge-warn'
  return 'badge badge-ok'
}

/**
 * 等级 → 中文。
 * @param {'normal'|'near'|'over'} level
 * @returns {string}
 */
export function levelText(level) {
  if (level === 'over') return '已超支'
  if (level === 'near') return '接近上限'
  return '正常'
}
