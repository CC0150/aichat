/**
 * 中英文混合文本的 token 数量近似估算
 * 中文约 0.6 token/字符，英文及其他约 0.25 token/字符
 * 不使用外部依赖（tiktoken 体积大且无 DeepSeek 专用 tokenizer）
 */

export function estimateTokens(text) {
  if (!text) return 0
  let cjk = 0
  let other = 0
  for (const ch of String(text)) {
    if (/[\u4e00-\u9fff\u3400-\u4dbf\uf900-\ufaff]/.test(ch)) {
      cjk++
    } else {
      other++
    }
  }
  return Math.ceil(cjk * 0.6 + other * 0.25)
}

export function estimateMessagesTokens(messages) {
  if (!messages || !messages.length) return 0
  return messages.reduce((sum, m) => {
    const content = typeof m.content === 'string' ? m.content : JSON.stringify(m.content)
    return sum + estimateTokens(content)
  }, 0)
}
