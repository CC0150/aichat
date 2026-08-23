import type { SSEStreamOptions } from '@/types'

/**
 * SSE 流式请求通用函数
 * 从 chatApi.js 提取，供 RAG 和 Agent 复用
 */
export async function requestSSEStream(
  url: string,
  body: Record<string, unknown>,
  { onChunk, onError, signal }: SSEStreamOptions = { onChunk: () => {} },
): Promise<void> {
  let response: Response
  try {
    response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Accept: 'text/event-stream; charset=utf-8',
      },
      body: JSON.stringify(body),
      signal,
    })
  } catch (err: any) {
    if (err.name === 'AbortError') throw err
    const msg = `网络请求失败：${err.message || '无法连接到服务器'}`
    onError?.(msg)
    throw new Error(msg)
  }

  if (!response.ok) {
    let msg = `API 请求失败：${response.status}`
    try {
      const text = await response.text()
      const data = text ? JSON.parse(text) : null
      const detail = data?.error || data?.message
      if (detail) msg += `（${typeof detail === 'string' ? detail : JSON.stringify(detail)}）`
    } catch {
      /* ignore parse errors */
    }
    onError?.(msg)
    throw new Error(msg)
  }

  if (!response.body) {
    onError?.('响应体为空')
    return
  }

  const reader = response.body.getReader()
  const decoder = new TextDecoder()
  let buffer = ''

  while (true) {
    let done: boolean
    let value: Uint8Array | undefined
    try {
      const result = await reader.read()
      done = result.done
      value = result.value
    } catch (err: any) {
      if (err.name === 'AbortError') return
      throw err
    }
    if (done) break

    buffer += decoder.decode(value, { stream: true })

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
        } catch {
          /* ignore */
        }
        return
      }

      try {
        const parsed = JSON.parse(data)
        if (parsed?.error) {
          onError?.(String(parsed.error))
          return
        }
        const content = parsed.content ?? null
        if (content != null && content !== '') {
          onChunk(String(content))
        }
      } catch {
        // 忽略无法解析的行
      }
    }
  }
}
