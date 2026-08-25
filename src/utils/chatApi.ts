import { requestSSEStream } from './sseClient'
import { useAppStore } from '@/stores/app'

/**
 * SSE 流式聊天
 * model/baseUrl/apiKey 由 app store 统一注入（支持用户自带 Key）
 */
export function requestChatStream(
  messages: Array<{ role: string; content: unknown }>,
  {
    onChunk,
    onError,
    signal,
  }: {
    onChunk: (chunk: string) => void
    onError?: (msg: string) => void
    signal?: AbortSignal
  },
): Promise<void> {
  const app = useAppStore()
  return requestSSEStream('/api/chat', app.aiRequestParams({ messages }), {
    onChunk,
    onError,
    signal,
  })
}

export { isAbortError } from './index'
