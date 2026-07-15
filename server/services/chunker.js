/**
 * 文本分块 —— RAG 的第一步
 *
 * 滑动窗口 + 语义边界回退策略：
 * 从当前位置取 chunkSize 个字符，然后往回找最近的语义断点（句号、换行等），
 * 在断点处切割，保证每块都在完整句子边界结束。
 * 相邻块之间保留 overlap 长度的重叠，避免关键信息落在边界被切断。
 *
 * @param {string}  text                  - 原始文本
 * @param {{ chunkSize?: number, overlap?: number }} opts
 * @param {number}  opts.chunkSize = 500  - 每块目标字符数（BGE-large-zh-v1.5 最佳输入窗口）
 * @param {number}  opts.overlap   = 100  - 相邻块重叠字符数（chunkSize 的 20%，业界常用值）
 * @returns {string[]}                     - 切分后的文本块数组
 */
function chunkText(text, { chunkSize = 500, overlap = 100 } = {}) {
  if (typeof text !== 'string' || text.trim().length === 0) return []

  // 归一化：合并多个连续空行，保留单个换行的段落结构
  text = text.replace(/\n{3,}/g, '\n\n').trim()

  // 短文本直接返回，不切
  if (text.length <= chunkSize) return [text]

  // 在这些位置切割最自然：句末标点 > 换行 > 分号 > 逗号
  const BOUNDARY_RE = /[。！？\n.!?;；，,]/g

  const chunks = []
  let start = 0

  while (start < text.length) {
    // 取目标窗口
    let end = Math.min(start + chunkSize, text.length)

    // 已经是最后一段，直接收尾
    if (end >= text.length) {
      const chunk = text.slice(start).trim()
      if (chunk) chunks.push(chunk)
      break
    }

    // 在窗口内找最后一个语义断点（往回搜，不超出窗口的 30% 范围）
    const searchStart = Math.max(start, end - Math.floor(chunkSize * 0.3))
    const window = text.slice(searchStart, end)

    // 找窗口内最后一个匹配的断点
    let lastBoundary = -1
    let match
    BOUNDARY_RE.lastIndex = 0
    while ((match = BOUNDARY_RE.exec(window)) !== null) {
      lastBoundary = match.index
    }

    if (lastBoundary !== -1) {
      // 找到了，在断点后切割（包含标点）
      end = searchStart + lastBoundary + 1
    }
    // 找不到断点 → 硬切在 chunkSize，不回退（避免死循环）

    const chunk = text.slice(start, end).trim()
    if (chunk) chunks.push(chunk)

    // 下一块起点：从当前块结尾往回退 overlap
    const nextStart = end - overlap

    // 防止死循环：start 不前进，或 overlap 过大导致回退过头
    if (nextStart <= start || nextStart >= text.length) break

    start = nextStart
  }

  return chunks
}

module.exports = { chunkText }
