/**
 * 将 File 转换为 base64 Data URL
 * @param {File} file
 * @returns {Promise<string>}
 */
export function fileToDataUrl(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(reader.result)
    reader.onerror = (err) => reject(err)
    reader.readAsDataURL(file)
  })
}

/**
 * 构造带有附件上下文与多模态图片的 messages 列表
 * 同时返回是否存在图片（用于自动切换视觉模型）
 *
 * @param {Object} options
 * @param {{ role: string, content: any }[]} options.history - chatStore.currentMessages（完整历史）
 * @param {string} options.text - 当前这一轮用户输入的纯文本
 * @param {{ id: string, name: string, text: string, type: 'pdf' | 'word' }[]} options.attachments
 * @param {{ id: string, name: string, url: string, file: File }[]} options.images
 * @param {number} options.maxContextChars - 附件文本截断上限
 * @returns {Promise<{ messages: Array<{ role: string, content: any }>, historyHasImages: boolean }>}
 */
export async function buildMessagesWithContext({
  history,
  text,
  attachments = [],
  images = [],
  maxContextChars = 8000,
}) {
  const hasImages = images.length > 0

  // 1）基础消息：最近 10 条，保留原始 content 结构
  const recent = history.slice(-10)
  let messages = recent
    .filter((m) => {
      if (!m) return false
      const c = m.content
      if (typeof c === 'string') return !!c.trim()
      if (Array.isArray(c)) return c.length > 0
      return !!c
    })
    .map((m) => ({ role: m.role, content: m.content }))

  // 2）附件：作为 system 文档背景
  if (attachments.length) {
    const combined = attachments
      .map((a) => `【${a.type === 'pdf' ? 'PDF' : 'Word'}：${a.name}】\n${a.text}`)
      .join('\n\n--- 分隔线：下一个附件 ---\n\n')
    const clipped = combined.slice(0, maxContextChars)
    const systemContent =
      '以下是用户上传的 PDF / Word 文档内容，请在回答问题时充分参考该内容：\n\n' +
      clipped
    messages = [
      { role: 'system', content: systemContent },
      ...messages,
    ]
  }

  // 3）历史中是否已有图片（多轮记忆）
  let historyHasImages = messages.some(
    (m) =>
      Array.isArray(m.content) &&
      m.content.some((part) => part?.type === 'image_url')
  )

  // 4）当前轮图片：转为 Base64 Data URL，并挂到当前 user 消息上
  if (hasImages) {
    const imageDataUrls = await Promise.all(
      images.map((img) => fileToDataUrl(img.file))
    )

    if (imageDataUrls.length) {
      const imageParts = imageDataUrls.map((url) => ({
        type: 'image_url',
        image_url: { url },
      }))

      for (let i = messages.length - 1; i >= 0; i--) {
        if (messages[i].role === 'user') {
          messages[i] = {
            ...messages[i],
            content: [
              { type: 'text', text },
              ...imageParts,
            ],
          }
          break
        }
      }

      historyHasImages = true
    }
  }

  return { messages, historyHasImages }
}

