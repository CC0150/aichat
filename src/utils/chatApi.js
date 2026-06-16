const CHAT_API_URL = '/api/chat'

/**
 * 流式请求后端 Chat 补全
 * @param {{
 *   model: string
 *   messages: Array<{ role: 'user' | 'assistant'; content: string }>
 *   onChunk: (content: string) => void
 *   onError?: (message: string) => void
 *   signal?: AbortSignal
 * }} options
 * @returns {Promise<void>}
 */
export async function requestChatStream({ model, messages, onChunk, onError, signal }) {
  const body = JSON.stringify({
    model,
    messages,
    stream: true,
  })

  let response
  try {
    response = await fetch(CHAT_API_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Accept: 'text/event-stream; charset=utf-8',
      },
      body,
      signal,
    })
  } catch (err) {
    if (err.name === 'AbortError') throw err
    const msg = `网络请求失败：${err.message || '无法连接到服务器'}`
    onError?.(msg)
    throw new Error(msg)
  }

  if (!response.ok) {
    let msg = `API 请求失败：${response.status} ${response.statusText}`
    try {
      const text = await response.text()
      const data = text ? JSON.parse(text) : null
      const detail = data?.error?.message ?? data?.message ?? data?.error
      if (detail) msg += `（${typeof detail === 'string' ? detail : JSON.stringify(detail)}）`
    } catch (_) {}
    onError?.(msg)
    throw new Error(msg)
  }

  const reader = response.body.getReader()
  const decoder = new TextDecoder()
  let buffer = ''

  while (true) {
    let done, value
    try {
      const result = await reader.read()
      done = result.done
      value = result.value
    } catch (err) {
      if (err.name === 'AbortError') return
      throw err
    }
    if (done) break

    const chunkText = decoder.decode(value, { stream: true })

    buffer += chunkText

    while (true) {
      const nl = buffer.indexOf('\n')
      if (nl === -1) break
      const rawLine = buffer.slice(0, nl)
      buffer = buffer.slice(nl + 1)

      const line = rawLine.trim()
      if (!line.startsWith('data:')) continue
      const data = line.slice(5).trimStart()

      if (data === '[DONE]') {
        try {
          await reader.cancel()
        } catch (_) {}
        return
      }

      try {
        const parsed = JSON.parse(data)
        if (parsed?.error) {
          onError?.(String(parsed.error))
          return
        }
        const content = parsed.content ?? parsed.choices?.[0]?.delta?.content ?? null
        if (content != null && content !== '') {
          onChunk(String(content))
        }
      } catch (e) {
        console.debug('解析响应数据失败，忽略此行:', e)
      }
    }
  }
}
