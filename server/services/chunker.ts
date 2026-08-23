import type { ChunkOptions, SemanticChunkOptions } from '../types'
import { getEmbedding } from './embedding'

/**
 * 文本分块 —— RAG 的第一步
 *
 * 滑动窗口 + 语义边界回退策略：
 * 从当前位置取 chunkSize 个字符，然后往回找最近的语义断点（句号、换行等），
 * 在断点处切割，保证每块都在完整句子边界结束。
 * 相邻块之间保留 overlap 长度的重叠，避免关键信息落在边界被切断。
 *
 * @param text  原始文本
 * @param opts.chunkSize 每块目标字符数（BGE-large-zh-v1.5 最佳输入窗口，默认 500）
 * @param opts.overlap   相邻块重叠字符数（chunkSize 的 20%，默认 100）
 * @returns 切分后的文本块数组
 */
export function chunkText(
  text: string,
  { chunkSize = 500, overlap = 100 }: ChunkOptions = {},
): string[] {
  if (typeof text !== 'string' || text.trim().length === 0) return []

  // 归一化：合并多个连续空行，保留单个换行的段落结构
  let normalized = text.replace(/\n{3,}/g, '\n\n').trim()

  // 短文本直接返回，不切
  if (normalized.length <= chunkSize) return [normalized]

  // 在这些位置切割最自然：句末标点 > 换行 > 分号 > 逗号
  const BOUNDARY_RE = /[。！？\n.!?;；，,]/g

  const chunks: string[] = []
  let start = 0

  while (start < normalized.length) {
    // 取目标窗口
    let end = Math.min(start + chunkSize, normalized.length)

    // 已经是最后一段，直接收尾
    if (end >= normalized.length) {
      const chunk = normalized.slice(start).trim()
      if (chunk) chunks.push(chunk)
      break
    }

    // 在窗口内找最后一个语义断点（往回搜，不超出窗口的 30% 范围）
    const searchStart = Math.max(start, end - Math.floor(chunkSize * 0.3))
    const window = normalized.slice(searchStart, end)

    // 找窗口内最后一个匹配的断点
    let lastBoundary = -1
    let match: RegExpExecArray | null
    BOUNDARY_RE.lastIndex = 0
    while ((match = BOUNDARY_RE.exec(window)) !== null) {
      lastBoundary = match.index
    }

    if (lastBoundary !== -1) {
      // 找到了，在断点后切割（包含标点）
      end = searchStart + lastBoundary + 1
    }
    // 找不到断点 → 硬切在 chunkSize，不回退（避免死循环）

    const chunk = normalized.slice(start, end).trim()
    if (chunk) chunks.push(chunk)

    // 下一块起点：从当前块结尾往回退 overlap
    const nextStart = end - overlap

    // 防止死循环：start 不前进，或 overlap 过大导致回退过头
    if (nextStart <= start || nextStart >= normalized.length) break

    start = nextStart
  }

  return chunks
}

// ===== 语义相似度分块 =====
//
// 核心思想：PDF 解析后的纯文本没有标题/段落结构可依，
// "闭包"和"原型链"两个话题可能只隔一个句号。
// 固定窗口分块看不出话题边界，语义分块通过 embedding 判断
// "这两句在聊同一件事吗？"——相似度骤降则切开。

/**
 * 按句子拆分文本
 *
 * 逐字遍历，遇句末标点（。！？.!?）或换行则切一句。
 * 不用正则 split 的原因：正则的 (?<=) lookbehind 在旧版 Node 不兼容，
 * 逐字遍历更可控，且能保证每个切分单元携带自己的结束标点。
 */
function splitSentences(text: string): string[] {
  const sentences: string[] = []
  let current = ''

  for (let i = 0; i < text.length; i++) {
    current += text[i]

    // 遇到句末标点或换行 → 当前积累的内容算一句
    if (/[。！？\n.!?]/.test(text[i])) {
      const trimmed = current.trim()
      if (trimmed) sentences.push(trimmed)
      current = '' // 清缓冲区，准备下一句
    }
  }

  // 收尾：文本末尾可能没有标点（如截断、纯短语）
  const trimmed = current.trim()
  if (trimmed) sentences.push(trimmed)

  return sentences
}

/**
 * 计算两个向量的余弦相似度
 *
 * cos(θ) = (A·B) / (|A| × |B|)
 *
 * 值域 [-1, 1]，embedding 空间内向量的各维均为非负，
 * 实际落在 [0, 1] 区间。越接近 1 越相关，越接近 0 越无关。
 *
 * 与欧氏距离相比，余弦相似度对向量长度不敏感，
 * 更适合比较"方向"（即语义方向）而非"绝对位置"。
 */
function cosineSimilarity(a: number[], b: number[]): number {
  let dot = 0 // 点积 A·B
  let normA = 0 // |A|²
  let normB = 0 // |B|²

  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i]
    normA += a[i] * a[i]
    normB += b[i] * b[i]
  }

  const denom = Math.sqrt(normA) * Math.sqrt(normB)
  // 理论上不会出现零向量，但做保护
  return denom === 0 ? 0 : dot / denom
}

/**
 * 语义相似度分块 —— 基于 embedding 判断话题是否切换
 *
 * 适用场景：PDF 解析后的纯文本面试资料，没有标题/段落结构可依，
 * 只能通过语义距离来判断"闭包讲完了，下面开始讲原型链了"。
 *
 * 流程（每一步失败都有回退路径，保证不会因语义分块卡死上传）：
 *
 * 1. 按句子拆分（句号/问号/感叹号/换行）
 * 2. 合并过短的碎片句子（如"例如："、单独的代码片段），避免被误判为断点
 * 3. 批量 embedding → 所有句子一次 API 调用，比逐句调快几十倍
 * 4. 计算相邻句子余弦相似度 → 骤降处 = 话题边界
 * 5. 在断点处形成句子组（每个组是语义内聚的"一段话"）
 * 6. 贪心合并句子组到 chunkSize 上限 → 每块尽量大但不超限
 * 7. 超过 chunkSize 的独段 → 回退滑动窗口细分
 *
 * 容错策略：
 * - embedding 抛异常（API key 未配/网络不通）     → chunkText
 * - embedding 返回数量与句子数对不上（数据异常）   → chunkText
 * - 全篇只有一句话或全是短碎片                    → chunkText
 *
 * @param text  原始文本
 * @param opts.chunkSize             每块目标字符数，默认 500
 * @param opts.overlap               相邻块重叠字符数（仅超大段回退 chunkText 时生效），默认 100
 * @param opts.similarityThreshold   语义断点阈值 (0-1)，相邻句子相似度低于此值则切分，默认 0.7
 * @param opts.minSentenceLength     最短句子长度，短于此值的句子总是合并到相邻，默认 5
 * @returns 切分后的文本块数组
 */
export async function chunkSemantic(
  text: string,
  {
    chunkSize = 500,
    overlap = 100,
    similarityThreshold = 0.7,
    minSentenceLength = 5,
  }: SemanticChunkOptions = {},
): Promise<string[]> {
  // 空文本 / 短文本不切
  if (typeof text !== 'string' || text.trim().length === 0) return []

  // 归一化：3+ 个连续换行压缩为 2 个（保留段落间距，去多余空行）
  const normalized = text.replace(/\n{3,}/g, '\n\n').trim()

  // 短于 chunkSize 的文本整体就是一块，无需折腾
  if (normalized.length <= chunkSize) return [normalized]

  // ========== 步骤 1：拆句子 ==========
  const rawSentences = splitSentences(normalized)
  if (rawSentences.length <= 1) return [normalized]

  // ========== 步骤 2：合并短碎片 ==========
  // PDF 解析常产生孤儿碎片（如 "例如："、"1."、空括号），
  // 单句 embedding 噪声大，提前合并到邻居避免假断点
  const sentences = mergeShortSentences(rawSentences, minSentenceLength)
  if (sentences.length <= 1) {
    // 合并后只剩一句 → 退化为简单分块
    return chunkText(normalized, { chunkSize, overlap })
  }

  // ========== 步骤 3：批量 embedding ==========
  // getEmbedding 支持数组输入，200 句话也是一次 HTTP 调用
  let embeddings: number[][]
  try {
    embeddings = await getEmbedding(sentences)
  } catch (err: any) {
    // API key 未配置 / 网络不通 / 额度耗尽 → 安静回退
    console.warn(`[chunker] embedding 获取失败，回退到滑动窗口分块: ${err.message}`)
    return chunkText(normalized, { chunkSize, overlap })
  }

  // 防御：API 返回的向量数和输入句子数必须一致
  if (!embeddings || embeddings.length !== sentences.length) {
    console.warn('[chunker] embedding 返回数量异常，回退到滑动窗口分块')
    return chunkText(normalized, { chunkSize, overlap })
  }

  // ========== 步骤 4：计算相邻句子相似度，确定切点 ==========
  // breakpoints[i] === true → 第 i 句和第 i+1 句之间切开
  //
  // 示例（典型的 PDF 面试笔记）：
  //   句 0: "闭包是 JS 中重要的概念..."           } sim(0,1)=0.92 → 不切
  //   句 1: "常见的闭包场景包括数据私有化..."     }
  //   句 2: "闭包也可能导致内存泄漏..."           } sim(1,2)=0.88 → 不切
  //   句 3: "原型链是 JS 继承的核心机制..."       } sim(2,3)=0.41 → 切！< 0.7
  //   句 4: "每个对象都有 [[Prototype]] 属性..."  }
  //
  // 结果：句 0~2 组成「闭包」块，句 3~4 组成「原型链」块
  const breakpoints: boolean[] = new Array(sentences.length - 1).fill(false)
  for (let i = 0; i < sentences.length - 1; i++) {
    const sim = cosineSimilarity(embeddings[i], embeddings[i + 1])
    if (sim < similarityThreshold) {
      breakpoints[i] = true
    }
  }

  // ========== 步骤 5：按断点聚合成句子组 ==========
  // 每个组是一个语义内聚单元——同一话题的若干句话
  const groups: string[] = []
  let groupStart = 0
  for (let i = 0; i < breakpoints.length; i++) {
    if (breakpoints[i]) {
      // i 是断点 → sentences[groupStart..i] 是一个完整话题
      groups.push(sentences.slice(groupStart, i + 1).join(''))
      groupStart = i + 1
    }
  }
  // 收尾：最后一个断点之后的所有句子
  groups.push(sentences.slice(groupStart).join(''))

  // ========== 步骤 6：贪心合并到 chunkSize ==========
  // 语义组可能很小（3 句话 80 字），直接当作 chunk 太碎。
  // 贪心合并相邻组：能塞进 chunkSize 就一直塞，塞不下就吐出一个 chunk。
  //
  // 同时处理超大组（一个话题本身 > 500 字，如超长段落）→ 回退滑动窗口
  const chunks: string[] = []
  let buffer = '' // 正在积累的当前 chunk

  for (const group of groups) {
    if (group.length > chunkSize) {
      // 这个语义组本身就超过 chunkSize：
      //   先把 buffer 里攒的内容吐出一个 chunk
      //   然后对这个胖组用滑动窗口切碎
      if (buffer.trim()) {
        chunks.push(buffer.trim())
        buffer = ''
      }
      const subChunks = chunkText(group, { chunkSize, overlap })
      for (const sub of subChunks) {
        chunks.push(sub)
      }
      continue
    }

    // buffer + 当前组 会溢出 chunkSize → 吐出 buffer 作为一块
    // 当前组成为新 buffer 的起点
    if (buffer.length + group.length > chunkSize && buffer.trim()) {
      chunks.push(buffer.trim())
      buffer = group
    } else {
      // 还能塞下，加到 buffer 里继续攒
      buffer += group
    }
  }

  // 收尾：最后一个不完整的 buffer 也可以作为一块
  // （它一定 ≤ chunkSize，因为在循环里溢出时会先吐出再重置）
  if (buffer.trim()) {
    chunks.push(buffer.trim())
  }

  return chunks
}

/**
 * 将过短句子合并到相邻句子
 *
 * 目标：消除 PDF 解析产生的碎片，避免碎片被误判为语义断点。
 *
 * PDF 解析后常出现：
 *   "JavaScript"          ← 纯标题，单独一行
 *   "闭包是 JS 中一个重要的概念。闭包是指..."   ← 正文
 *
 * 如果 "JavaScript" 独立 embedding，它和正文的相似度可能偏低
 * （标题 vs 正文语境不同），导致不该切的地方被切开。
 * 把标题合并进正文再做 embedding，判断更准确。
 *
 * 合并策略：
 *   - 当前句 < minLength → 暂存到 pending，等下一句出现时拼在前面
 *   - 末尾还有 pending → 拼到最后一句后面
 *   - 全文都是短句 → 全拼成一句
 */
function mergeShortSentences(sentences: string[], minLength: number): string[] {
  if (sentences.length <= 1) return sentences

  const result: string[] = []
  let pending = '' // 暂存的短句，等待合并到下一句

  for (let i = 0; i < sentences.length; i++) {
    const s = sentences[i]

    if (s.length < minLength) {
      // 太短 → 不独立成句，暂时挂起
      pending += s
      continue
    }

    // 当前句够长，把之前攒的短句贴到它前面
    if (pending) {
      result.push(pending + s)
      pending = ''
    } else {
      result.push(s)
    }
  }

  // 遍历完了还有挂起的短句
  if (pending && result.length > 0) {
    // 拼到最后一句的后面
    result[result.length - 1] += pending
  } else if (pending) {
    // 整篇全是短句（理论上很少见）→ 合成一句
    result.push(pending)
  }

  return result
}
