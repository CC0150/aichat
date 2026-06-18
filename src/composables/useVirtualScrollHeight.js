import { onUnmounted } from 'vue'

const DEFAULT_OPTS = {
  charsPerLine: 80,
  lineHeightPx: 20,
  overheadPx: 90,
  imagePx: 120,
  minHeight: 50,
}

/**
 * 从消息中提取纯文本（处理 string | { text, attachments, images } 等格式）
 */
function getText(msg) {
  const c = msg?.content
  if (typeof c === 'string') return c
  if (c && typeof c === 'object' && !Array.isArray(c)) return c.text || ''
  return ''
}

/**
 * 基于字符数估算消息渲染高度
 */
export function estimateMessageHeight(msg, opts = {}) {
  const { charsPerLine, lineHeightPx, overheadPx, imagePx, minHeight } = {
    ...DEFAULT_OPTS,
    ...opts,
  }
  const text = getText(msg)
  const textLines = Math.max(1, Math.ceil(text.length / charsPerLine))
  const imageCount =
    msg?.role === 'user' && msg?.content && typeof msg.content === 'object'
      ? msg.content.images?.length || 0
      : 0
  return Math.max(
    minHeight,
    Math.round(overheadPx + textLines * lineHeightPx + imageCount * imagePx),
  )
}

/**
 * 虚拟列表高度管理 composable
 *
 * 核心设计：
 * - sizeMap 是普通 Map（非响应式），不触发 virtualMessages computed 重算
 * - flush() 在 RAF 中批量更新 sizeMap + 原地修改 virtualMessages 中已有对象的 size 字段
 * - 这样流式输出时高度变化只改 size 值，不重建数组，RecycleScroller 不会全量重排
 *
 * @param {import('vue').Ref<Array>} virtualMessagesRef - virtualMessages 的 ref
 * @returns {{ getSize, observeItem, unobserveAll, sizeMap }}
 */
export function useVirtualScrollHeight(virtualMessagesRef) {
  /** @type {Map<string, number>} */
  const sizeMap = new Map()
  const observers = new Map()
  let rafId = null
  let throttleId = null
  let lastFlush = 0
  const THROTTLE_MS = 160
  const pending = new Map()

  function flush() {
    const msgs = virtualMessagesRef?.value
    pending.forEach((h, id) => {
      sizeMap.set(id, h)
      if (msgs) {
        const item = msgs.find((m) => m.id === id)
        if (item) item.size = h
      }
    })
    pending.clear()
    rafId = null
  }

  function schedule(id, height) {
    pending.set(id, Math.round(height))
    if (rafId) return // 已有待执行的 flush，只更新 pending 值即可
    const remaining = THROTTLE_MS - (performance.now() - lastFlush)
    const doFlush = () => {
      lastFlush = performance.now()
      flush()
    }
    if (remaining <= 0) {
      rafId = requestAnimationFrame(doFlush)
    } else {
      throttleId = setTimeout(() => {
        throttleId = null
        rafId = requestAnimationFrame(doFlush)
      }, remaining)
    }
  }

  function getSize(id) {
    return sizeMap.get(id)
  }

  /**
   * :ref 回调 — el 为 DOM 元素或 null（卸载时自动断开 observer）
   */
  function observeItem(el, id) {
    if (!el) {
      const existing = observers.get(id)
      if (existing) {
        existing.disconnect()
        observers.delete(id)
      }
      return
    }
    if (observers.has(id)) return

    const ro = new ResizeObserver((entries) => {
      for (const entry of entries) {
        const h = entry.contentRect.height
        if (h > 0) {
          const mb = parseFloat(getComputedStyle(entry.target).marginBottom) || 0
          schedule(id, h + mb)
        }
      }
    })
    ro.observe(el)
    observers.set(id, ro)
  }

  function unobserveAll() {
    cancelAnimationFrame(rafId)
    clearTimeout(throttleId)
    rafId = null
    throttleId = null
    pending.clear()
    observers.forEach((ro) => ro.disconnect())
    observers.clear()
  }

  onUnmounted(unobserveAll)

  return { getSize, observeItem, unobserveAll, sizeMap }
}
