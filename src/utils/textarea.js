/**
 * 根据内容自动调整 textarea 高度（单行到最大高度之间）
 * @param {HTMLTextAreaElement | null} el
 * @param {number} [maxHeight=200]
 */
export function autoResize(el, maxHeight = 200) {
  if (!el) return
  el.style.height = 'auto'
  const next = Math.min(el.scrollHeight, maxHeight)
  el.style.height = `${next}px`
}
