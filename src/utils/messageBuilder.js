import { estimateMessagesTokens } from './tokenCounter'

/**
 * 基于 token 预算裁剪消息历史，始终保留 system message 和最后一条消息
 * @param {Array<{ role: string, content: any }>} messages
 * @param {number} maxTokens - 上下文窗口总 token 数
 * @returns {Array<{ role: string, content: any }>}
 */
export function trimByTokenBudget(messages, maxTokens) {
  if (!messages.length) return messages
  const RESPONSE_RESERVE = 8000
  const budget = maxTokens - RESPONSE_RESERVE

  const systemMsg = messages[0]?.role === 'system' ? messages[0] : null
  const lastMsg = messages[messages.length - 1]
  const middle = systemMsg ? messages.slice(1, -1) : messages.slice(0, -1)

  let used = estimateMessagesTokens([systemMsg, lastMsg].filter(Boolean))
  const kept = []
  for (let i = middle.length - 1; i >= 0; i--) {
    const t = estimateMessagesTokens([middle[i]])
    if (used + t > budget) break
    used += t
    kept.unshift(middle[i])
  }

  return [systemMsg, ...kept, lastMsg].filter(Boolean)
}

/**
 * 构造带有附件上下文与多模态图片的 messages 列表
 * 同时返回是否存在图片（用于自动切换视觉模型）
 *
 * @param {Object} options
 * @param {{ role: string, content: any }[]} options.history - chatStore.currentMessages（完整历史）
 * @param {string} options.text - 当前这一轮用户输入的纯文本
 * @param {{ id: string, name: string, text: string, type: 'pdf' | 'word' | 'text' }[]} options.attachments
 * @param {{ id: string, name: string, url: string, file: File }[]} options.images
 * @param {number} options.maxContextChars - 附件文本截断上限
 * @param {number} options.maxTokens - 模型上下文窗口 token 数（默认 128000）
 * @param {boolean} options.supportsVision - 当前模型是否支持图像理解（如 DeepSeek 文本模型为 false）
 * @returns {Promise<{ messages: Array<{ role: string, content: any }>, historyHasImages: boolean }>}
 */
export async function buildMessagesWithContext({
  history,
  text,
  attachments = [],
  images = [],
  maxContextChars = 8000,
  maxTokens = 128000,
  supportsVision = true,
}) {
  const hasImages = images.length > 0

  // 1）基础消息：全部历史消息（后续由 token 预算裁剪）；当前轮仅图片/仅附件时最后一条用户消息可能为空，需保留
  const recent = history
  const hasCurrentAttachments = attachments.length > 0
  const hasCurrentImages = images.length > 0
  let messages = recent
    .filter((m, i) => {
      if (!m) return false
      const c = m.content
      if (typeof c === 'string') {
        if (c.trim()) return true
        // 当前轮只有图片或只有附件时，最后一条用户消息可能为空，也要保留
        const isLastUser = i === recent.length - 1 && m.role === 'user'
        return isLastUser && (hasCurrentAttachments || hasCurrentImages)
      }
      if (Array.isArray(c)) return c.length > 0
      if (c && typeof c === 'object')
        return !!(c.text != null || c.attachments?.length || c.images?.length)
      return !!c
    })
    .map((m) => {
      let content = m.content
      if (content && typeof content === 'object' && !Array.isArray(content)) {
        content = content.text != null ? String(content.text) : ''
      }
      return { role: m.role, content }
    })

  // 2）附件：作为 system 文档背景
  if (attachments.length) {
    const perFileLimit = 6000
    const parts = attachments.map((a) => {
      const safeName = a.name || '未命名文件'
      const raw = a.text || ''
      let text = raw
      let truncated = false
      if (text.length > perFileLimit) {
        text = text.slice(0, perFileLimit)
        truncated = true
      }
      let block = `【${safeName}】\n${text}`
      if (truncated) {
        block += `\n\n（注意：该文档内容过长，此处仅保留前 ${perFileLimit} 个字符用于参考）`
      }
      return block
    })

    let body = parts.join('\n\n--- 分隔线：下一个附件 ---\n\n')
    if (body.length > maxContextChars) {
      body =
        body.slice(0, maxContextChars) +
        `\n\n（提示：由于参考文档内容过长，以上内容已被整体截断，仅保留前 ${maxContextChars} 个字符。）`
    }

    const systemContent =
      '以下是用户提供的参考文档，请结合这些文档内容以及用户的后续问题进行深度分析。' +
      '如果文档中没有相关信息，请明确告知用户，而不要编造内容。文档内容如下：\n\n' +
      body
    messages = [{ role: 'system', content: systemContent }, ...messages]
  }

  // 3）历史中是否已有图片（多轮记忆）
  let historyHasImages = messages.some(
    (m) => Array.isArray(m.content) && m.content.some((part) => part?.type === 'image_url'),
  )

  // 4）当前轮图片：若模型支持视觉则转为 Base64，否则以文本说明替代
  if (hasImages) {
    if (supportsVision) {
      const imageDataUrls = await Promise.all(images.map((img) => fileToDataUrl(img.file)))

      if (imageDataUrls.length) {
        const imageParts = imageDataUrls.map((url) => ({
          type: 'image_url',
          image_url: { url },
        }))

        for (let i = messages.length - 1; i >= 0; i--) {
          if (messages[i].role === 'user') {
            messages[i] = {
              ...messages[i],
              content: [{ type: 'text', text }, ...imageParts],
            }
            break
          }
        }

        historyHasImages = true
      }
    } else {
      // DeepSeek 等文本/推理模型不支持图像，将图片信息转为文字说明
      const imageNote = `（用户上传了 ${images.length} 张图片，当前模型暂不支持图像理解，请基于文字内容回答）`
      const augmentedText = text ? `${text}\n\n${imageNote}` : imageNote
      for (let i = messages.length - 1; i >= 0; i--) {
        if (messages[i].role === 'user') {
          messages[i] = { ...messages[i], content: augmentedText }
          break
        }
      }
    }
  }

  // 5）token 预算裁剪
  messages = trimByTokenBudget(messages, maxTokens)

  return { messages, historyHasImages }
}
